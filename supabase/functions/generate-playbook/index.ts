import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// generate-playbook — from an audit run, produce a tailored 8-week Sprint delivery plan
// for THIS business, in ONE structured object rendered as TWO views (internal execution
// checklist + client-safe roadmap). Reads the run's AI-visibility results + results.seo
// (grades/findings/baseline/rawPaste, if present) + business context, calls OpenAI with an
// expert GEO system prompt fused with our Sprint model, validates strictly, and stores the
// result at results.playbook. Mirrors apply-seo-paste (auth, tool-calling, read-modify-write).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Capable model (this is the moat deliverable, not a cheap classify). Low temp for a stable,
// faithful plan that regenerates consistently — a touch above 0 for natural phrasing.
const MODEL = "gpt-4o";
const TEMPERATURE = 0.3;
const MAX_RAW_PASTE_CHARS = 40_000; // bound token cost when packing the stored raw paste

// PASS 2 — steps enrichment. A SEPARATE, batched, cheaper call per small group of tasks so the
// step-by-step "how" never bloats the structure call or risks the edge-function timeout.
const STEPS_MODEL = "gpt-4o-mini"; // execution detail — mini is enough, and much faster/cheaper than gpt-4o
const STEPS_BATCH_SIZE = 5;        // tasks per enrichment call (small = fast, can't truncate mid-batch)
const STEPS_MAX_TOKENS = 1500;     // per batch — bounded so the JSON can't be cut off part-way
const STEPS_MAX_PER_TASK = 8;      // hard cap on steps kept per task

// PASS 3 — self-review. One extra call that audits the assembled playbook against the HARD RULES
// and fixes violations. Bounded + time-budgeted: if the earlier passes already ate the budget we
// SKIP the review (return the pre-review playbook) so we never risk the ~150s edge wall-clock.
const REVIEW_MODEL = "gpt-4o";     // judgment call — the stronger model catches subtle rule breaks
const REVIEW_MAX_TOKENS = 8000;    // full corrected playbook incl. steps — generous so it can't truncate
const REVIEW_SKIP_AFTER_MS = 95_000; // if structure+steps already took this long, skip review (protect wall-clock)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Row = any;

// The three engines in scope (never Perplexity / Copilot).
const PLAYBOOK_ENGINES: { key: string; label: string }[] = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "ai_overview", label: "Google AI Overview" },
];

/* ── Validated playbook shape ─────────────────────────────────────────────────── */
// Leverage ranking for THIS specific business (not generic importance).
type Priority = "high" | "medium" | "low";
type LeadTime = "fast" | "medium" | "slow";
// Deliverable split: seo = on-page technical work that lifts the SEO grade (chargeable add-on);
// visibility = off-site + entity + AI-answer work that gets the business named by AI.
type Track = "seo" | "visibility";
const PRIORITIES = new Set<Priority>(["high", "medium", "low"]);
const LEAD_TIMES = new Set<LeadTime>(["fast", "medium", "slow"]);
const TRACKS = new Set<Track>(["seo", "visibility"]);
// Sort weights: the whole plan is ONE ordered list — highest-leverage first, and within a
// priority tier the slowest-burning (start-now) work first (it takes longest to pay off).
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const LEADTIME_ORDER: Record<LeadTime, number> = { slow: 0, medium: 1, fast: 2 };
const MAX_ACTIONS = 40; // upper bound on the flat action list
interface InternalAction { action: string; why: string; pillar: string; priority: Priority; leadTime: LeadTime; track: Track; steps: string[]; dependsOn?: string }
interface DirectoryRec { name: string; why: string }
interface DeprioritisedItem { item: string; why: string }
interface Playbook {
  businessName: string;
  vertical: string;
  businessScope: "national" | "local" | "hybrid";
  summary: string;              // internal/intro overview (where they stand + what we'll do)
  clientSummary: string;        // plain-language roadmap paragraph for the client view
  actions: InternalAction[];    // ONE ordered list (was per-week internalActions); code-sorted
  clientTasks: string[];        // "what the client needs to do" (populated in a later stage)
  quickWins: string[];
  directories: DirectoryRec[];
  deprioritised: DeprioritisedItem[]; // things to do lightly or skip for THIS business
  timelineNote: string;
  guaranteeNote: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown, cap: number): string[] =>
  (Array.isArray(v) ? v : []).map(str).filter(Boolean).slice(0, cap);

/* ── National vs local (computed in code — mirrors the SYSTEM_PROMPT fork) ────────
 * The prompt asks the model to de-prioritise local map listings for national firms, but
 * the model still slips GBP into quickWins — so we ALSO decide national-vs-local here and
 * enforce it. Conservative by design: only NATIONAL on a clear signal, otherwise LOCAL, so
 * we never wrongly strip GBP from a genuine local firm (per the task's ambiguity rule). */

// GBP / local-map / local-listing terms that must NOT be a quick win for a national firm.
const GBP_LOCAL_RE =
  /google business profile|google business|google my business|\bgbp\b|\bgmb\b|bing places|apple business connect|apple maps|google maps|\bmaps?\b|map pack|map listing|local listing|local citation|local pack|near me/i;

/** The client's EXPLICIT engagement scope stored at audit creation, or null when unset.
 *  This is the highest-precedence signal — it beats the model output and the code heuristic. */
function explicitScope(audit: Row): "national" | "local" | "hybrid" | null {
  const s = str(audit.business_scope).toLowerCase();
  return s === "national" || s === "local" || s === "hybrid" ? s : null;
}

/** Decide if this business is NATIONAL (no walk-in premises / served UK-wide). An explicit
 *  stored business_scope wins outright ("national"/"hybrid" ⇒ national, "local" ⇒ local);
 *  otherwise falls back to the same signals the prompt describes; ambiguous ⇒ LOCAL. */
