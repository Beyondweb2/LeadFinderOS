/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DEEP-CRAWL FINDINGS WHERE THEY ARE SEEN — {{6}}, `findings_shown`, the gate, and the report.

   scripts/site-evidence.test.ts proves the four findings are DETECTED correctly and not detected
   wrongly. This file covers everything downstream of that:

     1. the new findings can feed {{6}}, and every copy rule the existing four obey applies to them
        UNCHANGED — the scanner phrases, the unsupported-claim phrases, the hedging, the no-digits
        rule, the openers. A new finding written in the old register is exactly the regression this
        template was built to prevent, and it would ship silently.
     2. the ORDERED kinds come back with the sentence, because that is what findings_shown stores and
        a sentence cannot be counted.
     3. the switch is still OFF. Everything here is built; nothing may select it.
     4. the deep-crawl gate, which decides who we spend the crawl on.
     5. the report card, which is where the credibility problem was.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  AI_SITE_FINDINGS_V2,
  AI_SITE_FINDINGS_V2_APPROVED,
  MAX_FINDINGS_CHARS,
  MAX_SITE_FINDINGS,
  buildSiteFindings,
  buildSiteFindingsDetailed,
  candidateFindings,
  resolveSiteFindings,
  resolveSiteFindingsDetailed,
  type FindingKind,
} from '../src/lib/siteFindings.ts';
import { CRAWL_CHECK_VERSION, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import {
  SITE_EVIDENCE_VERSION,
  buildSiteEvidence,
  selectableEvidence,
  type EvidenceKind,
  type SiteEvidenceFinding,
} from '../src/lib/siteEvidence.ts';
import { shouldDeepCrawl } from '../src/lib/hookAudit.ts';
import { renderHookSection } from '../src/lib/aiAuditReportHtml.ts';
import { isJunkAnswer, isMapCardAnswer } from '../src/lib/answerText.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const CLEAN: CrawlSignals = {
  homeUrl: 'https://mc-locksmiths.com', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: { flagged: false, visibleChars: 4200, htmlBytes: 51000, appShell: false },
  missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0,
};
const BLOCKED: CrawlSignals = { ...CLEAN, searchBlocked: ['OAI-SearchBot'] };
const sentenceOf = (x: { clause: string; rest: string }) => x.clause + '. ' + x.rest;

/** One finding of each kind, built by the real detectors rather than hand-written, so a copy test can
 *  never be driven by a shape the detectors do not actually produce. */
