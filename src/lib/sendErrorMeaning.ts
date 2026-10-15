/* THE REAL SEND ERROR, AND WHAT IT MEANS (2026-10-15, feat/send-error-capture).

   Two jobs, one leaf (edge-reachable: no imports at all):
   1. metaErrorParts — pull Meta's raw error code, title and details out of whatever Meta answered: the Graph send
      response's `error` object ({ code, message: "(#131026) Message undeliverable", error_data: { details } }) or a
      status callback's `errors[0]` ({ code, title, message, error_data: { details } }). Nothing else is kept: never
      the request, never a header, never a token. A token-shaped string is masked even inside Meta's own text.
   2. sendErrorMeaning — one plain-English line per code. ⛔ The tables were built from the providers' CURRENT
      official lists, read 2026-10-15:
        Meta:   https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
        Twilio: https://www.twilio.com/docs/api/errors
      A code missing from the table still shows — the raw code is ALWAYS shown, the meaning only when we know it. */

export type SendChannel = 'whatsapp' | 'sms';

export interface SendErrorParts {
  code: number | null;
  title: string | null;
  details: string | null;
}

const TITLE_MAX = 200;
const DETAILS_MAX = 500;

/** Masks anything shaped like a credential before it is stored or shown (Meta access tokens start EAA). */
export function maskSecrets(s: string): string {
  return s
    .replace(/EAA[A-Za-z0-9]{20,}/g, '[token]')
    .replace(/\b(Bearer|access_token=)\s*[A-Za-z0-9._-]{16,}/gi, '$1 [token]');
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = maskSecrets(v.replace(/\s+/g, ' ').trim());
  return t ? t.slice(0, max) : null;
}

