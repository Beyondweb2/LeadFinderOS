import { supabase } from '@/integrations/supabase/client';

function getSessionId(): string {
  const key = 'funnel_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function trackFunnelEvent(eventType: 'guest_search_performed' | 'trial_started', isGuest: boolean) {
  try {
    await supabase.from('funnel_analytics').insert({
      event_type: eventType,
      session_id: getSessionId(),
      is_guest_user: isGuest,
    });
  } catch (err) {
    console.error('Funnel tracking error:', err);
  }
}
