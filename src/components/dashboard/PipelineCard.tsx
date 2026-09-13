import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';
import { CampaignPicker } from '@/components/CampaignPicker';
import { usePersistedState } from '@/hooks/usePersistedState';
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

  /* Persisted so "show all" survives a reload, same rule as the section collapses. */
  const [showAll, setShowAll] = usePersistedState<boolean>('dashboard.pipeline.showAll', false, { tier: 'local' });

  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.status] = (m[l.status] ?? 0) + 1;
    return m;
  }, [leads]);

  const hiddenCount = useMemo(
    () => OUTREACH_STATUS_OPTIONS.filter(o => (countByStatus[o.value] ?? 0) === 0).length,
    [countByStatus],
  );

  // Headline — active/open leads only (drop not_interested / bounced / paid).
  const activeTotal = useMemo(
    () => leads.reduce((n, l) => (HEADLINE_EXCLUDED.has(l.status) ? n : n + 1), 0),
    [leads],
  );

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-5">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
            <GitBranch className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
            <span className="truncate">Pipeline</span>
          </CardTitle>
          {/* Active-leads count inline (moved out of the body so the card is shorter,
              matching ChannelPerformanceCard's height). */}
          <span className="flex shrink-0 items-baseline gap-1">
            <span className="text-lg sm:text-xl font-bold text-blue-500 tabular-nums">{activeTotal}</span>
            <span className="text-[10px] text-muted-foreground">active</span>
          </span>
          {/* Campaign filter (default All) — right-aligned; doesn't take a full row. */}
          <CampaignPicker
            mode="filter"
            hideCreate
            value={campaignFilter}
            onChange={setCampaignFilter}
            className="ml-auto h-8 w-[150px] text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-5 md:pt-0">
        {/* Per-status breakdown — matches the Outreach status filter list (order + labels) */}
        {/* 🔴 ZERO-COUNT STATUSES ARE HIDDEN (2026-09-13, Paul's cut). It rendered all 21 options
            every time, greying the empty ones to 50% — and measured against live data, 7 of the 21
            are permanent zeroes, so a third of the card was furniture. The toggle keeps them
            reachable, because "no leads are in this status" is a real answer and hiding it with no
            way back would make the card quietly narrower than the Outreach filter it mirrors.
            ⚠️ The full list stays the SOURCE — this filters what is drawn, never what is counted,
            so the headline and the per-status numbers cannot disagree. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:gap-y-2 pt-2 border-t border-border/50">
          {OUTREACH_STATUS_OPTIONS.filter(opt => showAll || (countByStatus[opt.value] ?? 0) > 0).map(opt => {
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
        {/* Only offered when something is actually hidden — a toggle that reveals nothing is noise. */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showAll ? 'Hide empty statuses' : `Show all ${OUTREACH_STATUS_OPTIONS.length} statuses (${hiddenCount} empty)`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
