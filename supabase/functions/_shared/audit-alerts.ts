/* AUDIT ALERTS — the writer (Paul, 2026-11-16; the rules are src/lib/auditAlerts.ts, docs/AUDIT_RULES.md).
   ONE bell row + ONE email per alert: the bell row is the claim (one conditional insert on user_id + dedupe_key, the same
   door findable-onboarding uses), and the email goes only when this call won it, so a retry or a second run never sends
   it twice. The email goes to the operator only (OPERATOR_ALERT_TO) — never to a client or a prospect.
   Best-effort: an alert that cannot be written never fails the audit. */
import { sendOperatorAlert } from "./operator-alert.ts";
import { incompleteAlert, isIncomplete, providerAlert, refusalsIn, unmeasuredAnswers, type AlertProvider, type AlertRow } from "../../../src/lib/auditAlerts.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

interface Alert { title: string; body: string; link: string; subject: string; lines: string[]; dedupeKey: string }

/** Writes the bell row for the book owner; emails only when this call created it. Never throws. */
export async function raiseOperatorAlert(service: Service, kind: "audit_finished" | "team_update", a: Alert, leadId: string | null = null): Promise<"sent" | "duplicate" | "no_owner" | "failed"> {
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).limit(1).maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (!ownerId) return "no_owner";
    const { data: claimed, error } = await service.from("notifications").upsert([{
      user_id: ownerId, kind, title: a.title, body: a.body, link: a.link, lead_id: leadId, dedupe_key: a.dedupeKey, priority: 3,
    }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
    if (error) { console.error(`[audit-alerts] bell not written (${a.dedupeKey}):`, error.message); return "failed"; }
    if (!Array.isArray(claimed) || !claimed.length) return "duplicate";
    const sent = await sendOperatorAlert(a.subject, a.lines);
    if (!sent.ok) console.error(`[audit-alerts] email not sent (${a.dedupeKey}): ${sent.status} ${sent.error ?? ""}`);
    return sent.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[audit-alerts] alert failed (non-blocking):", e instanceof Error ? e.message : e);
    return "failed";
  }
}

/** "OpenAI / Apify is refusing us": once per provider per UTC day. */
export async function alertProviderRefusal(service: Service, r: { provider: AlertProvider; why: string }, where: string): Promise<void> {
  await raiseOperatorAlert(service, "team_update", providerAlert({ ...r, where, dayIso: new Date().toISOString() }));
}

/** Called when one of an audit's runs settles. Judges the WHOLE audit once every run has settled; raises "Audit incomplete"
 *  (once per audit) and any provider refusal seen in its stored errors (once per provider per day). */
export async function checkAuditCompleteness(service: Service, auditId: string): Promise<void> {
  try {
    const { data: runs } = await service.from("ai_audit_runs").select("id, status, competitor_cleaning:results->competitor_cleaning").eq("audit_id", auditId);
    const rs = (runs ?? []) as Array<{ id: string; status: string; competitor_cleaning?: { errors?: unknown[] } | null }>;
    if (!rs.length || rs.some((r) => r.status === "pending" || r.status === "running" || r.status === "processing")) return;
    const { data: rows } = await service.from("ai_audit_queue").select("status, result").eq("audit_id", auditId).order("id").limit(1000);
    const qrows = (rows ?? []) as AlertRow[];
    const c = unmeasuredAnswers(qrows);
    const texts = [
      ...qrows.filter((r) => r.status === "failed").map((r) => String((r.result as { error?: unknown } | null)?.error ?? "")),
      ...rs.flatMap((r) => (Array.isArray(r.competitor_cleaning?.errors) ? r.competitor_cleaning!.errors! : []).map((x) => String(x))),
    ];
    const refusals = refusalsIn(texts);
    for (const r of refusals) await alertProviderRefusal(service, r, "an audit's stored answers");
    if (!isIncomplete(c)) return;
    const { data: audit } = await service.from("ai_audits").select("business_name, short_code, lead_id").eq("id", auditId).maybeSingle();
    const a = audit as { business_name?: string | null; short_code?: string | null; lead_id?: string | null } | null;
    await raiseOperatorAlert(service, "audit_finished", incompleteAlert({
      businessName: String(a?.business_name ?? ""), shortCode: a?.short_code ?? null, auditId, ...c, refusals,
    }), a?.lead_id ?? null);
  } catch (e) {
    console.error("[audit-alerts] completeness check failed (non-blocking):", e instanceof Error ? e.message : e);
  }
}
