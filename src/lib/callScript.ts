/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCRIPT — Paul's tested opener, in sections a rep can glance at mid-call (2026-10-06,
   sales-team-today release; ported from improve/sales-script-commercial-alignment WITHOUT its v4
   commercial changes — every price, term and "after the term" line here is the LIVE v3 offer).

     SCAN → SAY → ASK → LOG → CLOSE
     OPENER → WHAT WE FOUND → BRIDGE → FIRST QUESTION (→ IF AN AGENCY) → DISCOVERY → WHAT WE DO →
     PLAN (one open at a time) → GUARANTEE → OBJECTIONS (accordion)

   The opener Paul has tested, said as natural spoken British English:
     "Hi mate, I was looking for a plumber in Rugby, so I asked Gemini and it mentioned A, B and C, but
      not you. I had a look into why they were being named and you weren't, and I found a few potential
      reasons." → the website issues as a LIST (2026-10-15): one short line per issue from the ONE website check
      (websiteCheck.ts), CALL_SCRIPT_ISSUE_LINES shown, the rest on a tap → BRIDGE_LINE.

   ⛔ NEVER IN THE SCRIPT (Paul, 2026-10-06): "It's Paul from Findable", "<anyone> from Findable", "I
      messaged you (on WhatsApp)", the day or date of an earlier message, "I thought it'd be quicker to
      explain on the phone". The rep knows who they are; the opener starts with the reason for the call.
      A rep who has messaged before is told so in a NOTE beside the script, never in words they say.
   ⛔ NOTHING INVENTED. Competitors are the stored AI answer's own names (cleaned and self-excluded by
      coldCallPlaybook.ts) — up to three, and none when there are none. Website points are the stored
      website check's issues (websiteCheck.ts), each the issue's own plain title.
      No serious issue → ONE plain line saying so, never a made-up fault. No crawl → nothing about the site.
   ⛔ THE ENGINE IS SAID THE WAY THE PRODUCT SAYS IT: Gemini is "Gemini" (coldCallPlaybook.spokenEngine);
      a ChatGPT miss is said as ChatGPT — never a claim about an engine that was not asked.
   ⛔ THE FIRST QUESTION IS ALWAYS FIRST_QUESTION. The agency branch asks the contract, then — lightly — the
      cost. The PRICE ANGLE appears only above AGENCY_PRICE_ANGLE_OVER_GBP a month AND above our own monthly,
      so it can never claim Findable is cheaper when it is not. Never knock their agency.
   ⛔ EVERY FIGURE IS A CONSTANT (findableOffer.ts, callClose.ts). No price is typed here as a number.
   🔴 v5 (Paul, 2026-10-16): ONE PLAN — Findable Build. Nothing here sells, quotes or recommends Optimise (withdrawn).
      Still tied into a contract with whoever looks after their website → we can't take them on yet (clause 1.6):
      the rep notes when it ends and calls back then. The minimum term is said in PAYMENTS, never months.
   Pure. No React, no fetch, no clock.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP,
  REMEASURE_WEEKS_STANDARD, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';
import { afterTermRepLine, planSpoken } from './planTerms.ts';
import { SALES_DOMAIN_LINE } from './domainAuthority.ts';
import type { FindingKind } from './siteFindings.ts';
import type { InsightKind } from './salesInsights.ts';
import type { ContentTrustKind } from './contentTrust.ts';
import type { SiteSource } from './leadWebsiteKind.ts';
import type { CallClose, CallRouteOffer } from './callClose.ts';
import { issueLine, type WebsiteCheckView } from './websiteCheck.ts';

/* ── The fixed lines ───────────────────────────────────────────────────────────────────────────── */

/** ⛔ ALWAYS the first discovery question (Paul, 2026-10-06). */
export const FIRST_QUESTION = 'Do you manage the website yourself, or does an agency do it?';
export const AGENCY_CONTRACT_QUESTION = 'Are you still tied into a contract with them?';
export const AGENCY_COST_QUESTION = "If you don't mind me asking, roughly what are you paying them?";
/** The agency spend (£ a month) above which the price angle may be offered. */
export const AGENCY_PRICE_ANGLE_OVER_GBP = 100;
export const PRICE_ANGLE_LINE = "Depending on what they're doing for you, we may be able to improve the AI side and still come in cheaper than what you're paying now.";
/** Website points said on the call. ⚠️ 3 → 2 on 2026-10-07 (Paul's brief): one or two strong conversational hooks,
 *  never a list — the evidence behind every point is on the screen for the rep, not in their mouth. */
