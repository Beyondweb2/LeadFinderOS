import { supabase } from '@/integrations/supabase/client';

/**
 * Log an outreach contact to outreach_logs table.
 * Non-blocking — fire and forget.
 */
export function logOutreachContact(
  leadId: string | null,
  outreachType: 'call' | 'whatsapp' | 'sms' | 'email' | 'manual' | 'facebook'
) {
  supabase
    .from('outreach_logs')
    .insert({
      lead_id: leadId,
      outreach_type: outreachType,
      user_id: '', // will be set by RLS / trigger — but we need it for the insert
    })
    .then(({ error }) => {
      if (error) console.error('outreach_logs insert failed:', error);
    });
}

/**
 * Version that gets user_id from auth first (needed since RLS requires user_id match).
 */
export async function logOutreachContactAsync(
  leadId: string | null,
  outreachType: 'call' | 'whatsapp' | 'sms' | 'email' | 'manual' | 'facebook'
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('outreach_logs')
    .insert({
      lead_id: leadId,
      outreach_type: outreachType,
      user_id: user.id,
    });

  if (error) console.error('outreach_logs insert failed:', error);
}
