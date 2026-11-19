/* GIVE BACK A FAILED CLICK (v1-rep-limits-own-actions, 2026-11-19; the rule is src/lib/usageRefund.ts).
   Marks ONE guard row — the rep's click that started an audit that then failed, or a check that never started — as
   'refunded' with its estimate zeroed, so no limit counts it. Finds the newest counted row for that lead (and person, when
   known) written just before `atIso`; the update is guarded on the row still being counted, so a second call never
   refunds a different click. Best-effort: never throws. */
import { AUDIT_START_ACTIONS, COUNTED_OUTCOMES, REFUNDED_OUTCOME, refundReason, refundWindow } from "../../../src/lib/usageRefund.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export async function refundGuardRow(service: Service, o: { leadId: string | null | undefined; atIso: string; why: string; actorId?: string | null; actions?: readonly string[] }): Promise<boolean> {
  try {
    const w = refundWindow(o.atIso);
    if (!o.leadId || !w) return false;
    let q = service.from("api_usage_log").select("id")
      .eq("api_type", "guard").eq("lead_id", o.leadId).in("action", [...(o.actions ?? AUDIT_START_ACTIONS)])
      .in("outcome", [...COUNTED_OUTCOMES]).gte("created_at", w.fromIso).lte("created_at", w.toIso)
      .order("created_at", { ascending: false }).limit(1);
    if (o.actorId) q = q.eq("user_id", o.actorId);
    const { data } = await q;
    const id = (Array.isArray(data) && data[0] ? (data[0] as { id: string }).id : null);
    if (!id) return false;
    const { data: done, error } = await service.from("api_usage_log")
      .update({ outcome: REFUNDED_OUTCOME, estimated_cost_usd: 0, reason: refundReason(o.why) })
      .eq("id", id).in("outcome", [...COUNTED_OUTCOMES]).select("id");
    if (error) { console.error(`[usage-refund] ${o.leadId}: ${error.message}`); return false; }
    return Array.isArray(done) && done.length > 0;
  } catch (e) {
    console.error("[usage-refund] failed (non-blocking):", e instanceof Error ? e.message : e);
    return false;
  }
}
