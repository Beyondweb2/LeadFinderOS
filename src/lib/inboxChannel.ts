import { WA_TEMPLATE_REQS } from './whatsappTemplates.ts';
import { SMS_LINK_TEMPLATE } from './smsMessages.ts';

/* THE CHANNEL ADAPTER OF THE ONE INBOX (2026-10-09, Paul: the SMS inbox must be the SAME inbox as WhatsApp, not a lookalike).

   There is ONE conversation component (src/pages/Inbox.tsx, ConversationInbox) and it renders both channels. This file holds the only
   things that are genuinely different about a text, so a reader — and scripts/inbox-channel-parity.test.ts — can see them in one place:
     · the 24-hour service window does not exist on SMS (free text is always allowed, no "Window closed" chip)
     · SMS sends through the SMS queue and Twilio; WhatsApp through Meta
     · cost wording (about 5p a text) and the Queued / SMS Failed / No SMS statuses (smsStatus.ts)
     · a handful of WhatsApp-only features (voice notes, attachments, opening the WhatsApp app, the hook-follow-up queue, templates that
       carry a video) which have no text equivalent
   ⛔ ANYTHING ELSE ADDED TO THE INBOX APPEARS IN BOTH CHANNELS AUTOMATICALLY — there is no second page to forget it in.
   ⛔ Adding a new `sms`-conditional to Inbox.tsx without adding it to SMS_ONLY_DIFFERENCES below fails the parity test. */

export type InboxChannel = 'whatsapp' | 'sms';

/** The complete list of places the shared Inbox is allowed to behave differently for texts, and why each one is unavoidable. */
export const SMS_ONLY_DIFFERENCES: ReadonlyArray<{ id: string; why: string }> = [
  { id: 'window', why: 'A text has no 24-hour service window: free text is always allowed and there is no "Window closed" chip.' },
  { id: 'send-path', why: 'Texts go through the SMS queue and Twilio; WhatsApp goes through Meta. Send now, the queue banner and the queued count read the SMS queue.' },
  { id: 'reads', why: 'The unread mark comes from the per-person SMS read marks (my_sms_unread_counts), not the WhatsApp ones.' },
  { id: 'cost', why: 'Cost wording: a text is about 5p a segment.' },
  { id: 'statuses', why: 'The Queued / SMS Failed / No SMS pills (smsStatus.ts) replace WhatsApp-only states on early leads.' },
  { id: 'no-voice-attach', why: 'Voice notes and file attachments are WhatsApp-only: SMS carries plain text.' },
  { id: 'no-whatsapp-app', why: '"Open in the WhatsApp app" is a WhatsApp link.' },
  { id: 'no-hook-queue', why: 'The "Hook follow-up due" view bulk-queues into the WhatsApp drip; there is no text equivalent of that queue.' },
  { id: 'audit-reply-send', why: '"Audit and reply" sends an automatic WhatsApp message; a text reply only ever runs the audit (disabled with a note on the SMS tab).' },
  { id: 'template-availability', why: 'A template that carries a video, a retired barber link or the Quick Close sign-up link is greyed out for texts with the reason.' },
  { id: 'bulk-queue', why: 'Select several: cold openers are queued (paced) for texts, never sent in a burst.' },
  { id: 'storage-keys', why: 'Filters, search and drafts are remembered per channel so a text draft never lands in a WhatsApp thread.' },
];

/** The Twilio / sms_messages row as the Inbox's own message shape (WaMessage). Same fields, same names — the rest of the Inbox cannot tell. */
export interface SmsMessageRow {
  id: string; created_at: string; direction: string; user_id: string | null; lead_id: string | null; phone: string; body: string | null;
  status: string; template_key?: string | null; test_mode?: boolean | null; error?: string | null; error_code?: string | null;
}
export function smsRowToInboxMessage(r: SmsMessageRow) {
  const failed = r.status === 'failed' || r.status === 'undelivered';
  return {
    id: r.id,
    created_at: r.created_at,
    direction: (r.direction === 'inbound' ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
    user_id: r.user_id,
    lead_id: r.lead_id,
    phone: r.phone,
    body: r.body,
    message_type: (r.template_key ? 'template' : 'text') as 'text' | 'template',
    media_path: null, media_mime_type: null, media_filename: null,
    template_name: r.template_key ?? null,
    status: failed ? 'failed' : r.status,
    test_mode: r.test_mode === true,
    error: failed ? (r.error ?? (r.error_code ? `Twilio error ${r.error_code}` : null)) : (r.error ?? null),
    template_snapshot: null,
  };
}

/* ── which WhatsApp templates a text can carry ──────────────────────────────────────────────────────────────────────────────── */
/** Templates registered at Meta with a VIDEO header: the picture is the template; a text cannot carry it. */
const VIDEO_TEMPLATES: ReadonlySet<string> = new Set(['video_template', 'competitor_hook']);

export type SmsTemplateAvailability = { ok: true } | { ok: false; reason: string };

/** Greyed-out-with-a-reason for a template a text genuinely cannot send. Everything else is available, with the WhatsApp wording and the
 *  WhatsApp placeholder filling (the server builds the text with the same code as the WhatsApp sender). */
export function smsTemplateAvailability(name: string): SmsTemplateAvailability {
  if (name === SMS_LINK_TEMPLATE) return { ok: false, reason: 'Sent from Quick Close, which makes the right link for this customer.' };
  if (VIDEO_TEMPLATES.has(name)) return { ok: false, reason: 'Has a video — WhatsApp only.' };
  if (WA_TEMPLATE_REQS[name]?.group === 'site') return { ok: false, reason: 'Retired barber template — not sent.' };
  return { ok: true };
}
