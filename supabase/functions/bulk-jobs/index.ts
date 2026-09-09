import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { townGated, TOWN_GATE_REASON } from "../../../src/lib/townVerdict.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { selectInChunks } from "../_shared/chunked-in.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// bulk-jobs — server-side bulk runner for enrich + audit + audit_and_push, so an operator
// can fire a batch, close the browser, and come back to progress / finished results.
// (The site_gen job type went with the barber site product, 2026-09-09.)
//
// Actions:
//   create (user-authed)   — validate (ownership; per-job cap),
//                            insert the job (queued), kick the first run, return.
//   run    (internal-only) — claim the job (locked_until mutex), process pending
//                            items sequentially under a ~90s time budget writing
//                            per-item state after EVERY item, then self-re-invoke
//                            for the next chunk or finish.
//   sweep  (internal-only) — pg_cron every 2 min: re-kick queued/running jobs whose
//                            updated_at went stale (>3 min) — a broken chain.
//   cancel (user-authed)   — own job → status 'cancelled'; runner stops between items.
//
// Work per item is delegated to the EXISTING functions (enrich-business,
// create-ai-audit, instantly-push) via their additive internal-call branches (service
// key + x-internal-job header) — no logic duplication; their caps/caches/guards apply:
//   * enrich: $2/day cap (limit_reached → remaining items skipped_cap) + 30d cache.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Shared secret for internal (cron sweep + self-invoke) auth — decoupled from the
// service-role key, which the pg_cron vault copy can drift from. Same value must be
// set as a function secret (read here) AND in the vault (sent by the cron SQL).
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/* The internal-call headers, in ONE place: real vault keys (the injected ones are stale, which is
   why a service key taken from the CLI gets a 401 from these functions), plus both internal markers.
   Lifted out of runItem so resolveAwaiting can make the same call. */
