import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { createFreeCheckLead } from "../_shared/free-check-lead.ts";
import { shouldAutoAudit, fireFreeCheckAudit } from "../_shared/free-check-audit.ts";

// findable-onboarding — the PUBLIC backend for findable-site's /onboarding flow
// (verify_jwt = false; the static site calls it with the anon apikey only). Actions:
//
//   prefill     { lead_id }                    → safe prefill fields for a known lead
//                                                (NEVER phone/email — anyone with a report link can call this)
//   submit      { lead_id?, answers{...} }     → save answers; for a KNOWN lead also fire the audit
//   revise      { onboarding_id, ... }         → pre-payment answer changes (refuses paid rows)
//   q2_prefill  { onboarding_id }              → the lead's phone for the post-payment form (PAID rows only)
//   complete_q2 { onboarding_id, answers{...} }→ the post-payment save (paid rows only)
//   status      { lead_id, audit_id }          → the audit's report payload when complete
//                                                (never winnability: not defensible, see auditReport.ts)
//
// COST-TAP LOCKDOWN (this function can trigger Apify/OpenAI spend, so it is deliberately
// strict — a stranger with a random UUID must get nothing):
//   1. Audits fire ONLY for an EXISTING lead (the unguessable lead UUID is the capability
//      token). Generic mode (no lead) saves answers but NEVER fires an audit.
//   2. Already-paid clients are rejected (nothing to sell; no spend to burn).
//   3. Rate-limited per lead: a submission within the last 10 minutes → 429; an audit run
//      created within the last 30 minutes → REUSED (its audit_id is returned; no new run).
//   4. All privileged calls (service role, CRON_SECRET) happen HERE, server-side. The
//      client never sees anything but this function's JSON.
//   5. queue_pitch_on_complete is never sent → false: onboarding NEVER queues a WhatsApp
//      pitch (and the pitchEverSent guards are belt-and-braces behind that).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

import { offerPrice } from "../_shared/offer-price.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID_OR_BEYOND = new Set(["payment_received", "in_delivery", "completed"]);
/* ⛔ "listings_only" IS GONE FROM THE ACCEPTED SET (2026-08-06). It meant directory listings, which
   is work we no longer sell, and the whole consent step was built around it. The replacement asks
   permission for the two things we actually touch: their profile and their pages.
   ⚠️ OLD ROWS KEEP "listings_only". This set validates INBOUND values only, so nothing stored is
   rewritten and the historical answer stays readable as the answer it was. No DDL needed either —
   the column is plain text with no CHECK constraint. */
const GBP_CONSENT = new Set(["yes_all", "pages_only", "discuss"]);
/* ⛔ THE PRECONDITION FOR THE ADD-US STEPS. "Open your profile and add us" is impossible advice for
   someone who has no profile, or whose profile is claimed by an ex-web-company. Asked BEFORE the
   three clicks so the flow can route instead of instructing. */
const GBP_EXISTS = new Set(["yes", "not_claimed", "no", "not_sure"]);
/* ⛔ THREE STATES, AND THE THIRD IS THE POINT. "no_access" is common and it is the only one that
   needs Paul. Two options (done / will do) force someone locked out to lie or stall, and it surfaces
   in week three instead of week one. */
const GBP_STATUS = new Set(["done", "will_do", "no_access"]);
/* ⛔ VERIFIED IS NOT THE SAME QUESTION AS EXISTS, AND GBP_EXISTS CANNOT ANSWER IT. "Yes, and I can
   get into it" is equally true of a profile that is pending verification and of a suspended one —
   claim and access are one thing, verification is another. It matters because an unverified profile
   does not show on Maps or Search: every hour of profile work publishes to nobody, and it is the
   likeliest plain explanation for "AI has never heard of me", since there is nothing of theirs to
   read.
   FOUR STATES BECAUSE FOUR DIFFERENT THINGS HAPPEN: yes proceeds; "pending" is in flight and only
   needs chasing; "no" is a delivery task in its own right and often the most valuable thing we can
   do for them; "not_sure" we check ourselves. Collapsing pending into no would put a chase and a
   piece of work in the same bucket. */
const GBP_VERIFIED = new Set(["yes", "pending", "no", "not_sure"]);
/* Photo READINESS, never files. Nothing in this flow uploads anything, and the Places photo route is
   closed: Maps ToS 3.2.3(a) names "rehost" as a prohibited use of Maps Content, so a profile photo
   cannot legally be put on a client's own website. Asking is the route, not the fallback. */
const PHOTOS_STATUS = new Set(["phone", "online", "none"]);
// Who can change their website — the pages route's dependency (2026-08-04 questionnaire).
const WEBSITE_MANAGER = new Set(["direct_access", "web_company", "owner_only"]);
/* What their site is built on. Stored because it decides how the delivery work is done — WordPress
   has an API and pages can be published to it, Wix and Squarespace mean the editor by hand — so it
   has to be known before a job is quoted. Validated against the set so a hand-crafted POST cannot
   put arbitrary text in the column. */
const WEBSITE_PLATFORM = new Set(["wordpress", "wix", "squarespace", "godaddy", "shopify", "other", "not_sure", "no_website"]);
/* WHETHER WE MAY MOVE THEIR SITE TO OUR HOSTING. ⛔ THE GATE ANSWER — findable-checkout refuses
   payment on it (see src/lib/serveGate.ts), so a row that fails to store this is a customer the
   block can never fire for. Proven by a live end-to-end test 2026-08-05: the column existed and the
   flow sent the value, and it was still silently dropped here, because this function builds its
   insert from an explicit key list and an unlisted key simply vanishes. */
const WILLING_TO_MIGRATE = new Set(["yes", "not_sure", "no"]);
const SUBMIT_COOLDOWN_MS = 10 * 60_000;   // one submission per lead per 10 min

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** A JSON array of trimmed, de-duplicated, length-capped strings — or null when empty.
 *  For the jsonb answer columns (services_list, areas_list): never trust shape from the
 *  public client, and never store an empty array where a NULL reads more honestly. */
const clipList = (v: unknown, maxItems: number, maxLen: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = typeof item === "string" ? item.trim().slice(0, maxLen) : "";
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out.length ? out : null;
};

/**
 * The report payload the onboarding page renders: headline counts, the single most damning answer,
 * the SEO grade, and whether they have a website at all. ONE implementation, used by `submit`
 * (which now returns it inline from the lead's existing run) and by `status` (kept for any client
 * still polling). Returns null when the run has not produced renderable data.
 */
// deno-lint-ignore no-explicit-any
async function buildReportPayload(service: any, audit: any, run: RunRow): Promise<Record<string, unknown> | null> {
  const { data: qrows } = await service
    .from("ai_audit_queue").select("id, question, status, result")
    .eq("run_id", run.id).order("created_at", { ascending: true });
  const data = buildReportData((qrows ?? []) as QueueRow[], run, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
    ownWebsite: audit.website ?? "",
    seoStyle: seoStyleForAudit(audit.baseline_target_runs, (audit as { is_measurement?: unknown }).is_measurement),
  });
  if (!data) return null;

  const seo = data.seo
    ? {
        overall_grade: (data.seo as { overallGrade?: string }).overallGrade ?? null,
        categories: (data.seo as { categories?: unknown }).categories ?? null,
        findings: ((data.seo as { leadFindings?: unknown[] }).leadFindings ?? [])
          .slice(0, 4)
          .map((f) => {
            const x = f as { title?: string; detail?: string; severity?: string };
            return { title: x.title ?? "", detail: x.detail ?? "", severity: x.severity ?? "low" };
          }),
      }
    : null;

  const gp = data.gutPunch;
  const gutPunch = gp
    ? { question: gp.question, engine: gp.engineLabel, rivals: (gp.rivals ?? []).slice(0, 3) }
    : null;

  // The date the run was MEASURED, so the page can be honest that this is an earlier check
  // rather than something happening now.
  const measuredAt = run.created_at ?? null;

  return {
    business_name: data.businessName,
    named: data.named,
    total: data.total,
    gut_punch: gutPunch,
    has_website: audit.has_website === true,
    seo,
    measured_at: measuredAt,
  };
}

