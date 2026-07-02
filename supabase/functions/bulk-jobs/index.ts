import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// bulk-jobs — server-side bulk runner for enrich + site-gen, so an operator can
// fire a batch, close the browser, and come back to progress / finished results.
//
// Actions:
//   create (user-authed)   — validate (ownership; admin for site_gen; per-job cap),
//                            insert the job (queued), kick the first run, return.
//   run    (internal-only) — claim the job (locked_until mutex), process pending
//                            items sequentially under a ~90s time budget writing
//                            per-item state after EVERY item, then self-re-invoke
//                            for the next chunk or finish.
//   sweep  (internal-only) — pg_cron every 2 min: re-kick queued/running jobs whose
//                            updated_at went stale (>3 min) — a broken chain.
//   cancel (user-authed)   — own job → status 'cancelled'; runner stops between items.
//
// Work per item is delegated to the EXISTING functions (enrich-business /
// generate-barber-site) via their additive internal-call branches (service key +
// x-internal-job header) — no logic duplication; their caps/caches/guards apply:
//   * enrich: $2/day cap (limit_reached → remaining items skipped_cap) + 30d cache.
//   * site-gen: 20 sites/24h per-operator cap (403 → skipped_cap) + duplicate-site
//     guard (existing:true → skipped_existing) + the NEW $10/day global spend cap
//     enforced HERE from api_usage_log before each item.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const JOB_CAPS: Record<string, number> = { enrich: 200, site_gen: 50 };
const TIME_BUDGET_MS = 90_000;   // stop starting new items after this
const ITEM_HEADROOM_MS = 45_000; // ...minus headroom so a slow item still fits the wall clock
const LOCK_MS = 2 * 60_000;      // claim window (refreshed per item)
const STALE_MS = 3 * 60_000;     // sweep re-kicks active jobs idle longer than this
const SITEGEN_DAILY_BUDGET_USD = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface JobItem {
  lead_id: string;
  status: "pending" | "done" | "cached" | "failed" | "skipped_cap" | "skipped_existing";
  error?: string;
}

interface JobRow {
  id: string;
  user_id: string;
  job_type: "enrich" | "site_gen";
  status: string;
  items: JobItem[];
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  params: Record<string, unknown> | null;
}

/** Fire-and-forget-ish self invoke: send the request, wait max ~2.5s for it to get
 *  on the wire, then abort OUR side (the platform still processes it). A dropped
 *  kick is healed by the sweep cron within ~2–4 min, so this never needs to be
 *  perfectly reliable — just usually-fast. */
async function kickRun(jobId: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2_500);
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/bulk-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": ANON_KEY,
        "x-internal-job": "run",
      },
      body: JSON.stringify({ action: "run", job_id: jobId }),
      signal: ctrl.signal,
    });
  } catch { /* aborted (expected) or failed — sweep heals */ }
  clearTimeout(timer);
}

/** Today's (UTC) site-gen spend from api_usage_log — the $10/day budget guard.
 *  Best-effort: errors return 0 (never blocks a job on a logging table hiccup). */
// deno-lint-ignore no-explicit-any
async function sitegenSpendTodayUsd(service: any): Promise<number> {
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await service
      .from("api_usage_log")
      .select("estimated_cost_usd")
      .eq("function_name", "generate-barber-site")
      .gte("created_at", since.toISOString());
    return (data ?? []).reduce((s: number, r: { estimated_cost_usd: number | null }) => s + (Number(r.estimated_cost_usd) || 0), 0);
  } catch {
    return 0;
  }
}

