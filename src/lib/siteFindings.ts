/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE FINDINGS — {{6}} of `ai_site_findings_v2`, written the way Paul talks (2026-09-22).

   The template is audit_followup_fault's successor and the ONLY thing that differs is this variable.
   audit_followup_fault carries ONE crawl-check sentence lifted straight from the report's fault
   list; those sentences are written for a report, beside a red dot and a heading, and out of that
   context they read like a scanner talking to itself. This file turns the SAME signals — no new
   crawl, no new fetch, nothing invented — into two or three findings in plain English.

   ⛔ NOTHING HERE IS A NEW MEASUREMENT. Every finding is read off `CrawlSignals`, which the existing
      `crawl-check` edge function already produces and already stores. If the crawl did not find it,
      it does not get said. There is no inference from absence, no "your site could be improved",
      and no finding this codebase cannot point at a number for.

   ⛔ PURE, AND EDGE-REACHABLE. No fetch, no DOM, no React, no platform globals — the edge functions
      import it with a relative `.ts` path exactly as they import crawlCheck.ts (CLAUDE.md §3).

   🔴 THE SHAPE OF EVERY FINDING IS FIXED:
        WHAT I SAW → WHAT THAT MEANS IN NORMAL ENGLISH → WHY IT MAY MAKE AI VISIBILITY HARDER
      A tradesperson has to understand the point without knowing a single one of our words. "XML
      sitemap mismatch detected" tells them nothing and makes them feel sold to; "anything following
      it is being sent towards the wrong site" tells them what is actually happening. Where a
      technical word is unavoidable it is explained in the same breath, never left standing.

   🔴 AND THE THIRD CLAUSE IS ALWAYS HEDGED, BECAUSE THE HONEST VERSION IS HEDGED. We can see what is
      on a site. We cannot see why Gemini or ChatGPT named somebody else — so "can make it harder",
      "may mean", "gives AI less information to work with". The first version of this file asserted
      an internal decision process ("it has read everyone else's site and not yours", "AI reads
      those as one page", "AI does not run JavaScript"), which is not something we or anyone outside
      those companies has observed. A prospect who knows more than we do spots it immediately, and
      the message stops being a person who looked at their site and becomes somebody guessing.
      scripts/site-findings.test.ts fails the build on both scanner phrasing and absolute claims.

   ⛔ NO NEWLINES, EVER, AND THAT IS META'S RULE NOT A STYLE CHOICE. A template parameter containing
      a newline, a tab, or 4+ consecutive spaces is rejected with #132018 and the WHOLE send dies —
      four audit_reply sends died exactly that way on 2026-08-12. `templateBodyParams`' forMeta()
      collapses whitespace as a last-resort seatbelt, but a value that ARRIVES clean never depends on
      it. So {{6}} is several sentences on ONE line; the paragraph breaks it reads like in a draft
      cannot survive the wire and are not attempted.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  CRAWL_FRESH_MS,
  usableCrawlSignals,
  type CrawlSignals,
} from './crawlCheck.ts';
import {
  selectableEvidence,
  usableSiteEvidence,
  type EvidenceKind,
  type SiteEvidence,
  type SiteEvidenceFinding,
} from './siteEvidence.ts';

/** The Meta-registered template name. Matches WhatsApp Manager exactly — Meta resolves by name and
 *  a near-miss is template-not-found, not a warning. */
export const AI_SITE_FINDINGS_V2 = 'ai_site_findings_v2';