function isNationalBusiness(audit: Row): boolean {
  // Explicit client answer overrides the guess (hybrid is treated as national-ish, like scope !== "local").
  const explicit = explicitScope(audit);
  if (explicit) return explicit !== "local";

  const loc = str(audit.location_text).toLowerCase().replace(/[.,]/g, " ").replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
  const type = str(audit.business_type).toLowerCase();

  // Unambiguous national indicators anywhere in the location or type.
  const NATIONWIDE = /\b(nationwide|national|uk[-\s]?wide|country[-\s]?wide|countrywide|online|remote|e-?commerce|virtual)\b/;
  if (NATIONWIDE.test(loc) || NATIONWIDE.test(type)) return true;

  // Location is JUST a country/region (no specific town/city) → national.
  const REGIONS = new Set([
    "uk", "u k", "united kingdom", "great britain", "britain", "gb", "gbr",
    "england", "scotland", "wales", "northern ireland", "n ireland",
  ]);
  if (loc && REGIONS.has(loc)) return true;

  // No usable location given, but the type reads as a UK-wide professional/no-premises firm
  // → national. A specific town/city given ⇒ falls through to LOCAL. Local trades
  // (barber, dentist, café, garage…) are deliberately NOT matched here.
  const noLoc = !loc || loc.includes("not given") || loc.includes("n/a");
  const NATIONAL_TYPE = /\b(chartered|accountanc|accountant|solicitor|law firm|lawyer|barrister|consultanc|consultant|agency|software|saas|fintech)\b/;
  if (noLoc && NATIONAL_TYPE.test(type)) return true;

  return false; // specific place, or ambiguous → LOCAL (GBP stays a valid quick win)
}

/**
 * Validate the model's tool output into a clean Playbook. Rejects (returns an error) unless
 * the core contract holds — never stores a half-built plan. Drops individual malformed
 * sub-items (bad actions/directories) rather than failing the whole plan for one bad row.
 */
function buildValidatedPlaybook(raw: unknown, fallbackName: string, national: boolean, explicit: "national" | "local" | "hybrid" | null, hasLocation: boolean): { ok: true; playbook: Playbook } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not_an_object" };
  const o = raw as Record<string, unknown>;

  const summary = str(o.summary);
  if (summary.length < 20) return { ok: false, error: "missing_summary" };

  const clientSummary = str(o.clientSummary);
  if (clientSummary.length < 20) return { ok: false, error: "missing_client_summary" };

  // ONE flat action list (was per-week internalActions). Drop malformed rows; default missing
  // priority / leadTime to "medium" rather than rejecting the whole plan.
  const actions: InternalAction[] = (Array.isArray(o.actions) ? o.actions : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      action: str(a.action), why: str(a.why), pillar: str(a.pillar),
      priority: (typeof a.priority === "string" && PRIORITIES.has(a.priority as Priority) ? a.priority : "medium") as Priority,
      leadTime: (typeof a.leadTime === "string" && LEAD_TIMES.has(a.leadTime as LeadTime) ? a.leadTime : "medium") as LeadTime,
      // Default missing/invalid track to "visibility" (base deliverable) — never wrongly bill a
      // mis-tagged action as the chargeable SEO add-on. Preserved through initial + review passes.
      track: (typeof a.track === "string" && TRACKS.has(a.track as Track) ? a.track : "visibility") as Track,
      steps: strArr(a.steps, 12), // step-by-step how-to; may be empty until the enrichment pass (later stage)
      dependsOn: str(a.dependsOn) || undefined,
    }))
    .filter((a) => a.action && a.why && a.pillar)
    .slice(0, MAX_ACTIONS);
  if (actions.length < 3) return { ok: false, error: "too_few_actions" };

  // CODE-ENFORCED ORDER (the fix): highest-leverage first, and within a priority tier the
  // slowest-burning start-now work first. Array.sort is stable in Deno, so ties keep the
  // model's original order.
  actions.sort((a, b) =>
    (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) ||
    (LEADTIME_ORDER[a.leadTime] - LEADTIME_ORDER[b.leadTime]));

  const directories: DirectoryRec[] = (Array.isArray(o.directories) ? o.directories : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({ name: str(d.name), why: str(d.why) }))
    .filter((d) => d.name && d.why)
    .slice(0, 12);
  // No hard floor: directories is now "where the client gains citations/presence" (led by our own
  // network); an empty list is acceptable rather than forcing the model to invent third-party ones.

  // Business scope precedence: explicit stored answer > model's determination > code heuristic
  // (the `national` param). The client's explicit engagement scope always wins when present.
  const modelScope: "national" | "local" | "hybrid" | null =
    o.businessScope === "national" || o.businessScope === "local" || o.businessScope === "hybrid"
      ? o.businessScope : null;
  const scope: "national" | "local" | "hybrid" =
    explicit ?? modelScope ?? (national ? "national" : "local");

  // quickWins — local tactics (GBP / Bing Places / local citations) are valid for ANY business
  // that has a real base location, national brands INCLUDED: a winnable local wedge is the route
  // to being named. So we ONLY strip GBP / local-map terms when the business has NO location
  // anywhere (pure-remote, no base town) — then there's no local footing to list against.
  // Scope (national/local/hybrid) is positioning, NOT a reason to strip local tactics.
  let quickWins = strArr(o.quickWins, 8);
  if (!hasLocation) quickWins = quickWins.filter((q) => !GBP_LOCAL_RE.test(q));
  if (quickWins.length < 1) return { ok: false, error: "no_quick_wins" };

  // deprioritised = things to do LIGHTLY or SKIP for this business (validated loosely — drop
  // malformed entries, never fail the plan over them). Optional; empty is fine.
  const deprioritised: DeprioritisedItem[] = (Array.isArray(o.deprioritised) ? o.deprioritised : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({ item: str(d.item), why: str(d.why) }))
    .filter((d) => d.item && d.why)
    .slice(0, 8);

  // "What the client needs to do" — populated in a later stage; empty for now is fine.
  const clientTasks = strArr(o.clientTasks, 12);

  const timelineNote = str(o.timelineNote);
  const guaranteeNote = str(o.guaranteeNote);
  if (!timelineNote || !guaranteeNote) return { ok: false, error: "missing_notes" };

  return {
    ok: true,
    playbook: {
      businessName: str(o.businessName) || fallbackName || "This business",
      vertical: str(o.vertical) || "",
      businessScope: scope,
      summary,
      clientSummary,
      actions,
      clientTasks,
      quickWins,
      directories,
      deprioritised,
      timelineNote,
      guaranteeNote,
    },
  };
}

