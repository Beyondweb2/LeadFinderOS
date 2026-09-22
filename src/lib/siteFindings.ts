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
  usableCrawlSignals,
  type CrawlSignals,
} from './crawlCheck.ts';

/** The Meta-registered template name. Matches WhatsApp Manager exactly — Meta resolves by name and
 *  a near-miss is template-not-found, not a warning. */
export const AI_SITE_FINDINGS_V2 = 'ai_site_findings_v2';

/**
 * ⛔ SUBMITTED TO META 2026-09-22, NOT YET APPROVED. While this is false the template cannot be
 * selected by anything: the picker labels it as pending and `getTemplateSendability` refuses it, so
 * no operator click and no queue path can put it on the wire. Approval is this ONE line.
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
export const AI_SITE_FINDINGS_V2_APPROVED = false;

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
export type FindingKind = 'crawler_blocked' | 'unreadable_homepage' | 'duplicate_pages' | 'thin_pages';

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
export function candidateFindings(s: CrawlSignals): SiteFinding[] {
  if (s.fetchFailed) return [];   // could not read the site at all — we have nothing to say about it
  const out: SiteFinding[] = [];

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
   reads the same message. openerVariant.ts has its own copy and they are deliberately NOT shared:
   that one's hash is part of the A/B's stability contract (the same lead must keep its arm forever),
   and wiring both to one function would mean a change made for the wording here silently reshuffles
   which prospects are in which arm of a live experiment. A hash is a primitive, not a rule. */
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
  if (!signals) return null;
  const max = Math.max(1, Math.min(opts.max ?? MAX_SITE_FINDINGS, MAX_SITE_FINDINGS));
  const all = candidateFindings(signals);
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
    const value = assemble(all.slice(0, n));
    const limit = n >= 3 ? COMFORTABLE_THREE_CHARS : MAX_FINDINGS_CHARS;
    if (value.length <= limit || n === 1) return value;
  }
  return null;
}

/* ── Resolving it from what is stored ─────────────────────────────────────────────────────────── */

/** A stored crawl result from either a completed audit run or the lead-level cache — the same shape
 *  crawlCheck.SiteFaultSource uses, restated here so this module does not depend on that one's
 *  fault-line machinery. */
export interface FindingsSource {
  result: { version?: number; status?: string; signals?: CrawlSignals } | null | undefined;
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
 *    · A LEAD WITH NO WEBSITE IS REFUSED. The body says "Had a proper look at your site as well" and
 *      "your site is giving AI less clear information to work with than theirs". Sent to somebody who
 *      has no website that is simply a lie, and an obvious one. audit_followup_fault handles that
 *      lead with NO_WEBSITE_FAULT_LINE and keeps doing so — this template is not for them.
 *    · A CLEAN SITE IS REFUSED. audit_followup_fault has CLEAN_SITE_FAULT_LINE for a site we crawled
 *      successfully and found nothing wrong with. Here the surrounding copy has already asserted
 *      that the site is the problem, so there is no sentence that can honestly go in {{6}}. The lead
 *      gets audit_followup_call instead.
 *
 * ⛔ Returns null for "not this lead", never a placeholder. A placeholder would pass the picker's
 *    non-empty gate and put a generic sentence inside a message whose entire value is that it is
 *    specific.
 */
export function resolveSiteFindings(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
  opts: SiteFindingsOptions = {},
): string | null {
  if (!hasWebsite) return null;
  for (const source of [...auditRunCrawls, ...(leadCrawl ? [leadCrawl] : [])]) {
    if (source.complete === false) continue;
    if (source.result?.status === 'unavailable') continue;
    const signals = usableCrawlSignals(source.result, source.createdAtMs);
    if (!signals) continue;
    const findings = buildSiteFindings(signals, opts);
    if (findings) return findings;
  }
  return null;
}

/** True when this lead can be sent the template at all — the picker's gate, single-sourced on the
 *  same function that produces the value, so "offered" and "sendable" cannot come apart. */
export function hasSiteFindings(
  hasWebsite: boolean,
  auditRunCrawls: FindingsSource[] = [],
  leadCrawl?: FindingsSource | null,
): boolean {
  return resolveSiteFindings(hasWebsite, auditRunCrawls, leadCrawl) !== null;
}