/**
 * ✅ APPROVED BY META 2026-09-25 — the EDITED body (six variables, no report link; see
 * whatsapp-send.ts). While this reads false the template cannot be selected by anything:
 * `getTemplateSendability` and the server's `templateAwaitingApproval` both refuse it, so no
 * operator click and no queue path can put it on the wire. Approval is this ONE line.
 *
 * ⚠️ IT IS NOT INFERRED FROM ANYTHING AND MUST NOT BECOME SO. Meta's approval state is not mirrored
 * into this database and a send is the only thing that discovers it, so the honest answer is a
 * switch a human sets after looking in WhatsApp Manager — never a guess, and never "try it and see",
 * which spends a real message on a real prospect to learn something Paul can read off a screen.
 * Same shape as INITIAL_OPENER_V2_APPROVED and REMEASURE_RESULTS_COPY_APPROVED.
 *
 * ⛔ TURNING IT ON CHANGES NOTHING ELSE. audit_followup_fault keeps its own {{6}}, its own gate and
 * its own behaviour whichever way this reads; the two templates are siblings, not versions, and
 * nothing in this file is reachable from that one.
 */
export const AI_SITE_FINDINGS_V2_APPROVED = true;

/**
 * {{6}} FOR A SITE THAT CRAWLED CLEAN (Paul, 2026-09-25, with the approved body).
 *
 * The approved copy introduces {{6}} with "I checked what AI is seeing:" — it no longer asserts the
 * site is the problem — so a site we crawled successfully and found nothing strong on can be sent it
 * honestly, with THIS line instead of an invented fault.
 * ⛔ ONLY with a successful, fresh, current-version crawl AND a completed audit that measured the
 *    business missing from at least one answer (auditShowsVisibilityGap) — that measured gap is what
 *    "isn't being consistently surfaced" claims. No crawl, a failed crawl or no gap → null, never this.
 */
export const NO_TECHNICAL_FAULT_FINDING =
  "Your site is accessible, but the business isn't being consistently surfaced in AI answers for the searches I checked.";

/** At most this many findings in one message. Three is already a lot to read on a phone, and the
 *  fourth is always the weakest thing we found — which is the one that makes the whole message
 *  sound like a scan rather than a person. */
export const MAX_SITE_FINDINGS = 3;

/**
 * ⛔ THE HARD CEILING ON {{6}}. A WhatsApp template text parameter is capped at 1024 characters and
 * Meta refuses the whole send past it (#131009, "Parameter value is not valid") — the same class of
 * failure as a blank parameter, and just as invisible until a real prospect gets nothing.
 *
 * 900 leaves headroom for the longest realistic value: three findings where the blocked-crawler
 * line lists all four search crawlers ran to 922 characters on the first fixture written for this
 * file, which is already inside the limit but with nothing to spare. When the assembled value is
 * over the cap the LAST (weakest) finding is dropped and it is rebuilt — never truncated mid
 * sentence, because half a sentence is worse than one fewer finding.
 */
export const MAX_FINDINGS_CHARS = 900;

/**
 * The length a THIRD finding has to fit inside to be worth including.
 *
 * ⛔ TWO FINDINGS IS THE NORMAL MESSAGE, NOT THE FALLBACK. Three is only taken when it comfortably
 * fits — comfortably meaning this, well under the hard cap, rather than "technically under it".
 * Somebody reading a cold WhatsApp on a phone between jobs gets through two things that sound like a
 * person looked; the third turns it into a list, and a third that only just squeezes under the Meta
 * limit is exactly the one that does. The weakest finding is DROPPED rather than the wording being
 * squeezed — compressed copy is how this stops sounding like Paul and starts sounding like a tool.
 *
 * ⚠️ WHAT THAT MEANS TODAY, SO THE CONSTANT ABOVE IS NOT MISREAD: each finding now runs about
 * 200-255 characters with its opener, down from 230-320 before the measurements came out of the
 * copy. So THREE now genuinely fit when they are the three shortest, and a site whose findings
 * include the longest one (the homepage) still ships TWO. Both sides are driven in
 * scripts/site-findings.test.ts rather than described, because this is exactly the kind of statement
 * that is true when it is written and quietly false a rewrite later.
 */
export const COMFORTABLE_THREE_CHARS = 720;

/* ── Which signals are strong enough to say out loud ──────────────────────────────────────────── */

