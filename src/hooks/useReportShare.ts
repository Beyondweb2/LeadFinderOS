import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { reportShareStatus, type ReportLinkEvent, type ReportOpenFacts } from '@/lib/reportShare';

// report_link_events is newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const reportShareKey = (leadId: string, auditId: string | null) => ['report-share', leadId, auditId] as const;

/** One report's shared / opened state for the prospect workspace. Two small reads, under the caller's
 *  own RLS (a salesperson sees only their own leads' events and hook audits). */
export function useReportShare(leadId: string, auditId: string | null) {
  return useQuery({
    queryKey: reportShareKey(leadId, auditId),
    enabled: !!leadId && !!auditId,
    staleTime: 30_000,
    queryFn: async () => {
      const [ev, au] = await Promise.all([
        sb.from('report_link_events').select('audit_id, kind, channel, actor_user_id, template_name, created_at')
          .eq('lead_id', leadId).eq('audit_id', auditId).order('created_at', { ascending: true }).limit(200),
        sb.from('ai_audits').select('first_opened_at, open_count').eq('id', auditId).maybeSingle(),
      ]);
      if (ev.error) throw ev.error;
      if (au.error) throw au.error;
      return reportShareStatus((ev.data ?? []) as ReportLinkEvent[], auditId, (au.data ?? null) as ReportOpenFacts);
    },
  });
}
