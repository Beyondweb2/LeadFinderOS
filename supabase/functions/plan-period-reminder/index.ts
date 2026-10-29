// plan-period-reminder — the v6 clause 9A.5 reminder: "We will remind you before the Plan Period ends that you can opt in."
// For Pay in full, 6 months and 12 months clients on agreement v6 (2026-10-29). v5's payment-12 reminder is fn month12-reminder.
//
// Internal only: CRON_SECRET + x-internal-job (invoke_plan_period_reminder(), daily, only while the kill switch is on).
// Modes (body.mode):
//   · "dry_run"  — reads only: who would be reminded within horizon_days (default 240), and why everyone else is not.
//   · "run"      — the scheduled send: every real client due today, once each. Nothing while the switch is off.
//   · "qa_drill" — ONE QA fixture lead (lead_id), a fast-forwarded day (today), simulate true/false. Never a real client.
// The rules: src/lib/planPeriodReminder.ts. The server half: _shared/plan-period-reminder.ts. Record: docs/plan-period-reminder.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dryRun, drill, runDue } from "../_shared/plan-period-reminder.ts";

/** Bumped with every change, so a deploy is proved by the live answer (CLAUDE.md §4). */
const BUILD_ID = "plan-period-reminder-2026-10-29a";
const json = (body: unknown, status = 200) => new Response(JSON.stringify({ build: BUILD_ID, ...(body as object) }), { status, headers: { "Content-Type": "application/json" } });
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const internal = req.headers.get("x-internal-job") === "1"
    && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || "\u0000__unset__");
  if (!internal) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode = String(body.mode ?? "");
  const nowIso = new Date().toISOString();
  try {
    if (mode === "dry_run") {
      const h = Number(body.horizon_days ?? 240);
      const today = typeof body.today === "string" && DAY_RE.test(body.today) ? body.today : nowIso;
      return json({ ok: true, mode, ...(await dryRun(service, today, Number.isFinite(h) && h > 0 && h <= 400 ? Math.floor(h) : 240)) });
    }
    if (mode === "run") {
      return json({ ok: true, mode, ...(await runDue(service, nowIso, String(body.triggered_by ?? "manual").slice(0, 40))) });
    }
    if (mode === "qa_drill") {
      const leadId = String(body.lead_id ?? "");
      const today = typeof body.today === "string" && DAY_RE.test(body.today) ? body.today : null;
      if (!/^[0-9a-f-]{36}$/i.test(leadId) || !today) return json({ ok: false, error: "bad_request", detail: "qa_drill needs lead_id and today (YYYY-MM-DD)." }, 400);
      return json({ ok: true, mode, ...(await drill(service, leadId, today, body.simulate !== false)) });
    }
    return json({ ok: false, error: "bad_mode", detail: "mode must be dry_run, run or qa_drill." }, 400);
  } catch (e) {
    const msg = (e as Error)?.message ?? String((e as { message?: unknown })?.message ?? e);
    console.error("[plan-period-reminder]", msg.split("\n")[0].slice(0, 300));
    return json({ ok: false, error: "failed", detail: msg.slice(0, 300) }, 500);
  }
});
