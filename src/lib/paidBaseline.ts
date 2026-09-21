import { supabase } from '@/integrations/supabase/client';

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
  crawl_context_at?: string | null;
  crawl_context_source?: 'run' | 'lead' | null;
  status: 'needs_questions' | 'needs_approval' | 'approved' | 'running' | 'complete' | 'failed';
  questions: string[];
  approved_at: string | null;
  audit_id?: string;
  start_note?: string;
};

const FRIENDLY_ERRORS: Record<string, string> = {
  onboarding_id_or_lead_id_required: 'Baseline needs a linked client lead.',
  paid_onboarding_not_found: 'Baseline onboarding record could not be found.',
  lead_not_found: 'The linked client lead could not be found.',
  location_services_and_business_type_required: 'Add a location, service, and business category before saving client context.',
  location_and_business_type_required: 'Add a primary location and business category before saving client context.',
  questions_must_be_between_1_and_40: 'Add between 1 and 40 questions before saving.',
  questions_required: 'Add at least one question before approving the baseline.',
  baseline_question_count: 'A paid baseline is exactly 20 questions. Adjust the set before approving.',
  question_generation_failed: 'Question generation failed. Please retry.',
  no_questions_generated: 'No usable questions were generated. Please retry.',
  baseline_state_changed: 'Baseline setup changed in another session. Reload it and try again.',
  paid_onboarding_update_conflict: 'The paid onboarding record changed or could not be updated. Reload and try again.',
  lead_update_conflict: 'The linked client record changed or could not be updated. Reload and try again.',
  baseline_request_failed: 'Could not load or update baseline setup. Please retry.',
  no_business_type: 'Add a business category before starting the baseline.',
  no_location: 'Add a primary location before starting the baseline.',
};

/** One client-side request shape and one useful error path for every paid-baseline entry point. */
export async function invokePaidBaseline(
  action: string,
  leadId: string,
  extra: Record<string, unknown> = {},
): Promise<PaidBaseline> {
  const { data, error } = await supabase.functions.invoke('paid-baseline', {
    body: { action, lead_id: leadId, ...extra },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let detail = '';
    /* ⛔ THE SERVER'S OWN SENTENCE, KEPT SEPARATE FROM THE TOKEN. A refusal that can name the
       specific number ("…exactly 20 questions, and 19 were approved") puts it in `detail`;
       `error` is the machine token FRIENDLY_ERRORS keys on. Showing the token instead of the
       sentence throws away the half that tells the operator what to do.
       ⚠️ Assigned, never thrown from inside the try below — that catch exists to swallow a
       non-JSON body and would swallow the throw with it. */
    let sentence = '';
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: unknown; detail?: unknown; message?: unknown };
        if (typeof payload?.detail === 'string' && payload.detail.trim()) sentence = payload.detail.trim();
        detail = typeof payload?.error === 'string'
          ? payload.error
          : typeof payload?.message === 'string' ? payload.message : '';
      } catch { /* retain the SDK error when the response is not JSON */ }
    }
    if (sentence) throw new Error(sentence);
    if (detail) throw new Error(FRIENDLY_ERRORS[detail] ?? detail);
    throw new Error(error.message || 'Could not update the baseline');
  }
  if (!data?.ok) throw new Error(data?.error || 'Could not update the baseline');
  return data.baseline as PaidBaseline;
}
