import { EdgeFunctionError, invokeEdge } from '@/lib/edgeInvoke';
import type { PaidBaselineStatus } from './paidBaselineState';
import type { DiscoveryProgress, QuestionProgress } from './discoveryProgress';
import type { EngineTally } from './discoveryOpportunity';
import type { HookReplacement, Recommendation } from './baselineRecommendation';
import type { QualityIssue } from './baselineQuality';
import type { MeasurementState } from './measurementHealth';

export type PaidBaseline = {
  onboarding_id: string;
  lead_id: string;
  business_name: string;
  business_type: string;
  location: string;
  services: string;
  services_list: string[];
  areas_list: string[];
  website: string;
  context_sources?: {
    service_sources?: Record<string, string[]>;
    area_sources?: Record<string, string[]>;
  };
  /** Discovery before the baseline: the pool, its Discovery audit's progress, per-question opportunity. */
  discovery?: {
    generated_at: string | null;
    pool_version?: string | null;
    pool: Array<{
      question: string; town: string | null; service: string | null; intent: string;
      opportunity?: { classification: 'named' | 'winnable' | 'possible' | 'low'; verdict?: string; reason: string; fragmentation: string; namedRuns: number; runs: number; engines?: EngineTally[]; competitors?: string[] } | null;
      /** This question's measurements in the pool's Discovery job (src/lib/discoveryProgress.ts). */
      progress?: Omit<QuestionProgress, 'question'> | null;
    }>;
    towns_failed: string[];
    /** Generated questions kept out of the pool, with why (not offered / not confirmed — serviceScope.ts). */
    rejected?: Array<{ question: string; reason: string }>;
    /** The ONE Discovery job for this pool — server-side, read back from the stored rows. */
    audit: { id: string; created_at: string | null; runs_done: number; runs_target: number; complete: boolean; progress?: Omit<DiscoveryProgress, 'by_question'> } | null;
    /** A Discovery audit that measured a different question set — shown, never attached. */
    mismatch?: { audit_id: string } | null;
    /** A start was claimed seconds ago and its audit is being created. */
    starting?: boolean;
    estimate_usd: number;
  };
  /** The Hook Audit's own questions (locked into the official baseline) and what that one run found. */
  hook?: { audit_id: string | null; created_at: string | null; questions: string[]; measures: Array<{ question: string; engines: EngineTally[] }> };
  /** The recommended official 20 (src/lib/baselineRecommendation.ts), computed on every read. */
  recommendation?: Recommendation;
  /** The approval record: Hook questions, any replaced with a reason, corrections history. */
  meta?: { approved_at?: string; hook_questions?: string[]; hook_replacements?: HookReplacement[]; corrections?: Array<{ at: string; reason: string }>; sources?: Array<{ question: string; source: string }> } | null;
  /** The approved services with duplicates merged — the service axis of the coverage summary. */
  canonical_services?: string[];
  /** What the latest crawl saw that no approved source lists — suggestions only, never measured. */
  detected?: { services: string[]; areas: string[] };
  crawl_context_at?: string | null;
  crawl_context_source?: 'run' | 'lead' | null;
  /** The Discovery scan whose stored business facts were reused as context, when one exists. */
  discovery_context?: { audit_id: string; created_at: string | null } | null;
  status: PaidBaselineStatus;
  questions: string[];
  approved_at: string | null;
  audit_id?: string;
  start_note?: string;
  /* ── 2026-10-04, fix/04-ai-measurement ─────────────────────────────────────────────────────── */
  /** The client's explicit "we do NOT offer" list (onboarding services_not_offered). */
  services_not_offered?: string[];
  /** What customers contact them for most (onboarding top_requests). */
  top_requests?: string;
  /** True only when the services are the client's own answer or a verified build fact. */
  services_client_confirmed?: boolean;
  /** Lower-ranked lists the winner does not contain — shown, never measured (clientContext.ts). */
  unconfirmed?: { services: string[]; areas: string[] };
  /** The two mandatory home-town core questions (customerQuestion.ts). */
  core_questions?: string[];
  /** The final-20 checks for the stored draft (baselineQuality.ts). */
  quality?: { blocking: QualityIssue[]; warnings: QualityIssue[]; coverage: { servicesCovered: number; servicesTotal: number; coreHome: number }; override_min_reason: number };
  /** The baseline measurement's health (measurementHealth.ts). */
  health?: (HealthLine & { audit_id: string | null; frozen_at: string | null; retry_rounds?: number }) | null;
  /** The day-28 replay, its health and whether its results were sent. */
  remeasure?: { audit_id: string; results_sent_at: string | null; health: (HealthLine & { frozen_at: string | null }) | null } | null;
  /** The audit budget pools (auditBudget.ts) — whether client measurement has room today. */
  budget?: {
    pools: Array<{ pool: 'guarantee' | 'client' | 'prospecting'; spentUsd: number | null; capUsd: number; pooledLedger: boolean; apifyReservePct: number; decision: { allowed: boolean; reason: string; message: string } | null }>;
    apify: { usedUsd: number | null; capUsd: number | null; pct: number | null; capturedAt: string | null; cycleEnd: string | null } | null;
  } | null;
};

export interface HealthLine { state: MeasurementState; expected: number; answered: number; missing: number; retryable: number; label: string; action: string | null }

