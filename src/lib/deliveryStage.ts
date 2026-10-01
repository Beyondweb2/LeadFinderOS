/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHERE IS THIS CLIENT, AND WHAT IS THE ONE NEXT STEP?  (2026-10-02, docs/paid-client-automation.md)

   The delivery pipeline, read from what already exists — never a stored stage (derived, never stored:
   CLAUDE.md §6). Each stage is proven by its own evidence, furthest first:

     Setup → Ready for delivery → Discovery → Baseline questions → Baseline → Build / Optimise
       → Launched → Remeasure                                   (+ Ended: refunded / service ended)

   ⛔ ONE NEXT STEP, NEVER FIVE. Every client gets exactly one `next`, and it is either Paul's to do
   (an action) or someone else's to give (a wait). A legacy client already past setup is placed by its
   real progress — the setup checklist never drags an in-delivery client back to "Waiting for client".
   ⛔ DISCOVERY IS MANUAL AND COMES FIRST (Paul, 2026-10-02): crawl → Discovery → proposed questions →
   approve & freeze → baseline. A question set drafted before any Discovery points at "Run Discovery",
   never at "Approve" — the recommendation needs Discovery's findings.
   Pure. ⚠️ Edge-reachable (paid-client-hub, stripe-webhook): relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { WAITING_ON_LABEL, type HandoffReadiness } from './handoffReadiness.ts';
import { hubBaselineStatus } from './paidBaselineState.ts';
import { weeklyStart } from './weeklyCheck.ts';

export type DeliveryStage = 'setup' | 'ready' | 'discovery' | 'questions' | 'baseline' | 'build' | 'launched' | 'remeasure' | 'ended';
export const DELIVERY_STAGES: readonly DeliveryStage[] = ['setup', 'ready', 'discovery', 'questions', 'baseline', 'build', 'launched', 'remeasure'];
export const DELIVERY_STAGE_LABEL: Record<DeliveryStage, string> = {
  setup: 'Setup', ready: 'Ready for delivery', discovery: 'Discovery', questions: 'Baseline questions', baseline: 'Baseline',
  build: 'Build / optimise', launched: 'Launched', remeasure: 'Remeasure', ended: 'Ended',
};

/** The client-hub section a next step opens (ClientHub `?section=`). */
export type HubSection = 'setup' | 'evidence' | 'baseline' | 'build' | 'remeasure' | 'results';

export interface NextStep {
  key: string;
  label: string;
  /** true = Paul acts; false = waiting on someone else (sales / client / a running job). */
  action: boolean;
  section: HubSection;
}

/** What the badge says: who it waits on, READY FOR DELIVERY, or IN DELIVERY · <stage>. */
export type DeliveryState = 'waiting_sales' | 'waiting_client' | 'waiting_findable' | 'ready' | 'in_delivery' | 'ended';

export interface DiscoverySummary {
  /** A question pool was generated (baseline_discovery.pool). */
  generated: boolean;
  /** The Discovery measurement was started (baseline_discovery.audit_id). */
  started: boolean;
  /** Its runs have all finished (none pending / running). */
  finished: boolean;
}

export interface StageInput {
  readiness: HandoffReadiness;
  lead: {
    status?: string | null;
    delivery_submitted_at?: string | null;
    baseline_audit_id?: string | null;
    remeasure_due_date?: string | null;
    remeasure_audit_id?: string | null;
    remeasure_results_sent_at?: string | null;
    service_terminated_at?: string | null;
    delivery_checklist?: Record<string, unknown> | null;
    website_build?: { production_url?: string | null; production_status?: string | null; qa?: { production_checked?: boolean | null } | null } | null;
  };
  onboarding: { baseline_status?: string | null } | null;
  /** The baseline audit row, when the lead points at one (completion lives there). */
  baselineAudit: { baseline_completed_at?: string | null } | null;
  discovery: DiscoverySummary;
  route: 'build' | 'optimise' | null;
  implementedOpportunities?: number;
  /** YYYY-MM-DD, London, for the remeasure clock. */
  today: string;
}

export interface StageResult {
  stage: DeliveryStage;
  stageLabel: string;
  state: DeliveryState;
  stateLabel: string;
  next: NextStep;
  /** The required setup items still missing (labels) — shown only while in setup. */
  missing: string[];
}

const step = (key: string, label: string, action: boolean, section: HubSection): NextStep => ({ key, label, action, section });
/** The remeasure stage starts this many days before the due date (the hub's amber window). */
const REMEASURE_STAGE_DAYS = 7;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The first missing setup item, as one next step. Sales first, then Findable's own prep, then the client. */
function setupStep(r: HandoffReadiness): NextStep {
  const miss = r.items.filter((i) => i.required && !i.ok);
  const sales = miss.find((i) => i.who === 'sales');
  if (sales) return step('complete_handoff', sales.key === 'sales_handoff' ? 'Complete sales handoff' : `Sales: add ${sales.label.toLowerCase()}`, false, 'setup');
  const crawl = miss.find((i) => i.key === 'crawl');
  if (crawl) return step('crawl', 'Crawl website', true, 'evidence');
  const gbp = miss.find((i) => i.key === 'gbp_access' && i.who === 'findable');
  const client = miss.filter((i) => i.who === 'client');
  if (client.length) return step('wait_client', `Waiting for client: ${client.map((i) => i.label).slice(0, 3).join(', ')}${client.length > 3 ? '…' : ''}`, false, 'setup');
  if (gbp) return step('confirm_gbp', 'Confirm GBP access arrived', true, 'setup');
  const other = miss[0];
  if (other) return step('fix', other.label, true, 'setup');
  return step('submit', 'Submit for delivery', true, 'setup');
}