// The verified delivery method — the single source of truth for WHAT tasks exist and the HARD
// RULES. Shared by the structure pass (SYSTEM_PROMPT) AND the steps-enrichment pass so both draw
// from the SAME method and can't drift apart.
const VERIFIED_METHOD =
`════════ THE VERIFIED DELIVERY METHOD (GROUND TRUTH — draw EVERY task from this) ════════
This is Findable's verified method. EVERY action you output MUST come from one of the four tiers
below — do NOT invent tasks outside it. Why it works: AI CITES rather than ranks (it recommends
a business it can READ, VERIFY as a distinct entity across independent sources, and TRUST);
entity/NAP consistency + validated schema are foundational; content must be fact-dense and
answer-first; credibility compounds slowly, so start it early; visibility is unstable, so measure
and iterate. Google Business Profile feeds Google's own surfaces AND Bing's index feeds chatgpt +
other AI assistants' local answers, so Google Business Profile AND Bing Places are BOTH foundation-tier entity signals.

TIER 1 — FOUNDATION (fast, high priority):
- NAP (name / address / phone) consistent everywhere AI reads.
- Structured data / schema, VALIDATED (Organization / LocalBusiness / FAQ as fits the business).
- Contact details as REAL TEXT on the site (not only an image or a form).
- Page titles + meta descriptions.
- Site crawlable / readable WITHOUT JavaScript, and indexing switched on.
- Google Business Profile — claim / verify / complete (primary for Google's own surfaces; do this for ANY business with a base location).
- Bing Places — foundational, claim / verify / complete (chatgpt + other AI assistants pull local answers from Bing's index).

TIER 2 — CONTENT (weeks 2-4):
- Answer-first content matching the REAL question phrasing customers use.
- Service pages + area pages built from REAL data (area pages only where scope makes them relevant).
- FAQ pages matching real questions.
- High fact-density, verifiable content.
- A clear entity / about page.

TIER 3 — CREDIBILITY / OFF-SITE (slow-burn, START EARLY, compounds):
- Placement in OUR OWN "best [trade] in [city]" directory network — NOT manual submission to third-party directories.
- Reviews — Google first; switch on review velocity / auto-request at the right cadence for THIS business.
- Selective high-authority review / citation presence.
- ONLY genuinely-relevant vertical directories (never scattergun submission).

TIER 4 — MEASURE / ITERATE (ongoing):
- Track a FIXED prompt set over time.
- Monthly refresh / iterate — double down on what got cited, rewrite what got skipped.
- Google Search Console.

HARD RULES (follow exactly — these override any habit or prior training):
- Draw EVERY task ONLY from the four tiers above. Never invent a task outside the method.
- Foundational listings and NAP-consistent citations across the key sources AI cross-checks
  (Google Business Profile, Bing Places, and the main reputable directories for the trade) ARE
  part of the method — this is how AI verifies the business is a real, consistent entity. Our own
  best-[trade]-in-[city] network is the additive authority layer on top and our differentiator.
  Avoid low-quality directory spam, but do not skip the foundational citations.
- Use ONLY the credentials provided in the input; never invent or guess a professional body — if
  the credentials field is blank, stay silent on professional bodies (say "your professional body's
  directory", never a specific one like ICAEW/ACCA/SRA/CIOT). Never suggest ICAEW to a firm that
  may be ACCA-only, or vice versa.
- Bing Places is foundational, not optional — chatgpt and other AI assistants pull local answers
  from Bing's index, so a Bing Places listing is a first-tier task. Google Business Profile remains
  primary for Google's own surfaces. Both are foundation-tier.
- NEVER promise rankings or specific outcomes. For medical / health businesses keep everything
  visibility-only (ASA compliance) — no treatment or outcome claims.`;

