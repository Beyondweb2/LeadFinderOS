import { hookReportCopy, type HookReportSummary } from './hookAudit.ts';
// Client-facing AI Visibility Audit report — shared data shape + a standalone,
// self-contained, PRINT-READY one-page HTML document for download (Findable-branded,
// inline styles, no dependencies). Deliberately client-friendly: no engine keys, no
// JSON, no vendor scores.
//
// renderReportHtml(data) is a PURE function of AiAuditReportData — it's the single
// source of the report design, used by the download AND the in-app preview (rendered
// in an iframe). A future PUBLIC shareable link only has to serve this same function
// with the same data (pass `shareUrl` to surface a "view online" footer) — no rewrite.
//
// Narrative flow is pain → solution → proof: hero verdict, a plain-English summary of
// the worst answer (NOT the raw AI paragraph), why it matters, then WHAT WE DO to fix
// it, then the per-engine proof + CTA.

/* RELATIVE paths with explicit .ts extensions, NOT the "@/" alias: this file is bundled into
   render-audit-report and apply-seo-paste, and Deno cannot resolve the Vite alias. Both are
   dependency-free constant files, so nothing heavy joins those bundles. */
import { FINDABLE_CONTACT_EMAIL, FINDABLE_CONTACT_WHATSAPP, FINDABLE_GUARANTEE, REMEASURE_CLAIM_SENTENCE } from './findableOffer.ts';
import type { CrawlFault } from './crawlCheck.ts';

export interface ReportEngineRow {
  label: string;   // "ChatGPT", "Gemini", "AI Overview", "Google"
  named: number;   // how many tested questions named the business on this engine
  total: number;   // questions tested on this engine
}

/* ── Website SEO section (results.seo) ─────────────────────────────────────────
 * Populated manually for now (not yet from an actor). Renders a self-contained SVG
 * block: overall grade + three category grades + a radar of the three scores + the
 * lead findings. Grades are "A+".."F-" strings; scores 0–100. */
export interface SeoCategoryGrade {
  grade: string;   // "A+".."F-"
  score: number;   // 0–100
}
export interface SeoFinding {
  title: string;
  detail: string;
  severity: "high" | "med" | "low";
}
export interface AiAuditSeo {
  overallGrade: string;                 // "A+".."F-"
  categories: {
    onPage: SeoCategoryGrade;
    contentTechnical: SeoCategoryGrade;
  };
  leadFindings: SeoFinding[];
  // Stored before/after data — NEVER rendered to the client (grades/radar/findings only).
  baseline?: Record<string, unknown>;
}

export interface AiAuditReportData {
  businessName: string;
  businessType: string;          // for copy; may be ""
  locationText?: string;         // for copy; may be "" or absent on older payloads
  named: number;                 // AI answers that named the business
  total: number;                 // AI answers tested
  /* How the total is made up, so the headline can SHOW ITS WORKING rather than assert a number.
     Paul's call: "3 ways across 2 AI engines, 6 answers in total" is unarguable and sits right
     beside the 6, where "several ways of asking" was technically true but vaguer than the evidence.
     Optional so an older stored payload still renders — absent means the line is simply omitted,
     never a sentence with a hole in it. */
  questionsAsked?: number;
  enginesUsed?: number;
  pct: number;                   // 0–100
  perEngine: ReportEngineRow[];
  competitors: string[];         // real brands AI named instead (aggregate)
  /* The audit-wide leaders WITH their grouped mention counts, most-named first. Optional so a
     caller built before this existed still renders — absent means the document simply omits the
     line rather than inventing one. */
  topCompetitors?: { name: string; count: number }[];
  /** Total grouped competitor mentions across the audit, for the denominator. */
  competitorMentions?: number;
  // The single worst example to lead with: the question, the engine, and the REAL
  // competitors AI recommended in that answer. The report writes a clean summary of
  // this — it never dumps the raw AI paragraph.
  /* answer/businesses are OPTIONAL so a payload built before the search-result card existed still
     typechecks (a caller that omits them simply gets no card). buildReportData always sets them. */
  gutPunch: { question: string; engineLabel: string; rivals: string[]; answer?: string; businesses?: string[] } | null;
  /** True when competitor names are withheld because the run's list could not be trusted.
   *  Absent on older payloads -> false, which is exactly what those documents already showed. */
  namesWithheld?: boolean;
  /** 🔴 True when the business's own name is nothing but its trade and its town, so the automated
   *  match cannot tell a mention of THEM from a mention of the search. The hero is replaced by a
   *  refusal — not annotated, replaced — and no named figure appears anywhere in the document.
   *  Derived in buildReportData (§27); absent on an older payload means the old behaviour. */
  nameNotJudgeable?: boolean;
  /* The full question-by-question detail. Each completed question, whether AI named the business
     (on any scored engine), and the real rival firms it named in that answer. Optional so a payload
     built before this existed still renders — absent means the detail pages are simply omitted,
     never a half-built section.
     🔴 IT IS NO LONGER CLIENT-FACING (2026-09-12, Paul). It used to be "page 2" on every prospect
     report and read as clutter at the moment the document is asking for the sale — a 12-question
     baseline ran to four extra sheets. The DATA is still built and still carried on the payload;
     only the RENDER is now gated on `internal`, because the operator's per-question winnability
     signal (winBlock) lives inside these cards and is the only winnability view in the product.
     ⚠️ SO A PROSPECT NO LONGER SEES WHICH SOURCES THE ENGINES READ. These cards were the only
     place the report showed citations; page 1 has none. Stated and accepted — see the note above
     `questionDetail`. */
  questionBreakdown?: {
    question: string; namedYou: boolean; namedCount?: number; answers?: number;
    rivals: string[]; citations?: { domain: string; url: string }[];
    /* Per-engine detail — ChatGPT / Gemini / AI Overview told apart, aggregated ACROSS runs.
       ranCount = how many runs the engine answered in; named = how many of those it named you in
       (a count now; older payloads carried a boolean, handled in the renderer). ran=false → the
       engine never returned an answer. */
    perEngine?: { label: string; ran: boolean; ranCount?: number; runs?: number; named: number | boolean; recommended?: number; cited?: number; rivals: string[]; rivalsRaw?: number; citations: { domain: string; url: string }[] }[];
    /* INTERNAL winnability signal (rendered only when `internal` is true — never on the client doc).
       Structural match for QuestionWinnability in auditReport.ts (kept inline to avoid a circular
       type import between this file and auditReport.ts). */
    winnability?: { label: 'named' | 'wide_open' | 'locked' | 'informational' | 'unclear'; reason: string; distinctFirms: number; topFirmCells: number; totalCells: number; sourceMix: { authority: number; business: number; other: number; total: number } };
  }[];
  /** How many times each question was asked (per engine) — the "× N asks each" in the working-out. */
  measurementRuns?: number;
  /** ⛔ INTERNAL VIEW ONLY. When true the report renders the winnability signal per question. The
   *  client-facing route (render-audit-report) NEVER sets it, so winnability can never leak to a
   *  customer (CLAUDE.md bans winnability in customer-facing docs). Only the in-app operator preview
   *  sets internal:true. */
  internal?: boolean;
  generatedAtLabel: string;      // e.g. "11 Jul 2026"
  shareUrl?: string;             // reserved: future public link (not built yet)
  seo?: AiAuditSeo;              // optional website-SEO section; slot renders only when present
  /** False when the business has no website at all. The SEO slot then shows what we will BUILD
   *  them instead of rendering nothing: a site is part of the setup, and silence sells nothing. */
  /** THREE STATES (2026-09-13): true = has a site (the "full check comes with the work" slot);
   *  false = Google was consulted and there is none (the "we'll build you one" slot); null/absent =
   *  unknown, and the report says NOTHING about their website. False is asserted, never inferred
   *  from a blank column — the blank is what told AD Locksmithing they had no site when they do. */
  hasWebsite?: boolean | null;
  /** STILL MEASURING (2026-09-13). Set by the caller when a run is genuinely in flight
   *  (src/lib/measuringState.ts). The renderer then WITHHOLDS every figure — hero, "who AI named",
   *  the website slot, the fix section that branches on the count — and shows a banner saying how
   *  many runs are done, because a number that will change must not appear at all. */
  measuring?: { runsDone: number; runsTarget: number } | null;
  /* ADAPTIVE HOOK (2026-09-20). Set only for a quick/hook audit that stopped on a visibility gap or
   *  on its question ceiling. The renderer then replaces the counted hero ("N times out of M
   *  answers") with the gap itself — the exact question, the engine, who it named instead — because
   *  a one-to-three-question snapshot must never read as a statistic. Everything else renders as
   *  before. Built by src/lib/hookAudit.ts; the copy is hookReportCopy, tested directly. */
  hook?: HookReportSummary | null;
  /* ⛔ HOW THE WEBSITE SLOT IS PRESENTED. 'graded' (the DEFAULT) is the original: grade circles,
     /100 scores and a lead sentence naming the grade. 'issues' drops all of that and prints the
     findings alone under a plain heading.

     WHY, Paul's call 2026-09-01: a letter grade is REASSURING, and a business that AI never names
     reading "your overall SEO grade is B" is being told the wrong thing about the wrong problem —
     the grade measures how the pages are built, not whether an engine mentions them. Before a
     client has paid, that misdirection costs the sale it is meant to win.

     ⛔ THE DEFAULT IS 'graded' ON PURPOSE. Every caller that does not set this keeps today's
     output byte-for-byte, so the PAID BASELINE — the only place the grade is still wanted — is
     untouched by construction rather than by a filter someone has to remember. Only callers that
     KNOW they are not a paid baseline opt into 'issues'. */
  seoStyle?: 'graded' | 'issues';
  /** Render the founder offer at the bottom. DEFAULTS TO FALSE — a renderer that shows a price
   *  unless told not to is the wrong default, because the callers that forget are the in-app preview
   *  and the download, and a client must never open their own report to a cheaper offer.
   *  Decided by showOffer() in buyOffer.ts; render-audit-report (the route a prospect
   *  actually opens) is what passes it. */
  showOffer?: boolean;
  /**
   * Drop the three SELLING sections — "Why this matters" (the 45% stat), the three-step "why you're
   * named so rarely", and the "Ready to get started" CTA — leaving the measurement itself intact.
   *
   * ⛔ FOR THE WELCOME PACK, AND ONLY THE CLIENT RENDER PATH. The pack goes to someone who has
   * ALREADY paid: pitching them their own product back, with a "Ready to get started?" button and an
   * Email-us CTA, reads as a company that does not know who it is writing to. The numbers and the
   * per-question detail are exactly what they should keep.
   * ⚠️ DEFAULTS TO FALSE, so every existing caller — the prospect-facing render-audit-report route,
   * the in-app preview, the standalone download — is byte-identical to before. The edge function is
   * deliberately NOT changed; nothing server-side sets this.
   */
  hidePitch?: boolean;
  /**
   * Where the offer button goes: this reader's own onboarding link, carrying their lead.
   *
   * ⛔ PASSED IN, NEVER BUILT HERE. It needs the lead id and the configured site origin (Deno env),
   * and this module is imported by the SPA as well as by edge functions, so it must stay pure —
   * the same reason `shareUrl` arrives this way.
   * ⛔ ABSENT MEANS NO BUTTON, AND THAT IS A PRICE GUARD, NOT A COSMETIC ONE. offerPriceForLead
   * returns the FULL £99 when there is no lead, so a button rendered without one would advertise
   * £19.99 and charge £99. Undefined/null/blank all render the offer text with no button — the
   * Email us / WhatsApp us buttons above are still a route.
   */
  offerUrl?: string | null;
  /** "What's stopping AI reading your site" — one line per real crawl-check fault, each carrying its
   *  own number. Built from the lead's STORED crawl-check by render-audit-report (buildFaultLines).
   *  Absent/empty, or a site that couldn't be fetched → the section does not render (Paul, 2026-09-16). */
  crawlFaults?: CrawlFault[];
  /** The audit id, so the "Request a call" form can POST it (recipient + phone are derived
   *  server-side from it — the prospect sends nothing but this id). Absent → no call button. */
  auditId?: string;
  /** The origin the "Request a call" form POSTs to (…/functions/v1/request-call). Absent → no call
   *  button. Passed in like offerUrl: this module is pure, the caller knows the site origin. */
  requestCallUrl?: string;
  /* NO PER-TERM WINNABILITY HERE, DELIBERATELY.
     This is the CUSTOMER report's data contract, and a "winnable" verdict is not something we can
     evidence. Measured over all 402 stored answered questions: 77.6% came back "open" (winnable)
     and 0% ever came back "locked", because the rule fires on `U >= 6` distinct firms named and
     the mean U is 15.3 - so it reads breadth as opportunity, which is backwards. It is also
     noise-driven: 12 of 67 repeated questions (17.9%) changed verdict between identical runs with
     no work done, because U straddles the threshold of 6.
     The field is gone from this type so the renderer cannot show it even by accident. The
     classification still exists (classifyWinnability) and the SPA shows it to the OPERATOR, clearly
     labelled unreliable, so the logic can be worked on. Fixing that logic - multi-run stability,
     inverted thresholds, citation-source analysis - is separate, scoped work. */
}

/* ⛔ "1 times ... showed up in AI search" was on a live report. Every count in this document is
   interpolated, so every one of them needs its noun agreeing — there is no template engine doing it.
   Kept as one helper so a new count cannot quietly reintroduce the fault. */
function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/* ⛔ "looking for a accountant". The trade word comes from the lead, so the article cannot be
   hardcoded. Vowel-initial is the rule that covers accountant/electrician/optician; the exceptions
   English has (a university, an hour) do not occur in trade nouns, and inventing a list for them
   would be more likely to introduce a bug than fix one. */
function article(word: string): "a" | "an" {
  return /^[aeiou]/i.test(String(word ?? "").trim()) ? "an" : "a";
}

/* ⛔ THE DESIGN COMMENTARY IN THIS FILE MUST NEVER REACH A PROSPECT. Every <!-- --> written inside
   the template literals below is served verbatim in the report, and 16 of them were: the rationale
   for the offer block's bullet count ("more than anyone reads at the moment they are deciding to
   pay"), and — added while fixing this document's own faults — sentences narrating those faults
   back, e.g. "on a report whose own verdict, two sections above, said the business was named once".

   This is a document a sceptical accountant is invited to check. Someone who opens view-source and
   finds us discussing how much copy a buyer will tolerate, or listing our own contradictions, has
   found something far worse than the contradictions themselves.

   ⚠️ STRIPPED AT THE BOUNDARY, NOT DELETED FROM THE SOURCE. The comments are worth keeping — they
   are why the copy is the way it is. Removing them at the point of render is the only version that
   also catches the next one somebody writes.
   ⚠️ Runs on the WHOLE document AFTER assembly, including any comment inside a nested helper's
   output, and cannot touch conditional comments because this document has none. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Small numbers as words, so "once in six" reads like a sentence rather than a statistic. */
function inWords(n: number): string {
  return ["zero", "once", "twice", "three times", "four times", "five times", "six times"][n] ?? `${n} times`;
}

