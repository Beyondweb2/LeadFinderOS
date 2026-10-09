/* ══ SMS REUSES THE WHATSAPP TEMPLATES — IT HAS NO COPY OF ITS OWN (2026-10-09, Paul) ══════════════════════
   Pure; relative imports with .ts only (the edge functions import this by path).

   ⛔ THE WORDS ARE WHATSAPP'S. An SMS is the registered WhatsApp template's body, rendered by the SAME function the WhatsApp
   sender uses (renderTemplateBody; its Inbox mirror readableTemplateBody is parity-tested against it), with the same
   greeting-name rules. Nothing here paraphrases, shortens or adds a variant. Which templates an SMS may carry is below;
   what each one says is decided at Meta and in src/lib/templateBodies.ts, never here.
   The ONLY addition is the opt-out line on a COLD first text (SMS_OPT_OUT_LINE): UK marketing rules require it, and Twilio
   enforces the STOP reply at the carrier. It is appended AFTER the WhatsApp wording, on its own line, and nothing else is
   changed. A text sent inside a conversation (they replied, or you have spoken) carries no extra line.

   WHICH WHATSAPP TEMPLATES, AND WHY ONLY THESE:
     cold openers       initial_contact · initial_opener_v2   — the two approved cold openers, chosen per send or per batch
                        exactly as on WhatsApp (src/lib/openerVariant.ts: no split, no hidden selection).
     in a conversation  book_call · re_engage_49 · contact_followup — plain continuations that need only the lead's own name.
     the sign-up link   findable_signup_link                  — the agreement-or-setup link text. Sent ONLY by Quick Close; the
                        link is resolved from the lead's records by the same resolver WhatsApp uses (link-template-vars.ts).
   NOT offered by SMS: the audit-driven templates (video_template, competitor_hook, audit_* , ai_site_findings_v2) and the
   explain_offer pair. They need the lead's finished audit, its rivals and report link, resolved by the WhatsApp sender, and
   they run to 2-8 text segments; they stay WhatsApp-only until that resolution is deliberately reused.

   ⛔ LINKS ARE NEVER TYPED INTO A TEXT BY THE BROWSER, and the only link an SMS carries is the one findable_signup_link carries
   (isSignupTemplateLinkUrl: findable.live/agree/<64 hex> or findable.live/onboarding/?lead=<id>) — never a Stripe URL.
   ⛔ "DELIVERED" IS A CARRIER RECEIPT, NOT AN API ACCEPTANCE. Twilio answering "queued" means Twilio took the request.
   Only a status callback of `delivered` earns that word; `sent` is "handed to the network"; `undelivered`/`failed` is a
   failure with the carrier's code. A simulated (test) send is labelled as such and is never counted. */
import { isSignupTemplateLinkUrl } from './whatsappLinkTemplates.ts';

/** The two approved cold openers — the only templates an SMS may send to someone we have not spoken to. */
export const SMS_COLD_TEMPLATES = ['initial_contact', 'initial_opener_v2'] as const;
/** Plain continuations: need only the lead's own name, and only go once the conversation gate is open. */
export const SMS_CONVERSATION_TEMPLATES = ['book_call', 're_engage_49', 'contact_followup'] as const;
/** The sign-up link template, sent only by Quick Close. */
export const SMS_LINK_TEMPLATE = 'findable_signup_link' as const;

export type SmsColdTemplate = typeof SMS_COLD_TEMPLATES[number];
export type SmsConversationTemplate = typeof SMS_CONVERSATION_TEMPLATES[number];
export type SmsTemplateName = SmsColdTemplate | SmsConversationTemplate | typeof SMS_LINK_TEMPLATE;
export type SmsLinkVariant = 'agreement' | 'setup';

/** Every WhatsApp template an SMS may carry. */
export const SMS_TEMPLATE_NAMES: readonly SmsTemplateName[] = [...SMS_COLD_TEMPLATES, ...SMS_CONVERSATION_TEMPLATES, SMS_LINK_TEMPLATE];

export const isSmsTemplate = (n: unknown): n is SmsTemplateName => typeof n === 'string' && (SMS_TEMPLATE_NAMES as readonly string[]).includes(n);
export const isColdSmsTemplate = (n: unknown): n is SmsColdTemplate => typeof n === 'string' && (SMS_COLD_TEMPLATES as readonly string[]).includes(n);
export const isConversationSmsTemplate = (n: unknown): n is SmsConversationTemplate => typeof n === 'string' && (SMS_CONVERSATION_TEMPLATES as readonly string[]).includes(n);

/** Templates whose greeting is a salutation: an empty business name refuses rather than reading "Hi your business" (WhatsApp's own rule). */
export const SMS_TEMPLATES_NEEDING_REAL_NAME: ReadonlySet<string> = new Set(['book_call', 're_engage_49']);

/** The one line added to a COLD text. Appended on its own line after the unchanged WhatsApp wording. */
export const SMS_OPT_OUT_LINE = 'Reply STOP to opt out.';

