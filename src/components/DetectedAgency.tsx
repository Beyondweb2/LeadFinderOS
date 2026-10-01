import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { agencyCheckDomain, type AgencyCheckRow } from '@/lib/agencyCheck';
import { SiteManagementCell } from '@/components/SiteManagementCell';

/* ══ "DETECTED: AGENCY LIKELY · 92%" ON THE LEAD (2026-10-01) ═════════════════════════════════════
   The machine's answer for the lead's website (website_agency_checks, from Find Leads), beside the
   person's answer. Shown only while the person has not said who runs the site. ⛔ The machine never sets
   "Agency runs their site": Confirm agency / Not agency are the person's taps, saved through the same
   lead_set_website_control as every other website-control choice (History records them). */
// website_agency_checks is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function DetectedAgency({ website, websiteControl, onConfirm, onReject }: {
  website: string | null; websiteControl: string | null;
  onConfirm: () => void; onReject: () => void;
}) {
  const domain = agencyCheckDomain(website);
  const q = useQuery({
    queryKey: ['agency-check', domain],
    enabled: !!domain,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AgencyCheckRow | null> => {
      const { data, error } = await sb.from('website_agency_checks').select('domain, website, classification, confidence, agency, agency_domain, evidence, platform, status, failure_reason, pages_checked, version, checked_at').eq('domain', domain).maybeSingle();
      if (error) throw error;
      return (data ?? null) as AgencyCheckRow | null;
    },
  });
  const row = q.data;
  const undecided = !websiteControl || websiteControl === 'unknown';
  if (!row || row.classification !== 'agency_likely' || !undecided) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2" data-testid="detected-agency">
      <Building2 className="h-4 w-4 shrink-0 text-amber-600" />
      {/* The pill opens the evidence; it IS the "Agency likely · 92%" (drawn once). */}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs"><span className="font-semibold">Detected:</span>
        <SiteManagementCell row={row} checking={false} hasWebsite />
        {row.agency ? <span className="text-muted-foreground">{row.agency}</span> : null}</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onConfirm} data-testid="detected-agency-confirm">Confirm agency</Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReject} data-testid="detected-agency-reject">Not agency</Button>
    </div>
  );
}
