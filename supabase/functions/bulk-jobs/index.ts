import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSuppressed } from "../_shared/suppression.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

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
//   * site-gen: 40 sites/24h per-operator cap (403 → skipped_cap) + duplicate-site
//     guard (existing:true → skipped_existing) + the NEW $10/day global spend cap
//     enforced HERE from api_usage_log before each item.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Shared secret for internal (cron sweep + self-invoke) auth — decoupled from the
// service-role key, which the pg_cron vault copy can drift from. Same value must be
// set as a function secret (read here) AND in the vault (sent by the cron SQL).
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const JOB_CAPS: Record<string, number> = { enrich: 200, site_gen: 50, audit: 25 };
const TIME_BUDGET_MS = 90_000;   // stop starting new WAVES once elapsed passes this…
const WAVE_HEADROOM_MS = 55_000; // …minus headroom, so one full parallel wave + persist still fits under the 150s limit
const WAVE_SIZE = 3;             // site_gen bounded concurrency (enrich stays 1-at-a-time). Lowered 5->3: 5 concurrent 9a Apify Maps scrapes on the one shared token overran its concurrency limit → 4 of 5 got 429/contention and baked empty photo pools; 3 matches the proven-reliable per-row cap. Wave still runs in parallel (duration ~slowest generate, unchanged), so no time-budget regression.
const SWEEP_BUDGET_MS = 60_000; // sweep stops CLAIMING new jobs past this, so one invocation (claim + a chunk) stays well under 150s
const SITEGEN_PER_ITEM_EST_USD = 0.03; // used to SIZE a wave to the remaining daily budget → a batch can't overshoot the cap by >~1 item
const LOCK_MS = 2 * 60_000;      // claim window (refreshed on every persist)
const STALE_MS = 3 * 60_000;     // sweep re-kicks active jobs idle longer than this
const SITEGEN_DAILY_BUDGET_USD = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
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
  /* skipped_suppressed: the lead has said no on some channel. Its own member rather than reusing
     skipped_existing, so a suppression can never be misread as a dedupe in the job summary.

     ⛔ awaiting_audit: THE AUDIT WAS ENQUEUED BUT HAS NOT BEEN ANSWERED YET, and it is the whole
     point of this change. `done` used to be set the moment create-ai-audit returned — which is when
     the QUESTIONS EXIST, not when they have been answered. Measured 2026-08-08: a 10-lead job
     reported done=10 after 43 SECONDS while the last question finished 8.9 MINUTES later. Paul read
     "done", pushed to Instantly, and got 0 pushed twice, because no run had completed.
     A job is not finished while any item is awaiting_audit; the chunk releases back to 'queued' and
     the next sweep re-checks. Non-terminal by construction, so nothing downstream can read it as
     success. */
  status: "pending" | "running" | "awaiting_audit" | "done" | "cached" | "failed" | "skipped_cap" | "skipped_existing" | "skipped_suppressed";
  error?: string;
  /** Set with awaiting_audit so the re-check knows which run to look at. */
  audit_id?: string;
}

/** How long an enqueued audit may take before the item is called failed. Measured audits finish in
 *  ~9 minutes; a question can legitimately run ~9 on Apify alone, so this is deliberately generous.
 *  Its job is to stop a job re-queuing forever, not to be a timeout anyone tunes. */
const AUDIT_WAIT_MAX_MS = 45 * 60 * 1000;

interface JobRow {
  id: string;
  user_id: string;
  job_type: "enrich" | "site_gen" | "audit";
  status: string;
  items: JobItem[];
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  params: Record<string, unknown> | null;
  created_at: string; // used by the audit branch's idempotency guard (skip if this job already made one)
}

/** Atomically claim a job and process ONE chunk INLINE, in the caller's invocation.
 *  Replaces the old fire-and-forget self-invoke (`kickRun`), whose 2.5s abort meant
 *  the `run` isolate never received the request on a cold start, so jobs were never
 *  claimed. The claim (status in [queued,running] + locked_until null/expired) is
 *  atomic, so two overlapping sweeps can't double-process: the loser matches 0 rows.
 *  Returns true if we claimed (and processed a chunk of) the job. */
// deno-lint-ignore no-explicit-any
async function claimAndProcess(service: any, jobId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data: claimed } = await service
    .from("bulk_jobs")
    .update({ status: "running", locked_until: new Date(Date.now() + LOCK_MS).toISOString(), updated_at: nowIso })
    .eq("id", jobId)
    .in("status", ["queued", "running"])
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select()
    .maybeSingle();
  if (!claimed) return false; // not claimable (done/cancelled, or locked by another runner)
  await processChunk(service, claimed as JobRow);
  return true;
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

