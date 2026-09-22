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

   🔴 THE SHAPE OF EVERY FINDING IS FIXED: WHAT I FOUND → WHAT IT MEANS → WHY IT AFFECTS AI. A
      tradesperson has to understand the point without knowing a single one of our words. "XML
      sitemap mismatch detected" tells them nothing and makes them feel sold to; "anything following
      it is being sent towards the wrong site" tells them what is actually happening. Every string
      below is written to that rule, and scripts/site-findings.test.ts fails the build if a
      scanner-style phrase reappears.

   ⛔ NO NEWLINES, EVER, AND THAT IS META'S RULE NOT A STYLE CHOICE. A template parameter containing
      a newline, a tab, or 4+ consecutive spaces is rejected with #132018 and the WHOLE send dies —
      four audit_reply sends died exactly that way on 2026-08-12. `templateBodyParams`' forMeta()
      collapses whitespace as a last-resort seatbelt, but a value that ARRIVES clean never depends on
      it. So {{6}} is several sentences on ONE line; the paragraph breaks it reads like in a draft
      cannot survive the wire and are not attempted.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  THIN_WORDS,
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

export interface SiteFinding {
  kind: FindingKind;
  /** The sentence(s) for this finding. One line, no newlines, no markdown, no emoji. */
  text: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Turn the crawl signals into candidate findings, strongest first.
 *
 * Order is the same priority buildFaultLines uses, and for the same reason: a site AI cannot reach
 * or cannot read beats anything about how the pages are written. Each string carries this lead's own
 * number — never a generic phrase, because the number is what proves somebody looked.
 */
export function candidateFindings(s: CrawlSignals): SiteFinding[] {
  if (s.fetchFailed) return [];   // could not read the site at all — we have nothing to say about it
  const out: SiteFinding[] = [];

  if (s.searchBlocked.length) {
    const list = s.searchBlocked.join(', ');
    out.push({
      kind: 'crawler_blocked',
      text: `Your site is blocking ${list}. ${plural(s.searchBlocked.length, 'That is one of the crawlers', 'Those are the crawlers')} AI sends out to read a page when somebody asks it to recommend someone local, and ${plural(s.searchBlocked.length, 'it is', 'they are')} getting turned away at the door. So when AI is deciding who to name, it has read everyone else's site and not yours.`,
    });
  }

  if (s.clientRendered?.flagged) {
    out.push({
      kind: 'unreadable_homepage',
      text: `When AI fetches your homepage it only gets about ${s.clientRendered.visibleChars} characters of actual words out of it. The rest of the page gets built afterwards by code that runs in a visitor's browser, and AI does not run that, so what it is reading is close to a blank page. It cannot tell what you do or where you work from that.`,
    });
  }

  if (s.duplicates) {
    const n = s.duplicates.clusterSize;
    out.push({
      kind: 'duplicate_pages',
      text: `You have got ${n} pages that are about ${s.duplicates.similarityPct}% the same as each other, with the town or the service swapped and the rest of the wording left alone. AI reads those as one page rather than ${n}, so none of them are giving it any real evidence that you actually work in those places.`,
    });
  }

  if (s.thinPages > 0) {
    out.push({
      kind: 'thin_pages',
      text: `${s.thinPages} of your pages ${plural(s.thinPages, 'has', 'have')} less than ${THIN_WORDS} words on ${plural(s.thinPages, 'it', 'them')}. There is not enough written there for AI to lift an answer out of, so even when it does find the page it has got nothing specific about you to repeat back to whoever asked.`,
    });
  }

  return out;
}

/* ── Joining them up so it reads like a person ────────────────────────────────────────────────── */

/* ⛔ THE SECOND AND THIRD FINDINGS GET A TRANSITION, THE FIRST NEVER DOES. Without one the value
   reads as a list with the bullets taken off, which is the exact tell this template exists to
   avoid. With the SAME transition every time it reads as a mail merge the second time anyone
   compares two messages — and prospects in one town do talk to each other. */
const SECOND_TRANSITIONS = [
  'There is another thing too.',
  'I also noticed something else.',
  'The other thing that stood out was this.',
] as const;

const THIRD_TRANSITIONS = [
  'And there is one more.',
  'One last thing as well.',
  'The other thing I spotted was this.',
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

  const assemble = (chosen: SiteFinding[]): string => {
    const parts = [oneLine(chosen[0].text)];
    if (chosen[1]) parts.push(SECOND_TRANSITIONS[seed % SECOND_TRANSITIONS.length] + ' ' + oneLine(chosen[1].text));
    /* A different divisor for the third, so the two transitions vary independently rather than
       moving in lockstep and producing only three distinct messages in the whole book. */
    if (chosen[2]) parts.push(THIRD_TRANSITIONS[(seed >>> 8) % THIRD_TRANSITIONS.length] + ' ' + oneLine(chosen[2].text));
    return oneLine(parts.join(' '));
  };

  /* Drop the WEAKEST finding, not the newest sentence, until it fits. The findings are already in
     priority order, so shortening from the end always keeps the strongest thing we found — and the
     result is always whole sentences. Truncating instead would cut a finding mid-explanation, which
     is the one thing worse than not mentioning it. */
  for (let n = Math.min(max, all.length); n >= 1; n--) {
    const value = assemble(all.slice(0, n));
    if (value.length <= MAX_FINDINGS_CHARS || n === 1) return value;
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
