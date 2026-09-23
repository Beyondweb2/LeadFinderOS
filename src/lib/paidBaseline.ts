import { EdgeFunctionError, invokeEdge } from '@/lib/edgeInvoke';
import type { PaidBaselineStatus } from './paidBaselineState';

export type PaidBaseline = {
  onboarding_id: string;
  lead_id: string;
  business_name: string;
  business_type: string;
  location: string;
  services: string;
  services_list: string[];
  areas_list: string[];
  website: string;
  context_sources?: {
    service_sources?: Record<string, string[]>;
    area_sources?: Record<string, string[]>;
  };
  /** What the latest crawl saw that no approved source lists — suggestions only, never measured. */
  detected?: { services: string[]; areas: string[] };
  crawl_context_at?: string | null;
  crawl_context_source?: 'run' | 'lead' | null;
  /** The Discovery scan whose stored business facts were reused as context, when one exists. */
  discovery_context?: { audit_id: string; created_at: string | null } | null;
  status: PaidBaselineStatus;
  questions: string[];
  approved_at: string | null;
  audit_id?: string;
  start_note?: string;
};

const FRIENDLY_ERRORS: Record<string, string> = {
  onboarding_id_or_lead_id_required: 'Baseline needs a linked client lead.',
  paid_onboarding_not_found: 'This client has no onboarding answers yet. Use Complete onboarding manually on the client page first.',
  lead_not_found: 'The linked client lead could not be found.',
  location_services_and_business_type_required: 'Add a location, service, and business category before saving client context.',
  location_and_business_type_required: 'Add a primary location and business category before saving client context.',
  questions_must_be_between_1_and_40: 'Add between 1 and 40 questions before saving.',
  questions_required: 'Add at least one question before approving the baseline.',
  baseline_question_count: 'A paid baseline is exactly 20 questions. Adjust the set before approving.',
  baseline_context_incomplete: 'Complete the client context (section A) and save it before approving.',
  baseline_questions_locked: 'The approved question set is frozen and cannot be edited.',
  question_generation_failed: 'Question generation failed. Please retry.',
  no_questions_generated: 'No usable questions were generated. Please retry.',
  baseline_state_changed: 'Baseline setup changed in another session. Reload it and try again.',
  paid_onboarding_update_conflict: 'The paid onboarding record changed or could not be updated. Reload and try again.',
  lead_update_conflict: 'The linked client record changed or could not be updated. Reload and try again.',
  baseline_request_failed: 'Could not load or update baseline setup. Please retry.',
  baseline_start_refused: 'The baseline could not start. Check the client context and try again.',
  baseline_start_failed: 'The baseline did not start. The approved questions are kept; try again.',
  no_business_type: 'Add a business category before starting the baseline.',
  no_location: 'Add a primary location before starting the baseline.',
};

/** One client-side request shape and one useful error path for every paid-baseline entry point. */
export async function invokePaidBaseline(
  action: string,
  leadId: string,
  extra: Record<string, unknown> = {},
): Promise<PaidBaseline> {
  /* Through invokeEdge (src/lib/edgeInvoke.ts): a real session first, explicit Authorization, one
     refresh-and-retry on 401, never the anon key. It throws EdgeFunctionError with the machine
     token in `code` and the server's own sentence in `detail`.
     ⛔ THE SERVER'S OWN SENTENCE WINS OVER THE TOKEN. A refusal that can name the specific number
     ("…exactly 20 questions, and 19 were approved") puts it in `detail`; `code` is what
     FRIENDLY_ERRORS keys on. Showing the token instead of the sentence throws away the half that
     tells the operator what to do. */
  try {
    const data = await invokeEdge<{ baseline: PaidBaseline }>('paid-baseline', { action, lead_id: leadId, ...extra });
    return data.baseline;
  } catch (e) {
    if (e instanceof EdgeFunctionError) {
      throw new Error(e.detail || (e.code && (FRIENDLY_ERRORS[e.code] ?? e.code)) || 'Could not update the baseline');
    }
    throw e instanceof Error ? e : new Error('Could not update the baseline');
  }
}
