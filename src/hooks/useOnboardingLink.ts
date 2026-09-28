import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { onboardingLinkStatus, type LinkEventRow, type PageHitRow } from '@/lib/onboardingLinkStatus';
import { leadRpc, type RpcResult } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';

// The table and the page-hit reads are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const onboardingLinkKey = (leadId: string) => ['onboarding-link', leadId] as const;

/** One lead's sign-up link: when it was sent, how, and whether it was opened (one rule,
 *  src/lib/onboardingLinkStatus.ts). Both reads are RLS-scoped: a salesperson sees their own leads'. */
export function useOnboardingLink(leadId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingLinkKey(leadId ?? ''),
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const [ev, hits] = await Promise.all([
        sb.from('onboarding_link_events').select('kind, channel, actor_user_id, template_name, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(200),
        sb.from('lead_page_hits').select('page, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(500),
      ]);
      if (ev.error) throw ev.error;
      if (hits.error) throw hits.error;
      const events = (ev.data ?? []) as LinkEventRow[];
      return { events, status: onboardingLinkStatus(events, (hits.data ?? []) as PageHitRow[]) };
    },
  });
}

/** Record that the link was copied ('generated') or sent some way other than WhatsApp ('sent'). */
export async function recordOnboardingLinkEvent(leadId: string, kind: 'generated' | 'sent', channel: string | null): Promise<RpcResult> {
  const r = await leadRpc('lead_onboarding_link_event', { _lead_id: leadId, _kind: kind, _channel: channel });
  if (r.ok) notifyLeadChanged(leadId);
  return r;
}
