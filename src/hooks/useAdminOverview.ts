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
  costNotes: { unrecorded: string[] };
  commissionError: string | null;
  /** The Findable funnel (SQL admin_site_funnel); null = unreadable. */
  site: SiteFunnel | null;
  /** Google Search Console per paying client, by lead id; null = unreadable. */
  search: Record<string, SearchSummary> | null;
  /** Whether a Google service-account credential is set at all. */
  searchConfigured: boolean;
  /** The latest AI business summary (fn business-summary); null = none yet or unreadable. */
  latestSummary: {
    id: string; created_at: string; kind: 'weekly' | 'on_demand'; period_label: string; period_from: string | null; period_to: string | null;
    summary: string | null; look_at: string[] | null; status: 'ok' | 'rejected' | 'error'; reason: string | null; model: string | null;
  } | null;
  /** Background jobs (admin_job_runs); null = unreadable. */
  jobs: { job: string; lastStartedAt: string | null; lastFinishedAt: string | null; lastStatus: string | null; lastError: string | null; runs: number }[] | null;
  generatedAt: string;
  ms: number;
};

export interface PeriodChoice { key: PeriodKey; from?: string; to?: string }

type Bucket = { key: string | null; n: number };
/** One client's Search Console summary (release 5). Figures exist only when state is "populated". */
export interface SearchSummary {
  state: 'not_connected' | 'property_missing' | 'no_data' | 'error' | 'populated';
  property?: string | null; lastSyncedAt?: string | null; lastError?: string | null;
  window?: { from: string; to: string };
  clicks?: number; impressions?: number; ctr?: number | null; position?: number | null;
  previous?: { clicks: number; impressions: number } | null;
  dataFrom?: string | null;
  topPages?: { path: string; clicks: number; impressions: number }[];
}
/** What SQL admin_site_funnel returns (release 5). Browser counts are SESSIONS; server counts are rows. */
export interface SiteFunnel {
  tracking_since: string | null;
  sessions: number; page_views: number; internal_sessions: number;
  free_check_started: number; onboarding_started: number; checkout_started_browser: number;
  free_check_submitted: number; free_check_completed: number; signup_forms: number;
  checkout_sessions: number; checkout_sessions_unattributed?: number; checkout_refused: number; paid: number;
  landing_pages: Bucket[]; referrers: Bucket[]; campaigns: Bucket[]; devices: Bucket[]; top_pages: Bucket[];
}

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
