/* Browser side of the SMS sender (fn twilio-sms-send). The browser sends a LEAD ID and a text-or-template — never a
   phone number; the server reads the number from the lead, runs every guard (src/../_shared/twilio-sms.ts) and answers
   in plain words. A refusal is a normal answer ({ ok:false, detail }), not an exception. */
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { EdgeFunctionError } from '@/lib/edgeInvokeCore';
import type { SmsTemplateName } from '@/lib/smsMessages';

export interface SmsSendOk { ok: true; duplicate: boolean; simulated: boolean; message: { id: string; status: string; body: string; segments: number | null } }
export interface SmsSendRefused { ok: false; error: string; detail: string }
export type SmsSendResult = SmsSendOk | SmsSendRefused;

export interface CommsStatus { ok: true; smsConfigured: boolean; voiceConfigured: boolean; testMode: boolean }

/** One key per PRESS of a send button: a double-click or a retry of the same press can never send twice. */
export const newSendKey = (): string => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function call<T>(body: Record<string, unknown>): Promise<T | SmsSendRefused> {
  try {
    return await invokeEdge<T>('twilio-sms-send', body);
  } catch (e) {
    if (e instanceof EdgeFunctionError) return { ok: false, error: e.code || 'refused', detail: e.detail || edgeErrorMessage(e) };
    return { ok: false, error: 'unavailable', detail: edgeErrorMessage(e, 'Could not reach the text service. Try again in a moment.') };
  }
}

export function sendSms(a: { leadId: string; template?: SmsTemplateName; text?: string; key: string; resend?: boolean }): Promise<SmsSendResult> {
  return call<SmsSendResult>({
    mode: 'send', lead_id: a.leadId, idempotency_key: a.key,
    ...(a.template ? { template_name: a.template } : { text: a.text ?? '' }),
    ...(a.resend ? { allow_resend: true } : {}),
  }) as Promise<SmsSendResult>;
}

export async function fetchCommsStatus(): Promise<CommsStatus | null> {
  const r = await call<CommsStatus>({ mode: 'status' });
  return (r as CommsStatus).ok === true ? (r as CommsStatus) : null;
}
