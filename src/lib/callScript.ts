/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCRIPT — Paul's tested opener, in sections a rep can glance at mid-call (2026-10-06).

     OPENER → WHAT WE FOUND → FIRST QUESTION → IF THEY USE AN AGENCY → DISCOVERY → WHAT WE DO → PRICE
     → OBJECTIONS

   The opener Paul has tested, said as natural spoken British English, never word-for-word mechanical:
     "Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned A, B and C, but
      not you. I had a look into why they were being named and you weren't, and I found a few potential
      reasons." → the strongest real findings → "More people are using AI to find local businesses now …
      I'm happy to explain what I'd do to give you a much better chance of showing up in those answers."

   ⛔ NEVER IN THE SCRIPT (Paul, 2026-10-06): "It's Paul from Findable", "I messaged you (on WhatsApp)", the
      day or date of an earlier message, "I thought it'd be quicker to explain on the phone". A rep who has
      messaged before is told so in a NOTE beside the script, never in the words they say.
   ⛔ NOTHING INVENTED. Competitors are the stored AI answer's own names (already cleaned and self-excluded
      by coldCallPlaybook.ts) — up to three, and none when there are none. Website points are the stored
      crawl's findings (siteFindings.ts), at most MAX_SPOKEN_FINDINGS, each said in plain words that make
      the SAME claim as the finding. No strong finding → NO_STRONG_ISSUE_LINE, never a made-up fault.
   ⛔ THE ENGINE IS SAID THE WAY THE PRODUCT SAYS IT: Gemini is "Google AI" (hookScore.HOOK_ENGINE_LABELS via
      coldCallPlaybook.spokenEngine); a result from ChatGPT is said as ChatGPT — never a claim about an
      engine that was not asked.
   ⛔ THE FIRST QUESTION IS ALWAYS FIRST_QUESTION, and the agency branch asks the contract, then — lightly —
      the cost. The PRICE ANGLE appears only above AGENCY_PRICE_ANGLE_OVER_GBP a month AND above our own
      monthly, so it can never claim Findable is cheaper when it is not. Never knock their agency.
   ⛔ EVERY FIGURE IS A CONSTANT (findableOffer.ts, clientTimeline.ts). Optimise = six payments then they
      stop; Build = twelve, then FINDABLE_CONTINUING_GBP for hosting and monitoring (v4, 2026-10-06).
   Pure. No React, no fetch, no clock.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, REMEASURE_WEEKS_STANDARD,
  continuingServiceAfterTerm, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';
import { ACCESS_DEADLINE_DAYS, FALLBACK_START_WEEKS, REFUND_WINDOW_DAYS } from './clientTimeline.ts';
import { SALES_DOMAIN_LINE } from './domainAuthority.ts';
import type { FindingKind } from './siteFindings.ts';
import type { SiteSource } from './leadWebsiteKind.ts';
import { GUARANTEE_SPOKEN, type CallClose, type CallRouteOffer } from './callClose.ts';
export { GUARANTEE_SPOKEN };

/* ── The fixed lines ───────────────────────────────────────────────────────────────────────────── */

/** ⛔ ALWAYS the first discovery question (Paul, 2026-10-06). */
export const FIRST_QUESTION = 'Do you manage the website yourself, or does an agency do it?';
export const AGENCY_CONTRACT_QUESTION = 'Are you still tied into a contract with them?';
export const AGENCY_COST_QUESTION = "If you don't mind me asking, roughly what are you paying them?";
/** The agency spend (£ a month) above which the price angle may be offered — "more than approximately £100". */
export const AGENCY_PRICE_ANGLE_OVER_GBP = 100;
export const PRICE_ANGLE_LINE = "That's useful to know. Depending on what they're actually doing for you, we may be able to improve the AI side and still come in cheaper than what you're paying now.";
/** Website points said on the call. Three is a sentence a person can follow; more is an audit. */
export const MAX_SPOKEN_FINDINGS = 3;
/** Said when the crawl found nothing strong — never a made-up fault (Paul's wording). */
export function noStrongIssueLine(hasRivals: boolean): string {
  return "I couldn't see one huge technical fault on the site — the bigger issue is that the public evidence about the business isn't strong enough for AI to consistently pick you over " + (hasRivals ? 'those other companies' : 'the companies it does name') + '.';
}
export const BRIDGE_LINE = "More people are using AI to find local businesses now, and this is exactly what we specialise in — getting the public information about a business into a shape where AI systems can properly understand and surface it.";
export const WHAT_WE_DO_LINE = `We measure where you're showing up now, fix the public evidence around the business and the website, then ask the same customer-style questions again after ${REMEASURE_WEEKS_STANDARD === 4 ? 'four' : REMEASURE_WEEKS_STANDARD} weeks.`;
export const DISCOVERY_QUESTIONS: readonly string[] = [
  'Where does most of your work come from at the moment?',
  'Which jobs would you most like more of?',
  'Which areas or towns matter most to you?',
  'Are you the one who makes the decisions on the website and marketing?',
];