/** Meta's error object (send response `error`, or a callback's `errors[0]`) → the three stored parts. */
export function metaErrorParts(err: unknown): SendErrorParts {
  if (!err || typeof err !== 'object') return { code: null, title: null, details: null };
  const e = err as Record<string, unknown>;
  const code = typeof e.code === 'number' && Number.isFinite(e.code) ? e.code : null;
  const data = (e.error_data && typeof e.error_data === 'object') ? e.error_data as Record<string, unknown> : {};
  const message = typeof e.message === 'string' ? e.message.replace(/^\(#\d+\)\s*/, '') : null;
  const title = clean(e.title, TITLE_MAX) ?? clean(e.error_user_title, TITLE_MAX) ?? clean(message, TITLE_MAX);
  let details = clean(data.details, DETAILS_MAX) ?? clean(e.error_user_msg, DETAILS_MAX);
  if (!details && message && clean(message, TITLE_MAX) !== title) details = clean(message, DETAILS_MAX);
  return { code, title, details };
}

/** A whole Graph response body → the parts (its `error` object, if any). */
export function metaErrorPartsFromResponse(body: unknown): SendErrorParts {
  const b = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
  return metaErrorParts(b.error);
}

/** Rows written before 2026-10-15 kept only the JSON text of Meta's error in `error`: read the parts back out of it,
 *  so an old failure shows its code too. Anything that is not Meta's JSON → no parts (never a guess). */
export function partsFromStoredError(text: string | null | undefined): SendErrorParts {
  if (!text || typeof text !== 'string') return { code: null, title: null, details: null };
  try {
    const j = JSON.parse(text);
    return metaErrorParts(j && typeof j === 'object' && 'error' in j ? (j as Record<string, unknown>).error : j);
  } catch {
    return { code: null, title: null, details: null };
  }
}

/* Meta WhatsApp Cloud API — plain English, from the official list (read 2026-10-15). */
export const META_ERROR_MEANINGS: Readonly<Record<number, string>> = {
  0: 'Our WhatsApp login failed — the access token expired or was revoked.',
  1: 'Meta could not process the request (malformed request or a Meta-side problem).',
  2: 'Meta had a temporary service problem (downtime or overload).',
  3: 'Our app is missing a permission this needs.',
  4: 'Our app hit Meta’s API rate limit.',
  10: 'A permission is missing or was removed.',
  33: 'Our business phone number no longer exists.',
  100: 'Meta rejected a parameter in the request (unsupported or misspelled).',
  190: 'Our WhatsApp access token has expired.',
  200: 'A permission is missing or was removed.',
  368: 'Our WhatsApp account is restricted for a Meta policy violation.',
  80007: 'Our WhatsApp account hit its rate limit.',
  130403: 'The person has blocked our number. Do not retry.',
  130429: 'We hit Meta’s message throughput limit.',
  130472: 'Meta held the message back as part of a marketing experiment.',
  130497: 'Our WhatsApp account is not allowed to message people in this country.',
  131000: 'Meta failed to send it for an unknown reason.',
  131005: 'A permission is missing or was removed.',
  131008: 'A required part of the message was missing.',
  131009: 'One of the values in the message was not valid.',
  131016: 'WhatsApp’s service was temporarily unavailable.',
  131021: 'The number we sent to is our own number.',
  131026: 'Not deliverable: the number is not on WhatsApp, has not accepted the terms, or uses an old WhatsApp version.',
  131031: 'Our WhatsApp account is restricted or disabled.',
  131037: 'Our number’s display name is not approved yet.',
  131042: 'There is a billing or payment problem on our WhatsApp account.',
  131045: 'Our phone number is not registered with WhatsApp.',
  131047: 'More than 24 hours since they last replied, so only a template can be sent.',
  131048: 'Our number is restricted because people blocked or reported our messages as spam.',
  131049: 'Meta held the message back to protect engagement for this person. Wait at least 24 hours before trying again.',
  131050: 'The person has stopped marketing messages from us.',
  131051: 'That type of message is not supported.',
  131052: 'Meta could not download the media the person sent.',
  131053: 'Meta could not upload the media (for example an unsupported file type).',
  131056: 'Too many messages to this same person in a short time.',
  131057: 'Our WhatsApp account is in maintenance mode.',
  131063: 'Marketing templates are switched off for our account.',
  131064: 'Messaging is limited because of template category violations.',
  132000: 'The number of variables does not match the template.',
  132001: 'The template does not exist in that language, or is not approved.',
  132005: 'The translated text is too long.',
  132007: 'The template wording breaks a WhatsApp policy.',
  132012: 'A variable value is in the wrong format for the template.',
  132015: 'The template is paused for low quality.',
  132016: 'The template has been permanently disabled.',
  132018: 'A template variable has a problem (for example a new line or too many spaces).',
  132068: 'The flow is blocked.',
  132069: 'The flow is throttled.',
  133004: 'WhatsApp’s server was temporarily unavailable.',
  133010: 'Our phone number is not registered on WhatsApp.',
  135000: 'Unknown problem with the request parameters.',
};

/* Twilio SMS — plain English, from the official list (read 2026-10-15). */
export const TWILIO_ERROR_MEANINGS: Readonly<Record<number, string>> = {
  21211: 'The number is not a valid phone number.',
  21408: 'Texts to this region are not switched on for our account.',
  21610: 'The person has replied STOP — they are unsubscribed.',
  21612: 'This number cannot be texted from our number.',
  21614: 'The number is not a mobile, so it cannot get texts.',
  30001: 'Twilio’s queue overflowed.',
  30002: 'Our Twilio account is suspended.',
  30003: 'The phone could not be reached (off, no signal, or temporarily unavailable).',
  30004: 'The message was blocked.',
  30005: 'The number is unknown or no longer in use.',
  30006: 'A landline, or a carrier that cannot be reached.',
  30007: 'The carrier filtered the message.',
  30008: 'Unknown error from the carrier.',
  30010: 'The message price was above our maximum.',
};

/** One plain-English line for a code, or null when we do not have one (the raw code is still shown). */
export function sendErrorMeaning(channel: SendChannel, code: number | null | undefined): string | null {
  if (code == null || !Number.isFinite(code)) return null;
  const table = channel === 'sms' ? TWILIO_ERROR_MEANINGS : META_ERROR_MEANINGS;
  if (table[code]) return table[code];
  if (channel === 'whatsapp' && code >= 200 && code <= 299) return META_ERROR_MEANINGS[200];
  return null;
}

/** The short label beside "Send failed": the raw code, always, when there is one. */
export function sendErrorCodeLabel(channel: SendChannel, code: number | null | undefined): string | null {
  if (code == null || !Number.isFinite(code)) return null;
  return `${channel === 'sms' ? 'Twilio' : 'Meta'} ${code}`;
}

/** "Meta 131049 — Meta held the message back…" ; unknown code → "Meta 999 — <Meta's own title, or 'meaning not in our list'>";
 *  no code at all → Meta's title/details if any, else null. */
export function sendErrorLine(channel: SendChannel, parts: Partial<SendErrorParts> | null | undefined): string | null {
  if (!parts) return null;
  const label = sendErrorCodeLabel(channel, parts.code ?? null);
  const meaning = sendErrorMeaning(channel, parts.code ?? null);
  if (label) return `${label} — ${meaning ?? parts.title ?? 'meaning not in our list'}`;
  return parts.title ?? parts.details ?? null;
}
