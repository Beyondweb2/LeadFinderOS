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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Row = any;

// Our fixed Sprint windows — every action must map to one of these.
const WINDOWS = ["Week 0", "Weeks 1-2", "Weeks 2-4", "Week 4", "Weeks 5-8", "Week 8"] as const;
const WINDOW_SET = new Set<string>(WINDOWS);
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
const PRIORITIES = new Set<Priority>(["high", "medium", "low"]);
const LEAD_TIMES = new Set<LeadTime>(["fast", "medium", "slow"]);
interface InternalAction { action: string; why: string; pillar: string; priority: Priority; leadTime: LeadTime; dependsOn?: string }
interface PlaybookWeek { window: string; goal: string; internalActions: InternalAction[]; clientSummary: string }
interface DirectoryRec { name: string; why: string }
interface DeprioritisedItem { item: string; why: string }
interface Playbook {
  businessName: string;
  vertical: string;
  businessScope: "national" | "local" | "hybrid";
  summary: string;
  weeks: PlaybookWeek[];
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
function buildValidatedPlaybook(raw: unknown, fallbackName: string, national: boolean, explicit: "national" | "local" | "hybrid" | null): { ok: true; playbook: Playbook } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not_an_object" };
  const o = raw as Record<string, unknown>;

  const summary = str(o.summary);
  if (summary.length < 20) return { ok: false, error: "missing_summary" };

  const rawWeeks = Array.isArray(o.weeks) ? o.weeks : [];
  const weeks: PlaybookWeek[] = [];
  for (const w of rawWeeks) {
    if (!w || typeof w !== "object") continue;
    const ww = w as Record<string, unknown>;
    const window = str(ww.window);
    const goal = str(ww.goal);
    if (!WINDOW_SET.has(window) || !goal) continue; // must map to a real Sprint window
    const internalActions: InternalAction[] = (Array.isArray(ww.internalActions) ? ww.internalActions : [])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        action: str(a.action), why: str(a.why), pillar: str(a.pillar),
        // Default to "medium" for missing/invalid priority / leadTime — never reject the plan over it.
        priority: (typeof a.priority === "string" && PRIORITIES.has(a.priority as Priority) ? a.priority : "medium") as Priority,
        leadTime: (typeof a.leadTime === "string" && LEAD_TIMES.has(a.leadTime as LeadTime) ? a.leadTime : "medium") as LeadTime,
        dependsOn: str(a.dependsOn) || undefined,
      }))
      .filter((a) => a.action && a.why && a.pillar)
      .slice(0, 8);
    weeks.push({ window, goal, internalActions, clientSummary: str(ww.clientSummary) });
  }
  // Keep at most one entry per window, ordered by our Sprint sequence.
  const byWindow = new Map<string, PlaybookWeek>();
  for (const w of weeks) if (!byWindow.has(w.window)) byWindow.set(w.window, w);
  const orderedWeeks = WINDOWS.filter((win) => byWindow.has(win)).map((win) => {
    const w = byWindow.get(win)!;
    return { window: w.window, goal: w.goal, internalActions: w.internalActions, clientSummary: w.clientSummary };
  });
  if (orderedWeeks.length < 3) return { ok: false, error: "too_few_weeks" };

  const directories: DirectoryRec[] = (Array.isArray(o.directories) ? o.directories : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({ name: str(d.name), why: str(d.why) }))
    .filter((d) => d.name && d.why)
    .slice(0, 12);
  if (directories.length < 1) return { ok: false, error: "no_directories" };

  // Business scope precedence: explicit stored answer > model's determination > code heuristic
  // (the `national` param). The client's explicit engagement scope always wins when present.
  const modelScope: "national" | "local" | "hybrid" | null =
    o.businessScope === "national" || o.businessScope === "local" || o.businessScope === "hybrid"
      ? o.businessScope : null;
  const scope: "national" | "local" | "hybrid" =
    explicit ?? modelScope ?? (national ? "national" : "local");

  // quickWins — for NATIONAL or HYBRID firms, code-enforce the prompt's rule: GBP / Bing
  // Places / Apple Business Connect / local-maps / local-listings are NEVER a quick win (the
  // model still slips them in). GBP stays allowed as a light entity-verification action in the
  // Data Layer week — we only strip it from quickWins here. LOCAL firms are untouched.
  let quickWins = strArr(o.quickWins, 8);
  if (scope !== "local") quickWins = quickWins.filter((q) => !GBP_LOCAL_RE.test(q));
  if (quickWins.length < 1) return { ok: false, error: "no_quick_wins" };

  // deprioritised = things to do LIGHTLY or SKIP for this business (validated loosely — drop
  // malformed entries, never fail the plan over them). Optional; empty is fine.
  const deprioritised: DeprioritisedItem[] = (Array.isArray(o.deprioritised) ? o.deprioritised : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({ item: str(d.item), why: str(d.why) }))
    .filter((d) => d.item && d.why)
    .slice(0, 8);

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
      weeks: orderedWeeks,
      quickWins,
      directories,
      deprioritised,
      timelineNote,
      guaranteeNote,
    },
  };
}