const SITE = 'https://mc-locksmiths.com';
const evidenceOfKind = (kind: EvidenceKind): SiteEvidenceFinding => {
  const base = { servedUrl: SITE, sitemapUrls: [`${SITE}/sitemap.xml`] };
  const home = (html: string) => [{ requestedUrl: `${SITE}/`, finalUrl: `${SITE}/`, status: 200, xRobotsTag: null, html, isHome: true }];
  const inputs: Record<EvidenceKind, Parameters<typeof buildSiteEvidence>[0]> = {
    sitemap_wrong_domain: { ...base, pages: home('<html><body>x</body></html>'), sitemapLocs: Array.from({ length: 8 }, (_, i) => `https://mclocksmiths.co.uk/p${i}`) },
    canonical_off_domain: { ...base, sitemapLocs: [], pages: home('<html><head><link rel="canonical" href="https://mclocksmiths.co.uk/"></head><body>x</body></html>') },
    schema_wrong_domain: { ...base, sitemapLocs: [], pages: home('<html><head><script type="application/ld+json">{"@type":"LocalBusiness","url":"https://mclocksmiths.co.uk"}</script></head><body>x</body></html>') },
    noindex_important_page: {
      ...base, sitemapLocs: [],
      pages: [
        ...home('<html><body>x</body></html>'),
        { requestedUrl: `${SITE}/services/safes`, finalUrl: `${SITE}/services/safes`, status: 200, xRobotsTag: null, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' },
      ],
    },
  };
  const got = buildSiteEvidence(inputs[kind]).findings.find((x) => x.kind === kind);
  if (!got) throw new Error(`fixture for ${kind} produced no finding`);
  return got;
};
const ALL_KINDS: EvidenceKind[] = ['sitemap_wrong_domain', 'canonical_off_domain', 'schema_wrong_domain', 'noindex_important_page'];
const EVERY = ALL_KINDS.map(evidenceOfKind);

console.log('── 1. THE NEW FINDINGS REACH {{6}} ──');
for (const kind of ALL_KINDS) {
  const cands = candidateFindings(CLEAN, [evidenceOfKind(kind)]);
  ok(cands.length === 1 && cands[0].kind === kind, `${kind}: produces a candidate finding`);
  const v = buildSiteFindings(CLEAN, { seed: 'a', evidence: [evidenceOfKind(kind)] });
  ok(!!v && v.length > 40, `${kind}: produces a real {{6}} value`);
}
/* ⛔ AND THEY LEAD. A prospect can OPEN their sitemap and see the address in it; nobody can verify
   what a crawler saw. A message that can be checked in a minute on the reader's own phone is a
   different kind of message, and that is why these outrank the signal findings. */
const led = candidateFindings(BLOCKED, [evidenceOfKind('sitemap_wrong_domain')]);
ok(led[0].kind === 'sitemap_wrong_domain' && led[1].kind === 'crawler_blocked',
  'an evidence finding outranks a blocked crawler');

console.log('── …and the signal-only behaviour is completely unchanged ──');
/* 🔴 THE REGRESSION THAT WOULD MATTER MOST. Every lead in the book has a crawl row with no evidence,
   and each one must keep producing the exact message it produced yesterday. */
ok(candidateFindings(BLOCKED).length === 1, 'no evidence argument → the signal findings alone');
ok(candidateFindings(BLOCKED, []).length === 1, 'an empty evidence list → the same');
ok(buildSiteFindings(BLOCKED, { seed: 'a' }) === buildSiteFindings(BLOCKED, { seed: 'a', evidence: [] }),
  'passing no evidence and passing none are byte-identical');
ok(buildSiteFindings(CLEAN, { seed: 'a' }) === null, 'a clean site with no evidence is still refused');
ok(buildSiteFindings({ ...CLEAN, fetchFailed: true }, { seed: 'a', evidence: EVERY }) === null,
  '⛔ a site we could not fetch is refused EVEN WITH evidence — we do not describe a site we could not read');

console.log('── 2. EVERY COPY RULE APPLIES TO THE NEW WORDS TOO ──');
/* 🔴 COPIED DELIBERATELY FROM scripts/site-findings.test.ts RATHER THAN IMPORTED. These lists are the
   specification, not a helper: a shared constant would let somebody relax the rule in one place and
   have both files quietly agree. Four new sentences written in the old scanner register is exactly
   the failure this template exists to prevent, and it would ship in silence. */
const SCANNER = [
  /detected\b/i, /\bissue\b/i, /\bwarning\b/i, /\berror\b/i, /\bscore\b/i, /\baudit score/i,
  /schema markup/i, /\bLocalBusiness\b/i, /structured data/i, /\bJSON-?LD\b/i, /\bmeta description/i,
  /\balt text/i, /\bH[1-6] tag/i, /heading hierarchy/i, /canonical tag/i, /\bXML\b/i,
  /duplicate content/i, /\bcrawl budget/i, /\bindexation/i, /could be improved/i, /\boptimi[sz]ed?\b/i,
  /\bmismatch\b/i, /\bnot found\b/i, /\bfailed\b/i, /\brecommendation:/i,
];
const UNSUPPORTED = [
  [/does ?n[o']t run (javascript|that)/i, 'asserts what a model does or does not execute'],
  [/read everyone else|everyone else's site/i, 'claims to know what AI has read'],
  [/reads? (those|them|these) as one page/i, 'claims de-duplication behaviour we have never measured'],
  [/AI is deciding who to name/i, 'asserts an internal decision process'],
  [/\bwill (not )?(get|be) (named|recommended|picked)/i, 'predicts an outcome we cannot promise'],
  [/\bstops? (you|your business) (from )?(being|getting)/i, 'absolute causal claim'],
  [/\bprevents?\b/i, 'absolute causal claim'],
  [/\bguarantee/i, 'a promise this message must never make'],
  [/\bcannot tell\b|\bcan't tell\b/i, 'asserts a model capability limit as fact'],
] as const;
const HEDGES = /\b(may|can|might|could)\b|less information|less clear|harder/i;
const FIRST_OPENER_RE = /One thing that stood out is|One thing I noticed is|The main thing that stood out is/;
const SECOND_TRANSITION_RE = /The other thing I noticed is|The other thing that stood out is|Another thing I noticed is/;
const THIRD_TRANSITION_RE = /One last thing I spotted is|And the other thing is|The last thing I noticed is/;

for (const kind of ALL_KINDS) {
  const c = candidateFindings(CLEAN, [evidenceOfKind(kind)])[0];
  const s = sentenceOf(c);
  const scanner = SCANNER.find((re) => re.test(s));
  ok(!scanner, `${kind}: no scanner phrasing${scanner ? ` — matched ${scanner}` : ''}`);
  const unsupported = UNSUPPORTED.find(([re]) => re.test(s));
  ok(!unsupported, `${kind}: no unsupported claim${unsupported ? ` — ${unsupported[1]}` : ''}`);
  ok(HEDGES.test(s), `${kind}: hedged rather than absolute`);
  ok(!/\d/.test(s) && !/%/.test(s), `${kind}: carries no digit and no percentage`);
  ok(!/\bgoogle/i.test(s), `${kind}: makes no comparison with Google`);
  ok(!/SearchBot|PerplexityBot|ChatGPT-User|Claude-User|GPTBot/i.test(s), `${kind}: names no individual bot`);
  ok(!/had a (proper )?look/i.test(c.clause), `${kind}: does not repeat the template's own "had a look" line`);
  ok(/^[a-z]/.test(c.clause), `${kind}: the clause is lower case — it continues the opener`);
  ok(!c.clause.trim().endsWith('.'), `${kind}: the clause carries no full stop of its own`);
  ok(!FIRST_OPENER_RE.test(c.clause) && !SECOND_TRANSITION_RE.test(c.clause) && !THIRD_TRANSITION_RE.test(c.clause),
    `${kind}: the clause carries no opener of its own`);
  ok(s.trim().split('. ').length > 1, `${kind}: more than one sentence — what I saw, what it means, why it may matter`);
  /* ⛔ AND NOT ONE OF OUR WORDS. A prospect must not have to accept a term on trust. */
  ok(!/\bcanonical\b|\bschema\b|\bnoindex\b|\bmarkup\b|\bdirective\b|\bmeta tag\b/i.test(s),
    `${kind}: uses no vocabulary of ours`);
}
/* Assembled, across seeds, with everything present. */
for (const seed of ['a', 'b', 'c', 'd', 'e']) {
  const v = buildSiteFindings(CLEAN, { seed, evidence: selectableEvidence(EVERY) }) ?? '';
  ok(!!v, `seed "${seed}": assembles`);
  ok(!/\d/.test(v), `seed "${seed}": no digits in the whole message`);
  ok(!SCANNER.some((re) => re.test(v)), `seed "${seed}": no scanner phrasing`);
  ok(!UNSUPPORTED.some(([re]) => re.test(v)), `seed "${seed}": no unsupported claim`);
  ok(FIRST_OPENER_RE.test(v.slice(0, 40)), `seed "${seed}": opens with a natural opener`);
  ok(v.length <= MAX_FINDINGS_CHARS && v.length < 1024, `seed "${seed}": ${v.length} chars, inside the cap`);
  ok(v.trim().endsWith('.'), `seed "${seed}": ends on a complete sentence`);
  ok(!/\n|\t|\s{4}/.test(v), `seed "${seed}": one line — no newline, tab or run of spaces Meta would reject`);
}

console.log('── 3. THE ORDERED KINDS COME BACK WITH THE SENTENCE ──');
/* 🔴 THE ANALYTICAL VALUE IS THE KINDS, NOT THE TEXT. "Which findings actually sell" is a question
   about kinds; a rendered sentence cannot be grouped or counted. */
const detailed = buildSiteFindingsDetailed(BLOCKED, { seed: 'a', evidence: selectableEvidence(EVERY) });
ok(!!detailed, 'the detailed build returns a value');
ok(typeof detailed?.text === 'string' && detailed.text.length > 0, '…with the text');
ok(Array.isArray(detailed?.kinds) && detailed!.kinds.length >= 1, '…and the kinds');
ok(detailed?.text === buildSiteFindings(BLOCKED, { seed: 'a', evidence: selectableEvidence(EVERY) }),
  '…and the plain builder is exactly its text, so the two can never disagree');
ok(detailed!.kinds.length <= MAX_SITE_FINDINGS, 'never more kinds than findings allowed');
/* ⛔ THE KINDS ARE THE ONES ACTUALLY IN THE MESSAGE, IN ORDER — not everything that was found. This
   is the property that makes the column trustworthy: a kind recorded but dropped for length would be
   a finding the prospect never read, recorded as one they did. */
const twoOnly = buildSiteFindingsDetailed(BLOCKED, { seed: 'a', evidence: [evidenceOfKind('sitemap_wrong_domain')] })!;
ok(twoOnly.kinds[0] === 'sitemap_wrong_domain' && twoOnly.kinds[1] === 'crawler_blocked',
  'the kinds are in the order they appear in the message');
for (const k of twoOnly.kinds) {
  const clause = candidateFindings(BLOCKED, [evidenceOfKind('sitemap_wrong_domain')]).find((c) => c.kind === k)!.clause;
  ok(twoOnly.text.includes(clause), `${k}: every recorded kind is genuinely IN the text`);
}
const capped = buildSiteFindingsDetailed(BLOCKED, { seed: 'a', max: 1, evidence: selectableEvidence(EVERY) })!;
ok(capped.kinds.length === 1, 'a capped message records exactly the one kind it carried');
ok(capped.text.includes(candidateFindings(BLOCKED, selectableEvidence(EVERY))[0].clause), '…and it is the strongest one');

console.log('── …and the resolver carries them through from what is stored ──');
const now = Date.now();
const storedRow = (evidence: ReturnType<typeof buildSiteEvidence> | null) => ({
  result: {
    status: 'complete', version: CRAWL_CHECK_VERSION, signals: BLOCKED,
    ...(evidence ? { evidence, evidenceVersion: SITE_EVIDENCE_VERSION } : {}),
  },
  createdAtMs: now,
  complete: true,
});
const evidenceBlock = { version: SITE_EVIDENCE_VERSION, findings: EVERY };
const resolved = resolveSiteFindingsDetailed(true, [storedRow(evidenceBlock)], null, { seed: 'lead-1' });
ok(!!resolved && resolved.kinds.includes('sitemap_wrong_domain'), 'a stored evidence block reaches the resolved message');
ok(resolveSiteFindings(true, [storedRow(evidenceBlock)], null, { seed: 'lead-1' }) === resolved?.text,
  'the string resolver is exactly the detailed one’s text');
/* 🔴 AN OLD ROW. No evidence key at all — every row in the book today. */
const old = resolveSiteFindingsDetailed(true, [storedRow(null)], null, { seed: 'lead-1' });
ok(!!old && old.kinds.length === 1 && old.kinds[0] === 'crawler_blocked',
  'a pre-Phase-1 row still resolves, from its signals alone, exactly as it did before');
ok(resolveSiteFindingsDetailed(false, [storedRow(evidenceBlock)], null) === null,
  'no website is still refused, evidence or not');
/* A stale row: neither half may be believed. */
const stale = { ...storedRow(evidenceBlock), createdAtMs: now - 40 * 86_400_000 };
ok(resolveSiteFindingsDetailed(true, [stale], null) === null, 'a stale row yields nothing at all');
/* Evidence stored at a superseded version is ignored, but the signals still work. */
const oldEvidence = { result: { status: 'complete', version: CRAWL_CHECK_VERSION, signals: BLOCKED, evidence: evidenceBlock, evidenceVersion: SITE_EVIDENCE_VERSION - 1 }, createdAtMs: now, complete: true };
const partial = resolveSiteFindingsDetailed(true, [oldEvidence], null, { seed: 'x' });
ok(!!partial && !partial.kinds.some((k) => (ALL_KINDS as string[]).includes(k)),
  'evidence below the current version is dropped while the signal findings survive');

console.log('── 4. THE SWITCH IS ON (approved at Meta 2026-09-25) ──');
ok(AI_SITE_FINDINGS_V2_APPROVED === true, 'ai_site_findings_v2 is approved');
ok(AI_SITE_FINDINGS_V2 === 'ai_site_findings_v2', 'and still named exactly as Meta has it');
ok(/AI_SITE_FINDINGS_V2_APPROVED = true/.test(read('src/lib/siteFindings.ts')),
  'the flag is literally true in the source');

console.log('── 5. THE DEEP-CRAWL GATE ──');
const hook = (stop: string | null) => ({ hook: { version: 1, planned: ['q1', 'q2', 'q3'], next_index: 1, executed: 1, stop_reason: stop, gap: null, named_in: [] } });
ok(shouldDeepCrawl(hook('visibility_gap_found')) === true, 'a visibility gap EARNS the deep crawl');
ok(shouldDeepCrawl(hook('max_questions_reached')) === false,
  'named in every question → NO deep crawl (the lead is auto-marked not interested)');
ok(shouldDeepCrawl(hook('provider_failure')) === false, 'a provider failure → NO deep crawl (there is no hook to attach findings to)');
ok(shouldDeepCrawl(hook(null)) === false, 'a hook still running → not yet');
/* 🔴 AND EVERY NON-HOOK SHAPE KEEPS THE BEHAVIOUR IT HAS TODAY. This is the half that must not
   regress: absence of hook data must NEVER silently disable crawling for a paid baseline. */
ok(shouldDeepCrawl(null) === true, 'null results → deep (a non-hook audit)');
ok(shouldDeepCrawl(undefined) === true, 'undefined results → deep');
ok(shouldDeepCrawl({}) === true, 'a results object with no hook → deep (paid baseline, remeasure, free check)');
ok(shouldDeepCrawl({ summary: { mention_rate: 0.5 } }) === true, 'an ordinary audit result → deep');
ok(shouldDeepCrawl({ hook: null }) === true, 'an explicitly null hook → deep');
ok(shouldDeepCrawl({ hook: 'nonsense' }) === true, 'a malformed hook → deep, never silently off');
ok(shouldDeepCrawl({ hook: { version: 99, planned: [] } }) === true,
  '⛔ a FUTURE hook shape this code does not recognise → deep. The gate turns itself off rather than turning the evidence off for the book.');

console.log('── 6. THE HOOK EVIDENCE CARD ──');
const gap = (over: Record<string, unknown> = {}) => ({
  questionsTested: 1, maxQuestions: 3, stopReason: 'visibility_gap_found' as const,
  gap: {
    questionIndex: 0, question: 'Who is the best locksmith in Wisbech?', engine: 'gemini', engineLabel: 'Gemini',
    namedInstead: ['A1 Locks', 'Fenland Security'], citations: [], namedOnEngineLabels: [],
    answerExcerpt: 'For locksmiths in Wisbech, a few well-reviewed options come up. A1 Locks is frequently mentioned for emergency call-outs, and Fenland Security is often cited for lock replacement work.',
    ...over,
  },
  tested: [],
});
const card = renderHookSection(gap(), 'MC Locksmiths', '22 Sep 2026');
/* 🔴 THE GENUINE ANSWER IS SHOWN. It has been stored on every hook gap since the hook shipped and the
   box was built not to read it. Reading it is the cheapest credibility this report can buy. */
ok(card.includes('A1 Locks is frequently mentioned'), 'the genuine stored answer excerpt appears in the card');
ok(/Gemini replied/.test(card), '…clearly labelled as the engine speaking');
ok(card.includes('ev-quote'), '…and visibly marked as a quote rather than as our own text');
ok(card.includes('Who is the best locksmith in Wisbech?'), 'the exact question asked is shown');
ok(card.includes('A1 Locks') && card.includes('Fenland Security'), 'the businesses it named still render');
ok(/wasn.{0,8}t named/i.test(card), 'the not-mentioned state is still stated plainly');
ok(card.includes('22 Sep 2026'), 'the date is shown where we have one');
ok(card.includes('Asked Gemini'), 'the engine is named IN TEXT');
/* ⛔ NO REPLICA CHROME. The previous card wore the official engine marks around Findable's own
   words, which reads as a recreation — and a recreation is the one thing this page cannot look
   like. The engine is named; it is not impersonated. */
ok(!/cc-mark|cc-avatar/.test(card), 'no engine logo chip or avatar');
ok(!/viewBox="0 0 24 24"/.test(card), 'no engine SVG at all');
ok(!/cc-brand/.test(card), 'no chat-brand header');
ok(card.includes('evcard'), 'it is the Findable evidence card');

console.log('── …and it degrades safely when there is nothing to quote ──');
const noExcerpt = renderHookSection(gap({ answerExcerpt: '' }), 'MC Locksmiths', '22 Sep 2026');
ok(!noExcerpt.includes('ev-quote'), 'no excerpt → the quote block is OMITTED, never a placeholder');
ok(!/replied/.test(noExcerpt), '…and nothing claims the engine said anything');
ok(noExcerpt.includes('Who is the best locksmith in Wisbech?'), '…while the question still renders');
ok(noExcerpt.includes('A1 Locks'), '…and so do the names');
ok(/wasn.{0,8}t named/i.test(noExcerpt), '…and the one fact that IS true is still stated');
const noNames = renderHookSection(gap({ namedInstead: [] }), 'MC Locksmiths');
ok(!noNames.includes('Businesses it named'), 'no names → that block is omitted entirely, never invented');
ok(/wasn.{0,8}t named/i.test(noNames), '…and the red line still carries the truth');
const noGapAtAll = renderHookSection({ questionsTested: 3, maxQuestions: 3, stopReason: 'max_questions_reached', gap: null, tested: [] }, 'MC Locksmiths');
ok(!noGapAtAll.includes('evcard'), 'a hook with no gap renders no evidence card');
ok(noGapAtAll.length > 0, '…but still renders its own verdict section');

console.log('── …a map-formatted answer is treated as NO answer, not cleaned until something emerges ──');
/* 🔴 CAUGHT BY scripts/hook-competitor-names.test.ts ON THE FIRST RUN, AND IT IS THE REASON
   src/lib/answerText.ts EXISTS. Gemini answers a local question with a map card surprisingly often,
   and the stored text is then star-rating images and opening hours. Printed under "Gemini replied"
   that reads as a bad scrape, on the one page whose whole value is that the measurement is real.
   The gut-punch card already refused exactly this; the guard is now shared rather than relearned. */
const mapJunk = renderHookSection(gap({
  answerExcerpt: 'https://maps.gstatic.com/gemini/maps/star.png 5.0 stars Closes 10:00 PM Educational institution 4.9 stars Closes 8:00 PM',
}), 'MC Locksmiths');
ok(!mapJunk.includes('ev-quote'), 'a map-formatted answer produces NO quote block');
ok(!mapJunk.includes('maps.gstatic.com') && !mapJunk.includes('5.0 stars') && !mapJunk.includes('Closes 10:00 PM'),
  '…and not one fragment of it reaches the page');
ok(/wasn.{0,8}t named/i.test(mapJunk), '…while everything that IS true still renders');

console.log('── …and the NON-hook report is untouched by any of it ──');
/* 🔴 CORRECTED 2026-09-23, FOUND ON THE LIVE REPORT. The first version of answerText.ts added
   'gstatic' to the SHARED junk list while calling the move "verbatim". That list also decides the
   non-hook report's gut-punch card, and 668 of 1,421 non-hook audits carry such an answer somewhere
   — so one word could change hundreds of existing reports, against the promise that non-hook
   reports are unchanged. The shared rule is restored and the hook card asks a second question.
   This is the real shape production stored for a Newcastle hook audit (mkeftj), trimmed. */
const REAL_MAP_CARD = 'Here are several reliable, highly rated electrical contractors serving residential clients in and around Newcastle upon Tyne, known for handling domestic tasks ranging from minor repairs and socket installations to full-scale house rewires and safety certifications. ![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png) Ridley Bros. Of Gosforth 4.5 stars rating 4.5 ![](https://www.gstatic.com/gemini/maps/star.png) Electrician Closed · Opens 8:00 AM Wed';
ok(isJunkAnswer(REAL_MAP_CARD) === false,
  'the SHARED rule still reads a map card exactly as it did before — so the non-hook card is unchanged');
ok(isMapCardAnswer(REAL_MAP_CARD) === true, '…while the hook card’s own second question catches it');
const hookOnReal = renderHookSection(gap({ answerExcerpt: REAL_MAP_CARD }), 'Richard Slater Electrics');
ok(!hookOnReal.includes('ev-quote'), 'the hook card refuses to quote the real map card');
ok(!/gstatic|stars rating|Opens 8:00/.test(hookOnReal), '…and not one fragment of it reaches the page');
ok(!/'gstatic'/.test(read('src/lib/answerText.ts').split('export function isJunkAnswer')[0].split('const JUNK_MARKERS')[1] ?? ''),
  'gstatic is NOT in the shared JUNK_MARKERS list');
ok(isMapCardAnswer('A plain answer naming three local firms and nothing else at all here.') === false,
  'a plain prose answer is not a map card');

console.log('── …the quote is escaped, because it is somebody else’s text ──');
const nasty = renderHookSection(gap({
  answerExcerpt: 'For locksmiths in this area there are several well reviewed options that people mention regularly, including <script>alert(1)</script> and a number of other established local firms with good reputations.',
}), 'MC Locksmiths');
ok(!/<script/i.test(nasty.replace(/&lt;/g, '')) || !nasty.includes('<script>alert(1)</script>'),
  'a model answer containing markup never reaches the page as a live tag');
ok(!nasty.includes('<script>alert(1)</script>'), '…the raw tag is not emitted');
/* Neutralised TWICE over, and it is worth knowing which layer did what: cleanAnswerText strips the
   stray ">" as a markdown symbol, and esc() then escapes the "<". Either alone would be enough. */
ok(nasty.includes('&lt;script'), '…and what remains is escaped, visible text');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f) process.exit(1);
