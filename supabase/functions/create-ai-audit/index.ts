import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { resolveDerivedTown, pickAuditTown } from "../_shared/place-town.ts";
import { toWhatsAppNumber } from "../_shared/whatsapp-send.ts";
import { firstReplyTemplate, pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { applySeed, dropResearchIntent, dropMissingTown, dedupeQuestions, coverageDirective } from "../../../src/lib/seedGuard.ts";
import type { AreaAllocation } from "../../../src/lib/baselineContract.ts";
import {
  OUTREACH_HOOK_QUESTIONS,
  WIZARD_MIN_QUESTIONS,
  WIZARD_MAX_QUESTIONS,
  BASELINE_QUESTIONS,
} from "../../../src/lib/auditQuestionCounts.ts";

// create-ai-audit — fast, NO Apify. Generates the audit's search questions with
// OpenAI (gpt-4o-mini, tool-calling, mirrors admin-ai-opener), creates the audit +
// run + one queue row per question, and returns the questions + a cost estimate.
// The actual multi-engine SERP runs happen later in process-ai-audit-queue.
//
// user_id is set EXPLICITLY on every row (no DB default). Writes use the service key
// after the caller's JWT is verified; a provided lead_id is ownership-checked.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// The engines each question is checked against. The actor also returns AI Overview +
// Google organic in the same run; those are captured/shown but not queue engines.
// (Perplexity dropped — kept dormant in ai-search.ts in case it's re-added.)
const AUDIT_ENGINES = ["chatgpt", "gemini"];
// How many questions to generate. Bounds come from the shared policy module so the SPA, the
// outreach hook and the paid baseline cannot drift apart. Always clamped server-side (the count
// is untrusted client input). Callers are expected to state their own count explicitly — the
// default here is a floor for anything that forgets, not a path's intended value.
const MIN_QUESTION_COUNT = WIZARD_MIN_QUESTIONS;
const MAX_QUESTION_COUNT = WIZARD_MAX_QUESTIONS;
const DEFAULT_QUESTION_COUNT = OUTREACH_HOOK_QUESTIONS;

// PAID BASELINE counts. The outreach hook only has to prove "you're invisible", so 3..5 is
// plenty there. A paying client's baseline is the measuring stick for the money-back
// guarantee, and 3..5 is far too noisy for that: observed run-to-run swings on a 5-question
// audit reach 50+ percentage points, where one flipped cell moves the rate 10 points. These
// higher bounds apply ONLY to trusted internal callers that ask for purpose='baseline'
// (see BASELINE_PURPOSE below), so no public caller can raise its own cost ceiling.
const BASELINE_MIN_QUESTION_COUNT = 6;
/* 20, raised from 12. A re-measurement supplies its OWN question set so the before and after
   compare like with like, and ABLM's set was 16 — at 12 the last four were dropped SILENTLY,
   including a core Wisbech question, producing a comparison built on three quarters of the set with
   nothing on screen to say so. The DEFAULT is untouched at BASELINE_QUESTIONS (10): this raises the
   ceiling for a caller that explicitly asks for more, not the cost of a normal paid baseline. */
const BASELINE_MAX_QUESTION_COUNT = 20;
const BASELINE_DEFAULT_QUESTION_COUNT = BASELINE_QUESTIONS;

/** Clamp an untrusted question-count into [min..max], defaulting to `def`. */
function clampCount(
  n: unknown,
  min = MIN_QUESTION_COUNT,
  max = MAX_QUESTION_COUNT,
  def = DEFAULT_QUESTION_COUNT,
): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : def;
  return Math.min(max, Math.max(min, v));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Country / region / remote tokens that mark a business as NATIONAL scope. Mirrors the
// classification the OpenAI prompt is told to do, so the deterministic fallback produces
// the right SHAPE of questions too.
const NATIONAL_LOC_TERMS = new Set([
  "uk", "u.k.", "united kingdom", "great britain", "britain", "gb", "england", "scotland",
  "wales", "northern ireland", "ireland", "eire", "republic of ireland",
  "usa", "u.s.a.", "us", "u.s.", "united states", "united states of america", "america",
  "canada", "australia", "new zealand", "nz", "thailand",
  "nationwide", "national", "online", "remote", "everywhere", "anywhere",
]);
// Location tokens that are national but NOT a usable country/region qualifier for a phrase.
const NON_GEO_NATIONAL = new Set(["nationwide", "national", "online", "remote", "everywhere", "anywhere"]);

// Explicit client-engagement scope from the wizard. 'local'/'national' HARD-FORCE the
// question shape (overriding the location heuristic); 'hybrid'/null fall back to it.
type BusinessScope = "national" | "local" | "hybrid" | null;

/** True when the business serves a whole country/region or works remotely (NATIONAL scope),
 *  vs a specific town/city (LOCAL). Empty location → treated as national. */
function isNationalScope(loc: string, specialisms: string): boolean {
  const l = loc.trim().toLowerCase();
  if (!l || l === "the local area") return true;                       // no town given → national
  if (NATIONAL_LOC_TERMS.has(l)) return true;                          // location IS a country/region/"online"
  if (/\b(nationwide|national|online|remote|whole of|across the|no physical office|serves? clients nationally)\b/.test(l)) return true;
  if (/\b(nationwide|national|remote|online|no physical office|clients? (?:across|nationally))\b/.test(specialisms.toLowerCase())) return true;
  return false;
}

/** A usable town for LOCAL "[service] in [town]" framing — not empty, not the "the local
 *  area" placeholder, and not a bare country/region term. Used to reject a forced-local
 *  audit that has no town rather than silently producing national ("uk") questions. */
function hasUsableTown(loc: string): boolean {
  const l = loc.trim().toLowerCase();
  if (!l || l === "the local area") return false;
  if (NATIONAL_LOC_TERMS.has(l)) return false;
  return true;
}

/** Deterministic template questions — the fallback when OpenAI is unavailable or returns
 *  something that doesn't validate. Scope-aware: LOCAL uses "[service] in [town]" plus a
 *  NEVER any "near me" (banned everywhere — the place is always named); NATIONAL uses
 *  audience-qualified "[service] for [audience] [country]" with NO broad best/top head-terms.
 *  Grounded in "known for" when given.
 *  Sliced to `count`. */
function fallbackQuestions(type: string, loc: string, hasWebsite: boolean, specialisms: string, count: number, scope: BusinessScope, country: string | null): string[] {
  const t = type || "business";
  // UK LOCAL audits: UNCONDITIONALLY disambiguate the town in question text ("Stamford UK") —
  // town names shared with bigger non-UK places (Stamford CT, Peterborough Ontario, Boston MA…)
  // make engines answer from the wrong country. Simpler than an ambiguity list and never wrong.
  // Skipped when the location already carries a UK marker.
  const isUK = ["UK", "GB"].includes((country ?? "").trim().toUpperCase());
  const ukTown = (l: string) => (isUK && l && !/\b(uk|united kingdom|england|scotland|wales)\b/i.test(l) ? `${l} UK` : l);
  const niches = specialisms
    ? specialisms.split(/[,;/]|\band\b/i).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 1)
    : [];

  let base: string[];
  // 'local'/'national' force the branch; 'hybrid'/null keep the location heuristic.
  const national = scope === "local" ? false : scope === "national" ? true : isNationalScope(loc, specialisms);
  if (national) {
    const l = loc.trim().toLowerCase();
    // Use the real country/region from the location when it is one; else default to "uk".
    const region = l && NATIONAL_LOC_TERMS.has(l) && !NON_GEO_NATIONAL.has(l) ? ` ${l}` : " uk";
    base = [
      ...niches.map((nk) => `${nk} ${t}${region}`),                    // niche-grounded, national
      `${t} for small businesses${region}`,
      `${t} for startups${region}`,
      `specialist ${t}${region}`,
      `${t} for sole traders${region}`,
      `${t} for limited companies${region}`,
      `remote ${t}${region}`,
      `${t} for contractors${region}`,
      `${t} for ecommerce businesses${region}`,
      `${t} for landlords${region}`,
      `${t} for charities${region}`,
      `${t} for freelancers${region}`,
      `${t} for property investors${region}`,
    ];
  } else {
    const where = loc ? ` in ${ukTown(loc)}` : "";
    base = [
      ...niches.map((nk) => `${nk} ${t}${where}`),                     // niche-grounded, local
      `best ${t}${where}`,
      `top rated ${t}${where}`,
      `which ${t}${where} do people recommend`,
      hasWebsite ? `${t}${where} with online booking` : `${t}${where} that is easy to contact`,
      `affordable ${t}${where}`,
      `${t}${where} with great reviews`,
      `where to find a good ${t}${where}`,
      `most popular ${t}${where}`,
      `highly rated ${t}${where}`,
    ];
  }

  /* De-dupe (a niche can echo a template), ban near-me, slice to the requested count.
     CASE-INSENSITIVE: keyed on q.trim() this let "... in hastings uk" and "... in Hastings UK"
     both through as separate questions. */
  const out = dedupeQuestions(base).questions;
  return stripNearMe(out).slice(0, Math.min(out.length, Math.max(1, count)));
}