/**
 * 🔴 ONLY FOUR OF THE SIX SIGNALS ARE ELIGIBLE, AND LEAVING THE OTHER TWO OUT IS THE POINT.
 *
 * `missingH1` and `noJsonLd` are real, and they belong in the report where they sit beside the rest
 * of the picture. In a WhatsApp message to someone who did not ask for it they are the difference
 * between "he's actually looked at my site" and "this is an automated scan" — nobody has ever
 * changed supplier over a missing heading tag, and `noJsonLd` is already marked `minor` by
 * buildFaultLines itself. Padding to three findings with those two is exactly the failure this
 * template exists to fix.
 *
 * ⛔ SO A LEAD WITH ONLY WEAK FAULTS GETS NO MESSAGE RATHER THAN A WEAK ONE. buildSiteFindings
 *    returns null, the picker refuses the template, and the operator sends audit_followup_call
 *    instead. Failing closed here costs one unsent message; failing open costs the first impression.
 */
export type SignalFindingKind = 'crawler_blocked' | 'unreadable_homepage' | 'duplicate_pages' | 'thin_pages';

/**
 * ⛔ THE DEEP-CRAWL EVIDENCE KINDS JOIN THE SAME UNION RATHER THAN GETTING THEIR OWN (2026-09-22).
 * They are findings in exactly the same sense — one sentence in the same message, chosen by the same
 * rule, recorded under the same name in `findings_shown`. Two parallel unions would mean two
 * selectors, two caps and two places to forget a kind; the union is what lets the length rule, the
 * drop-the-weakest rule and the recorded analytics stay single-sourced.
 */
export type FindingKind = SignalFindingKind | EvidenceKind;

/**
 * One finding, split where the sentence bends.
 *
 * 🔴 `clause` IS DELIBERATELY NOT A SENTENCE. It is written to follow an opener — "One thing that
 *    stood out is …", "The other thing I noticed is …" — so the opener belongs to the JOINER and the
 *    finding never carries one of its own. Any finding can be first or second, and a finding that
 *    brought its own opener produced "There's another thing too. The other thing I noticed is …"
 *    the moment it landed in second place.
 * ⛔ AND IT IS WHY NO FINDING CAN OPEN "I had a look at how the site is being accessed". The
 *    template's own fixed line directly above {{6}} already says "Had a proper look at your site as
 *    well" — a finding repeating it reads like the message lost its place. Openers live in one
 *    place now and that phrase is not among them.
 */
export interface SiteFinding {
  kind: FindingKind;
  /** Follows an opener ending in "is". Lower case, no full stop, no leading transition. */
  clause: string;
  /** The rest: what it means, then why it may make AI visibility harder. Whole sentences. */
  rest: string;
}

/**
 * 🔴 THE WORDS FOR THE DEEP-CRAWL EVIDENCE, AND EVERY RULE THE SIGNAL COPY BELOW OBEYS APPLIES HERE
 *    UNCHANGED. Same shape (what I saw → what it means → why it may matter), same hedging, same
 *    refusal to carry a figure, same fragment-that-follows-an-opener form.
 *
 * ⛔ AND NOT ONE OF OUR WORDS FOR ANY OF IT. "sitemap" survives because it is the name of a file a
 *    prospect can open, and it is explained in the same breath. Everything else is said in plain
 *    English: no canonical, no schema, no markup, no noindex, no directive, no index. A tradesperson
 *    who has to accept a technical term on trust is a tradesperson being sold to.
 *
 * ⚠️ THE FIGURES ARE DELIBERATELY ABSENT HERE TOO, AND THEY EXIST. The evidence block holds the
 *    counts and the offending URLs, and the REPORT prints them — because somebody reading a report
 *    has sat down to it. "34 of 40 URLs in your sitemap" in a cold WhatsApp invites an argument
 *    about the 34.
 */