const SYSTEM_PROMPT =
`You are Findable's senior GEO (Generative Engine Optimisation) strategist. You turn an AI-
visibility audit into a tailored GEO delivery plan for ONE specific business — ONE ordered
list of actions plus a client roadmap — returned as ONE structured object via the
return_playbook tool — no prose outside the tool.

Every plan is grounded in THIS business's real audit data. Never invent specifics; where a
detail is missing, say what to CONFIRM AT ONBOARDING instead of guessing.

════════ ENGINES IN SCOPE ════════
ChatGPT, Gemini, and Google AI Overview ONLY. NEVER mention Perplexity or Copilot - these may inform our own strategy but must never appear in any client-facing or operator output; the only engines named in output are chatgpt, gemini and google ai overview.
Write ALL brand / product / engine names in the OUTPUT in lowercase (chatgpt, gemini, google ai overview, google business profile, bing places, trustpilot, xero, etc.) - this is our house style. Proper directory/body names keep their normal form (ICAEW, ACCA, Chartered Institute of Taxation, unbiased.co.uk).

Reference the SPECIFIC engines that did / didn't name the business, per-engine.

════════ ONE ORDERED ACTION LIST (no week buckets) ════════
Return the whole plan as a SINGLE flat "actions" array — do NOT group by week or map actions
to time windows. The list ORDER is set in CODE from each action's priority then leadTime
(highest-leverage first; within a tier, slowest-burning start-now work first), so you do NOT
sequence the list yourself — you just TAG each action honestly (see the priority + leadTime
sections below) and describe it well. Cover the full engagement (roughly an 8-week horizon):
the foundational data-layer work, the slow off-site trust building, the on-site content, and
the later reinforce/chase/measure work — all as individual actions in the one list.

SEQUENCING PRINCIPLE (why the tags matter): off-site trust signals — industry / authority
directory submissions, citations, earned mentions, and review velocity — take WEEKS-TO-MONTHS
for AI engines to crawl, cross-check across independent sources, and build entity confidence
from. They are the SLOWEST to pay off, so they must be STARTED NOW even though the payoff lands
late — tag them leadTime "slow" so the code floats them to the top of their priority tier.
On-site work (schema, NAP, service / FAQ pages, front-loaded answers - plus area pages only
where scope calls for them, see the National vs Local fork) lands faster: tag it "fast" (or
"medium"). Review velocity: switch it on at the RIGHT cadence for THIS business — high-frequency
local trades ask after every job; B2B / long-cycle / national firms (accountancy, law,
consultancy) ask at natural milestones (year-end, project sign-off, onboarding) and prioritise
the review platforms that matter for the vertical (industry-specific review sites + Trustpilot
for national B2B; Google reviews mainly for local walk-in). Never filter or gate reviews.
Include measurement actions (mid-point re-scan, final before/after per engine) as their own
list items too.

${VERIFIED_METHOD}

════════ WEBSITE FORK (critical) ════════
- If the business HAS NO website: produce NO on-site actions — no meta/H1/on-site schema,
  no page builds on their site. Focus entirely on Google Business Profile, Google-first reviews,
  our own "best [trade] in [city]" network + genuinely-relevant sources, community, and pages
  hosted on OUR infrastructure. Say plainly that our hosted pages are where owned content will live.
- If the business HAS a website: include BOTH on-site (schema, FAQ pages, front-loaded
  answers, service pages - area / location pages ONLY where businessScope makes them relevant, see the National vs Local fork) AND off-site (our own network placement + genuinely-relevant citations, Google-first reviews).

════════ POSITIONING vs TARGETING (critical — the core of the strategy) ════════
Set "businessScope" = "national" | "local" | "hybrid" for THIS business, using the System scope
hint as a strong default and overriding only with a clear reason stated in "summary". But be clear
what businessScope MEANS here:

businessScope is POSITIONING — how the BRAND is PRESENTED (a UK-wide firm vs a one-town trade). It
is NOT where we target, and it does NOT switch local tactics off.

TARGETING IS ALWAYS A WINNABLE LOCAL WEDGE. Broad and national search terms are already owned by
entrenched incumbents and will not move — so a LOCAL wedge (the business's base town PLUS the
specific areas it serves) is the realistic route to being NAMED by AI, even for a national brand.
Every plan targets that local wedge first.

Decide businessScope from how the brand is presented (do NOT just pattern-match — the examples are illustrative):
- NATIONAL: presented as serving clients UK-wide / remotely (e.g. chartered accountancy, law or consultancy firms, online-only retailers, national SaaS). ABLM-type firms are NATIONAL positioning — but still worked via their base town's local wedge.
- LOCAL: a one-town / local-catchment trade (barber, dentist, café, garage, mobile trades serving one area).
- HYBRID: a genuine mix (e.g. a firm with a few offices that also serves clients remotely).

WHAT THIS MEANS FOR TACTICS (applies regardless of positioning):
- Google Business Profile, Bing Places and NAP-consistent LOCAL CITATIONS apply to EVERY business
  that has a real base location — national brands INCLUDED. They are FOUNDATION-tier, not "light
  entity verification". A national brand with a Peterborough base still claims Google Business
  Profile + Bing Places in Peterborough and lists in local citations.
- Build local service / area pages for the base town + served areas (these are the WINNABLE terms),
  AND sector / audience pages for the brand's wider positioning. For a national brand do BOTH — the
  local wedge is where naming actually happens first.
- HYBRID (multiple premises + remote): run the local wedge for EACH real base location.
- ONLY skip local tactics (GBP, Bing Places, local citations, area pages) when the business
  genuinely has NO location anywhere — pure-remote with no base town. THEN, and only then, lead
  with sector / audience content, reviews, and our-own-network placement instead.
Never let "national" positioning strip the local wedge from a business that has a base location.

════════ RANK EVERY ACTION BY LEVERAGE (for THIS business — this is the point) ════════
This plan is PRIORITISED ADVICE. Give EVERY action a "priority" of "high", "medium" or "low"
based on its LEVERAGE FOR THIS SPECIFIC BUSINESS — how much it
actually moves the needle on getting cited by AI given this business's type / location /
website / national-or-local status — NOT its generic importance. RANK HONESTLY: a real plan
has a few HIGH-leverage moves and several lower ones. Do NOT mark everything high; if
everything is high, nothing is.

EDITORIALISE — for LOW-priority actions, say so plainly in the action's "why": that it's
low-value for THIS business and what to do about it (do lightly / set up once and move on /
skip). Never present a low-leverage action as if it deserves real effort.

DEPRIORITISED / SKIP LIST — also populate the top-level "deprioritised" array with anything
that is genuinely NOT worth much effort for this business type: each entry = { item, why },
where "why" explains it's low-value here and whether to set up once or skip entirely. Leave it
empty only if truly nothing applies.

Concrete ranking guidance (apply to the ACTUAL business, don't copy blindly):
- NATIONAL-positioned firm WITH a base location (e.g. a UK-wide accountancy firm based in one town):
    · HIGH: reviews (Google + the vertical's review platforms) — usually the single biggest lever;
      Google Business Profile AND Bing Places for the BASE TOWN (both foundation-tier — they feed AI
      local answers); NAP consistency + local citations; validated Organization / professional-identity
      schema; site-readability; local service / area pages for the base town + served areas; FAQ +
      front-loaded answers; OUR OWN "best [trade] in [city]" network placement.
    · MEDIUM / LOW: broad national sector pages — worth building for positioning, but the national
      terms are largely locked by incumbents, so do NOT imply they'll be won quickly.
    · SKIP (put in "deprioritised") only where genuinely irrelevant, e.g. Apple Business Connect if
      there is no premises customers physically visit.
- PURE-REMOTE firm with NO base location anywhere: GBP / Bing Places / local citations / area pages
  are not applicable — lead with reviews, sector / audience content, and our-network placement.
- LOCAL business with premises (barber, dentist, café, garage, restaurant): Google Business Profile +
  Bing Places + Google-first reviews + our own "best [trade] in [city]" network + local citations +
  area pages = HIGH (the main levers); Apple Business Connect only where customers physically visit.
Ground every ranking in the verified methodology above (what actually gets a business CITED),
not in habit.

════════ HONEST CEILING (be truthful about hard cases) ════════
When the business is a hard case — broad or generalist positioning, near-zero reviews, and most
terms already locked by established competitors — the plan MUST be honest. Lead with reviews as the
single biggest lever. State plainly that this is a slow climb, not an overnight switch. Point effort
at the few genuinely winnable local terms rather than implying the locked national ones can be won.
Never inflate expected outcomes.

════════ TAG EVERY ACTION BY LEAD TIME (short-term vs long-term levers) ════════
Give EVERY action a "leadTime" = how long until it actually moves AI visibility:
- "fast" (days): on-site fixes - identity / Organization schema, meta / title / H1, site readability, FAQ + front-loaded answers, service / sector page builds; one-off GBP setup.
- "medium" (2-4 weeks): directory submissions that approve quickly, NAP propagation, first review requests landing.
- "slow" (weeks-to-months): authority / industry-body directory approvals, earned media / PR / guest content, cross-source entity trust building, review accumulation to a critical mass.
TAG HONESTLY: leadTime describes ONLY how long the payoff takes — NOT importance and NOT when to start. A "slow" action is started immediately precisely because it matures late; the code SORTS the list so slow high-leverage work sits at the very top (started now), and fast quick wins follow within their tier. Do not down-rank a slow action just because it pays off late. In the clientSummary roadmap, reassure plainly (no jargon) that the slow-burn trust work is being started NOW precisely because it takes time to mature.

════════ CLASSIFY EACH ACTION BY TRACK (seo vs visibility) ════════
Give EVERY action a "track" of "seo" or "visibility" (see the schema definition):
- "seo" = ON-PAGE GRADE work in the site's own pages that lifts the SEO score but is NOT about
  AI naming them: H1 tags, image alt text, broken links, meta descriptions/titles, thin content
  to expand, other non-schema on-page technical fixes.
- "visibility" = work that gets the business NAMED and TRUSTED by AI: schema / JSON-LD structured
  data (entity machine-readability), our own "best [trade] in [city]" network, professional-body /
  industry directories, reviews, NAP consistency across platforms, answer-first FAQ content
  targeting real AI questions, citations, and ALL measurement / monitoring.
schema / structured data is ALWAYS visibility, never seo.
Tag by what the work DOES (on-page score lift that isn't schema = seo; entity/off-site/AI-naming
signals = visibility), independent of priority and leadTime. This split does NOT change ordering.

════════ USE THE ACTUAL DATA ════════
- Name the specific engines that did NOT return the business.
- COMPETITOR NAMES — JUDGE EACH BEFORE USING: the supplied competitor list is a set of
  UNVERIFIED CANDIDATES scraped from AI answers, NOT a clean list. Before you name any of
  them, judge each one and use it ONLY if it is plausibly a REAL COMPETITOR FIRM — an actual
  business a customer could hire instead. EXCLUDE (never name) anything that is:
    · a service or task (Payroll, Bookkeeping, Tax Returns, Audit);
    · a tax form or tax term (CT600, VAT, Corporation Tax, Self Assessment, PAYE);
    · a government/regulatory body (HMRC, Companies House, Gov.uk);
    · software or a tool (Xero, QuickBooks, Sage, "Software");
    · a generic word (Customs, Cost, Cheap, Pricing, Near, Best);
    · an obvious fragment or fused token (e.g. "CloseThank", "FacebookGmailX…").
  Keep only names that genuinely read like a firm. If NONE of the candidates are clearly
  real competitor firms, refer to competitors GENERICALLY as "other firms" — NEVER name a
  junk candidate to fill space. Apply this judgement EVERYWHERE competitors appear: the
  summary, the competitor-gap actions in the action list, AND the clientSummary roadmap.
- Tie actions to their real SEO findings / baseline signals when SEO data is present
  (e.g. "no LocalBusiness schema detected" → schema action). SYNTHESISE from the pasted SEO
  detail; NEVER reproduce chunks of it verbatim.
- Ground everything in their vertical / niche and location. If vertical or niche is unclear,
  infer from the name/type and flag it to confirm at onboarding.

════════ TWO REGISTERS (same plan, two audiences) ════════
- actions = what WE do. Each action is specific, technical, our language (schema types,
  directory names, tooling, dependencies). This is our execution list.
- clientSummary = ONE plain-language roadmap paragraph for a NON-TECHNICAL business owner:
  what we'll do across the engagement and roughly in what order, in reassuring everyday
  language. It is NOT a repeat of "summary" — summary is the where-they-stand overview;
  clientSummary reads as "here's the plan". No internal cost/tooling talk. NEVER over-promise:
  consistent with an honest, per-engine guarantee — the promise is "named in MORE answers by
  the end than on day 0", not "#1" or "guaranteed top result".
- pillar (per action) = the layer it belongs to, one of: "Data Layer", "Content Layer",
  "Off-site / Earned", "Reviews", "Community", "Measurement".
- priority (per action) = "high" | "medium" | "low" leverage FOR THIS BUSINESS (see the ranking
  section above). Required on every action.

════════ CLIENT-SIDE TASKS ("clientTasks" — SELECT from this defined set, do NOT invent) ════════
Under our hybrid delivery model WE do the work; a few things only the CLIENT can do. Populate
"clientTasks" by SELECTING the ones relevant to THIS business from the DEFINED SET below and
phrasing each plainly (short, friendly, second-person "you"). Do NOT invent client tasks outside
this set. Include an item ONLY if it actually applies (e.g. no "grant website access" for a
no-website business; no "confirm memberships" unless the vertical has professional bodies):
- Confirm your business details (name, address, phone) are correct.
- Give us access to your website / hosting (so we can make the on-site changes).
- Provide your logo and any brand assets (colours, images).
- Confirm your professional memberships / credentials (so we list the RIGHT body — we never guess).
- Set up / own any account that needs YOUR personal or payment details (e.g. Google Business
  Profile ownership) — we'll guide you, but these must be in your name.
- Approve wording and design changes before they go live.
Phrase them as things the client ticks off; keep it to the ones that genuinely apply.

Return the whole plan via return_playbook as ONE ordered "actions" list (code sorts it — you
just tag each action's priority + leadTime honestly) plus the client roadmap. quickWins = 3-6
highest-leverage first moves. directories = WHERE THE CLIENT WILL GAIN CITATIONS / PRESENCE —
LEAD with our own "best [trade] in [city]" network placement, then ONLY genuinely-relevant,
genuinely-authoritative sources for THIS vertical (a professional-body directory ONLY if the
input states membership, Google Business Profile, key review platforms). NOT a scattergun of
third-party directories; never guess a professional body. One-line why each. clientTasks = the
relevant items from the CLIENT-SIDE TASKS defined set, plainly phrased (empty only if none apply).
deprioritised = what to do lightly or skip for this business (empty only if nothing applies).
timelineNote = the honest re-audit/instability framing. guaranteeNote = the honest before/after promise.`;

