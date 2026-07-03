import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';
import { CampaignPicker } from '@/components/CampaignPicker';
import { PipelineStatusBadge } from '@/components/PipelineStatusBadge';
import { OUTREACH_STATUS_OPTIONS, type OutreachLead, type PipelineStatus } from '@/types/outreach';

interface PipelineCardProps {
  allLeads: OutreachLead[];
}

// Terminal / non-open statuses — excluded from the "Active leads" headline, but
// still shown as their own rows in the per-status breakdown below.
const HEADLINE_EXCLUDED = new Set<string>(['not_interested', 'bounced', 'payment_received']);

/**
 * Pipeline card — per-status counts matching the Outreach status filter list
 * (OUTREACH_STATUS_OPTIONS, same order + labels), with a campaign filter (default
 * All). Counts are computed client-side from the RLS-scoped `allLeads` so switching
 * campaigns is instant. Headline = active/open leads in the selected campaign.
 */
export function PipelineCard({ allLeads }: PipelineCardProps) {
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);

  const leads = useMemo(
    () => allLeads.filter(l => !l.is_archived && (!campaignFilter || l.campaign_id === campaignFilter)),
    [allLeads, campaignFilter],
  );

  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.status] = (m[l.status] ?? 0) + 1;
    return m;
  }, [leads]);

  // Headline — active/open leads only (drop not_interested / bounced / paid).
  const activeTotal = useMemo(
    () => leads.reduce((n, l) => (HEADLINE_EXCLUDED.has(l.status) ? n : n + 1), 0),
    [leads],
  );

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
            <GitBranch className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
            <span className="truncate">Pipeline</span>
          </CardTitle>
          {/* Campaign filter (default All) — right-aligned in the header so it
              doesn't take a full row (keeps the card height near ChannelPerformanceCard). */}
          <CampaignPicker
            mode="filter"
            hideCreate
            value={campaignFilter}
            onChange={setCampaignFilter}
            className="ml-auto h-8 w-[150px] text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Headline — active/open leads in the selected campaign */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-500">{activeTotal}</div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Active leads</p>
        </div>

        {/* Per-status breakdown — matches the Outreach status filter list (order + labels) */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:gap-y-2 pt-2 border-t border-border/50">
          {OUTREACH_STATUS_OPTIONS.map(opt => {
            const n = countByStatus[opt.value] ?? 0;
            return (
              <div key={opt.value} className={`flex items-center justify-between gap-2 ${n === 0 ? 'opacity-50' : ''}`}>
                {/* Coloured status pill (same badge + label as the Outreach page). */}
                <PipelineStatusBadge status={opt.value as PipelineStatus} compact />
                <span className={`shrink-0 text-xs sm:text-sm font-semibold ${n > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                  {n}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
