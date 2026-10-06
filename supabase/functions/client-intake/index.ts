// client-intake — drains the PAID CLIENT AUTO-INTAKE queue (2026-10-06,
// docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md).
//
// Internal only: CRON_SECRET + x-internal-job. Called by invoke_client_intake() — from the paid trigger the
// moment a lead enters the Paid Clients list, and from the one-minute backstop cron while a row is due.
// One tick = up to a few due intakes, each CLAIMED on its own (_shared/client-intake.ts runClientIntake), so
// two ticks never run the same client. ⛔ It reads stored data and starts at most ONE crawl of the client's own
// public website per intake. No model call, no paid API, no message to anyone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processDueIntakes } from "../_shared/client-intake.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const internal = req.headers.get("x-internal-job") === "1"
    && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || "\u0000__unset__");
  if (!internal) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const r = await processDueIntakes(service);
    return json({ ok: true, processed: r.processed, results: r.results.map((x) => ({ lead_id: x.lead_id, ran: x.ran, status: x.ran ? x.status : null })) });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[client-intake]", msg);
    return json({ ok: false, error: msg.slice(0, 300) }, 500);
  }
});