const EVIDENCE_COPY: Record<EvidenceKind, { clause: string; rest: string }> = {
  sitemap_wrong_domain: {
    clause: "your sitemap is pointing at a different web address to the one the site is actually on",
    rest: "A sitemap is the file that lists your pages for search and AI tools to follow. When it sends them somewhere else, it can give them conflicting information about which website is really yours.",
  },
  canonical_off_domain: {
    clause: "one of your main pages is telling search tools that a different website is the main version of it",
    rest: "That is set inside the page rather than anywhere a visitor would see it. It can create conflicting information about which site is meant to be treated as yours.",
  },
  schema_wrong_domain: {
    clause: "the business details written into the site's code point at a different web address to the one you're using",
    rest: "That part of a page is there to tell software who the business is and where to find it. When it gives another address, it can make the business harder to tie back to one clear website.",
  },
  noindex_important_page: {
    clause: "one of your main pages is marked not to be included in search results",
    rest: "The page looks completely normal to a visitor, but there's a line inside it asking search tools to leave it out. That may mean it isn't there to be picked up when somebody searches for what you do.",
  },
};

/**
 * Turn the crawl signals into candidate findings, strongest first.
 *
 * Order is the same priority buildFaultLines uses, and for the same reason: a site the AI tools may
 * not be able to reach or read at all matters more than how its pages are written.
 *
 * 🔴 EVERY SENTENCE IS HEDGED, AND THAT IS ACCURACY RATHER THAN TIMIDITY. We can see what is on a
 *    site. We CANNOT see why Gemini or ChatGPT named somebody else — nobody outside those companies
 *    can, and the first version of this file said things like "it has read everyone else's site and
 *    not yours" and "AI reads those as one page", which are confident descriptions of a process we
 *    have never observed. A prospect who knows more than we do about how those systems work spots it
 *    instantly, and the whole message stops being a person who looked at their site and becomes
 *    somebody guessing. "can make it harder", "may mean", "gives AI less information to work with"
 *    are what the evidence actually supports, and they are also what a careful tradesperson sounds
 *    like. scripts/site-findings.test.ts fails the build if an absolute claim comes back.
 *
 * ⛔ NO FINDING CARRIES AN OPENER. See SiteFinding above: the opener is the joiner's, because any
 *    finding can be first or second and one that brings its own doubles up when it moves.
 *
 * 🔴 AND NO MEASUREMENT REACHES THE MESSAGE. "91% the same", "under 120 words", "69 characters" —
 *    every one of those is real, and every one of them is a scanner reading its own output aloud. A
 *    tradesperson does not know whether 120 words is a lot, and a precise figure invites an argument
 *    about the figure instead of a conversation about the site. The numbers stay where they are
 *    useful and checkable: the crawl signals, and the report's own fault section, which is written
 *    for somebody sitting down to read it. Here we describe the problem. (THIN_WORDS is no longer
 *    interpolated at all, which also settles CLAUDE.md §4's "never write a cap in prose".)
 */
