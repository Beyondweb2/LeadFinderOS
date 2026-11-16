/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEND MORE INFO (Paul, 2026-11-16, docs/send-more-info.md)

   A prospect asks for more info on a call; the salesperson presses "Send more info" on the prospect page and sends
   ONE email or ONE text (never WhatsApp). The wording is Paul's, word for word: ONLY the variables change.
     {{business_name}}  the lead's BUSINESS name (never a person's name)
     {{report_link}}    the lead's latest report, on the address its campaign uses (findable.live)
     {{trade}}          the report's trade WITH its article ("a plumber", "an electrician"), moreInfoTrade
     {{price_line}}     ONE admin setting (more_info_settings.price_line), used by the email AND the text
     {{sender_name}}    the sending salesperson's first name
   ⛔ When the report shows AI already names them in SOME answers, the competitor sentence becomes
      "AI mentions you sometimes, but mostly recommends your competitors" (moreInfoCompetitorLine).
   ⛔ When the report shows AI names them in EVERY answer, nothing is sent: neither sentence would be true.
   Pure. IMPORTED BY THE EDGE FUNCTION send-more-info: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { articleTrade } from './templateVars.ts';

/** The price line's value until Paul changes it (Admin: the Send more info dialog, "Price line"). */
export const DEFAULT_MORE_INFO_PRICE_LINE = '£99 a month for 12 months (or £999 up front)';
export const PRICE_LINE_MAX = 160;

export type MoreInfoChannel = 'email' | 'sms';
export const MORE_INFO_CHANNELS: readonly MoreInfoChannel[] = ['email', 'sms'];
export const isMoreInfoChannel = (v: unknown): v is MoreInfoChannel => v === 'email' || v === 'sms';

/** What the report says about the business being named. `unknown` = the report holds no count we can read. */
export type NamedFacts = { kind: 'none' } | { kind: 'some'; named: number; total: number } | { kind: 'all'; total: number } | { kind: 'unknown' };

export interface MoreInfoVars {
  businessName: string;
  reportLink: string;
  /** With its article: "a plumber" (moreInfoTrade). */
  trade: string;
  priceLine: string;
  senderName: string;
  named: NamedFacts;
}

export const MORE_INFO_SITE = 'https://findable.live';
/** The bare site name the text ends with (not a link a phone must open; it is the address people type). */
export const MORE_INFO_SITE_BARE = 'findable.live';

/** The trade WITH its article, as the sentence says it ("a plumber", "an electrician"): the one trade rule the WhatsApp
 *  templates use (templateVars.ts articleTrade: singular, lower case, the article from the first word's sound). Null = no
 *  usable trade (the message is then refused, never sent with a blank). */
export function moreInfoTrade(raw: string | null | undefined): string | null {
  const r = articleTrade(raw);
  return r.ok ? r.value : null;
}

/** The first name of the person sending ("Valentin Popescu" → "Valentin"). */
export function senderFirstName(displayName: string | null | undefined): string {
  return String(displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** The email's competitor sentence (whole sentence). */
export function moreInfoCompetitorLine(trade: string, named: NamedFacts): string {
  const ask = `When people ask ChatGPT, Gemini or Google AI for ${trade} near you,`;
  return named.kind === 'some'
    ? `${ask} AI mentions you sometimes, but mostly recommends your competitors.`
    : `${ask} it recommends your competitors instead of you.`;
}

/** The text's competitor sentence. */
export function moreInfoSmsCompetitorLine(named: NamedFacts): string {
  return named.kind === 'some' ? 'AI mentions you sometimes, but mostly recommends your competitors.' : 'AI recommends your competitors right now.';
}

export function moreInfoEmailSubject(v: Pick<MoreInfoVars, 'businessName'>): string {
  return `${v.businessName}: the info you asked for`;
}

export function moreInfoEmailBody(v: MoreInfoVars): string {
  return [
    `Hi ${v.businessName},`,
    '',
    `Here's the info you asked for, and your AI report: ${v.reportLink}`,
    '',
    moreInfoCompetitorLine(v.trade, v.named),
    '',
    "AI builds its answers from what it can read about your business online. If that's unclear or hard to read, it picks someone else. We fix what AI reads, so it understands who you are, what you do and where you work, and starts recommending you.",
    '',
    `It's ${v.priceLine}. There's a smaller option too if you'd prefer, just ask.`,
    '',
    "We improve your AI visibility or you get your money back. We measure 20 searches your customers make when you join, then again at 4 weeks, and if you're not named more we refund everything you've paid.",
    '',
    `More at ${MORE_INFO_SITE}, or just reply with any questions.`,
    '',
    v.senderName,
    'Findable',
  ].join('\n');
}

/* ⛔ The text carries {{price_line}} where Paul's draft had "£99/month" (point 3: ONE setting used by both), so a
   price change reaches both at once, and the text never names the monthly figure without the up-front one. */
export function moreInfoSmsBody(v: MoreInfoVars): string {
  return [
    `Hi ${v.businessName}, here's your AI report: ${v.reportLink}`,
    '',
    `${moreInfoSmsCompetitorLine(v.named)} We fix what it reads so you get named.`,
    '',
    `${v.priceLine}, money back if your AI visibility doesn't improve.`,
    '',
    MORE_INFO_SITE_BARE,
    `${v.senderName}, Findable`,
    'Reply STOP to opt out',
  ].join('\n');
}

/** Why the message cannot be built for this lead (null = it can). Checked again by the server on send. */
export function moreInfoBlock(v: { businessName: string; reportLink: string | null; trade: string; named: NamedFacts; senderName: string }): string | null {
  if (!v.reportLink) return 'There is no report for this lead yet. Run the AI check first, then send more info.';
  if (!v.businessName.trim()) return 'This lead has no business name, so the message cannot say who it is for. Add the business name first.';
  if (!v.trade.trim()) return 'The report has no trade, so the message cannot say what people search for. Nothing can be sent.';
  if (!v.senderName.trim()) return 'Your name is missing on your team profile, so the message cannot be signed. Ask Paul to add it.';
  if (v.named.kind === 'all') return 'The report shows AI already names them in every answer, so this message would not be true. Nothing can be sent.';
  return null;
}

/** A gentle note in the preview (never a block): named in more than half, "mostly recommends your competitors" may not fit. */
export function moreInfoWarning(named: NamedFacts): string | null {
  if (named.kind === 'some' && named.named * 2 > named.total) {
    return `The report shows AI named them in about ${Math.round((named.named / named.total) * 100)}% of answers. Check "mostly recommends your competitors" still fits before sending.`;
  }
  return null;
}

/* ── What an edited message may carry ────────────────────────────────────────────────────────────── */
const LINKISH = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|live|me|ly|app|site|info|biz)\b)/i;

