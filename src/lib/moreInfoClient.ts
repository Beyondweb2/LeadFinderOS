/* Browser side of "Send more info" (fn send-more-info, src/lib/moreInfoMessage.ts, docs/send-more-info.md). The browser sends a LEAD ID,
   a channel and the edited words — never an address, number or link. A refusal is a normal answer ({ ok:false, detail }). */
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { EdgeFunctionError } from '@/lib/edgeInvokeCore';
import type { MoreInfoChannel, NamedFacts } from '@/lib/moreInfoMessage';

export interface MoreInfoPreview {
  ok: true;
  report_link: string;
  named: NamedFacts;
  warning: string | null;
  sender_name: string;
  price_line: string;
  can_edit_price: boolean;
  email: { to: string | null; subject: string; body: string };
  sms: { to: string | null; body: string; segments: number; refusal: string | null };
}
export interface MoreInfoRefused { ok: false; error: string; detail: string }
/** Type guard for a refusal (works whatever the compiler strictness). */
export const isRefused = (r: { ok: boolean }): r is MoreInfoRefused => r.ok === false;

export interface MoreInfoSent { ok: true; channel: MoreInfoChannel; simulated: boolean; duplicate: boolean; to: string | null }

async function call<T>(body: Record<string, unknown>): Promise<T | MoreInfoRefused> {
  try {
    return await invokeEdge<T>('send-more-info', body);
  } catch (e) {
    if (e instanceof EdgeFunctionError) return { ok: false, error: e.code || 'refused', detail: e.detail || edgeErrorMessage(e) };
    return { ok: false, error: 'unavailable', detail: edgeErrorMessage(e, 'Could not reach the server. Try again in a moment.') };
  }
}

export const previewMoreInfo = (leadId: string) => call<MoreInfoPreview>({ mode: 'preview', lead_id: leadId });

/** callConsent = the "They asked for this info on a call" tick (the server refuses a send without it). */
export const sendMoreInfo = (a: { leadId: string; channel: MoreInfoChannel; subject?: string; text: string; key: string; callConsent: boolean }) =>
  call<MoreInfoSent>({ mode: 'send', lead_id: a.leadId, channel: a.channel, subject: a.subject ?? null, text: a.text, idempotency_key: a.key, call_consent: a.callConsent === true });

export const savePriceLine = (priceLine: string) => call<{ ok: true; price_line: string }>({ mode: 'save_settings', price_line: priceLine });
