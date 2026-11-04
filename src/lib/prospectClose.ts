/* ══ THE CLOSE ON THE PROSPECT PAGE (Paul, 2026-11-04, docs/prospect-one-page-close.md) ═══════════════════════════════
   The words and the "what is still missing" of the send buttons. The server (fn quick-close) still decides everything that
   matters and refuses on its own: this only tells the salesperson why a button is off, before they press it.
   ⛔ Every figure comes from paymentPlans.ts. ⛔ A list on the lead (services, areas) counts as an answer, and goes onto the
      call notes just before the link is made: opening a lead writes nothing. Pure. */
import { PAYMENT_PLAN_NAME, PAYMENT_PLAN_SPEC, gbpWords, type PaymentPlan } from './paymentPlans.ts';
import { cleanCallNotes, missingQuestions, splitCallList, type QcCallNotes, type QcKey, type QuickCloseAnswers } from './quickClose.ts';

export type SendChannel = 'whatsapp' | 'sms' | 'email';
export const SEND_CHANNEL_WORDS: Record<SendChannel, string> = { whatsapp: 'WhatsApp', sms: 'text', email: 'email' };

/** The short plan name a salesperson says: "Complete monthly", "Essential £99 then £49.99". */
export function planSendName(p: PaymentPlan): string {
  const s = PAYMENT_PLAN_SPEC[p];
  switch (p) {
    case 'complete': return 'Complete monthly';
    case 'complete_upfront': return `Complete up front ${gbpWords(s.firstGbp)}`;
    case 'full': return 'Essential in full';
    case 'six': return `Essential ${gbpWords(s.monthlyGbp)} × ${s.totalPayments}`;
    case 'twelve': return `Essential ${gbpWords(s.firstGbp)} then ${gbpWords(s.monthlyGbp)}`;
    default: return PAYMENT_PLAN_NAME[p];
  }
}

/** "Send Complete monthly link to 07700 900123 by WhatsApp?" — the one question before anything goes out. */
export function sendConfirmText(plan: PaymentPlan, to: string, channel: SendChannel, again = false): string {
  const how = channel === 'email' ? 'by email' : channel === 'sms' ? 'by text' : 'by WhatsApp';
  return `Send ${planSendName(plan)} link ${again ? 'again ' : ''}to ${to} ${how}?`;
}

const LIST_JOIN = ', ';
/** The call notes the page shows: what the call heard, else what the lead already holds. */
export function shownCallNotes(call: QcCallNotes | null | undefined, lead: { services?: readonly string[] | null; service_areas?: readonly string[] | null } | null | undefined): { jobs: string; areas: string } {
  const c = cleanCallNotes(call);
  return { jobs: c.jobs ?? (lead?.services ?? []).join(LIST_JOIN), areas: c.areas ?? (lead?.service_areas ?? []).join(LIST_JOIN) };
}
/** Notes the lead holds that the call has not saved yet: written just before a link (the server wants them on the call record). */
export function callNotesToCarry(call: QcCallNotes | null | undefined, lead: { services?: readonly string[] | null; service_areas?: readonly string[] | null } | null | undefined): { jobs?: string; areas?: string } {
  const c = cleanCallNotes(call);
  const shown = shownCallNotes(call, lead);
  const out: { jobs?: string; areas?: string } = {};
  if (!c.jobs && shown.jobs) out.jobs = shown.jobs;
  if (!c.areas && shown.areas) out.areas = shown.areas;
  return out;
}

const QUESTION_WORDS: Partial<Record<QcKey, string>> = {
  decision_maker: 'who makes the decision',
  manager: 'who looks after the website',
  agency_contract: 'whether they are tied into a contract',
};
/** What must be answered before a link can be made, in plain words. ⛔ Positive: nothing here, and the plan is picked, is the only "ready". */
export function closeStillNeeded(input: { answers: QuickCloseAnswers; call: QcCallNotes | null | undefined; lead: { trade?: string | null; services?: readonly string[] | null; service_areas?: readonly string[] | null } | null | undefined }): string[] {
  const shown = shownCallNotes(input.call, input.lead);
  const out: string[] = [];
  if (!splitCallList(shown.jobs).length) out.push('what jobs they want more of');
  if (!splitCallList(shown.areas).length) out.push('what areas they want to be found in');
  for (const k of missingQuestions(input.answers)) { const w = QUESTION_WORDS[k]; if (w) out.push(w); }
  if (!String(input.lead?.trade ?? '').trim()) out.push('their trade');
  return out;
}