/* ══ THE HERO VERDICT ═══════════════════════════════════════════════════════════════════════════
   ⛔ EVERY LINE MUST SURVIVE THE PROSPECT CHECKING IT. This is the first sentence on the artefact
   that sells, and it is the easiest thing in the document to disprove — they can open ChatGPT and
   look. Four faults were found at the EDGES of the old bands, all the same shape: a line that is
   true in the middle of its range and an overclaim at one end.

     1 of 6 read "AI sends your customers straight to your competitors."  A business AI DOES mention
     was being told it is absent. 1/6 is 17%, so it shared a band with 0.  → the `rare` band below.

     0 of 6 read "AI doesn’t know you exist."  That is a claim about what AI KNOWS, which we never
     measured — we measured what it ANSWERED to three questions. Ask it "have you heard of X?" and
     it may well say yes, and then the report is wrong.  → now states the measurement.

     The mid band asserted "your competitors get the rest" and the rare band would have said
     "your competitors are in nearly all of them" — unmeasured whenever the audit found no rival
     names at all.  → both halves are conditional on hasRivals.

     100% read "AI names you in most answers — let’s make it every time."  At 6 of 6 it already IS
     every time, so the line asks them to fix something that is not broken.  → its own line.

   ⚠️ THE NUMBERS ARE PASSED IN, NOT JUST THE PERCENTAGE. "once in six answers" is checkable and
   unarguable; "17%" is neither, and a percentage of six is false precision anyway. */
/* ⛔ THE FRONT-PAGE VERDICT IS BANDED ON THE NAMED RATE (Paul's wording, 2026-08-29). It used to
   assert "Your competitors are in nearly all of them" at any rate under a third — a fixed claim the
   measurement does not support once a client is genuinely being named somewhere, which is exactly
   ABLM's position (22 of 120 = 18%, named well on the towns that have pages).
   ⚠️ BOUNDARIES ARE INCLUSIVE AT THE TOP and read off the percentage, so 15% is "rarely", 16% is
   "not yet consistently", and there is no gap a rate can fall through: the final band is the
   fallthrough, not a fourth test. `questionsAsked` is the number of DISTINCT questions, which is
   what "ways customers ask" means — not the answer count. */
export function verdictBand(named: number, total: number): { band: "crit" | "low" | "mid" | "high"; key: 'rare' | 'inconsistent' | 'many' | 'default' } {
  const pct = total > 0 ? (named / total) * 100 : 0;
  if (pct <= 15) return { band: "crit", key: 'rare' };
  if (pct <= 40) return { band: "low", key: 'inconsistent' };
  if (pct <= 70) return { band: "mid", key: 'many' };
  return { band: "high", key: 'default' };
}

/* ⚠️ `hasRivals` WAS REMOVED, NOT LEFT UNUSED. The old bands hedged their competitor clauses on it;
   the new wording never mentions competitors, so the parameter had no reader. The gut-punch block
   below still gates its own competitor line on the same fact, so nothing about that claim changed. */
function heroVerdict(
  named: number,
  total: number,
  questionsAsked: number,
): { band: "crit" | "low" | "mid" | "high"; punch: string; sub: string } {
  const { band, key } = verdictBand(named, total);
  const N = questionsAsked > 0 ? questionsAsked : total;
  /* ⚠️ HEADLINE AND SUB ARE PAUL'S EXACT WORDING (2026-08-29). [X] [Y] [N] are the real figures —
     X = answers naming the client, Y = counted answers, N = distinct questions asked. Do not
     paraphrase these; they were written to be read by a client. */
  if (key === 'rare') {
    return {
      band,
      punch: `AI rarely names you yet.`,
      sub: `Across ${N} way${N === 1 ? "" : "s"} customers ask, you were named in ${named} of ${total} answers. This is the starting point, and it is fixable.`,
    };
  }
  if (key === 'inconsistent') {
    return {
      band,
      punch: `You&rsquo;re being named, but not yet consistently.`,
      sub: `You were named in ${named} of ${total} answers. Where we have built pages you show up well; where we have not, you are still invisible. That gap is the opportunity.`,
    };
  }
  if (key === 'many') {
    return {
      band,
      punch: `You&rsquo;re being named across many of the questions that matter.`,
      sub: `You were named in ${named} of ${total} answers, ahead of most local competitors. The job now is to hold these and win the rest.`,
    };
  }
  return {
    band,
    punch: `You&rsquo;re one of the names AI reaches for.`,
    sub: `You were named in ${named} of ${total} answers. You are already a default recommendation across most of these questions.`,
  };
}

