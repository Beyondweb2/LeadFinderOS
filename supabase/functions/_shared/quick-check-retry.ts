/* AUDITS HEAL THEMSELVES — the sweep (Paul, 2026-11-19, v1-audits-self-healing; the rule is src/lib/auditSelfHeal.ts).
   Replaces the Quick check's one retry (16 Nov). Called from process-ai-audit-queue's tick, every other minute. Finds
   ordinary audits that finished incomplete because the AI search did not answer and re-opens the SAME run for the next
   round (30 min, 2 h, 6 h after it settled): the run back to 'running', an ask that failed outright back to 'pending'
   with one start left, an ask that came back partial back to 'running' with only its missing engines as lanes. The
   queue's own start path runs them inside every normal budget limit (pool caps, the Apify reserve, the paid-action mode)
   and the slot scheduler. After the last round it writes the plain give-up reason. Nothing here touches a rep's
   allowance, starts a new audit, or contacts anyone. Best-effort: a failure here never fails the tick. */
import { HEAL_DELAYS_MS, HEAL_GRACE_MS, HEAL_META_KEY, HEAL_PER_SWEEP, giveUpPatch, healReopenPlan, healVerdict, type HealRow } from "../../../src/lib/auditSelfHeal.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/** The verdict for one audit, read from the database. null = could not be read. */
export async function readRetryVerdict(service: Service, auditId: string, nowMs = Date.now()) {
  const { data: audit } = await service.from("ai_audits")
    .select("id, lead_id, created_at, audit_purpose, baseline_target_runs, is_market, is_measurement").eq("id", auditId).maybeSingle();
  if (!audit) return null;
  const { data: runs } = await service.from("ai_audit_runs").select("id, status, results").eq("audit_id", auditId);
  const rs = (runs ?? []) as Array<{ id: string; status: string; results: Record<string, unknown> | null }>;
  const { data: rows } = await service.from("ai_audit_queue").select("id, status, result, updated_at").eq("audit_id", auditId).limit(20);
  let newerAudit = false;
  if (audit.lead_id) {
    const { data: newer } = await service.from("ai_audits").select("id").eq("lead_id", audit.lead_id).gt("created_at", audit.created_at).limit(1);
    newerAudit = Array.isArray(newer) && newer.length > 0;
  }
  const qrows = (rows ?? []) as HealRow[];
  return { audit, runs: rs, rows: qrows, verdict: healVerdict({ audit, runs: rs, rows: qrows, newerAudit, nowMs }) };
}

/** One sweep: re-opens the audits due their next heal round, and stamps the ones that just gave up. Returns how many
 *  were re-opened. Never throws. */
export async function sweepSelfHeal(service: Service, maxAttempts: number): Promise<number> {
  let reopened = 0;
  try {
    const now = Date.now();
    /* Candidates: asks that settled failed, or partial (an engine missing), inside the window the rounds can reach. */
    const windowMs = HEAL_DELAYS_MS.reduce((a, b) => a + b, 0) + HEAL_GRACE_MS + 2 * 60 * 60_000;
    const since = new Date(now - windowMs).toISOString();
    const before = new Date(now - HEAL_DELAYS_MS[0]).toISOString();
    const { data: cands } = await service.from("ai_audit_queue").select("audit_id")
      .gte("updated_at", since).lte("updated_at", before)
      .or("status.eq.failed,result->_missing_engines.not.is.null")
      .order("updated_at", { ascending: true }).limit(300);
    const auditIds = [...new Set(((cands ?? []) as Array<{ audit_id: string }>).map((c) => c.audit_id))];
    for (const auditId of auditIds) {
      if (reopened >= HEAL_PER_SWEEP) break;
      const read = await readRetryVerdict(service, auditId, now);
      if (!read || read.runs.length !== 1) continue;
      const run = read.runs[0];
      if (read.verdict.kind === "final" && read.verdict.why === "give_up_now") {
        const { error } = await service.from("ai_audit_runs").update({ results: giveUpPatch(run, read.rows, new Date().toISOString()) })
          .eq("id", run.id).in("status", ["failed", "complete"]).is(`results->${HEAL_META_KEY}->gave_up`, null);
        if (!error) console.log(`[self-heal] audit ${auditId}: gave up after the last automatic re-run`);
        continue;
      }
      if (read.verdict.kind !== "retry_now") continue;
      const round = read.verdict.round;
      const plan = healReopenPlan(run, read.rows, round, new Date().toISOString(), maxAttempts);
      if (!plan.rows.length) continue;
      /* The claim: the run flips to 'running' only from the settled status it was read in, so two ticks never run the
         same round twice (the second finds it already 'running'). */
      const { data: claimed, error } = await service.from("ai_audit_runs").update(plan.run)
        .eq("id", run.id).eq("status", run.status).select("id");
      if (error || !Array.isArray(claimed) || !claimed.length) continue;
      for (const p of plan.rows) {
        const { error: qErr } = await service.from("ai_audit_queue").update(p.patch).eq("id", p.id).eq("status", p.from);
        if (qErr) console.error(`[self-heal] ask ${p.id} not re-opened for run ${run.id}:`, qErr.message);
      }
      reopened++;
      console.log(`[self-heal] re-opened run ${run.id} (audit ${auditId}) round ${round}: ${plan.rows.length} ask(s)`);
    }
  } catch (e) {
    console.error("[self-heal] sweep failed (non-blocking):", e instanceof Error ? e.message : e);
  }
  return reopened;
}