/** Run ONE item through the existing edge function (internal-call branch). */
// deno-lint-ignore no-explicit-any
async function runItem(service: any, job: JobRow, item: JobItem): Promise<{ status: JobItem["status"]; error?: string; capHit?: boolean }> {
  const internalHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "apikey": ANON_KEY,
    "x-internal-job": "1",
  };

  if (job.job_type === "enrich") {
    // enrich-business needs the lead's fields — fetch the row (also re-checks it
    // still exists / still belongs to the job's user).
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, user_id, place_id, google_maps_url, phone, country, business_name, facebook_url, instagram_url, website")
      .eq("id", item.lead_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (!lead) return { status: "failed", error: "lead not found" };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-business`, {
      method: "POST",
      headers: internalHeaders,
      body: JSON.stringify({
        acting_user_id: job.user_id,
        lead_id: lead.id,
        place_id: lead.place_id ?? null,
        google_maps_url: lead.google_maps_url ?? null,
        phone: lead.phone ?? null,
        country: lead.country ?? null,
        business_name: lead.business_name ?? null,
        facebook_url: lead.facebook_url ?? null,
        instagram_url: lead.instagram_url ?? null,
        website: lead.website ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.limit_reached) return { status: "skipped_cap", capHit: true };
    if (data?.success) return { status: data.cached ? "cached" : "done" };
    return { status: "failed", error: String(data?.error ?? `HTTP ${res.status}`).slice(0, 200) };
  }

  // site_gen
  const template = (job.params?.template as string) ?? "barber";
  const mode = job.params?.mode as string | undefined;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-barber-site`, {
    method: "POST",
    headers: internalHeaders,
    body: JSON.stringify({
      acting_user_id: job.user_id,
      lead_id: item.lead_id,
      template,
      ...(mode ? { mode } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && /limit/i.test(String(data?.error ?? ""))) {
    // Per-operator 20 sites / 24h cap — same treatment as a spend cap.
    return { status: "skipped_cap", capHit: true };
  }
  if (data?.existing) return { status: "skipped_existing" };
  if (data?.site?.id) return { status: "done" };
  return { status: "failed", error: String(data?.error ?? `HTTP ${res.status}`).slice(0, 200) };
}

/** Process pending items under the time budget; persist after EVERY item. */
// deno-lint-ignore no-explicit-any
async function processChunk(service: any, job: JobRow): Promise<void> {
  const started = Date.now();
  const items = job.items;
  let done = job.done_count, failed = job.failed_count, skipped = job.skipped_count;
  let capHit = false;

  const persist = async (extra: Record<string, unknown> = {}) => {
    await service.from("bulk_jobs").update({
      items,
      done_count: done,
      failed_count: failed,
      skipped_count: skipped,
      updated_at: new Date().toISOString(),
      locked_until: new Date(Date.now() + LOCK_MS).toISOString(),
      ...extra,
    }).eq("id", job.id);
  };

  for (const item of items) {
    if (item.status !== "pending") continue;

    // Out of budget → persist, re-kick self for the next chunk, exit running.
    if (Date.now() - started > TIME_BUDGET_MS - ITEM_HEADROOM_MS) {
      await persist();
      await kickRun(job.id);
      return;
    }

    // Cancelled while running? (checked between items — an in-flight item completes)
    const { data: fresh } = await service.from("bulk_jobs").select("status").eq("id", job.id).maybeSingle();
    if (fresh?.status === "cancelled") return;

    // Site-gen $10/day global spend cap (enrich's $2/day lives inside enrich-business).
    if (job.job_type === "site_gen" && !capHit) {
      const spent = await sitegenSpendTodayUsd(service);
      if (spent >= SITEGEN_DAILY_BUDGET_USD) capHit = true;
    }

    if (capHit) {
      item.status = "skipped_cap";
      skipped++;
      continue; // fall through fast — mark ALL remaining pending as capped
    }

    try {
      const r = await runItem(service, job, item);
      item.status = r.status;
      if (r.error) item.error = r.error;
      if (r.status === "done" || r.status === "cached") done++;
      else if (r.status === "failed") failed++;
      else skipped++;
      if (r.capHit) capHit = true; // remaining pending items get skipped_cap above
    } catch (e) {
      item.status = "failed";
      item.error = (e as Error).message.slice(0, 200);
      failed++;
    }
    await persist();
  }

  // No pending items left → finished.
  await persist({
    status: "done",
    locked_until: null,
    ...(capHit ? { error: "daily cap reached — remaining items skipped" } : {}),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const isInternal = !!SERVICE_KEY && token === SERVICE_KEY && !!req.headers.get("x-internal-job");

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ── Internal actions (cron / self-chain only) ──
    if (action === "sweep") {
      if (!isInternal) return json({ error: "forbidden" }, 403);
      const staleCutoff = new Date(Date.now() - STALE_MS).toISOString();
      const { data: stale } = await service
        .from("bulk_jobs")
        .select("id")
        .in("status", ["queued", "running"])
        .lt("updated_at", staleCutoff)
        .limit(5);
      for (const j of (stale ?? []) as { id: string }[]) await kickRun(j.id);
      return json({ ok: true, kicked: stale?.length ?? 0 });
    }

    if (action === "run") {
      if (!isInternal) return json({ error: "forbidden" }, 403);
      const jobId: string = body.job_id ?? "";
      if (!jobId) return json({ error: "job_id required" }, 400);
      // Atomic claim: only one runner (chain or sweeper kick) may hold the lock.
      const nowIso = new Date().toISOString();
      const { data: claimed } = await service
        .from("bulk_jobs")
        .update({ status: "running", locked_until: new Date(Date.now() + LOCK_MS).toISOString(), updated_at: nowIso })
        .eq("id", jobId)
        .in("status", ["queued", "running"])
        .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
        .select()
        .maybeSingle();
      if (!claimed) return json({ ok: true, note: "not claimable (done/cancelled/locked)" });
      await processChunk(service, claimed as JobRow);
      return json({ ok: true });
    }

    // ── User actions (create / cancel) ──
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Auth required" }, 401);

    if (action === "cancel") {
      const jobId: string = body.job_id ?? "";
      if (!jobId) return json({ error: "job_id required" }, 400);
      await service
        .from("bulk_jobs")
        .update({ status: "cancelled", updated_at: new Date().toISOString(), locked_until: null })
        .eq("id", jobId)
        .eq("user_id", user.id)
        .in("status", ["queued", "running"]);
      return json({ ok: true });
    }

    if (action === "create") {
      const jobType: string = body.job_type ?? "";
      if (jobType !== "enrich" && jobType !== "site_gen") return json({ error: "invalid job_type" }, 400);
      const cap = JOB_CAPS[jobType];
      const leadIds: string[] = Array.from(new Set((body.lead_ids ?? []).filter((x: unknown) => typeof x === "string")));
      if (!leadIds.length) return json({ error: "lead_ids required" }, 400);
      if (leadIds.length > cap) return json({ error: `Too many leads — max ${cap} per ${jobType} job.` }, 400);

      // One active job per user keeps progress unambiguous (and bounds load).
      const { data: existing } = await service
        .from("bulk_jobs")
        .select("id")
        .eq("user_id", user.id)
        .in("status", ["queued", "running"])
        .limit(1);
      if (existing?.length) return json({ error: "You already have a bulk job running — wait for it to finish or cancel it." }, 409);

      // site_gen is admin-triggered from the bulk UI.
      if (jobType === "site_gen") {
        const { data: role } = await service
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!role) return json({ error: "Admin only" }, 403);
      }

      // Ownership: keep only the caller's own leads.
      const { data: owned } = await service
        .from("outreach_leads")
        .select("id")
        .eq("user_id", user.id)
        .in("id", leadIds);
      const ownedIds = new Set(((owned ?? []) as { id: string }[]).map((r) => r.id));
      const finalIds = leadIds.filter((id) => ownedIds.has(id));
      if (!finalIds.length) return json({ error: "No owned leads in the selection." }, 400);

      const items: JobItem[] = finalIds.map((lead_id) => ({ lead_id, status: "pending" }));
      const { data: jobRow, error: insErr } = await service
        .from("bulk_jobs")
        .insert({
          user_id: user.id,
          job_type: jobType,
          status: "queued",
          items,
          total: items.length,
          params: body.params ?? null,
        })
        .select("id")
        .single();
      if (insErr || !jobRow) return json({ error: insErr?.message ?? "insert failed" }, 500);

      await kickRun((jobRow as { id: string }).id);
      return json({ ok: true, job_id: (jobRow as { id: string }).id, total: items.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[bulk-jobs] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