const SYSTEM_PROMPT =
`You are Findable's senior GEO (Generative Engine Optimisation) strategist. You turn an AI-
visibility audit into a tailored 8-WEEK SPRINT delivery plan for ONE specific business,
returned as ONE structured object via the return_playbook tool — no prose outside the tool.

Every plan is grounded in THIS business's real audit data. Never invent specifics; where a
detail is missing, say what to CONFIRM AT ONBOARDING instead of guessing.

════════ ENGINES IN SCOPE ════════
ChatGPT, Gemini, and Google AI Overview ONLY. NEVER mention Perplexity or Copilot.
Write ALL brand / product / engine names in the OUTPUT in lowercase (chatgpt, gemini, google ai overview, google business profile, bing places, trustpilot, xero, etc.) - this is our house style. Proper directory/body names keep their normal form (ICAEW, ACCA, Chartered Institute of Taxation, unbiased.co.uk).

Reference the SPECIFIC engines that did / didn't name the business, per-engine.

════════ OUR 8-WEEK SPRINT (map EVERY action to the right window) ════════
SEQUENCING PRINCIPLE (critical — get the ORDER right, not just the buckets):
Off-site trust signals — industry / authority directory submissions, citations, earned
mentions, and review velocity — take WEEKS-TO-MONTHS for AI engines to crawl, cross-check
across independent sources, and build entity confidence from. They are the SLOWEST to pay
off, so they must be INITIATED IN WEEK 1 and left to mature — START THE SLOW OFF-SITE WORK
FIRST. On-site work (schema, NAP, service / FAQ pages, front-loaded answers - plus area pages only where scope calls for them, see the National vs Local fork) lands
faster, so it runs IN PARALLEL and can complete slightly later. A plan that defers ALL
directory / earned-media work to Weeks 5-8 is WRONG: the slow-burn off-site items MUST
appear in Week 1, and Weeks 5-8 are for REINFORCING and CHASING what was started early —
never the first time off-site work appears.

- "Week 0" — Baseline. Already done (this audit). State plainly where they stand today
  (per-engine visibility, the competitors AI named instead, SEO grade if present).
- "Weeks 1-2" — DATA LAYER + KICK OFF THE SLOW OFF-SITE WORK (start now, it takes time to
  land): in WEEK 1, submit to the industry / authority directories for this vertical AND
  switch on review velocity at the RIGHT cadence for THIS business - high-frequency local trades ask after every job; B2B / long-cycle / national firms (accountancy, law, consultancy) ask at natural milestones (year-end, project sign-off, onboarding) and prioritise the review platforms that matter for the vertical (industry-specific review sites + Trustpilot for national B2B; Google reviews mainly for local walk-in). Never filter or gate reviews — these are slow-burn, so
  they LEAD the timeline. In PARALLEL: NAP consistency everywhere AI reads; Organization +
  (for local firms) LocalBusiness identity schema. Local-map listings (Google Business
  Profile + Bing Places + Apple Business Connect) LEAD here for LOCAL firms — but for
  NATIONAL firms they are only a light entity-verification step, not a lead action, and the
  Week-1 off-site kickoff is industry directories + earned media, NOT local maps (see the
  National vs Local fork below).
- "Weeks 2-4" — CONTENT LAYER (on-site, faster payoff): build the on-site pages that fit THIS business's businessScope (set in the National vs Local fork) - service pages always; add area / "near me" pages ONLY when businessScope is local (or the local side of hybrid); for national scope build SECTOR / AUDIENCE pages instead (e.g. "[service] for [sector] uk"), never area pages. FAQ pages that match real question phrasing (4-8 FAQs, 40-60 word answers); front-
  load a direct 40-60 word answer on key pages. CONTINUE the off-site work in parallel: more
  citations / earned mentions and additional "best of" / niche directory placements building
  on the submissions started in Week 1.
- "Week 4" — Mid-scan: re-check which prompts/engines have flipped; report progress.
- "Weeks 5-8" — REINFORCE & CHASE what was STARTED EARLY (do NOT begin off-site here): follow
  up on pending directory approvals / listings, add more citations / earned mentions, and
  close the specific competitor gaps vs the firms AI named. Iterate on whatever HASN'T flipped.
- "Week 8" — Final scan, before/after per engine, guarantee check.

════════ VERIFIED 2026 GEO METHODOLOGY (the moat — bake these in) ════════
- AI CITES, it doesn't rank. It recommends a business it can READ, VERIFY as a distinct
  entity across multiple independent sources, and TRUST.
- EARNED MEDIA beats owned: ~82% of AI citations are earned media; >80% of AI-cited pages
  don't rank in Google's top 10. The leverage is OFF-SITE — listings, directories, third-
  party mentions — not just their website.
- ENTITY / NAP consistency is foundational: presence on 4+ platforms ≈ 2.8× more likely to
  be cited; entity clarity + schema lifts small-brand appearances ~36%; schema improves LLM
  discoverability ~67% but is NOT sufficient alone.
- INDUSTRY-SPECIFIC AUTHORITY DIRECTORIES are a top lever. Identify the real ones for THIS
  vertical and prioritise tier-1 general → niche industry body → local. Examples:
  accountant → ICAEW, ACCA, Chartered Institute of Taxation, unbiased.co.uk; solicitor →
  Law Society "Find a Solicitor", SRA; dentist → GDC, BDA; plus Bing Places, Apple Business
  Connect, Yell for most UK local firms. Pick the ones that genuinely fit the business.
- FAQ SCHEMA + a front-loaded 40-60 word answer is the highest-leverage on-page add (can
  lift citations up to ~115% for lower-ranked domains).
- COMMUNITY: niche, buyer-intent forum/Reddit threads help AI Overview + ChatGPT (via Bing),
  but for commercial / high-intent queries, category-specific proof (specialist directories,
  niche reviews, vendor pages) beats broad Reddit. Recommend GENUINE niche participation,
  never spam.
- PROPRIETARY DATA / CASE STUDIES are citation magnets — use their real track record (years
  in business, client outcomes) as unique content nobody else has.
- FRESHNESS matters (a ~3-month citation cliff) — content is a living asset, not one-and-done.
- ENGINES DISAGREE and visibility is UNSTABLE: overlap between engines is low and 40-60% of
  cited sources change month to month. Frame visibility HONESTLY, per engine, and set a
  realistic re-audit window (~4-8 weeks; ChatGPT lags, Gemini / AI Overview move faster).

════════ WEBSITE FORK (critical) ════════
- If the business HAS NO website: produce NO on-site actions — no meta/H1/on-site schema,
  no page builds on their site. Focus entirely on Google Business Profile, listings /
  directories, reviews, community, and pages hosted on OUR infrastructure + the directory
  network. Say plainly that a site (or our hosted pages) is where owned content will live.
- If the business HAS a website: include BOTH on-site (schema, FAQ pages, front-loaded
  answers, service pages - area / location pages ONLY where businessScope makes them relevant, see the National vs Local fork) AND off-site (listings, directories, earned mentions).

════════ NATIONAL vs LOCAL FORK (critical — get the weighting right) ════════
FIRST set "businessScope" = "national" | "local" | "hybrid" for THIS business, using the System scope hint in the input as a strong default and overriding only with a clear reason stated in "summary". Apply the fork below from YOUR businessScope, and keep every action consistent with it.

First decide businessScope from ONE core test, reasoning from the specific business - do NOT just pattern-match the examples, which are illustrative only:
CORE TEST: do this business's customers physically travel to a premises to be served, or does it serve customers remotely / across a wide area with no walk-in footfall?
- NATIONAL / no walk-in premises: served remotely or country-wide, no location customers visit. Signals: location is a country/region ("UK", "England", "nationwide", "online", "remote"), or the model of the business is inherently non-local (clients served UK-wide, work delivered remotely / by post / online). Examples (illustrative, not exhaustive): chartered accountancy, law or consultancy firms serving clients UK-wide, online-only retailers, national SaaS/service providers. ABLM-type firms are NATIONAL.
- LOCAL: customers physically come to a premises, or the business travels to customers within one local area. Signals: a specific town/city AND walk-in or local-catchment trade. Examples (illustrative): barber, dentist, café, garage, restaurant, mobile trades serving one town.
- HYBRID: a genuine mix (e.g. a regional firm with a few offices that also serves clients remotely). Apply the national levers for the remote side AND the local levers for each real premises - do not force it fully into either bucket.
When unsure, decide on the CORE TEST (physical-visit vs not), state your reasoning briefly in "summary", and flag anything to confirm at onboarding.

If NATIONAL:
- DE-PRIORITISE local map listings. Google Business Profile, Bing Places and Apple Business
  Connect are ONLY a light one-off entity-verification step in the Data Layer — NEVER a lead
  action and NEVER in quickWins. Do NOT frame the plan around local / "map" / "near me" visibility.
- LEAD instead with industry & authority DIRECTORIES for the vertical, EARNED MEDIA (third-
  party mentions, niche reviews, PR, guest content), and content matched to NATIONAL
  buyer-intent queries ("[service] for [audience] uk"). quickWins for a national firm should
  be directory/earned-media/content moves, not GBP.
- NO location / area / "near me" pages - they chase local intent a UK-wide firm has no claim to. Build sector / audience / service pages instead.
If LOCAL:
- Keep the local-first weighting: GBP + Bing Places + Apple Business Connect LEAD (they are
  genuine quick wins), alongside local citations, reviews, and location/area pages.

════════ RANK EVERY ACTION BY LEVERAGE (for THIS business — this is the point) ════════
This plan is PRIORITISED ADVICE, not a flat checklist. Give EVERY internalAction a "priority"
of "high", "medium" or "low" based on its LEVERAGE FOR THIS SPECIFIC BUSINESS — how much it
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
- NATIONAL / no-premises firm (e.g. a UK-wide accountancy, law or consultancy firm):
    · HIGH: NAP consistency (foundational), Organization / professional identity schema,
      site-readability (render-without-JS, entity clarity), industry & authority DIRECTORIES
      for the vertical, earned media / citations, FAQ + front-loaded answers.
    · LOW: Google Business Profile — "set up once, don't over-invest"; Bing Places — "set up
      once, minimal effort". These verify the entity but won't drive citations for a firm with
      no walk-in trade.
    · SKIP (put in "deprioritised"): Apple Business Connect — it's a maps product for
      businesses customers physically visit; not relevant to a national no-premises firm.
- LOCAL business with premises (barber, dentist, café, garage, restaurant): FLIP IT — Google
  Business Profile + Bing Places + Apple Business Connect + local citations/reviews = HIGH
  (these are the main lever); broad national directories drop to lower priority.
Ground every ranking in the verified methodology above (what actually gets a business CITED),
not in habit.

════════ TAG EVERY ACTION BY LEAD TIME (short-term vs long-term levers) ════════
Give EVERY internalAction a "leadTime" = how long until it actually moves AI visibility:
- "fast" (days): on-site fixes - identity / Organization schema, meta / title / H1, site readability, FAQ + front-loaded answers, service / sector page builds; one-off GBP setup.
- "medium" (2-4 weeks): directory submissions that approve quickly, NAP propagation, first review requests landing.
- "slow" (weeks-to-months): authority / industry-body directory approvals, earned media / PR / guest content, cross-source entity trust building, review accumulation to a critical mass.
HARD RULE: every "slow" action that is "high" OR "medium" leverage MUST be scheduled in Weeks 1-2 (initiated immediately) - the payoff lands late, so the START must be early. A slow high/medium lever first appearing in Weeks 2-4 or 5-8 is WRONG. Weeks 5-8 may contain slow items ONLY as follow-up / chase on work started in Week 1, never as first appearance. Fast high-leverage items are the visible quick wins. In each week's clientSummary, reassure plainly (no jargon) that the slow-burn trust work is being started NOW precisely because it takes time to mature.

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
  summary AND the Weeks 5-8 competitor-gap actions, in BOTH internalActions and clientSummary.
- Tie actions to their real SEO findings / baseline signals when SEO data is present
  (e.g. "no LocalBusiness schema detected" → schema action). SYNTHESISE from the pasted SEO
  detail; NEVER reproduce chunks of it verbatim.
- Ground everything in their vertical / niche and location. If vertical or niche is unclear,
  infer from the name/type and flag it to confirm at onboarding.

════════ TWO REGISTERS (same plan, two audiences) ════════
- internalActions = what WE do. Specific, technical, our language (schema types, directory
  names, tooling, dependencies). This is our execution checklist.
- clientSummary (one per week) = plain, reassuring, jargon-free, safe to show the client.
  No internal cost/tooling talk. NEVER over-promise. Consistent with an honest, per-engine
  guarantee: the promise is "named in MORE answers at week 8 than on day 0", not "#1" or
  "guaranteed top result".
- pillar (per action) = the layer it belongs to, one of: "Data Layer", "Content Layer",
  "Off-site / Earned", "Reviews", "Community", "Measurement".
- priority (per action) = "high" | "medium" | "low" leverage FOR THIS BUSINESS (see the ranking
  section above). Required on every action.

Return the whole plan via return_playbook. Include a "Week 0" baseline week, then the Sprint
windows that apply. Rank every action's priority. quickWins = 3-6 highest-leverage first moves.
directories = the real, named authority directories/platforms for THIS vertical with a one-line
why each. deprioritised = what to do lightly or skip for this business (empty only if nothing
applies). timelineNote = the honest re-audit/instability framing. guaranteeNote = the honest
week-8 before/after promise.`;