const FRIENDLY_ERRORS: Record<string, string> = {
  onboarding_id_or_lead_id_required: 'Baseline needs a linked client lead.',
  paid_onboarding_not_found: 'This client has no onboarding answers yet. Use Complete onboarding manually on the client page first.',
  lead_not_found: 'The linked client lead could not be found.',
  location_services_and_business_type_required: 'Add a location, service, and business category before saving client context.',
  location_and_business_type_required: 'Add a primary location and business category before saving client context.',
  questions_must_be_between_1_and_40: 'Add between 1 and 40 questions before saving.',
  questions_required: 'Add at least one question before approving the baseline.',
  baseline_question_count: 'A paid baseline is exactly 20 questions. Adjust the set before approving.',
  baseline_context_incomplete: 'Complete the client context (section A) and save it before approving.',
  baseline_questions_locked: 'The approved question set is frozen and cannot be edited.',
  question_generation_failed: 'Question generation failed. Please retry.',
  no_questions_generated: 'No usable questions were generated. Please retry.',
  baseline_state_changed: 'Baseline setup changed in another session. Reload it and try again.',
  paid_onboarding_update_conflict: 'The paid onboarding record changed or could not be updated. Reload and try again.',
  lead_update_conflict: 'The linked client record changed or could not be updated. Reload and try again.',
  baseline_request_failed: 'Could not load or update baseline setup. Please retry.',
  baseline_start_refused: 'The baseline could not start. Check the client context and try again.',
  baseline_start_failed: 'The baseline did not start. The approved questions are kept; try again.',
  no_business_type: 'Add a business category before starting the baseline.',
  no_location: 'Add a primary location before starting the baseline.',
  baseline_near_duplicates: 'Some questions ask the same thing in different words. Replace them, or tick "approve anyway".',
  no_discovery_pool: 'Generate the Discovery questions first.',
  confirm_cost_required: 'Discovery asks ChatGPT and Gemini — confirm the cost on the button.',
  discovery_running: 'Discovery is still measuring the current questions. Wait for it to finish, then regenerate.',
  discovery_already_run: 'Discovery has already measured these questions. Regenerate the Discovery questions to measure again.',
  discovery_start_failed: 'Discovery did not start. Nothing was measured — try again.',
  hook_question_removed: 'A Hook Audit question is missing from the set. Keep it, or give a reason for replacing it.',
  baseline_not_reopenable: 'Only an approved baseline that has not started can be reopened.',
  correction_reason_required: 'Write why the approved questions must change.',
  opportunity_question_required: 'Type the question or intent to track.',
  opportunity_exists: 'That question is already in this client\'s backlog.',
  opportunity_not_found: 'That opportunity no longer exists. Reload and try again.',
  opportunity_ids_required: 'Choose at least one opportunity to check.',
  opportunity_check_failed: 'The check did not start. Nothing was measured — try again.',
  baseline_quality_blocked: 'Some questions must be fixed or explained before freezing — see the checks above the approve button.',
  baseline_already_measured: 'This client already has a baseline measurement; nothing new can be drafted for it.',
  no_measurement: 'There is no measurement to retry yet.',
  measurement_frozen: 'This measurement has already frozen — its answers can no longer change.',
  retry_first: 'Some missing answers can still be re-asked. Press Retry missing answers first.',
  partial_reason_required: 'Write why this measurement should be frozen with answers missing.',
  not_partial: 'Only a measurement whose missing answers cannot be re-asked can be accepted as partial.',
  no_remeasure: 'There is no re-measure for this client yet.',
  results_held: 'The four-week results were not sent — the reason is shown.',
  results_skipped: 'The four-week results were not sent — the reason is shown.',
  prospecting_budget_used: "Today's checking budget is used — your leads are still here, try tomorrow or ask Paul.",
};

/** The whole response (the opportunity actions answer with more than the baseline). */
export async function invokePaidBaselineRaw<T extends Record<string, unknown>>(action: string, leadId: string, extra: Record<string, unknown> = {}): Promise<T & { baseline: PaidBaseline }> {
  try {
    return await invokeEdge<T & { baseline: PaidBaseline }>('paid-baseline', { action, lead_id: leadId, ...extra });
  } catch (e) {
    if (e instanceof EdgeFunctionError) throw new Error(e.detail || (e.code && (FRIENDLY_ERRORS[e.code] ?? e.code)) || 'Could not update the baseline');
    throw e instanceof Error ? e : new Error('Could not update the baseline');
  }
}

/** One client-side request shape and one useful error path for every paid-baseline entry point. */
export async function invokePaidBaseline(
  action: string,
  leadId: string,
  extra: Record<string, unknown> = {},
): Promise<PaidBaseline> {
  /* Through invokeEdge (src/lib/edgeInvoke.ts): a real session first, explicit Authorization, one
     refresh-and-retry on 401, never the anon key. It throws EdgeFunctionError with the machine
     token in `code` and the server's own sentence in `detail`.
     ⛔ THE SERVER'S OWN SENTENCE WINS OVER THE TOKEN. A refusal that can name the specific number
     ("…exactly 20 questions, and 19 were approved") puts it in `detail`; `code` is what
     FRIENDLY_ERRORS keys on. Showing the token instead of the sentence throws away the half that
     tells the operator what to do. */
  try {
    const data = await invokeEdge<{ baseline: PaidBaseline }>('paid-baseline', { action, lead_id: leadId, ...extra });
    return data.baseline;
  } catch (e) {
    if (e instanceof EdgeFunctionError) {
      throw new Error(e.detail || (e.code && (FRIENDLY_ERRORS[e.code] ?? e.code)) || 'Could not update the baseline');
    }
    throw e instanceof Error ? e : new Error('Could not update the baseline');
  }
}