// deno-lint-ignore no-explicit-any
function internalHeadersFor(keys: any): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${keys.service_key}`,
    "apikey": keys.anon_key,
    "x-internal-job": "1",
    "x-cron-secret": CRON_SECRET,
  };
}

/* ⚠️ audit_and_push's cap counts ACTIONABLE items only — the ones that will be audited or pushed.
   Leads triaged "cannot" are reported and carried on the job as already-terminal rows, but they are
   not work and must not consume the budget: a selection of 40 where 20 are already in Instantly is a
   20-item job, not a refusal. */
/* ⛔ `audit` RAISED 25 -> 100 (Paul, 2026-08-30). SIZED AGAINST THE MONEY, NOT PICKED: the binding
   limit on a batch is process-ai-audit-queue's DAILY_CAP_USD ($12 rolling-24h, per user), not
   concurrency — over-ceiling rows are pushed back to pending with nothing spent, so a bigger job
   only drains slower. At the dearest shape this job can take (5 questions + an SEO scan on every
   lead) 100 leads is 100 x (5 x $0.0104 + $0.04) = $9.20, which sits inside $12 with headroom. 300
   would be ~$27.60 and would trip the cap mid-run, leaving half-finished audits — and a lead whose
   audit FAILS is then excluded from this button's eligible set, so the damage hides itself.
   ⚠️ audit_and_push is UNCHANGED at 25: it emails people, and its cap counts ACTIONABLE items.
   ⚠️ This is a REFUSAL above the cap, not a slice (see the create branch) — the dialog now says so
   before the press rather than letting the server reject it. */
const JOB_CAPS: Record<string, number> = { enrich: 200, audit: 100, audit_and_push: 25 };
/* ⛔ THE NO-AUDIT PUSH CAP. audit_and_push is 25 because it BUYS an audit per lead; with the audit
   dropped (Paul, 2026-09-09 — the email lost {{competitors}}) the run costs nothing, so the 25 was
   a spend guard with no spend behind it. 200 matches enrich, and it stays a cap rather than
   unbounded because this still puts real businesses into a live email campaign. */
const PUSH_ONLY_CAP = 200;

/** ⛔ TRY THE TOWN'S MARKET AUDIT BEFORE BUYING A PER-BUSINESS ONE. £0 against ~8p a lead, and every
 *  refusal falls through to the paid audit unchanged — see the call site in phase A.
 *  A kill switch rather than a hardcoded `true` so a bad market audit can be taken out of the loop in
 *  one line without reverting the batch runner. */
const DERIVE_FIRST = true;
const TIME_BUDGET_MS = 90_000;   // stop starting new WAVES once elapsed passes this…
const WAVE_HEADROOM_MS = 55_000; // …minus headroom, so one full parallel wave + persist still fits under the 150s limit
const SWEEP_BUDGET_MS = 60_000; // sweep stops CLAIMING new jobs past this, so one invocation (claim + a chunk) stays well under 150s
const LOCK_MS = 2 * 60_000;      // claim window (refreshed on every persist)
const STALE_MS = 3 * 60_000;     // sweep re-kicks active jobs idle longer than this

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
  /* skipped_town_unverified: its own member for the same reason skipped_suppressed is — a lead
     held because Google cannot confirm its town must never be misread as a dedupe or a cap. */
  status: "pending" | "running" | "awaiting_audit" | "done" | "cached" | "failed" | "skipped_cap" | "skipped_existing" | "skipped_suppressed" | "pushed" | "skipped_ineligible" | "skipped_town_unverified";
  error?: string;
  /* ── audit_and_push ONLY ─────────────────────────────────────────────────────────────
     Which half of the job this item is in. Set at CREATION from the triage, so the split between
     "needs auditing first" and "ready to push" is a decision the operator saw and agreed to, not
     something the runner works out later and could work out differently on a retry.
     An item that finishes phase A does not become `done` — it returns to `pending` in phase `push`,
     which is what makes "audited but never pushed" an impossible state rather than a likely one. */
  phase?: "audit" | "push";
  /* Set with awaiting_audit so the re-check knows what to look at.
     ⛔ run_id IS THE ONE THAT MATTERS, and audit_id alone was a bug I shipped and then watched fail
     in production within the hour. Platinum Accounting already had a CAPPED run from an earlier
     attempt; create-ai-audit added run #2 to the SAME audit; resolveAwaiting looked up runs by
     audit_id, saw the old capped one, and marked the item done while run #2 was still pending.
     A sibling run must never satisfy the check for a different attempt. */
  audit_id?: string;
  run_id?: string;
}

/** How long an enqueued audit may take before the item is called failed. Measured audits finish in
 *  ~9 minutes; a question can legitimately run ~9 on Apify alone, so this is deliberately generous.
 *  Its job is to stop a job re-queuing forever, not to be a timeout anyone tunes. */
const AUDIT_WAIT_MAX_MS = 45 * 60 * 1000;

interface JobRow {
  id: string;
  user_id: string;
  job_type: "enrich" | "audit" | "audit_and_push";
  status: string;
  items: JobItem[];
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  params: Record<string, unknown> | null;
  created_at: string; // used by the audit branch's idempotency guard (skip if this job already made one)
}

/* ══ TRIAGE — WHICH LEADS NEED WHAT, DECIDED ONCE ═══════════════════════════════════════════
   ⛔ ONE IMPLEMENTATION, CALLED BY BOTH THE PREVIEW AND THE CREATE. The operator agrees to a
   confirm screen; the job must then do exactly what that screen said. A second copy of these rules
   in the dialog would drift from this one the first time either changed, and the symptom would be a
   job quietly auditing someone the confirm listed as "cannot" — i.e. spending money the operator
   was shown he would not spend.

   ⛔ THE LADDER ENDS IN "cannot", AND push_now REQUIRES A POSITIVE. Every exclusion is enumerated
   before anything is allowed through, and the bucket that spends nothing and sends nothing is where
   an unestablished lead lands. This is the absent-value rule CLAUDE.md records six instances of: a
   lead whose state we cannot establish must never fall through into the bucket that emails.

   ⚠️ ALREADY IN INSTANTLY MEANS NO AUDIT AND NO PUSH — Paul's rule, and the expensive one to get
   wrong. Instantly already holds them; re-auditing is money spent preparing a pitch already sent. */
type TriageBucket = "push_now" | "needs_audit" | "cannot";

interface TriageRow {
  lead_id: string;
  business_name: string;
  bucket: TriageBucket;
  /** Empty for the two working buckets; on `cannot` it is what goes on screen, verbatim. */
  reason: string;
  /* ⛔ WHETHER THIS RUN ACTUALLY TOUCHES IT. The bucket says what the lead NEEDS; will_run says
     whether the cap leaves room for it. Keeping them apart is the fix for a confirm line that read
     "Push 25 leads, auditing 138 first (~$13.97)" — quoting the cost of auditing 138 for a job that
     would audit 25. A 5x overstatement on the one number that decides whether Paul presses.
     It is computed HERE so the dialog cannot compute it differently: the cost, the counts and the
     job's own item list are all read off this single field. */
  will_run: boolean;
}

// deno-lint-ignore no-explicit-any
async function triageForPush(service: any, userId: string, leadIds: string[], cap: number, skipAudit = false): Promise<TriageRow[]> {
  if (!leadIds.length) return [];
  /* ⛔ CHUNKED, FOR THE SAME REASON backfill-lead-towns is. This takes the operator's RAW
     selection, so it is unbounded: 316 leads (~11,700 URL bytes) worked on 2026-08-08 and 400
     (~14,800) is measured to fail outright. That was luck. See _shared/chunked-in.ts. */
  const rowsAll = await selectInChunks<Record<string, string | null>>(leadIds, (chunk) => service
    .from("outreach_leads")
    .select("id, business_name, email, phone, instantly_pushed_at, search_keyword, category, search_location, address, derived_town, town_fetch_note")
    .eq("user_id", userId)
    .in("id", chunk)
    .order("id", { ascending: true }));
  /* ⛔ A STABLE ORDER, because the cap slices this list. Without it the preview and the create —
     two separate queries — could pick DIFFERENT 25 leads and the confirm would describe a job that
     never ran. Sorted HERE rather than relying on the database, because chunked reads arrive in
     chunk order and a per-chunk ORDER BY does not order the whole. */
  const leads = rowsAll.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!leads.length) return [];

  /* WHICH LEADS ALREADY HAVE AN ANSWERED AUDIT. Two reads rather than a join, because the
     relationship name is not guaranteed and a wrong embed returns rows with the field silently
     absent — which would read as "nobody has an audit" and put the whole selection into needs_audit.
     ⚠️ `capped` counts as answered, exactly as resolveAwaiting and the audit-reply resolver treat
     it: a capped run has real answers, just fewer than asked for. */
  const { data: auditRows } = await service
    .from("ai_audits").select("id, lead_id").in("lead_id", leads.map((l) => l.id as string));
  const audits = (auditRows ?? []) as Array<{ id: string; lead_id: string }>;
  const answeredAuditIds = new Set<string>();
  if (audits.length) {
    const { data: runRows } = await service
      .from("ai_audit_runs").select("audit_id")
      .in("audit_id", audits.map((a) => a.id))
      .in("status", ["complete", "capped"]);
    for (const r of (runRows ?? []) as Array<{ audit_id: string }>) answeredAuditIds.add(r.audit_id);
  }
  const leadHasAnsweredAudit = new Set(
    audits.filter((a) => answeredAuditIds.has(a.id)).map((a) => a.lead_id),
  );

  /* Suppression, in slices — checkSuppressed is several reads each and the cap is 25. */
  const suppressed = new Map<string, string>();
  const SLICE = 8;
  for (let i = 0; i < leads.length; i += SLICE) {
    const slice = leads.slice(i, i + SLICE);
    const hits = await Promise.all(slice.map((l) =>
      checkSuppressed(service, { phone: l.phone, email: l.email, leadId: l.id as string })));
    hits.forEach((h, k) => { if (h.suppressed) suppressed.set(slice[k].id as string, h.matchedOn ?? "?"); });
  }

  /* The bucket decision, before the cap has an opinion. Separating the two is the point. */
  type GradedRow = Omit<TriageRow, "will_run">;
  const graded = leads.map((l): GradedRow => {
    const id = l.id as string;
    const name = (l.business_name ?? "").trim() || "(no name)";
    const cannot = (reason: string): GradedRow => ({ lead_id: id, business_name: name, bucket: "cannot", reason });

    /* Suppression is checked FIRST, before "already pushed". A lead that is both should be reported
       as the one that matters: someone who has said no, not an administrative dedupe. */
    const supp = suppressed.get(id);
    if (supp) return cannot(`suppressed — they have said no (matched on ${supp})`);
    if (l.instantly_pushed_at) return cannot("already in Instantly — no audit, no push");
    /* ⛔ THE TOWN GATE — before the email rung, because "we cannot truthfully say where this
       business is" outranks "we cannot reach them yet". Fires ONLY on the settled-unverifiable
       verdict; an unchecked town passes (absence is never an answer). Paul's rule, 2026-08-14:
       money and messages never move on an unverified town. */
    if (townGated(l)) return cannot(TOWN_GATE_REASON);
    if (!String(l.email ?? "").trim()) return cannot("no email address — run Find emails first");

    /* ⛔ NO-AUDIT MODE: THE LADDER STOPS HERE (Paul, 2026-09-09). The email dropped
       {{competitors}}, which was the only thing an audit contributed, so a lead that clears
       suppression, the already-pushed stamp, the town gate and has an email is ready to upload —
       there is nothing left to buy.
       ⚠️ THE TRADE AND TOWN ARE STILL REQUIRED, for a different reason than before. They used to be
       "can this be audited"; they are now MERGE FIELDS, and a lead missing one sends an email with
       a hole in the sentence. Same test, honest new wording — and it mirrors instantlyVarsFor,
       which refuses the same lead at the push itself. Two checks agreeing is deliberate: this one
       makes the confirm dialog truthful before anything runs. */
    const type = (l.search_keyword || l.category || "").trim();
    if (skipAudit) {
      const mergeTown = (l.derived_town || l.search_location || "").trim();
      if (!type) return cannot("no trade stored — the email's {{trade}} would be blank");
      if (!mergeTown) return cannot("no town stored — the email's {{city}} would be blank");
      return { lead_id: id, business_name: name, bucket: "push_now", reason: "" };
    }

    if (leadHasAnsweredAudit.has(id)) return { lead_id: id, business_name: name, bucket: "push_now", reason: "" };

    /* An audit needs a business type and a town. Sourced the same way the wizard and the existing
       bulk audit source them, so a lead auditable here is auditable there. */
    const town = (l.search_location || l.address || "").trim();
    if (!type || !town) return cannot("no business type or town stored, so there is nothing to audit");

    return { lead_id: id, business_name: name, bucket: "needs_audit", reason: "" };
  });

  /* ── THE CAP, APPLIED ONCE ──────────────────────────────────────────────────────────
     ⚠️ ALREADY-AUDITED LEADS TAKE THE CAP FIRST. They cost nothing and go out in this run's upload,
     so spending the budget on them before buying any audit gets the most email sent per run. The
     old code sliced the two buckets together in database order, which meant a run could spend its
     whole cap auditing while ready-to-send leads waited for a second pass. */
  const order = (r: { bucket: TriageBucket }) => (r.bucket === "push_now" ? 0 : r.bucket === "needs_audit" ? 1 : 2);
  const ranked = graded.map((r, i) => ({ r, i })).sort((a, b) => order(a.r) - order(b.r) || a.i - b.i);
  let room = Math.max(0, cap);
  const willRun = new Set<string>();
  for (const { r } of ranked) {
    if (r.bucket === "cannot") continue;
    if (room <= 0) break;
    willRun.add(r.lead_id);
    room--;
  }
  return graded.map((r) => ({ ...r, will_run: willRun.has(r.lead_id) }));
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
async function runItem(service: any, job: JobRow, item: JobItem): Promise<{ status: JobItem["status"]; error?: string; capHit?: boolean; audit_id?: string; run_id?: string }> {
  // Real vault keys for the gateway (the injected ones are stale) + x-cron-secret for
  // the target handler's isInternal check + x-internal-job.
  const keys = await getInternalKeys(service);
  const internalHeaders = internalHeadersFor(keys);

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

  /* PHASE A of audit_and_push runs through the SAME branch as an ordinary bulk audit — same
     create-ai-audit call, same suppression check, same idempotency guard. Only two things differ,
     and both are stated below rather than inferred from the job type deeper in. */
  if (job.job_type === "audit" || job.job_type === "audit_and_push") {
    // Bulk AI-visibility audit: create ONE queued audit per lead via create-ai-audit's internal
    // branch. create-ai-audit does NO Apify — it just generates the questions and inserts
    // ai_audit_queue rows; the existing 1-min process-ai-audit-queue cron drains them under its
    // own concurrency/cost caps. So this branch only enqueues — it never fires Apify directly.
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, search_keyword, category, search_location, address, country, website, phone, email, is_archived, derived_town, town_fetch_note")
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

    /* ⛔ THE TOWN GATE, same rung as triage so the preview and the run cannot disagree. An audit of
       an unverifiable-town lead would fall back to search_location — the searched town, the exact
       wrong-town fault (Wilson's, RG). "skipped", not "failed": nothing is wrong with the item, the
       lead is held until its town verifies, and a failed status would invite a retry. */
    if (townGated(lead)) {
      console.log(`[bulk-jobs] audit skipped for town-unverified lead ${lead.id}`);
      return { status: "skipped_town_unverified", error: TOWN_GATE_REASON };
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
    const paramSkipSeo = (job.params as { skip_seo?: unknown } | null)?.skip_seo === true;
    /* ⛔ audit_and_push ALWAYS SKIPS THE SEO SCAN. Paul's decision and the one that sets the price:
       the email's hook is who AI names instead of them, and it carries no website grade at all, so a
       $0.04 Apify scan per lead would be bought and never read. 25 leads = $1.00 of nothing. */
    const skipSeo = paramSkipSeo || job.job_type === "audit_and_push";
    /* ⚠️ BUT IT IS NOT A MARKET BATCH. purpose:'market' turns on cross-audit intent coverage, which
       is right for the market panel and wrong for outreach. It stays keyed on the PARAM — the thing
       only the market panel sends — not on the derived skipSeo above. Deriving both from one flag is
       how an unrelated behaviour would have hitched a ride on a cost decision. */
    const marketPurpose = paramSkipSeo && job.job_type === "audit";

    /* ══ TRY THE TOWN'S MARKET AUDIT FIRST — £0 INSTEAD OF ~8p ═════════════════════════════════
       ⛔ WHAT THIS REPLACES. Phase A bought a separate audit per business: 3 questions ($0.031) plus
       the extract-competitors cleaner ($0.070) = ~8p each, ~£2.00 for a 25-lead batch — while ONE
       market audit of the same trade and town costs 12p and covers every business in it. derive-audit
       copies that audit's stored answers into a real audit row for this lead, recomputing `named`
       against the prospect's own name, so the report is about them and nothing is re-measured.

       ⛔ EVERY REFUSAL FALLS THROUGH TO THE PAID AUDIT, and there are several: no_market_audit (the
       town was never measured), market_audit_unfinished, no_trade_or_town, name_not_distinctive
       (canDeriveReport refuses a name that is only its trade and town — common for accountants), and
       too_few_answers. A refusal is NOT a skip: the lead still gets audited, just at full price. A
       missing market audit therefore degrades this whole batch to exactly its old behaviour and cost,
       which is the point — no crash, no lead left un-audited, no silent gap in the push.

       ⛔ AND A DERIVED AUDIT IS `done_audit`, NOT `done`. It returns a COMPLETED run immediately (no
       queue, no cron), so unlike create-ai-audit there is nothing to wait for — but on
       audit_and_push the item must still hand over to phase B rather than complete. resolveAwaiting
       owns that transition; returning the same shape create-ai-audit's success returns keeps both job
       types on one path.
       ⚠️ SAME INTERNAL HEADERS as the create-ai-audit call below, and acting_user_id is the JOB's
       owner — derive-audit requires it on the internal branch and scopes every read to it. */
    if (DERIVE_FIRST) {
      try {
        const dres = await fetch(`${SUPABASE_URL}/functions/v1/derive-audit`, {
          method: "POST",
          headers: internalHeaders,
          body: JSON.stringify({ lead_id: lead.id, acting_user_id: job.user_id }),
        });
        const dbody = await dres.json().catch(() => ({})) as {
          ok?: boolean; error?: string; audit_id?: string; run_id?: string;
          named_datapoints?: number; total_datapoints?: number;
        };
        if (dres.ok && dbody?.ok === true && dbody.audit_id) {
          console.log(
            `[bulk-jobs] lead ${lead.id}: DERIVED from the town's market audit `
            + `(${dbody.named_datapoints ?? "?"}/${dbody.total_datapoints ?? "?"} named, $0 spent) — no paid audit.`,
          );
          /* ⛔ THE SAME SHAPE create-ai-audit's SUCCESS RETURNS, snake_case included. resolveAwaiting
             looks the run up by `audit_id` off the item, so a camelCase key here would store nothing
             and the item would wait for a run it could never find — an audit paid for (or in this
             case derived) and a push that never happens. */
          return {
            status: "awaiting_audit",
            audit_id: String(dbody.audit_id),
            run_id: dbody.run_id ? String(dbody.run_id) : undefined,
          };
        }
        console.log(
          `[bulk-jobs] lead ${lead.id}: not derivable (${dbody?.error ?? `HTTP ${dres.status}`})`
          + ` — running a paid audit instead.`,
        );
      } catch (e) {
        /* Unreachable derive-audit must never cost a lead its audit. Fall through and pay. */
        console.warn(`[bulk-jobs] lead ${lead.id}: derive-audit call failed, falling back to a paid audit: ${(e as Error).message}`);
      }
    }

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
        ...(marketPurpose ? { purpose: "market" } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    /* ⛔ NOT done — awaiting_audit. create-ai-audit returning ok means the QUESTIONS EXIST, not that
       they have been answered; the answering happens later on the process-ai-audit-queue cron. See
       the JobItem comment: claiming done here is what made two pushes return 0. */
    if (data?.ok && data?.audit_id) {
      return {
        status: "awaiting_audit",
        audit_id: String(data.audit_id),
        run_id: data.run_id ? String(data.run_id) : undefined,
      };
    }
    /* ⚠️ PREFER THE MESSAGE OVER THE CODE. create-ai-audit's distance guard returns 409 with
       error:"business_not_in_town" plus a sentence naming the distance and the town. Reporting only
       the code would put "business_not_in_town" on a job item and make Paul look it up — the same
       catch-all-error fault as the AI Audit page's old hardcoded line. */
    const why = String(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    return { status: "failed", error: why.slice(0, 200) };
  }

  /* ⛔ NO OTHER JOB TYPE EXISTS, AND AN UNKNOWN ONE FAILS LOUDLY RATHER THAN SILENTLY.
     site_gen used to be the fall-through branch here, so anything that was not enrich and not an
     audit quietly generated a barber website. With it deleted (2026-09-09) the honest answer to an
     unrecognised job_type is a failed item naming the type — never a default action. */
  return { status: "failed", error: `unknown job type: ${String(job.job_type).slice(0, 40)}` };
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
  const waiting = job.items.filter((it) => it.status === "awaiting_audit" && (it.run_id || it.audit_id));
  if (!waiting.length) return { done: 0, failed: 0 };

  /* Look up THIS attempt's run wherever we have its id. Falling back to audit_id is only for items
     enqueued before run_id was stored, and even then the run must be NEWER than the job — otherwise
     a pre-existing capped run answers for an attempt that has not finished. */
  const runIds = [...new Set(waiting.map((it) => it.run_id).filter(Boolean))] as string[];
  const auditIds = [...new Set(waiting.filter((it) => !it.run_id).map((it) => it.audit_id!))];
  const byRun = new Map<string, string>();
  const byAudit = new Map<string, string[]>();
  if (runIds.length) {
    const { data } = await service.from("ai_audit_runs").select("id, status").in("id", runIds);
    for (const r of (data ?? []) as Array<{ id: string; status: string }>) byRun.set(r.id, r.status);
  }
  if (auditIds.length) {
    const { data } = await service.from("ai_audit_runs")
      .select("audit_id, status, created_at").in("audit_id", auditIds)
      .gte("created_at", job.created_at);
    for (const r of (data ?? []) as Array<{ audit_id: string; status: string }>) {
      if (!byAudit.has(r.audit_id)) byAudit.set(r.audit_id, []);
      byAudit.get(r.audit_id)!.push(r.status);
    }
  }
  /* ══ A CAPPED RUN IS NOT AUTOMATICALLY A FINISHED AUDIT ═════════════════════════════════
     ⛔ THE ASSUMPTION THAT WAS WRONG. This code accepted 'capped' on the reasoning that "a capped
     run has real answers, just fewer than asked for". That is true of a run stopped PART WAY. It is
     false of a run that never started a single question — and on 2026-08-08 that was every one of
     ten: 30 queue rows, all failed, zero answers, $0.0000 spent.
     They were handed to phase B as though audited. instantly-push then refused them with "The audit
     named no competitors yet" — a TRUE statement about a FALSE premise, which sent Paul looking at
     competitor extraction when the cause was queue concurrency two layers up.
     ⚠️ So: for a capped run, ASK WHETHER ANY QUESTION WAS ANSWERED. One extra query, and only for
     capped runs, which are rare. A complete run is not questioned — it is complete by definition. */
  const cappedRunIds = waiting
    .filter((it) => it.run_id && (byRun.get(it.run_id) === "capped"))
    .map((it) => it.run_id!) as string[];
  const answeredByRun = new Map<string, number>();
  if (cappedRunIds.length) {
    const { data: qrows } = await service
      .from("ai_audit_queue").select("run_id, status").in("run_id", cappedRunIds);
    for (const r of (qrows ?? []) as Array<{ run_id: string; status: string }>) {
      if (r.status === "done") answeredByRun.set(r.run_id, (answeredByRun.get(r.run_id) ?? 0) + 1);
    }
    /* ⚠️ A run with no rows AT ALL reads as zero answered, which is the honest reading: we cannot
       show it answered anything. Absence is not evidence of a completed audit. */
    for (const id of cappedRunIds) if (!answeredByRun.has(id)) answeredByRun.set(id, 0);
  }

  const ageMs = Date.now() - new Date(job.created_at ?? Date.now()).getTime();
  let done = 0, failed = 0;
  for (const it of waiting) {
    const sts = it.run_id
      ? (byRun.has(it.run_id) ? [byRun.get(it.run_id)!] : [])
      : (byAudit.get(it.audit_id!) ?? []);
    /* ⛔ THE ZERO-ANSWER CAPPED RUN. Fail the item HERE, naming the real cause, rather than passing
       it to a push that can only report the symptom. Nothing was spent — the audit never ran — so
       this is a retry candidate, and the message says so. */
    if (it.run_id && byRun.get(it.run_id) === "capped" && (answeredByRun.get(it.run_id) ?? 0) === 0) {
      it.status = "failed";
      it.error = "audit did not run — the audit queue was full or its cost cap was reached, and no question was answered. Nothing was spent; select this lead and run it again.";
      failed++;
      continue;
    }
    if (sts.some((x) => x === "complete" || x === "capped")) {
      /* ⛔ CLEAN THE NAMES BEFORE ANYTHING READS THEM. The regex extractor that runs at audit time
         grabs prose fragments — "Located" reached a live report, and HMRC/Xero/QuickBooks reached
         the frequency list. The SAME names feed {{competitors}} in an Instantly email, so a junk
         fragment does not just look sloppy on a document, it goes out in a sentence claiming those
         are the businesses AI names instead of them.
         Measured 2026-08-08: 1 of 9 pushed leads carried a non-business in its variable, and 20 of
         181 extracted names for that one lead were junk.
         The LLM cleaner is proven — Wisbech driving instructors went from 251 junk-laden names to
         36 real driving schools. ~5.5p a run, which against a document whose entire argument is
         honest measurement is not a cost worth weighing.
         ⚠️ Fired HERE, at the moment the run is first known to be finished, so it runs exactly once
         per run and before the push step or a prospect can read the report.
         ⚠️ Fully guarded: a failed clean must never fail the audit item. Dirty names are worse than
         clean ones, but a lost audit is worse than both. */
      if (it.run_id) {
        try {
          const cr = await fetch(`${SUPABASE_URL}/functions/v1/extract-competitors`, {
            method: "POST",
            headers: internalHeadersFor(await getInternalKeys(service)),
            body: JSON.stringify({ runId: it.run_id }),
          });
          console.log(`[bulk-jobs] cleaned names for run ${it.run_id}: HTTP ${cr.status}`);
        } catch (e) {
          console.error(`[bulk-jobs] name clean failed for run ${it.run_id} (audit kept):`, (e as Error).message);
        }
      }
      /* ⛔ A FINISHED AUDIT IS NOT A FINISHED ITEM ON audit_and_push — it is the HANDOVER to phase
         B. Marking it `done` here would be the same lie in a new place: the counter would read
         complete while the lead had been audited and never pushed, which is the exact outcome
         (paid for the audit, no email sent) this job type exists to prevent.
         Back to `pending` in phase `push`, and the done counter is NOT incremented — `done` on this
         job type means pushed, and nothing else. */
      if (job.job_type === "audit_and_push") {
        it.status = "pending"; it.phase = "push"; continue;
      }
      it.status = "done"; done++; continue;
    }
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

/* ══ PHASE B — THE PUSH ══════════════════════════════════════════════════════════════════
   ONE call for the whole job, not one per item: Instantly's bulk add takes an array, so a per-item
   loop would be 25 HTTP calls to accomplish exactly what one does. It runs only once every phase-A
   item has resolved, so a single upload carries the leads that were already ready together with the
   ones this job just audited.

   ⛔ EVERY ITEM IS ACCOUNTED FOR BY ID, AND AN UNEXPLAINED ITEM FAILS. instantly-push applies its
   own gates — suppression, the completed-audit requirement, the already-pushed stamp — and it is the
   authority on who was actually emailed. So the outcome is mapped from ITS id lists, and a lead that
   appears in none of them is marked failed with "gave no reason" rather than assumed successful.
   Assuming would mean the operator reads "pushed" for a lead Instantly never took. */
// deno-lint-ignore no-explicit-any
async function runPushPhase(service: any, job: JobRow): Promise<{ pushed: number; failed: number; skipped: number }> {
  const ready = job.items.filter((it) => it.status === "pending" && it.phase === "push");
  if (!ready.length) return { pushed: 0, failed: 0, skipped: 0 };

  let pushed = 0, failed = 0, skipped = 0;
  const failAll = (why: string) => {
    for (const it of ready) { it.status = "failed"; it.error = why.slice(0, 200); failed++; }
  };

  const campaignId = String((job.params as { campaign_id?: unknown } | null)?.campaign_id ?? "").trim();
  if (!campaignId) { failAll("no Instantly campaign on the job"); return { pushed, failed, skipped }; }

  let data: Record<string, unknown> = {};
  let httpStatus = 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/instantly-push`, {
      method: "POST",
      headers: internalHeadersFor(await getInternalKeys(service)),
      body: JSON.stringify({
        mode: "push",
        /* The actor, for instantly-push's internal branch. It is the job's OWNER — the user whose
           JWT created the job and whose leads create already filtered the selection down to. */
        acting_user_id: job.user_id,
        campaign_id: campaignId,
        /* ⛔ THE MODE TRAVELS WITH THE CALL, rather than instantly-push inferring it. The job knows
           whether an audit was asked for; the push function should not have to guess from whether
           the leads happen to have one.
           ⚠️ THE TWO SIDES DEFAULT DIFFERENTLY, ON PURPOSE. instantly-push defaults to NO audit —
           that is Paul's instruction for the flow. This defaults to REQUIRING one, because a job
           without `skip_audit` is a job created before this change, whose phase A has already
           bought the audits; pushing it as though it had not would silently discard work already
           paid for. New jobs from the dialog always send skip_audit explicitly, so this branch only
           ever governs a job that was already in flight. */
        require_audit: (job.params as { skip_audit?: unknown } | null)?.skip_audit !== true,
        lead_ids: ready.map((it) => it.lead_id),
      }),
    });
    httpStatus = res.status;
    data = await res.json().catch(() => ({})) as Record<string, unknown>;
  } catch (e) {
    failAll(`push call failed: ${(e as Error).message}`);
    return { pushed, failed, skipped };
  }

  if (httpStatus !== 200 || data?.success !== true) {
    failAll(`push failed (HTTP ${httpStatus}): ${String(data?.error ?? "no error given")}`);
    return { pushed, failed, skipped };
  }

  /* ⛔ A MISSING pushedIds IS A FAILURE, NOT A REASON TO GUESS. It means instantly-push is deployed
     at a version older than this job type, which is a REAL state during a rollout — deploy
     instantly-push first and it never happens. Reading absence as "they all went" is the
     absent-value fault; reading it as "none went" would invite a retry. So: fail loudly, and note
     that no retry can double-send because instantly_pushed_at is already stamped on whatever went. */
  if (!Array.isArray(data.pushedIds)) {
    failAll("instantly-push did not return pushedIds — it is deployed at an older version than this job type; deploy it, then re-run for anything not stamped");
    return { pushed, failed, skipped };
  }

  const pushedIds = new Set<string>((data.pushedIds as string[]).filter((x) => typeof x === "string"));
  const detail = (k: string): Array<{ id: string; reason?: string; matchedOn?: string }> =>
    Array.isArray(data[k]) ? data[k] as Array<{ id: string; reason?: string; matchedOn?: string }> : [];
  const noAudit = new Map(detail("skippedNoAuditDetail").map((d) => [d.id, d.reason ?? "no completed audit"]));
  const supp = new Map(detail("skippedSuppressedDetail").map((d) => [d.id, d.matchedOn ?? "?"]));
  const already = new Set<string>(Array.isArray(data.alreadyPushedIds) ? data.alreadyPushedIds as string[] : []);
  const noEmail = new Set<string>(Array.isArray(data.noEmailIds) ? data.noEmailIds as string[] : []);

  for (const it of ready) {
    const id = it.lead_id;
    if (pushedIds.has(id)) { it.status = "pushed"; pushed++; continue; }
    if (supp.has(id)) { it.status = "skipped_suppressed"; it.error = `suppressed (${supp.get(id)})`; skipped++; continue; }
    if (already.has(id)) { it.status = "skipped_existing"; it.error = "already in Instantly"; skipped++; continue; }
    if (noEmail.has(id)) { it.status = "skipped_ineligible"; it.error = "no email address"; skipped++; continue; }
    /* ⛔ THE AUDIT WAS RUN AND THE PUSH STILL REFUSED. Worth its own wording because it is the one
       outcome that cost money and produced nothing — usually a run that finished with no usable
       competitor names. failed, not skipped: something did go wrong and it should read that way. */
    if (noAudit.has(id)) { it.status = "failed"; it.error = `not pushed — ${noAudit.get(id)}`; failed++; continue; }
    it.status = "failed";
    it.error = "not pushed — Instantly did not take this lead and gave no reason";
    failed++;
  }
  return { pushed, failed, skipped };
}

// deno-lint-ignore no-explicit-any
async function processChunk(service: any, job: JobRow): Promise<void> {
  const started = Date.now();
  const items = job.items;
  let done = job.done_count, failed = job.failed_count, skipped = job.skipped_count;
  let capHit = false;
  // enrich stays 1-at-a-time (its $2/day cap lives inside enrich-business). audit runs a
  // small parallel wave (each item is just a fast create-ai-audit call that generates
  // questions + enqueues ai_audit_queue rows — NO Apify here), so the whole batch enqueues
  // within a tick or two. The actual multi-engine drain is throttled downstream by
  // process-ai-audit-queue (START_BATCH 12 < 32 ceiling), so a burst can't overrun Apify.
  const concurrency = job.job_type === "audit" ? 4 : 1;

  // Recover orphaned in-flight items from a prior chunk that crashed/timed-out mid-wave
  // (a clean chunk boundary never leaves "running").
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
    for (const it of items) if (isRunnable(it)) { it.status = "skipped_cap"; skipped++; }
  };

  /* ⛔ A PHASE-B ITEM IS PENDING BUT NOT RUNNABLE HERE. runItem knows how to audit; the push is one
     batched call made after every audit has resolved. Without this the drain below would hand a
     phase-`push` item to the audit branch and pay to re-audit a lead that was ready to send. */
  const isRunnable = (it: JobItem) =>
    it.status === "pending" && !(job.job_type === "audit_and_push" && it.phase === "push");

  while (true) {
    const pending = items.filter(isRunnable);
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

    const wave = pending.slice(0, Math.min(concurrency, pending.length));

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
        if (r.run_id) it.run_id = r.run_id;
        /* awaiting_audit counts as NOTHING yet — not done, not failed, not skipped. It is resolved
           on a later chunk by resolveAwaiting, which increments the right counter then. Counting it
           here is precisely the bug: the totals would read complete while the work was outstanding. */
        if (r.status === "awaiting_audit") { /* pending resolution */ }
        else if (r.status === "done" || r.status === "cached") done++;
        else if (r.status === "failed") failed++;
        else skipped++; // skipped_cap / skipped_existing / skipped_suppressed / skipped_town_unverified
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

  /* ══ PHASE A IS COMPLETE — PUSH ════════════════════════════════════════════════════════
     Reached only when no item is pending and none is awaiting an audit, i.e. every lead that needed
     auditing has an answered run. A job with nothing to push (every item triaged `cannot`, or every
     audit failed) finds an empty `ready` list and returns zeros — it must still fall through to the
     finish below rather than sitting queued forever. */
  if (job.job_type === "audit_and_push") {
    const r = await runPushPhase(service, job);
    done += r.pushed; failed += r.failed; skipped += r.skipped;
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

  /* Hoisted so the catch at the bottom can describe WHAT failed, not just that something did.
     Both are assigned as the first thing inside the try. */
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  // deno-lint-ignore no-explicit-any
  let serviceForErr: any = null;

  try {
    body = await req.json().catch(() => ({}));
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
    serviceForErr = service;

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

    /* ══ TRIAGE PREVIEW — WHAT WOULD HAPPEN, BEFORE ANYTHING HAPPENS ════════════════════════════
       Read-only: no job row, no spend, no email. The confirm dialog renders exactly this, and
       `create` re-runs the SAME function on the SAME leads, so what the operator agreed to and what
       the job does cannot disagree. */
    if (action === "triage") {
      const leadIds: string[] = Array.from(new Set((body.lead_ids ?? []).filter((x: unknown) => typeof x === "string")));
      if (!leadIds.length) return json({ error: "lead_ids required" }, 400);
      /* ⛔ THE CAP DEPENDS ON WHETHER ANYTHING IS BEING BOUGHT. 25 exists because audit_and_push
         SPENDS — five questions and a scan per lead. A push with no audit spends nothing at all, so
         capping it at 25 would be a limit with no cost behind it, and the operator would just press
         the button eight times. PUSH_ONLY_CAP is still a cap rather than unbounded, because this
         does email real businesses even when it costs nothing. */
      const skipAudit = body.skip_audit === true;
      const cap = skipAudit ? PUSH_ONLY_CAP : JOB_CAPS.audit_and_push;
      const rows = await triageForPush(service, user.id, leadIds, cap, skipAudit);
      const actionable = rows.filter((r) => r.bucket !== "cannot").length;
      /* ⛔ THIS RUN's NUMBERS, NOT THE SELECTION's. These are what the confirm line quotes and what
         the cost is multiplied by. Derived from will_run so they cannot disagree with the job. */
      const auditsThisRun = rows.filter((r) => r.will_run && r.bucket === "needs_audit").length;
      const pushThisRun = rows.filter((r) => r.will_run).length;
      return json({
        ok: true,
        triage: rows,
        counts: {
          push_now: rows.filter((r) => r.bucket === "push_now").length,
          needs_audit: rows.filter((r) => r.bucket === "needs_audit").length,
          cannot: rows.filter((r) => r.bucket === "cannot").length,
        },
        /* What the job will actually do. */
        audits_this_run: auditsThisRun,
        push_this_run: pushThisRun,
        cap,
        /* How many actionable leads would be left for a second run. Named rather than trimmed
           silently — a cap that quietly drops work reads as "everything was done". */
        over_cap: Math.max(0, actionable - cap),
      });
    }

    if (action === "create") {
      const jobType: string = body.job_type ?? "";
      if (jobType !== "enrich" && jobType !== "audit" && jobType !== "audit_and_push") return json({ error: "invalid job_type" }, 400);
      /* ⛔ READ FROM params, NOT the top-level body — because params is what gets STORED on the job
         row, and the runner reads the mode back from there when phase B calls instantly-push. A
         flag the create call honoured but did not persist would audit at triage time and then
         require an audit at push time. The dialog sends it in params for exactly this reason. */
      const skipAuditCreate = jobType === "audit_and_push"
        && (body.params as { skip_audit?: unknown } | null)?.skip_audit === true;
      const cap = jobType === "audit_and_push" && skipAuditCreate ? PUSH_ONLY_CAP : JOB_CAPS[jobType];
      const leadIds: string[] = Array.from(new Set((body.lead_ids ?? []).filter((x: unknown) => typeof x === "string")));
      if (!leadIds.length) return json({ error: "lead_ids required" }, 400);
      /* audit_and_push caps on ACTIONABLE items, counted after the triage below; every other job
         type caps on the raw selection exactly as before. */
      if (jobType !== "audit_and_push" && leadIds.length > cap) {
        return json({ error: `Too many leads — max ${cap} per ${jobType} job.` }, 400);
      }

      // One active job per user keeps progress unambiguous (and bounds load).
      const { data: existing } = await service
        .from("bulk_jobs")
        .select("id")
        .eq("user_id", user.id)
        .in("status", ["queued", "running"])
        .limit(1);
      if (existing?.length) return json({ error: "You already have a bulk job running — wait for it to finish or cancel it." }, 409);

      // Ownership: keep only the caller's own leads.
      const { data: owned } = await service
        .from("outreach_leads")
        .select("id")
        .eq("user_id", user.id)
        .in("id", leadIds);
      const ownedIds = new Set(((owned ?? []) as { id: string }[]).map((r) => r.id));
      const finalIds = leadIds.filter((id) => ownedIds.has(id));
      if (!finalIds.length) return json({ error: "No owned leads in the selection." }, 400);

      let items: JobItem[];
      let skippedAtCreate = 0;
      if (jobType === "audit_and_push") {
        /* ⛔ THE SAME TRIAGE THE OPERATOR SAW, RE-RUN. Not trusted from the request body: a client
           could send a different split, and the one thing this job must not do is audit or email
           someone the confirm screen listed under "cannot". Re-running also picks up a suppression
           added between the preview and the press. */
        const rows = await triageForPush(service, user.id, finalIds, cap, skipAuditCreate);
        items = rows.map((r): JobItem => {
          if (r.bucket === "cannot") {
            skippedAtCreate++;
            return { lead_id: r.lead_id, status: "skipped_ineligible", error: r.reason };
          }
          if (!r.will_run) {
            /* Over the cap. skipped_cap, with the reason spelled out, so it reads as "left for the
               next run" rather than as a failure or as work that quietly evaporated. */
            skippedAtCreate++;
            return { lead_id: r.lead_id, status: "skipped_cap", error: `over the ${cap}-lead cap — run again for this one` };
          }
          return { lead_id: r.lead_id, status: "pending", phase: r.bucket === "push_now" ? "push" : "audit" };
        });
        if (!items.some((it) => it.status === "pending")) {
          return json({ error: "Nothing to do — every selected lead is already pushed, suppressed, or has no email." }, 400);
        }
      } else {
        items = finalIds.map((lead_id) => ({ lead_id, status: "pending" }));
      }
      const { data: jobRow, error: insErr } = await service
        .from("bulk_jobs")
        .insert({
          user_id: user.id,
          job_type: jobType,
          status: "queued",
          items,
          total: items.length,
          /* Items already terminal at creation must be in the counter from the start, or the
             progress bar reads 0/40 for a job that has already resolved 15 of them. */
          skipped_count: skippedAtCreate,
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
    /* 🔴 THIS USED TO RETURN THE LITERAL STRING "internal" AND console.error THE REAL MESSAGE.
       Paul's 200-lead push failed on 2026-09-09 and NEITHER OF US COULD FIND OUT WHY: the browser
       showed "Edge Function returned a non-2xx status code", the response body said "internal", and
       the actual message went to an edge log — which the Supabase CLI has no way to read (there is
       no `functions logs` subcommand). Exactly the failure CLAUDE.md §4 already records: "an edge
       function's refusal that is only console.error'd is undiagnosable afterwards".
       ⚠️ THE MESSAGE IS SAFE TO RETURN HERE, and that is a judgement rather than an oversight. This
       endpoint is operator-authed — getUser() has already succeeded above, so the only audience is
       Paul. It is not findable-checkout, where the caller is a member of the public and the stored
       message can name Stripe parameters and ids; there the rule is store-the-message-return-the-code
       and it still stands. */
    const why = e instanceof Error ? e.message : String(e);
    console.error("[bulk-jobs] error:", why);
    /* Recorded as well as returned, so a failure nobody was watching is still readable afterwards —
       a toast that has been dismissed is gone. Best-effort: never let the recording fail the
       response, or an error in the error handler hides the error. */
    try {
      await serviceForErr?.from("client_error_reports").insert({
        error_id: "bulk_jobs_unhandled",
        context: { action: String(body?.action ?? "?"), job_type: String(body?.job_type ?? "?"),
                   lead_count: Array.isArray(body?.lead_ids) ? body.lead_ids.length : null,
                   message: why.slice(0, 500), at: new Date().toISOString() },
      });
    } catch { /* best-effort */ }
    return json({ error: why.slice(0, 300) }, 500);
  }
});