export function candidateFindings(s: CrawlSignals, evidence: SiteEvidenceFinding[] = []): SiteFinding[] {
  if (s.fetchFailed) return [];   // could not read the site at all — we have nothing to say about it
  const out: SiteFinding[] = [];

  /* ── THE DEEP-CRAWL EVIDENCE, FIRST (2026-09-22) ──────────────────────────────────────────────
     These lead, and the reason is not that they are more technical — it is that a prospect can CHECK
     them. Open the sitemap, look at the address in it; open the page, see it is marked not to be
     listed. The four signal findings below are all true and none of them can be verified without
     taking our word for what a crawler saw. A cold message that can be confirmed in a minute on the
     prospect's own phone is a different kind of message.
     ⛔ ONLY TIER A, ONLY OBSERVED, AND ONLY ONE PER THEME — selectableEvidence has already applied
     all three, so this loop does no filtering of its own. Two of the three domain findings in one
     message is the same complaint twice, which is the padding tell this template exists to avoid. */
  for (const e of evidence) {
    const copy = EVIDENCE_COPY[e.kind];
    if (copy) out.push({ kind: e.kind, clause: copy.clause, rest: copy.rest });
  }

  /* ⛔ ONLY THE SEARCH CRAWLERS, AND ONLY THE ONES THE STORED SIGNAL ACTUALLY NAMES. searchBlocked
     is derived from real fetches by the crawlers that fetch a page for an AI search tool. Training
     crawlers (GPTBot, ClaudeBot, CCBot) are never in it and must never be described as controlling
     search visibility — blocking those is a common, legitimate choice that does not stop a business
     being cited, and saying otherwise would be telling a prospect to undo a decision for no gain.
     ⛔ THE BOT NAMES ARE NOT IN THE MESSAGE. "OAI-SearchBot, PerplexityBot" means nothing to a
     locksmith and reads as jargon dropped in to sound authoritative; singular/plural still carries
     the real shape of what we found. The names are in the report for anyone who wants them.
     ⛔ AND NOTHING IS COMPARED TO GOOGLE. The previous wording said these crawlers may not read the
     site "as reliably as Google can" — we never fetched the site as Googlebot, so that was a
     comparison against a measurement we do not hold. */
  if (s.searchBlocked.length) {
    const one = s.searchBlocked.length === 1;
    out.push({
      kind: 'crawler_blocked',
      clause: one
        ? 'one of the crawlers used by AI search tools is being blocked from the site'
        : 'some of the crawlers used by AI search tools are being blocked from the site',
      rest: "That can give those systems less information from your own website to work with when they're deciding which businesses are relevant.",
    });
  }

  if (s.clientRendered?.flagged) {
    out.push({
      kind: 'unreadable_homepage',
      /* "may be seeing" rather than "sees": we measured what one fetch returned, we did not watch a
         model read it. And no claim about what does or does not execute JavaScript — "gets added
         afterwards" is the part we can actually see. */
      clause: "the homepage is very thin when it's fetched directly",
      rest: 'A lot of what a normal visitor sees gets added afterwards, so some crawlers may be seeing a much emptier version of the site. That can make it harder to clearly pick up what you do and where you work.',
    });
  }

  if (s.duplicates) {
    out.push({
      kind: 'duplicate_pages',
      /* ⚠️ NOT "AI reads those as one page". That is a claim about de-duplication behaviour we have
         never measured. What we can say is what is on the pages and what it does not add. */
      clause: "you've got several pages that are basically the same apart from the town or the service",
      rest: "So although there are quite a few pages, they may not be giving AI much different information about why you're relevant in each area.",
    });
  }

  if (s.thinPages > 0) {
    out.push({
      kind: 'thin_pages',
      /* ⚠️ NOT "not enough for AI to quote you from", and no word count: a threshold we hold is not a
         rule anybody else applies, and quoting it invites an argument about the number. */
      clause: s.thinPages === 1
        ? 'one of the service pages is really light on detail'
        : 'a few of the service pages are really light on detail',
      rest: s.thinPages === 1
        ? 'It mentions the service, but there may not be much useful information there for AI to work with when somebody asks a more specific question.'
        : 'They mention the service, but there may not be much useful information there for AI to work with when somebody asks a more specific question.',
    });
  }

  return out;
}

/* ── Joining them up so it reads like a person ────────────────────────────────────────────────── */

/* ⛔ EVERY FINDING GETS AN OPENER, INCLUDING THE FIRST, AND THE OPENER IS CHOSEN BY POSITION.
   Without one the value reads as a list with the bullets taken off, which is the exact tell this
   template exists to avoid. With the SAME opener every time it reads as a mail merge the second time
   anyone compares two messages — and prospects in one town do talk to each other.

   ⛔ THEY ALL END IN "is" SO THE CLAUSE FOLLOWS IDENTICALLY WHEREVER IT LANDS. That is the whole
   reason a finding is stored as clause + rest rather than as a sentence: the same finding reads
   "One thing that stood out is the homepage is very thin…" in first place and "The other thing I
   noticed is the homepage is very thin…" in second, with nothing rewritten and nothing doubled.

   ⛔ AND NONE OF THEM IS "I had a look…". The template's own fixed line immediately above {{6}}
   already says "Had a proper look at your site as well"; an opener repeating it reads like the
   message lost its place. */