export const MAX_SPOKEN_FINDINGS = 2;
/** Website issue LINES shown on the call script before "more" (2026-10-15, Paul: a list a caller reads out, most
 *  important first; the rest on a tap). */
export const CALL_SCRIPT_ISSUE_LINES = 5;
/** The one plain line for a checked site with no serious issue, when the check's own headline is not to hand. */
export const CLEAN_SITE_LINE = 'No serious website issues found.';
/** Said after a point that came from the site's own pages (a service, the town, a phone number): the Findable half
 *  of REAL ISSUE → WHY IT MATTERS → HOW WE IMPROVE IT. Once, after the last point, never per point. */
export const FIX_TAIL = "It's the sort of thing we'd fix as part of the work.";
/** Said when the crawl found nothing strong — never a made-up fault. 🔴 REWRITTEN 2026-10-07 (Paul): it used to say "the bigger issue is
 *  the public evidence around the business", which is not what we sell on this call. When the site check finds no issue we say the true,
 *  simple thing — it isn't set up to be found by AI, and a lot of sites aren't — and read the short list of what we make sure a site has. */
export const NO_STRONG_ISSUE_LINE = "I couldn't see anything badly wrong with the site, but it isn't really set up to be found by AI. A lot of sites aren't.";
/** The one spoken sentence of that list (the full list is on the rep's screen). ⛔ Only things the site check really tests (siteFindings.ts). */
export const AI_SETUP_SPOKEN_LINE = "When we set a site up for AI we make sure things like there are no duplicate pages, each service and area has its own clear page, and nothing is stopping AI from reading it.";
/** What we make sure a site has — for the rep's screen, so they can answer "like what?". Each item is something the site check reads. */
export const AI_SETUP_CHECKLIST: readonly string[] = [
  'No duplicate or near-identical pages',
  'A clear page for each service, and for each area you cover',
  'Enough real detail on every service page',
  'A homepage with real text on it, readable by AI crawlers',
  'AI crawlers allowed in (not blocked)',
  'Nothing important hidden from Google',
  'The sitemap, page signals and business details all pointing at your real web address',
];
export const BRIDGE_LINE = "More people are using AI to find local businesses now, and this is what we specialise in.";
const weeksWord = (n: number) => (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] ?? String(n));
/** 🔴 Rewritten 2026-10-07 (Paul: no "improve the public evidence"). Plain words, short enough to say: the
 *  baseline check, the real customer questions, the website work, pages where they help, the same check at
 *  four weeks, then monthly. ⛔ Never a promise of being recommended, cited, ranked or included by AI. */
export const WHAT_WE_DO_LINE = `First we run an AI visibility check to see where you stand today, and find the real customer questions you've got a genuine chance with. `
  + `Then we build you a new website, set up so Google and the AI tools properly understand what you do and where, with pages for your services where they help. `
  + `After ${weeksWord(REMEASURE_WEEKS_STANDARD)} weeks we run the same check again, then keep checking every month, so we can see what's improving and what still needs work.`;
/** ⛔ 2–3 questions, each with a sales purpose. "Where does most of your work come from" is GONE (Paul,
 *  2026-10-06: no use for closing) — scripts/call-script.test.ts fails if it comes back. */
export const DISCOVERY_QUESTIONS: readonly string[] = [
  'Which jobs would you most like more of?',
  'Which towns or areas matter most to you?',
  'Are you the one who makes the decisions on the website and marketing?',
];

/* ── What a finding is, said out loud ─────────────────────────────────────────────────────────────
   Each line makes the SAME claim as siteFindings.ts's finding for that kind — plainer, never stronger,
   never a cause. A new FindingKind without a line here falls back to the finding's own words. */