// The edge functions' AUTO-INJECTED SUPABASE_* keys are stale here (a past key/JWT
// rotation), so the API gateway 401s a function-to-function call that presents them —
// before the target's handler ever runs. The REAL keys live in the vault; fetch them
// via the edge_internal_keys() RPC and present THOSE on internal calls. Cached for the
// isolate's life (keys are static; a redeploy refreshes). Falls back to the injected
// keys if the RPC is unavailable.
let cachedInternalKeys: { service_key: string; anon_key: string } | null = null;
// deno-lint-ignore no-explicit-any
async function getInternalKeys(service: any): Promise<{ service_key: string; anon_key: string }> {
  if (cachedInternalKeys) return cachedInternalKeys;
  try {
    const { data } = await service.rpc("edge_internal_keys");
    const row = Array.isArray(data) ? data[0] : data;
    cachedInternalKeys = {
      service_key: (row?.service_key as string) || SERVICE_KEY,
      anon_key: (row?.anon_key as string) || ANON_KEY,
    };
  } catch {
    cachedInternalKeys = { service_key: SERVICE_KEY, anon_key: ANON_KEY };
  }
  return cachedInternalKeys;
}

/** Run ONE item through the existing edge function (internal-call branch). */
// deno-lint-ignore no-explicit-any
async function runItem(service: any, job: JobRow, item: JobItem): Promise<{ status: JobItem["status"]; error?: string; capHit?: boolean; audit_id?: string }> {
  // Real vault keys for the gateway (the injected ones are stale) + x-cron-secret for
  // the target handler's isInternal check + x-internal-job.
  const keys = await getInternalKeys(service);
  const internalHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${keys.service_key}`,
    "apikey": keys.anon_key,
    "x-internal-job": "1",
    "x-cron-secret": CRON_SECRET,
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

  if (job.job_type === "audit") {
    // Bulk AI-visibility audit: create ONE queued audit per lead via create-ai-audit's internal
    // branch. create-ai-audit does NO Apify — it just generates the questions and inserts
    // ai_audit_queue rows; the existing 1-min process-ai-audit-queue cron drains them under its
    // own concurrency/cost caps. So this branch only enqueues — it never fires Apify directly.
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, search_keyword, category, search_location, address, country, website, phone, email, is_archived")
      .eq("id", item.lead_id)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (!lead) return { status: "failed", error: "lead not found" };

    /* ⛔ SUPPRESSED MEANS SUPPRESSED EVERYWHERE, INCLUDING HERE. An audit contacts nobody, so this
       is not a safety gate in the way instantly-push's is — it is a SPEND gate, and Paul's rule
       rather than an inference: auditing someone who has said no is paying to prepare a pitch that
       will never be sent. Measured 2026-08-08 this batch could reach all 142 of them.
       Deliberately "skipped", not "failed": nothing went wrong, the lead is simply off-limits, and
       a failed item invites a retry that would re-spend. */
    const supp = await checkSuppressed(service, { phone: lead.phone, email: lead.email, leadId: lead.id });
    if (supp.suppressed) {
      console.log(`[bulk-jobs] audit skipped for suppressed lead ${lead.id} (matched on ${supp.matchedOn})`);
      return { status: "skipped_suppressed", error: `suppressed (${supp.matchedOn})` };
    }

    // Idempotency: create-ai-audit is NOT idempotent (every call inserts a fresh audit+run). If a
    // prior chunk already created an audit for this lead DURING this job (e.g. the isolate died
    // between the create call and the item-status persist, so the item was reclaimed to pending),
    // skip re-creating — a retry must not double-spend. Only audits created at/after the job's
    // start count, so a genuine pre-existing audit never blocks a fresh requested run.
    const { data: prior } = await service
      .from("ai_audits")
      .select("id")
      .eq("lead_id", item.lead_id)
      .eq("user_id", job.user_id)
      .gte("created_at", job.created_at)
      .limit(1)
      .maybeSingle();
    if (prior) return { status: "awaiting_audit", audit_id: prior.id };

    // Inputs sourced the SAME way as the wizard's pickLead: type = search_keyword||category,
    // location = search_location||address. Eligibility (client-side) already ensures these exist.
/* A DIRECTORY OR SOCIAL URL IS NOT A WEBSITE. `!!lead.website` was a bare truthiness test, so a
   listing whose only "website" is a Facebook page reported has_website: true — and
   process-ai-audit-queue then ran a ~$0.12 Apify SEO scan against facebook.com, grading Facebook's
   markup. isAggregatorUrl is the same classifier search-leads and the audit report use, so
   "not their own website" means one thing everywhere.
   The URL is dropped as well as the flag: the scan needs both, and leaving a facebook.com value on a
   row that says has_website: false is the stale-field trap that started this. The raw URL is still on
   outreach_leads.website, so nothing is lost. */
    const rawWebsite = (lead.website ?? "").trim();
    const website = rawWebsite && !isAggregatorUrl(rawWebsite) ? rawWebsite : "";
    // Operator-chosen count from the bulk dialog; falls back to the shared outreach-hook value
    // rather than a bare literal, so the cheap paths move together or not at all.
    const questionCount = Number((job.params as { question_count?: unknown } | null)?.question_count) || OUTREACH_HOOK_QUESTIONS;
    /* Market batches ask for skip_seo: the point is who AI names in a town, not a website grade
       for five businesses nobody has sold to, and the scan was ~60% of the batch's bill. Passed
       straight through; create-ai-audit seeds the run's results.seo skip marker. Absent/false on
       every other path, so ordinary audits still scan. */
    const skipSeo = (job.params as { skip_seo?: unknown } | null)?.skip_seo === true;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-ai-audit`, {
      method: "POST",
      headers: internalHeaders,
      body: JSON.stringify({
        user_id: job.user_id,                                        // internal call: owner supplied explicitly
        lead_id: lead.id,                                            // links audit → lead → per-lead report (/a/<auditId>)
        business_name: lead.business_name ?? "",
        business_type: (lead.search_keyword || lead.category || "").trim(),
        location_text: (lead.search_location || lead.address || "").trim(),
        country: lead.country ?? null,
        has_website: !!website,
        website: website || undefined,
        question_count: questionCount,
        ...(skipSeo ? { skip_seo: true } : {}),
        /* purpose='market' turns on cross-audit intent coverage in create-ai-audit. Sent for the
           market panel's batches only (it asks for skip_seo, which nothing else does), so ordinary
           outreach bulk audits keep generating exactly as before. */
        ...(skipSeo ? { purpose: "market" } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    /* ⛔ NOT done — awaiting_audit. create-ai-audit returning ok means the QUESTIONS EXIST, not that
       they have been answered; the answering happens later on the process-ai-audit-queue cron. See
       the JobItem comment: claiming done here is what made two pushes return 0. */
    if (data?.ok && data?.audit_id) return { status: "awaiting_audit", audit_id: String(data.audit_id) };
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
    // Per-operator 40 sites / 24h cap — same treatment as a spend cap.
    return { status: "skipped_cap", capHit: true };
  }
  if (data?.existing) return { status: "skipped_existing" };
  if (data?.site?.id) return { status: "done" };
  return { status: "failed", error: String(data?.error ?? `HTTP ${res.status}`).slice(0, 200) };
}

/** Process pending items in WAVES of bounded concurrency under the time budget,
 *  persisting after every wave (and before it, to mark the wave in-flight). */
// deno-lint-ignore no-explicit-any
/* ── RESOLVE ITEMS WAITING ON AN AUDIT ─────────────────────────────────────────────────────────
   Called at the top of every chunk. An enqueued audit is answered by a DIFFERENT cron, so the only
   honest way to know it finished is to look at its run. complete/capped -> done; failed/cancelled ->
   failed; anything still going stays awaiting and the job re-queues.
   ⚠️ 'capped' counts as finished on purpose: a capped run has real answers, just fewer than asked
   for, and the audit-reply resolver accepts it. Treating it as a failure would discard a usable
   audit and re-spend on the next attempt. */
// deno-lint-ignore no-explicit-any
async function resolveAwaiting(service: any, job: JobRow): Promise<{ done: number; failed: number }> {
  const waiting = job.items.filter((it) => it.status === "awaiting_audit" && it.audit_id);
  if (!waiting.length) return { done: 0, failed: 0 };
  const ids = [...new Set(waiting.map((it) => it.audit_id!))];
  const { data: runs } = await service
    .from("ai_audit_runs").select("audit_id, status").in("audit_id", ids);
  const byAudit = new Map<string, string[]>();
  for (const r of (runs ?? []) as Array<{ audit_id: string; status: string }>) {
    if (!byAudit.has(r.audit_id)) byAudit.set(r.audit_id, []);
    byAudit.get(r.audit_id)!.push(r.status);
  }
  const ageMs = Date.now() - new Date(job.created_at ?? Date.now()).getTime();
  let done = 0, failed = 0;
  for (const it of waiting) {
    const sts = byAudit.get(it.audit_id!) ?? [];
    if (sts.some((x) => x === "complete" || x === "capped")) { it.status = "done"; done++; continue; }
    if (sts.length && sts.every((x) => x === "failed" || x === "cancelled")) {
      it.status = "failed"; it.error = "audit run failed"; failed++; continue;
    }
    /* Still going — unless it has been going too long, in which case stop re-queuing forever and
       say so. A stuck item must not keep a job alive indefinitely. */
    if (ageMs > AUDIT_WAIT_MAX_MS) {
      it.status = "failed";
      it.error = `audit did not finish within ${Math.round(AUDIT_WAIT_MAX_MS / 60000)} minutes`;
      failed++;
    }
  }
  return { done, failed };
}

// deno-lint-ignore no-explicit-any
async function processChunk(service: any, job: JobRow): Promise<void> {
  const started = Date.now();
  const items = job.items;
  let done = job.done_count, failed = job.failed_count, skipped = job.skipped_count;
  let capHit = false;
  // site_gen runs up to WAVE_SIZE concurrently; enrich stays 1-at-a-time (its $2/day
  // cap lives inside enrich-business and isn't budget-sized here). audit runs a small
  // parallel wave (each item is just a fast create-ai-audit call that generates questions
  // + enqueues ai_audit_queue rows — NO Apify here), so the whole batch enqueues within a
  // tick or two. The actual multi-engine drain is throttled downstream by
  // process-ai-audit-queue (START_BATCH 12 < 32 ceiling), so a burst can't overrun Apify.
  const concurrency = job.job_type === "site_gen" ? WAVE_SIZE : job.job_type === "audit" ? 4 : 1;

  // Recover orphaned in-flight items from a prior chunk that crashed/timed-out mid-wave
  // (a clean chunk boundary never leaves "running"). Re-running is safe — generate-
  // barber-site's duplicate guard returns existing:true → skipped_existing.
  for (const it of items) if (it.status === "running") it.status = "pending";

  /* Items enqueued on a PREVIOUS chunk may have finished since. Resolve them first, so a job whose
     audits are all done closes on this tick rather than waiting for another sweep. */
  {
    const r = await resolveAwaiting(service, job);
    done += r.done; failed += r.failed;
  }

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

  // Mark every still-pending item skipped_cap (when the daily cap is reached).
  const capRemaining = () => {
    for (const it of items) if (it.status === "pending") { it.status = "skipped_cap"; skipped++; }
  };

  while (true) {
    const pending = items.filter((it) => it.status === "pending");
    if (pending.length === 0) break;

    // Out of time for THIS invocation → release the claim back to 'queued' so the next
    // sweep (≤1 min later) claims and continues it. No reliance on a self-invoke.
    // Checked BEFORE a wave, so a clean boundary never leaves items "running".
    if (Date.now() - started > TIME_BUDGET_MS - WAVE_HEADROOM_MS) {
      await persist({ status: "queued", locked_until: null });
      return;
    }

    // Cancelled while running? (checked between waves — an in-flight wave completes.)
    const { data: fresh } = await service.from("bulk_jobs").select("status").eq("id", job.id).maybeSingle();
    if (fresh?.status === "cancelled") return;

    // Wave size = concurrency, but for site_gen also clamp to the remaining $10/day
    // budget so a parallel batch can't overshoot the cap by more than ~1 item.
    let waveSize = Math.min(concurrency, pending.length);
    if (job.job_type === "site_gen") {
      const spent = await sitegenSpendTodayUsd(service);
      const budgetRoom = Math.floor((SITEGEN_DAILY_BUDGET_USD - spent) / SITEGEN_PER_ITEM_EST_USD);
      if (budgetRoom <= 0) { capHit = true; capRemaining(); break; }
      waveSize = Math.min(waveSize, budgetRoom);
    }
    const wave = pending.slice(0, waveSize);

    // Mark the wave in-flight (drives the per-row spinner) and persist before launching.
    for (const it of wave) it.status = "running";
    await persist();

    // Run the wave concurrently. allSettled + per-item mapping → one item failing
    // (or throwing) never kills the others.
    const results = await Promise.allSettled(wave.map((it) => runItem(service, job, it)));
    results.forEach((res, i) => {
      const it = wave[i];
      if (res.status === "fulfilled") {
        const r = res.value;
        it.status = r.status;
        if (r.error) it.error = r.error;
        if (r.audit_id) it.audit_id = r.audit_id;
        /* awaiting_audit counts as NOTHING yet — not done, not failed, not skipped. It is resolved
           on a later chunk by resolveAwaiting, which increments the right counter then. Counting it
           here is precisely the bug: the totals would read complete while the work was outstanding. */
        if (r.status === "awaiting_audit") { /* pending resolution */ }
        else if (r.status === "done" || r.status === "cached") done++;
        else if (r.status === "failed") failed++;
        else skipped++; // skipped_cap / skipped_existing / skipped_suppressed
        if (r.capHit) capHit = true; // per-operator 20/24h 403 → cap the rest
      } else {
        it.status = "failed";
        it.error = String((res.reason as Error)?.message ?? res.reason).slice(0, 200);
        failed++;
      }
    });
    await persist();

    if (capHit) { capRemaining(); break; }
  }

  /* ⛔ NO PENDING ITEMS IS NOT THE SAME AS FINISHED. Items sitting at awaiting_audit have had their
     questions enqueued and not yet answered; marking the job done here is the exact lie this change
     removes. Release the claim back to 'queued' so the ≤1-minute sweep re-checks, and leave the job
     visibly unfinished in the meantime. */
  if (items.some((it) => it.status === "awaiting_audit")) {
    await persist({ status: "queued", locked_until: null });
    return;
  }

  // No pending and nothing awaiting → genuinely finished.
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
    // Internal (cron sweep / self-invoke): accept EITHER a matching CRON_SECRET header
    // (robust, key-rotation-proof) OR the legacy service-key + x-internal-job match.
    const isInternal =
      (!!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) ||
      (!!SERVICE_KEY && token === SERVICE_KEY && !!req.headers.get("x-internal-job"));

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ── Internal actions (cron / self-chain only) ──
    if (action === "sweep") {
      if (!isInternal) return json({ error: "forbidden" }, 403);
      const sweepStart = Date.now();
      const staleCutoff = new Date(Date.now() - STALE_MS).toISOString();
      // Jobs that need a runner: ANY 'queued' job (oldest first — its create wasn't
      // processed) PLUS any 'running' job whose chain went stale (> STALE_MS since its
      // last persist = its runner died mid-job).
      const [queuedRes, staleRunningRes] = await Promise.all([
        service.from("bulk_jobs").select("id").eq("status", "queued").order("created_at", { ascending: true }).limit(10),
        service.from("bulk_jobs").select("id").eq("status", "running").lt("updated_at", staleCutoff).order("updated_at", { ascending: true }).limit(10),
      ]);
      const ids = [...new Set([
        ...((queuedRes.data ?? []) as { id: string }[]),
        ...((staleRunningRes.data ?? []) as { id: string }[]),
      ].map((j) => j.id))];
      // Process INLINE, in THIS invocation (the fire-and-forget self-invoke was
      // unreliable). Claim + run one chunk per job; the atomic claim makes two
      // overlapping sweeps a no-op for the loser. Stop CLAIMING new jobs once we're low
      // on wall-clock so the invocation stays < 150s; anything not reached is claimed
      // next minute. A job needing more than one chunk is released back to 'queued'
      // by processChunk and continued by the next sweep.
      let processed = 0;
      for (const id of ids) {
        if (Date.now() - sweepStart > SWEEP_BUDGET_MS) break;
        if (await claimAndProcess(service, id)) processed++;
      }
      return json({ ok: true, found: ids.length, processed });
    }

    if (action === "run") {
      if (!isInternal) return json({ error: "forbidden" }, 403);
      const jobId: string = body.job_id ?? "";
      if (!jobId) return json({ error: "job_id required" }, 400);
      // Same atomic-claim + inline processing the sweep uses (kept as a manual/debug
      // trigger; the sweep is now the reliable path).
      const claimed = await claimAndProcess(service, jobId);
      return json({ ok: true, claimed });
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
      if (jobType !== "enrich" && jobType !== "site_gen" && jobType !== "audit") return json({ error: "invalid job_type" }, 400);
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

      // No self-invoke kick — the every-minute sweep claims + processes the job inline
      // (reliable). Create returns immediately; the job starts within ~1 min.
      return json({ ok: true, job_id: (jobRow as { id: string }).id, total: items.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[bulk-jobs] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
