/* ══ SMS: THE APPROVED TEXTS, AND WHAT "DELIVERED" MEANS (2026-10-09) ═══════════════════════════════
   Pure; relative imports only (the edge functions import this by path).

   ⛔ LINKS ARE NEVER TYPED INTO A TEXT BY THE BROWSER. A link-bearing template is filled by the SERVER with the URL
   it generated through the authoritative flow (quick-close → findable-checkout → findable.live/agree/<token>, or the
   setup form URL). `buildSms` only substitutes; it cannot invent one. There is no raw Stripe link here: the agreement
   comes first, the payment after it, exactly as on every other channel.
   ⛔ Every template carries who we are and how to stop (PECR / carrier rules). Free text typed by a rep in the Inbox
   composer is allowed only once the conversation gate is open (contactRouting.smsGateOpen) and carries no link
   (the composer cannot send a link kind — the server refuses one).
   ⛔ "DELIVERED" IS A CARRIER RECEIPT, NOT AN API ACCEPTANCE. Twilio answering "queued" means Twilio took the request.
   Only a status callback of `delivered` earns that word; `sent` is "handed to the network"; `undelivered`/`failed`
   is a failure with the carrier's code. A simulated (test) send is labelled as such and is never counted. */

export type SmsTemplateKey = 'setup_link' | 'agreement_link' | 'website_link' | 'follow_up';
export type SmsLinkKind = 'setup' | 'agreement' | 'website';

export const FINDABLE_WEBSITE_URL = 'https://findable.live';
export const SMS_STOP_LINE = 'Reply STOP to opt out.';

export interface SmsTemplate {
  key: SmsTemplateKey;
  label: string;
  /** The link kind this text carries, if any. setup/agreement links come ONLY from the quick-close server flow. */
  linkKind: SmsLinkKind | null;
  /** {rep} {link} {name} are the only placeholders. */
  text: string;
}

export const SMS_TEMPLATES: Readonly<Record<SmsTemplateKey, SmsTemplate>> = {
  setup_link: {
    key: 'setup_link', label: 'Full Setup link', linkKind: 'setup',
    text: `Hi, it's {rep} at Findable. Here is your setup form — it takes a couple of minutes: {link} ${SMS_STOP_LINE}`,
  },
  agreement_link: {
    key: 'agreement_link', label: 'Agreement & payment link', linkKind: 'agreement',
    text: `Hi, it's {rep} at Findable. Here is your agreement to read and sign — payment comes after you sign: {link} ${SMS_STOP_LINE}`,
  },
  website_link: {
    key: 'website_link', label: 'Findable website', linkKind: 'website',
    text: `Hi, it's {rep} at Findable. You can see what we do here: {link} ${SMS_STOP_LINE}`,
  },
  follow_up: {
    key: 'follow_up', label: 'Follow-up', linkKind: null,
    text: `Hi, it's {rep} at Findable — just checking you got my message. Any questions, reply here. ${SMS_STOP_LINE}`,
  },
};

/** Fill a template. A link template with no link is a refusal (null), never a text with a hole in it. */
export function buildSms(key: SmsTemplateKey, vars: { rep: string; link?: string | null }): string | null {
  const t = SMS_TEMPLATES[key];
  if (!t) return null;
  const rep = String(vars.rep ?? '').trim() || 'the Findable team';
  if (t.linkKind) {
    const link = String(vars.link ?? '').trim();
    if (!/^https:\/\/[^\s]+$/.test(link)) return null;
    return t.text.replace('{rep}', rep).replace('{link}', link);
  }
  return t.text.replace('{rep}', rep).replace('{name}', '');
}

/** Is this URL one we are willing to put in a text for this link kind? (host allowlist: our own domain only) */
export function isApprovedSmsLink(kind: SmsLinkKind, url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname !== 'findable.live') return false;
    if (kind === 'agreement') return /^\/agree\/[A-Za-z0-9_-]{16,}$/.test(u.pathname);
    if (kind === 'setup') return u.pathname.replace(/\/$/, '') === '/onboarding' && /^[0-9a-f-]{36}$/i.test(u.searchParams.get('lead') ?? '');
    return u.pathname === '/' || u.pathname === '';
  } catch { return false; }
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