/** WhatsApp's wording + (cold only) the opt-out line. `whatsappBody` is the rendered WhatsApp body, untouched. */
export function smsTextFromWhatsAppBody(template: string, whatsappBody: string): string {
  const body = String(whatsappBody ?? '').trim();
  return isColdSmsTemplate(template) ? `${body}\n\n${SMS_OPT_OUT_LINE}` : body;
}

/** Is this URL one an SMS may carry? Exactly the shapes findable_signup_link carries (and never anything else). */
export function isApprovedSmsLink(url: string): boolean {
  return isSignupTemplateLinkUrl(url);
}

/* ── status ────────────────────────────────────────────────────────────────────────────────────────── */
export type SmsDeliveryState = 'not_sent' | 'queued' | 'sent' | 'delivered' | 'failed' | 'replied' | 'simulated';

export interface SmsRowLite { direction: 'inbound' | 'outbound'; status: string; created_at: string }

/** Twilio's MessageStatus -> ours. Unknown stays 'queued' (we know only that we asked), never 'delivered'. */
export function mapTwilioStatus(s: string | null | undefined): 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' {
  switch (String(s ?? '').toLowerCase()) {
    case 'delivered': return 'delivered';
    case 'sent': return 'sent';
    case 'undelivered': return 'undelivered';
    case 'failed': return 'failed';
    default: return 'queued'; // accepted, queued, sending, scheduled, unknown
  }
}

const RANK: Record<string, number> = { queued: 1, sent: 2, delivered: 3, undelivered: 3, failed: 3 };
/** A status callback may arrive out of order: never move a message backwards (delivered must not become sent). */
export function advanceSmsStatus(current: string, incoming: string): string {
  if (current === 'simulated' || current === 'received') return current;
  return (RANK[incoming] ?? 0) >= (RANK[current] ?? 0) ? incoming : current;
}

/** The state of the latest outbound text, given the thread (any order). */
export function smsDeliveryState(rows: ReadonlyArray<SmsRowLite>): SmsDeliveryState {
  const out = rows.filter((r) => r.direction === 'outbound').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!out) return 'not_sent';
  const replied = rows.some((r) => r.direction === 'inbound' && r.created_at > out.created_at);
  if (out.status === 'simulated') return 'simulated';
  if (out.status === 'failed' || out.status === 'undelivered') return 'failed';
  if (replied) return 'replied';
  if (out.status === 'delivered') return 'delivered';
  if (out.status === 'sent') return 'sent';
  return 'queued';
}

export const SMS_STATE_LABEL: Record<SmsDeliveryState, string> = {
  not_sent: 'Not sent', queued: 'Queued', sent: 'Sent', delivered: 'Delivered', failed: 'Failed', replied: 'Replied', simulated: 'Test only — not sent',
};

/** STOP words that opt a number out (Twilio also enforces these at the carrier for long codes). */
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out', 'opt out']);
export function isStopMessage(body: string | null | undefined): boolean {
  return STOP_WORDS.has(String(body ?? '').trim().toLowerCase().replace(/[.!]+$/, ''));
}

/* ── THE SMS QUEUE'S SCHEDULE (2026-10-09) — pure, shared by the drip and the panel ───────────────────────────
   Named constants only (never write these numbers in prose). Texts go out in a NARROWER window than WhatsApp: a text
   buzzes a phone, so quiet hours are longer. One text per tick at most; the gap is jittered so they never burst. */
export const SMS_QUEUE_WINDOW = { startHour: 9, endHour: 20 } as const; // Europe/London, [start, end)
export const SMS_QUEUE_DAILY_CAP = 100;
export const SMS_QUEUE_GAP_SECONDS = { min: 45, max: 100 } as const;
export const SMS_QUEUE_MAX_ATTEMPTS = 3;

/** Is it inside the sending window in London at this instant? */
export function smsWindowOpen(now: Date = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }).format(now)) % 24;
  return h >= SMS_QUEUE_WINDOW.startHour && h < SMS_QUEUE_WINDOW.endHour;
}

/** 00:00 today in London, as a UTC instant (the daily cap counts from here). One hour out on the two clock-change days. */
export function londonDayStartUtc(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const elapsed = (((g('hour') % 24) * 60 + g('minute')) * 60 + g('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}

/** Why a lead was not queued, in words (the queue RPC's own reason keys). */
export const SMS_QUEUE_SKIP_WORDS: Readonly<Record<string, string>> = {
  not_found: 'no longer exists', not_yours: 'not assigned to you', archived: 'archived', client: 'already a client',
  already_queued: 'already in the text queue', not_new: 'already past the start (not a first text)', no_phone: 'no phone number',
  not_a_uk_mobile: 'not a UK mobile (texts go to UK mobiles only)', opted_out: 'asked not to be contacted',
  already_texted: 'already texted before', in_whatsapp_conversation: 'already in a WhatsApp conversation',
  contacted_by_phone: 'already spoken to by phone', contacted_logged: 'already in a logged conversation',
};