const FIRST_OPENERS = [
  'One thing that stood out is',
  'One thing I noticed is',
  'The main thing that stood out is',
] as const;

const SECOND_OPENERS = [
  'The other thing I noticed is',
  'The other thing that stood out is',
  'Another thing I noticed is',
] as const;

const THIRD_OPENERS = [
  'One last thing I spotted is',
  'And the other thing is',
  'The last thing I noticed is',
] as const;

/* FNV-1a, 32-bit — a few lines, no dependency, byte-stable across engines, so the same lead always
   reads the same message. (openerVariant.ts used to carry a copy for the opener A/B split; the
   split was removed 2026-09-23.) A hash is a primitive, not a rule. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Collapse to the one line Meta will accept. Belt and braces with forMeta() in whatsapp-send.ts:
 *  that one is the last gate for every variable of every template, this one means the value is never
 *  wrong in the first place. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface SiteFindingsOptions {
  /** Anything stable about this lead (its id is the obvious one). Decides which transitions are
   *  used, so the same lead always reads the same message and two different leads usually do not.
   *  Blank is fine — it simply pins everyone to the first phrasing. */
  seed?: string | null;
  /** Lower only for a test. */
  max?: number;
  /** The deep-crawl evidence findings already filtered to Tier A / observed / one-per-theme by
   *  selectableEvidence. Absent or empty → the message is built from the crawl signals alone,
   *  exactly as it was before Phase 1 shipped. */
  evidence?: SiteEvidenceFinding[];
}

/** The finished {{6}} AND the ordered kinds that went into it.
 *  ⛔ THE KINDS ARE THE ANALYTICAL VALUE, NOT THE SENTENCE. A rendered sentence cannot be grouped,
 *  counted or compared across leads, so "which findings actually sell" would be unanswerable from
 *  the text alone. These are what `whatsapp_messages.findings_shown` stores. */
export interface SiteFindingsResult {
  text: string;
  kinds: FindingKind[];
}

/**
 * The finished {{6}}: the strongest two or three findings, joined with natural transitions, on one
 * line — or null when there is nothing strong enough to say.
 *
 * ⛔ NULL IS A REAL ANSWER AND CALLERS MUST TREAT IT AS "DO NOT SEND THIS TEMPLATE". Meta rejects an
 *    empty parameter, so an empty {{6}} does not produce a shorter message, it produces a failed
 *    send. Every caller gates on a non-null value exactly as audit_followup_fault gates on
 *    siteFaultLine.
 */
export function buildSiteFindings(
  signals: CrawlSignals | null | undefined,
  opts: SiteFindingsOptions = {},
): string | null {
  return buildSiteFindingsDetailed(signals, opts)?.text ?? null;
}

/**
 * The same value, with the ordered kinds that produced it.
 *
 * ⛔ THE TEXT AND THE KINDS COME OUT OF ONE ASSEMBLY, NOT TWO. A second function that "worked out"
 * which findings a message had used would be a second copy of the length rule and the drop-the-
 * weakest rule, and the day they drifted `findings_shown` would record findings the prospect never
 * read — which is worse than recording nothing, because it would be believed.
 */
