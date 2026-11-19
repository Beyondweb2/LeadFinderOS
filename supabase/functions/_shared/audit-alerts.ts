/* AUDIT ALERTS — the writer (Paul, 2026-11-16; the rules are src/lib/auditAlerts.ts, docs/AUDIT_RULES.md).
   raiseOperatorAlert: ONE bell row + ONE email per alert. The bell row is the claim (one conditional insert on
   user_id + dedupe_key, the same door findable-onboarding uses), and the email goes only when this call won it, so a retry
   or a second run never sends it twice. The email goes to the operator only (OPERATOR_ALERT_TO) — never to a client or a
   prospect.
   ⛔ AUDIT INCOMPLETE / PROVIDER REFUSED ARE SUMMARIES (v1-incomplete-fix, 16 Nov): one bell row per cause (or provider)
   at most once an hour; later ones in that hour only add to the row. The incomplete email is sent by audit-watch a few
   minutes after the row opened (sendDueIncompleteSummaries), so a burst is one email with its full count; a provider
   refusal emails at once (it is the thing to fix), then stays quiet for the hour.
   Quiet claim rows (`audit_incomplete_counted:<audit>`, `audit_incomplete_emailed:<summary>`) are written already cleared,
   so the bell never shows them; they only make "count once" and "email once" hold across retries.
   Best-effort: an alert that cannot be written never fails the audit. */
import { sendOperatorAlert } from "./operator-alert.ts";
import { readRetryVerdict } from "./quick-check-retry.ts";
import {
  ALERT_WINDOW_MS, INCOMPLETE_CAUSES, causeAlertsPerAudit, causeOfKey, countedKey, emailedKey, incompleteCause, incompleteSummary, incompleteSummaryEmail,
  isIncomplete, namesInSummary, providerAlert, providerKeyPrefix, refusalsIn, summaryDue, summaryEntry, summaryKey, summaryKeyPrefix,
  unmeasuredAnswers, type AlertProvider, type AlertRow, type IncompleteCause,
} from "../../../src/lib/auditAlerts.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

interface Alert { title: string; body: string; link: string; subject: string; lines: string[]; dedupeKey: string }

async function bookOwner(service: Service): Promise<string | null> {
  const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).limit(1).maybeSingle();
  return (owner as { user_id?: string } | null)?.user_id ?? null;
}