const PLAYBOOK_TOOL = {
  type: "function",
  function: {
    name: "return_playbook",
    description: "Return the tailored GEO playbook (one ordered action list + client roadmap) for this business.",
    parameters: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        vertical: { type: "string", description: "The business's vertical/niche, e.g. 'accountancy firm'." },
        businessScope: { type: "string", enum: ["national", "local", "hybrid"], description: "Your determination for THIS business, applied to the national/local fork." },
        summary: { type: "string", description: "2-4 sentence where-they-stand-and-what-we'll-do overview, grounded in the audit." },
        clientSummary: { type: "string", description: "A plain-language roadmap paragraph for a NON-TECHNICAL business owner: what we'll do across the engagement and roughly in what order, in reassuring everyday language. NOT a repeat of summary — this reads as 'here's the plan'." },
        actions: {
          type: "array",
          minItems: 3,
          maxItems: 40,
          description: "ONE flat list of every action. Do NOT group by week — the order is set in code from priority + leadTime. Tag each action honestly.",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              why: { type: "string", description: "Why it matters for THIS business. For LOW priority, say plainly it's low-value here + what to do (do lightly / set up once / skip)." },
              pillar: { type: "string", enum: ["Data Layer", "Content Layer", "Off-site / Earned", "Reviews", "Community", "Measurement"] },
              priority: { type: "string", enum: ["high", "medium", "low"], description: "LEVERAGE for THIS specific business (not generic importance). Rank honestly — do NOT make everything high." },
              leadTime: { type: "string", enum: ["fast", "medium", "slow"], description: "How long until this action actually moves AI visibility: fast=days, medium=2-4wks, slow=weeks-to-months (start these now, they pay off late)." },
              track: { type: "string", enum: ["seo", "visibility"], description: "Which deliverable this belongs to. visibility = work that gets the business NAMED and TRUSTED by AI: schema/JSON-LD structured data (entity machine-readability), our best-of directory network, professional-body/industry directories, reviews, NAP consistency across platforms, answer-first FAQ content targeting AI questions, citations, and measurement/monitoring. seo = on-page grade work in the site's own pages that lifts the SEO score but is NOT about AI naming them: H1 tags, alt text, broken links, meta descriptions, thin/expand content, other on-page technical fixes. IMPORTANT: schema/structured data is ALWAYS visibility, never seo." },
              steps: { type: "array", items: { type: "string" }, description: "Step-by-step how-to for delivering THIS task. May be left empty for now — it is filled in a later enrichment pass." },
              dependsOn: { type: "string" },
            },
            required: ["action", "why", "pillar", "priority", "leadTime", "track"],
            additionalProperties: false,
          },
        },
        clientTasks: { type: "array", items: { type: "string" }, description: "What the CLIENT themselves needs to do — SELECT the relevant items from the CLIENT-SIDE TASKS defined set in the system prompt, phrased plainly. Do NOT invent tasks outside that set. Empty only if none apply." },
        quickWins: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        directories: {
          type: "array",
          maxItems: 12,
          description: "WHERE THE CLIENT WILL GAIN CITATIONS / PRESENCE. Lead with our own 'best [trade] in [city]' network placement, then ONLY genuinely-relevant / genuinely-authoritative sources (a professional-body directory only if the input states membership, Google Business Profile, key review platforms). NOT scattergun third-party directories; never guess a professional body.",
          items: {
            type: "object",
            properties: { name: { type: "string" }, why: { type: "string" } },
            required: ["name", "why"],
            additionalProperties: false,
          },
        },
        deprioritised: {
          type: "array",
          maxItems: 8,
          description: "Things to do LIGHTLY or SKIP for THIS business (e.g. Apple Business Connect for a national no-premises firm). Empty if nothing applies.",
          items: {
            type: "object",
            properties: {
              item: { type: "string", description: "What to skip / go light on." },
              why: { type: "string", description: "Why it's low-value for THIS business, and whether to set up once or skip entirely." },
            },
            required: ["item", "why"],
            additionalProperties: false,
          },
        },
        timelineNote: { type: "string" },
        guaranteeNote: { type: "string" },
      },
      required: ["businessName", "vertical", "businessScope", "summary", "clientSummary", "actions", "quickWins", "directories", "timelineNote", "guaranteeNote"],
      additionalProperties: false,
    },
  },
};

