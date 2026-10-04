// metaWebhookGate — WHO may post to the WhatsApp webhook (whatsapp-status), decided in ONE place
// (2026-10-04, pre-sales certification M-003 / E-01; docs/pre-sales-certification/fixes-01-security-inbound.md).
//
// 🔴 THE HOLE THIS CLOSES. The webhook checked Meta's signature ONLY when WHATSAPP_APP_SECRET was set,
// and it was not set, so anyone on the internet could post a Meta-shaped "inbound reply": words in a
// prospect's mouth in a rep's Inbox, a lead flipped to `replied`, a fake "STOP" that suppresses the
// prospect everywhere, a paid first-reply audit armed. Proved live by Session E.
//
// ⛔ FAILS CLOSED. Exactly two ways in, and everything else is refused BEFORE the body is read:
//   1. META — a configured app secret AND a valid X-Hub-Signature-256 over the exact bytes received.
//      No secret configured = nothing verifies = refused (401). A non-2xx makes Meta retry the
//      delivery for days, and Meta signs every delivery whether or not we check, so a delivery refused
//      while the secret is missing lands once Paul sets it.
//   2. QA SIMULATION — the CRON_SECRET in `x-qa-simulate-inbound` (never in the browser; a salesperson
//      cannot hold it) AND a body that is inbound MESSAGES only (no delivery statuses), every sender in
//      Ofcom's reserved drama range (07700 900000–900999, never a real subscriber) and every message id
//      starting `wamid.QA_` (so a simulated id can never collide with, or pre-empt, a real Meta id).
//      It mirrors stripe-webhook's `x-qa-simulate-payment`. There is NO unsigned production bypass.
// Pure and edge-safe (relative .ts imports only), so the decision is unit-tested under Node.
import { validMetaSignature } from './metaSignature.ts';
import { isReservedTestNumber } from './qaSafety.ts';

export const QA_INBOUND_HEADER = 'x-qa-simulate-inbound';
export const QA_INBOUND_ID_PREFIX = 'wamid.QA_';

export type WebhookGateVerdict =
  | { accept: true; via: 'meta_signature' | 'qa_simulation' }
  | { accept: false; status: 400 | 401 | 403; reason: WebhookRefusal };

export type WebhookRefusal =
  | 'not_configured'
  | 'missing_signature'
  | 'invalid_signature'
  | 'qa_bad_secret'
  | 'qa_bad_shape'
  | 'qa_statuses_refused'
  | 'qa_not_reserved_number'
  | 'qa_bad_message_id';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Why a QA simulation body is refused, or null when every message is a reserved-number fixture. */
// deno-lint-ignore no-explicit-any
export function qaInboundBodyRefusal(body: any): Extract<WebhookRefusal, `qa_${string}`> | null {
  const entries = Array.isArray(body?.entry) ? body.entry : null;
  if (!entries || !entries.length) return 'qa_bad_shape';
  let messages = 0;
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : null;
    if (!changes || !changes.length) return 'qa_bad_shape';
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== 'object') return 'qa_bad_shape';
      if (Array.isArray(value.statuses) && value.statuses.length) return 'qa_statuses_refused';
      const msgs = Array.isArray(value.messages) ? value.messages : [];
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const c of contacts) {
        if (c?.wa_id != null && !isReservedTestNumber(String(c.wa_id))) return 'qa_not_reserved_number';
      }
      for (const m of msgs) {
        if (typeof m?.from !== 'string' || !isReservedTestNumber(m.from)) return 'qa_not_reserved_number';
        if (typeof m?.id !== 'string' || !m.id.startsWith(QA_INBOUND_ID_PREFIX)) return 'qa_bad_message_id';
        messages++;
      }
    }
  }
  return messages > 0 ? null : 'qa_bad_shape';
}

/** The whole decision for one POST. `qaHeader` null = the header was absent (the Meta path). */
export async function judgeWhatsAppWebhookPost(input: {
  rawBytes: Uint8Array;
  signatureHeader: string | null;
  appSecret: string;
  qaHeader: string | null;
  cronSecret: string;
}): Promise<WebhookGateVerdict> {
  if (input.qaHeader !== null) {
    if (!input.cronSecret || !constantTimeEqual(input.qaHeader, input.cronSecret)) {
      return { accept: false, status: 401, reason: 'qa_bad_secret' };
    }
    let parsed: unknown = null;
    try { parsed = JSON.parse(new TextDecoder().decode(input.rawBytes)); } catch { /* refused below */ }
    const refusal = qaInboundBodyRefusal(parsed);
    if (refusal) return { accept: false, status: refusal === 'qa_not_reserved_number' ? 403 : 400, reason: refusal };
    return { accept: true, via: 'qa_simulation' };
  }
  if (!input.appSecret) return { accept: false, status: 401, reason: 'not_configured' };
  if (!input.signatureHeader) return { accept: false, status: 401, reason: 'missing_signature' };
  const ok = await validMetaSignature(input.rawBytes, input.signatureHeader, input.appSecret);
  return ok ? { accept: true, via: 'meta_signature' } : { accept: false, status: 401, reason: 'invalid_signature' };
}