const PLAYBOOK_TOOL = {
  type: "function",
  function: {
    name: "return_playbook",
    description: "Return the tailored 8-week Sprint playbook (internal + client views) for this business.",
    parameters: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        vertical: { type: "string", description: "The business's vertical/niche, e.g. 'accountancy firm'." },
        businessScope: { type: "string", enum: ["national", "local", "hybrid"], description: "Your determination for THIS business, applied to the national/local fork." },
        summary: { type: "string", description: "2-4 sentence where-they-stand-and-what-we'll-do overview, grounded in the audit." },
        weeks: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              window: { type: "string", enum: ["Week 0", "Weeks 1-2", "Weeks 2-4", "Week 4", "Weeks 5-8", "Week 8"] },
              goal: { type: "string" },
              internalActions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    why: { type: "string", description: "Why it matters for THIS business. For LOW priority, say plainly it's low-value here + what to do (do lightly / set up once / skip)." },
                    pillar: { type: "string", enum: ["Data Layer", "Content Layer", "Off-site / Earned", "Reviews", "Community", "Measurement"] },
                    priority: { type: "string", enum: ["high", "medium", "low"], description: "LEVERAGE for THIS specific business (not generic importance). Rank honestly — do NOT make everything high." },
                    leadTime: { type: "string", enum: ["fast", "medium", "slow"], description: "How long until this action actually moves AI visibility: fast=days, medium=2-4wks, slow=weeks-to-months." },
                    dependsOn: { type: "string" },
                  },
                  required: ["action", "why", "pillar", "priority", "leadTime"],
                  additionalProperties: false,
                },
              },
              clientSummary: { type: "string" },
            },
            required: ["window", "goal", "internalActions", "clientSummary"],
            additionalProperties: false,
          },
        },
        quickWins: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        directories: {
          type: "array",
          minItems: 1,
          maxItems: 12,
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
      required: ["businessName", "vertical", "businessScope", "summary", "weeks", "quickWins", "directories", "timelineNote", "guaranteeNote"],
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
  On-Page: ${str(c?.onPage?.grade)} (${c?.onPage?.score}) | Local/Entity Presence: ${str(c?.localPresence?.grade)} (${c?.localPresence?.score}) | Content & Technical: ${str(c?.contentTechnical?.grade)} (${c?.contentTechnical?.score})
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
  Type / vertical: ${type}${specialism ? `\n  Specialism / niche: ${specialism}` : ""}
  Location: ${loc}${country ? `\n  Country: ${country}` : ""}
  Website: ${hasWebsite ? str(audit.website) : "NO WEBSITE — apply the no-website fork (off-site only + our hosted pages)"}\n  ${scopeHint}

AI-VISIBILITY AUDIT (Week 0 baseline)
${engineLines}
  Competitor-name CANDIDATES scraped from AI answers (UNVERIFIED — judge each; use only real firms, else "other firms"): ${compLine}
  Questions tested:
${questionList || "  (none)"}

WEBSITE SEO
${seoBlock}

Build the tailored 8-week Sprint playbook for THIS business via return_playbook. Map every
action to a Sprint window, use the real data above, apply the correct website fork, and write
both internalActions (our execution language) and a client-safe clientSummary per week.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
      .from("ai_audits").select("business_name, business_type, location_text, country, has_website, website, business_scope, specialism").eq("id", run.audit_id).maybeSingle();
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

    const validated = buildValidatedPlaybook(parsed, str(audit.business_name), isNationalBusiness(audit), explicitScope(audit));
    if (!validated.ok) return json({ ok: false, error: `invalid_playbook:${validated.error}` }, 422);

    // Store at results.playbook. Read-modify-write MERGE (re-read immediately before write)
    // so the playbook merges with summary/questions/seo rather than clobbering them.
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, playbook: validated.playbook } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, playbook: validated.playbook });
  } catch (e) {
    console.error("[generate-playbook] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