/** Pack the run's available data into a compact user message. Handles partial data.
 *  `cleanedCompetitors` is the frontend's already-filtered rival list (isRealCompetitor —
 *  gov/tax/software + fragments removed); we never re-derive competitors from raw here, so
 *  junk like HMRC / Xero / "Corporation Tax" can't reach the model. */
function buildUserPrompt(audit: Row, results: Row, cleanedCompetitors: string[]): string {
  const name = str(audit.business_name) || "the business";
  const type = str(audit.business_type) || "(not given — infer & confirm at onboarding)";
  const loc = str(audit.location_text) || "(not given)";
  const country = str(audit.country);
  const specialism = str(audit.specialism);
  const credentials = str(audit.credentials);
  const hasWebsite = audit.has_website === true && !!str(audit.website);
  // Scope hint: an explicit client answer is authoritative; otherwise the code heuristic is a
  // strong default the model may override with a stated reason.
  const explicit = explicitScope(audit);
  const scopeHint = explicit
    ? `CLIENT-STATED scope (AUTHORITATIVE — build to this): ${explicit.toUpperCase()}`
    : `System scope hint (heuristic - treat as a STRONG default; override only with a clear reason you state in "summary"): ${isNationalBusiness(audit) ? "NATIONAL / no walk-in premises" : "LOCAL / has premises"}`;

  // Per-engine visibility from results.questions.
  const questions: Row[] = Array.isArray(results?.questions) ? results.questions : [];
  const engineLines = PLAYBOOK_ENGINES.map((e) => {
    let named = 0, total = 0;
    for (const q of questions) {
      const er = q?.engines?.[e.key];
      if (er) { total++; if (er.named === true) named++; }
    }
    return `  - ${e.label}: named in ${named} of ${total} answers`;
  }).join("\n");

  // Competitor-name CANDIDATES AI named instead. Frontend-filtered but NOT guaranteed clean
  // (junk like Payroll / CT600 / Customs / fused tokens can slip through) — the model must
  // JUDGE each and use only real firms (see SYSTEM_PROMPT), else say "other firms".
  const topComps = (cleanedCompetitors ?? []).map(str).filter(Boolean).slice(0, 10);
  const compLine = topComps.length
    ? topComps.join(", ")
    : "(none identified — refer to competitors generically as \"other firms\"; NEVER name gov/tax bodies or software)";

  const questionList = questions.map((q) => `  - "${str(q?.question)}"`).slice(0, 20).join("\n");

  // SEO block (optional).
  const seo = results?.seo && typeof results.seo === "object" ? results.seo as Row : null;
  const seoGraded = seo && seo.categories && typeof seo.categories === "object";
  let seoBlock = "No website SEO data was added (AI-visibility-only audit).";
  if (seoGraded) {
    const c = seo.categories;
    const findings = Array.isArray(seo.leadFindings)
      ? seo.leadFindings.map((f: Row) => `    - [${str(f?.severity)}] ${str(f?.title)}: ${str(f?.detail)}`).join("\n")
      : "";
    const baseline = seo.baseline && typeof seo.baseline === "object" ? JSON.stringify(seo.baseline).slice(0, 2000) : "(none)";
    const rawPaste = str(seo.rawPaste).slice(0, MAX_RAW_PASTE_CHARS);
    seoBlock =
`Overall SEO grade: ${str(seo.overallGrade)}
  On-Page: ${str(c?.onPage?.grade)} (${c?.onPage?.score}) | Content & Technical: ${str(c?.contentTechnical?.grade)} (${c?.contentTechnical?.score})
  Lead findings:
${findings || "    (none)"}
  Baseline signals (JSON): ${baseline}
  Raw pasted SEO report (SYNTHESISE — never reproduce verbatim):
  """
  ${rawPaste || "(none)"}
  """`;
  }

  return `BUSINESS
  Name: ${name}
  Type / vertical: ${type}${specialism ? `\n  Specialism / niche: ${specialism}` : ""}${credentials ? `\n  Credentials / accreditations / memberships (USE ONLY THESE — never invent or guess a body): ${credentials}` : "\n  Credentials: (none provided — stay silent on professional bodies)"}
  Location: ${loc}${country ? `\n  Country: ${country}` : ""}
  Website: ${hasWebsite ? str(audit.website) : "NO WEBSITE — apply the no-website fork (off-site only + our hosted pages)"}\n  ${scopeHint}

AI-VISIBILITY AUDIT (Week 0 baseline)
${engineLines}
  Competitor-name CANDIDATES scraped from AI answers (UNVERIFIED — judge each; use only real firms, else "other firms"): ${compLine}
  Questions tested:
${questionList || "  (none)"}

WEBSITE SEO
${seoBlock}

Build the tailored GEO playbook for THIS business via return_playbook: ONE ordered "actions"
list (tag each action's priority + leadTime honestly — code sorts the order), plus a single
client-safe clientSummary roadmap paragraph. Use the real data above and apply the correct
website + national/local forks.`;
}