export function deliveryStage(i: StageInput): StageResult {
  const r = i.readiness;
  const L = i.lead;
  const result = (stage: DeliveryStage, next: NextStep, state?: DeliveryState): StageResult => {
    const st: DeliveryState = state ?? (stage === 'ended' ? 'ended' : 'in_delivery');
    const stateLabel = st === 'ended' ? 'ENDED' : st === 'ready' ? 'READY FOR DELIVERY' : st === 'in_delivery' ? `IN DELIVERY · ${DELIVERY_STAGE_LABEL[stage].toUpperCase()}`
      : st === 'waiting_sales' ? WAITING_ON_LABEL.sales : st === 'waiting_client' ? WAITING_ON_LABEL.client : WAITING_ON_LABEL.findable;
    return { stage, stageLabel: stage === 'build' ? (i.route === 'build' ? 'Build' : i.route === 'optimise' ? 'Optimise' : DELIVERY_STAGE_LABEL.build) : DELIVERY_STAGE_LABEL[stage], state: st, stateLabel, next, missing: stage === 'setup' ? r.missing : [] };
  };

  if (L.service_terminated_at || L.status === 'refunded') return result('ended', step('none', L.status === 'refunded' ? 'Refunded — nothing to do' : 'Service ended — nothing to do', false, 'setup'));

  const baseline = hubBaselineStatus(i.onboarding, L.baseline_audit_id ? (i.baselineAudit ?? {}) : null);
  const baselineDone = baseline === 'complete' || !!i.baselineAudit?.baseline_completed_at;

  // Remeasure: the replay exists, or its date is near / past.
  const due = (L.remeasure_due_date ?? '').slice(0, 10);
  if (baselineDone && (L.remeasure_audit_id || (due && daysBetween(i.today, due) <= REMEASURE_STAGE_DAYS))) {
    if (L.remeasure_results_sent_at) return result('remeasure', step('done', 'Results sent', false, 'results'));
    if (L.remeasure_audit_id) return result('remeasure', step('send_results', 'Remeasure done — send results', true, 'results'));
    return result('remeasure', step('remeasure', daysBetween(i.today, due) <= 0 ? 'Remeasure due — it runs automatically' : `Remeasure on ${due}`, false, 'remeasure'));
  }
  if (baselineDone) {
    const live = weeklyStart({ route: i.route, websiteBuild: L.website_build ?? null, checklist: L.delivery_checklist ?? null, implementedOpportunities: i.implementedOpportunities ?? 0 }).ok;
    if (live) return result('launched', step('wait_remeasure', due ? `Remeasure on ${due}` : 'Remeasure not scheduled', false, 'remeasure'));
    const ws = L.website_build ?? null;
    if (i.route === 'build') return result('build', ws?.production_url ? step('verify_launch', 'Verify the live site', true, 'build') : step('build', 'Build website', true, 'build'));
    return result('build', step('optimise', 'Optimise their site and mark it live', true, 'build'));
  }
  if (baseline === 'starting' || baseline === 'running') return result('baseline', step('wait_baseline', 'Baseline running', false, 'baseline'));
  if (baseline === 'approved') return result('baseline', step('run_baseline', 'Run baseline', true, 'baseline'));

  // Before the baseline: Discovery → questions. A legacy draft without Discovery still runs Discovery first.
  const d = i.discovery;
  if (d.started && !d.finished) return result('discovery', step('wait_discovery', 'Discovery running', false, 'baseline'));
  if (d.started && d.finished) return result('questions', step('review_questions', 'Review questions — approve & freeze', true, 'baseline'));
  if (d.generated) return result('discovery', step('run_discovery', 'Run Discovery', true, 'baseline'));

  // Setup until every required item is in AND the client is submitted for delivery.
  if (r.ready && L.delivery_submitted_at) return result('ready', step('run_discovery', 'Run Discovery', true, 'baseline'), 'ready');
  if (r.ready) return result('setup', step('submit', 'Submit for delivery', true, 'setup'), 'ready');
  const waiting: DeliveryState = r.waitingOn === 'sales' ? 'waiting_sales' : r.waitingOn === 'client' ? 'waiting_client' : 'waiting_findable';
  return result('setup', setupStep(r), waiting);
}

/** Paid Clients filter buckets. */
export type ClientFilter = 'all' | 'attention' | 'ready' | 'in_delivery';
export function matchesFilter(s: Pick<StageResult, 'state' | 'next'>, f: ClientFilter): boolean {
  if (f === 'all') return true;
  if (f === 'ready') return s.state === 'ready';
  if (f === 'in_delivery') return s.state === 'in_delivery';
  // Needs attention: Paul has an action to take, or the client is stuck waiting on someone.
  return s.state === 'waiting_sales' || s.state === 'waiting_client' || s.state === 'waiting_findable' || (s.state === 'in_delivery' && s.next.action);
}

/** Summarise baseline_discovery (onboarding_responses) + the Discovery audit's run statuses. */
export function discoverySummary(store: unknown, runStatuses: readonly (string | null | undefined)[]): DiscoverySummary {
  const s = (store && typeof store === 'object' ? store : {}) as { pool?: unknown; audit_id?: unknown };
  const generated = Array.isArray(s.pool) && s.pool.length > 0;
  const started = typeof s.audit_id === 'string' && s.audit_id.length > 0;
  // POSITIVE: only a terminal status is finished (live statuses 2026-10-02); an unknown one is still running.
  const DONE = new Set(['complete', 'capped', 'failed', 'cancelled']);
  const finished = started && runStatuses.length > 0 && runStatuses.every((x) => DONE.has(String(x ?? '')));
  return { generated, started, finished };
}