const SPOKEN_FINDING: Partial<Record<FindingKind, string>> = {
  sitemap_wrong_domain: "The map of your site that Google reads points at a different web address, so it isn't clear which site is really yours.",
  canonical_off_domain: 'Some of the signals about one of your main pages are conflicting — it tells Google a different website is the real one.',
  schema_wrong_domain: "The business details built into your site point at a different web address to the one you use, so what AI reads about you doesn't match up.",
  noindex_important_page: 'One of your main pages is set to tell Google to leave it out of search.',
  crawler_blocked: "Your site is turning away some of the AI search crawlers, so they can't read it properly.",
  unreadable_homepage: "When an AI crawler opens your homepage it sees hardly any text, so there's very little for it to work with.",
  duplicate_pages: "A lot of your town and service pages are near enough the same, so nothing clearly tells AI which jobs and areas you really cover.",
  thin_pages: "Your service pages are pretty light on detail — there isn't much explaining what you actually do and where.",
};
const HOMEPAGE_THIN_LINE = "Your homepage is really light on detail, so there isn't much there for AI to work with.";

/** The proof behind a point, kept so the rep can answer "how do you know?" — pages and the words read. */
export interface ScriptEvidence { urls: string[]; quotes: string[]; signal?: string }

export interface ScriptFinding {
  kind: FindingKind | InsightKind | ContentTrustKind;
  title: string;
  explanation: string;
  /** A point from the site's own pages (salesInsights.ts) arrives already written for speaking. */
  spoken?: string;
  /** What Findable would do about it — for the rep's screen, never read aloud. */
  improvement?: string;
  evidence?: ScriptEvidence;
}

/** The honest positive for a site with no fault worth raising (salesInsights.ts) — said instead of a made-up one. */
export interface ScriptStrongSite { spoken: string; evidence: ScriptEvidence | null }

/** One finding as a spoken sentence (the homepage-only thin page is said as the homepage). */
export function spokenFinding(f: ScriptFinding): string {
  if (f.spoken) return f.spoken;
  if (f.kind === 'thin_pages' && /^homepage/i.test(f.title)) return HOMEPAGE_THIN_LINE;
  return SPOKEN_FINDING[f.kind as FindingKind] ?? f.explanation;
}

/* ── The input ─────────────────────────────────────────────────────────────────────────────────── */
export type FindingsStatus = 'findings' | 'no_website' | 'profile' | 'not_crawled' | 'crawl_stale' | 'unreadable' | 'clean';

export interface CallScriptInput {
  /** "a plumber in Rugby" — the search said plainly (coldCallPlaybook builds it). */
  searchFor: string;
  /** The engine as said aloud ("Gemini", "ChatGPT"). */
  engine: string;
  evidenceKind: 'gap' | 'named' | 'none';
  /** The stored answer's real competitor names, cleaned, self-excluded; only the first three are said. */
  competitors: readonly string[];
  auditStale: boolean;
  findings: readonly ScriptFinding[];
  /** Why the findings list is what it is (coldCallPlaybook.FindingsStatus). */
  findingsStatus: FindingsStatus;
  /** Present only when the pages were read and nothing worth raising was found — see ScriptStrongSite. */
  strongSite?: ScriptStrongSite | null;
  /** THE one website check (src/lib/websiteCheck.ts) — the issue lines are read from it. */
  website?: WebsiteCheckView | null;
  site: { source: SiteSource; label: string | null };
  close: CallClose;
  /** The rep has messaged this lead before — told to the REP as a note, never said in the script. */
  contactedBefore: boolean;
  hasReport: boolean;
}