/** ⛔ The salesperson may edit the words, never add a link: the only addresses allowed are THIS lead's report link and
 *  findable.live. The report link must still be in it (the message is "here's your report"). null = fine. */
export function moreInfoTextRefusal(text: string, reportLink: string): string | null {
  const t = String(text ?? '');
  if (!t.trim()) return 'The message is empty.';
  if (!t.includes(reportLink)) return 'The report link was removed or changed. Put it back exactly as it was, or start again.';
  const rest = t.split(reportLink).join(' ')
    .split(`${MORE_INFO_SITE}/`).join(' ').split(MORE_INFO_SITE).join(' ')
    .split(`www.${MORE_INFO_SITE_BARE}`).join(' ').split(MORE_INFO_SITE_BARE).join(' ');
  if (LINKISH.test(rest)) return 'Only their report link and findable.live can be in this message. Remove the other link.';
  return null;
}

export const MORE_INFO_EMAIL_MAX = 5000;
export const MORE_INFO_SUBJECT_MAX = 180;
export const MORE_INFO_SMS_MAX = 1000;

/* ── After it is sent ─────────────────────────────────────────────────────────────────────────────── */
/** The lead's History line: "More info sent by Valentin via SMS". */
export function moreInfoHistoryLine(senderName: string, channel: MoreInfoChannel): string {
  return `More info sent by ${senderName.trim() || 'someone'} via ${channel === 'sms' ? 'SMS' : 'email'}`;
}

/* ── Consent from the call (Paul, 2026-11-16) ─────────────────────────────────────────────────────────────────────────────
   Reps often call from their own phones, so no answered call is on record and the text's conversation gate stayed shut. For
   SEND MORE INFO ONLY the salesperson instead ticks "They asked for this info on a call" (required for a text AND an email); the
   tick is the consent and it is written on the lead's History (who, when, channel). Every other check stays: opt-out /
   do-not-contact, the test-lead rule, the send limits, texting hours. Cold texts and every other text keep the conversation gate. */
export const MORE_INFO_CONSENT_LABEL = 'They asked for this info on a call';
export const MORE_INFO_CONSENT_REQUIRED = 'Tick "They asked for this info on a call" first. Send more info only goes to someone who asked for it.';
/** Only a real `true` counts (never "true", 1 or a missing field). */
export function moreInfoCallConsentGiven(v: unknown): boolean {
  return v === true;
}
/** The SMS sender's gate: a more-info text whose call consent was ticked opens the conversation gate. Nothing else does. */
export function moreInfoOpensSmsGate(a: { moreInfo?: { callConsent?: unknown } | null }): boolean {
  return !!a.moreInfo && moreInfoCallConsentGiven(a.moreInfo.callConsent);
}
/** The consent line on History: "Asked for info on a call, confirmed by Valentin". */
export function moreInfoConsentLine(confirmedBy: string): string {
  return `Asked for info on a call, confirmed by ${confirmedBy.trim() || 'someone'}`;
}
/** What the History row stores about the consent: who, when, channel. */
export function moreInfoConsentRecord(a: { userId: string; name: string; channel: MoreInfoChannel; at: Date }) {
  return { source: 'call', confirmed_by_user_id: a.userId, confirmed_by: a.name.trim() || 'someone', channel: a.channel, confirmed_at: a.at.toISOString(), label: MORE_INFO_CONSENT_LABEL };
}

/** The follow-up the salesperson's send sets: a Follow up two UK days from now. */
export const MORE_INFO_FOLLOW_UP_DAYS = 2;
export const MORE_INFO_NEXT_ACTION = 'follow_up';
export function moreInfoFollowUpNote(channel: MoreInfoChannel): string {
  return `Follow up on the info sent by ${channel === 'sms' ? 'text' : 'email'}`;
}
export function moreInfoFollowUpDay(now: Date = new Date()): string {
  const d = new Date(now.getTime() + MORE_INFO_FOLLOW_UP_DAYS * 24 * 60 * 60_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Clean a typed price line (one line, trimmed, capped). Empty = the default. */
export function cleanPriceLine(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, PRICE_LINE_MAX);
  return s || DEFAULT_MORE_INFO_PRICE_LINE;
}