/** Record why a free-check audit did not run. client_error_reports is the same table
 *  findable-checkout writes its refusals to, so every "the funnel did nothing" reason lands in
 *  one readable place. Never throws: the visitor has already had their answer. */
async function recordAuditOutcome(
  // deno-lint-ignore no-explicit-any
  service: any,
  errorId: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await service.from("client_error_reports").insert({
      error_id: errorId,
      context: { ...context, at: new Date().toISOString() },
    });
    if (error) console.error(`[findable-onboarding] could not record ${errorId}: ${error.message}`);
  } catch (e) {
    console.error(`[findable-onboarding] could not record ${errorId}:`, e instanceof Error ? e.message : e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action: string = typeof body.action === "string" ? body.action : "";
    const leadId: string | null =
      typeof body.lead_id === "string" && UUID_RE.test(body.lead_id.trim()) ? body.lead_id.trim() : null;

    // ── prefill ─────────────────────────────────────────────────────────────────
    if (action === "prefill") {
      if (!leadId) return json({ ok: false, error: "unknown_lead" }, 404);
      const { data: lead } = await service
        .from("outreach_leads")
        /* ⚠️ derived_town ADDED WITH THE PRE-FILL THAT READS IT. Selecting it is not optional
           bookkeeping: `lead.derived_town` on a row that never fetched the column is undefined, so
           the precedence below would have fallen straight through to search_location and the change
           would have looked applied while doing nothing. Verified present on outreach_leads. */
        /* ⚠️ user_id IS SELECTED FOR THE PAGE-HIT LOG BELOW, nothing else reads it here. It is
           copied onto the hit row because lead_page_hits is owner-scoped by RLS — without it the
           dashboard read would return an empty array rather than an error, which is this project's
           most expensive recurring failure. */
        .select("id, user_id, business_name, category, search_keyword, search_location, derived_town, address, status, amount_paid")
        .eq("id", leadId).maybeSingle();
      if (!lead) return json({ ok: false, error: "unknown_lead" }, 404);

      /* ── THE PAGE HIT ───────────────────────────────────────────────────────────
         ⛔ THIS IS THE ONLY RECORD ANYWHERE THAT A PROSPECT REACHED THE SITE. Report opens are on
         ai_audits, questionnaire SUBMISSIONS are onboarding_responses rows — the landing between
         them was invisible, so no template could ever be credited with driving a click. prefill is
         the right hook because it is called once per page load with the lead id from ?lead=, and it
         is a read: nothing else about this request changes.

         ⛔ IT IS LOGGED BEFORE THE already_client GATE, DELIBERATELY. A paid customer returning to
         the page is still a real visit, and gating the log on the response would make the metric
         mean "visits by people who had not yet paid" while being labelled "visits".

         ⚠️ FIRE-AND-FORGET, AND IT CAN NEVER FAIL THE REQUEST. Wrapped so that a missing table (the
         SQL not yet run), an RLS surprise or any Postgres error costs nothing: the visitor still
         gets their prefill. Deploy order therefore does not matter — before the SQL runs this is a
         silent no-op, after it the rows simply start appearing.
         ⚠️ ONE ROW PER PAGE LOAD, NOT PER VISITOR. A reload writes a second row on purpose: every
         consumer counts DISTINCT LEADS, so duplicates cost nothing, and deduping here would need a
         read on the hot path to save a few bytes. */
      try {
        await service.from("lead_page_hits").insert({
          lead_id: lead.id,
          user_id: (lead as Record<string, unknown>).user_id,
          page: "onboarding",
        });
      } catch { /* never blocks the prefill — see above */ }

      if (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0) {
        return json({ ok: false, error: "already_client" }, 403);
      }
      /* ⛔ THE PRICE COMES BACK WITH THE PREFILL, FROM THE SAME FUNCTION THAT CHARGES IT. The plan
         card used to render findable-site's own SETUP_PRICE_GBP — a second constant in a second repo,
         a mirror that has already drifted once. Now the display and the charge have one source, so
         they cannot disagree: whatever this says, findable-checkout puts in the Stripe session.
         ⚠️ SAFE TO EXPOSE. It reveals only what the customer is about to be shown anyway, and it is
         advisory: the flow renders it, but the charge is re-derived server-side at checkout, so a
         tampered response buys nothing. */
      const offer = offerPrice();
      // SAFE subset only — never expose phone/email/notes/owner to the public page.
      return json({
        ok: true,
        price_gbp: offer.gbp,
        price_label: offer.label,
        /* `is_founder` went with the price split (2026-09-03). The page never read it - it renders
           price_label only - so nothing visible changes. */
        business_name: lead.business_name ?? "",
        business_type: ((lead.category as string) || (lead.search_keyword as string) || "").trim(),
        /* ⛔ derived_town FIRST, AND THAT ORDER IS THE WHOLE POINT NOW. This used to be
           search_location || address — the town that was SEARCHED, not the town the business is in.
           Lead search has a radius, so the two often differ: 31 of 44 measurable audits were more
           than 10km from the town they were measured against, one of them a locksmith with
           Northampton in its own name asked about Spalding (CLAUDE.md §6b).
           That was tolerable while this value was only a placeholder somebody retyped. Since the
           split it is the PRE-FILL ON THE FIELD THAT BECOMES confirmed_location — the town the
           guarantee is measured on — so a wrong guess is a wrong measurement that a customer
           confirms by pressing Continue. derived_town is Google's structured address for the
           business itself, which is the answer this field is asking for.
           Matches the audit chain's own precedence: confirmed_location || derived_town ||
           search_location. */
        location_guess: ((lead.derived_town as string) || (lead.search_location as string) || (lead.address as string) || "").trim(),
      });
    }

    /* ── revise ─────────────────────────────────────────────────────────────────
       ONE FIELD, ONE ROW, NOTHING ELSE. A visitor who was blocked can change their mind about moving
       the site, and the refusal screen now offers that in place rather than sending them to email.

       ⛔ DELIBERATELY NOT "make submit idempotent". Submit carries a 10-minute cooldown, the audit
       trigger and the required-field checks; routing a one-field change through it would put all
       three at risk, and a re-submit would create a SECOND row - which the notifier would then email
       Paul about twice for one person.

       ⛔ IT CAN ONLY EVER WRITE "not_sure", NOT "yes". serveDecision blocks only on an explicit
       "no", so not_sure is enough to unblock and is the honest record of what they actually said.
       Accepting "yes" here would let a client-side call record an agreement the customer never gave,
       on the exact column findable-checkout reads to decide whether they may pay. This endpoint
       resolves a block; it must never be able to bypass one.

       ⚠️ THE SERVER IS STILL THE GATE. findable-checkout re-derives the verdict from the STORED
       row, so this endpoint changing a value is what unblocks payment - not the client saying so.
       A forged call with a made-up onboarding_id updates nothing (the id must exist), and a forged
       willing_to_migrate value is rejected before it reaches the database.

       ⚠️ PAID ROWS ARE REFUSED. Once money has changed hands the migrate answer is part of what
       was agreed, and letting an anonymous caller edit it after the fact is not a hole worth
       leaving open. */
    if (action === "revise") {
      const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id : "";
      if (!UUID_RE.test(onboardingId)) return json({ ok: false, error: "bad_onboarding_id" }, 400);

      const migrate = typeof body.willing_to_migrate === "string" ? body.willing_to_migrate : "";
      if (migrate !== "not_sure") return json({ ok: false, error: "unsupported_revision" }, 400);

      const { data: existing } = await service
        .from("onboarding_responses")
        .select("id, status")
        .eq("id", onboardingId).maybeSingle();
      if (!existing) return json({ ok: false, error: "unknown_onboarding" }, 404);
      if (PAID_OR_BEYOND.has((existing.status as string) ?? "")) {
        return json({ ok: false, error: "already_client" }, 403);
      }

      const { error: updErr } = await service
        .from("onboarding_responses")
        .update({ willing_to_migrate: migrate, updated_at: new Date().toISOString() })
        .eq("id", onboardingId);
      if (updErr) {
        console.error("[findable-onboarding] revise failed:", updErr.message);
        return json({ ok: false, error: "revise_failed" }, 500);
      }
      return json({ ok: true, onboarding_id: onboardingId, willing_to_migrate: migrate });
    }

    /* ── q2_prefill ─────────────────────────────────────────────────────────────────────────────
       One read for the post-payment form: the lead's phone, so the "confirm your number" field
       arrives filled instead of empty. PAID ROWS ONLY, same authorisation model as complete_q2
       below: the onboarding id is the capability, and holding the id of a PAID row already grants
       WRITES there — this read is strictly weaker. Deliberately NOT part of `prefill`, whose
       comment promises it never exposes phone/email to the public page (that action is callable by
       anyone holding a report link; this one only by a payer).
       Returns { ok, phone } — phone null when the row has no lead or the lead has no number, and
       the form simply asks. Absence is an empty box, never a guess. */
    if (action === "q2_prefill") {
      const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id : "";
      if (!UUID_RE.test(onboardingId)) return json({ ok: false, error: "bad_onboarding_id" }, 400);
      const { data: row } = await service
        .from("onboarding_responses")
        .select("id, status, lead_id")
        .eq("id", onboardingId).maybeSingle();
      if (!row) return json({ ok: false, error: "unknown_onboarding" }, 404);
      if (!PAID_OR_BEYOND.has((row.status as string) ?? "") && (row.status as string) !== "paid") {
        return json({ ok: false, error: "not_paid" }, 403);
      }
      let phone: string | null = null;
      if (row.lead_id) {
        const { data: lead } = await service
          .from("outreach_leads").select("phone").eq("id", row.lead_id as string).maybeSingle();
        phone = (lead as { phone: string | null } | null)?.phone ?? null;
      }
      return json({ ok: true, phone });
    }

    /* ── complete_q2 ────────────────────────────────────────────────────────────────────────────
       THE SECOND HALF OF THE SPLIT QUESTIONNAIRE. Pre-payment now asks two things (consent and a
       contact email); everything delivery needs is collected HERE, after the money has landed.

       ⛔ PAID ROWS ONLY, AND THAT IS THE AUTHORISATION. There is no session on this endpoint — the
       onboarding id is the capability. An id alone must therefore not be able to write to a row
       that has not paid, or an unpaid submission could be filled in by anyone holding the link.
       `revise` guards the mirror case (it refuses PAID rows); this refuses everything else.

       ⛔ THE THREE CRITICAL FIELDS ARE ENFORCED, NOT REQUESTED. confirmed_location, services and
       business_address are what needsQ2() reads to decide "they finished" — and the first two are
       exactly what startPaidBaseline waits for before it will measure anything. Accepting a Q2
       without them would mark a customer complete while leaving the guarantee's day-0 unmeasurable
       and delivery unable to start. Everything else is genuinely optional.

       ⚠️ NO STATUS CHANGE. `status` stays "paid": completion is DERIVED by needsQ2() from the three
       fields, never stored. A stored verdict freezes old rows against a stale rule and lets the
       readers drift — the same reason serveGate's verdict is derived (CLAUDE.md §1).

       ⚠️ IDEMPOTENT BY CONSTRUCTION. It is an UPDATE of the same columns, so a resubmit — a double
       tap, a bfcache replay, a customer correcting an answer — writes the same values again and
       changes nothing else. Nothing here decrements or appends. */
    if (action === "complete_q2") {
      const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id : "";
      if (!UUID_RE.test(onboardingId)) return json({ ok: false, error: "bad_onboarding_id" }, 400);

      const { data: existing } = await service
        .from("onboarding_responses")
        .select("id, status")
        .eq("id", onboardingId).maybeSingle();
      if (!existing) return json({ ok: false, error: "unknown_onboarding" }, 404);
      if (!PAID_OR_BEYOND.has((existing.status as string) ?? "") && (existing.status as string) !== "paid") {
        return json({ ok: false, error: "not_paid" }, 403);
      }

      const a = (body.answers ?? {}) as Record<string, unknown>;
      const Q2_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const q2WebsiteEmail = clip(a.website_manager_email, 200);

      /* The audit-facing town: the bare town only, never the postal address — create-ai-audit builds
         "[service] in [town]" from it, so an address here would generate questions nobody searches. */
      const q2Town = clip(a.confirmed_location, 120);
      const q2Services = clip(a.services, 2000);
      const q2Address = clip(a.business_address, 300);
      /* ⛔ TWO REQUIRED NOW, NOT THREE (2026-08-22, URGENT). business_address left the questionnaire:
         a paying customer was trapped on mobile hand-typing a full address (see OnboardingFlow's
         STEPS note). The address is collected at delivery instead (the lead usually already has one
         from Google enrichment). The baseline only ever needed town + services, so this is exactly
         what startPaidBaseline waits for — and needsQ2() was relaxed to match, or a completed
         customer would read "awaiting Q2" forever. business_address is still ACCEPTED below and
         written when present; it is simply no longer a gate. */
      if (!q2Town || !q2Services) {
        return json({
          ok: false,
          error: "missing_required",
          missing: [!q2Town && "confirmed_location", !q2Services && "services"].filter(Boolean),
        }, 400);
      }

      /* ⛔ THREE PLACES OR THE FIELD VANISHES — the same rule the submit path below carries, and for
         the same reason: this object, the NEWER_COLS deletion, and the `optional` shedding list.
         willing_to_migrate had its column, the flow sent it, the row saved with HTTP 200 and the
         value was null, because a key absent from one of the three simply disappears. */
      const q2: Record<string, unknown> = {
        confirmed_location: q2Town,
        services: q2Services,
        business_address: q2Address,
        services_list: clipList(a.services_list, 40, 120),
        areas_list: clipList(a.areas_list, 30, 120),
        accreditations: clip(a.accreditations, 2000),
        must_not_say: clip(a.must_not_say, 2000),
        photos_status: typeof a.photos_status === "string" && PHOTOS_STATUS.has(a.photos_status) ? a.photos_status : null,
        competitor_name: clip(a.competitor_name, 200),
        website_manager: typeof a.website_manager === "string" && WEBSITE_MANAGER.has(a.website_manager) ? a.website_manager : null,
        website_manager_email: q2WebsiteEmail && Q2_EMAIL_RE.test(q2WebsiteEmail) ? q2WebsiteEmail : null,
        website_platform: typeof a.website_platform === "string" && WEBSITE_PLATFORM.has(a.website_platform) ? a.website_platform : null,
        website_platform_other: clip(a.website_platform_other, 120),
        /* ⚠️ STILL ACCEPTED, BUT IT NO LONGER GATES ANYTHING. serveGate reads this to decide
           serve/flag/block; with the platform question moved past the payment there is nothing left
           to block, which is Paul's call 2026-08-13: any platform can be served, by rebuilding and
           hosting when access cannot be had. Kept because it is real delivery information. */
        willing_to_migrate: typeof a.willing_to_migrate === "string" && WILLING_TO_MIGRATE.has(a.willing_to_migrate) ? a.willing_to_migrate : null,
        gbp_consent: typeof a.gbp_consent === "string" && GBP_CONSENT.has(a.gbp_consent) ? a.gbp_consent : null,
        gbp_exists: typeof a.gbp_exists === "string" && GBP_EXISTS.has(a.gbp_exists) ? a.gbp_exists : null,
        gbp_status: typeof a.gbp_status === "string" && GBP_STATUS.has(a.gbp_status) ? a.gbp_status : null,
        gbp_verified: typeof a.gbp_verified === "string" && GBP_VERIFIED.has(a.gbp_verified) ? a.gbp_verified : null,
        /* The one number they want customers calling — used verbatim on directory registrations at
           delivery. Loosely validated (7+ digits among phone punctuation): a wrongly-formatted
           number the owner typed is still delivery information, and the form is the courtesy gate.
           CLIENT-required, deliberately NOT in the missing_required 400 above: nothing automated
           depends on it (the baseline waits on town+services only), and a hard server gate would
           brick every Q2 submit from a site bundle published before the field existed. */
        confirmed_phone: (() => {
          const p = clip(a.confirmed_phone, 40);
          return p && (p.match(/\d/g) ?? []).length >= 7 && /^[+0-9][0-9 ()./-]*$/.test(p) ? p : null;
        })(),
        updated_at: new Date().toISOString(),
      };

      /* NEVER WRITE A NULL OVER AN ANSWER. An optional question left blank must not erase what an
         earlier pass (or the pre-payment form) already stored, and it must not send a column that
         may not exist yet. Same reasoning as NEWER_COLS on the insert path — absence is not an
         answer (CLAUDE.md §6). The two required fields (town, services) are never null by the guard
         above; business_address may now be null and is simply not written when it is. */
      for (const k of Object.keys(q2)) if (q2[k] == null) delete q2[k];

      /* MULTI-PASS SHEDDING, the v18 lesson: each retry can surface the NEXT missing column, so keep
         dropping until the update lands. Longer names before their substrings, or one miss sheds
         two columns. The two required fields (confirmed_location, services) are NOT sheddable —
         losing them silently is the failure this whole action exists to prevent, so a persistent
         error is returned instead. */
      const shedOrder = [
        "services_list", "areas_list", "website_manager_email", "website_manager",
        "website_platform_other", "website_platform", "willing_to_migrate",
        "gbp_verified", "gbp_consent", "gbp_exists", "gbp_status",
        "must_not_say", "photos_status", "competitor_name", "accreditations",
        "business_address", "confirmed_phone",
      ];
      let payload = { ...q2 };
      let res = await service.from("onboarding_responses").update(payload).eq("id", onboardingId);
      let guard = 0;
      while (res.error && guard++ < shedOrder.length) {
        const missing = shedOrder.find((c) => c in payload && (res.error?.message ?? "").includes(c));
        if (!missing) break;
        console.warn(`[findable-onboarding] complete_q2: column ${missing} rejected, retrying without it`);
        delete payload[missing];
        res = await service.from("onboarding_responses").update(payload).eq("id", onboardingId);
      }
      if (res.error) {
        console.error("[findable-onboarding] complete_q2 failed:", res.error.message);
        return json({ ok: false, error: "q2_save_failed" }, 500);
      }
      console.log(`[findable-onboarding] complete_q2 saved for ${onboardingId} (${Object.keys(payload).length} columns)`);
      /* The baseline is NOT started here. process-ai-audit-queue's ensureBaselinesForPaidOnboardings
         sweeps every tick for any paid row whose lead has no baseline, and startPaidBaseline defers
         with awaiting_questionnaire_2 until exactly the two fields this action just wrote. So the
         measurement starts on its own within a minute of this returning, through the path that is
         already proven, rather than through a second caller that could disagree with it. */
      return json({ ok: true, onboarding_id: onboardingId, saved: Object.keys(payload).filter((k) => k !== "updated_at") });
    }

    // ── submit ──────────────────────────────────────────────────────────────────
    if (action === "submit") {
      const a = (body.answers ?? {}) as Record<string, unknown>;
      const confirmedLocation = clip(a.confirmed_location, 200);
      const gbpConsent = typeof a.gbp_consent === "string" && GBP_CONSENT.has(a.gbp_consent) ? a.gbp_consent : null;
      // The flow's single escape hatch ("I'll fill this in later") posts whatever exists so
      // far. Those answers are worth keeping and chasing, so the required-field check is
      // relaxed for them and the row is flagged instead. A COMPLETE submission still has to
      // carry the area and the consent answer.
      const incomplete = body.incomplete === true;
      /* WHERE THE SUBMISSION CAME FROM. Validated against a known set, so an unrecognised value
         stores NULL ("we do not know") rather than being passed through — a stale or hostile client
         must not be able to invent a source that a reader downstream then branches on. NULL is the
         normal value: every row written before 2026-08-19, and every submission from the onboarding
         flow itself, has no source. Only the free check names itself.
         ⛔ ABSENCE IS NEVER "free_check". The lead-creation branch below tests for the POSITIVE
         value, never for `!== something`, so a new source added later joins the safe side. */
      /* 'signup' added 2026-09-03 with the flat price: someone who reached the onboarding flow with
         NO ?lead= tag and is on their way to pay. Until today that was impossible - the price was
         derived per-lead, so a lead-less arrival could not be charged and findable-checkout refused
         it outright. One flat price removes the reason for the refusal; the only thing still needed
         is a trade + town so the four-week guarantee has something to measure, which the pre-payment
         screen now asks for in exactly this case. */
      const SUBMISSION_SOURCES = new Set(["free_check", "signup"]);
      const submissionSource =
        typeof body.source === "string" && SUBMISSION_SOURCES.has(body.source.trim())
          ? body.source.trim()
          : null;
      /* ⛔ THE TOWN IS NO LONGER A PRE-PAY REQUIREMENT — IT IS A Q2 QUESTION NOW (2026-08-29).
         This gate still demanded confirmed_location after the questionnaire split moved the town
         behind payment: the pre-pay flow is STEPS = 2 and the town lives at case 2, so it is never
         rendered. A business-specific link only passed because `prefill` silently fills the town
         from the lead's derived_town — so the GENERIC /onboarding/ form, which has no lead and
         therefore no prefill, failed every complete submission with `missing_required` and told the
         customer to "step back" to a question that no longer exists.
         ⛔ THE TOWN IS STILL ENFORCED, JUST WHERE IT IS ACTUALLY ASKED. Verified before changing
         this, all three still require it and none was touched:
           · complete_q2 — hard 400 on !q2Town || !q2Services (this file, ~line 351)
           · needsQ2     — !(confirmed_location && services)   (src/hooks/useSubmissions.ts:109)
           · startPaidBaseline — defers `awaiting_questionnaire_2` until town + services exist
                                 (_shared/audit-baseline.ts:476), so the guarantee's day-0
                                 measurement still cannot start without it.
         ⚠️ serveGate is unaffected: ServeGateRow is the four website fields and reads
         confirmed_location nowhere.
         ⚠️ gbp_consent STAYS REQUIRED. It is asked at case 0, inside the pre-pay flow, so it is
         both reachable and answerable — the two things the town had stopped being. */
      if (!incomplete && !gbpConsent) {
        return json({ ok: false, error: "missing_required" }, 400);
      }
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      /* ⛔ gbp_manager_email IS NO LONGER ACCEPTED. It asked the client for THEIR address under the
         label "Email to add as your Google Business Profile manager", which corresponds to no Google
         flow: in add-a-manager the OWNER types the manager's address, and in request-access Google
         supplies the owner's from its own records. Nothing ever read it — all eight readers of this
         table were checked. The COLUMN stays (dropping it would destroy answers already given); the
         flow simply stops sending it and this function stops listing it, which is what makes it
         stop being written. */
      const gbpExists = typeof a.gbp_exists === "string" && GBP_EXISTS.has(a.gbp_exists) ? a.gbp_exists : null;
      const gbpStatus = typeof a.gbp_status === "string" && GBP_STATUS.has(a.gbp_status) ? a.gbp_status : null;
      /* Optional like its two neighbours: it is asked only on the gbp_exists = "yes" branch, and
         someone who does not know must still be able to finish and pay. An unrecognised value
         stores NULL — "not answered" — rather than being passed through, so a stale client can
         never invent a fifth state that no reader knows how to render. */
      const gbpVerified = typeof a.gbp_verified === "string" && GBP_VERIFIED.has(a.gbp_verified) ? a.gbp_verified : null;
      const photosStatus = typeof a.photos_status === "string" && PHOTOS_STATUS.has(a.photos_status) ? a.photos_status : null;
      /* CONTACT EMAIL — where the report and documents go. Validated with the same shape the client
         gates on, so a submission that got past the button is not silently downgraded here. Stored
         as null when it fails, never as junk: a bad address is worse than a known-missing one,
         because the Stripe backfill can fill a NULL and cannot tell that "asdf" is unusable.
         Required on a complete submission for the same reason the area is — without it there is no
         way to deliver what they just paid for. The escape hatch stays exempt, like every other
         required field: a partial answer set is still worth keeping and chasing. */
      const contactEmailRaw = clip(a.contact_email, 200);
      const contactEmail = contactEmailRaw && EMAIL_RE.test(contactEmailRaw) ? contactEmailRaw : null;
      if (!incomplete && !contactEmail) {
        return json({ ok: false, error: "missing_contact_email" }, 400);
      }
      /* ⛔ THE "yes_all NEEDS AN EMAIL" GATE IS DELETED WITH THE FIELD IT GATED. It rejected a
         complete submission with error "missing_gbp_email" unless the client supplied their own
         Google address — a value no flow consumes. Leaving the check while removing the field would
         have made "Yes to both" impossible to submit at all.
         NOTHING REPLACES IT. gbp_exists and gbp_status are genuinely optional: someone who does not
         know whether their profile is claimed must still be able to finish and pay. */
      // The GBP email's validation pattern, reused for the web company's address: store a
      // valid email or an honest NULL, never junk.
      const websiteEmailRaw = clip(a.website_manager_email, 200);
      const answers = {
        // standout is no longer asked (cut 2026-08-04: nothing read it); the column stays
        // and old rows keep their values.
        standout: clip(a.standout, 2000),
        // BOTH shapes on purpose: `services` (joined string) is the audit-facing field the
        // baseline turns into specialisms — unchanged; `services_list` (jsonb) is the
        // structured page list the new questionnaire captures.
        services: clip(a.services, 2000),
        services_list: clipList(a.services_list, 40, 120),
        // Surrounding towns they want work from, priority-ordered. DELIVERY-facing (a page
        // per service per town). Deliberately NOT fed to the audit: the multi-area audit is
        // unscoped, and confirmed_location below stays the measurement town.
        areas_list: clipList(a.areas_list, 30, 120),
        // Legacy column, kept accepting for old callers; the new flow sends areas_list.
        areas_wanted: clip(a.areas_wanted, 2000),
        // Who can change their website + the web company's email when that's the answer.
        website_manager: typeof a.website_manager === "string" && WEBSITE_MANAGER.has(a.website_manager) ? a.website_manager : null,
        website_manager_email: websiteEmailRaw && EMAIL_RE.test(websiteEmailRaw) ? websiteEmailRaw : null,
        // OPTIONAL and unvalidated-beyond-the-set: an owner who does not know what their site runs
        // on is normal, so null is a real answer here, never a missing field.
        website_platform: typeof a.website_platform === "string" && WEBSITE_PLATFORM.has(a.website_platform) ? a.website_platform : null,
        website_platform_other: clip(a.website_platform_other, 120),
        willing_to_migrate: typeof a.willing_to_migrate === "string" && WILLING_TO_MIGRATE.has(a.willing_to_migrate) ? a.willing_to_migrate : null,
        // The competitor who keeps winning their work — one name, tells us who to track.
        competitor_name: clip(a.competitor_name, 200),
        confirmed_location: confirmedLocation,
        /* Full postal address, SEPARATE from confirmed_location on purpose: that value is what
           create-ai-audit builds "[service] in [town]" from, so an address in it would generate
           questions like "plumber in 12 High Street, Wisbech PE13 1AB". Directories need this;
           the question generator needs the bare town. */
        business_address: clip(a.business_address, 300),
        accreditations: clip(a.accreditations, 2000),
        gbp_consent: gbpConsent,
        gbp_exists: gbpExists,
        gbp_status: gbpStatus,
        gbp_verified: gbpVerified,
        // The only question here that can embarrass us publicly. Far cheaper to know before we write
        // the pages than to correct after they are published.
        must_not_say: clip(a.must_not_say, 2000),
        /* The owner's name, asked on the pre-pay screen since 2026-08-17. Feeds directory
           registrations at delivery and the questionnaire_followup greeting ({{1}} = first word,
           derived at send time, never stored separately). */
        contact_name: clip(a.contact_name, 120),
        photos_status: photosStatus,
        contact_email: contactEmail,
        business_name: clip(a.business_name, 200),
        /* ⛔ ADDED TO ALL THREE LISTS AT ONCE (answers / NEWER_COLS / optional). This builder is an
           EXPLICIT key list, so a field the client sends and the column accepts still vanishes if
           it is missing here — proven 2026-08-05 by willing_to_migrate, which saved as HTTP 200
           with a null and let a Squarespace customer reach Stripe. The free check sends this. */
        confirmed_phone: clip(a.confirmed_phone, 40),
        source: submissionSource,
        /* ⛔ THE WEBSITE ADD-ON TICK, AND THIS ROW IS THE ONLY PLACE IT IS TRUSTED FROM. Added
           2026-09-03 with the £49.99 build + £9.99/mo hosting option. findable-checkout reads the
           tick from THIS COLUMN, never from its own request body: the standing rule is that the
           browser never decides money, and it is also what makes the row the record of what the
           customer actually bought (delivery reads it, and a Stripe line-up has to be reproducible
           from our own data months later).
           ⚠️ STRICTLY BOOLEAN. `=== true` rather than truthy, so a string "false", a 0 or a stray
           "on" from some future form library cannot silently sell someone a website. Absent → null
           → shed by NEWER_COLS below → reads as not ticked, which is the safe direction. */
        website_addon: a.website_addon === true ? true : (a.website_addon === false ? false : null),
        incomplete,
      };

      /* NEVER SEND A NULL-VALUED NEW COLUMN. Proven live 2026-08-04: v18 added the five
         new keys to EVERY insert, and with the columns not yet in the schema the old
         single-pass fallback could not shed them all - so every submission, including
         ones carrying no new answers at all, died save_failed. The base path must never
         depend on columns newer than itself. */
      /* ⛔ THREE PLACES OR THE FIELD VANISHES: the `answers` object above, this list, and the
         `optional` list below. Proven live 2026-08-05 — willing_to_migrate had its column, the flow
         sent it, the row saved with HTTP 200, and the value was null, because this function builds
         its insert from an explicit key list and an unlisted key simply disappears. A Squarespace
         customer who had said no to moving reached Stripe as a result. */
      const NEWER_COLS = ["services_list", "areas_list", "website_manager", "website_manager_email", "competitor_name", "website_platform", "website_platform_other", "willing_to_migrate", "gbp_exists", "gbp_status", "gbp_verified", "must_not_say", "photos_status", "contact_name", "confirmed_phone", "source", "website_addon"];
      for (const col of NEWER_COLS) {
        if ((answers as Record<string, unknown>)[col] == null) delete (answers as Record<string, unknown>)[col];
      }

      // Save helper. If a column's migration has not been applied yet, PostgREST rejects
      // the unknown column: retry without it rather than lose a real submission. MULTI-PASS
      // (the v18 lesson): each retry can surface the NEXT missing column, so keep shedding
      // until the insert lands or nothing in the error matches. website_manager_email is
      // tested before website_manager so the substring cannot drop both for one miss.
      const saveAnswers = async (extra: Record<string, unknown>) => {
        const attempt = (payload: Record<string, unknown>) =>
          service.from("onboarding_responses").insert(payload).select("id").maybeSingle();
        // website_platform_other before website_platform, for the same reason website_manager_email
        // comes before website_manager: the shorter name is a substring of the longer one, so
        // testing it first would shed both columns on a single miss.
        const optional = ["services_list", "areas_list", "website_manager_email", "website_manager", "website_platform_other", "website_platform", "willing_to_migrate", "gbp_verified", "gbp_exists", "gbp_status", "must_not_say", "photos_status", "competitor_name", "areas_wanted", "incomplete", "contact_email", "contact_name", "confirmed_phone", "business_address", "source", "website_addon"];
        const reduced = { ...answers } as Record<string, unknown>;
        let res = await attempt({ ...reduced, ...extra });
        let guard = 0;
        while (res.error && guard++ < optional.length) {
          const msg = res.error.message ?? "";
          const hit = optional.find((col) => col in reduced && new RegExp(col, "i").test(msg));
          if (!hit) break;
          console.warn(`[findable-onboarding] ${hit} column missing, saving without it`);
          delete reduced[hit];
          res = await attempt({ ...reduced, ...extra });
        }
        return res;
      };

      /* GENERIC MODE (no valid lead): save the answers, NEVER fire an audit (lockdown #1).
         ⛔ LOCKDOWN #1 IS UNCHANGED AND STILL ABSOLUTE. A free-check submission now creates a LEAD,
         which is not an audit: nothing here queues a question, spends Apify, or sends anything. The
         auto-audit phase is deliberately NOT built yet — Paul wants to watch a real submission
         become a lead first (§6j phase 2).
         ⛔ THE ROW IS SAVED FIRST AND NEVER PUT AT RISK. Lead creation runs AFTER the insert and
         cannot fail the request: createFreeCheckLead never throws, and a refusal is reported to the
         operator rather than returned to the visitor, who has done nothing wrong and must always
         see success. */
      if (!leadId) {
        const { data: row, error: insErr } = await saveAnswers({ status: "submitted" });
        if (insErr || !row) return json({ ok: false, error: "save_failed" }, 500);

        /* ⛔ BOTH SOURCES CREATE A LEAD, AND THE DIFFERENCE IS WHAT HAPPENS AFTER. A free check
           gets a free audit fired at it (below); a signup does NOT - its measurement is the paid
           BASELINE that startPaidBaseline runs once Stripe confirms, and firing a free audit here
           would spend Apify money on a question the baseline is about to ask properly.
           ⚠️ The lead itself is created by the SAME function either way, deliberately: the dedupe,
           its fail-closed behaviour and the three-guard place resolution are exactly what a signup
           needs too, and a second copy of that is how two paths drift. */
        if (submissionSource === "signup") {
          const outcome = await createFreeCheckLead(service, {
            businessName: clip(a.business_name, 200) ?? "",
            town: confirmedLocation ?? "",
            // The pre-payment screen asks for this when there is no lead tag; `services` is the
            // trade field every audit entry point already reads.
            trade: clip(a.services, 200) ?? "",
            email: contactEmail,
            phone: clip(a.confirmed_phone, 40),
            contactName: clip(a.contact_name, 120),
            /* Not subject to the free-check daily cap - see free-check-lead.ts. */
            purpose: "signup",
          });
          /* ⛔ LINKING IS WHAT MAKES THE PAYMENT POSSIBLE, not just tidy. findable-checkout reads the
             onboarding row's lead_id; without it the session is refused for no attribution and the
             visitor cannot pay. So a failure here is reported loudly rather than shrugged off as it
             is on the free-check path, where an orphaned row only costs operator convenience. */
          if (outcome.kind === "created" || outcome.kind === "matched") {
            const { error: linkErr } = await service
              .from("onboarding_responses").update({ lead_id: outcome.leadId }).eq("id", row.id);
            if (linkErr) console.error(`[findable-onboarding] SIGNUP lead link FAILED for ${row.id}: ${linkErr.message} - this visitor cannot check out`);
          } else {
            console.error(`[findable-onboarding] SIGNUP made no lead (${outcome.kind}: ${outcome.reason ?? ""}) - this visitor cannot check out`);
          }
          console.log(`[findable-onboarding] signup ${outcome.kind}: ${JSON.stringify(outcome)}`);
          return json({
            ok: true, onboarding_id: row.id, audit_id: null,
            lead: outcome.kind,
            /* The flow needs the id to check out, exactly as a lead-linked submit returns it. */
            lead_id: (outcome.kind === "created" || outcome.kind === "matched") ? outcome.leadId : null,
          });
        }

        if (submissionSource === "free_check") {
          const outcome = await createFreeCheckLead(service, {
            businessName: clip(a.business_name, 200) ?? "",
            town: confirmedLocation ?? "",
            // `services` is the trade field the rest of the system reads (the form sends one word).
            trade: clip(a.services, 200) ?? "",
            email: contactEmail,
            // Optional. Normalised and deduped inside createFreeCheckLead; a repeat submitter who
            // gives their number matches for free, before any Google spend.
            phone: clip(a.confirmed_phone, 40),
            // Null on today's free-check form, which asks for a business name rather than a
            // person's. Passed anyway so the two branches cannot drift if that form ever asks.
            contactName: clip(a.contact_name, 120),
          });
          /* LINK THE ROW TO THE LEAD, for `matched` as well as `created`. The lead card's
             Questionnaire section, the dashboard and the notifier all key off lead_id, so a
             submission that matched an EXISTING lead must attach to it — otherwise the answers are
             orphaned exactly when they are most useful (someone already in the book asking again).
             Non-fatal: the answers are saved either way. */
          if (outcome.kind === "created" || outcome.kind === "matched") {
            const { error: linkErr } = await service
              .from("onboarding_responses").update({ lead_id: outcome.leadId }).eq("id", row.id);
            if (linkErr) console.warn(`[findable-onboarding] free_check lead link failed for ${row.id}: ${linkErr.message}`);
          }
          console.log(`[findable-onboarding] free_check ${outcome.kind}: ${JSON.stringify(outcome)}`);

          /* ── THE AUTO-AUDIT ────────────────────────────────────────────────────────────────────
             ⛔ LAST, AND UNABLE TO AFFECT ANYTHING BEFORE IT. The questionnaire row is saved, the
             lead exists and is linked; everything below is best-effort. The visitor sees success
             either way, because they have done nothing wrong and a form that appears to fail is
             worse than one that quietly does less.
             ⛔ AND IT IS GATED BEFORE IT SPENDS. shouldAutoAudit enforces the two guards the 10/day
             LEAD cap does not: that cap sits after the `matched` return, so without these a repeat
             submission would fire an uncapped audit and email every time. See free-check-audit.ts.
             ⚠️ Fires for `matched` as well as `created` — a business already in the book asking for
             a check should still get one, which is exactly why the repeat guard is per-LEAD rather
             than "did we just create this lead". */
          /* ⛔ DOES A RESULT ACTUALLY FOLLOW? The confirmation screen promises "we email you the report",
             and that is only true if an audit runs. Often it does not: the repeat guard refuses a business
             audited within FREE_CHECK_AUDIT_REPEAT_DAYS, and the daily cap refuses the rest of a busy day.
             🔴 Both are CORRECT refusals that produced a WRONG PROMISE (2026-09-02, found by submitting the
             same bar a seventh time: ONE audit exists, six submissions got the "check your email" screen
             and nothing was ever coming). The answer now travels back so the site can word it honestly.
             ⚠️ It reports WHETHER, never WHY. The reason is operator detail - "we audited this business
             four days ago" tells a stranger what is in our database. */
          let resultComing = false;
          if (outcome.kind === "created" || outcome.kind === "matched") {
            try {
              const decision = await shouldAutoAudit(service, outcome.leadId);
              if (!decision.fire) {
                console.log(`[findable-onboarding] free_check audit SKIPPED for lead ${outcome.leadId}: ${decision.reason}`);
                /* ⛔ RECORDED, NOT JUST LOGGED. This whole lane was silently dead for two days and
                   the reason existed only in an edge log nobody can read - the CLI has no
                   `functions logs`, so diagnosing it meant inferring from which leads had audits.
                   A free check that produces no result is the funnel failing; it belongs in a table.
                   Non-fatal: the visitor has already been answered. */
                await recordAuditOutcome(service, "free_check_audit_skipped", {
                  lead_id: outcome.leadId, onboarding_id: row.id, reason: decision.reason,
                });
              } else {
                const { data: fresh } = await service
                  .from("outreach_leads")
                  /* ⛔ search_keyword / category ARE NOT SELECTED, ON PURPOSE. The trade and town
                     come from THIS submission (just below), never from the lead - on a `matched`
                     lead those columns hold an old prospecting guess, which is how a visitor who
                     typed "plummer" got an audit and a result email about "Locksmiths"
                     (2026-09-02). Not selecting them keeps the temptation out of reach. */
                  .select("id, user_id, business_name, search_location, address, country, website")
                  .eq("id", outcome.leadId).maybeSingle();
                if (!fresh) {
                  console.warn(`[findable-onboarding] free_check audit skipped: lead ${outcome.leadId} not readable`);
                } else {
                  const fired = await fireFreeCheckAudit(fresh, {
                    // The visitor's own words about their own business; spell-checked, never swapped.
                    trade: clip(a.services, 200) ?? "",
                    town: confirmedLocation ?? "",
                  });
                  console.log(`[findable-onboarding] free_check audit ${fired.ok ? `started (audit ${fired.auditId})` : `FAILED: ${fired.error}`} for lead ${outcome.leadId}`);
                  if (!fired.ok) {
                    await recordAuditOutcome(service, "free_check_audit_failed", {
                      lead_id: outcome.leadId, onboarding_id: row.id, error: fired.error ?? null,
                    });
                  }
                  /* Only a STARTED audit promises a result. A failed start is not a maybe. */
                  resultComing = fired.ok;
                }
              }
            } catch (e) {
              console.error("[findable-onboarding] free_check auto-audit threw:", e instanceof Error ? e.message : String(e));
            }
          }
          /* The visitor gets a plain success either way — they asked for a free check, not for a
             report on our lead plumbing. The outcome rides along for the operator surfaces. */
          /* `result_coming` is what the confirmation copy keys on. An older site bundle ignores the
             field and keeps the previous wording, so deploy order does not matter. */
          return json({ ok: true, onboarding_id: row.id, audit_id: null, lead: outcome.kind, result_coming: resultComing });
        }

        return json({ ok: true, onboarding_id: row.id, audit_id: null });
      }

      // LEAD MODE — lockdown #2: the lead must exist and must NOT already be a paying client.
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, user_id, business_name, category, search_keyword, status, amount_paid, country, website")
        .eq("id", leadId).maybeSingle();
      if (!lead) return json({ ok: false, error: "unknown_lead" }, 404);
      if (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0) {
        return json({ ok: false, error: "already_client" }, 403);
      }

      // Lockdown #3a: one submission per lead per SUBMIT_COOLDOWN_MS.
      const { data: recent } = await service
        .from("onboarding_responses").select("id, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at as string).getTime() < SUBMIT_COOLDOWN_MS) {
        return json({ ok: false, error: "too_soon" }, 429);
      }

      const { data: row, error: insErr } = await saveAnswers({ lead_id: leadId, status: "submitted" });
      if (insErr || !row) return json({ ok: false, error: "save_failed" }, 500);

      // Customer-confirmed location becomes the lead's location of record (the wizard's
      // write-back convention) — the audit and everything after use CONFIRMED inputs.
      try {
        await service.from("outreach_leads").update({ search_location: confirmedLocation }).eq("id", leadId);
      } catch { /* non-fatal — the audit still gets the confirmed value directly */ }

      /* THE LEAD'S EMAIL OF RECORD. outreach_leads.email is where the rest of the system already
         looks for a way to reach a business (the Stripe webhook's inbox resolution reads it), so an
         address the owner typed themselves belongs there — it is better than anything enrichment
         produced, which today is one address across 466 leads.
         Only fills an EMPTY column: an operator may have corrected it by hand, and a self-reported
         address should not silently overwrite that. email_method/email_status are the existing
         provenance columns, so "where did this come from" stays answerable.
         Non-fatal: the onboarding row already holds the address, so this is a convenience copy. */
      if (contactEmail) {
        try {
          await service.from("outreach_leads")
            .update({
              email: contactEmail,
              email_method: "onboarding",
              email_status: "found",
              email_last_checked_at: new Date().toISOString(),
            })
            .eq("id", leadId)
            // .is(null), not an or() that also tests "": every writer normalises a blank to NULL,
            // and the column was checked for empty strings before this shipped (none).
            .is("email", null);
        } catch { /* non-fatal — onboarding_responses.contact_email is the source of truth */ }
      }

      /* THE OWNER'S NAME, same convention as the email above: a name the owner typed themselves
         fills an EMPTY column but never overwrites one — an operator's hand-entered note
         ("Ronnie — ask for Sharon") beats a form field. The onboarding row keeps the submitted
         value regardless, so both survive. Checked before shipping: contact_name was NULL on every
         lead (0 non-null, 0 blank strings), so .is(null) is the correct narrow form here too. */
      /* ⛔ THE NAME FILLS AN EMPTY COLUMN AND NEVER REPLACES ONE — DELIBERATELY DIFFERENT FROM THE
         PHONE BELOW, WHICH DOES REPLACE. The phone is a delivery channel: messaging a number they
         did not give us is a failure, so theirs wins. A name is not a channel, and an operator's
         hand-entered note ("Ronnie — ask for Sharon") is better information than a form field.
         ⛔ A DISAGREEMENT IS RECORDED RATHER THAN RESOLVED. If the stored name differs from the one
         they just typed, the column is left alone and the difference is appended to the notes, so
         it is visible to a person instead of being silently dropped or silently overwritten. */
      const submittedName = clip(a.contact_name, 120);
      if (submittedName) {
        try {
          const { data: nameRow } = await service.from("outreach_leads")
            .select("contact_name, notes").eq("id", leadId).maybeSingle();
          const nr = (nameRow ?? {}) as { contact_name?: string | null; notes?: string | null };
          const stored = (nr.contact_name ?? "").trim();
          if (!stored) {
            await service.from("outreach_leads")
              .update({ contact_name: submittedName })
              .eq("id", leadId)
              .is("contact_name", null);
          } else if (stored.toLowerCase() !== submittedName.toLowerCase()) {
            const note = `[${new Date().toISOString().slice(0, 10)}] they gave the name "${submittedName}" at signup; kept the stored "${stored}".`;
            await service.from("outreach_leads")
              .update({ notes: nr.notes ? `${nr.notes}
${note}` : note })
              .eq("id", leadId);
          }
        } catch { /* non-fatal — onboarding_responses.contact_name is the source of truth */ }
      }

      /* ⛔ THE PHONE IS THE ONE FIELD THAT OVERWRITES, AND ONLY WHEN THEY DISAGREE (2026-09-13).
         Every other write-through here is fill-empty-only, because an operator's hand-entered value
         beats a form field. The phone is different: it is the number we will MESSAGE, the page
         generator already prefers the confirmed answer when printing contact details, and a lead
         whose WhatsApp goes to Google's scraped number while every page prints a different one is
         the worst of both. So a number they typed that differs from the stored one WINS.
         ⛔ AND THE OLD NUMBER IS NOT LOST. It is appended to the lead's notes before the update, so
         "we used to have a different number for them" stays answerable — an overwrite that erases
         the only other way to reach somebody is not a safe default.
         ⚠️ SAME NUMBER, DIFFERENT PUNCTUATION IS NOT A DISAGREEMENT: the comparison is on digits
         only, so "07700 900123" and "+44 7700 900123" do not trigger a pointless write. */
      const submittedPhone = clip(a.confirmed_phone, 40);
      if (submittedPhone) {
        try {
          const { data: cur } = await service.from("outreach_leads")
            .select("phone, notes").eq("id", leadId).maybeSingle();
          const row = (cur ?? {}) as { phone?: string | null; notes?: string | null };
          const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "").replace(/^44/, "");
          const existing = (row.phone ?? "").trim();
          if (!existing) {
            await service.from("outreach_leads").update({ phone: submittedPhone }).eq("id", leadId).is("phone", null);
          } else if (digits(existing) !== digits(submittedPhone)) {
            const note = `[${new Date().toISOString().slice(0, 10)}] phone replaced by the customer at signup; previous: ${existing}`;
            await service.from("outreach_leads")
              .update({ phone: submittedPhone, notes: row.notes ? `${row.notes}
${note}` : note })
              .eq("id", leadId);
          }
        } catch { /* non-fatal — onboarding_responses.confirmed_phone is the source of truth */ }
      }

      // An incomplete submission stops here: there is no confirmed area to audit against, and
      // firing a 3-run paid baseline on a half-answered form would spend real money guessing.
      // The plan screen still works, so they can pay and we chase the answers.
      if (incomplete) {
        return json({ ok: true, onboarding_id: row.id, audit_id: null, incomplete: true });
      }

      // NO AUDIT IS FIRED HERE ANY MORE.
      //
      // It used to start a 10-question, 3-run paid baseline and park the customer on a "building
      // your report" screen for up to five minutes — directly in front of the payment button, for
      // a measurement they cannot see and do not need in order to decide. They have already read
      // their report; that link is what brought them to this page.
      //
      // So: save the answers, hand back whatever we ALREADY know from their most recent completed
      // run, and let them read it and pay. The averaged 3-run baseline starts AFTER payment
      // (stripe-webhook -> startPaidBaseline, with the queue's ensureBaselinesForPaidOnboardings
      // as the backstop), so the guarantee is still measured against three runs — just not while
      // anybody watches.
      //
      // Side effect worth knowing: this public endpoint (verify_jwt = false) now triggers ZERO
      // Apify spend, which removes the "leaked lead id drains the daily cap" exposure entirely.
      // The per-lead baseline cap that used to guard it lives in startPaidBaseline instead, as an
      // idempotency check.
      const { data: leadAudits } = await service
        .from("ai_audits").select("id").eq("lead_id", leadId);
      const auditIds = ((leadAudits ?? []) as Array<{ id: string }>).map((a) => a.id);

      let report: Record<string, unknown> | null = null;
      let existingAuditId: string | null = null;
      if (auditIds.length) {
        // Most recent run that actually produced data, across ALL of this lead's audits.
        const { data: run } = await service
          .from("ai_audit_runs")
          .select("id, audit_id, run_number, status, mention_rate, results, created_at")
          .in("audit_id", auditIds)
          .in("status", ["complete", "capped"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (run) {
          const { data: audit } = await service
            .from("ai_audits").select("*").eq("id", (run as { audit_id: string }).audit_id).maybeSingle();
          if (audit) {
            existingAuditId = (run as { audit_id: string }).audit_id;
            report = await buildReportPayload(service, audit, run as RunRow);
          }
        }
      }

      await service.from("onboarding_responses")
        .update({
          audit_id: existingAuditId,
          // Distinguishable from 'submitted' (never processed) and from 'paid'. Nothing is
          // running, so 'audit_running' would have been a lie.
          status: report ? "answers_saved" : "answers_saved_no_report",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      return json({ ok: true, onboarding_id: row.id, audit_id: existingAuditId, report });
    }

    // ── status ──────────────────────────────────────────────────────────────────
    if (action === "status") {
      const auditId: string | null =
        typeof body.audit_id === "string" && UUID_RE.test(body.audit_id.trim()) ? body.audit_id.trim() : null;
      if (!leadId || !auditId) return json({ ok: false, error: "bad_request" }, 400);
      // The audit must belong to THIS lead — a random audit UUID gets nothing.
      // select('*') so the baseline columns come through when present and are simply absent
      // when the migration has not run — no second query, no failure either way.
      const { data: audit } = await service
        .from("ai_audits").select("*").eq("id", auditId).maybeSingle();
      if (!audit || audit.lead_id !== leadId) return json({ ok: false, error: "unknown_audit" }, 404);
      const { data: run } = await service
        .from("ai_audit_runs").select("id, audit_id, run_number, status, mention_rate, results, created_at")
        .eq("audit_id", auditId).order("run_number", { ascending: false }).limit(1).maybeSingle();
      if (!run) return json({ ok: true, status: "pending" });
      if (run.status !== "complete" && run.status !== "capped") {
        return json({ ok: true, status: "running" });
      }
      // Complete → the SHARED report payload (same builder `submit` uses). No winnability.
      const { data: qrows } = await service
        .from("ai_audit_queue").select("id, question, status, result")
        .eq("run_id", run.id).order("created_at", { ascending: true });
      const payload = await buildReportPayload(service, audit, run as RunRow);
      if (!payload) return json({ ok: true, status: "running" });
      return json({ ok: true, status: "complete", ...payload });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[findable-onboarding] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
