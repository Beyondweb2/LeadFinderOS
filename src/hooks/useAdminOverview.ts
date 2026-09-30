import { useQuery } from '@tanstack/react-query';
import { invokeEdge } from '@/lib/edgeInvoke';
import type { AdminOverview } from '@/lib/adminMetrics';
import type { PeriodKey } from '@/lib/reportingPeriod';

/** What fn admin-overview returns: the fold plus the notes the page prints beside the numbers. */
export type AdminOverviewResponse = AdminOverview & {
  ok: true;
  build: string;
  exclusionNote: string;
  exclusions: { kind: string; reason: string | null }[];
  costNotes: { unrecorded: string[]; usdToGbp: number };
  commissionError: string | null;
  generatedAt: string;
  ms: number;
};

export interface PeriodChoice { key: PeriodKey; from?: string; to?: string }

/** The Admin control centre's numbers — server-folded (fn admin-overview), never the whole book in
 *  the browser. Cached for five minutes; Refresh refetches. */
export function useAdminOverview(choice: PeriodChoice, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-overview', choice.key, choice.from ?? null, choice.to ?? null],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => invokeEdge<AdminOverviewResponse>('admin-overview', { period: choice.key, from: choice.from, to: choice.to }),
  });
}
