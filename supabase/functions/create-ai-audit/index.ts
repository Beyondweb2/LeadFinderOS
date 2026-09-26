import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { townGated, TOWN_GATE_REASON } from "../../../src/lib/townVerdict.ts";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { resolveDerivedTown, pickAuditTown } from "../_shared/place-town.ts";
import { buildTownIndex, lookupTownCentroid, checkTownDistance, type TownDistanceCheck } from "../_shared/town-distance.ts";
import { toWhatsAppNumber } from "../_shared/whatsapp-send.ts";
import { DEFAULT_FIRST_REPLY_TEMPLATE, firstReplyTemplate, pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { dropResearchIntent, dropOffTrade, dropMissingTown, qualifyPlace, dedupeQuestions, coverageDirective, stripRepeatedWords, capHeadTerms, headTermCap } from "../../../src/lib/seedGuard.ts";
import { normalizeAuditList, serviceAreaQuestionDirective } from "../../../src/lib/auditQuestionContext.ts";
import {
  nationalIntentDirective, hybridIntentDirective, nationalFallbackQuestions, marketVocabulary,
  hybridAllocation, type MarketContext,
} from "../../../src/lib/marketModel.ts";
import { excludeAsked, overAskFor } from "../../../src/lib/fullMeasure.ts";
import { fillToTarget, dedupeByIntent } from "../../../src/lib/questionFill.ts";
import { judgeRemeasure } from "../../../src/lib/baselineReplay.ts";
import {
  measurementFlagFor,
  BASELINE_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE, DISCOVERY_AUDIT_PURPOSE,
  FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE, seoScanAllowed,
} from "../../../src/lib/auditKind.ts";
import { moneyQuestionShare, baselineMoneyQuestionShare, moneyQuestionDirective, moneyFallbackQuestions } from "../../../src/lib/moneyQuestions.ts";
import type { AreaAllocation } from "../../../src/lib/baselineContract.ts";
import {
  OUTREACH_HOOK_QUESTIONS,
  WIZARD_MIN_QUESTIONS,
  WIZARD_MAX_QUESTIONS,
  BASELINE_QUESTIONS,
  FULL_MEASURE_QUESTIONS,
  DISCOVERY_QUESTIONS,
  DISCOVERY_MIN_QUESTIONS,
  DISCOVERY_MAX_QUESTIONS,
  DISCOVERY_DEFAULT_RUNS,
  DISCOVERY_MIN_RUNS,
  DISCOVERY_MAX_RUNS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from "../../../src/lib/auditQuestionCounts.ts";
import {
  clampDiscoveryRuns, isValidDiscoveryQuestionCount, isValidDiscoveryRuns,
  expectedResponses, planGenerationBatches,
} from "../../../src/lib/auditPlan.ts";
import { planHookQuestions } from "../../../src/lib/hookAudit.ts";
import { HOOK_SCORE_QUESTIONS, initialHookStateV2, topUpHookQuestions, type HookStateV2 } from "../../../src/lib/hookScore.ts";

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

/* DISCOVERY — the manual breadth scan and THE flexible opportunity/research audit (Paul,
   2026-09-21): 1..80 questions, default 40, x 1..3 runs, default 3. Operator-callable (NOT
   internal-only, same as the full measure): it is a button on the AI Audit page, and its ceiling
   is explicit here so a public caller still cannot exceed it.
   ⛔ THE CEILING IS ABOVE THE GENERATOR'S PER-CALL CAP, AND THAT IS HONEST ONLY BECAUSE THE
   GENERATION IS BATCHED. `planGenerationBatches` splits a target over
   GENERATOR_ABSOLUTE_MAX_QUESTIONS into calls that each sit under it, and fillGenerated tops the
   pool up to the target — 80 means 80 queued rows or a LOGGED shortfall. Without that, this is the
   10..75-vs-20 fault again: a size the screen offers and the queue never runs.
   ⛔ AND AN OUT-OF-RANGE REQUEST IS REFUSED, NOT CLAMPED (see the discovery validation below).
   ⛔ THE FULL MEASURE AND THE PAID BASELINE ARE NOT TOUCHED BY ANY OF THIS. Both stay at 20 x 3;
   discovery is where the dials live, deliberately, because raising the measure's count raises the
   Apify bill on every paying client. */
const DISCOVERY_MIN_QUESTION_COUNT = DISCOVERY_MIN_QUESTIONS;
const DISCOVERY_MAX_QUESTION_COUNT = DISCOVERY_MAX_QUESTIONS;
const DISCOVERY_DEFAULT_QUESTION_COUNT = DISCOVERY_QUESTIONS;

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

/** The country/market word a NATIONAL question is qualified by ("uk"). Never a town: a national
 *  business is not chosen for proximity, so the place in its questions is the market it sells into.
 *  Falls back to "uk" — the only market this product sells in — rather than to the location, which
 *  on a national audit is frequently blank. */
function marketRegion(loc: string, country: string | null): string {
  const c = (country ?? "").trim().toLowerCase();
  if (c === "gb" || c === "uk" || c === "united kingdom") return "uk";
  if (c) return c;
  const l = loc.trim().toLowerCase();
  if (l && NATIONAL_LOC_TERMS.has(l) && !NON_GEO_NATIONAL.has(l)) return l;
  return "uk";
}

/** Build the one market context the national/hybrid prompt blocks, the deterministic templates and
 *  the trade guard's third door all read. `specialisms` is the merged services/topics free text the
 *  audit row already stores; `sectors` and `audience` are the market-model fields. */
function buildMarketContext(
  businessType: string,
  locationText: string,
  specialisms: string,
  country: string | null,
  audience: string,
  sectors: string[],
): MarketContext {
  return {
    businessType: businessType || "business",
    region: marketRegion(locationText, country),
    audience,
    topics: normalizeAuditList(specialisms),
    sectors,
  };
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
function fallbackQuestions(type: string, loc: string, hasWebsite: boolean, specialisms: string, count: number, scope: BusinessScope, country: string | null, moneyCount = 0, market: MarketContext | null = null): string[] {
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
  /* ⛔ HYBRID SPLITS THE TEMPLATE SET TOO, not just the prompt. A hybrid fallback that produced
     only local templates would silently be a local audit on the day OpenAI is down — the exact
     class of fault this whole change exists to remove. */
  if (scope === "hybrid" && market) {
    const split = hybridAllocation(Math.max(1, count));
    const where = loc ? ` in ${ukTown(loc)}` : "";
    const localSide = [
      ...niches.map((nk) => `${nk} ${t}${where}`),
      `best ${t}${where}`,
      `which ${t}${where} do people recommend`,
      `${t}${where} with great reviews`,
      `affordable ${t}${where}`,
      `where to find a good ${t}${where}`,
    ].slice(0, Math.max(0, split.local));
    base = [...localSide, ...nationalFallbackQuestions(t, market, Math.max(0, split.national))];
  } else if (national && market) {
    /* Intent-spread national templates (marketModel.ts) rather than thirteen
       "[trade] for [audience] uk" lines, which was the fallback's own version of the fault. */
    base = nationalFallbackQuestions(t, market, Math.max(1, count));
  } else if (national) {
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
    /* ⛔ fresh_audit — INTERNAL CALLERS ONLY (2026-09-20, the first-reply chain). Bypasses the
       per-lead reuse below so a reply-triggered audit is a NEW audit even when the lead already
       carries an ordinary one (the drip's pre-send hook audit). Without it the reply intent was
       handed the old audit's id with a run bolted on, and its "complete" check was satisfied by a
       run that predated the reply. Internal-only so a public caller cannot mint duplicates; every
       other caller's behaviour is byte-for-byte unchanged. */
    /* hook_audit — the EXPLICIT hook/outreach marker (2026-09-20). Set only by the genuine hook
       callers: the first-reply chain, the drip's pre-send audit and the Inbox hook button. It is
       what makes an audit ADAPTIVE (see isHookAudit below); it is never inferred from the question
       count, the purpose, or who is calling. A separate concept from fresh_audit. */
    const hookAuditRequested: boolean = body.hook_audit === true;
    // fresh_audit is honoured for internal callers, and for an authenticated caller that has declared
    // a hook (the Inbox re-run): a hook re-run is a new hook by product rule, and it can only ever
    // reduce reuse, never raise a ceiling.
    const freshAudit: boolean = body.fresh_audit === true && (isInternal || hookAuditRequested);
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
    /* DISCOVERY — operator-callable, like the full measure. 1..80 questions (default 40) x 1..3
       runs (default 3), manual only. The dials are validated immediately below.
       ⛔ EXPLICIT, NEVER INFERRED FROM THE COUNT. `question_count === 40` is not the marker and
       must not become one: the generator's absolute ceiling is also 40, so any caller that ever
       asks for the maximum would silently become a discovery audit. The purpose is the marker,
       exactly as it is for baseline, measurement, remeasure and free_check. */
    const isDiscovery: boolean = body.purpose === DISCOVERY_AUDIT_PURPOSE;
    /* ⛔ DISCOVERY'S TWO DIALS ARE VALIDATED, NOT CLAMPED — INDEPENDENTLY OF THE SCREEN (2026-09-21).
       A stated value outside the bounds is a request we cannot honour, and honouring three
       quarters of it silently is the fault that produced a 40-question discovery re-run of five
       questions and a comparison built on a subset. ONLY discovery refuses: every other purpose
       keeps its existing clamp, because their callers are automations replaying a stored set and a
       refusal there would turn a working lane into a dead one. Absent → the default, which is not
       an invalid value. A numeric STRING is not a number: the body is untrusted JSON. */
    if (isDiscovery) {
      const statedCount = body.question_count ?? body.questionCount;
      if (statedCount !== undefined && statedCount !== null
          && !isValidDiscoveryQuestionCount(typeof statedCount === "number" ? statedCount : Number.NaN)) {
        return json({
          ok: false,
          error: "question_count_out_of_range",
          detail: `A discovery audit asks between ${DISCOVERY_MIN_QUESTIONS} and ${DISCOVERY_MAX_QUESTIONS} questions; ${String(statedCount)} was asked for. Nothing was started.`,
          min: DISCOVERY_MIN_QUESTIONS, max: DISCOVERY_MAX_QUESTIONS,
        }, 400);
      }
      const statedRuns = body.run_count;
      if (statedRuns !== undefined && statedRuns !== null
          && !isValidDiscoveryRuns(typeof statedRuns === "number" ? statedRuns : Number.NaN)) {
        return json({
          ok: false,
          error: "runs_out_of_range",
          detail: `A discovery audit runs each question between ${DISCOVERY_MIN_RUNS} and ${DISCOVERY_MAX_RUNS} times; ${String(statedRuns)} was asked for. Nothing was started.`,
          min: DISCOVERY_MIN_RUNS, max: DISCOVERY_MAX_RUNS,
        }, 400);
      }
    }
    /* 🔴 A REPEAT'S QUESTION CAP COMES FROM THE AUDIT IT IS REPEATING, NOT FROM THE CALLER.
       MEASURED LIVE 2026-09-20, audit 9a0c2b79 (Findable, discovery): run 1 queued its 40 questions
       and completed. A re-run from the audit screen posted the same 40 back with `audit_id` and NO
       purpose — the wizard decided what to send from `is_measurement === true || baseline_target_runs
       > 1`, and a discovery audit is neither — so MAX_QUESTIONS fell to the 5-question WIZARD cap and
       the 40 were silently sliced to 5. That is what "0/5" was: a real second run of five questions.

       ⛔ THIS IS THE THIRD TIME THIS EXACT FAULT HAS BEEN WRITTEN (baseline 10→5, measurement 40→20,
       now discovery 40→5), because every previous fix taught a CALLER to declare itself. The caller
       cannot be the source of truth: the audit row already knows what it is. So the ceiling is read
       from the stored purpose here, and it can only ever RAISE the cap to what that audit was
       created at — a caller that forgets, or a purpose invented next month, cannot truncate a set
       again. CLAUDE.md §4: test the PROPERTY, never the identifier.
       ⚠️ It reads ONLY the purpose, and changes ONLY the cap. isMeasurement/isBaseline still come
       from the request, so no other per-purpose behaviour (runs, money share, SEO, the disjointness
       filter, the town gates) can shift under a repeat. */
    let storedPurpose = "";
    if (reuseAuditId) {
      const { data: prior } = await service
        .from("ai_audits").select("audit_purpose").eq("id", reuseAuditId).maybeSingle();
      const raw = (prior as { audit_purpose?: unknown } | null)?.audit_purpose;
      storedPurpose = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    }
    const storedCeiling = storedPurpose === DISCOVERY_AUDIT_PURPOSE ? DISCOVERY_MAX_QUESTION_COUNT
      : storedPurpose === MEASUREMENT_AUDIT_PURPOSE ? MEASUREMENT_MAX_QUESTION_COUNT
      : (storedPurpose === BASELINE_AUDIT_PURPOSE || storedPurpose === REMEASURE_AUDIT_PURPOSE) ? BASELINE_MAX_QUESTION_COUNT
      : 0;
    if (storedCeiling > 0) {
      console.log(`[create-ai-audit] repeat of ${reuseAuditId} inherits its stored purpose "${storedPurpose}" — question cap ${storedCeiling}`);
    }
    const questionCount = (isBaseline || isRemeasure)
      ? clampCount(body.question_count ?? body.questionCount,
          BASELINE_MIN_QUESTION_COUNT, BASELINE_MAX_QUESTION_COUNT, BASELINE_DEFAULT_QUESTION_COUNT)
      : isMeasurement
        ? clampCount(body.question_count ?? body.questionCount,
            MEASUREMENT_MIN_QUESTION_COUNT, MEASUREMENT_MAX_QUESTION_COUNT, MEASUREMENT_DEFAULT_QUESTION_COUNT)
      : isDiscovery
        ? clampCount(body.question_count ?? body.questionCount,
            DISCOVERY_MIN_QUESTION_COUNT, DISCOVERY_MAX_QUESTION_COUNT, DISCOVERY_DEFAULT_QUESTION_COUNT)
      : clampCount(body.question_count ?? body.questionCount);
    // The provided-questions cap must match, or a baseline REPEAT run (which passes the first
    // run's questions verbatim so the three runs are like-for-like) would silently truncate
    // 10 questions to 5 and average two different question sets.
    const REQUESTED_MAX_QUESTIONS = (isBaseline || isRemeasure)
      ? BASELINE_MAX_QUESTION_COUNT
      : isMeasurement ? MEASUREMENT_MAX_QUESTION_COUNT
      : isDiscovery ? DISCOVERY_MAX_QUESTION_COUNT
      : MAX_QUESTION_COUNT;
    /* The repeat's inherited cap can only RAISE it — never lower an explicitly-declared purpose. */
    const MAX_QUESTIONS = Math.max(REQUESTED_MAX_QUESTIONS, storedCeiling);
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
    /* ⛔ DISCOVERY'S RUN COUNT — OPERATOR-CHOSEN, 1 to 3, VALIDATED HERE (Paul, 2026-09-20).
       One run is breadth. Two or three ask the SAME 40 questions again so a per-question
       "named 2 of 3" becomes readable — which question the engines answer consistently and which
       one they fragment on. The repeat is advanceBaseline, the mechanism the paid baseline and the
       free check already use, so runs 2 and 3 replay the stored set verbatim and nothing is
       regenerated.
       ⛔ SERVER-VALIDATED AND NEVER INFERRED. An out-of-range value was already refused above; this
       clamp is the belt to that braces, for a value that is merely junk rather than stated wrong.
       Defaulted to DISCOVERY_DEFAULT_RUNS when absent, and read from its own field — never from
       the question count (the count and the run count are independent dials, and inferring one
       from the other is how `question_count === 40` nearly became the discovery marker). */
    const discoveryRuns = isDiscovery ? clampDiscoveryRuns(body.run_count) : 0;
    const baselineTargetRuns = isBaseline
      ? Math.min(5, Math.max(1, typeof body.baseline_target_runs === "number" ? Math.round(body.baseline_target_runs) : 1))
      : (isMeasurement || isRemeasure) ? MEASUREMENT_RUNS
      : isDiscovery ? discoveryRuns
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
    /* ⛔ A DISCOVERY AUDIT REFUSES RATHER THAN TRUNCATES (2026-09-21). The report below is honest,
       but an operator who selected 81 questions and got an audit of 80 has an audit that is not
       the one they configured, and the truncation is a line in a response nobody reads. Every
       other purpose keeps report-and-run: their callers are automations replaying a stored set,
       where refusing would strand a paid deliverable over a cap it cannot control. */
    if (isDiscovery && droppedQuestions.length) {
      return json({
        ok: false,
        error: "too_many_questions",
        detail: `${suppliedQuestions!.length} questions were sent and a discovery audit asks at most ${MAX_QUESTIONS}. Nothing was started — deselect ${droppedQuestions.length} and send again.`,
        max: MAX_QUESTIONS, supplied_count: suppliedQuestions!.length,
      }, 400);
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
    const serviceAreas = normalizeAuditList(body.service_areas).slice(0, 12);
    const serviceAreaCoverage = serviceAreaQuestionDirective(locationText, serviceAreas);
    /* MARKET-MODEL FIELDS. Both optional and both additive: absent means the generator behaves
       exactly as it did before they existed. Neither is persisted in its own column — the audit row
       already stores the merged services/topics in `specialisms`, and the shape of the question set
       is what they are for. */
    const targetAudience: string = typeof body.target_audience === "string" ? body.target_audience.trim().slice(0, 120) : "";
    const specialistSectors = normalizeAuditList(body.specialist_sectors).slice(0, 8);
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
    /* 🔴 REBUILT 2026-09-15 AS AN ALLOWLIST BY PURPOSE. It used to read
         `body.skip_seo === true || isMeasurement || isRemeasure || isFreeCheck`
       — an opt-OUT, so a caller that simply did not mention skip_seo bought the scan. The busiest
       lane in the product is exactly such a caller (whatsapp-inbound's first-reply auto-audit),
       which is how 620 cold outreach runs bought a website scan and printed "Website issues we can
       fix" on a prospect's report. `seoScanAllowed` is the one rule, in src/lib/auditKind.ts, and
       the queue re-asks it before it spends. An explicit skip_seo is still honoured: it can only
       ever reduce spend, so it needs no gate. */
    const auditPurpose: string = isBaseline ? BASELINE_AUDIT_PURPOSE
      : isRemeasure ? REMEASURE_AUDIT_PURPOSE
      : isMeasurement ? MEASUREMENT_AUDIT_PURPOSE
      : isFreeCheck ? FREE_CHECK_AUDIT_PURPOSE
      : isDiscovery ? DISCOVERY_AUDIT_PURPOSE
      : ORDINARY_AUDIT_PURPOSE;
    const skipSeo: boolean = body.skip_seo === true || !seoScanAllowed(auditPurpose);
    /* ⛔ 2026-09-25: A HOOK IS NO LONGER ADAPTIVE. It plans three questions and queues ALL of them, each
       on both engines: 3 × 2 = 6 results, never stopping early (src/lib/hookScore.ts). The rest of
       this note is the 2026-09-20 record. The "only when the caller says so" rule is unchanged.
       ⛔ THE HOOK AUDIT IS ADAPTIVE, AND ONLY WHEN THE CALLER SAYS SO (Paul, 2026-09-20). A request
       carrying `hook_audit: true` — the reply chain, the drip's pre-send audit, the Inbox hook
       button — plans up to HOOK_MAX_QUESTIONS in order, queues ONLY the first, and the queue
       processor asks the next only while every scored engine keeps naming the business. It stops
       on the first platform-specific gap. Never a second ai_audit_run.
       ⛔ NEVER INFERRED. The first cut classified every generated ordinary audit as a hook, which
       silently turned a 5-question bulk audit into a 3-question adaptive one. Question count,
       purpose and caller identity decide nothing here: the bulk runner, the wizard (reviewed list
       or not), a re-run by audit_id, a preview and every non-ordinary purpose (baseline, measurement,
       remeasure, free_check) keep their full fan-out exactly as before. */
    const isHookAudit: boolean = hookAuditRequested && auditPurpose === ORDINARY_AUDIT_PURPOSE && !reuseAuditId && !preview;
    /* ⛔ ONE PREDICATE GOVERNS BOTH ENDS — the preview the operator reviews and the run that
       actually happens. Money questions are for the ordinary per-business audit only: a paid
       baseline is the guarantee's day-0 and must not change character under a client
       mid-contract, and a full measure is the winnability read. The wizard previews with
       `preview: true` and then confirms by sending `questions` VERBATIM, so both ends reading this
       one value is what makes preview == run. */
    const moneyQuestionCount = (!isBaseline && !isMeasurement && !isRemeasure && !isDiscovery) ? questionCount : 0;
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
    /* !isHookAudit (2026-09-20): a hook re-run is a NEW hook that starts again at Q1. Adding a run to
       the old audit both broke the one-run rule and inherited a plan already spent on a gap. */
    /* !isDiscovery (2026-09-20): 40 questions bolted onto an old 3-question outreach audit is not
       a discovery scan, and the run it would join is already spent. Same reason as !isMeasurement. */
    if (!effectiveReuseId && leadId && !isBaseline && !isMeasurement && !isDiscovery && !isRemeasure && !freshAudit && !isHookAudit) {
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

    /* ⛔ ONE CONTEXT, BUILT ONCE, AFTER THE TOWN IS RESOLVED. Null when the caller sent no
       business_scope — every legacy caller (the outreach hook, a repeat, anything not updated)
       therefore generates byte-for-byte what it generated before. For scope 'local' it is built
       but reads as inert: nothing on the local path consults it. */
    const marketContext: MarketContext | null = businessScope
      ? buildMarketContext(businessType, locationText, specialisms, country, targetAudience, specialistSectors)
      : null;

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
          questionCount, serviceAreaCoverage, false, marketContext,
        );
        qs = mixed.questions;
        previewMoney = mixed.money;
      } else if (isDiscovery) {
        /* ⛔ THE PREVIEW MUST MIRROR THE RUN. Confirming sends the reviewed questions back VERBATIM,
           so this preview IS discovery's generation step: money count 0 and capHeads true, the same
           two arguments the run branch passes. A preview that promised a mix the run does not
           produce is the fault this whole predicate-sharing pattern exists to prevent.
           ⚠️ BATCHED AND FILLED TO TARGET, exactly as the run branch is. An 80 that came back as
           40 here would be an 80 the operator never got to choose from, and a pool that came back
           short would be a short audit nobody was told about. */
        const generated = await generateDiscoverySet(
          businessName, businessType, locationText, hasWebsite, specialisms, questionCount,
          businessScope, country, serviceAreaCoverage, marketContext,
        );
        qs = fillGenerated("discovery preview", generated, questionCount, [],
          { type: businessType, loc: locationText, hasWebsite, specialisms, scope: businessScope, country, market: marketContext });
      } else {
        qs = await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country, serviceAreaCoverage, moneyQuestionCount, null, false, marketContext);
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
        /* 🔴 A REPEAT THAT CANNOT READ THE PREVIOUS QUESTIONS NOW REFUSES. IT USED TO GENERATE.
           The comment that stood here argued the opposite — "degrade rather than refuse: failing it
           strands the guarantee" — and it had the direction wrong. Generating a fresh set does not
           strand the guarantee, it BREAKS it: the refund rests on the day-28 replay repeating the
           baseline's asked set verbatim, so a different set measured under the same audit id is not
           a degraded measurement but a different one, presented as the same. And it failed silently.
           ⛔ A HELD AUDIT PAUL CAN SEE BEATS AN AUDIT THAT SILENTLY MEASURED SOMETHING ELSE
           (Paul, 2026-09-13). Recorded to client_error_reports, refused with 409, no run created.
           ⚠️ THE REPEAT PATH ONLY. A NEW audit still generates — that is what a first run is for.
           This guard is on REPEATING, never on generating. */
        if (questions.length < MIN_QUESTION_COUNT) {
          const detail = latestRun
            ? `a repeat of audit ${auditId} read only ${questions.length} usable question(s) from its previous run (minimum ${MIN_QUESTION_COUNT})`
            : `a repeat of audit ${auditId} has no previous run to read questions from`;
          console.error(`[create-ai-audit] REFUSED: ${detail}`);
          try {
            await service.from("client_error_reports").insert({
              error_id: "repeat_questions_unreadable",
              context: { audit_id: auditId, questions_found: questions.length, minimum: MIN_QUESTION_COUNT },
            });
          } catch { /* the refusal must not depend on the record landing */ }
          return json({ ok: false, error: "repeat_questions_unreadable", detail }, 409);
        }
      }
    } else {
      /* New audit: supplied questions verbatim (a repeat, a pasted set), else generate. A paid
         baseline arrives with NO questions and generates BASELINE_QUESTIONS fresh for the home
         town — seeding from the outreach hook was deleted 2026-09-12. */
      /* Coverage hint for the generator. Empty here; the full-measure exclusion (slice 1b of
         the 2026-09-12 measurement work) is what fills it — the baseline's asked set, so the
         measure never re-asks the judged questions. */
      let coverage = serviceAreaCoverage;
      /* ⛔ THE FULL MEASURE IS DISJOINT FROM THE BASELINE, IN TWO LAYERS. `coverage` asks the
         model to steer clear of the judged intents (the polite request); `excludeAsked` removes
         any paraphrase that came back anyway (the guarantee); `overAskFor` asks for enough extra
         that the target survives the filter, never above the generator's named ceiling. Every
         other caller has an empty exclusion set and is byte-for-byte unchanged. */
      if (isMeasurement && baselineAsked.length) coverage = [coverage, coverageDirective(baselineAsked, businessType)].filter(Boolean).join("\n\n");
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
            const mixed = await generateWithMoney(businessName, businessType, area.town, hasWebsite, specialisms, ask(area.questions), "local", country, area.questions, coverage, true, null);
            const kept = fillGenerated(`area "${area.town}"`, mixed.questions, area.questions, baselineAsked,
              { type: businessType, loc: area.town, hasWebsite, specialisms, scope: "local", country, market: null });
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
          const mixed = await generateWithMoney(businessName, businessType, locationText, hasWebsite, specialisms, ask(mainShare), businessScope, country, mainShare, coverage, true, marketContext);
          mainQs = fillGenerated(`main town "${locationText}"`, mixed.questions, mainShare, baselineAsked,
            { type: businessType, loc: locationText, hasWebsite, specialisms, scope: businessScope, country, market: marketContext });
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
            businessScope, country, questionCount, coverage, true, marketContext,
          );
          /* ⛔ FILL, DON'T SLICE (2026-09-13): exclude → dedupe by intent → slice → top up from the
             templates. This is the site that queued AD Locksmithing's 11-of-12 baseline and
             18-of-20 measure — the dedupe used to run after this slice, with nothing to top up. */
          questions = fillGenerated(isBaseline ? "paid baseline" : "full measure", mixed.questions, questionCount, baselineAsked,
            { type: businessType, loc: locationText, hasWebsite, specialisms, scope: businessScope, country, market: marketContext });
          const kept = new Set(questions);
          moneyGenerated.push(...mixed.money.filter((q) => kept.has(q)));
        } else if (isDiscovery) {
          /* DISCOVERY — breadth. One call, the market-model intent mix, capHeads ON.
             ⛔ NO MONEY SPLIT (moneyQuestionCount is 0 for this purpose). The two-call generator
             asks for a minority of buying-moment questions, and its directive fights the intent
             mix: a national set is already told to produce an EXACT spread across seven intents,
             and a second instruction demanding N of them be buying-moment phrasings is how a
             counted spread stops being counted.
             ⛔ capHeads = true. 40 questions is the count most able to fill itself with one
             question wearing forty adjectives — the exact fault capHeadTerms exists for. Discovery
             is not a judged set, but it IS the set Paul reads to decide where to build. */
          const generated = await generateDiscoverySet(
            businessName, businessType, locationText, hasWebsite, specialisms, questionCount,
            businessScope, country, coverage, marketContext,
          );
          /* FILL, DON'T SLICE. `baselineAsked` is empty for this purpose (no pointer is read), so
             this dedupes by intent and tops up from the templates to the requested 40 — the count
             the operator reviewed is the count that runs. */
          questions = fillGenerated("discovery", generated, questionCount, baselineAsked,
            { type: businessType, loc: locationText, hasWebsite, specialisms, scope: businessScope, country, market: marketContext });
        } else {
          questions = await generateQuestions(
            businessName, businessType, locationText, hasWebsite, specialisms, questionCount,
            businessScope, country, coverage, moneyQuestionCount, null, false, marketContext,
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
      /* ⛔ ONE DERIVATION, read here and by skipSeo above. Two expressions that agree today is
         how the scan and the stored purpose would drift apart tomorrow. */
      auditRow.audit_purpose = auditPurpose;
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
    /* THE HOOK PLAN (2026-09-25): broadest commercial intent first, capped at HOOK_MAX_QUESTIONS (3).
       Every planned question is queued below, and each queue row asks BOTH engines, so the same three
       questions are measured on ChatGPT and on Google AI. That makes six like-for-like results.
       Nothing stops early. The processor finalises the run once all three rows settle, exactly as
       it does for any ordinary audit. results.hook (version 2) only marks the run as a six-result
       hook, so the score, the report, the Inbox card and the 6/6 rule know how to read it. */
    let hookState: HookStateV2 | null = null;
    if (isHookAudit) {
      questions = planHookQuestions(questions, { town: locationText });
      /* ⛔ EXACTLY THREE (2026-09-26). If the generator and its guards left fewer, top up with safe
         generic trade + place questions (no service is ever invented). The place gets the same UK
         disambiguation the generator applies, so an engine cannot answer about a same-named town
         abroad. If even that cannot reach three, the audit runs short and scoreHookRun marks it
         incomplete: no X/6, no hook, no auto Not Interested. */
      if (questions.length < HOOK_SCORE_QUESTIONS) {
        const isUkHook = ["UK", "GB"].includes((country ?? "").trim().toUpperCase());
        const hookPlace = locationText && isUkHook && !/\b(uk|united kingdom|england|scotland|wales)\b/i.test(locationText)
          ? `${locationText} UK` : locationText;
        const before = questions.length;
        questions = topUpHookQuestions(questions, { trade: businessType, place: hookPlace });
        console.log(`[create-ai-audit] hook: ${before} generated question(s) topped up to ${questions.length} with generic trade/place questions`);
        if (questions.length < HOOK_SCORE_QUESTIONS) {
          console.warn(`[create-ai-audit] hook: only ${questions.length} valid question(s) for "${businessName}" — the audit will be marked incomplete (unable to create ${HOOK_SCORE_QUESTIONS} valid questions)`);
        }
      }
      hookState = initialHookStateV2(questions, AUDIT_ENGINES);
      console.log(`[create-ai-audit] hook: ${questions.length} question(s) × ${AUDIT_ENGINES.length} engines, all queued`);
    }
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
    /* ⛔ THE CONFIGURATION THIS DISCOVERY RUN WAS STARTED WITH, IN ITS OWN ROW (2026-09-21). The
       questions are in the queue rows and the run count is in ai_audits.baseline_target_runs, so
       this is not the source of truth for either — it is the record of what was ASKED FOR, so a
       run that ends up short of its target can be told apart from one that was configured small.
       Same schema-free mechanism as `measurement` above (results is jsonb, no migration), and
       inert downstream: the queue keys on results.seo and the report on results.seo.categories.
       ⚠️ `questions` is the count AS QUEUED (after dedupe); `intended_questions` is the dial. */
    if (isDiscovery) {
      runResults.discovery_config = {
        questions: questions.length,
        intended_questions: questionCount,
        runs: discoveryRuns,
        engines: AUDIT_ENGINES,
        expected_responses: expectedResponses(questions.length, discoveryRuns, AUDIT_ENGINES.length),
      };
    }
    /* Same schema-free mechanism (results is jsonb). A diagnostic carries counts:false so the
       comparison can refuse to COUNT it without refusing to run it. */
    if (remeasureNote) runResults.remeasure = remeasureNote;
    if (fullMeasureNote) runResults.full_measure = fullMeasureNote;
    /* Same schema-free mechanism as `measurement` above (results is jsonb — no migration). Inert
       downstream: the queue keys on results.seo and the report on results.seo.categories. */
    if (moneyQueued.length) runResults.money_questions = moneyQueued;
    // The hook marker (version 2) lives on the run (results.hook). Nothing advances it: every row is queued now.
    if (hookState) runResults.hook = hookState;
    const { data: run, error: runErr } = await service
      .from("ai_audit_runs")
      .insert({ audit_id: auditId, user_id: userId, run_number: runNumber, status: "pending", results: runResults })
      .select("id")
      .single();
    /* ⛔ A LOST RACE IS NOT AN ERROR (2026-09-13). Runs are STAGGERED now rather than chained to
       each other's completion, so advanceBaseline can fire from two places on one 30-second tick and
       both compute the same `run_number` — it is a read-then-write. The unique index
       uq_ai_audit_runs_audit_run_number makes exactly one insert land; the loser gets 23505 and must
       back off QUIETLY, because the other tick is already doing this work.
       ⛔ 200, NOT 500. A 500 would be recorded as a failed audit and could drive a retry that races
       again. The body says plainly that nothing was created and why. */
    if (runErr && ((runErr as { code?: string }).code === "23505" || /uq_ai_audit_runs_audit_run_number/.test(runErr.message ?? ""))) {
      console.log(`[create-ai-audit] run ${runNumber} of audit ${auditId} already exists — another tick won the race, backing off`);
      return json({ ok: true, skipped: "run_already_started", audit_id: auditId, run_number: runNumber });
    }
    if (runErr || !run) return json({ ok: false, error: runErr?.message ?? "run_insert_failed" }, 500);
    const runId = run.id;

    // ── Enqueue one row per question ──────────────────────────────────────────
    // Every question is queued now, the hook's three included (2026-09-25; no early stop).
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
  /* ⛔ JUDGED SETS ONLY. Passed true by the paid baseline and the full measure and by nothing else:
     the outreach hook is 3 throwaway questions and capping it would change cold outreach, which is
     a decision nobody has asked for. */
  capHeads = false,
  /** The market context, forwarded verbatim to both calls. Null for any caller not updated. */
  market: MarketContext | null = null,
): Promise<{ questions: string[]; money: string[] }> {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const moneyN = Math.min(total, baselineMoneyQuestionShare(moneySlots));
  if (moneyN <= 0) {
    // Too small to spend a slot on a buying-moment query — byte-identical to the old behaviour.
    const only = await generateQuestions(
      businessName, businessType, locationText, hasWebsite, specialisms, total, scope, country, coverage,
      0, null, false, market,
    );
    return { questions: only.slice(0, total), money: [] };
  }
  const standardN = total - moneyN;
  const standard = standardN > 0
    ? (await generateQuestions(
        businessName, businessType, locationText, hasWebsite, specialisms,
        Math.max(MIN_QUESTION_COUNT, standardN), scope, country, coverage,
        0, null, false, market,
      )).slice(0, standardN)
    : [];
  const askMoney = Math.max(MIN_QUESTION_COUNT, moneyN);
  const money = (await generateQuestions(
    businessName, businessType, locationText, hasWebsite, specialisms,
    askMoney, scope, country, coverage, askMoney, askMoney, false, market,
  )).slice(0, moneyN);
  /* ⛔ MONEY FIRST, AND IT IS LOAD-BEARING. Callers slice this pool IN ORDER to their target
     after the baseline-exclusion filter, so whatever is last is what gets cut. With money last, a
     measure whose over-ask mostly survived the filter would generate money questions and then
     discard every one of them — the feature silently absent on exactly the audits that need it.
     (Seeding, which had the same property, was deleted 2026-09-12.)
     Order is otherwise cosmetic: queue rows are read back by created_at and every consumer reads
     the whole set. */
  /* ⛔ DEDUPED BY INTENT HERE, BEFORE ANY CALLER SLICES (2026-09-13). The two calls are
     independent, so they can and do produce the same question ("locksmith in X" from both), and
     the final case-dedupe used to run AFTER the slice to target — which is exactly why AD
     Locksmithing's baseline queued 11 of 12 and its full measure 18 of 20. Callers fill to target
     with fillToTarget (top-up from templates); this pass just makes sure the pool they slice has
     no twins in it. Money stays first. */
  const pooled = dedupeByIntent([...money, ...standard]);
  /* ⛔ THE SPREAD, ON THE POOLED SET RATHER THAN ON EITHER CALL. The cap is about what the FINAL
     set looks like, and the two calls are independent — capping the standard half alone would let
     the money half push the total back over. Money questions are buying-moment phrasings and are
     almost never head terms, so in practice they simply do not consume the allowance.
     ⚠️ Applied BEFORE the caller slices to target: the caller cuts from the end, so capping after
     the slice would let a dropped head term be replaced by nothing. */
  if (capHeads) {
    const spread = capHeadTerms(pooled.questions, total, businessType, locationText.trim());
    if (spread.dropped.length) {
      console.warn(
        `[create-ai-audit] ${spread.dropped.length} head term(s) over the cap of ${headTermCap(total)} dropped: `
        + spread.dropped.map((q) => `"${q}"`).join(" | ")
        + (spread.added.length ? ` — replaced with ${spread.added.map((q) => `"${q}"`).join(" | ")}` : " — NOT replaced, the set is short"),
      );
    }
    pooled.questions = spread.questions;
  }
  if (pooled.duplicates.length) {
    console.warn(`[create-ai-audit] ${pooled.duplicates.length} intent-duplicate(s) between the money and standard calls dropped before slicing: ${pooled.duplicates.join(" | ")}`);
  }
  console.log(`[create-ai-audit] baseline mixed set: ${money.length} money + ${standard.length} standard of ${total} requested (share taken on ${moneySlots} slot(s)); ${pooled.questions.length} distinct`);
  return { questions: pooled.questions, money };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY'S GENERATION — one call, or several when the target is above what one call may ask for.

   ⛔ WHY IT CANNOT ALWAYS BE ONE CALL. generateQuestions clamps every call at
   GENERATOR_ABSOLUTE_MAX_QUESTIONS (40) as its absurd-value guard. Asking it for 80 returns 40,
   and fillGenerated would quietly top the other 40 up from the deterministic templates — a screen
   saying 80 over a queue running half of them generated. That is the 10..75-vs-20 fault wearing a
   new number, so a target above the per-call cap is asked for across several calls instead.

   ⛔ THE BATCHES ARE NOT THE SAME CALL REPEATED. Each one is handed the questions produced so far
   as a coverage directive — the same machinery the full measure's baseline exclusion uses — so
   batch two is steered off batch one's intents rather than paraphrasing them into the dedupe.

   ⛔ EVERY ARGUMENT IS THE ONE THE SINGLE-CALL BRANCH PASSED: money count 0 and capHeads true.
   Discovery has no money split (its directive fights the market model's counted intent spread)
   and 80 questions is even more able than 40 to fill itself with one question wearing eighty
   adjectives, which is what capHeadTerms is for.

   A target at or under the cap is ONE call, argument for argument — so every discovery audit at
   the default 40 behaves exactly as it did before this existed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
async function generateDiscoverySet(
  businessName: string,
  businessType: string,
  locationText: string,
  hasWebsite: boolean,
  specialisms: string,
  target: number,
  scope: BusinessScope,
  country: string | null,
  coverage: string,
  market: MarketContext,
): Promise<string[]> {
  const batches = planGenerationBatches(target, 0);
  if (batches.length <= 1) {
    return await generateQuestions(
      businessName, businessType, locationText, hasWebsite, specialisms, batches[0] ?? 0,
      scope, country, coverage, 0, null, true, market,
    );
  }
  const out: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    const cov = out.length
      ? [coverage, coverageDirective(out, businessType)].filter(Boolean).join("\n\n")
      : coverage;
    const part = await generateQuestions(
      businessName, businessType, locationText, hasWebsite, specialisms, batches[i],
      scope, country, cov, 0, null, true, market,
    );
    out.push(...part);
  }
  /* Deduped ACROSS the batches before the caller fills to target, for the same reason
     generateWithMoney dedupes across its own two calls: independent calls produce twins, and a
     dedupe that runs after the slice is how a 20-question measure queued 18. */
  const pooled = dedupeByIntent(out);
  if (pooled.duplicates.length) {
    console.warn(`[create-ai-audit] discovery: ${pooled.duplicates.length} intent-duplicate(s) across ${batches.length} batches dropped before filling: ${pooled.duplicates.join(" | ")}`);
  }
  console.log(`[create-ai-audit] discovery generation for ${target}: asked ${batches.join(" + ")} across ${batches.length} calls, ${pooled.questions.length} distinct`);
  return pooled.questions;
}

/* THE FILL, at every site that slices a generated pool to a target: exclude the baseline's asked
   set → dedupe by intent → slice → top up from the deterministic templates (which always carry the
   town, so a topped-up question is never town-less). Logged with counts; `short` > 0 means even
   the templates ran dry, which is stated rather than hidden. */
function fillGenerated(
  label: string,
  candidates: readonly string[],
  target: number,
  excluded: readonly string[],
  tpl: { type: string; loc: string; hasWebsite: boolean; specialisms: string; scope: BusinessScope; country: string | null; market?: MarketContext | null },
): string[] {
  // Over-generate the template list: it is deduped and exclusion-filtered too, so ask for plenty.
  const topUp = target > 0 ? fallbackQuestions(tpl.type, tpl.loc, tpl.hasWebsite, tpl.specialisms, Math.max(target * 2, 12), tpl.scope, tpl.country, 0, tpl.market ?? null) : [];
  const fill = fillToTarget({ candidates, target, excluded, topUp });
  if (fill.duplicates.length || fill.excluded.length || fill.toppedUp || fill.short) {
    console.warn(`[create-ai-audit] ${label}: ${fill.questions.length}/${target} — dropped ${fill.duplicates.length} duplicate(s), excluded ${fill.excluded.length} judged, topped up ${fill.toppedUp} from templates${fill.short ? `, STILL SHORT BY ${fill.short}` : ""}`
      + (fill.duplicates.length ? ` | dup: ${fill.duplicates.join(" | ")}` : "")
      + (fill.excluded.length ? ` | excl: ${fill.excluded.join(" | ")}` : ""));
  }
  return fill.questions;
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
  /* ⛔ JUDGED SETS ONLY, AND OPT-IN. A paid baseline is what a refund is measured against and a full
     measure is what pages are built from; both are ruined by twelve ways of asking one question.
     The outreach hook is 3 questions, throwaway and never compared — capping it to one head term
     would change cold outreach, which is a different decision nobody has asked for. Default false,
     so every caller that has not opted in generates exactly what it generated before. */
  capHeads = false,
  /* ⛔ THE MARKET CONTEXT — services/topics, sectors, audience and the market region. Optional and
     defaulted to null so any caller that has not been updated produces exactly what it produced
     before. When present it drives the NATIONAL intent mix, the HYBRID split, the deterministic
     templates and the trade guard's third door. */
  market: MarketContext | null = null,
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
  const fallback = fallbackQuestions(businessType, locationText, hasWebsite, specialisms, n, scope, country, moneyN, market);
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) return fallback;
  /* 'local'/'national'/'hybrid' now ALL hard-force their own block. Only a null scope (an older
     caller, or a lead we never asked) still falls through to the model's own classification.
     ⛔ HYBRID USED TO BE IN THAT FALLTHROUGH, and that was the bug: "classify from the location"
     saw a town and produced a purely LOCAL set, so picking "a mix of both" changed nothing at all. */
  const forceLocal = scope === "local";
  const forceNational = scope === "national";
  const forceHybrid = scope === "hybrid" && market !== null;

  const name = businessName || "the business";
  const type = businessType || "local business";
  const loc = locationText || "the local area";
  // UK disambiguation for LOCAL question text (mirrors fallbackQuestions.ukTown): always name the
  // place as "<town> UK" so engines can't resolve an ambiguous town to a non-UK city.
  const isUK = ["UK", "GB"].includes((country ?? "").trim().toUpperCase());
  const locQ = isUK && locationText && !/\b(uk|united kingdom|england|scotland|wales)\b/i.test(locationText) ? `${locationText} UK` : loc;
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

  /* ⛔ THE NATIONAL BLOCK IS AN INTENT MIX, NOT A SENTENCE PATTERN. It used to say "use the pattern
     '[specific service] for [audience] [country]'", so every national audit — 20 questions or 40 —
     was that one query rewritten. marketModel.ts owns the mix; this file just asks for it.
     ⚠️ The pattern-only text is kept as the fallback for a caller with no market context, so
     nothing that has not been updated changes shape. */
  const NATIONAL_RULES = market
    ? nationalIntentDirective(n, market)
    : `- NEVER use "near me".
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
    ? `SCOPE — FORCED NATIONAL: This business competes across a whole country/market and is NOT chosen for proximity to a town. Generate NATIONAL questions ONLY; do NOT use local town framing and do NOT name any town.

${ALWAYS_RULES}

NATIONAL RULES:
${NATIONAL_RULES}`
    : forceHybrid
    ? `SCOPE — FORCED HYBRID: This business has a real LOCAL market in ${locQ} AND a wider ${market!.region} market. Generate BOTH, in the proportions below.

${ALWAYS_RULES}

HYBRID RULES:
${hybridIntentDirective(n, market!, locQ)}`
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
    ? `This business is NATIONAL. Generate ${n} short, single-intent phrases across the INTENT MIX above — no town, no "near me", no broad head-terms, and never one intent reworded to fill another's slots.`
    : forceHybrid
    ? `This business is HYBRID. Generate ${n} phrases: ${hybridAllocation(n).local} LOCAL ones written with the place exactly "${locQ}", and ${hybridAllocation(n).national} WIDER ${market!.region} ones with NO town in them at all. Different services on each side — never the same question with and without the town.`
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
    /* ⛔ REPEATED WORDS ARE REPAIRED FIRST, BEFORE ANY SLICE OR DEDUPE. White Sparks' frozen
       baseline carries "electrician electrician in thetford UK" — one string, so dedupeQuestions
       cannot see it (it compares whole questions, and this is not a duplicate question but a
       damaged one). It bought a slot in a twelve-question baseline that now decides a refund, and
       day 28 will replay it verbatim.
       ⚠️ It runs here rather than after the guards so the repaired form can collapse into an
       identical real question instead of buying a second slot with the same words. */
    const deduped = stripRepeatedWords(
      arr.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()),
    );
    if (deduped.repaired.length) {
      console.warn(
        `[create-ai-audit] repeated words collapsed (${deduped.repaired.length}): `
        + deduped.repaired.map((r) => `"${r.before}" -> "${r.after}"`).join(" | "),
      );
    }
    const cleaned = stripNearMe(deduped.questions);
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
    /* ⛔ AND THE TRADE, WHICH WAS THE ONE THING NOTHING CHECKED. The guard above asks whether the
       question is about BUYING, the one below whether it names the TOWN, and qualifyPlace whether
       it names the COUNTRY — three guards for intent, place and country, and until 2026-09-14 none
       for what the question is actually ABOUT. "fault diagnosis services in thetford UK" passed all
       three into White Sparks' live electrician measurement and came back naming six car garages,
       filed under ABSENT: a race that was never his.
       ⚠️ Trade word OR a known intent for the trade — see offTradeReason. Measured over all 3,198
       questions on file it rejects 118 and throws away ONE good question; the rule was tuned
       against that corpus, not guessed. */
    /* ⚠️ THE THIRD DOOR IS OPENED FOR NATIONAL AND HYBRID ONLY. A national business's best
       questions are problem-shaped ("who can help if chatgpt recommends my competitors instead of
       my business") and carry neither the category's own words nor any entry in TRADE_INTENTS, so
       this guard — measured and tuned on "electrician in Thetford" — would reject the whole
       PROBLEM intent. Local audits pass an empty vocabulary and keep the tight guard exactly. */
    const tradeVocabulary = market && (forceNational || forceHybrid) ? marketVocabulary(market) : [];
    const onTrade = dropOffTrade(guarded.questions, fallback, n, businessType, tradeVocabulary);
    if (onTrade.rejected.length) {
      console.warn(
        `[create-ai-audit] off-trade questions dropped (${onTrade.rejected.length}) for "${businessType}": `
        + onTrade.rejected.map((r) => `"${r.question}" (${r.reason})`).join(" | "),
      );
    }
    /* ⛔ AND THE SPREAD, ON JUDGED SETS ONLY. White Sparks' frozen baseline is 11 of 12 head terms —
       one question wearing twelve adjectives, and it is the set his refund is measured against.
       AD Locksmithing's, the same day, is 5 of 11, so this is chance rather than a broken generator
       and nothing about the numbers looks wrong either way.
       ⚠️ IT RUNS BEFORE THE TOWN GUARD DELIBERATELY: its top-ups are built with the town in them,
       so they still have to satisfy dropMissingTown and qualifyPlace like everything else rather
       than being smuggled past the checks that follow. */
    const spread = capHeads
      ? capHeadTerms(onTrade.questions, n, businessType, hasUsableTown(locationText) ? locationText.trim() : "")
      : { questions: onTrade.questions, dropped: [] as string[], added: [] as string[] };
    if (spread.dropped.length) {
      console.warn(
        `[create-ai-audit] head terms over the cap of ${headTermCap(n)} dropped (${spread.dropped.length}) for "${businessType}": `
        + spread.dropped.map((q) => `"${q}"`).join(" | ")
        + (spread.added.length ? ` — replaced with: ${spread.added.map((q) => `"${q}"`).join(" | ")}` : " — NOT replaced, the set is short"),
      );
    }
    /* THE TOWN IS CHECKED, NOT TRUSTED. The prompt says to always write the place exactly, but
       with business_scope null the model classifies the business itself and may pick NATIONAL —
       which is how "emergency locksmith for homes uk" reached a Hastings locksmith audit. Enforced
       only when this audit HAS a usable town and is not explicitly national: a genuinely national
       business's questions are supposed to omit the town. */
    /* ⛔ HYBRID IS EXEMPT FROM dropMissingTown, AND THAT IS THE WHOLE POINT OF HYBRID. This test
       demands EVERY question name the town, so before this change a hybrid audit had its entire
       wider-market half rejected and topped up with local templates — "a mix of both" silently
       produced a local-only set. qualifyPlace still runs below: it only touches questions that DO
       name the town, so the local half is still pinned to "<town> UK" and the wider half is left
       alone. A null scope keeps the old behaviour: the model classified it, so it was told to put
       the town in. */
    if (scope !== "national" && scope !== "hybrid" && hasUsableTown(locationText)) {
      /* The town as the questions should carry it. locationText is already the bare town by the
         time it reaches here (create-ai-audit resolves it via pickAuditTown), so the check is on
         that value — not on locQ, which appends " UK" for engine disambiguation. */
      const town = locationText.trim();
      const localised = dropMissingTown(spread.questions, fallback, n, town);
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
    /* HYBRID: pin the LOCAL half's place without demanding a town of the wider half. qualifyPlace
       returns any question that does not mention the town untouched, so this is safe on a set that
       is half national by design. */
    if (scope === "hybrid" && hasUsableTown(locationText)) {
      const town = locationText.trim();
      const pinned = qualifyPlace(spread.questions, town);
      if (pinned.repaired.length) {
        console.warn(
          `[create-ai-audit] hybrid: country marker added to ${pinned.repaired.length} local question(s) for "${town}": `
          + pinned.repaired.map((r) => `"${r.before}" -> "${r.after}"`).join(" | "),
        );
      }
      return pinned.questions;
    }
    return spread.questions;
  } catch (_e) {
    return fallback;
  }
}