/* ── PASS 2 — steps enrichment (batched, graceful) ────────────────────────────────
 * Runs AFTER the structure pass + sort, so tasks are in final order. Splits the sorted actions
 * into small batches and asks a cheap model for concrete step-by-step "how" per task, drawn from
 * the SAME verified method (VERIFIED_METHOD). Steps merge back by the task's global index. A
 * failed/timed-out batch leaves those tasks with an empty steps[] — never fails the whole plan. */

const STEPS_SYSTEM_PROMPT =
`You are Findable's GEO delivery lead. For each task you are given, return concrete, ordered
"how I actually do it" steps — the practical delivery steps for THAT task, drawn ONLY from the
verified method below. Do not add tasks; only explain how to deliver the ones given.

${VERIFIED_METHOD}

STEP RULES:
- 3-7 tight steps per task; each a short imperative instruction starting with a verb.
- Specific to the task and method — e.g. schema → "…validate in Google Rich Results Test";
  reviews → "…Google first, switch on auto-request at the right cadence"; our-network placement →
  place the business in OUR OWN "best [trade] in [city]" pages (NOT third-party submission).
- Obey the HARD RULES above: never third-party-directory submission as the strategy; never guess a
  professional body; Google primary over Bing; never promise rankings or outcomes.
- Return ONLY JSON of this exact shape, one entry per given id:
  {"results":[{"id":<number>,"steps":["step 1","step 2", ...]}]}`;

/** One enrichment call for a batch of tasks. Returns id→steps[]; throws on HTTP / parse error
 *  so the caller can degrade that batch gracefully. `startIdx` is the batch's first GLOBAL index
 *  in the sorted action list, so ids map straight back to actions[]. */
