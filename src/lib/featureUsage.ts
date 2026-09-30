import { supabase } from '@/integrations/supabase/client';

/* FEATURE USAGE EVENTS (Admin control centre, release 5, 2026-09-30).
   Only for the four features that leave no row of their own — everything else is counted from the
   rows it already writes (SQL admin_feature_usage). A USEFUL action, never a click: the call script
   shown for a lead, a LinkedIn / email script copied, Focus Mode opened. The database keeps at most one
   per person, feature, lead and London day, and the signed-in user is the only possible author.
   Fire-and-forget: a failed log must never get in the way of the work. */
export type TrackedFeature = 'focus_mode' | 'call_script' | 'linkedin_script' | 'email_script';

export function logFeatureUse(feature: TrackedFeature, leadId?: string | null): void {
  try {
    void supabase.rpc('log_feature_event' as never, { _feature: feature, _lead_id: leadId ?? null } as never).then(() => {}, () => {});
  } catch { /* never block the work */ }
}
