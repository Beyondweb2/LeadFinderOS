/* ═════════════════════════════════════════════════════════════════
   WHERE A QUESTIONNAIRE STOPPED, ITS NEXT ACTION, DUE TIME AND ESCALATION (Concept A, Paul 2026-10-26).
   ONE rule, read by the admin home's "What needs you" list (src/lib/needsMe.ts) and the onboarding alert email
   (fn notify-onboarding-submit), so the email's "Next step" and the row can never disagree.
   Pure and edge-safe: relative imports with .ts only. Derived every time, never stored.
   - Every submission gets a next action and a due time (QUESTIONNAIRE_FIRST_DUE_MS after it landed).
   - No movement for 24 h → escalated (amber, the 24-hour nudge); 48 h → escalated (red, the final nudge);
     48 h after the final nudge → "Record the outcome" (paid is automatic; lost needs a reason).
   ═════════════════════════════════════════════════════════════════ */
import { domainAuthority, domainInputFromRow, type DomainRow } from './domainAuthority.ts';
import { unansweredDomainQuestions } from './domainEmailLine.ts';
import { agencyContractOutcome } from './agencyContractRule.ts';
import type { NeedsTemplateKey } from './needsMeTemplates.ts';

export const QUESTIONNAIRE_FIRST_DUE_MS = 2 * 3_600_000;
export const ESCALATE_1_MS = 24 * 3_600_000;
export const ESCALATE_2_MS = 48 * 3_600_000;

export type QuestionnaireStop = 'payment' | 'domain' | 'agency' | 'tied_in' | 'rights' | 'questions' | 'agreement';

export interface QuestionnaireFacts extends DomainRow {
  id: string; lead_id: string | null; business_name: string | null;
  created_at: string; updated_at?: string | null; incomplete?: boolean | null;
  website_manager?: string | null; agency_contract?: string | null;
  lead_amount_paid?: number | null; agreement_signed_at?: string | null;
  last_out_at?: string | null; last_out_template?: string | null; last_in_at?: string | null;
  followup_sent?: boolean | null; outcome?: string | null; lost_reason?: string | null;
}

export const STOP_WORDS: Record<QuestionnaireStop, string> = {
  payment: 'Signed the agreement, payment not made',
  domain: 'Domain question not answered',
  agency: 'An agency or web company runs the site; contract not settled',
  tied_in: 'Tied into their current provider (agreement 1.6: decline politely)',
  rights: 'Website permissions not ticked',
  questions: 'Started the questions, did not finish',
  agreement: 'Answered everything, agreement not signed',
};

/** Where they stopped. Order = what blocks them first. The agency part is THE agency rule (agencyContractRule.ts). */
export function questionnaireStop(q: QuestionnaireFacts): QuestionnaireStop {
  if (q.agreement_signed_at) return 'payment';
  const verdict = domainAuthority(domainInputFromRow(q));
  if (verdict.applies && unansweredDomainQuestions(q).length > 0) return 'domain';
  const agency = agencyContractOutcome(q.website_manager === 'web_company' ? true : q.website_manager ? false : null, q.agency_contract);
  if (agency === 'stop') return 'tied_in';
  if (agency === 'hold' || (agency === 'unanswered' && q.website_manager === 'web_company')) return 'agency';
  if (verdict.applies && !verdict.ready) return 'rights';
  if (q.incomplete === true) return 'questions';
  return 'agreement';
}

export interface QuestionnaireStep {
  stop: QuestionnaireStop;
  why: string;
  action: string;
  template: NeedsTemplateKey | null;
  /** When the next action is due (ISO). */
  dueIso: string;
  /** 0 = on time, 1 = no movement 24 h, 2 = no movement 48 h, 3 = final nudge sent 48 h ago: record the outcome. */
  escalation: 0 | 1 | 2 | 3;
  /** The last thing that happened (submission, our message, their message, an edit). */
  movedIso: string;
}

const maxIso = (...xs: (string | null | undefined)[]): string => xs.filter(Boolean).sort().pop() as string;

/** The row's next step at `nowMs`. Null = closed (paid, or an outcome recorded). */
export function questionnaireStep(q: QuestionnaireFacts, nowMs: number): QuestionnaireStep | null {
  if (Number(q.lead_amount_paid ?? 0) > 0 || q.outcome) return null;
  const stop = questionnaireStop(q);
  const movedIso = maxIso(q.created_at, q.updated_at, q.last_out_at, q.last_in_at);
  const quiet = nowMs - Date.parse(movedIso);
  const weWroteLast = !!q.last_out_at && (!q.last_in_at || q.last_out_at > q.last_in_at);
  const base: Record<QuestionnaireStop, { action: string; template: NeedsTemplateKey | null }> = {
    payment: { action: 'Nudge the payment step', template: 'questionnaire_followup' },
    agreement: { action: 'Nudge the payment step', template: 'questionnaire_followup' },
    domain: { action: 'Help with the domain question', template: 'domain_help' },
    rights: { action: 'Help with the website permissions', template: 'domain_help' },
    agency: { action: 'Sort agency access', template: 'agency_access' },
    tied_in: { action: 'Decline politely and note the end date', template: null },
    questions: { action: 'Help them finish the questions', template: 'agreement_next_steps' },
  };
  const first = base[stop];
  /* The stop's own message has not gone yet: that is the next action, due 2 h after they submitted. */
  if (!q.last_out_at) {
    const escalation = quiet >= ESCALATE_2_MS ? 2 : quiet >= ESCALATE_1_MS ? 1 : 0;
    return { stop, why: STOP_WORDS[stop], ...first, dueIso: new Date(Date.parse(q.created_at) + QUESTIONNAIRE_FIRST_DUE_MS).toISOString(), escalation, movedIso };
  }
  /* They answered after us: back to the stop's own action, due now. */
  if (!weWroteLast) return { stop, why: `${STOP_WORDS[stop]}. They replied`, ...first, dueIso: q.last_in_at!, escalation: 0, movedIso };
  const finalSent = q.last_out_template === 'final_nudge';
  if (finalSent && quiet >= ESCALATE_2_MS) {
    return { stop, why: `${STOP_WORDS[stop]}. Final nudge sent, no answer`, action: 'Record the outcome', template: null, dueIso: new Date(Date.parse(movedIso) + ESCALATE_2_MS).toISOString(), escalation: 3, movedIso };
  }
  if (quiet >= ESCALATE_2_MS) return { stop, why: `${STOP_WORDS[stop]}. No answer for 2 days`, action: 'Send the final nudge', template: 'final_nudge', dueIso: new Date(Date.parse(movedIso) + ESCALATE_2_MS).toISOString(), escalation: 2, movedIso };
  if (quiet >= ESCALATE_1_MS) return { stop, why: `${STOP_WORDS[stop]}. No answer for a day`, action: 'Send the 24-hour nudge', template: 'nudge_24h', dueIso: new Date(Date.parse(movedIso) + ESCALATE_1_MS).toISOString(), escalation: 1, movedIso };
  return { stop, why: `${STOP_WORDS[stop]}. Waiting on them`, action: 'Wait for their answer', template: null, dueIso: new Date(Date.parse(movedIso) + ESCALATE_1_MS).toISOString(), escalation: 0, movedIso };
}

/** The admin home row a questionnaire opens (the alert email links here). */
export const questionnaireRowKey = (onboardingId: string): string => `questionnaire:${onboardingId}`;