async function runStepsBatch(
  batch: InternalAction[],
  startIdx: number,
  ctx: { businessName: string; vertical: string; scope: string },
  apiKey: string,
): Promise<Map<number, string[]>> {
  const list = batch.map((a, j) =>
    `[id: ${startIdx + j}] (${a.pillar} · ${a.priority} priority · ${a.leadTime}) ${a.action} — WHY: ${a.why}`
  ).join("\n");
  const userPrompt = `Business: ${ctx.businessName || "(unknown)"} — ${ctx.vertical || "(vertical unknown)"} (${ctx.scope}).\n\nWrite delivery steps for EACH task below (one results entry per id):\n${list}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: STEPS_MODEL,
      temperature: 0.2,
      max_tokens: STEPS_MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STEPS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai_http_${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  const out = new Map<number, string[]>();
  for (const r of Array.isArray(parsed?.results) ? parsed.results : []) {
    const id = Number((r as Record<string, unknown>)?.id);
    if (!Number.isFinite(id)) continue;
    const steps = strArr((r as Record<string, unknown>)?.steps, STEPS_MAX_PER_TASK).map((s) => s.slice(0, 200));
    if (steps.length) out.set(id, steps);
  }
  return out;
}

/** Fill actions[].steps in place, one small batch per call, sequentially (keeps each call small
 *  and avoids rate-limit bursts — we prioritise NOT timing out over speed). A batch that fails
 *  leaves its tasks' steps empty rather than failing the whole generation. */
async function enrichActionSteps(
  pb: Playbook,
  ctx: { businessName: string; vertical: string; scope: string },
  apiKey: string,
): Promise<void> {
  const actions = pb.actions;
  for (let start = 0; start < actions.length; start += STEPS_BATCH_SIZE) {
    const batch = actions.slice(start, start + STEPS_BATCH_SIZE);
    try {
      const byId = await runStepsBatch(batch, start, ctx, apiKey);
      for (let j = 0; j < batch.length; j++) {
        const steps = byId.get(start + j);
        if (steps && steps.length) batch[j].steps = steps;
      }
    } catch (e) {
      // Graceful degradation: this batch's tasks keep steps: [] — better than a dead generation.
      console.error(`[generate-playbook] steps batch @${start} failed:`, e instanceof Error ? e.message : e);
    }
  }
}

/* ── PASS 3 — self-review (bounded, graceful) ──────────────────────────────────────
 * Audits the ASSEMBLED playbook (structure + steps) against the HARD RULES and returns a
 * corrected copy. Reuses PLAYBOOK_TOOL + buildValidatedPlaybook, so the corrected output is
 * re-sanitised AND re-sorted (ordering stays intact) and steps/clientTasks are preserved.
 * THROWS on any HTTP / parse / revalidation failure so the caller keeps the pre-review playbook. */
async function reviewPlaybook(
  pb: Playbook,
  national: boolean,
  explicit: "national" | "local" | "hybrid" | null,
  hasLocation: boolean,
  apiKey: string,
): Promise<Playbook> {
  const reviewSystem =
`You are Findable's GEO QA reviewer. AUDIT the assembled playbook below against the verified
method and FIX any violations, returning the FULL corrected playbook via the return_playbook
tool. Change ONLY what violates — preserve compliant content, and KEEP each action's steps and
its priority + leadTime tags (code re-sorts, so don't worry about order).

${VERIFIED_METHOD}

REVIEW CHECKLIST — fix any that fail:
1. No task, step, or directory suggests manual THIRD-PARTY-DIRECTORY SUBMISSION as the strategy —
   it must be our own "best [trade] in [city]" network + genuinely-relevant sources.
2. No GUESSED professional body — if the input doesn't state the firm's body, use "your
   professional body's directory", never a specific one (no ICAEW-for-unknown).
3. Google is PRIMARY over Bing everywhere; NO ranking / outcome promises; medical / health =
   visibility-only.
4. EVERY action has concrete, method-consistent steps (3-7). If an action's steps are missing or
   vague, write proper ones.
5. Keep the same actions + their priority / leadTime / track tags and the clientSummary / clientTasks.
Return the corrected playbook via return_playbook.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: REVIEW_MODEL,
      temperature: 0.1,
      max_tokens: REVIEW_MAX_TOKENS,
      messages: [
        { role: "system", content: reviewSystem },
        { role: "user", content: `PLAYBOOK TO REVIEW (JSON):\n${JSON.stringify(pb)}` },
      ],
      tools: [PLAYBOOK_TOOL],
      tool_choice: { type: "function", function: { name: "return_playbook" } },
    }),
  });
  if (!res.ok) throw new Error(`review_http_${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (typeof raw !== "string") throw new Error("review_no_output");
  const parsed = JSON.parse(raw);
  const revalidated = buildValidatedPlaybook(parsed, pb.businessName, national, explicit, hasLocation);
  if (!revalidated.ok) throw new Error(`review_invalid:${revalidated.error}`);
  return revalidated.playbook;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const t0 = Date.now(); // wall-clock start — used to time-budget the optional self-review pass
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: any authenticated user (the run must belong to them). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = u.user.id;

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const runId: string = typeof body.runId === "string" ? body.runId.trim() : "";
    if (!runId) return json({ ok: false, error: "runId required" }, 400);
    // Competitors are cleaned client-side (isRealCompetitor) and passed in — we never
    // re-derive them from raw here, so junk (HMRC/Xero/tax terms) can't reach the model.
    const cleanedCompetitors: string[] = Array.isArray(body.competitors)
      ? body.competitors.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => c.trim()).slice(0, 10)
      : [];

    // Load the run + ownership-check.
    const { data: run } = await service
      .from("ai_audit_runs").select("id, audit_id, user_id, results").eq("id", runId).maybeSingle();
    if (!run) return json({ ok: false, error: "run_not_found" }, 404);
    if (run.user_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

    // Load the audit for business context. (No website gate — playbook works for ANY audit.)
    const { data: audit } = await service
      .from("ai_audits").select("business_name, business_type, location_text, country, has_website, website, business_scope, specialism, credentials, business_address").eq("id", run.audit_id).maybeSingle();
    if (!audit) return json({ ok: false, error: "audit_not_found" }, 404);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    const results = run.results && typeof run.results === "object" ? run.results as Row : {};
    const userPrompt = buildUserPrompt(audit, results, cleanedCompetitors);

    let raw: string | undefined;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: TEMPERATURE,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [PLAYBOOK_TOOL],
          tool_choice: { type: "function", function: { name: "return_playbook" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json({ ok: false, error: `openai_http_${res.status}`, detail: txt.slice(0, 300) }, 502);
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    } catch (e) {
      return json({ ok: false, error: "openai_request_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
    }

    if (typeof raw !== "string") return json({ ok: false, error: "model_no_tool_output" }, 422);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return json({ ok: false, error: "model_bad_json" }, 422); }

    // A "base location" = any location signal at all (served-area text OR a registered address).
    // Only its ABSENCE (pure-remote, no base town) disables local tactics — see buildValidatedPlaybook.
    const hasLocation = !!(str(audit.location_text) || str(audit.business_address));
    const validated = buildValidatedPlaybook(parsed, str(audit.business_name), isNationalBusiness(audit), explicitScope(audit), hasLocation);
    if (!validated.ok) return json({ ok: false, error: `invalid_playbook:${validated.error}` }, 422);
    let playbook = validated.playbook;
    const national = isNationalBusiness(audit);
    const explicit = explicitScope(audit);

    // PASS 2 — steps enrichment (batched, graceful). Runs after the sort so tasks are in final
    // order; fills actions[].steps in place. Wrapped so it can NEVER fail the whole generation —
    // worst case some tasks store with steps: [] and can be re-enriched on a later regenerate.
    try {
      await enrichActionSteps(
        playbook,
        { businessName: str(audit.business_name), vertical: playbook.vertical, scope: playbook.businessScope },
        OPENAI_API_KEY,
      );
    } catch (e) {
      console.error("[generate-playbook] steps enrichment skipped:", e instanceof Error ? e.message : e);
    }

    // PASS 3 — self-review (bounded, time-budgeted, graceful). Only run it if the earlier passes
    // left enough of the wall-clock budget; on ANY failure keep the pre-review playbook.
    if (Date.now() - t0 < REVIEW_SKIP_AFTER_MS) {
      try {
        playbook = await reviewPlaybook(playbook, national, explicit, hasLocation, OPENAI_API_KEY);
      } catch (e) {
        console.error("[generate-playbook] self-review skipped (error):", e instanceof Error ? e.message : e);
      }
    } else {
      console.warn(`[generate-playbook] self-review skipped (time budget: ${Date.now() - t0}ms elapsed)`);
    }

    // Store at results.playbook. Read-modify-write MERGE (re-read immediately before write)
    // so the playbook merges with summary/questions/seo rather than clobbering them.
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, playbook } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, playbook });
  } catch (e) {
    console.error("[generate-playbook] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
