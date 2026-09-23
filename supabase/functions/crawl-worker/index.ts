// crawl-worker — drains exhaustive manual crawl jobs (2026-09-23).
//
// Internal only: CRON_SECRET + x-internal-job (the one-minute backstop cron invoke_crawl_worker, and
// its own chain). One tick = claim one running job's lease, process batches for up to
// FULL_CRAWL.tickBudgetMs, persist every URL's state, then — if the frontier still has work — fire
// the next tick and return. A tick that dies is resumed by the next one from the stored frontier.
// ⛔ It fetches the client's public site and nothing else: no model call, no audit, no message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { kickCrawlWorker, runCrawlTick } from "../_shared/crawl-job.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const internal = req.headers.get("x-internal-job") === "1"
    && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || " __unset__");
  if (!internal) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const r = await runCrawlTick(service);
    if (r.more) await kickCrawlWorker("chain");
    return json({ ok: true, ...r });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[crawl-worker]", msg);
    // The lease expires on its own; the backstop cron resumes the job from its stored frontier.
    return json({ ok: false, error: msg.slice(0, 300) }, 500);
  }
});