export function buildSiteFindingsDetailed(
  signals: CrawlSignals | null | undefined,
  opts: SiteFindingsOptions = {},
): SiteFindingsResult | null {
  if (!signals) return null;
  const max = Math.max(1, Math.min(opts.max ?? MAX_SITE_FINDINGS, MAX_SITE_FINDINGS));
  const all = candidateFindings(signals, opts.evidence ?? []);
  if (all.length === 0) return null;
  const seed = fnv1a32(String(opts.seed ?? ''));

  /* opener + clause + full stop + the explanation. One shape for all three positions, so a finding
     that moves position is re-opened rather than rewritten. Different shifts of the same hash per
     position, so the openers vary independently instead of moving in lockstep and producing only
     three distinct messages in the whole book. */
  const say = (f: SiteFinding, openers: readonly string[], shift: number): string =>
    oneLine(openers[(seed >>> shift) % openers.length] + ' ' + f.clause + '. ' + f.rest);

  const assemble = (chosen: SiteFinding[]): string => {
    const parts = [say(chosen[0], FIRST_OPENERS, 0)];
    if (chosen[1]) parts.push(say(chosen[1], SECOND_OPENERS, 8));
    if (chosen[2]) parts.push(say(chosen[2], THIRD_OPENERS, 16));
    return oneLine(parts.join(' '));
  };

  /* Drop the WEAKEST finding, not the newest sentence, until it fits. The findings are already in
     priority order, so shortening from the end always keeps the strongest thing we found — and the
     result is always whole sentences. Truncating instead would cut a finding mid-explanation, which
     is the one thing worse than not mentioning it.
     ⛔ AND THE THIRD HAS A TIGHTER BAR THAN THE SECOND. Two findings is the normal message; a third
     is included only when the whole thing still reads short. Everything from two down is held to the
     hard Meta cap alone, because at that point there is nothing left to drop. */
  for (let n = Math.min(max, all.length); n >= 1; n--) {
    const chosen = all.slice(0, n);
    const value = assemble(chosen);
    const limit = n >= 3 ? COMFORTABLE_THREE_CHARS : MAX_FINDINGS_CHARS;
    if (value.length <= limit || n === 1) return { text: value, kinds: chosen.map((f) => f.kind) };
  }
  return null;
}

/* ── Resolving it from what is stored ─────────────────────────────────────────────────────────── */

/** A stored crawl result from either a completed audit run or the lead-level cache — the same shape
 *  crawlCheck.SiteFaultSource uses, restated here so this module does not depend on that one's
 *  fault-line machinery. */
export interface FindingsSource {
  result: {
    version?: number;
    status?: string;
    signals?: CrawlSignals;
    /** Phase 1 deep-crawl evidence. ABSENT ON EVERY ROW WRITTEN BEFORE 2026-09-22 and on every
     *  deliberately shallow crawl, which is why it is optional and why usableSiteEvidence answers []
     *  rather than throwing: an old row must keep producing exactly the message it produced
     *  yesterday, from its signals alone. */
    evidence?: SiteEvidence | null;
    evidenceVersion?: number;
  } | null | undefined;
  createdAtMs: number;
  /** An explicit crawl failure is never usable. */
  complete?: boolean;
}

/**
 * THE ONE RULE for whether `ai_site_findings_v2` may be sent, and what its {{6}} says — read by the
 * picker and by both senders so they can never disagree.
 *
 * 🔴 IT IS STRICTER THAN siteFaultLine IN TWO WAYS, AND BOTH COME FROM THE REGISTERED COPY ITSELF
 *    RATHER THAN FROM TASTE:
 *
 *    · A LEAD WITH NO WEBSITE IS REFUSED. Both {{6}} forms describe their site, and the old body said
 *      "Had a proper look at your site as well". audit_followup_fault handles that
 *      lead with NO_WEBSITE_FAULT_LINE and keeps doing so — this template is not for them.
 *    · A CLEAN SITE gets NO_TECHNICAL_FAULT_FINDING (since the approved body, 2026-09-25) — but only
 *      with a fresh successful crawl AND a measured visibility gap (`auditVisibilityGap`). Without
 *      both it is still refused.
 *
 * ⛔ Returns null for "not this lead", never a placeholder. A placeholder would pass the picker's
 *    non-empty gate and put a generic sentence inside a message whose entire value is that it is
 *    specific.
 */
export function resolveSiteFindings(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
  opts: SiteFindingsOptions & { auditVisibilityGap?: boolean } = {},
): string | null {
  return resolveSiteFindingsDetailed(hasWebsite, auditRunCrawls, leadCrawl, opts)?.text ?? null;
}

