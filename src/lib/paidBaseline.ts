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
  status: 'needs_questions' | 'needs_approval' | 'approved' | 'running' | 'complete' | 'failed';
  questions: string[];
  approved_at: string | null;
  audit_id?: string;
};

const FRIENDLY_ERRORS: Record<string, string> = {
  onboarding_id_or_lead_id_required: 'Baseline needs a linked client lead.',
  paid_onboarding_not_found: 'Baseline onboarding record could not be found.',
  lead_not_found: 'The linked client lead could not be found.',
  location_services_and_business_type_required: 'Add a location, service, and business category before saving client context.',
  questions_must_be_between_1_and_40: 'Add between 1 and 40 questions before saving.',
  questions_required: 'Add at least one question before approving the baseline.',
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
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        detail = typeof payload?.error === 'string'
          ? payload.error
          : typeof payload?.message === 'string' ? payload.message : '';
      } catch { /* retain the SDK error when the response is not JSON */ }
    }
    if (detail) throw new Error(FRIENDLY_ERRORS[detail] ?? detail);
    throw new Error(error.message || 'Could not update the baseline');
  }
  if (!data?.ok) throw new Error(data?.error || 'Could not update the baseline');
  return data.baseline as PaidBaseline;
}
