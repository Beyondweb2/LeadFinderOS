import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCampaigns } from '@/hooks/useCampaigns';
import { lfosReportUrl, reportStyleOf, type ReportStyle } from '@/lib/reportBrand';
import { shortReportUrl } from '@/lib/reportSlug';

/* REPORT STYLE IN THE APP (Paul, 2026-11-15; src/lib/reportBrand.ts). The copy / open report buttons hand over the link the lead
   gets: app.leadfinderos.com/r/<code> for a LeadFinderOS-style campaign, findable.live/r/<code> otherwise. Unknown = Findable. */

/** The style of a campaign, from the campaigns list the app already holds (RLS decides which a person can see). */
export function useCampaignReportStyle(campaignId: string | null | undefined): ReportStyle {
  const { allCampaigns } = useCampaigns();
  if (!campaignId) return 'findable';
  return reportStyleOf(allCampaigns.find((c) => c.id === campaignId) as { report_style?: string | null } | undefined);
}

/** The style for a lead id, for admin pages that hold only the audit's lead id (reads the lead's campaign_id). */
export function useLeadReportStyle(leadId: string | null | undefined): ReportStyle {
  const q = useQuery({
    queryKey: ['lead-campaign-id', leadId ?? null],
    enabled: !!leadId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('outreach_leads').select('campaign_id').eq('id', leadId as string).maybeSingle();
      return ((data as { campaign_id?: string | null } | null)?.campaign_id) ?? null;
    },
  });
  return useCampaignReportStyle(q.data ?? null);
}

/** The short report link for a code in a style. */
export function reportLinkFor(code: string, style: ReportStyle): string {
  return style === 'leadfinderos' ? lfosReportUrl(code) : shortReportUrl(code);
}
