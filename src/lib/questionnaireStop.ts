/* ═════════════════════════════════════════════════════════════════
   WHERE A QUESTIONNAIRE STOPPED, ITS NEXT ACTION, DUE TIME AND ESCALATION (Concept A, Paul 2026-10-26).
   ONE rule, read by the admin home's "What needs you" list (src/lib/needsMe.ts) and the onboarding alert email
   (fn notify-onboarding-submit), so the email's "Next step" and the row can never disagree.
   Pure and edge-safe: relative imports with .ts only. Derived every time, never stored.
   - Every submission gets a next action and a due time (QUESTIONNAIRE_FIRST_DUE_MS after it landed).
   - No movement for 24 h → escalated (the 24-hour nudge; escalated again at 48 h). After the nudge: "Call them" at 24 h,
     then "Record the outcome" at 48 h (paid is automatic; lost needs a reason). No final-nudge template (Paul, 2026-10-26).
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
  /** 0 = on time, 1 = no movement 24 h, 2 = no movement 48 h, 3 = the 24-hour nudge went 48 h ago with no answer: record the outcome. */
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
    payment: { action: 'Help with the payment', template: 'questionnaire_payment_help' },
    agreement: { action: 'Send the agreement and next steps', template: 'agreement_next_steps' },
    domain: { action: 'Help with the domain question', template: 'questionnaire_domain_help' },
    rights: { action: 'Help with the website permissions', template: 'questionnaire_domain_help' },
    agency: { action: 'Sort agency access', template: 'agency_access' },
    tied_in: { action: 'Decline politely and note the end date', template: null },
    questions: { action: 'Help them finish the questions', template: null },
  };
  const first = base[stop];
  /* The stop's own message has not gone yet: that is the next action, due 2 h after they submitted. */
  if (!q.last_out_at) {
    const escalation = quiet >= ESCALATE_2_MS ? 2 : quiet >= ESCALATE_1_MS ? 1 : 0;
    return { stop, why: STOP_WORDS[stop], ...first, dueIso: new Date(Date.parse(q.created_at) + QUESTIONNAIRE_FIRST_DUE_MS).toISOString(), escalation, movedIso };
  }
  /* They answered after us: back to the stop's own action, due now. */
  if (!weWroteLast) return { stop, why: `${STOP_WORDS[stop]}. They replied`, ...first, dueIso: q.last_in_at!, escalation: 0, movedIso };
  /* 2026-10-26: there is no final-nudge template (Paul did not wire it). After the 24-hour nudge: a call at 24 h, then the
     outcome at 48 h. Before it: the 24-hour nudge (escalated once more at 48 h). */
  const due = (ms: number) => new Date(Date.parse(movedIso) + ms).toISOString();
  if (q.last_out_template === 'nudge_24h') {
    if (quiet >= ESCALATE_2_MS) return { stop, why: `${STOP_WORDS[stop]}. Nudged, no answer for 2 days`, action: 'Record the outcome', template: null, dueIso: due(ESCALATE_2_MS), escalation: 3, movedIso };
    if (quiet >= ESCALATE_1_MS) return { stop, why: `${STOP_WORDS[stop]}. Nudged, no answer for a day`, action: 'Call them', template: null, dueIso: due(ESCALATE_1_MS), escalation: 2, movedIso };
  } else {
    if (quiet >= ESCALATE_2_MS) return { stop, why: `${STOP_WORDS[stop]}. No answer for 2 days`, action: 'Send the 24-hour nudge', template: 'nudge_24h', dueIso: due(ESCALATE_1_MS), escalation: 2, movedIso };
    if (quiet >= ESCALATE_1_MS) return { stop, why: `${STOP_WORDS[stop]}. No answer for a day`, action: 'Send the 24-hour nudge', template: 'nudge_24h', dueIso: due(ESCALATE_1_MS), escalation: 1, movedIso };
  }
  return { stop, why: `${STOP_WORDS[stop]}. Waiting on them`, action: 'Wait for their answer', template: null, dueIso: new Date(Date.parse(movedIso) + ESCALATE_1_MS).toISOString(), escalation: 0, movedIso };
}

/** The admin home row a questionnaire opens (the alert email links here). */
export const questionnaireRowKey = (onboardingId: string): string => `questionnaire:${onboardingId}`;