/* ── What a finding is, said out loud ─────────────────────────────────────────────────────────────
   Each line makes the SAME claim as siteFindings.ts's finding for that kind — plainer, never stronger,
   never a cause. A new FindingKind without a line here falls back to the finding's own words. */
const SPOKEN_FINDING: Partial<Record<FindingKind, string>> = {
  sitemap_wrong_domain: 'The map of your site that Google reads is pointing at a different web address, so it isn\'t clear which site is really yours.',
  canonical_off_domain: 'Google and AI crawlers are being told conflicting versions of one of your main pages — it says a different website is the real one.',
  schema_wrong_domain: 'The business details built into your site point at a different web address to the one you use, so what AI reads about you doesn\'t match up.',
  noindex_important_page: 'One of your main pages is set to tell Google to leave it out of search.',
  crawler_blocked: 'Your site is turning away some of the AI search crawlers, so they can\'t read it properly.',
  unreadable_homepage: 'When an AI crawler opens your homepage it sees hardly any text, so there\'s very little for it to work with.',
  duplicate_pages: 'A lot of your town and service pages are near enough the same, so nothing clearly tells AI which jobs and areas you really cover.',
  thin_pages: 'Your service pages are pretty light on detail — there isn\'t much explaining what you actually do and where.',
};
const HOMEPAGE_THIN_LINE = 'Your homepage is really light on detail, so there isn\'t much there for AI to work with.';

export interface ScriptFinding { kind: FindingKind; title: string; explanation: string }

/** One finding as a spoken sentence (the homepage-only thin page is said as the homepage). */
export function spokenFinding(f: ScriptFinding): string {
  if (f.kind === 'thin_pages' && /^homepage/i.test(f.title)) return HOMEPAGE_THIN_LINE;
  return SPOKEN_FINDING[f.kind] ?? f.explanation;
}