export interface CallScript {
  opener: string[];
  /** For the rep's eyes only. */
  openerNote: string | null;
  /** The real website reasons, spoken, and a note for the rep (never said). */
  found: { lines: string[]; /** The rest of the issues (and the minor points), shown on a tap. */ more: string[]; /** "Checked 15 Oct · 42 pages read (deep check)". */ coverage: string | null; note: string | null; /** For the rep's screen: what we make sure a site has — set only when the site check found no issue to raise. */ checklist: readonly string[] | null; /** For the rep's eyes only: what each spoken point rests on. */ sources: Array<{ line: string; evidence: ScriptEvidence | null; improvement: string | null }> };
  bridge: string[];
  firstQuestion: { question: string; hint: string | null };
  ifAgency: { questions: [string, string]; coaching: string[]; priceAngle: { overGbp: number; line: string } };
  discovery: readonly string[];
  whatWeDo: string;
  /** The plan the lead's website points to (the rep can switch, where the other applies). */
  plans: { preselected: ServiceRoute; routes: CallRouteOffer[]; note: string | null };
  guarantee: { spoken: string; caution: string };
  objections: Array<{ objection: string; answer: string }>;
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

/* ── The branches after the first question (pure, so each path is testable) ─────────────────────── */
export type WebsiteManager = 'self' | 'agency';

/** Is the price angle allowed for what they pay their agency (£/month)? ⛔ Only above the threshold AND
 *  above our own monthly — so it is never offered where Findable would not actually be cheaper. */
export function priceAngleApplies(agencyMonthlyGbp: number | null | undefined): boolean {
  if (agencyMonthlyGbp === null || agencyMonthlyGbp === undefined) return false;
  const n = Number(agencyMonthlyGbp);
  return Number.isFinite(n) && n > Math.max(AGENCY_PRICE_ANGLE_OVER_GBP, FINDABLE_MONTHLY_GBP);
}

/** What is revealed after the answer to FIRST_QUESTION. Agency → the contract, then the cost, then (only
 *  when it applies) the price angle. Self-managed → straight on to discovery; nothing else to ask. */
export function afterFirstQuestion(answer: WebsiteManager, agencyMonthlyGbp: number | null = null): { ask: string[]; priceAngle: string | null } {
  if (answer === 'self') return { ask: [], priceAngle: null };
  return { ask: [AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION], priceAngle: priceAngleApplies(agencyMonthlyGbp) ? PRICE_ANGLE_LINE : null };
}

/** The plan: ALWAYS Build — since v5 (2026-10-16) the only plan for sale. A client still tied into a contract with their
 *  current provider is not offered another plan; they are not taken on (quickClose.offerFit, declined). */
export function preselectedPlan(_source: SiteSource | null | undefined): ServiceRoute {
  return 'build';
}

/* ── The script ────────────────────────────────────────────────────────────────────────────────── */
export function buildCallScript(i: CallScriptInput): CallScript {
  const top = i.competitors.slice(0, 3);
  const rivals = top.length > 0;
  const asked = 'Hi mate, I was looking for ' + i.searchFor + ', so I asked ' + i.engine;
  /** "it" for one engine, "they" when the evidence names two ("I asked ChatGPT and Gemini and they …"). */
  const it = /\band\b/.test(i.engine) ? 'they' : 'it';

  /* OPENER, line 1 — the AI result, from the stored answer only. */
  const opener: string[] = [];
  if (i.evidenceKind === 'gap') {
    opener.push(rivals
      ? asked + (i.auditStale ? ', and when I checked ' + it + ' mentioned ' : ' and ' + it + ' mentioned ') + joinNames(top) + ', but not you.'
      : asked + " and you didn't come up in the answer it gave.");
  } else if (i.evidenceKind === 'named') {
    opener.push(asked + ' and ' + it + ' did mention you, which is good.');
  } else {
    opener.push('Hi mate, I look at how local businesses come up when people ask AI for things like ' + i.searchFor + ', and I wanted to see how you show up.');
  }

  /* OPENER, line 2 + WHAT WE FOUND — only what the stored crawl (or the lack of a site) supports. */
  const why = i.evidenceKind === 'gap'
    ? (rivals ? "I had a look into why they were being named and you weren't" : "I had a look into why you weren't coming up")
    : null;
  /* ⛔ THE WEBSITE ISSUES ARE A LIST, NOT A SENTENCE (Paul, 2026-10-15). Each line is ONE issue from the ONE website
     check (src/lib/websiteCheck.ts), short enough to read out — the most important first, CALL_SCRIPT_ISSUE_LINES shown,
     the rest (and the minor points) behind a tap. No issues → ONE plain line saying so. Nothing is ever invented. */
  const check = i.website ?? null;
  /* A caller that hands findings without the check (an older caller, a test) gets the same list from the findings. */
  const serious = check?.serious ?? i.findings.map((f) => ({
    id: String(f.kind), severity: 'medium' as const, title: f.title, saw: f.explanation, meaning: '', count: 0, pages: f.evidence?.urls ?? [],
  }));
  const minor = check?.minor ?? [];
  const found: string[] = [];
  let more: string[] = [];
  let foundNote: string | null = null;
  let checklist: readonly string[] | null = null;
  let sources: CallScript['found']['sources'] = [];
  const intro = why ? why + '.' : i.evidenceKind === 'named' ? 'I had a look at your website as well.' : 'I had a quick look at your website as well.';
  if (i.findingsStatus === 'findings' && serious.length) {
    opener.push(intro);
    const shown = serious.slice(0, CALL_SCRIPT_ISSUE_LINES);
    found.push(...shown.map(issueLine));
    more = [...serious.slice(CALL_SCRIPT_ISSUE_LINES), ...minor].map(issueLine);
    sources = shown.map((x) => ({ line: issueLine(x), evidence: { urls: x.pages, quotes: [x.saw] }, improvement: null }));
    foundNote = 'Read the lines as they are — each one was seen on the site (tap a line\'s proof for the page). Say it "may make it harder", never that it is why AI did not name them.';
  } else if (i.findingsStatus === 'no_website') {
    opener.push((why ? why + ', and the first thing I noticed' : 'The first thing I noticed') + " is I couldn't find a website for you.");
    found.push("Without a site of your own there's a lot less for AI to go on about what you do and where you work.");
    foundNote = 'No website on file. Never say AI cannot name a business without one.';
  } else if (i.findingsStatus === 'profile') {
    opener.push((why ? why + ', and I could only find' : 'I could only find') + ' your ' + (i.site.label ?? 'directory') + ' profile, not a site of your own.');
    found.push('That page belongs to ' + (i.site.label ?? 'the directory') + ", so there's a lot less for AI to go on about what you do and where.");
    foundNote = 'Never call the profile their website.';
  } else if (i.findingsStatus === 'clean') {
    /* The pages were read and nothing serious was wrong: ONE plain line, the minor points behind the tap. */
    if (why) opener.push(why + '.');
    found.push(check?.headline ?? CLEAN_SITE_LINE);
    more = minor.map(issueLine);
    if (why) checklist = AI_SETUP_CHECKLIST;
    foundNote = 'The website check found no serious issue — say so plainly and do not invent one.';
  } else {
    foundNote = (check && (i.findingsStatus === 'not_crawled' || i.findingsStatus === 'unreadable') ? check.headline + ' ' : '')
      + 'No usable website check for this lead, so say nothing about the site. Keep to the AI result.';
  }

  const bridge = [
    BRIDGE_LINE + ' ' + (i.evidenceKind === 'named'
      ? "I'm happy to explain what I'd change to make sure you keep showing up, across more of the searches people make."
      : i.evidenceKind === 'none'
        ? "I'm happy to run a quick check on what it says about you, and explain what I'd change."
        : "I'm happy to explain what I'd change to give you a better chance of showing up in those answers."),
  ];

  const firstQuestion = {
    question: FIRST_QUESTION,
    hint: i.site.source === 'none'
      ? "No website on file. If they haven't got one, that's the Findable Build conversation."
      : i.site.source === 'directory_profile' || i.site.source === 'social_profile'
        ? 'Only a ' + (i.site.label ?? 'profile') + " page on file. If that's all they've got, that's the Findable Build conversation."
        : null,
  };

  const ifAgency = {
    questions: [AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION] as [string, string],
    coaching: [
      'Never knock their agency, and never suggest breaking a contract.',
      "If they're still tied into a contract they can't leave, we can't take them on yet: note when it ends and call back then. Never offer anything else instead.",
      "If they're not sure, they need to check before they sign up. The sign-up waits until they confirm they're free.",
      SALES_DOMAIN_LINE + " If the agency owns the domain, or they don't know, flag it to Paul and promise nothing.",
    ],
    priceAngle: { overGbp: AGENCY_PRICE_ANGLE_OVER_GBP, line: PRICE_ANGLE_LINE },
  };

  /* OBJECTIONS — spoken answers, short enough to say mid-call. Every figure is a constant. v5 (2026-10-16): Build only;
     after its payments the site is theirs and £29.99 applies only if they want hosting / maintenance to carry on. */
  const build = totalPaymentsFor('build');
  const objections = [
    { objection: `Why £${FINDABLE_SETUP_PRICE_GBP}?`, answer: `The £${FINDABLE_SETUP_PRICE_GBP} covers measuring where you are now, the first round of work and the re-check at four weeks. If the number hasn't gone up by then, you can claim it back.` },
    { objection: 'How much is it?', answer: planSpoken() },
    { objection: 'I already have an agency', answer: "Fair enough — what do they look after for you at the moment? This is one specific thing: what AI says when someone asks for a business like yours. I can send them what I found too." },
    { objection: 'My agency controls the website / domain', answer: SALES_DOMAIN_LINE + " Your agreement with them is yours to check — I can't advise on that, and we would never ask you to break it." },
    { objection: 'I need to think about it', answer: "Of course — is it mainly the price, the timing, or you're not sure what we'd actually be doing? When's good for a quick ring back?" },
    { objection: 'Is this a scam?', answer: 'Fair question. You read and sign a written agreement before you pay anything, all the terms are at findable.live, and ' + (i.hasReport ? 'I can send you the report showing exactly what AI said.' : "you'll see exactly what AI said before anything else happens.") },
    { objection: 'Can I cancel?', answer: `There's a minimum term of ${build} payments, today's £${FINDABLE_SETUP_PRICE_GBP} included. Once they're made the website is yours, and the hosting carries on afterwards only if you want it: you can cancel that with 30 days' notice. And if the number hasn't gone up at four weeks, a valid claim gets your £${FINDABLE_SETUP_PRICE_GBP} back and stops the monthly too.` },
    { objection: "Can you guarantee I'll show up?", answer: `No one can promise AI will name you, and I won't. What we do promise is the measurement: if the number hasn't gone up on the same questions, you can claim your £${FINDABLE_SETUP_PRICE_GBP} back.` },
    { objection: `Why ${build} payments?`, answer: `That's Findable Build. We build the new website, host it and look after it: ${build} payments including today. ${afterTermRepLine('build')}` },
    { objection: 'Can you just improve my current website?', answer: "That's not something we offer. What we do is build you a new website, set up properly for AI and search from day one, and you can keep your web address." },
    { objection: 'Just send me something', answer: i.hasReport ? "Sure, I'll send you the report — it shows the exact search, what AI said and who it named. Can I give you a ring once you've had a look?" : "Sure, I'll run the check and send it over. Can I give you a ring once you've had a look?" },
    { objection: "I'm busy right now", answer: "No problem. When's a better time for a quick ring back?" },
  ];

  return {
    opener,
    openerNote: i.contactedBefore
      ? "You've been in touch with them before. Don't open with it — if they bring it up, that was you."
      : null,
    found: { lines: found, more, coverage: check?.coverageLine ?? null, note: foundNote, checklist, sources },
    bridge,
    firstQuestion,
    ifAgency,
    discovery: DISCOVERY_QUESTIONS,
    whatWeDo: WHAT_WE_DO_LINE,
    plans: { preselected: preselectedPlan(i.site.source), routes: i.close.routes, note: i.close.routeNote },
    guarantee: { spoken: i.close.guarantee.spoken, caution: i.close.guarantee.caution },
    objections,
  };
}

/** Everything the rep might SAY, as one string — what the "never says" tests read. Notes and coaching
 *  are for the rep and are left out. */
export function spokenScriptText(s: CallScript): string {
  return [
    ...s.opener, ...s.found.lines, ...s.bridge, s.firstQuestion.question,
    ...s.ifAgency.questions, s.ifAgency.priceAngle.line, ...s.discovery, s.whatWeDo,
    ...s.plans.routes.flatMap((r) => r.spoken), s.guarantee.spoken,
    ...s.objections.map((o) => o.answer),
  ].join('\n');
}
