import { supabase } from '@/integrations/supabase/client';

export type OutreachType = 'call' | 'whatsapp' | 'sms' | 'email' | 'facebook' | 'manual';

/**
 * Fire-and-forget outreach action logger.
 * Records every contact action with its type for dashboard metrics.
 */
export async function logOutreachAction(
  userId: string,
  leadId: string,
  type: OutreachType
) {
  try {
    await supabase.from('outreach_logs' as any).insert({
      user_id: userId,
      lead_id: leadId,
      outreach_type: type,
    });
  } catch (e) {
    console.error('[outreach-log] Failed:', e);
  }
}