/** A quiet claim: an already-cleared row (never in the bell). true = this call made it (first time). */
async function claimQuiet(service: Service, ownerId: string, kind: string, key: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await service.from("notifications").upsert([{
    user_id: ownerId, kind, title: "(alert bookkeeping)", body: null, link: null, dedupe_key: key, priority: 0, read_at: now, cleared_at: now,
  }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`claim ${key}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** The newest bell row whose key starts with `prefix`, opened inside the last hour (the rolling window). */
async function openRow(service: Service, ownerId: string, prefix: string): Promise<{ id: string; dedupe_key: string; count: number | null; body: string | null; created_at: string } | null> {
  const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
  const { data } = await service.from("notifications").select("id, dedupe_key, count, body, created_at")
    .eq("user_id", ownerId).like("dedupe_key", `${prefix}%`).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as never) ?? null;
}

/** Writes the bell row for the book owner; emails only when this call created it. Never throws. */
export async function raiseOperatorAlert(service: Service, kind: "audit_finished" | "team_update", a: Alert, leadId: string | null = null): Promise<"sent" | "duplicate" | "no_owner" | "failed"> {
  try {
    const ownerId = await bookOwner(service);
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

/** "OpenAI / Apify is refusing us": at most once an hour per provider. Inside the hour a repeat only raises the open row's
 *  count (no email). */
export async function alertProviderRefusal(service: Service, r: { provider: AlertProvider; why: string }, where: string): Promise<void> {
  try {
    const ownerId = await bookOwner(service);
    if (!ownerId) return;
    const open = await openRow(service, ownerId, providerKeyPrefix(r.provider));
    if (open) {
      await service.from("notifications").update({ count: (Number(open.count) || 1) + 1 }).eq("id", open.id);
      return;
    }
    await raiseOperatorAlert(service, "team_update", providerAlert({ ...r, where, nowIso: new Date().toISOString() }));
  } catch (e) {
    console.error("[audit-alerts] provider alert failed (non-blocking):", e instanceof Error ? e.message : e);
  }
}

/** Adds one incomplete audit to its cause's summary row for this hour (opening one if none is open). No email here —
 *  audit-watch sends the summary (sendDueIncompleteSummaries). Each audit is counted once (its quiet claim). */
async function addToSummary(service: Service, ownerId: string, cause: IncompleteCause, auditId: string, entry: string, leadId: string | null): Promise<void> {
  if (!(await claimQuiet(service, ownerId, "audit_finished", countedKey(auditId)))) return; // already counted
  const open = await openRow(service, ownerId, summaryKeyPrefix(cause));
  if (open) {
    const count = (Number(open.count) || 1) + 1;
    const opened = String(open.dedupe_key).slice(summaryKeyPrefix(cause).length);
    const s = incompleteSummary({ cause, count, sinceIso: `${opened}:00Z`, names: [...namesInSummary(open.body), entry] });
    await service.from("notifications").update({ count, title: s.title, body: s.body, read_at: null }).eq("id", open.id);
    return;
  }
  const nowIso = new Date().toISOString();
  const s = incompleteSummary({ cause, count: 1, sinceIso: nowIso, names: [entry] });
  const { error } = await service.from("notifications").upsert([{
    user_id: ownerId, kind: "audit_finished", title: s.title, body: s.body, link: s.link, lead_id: leadId,
    dedupe_key: summaryKey(cause, nowIso), priority: 3, count: 1,
  }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  if (error) console.error(`[audit-alerts] summary row not written (${cause}):`, error.message);
}

/** Called when one of an audit's runs settles. Judges the WHOLE audit once every run has settled; adds it to the hourly
 *  "Audits incomplete" summary for its cause, and raises any provider refusal seen in its stored errors. */
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
    /* A Quick check that will get its one automatic retry is not counted yet: only its final failure is (v1-quickcheck-retry). */
    const retry = await readRetryVerdict(service, auditId);
    if (retry && (retry.verdict.kind === "retry_now" || retry.verdict.kind === "retry_later")) return;
    const ownerId = await bookOwner(service);
    if (!ownerId) return;
    const { data: audit } = await service.from("ai_audits").select("business_name, short_code, lead_id").eq("id", auditId).maybeSingle();
    const a = audit as { business_name?: string | null; short_code?: string | null; lead_id?: string | null } | null;
    const cause = incompleteCause(qrows, refusals);
    /* ⛔ NOT PER AUDIT FOR THE AI SEARCH (Paul, 19 Nov, v1-audits-self-healing): "alert me only when the rate drops". An
       audit the AI search did not answer heals itself (src/lib/auditSelfHeal.ts); the provider's success rate is
       watched by audit-watch (src/lib/providerHealth.ts) and alerts once when it drops. Refusals and unread answers
       still alert here — they are things to fix. */
    if (!causeAlertsPerAudit(cause)) return;
    await addToSummary(service, ownerId, cause, auditId, summaryEntry(String(a?.business_name ?? ""), a?.short_code ?? null), a?.lead_id ?? null);
  } catch (e) {
    console.error("[audit-alerts] completeness check failed (non-blocking):", e instanceof Error ? e.message : e);
  }
}

/** audit-watch, every 5 minutes: emails each summary row that has been open a few minutes and was not emailed yet — ONE
 *  email per summary (its quiet claim), with the count it has by then. Returns how many were emailed. Never throws. */
export async function sendDueIncompleteSummaries(service: Service): Promise<number> {
  let sent = 0;
  try {
    const ownerId = await bookOwner(service);
    if (!ownerId) return 0;
    const since = new Date(Date.now() - ALERT_WINDOW_MS * 2).toISOString();
    const nowIso = new Date().toISOString();
    for (const cause of INCOMPLETE_CAUSES) {
      const { data } = await service.from("notifications").select("id, dedupe_key, count, body, created_at")
        .eq("user_id", ownerId).like("dedupe_key", `${summaryKeyPrefix(cause)}%`).gte("created_at", since).limit(10);
      for (const row of (data ?? []) as Array<{ dedupe_key: string; count: number | null; body: string | null; created_at: string }>) {
        if (causeOfKey(row.dedupe_key) !== cause || !summaryDue(row.created_at, nowIso)) continue;
        if (!(await claimQuiet(service, ownerId, "audit_finished", emailedKey(row.dedupe_key)))) continue; // already emailed
        const opened = row.dedupe_key.slice(summaryKeyPrefix(cause).length);
        const e = incompleteSummaryEmail({ cause, count: Number(row.count) || 1, sinceIso: `${opened}:00Z`, names: namesInSummary(row.body) });
        const r = await sendOperatorAlert(e.subject, e.lines);
        if (r.ok) sent++; else console.error(`[audit-alerts] summary email not sent (${row.dedupe_key}): ${r.status} ${r.error ?? ""}`);
      }
    }
  } catch (e) {
    console.error("[audit-alerts] summary emails failed (non-blocking):", e instanceof Error ? e.message : e);
  }
  return sent;
}