/** HARD near-me ban on GENERATED questions (LLM + fallback): drop any question containing a
 *  "near me" variant, case-insensitive. Operator-typed questions are deliberately not filtered. */
function stripNearMe(questions: string[]): string[] {
  return questions.filter((q) => !/near\s*me\b/i.test(q));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: a trusted INTERNAL call (whatsapp-inbound's reply→audit automation) OR an
    //     authenticated user. Internal branch mirrors extract-competitors: a matching CRON_SECRET
    //     header + x-internal-job, OR the service-role key + x-internal-job. Purely ADDITIVE — an
    //     external caller can hold neither, so the user-JWT path below is byte-for-byte unchanged.
    //     An internal call carries no user session, so userId comes from body.user_id (the lead's
    //     owner, passed by the caller) — set after the body is parsed. ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isInternal =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && !!req.headers.get("x-internal-job")) ||
      (!!serviceKey && token === serviceKey && !!req.headers.get("x-internal-job"));

    let userId = "";
    if (!isInternal) {
      if (!token) return json({ ok: false, error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      userId = u.user.id;
    }

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    // Internal call: no session — the owner is supplied explicitly (the lead's user_id).
    if (isInternal) {
      userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!userId) return json({ ok: false, error: "user_id required for internal call" }, 400);
    }
    const businessName: string = typeof body.business_name === "string" ? body.business_name.trim() : "";
    const businessType: string = typeof body.business_type === "string" ? body.business_type.trim() : "";
    // `let`, not `const`: the real town OVERRIDES this below. Reassigning the one variable every
    // downstream reader already uses is deliberate — a parallel `effectiveLocation` would leave any
    // usage I failed to spot still on the searched town.
    let locationText: string = typeof body.location_text === "string" ? body.location_text.trim() : "";
    const country: string | null = typeof body.country === "string" ? body.country : null;
    const website: string | null = typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;
    const hasWebsite: boolean = body.has_website === true;
    const leadId: string | null = typeof body.lead_id === "string" && body.lead_id ? body.lead_id : null;
    // Optional: re-run an EXISTING audit (Phase 4 "re-run" hook). Reuses the audit's
    // business + its previous questions so before/after compares like-for-like.
    const reuseAuditId: string | null = typeof body.audit_id === "string" && body.audit_id ? body.audit_id : null;
    // preview: generate (or price) the questions WITHOUT creating any rows — powers the
    // wizard's editable review screen. questions[]: an explicit override (edited list)
    // used instead of generating; capped so a client can't enqueue an unbounded run.
    const preview: boolean = body.preview === true;
    // Queue the auto-pitch for when this audit completes: park an 'awaiting_audit' row in
    // whatsapp_auto_replies (service-role — the table is RLS-locked to the server), carrying the
    // operator's reply template. The completion hook in process-ai-audit-queue upgrades it to
    // 'pending'. Reproduces the reply-chain semantics for UI-triggered audits (Inbox audit button).
    const queuePitchOnComplete: boolean = body.queue_pitch_on_complete === true;
    // How many questions to generate (6..12, default 8). Also the cap for an edited
    // list the client submits, so a user who picked 12 can enqueue 12.
    // purpose='baseline' (paid client) unlocks the wider question bounds. INTERNAL ONLY:
    // findable-onboarding calls this server-side with the service key, so a public caller
    // cannot opt itself into 10-12 questions and triple our Apify spend.
    const isBaseline = isInternal && body.purpose === "baseline";
    const questionCount = isBaseline
      ? clampCount(body.question_count ?? body.questionCount,
          BASELINE_MIN_QUESTION_COUNT, BASELINE_MAX_QUESTION_COUNT, BASELINE_DEFAULT_QUESTION_COUNT)
      : clampCount(body.question_count ?? body.questionCount);
    // The provided-questions cap must match, or a baseline REPEAT run (which passes the first
    // run's questions verbatim so the three runs are like-for-like) would silently truncate
    // 10 questions to 5 and average two different question sets.
    const MAX_QUESTIONS = isBaseline ? BASELINE_MAX_QUESTION_COUNT : MAX_QUESTION_COUNT;
    // How many runs make up this audit's baseline. Stored on the audit; the queue's completion
    // hook fires the remaining runs and averages them. Absent/0 → an ordinary single-run audit.
    const baselineTargetRuns = isBaseline
      ? Math.min(5, Math.max(1, typeof body.baseline_target_runs === "number" ? Math.round(body.baseline_target_runs) : 1))
      : 0;
    /* SILENT TRUNCATION WAS THE REAL BUG, not the number. The cap is a cost ceiling and stays, but
       quietly returning fewer questions than were asked for is how a before/after ends up built on a
       subset with nothing to say so. Whatever falls off the end is captured, logged, and reported on
       every response. */
    const suppliedQuestions: string[] | null = Array.isArray(body.questions)
      ? body.questions.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
      : null;
    const providedQuestions: string[] | null = suppliedQuestions ? suppliedQuestions.slice(0, MAX_QUESTIONS) : null;
    const droppedQuestions: string[] = suppliedQuestions ? suppliedQuestions.slice(MAX_QUESTIONS) : [];
    if (droppedQuestions.length) {
      console.error(`[create-ai-audit] TRUNCATED: ${suppliedQuestions!.length} supplied, cap ${MAX_QUESTIONS}, DROPPED ${droppedQuestions.length}: ${droppedQuestions.join(" | ")}`);
    }
    /* Spread into both responses. Conditional so a clean call stays clean — the keys are absent
       entirely when nothing was dropped, rather than a truncated:false a caller learns to ignore. */
    const truncationReport = droppedQuestions.length
      ? {
          truncated: true,
          question_cap: MAX_QUESTIONS,
          supplied_count: suppliedQuestions!.length,
          dropped_count: droppedQuestions.length,
          dropped_questions: droppedQuestions,
        }
      : {};
    // Optional free-text specialisms ("kava, pool tables"). Weights the niche/differentiator
    // questions; blank → the generator infers the specialism from the name + type.
    const specialisms: string = typeof body.specialisms === "string" ? body.specialisms.trim().slice(0, 200) : "";
    // Explicit client-engagement scope from the wizard. Only the three known values are stored;
    // anything else (incl. absent) → null, so the downstream heuristic still applies.
    const VALID_SCOPES = new Set(["national", "local", "hybrid"]);
    const businessScope: BusinessScope = typeof body.business_scope === "string" && VALID_SCOPES.has(body.business_scope)
      ? (body.business_scope as BusinessScope) : null;
    /* Caller asked for NO website SEO scan (market-populating batches). Opt-IN only, so every
       existing caller is untouched, and it can only ever REDUCE spend - which is why it needs no
       internal-caller gate. Applied at the run insert below. */
    const skipSeo: boolean = body.skip_seo === true;
    /* MARKET-POPULATING AUDIT. Set by the market panel's batch (via bulk-jobs params). It turns on
       cross-audit intent coverage: generation is told what this trade+town has already been asked
       so it covers new ground. Deliberately NOT applied to baselines — a paid client's set must be
       stable and seed-driven, and two businesses in one market getting different questions is right
       for mapping a market and wrong for measuring a client. */
    const isMarket: boolean = body.purpose === "market";
    /* MULTI-AREA BASELINE. audit-baseline sends the allocation it froze into the baseline contract:
       [{town, questions, isMain}]. The MAIN town keeps location_text and the verbatim seed; each
       extra area gets its own generated questions for the same services. Absent (every other
       caller) leaves the single-town path byte-for-byte unchanged.
       INTERNAL ONLY, like purpose='baseline': it decides what a paying client is measured on. */
    const areaAllocation: AreaAllocation[] = isInternal && Array.isArray(body.areas)
      ? (body.areas as unknown[])
        .map((a) => a as { town?: unknown; questions?: unknown; isMain?: unknown })
        .filter((a) => typeof a.town === "string" && (a.town as string).trim() && Number(a.questions) > 0)
        .map((a) => ({ town: (a.town as string).trim(), questions: Math.floor(Number(a.questions)), isMain: a.isMain === true }))
      : [];

    if (!businessName && !reuseAuditId) return json({ ok: false, error: "business_name required" }, 400);

    /* ── REUSE THE LEAD'S EXISTING AUDIT INSTEAD OF MINTING A DUPLICATE ─────────
       The Inbox audit button, the outreach bulk runner and the wizard's "Run audit" all posted a
       lead_id but no audit_id, so every press created a brand-new ai_audits row for the same
       business. Only the wizard's edited re-run and the baseline chain passed audit_id and did it
       right. Result: 7 leads currently hold duplicate audits, and a re-audit lost its own history.
       Fixed HERE, server-side, so all three callers (and any future one) get it right rather than
       three call sites drifting apart again.

       PAID BASELINES ARE DELIBERATELY EXCLUDED. advanceBaseline averages `usable.slice(0, target)`
       - the first N runs by run_number - so while a baseline is still draining an outreach re-run
       would land inside that window and pollute a like-for-like average with a different, shorter
       question set. A FINALISED baseline is protected (advanceBaseline returns early once
       ai_audits.baseline is set), but the window reopens for as long as each new client's three
       runs take to drain. So never reuse a paid baseline; if that is all the lead has, create a
       fresh ordinary audit and leave the paid measurement alone.

       No lead_id (the wizard's "new business" path) still creates a new audit: without one there is
       no reliable key for "the same business", and name matching would merge the wrong records. */
    let effectiveReuseId = reuseAuditId;
    // A PAID BASELINE never resolves onto an existing audit. baseline_target_runs is only written
    // on the insert path, so reusing here would hand the client a run on their old outreach audit
    // and NO baseline row - and the paid-client backstop, seeing no baseline, would start another
    // one every minute forever. A baseline must be its own audit.
    if (!effectiveReuseId && leadId && !isBaseline) {
      const { data: candidates } = await service
        .from("ai_audits")
        .select("id, baseline_target_runs, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      const all = (candidates ?? []) as Array<{ id: string; baseline_target_runs: number | null }>;
      const reusable = all.find((a) => Number(a.baseline_target_runs ?? 0) <= 1);
      if (reusable) {
        effectiveReuseId = reusable.id;
        console.log(`[create-ai-audit] lead ${leadId}: adding a run to existing audit ${reusable.id} rather than creating a duplicate`);
      } else if (all.length) {
        console.log(`[create-ai-audit] lead ${leadId}: only paid-baseline audits exist, creating a separate ordinary audit so the baseline stays clean`);
      }
    }

    /* ── THE REAL TOWN, not the searched one ────────────────────────────────────────────────────
       Lead search has a radius, so the town I searched is not where the business is. A Huntingdon
       locksmith came back from a Wisbech search and was told AI does not know he exists; he is top of
       his own patch and said so. 37 reports went out with that fault.

       PRECEDENCE: confirmed_location (a human said it) || derived_town (Google's address) ||
       search_location (my query). See pickAuditTown.

       THIS IS AN OVERRIDE, NOT A FALLBACK, and that is the whole point. bulk-jobs:229 and
       _shared/whatsapp-inbound.ts (:226, and :376 which is the LIVE auto-audit chain) each BUILD
       location_text themselves as `search_location || address` and pass it in. Code that only filled a
       BLANK location_text would fix the wizard alone and leave the two highest-volume paths — the ones
       that produced eight Wisbech locksmiths — still asking about the wrong town.

       Placed BEFORE the local-scope guard below on purpose: a derived town can satisfy a guard that
       the searched town fails.

       SKIPPED on the reuse path — a re-run must repeat the stored audit's town, like-for-like, or the
       before/after stops comparing the same thing.

       ONE try/catch, and it never rethrows: enrichment must not be able to block an audit. On any
       failure the searched town is used and location_source records that it was not verified. */
    let locationSource: "confirmed" | "derived" | "search" | "none" = locationText ? "search" : "none";
    let townNote: string | null = null;
    if (!effectiveReuseId && leadId) {
      try {
        const [onbRes, derived] = await Promise.all([
          service.from("onboarding_responses").select("confirmed_location")
            .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          resolveDerivedTown(service, leadId),
        ]);
        const picked = pickAuditTown({
          confirmedLocation: onbRes?.data?.confirmed_location ?? null,
          derivedTown: derived.town,
          searchLocation: locationText,
        });
        if (picked.town) { locationText = picked.town; locationSource = picked.source; }
        townNote = derived.error;
        console.log(
          `[create-ai-audit] lead ${leadId}: town "${locationText}" via ${locationSource}`
          + ` (derive: ${derived.source}${derived.error ? ` — ${derived.error}` : ""})`,
        );
      } catch (e) {
        townNote = e instanceof Error ? e.message : String(e);
        console.warn(`[create-ai-audit] town derivation failed, proceeding on the searched town: ${townNote}`);
      }
    }

    // Forced LOCAL needs a real town — otherwise "[service] in [town]" has no town and we'd
    // silently drift national. Reject cleanly so the caller supplies one.
    //
    // NOT applied to a re-run. On that path the town comes from the STORED audit, not the
    // request, and this guard tested the request's location_text — so when advanceBaseline began
    // forwarding the audit's scope ('local') without re-sending its town, every repeat run of a
    // paid baseline was refused with local_scope_needs_town. Both baselines created on
    // 2026-07-26 died here, silently, leaving the customer on 1 run of a promised 3. The re-run
    // branch validates the stored town itself and degrades to classifier scope instead of
    // failing a paying customer's chain.
    if (!effectiveReuseId && businessScope === "local" && !hasUsableTown(locationText)) {
      return json({ ok: false, error: "local_scope_needs_town" }, 400);
    }

    const estCost = SOURCES.ai_search.estCostUsd;
    // ONE actor run per question covers every engine, so the cost is per QUESTION. Multiplying
    // by AUDIT_ENGINES.length double-counted it and, on top of the old 20x-high unit price,
    // made a 10-question audit look like $10 when it is about 2.5 cents.
    const estimate = (n: number) => Number((n * estCost).toFixed(4));

    // Preview: return questions + cost estimate only (no DB writes).
    if (preview) {
      const qs = providedQuestions && providedQuestions.length
        ? providedQuestions
        : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country);
      return json({
        ok: true,
        preview: true,
        questions: qs,
        question_count: qs.length,
        estimated_cost_usd: estimate(qs.length),
        unit_cost_usd: estCost,
        engines: AUDIT_ENGINES,
        ...truncationReport,
      });
    }

    // If a lead_id is provided, it MUST belong to the caller (don't let an audit attach
    // to someone else's lead). Skipped for trusted internal calls — the automation already acts
    // as the lead's owner via the passed user_id (mirrors extract-competitors's isInternal skip).
    if (leadId && !isInternal) {
      const { data: lead } = await service.from("outreach_leads").select("user_id").eq("id", leadId).maybeSingle();
      if (!lead || lead.user_id !== userId) return json({ ok: false, error: "lead_not_found" }, 403);
    }

    // ── Resolve the audit row + the question set ──────────────────────────────
    let auditId: string;
    let auditBusinessName = businessName;
    let questions: string[] = [];
    /* Populated only on the baseline seeding path. Surfaced on the response so a rejected seed is
       VISIBLE rather than a silent fallback — the whole failure this guards against is a bad
       question entering the guarantee unnoticed, and a guard you cannot see firing is barely a
       guard. Empty arrays here mean "not a seeded call", not "nothing rejected". */
    let seededQuestions: string[] = [];
    let rejectedSeeds: Array<{ question: string; reason: string }> = [];

    if (effectiveReuseId) {
      // Re-run: load + ownership-check the existing audit, reuse its questions. Reusing the STORED
      // questions is the point of a re-audit - the same questions asked again is what makes two
      // runs comparable - so an Inbox re-audit repeats the previous set rather than generating a
      // fresh one. Bounded: baselines are excluded above, so the stored set is an outreach-sized
      // 3-5 questions, never a 10-question baseline.
      const { data: audit } = await service
        .from("ai_audits")
        .select("id, user_id, business_name, business_type, location_text, country, has_website, business_scope")
        .eq("id", effectiveReuseId)
        .maybeSingle();
      if (!audit || audit.user_id !== userId) return json({ ok: false, error: "audit_not_found" }, 403);
      auditId = audit.id;
      auditBusinessName = audit.business_name;
      // Re-run honours the audit's STORED scope (like-for-like), not the request's.
      const reRunScope: BusinessScope = typeof audit.business_scope === "string" && VALID_SCOPES.has(audit.business_scope)
        ? (audit.business_scope as BusinessScope) : null;
      if (providedQuestions && providedQuestions.length) {
        // Edited re-run: honor the operator's edited question list on the SAME audit.
        questions = providedQuestions;
      } else {
        // Like-for-like re-run: reuse the questions from the audit's latest run.
        const { data: latestRun } = await service
          .from("ai_audit_runs").select("id").eq("audit_id", auditId)
          .order("run_number", { ascending: false }).limit(1).maybeSingle();
        if (latestRun) {
          const { data: prevQ } = await service
            .from("ai_audit_queue").select("question").eq("run_id", latestRun.id).order("created_at", { ascending: true });
          /* Case-insensitive: a run that already holds two casings of one question must not
             propagate both into the next run. First spelling wins. */
          const prev = dedupeQuestions(((prevQ ?? []) as Array<{ question: string }>).map((r) => String(r.question ?? "")));
          questions.push(...prev.questions);
          if (prev.duplicates.length) {
            console.warn(`[create-ai-audit] previous run had ${prev.duplicates.length} case-duplicate question(s), not repeated: ${prev.duplicates.join(" | ")}`);
          }
        }
        if (questions.length < MIN_QUESTION_COUNT) {
          // The stored scope is honoured, but 'local' without a usable stored town would build
          // town-less "[service] in " questions. Degrade to classifier scope rather than refuse:
          // this path is a paid baseline's repeat run, and failing it strands the guarantee.
          const genScope: BusinessScope = reRunScope === "local" && !hasUsableTown((audit.location_text as string) ?? "")
            ? null : reRunScope;
          questions = await generateQuestions(audit.business_name ?? "", audit.business_type ?? "", audit.location_text ?? "", audit.has_website === true, specialisms, questionCount, genScope, (audit.country as string | null) ?? country);
        }
      }
    } else {
      /* New audit: edited questions verbatim if a FULL set was provided, else generate.
         BETWEEN those two sits the paid baseline's first run, which now arrives with the outreach
         audit's 3 questions and a question_count of 10. Those 3 are a SEED, not the set: they are
         guarded, kept, and topped up to 10 by the generator.

         The `>= questionCount` test is what keeps runs 2 and 3 byte-for-byte unchanged — they send
         the full stored set, so they take the verbatim branch exactly as before. Only a SHORT
         supplied set on a baseline is treated as a seed, which no existing caller sends. */
      /* WHAT THIS MARKET HAS ALREADY BEEN ASKED. Market audits only, and best-effort: a failure
         here just means the generator gets no coverage hint and behaves exactly as before.
         Measured need: six Hastings locksmith audits produced 18 questions covering five intents,
         with the generic head question asked six times, while car keys / safes / uPVC / key cutting
         / commercial work were never asked at all. */
      let coverage = "";
      if (isMarket && businessType && locationText) {
        try {
          const { data: sameMarket } = await service
            .from("ai_audits").select("id")
            .eq("user_id", userId).eq("business_type", businessType).ilike("location_text", locationText);
          const otherIds = ((sameMarket ?? []) as Array<{ id: string }>).map((a) => a.id);
          if (otherIds.length) {
            const { data: askedRows } = await service
              .from("ai_audit_queue").select("question").in("audit_id", otherIds).limit(400);
            const asked = ((askedRows ?? []) as Array<{ question: string }>)
              .map((r) => (r.question ?? "").trim()).filter(Boolean);
            coverage = coverageDirective(asked, businessType);
            if (coverage) {
              console.log(`[create-ai-audit] market coverage: steering away from ${dedupeQuestions(asked).questions.length} question(s) already asked for "${businessType}" in "${locationText}"`);
            }
          }
        } catch (e) {
          console.warn("[create-ai-audit] coverage lookup failed (generation unaffected):", e instanceof Error ? e.message : e);
        }
      }
      const isSeeding = isBaseline && !!providedQuestions?.length && providedQuestions.length < questionCount;
      /* ORDER MATTERS. The multi-area branch must be tested BEFORE isSeeding: a multi-area baseline
         normally arrives WITH a short seed, so the single-town seeded branch would win and the extra
         areas would be silently dropped — the exact failure this work exists to remove. The
         multi-area branch does its own seeding for the main town's share. */
      if (areaAllocation.length > 1) {
        /* MULTI-AREA, SEED-PRESERVING. The main town's share carries the verbatim seed (topped up
           if the seed is short); every extra area is generated for the same services in that town.
           One LLM call per area, gpt-4o-mini — the Apify question runs dominate the bill, not this.
           A failed area generation is skipped and LOGGED rather than silently substituted, so the
           stored contract and the queued set cannot disagree about what was measured. */
        const perArea: string[] = [];
        for (const area of areaAllocation) {
          if (area.isMain) continue;
          try {
            const qs = await generateQuestions(businessName, businessType, area.town, hasWebsite, specialisms, area.questions, "local", country);
            perArea.push(...qs.slice(0, area.questions));
          } catch (e) {
            console.error(`[create-ai-audit] area "${area.town}" generation failed, area NOT measured:`, e instanceof Error ? e.message : e);
          }
        }
        const mainShare = areaAllocation.find((a) => a.isMain)?.questions ?? questionCount;
        let mainQs: string[];
        if (providedQuestions?.length && providedQuestions.length < mainShare) {
          const generated = await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, mainShare, businessScope, country);
          const outcome = applySeed(providedQuestions, generated, mainShare, businessType, locationText);
          mainQs = outcome.questions;
          seededQuestions = outcome.seeded;
          rejectedSeeds = outcome.rejected;
        } else if (providedQuestions?.length) {
          mainQs = providedQuestions.slice(0, mainShare);
          seededQuestions = mainQs;
        } else {
          mainQs = await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, mainShare, businessScope, country);
        }
        questions = [...mainQs, ...perArea];
        console.log(`[create-ai-audit] multi-area baseline: ${mainQs.length} for "${locationText}" (${seededQuestions.length} seeded) + ${perArea.length} across ${areaAllocation.length - 1} other areas = ${questions.length}`);
      } else if (isSeeding) {
        const generated = await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country);
        const outcome = applySeed(providedQuestions!, generated, questionCount, businessType, locationText);
        questions = outcome.questions;
        seededQuestions = outcome.seeded;
        rejectedSeeds = outcome.rejected;
        if (outcome.rejected.length) {
          console.error(`[create-ai-audit] SEED REJECTED ${outcome.rejected.length}: ${outcome.rejected.map((r) => `"${r.question}" (${r.reason})`).join(" | ")}`);
        }
        console.log(`[create-ai-audit] baseline seeded with ${outcome.seeded.length} of ${providedQuestions!.length} outreach questions, topped up to ${questions.length}`);
      } else {
        questions = providedQuestions && providedQuestions.length
          ? providedQuestions
          : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country, coverage);
      }
      const auditRow: Record<string, unknown> = {
        user_id: userId,
        lead_id: leadId,
        business_name: businessName,
        business_type: businessType || null,
        location_text: locationText || null,
        country,
        has_website: hasWebsite,
        website,
        specialism: specialisms || null,
        business_scope: businessScope,
        /* WHICH TOWN AND WHY. Without this a wrong-town audit is undiagnosable after the fact — you
           cannot tell a verified Huntingdon from a searched Wisbech that happened to be right.
           'search' means UNVERIFIED: nothing confirmed it. */
        location_source: locationSource,
        location_note: townNote,
      };
      // Mark this as a multi-run paid baseline. Migration-tolerant: if the column is not
      // there yet the insert is retried without it, so a pending migration degrades to an
      // ordinary single-run audit instead of failing a paying customer's submission.
      if (baselineTargetRuns > 1) auditRow.baseline_target_runs = baselineTargetRuns;
      let { data: audit, error: insErr } = await service
        .from("ai_audits").insert(auditRow).select("id, business_name").single();
      if (insErr && /baseline_target_runs/i.test(insErr.message ?? "")) {
        console.warn("[create-ai-audit] baseline_target_runs column missing — creating a single-run audit");
        delete auditRow.baseline_target_runs;
        ({ data: audit, error: insErr } = await service
          .from("ai_audits").insert(auditRow).select("id, business_name").single());
      }
      if (insErr || !audit) return json({ ok: false, error: insErr?.message ?? "audit_insert_failed" }, 500);
      auditId = audit.id;
      auditBusinessName = audit.business_name;
    }

    // ── Create the run (run_number = max existing + 1, default 1) ──────────────
    const { data: lastRun } = await service
      .from("ai_audit_runs").select("run_number").eq("audit_id", auditId)
      .order("run_number", { ascending: false }).limit(1).maybeSingle();
    const runNumber = (lastRun?.run_number ?? 0) + 1;

    /* SKIP THE SEO SCAN, WITHOUT A SCHEMA CHANGE.
       A market-populating batch wants to know who AI names in a town; grading five strangers'
       websites was ~60% of its bill ($0.12 each) and answered a question nobody asked.
       maybeRunSeoStep in process-ai-audit-queue skips any run whose results.seo is already set,
       so seeding an explicit SKIP MARKER here is all it takes. The marker deliberately carries no
       `categories`, so isReusableSeo (queue) and isRenderableSeo (report) both reject it: nothing
       downstream can mistake it for a grade, and no report renders an SEO block from it.
       Only the CALLER decides this - default is unchanged, so every existing path still scans. */
    const runResults = skipSeo
      ? { seo: { skipped: "seo_scan_not_requested", checked_at: new Date().toISOString() } }
      : {};
    const { data: run, error: runErr } = await service
      .from("ai_audit_runs")
      .insert({ audit_id: auditId, user_id: userId, run_number: runNumber, status: "pending", results: runResults })
      .select("id")
      .single();
    if (runErr || !run) return json({ ok: false, error: runErr?.message ?? "run_insert_failed" }, 500);
    const runId = run.id;

    // ── Enqueue one row per question ──────────────────────────────────────────
    /* THE FINAL GATE. Whatever path produced `questions` — LLM, templates, a verbatim repeat, a
       seed top-up, or the multi-area concatenation — no two rows may be the same question in
       different capitals. There was no dedupe here at all, which is how one audit could queue both
       casings. Original spelling is preserved; only the identity is normalised. */
    const finalQ = dedupeQuestions(questions);
    if (finalQ.duplicates.length) {
      console.warn(`[create-ai-audit] ${finalQ.duplicates.length} case-duplicate question(s) dropped before queueing: ${finalQ.duplicates.join(" | ")}`);
    }
    questions = finalQ.questions;
    const queueRows = questions.map((q) => ({
      audit_id: auditId,
      run_id: runId,
      user_id: userId,
      question: q,
      engines: AUDIT_ENGINES,
      status: "pending",
    }));
    const { error: qErr } = await service.from("ai_audit_queue").insert(queueRows);
    if (qErr) return json({ ok: false, error: qErr.message }, 500);

    // Optional auto-pitch on completion (Inbox audit button). Best-effort + additive: a failure
    // here never fails the audit that was just created. 23505 = the lead's once-ever slot is
    // already owned (e.g. the reply trigger got there first) — first-trigger-wins, fine.
    let pitchQueued = false;
    let pitchNote: string | undefined;
    if (queuePitchOnComplete && leadId) {
      try {
        const { data: leadRow } = await service
          .from("outreach_leads").select("phone, country, is_archived").eq("id", leadId).maybeSingle();
        const to = toWhatsAppNumber((leadRow?.phone as string) ?? "", (leadRow?.country as string | null) ?? null);
        const parkTemplate = await firstReplyTemplate(service);
        /* Archived → park NOTHING, and say so. Checked FIRST so it wins over the phone/already-sent
           notes: "we won't pitch them" is the operative fact, not which other condition also held.
           Same reasoning as the other two arm points — lead_id is UNIQUE on whatsapp_auto_replies, so
           any row permanently spends the lead's once-ever slot, including a row that only records a
           refusal. The audit itself still runs: an operator asking what a business looks like in AI
           search is not contacting that business. */
        if (leadRow?.is_archived === true) {
          pitchNote = "lead_archived";
        } else if (!to) {
          pitchNote = "no_usable_phone";
        } else if (await pitchEverSent(service, leadId, parkTemplate ?? "audit_reply")) {
          // DURABLE once-ever: the pitch already went to this lead (message log — covers manual
          // Inbox sends and survives queue-row deletion). Never park a second one.
          pitchNote = "pitch_already_sent";
        } else {
          const { error: pErr } = await service.from("whatsapp_auto_replies").insert({
            lead_id: leadId,
            phone: to,
            template_name: parkTemplate,
            status: "awaiting_audit",
            fire_after: new Date().toISOString(), // real fire_after set by the completion upgrade
          });
          if (!pErr) pitchQueued = true;
          else if ((pErr as { code?: string }).code === "23505") pitchNote = "slot_already_owned";
          else pitchNote = (pErr as { message?: string }).message?.slice(0, 200) ?? "insert_failed";
        }
      } catch (e) {
        pitchNote = (e instanceof Error ? e.message : "pitch_queue_failed").slice(0, 200);
      }
    }

    return json({
      ok: true,
      audit_id: auditId,
      run_id: runId,
      run_number: runNumber,
      pitch_queued: pitchQueued,
      ...(pitchNote ? { pitch_note: pitchNote } : {}),
      business_name: auditBusinessName,
      questions,
      question_count: questions.length,
      // Estimate: question_count × engines × per-question source cost (see sources.ts).
      estimated_cost_usd: estimate(questions.length),
      unit_cost_usd: estCost,
      engines: AUDIT_ENGINES,
      ...truncationReport,
      /* Mirrors truncationReport's shape: absent entirely on a normal call, so a caller cannot
         learn to ignore a permanently-present "seeded: false". */
      ...(seededQuestions.length || rejectedSeeds.length
        ? {
            seeded: true,
            seeded_count: seededQuestions.length,
            seeded_questions: seededQuestions,
            rejected_seed_count: rejectedSeeds.length,
            rejected_seeds: rejectedSeeds,
          }
        : {}),
    });
  } catch (e) {
    console.error("[create-ai-audit] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

/**
 * Generate `count` audit questions via OpenAI (gpt-4o-mini, tool-calling). `count` is
 * clamped to 6..12 (default 8). Model output is untrusted — validated to at least
 * `count` non-empty strings then sliced to exactly `count`; ANY failure (config,
 * network, non-OK, parse, validation) falls back to the deterministic template set so
 * the audit always has questions.
 */
async function generateQuestions(
  businessName: string,
  businessType: string,
  locationText: string,
  hasWebsite: boolean,
  specialisms: string,
  count: number,
  scope: BusinessScope,
  country: string | null,
  /** MARKET AUDITS ONLY: what this trade+town has already been asked, so the generator covers new
   *  ground instead of repeating the same five intents. Empty for every other caller. */
  coverage = "",
): Promise<string[]> {
  // The CALLER has already applied the right POLICY ceiling: MAX_QUESTION_COUNT for the outreach
  // hook, BASELINE_MAX_QUESTION_COUNT for a paid baseline. Re-clamping here with clampCount's
  // default max silently capped every paid baseline at 5 — measured live, a baseline that asked
  // for 10 got exactly 5. Keep an ABSOLUTE upper bound so an absurd value is still refused, but
  // never re-apply the outreach policy to a baseline.
  const n = clampCount(count, MIN_QUESTION_COUNT, BASELINE_MAX_QUESTION_COUNT);
  const fallback = fallbackQuestions(businessType, locationText, hasWebsite, specialisms, n, scope, country);
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) return fallback;
  // 'local'/'national' hard-force the prompt's scope block; 'hybrid'/null let the model classify.
  const forceLocal = scope === "local";
  const forceNational = scope === "national";

  const name = businessName || "the business";
  const type = businessType || "local business";
  const loc = locationText || "the local area";
  // UK disambiguation for LOCAL question text (mirrors fallbackQuestions.ukTown): always name the
  // place as "<town> UK" so engines can't resolve an ambiguous town to a non-UK city.
  const isUK = ["UK", "GB"].includes((country ?? "").trim().toUpperCase());
  const locQ = isUK && locationText && !/(uk|united kingdom|england|scotland|wales)/i.test(locationText) ? `${locationText} UK` : loc;
  // has_website branches the framing: website/service-page angles vs presence/directory.
  const framing = hasWebsite
    ? "The business HAS a website, so it's fine to include questions about services, service pages, online booking, or comparing providers' websites."
    : "The business has NO website, so lean on presence/discovery angles: directories, reviews, recommendations, and being found without a site.";
  // Ground the questions in the REAL specialism: use the operator's stated specialisms if
  // given, else infer it from the name + type (names often carry the whole point).
  const specialismLine = specialisms
    ? `Known for: ${specialisms}. Treat these as SEPARATE specialisms — give each its own single-intent question; NEVER combine two in one query.`
    : `No specialisms were given — INFER the single main specialism from the NAME and type. The name often carries the whole point (e.g. "X Kava Bar" → kava; "Y Vinyl Cafe" → records). Build the specialism questions around it, one intent each.`;

  // Shared across all scopes.
  const ALWAYS_RULES = `RULES THAT ALWAYS APPLY:
- EXACTLY ONE intent per question. Never combine two services or needs. No "and" joining two things (NOT "tax returns and payroll", NOT "bar with kava and pool").
- Natural phrasing a real person would type or ask an AI — short, terse, plain lowercase.
- Ground EVERY question in the business's ACTUAL services and the "known for" field. NEVER invent a service it doesn't offer.
- SPREAD the questions across the business's main services / niches — no near-duplicates.
- Do NOT include the business's own name or any brand name (the customer is trying to DISCOVER it). No quotes.`;

  const LOCAL_RULES = `- Local framing is good: "[service] in ${locQ}".
- ALWAYS write the place EXACTLY as "${locQ}" — never a bare town name (town names are often shared with bigger non-UK places, and a bare name makes AI answer about the wrong country).
- Broad head-terms are allowed here (a small local pool is winnable): e.g. "best [service] in ${locQ}", "top [service] in ${locQ}".
- NEVER use "near me" in any form — always name the actual place (${locQ}) instead.`;

  const NATIONAL_RULES = `- NEVER use "near me".
- NEVER use broad head-terms like "best [service] in [country]", "top [service] in [country]", or "leading [service] in [country]". These are dominated by directories and comparison sites, are unwinnable for a single firm, and prove nothing — do not produce any.
- EVERY question must be a SPECIFIC service or problem, qualified by AUDIENCE and national scope. Use the pattern "[specific service] for [audience] [country]" or "[niche] [service] [country]" — e.g. "[service] for small businesses uk", "[niche] [service] uk". Use the real country/region from the location; if the location gives no country, use "uk". Prioritise the differentiators / niches in the "known for" field.`;

  // 'local'/'national' hard-force the matching rule set (no classification); 'hybrid'/null
  // keep the original "classify from the location" heuristic verbatim.
  const scopeGuidance = forceLocal
    ? `SCOPE — FORCED LOCAL: This business is LOCAL to ${locQ}. Generate LOCAL questions ONLY; do NOT classify, and NEVER use country/region/national terms ("uk", "united kingdom", "england", "britain", "scotland", "wales", "ireland", "nationwide", "national", "online", "remote") or the "[service] for [audience] [country]" pattern.

${ALWAYS_RULES}

LOCAL RULES:
${LOCAL_RULES}`
    : forceNational
    ? `SCOPE — FORCED NATIONAL: This business serves clients NATIONALLY (remote / across the country). Generate NATIONAL questions ONLY; do NOT use local town framing.

${ALWAYS_RULES}

NATIONAL RULES:
${NATIONAL_RULES}`
    : `STEP 1 — CLASSIFY THE SCOPE (decide this first, silently, from the location and "known for"):
- NATIONAL if the location names a country, nation, or large region (e.g. "UK", "United Kingdom", "England", "Britain", "Scotland", "Wales", "Ireland", "USA", "Australia"), OR is empty / says "nationwide" / "national" / "online" / "remote", OR the "known for" text says the business serves clients nationally, works remotely, or has no physical office.
- LOCAL if the location names a specific town, city, or local area (e.g. "Leeds", "Chiang Mai", "Camden").

STEP 2 — GENERATE under the matching rule set.

${ALWAYS_RULES}

IF LOCAL:
${LOCAL_RULES}

IF NATIONAL:
${NATIONAL_RULES}`;

  const systemPrompt = `You generate the exact search phrases a REAL PERSON would type into an AI assistant (ChatGPT, Gemini) to find a business like this one. Output nothing but the phrases, via the return_questions tool.

Business name: ${name}
Business type: ${type}
Location as given: ${loc}

${specialismLine}

${scopeGuidance}

${coverage ? `${coverage}

` : ""}Return EXACTLY ${n} questions (lowercase), spread across the business's services/niches under the matching rule set. ${framing}

Return via the return_questions tool.`;

  const userScopeLine = forceLocal
    ? `This business is LOCAL to ${locQ}. Generate ${n} short, single-intent LOCAL phrases ("[service] in ${locQ}") — no national/uk terms, NEVER "near me" (write the place exactly as "${locQ}").`
    : forceNational
    ? `This business is NATIONAL. Generate ${n} short, single-intent phrases qualified by audience + country — no "near me", no broad head-terms.`
    : `First classify this business as NATIONAL or LOCAL from the location, then generate ${n} short, single-intent search phrases under the matching rules.`;

  const userPrompt = `Business name: ${name}\nBusiness type: ${type}\nLocation as given: ${loc}\nHas website: ${hasWebsite ? "yes" : "no"}${specialisms ? `\nKnown for: ${specialisms}` : ""}\n\n${userScopeLine} One intent each, grounded in its real services, no "and", no invented services.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_questions",
            description: `Return exactly ${n} customer search questions`,
            parameters: {
              type: "object",
              properties: {
                questions: { type: "array", items: { type: "string" }, minItems: n, maxItems: n },
              },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments ?? data.choices?.[0]?.message?.content;
    if (typeof rawArgs !== "string") return fallback;
    const parsed = JSON.parse(rawArgs);
    const arr = Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!arr) return fallback;
    const cleaned = stripNearMe(arr.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()));
    const usable = cleaned.length >= n ? cleaned.slice(0, n) : fallback;
    /* BUYING INTENT, NOT RESEARCH INTENT. The model produced "tattoo design for beginners cambridge
       uk" for a tattoo studio, and the engines answered it accurately with ucas.com and two colleges
       — a third of that niche's citations measuring people who want to LEARN the trade rather than
       hire one. Rejected here and topped back up from the deterministic templates, so the operator
       still gets the count they paid for. Skipped for businesses that actually teach: see
       isTeachingTrade — "learn to drive in Peterborough" is a driving school's best question. */
    const guarded = dropResearchIntent(usable, fallback, n, businessType);
    if (guarded.rejected.length) {
      console.warn(
        `[create-ai-audit] research-intent questions dropped (${guarded.rejected.length}): `
        + guarded.rejected.map((r) => `"${r.question}" (${r.reason})`).join(" | "),
      );
    }
    /* THE TOWN IS CHECKED, NOT TRUSTED. The prompt says to always write the place exactly, but
       with business_scope null the model classifies the business itself and may pick NATIONAL —
       which is how "emergency locksmith for homes uk" reached a Hastings locksmith audit. Enforced
       only when this audit HAS a usable town and is not explicitly national: a genuinely national
       business's questions are supposed to omit the town. */
    if (scope !== "national" && hasUsableTown(locationText)) {
      /* The town as the questions should carry it. locationText is already the bare town by the
         time it reaches here (create-ai-audit resolves it via pickAuditTown), so the check is on
         that value — not on locQ, which appends " UK" for engine disambiguation. */
      const town = locationText.trim();
      const localised = dropMissingTown(guarded.questions, fallback, n, town);
      if (localised.rejected.length) {
        console.warn(
          `[create-ai-audit] town-less questions dropped (${localised.rejected.length}) for "${town}": `
          + localised.rejected.map((r) => `"${r.question}"`).join(" | "),
        );
      }
      return localised.questions;
    }
    return guarded.questions;
  } catch (_e) {
    return fallback;
  }
}