/**
 * The same resolution, carrying the ordered kinds for `findings_shown`.
 *
 * ⛔ THE EVIDENCE IS READ UNDER THE SAME FRESHNESS WINDOW AS THE SIGNALS AND UNDER ITS OWN VERSION.
 * A stale crawl describes a site as it was; a pre-Phase-1 row has no evidence key at all. Both come
 * back as "no evidence", the message is built from the signals exactly as before, and nothing about
 * an old row's behaviour changes — which is the whole contract for shipping this without a backfill.
 */
export function resolveSiteFindingsDetailed(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
  opts: SiteFindingsOptions & { auditVisibilityGap?: boolean } = {},
): SiteFindingsResult | null {
  const found = resolveFindingsSource(hasWebsite, auditRunCrawls, leadCrawl);
  if (found) return buildSiteFindingsDetailed(found.signals, { ...opts, evidence: found.evidence });
  /* ⛔ The clean-site line: kinds [] (it names no finding), so findings_shown stays null for it. */
  if (opts.auditVisibilityGap === true && hasCleanCurrentCrawl(hasWebsite, auditRunCrawls, leadCrawl)) {
    return { text: NO_TECHNICAL_FAULT_FINDING, kinds: [] };
  }
  return null;
}

/** A website we successfully read with a fresh, current-version crawl — the same source filters
 *  resolveFindingsSource applies, minus "found something". */
function hasCleanCurrentCrawl(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[],
  leadCrawl?: FindingsSource | null,
): boolean {
  if (!hasWebsite) return false;
  return [...auditRunCrawls, ...(leadCrawl ? [leadCrawl] : [])].some((source) => {
    if (source.complete === false || source.result?.status === 'unavailable') return false;
    const signals = usableCrawlSignals(source.result, source.createdAtMs);
    return !!signals && signals.fetchFailed !== true;
  });
}

/** The stored crawl the findings were read from, with its raw signals and evidence beside the
 *  candidate findings — for a surface that must show the PROOF as well as the words (the Cold Call
 *  Playbook, 2026-09-23). */
export interface ResolvedFindingsSource {
  source: FindingsSource;
  signals: CrawlSignals;
  evidence: SiteEvidenceFinding[];
  /** Strongest first, never empty. */
  candidates: SiteFinding[];
}

/**
 * THE ONE LOOP that decides which stored crawl a lead's findings come from: audit-run crawls first
 * (newest first, as the caller orders them), then the lead-level row; incomplete, unavailable,
 * stale and pre-v2 rows skipped; the first source with at least one strong finding wins.
 *
 * ⛔ resolveSiteFindingsDetailed is written in terms of this, so the WhatsApp {{6}} and the Cold Call
 * Playbook cannot pick different crawls or different findings for the same lead. Behaviour is
 * unchanged: buildSiteFindingsDetailed is null exactly when candidateFindings is empty.
 */
export function resolveFindingsSource(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
): ResolvedFindingsSource | null {
  if (!hasWebsite) return null;
  for (const source of [...auditRunCrawls, ...(leadCrawl ? [leadCrawl] : [])]) {
    if (source.complete === false) continue;
    if (source.result?.status === 'unavailable') continue;
    const signals = usableCrawlSignals(source.result, source.createdAtMs);
    if (!signals) continue;
    const evidence = selectableEvidence(
      usableSiteEvidence(source.result, source.createdAtMs, CRAWL_FRESH_MS),
    );
    const candidates = candidateFindings(signals, evidence);
    if (candidates.length) return { source, signals, evidence, candidates };
  }
  return null;
}

/** True when this lead can be sent the template at all — the picker's gate, single-sourced on the
 *  same function that produces the value, so "offered" and "sendable" cannot come apart. */
export function hasSiteFindings(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
  auditVisibilityGap = false,
): boolean {
  return resolveSiteFindings(hasWebsite, auditRunCrawls, leadCrawl, { auditVisibilityGap }) !== null;
}
