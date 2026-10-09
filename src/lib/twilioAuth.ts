/* ══ TWILIO WEBHOOK SIGNATURES AND VOICE ACCESS TOKENS — PURE, WEB-CRYPTO ONLY (2026-10-09) ═════════════
   Runs unchanged in Deno (the edge functions), Node (the tests) and the browser. No Twilio SDK, no secrets read
   here: the caller passes them in. Relative imports only.

   SIGNATURE (https://www.twilio.com/docs/usage/webhooks/webhooks-security): X-Twilio-Signature is
   base64(HMAC-SHA1(authToken, fullUrl + for each POST param sorted by name: name + value)). The URL must be the one
   Twilio was configured with (scheme, host, path AND query string). Compared in constant time. ⛔ FAILS CLOSED: an
   unset token, an empty signature or a malformed one is "invalid", never "skip the check".

   ACCESS TOKEN (https://www.twilio.com/docs/iam/access-tokens): a JWT, HS256, signed with an API KEY SECRET (never the
   auth token), header cty "twilio-fpa;v=1", payload { jti, iss: apiKeySid, sub: accountSid, iat, exp, grants: {
   identity, voice: { outgoing: { application_sid } } } }. ⛔ Only an OUTGOING grant: no incoming, no push, no
   other grant. The TwiML App behind it decides what a call does — and the number it dials comes from OUR database
   (twilio-webhook), never from anything the browser sends. */

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
const b64url = (bytes: Uint8Array): string => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(hash: 'SHA-1' | 'SHA-256', key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

export async function twilioSignature(authToken: string, url: string, params: Readonly<Record<string, string>>): Promise<string> {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return b64(await hmac('SHA-1', authToken, data));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function validTwilioSignature(
  authToken: string | null | undefined, url: string, params: Readonly<Record<string, string>>, header: string | null | undefined,
): Promise<boolean> {
  if (!authToken || !header || !url) return false;
  try { return safeEqual(await twilioSignature(authToken, url, params), header.trim()); } catch { return false; }
}

export interface VoiceTokenInput {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  /** Who the token is for: the rep's user id. Becomes the `client:` identity the TwiML webhook checks. */
  identity: string;
  /** Seconds the token lives. Short on purpose — it is minted fresh for every call. */
  ttlSeconds?: number;
  nowMs?: number;
}

export const VOICE_TOKEN_MAX_TTL_S = 900;

export async function voiceAccessToken(i: VoiceTokenInput): Promise<string> {
  const now = Math.floor((i.nowMs ?? Date.now()) / 1000);
  const ttl = Math.min(Math.max(i.ttlSeconds ?? 600, 60), VOICE_TOKEN_MAX_TTL_S);
  if (!/^AC[0-9a-f]{32}$/i.test(i.accountSid) || !/^SK[0-9a-f]{32}$/i.test(i.apiKeySid) || !/^AP[0-9a-f]{32}$/i.test(i.twimlAppSid)) {
    throw new Error('twilio_config_malformed');
  }
  if (!/^[0-9a-f-]{36}$/i.test(i.identity)) throw new Error('bad_identity');
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${i.apiKeySid}-${now}`, iss: i.apiKeySid, sub: i.accountSid, iat: now, exp: now + ttl,
    grants: { identity: i.identity, voice: { outgoing: { application_sid: i.twimlAppSid } } },
  };
  const part = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));
  const signingInput = `${part(header)}.${part(payload)}`;
  return `${signingInput}.${b64url(await hmac('SHA-256', i.apiKeySecret, signingInput))}`;
}