/** De-duplicate competitor names (case-insensitive), preserving first-seen order. */
function dedupeNames(names: string[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const n = (raw || "").trim();
    if (n && !out.some((u) => u.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

/* ── SEO section rendering (pure SVG + CSS; no chart lib) ──────────────────────── */

/** Grade → colour band. A/B green, C amber, D and below red (uses the report's tokens). */
function gradeColour(grade: string): string {
  const L = (grade || "").trim().charAt(0).toUpperCase();
  if (L === "A" || L === "B") return "var(--green)";
  if (L === "C") return "var(--amber)";
  return "var(--red)"; // D, E, F, or anything unexpected
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** A grade "circle": a ring (coloured arc = score, or full ring when no score) with the
 *  letter grade in the middle, and a caption below. Pure SVG so it survives print/PDF. */
function gradeCircle(grade: string, score: number | null, size: number, label: string, showScore = false): string {
  const colour = gradeColour(grade);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const frac = score == null ? 1 : clamp100(score) / 100;
  const dash = `${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`;
  const g = (grade || "").trim();
  const fontSize = g.length > 1 ? 32 : 40; // "A+" vs "C"
  // Surface the numeric score under sub-grades (data already present) — more useful detail.
  const scoreCap = showScore && score != null ? `<div class="gc-score">${clamp100(score)}/100</div>` : "";
  return `
        <figure class="gc">
          <svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(label)}: grade ${esc(g)}${score != null ? `, score ${clamp100(score)} of 100` : ""}">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--line-strong)" stroke-width="8" />
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="${colour}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${dash}" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="900" fill="${colour}">${esc(g)}</text>
          </svg>
          <figcaption class="gc-lbl">${esc(label)}</figcaption>${scoreCap}
        </figure>`;
}

/* ── Report contact details ──────────────────────────────────────────────────────
   The report is Findable-branded, so these should be Findable addresses. They are NOT yet,
   deliberately: findable.uk does not resolve and returns no MX record (checked 2026-07-26), and
   it appears in this repo only as an example inside a comment. Pointing report replies at a
   mailbox that does not exist would lose live leads silently — the same class of failure as a
   dropped payment, just cheaper to miss.

   So: hoisted out of the markup into one obvious place, still working, ready to switch in one
   line the moment a Findable inbox exists. The buttons are labelled "Email us"/"WhatsApp us",
   so neither value is DISPLAYED to the prospect; it is visible only in the link target.
   TODO(paul): set REPORT_CONTACT_EMAIL to the Findable inbox once findable.uk has mail. */
/* ⛔ THE CONTACT EMAIL IS NOT DEFINED HERE ANY MORE either. It was a second, unlocked copy of the
   site's CONTACT_EMAIL, and until 2026-09-13 it built a mailto: that this file rendered NOWHERE —
   a dead constant that read as live, the same trap as the guarantee that sat imported and
   unrendered for ten days. It is now FINDABLE_CONTACT_EMAIL, locked cross-repo, and RENDERED. */
/* ⛔ THE CONTACT NUMBER IS NOT DEFINED HERE ANY MORE. It was 447347041545, the Business API line,
   so "WhatsApp me" reached the automated sender rather than a person. It now comes from
   FINDABLE_CONTACT_WHATSAPP, byte-locked to findable.live's own founder number. */
/** Somewhere to go and check we are real. A prospect who reads the whole report and wants to know
 *  who wrote it had nowhere to click: two contact buttons, both of which mean starting a
 *  conversation. This is the third option, and the only one that costs them nothing.
 *  Labelled, never a bare URL — "https://findable.live" in a document reads as a footnote, "Who we
 *  are" reads as an invitation. */
const REPORT_SITE_URL = "https://findable.live";

/** WHERE "See how it works" GOES — the explainer video, by anchor, not the bare home page.
 *
 *  🔴 IT POINTED AT THE BARE ORIGIN UNTIL 2026-09-12, AND THAT IS HOW THE VIDEO CAME TO EXIST AT
 *  ALL. The button promised an explainer while findable.live had no <video> element on it; the
 *  video was added that day and landed SIXTH on the page, so a prospect pressing this still got
 *  the top of the home page and five sections of scrolling to find the thing the button named.
 *  The section then moved to slot 3 and this became an anchor: it is a jump to the thing, not a
 *  jump to a page that contains the thing.
 *
 *  ⛔ THE ANCHOR IS SAFE BECAUSE THE TARGET IS A RULE, NOT A LIST. findable-site's global.css
 *  applies scroll-margin-top to `section[id]` for every id, so #video clears the fixed nav the way
 *  every other jump target does — it needed no per-id CSS when it was created and needs none now.
 *  ⚠️ IF THE SECTION IS EVER REMOVED OR RENAMED, THIS LINK DEGRADES QUIETLY: a browser given an
 *  unknown fragment loads the page and stays at the top, which is exactly where this button used
 *  to land. It fails back to the old behaviour rather than to an error — worth knowing, because it
 *  also means nothing here will TELL you the anchor has gone. findable-site's Explainer header
 *  carries the matching warning. */
const REPORT_EXPLAINER_URL = `${REPORT_SITE_URL}/#video`;
/* The explainer file and its poster, served from findable-site's public/media (the same files the
   site's #video section and the WhatsApp video header use). The report page itself is served from
   findable.live/report/, so these are same-origin there and plain cross-origin media in the in-app
   preview — both fine for <video> and <img>. If either file moves, the site's Explainer.astro and
   whatsapp-send.ts's VIDEO_TEMPLATE_HEADER_URL move with it. */
const REPORT_EXPLAINER_VIDEO_URL = `${REPORT_SITE_URL}/media/findable-hook.mp4`;
const REPORT_EXPLAINER_POSTER_URL = `${REPORT_SITE_URL}/media/findable-hook-poster.jpg`;

const SEV_COLOUR: Record<SeoFinding["severity"], string> = { high: "var(--red)", med: "var(--amber)", low: "var(--muted)" };

/** No website at all: say what we will build, in the SEO slot's place. Distinct from a FAILED
 *  scan (has a website, grade unavailable) which still renders nothing rather than pretending. */
/* HAS A WEBSITE, NOT SCANNED YET — the email lane's audits skip the SEO scan up-front (Paul,
   2026-08-17: audit_and_push forces skip_seo; the scan runs on engagement instead). This section
   used to be an EMPTY STRING, which read as the report simply lacking a website opinion. One
   honest line instead: absence stated as sequencing, never as a gap. Reports render live from
   stored results, so the moment a scan runs this branch is replaced by the graded panel on the
   link the prospect already has. */
function siteCheckPendingSection(): string {
  return `
    <!-- WEBSITE NOT SCANNED YET &mdash; the check comes when we start work -->
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">Your site&rsquo;s full check comes when we start work.</div>
      <p style="margin:0;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">
        This report measures whether AI names you today. When we start work we also run a full
        technical check of your site &mdash; how well its pages are built for search engines and AI
        to read &mdash; and fix what it finds as part of the setup.
      </p>
    </section>`;
}

/* 🔴 "nothing extra to pay" CAME OUT 2026-09-14, AND IT WAS THE ONLY SENTENCE IN THIS DOCUMENT
   THAT DESCRIBED THE PRICE. The report names no figure anywhere else by design, so this line was
   carrying the whole offer on its own — and it said the £99 was the end of it, on a product that
   is £99 to start and £29.99 a month, with hosting on top for exactly the customer who sees this
   panel (no website, so we build and host one). "Building it is included in your £99" says the
   true thing the panel exists to say and claims nothing about what else is owed. */
function noWebsiteSection(): string {
  return `
    <!-- NO WEBSITE &mdash; what we will build, where the SEO grade would be -->
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">You don&rsquo;t have a website yet, so we&rsquo;ll build you one.</div>
      <p style="margin:0;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">
        AI can&rsquo;t recommend a business it can&rsquo;t read, and right now there&rsquo;s nothing for it to read.
        We&rsquo;ll build you a simple site that&rsquo;s set up properly for AI from the start: your services,
        your area, your credentials, all written the way AI quotes them. Building it is included in
        your &pound;99.
      </p>
    </section>`;
}

/* ══ THE FOUNDER OFFER ═════════════════════════════════════════════════════════════════════════
   The ask, not another pitch. The report has already made the argument; this is four sentences, what
   they get, the guarantee and one button.

   THREE RULES THIS SECTION MUST KEEP:
   · NO OUTCOME PROMISE. "so you see the before and after side by side" promises they will SEE the
     comparison, never that it will be favourable — the same work-based framing as the guarantee.
   · THE GUARANTEE IS FINDABLE_GUARANTEE, VERBATIM. Not paraphrased, not shortened. The price above it
     is temporary and the guarantee must not drift when the price changes.
   · NO BUTTON WITHOUT A REAL LINK. An absent offerUrl renders no button at all rather than a
     dead or placeholder one; the Email us / WhatsApp us buttons in the CTA above are still a route,
     which is why omitting it leaves the report perfectly usable.
     ⛔ AND HERE THAT RULE IS ALSO THE PRICE GUARD. The link carries the lead, and offerPriceForLead
     charges the FULL £99 when there is no lead — so a button built without one would say £19.99 and
     charge £99. No lead, no link, no button.
   Visual language is the existing .cta band — navy ground, yellow accent, the .cta-btn shape. No new
   colours and no new components. */
/* ⛔ THE OFFER PITCH BLOCK IS DELETED (2026-09-03). It was unrendered on 2026-09-02 and its four
   constants ("the first 10 at £49.99", "normally £99") described a tier that no longer exists -
   there is one flat price now. Keeping a function that cannot compile against the current
   constants would have been worse than deleting it; git holds the copy. The buy CTA lives in the
   .cta section below and gets its price, when it needs one, from offerPrice().*/

/** Build the whole SEO section, or "" when there's no seo data (slot renders nothing). */
function seoSection(seo: AiAuditSeo | undefined): string {
  if (!seo) return "";
  const { overallGrade, categories: c, leadFindings } = seo;
  const overallColour = gradeColour(overallGrade);
  const findings = (leadFindings ?? []).map((f) => `
          <li class="find">
            <span class="find-dot" style="background:${SEV_COLOUR[f.severity] ?? "var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${esc(f.title)}</b> <span class="find-detail">${esc(f.detail)}</span></span>
          </li>`).join("");
  return `
    <!-- WEBSITE SEO &mdash; grade circles + tight findings (radar dropped); renders only when seo present -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">How findable is your website?</div>
      <!-- ⛔ THE LEAD FOLLOWS THE GRADE. It used to say "Here's what's holding it back" at EVERY
           grade, so an A was announced and then immediately contradicted: a good result presented as
           a problem. To a sceptical accountant that reads as manufacturing an issue to sell against,
           which is the one thing that would undo the honest-measurement argument.
           A/B: the site is in good shape, these are the remaining small things.
           C and below: the original wording, which is accurate there. -->
      <p class="seo-intro">Your site&rsquo;s overall SEO grade is <b style="color:${overallColour}">${esc(overallGrade)}</b>. This scores how well your pages are built for search engines and AI to read - the on-page and technical foundations. ${
        /^[AB]/i.test(overallGrade.trim())
          ? "That is a good result: the foundations are sound. These are the small things still worth tidying."
          : "Here&rsquo;s what&rsquo;s holding it back."
      }</p>

      <div class="seo-body">
        <div class="seo-grades">
          <div class="seo-overall">${gradeCircle(overallGrade, null, 124, "Overall")}</div>
          <div class="seo-grade-split" aria-hidden="true"></div>
          <div class="seo-cats">
            ${gradeCircle(c.onPage.grade, c.onPage.score, 60, "On-Page SEO", true)}
            ${gradeCircle(c.contentTechnical.grade, c.contentTechnical.score, 60, "Content & Technical", true)}
          </div>
        </div>
        ${findings ? `<ul class="seo-findings">${findings}
        </ul>` : ""}
      </div>
    </section>`;
}

/** THE PRE-PAYMENT VERSION: the findings, and nothing that grades them.
 *
 *  ⛔ NO GRADE LANGUAGE ABOVE THE LIST. seoSection's lead sentence names the letter grade and then
 *  branches on it ("that is a good result" / "here's what's holding it back") — carrying any of that
 *  over would reintroduce exactly the reassurance this version exists to remove. The heading states
 *  the offer instead: these are things we can fix.
 *
 *  ⚠️ AN EMPTY LIST STILL RENDERS A LINE, never a bare heading over nothing. It is deliberately not
 *  reassuring: it says the sample was small and points back at the AI result, which is the finding
 *  that actually matters. Wording is Paul's, verbatim. */
function seoIssuesSection(seo: AiAuditSeo | undefined): string {
  if (!seo) return "";
  const findings = (seo.leadFindings ?? []).map((f) => `
          <li class="find">
            <span class="find-dot" style="background:${SEV_COLOUR[f.severity] ?? "var(--faint)"}"></span>
            <span class="find-body"><b class="find-title">${esc(f.title)}</b> <span class="find-detail">${esc(f.detail)}</span></span>
          </li>`).join("");
  return `
    <!-- WEBSITE ISSUES &mdash; the findings alone. No grade, no score: see seoStyle. -->
    <section class="seo">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">Website issues we can fix</div>
      <div class="seo-body">
        ${findings
          ? `<ul class="seo-findings">${findings}
        </ul>`
          : `<p class="seo-intro">We didn&rsquo;t flag any page-level issues on the pages we checked. That&rsquo;s a small sample and separate from whether AI names you, which the results above cover.</p>`}
      </div>
    </section>`;
}

/**
 * Build the full standalone one-page HTML document. Findable-branded (blue + yellow),
 * pain → solution → proof, colour-disciplined: colour (blue / yellow / red) lands only
 * on key words + numbers so they pop; everything else stays muted with generous white
 * space. Purposeful graphics only — no decorative fills.
 */
/* ================================================================================================
   SHARED REPORT CHROME - the Findable page identity (blue band + wordmark + wave, the
   "Prepared for" footer, the A4 sheet/print rules), exported so OTHER printable documents
   (src/lib/pagePlanReportHtml.ts) render in the IDENTICAL template. The audit renderer below
   consumes these same exports, so the two documents cannot drift apart.
   ================================================================================================ */
export const REPORT_CHROME_CSS_CORE = `
  :root{
    /* ══ THE BRAND: DARK WITH GOLD. LIGHT BODY. (Paul, 2026-09-13) ═══════════════════════════
       Everything that used to be Findable BLUE (#1a3d7c, the pale blue tints, the navy footer) is
       the site's charcoal now — its --color-band #101114, --color-foot #0A0B0D, gold #FFD13F — and
       the body stays light and readable. --blue KEEPS ITS NAME because 20 rules and three
       documents read it; renaming it would be a second edit for no pixel. Its VALUE is charcoal.
       ⚠️ Text on the band/CTA/footer: white on #101114 is 18:1, --on-band-muted 11:1, gold 13:1,
       charcoal text on a gold button 12:1 — every pairing that sat on blue was re-checked on
       charcoal and passes. Amber (--amber, chosen for a LIGHT ground) never sits on a dark surface
       in this document: the grade rings, the measuring banner and the severity dots are all on the
       light body. If one ever moves onto the band, it needs gold there and amber in print.
       ⚠️ PRINT NEEDS NOTHING NEW: the band and footer were already dark and already forced with
       print-color-adjust; charcoal prints exactly as navy did. */
    --blue:#101114; --blue-2:#2C2D34; --yellow:#FFD13F;
    --ink:#0f172a; --muted:#5b6472; --faint:#9aa3b2; --line:#e9edf3;
    --line-strong:#94a3b8; /* darker grey &mdash; for SEO graphics that must stay visible on the --page tint */
    --red:#e11d2a; --amber:#c2820b; --green:#15a34a; --paper:#ffffff; --page:#eef1f6;
    --foot:#0A0B0D;
    /* ── EVERY OTHER COLOUR IN THE DOCUMENT, NAMED (step 1 of the dark theme, 2026-09-13). ──
       These carry exactly the values that used to sit inline, so this step changes no pixel. They
       exist so a second token set (dark for screen, light for print) can swap ALL of them at once:
       a recolour over a half-tokenised file is how one path looks right and the other five wrong.
       ⚠️ Text on the band/footer/CTA is grouped as --on-band-* because those surfaces are dark;
       the -tint tokens are the pale panels of the light body. (No backticks in this comment: a
       backtick inside this template literal terminates the whole stylesheet — CLAUDE.md §3.) */
    --ink-2:#334155;                                            /* body copy one step lighter than --ink */
    /* On the charcoal surfaces: neutral greys from the site (its --color-faint / --color-panel-3),
       replacing the blue-cast greys that suited navy. */
    --on-band:#ffffff; --on-band-muted:#c9cbd1; --on-band-faint:#9C9FA7; --on-band-soft:#dcdee3;
    --foot-text:#c9cbd1; --foot-muted:#9C9FA7;
    --red-tint:#fff5f5; --red-tint-2:#fdeaea; --on-red-tint:#3d0f12;
    --green-tint:#e7f6ee; --amber-tint:#fff8ea; --amber-tint-2:#fdf3dd;
    /* The pale BLUE tints are the site's neutral panels now (--color-panel / --color-panel-2). */
    --blue-tint:#f0f1f3; --blue-tint-2:#e9eaed;
    --panel-tint:#f8fafc; --panel-tint-2:#f1f5f9;
    --gold:#FFD13F; --on-gold:#3a2d05;
    --gold-tint:#fffaeb; --gold-line:#e6c968; --on-gold-tint:#8a6d1a; --on-gold-tint-2:#6b5a1e;
    /* The welcome pack's code boxes were navy; charcoal now (--color-navy-800), site ink on it. */
    --mono-bg:#17181C; --mono-text:#F7F7F5; --mono-light-text:#1e293b;
    --video-bg:#000000;
  }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body{ margin:0; padding:0; }
  body{ background:var(--page); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5; -webkit-font-smoothing:antialiased; }
  .sheet{ max-width:760px; margin:24px auto; background:var(--paper); border-radius:14px; overflow:hidden;
    box-shadow:0 8px 40px rgba(15,23,42,.12); }

  /* Header band &mdash; Findable blue with a yellow wordmark and a wave bottom edge */
  .band{ position:relative; background:var(--blue); color:var(--on-band); padding:22px 28px 34px; }
  .band-row{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .wordmark{ font-size:22px; font-weight:900; letter-spacing:-.02em; color:var(--yellow); }
  .wordmark .dot{ color:var(--on-band); }
  .band-meta{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--on-band-faint); font-weight:700; }
  .wave{ position:absolute; left:0; right:0; bottom:-1px; width:100%; height:38px; display:block; }
`;

export const REPORT_CHROME_CSS_FOOT = `
  .site-foot{ background:var(--foot); padding:12px 28px 14px; }
  .site-foot .row{ display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;
    font-size:11px; color:var(--foot-text); font-weight:400; }
  .site-foot .row b{ color:var(--on-band); font-weight:700; }
  .site-foot .row a{ color:var(--yellow); text-decoration:none; }
  .site-foot .note{ margin-top:8px; font-size:11px; font-weight:400; color:var(--foot-muted); }
  /* The note carries the contact links in the welcome pack. Unstyled they render browser-default
     blue on the near-black footer: unreadable and off-brand. Gold is 13:1 on this ground. */
  .site-foot .note a{ color:var(--yellow); text-decoration:none; font-weight:700; }
  .site-foot .site-link{ margin-top:8px; font-size:11px; font-weight:400; color:var(--foot-muted); }
  .site-foot .site-link a{ color:var(--yellow); text-decoration:none; font-weight:700; }
`;

export const REPORT_CHROME_CSS_PRINT = `  @page{ size:A4; margin:10mm; }
  @media print{
    html,body,.sheet,.band,.site-foot{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body{ background:var(--paper); }
    .sheet{ margin:0; max-width:none; box-shadow:none; border-radius:0; }
    .sheet + .sheet{ break-before:page; page-break-before:always; }
    .band,.site-foot{ break-inside:avoid; }
    /* A PDF cannot play video: hide the player, show the poster as a clickable caption.
       The link survives print-to-PDF; the play button would not. */
    .vid video{ display:none !important; }
    .vid .vid-poster{ display:block !important; width:196px; text-decoration:none; color:var(--ink); }
    .vid .vid-poster img{ display:block; width:196px; border-radius:12px; }
    .vid .vid-poster span{ display:block; margin-top:6px; font-size:11px; line-height:1.4; color:var(--blue); text-decoration:underline; }
    .vid-row{ break-inside:avoid; }
  }`;

/** The blue Findable header band with the wave bottom edge. NOTE: metaHtml is the right-hand
 *  label (section name, page X of Y) and must be pre-escaped HTML. */
export function renderWaveBand(metaHtml: string): string {
  return `<header class="band">
      <div class="band-row">
        <div class="wordmark">Findable<span class="dot">.</span></div>
        <div class="band-meta">${metaHtml}</div>
      </div>
      <svg class="wave" viewBox="0 0 1200 38" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,14 C220,42 420,-4 640,15 C860,34 1010,4 1200,19 L1200,38 L0,38 Z" style="fill:var(--paper)"/>
      </svg>
    </header>`;
}

/** The dark "Prepared for <client>" footer. metaHtml is the right-hand line, pre-escaped. */
export function renderSiteFooter(opts: { businessName: string; metaHtml: string; note: string }): string {
  /* The site link (Paul, 2026-09-13): this footer is shared by the report, the welcome pack and the
     page-plan document, so one line here puts findable.live on all three. Labelled, never a bare
     URL, and on the footer's own row so it prints on every sheet. */
  return `<footer class="site-foot">
      <div class="row">
        <span>Prepared for <b>${esc(opts.businessName)}</b></span>
        <span>${opts.metaHtml}</span>
      </div>
      <div class="note">${opts.note}</div>
      <div class="site-link"><a href="${esc(REPORT_SITE_URL)}" target="_blank" rel="noopener noreferrer">findable.live</a> &middot; Findable measures how often AI names local businesses, and fixes what it reads.</div>
    </footer>`;
}

/** The adaptive hook hero: the missed search, verbatim, with who the engine named instead. Every
 *  word comes from hookReportCopy so the test can read the copy without rendering. No percentage,
 *  no "N of M answers" — a quick check is a snapshot, and this says so on its face. */
export function renderHookSection(h: HookReportSummary, businessName: string): string {
  const c = hookReportCopy(h, businessName);
  const tested = h.tested.map((t) => {
    const eng = t.perEngine.map((pe) => `${esc(pe.label)}: <b>${pe.named === null ? "no answer" : pe.named ? "named you" : "didn&rsquo;t name you"}</b>`).join(" &middot; ");
    return `<li class="${t.isGap ? "gap" : ""}"><span>&ldquo;${esc(t.question)}&rdquo;</span><span class="hook-eng">${eng}</span></li>`;
  }).join("");
  if (!h.gap) {
    return `
    <!-- ADAPTIVE HOOK: no gap in the searches tested -->
    <section class="hook">
      <div class="hook-eyebrow">${esc(c.eyebrow)}</div>
      <h1 class="hook-head ok">${esc(c.headline)}</h1>
      <p class="hook-named">${esc(c.lede)}</p>
      <p class="hook-count">${esc(c.count)}</p>
      <ul class="hook-tested">${tested}</ul>
    </section>`;
  }
  const g = h.gap;
  const named = g.namedInstead.length
    ? `<p class="hook-named">${esc(g.engineLabel)} recommended:</p><ul class="hook-list">${g.namedInstead.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : `<p class="hook-named">${esc(g.engineLabel)} answered with other suggestions.</p>`;
  const qualifier = g.namedOnEngineLabels.length
    ? `<p class="hook-earlier">${esc(g.namedOnEngineLabels.join(" and "))} did name ${esc(businessName)} for this search &mdash; this gap is specific to ${esc(g.engineLabel)}.</p>`
    : "";
  const cites = g.citations.length
    ? `<p class="hook-cites">Sources ${esc(g.engineLabel)} drew on: ${g.citations.slice(0, 4).map((ci) => esc(ci.title || ci.url)).join("; ")}</p>`
    : "";
  return `
    <!-- ADAPTIVE HOOK: the missed search is the result -->
    <section class="hook">
      <div class="hook-eyebrow">${esc(c.eyebrow)}</div>
      <h1 class="hook-head">${esc(c.headline)}</h1>
      <div class="hook-card">
        <div class="hook-ask">We asked ${esc(g.engineLabel)}:</div>
        <p class="hook-q">&ldquo;${esc(g.question)}&rdquo;</p>
        ${named}
        <p class="hook-miss">${esc(businessName)} wasn&rsquo;t named.</p>
      </div>
      ${c.earlier ? `<p class="hook-earlier">${esc(c.earlier)}</p>` : ""}
      ${qualifier}
      ${cites}
      <p class="hook-count">${esc(c.count)}</p>
      <p class="hook-caveat">${esc(c.caveat)}</p>
      ${h.tested.length > 1 ? `<ul class="hook-tested">${tested}</ul>` : ""}
    </section>`;
}

export function renderReportHtml(d: AiAuditReportData): string {
  const type = d.businessType.trim() || "business like yours";
  /* hasRivals gates every clause that mentions competitors: with no rival names measured, saying
     they "get the rest" is a claim about data we do not have. */
  const v = heroVerdict(d.named, d.total, d.questionsAsked ?? 0);

  // ── Gut-punch: a clean SUMMARY of the worst answer, with the competitors AI named
  //    instead. Never the raw AI paragraph.
  /* ══ "WHO AI NAMED" — AN AUDIT-WIDE SUMMARY, CONSISTENT WITH THE HEADLINE ══════════════════
     ⛔ THIS REPLACED A SINGLE-QUESTION QUOTE BOX (the old "What AI actually said"). That box quoted
     ONE question that pickGutPunch chose PRECISELY BECAUSE the business was not named in it — so on
     a client named X times it sat two inches under the "named X times" headline saying "wasn't
     named", which read as cherry-picking and lost trust (Wilson's, and the reason David flagged it).
     The fix is to state the WHOLE audit, using the SAME numbers as the hero (d.named / d.total), so
     the two cannot disagree.
     ⚠️ THE "nothing is shown twice" REASONING IS SPENT ON THE CLIENT DOCUMENT (2026-09-12). It used
     to be safe to keep this summary short because the per-question detail followed on page 2; that
     detail is now operator-only, so on a prospect report THIS BOX IS THE ONLY PER-QUESTION-ADJACENT
     statement there is. Do not thin it further without replacing what it says.
     ⚠️ The audit-wide competitor leaders line is KEPT (it was the good part) with its counts, and
     the denominator is stated so the reader can size it. */
  let gutbox = "";
  {
    const leaders = (d.topCompetitors ?? []).filter((c) => c.name && c.count > 0);
    const qCount = d.questionsAsked ?? 0;
    /* ⛔ "INSTEAD" ONLY WHEN THEY WERE GENUINELY NOT NAMED (Paul, 2026-09-16). The heading and the
       firms line both used to say "instead" for every judgeable audit — so a business named 5 of 6
       read "Who AI named INSTEAD" directly above "AI named <them> 5 times", which contradicts itself
       and reads as the tool ignoring its own measurement. "Instead of you" is only true when the
       count is zero; when they were named at all, the firms were named ALONGSIDE them, not instead.
       nameNotJudgeable already suppresses it (we make no "instead of you" claim we can't support). */
    const saysInstead = !d.nameNotJudgeable && d.named === 0;
    // Same figures as the hero headline — reinforces it, never contradicts it.
    /* ⛔ THE SECOND PLACE THAT ASSERTED "AI never named you", AND IT HAD TO MOVE WITH THE HERO.
       Withholding the headline and leaving this box saying it four inches lower fixes nothing —
       the reader meets the same false claim, just later. When the name cannot be judged this
       states only what IS measured: which firms AI named. Note it does not say "instead", because
       "instead of you" is the very claim we are refusing to make. */
    const namedLine = d.nameNotJudgeable
      ? `We can&rsquo;t put a number on how often AI named <b>${esc(d.businessName)}</b> until a person checks it`
      : d.named > 0
      ? `AI named <b>${esc(d.businessName)}</b> <b>${d.named}</b> time${d.named === 1 ? "" : "s"}${d.total > 0 ? ` out of ${d.total} answers` : ""}`
      : `AI never named <b>${esc(d.businessName)}</b>${d.total > 0 ? ` &mdash; not once across ${d.total} answers` : ""}`;
    let body = `${namedLine}.`;
    if (leaders.length > 0) {
      /* ⛔ THE ORDER, NOT THE ARITHMETIC (Paul, 2026-09-14). This printed "53×, 42×, 41×" after each
         firm. Second and third differed by ONE mention — a gap well inside the noise this product
         already refuses per-question claims over (MIN_CELLS_FOR_QUESTION_CLAIM, NOISE_BAND_PP), so
         the numbers asserted a margin between the second and third firm that the data does not
         support. "then" carries the one thing that IS real — that this is a ranking rather than a
         list — without claiming a distance.
         ⚠️ THE DENOMINATOR STAYS. Without it "named most often" could be three mentions, and the
         reader has no way to size the claim. It is the count that survives, because it is the one
         doing honest work.
         ⚠️ The counts themselves are untouched upstream: they still decide WHICH three firms are
         named here and in what order (auditReport's `ranked`). Only the rendering changed. */
      const chips = leaders.map((c) => `<span class="rv">${esc(c.name)}</span>`);
      const list = chips.length === 1
        ? chips[0]
        : chips.join(", then ");
      const denom = d.competitorMentions && d.competitorMentions > 0
        ? ` &mdash; from ${d.competitorMentions} competitor mentions across ${qCount} question${qCount === 1 ? "" : "s"}`
        : "";
      body += ` The firms AI named most often${saysInstead ? " instead" : ""} were ${list}${denom}.`;
    }
    /* ⛔ THE POINTER IS GATED ON THE SAME CONDITION AS THE PAGES IT POINTS AT, AND THAT MATTERS
       MORE THAN IT LOOKS. It was gated on the DATA existing (`questionBreakdown?.length > 0`) while
       the pages it names are now gated on `internal` — two different conditions for one promise, so
       a prospect report would carry "listed on the next page" with no next page. A sentence that
       names a thing must be true or absent; there is no third option on a document we send. */
    const pointer = d.internal === true && (d.questionBreakdown?.length ?? 0) > 0
      ? ` <span class="gb-more">Every question, and how often AI named you in each, is listed on the next page.</span>`
      : "";
    gutbox = `
    <section class="gutbox">
      <div class="gb-eyebrow">${saysInstead ? "Who AI named instead" : "Who AI named"}</div>
      <p class="gb-sum">${body}${pointer}</p>
    </section>`;
  }

  /* Official engine marks — compact inline SVG (not the 40KB base64 blob). OpenAI is monochrome
     (white path on a black chip via .cc-*--oai); Gemini is its gradient spark. A gradient needs a
     unique id per instance, so the header mark and the avatar pass different ids. */
  const OAI_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.1419.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>`;
  const geminiSvg = (id: string) => `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285f4"/><stop offset=".5" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#${id})" d="M12 2c.45 5.1 3.4 8.05 8.5 8.5-5.1.45-8.05 3.4-8.5 8.5-.45-5.1-3.4-8.05-8.5-8.5 5.1-.45 8.05-3.4 8.5-8.5Z"/></svg>`;
  const isOai = (label: string) => /chatgpt|openai|gpt/i.test(label);
  const engineMark = (label: string) => isOai(label) ? `<span class="cc-mark cc-mark--oai">${OAI_SVG}</span>` : `<span class="cc-mark cc-mark--gem">${geminiSvg("gemMark")}</span>`;
  const engineAvatar = (label: string) => isOai(label) ? `<div class="cc-avatar cc-avatar--oai">${OAI_SVG}</div>` : `<div class="cc-avatar cc-avatar--gem">${geminiSvg("gemAvatar")}</div>`;

  /* "WHAT'S STOPPING AI READING YOUR SITE" — one line per real crawl-check fault (buildFaultLines),
     each carrying its own number; red dot for a real fault, amber for the structured-data gap.
     Rendered only when there ARE faults — a site that couldn't be fetched yields none (Paul's rule),
     so the section is simply absent. */
  const faultsSection = (d.crawlFaults && d.crawlFaults.length)
    ? `
    <section class="why" style="border-top:1px solid var(--line)">
      <div class="sec-eyebrow">Your website</div>
      <div class="sec-title">What&rsquo;s stopping AI reading your site</div>
      <p style="margin:0 0 18px;max-width:70ch;font-size:14px;line-height:1.55;color:var(--muted)">We read your site the way ChatGPT and Gemini do.</p>
      ${d.crawlFaults.map((f) => `
      <div class="fault">
        <div class="fault-dot${f.minor ? " fault-dot--minor" : ""}"></div>
        <div>
          <div class="fault-t">${esc(f.title)}</div>
          <p class="fault-p">${esc(f.detail)}</p>
        </div>
      </div>`).join("")}
    </section>`
    : "";

  /* THE WEBSITE SLOT. A PAID BASELINE keeps its graded Apify SEO — the deliverable it bought (Paul,
     2026-09-16: do not strip it). Every other report shows the free crawl-check faults instead; a
     no-website lead gets the "we'll build you one" slot; otherwise nothing. */
  const seoSlot = d.seo
    ? (d.seoStyle === 'issues' ? seoIssuesSection(d.seo) : seoSection(d.seo))
    : (d.crawlFaults && d.crawlFaults.length) ? faultsSection
    : d.hasWebsite === false ? noWebsiteSection()
    : "";

  /* ── ONE REAL AI ANSWER, RECREATED (2026-09-16, Paul) ─────────────────────────────────────────
     ONE engine — the one that did NOT name them (pickGutPunch, scored engines only) — with its
     OFFICIAL mark in the header and as the avatar, the exact real question, and a NUMBERED LIST of
     the real firms it named instead (names only; we don't store descriptions and a clipped clause
     reads worse). Renders only when a not-named answer carries firms; the callout is true by
     construction. Withheld on the still-measuring and name-not-judgeable paths. */
  const gp = d.gutPunch;
  const chatCard = (gp && gp.answer && gp.answer.trim() && gp.businesses && gp.businesses.length)
    ? `
    <section class="chatcard">
      <div class="cc-head">
        <span class="cc-brand">${engineMark(gp.engineLabel)}${esc(gp.engineLabel)}</span>
        <span class="cc-date">${esc(d.generatedAtLabel)}</span>
      </div>
      <div class="cc-body">
        <div class="cc-q">${esc(gp.question)}</div>
        <div class="cc-arow">
          ${engineAvatar(gp.engineLabel)}
          <div class="cc-a">
            <p class="cc-atext">${esc(gp.answer)}</p>
            <ol class="cc-list">${gp.businesses.map((b) => `<li><b>${esc(b)}</b></li>`).join("")}</ol>
          </div>
        </div>
      </div>
      <div class="cc-callout"><span class="cc-bang">!</span>${esc(d.businessName)} wasn&rsquo;t mentioned in this search.</div>
    </section>`
    : "";

  /* ── THE OTHER QUESTIONS (2026-09-16, Paul) ───────────────────────────────────────────────────
     Under the card, the rest of the questions we asked — one row each, a marker per scored engine.
     GREEN = named, RED = not named (Paul's correction), grey dash = that engine didn't answer. Same
     questionBreakdown the internal pages use, shown here as a compact two-marker client view; the
     question the card already shows is excluded so nothing reads twice. */
  const qOther = (d.questionBreakdown ?? []).filter((q) => !gp || q.question !== gp.question);
  const engNamed = (q: NonNullable<typeof d.questionBreakdown>[number], label: string): boolean | null => {
    const e = q.perEngine?.find((pe) => pe.label === label);
    if (!e || !e.ran) return null;
    const n = typeof e.named === "number" ? e.named : (e.named ? 1 : 0);
    return n > 0;
  };
  const qMark = (v: boolean | null) => v === null
    ? `<span class="qm qm-na" title="didn&rsquo;t appear">&ndash;</span>`
    : v ? `<span class="qm qm-yes" title="named">&check;</span>`
        : `<span class="qm qm-no" title="not named">&times;</span>`;
  const questionsList = qOther.length ? `
    <section class="qlist">
      <div class="sec-eyebrow">The other questions we asked</div>
      <div class="qrow qrow-head"><span class="qrow-q"></span><span class="qrow-e">ChatGPT</span><span class="qrow-e">Gemini</span></div>
      ${qOther.map((q) => `<div class="qrow"><span class="qrow-q">${esc(q.question)}</span><span class="qrow-e">${qMark(engNamed(q, "ChatGPT"))}</span><span class="qrow-e">${qMark(engNamed(q, "Gemini"))}</span></div>`).join("")}
    </section>` : "";

  /* 🔴 THE NAME REFUSAL — IT REPLACES THE HERO. Paul's words, 2026-09-15, and the phrasing is his
     for two stated reasons worth keeping: it LEADS WITH THE NAME rather than with what we cannot
     do (an earlier draft read as blaming their name for our problem), and it says "an automated
     check can't" rather than "we cannot" — because a person CAN tell, it just takes a person.
     ⛔ DO NOT DEMOTE THIS TO A CAVEAT UNDER THE NUMBER. A true sentence below a false headline is
     still a false headline, and the headline this replaces was "AI never named X — not once across
     6 answers" for a business whose name we had no way to find. */
  const nameCheckSection = `
    <!-- NAME NOT JUDGEABLE: the hero and the named figure are withheld. See nameNotJudgeable. -->
    <section class="namecheck">
      <div class="sec-eyebrow">Before we show you a number</div>
      <div class="sec-title">We&rsquo;re checking this one by hand.</div>
      <p>Your business name is made of the same words as your trade and your town, so an automated check can&rsquo;t tell a mention of you apart from a mention of the search itself. We check this one by hand before we send it.</p>
    </section>`;

  const shareFoot = d.shareUrl ? ` &middot; <a href="${esc(d.shareUrl)}">View online</a>` : "";

  // Purpose-drawn inline icons for the "What we do" steps — one per step, 2px stroke,
  // consistent weight, brand blue (currentColor inherits var(--blue) from the tile).
  // 1 · Give AI a page to quote → stacked page cards (a page per service, per town).
  const icListed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h9"/><rect x="8" y="8" width="12" height="12" rx="2"/><line x1="11" y1="12" x2="17" y2="12"/><line x1="11" y1="16" x2="15" y2="16"/></svg>`;
  // 2 · Structure your info → a schema/node graph (structured data engines can read).
  const icStruct = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="5.5" cy="18.5" r="2.4"/><circle cx="18.5" cy="18.5" r="2.4"/><line x1="11" y1="7.1" x2="6.6" y2="16.4"/><line x1="13" y1="7.1" x2="17.4" y2="16.4"/></svg>`;
  // 3 · Get you named → an answer bubble with a star (AI naming you in its reply).
  const icNamed = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 4V5.5Z"/><path d="M12 7.3l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 13.17l-2.3 1.2.44-2.56-1.86-1.81 2.57-.37Z"/></svg>`;

  // Findable f-mark favicon: blue bg, yellow PATH-DRAWN lowercase "f" (hooked top + crossbar),
  // white dot lower-right. Path-based (NOT SVG <text>) so it renders everywhere - some crawlers
  // don't render <text> in favicons. Carries its own brand mark so the report never falls back to
  // the site-root /favicon.ico (a stale Lovable asset).
  const favicon = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#101114"/><path d="M20 8.5 Q14 8.5 14 13.5 L14 24.5 M9.5 14.8 H18.5" fill="none" stroke="#ffd23f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="22.5" r="2.4" fill="#fff"/></svg>',
  );

  // Personalised one-tap contact links. encodeURIComponent for the URL params (spaces, hyphen,
  // apostrophe, &), then esc() for HTML-attribute safety. Single-param each → no & separator.
  // Addresses come from REPORT_CONTACT_* at the top of this file — one place to change.
  const emailHref = esc(`mailto:${FINDABLE_CONTACT_EMAIL}?subject=${encodeURIComponent(`AI Visibility - ${d.businessName}`)}`);
/* 🔴 THE TRADE/TOWN CTA SUBJECT WAS DELETED WITH THE OLD CTA (2026-09-12) — and the MEASUREMENTS
     behind it are kept here because the next CTA that names a trade will need them, and they cost
     real reports to learn:
       · `businessType` is stored PLURAL on 649 of the 778 audits that carry one — 83%. So
         `${article(t)} ${t}` printed "a Locksmiths in Ashby-de-la-Zouch" on four reports in five,
         on the line that asks for the sale. Dropping the article reads correctly either way.
       · The test that worked: `/[^s]s$/i.test(t) || /ing$/i.test(t)` — the `ing$` clause catches
         "mobile valeting", where "a mobile valeting" is wrong; `ss` is excluded so "business" keeps
         its article. Residual, stated: "hospitality" still takes one, 2 of 778.
       · businessType may be "" and locationText is absent on older payloads, so all four
         combinations had to be written out, ending in a real sentence ("a business like yours"),
         never an interpolated gap.
     ⛔ DELETED RATHER THAN LEFT UNUSED. The new copy names neither trade nor town, so ctaTrade,
     ctaTown, pluralTrade, tradePhrase and ctaSubject all became unreferenced — and `noUnusedLocals`
     is off, so nothing would have said so. This file has already paid for that once: it kept
     IMPORTING FINDABLE_GUARANTEE and rendering it nowhere for ten days. Knowledge belongs in a
     comment; code that runs and is read by nothing does not.
     ⚠️ `article()` (line ~182) is UNTOUCHED and still used by the explainer at the top. */
  /* ⛔ THE GET-STARTED BUTTON, AND IT IS A PRICE GUARD AS MUCH AS A LINK (wired 2026-09-03).
     `offerUrl` is /onboarding/<slug>/?lead=<leadId>, and the `?lead=` is what makes
     offerPriceForLead quote the FOUNDER price - without it that same flow charges the full price.
     So an absent url renders NO BUTTON rather than falling back to the bare site: a button that
     silently costs the customer more is worse than no button. Same rule the old offer block had.

     ⛔ `showOffer === true`, STRICTLY. It is false once amount_paid > 0, so a paying
     customer is never invited to start again, and undefined (a caller that does not set it, e.g.
     an operator preview) shows nothing rather than guessing.

     🔴 WHY IT IS HERE AT ALL: outreach's audit_result_hook sends people to their report, and all
     16 leads it has been sent to opened it - 16 of 16. The report is where a clicker actually
     lands, so this is the door for them, and it needs no change to the Meta-approved template.
     ⚠️ It does NOT name a price. The pitch block was deliberately stripped from this document on
     2026-09-02; the price belongs on the onboarding page, which states it. */
  const startUrl = (d.offerUrl ?? "").trim();
  const startBtn = d.showOffer === true && startUrl
    ? `<a class="cta-btn start" href="${esc(startUrl)}" target="_blank" rel="noopener noreferrer">Get started &mdash; &pound;99</a>`
    : "";
  if (d.showOffer === true && !startUrl) {
    console.warn("[report] get-started button omitted: no per-lead onboarding url (no lead_id, or the site origin is not configured)");
  }

  /* ⛔ REQUEST A CALL — a FORM POST, never a link. POST so link-prefetchers and messaging-app
     crawlers cannot fire it (an email side-effect on a GET would spam Paul). The only field is the
     audit id already in the report URL; the endpoint derives the business name + phone server-side
     and always emails Paul — the prospect cannot inject content or a recipient. request-call dedupes
     to one email per lead per 24h. No auditId/endpoint (e.g. the in-app preview) → no button. */
  const requestCallBtn = (d.auditId && d.requestCallUrl)
    ? `<form method="POST" action="${esc(d.requestCallUrl)}" style="margin:0;display:inline"><input type="hidden" name="audit" value="${esc(d.auditId)}"><button type="submit" class="cta-btn call">Request a call</button></form>`
    : "";

  const waHref = esc(`https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${d.businessName} - I saw my AI visibility report and I'm interested.`)}`);

  // ── QUESTION-BY-QUESTION DETAIL (page 2) — every question asked, whether AI named the business,
  //    and the real rival firms it named instead. A clean addition; the first-page summary above is
  //    untouched. Omitted entirely when the payload carries no breakdown (older/market payloads).
  /* The breakdown is its OWN sequence of page-sheets AFTER page 1 (not crammed onto one). Each
     chunk is a full themed .sheet (blue band + cards), so on screen they read as distinct client
     pages and in print each starts a fresh A4. QUESTIONS_PER_PAGE keeps a card from ever splitting
     across a break — a card lives wholly inside one sheet. A 20-question Full Measurement naturally
     runs to several pages; a small quick audit is one. */
  const qb = d.questionBreakdown ?? [];
  const QUESTIONS_PER_PAGE = 3; // cards are taller now (per-engine block); keep a page uncrowded
  const qChunks: typeof qb[] = [];
  for (let i = 0; i < qb.length; i += QUESTIONS_PER_PAGE) qChunks.push(qb.slice(i, i + QUESTIONS_PER_PAGE));

  /* THE SAME WAVE HEADER + FOOTER AS PAGE 1 — reused verbatim so every breakdown page is a full
     branded report page (Paul's ask). Byte-identical to page 1's inline band/footer below. */
  const waveBand = (meta: string) => renderWaveBand(meta);
  const siteFooter = renderSiteFooter({
    businessName: d.businessName,
    metaHtml: `Findable &middot; AI Visibility Audit &middot; ${esc(d.generatedAtLabel)}${shareFoot}`,
    note: "A snapshot of where you stand today. After we&rsquo;ve made changes we ask these questions again, alongside others, to show your before &amp; after.",
  });

  // One engine's row inside a question card: name → named X of R (across runs) → who → sources.
  const engineRow = (e: NonNullable<(typeof qb)[number]['perEngine']>[number]): string => {
    if (!e.ran) {
      return `<div class="qb-eng"><div class="qb-eng-head"><span class="qb-eng-name">${esc(e.label)}</span><span class="qb-eng-empty">Didn&rsquo;t appear</span></div></div>`;
    }
    // named is a COUNT now (across runs); older payloads carried a boolean.
    const namedN = typeof e.named === 'number' ? e.named : (e.named ? 1 : 0);
    const outOf = e.ranCount ?? 1;
    const state = namedN > 0
      ? `<span class="qb-badge yes sm">Named you ${namedN} of ${outOf}</span>`
      : `<span class="qb-badge no sm">Not named${outOf > 1 ? ` (0 of ${outOf})` : ''}</span>`;
    /* ⛔ TWO FIGURES, BECAUSE THEY ARE TWO DIFFERENT THINGS. The stored `named` is "in the answer
       prose OR in a matching source title", so one number hid the difference between AI writing
       about the business and AI merely citing its website. Both are derived from stored data
       (auditReport.ts), so they cost nothing and exist on every historical audit.

       🔴 THIS LABEL SAID "RECOMMENDED" UNTIL 2026-08-30, AND THAT WAS AN OVERCLAIM ON A
       CLIENT-FACING DOCUMENT. The number it prints is `nameMatches(answer_text, businessName)` —
       presence of the name in the answer text. NOTHING in the codebase judges tone, endorsement or
       whether a competitor was preferred in the same sentence: there is no such signal on
       AiEngineResult, and the only tone-ish code (`isDamningSentence`) picks which sentence to QUOTE
       and makes no judgement about the client. So a business listed neutrally, or listed and then
       passed over in favour of a rival, was reported to that business as "Recommended".
       ⛔ THE COUNT IS UNCHANGED — this is the label only. `e.recommended` still comes from the same
       derivation and the header total still comes from the stored `named`. Renaming was the whole
       fix: the measurement was always honest, the word on top of it was not.
       ⚠️ UPDATE 2026-09-15: the sentence above about nameMatches now describes the FALLBACK only.
       The count comes from cellNamed() (namedSignal.ts), which prefers the model's own reading of
       the answer where extract-competitors has recorded one. That does NOT make the label
       "Recommended" honest again — self_named answers "is this business presented as an option",
       which is still presence-as-a-candidate and not endorsement. Do not rename it back.
       ⚠️ A REAL endorsement measure needs an LLM judgement per answer and is deliberately NOT built
       here. If it is ever added it must be a NEW field with its own name — never by quietly
       re-pointing this label at a different number, which is how the overclaim happened.

       ⚠️ The connector "in" is dropped from this half only: "Named in the answer in 2 of 3" reads
       as a stutter. The cited half keeps its wording verbatim, as asked.
       ⚠️ CITED IS PRINTED EVEN WHEN IT IS ZERO. "Cited as a source in 0 of 3" is a real finding —
       hiding it would let a reader assume it was simply not measured. Older payloads carry neither
       field; those fall back to the single badge exactly as before, so there is no second label
       path to keep in step (unlike the "Others named:" rename, which had two). */
    const split = (e.recommended != null || e.cited != null)
      ? `<div class="qb-eng-line qb-split">`
        + `<span class="qb-split-i"><b>Named in the answer</b> &mdash; ${e.recommended ?? 0} of ${outOf}</span>`
        + `<span class="qb-split-i"><b>Cited as a source</b> in ${e.cited ?? 0} of ${outOf}</span>`
        + `</div>`
      : '';
    /* An engine that RAN but does not feed the question total is said so plainly, so its count can
       never look like it should have been added to the header.
       🔴 THIS RENDERS ON REAL REPORTS: AI Overview IS being scraped again — measured live
       2026-08-29, it returned on 14 of 20 questions of ABLM's audit — even though several comments
       in this repo still say it is "no longer scraped". Its counts sit outside SCORED_ENGINES, so
       without this note a card reads as though its engine rows should add up to the header and
       don't. `counted !== false` keeps older payloads, which carry no flag, exactly as they were. */
    const uncounted = (e.ran && (e as { counted?: boolean }).counted === false)
      ? `<span class="qb-uncounted">not counted in the total above</span>` : '';
    const rivals = e.rivals.length
      /* ⛔ "OTHERS NAMED", NOT "NAMED" — the list is competitors-ONLY and the client is removed from
         it upstream, by extract-competitors (its prompt plus the cleanNames self-filter), so this
         renderer never receives the client's own name and could not show it. Labelled "Named:" it
         read as "everyone AI named", which contradicts the badge beside it: a client saw
         "Named you 2 of 3" next to a list they were absent from. Label only — the counts, the data
         and the exclusion itself are unchanged. */
      ? `<div class="qb-eng-line"><span class="qb-rlabel">Others named:</span> ${e.rivals.map((r) => `<span class="qb-chip">${esc(r)}</span>`).join(" ")}</div>`
      /* 🔴 THREE CAUSES, THREE SENTENCES. This was one line - "No businesses named." - for every
         empty rival list, and on a real prospect's document it sat directly under "Named in the
         answer - 1 of 1" (Hazlewood Locksmiths, 2026-09-02: two of its three occurrences). The report
         claimed the business was named and then that nobody was.
         The list is competitors-ONLY and always has been, so this sentence was never about "all
         businesses" - the POSITIVE label was corrected to "Others named:" for exactly this reason and
         the empty state was left behind. The same overclaim, in the opposite direction.
         ⛔ AND IT MUST NOT ASSERT WHAT WE DO NOT KNOW. An empty kept-list means one of:
           · names withheld because the run's list could not be trusted (namesWithheld),
           · AI returned names and every one was filtered out as junk (rivalsRaw > 0),
           · AI genuinely named nobody else (rivalsRaw === 0).
         Only the third is "nobody else was named". Older payloads carry no rivalsRaw and fall back to
         the scoped wording without claiming a cause. */
      : d.namesWithheld
        ? `<div class="qb-eng-line"><span class="qb-none">Competitor names withheld &mdash; this run&rsquo;s list could not be verified.</span></div>`
        /* 🔴 "COULD NOT BE VERIFIED" IS GONE AND CANNOT RECUR (2026-09-02). It existed because the
           renderer re-filtered the stored names and could end up with none, so it had to say why without
           claiming nobody was named. That filter is removed: `rivals` IS the stored list, cleaned once
           when the audit ran, so "AI returned names and we rejected them all" is no longer a state this
           document can be in.
           ⚠️ Withholding remains, because it is a different fact: a run whose stored list is provably junk
           has its names suppressed wholesale (competitorCleaning.ts), and saying so is honest. */
          : `<div class="qb-eng-line"><span class="qb-none">No other businesses named.</span></div>`;
    const sources = e.citations.length
      ? `<div class="qb-eng-line"><span class="qb-slabel">Sources:</span> ${e.citations.map((c) => `<a class="qb-cite" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(c.domain)}</a>`).join(" ")}</div>`
      : `<div class="qb-eng-line"><span class="qb-none">No sources cited.</span></div>`;
    return `<div class="qb-eng"><div class="qb-eng-head"><span class="qb-eng-name">${esc(e.label)}</span>${state}${uncounted}</div>${split}${rivals}${sources}</div>`;
  };

  // INTERNAL-ONLY winnability chip + the numbers behind it. Rendered only when d.internal === true,
  // so it can never appear on the client's report (render-audit-report never sets internal).
  /* ⛔ 'ALREADY NAMED' leads this map because it now outranks every other verdict: a question the
     client already wins is reported as won, never graded as a content target. */
  const WIN_LABEL: Record<string, string> = { named: 'ALREADY NAMED', wide_open: 'WIDE OPEN', locked: 'LOCKED', informational: 'INFORMATIONAL', unclear: 'UNCLEAR' };
  const winBlock = (w: NonNullable<(typeof qb)[number]['winnability']>): string => {
    const mix = w.sourceMix;
    const mixStr = mix.total > 0 ? `sources ${mix.authority} info / ${mix.business} business${mix.other ? ` / ${mix.other} other` : ''}` : 'no sources';
    return `<div class="qb-win win-${esc(w.label)}">
      <span class="qb-win-chip">${esc(WIN_LABEL[w.label] ?? w.label)}</span>
      <span class="qb-win-why">${esc(w.reason)}</span>
      <span class="qb-win-nums">${w.distinctFirms} distinct firm${w.distinctFirms === 1 ? '' : 's'} · top in ${w.topFirmCells}/${w.totalCells} answers · ${mixStr}</span>
    </div>`;
  };

  const qCard = (q: (typeof qb)[number]): string => {
    // Overall badge (headline-consistent): "Named you X of Y" sums to the "named X of Y" figure.
    const nc = q.namedCount;
    const outOf = q.answers;
    /* ⛔ "NAMED IN X OF Y ANSWERS" — a COMBINED total across the engines below, and it has to say so.
       As "Named you 2 of 6" it sat directly above rows reading "0 of 3" and "2 of 3" and read as a
       contradiction, because nothing on the line said the 6 was the two engines added together.
       The arithmetic was always right: Y counts only SCORED engines that actually returned
       (auditReport.ts skips an absent engine), so 3 + 3 = 6 and 0 + 2 = 2. Wording only. */
    const badge = nc != null
      ? (nc > 0
          ? `<span class="qb-badge yes">Named in ${nc}${outOf ? ` of ${outOf} answers` : '&times;'}</span>`
          : `<span class="qb-badge no">Not named${outOf ? ` in any of ${outOf} answers` : ''}</span>`)
      : (q.namedYou ? `<span class="qb-badge yes">Named you</span>` : `<span class="qb-badge no">Not named</span>`);
    // Per-engine breakdown when present; older payloads fall back to the folded rivals/sources.
    let body: string;
    if (q.perEngine && q.perEngine.length) {
      body = `<div class="qb-engines">${q.perEngine.map(engineRow).join("")}</div>`;
    } else {
      const rivals = q.rivals.length
        /* The pre-perEngine fallback path, folded across engines — same competitors-only list and
           the same client exclusion, so it carries the same label. Kept identical to the per-engine
           row above on purpose: two labels for one meaning is how they drift apart. */
        ? `<span class="qb-rlabel">Others named:</span> ${q.rivals.map((r) => `<span class="qb-chip">${esc(r)}</span>`).join(" ")}`
        : `<span class="qb-none">No specific businesses named.</span>`;
      const cites = q.citations ?? [];
      const sources = cites.length
        ? `<span class="qb-slabel">AI&rsquo;s sources:</span> ${cites.map((c) => `<a class="qb-cite" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(c.domain)}</a>`).join(" ")}`
        : `<span class="qb-none">No sources cited.</span>`;
      body = `<div class="qb-line">${rivals}</div><div class="qb-line qb-src">${sources}</div>`;
    }
    const win = (d.internal === true && q.winnability) ? winBlock(q.winnability) : '';
    return `<li class="qb-item">
      <div class="qb-top"><span class="qb-q">&ldquo;${esc(q.question)}&rdquo;</span>${badge}</div>
      ${body}
      ${win}
    </li>`;
  };

  /* 🔴 OPERATOR-ONLY SINCE 2026-09-12 (Paul's call). These sheets used to go to every prospect and
     read as clutter on the document that asks for the sale — QUESTIONS_PER_PAGE is 3, so a
     12-question baseline added FOUR full sheets after the CTA.
     ⛔ GATED, NOT DELETED, AND THE REASON IS winBlock. The per-question winnability signal renders
     only inside these cards (`d.internal === true && q.winnability`), and it is the ONLY winnability
     view in the product — deleting the cards would have taken it with them, silently, because a
     block that renders nowhere is not a compile error. Same trap that left FINDABLE_GUARANTEE
     imported-and-unrendered for ten days.
     ⚠️ WHAT IT COSTS A PROSPECT, STATED: these cards are the ONLY place the report shows which
     SOURCES each engine read. Page 1 carries no citations at all, so a prospect report no longer
     shows them anywhere. Accepted deliberately; if that is ever reconsidered, the fix is a
     sources summary on page 1, not un-gating these pages.
     ⚠️ `internal` is set ONLY by the in-app operator preview (AiAudit.tsx). render-audit-report —
     the route a prospect actually opens — never sets it, which is the same flag that already kept
     winnability off customer documents, so this inherits a rule that was already load-bearing. */
  const questionDetail = d.internal !== true || qb.length === 0 ? "" : qChunks.map((chunk, pi) => `
    <div class="sheet qpage">
      ${waveBand(`Questions &amp; sources${qChunks.length > 1 ? ` &middot; page ${pi + 1} of ${qChunks.length}` : ""}`)}
      <section class="qbreak">
        ${pi === 0 ? `<div class="sec-eyebrow">The detail</div>
        <div class="sec-title">Every question we asked, engine by engine</div>
        <p class="qb-intro">These are the exact questions we put to the AI engines. For each one, we show what <b>ChatGPT</b>, <b>Gemini</b> and Google&rsquo;s <b>AI Overview</b> each said &mdash; whether they named <b>${esc(d.businessName)}</b>, who they named instead, and the sources they drew on. The engines behave differently, so telling them apart matters.</p>` : ""}
        <ul class="qb-list">
          ${chunk.map(qCard).join("")}
        </ul>
      </section>
      ${siteFooter}
    </div>`).join("");

  return stripHtmlComments(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- ⛔ NEVER INDEXABLE. This document names the prospect's COMPETITORS and their own measured
     invisibility. It appearing in a Google result would be a genuine problem for them and for us,
     and it was fully indexable until 2026-08-05: no robots meta, no X-Robots-Tag on any route.
     In the DOCUMENT rather than only on a response header, so the downloaded file and every route
     that ever serves this HTML carry it — a header only protects the route that sets it.
     noarchive/nosnippet as well as noindex: a cached copy or a snippet naming their competitors is
     the same disclosure by another name. The proxy adds the header too; belt and braces. -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
<link rel="icon" type="image/svg+xml" href="${favicon}" />
<title>AI Visibility Report &mdash; ${esc(d.businessName)}</title>
<style>
${REPORT_CHROME_CSS_CORE}

  /* One-line explainer */
  .explainer{ padding:16px 28px 4px; font-size:17px; line-height:1.4; color:var(--ink-2); font-weight:400; max-width:70ch; }
  .explainer b{ color:var(--blue); font-weight:700; }

  /* ── EMPHASIS SYSTEM (one rule, whole document) ───────────────────────────────
     Key WORDS get a consistent accent at weight 850: brand --blue for neutral/positive
     terms (.hl, .explainer b) and --red for loss/negative terms (.rv, .was) &mdash; same
     strength, colour carries the meaning. Key NUMBERS/verdicts stay at 900 in their
     severity/brand colour (hero .num, why .big/.was, SEO grade). --blue holds strong on
     BOTH --paper and the --page tint, so the accent never reads weak in any section. */
  .hl{ color:var(--blue); font-weight:700; }

  /* HERO &mdash; balanced two-part: big number/label on the left, the verdict on the right */
  .hero{ display:flex; align-items:stretch; gap:26px; padding:14px 28px 20px; }
  .hero-num{ display:flex; align-items:center; gap:18px; flex:0 0 auto; }
  .num{ font-size:104px; line-height:.82; font-weight:900; letter-spacing:-.04em; }
  .num.crit,.num.low{ color:var(--red); } .num.mid{ color:var(--amber); } .num.high{ color:var(--green); }
  .num-cap{ max-width:24ch; }
  .num-cap .l1{ font-size:17px; font-weight:700; color:var(--ink); line-height:1.1; }
  .num-cap .l2{ font-size:14px; font-weight:400; color:var(--muted); margin-top:3px; }
  /* The working-out under the total: deliberately smaller and quieter than the total itself. It is
     there for the prospect who checks, not for the one who skims. */
  .num-cap .l3{ font-size:12px; font-weight:400; color:var(--muted); margin-top:2px; opacity:.85; }
  .hero-rule{ width:1px; background:var(--line); align-self:stretch; }
  .hero-verdict{ flex:1; display:flex; flex-direction:column; justify-content:center; }
  .hero-verdict .vk{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin-bottom:8px; }
  .punch-sub{ font-size:13px; line-height:1.45; color:var(--ink); margin-top:6px; font-weight:500; }
  .punch{ font-size:22px; line-height:1.2; font-weight:900; letter-spacing:-.01em; color:var(--ink); }

  /* GUT-PUNCH &mdash; a written summary of the worst answer (never the raw AI text) */
  .gutbox{ margin:0 28px 16px; padding:14px 18px; background:var(--red-tint); border-left:6px solid var(--red); border-radius:0 12px 12px 0; }
  /* Adaptive hook hero — the missed search IS the result, so it gets the size the number used to have. */
  .hook{ padding:14px 28px 20px; }
  .hook-eyebrow{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-bottom:8px; }
  .hook-head{ font-size:30px; line-height:1.15; font-weight:800; letter-spacing:-.01em; margin:0 0 14px; }
  .hook-head.ok{ color:var(--green, #1b7f4b); }
  .hook-card{ padding:16px 20px; background:var(--red-tint); border-left:6px solid var(--red); border-radius:0 12px 12px 0; margin-bottom:12px; }
  .hook-card .hook-ask{ font-size:13px; color:var(--muted); margin-bottom:4px; }
  .hook-card .hook-q{ font-size:20px; line-height:1.3; font-weight:700; margin:0 0 12px; }
  .hook-card .hook-named{ font-size:14px; margin:0 0 6px; }
  .hook-card .hook-list{ margin:0 0 12px; padding-left:18px; font-size:15px; line-height:1.55; }
  .hook-card .hook-miss{ font-size:16px; font-weight:700; margin:0; }
  .hook-earlier, .hook-count{ font-size:13px; color:var(--muted); margin:0 0 4px; }
  .hook-caveat{ font-size:13px; color:var(--muted); font-style:italic; margin:6px 0 0; }
  .hook-tested{ margin:12px 0 0; padding:0; list-style:none; }
  .hook-tested li{ display:flex; gap:10px; align-items:baseline; padding:8px 12px; border-radius:8px; font-size:14px; }
  .hook-tested li.gap{ background:var(--red-tint); font-weight:700; }
  .hook-tested .hook-eng{ font-size:12px; white-space:nowrap; color:var(--muted); }
  .hook-tested .hook-eng b{ font-weight:700; }
  .hook-cites{ font-size:12px; color:var(--muted); margin:4px 0 0; }
  .gb-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--red); font-weight:700; margin-bottom:7px; }
  .gb-sum{ margin:0 0 7px; font-size:14px; line-height:1.4; font-weight:400; color:var(--on-red-tint); }
  .gb-sum .gb-q{ color:var(--ink); font-weight:700; }
  .gb-sum .rv{ color:var(--red); font-weight:700; white-space:normal; }
  /* The mention count beside each leader. Deliberately quieter than the name: it is the evidence
     for the name, not a second thing to read. */
  .gb-sum .rvn{ color:var(--muted); font-weight:600; font-size:.85em; white-space:nowrap; }
  .gb-sum b{ color:var(--ink); font-weight:700; }
  .gb-attr{ font-size:11px; color:var(--muted); font-weight:400; }
  .gb-sum .gb-more{ color:var(--muted); font-weight:400; }

  /* QUESTION-BY-QUESTION DETAIL — each chunk is its OWN .sheet page (.qpage) with the SAME wave band
     and footer as page 1, so it reads as a distinct, fully-branded client page on screen and prints
     as a fresh A4. .qbreak is just the body inside that sheet; the sheet does the paging.
     The footer sits at the bottom; a little breathing room above it. */
  .qpage{ display:flex; flex-direction:column; }
  .qpage .qbreak{ padding:16px 28px 22px; flex:1 0 auto; }
  .qpage .site-foot{ margin-top:auto; }
  .qb-intro{ margin:0 0 16px; font-size:14px; font-weight:400; color:var(--muted); max-width:64ch; }
  .qb-intro b{ color:var(--blue); font-weight:700; }
  .qb-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
  .qb-item{ padding:12px 14px; background:var(--page); border:1px solid var(--line); border-radius:10px;
    break-inside:avoid; page-break-inside:avoid; }
  .qb-top{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
  .qb-q{ font-size:14px; font-weight:700; color:var(--ink); line-height:1.35; }
  .qb-badge{ flex:0 0 auto; font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    padding:3px 9px; border-radius:999px; white-space:nowrap; }
  .qb-badge.yes{ background:var(--green-tint); color:var(--green); }
  .qb-badge.no{ background:var(--red-tint-2); color:var(--red); }
  .qb-line{ margin-top:8px; font-size:13px; color:var(--muted); line-height:1.9; }
  .qb-split{ display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:var(--ink); margin:2px 0 1px; }
  .qb-split-i b{ font-weight:800; }
  .qb-uncounted{ font-size:10px; color:var(--muted); font-style:italic; margin-left:6px; }
  .qb-rlabel{ font-weight:700; color:var(--ink); font-size:12px; margin-right:2px; }
  .qb-chip{ display:inline-block; background:var(--paper); border:1px solid var(--line); border-radius:999px;
    padding:2px 9px; font-size:12px; font-weight:600; color:var(--ink); }
  /* Sources row — a light divider above it separates "who" (rivals) from "where" (sources). */
  .qb-src{ margin-top:9px; padding-top:9px; border-top:1px dashed var(--line); }
  .qb-slabel{ font-weight:700; color:var(--ink); font-size:12px; margin-right:2px; }
  .qb-cite{ display:inline-block; color:var(--blue-2); font-weight:600; font-size:12px; text-decoration:none;
    border-bottom:1px solid var(--line); word-break:break-word; }
  .qb-none{ font-style:italic; color:var(--faint); }
  /* PER-ENGINE block inside a card — ChatGPT / Gemini / AI Overview told apart. Each engine is a
     sub-row with a small caps name + its own named/not badge, then who it named and its sources. */
  .qb-engines{ margin-top:10px; display:flex; flex-direction:column; gap:9px; }
  .qb-eng{ padding-top:9px; border-top:1px dashed var(--line); }
  .qb-eng:first-child{ padding-top:0; border-top:none; }
  .qb-eng-head{ display:flex; align-items:center; gap:9px; }
  .qb-eng-name{ font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--blue); }
  .qb-eng-empty{ font-size:11px; font-style:italic; color:var(--faint); }
  .qb-badge.sm{ font-size:9px; padding:2px 7px; }
  .qb-eng-line{ margin-top:5px; font-size:12.5px; line-height:1.75; color:var(--muted); }
  /* INTERNAL winnability chip — only rendered in the operator preview (d.internal), never on the
     client document. A tinted strip so it reads as a separate, internal annotation. */
  .qb-win{ margin-top:10px; padding:8px 10px; border-radius:8px; border:1px dashed var(--line-strong);
    background:var(--panel-tint); display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
  .qb-win-chip{ font-size:10px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
    padding:2px 8px; border-radius:999px; color:var(--on-band); }
  .win-named .qb-win-chip{ background:var(--green); }
  .win-wide_open .qb-win-chip{ background:var(--green); }
  .win-locked .qb-win-chip{ background:var(--red); }
  .win-informational .qb-win-chip{ background:var(--blue-2); }
  .win-unclear .qb-win-chip{ background:var(--faint); }
  .qb-win-why{ font-size:12px; color:var(--ink); font-weight:600; }
  .qb-win-nums{ font-size:11px; color:var(--muted); width:100%; }

  /* WHY THIS MATTERS &mdash; stakes stats, big coloured numbers, muted supporting text */
  .why{ padding:18px 28px 18px; border-top:1px solid var(--line); }
  h2{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 16px; }
  /* Consistent phase header: tiny eyebrow + human-readable title (pain &rarr; stakes &rarr; solution) */
  .sec-eyebrow{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:0 0 4px; }
  .sec-title{ font-size:22px; line-height:1.15; letter-spacing:-.01em; font-weight:700; color:var(--ink); margin:0 0 16px; }
  /* Solution = THE standout moment: still the biggest/heaviest title, but standard ink/black
     colour (like every other .sec-title) &mdash; it stands out via its band + size, not colour. */
  .dowe .sec-eyebrow{ color:var(--blue); }
  .dowe .sec-title{ font-size:32px; font-weight:700; color:var(--ink); margin:0 0 18px; }
  .stats{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .stat{ display:flex; align-items:flex-start; gap:14px; }
  .stat .big{ font-size:46px; line-height:.9; font-weight:900; letter-spacing:-.03em; color:var(--blue); }
  .stat p{ margin:0; font-size:14px; font-weight:400; color:var(--muted); }
  .stat p .was{ color:var(--red); font-weight:700; font-size:14px; }
  .why-frame{ margin:12px 0 0; font-size:17px; font-weight:700; color:var(--ink); max-width:64ch; }
  .src{ margin-top:6px; font-size:11px; font-weight:400; color:var(--faint); }

  /* WHAT WE DO &mdash; the solution reveal (the money section): a tinted full-width band with a
     heavy brand-blue top rule so it visibly BREAKS from the section above; white card inside. */
  /* STILL MEASURING — replaces the hero, "who AI named", the website slot and the fix section
     while a run is in flight. Amber, not red: nothing is wrong, it is simply not finished. */
  .measuring,.namecheck{ margin:0 28px 20px; padding:18px 22px; border:1px solid var(--amber); border-left-width:6px; border-radius:12px; background:var(--amber-tint); }
  .measuring .sec-eyebrow,.namecheck .sec-eyebrow{ color:var(--amber); }
  .measuring .sec-title,.namecheck .sec-title{ font-size:24px; font-weight:700; color:var(--ink); margin:0 0 10px; }
  .measuring p,.namecheck p{ margin:0 0 8px; font-size:14px; line-height:1.55; color:var(--muted); max-width:70ch; }
  .measuring .measuring-progress{ color:var(--ink); }
  .measuring .measuring-progress b{ font-size:16px; }
  /* THE EXPLAINER BESIDE THE THREE STEPS. The video is 1080x1920 (vertical), so it takes its own
     narrow column and the steps stack beside it; on a phone it sits above them. */
  .vid-row{ display:flex; gap:22px; align-items:flex-start; }
  .vid{ flex:0 0 196px; }
  .vid video{ display:block; width:196px; aspect-ratio:9/16; border-radius:12px; background:var(--video-bg); box-shadow:0 4px 18px rgba(15,23,42,.14); }
  .vid .vid-poster{ display:none; }
  .vid-row .steps{ flex:1; grid-template-columns:1fr; gap:14px; }
  .vid-row .steps::before{ display:none; }
  /* Icon in the first column; label, title and copy STACKED in the second. (A flex row here put
     the title in its own narrow column and wrapped it one word per line — seen in the render check.) */
  .vid-row .step{ text-align:left; display:grid; grid-template-columns:46px minmax(0,1fr); column-gap:12px; align-items:start; }
  .vid-row .step-ic{ margin:0; grid-column:1; grid-row:1 / span 3; }
  .vid-row .step-n, .vid-row .st, .vid-row .step p{ grid-column:2; }
  .dowe{ padding:22px 28px 24px; border-top:3px solid var(--blue); background:var(--page); }
  .dowe h2{ margin-bottom:14px; }
  .dowe-panel{ background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:18px 22px 20px; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .dowe-lead{ font-size:17px; font-weight:700; color:var(--ink); margin:0 0 16px; max-width:64ch; }
  .steps{ position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  /* connecting flow line behind the three icon tiles &rarr; reads as a process */
  .steps::before{ content:""; position:absolute; top:23px; left:16.67%; right:16.67%; height:2px; background:var(--line); z-index:0; }
  .step{ position:relative; text-align:center; }
  .step-ic{ position:relative; width:46px; height:46px; margin:0 auto 13px; z-index:1; }
  .step .ic{ width:46px; height:46px; border-radius:14px; background:var(--blue-tint); color:var(--blue);
    display:flex; align-items:center; justify-content:center; }
  .step .ic svg{ width:25px; height:25px; }
  .badge{ position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%;
    background:var(--blue); color:var(--on-band); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;
    box-shadow:0 0 0 3px var(--paper); }
  .step-n{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); font-weight:700; }
  .st{ font-size:14px; font-weight:700; color:var(--ink); margin:2px 0 5px; }
  .step p{ margin:0; font-size:14px; line-height:1.45; font-weight:400; color:var(--muted); }


  /* WEBSITE SEO &mdash; grade circles + radar + findings (all inline SVG, no chart lib).
     Its own QUIET "chapter": a subtle --page tint for depth in the alternating rhythm
     (white hero/gutbox &rarr; tinted SEO &rarr; white 'why' &rarr; the stronger solution band). Kept
     lighter than .dowe &mdash; no blue rule, no white inner card &mdash; so it never competes with
     the solution peak. The white&rarr;tint bg change is the section separator (with the crisp
     --line top edge); the following white 'why' reopens the rhythm. */
  .seo{ padding:18px 28px 18px; border-top:2px solid var(--ink); border-bottom:2px solid var(--ink); background:var(--page); }
  .seo-intro{ margin:-2px 0 12px; font-size:14px; line-height:1.45; color:var(--muted); font-weight:400; max-width:74ch; }
  .seo-intro b{ font-weight:700; } /* the SEO verdict &mdash; bold accent, same as other numbers/verdicts */
  /* Grades ROW (radar dropped to reclaim height): Overall dominant, then the three
     sub-grades as a tidy secondary row past a hairline divider. Findings sit BELOW, full
     width, so they stay tight (1&ndash;2 lines) instead of wrapping in a narrow column. */
  .seo-body{ /* block wrapper: grades row, then full-width findings */ }
  .seo-grades{ display:flex; align-items:center; gap:20px; flex-wrap:wrap; }
  .seo-grade-split{ flex:0 0 auto; width:1px; height:80px; background:var(--line-strong); opacity:.55; }
  .seo-cats{ display:flex; gap:14px; flex-wrap:wrap; }
  .gc{ margin:0; text-align:center; }
  .gc svg{ display:block; margin:0 auto; }
  .gc-lbl{ margin-top:6px; font-size:11px; font-weight:700; color:var(--muted); max-width:11ch; line-height:1.2; }
  .gc-score{ margin-top:2px; font-size:11px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
  .seo-overall{ text-align:center; }
  .seo-overall .gc-lbl{ margin-top:8px; font-size:11px; color:var(--ink); font-weight:700; letter-spacing:.02em; }
  /* FINDINGS &mdash; tight full-width rows: a severity dot + bold title + short detail on the same
     flow. No big padded cards; far less vertical space, still reads as the key takeaways. */
  .seo-findings{ list-style:none; margin:12px 0 0; padding:0; }
  .find{ display:flex; gap:9px; padding:7px 0; border-bottom:1px solid var(--line); }
  .find:first-child{ padding-top:0; }
  .find:last-child{ border-bottom:0; padding-bottom:0; }
  .find-dot{ width:8px; height:8px; border-radius:50%; margin-top:5px; flex:0 0 auto; }
  .find-body{ flex:1; }
  .find-title{ font-weight:700; font-size:14px; color:var(--ink); }
  .find-detail{ font-size:14px; font-weight:400; line-height:1.45; color:var(--muted); }

  /* ONE REAL AI ANSWER, RECREATED &mdash; a chat-style card under "Who AI named instead". A visual
     recreation of stored audit data (see chatCard in renderReportHtml), never a screenshot. */
  .chatcard{ margin:0 28px 20px; border:1px solid var(--line); border-radius:14px; background:var(--paper);
    overflow:hidden; box-shadow:0 4px 24px rgba(15,23,42,.06); }
  .cc-head{ display:flex; align-items:center; justify-content:space-between; padding:11px 18px;
    border-bottom:1px solid var(--line); background:var(--page); }
  .cc-engine{ font-size:15px; font-weight:700; color:var(--ink); }
  .cc-date{ font-size:12px; color:var(--faint); }
  /* The question, as the customer would type it &mdash; a right-aligned user bubble. */
  .cc-q{ margin:16px 18px 0 auto; max-width:82%; width:fit-content; background:var(--blue-tint);
    color:var(--ink); font-size:14px; font-weight:600; padding:10px 14px; border-radius:14px 14px 4px 14px; }
  /* The AI's answer &mdash; a left-aligned assistant bubble. */
  .cc-a{ margin:12px 18px 0; max-width:88%; background:var(--page); border:1px solid var(--line);
    border-radius:4px 14px 14px 14px; padding:12px 14px; }
  .cc-atext{ margin:0; font-size:14px; line-height:1.55; color:var(--ink-2); }
  .cc-firms{ margin-top:10px; display:flex; flex-wrap:wrap; gap:6px; }
  .cc-firms .rv{ color:var(--red); font-weight:700; font-size:13px; }
  /* The truthful callout &mdash; only ever rendered for an answer that did NOT name the business. */
  .cc-callout{ display:flex; align-items:center; gap:9px; margin:16px 18px 18px; padding:11px 14px;
    border-radius:10px; background:var(--red-tint); color:var(--red); font-size:14px; font-weight:700; }
  .cc-bang{ flex:0 0 auto; width:20px; height:20px; border-radius:50%; background:var(--red);
    color:var(--paper); font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; }

  /* CLOSING CTA &mdash; Findable blue band with a yellow highlight */
  .cta{ background:var(--blue); color:var(--on-band); padding:20px 28px 20px; }
  .cta h3{ margin:0 0 7px; font-size:22px; font-weight:700; color:var(--on-band); letter-spacing:-.01em; }
  .cta h3 .y{ color:var(--yellow); }
  .cta p{ margin:0 0 6px; font-size:14px; font-weight:400; color:var(--on-band-muted); max-width:66ch; }
  .cta p b{ color:var(--on-band); font-weight:700; }
  .cta .close{ margin-top:10px; font-size:14px; font-weight:700; color:var(--on-band); }
  /* Contact buttons — side by side, stacking on narrow screens. On-palette (yellow + white). */
  .cta-actions{ display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; }
  /* The promise, under the buttons: read after deciding to look, not competing with the heading. */
  .cta-promise{ margin:16px 0 0; padding-top:14px; border-top:1px solid rgba(255,255,255,.16);
                font-size:13px; line-height:1.55; color:var(--on-band-muted); max-width:66ch; }
  .cta-btn{ display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:13px 22px; border-radius:10px; font-size:15px; font-weight:700; line-height:1;
    text-decoration:none; border:1px solid transparent; }
  .cta-btn.email{ background:var(--yellow); color:var(--blue); }
  /* The primary action. Own class, not .email - that name meant "Email us" and the button is gone. */
  .cta-btn.start{ background:var(--yellow); color:var(--blue); }
  .cta-btn.wa{ background:var(--on-band); color:var(--blue); }
  .cta-btn.site{ background:transparent; color:var(--on-band); box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.45); }

  /* FOOTER &mdash; a distinct darker navy bar so the text is clearly readable (no blue-on-blue) */
  /* THE FOUNDER OFFER reuses .cta wholesale — same navy ground, same yellow accent, same button
     shape. These rules only add the eyebrow, the list and the guarantee panel. A hairline above it
     separates the transaction from the close without introducing a second band colour. */
  .cta.offer{ border-top:1px solid rgba(255,255,255,.16); padding-top:18px; }
  .offer-eyebrow{ color:var(--yellow); margin-bottom:6px; }
  .offer-gets{ margin-top:14px; }
  .offer-gets .offer-h{ font-size:12px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; color:var(--on-band-muted); margin-bottom:6px; }
  .offer-gets ul{ margin:0; padding-left:18px; max-width:66ch; }
  .offer-gets li{ font-size:14px; line-height:1.55; color:var(--on-band); margin-bottom:4px; }
  .offer-gtee{ margin-top:16px; border-left:3px solid var(--yellow); padding:10px 14px;
    background:rgba(255,255,255,.06); font-size:13px; line-height:1.55; color:var(--on-band-soft);
    max-width:70ch; border-radius:0 6px 6px 0; }
  .offer-after{ margin:10px 0 0; font-size:12.5px; color:var(--on-band-muted); max-width:66ch; }
${REPORT_CHROME_CSS_FOOT}

  /* MOBILE (~phones) — the report is opened mostly on phones via a WhatsApp link. Stack the
     multi-column sections, fix the hero's non-shrinking number block, make the CTA full-width
     tappable, and reclaim width by trimming the 28px side padding. Desktop/tablet + print
     (below) are untouched. */
  @media (max-width:560px){
    .sheet{ margin:12px; }
    /* Reclaim width: 28px side padding → 18px on every full-bleed section. */
    .band{ padding-left:18px; padding-right:18px; }
    .explainer{ padding-left:18px; padding-right:18px; }
    .hero{ padding-left:18px; padding-right:18px; }
    .gutbox{ margin-left:18px; margin-right:18px; }
    .chatcard{ margin-left:18px; margin-right:18px; }
    .why{ padding-left:18px; padding-right:18px; }
    .dowe{ padding-left:18px; padding-right:18px; }
    .seo{ padding-left:18px; padding-right:18px; }
    .cta{ padding-left:18px; padding-right:18px; }
    .site-foot{ padding-left:18px; padding-right:18px; }
    /* 1 · Hero stacks: number+caption on top, verdict below; drop the vertical rule. */
    .hero{ flex-direction:column; gap:14px; }
    .hero-num{ align-items:flex-start; }
    .hero-rule{ display:none; }
    .num{ font-size:72px; }
    /* 2 · Fix steps → single column; hide the horizontal connector line. The video stacks above. */
    .steps{ grid-template-columns:1fr; gap:14px; }
    .steps::before{ display:none; }
    .vid-row{ flex-direction:column; align-items:center; }
    .measuring,.namecheck{ margin-left:18px; margin-right:18px; }
    /* 3 · Stakes stats → single column. */
    .stats{ grid-template-columns:1fr; }
    /* 4 · Contact buttons → stacked, full-width, comfortable tap target. */
    .cta-actions{ flex-direction:column; }
    .cta-btn{ width:100%; min-height:44px; }
    /* 6 · Hide the stray vertical grade divider when the SEO grades wrap. */
    .seo-grade-split{ display:none; }
  }

${REPORT_CHROME_CSS_PRINT}
  @media print{
    /* Audit-specific print rules ON TOP of the shared chrome print CSS above: force the section
       tints/CTA/dots to colour-print and keep the audit blocks unsplit. */
    .hero,.gutbox,.why,.dowe,.cta,.seo,.find-dot,.step .ic{
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    .hero,.gutbox,.why,.dowe,.cta,.seo{ break-inside:avoid; }
    .steps,.stats,.seo-grades,.seo-body,.dowe-panel{ break-inside:avoid; }
    .qb-item{ break-inside:avoid; page-break-inside:avoid; }
  }

  /* ══ 2026-09-16 REDESIGN — faults section, numbered-list chat card, new CTA + footer, darker
     surfaces. Appended so it overrides the base rules above (later wins), the way the mockup did. ══ */
  .fault{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-top:1px solid var(--line)}
  .fault:first-of-type{border-top:0;padding-top:0}
  .fault-dot{width:9px;height:9px;border-radius:50%;background:var(--red);margin-top:6px;flex:0 0 9px}
  .fault-dot--minor{background:var(--amber)}
  .fault-t{font-weight:700;font-size:15px;color:var(--ink);letter-spacing:-.01em}
  .fault-p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--muted);max-width:66ch}

  /* The other questions — a row each, ChatGPT + Gemini markers (green named, red not named). */
  .qlist{padding:4px 28px 18px}
  .qrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
  .qrow-head{border-top:0;padding:0 0 4px}
  .qrow-head .qrow-e{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:700}
  .qrow-q{flex:1;font-size:13.5px;color:var(--ink);line-height:1.35}
  .qrow-e{width:64px;text-align:center;flex:0 0 64px}
  .qm{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:12px;font-weight:800}
  .qm-yes{background:var(--green-tint);color:var(--green)}
  .qm-no{background:var(--red-tint-2);color:var(--red)}
  .qm-na{background:var(--blue-tint);color:var(--faint)}
  @media(max-width:560px){.qlist{padding-left:18px;padding-right:18px}.qrow-e{width:52px;flex-basis:52px}}

  /* Chat card — official mark in the header + as the avatar, a numbered list of the real firms. */
  .cc-body{padding:2px 0 16px}
  .cc-brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:var(--ink)}
  .cc-mark{width:18px;height:18px;border-radius:50%;flex:0 0 18px}
  .cc-arow{display:flex;gap:10px;margin:12px 18px 0;align-items:flex-start}
  .cc-avatar{width:26px;height:26px;border-radius:50%;flex:0 0 26px;margin-top:2px}
  .cc-mark svg,.cc-avatar svg{width:100%;height:100%;display:block}
  .cc-avatar--oai{background:#0d0d0d;border-radius:50%;padding:5px;box-sizing:border-box}
  .cc-mark--oai{background:#0d0d0d;border-radius:6px;padding:3px;box-sizing:border-box}
  .cc-list{margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.55;color:var(--ink-2)}
  .cc-list li{margin:7px 0}
  .cc-head{background:var(--paper)}
  .cc-a{margin:0;max-width:none;background:var(--paper);border-radius:4px 14px 14px 14px;padding:12px 14px}

  /* New footer — brand row, key/value grid, note. */
  .site-foot{background:var(--foot);color:var(--foot-text);padding:26px 28px 22px}
  .foot-top{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.10)}
  .foot-brand{font-size:19px;font-weight:800;letter-spacing:-.02em;color:#fff}
  .foot-dot{color:var(--gold)}
  .foot-cta{font-size:13.5px;font-weight:600;color:var(--gold);text-decoration:none}
  .foot-grid{display:flex;flex-wrap:wrap;gap:26px 44px;padding:16px 0 14px}
  .foot-grid > div{display:flex;flex-direction:column;gap:3px}
  .foot-k{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--foot-muted)}
  .foot-v{font-size:13.5px;font-weight:600;color:#fff}
  .foot-note{font-size:12px;line-height:1.5;color:var(--foot-muted);max-width:62ch;padding-top:13px;border-top:1px solid rgba(255,255,255,.10)}
  @media(max-width:560px){.foot-grid{gap:16px 28px}}

  /* New CTA buttons + site link + one-line fix copy. */
  .fx-p{font-size:13.5px;line-height:1.5;margin:3px 0 0}
  .cta h3{font-size:26px;letter-spacing:-.02em;margin:0 0 18px}
  .cta-actions{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
  .cta-btn.start{background:var(--gold);color:#0d0d0d}
  .cta-btn.call{background:#fff;color:#0d0d0d;border:1px solid transparent;font-family:inherit;cursor:pointer}
  .cta-btn.wa{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.35)}
  .cta-site{display:inline-block;font-size:13.5px;font-weight:600;color:var(--gold);text-decoration:none;margin:0 0 18px}
  .cta-promise{font-size:12.5px;line-height:1.5;color:var(--foot-muted);margin:0;padding-top:14px;border-top:1px solid rgba(255,255,255,.10);max-width:56ch}

  /* Darker surfaces — the old tints were washed out (Paul, 2026-09-16). Overrides, later-wins. */
  :root{ --blue-tint:#dfe3ea; --blue-tint-2:#cfd5df; --page:#eef0f4; --line:#c8cede; }
  body{background:#c3c9d6}
  .chatcard{background:#dfe3ea;border-color:#c0c7d6}
  .cc-head{background:#fff;border-bottom-color:#d3d9e4}
  .cc-a{background:#fff;border-color:#d3d9e4}
  .cc-q{background:#cdd4e2}
  .fault{border-top-color:#d3d9e4}
  .sec-title{margin-bottom:6px}
</style>
</head>
<body>
  <div class="sheet">
    ${renderWaveBand(`AI Visibility Report &middot; ${esc(d.generatedAtLabel)}`)}

    <div class="explainer">We asked AI the kinds of questions customers ask when they&rsquo;re looking for ${article(type)} <b>${esc(type)}</b>, and checked how often <b>${esc(d.businessName)}</b> came up.</div>
${d.measuring ? `
    <!-- STILL MEASURING: every figure below this point is withheld. See AiAuditReportData.measuring. -->
    <section class="measuring">
      <div class="sec-eyebrow">Still measuring</div>
      <div class="sec-title">We&rsquo;re not finished asking yet.</div>
      <p>AI gives different answers to the same question on different days, so we ask every question ${d.measuring.runsTarget === 1 ? "and check the answer" : `${inWords(d.measuring.runsTarget)} times`} before we show you a number &mdash; otherwise the figure would change under you between one visit and the next.</p>
      <p class="measuring-progress"><b>${d.measuring.runsDone} of ${d.measuring.runsTarget}</b> ${plural(d.measuring.runsTarget, "round")} of questions ${d.measuring.runsDone === 1 ? "is" : "are"} complete. Each round takes a few minutes. This page updates itself &mdash; check back shortly.</p>
    </section>` : d.nameNotJudgeable ? `${nameCheckSection}
${seoSlot}
` : d.hook ? `${renderHookSection(d.hook, d.businessName)}
${seoSlot}
` : `
    <!-- HERO -->
    <div class="hero">
      <div class="hero-num">
        <span class="num ${v.band}">${d.named}</span>
        <div class="num-cap">
          <div class="l1">${plural(d.named, "time", "times")} ${esc(d.businessName)} showed up in AI search</div>
          <div class="l2">out of ${d.total} ${plural(d.total, "answer")}</div>
          ${d.questionsAsked && d.enginesUsed
            ? `<div class="l3">${d.questionsAsked} way${d.questionsAsked === 1 ? "" : "s"} of asking &times; ${d.enginesUsed} AI engine${d.enginesUsed === 1 ? "" : "s"}${(d.measurementRuns ?? 1) > 1 ? ` &times; ${d.measurementRuns} asks each` : ""}</div>`
            : ""}
        </div>
      </div>
      <div class="hero-rule"></div>
      <div class="hero-verdict">
        <div class="vk">The verdict</div>
        <div class="punch">${v.punch}</div>
        <div class="punch-sub">${v.sub}</div>
      </div>
    </div>
${chatCard}
${questionsList}
    <!-- ============================================================================
         SEO SECTION SLOT &mdash; renders results.seo when present (overall grade + three
         category grades + a radar of the three scores + the lead findings). With no scan
         it is THREE-WAY on d.hasWebsite: true = "the full check comes with the work",
         false = "we'll build you one", null/unknown = NOTHING. Silence beats a guess: the
         old two-way branch read a blank website column as "no website" and told a business
         with a site that we would build them one (AD Locksmithing, 2026-09-13).
         ============================================================================ -->
${seoSlot}
`}
    <!-- WHY THIS MATTERS / 45% STAKES SECTION: REMOVED from all audits (Paul, 2026-09-16). -->

    <!-- WHAT WE DO (solution) &mdash; the confident turn from problem to fix -->
    <!-- PITCH: hidden in the welcome pack (d.hidePitch) -->
${d.hidePitch || d.measuring ? "" : `
    <section class="dowe">
      <div class="sec-eyebrow">The fix</div>
      <!-- The title names the ARGUMENT this section makes, not an inventory. It read "Here's what we
           do" while the three steps below carried the deliverables; once those became three causal
           claims (it has to exist, be readable, agree with itself) that title described the offer
           block instead. "What's included" is the inventory, a screen below. -->
      <!-- ⛔ CONDITIONAL ON THE BAND, like the SEO lead and the verdict. This said "Why you're not
           in the answer" and opened "Being absent is not bad luck" on a report whose own verdict,
           two sections above, said the business was named once. Three places in one document
           disagreeing about whether the business exists in AI answers is the same fault three times,
           and it is the one a sceptical reader notices first. -->
      <div class="sec-title">${d.nameNotJudgeable ? "What gets you named" : d.named > 0 ? "Where you show up, and where you don&rsquo;t yet" : "Why you&rsquo;re not in the answer"}</div>
      <div class="dowe-panel">
        <p class="dowe-lead">${d.nameNotJudgeable
        ? "Being named consistently is not luck."
        : d.named > 0
        ? "Being named occasionally rather than consistently is not bad luck."
        : "Being absent is not bad luck."} It comes down to <span class="hl">three things</span>, and all three are fixable.</p>
        <!-- ⛔ THREE IDEAS, NO QUANTITIES. THIS SECTION IS THE ARGUMENT, NOT THE INVENTORY.
             It used to carry the deliverables too - "a page for each service you do, in your town",
             "we mark up your details" - which is word for word what "What's included" says in the
             offer block a screen below. The reader met the same list twice and both readings got
             weaker: the argument read like a quote, and the quote read like a repeat.
             So the split is by JOB. Here: why being absent happens and what has to change, as three
             causal claims - it has to exist, it has to be readable, it has to agree with itself.
             There: the countable list someone weighs against the price, which is where "each service,
             each town" and "structured data" belong.
             ⚠️ Keep quantities, deliverables and anything with a number OUT of these three. The moment
             one appears here it is duplicated below, because the offer list is exhaustive by design. -->
        <!-- THE EXPLAINER BESIDE THREE CONCRETE STEPS (Paul, 2026-09-13). This replaced three
             abstract claims ("it quotes pages, not businesses" / "it has to be able to read you" /
             "it has to agree with itself") which read as weak on the document that sells. The three
             steps are now what we MEASURE, what we BUILD and what we RE-MEASURE — the shape of the
             guarantee — and they overlap "What's included" below on purpose: that list is the
             inventory someone weighs against the price, this is the method. Keep quantities and
             prices out of these three; the offer list is exhaustive by design.
             ⛔ VIDEO ON SCREEN, POSTER IN PRINT. The report is also printed to PDF and a PDF cannot
             play video, so the print stylesheet hides the player and shows the poster as a link
             with a caption. The poster is the same 1080x1920 frame the site uses.
             ⛔ NO LENGTH CLAIMED HERE (CLAUDE.md 13b): the file is re-cut in another repo. -->
        <div class="vid-row">
          <div class="vid">
            <video controls preload="metadata" playsinline poster="${esc(REPORT_EXPLAINER_POSTER_URL)}" src="${esc(REPORT_EXPLAINER_VIDEO_URL)}">
              Your browser cannot play this video. <a href="${esc(REPORT_EXPLAINER_URL)}">Watch it at findable.live</a>.
            </video>
            <a class="vid-poster" href="${esc(REPORT_EXPLAINER_URL)}" target="_blank" rel="noopener noreferrer">
              <img src="${esc(REPORT_EXPLAINER_POSTER_URL)}" alt="The Findable explainer video" />
              <span>Watch the explainer at findable.live</span>
            </a>
          </div>
          <div class="steps">
            <div class="step">
              <div class="step-ic"><span class="ic">${icNamed}</span><span class="badge">1</span></div>
              <div class="step-n">What we measure</div>
              <div class="st">How often AI names you</div>
              <p class="fx-p">We ask the questions your customers ask, and record who gets named.</p>
            </div>
            <div class="step">
              <div class="step-ic"><span class="ic">${icListed}</span><span class="badge">2</span></div>
              <div class="step-n">What we build</div>
              <div class="st">Pages AI can quote</div>
              <p class="fx-p">We find the questions you can win, then build new pages or fix your existing ones so AI can read and name you.</p>
            </div>
            <div class="step">
              <div class="step-ic"><span class="ic">${icStruct}</span><span class="badge">3</span></div>
              <div class="step-n">What we re-measure</div>
              <div class="st">The same questions, four weeks on</div>
              <p class="fx-p">Same questions, same engines. You see both numbers.</p>
            </div>
          </div>
        </div>
      </div>
    </section>`}

    <!-- CTA -->
    <!-- PITCH: hidden in the welcome pack (d.hidePitch) -->
    <!-- NOTE FOR THE CTA BELOW, KEPT OUTSIDE THE TEMPLATE LITERAL. It cannot live inside the
         backticked string because naming a variable in backticks TERMINATES THE STRING - the exact
         trap CLAUDE.md section 3 records, and it broke this file for one edit on 2026-09-12.

         WHY THE COPY IS SAFE WITH NO "Get started" BUTTON. startBtn is empty on every render path
         except render-audit-report: there is no offerUrl in the in-app preview, the PDF, the
         before/after iframes or the welcome pack. So the copy has to read correctly without it, and
         it does - the three steps describe what WE do, not steps the reader has to take, and the
         second line points only at the two buttons that ALWAYS render.

         IT DEPENDS ON SOMETHING OUTSIDE THIS REPO, AND IT BRIEFLY POINTED AT NOTHING. "See how it
         works" lands on findable.live, and when this copy first shipped that page had NO VIDEO on
         it - zero video elements, zero iframes, no reference to findable-hook.mp4 - while the file
         itself served a clean 200. It existed only as the WhatsApp template's header asset.
         Fixed the same day: findable-site now has an Explainer section above Pricing. If that
         section is ever removed, this line goes with it.

         AND IT NO LONGER CLAIMS A LENGTH. It said "the two minute explainer"; the file is 49
         SECONDS. Paul offered "60 second" as the alternative and I did not take it - 49 is not 60
         either, and this sentence is deployed from a different repo to the video it describes, so a
         number here goes stale the moment the cut changes and nobody is standing next to it to
         notice. The length IS claimed on findable.live ("under a minute"), which is true at 49s and
         sits directly above the player, where a re-cut cannot be made without seeing it. -->
${d.hidePitch ? "" : `
    <!-- 🔴 STRIPPED BACK TO A HEADING, ONE LINE AND TWO BUTTONS (2026-09-02, Paul's call). What
         was here: "Ready to get started?", three paragraphs, Email us / WhatsApp us / Who we are,
         and directly below it the whole founder-offer block - "first 10 at £49.99", "normally £99",
         a What's included list, the guarantee box and week-eight references. All of it described a
         model that is no longer the offer, on the document a prospect reads first.

         ⛔ THE OFFER BLOCK IS NO LONGER RENDERED AT ALL - founderOfferSection() is not called. Read
         the note above that function before reinstating anything: the report was the only surface
         carrying the per-lead onboarding link, and that link is what made the founder price
         reachable. A bare findable.live URL cannot carry ?lead=, so a visitor arriving this way
         gets the standard funnel. That is the intended trade here - a short honest CTA over a stale
         price - but it IS a funnel change, not just copy.

         ⚠️ Who we are went with it. Email me came BACK on 2026-09-13 (Paul: the report must carry
         an email route), and WhatsApp now points at the personal number, not the Business API line,
         prefilled with the business name, so the one route that was actually used is unchanged. -->
    <section class="cta">
      <h3>Want to be one of the names?</h3>
      <div class="cta-actions">
        ${startBtn}
        ${requestCallBtn}
        <a class="cta-btn wa" href="${waHref}" target="_blank" rel="noopener noreferrer">Ask me anything</a>
      </div>
      <a class="cta-site" href="${esc(REPORT_SITE_URL)}" target="_blank" rel="noopener noreferrer">See how it works at findable.live &rarr;</a>
      <!-- ⛔ THE REFUND SENTENCE IS REMEASURE_CLAIM_SENTENCE, VERBATIM/BYTE-LOCKED (Paul, 2026-09-16).
           The layout changed; the sentence does not. Not the shortened mockup version, not paraphrased
           — it is the promise the checkout and the refunds page carry, and it must read identically. -->
      <p class="cta-promise">${esc(REMEASURE_CLAIM_SENTENCE)}</p>
    </section>`}

    <footer class="site-foot">
      <div class="foot-top">
        <div class="foot-brand">Findable<span class="foot-dot">.</span></div>
        <a class="foot-cta" href="${esc(REPORT_SITE_URL)}" target="_blank" rel="noopener noreferrer">findable.live</a>
      </div>
      <div class="foot-grid">
        <div><span class="foot-k">Prepared for</span><span class="foot-v">${esc(d.businessName)}</span></div>
        <div><span class="foot-k">Report date</span><span class="foot-v">${esc(d.generatedAtLabel)}</span></div>
        <div><span class="foot-k">Measured on</span><span class="foot-v">ChatGPT &amp; Gemini</span></div>
      </div>
      <div class="foot-note">A snapshot of where you stand today. After we make changes we ask the same questions again to show your before and after.</div>
    </footer>
  </div>
${questionDetail}
</body>
</html>`);
}