/* ── The input ─────────────────────────────────────────────────────────────────────────────────── */
export interface CallScriptInput {
  /** "a plumber in Rugby" — the search said plainly (coldCallPlaybook builds it). */
  searchFor: string;
  /** The engine as said aloud ("Google AI", "ChatGPT"). */
  engine: string;
  evidenceKind: 'gap' | 'named' | 'none';
  /** The stored answer's real competitor names, cleaned, self-excluded; only the first three are said. */
  competitors: readonly string[];
  auditStale: boolean;
  findings: readonly ScriptFinding[];
  /** Why the findings list is what it is (coldCallPlaybook.FindingsStatus). */
  findingsStatus: 'findings' | 'no_website' | 'profile' | 'not_crawled' | 'crawl_stale' | 'unreadable' | 'clean';
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
  found: { lines: string[]; note: string | null };
  bridge: string[];
  firstQuestion: { question: string; hint: string | null };
  ifSelf: string[];
  ifAgency: { questions: [string, string]; coaching: string[]; priceAngle: { overGbp: number; line: string; caution: string } };
  discovery: readonly string[];
  whatWeDo: { say: string; ifAsked: string[] };
  price: { routes: CallRouteOffer[]; routeNote: string | null; timing: string[]; fallbackNote: string; guarantee: string; guaranteeCaution: string; closeLine: string };
  objections: Array<{ objection: string; answer: string }>;
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

/* ── The branches after the first question (pure, so each path is testable) ─────────────────────── */
export type WebsiteManager = 'self' | 'agency';

/** Is the price angle allowed for what they pay their agency (£/month)? ⛔ Only above the threshold AND
 *  above our own monthly — so it is never offered where Findable would not actually be cheaper. */
export function priceAngleApplies(agencyMonthlyGbp: number | null | undefined): boolean {
  const n = Number(agencyMonthlyGbp);
  return Number.isFinite(n) && n > Math.max(AGENCY_PRICE_ANGLE_OVER_GBP, FINDABLE_MONTHLY_GBP);
}

/** What the rep says after the answer to FIRST_QUESTION. Agency → the contract, then the cost, then
 *  (only when it applies) the price angle. Self-managed → straight on to discovery. */
export function afterFirstQuestion(answer: WebsiteManager, agencyMonthlyGbp: number | null = null): { say: string[]; priceAngle: string | null; next: 'discovery' } {
  if (answer === 'self') return { say: ['Good, that makes it simpler — with your access we can work on the site directly.'], priceAngle: null, next: 'discovery' };
  return {
    say: [AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION],
    priceAngle: priceAngleApplies(agencyMonthlyGbp) ? PRICE_ANGLE_LINE : null,
    next: 'discovery',
  };
}

/* ── The script ────────────────────────────────────────────────────────────────────────────────── */
export function buildCallScript(i: CallScriptInput): CallScript {
  const top = i.competitors.slice(0, 3);
  const rivals = top.length > 0;
  const asked = 'Hi mate, I was looking for ' + i.searchFor + ', so I asked ' + i.engine;

  /* OPENER, line 1 — the AI result, from the stored answer only. */
  const opener: string[] = [];
  if (i.evidenceKind === 'gap') {
    opener.push(rivals
      ? asked + (i.auditStale ? ', and when I checked it mentioned ' : ' and it mentioned ') + joinNames(top) + ', but not you.'
      : asked + ', and you didn\'t come up in the answer it gave.');
  } else if (i.evidenceKind === 'named') {
    opener.push(asked + ' and it did mention you, which is good.');
  } else {
    opener.push('Hi mate, I look at how local businesses come up when people ask Google AI for things like ' + i.searchFor + ', and I wanted to see how you show up.');
  }

  /* OPENER, line 2 + WHAT WE FOUND — only what the stored crawl (or the lack of a site) supports. */
  const why = i.evidenceKind === 'gap'
    ? (rivals ? 'I had a look into why they were being named and you weren\'t' : 'I had a look into why you weren\'t coming up')
    : null;
  const spoken = i.findings.slice(0, MAX_SPOKEN_FINDINGS).map(spokenFinding);
  const found: string[] = [];
  let foundNote: string | null = null;
  if (i.findingsStatus === 'findings' && spoken.length) {
    if (why) opener.push(why + ', and I found ' + (spoken.length > 1 ? 'a few potential reasons.' : 'one thing that could be part of it.'));
    else if (i.evidenceKind === 'named') opener.push('I had a look at your site to see how solid that is, and found ' + (spoken.length > 1 ? 'a few things' : 'one thing') + ' that could make it more consistent.');
    else opener.push('I had a quick look at your website as well, and ' + (spoken.length > 1 ? 'a few things' : 'one thing') + ' stood out.');
    spoken.forEach((line, n) => found.push(n > 0 && n === spoken.length - 1 ? 'And ' + line.charAt(0).toLowerCase() + line.slice(1) : line));
  } else if (i.findingsStatus === 'no_website') {
    opener.push((why ? why + ', and the first thing I noticed' : 'The first thing I noticed') + ' is I couldn\'t find a website for you.');
    found.push('Without a site of your own there\'s a lot less for AI to go on about what you do and where you work.');
    foundNote = 'No website on file. Never say AI cannot name a business without one — it sometimes does.';
  } else if (i.findingsStatus === 'profile') {
    opener.push((why ? why + ', and I could only find' : 'I could only find') + ' your ' + (i.site.label ?? 'directory') + ' profile, not a site of your own.');
    found.push('That page belongs to ' + (i.site.label ?? 'the directory') + ', so there\'s a lot less for AI to go on about what you do and where.');
    foundNote = 'Never call the profile their website.';
  } else if (i.findingsStatus === 'clean' && i.evidenceKind === 'gap') {
    opener.push(why + '.');
    found.push(noStrongIssueLine(rivals));
    foundNote = 'The crawl found no strong website issue — do not invent one.';
  } else {
    foundNote = i.findingsStatus === 'clean'
      ? 'The crawl found no strong website issue — do not invent one.'
      : 'No usable website check for this lead, so say nothing about the site. Keep to the AI result.';
  }

  const bridge = [
    BRIDGE_LINE,
    i.evidenceKind === 'named'
      ? 'I\'m happy to explain what I\'d do to make sure you keep showing up, across more of the searches people make.'
      : i.evidenceKind === 'none'
        ? 'I\'m happy to run a quick check on what it says about you, and explain what I\'d do.'
        : 'I\'m happy to explain what I\'d do to give you a much better chance of showing up in those answers.',
  ];

  const firstQuestion = {
    question: FIRST_QUESTION,
    hint: i.site.source === 'none'
      ? 'No website on file. If they say they haven\'t got one, that\'s the Findable Build conversation.'
      : i.site.source === 'directory_profile' || i.site.source === 'social_profile'
        ? 'Only a ' + (i.site.label ?? 'profile') + ' page on file. If that\'s all they\'ve got, that\'s the Findable Build conversation.'
        : null,
  };

  const ifAgency = {
    questions: [AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION] as [string, string],
    coaching: [
      'Ask the second one lightly, once they\'ve answered the first — you\'re working out what fits, not auditing them.',
      'Never knock their agency, and never suggest breaking a contract.',
      SALES_DOMAIN_LINE + ' If the agency owns the domain, or they don\'t know, flag it to Paul and promise nothing.',
    ],
    priceAngle: {
      overGbp: AGENCY_PRICE_ANGLE_OVER_GBP,
      line: PRICE_ANGLE_LINE,
      caution: `Only if they pay more than about £${AGENCY_PRICE_ANGLE_OVER_GBP} a month. Ours is £${FINDABLE_MONTHLY_GBP} a month during the term — never say we're cheaper unless that's true for the plan that fits them.`,
    },
  };

  const whatWeDo = {
    say: WHAT_WE_DO_LINE,
    ifAsked: [
      'We use 20 approved customer-style questions — the kind of thing a customer actually asks — on ChatGPT and Google AI, three times each.',
      'At the re-check we ask exactly the same questions again, so the before and after are like for like.',
    ],
  };

  const n = (r: ServiceRoute) => totalPaymentsFor(r);
  const price = {
    routes: i.close.routes,
    routeNote: i.close.routeNote,
    timing: [
      `£${FINDABLE_SETUP_PRICE_GBP} today.`,
      'Once we\'ve got the access we need, we measure where you are, do the work and send your results at about four weeks.',
      `You then have ${REFUND_WINDOW_DAYS} days to claim the £${FINDABLE_SETUP_PRICE_GBP} back if the number hasn't gone up.`,
      `The first monthly £${FINDABLE_MONTHLY_GBP} is the day after that.`,
    ],
    fallbackNote: `Only if they ask: if we never get the access we need within ${ACCESS_DEADLINE_DAYS} days, the guarantee falls away and the monthly starts the day after ${FALLBACK_START_WEEKS} weeks from the £${FINDABLE_SETUP_PRICE_GBP} (agreement clauses 5.6 and 5.8).`,
    guarantee: GUARANTEE_SPOKEN,
    guaranteeCaution: i.close.guarantee.caution,
    closeLine: i.close.closeLine,
  };

  /* OBJECTIONS — spoken answers, short enough to say mid-call. Every figure is a constant. */
  const buildAfter = continuingServiceAfterTerm('build')
    ? `£${FINDABLE_CONTINUING_GBP} a month after that for hosting and monitoring, until you cancel`
    : 'nothing more after that';
  const objections = [
    { objection: 'Why £' + FINDABLE_SETUP_PRICE_GBP + '?', answer: `The £${FINDABLE_SETUP_PRICE_GBP} covers measuring where you are now, the first round of work and the re-check at four weeks. If the number hasn't gone up by then, you get it back.` },
    { objection: 'Why six payments?', answer: `That's Findable Optimise, where you keep your own website. We do the first measurement, fix the visibility and the evidence on your site, then re-measure it. It's ${n('optimise')} payments including today. The ${n('optimise')}th is the last, we keep working for one more month after it, and there's no ongoing charge.` },
    { objection: 'Why twelve payments?', answer: `That's Findable Build. We build the new website, host it and look after it through the minimum term — ${n('build')} payments including today — and after that the site's yours.` },
    { objection: 'What happens after?', answer: `On Optimise, nothing more to pay — the ${n('optimise')}th £${FINDABLE_MONTHLY_GBP} payment is the last, we do one final month of work, then it finishes. On Build, it's ${buildAfter}.` },
    { objection: 'I already have an agency', answer: 'Fair enough — what do they look after for you at the moment? Are you still in a contract with them, and roughly what does it cost? (Ask first, answer after.)' },
    { objection: 'I need to think about it', answer: 'Of course — is it mainly the price, the timing, or you\'re just not sure what we\'d actually be doing?' },
    { objection: 'Is this a scam?', answer: 'Fair question. You sign a written agreement before you pay anything, all the terms are written down at findable.live, and ' + (i.hasReport ? 'I can send you the report showing exactly what AI said' : 'you\'ll see exactly what AI said before anything else happens') + '. Have a look at the site first if you like.' },
    { objection: 'Can I cancel?', answer: `It's a minimum term: ${n('optimise')} payments on Optimise, ${n('build')} on Build, including today. If you stop early the rest are still due. The exception is the guarantee — if the number hasn't gone up, a valid claim gets your £${FINDABLE_SETUP_PRICE_GBP} back and ends it. After that, Optimise finishes a month after the last payment, and on Build you can cancel the £${FINDABLE_CONTINUING_GBP} hosting with 30 days' notice.` },
    { objection: 'Can you guarantee I\'ll show up?', answer: `No one can promise AI will name you, and I won't. What we do promise is the measurement: if the number hasn't gone up, you get your £${FINDABLE_SETUP_PRICE_GBP} back.` },
    { objection: 'Just send me something', answer: i.hasReport ? 'Sure, I\'ll send you the report — it shows the exact search, what AI said and who it named. Can I give you a ring once you\'ve had a look?' : 'Sure, I\'ll run the check and send it over. Can I give you a ring once you\'ve had a look?' },
    { objection: 'I\'m busy right now', answer: 'No problem. When\'s a better time for a quick ring back?' },
  ];

  return {
    opener,
    openerNote: i.contactedBefore
      ? 'You\'ve been in touch with them before. Don\'t open with it — if they bring it up, that was you.'
      : null,
    found: { lines: found, note: foundNote },
    bridge,
    firstQuestion,
    ifSelf: afterFirstQuestion('self').say,
    ifAgency,
    discovery: DISCOVERY_QUESTIONS,
    whatWeDo,
    price,
    objections,
  };
}

/** Everything the rep might SAY, as one string — what the "never says" tests read. Notes and coaching
 *  are for the rep and are left out. */
export function spokenScriptText(s: CallScript): string {
  return [
    ...s.opener, ...s.found.lines, ...s.bridge, s.firstQuestion.question, ...s.ifSelf,
    ...s.ifAgency.questions, s.ifAgency.priceAngle.line, ...s.discovery, s.whatWeDo.say, ...s.whatWeDo.ifAsked,
    ...s.price.routes.flatMap((r) => r.spoken), ...s.price.timing, s.price.guarantee, s.price.closeLine,
    ...s.objections.map((o) => o.answer),
  ].join('\n');
}
