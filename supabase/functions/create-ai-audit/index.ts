import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { townGated, TOWN_GATE_REASON } from "../../../src/lib/townVerdict.ts";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { resolveDerivedTown, pickAuditTown } from "../_shared/place-town.ts";
import { buildTownIndex, lookupTownCentroid, checkTownDistance, type TownDistanceCheck } from "../_shared/town-distance.ts";
import { toWhatsAppNumber } from "../_shared/whatsapp-send.ts";
import { DEFAULT_FIRST_REPLY_TEMPLATE, firstReplyTemplate, pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { dropResearchIntent, dropMissingTown, qualifyPlace, dedupeQuestions, coverageDirective } from "../../../src/lib/seedGuard.ts";
import { excludeAsked, overAskFor } from "../../../src/lib/fullMeasure.ts";
import { judgeRemeasure } from "../../../src/lib/baselineReplay.ts";
import {
  measurementFlagFor,
  BASELINE_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE,
  FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE,
} from "../../../src/lib/auditKind.ts";
import { moneyQuestionShare, baselineMoneyQuestionShare, moneyQuestionDirective, moneyFallbackQuestions } from "../../../src/lib/moneyQuestions.ts";
import type { AreaAllocation } from "../../../src/lib/baselineContract.ts";
import {
  OUTREACH_HOOK_QUESTIONS,
  WIZARD_MIN_QUESTIONS,
  WIZARD_MAX_QUESTIONS,
  BASELINE_QUESTIONS,
  FULL_MEASURE_QUESTIONS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
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

/* FULL MEASURE — 20 questions x MEASUREMENT_RUNS, day 0, AFTER the baseline is frozen. Finds which
   questions and towns are winnable so we know where to build pages; NEVER compared to anything.
   Reuses the whole pipeline — one ai_audit_queue row per question, both engines per row, drained
   by process-ai-audit-queue at <=24 in flight. Operator-JWT callable (the AI Audit page's Full
   mode) as well as internal.
   ⛔ FIXED AT FULL_MEASURE_QUESTIONS — min, max and default are the SAME number, derived from the
   shared policy module, so no caller can ask for a different size and the screen cannot offer one
   the generator will not honour. It used to be 10..75 with a default of 40 while generateQuestions
   hard-capped every call at 20 (now the NAMED GENERATOR_ABSOLUTE_MAX_QUESTIONS), so "40" was a
   number the screen said and the queue never did.
   ⛔ SEO IS FORCED OFF for this purpose (it is per-site, once, and would eat the run's budget). */
const MEASUREMENT_MIN_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;
const MEASUREMENT_MAX_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;
const MEASUREMENT_DEFAULT_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;
/* ⛔ HOW MANY TIMES A FULL MEASUREMENT ASKS EACH QUESTION (per engine). 3 = the proven number the
   paid baseline uses; frequency ("named 4 of 6") not a single lucky ask. Paul tunes this. Cost
   scales ~linearly with it (more Apify runs). */
const MEASUREMENT_RUNS = 3;

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
function fallbackQuestions(type: string, loc: string, hasWebsite: boolean, specialisms: string, count: number, scope: BusinessScope, country: string | null, moneyCount = 0): string[] {
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
  /* ⛔ MONEY QUESTIONS LEAD THE FALLBACK, so the slice below cannot drop them. This set is used on
     ANY generation failure and the audit still COMPLETES — so without them an OpenAI outage would
     silently revert to purely generic questions with nothing on screen saying so.
     ⚠️ moneyCount DEFAULTS TO 0, so every caller that has not opted in produces the byte-identical
     set it produced before. Generic by necessity: a deterministic template cannot know a trade's
     real pain points (moneyQuestions.ts says so) — it is a floor, not the model's per-business work. */
  const money = moneyCount > 0
    ? moneyFallbackQuestions(type || "business", national ? "" : ukTown(loc), moneyCount)
    : [];
  const out = dedupeQuestions([...money, ...base]).questions;
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
    /* ⛔ THE CALLER HAS A TOWN THE CUSTOMER TYPED. Exempts the town gate below, on exactly the same
       principle the baseline exemption already rests on: the gate exists to stop an audit running
       against an INFERRED town, and a town somebody typed for their own business is not inferred.
       ⚠️ INTERNAL ONLY, mirroring isBaseline. Every other caller that passes location_text builds
       it from `search_location || address` — inferred — so a flag any caller could set would
       disable the gate everywhere (CLAUDE.md §8 lists bulk-jobs and the whatsapp-inbound chain
       doing exactly that). A browser cannot reach this. */
    const townConfirmed = isInternal && body.town_confirmed === true;
    /* FULL MEASURE — operator-callable (NOT gated on isInternal): the winnability gather the
       operator triggers from the AI Audit page. Its ceiling is explicit below, so a public caller
       still cannot exceed it. */
    const isMeasurement: boolean = body.purpose === "measurement";
    /* THE DAY-28 REPLAY — INTERNAL ONLY, fired by process-ai-audit-queue (fireDueRemeasures) against
       outreach_leads.baseline_audit_id on the STORED remeasure_due_date. It must carry the
       baseline's asked set verbatim (judgeRemeasure gates it below), it runs MEASUREMENT_RUNS times,
       it skips SEO, it is exempt from the town gate on the baseline's own evidence, and it writes
       audit_purpose = 'remeasure' so the claim trigger sets outreach_leads.remeasure_audit_id in the
       insert's own transaction and the partial unique index refuses a second one at the database. */
    const isRemeasure: boolean = isInternal && body.purpose === "remeasure";
    /* THE FREE CHECK — INTERNAL ONLY, fired by findable-onboarding (free-check-audit.ts). In every
       other respect it is an ordinary hook audit (3 questions, money question kept, 3 runs via
       `target_runs`), but it is written as `audit_purpose = 'free_check'` because two readers key
       on that value and on nothing else (2026-09-13):
         · maybeSendFreeCheckResult sends the visitor their result ONLY for an audit created as the
           free check — a baseline, a measurement, a replay or a manual re-audit on the same lead
           sends them nothing;
         · auditKind grades it 'free_check', so a later payment on the lead is baselined rather
           than held as "ambiguous multi-run".
       It also forces the SEO skip on every run (see skipSeo), so runs 2 and 3 cannot buy the scan
       run 1 deliberately declined. */
    const isFreeCheck: boolean = isInternal && body.purpose === FREE_CHECK_AUDIT_PURPOSE;
    const questionCount = (isBaseline || isRemeasure)
      ? clampCount(body.question_count ?? body.questionCount,
          BASELINE_MIN_QUESTION_COUNT, BASELINE_MAX_QUESTION_COUNT, BASELINE_DEFAULT_QUESTION_COUNT)
      : isMeasurement
        ? clampCount(body.question_count ?? body.questionCount,
            MEASUREMENT_MIN_QUESTION_COUNT, MEASUREMENT_MAX_QUESTION_COUNT, MEASUREMENT_DEFAULT_QUESTION_COUNT)
      : clampCount(body.question_count ?? body.questionCount);
    // The provided-questions cap must match, or a baseline REPEAT run (which passes the first
    // run's questions verbatim so the three runs are like-for-like) would silently truncate
    // 10 questions to 5 and average two different question sets.
    const MAX_QUESTIONS = (isBaseline || isRemeasure)
      ? BASELINE_MAX_QUESTION_COUNT
      : isMeasurement ? MEASUREMENT_MAX_QUESTION_COUNT
      : MAX_QUESTION_COUNT;
    /* How many runs make up this audit. Stored as baseline_target_runs; the queue's completion hook
       (advanceBaseline) fires the remaining runs with the SAME questions and averages them. Absent/0
       → an ordinary single-run audit.
       ⛔ A FULL MEASUREMENT NOW ASKS EACH QUESTION MEASUREMENT_RUNS TIMES (per engine) so the result
       is a FREQUENCY ("named 4 of 6"), not a single lucky ask. It reuses the same multi-run mechanism
       as the paid baseline — which is why is_measurement below is load-bearing: it marks the audit so
       startPaidBaseline can NEVER mistake a measurement for a paid baseline and skip a paying client's
       guarantee measurement. MEASUREMENT_RUNS is the one number to tune. */
    /* ⛔ `target_runs` — REPEAT RUNS ON AN ORDINARY AUDIT, INTERNAL CALLERS ONLY (2026-09-02, for
       the free-check lane). Both existing routes to multi-run change the QUESTIONS as a side
       effect: isBaseline clamps to BASELINE_MAX_QUESTION_COUNT and takes the paid-baseline
       character, and isMeasurement sets moneyQuestionCount to 0 (the money predicate below). A free
       check wants three asks of the SAME five money-question-bearing questions, so it needs the run
       count without either of those.
       ⚠️ Internal-only and clamped to the same 1-5 as the baseline route: this multiplies spend, so
       it is a cost ceiling, not a preference. */
    const internalTargetRuns = isInternal && typeof body.target_runs === "number"
      ? Math.min(5, Math.max(1, Math.round(body.target_runs)))
      : 0;
    const baselineTargetRuns = isBaseline
      ? Math.min(5, Math.max(1, typeof body.baseline_target_runs === "number" ? Math.round(body.baseline_target_runs) : 1))
      : (isMeasurement || isRemeasure) ? MEASUREMENT_RUNS
      : internalTargetRuns;
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
    // Full measurement forces SEO off — it is a per-site scan (once, not per-question) and would eat
    // the per-run cost budget; the mode is about the AI citation gather, not the website grade.
    /* ⛔ THE FREE CHECK FORCES IT TOO (2026-09-13). Run 1 was posted with skip_seo:true and
       skipped; runs 2 and 3 are posted by advanceBaseline, which never sent the flag, so on a
       business with a website they bought the ~4p scan run 1 declined and the report grew a website
       section the free check was designed not to have. Keying the skip on the PURPOSE makes it
       structural for every run of the audit, the way it already is for a measurement. */
    const skipSeo: boolean = body.skip_seo === true || isMeasurement || isRemeasure || isFreeCheck;
    /* ⛔ ONE PREDICATE GOVERNS BOTH ENDS — the preview the operator reviews and the run that
       actually happens. Money questions are for the ordinary per-business audit only: a paid
       baseline is the guarantee's day-0 and must not change character under a client
       mid-contract, and a full measure is the winnability read. The wizard previews with
       `preview: true` and then confirms by sending `questions` VERBATIM, so both ends reading this
       one value is what makes preview == run. */
    const moneyQuestionCount = (!isBaseline && !isMeasurement && !isRemeasure) ? questionCount : 0;
    /* MULTI-TOWN FULL MEASURE. audit-baseline's startFullMeasure sends the allocation from
       fullMeasureAllocation: [{town, questions, isMain}]. The MAIN town keeps location_text; each
       extra area gets its own generated questions for the same services. Absent (every other
       caller) leaves the single-town path byte-for-byte unchanged.
       INTERNAL ONLY: it decides how a paying client's ambitions are measured. (Until 2026-09-12
       the paid BASELINE carried this; it is home-town-only now — option C.) */
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
    /* !isMeasurement, same reason as !isBaseline: a full measurement must be its OWN audit so the
       start and re-measure gathers are two distinct, comparable audits on the lead — not extra runs
       bolted onto an old 3-question outreach audit. */
    if (!effectiveReuseId && leadId && !isBaseline && !isMeasurement && !isRemeasure) {
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
    /* ══ IS THIS BUSINESS ACTUALLY IN THAT TOWN? ══════════════════════════════════════════
       Filled in below once the town is resolved. Declared here so the response can carry it
       whatever happens — an audit that proceeds on a warning must still SAY the distance, or the
       warning is only in a log nobody reads (the auditErrors lesson). */
    let distance: TownDistanceCheck | null = null;
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

        /* ⛔ THE WRONG-TOWN GUARD. Measured 2026-08-09: 31 of 44 measurable audits asked about a town
           more than 10 km from the business, up to 79 km; 28 of those reached a prospect and 20 were
           opened. A locksmith with Northampton in its name was asked about Spalding.
           ⚠️ RUN AFTER pickAuditTown, against the town the questions will ACTUALLY use — checking
           the requested town would pass a lead whose derived town then overrode it, and vice versa.
           ⚠️ WRAPPED IN ITS OWN try: a gazetteer read must never be able to stop an audit. The catch
           leaves `distance` null, which reads as "not checked" and blocks nothing. */
        try {
          const { data: townRows } = await service
            .from("uk_towns").select("name, lat, lng").not("lat", "is", null);
          const index = buildTownIndex((townRows ?? []) as Array<{ name: string; lat: number; lng: number }>);
          distance = checkTownDistance({
            businessLat: derived.lat,
            businessLng: derived.lng,
            townName: locationText,
            townCentroid: lookupTownCentroid(index, locationText),
          });
          console.log(
            `[create-ai-audit] lead ${leadId}: distance ${distance.verdict}`
            + (distance.km === null ? ` (${distance.unknownReason})` : ` ${Math.round(distance.km)}km from "${locationText}"`),
          );
        } catch (e) {
          console.warn(`[create-ai-audit] distance check unavailable, not blocking: ${(e as Error).message}`);
        }
        console.log(
          `[create-ai-audit] lead ${leadId}: town "${locationText}" via ${locationSource}`
          + ` (derive: ${derived.source}${derived.error ? ` — ${derived.error}` : ""})`,
        );
      } catch (e) {
        townNote = e instanceof Error ? e.message : String(e);
        console.warn(`[create-ai-audit] town derivation failed, proceeding on the searched town: ${townNote}`);
      }
    }

    /* ══ REFUSE AN AUDIT OF A BUSINESS THAT IS NOWHERE NEAR THE TOWN ════════════════════════
       ⛔ PLACED BEFORE ANY SPEND. Questions are generated below and queue rows are inserted after
       that; refusing here means a blocked audit costs nothing at all, which is the point — the
       31 measured cases each bought a report about a town the business does not work in.

       ⛔ ONLY ON A VERDICT OF `block`, i.e. >25km with REAL coordinates on both sides. `warn` and
       `unknown` fall through deliberately: a village 12km outside Cambridge trades in Cambridge,
       and "we have not fetched coordinates" is our ignorance rather than their distance. Blocking
       on absence would refuse 638 of 900 leads.

       ⚠️ OVERRIDABLE, AND THE OVERRIDE IS LOGGED. Paul: "if I override it more than a couple of
       times the threshold is wrong and I want the evidence rather than my memory of it." The count
       lives in the function logs, which is where the 2026-08-09 measurement will be repeated from. */
    if (distance?.verdict === "block") {
      const overridden = body.override_distance === true;
      if (!overridden) {
        console.log(`[create-ai-audit] BLOCKED lead ${leadId}: ${Math.round(distance.km ?? 0)}km from "${locationText}"`);
        return json({
          ok: false,
          error: "business_not_in_town",
          message: distance.message,
          distance_km: Math.round(distance.km ?? 0),
          town: locationText,
          /* Named so the caller can offer the override without hardcoding the flag. */
          override_field: "override_distance",
        }, 409);
      }
      console.warn(
        `[create-ai-audit] DISTANCE OVERRIDE USED: lead ${leadId}, `
        + `${Math.round(distance.km ?? 0)}km from "${locationText}" — audit proceeding on the operator's say-so`,
      );
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

    /* Preview: return questions + cost estimate only (no DB writes).
       ⛔ OPTED INTO MONEY QUESTIONS VIA THE SHARED PREDICATE. This is the set the operator READS
       and EDITS in the wizard's review step, and confirming sends it back VERBATIM — so a generic
       preview meant the feature could never appear on the path used by hand, however the run was
       configured. Passing "" for coverage keeps that argument exactly as it was (the preview has
       never had a coverage hint; it is market-audit-only steering). */
    if (preview) {
      /* ⛔ THE WIZARD'S FULL MEASUREMENT GENERATES HERE AND NOWHERE ELSE. Confirming sends the
         reviewed questions back VERBATIM, so this preview IS the generation step for that path — and
         the money list has to travel back with them, because the operator may edit the set in
         between and nothing downstream could re-identify which strings were money questions.
         Returned as `money_questions`; the SPA holds it and posts it on confirm. */
      let qs: string[];
      let previewMoney: string[] = [];
      if (providedQuestions && providedQuestions.length) {
        qs = providedQuestions;
      } else if (isBaseline || isMeasurement) {
        const mixed = await generateWithMoney(
          businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country,
        );
        qs = mixed.questions;
        previewMoney = mixed.money;
      } else {
        qs = await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country, "", moneyQuestionCount);
      }
      return json({
        ok: true,
        preview: true,
        questions: qs,
        ...(previewMoney.length ? { money_questions: previewMoney } : {}),
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
    // The town columns ride along for the gate below — one read, both questions.
    if (leadId) {
      const { data: lead } = await service.from("outreach_leads")
        .select("user_id, derived_town, town_fetch_note").eq("id", leadId).maybeSingle();
      if (!isInternal && (!lead || lead.user_id !== userId)) return json({ ok: false, error: "lead_not_found" }, 403);
      /* ⛔ THE TOWN GATE — Paul's rule, 2026-08-14: an audit of a lead whose town is settled-
         unverifiable would fall back to search_location, the searched town — the exact wrong-town
         fault that cost two prospects (Wilson's, RG). Fires on BOTH auth paths, because the
         internal callers (bulk-jobs, the whatsapp-inbound auto-audit chain) are outreach.
         ⚠️ BASELINES ARE EXEMPT, DELIBERATELY: the paid path runs on a town the CUSTOMER confirmed
         at onboarding (confirmed_location outranks everything in pickAuditTown), and blocking a
         paid deliverable on a prospect-era flag would break the guarantee chain. Market audits
         never reach here — they carry no lead_id.
         ⚠️ UNCHECKED PASSES. Only the settled-unverifiable verdict gates; absence is never an
         answer (CLAUDE.md §6). The error string is raw and self-explaining — explainAuditFailure
         renders it verbatim.

         🔴 AND `townConfirmed` IS EXEMPT TOO, WHICH IS WHY THE FREE CHECK WAS SILENTLY DEAD.
         Measured 2026-09-03: every free-check submission whose business name Google could not
         resolve got NO audit at all. "Test plumber" and a real visitor called "richard" both landed
         with derived_town null and town_fetch_note 'no_place_id' — settled-unverifiable — so this
         gate refused with 409 before location_text was even read. Two of two resolved businesses
         got their audit; two of two unresolved ones got nothing and an operator email saying to do
         it by hand.
         The gate was right about prospecting and wrong here: a free-check visitor TYPES their trade
         and their town, and that is better evidence than a derived one, not worse. A business
         Google has never heard of is precisely the customer who most needs telling that AI cannot
         find them. */
      /* ⛔ THE REPLAY IS EXEMPT: its town is the baseline's, which came from the client's own
         questionnaire. Without this a client Google cannot resolve is gated at day 28. */
      if (lead && !isBaseline && !isRemeasure && !townConfirmed && townGated(lead)) {
        return json({ ok: false, error: `town_unverified: ${TOWN_GATE_REASON}` }, 409);
      }
    }

    // ── Resolve the audit row + the question set ──────────────────────────────
    let auditId: string;
    let auditBusinessName = businessName;
    let questions: string[] = [];
    /* Set by the like-for-like check below; stored on the run so the before/after can tell a
       counted re-measurement from a diagnostic or an overridden set. */
    let remeasureNote: Record<string, unknown> | null = null;
    let fullMeasureNote: Record<string, unknown> | null = null;
    /* THE MONEY QUESTIONS THIS AUDIT GENERATED, verbatim. Accumulated across the generation
       branches (a multi-town measure generates per area), intersected with what is actually queued further
       down, then stored in ai_audit_runs.results.money_questions and returned to the caller so
       audit-baseline can freeze it into BaselineContract.moneyQuestions. Empty on every other path. */
    let moneyGenerated: string[] = [];
    /* ⛔ THE FLAG CARRIED BACK FROM A PREVIEW. The wizard generates at preview time and confirms with
       the questions verbatim, so without this a hand-run Full Measurement would store no flag at all.
       ⚠️ IT IS CALLER-SUPPLIED, AND THAT IS SAFE FOR EXACTLY ONE REASON: it only LABELS questions for
       later analysis. It cannot change which questions are asked, and it cannot reach the refund test
       — the judged set is the baseline's ASKED set read through outreach_leads.baseline_audit_id,
       never anything a caller supplies. It is
       also intersected with the questions actually queued further down, so it can only ever name
       strings that are in the run. Anything else in the array is discarded silently. */
    if (Array.isArray(body.money_questions)) {
      moneyGenerated.push(...(body.money_questions as unknown[]).filter((q): q is string => typeof q === "string" && !!q.trim()));
    }
    /* ⛔ THE BASELINE POINTER, READ ONCE FOR ANY MEASUREMENT OR REPLAY ON A LEAD. Three things
       hang off it: the full measure's EXCLUSION (it must be disjoint from the judged set), the
       ORDER gate (a paying lead cannot be full-measured before its baseline is frozen), and the
       REPLAY's like-for-like refusal (a day-28 remeasure must ask exactly the asked set). Ground
       truth for the asked set is the baseline's FIRST run's queue rows — the contract records
       intent, not what was asked (baselineReplay.ts). */
    let pointer: string | null = null;
    let pointerFrozen = false;
    let baselineAsked: string[] = [];
    if (isRemeasure && !leadId) return json({ ok: false, error: "remeasure_requires_lead" }, 400);
    if ((isMeasurement || isRemeasure) && leadId) {
      /* MIGRATION-TOLERANT, the house pattern (§3 SQL-first): remeasure_audit_id is Slice 0's
         hand-run column. If it is not there yet, read without it — a client's full measure must
         not 409 because the day-28 column has not landed. The replay itself still cannot run
         without it (the tick's own read fails closed), which is the right direction. */
      let leadRow: unknown = null;
      {
        const first = await service
          .from("outreach_leads").select("baseline_audit_id, remeasure_audit_id, amount_paid").eq("id", leadId).maybeSingle();
        if (first.error && /remeasure_audit_id/i.test(first.error.message ?? "")) {
          console.warn("[create-ai-audit] outreach_leads.remeasure_audit_id not present — reading without it (run the Slice 0 SQL)");
          leadRow = (await service.from("outreach_leads").select("baseline_audit_id, amount_paid").eq("id", leadId).maybeSingle()).data;
        } else {
          leadRow = first.data;
        }
      }
      const lr = leadRow as { baseline_audit_id?: string | null; remeasure_audit_id?: string | null; amount_paid?: number | null } | null;
      pointer = lr?.baseline_audit_id ?? null;
      const alreadyReplayed = lr?.remeasure_audit_id ?? null;
      const leadPaid = Number(lr?.amount_paid ?? 0) > 0;
      if (pointer) {
        const { data: base } = await service
          .from("ai_audits").select("baseline_completed_at").eq("id", pointer).maybeSingle();
        pointerFrozen = !!(base as { baseline_completed_at?: string | null } | null)?.baseline_completed_at;
        const { data: firstRun } = await service
          .from("ai_audit_runs").select("id").eq("audit_id", pointer)
          .order("run_number", { ascending: true }).limit(1).maybeSingle();
        if (firstRun?.id) {
          const { data: bq } = await service
            .from("ai_audit_queue").select("question").eq("run_id", firstRun.id).order("created_at", { ascending: true });
          baselineAsked = ((bq ?? []) as Array<{ question: string }>).map((r) => (r.question ?? "").trim()).filter(Boolean);
        }
      }
      const refuse = async (error: string, detail: string, extra: Record<string, unknown> = {}) => {
        try {
          await service.from("client_error_reports").insert({
            error_id: error,
            message: detail.slice(0, 1000),
            context: { lead_id: leadId, baseline_audit_id: pointer, baseline_frozen: pointerFrozen, purpose: body.purpose, ...extra },
          });
        } catch { /* reporting must never turn a refusal into a retryable error */ }
        return json({ ok: false, error, detail }, 409);
      };
      if (isRemeasure) {
        /* ⛔ THE REPLAY'S GATES, IN THE ORDER A HUMAN WANTS THEM. No pointer → nothing to replay
           (never "pick one"). Already replayed → the pointer is the idempotency; a second tick that
           raced the first stops here, and the partial unique index stops it at the database if it
           got past. Not frozen → the before side is still being measured. Then like-for-like. */
        if (!pointer) return await refuse("no_baseline_recorded", "No baseline is recorded for this client, so there is nothing to replay. Set the baseline pointer to the audit that should be the before side.");
        if (alreadyReplayed) return await refuse("already_remeasured", `This client's day-28 replay already exists (${alreadyReplayed}). One replay per baseline, ever.`, { remeasure_audit_id: alreadyReplayed });
        if (!pointerFrozen) return await refuse("baseline_not_frozen", "This client's baseline has not finished measuring; the replay waits for a frozen before side.");
        if (!providedQuestions?.length) return await refuse("remeasure_requires_questions", "A replay must carry the baseline's asked questions verbatim; none were supplied.");
        const verdict = judgeRemeasure({
          proposed: providedQuestions,
          baselineAsked,
          targetRuns: MEASUREMENT_RUNS,
          overrideReason: typeof body.question_change_reason === "string" ? body.question_change_reason : null,
        });
        if (!verdict.allow) return await refuse(verdict.reason, verdict.detail);
        /* ⚠️ ALLOWED, AND THE RECORD TRAVELS WITH THE AUDIT: why it counts, what it replays, and
           whether the work was finished when it fired (fire-and-stamp — an unfinished delivery
           never delays the promise's timing, it is written on the number instead). */
        const ctx = (body.remeasure_context && typeof body.remeasure_context === "object") ? body.remeasure_context as Record<string, unknown> : {};
        remeasureNote = { reason: verdict.reason, counts: verdict.countsAsMeasurement, detail: verdict.detail, baseline_audit_id: pointer, ...ctx };
      }
      /* ⛔ ORDER MATTERS AND IS NOT NEGOTIABLE (Paul, 2026-09-12): the baseline is frozen BEFORE
         the full measurement runs. If the judged set were picked after seeing which questions are
         winnable, the before/after would be self-serving and a client could say so. So a PAYING
         lead with no frozen baseline cannot be full-measured — refused, recorded, never queued.
         A prospect (nothing paid) may still be measured from the wizard: there is no refund set to
         protect. */
      if (isMeasurement && leadPaid && !(pointer && pointerFrozen)) {
        const why = !pointer
          ? "This client has no recorded baseline. The full measure runs after the baseline freezes, never before it."
          : "This client's baseline is still measuring. The full measure starts by itself the moment it freezes.";
        return await refuse("baseline_not_frozen", why);
      }
    }

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
      /* New audit: supplied questions verbatim (a repeat, a pasted set), else generate. A paid
         baseline arrives with NO questions and generates BASELINE_QUESTIONS fresh for the home
         town — seeding from the outreach hook was deleted 2026-09-12. */
      /* Coverage hint for the generator. Empty here; the full-measure exclusion (slice 1b of
         the 2026-09-12 measurement work) is what fills it — the baseline's asked set, so the
         measure never re-asks the judged questions. */
      let coverage = "";
      /* ⛔ THE FULL MEASURE IS DISJOINT FROM THE BASELINE, IN TWO LAYERS. `coverage` asks the
         model to steer clear of the judged intents (the polite request); `excludeAsked` removes
         any paraphrase that came back anyway (the guarantee); `overAskFor` asks for enough extra
         that the target survives the filter, never above the generator's named ceiling. Every
         other caller has an empty exclusion set and is byte-for-byte unchanged. */
      if (isMeasurement && baselineAsked.length) coverage = coverageDirective(baselineAsked, businessType);
      const disjoint = (qs: string[]) => excludeAsked(qs, baselineAsked);
      const ask = (n: number) => overAskFor(n, baselineAsked.length);

      if (areaAllocation.length > 1) {
        /* MULTI-TOWN FULL MEASURE. One LLM call per area, gpt-4o-mini — the Apify question runs
           dominate the bill, not this. A failed area generation is skipped and LOGGED rather than
           silently substituted, so the stored allocation and the queued set cannot disagree about
           what was measured. */
        const perArea: string[] = [];
        for (const area of areaAllocation) {
          if (area.isMain) continue;
          try {
            const mixed = await generateWithMoney(businessName, businessType, area.town, hasWebsite, specialisms, ask(area.questions), "local", country, area.questions, coverage);
            const kept = disjoint(mixed.questions).slice(0, area.questions);
            perArea.push(...kept);
            /* Only the ones that SURVIVED are flagged. An area whose allocation is under
               MONEY_QUESTION_MIN_COUNT gets none at all (baselineMoneyQuestionShare returns 0). */
            const keptArea = new Set(kept);
            moneyGenerated.push(...mixed.money.filter((q) => keptArea.has(q)));
          } catch (e) {
            console.error(`[create-ai-audit] area "${area.town}" generation failed, area NOT measured:`, e instanceof Error ? e.message : e);
          }
        }
        const mainShare = areaAllocation.find((a) => a.isMain)?.questions ?? questionCount;
        let mainQs: string[];
        if (providedQuestions?.length) {
          mainQs = disjoint(providedQuestions).slice(0, mainShare);
        } else {
          const mixed = await generateWithMoney(businessName, businessType, locationText, hasWebsite, specialisms, ask(mainShare), businessScope, country, mainShare, coverage);
          mainQs = disjoint(mixed.questions).slice(0, mainShare);
          const keptMain = new Set(mainQs);
          moneyGenerated.push(...mixed.money.filter((q) => keptMain.has(q)));
        }
        questions = [...mainQs, ...perArea];
        console.log(`[create-ai-audit] multi-town measure: ${mainQs.length} for "${locationText}" + ${perArea.length} across ${areaAllocation.length - 1} other areas = ${questions.length}`);
      } else {
        /* ⛔ THE ONLY CALL SITE THAT ASKS FOR MONEY QUESTIONS — the ordinary per-business NEW audit.
           Excluded deliberately, each for its own reason:
             · isBaseline — a paid baseline is the guarantee's day-0. Its character must not shift
               under a client mid-contract.
             · isMeasurement — the winnability read; flagged money via the two-call generator.
             · the reuse path — that is a paid baseline's repeat.
             · preview — mirrors whatever the real call will do; left alone so the preview cannot
               promise a mix the run does not produce.
           ⛔ AND A VERBATIM REPEAT NEVER GETS HERE AT ALL. advanceBaseline sends the stored
           questions and `providedQuestions` short-circuits above, so RG's and ABLM's re-measures
           cannot acquire a money question. That is structural, not a guard I added. */
        if (providedQuestions && providedQuestions.length) {
          /* Verbatim — except that a full measure can never carry a judged question, however it
             was pasted. A repeat (no lead_id) has an empty exclusion set and is untouched. */
          questions = isMeasurement ? disjoint(providedQuestions) : providedQuestions;
        } else if (isBaseline || isMeasurement) {
          /* THE PAID BASELINE (home town, fresh) / THE FULL MEASURE. Flagged money questions via
             the two-call generator, so the before/after can include or exclude them by choice. */
          const mixed = await generateWithMoney(
            businessName, businessType, locationText, hasWebsite, specialisms, ask(questionCount),
            businessScope, country, questionCount, coverage,
          );
          questions = disjoint(mixed.questions).slice(0, questionCount);
          const kept = new Set(questions);
          moneyGenerated.push(...mixed.money.filter((q) => kept.has(q)));
        } else {
          questions = await generateQuestions(
            businessName, businessType, locationText, hasWebsite, specialisms, questionCount,
            businessScope, country, coverage, moneyQuestionCount,
          );
        }
      }
      if (isMeasurement && pointer) {
        /* Recorded on the run so the audit says, in its own row, what it is disjoint from and that
           it is NOT comparable — a reader must never mistake it for the "after". */
        fullMeasureNote = { baseline_audit_id: pointer, excluded: baselineAsked.length, comparable: false };
        const leaked = questions.filter((q) => !disjoint([q]).length);
        if (leaked.length) console.error(`[create-ai-audit] INVARIANT: ${leaked.length} baseline question(s) survived exclusion — ${leaked.join(" | ")}`);
      }
      const auditRow: Record<string, unknown> = {
        user_id: userId,
        lead_id: leadId,
        business_name: businessName,
        /* SET EXPLICITLY ON BOTH PATHS. The column is NOT NULL with a default, but PostgREST lists
           it as required, so relying on the default would leave the ordinary insert path depending
           on behaviour that is not guaranteed at this layer. Cheap certainty. */
        is_market: false,
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
      /* ⛔ THE GUARANTEE GUARD. A Full Measurement reuses baseline_target_runs (multi-run), which is
         the SAME column the paid baseline keys on — so a measurement MUST be marked, or
         startPaidBaseline would see baseline_target_runs>1 on the lead and skip the real guarantee
         measurement (§ audit-baseline). is_measurement=true is set here at creation and is the ONLY
         signal that tells the two apart. Migration-tolerant, same as baseline_target_runs: if the
         column is missing the insert retries without it — but then it is UNMARKED, so the guarantee
         guard would not fire, which is exactly why create-ai-audit is deployed only AFTER the column
         exists (SQL-first). */
      /* 🔴 THIS USED TO BE `if (isMeasurement || baselineTargetRuns > 1)` AND IT COST ~£3.70 AND TEN
         DUPLICATE BASELINES ON ONE PAYMENT (2026-09-12). The second clause was added so an unmarked
         3-run FREE-CHECK audit could not be mistaken for a baseline — correct about that case, and
         wrong about its own scope: a paid baseline sends baseline_target_runs:3, so it marked
         ITSELF as a measurement, which is the one condition startPaidBaseline's idempotency guard
         excludes. It could never see the audit it had just created, and the queue backstop made
         another every tick until the onboarding row was reset by hand.
         ⛔ THE FLAG IS THE PURPOSE NOW, AND ONLY THE PURPOSE. The free-check collision it was
         widened for is handled where it belongs — by `findPaidBaseline` testing for the marker a
         baseline POSITIVELY carries (its frozen contract) instead of for the absence of this one.
         ⛔ AND THE RULE LIVES IN src/lib/auditKind.ts WITH THE READER. Two guards in two files,
         agreeing only by comment, is what broke — and the comment in audit-baseline.ts had been
         false since the day this line was widened. scripts/audit-kind.test.ts drives the round
         trip: what this writes must be what that recognises. */
      if (measurementFlagFor(isMeasurement || isRemeasure)) auditRow.is_measurement = true;
      /* ⛔ THE PURPOSE, PERSISTED — AND IT IS WHAT CLAIMS THE BASELINE POINTER (2026-09-12).
         There was no purpose column on ai_audits at all, which is precisely why nothing could
         identify THE baseline for a lead: `baseline_contract` is written to every audit
         startPaidBaseline creates, so ten runaway baselines produced ten contracts and none was
         authoritative.
         ⛔ IT IS SET IN THIS INSERT, NOT AFTER IT. A DB trigger on ai_audits reads this value and
         claims `outreach_leads.baseline_audit_id` in the SAME TRANSACTION, so the pointer cannot
         exist without the audit and cannot fail separately from it — which is the hole
         baseline_contract's best-effort update has and the reason a failed contract write now reads
         as ambiguous (auditKind.ts). Two tables cannot be written by one PostgREST statement; a
         trigger is the only way to make it one write.
         ⚠️ Migration-tolerant like its neighbours: the shed-and-retry below drops it if the column
         is not there yet, and without the column the trigger does not exist either, so the whole
         feature is simply absent rather than half-present. */
      auditRow.audit_purpose = isBaseline ? BASELINE_AUDIT_PURPOSE
        : isRemeasure ? REMEASURE_AUDIT_PURPOSE
        : isMeasurement ? MEASUREMENT_AUDIT_PURPOSE
        : isFreeCheck ? FREE_CHECK_AUDIT_PURPOSE
        : ORDINARY_AUDIT_PURPOSE;
      let { data: audit, error: insErr } = await service
        .from("ai_audits").insert(auditRow).select("id, business_name").single();
      // Shed a missing new column (either one) and retry, longest-name-first so one miss can't mask another.
      let guard = 0;
      while (insErr && guard++ < 3) {
        const missing = ['baseline_target_runs', 'is_measurement', 'audit_purpose'].find((c) => c in auditRow && (insErr!.message ?? '').includes(c));
        if (!missing) break;
        console.warn(`[create-ai-audit] column ${missing} missing — retrying insert without it`);
        delete auditRow[missing];
        ({ data: audit, error: insErr } = await service
          .from("ai_audits").insert(auditRow).select("id, business_name").single());
      }
      /* ⛔ THE DATABASE SAID NO, AND THAT IS THE ANSWER. The partial unique indexes (one 'remeasure',
         and optionally one 'baseline', per lead) refuse a duplicate insert with 23505 whatever any
         tick believed. Report it as what it is — the thing already exists — not as a 500 to retry. */
      if (insErr && ((insErr as { code?: string }).code === "23505" || /uq_ai_audits_one_/.test(insErr.message ?? ""))) {
        const what = String(auditRow.audit_purpose ?? "audit");
        console.warn(`[create-ai-audit] duplicate ${what} for lead ${leadId} refused by the database: ${insErr.message}`);
        return json({ ok: false, error: what === "remeasure" ? "already_remeasured" : `already_has_${what}`, detail: insErr.message }, 409);
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
    /* A market audit has no website by definition, so the SEO scan is unreachable for it — the
       skip is structural rather than a flag. skipSeo still applies to the per-business batch. */
    /* THE FINAL GATE. Whatever path produced `questions` — LLM, templates, a verbatim repeat, or
       the multi-town concatenation — no two rows may be the same question in
       different capitals. There was no dedupe here at all, which is how one audit could queue both
       casings. Original spelling is preserved; only the identity is normalised. */
    /* ⛔ THE LIKE-FOR-LIKE REFUSAL MOVED. Until 2026-09-12 any multi-run `measurement` on a lead
       with a pointer had to REPLAY the baseline or be refused. Under the three-type model a full
       measure must be DISJOINT from the baseline (enforced above), and the replay is its own
       purpose — the queue-fired day-28 `remeasure`, which judgeRemeasure gates (slice 4). */

    const finalQ = dedupeQuestions(questions);
    if (finalQ.duplicates.length) {
      console.warn(`[create-ai-audit] ${finalQ.duplicates.length} case-duplicate question(s) dropped before queueing: ${finalQ.duplicates.join(" | ")}`);
    }
    questions = finalQ.questions;
    /* ⛔ THE MONEY FLAG, INTERSECTED WITH WHAT IS ACTUALLY QUEUED. dedupeQuestions above can drop a
       money question that collided with a standard one, and the guards can reject one earlier — so a
       flag taken straight from the generator could name a question that is not in this run. Matched
       case-insensitively for the same reason scoredQuestions is (a re-cased question is the same
       question), and the stored strings are the ones AS QUEUED.
       ⚠️ Stored ONLY when non-empty. An empty array would assert "this run has no money questions",
       which is a different claim from "nothing recorded it" — and every run created before today is
       in the second state. Absence must stay readable as absence. */
    const queuedKeys = new Map(questions.map((q) => [q.trim().toLowerCase(), q]));
    const moneyQueued = Array.from(new Set(
      moneyGenerated.map((q) => queuedKeys.get(q.trim().toLowerCase())).filter((q): q is string => !!q),
    ));
    const runResults: Record<string, unknown> = skipSeo
      ? { seo: { skipped: "seo_scan_not_requested", checked_at: new Date().toISOString() } }
      : {};
    /* Tag full-measurement runs so the start-vs-re-measure before/after can find them later,
       WITHOUT a schema change (results is jsonb). Inert to everything downstream: the queue's SEO
       step keys on results.seo and the report on results.seo.categories — neither reads this. */
    if (isMeasurement) runResults.measurement = true;
    /* Same schema-free mechanism (results is jsonb). A diagnostic carries counts:false so the
       comparison can refuse to COUNT it without refusing to run it. */
    if (remeasureNote) runResults.remeasure = remeasureNote;
    if (fullMeasureNote) runResults.full_measure = fullMeasureNote;
    /* Same schema-free mechanism as `measurement` above (results is jsonb — no migration). Inert
       downstream: the queue keys on results.seo and the report on results.seo.categories. */
    if (moneyQueued.length) runResults.money_questions = moneyQueued;
    const { data: run, error: runErr } = await service
      .from("ai_audit_runs")
      .insert({ audit_id: auditId, user_id: userId, run_number: runNumber, status: "pending", results: runResults })
      .select("id")
      .single();
    if (runErr || !run) return json({ ok: false, error: runErr?.message ?? "run_insert_failed" }, 500);
    const runId = run.id;

    // ── Enqueue one row per question ──────────────────────────────────────────
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
        } else if (await pitchEverSent(service, leadId, parkTemplate ?? DEFAULT_FIRST_REPLY_TEMPLATE)) {
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
      /* THE FLAGGED MONEY QUESTIONS, as queued. Absent when there are none — same convention as
         truncationReport below, so a caller cannot learn to ignore a permanently-present empty list.
         audit-baseline reads this to freeze BaselineContract.moneyQuestions. */
      ...(moneyQueued.length ? { money_questions: moneyQueued } : {}),
      // Estimate: question_count × engines × per-question source cost (see sources.ts).
      estimated_cost_usd: estimate(questions.length),
      unit_cost_usd: estCost,
      engines: AUDIT_ENGINES,
      ...truncationReport,
    });
  } catch (e) {
    console.error("[create-ai-audit] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID BASELINE'S MIXED SET — standard questions plus a flagged minority of money questions.

   ⛔ WHY TWO CALLS AND NOT ONE. generateQuestions asks the model for `n` questions of which `moneyN`
   must be buying-moment ones, and the model returns an UNLABELLED array of strings. There is no way
   to look at "emergency locksmith in Huntingdon who can come now" and know whether the model
   produced it as a money question or a standard one — and guessing with a keyword test would be the
   substring trap on the one field the guarantee analysis depends on. Asking for the money questions
   in their OWN call means the flag is a fact about which call produced the string, not an inference.
   The extra gpt-4o-mini call is noise next to the Apify question runs.

   ⛔ THE MONEY SHARE IS TAKEN ON THE REAL SHARE. The caller passes `moneySlots` — the number it
   will actually keep — separately from `count`, which a full measure over-asks so its target
   survives the baseline-exclusion filter. Without the split, an over-asked 32 would carry a
   32-sized money share into a 20-question measure.

   ⚠️ OVER-REQUEST THEN SLICE, on both halves. generateQuestions clamps to MIN_QUESTION_COUNT (3), so
   asking for 1 returns 3. The money half asks for max(3, moneyN) with moneyExact set to that SAME
   number, so every question it returns is a money question and slicing keeps only money questions.
   Slicing a mixed set would have flagged whatever happened to be first.

   ⚠️ RETURNS THE MONEY LIST BEFORE DEDUPE. The caller intersects it with what was actually queued
   (dedupeQuestions can drop a collision), so the stored flag can never name a question that is not
   in the run. */
async function generateWithMoney(
  businessName: string,
  businessType: string,
  locationText: string,
  hasWebsite: boolean,
  specialisms: string,
  count: number,
  scope: BusinessScope,
  country: string | null,
  /* ⛔ THE SLOTS THE CALLER WILL ACTUALLY KEEP, for the share calculation only — `count` is how
   *  many to PRODUCE, and a full measure over-asks (overAskFor) so its target survives the
   *  baseline-exclusion filter. The money share is taken on the real share, not the over-ask, or a
   *  20-question measure asked for as 32 would carry 8 money questions instead of 5.
   *  Defaults to `count`, so an ordinary caller behaves the obvious way. */
  moneySlots: number = count,
  /** The coverage directive, threaded to BOTH calls — the full measure's baseline exclusion. */
  coverage = "",
): Promise<{ questions: string[]; money: string[] }> {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const moneyN = Math.min(total, baselineMoneyQuestionShare(moneySlots));
  if (moneyN <= 0) {
    // Too small to spend a slot on a buying-moment query — byte-identical to the old behaviour.
    const only = await generateQuestions(
      businessName, businessType, locationText, hasWebsite, specialisms, total, scope, country, coverage,
    );
    return { questions: only.slice(0, total), money: [] };
  }
  const standardN = total - moneyN;
  const standard = standardN > 0
    ? (await generateQuestions(
        businessName, businessType, locationText, hasWebsite, specialisms,
        Math.max(MIN_QUESTION_COUNT, standardN), scope, country, coverage,
      )).slice(0, standardN)
    : [];
  const askMoney = Math.max(MIN_QUESTION_COUNT, moneyN);
  const money = (await generateQuestions(
    businessName, businessType, locationText, hasWebsite, specialisms,
    askMoney, scope, country, coverage, askMoney, askMoney,
  )).slice(0, moneyN);
  /* ⛔ MONEY FIRST, AND IT IS LOAD-BEARING. Callers slice this pool IN ORDER to their target
     after the baseline-exclusion filter, so whatever is last is what gets cut. With money last, a
     measure whose over-ask mostly survived the filter would generate money questions and then
     discard every one of them — the feature silently absent on exactly the audits that need it.
     (Seeding, which had the same property, was deleted 2026-09-12.)
     Order is otherwise cosmetic: queue rows are read back by created_at and every consumer reads
     the whole set. */
  console.log(`[create-ai-audit] baseline mixed set: ${money.length} money + ${standard.length} standard of ${total} requested (share taken on ${moneySlots} slot(s))`);
  return { questions: [...money, ...standard], money };
}

/**
 * Generate `count` audit questions via OpenAI (gpt-4o-mini, tool-calling). `count` is the
 * caller's already-policy-clamped number, bounded here only by GENERATOR_ABSOLUTE_MAX_QUESTIONS
 * (the model is asked for exactly n). Model output is untrusted — validated to at least
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
  /* ⛔ OPT-IN, DEFAULT 0. How many buying-moment ("money") questions this audit should include.
   *  ONLY the ordinary per-business NEW audit passes a value. Market audits grade a town off head
   *  terms and a paid baseline is a guarantee's day-0 measurement, so neither is changed — and
   *  every verbatim repeat never reaches this function at all (advanceBaseline passes its stored
   *  questions straight through). That is what keeps existing before/after comparisons valid. */
  moneyCount = 0,
  /* ⛔ EXACT OVERRIDE, FOR THE MONEY-ONLY CALL. When set, EVERY question asked for is a money
   *  question and the derived share is bypassed. It exists because the model returns an UNLABELLED
   *  array: the only way to know exactly which questions are money ones is to ask for them in their
   *  own call, so the caller can flag the result with certainty rather than inferring it.
   *  ⚠️ Only generateWithMoney() sets this. Passing it does NOT make money questions a majority of
   *  an audit — the CALLER splits the count and keeps the money half a minority. */
  moneyExact: number | null = null,
): Promise<string[]> {
  // The CALLER has already applied the right POLICY ceiling: MAX_QUESTION_COUNT for the outreach
  // hook, BASELINE_MAX_QUESTION_COUNT for a paid baseline, FULL_MEASURE_QUESTIONS for a measure.
  // Re-clamping here with clampCount's default max silently capped every paid baseline at 5 —
  // measured live, a baseline that asked for 10 got exactly 5. Keep an ABSOLUTE upper bound so an
  // absurd value is still refused, but never re-apply a policy ceiling here.
  // ⛔ THE ABSOLUTE BOUND IS NAMED, NOT BORROWED. This line used BASELINE_MAX_QUESTION_COUNT (20)
  // as its "absurd" guard, so a measurement policy of 75 generated 20 and nothing said so.
  // scripts/question-ceilings.test.ts asserts every policy ceiling sits at or below this one.
  const n = clampCount(count, MIN_QUESTION_COUNT, GENERATOR_ABSOLUTE_MAX_QUESTIONS);
  /* ⛔ HOW MANY BUYING-MOMENT QUESTIONS THIS AUDIT GETS. 0 unless the caller opted in, which is
     what keeps market audits, paid baselines and every verbatim repeat byte-identical. */
  const moneyN = typeof moneyExact === "number" && moneyExact > 0
    ? Math.min(Math.floor(moneyExact), n)
    : (moneyCount > 0 ? moneyQuestionShare(n) : 0);
  const fallback = fallbackQuestions(businessType, locationText, hasWebsite, specialisms, n, scope, country, moneyN);
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
  /* ⛔ THE MONEY-QUESTION BLOCK — EMPTY STRING WHEN OFF, so a caller that did not opt in gets a
     prompt byte-identical to the one it got before this existed. The text lives in
     src/lib/moneyQuestions.ts rather than inline here: it is the part Paul tunes, it has to be
     reviewable in one place, and it is the part a test can assert forbids the phrasings the
     existing guards would silently delete (near-me, "how to", qualifications/courses).
     ⚠️ The place is passed as locQ — the SAME disambiguated string the rest of the prompt pins
     ("Wisbech UK", never a bare town) — so a money question cannot be the one query that comes
     back answered about Wisbech, Massachusetts. National audits pass '' and get no place line. */
  const moneyDirective = moneyQuestionDirective(moneyN, n, forceNational ? "" : locQ);
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
${moneyDirective}
${coverage ? `${coverage}

` : ""}Return EXACTLY ${n} questions (lowercase), spread across the business's services/niches under the matching rule set. ${framing}

Return via the return_questions tool.`;

  const userScopeLine = forceLocal
    ? `This business is LOCAL to ${locQ}. Generate ${n} short, single-intent LOCAL phrases ("[service] in ${locQ}"), NEVER "near me".
The place is ALWAYS written exactly "${locQ}" — that trailing country word is PART OF THE PLACE and is required, not a "national term".
Do not otherwise widen the question to a country or region: no "for [audience] in England", no "nationwide", no "online".`
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
      /* ⛔ AND THE COUNTRY, GUARANTEED RATHER THAN REQUESTED. Every one of the 104 market-audit
         questions ever generated lacked a country marker while business audits carried "UK" —
         because the forced-local prompt above simultaneously demanded the place be written
         "Wisbech UK" and banned "uk" as a national term. The prompt is fixed, but a prompt is a
         request; this is the check. Repairs rather than rejects: the question is right, only the
         place was under-specified. See qualifyPlace for why that differs from dropMissingTown.
         ⚠️ The suffix stays "UK" deliberately. The geocoder can now supply "Cambridgeshire", which
         pins a town far harder — but changing it changes what the engines return for EVERY town,
         and a day-28 re-measurement compares against day-0 wording. Paul's decision, not a
         code change. */
      const pinned = qualifyPlace(localised.questions, town);
      if (pinned.repaired.length) {
        console.warn(
          `[create-ai-audit] country marker added to ${pinned.repaired.length} question(s) for "${town}": `
          + pinned.repaired.map((r) => `"${r.before}" -> "${r.after}"`).join(" | "),
        );
      }
      return pinned.questions;
    }
    return guarded.questions;
  } catch (_e) {
    return fallback;
  }
}
