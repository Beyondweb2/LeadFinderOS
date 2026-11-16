/* QUICK CHECK — the one automatic retry (Paul, 2026-11-16; the rule is src/lib/quickCheckRetry.ts).
   Called from process-ai-audit-queue's tick. Finds Quick checks whose run failed because the provider did not finish,
   30+ minutes ago, never retried, and re-opens the SAME run: the run back to 'running' (stamped results.late_retry, so it
   is never retried twice), each failed ask back to 'pending' with one start left. The queue's own start path then runs it
   inside every normal budget limit (pool caps, the Apify reserve, the paid-action mode). Nothing here touches the rep's
   sales check item or allowance (counted once), starts a new audit, or contacts anyone.
   Best-effort: a failure here never fails the tick. */
import { LATE_RETRY_AFTER_MS, LATE_RETRY_MAX_AGE_MS, LATE_RETRY_PER_SWEEP, lateRetryVerdict, reopenPatch, type RetryRow } from "../../../src/lib/quickCheckRetry.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/** The verdict for one audit, read from the database. null = could not be read. */
export async function readRetryVerdict(service: Service, auditId: string, nowMs = Date.now()) {
  const { data: audit } = await service.from("ai_audits")
    .select("id, lead_id, created_at, audit_purpose, baseline_target_runs, is_market, is_measurement").eq("id", auditId).maybeSingle();
  if (!audit) return null;
  const { data: runs } = await service.from("ai_audit_runs").select("id, status, results").eq("audit_id", auditId);
  const rs = (runs ?? []) as Array<{ id: string; status: string; results: Record<string, unknown> | null }>;
  const { data: rows } = await service.from("ai_audit_queue").select("status, result, updated_at").eq("audit_id", auditId).limit(10);
  let newerAudit = false;
  if (audit.lead_id) {
    const { data: newer } = await service.from("ai_audits").select("id").eq("lead_id", audit.lead_id).gt("created_at", audit.created_at).limit(1);
    newerAudit = Array.isArray(newer) && newer.length > 0;
  }
  return { audit, runs: rs, verdict: lateRetryVerdict({ audit, runs: rs, rows: (rows ?? []) as RetryRow[], newerAudit, nowMs }) };
}

/** One sweep: re-opens the Quick checks due their one retry. Returns how many were re-opened. Never throws. */
export async function sweepLateRetries(service: Service, maxAttempts: number): Promise<number> {
  let reopened = 0;
  try {
    const now = Date.now();
    const since = new Date(now - LATE_RETRY_MAX_AGE_MS - 60 * 60 * 1000).toISOString(); // runs are created before they fail
    const { data: failed } = await service.from("ai_audit_runs").select("id, audit_id")
      .eq("status", "failed").gte("created_at", since).lte("created_at", new Date(now - LATE_RETRY_AFTER_MS).toISOString())
      .is("results->late_retry", null).order("created_at", { ascending: true }).limit(50);
    for (const r of (failed ?? []) as Array<{ id: string; audit_id: string }>) {
      if (reopened >= LATE_RETRY_PER_SWEEP) break;
      const read = await readRetryVerdict(service, r.audit_id, now);
      if (!read || read.verdict.kind !== "retry_now") continue;
      const run = read.runs.find((x) => x.id === r.id);
      if (!run) continue;
      const patch = reopenPatch(run, "provider_did_not_finish", new Date().toISOString(), maxAttempts);
      /* The claim: only a run STILL failed and STILL unstamped is re-opened, so two ticks never retry it twice. */
      const { data: claimed, error } = await service.from("ai_audit_runs").update(patch.run)
        .eq("id", r.id).eq("status", "failed").is("results->late_retry", null).select("id");
      if (error || !Array.isArray(claimed) || !claimed.length) continue;
      const { error: qErr } = await service.from("ai_audit_queue").update(patch.row).eq("run_id", r.id).eq("status", "failed");
      if (qErr) console.error(`[quick-check-retry] asks not re-queued for run ${r.id}:`, qErr.message);
      reopened++;
      console.log(`[quick-check-retry] re-opened Quick check run ${r.id} (audit ${r.audit_id}) for its one automatic retry`);
    }
  } catch (e) {
    console.error("[quick-check-retry] sweep failed (non-blocking):", e instanceof Error ? e.message : e);
  }
  return reopened;
}
