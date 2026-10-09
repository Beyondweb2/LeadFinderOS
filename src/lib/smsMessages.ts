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

export type SmsTemplateKey = 'setup_link' | 'agreement_link' | 'website_link' | 'follow_up' | 'sms_opener';
export type SmsLinkKind = 'setup' | 'agreement' | 'website';

export const FINDABLE_WEBSITE_URL = 'https://findable.live';
export const SMS_STOP_LINE = 'Reply STOP to opt out.';

export interface SmsTemplate {
  key: SmsTemplateKey;
  label: string;
  /** The link kind this text carries, if any. setup/agreement links come ONLY from the quick-close server flow. */
  linkKind: SmsLinkKind | null;
  /** {rep} {link} {business} are the only placeholders. */
  text: string;
  /** A FIRST text to someone we have not spoken to. Only ever one, only to a clean UK mobile (the cold rules, below). */
  cold?: boolean;
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
  /* ⛔ THE ONE COLD TEXT (2026-10-09, Paul: queue SMS like the WhatsApp queue). Plain, says who we are, makes no claim about
     their business that we have not checked, carries no link, and offers the way out. The wording is Paul's to change here. */
  sms_opener: {
    key: 'sms_opener', label: 'Intro text', linkKind: null, cold: true,
    text: `Hi, it's {rep} at Findable. We help local firms get found when people ask ChatGPT or Google AI. Free check for {business}? Reply YES, or ${SMS_STOP_LINE.toLowerCase().replace('reply stop', 'STOP')}`,
  },
  follow_up: {
    key: 'follow_up', label: 'Follow-up', linkKind: null,
    text: `Hi, it's {rep} at Findable — just checking you got my message. Any questions, reply here. ${SMS_STOP_LINE}`,
  },
};

/** Fill a template. A link template with no link is a refusal (null), never a text with a hole in it. */
/** A business name made safe for a text: one line, printable, short. Empty becomes a neutral phrase, never a hole. */
export function smsBusinessName(raw: string | null | undefined): string {
  const c = String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const short = c.length > 40 ? `${c.slice(0, 39).trimEnd()}…` : c;
  return short || 'your business';
}

export function buildSms(key: SmsTemplateKey, vars: { rep: string; link?: string | null; business?: string | null }): string | null {
  const t = SMS_TEMPLATES[key];
  if (!t) return null;
  const rep = String(vars.rep ?? '').trim() || 'the Findable team';
  if (t.linkKind) {
    const link = String(vars.link ?? '').trim();
    if (!/^https:\/\/[^\s]+$/.test(link)) return null;
    return t.text.replace('{rep}', rep).replace('{link}', link);
  }
  return t.text.replace('{rep}', rep).replace('{business}', smsBusinessName(vars.business));
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
