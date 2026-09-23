/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ai_site_findings_v2 — the registry, the switch, and the {{6}} that makes it different (2026-09-22).

   Three things are pinned here and each has a specific way of going wrong:

     1. THE SWITCH. The template is SUBMITTED to Meta and NOT APPROVED. Everything about it is built;
        nothing may select it. A send of an unapproved template fails at Meta, in front of a real
        prospect, on the one message whose whole value is that it looks like a person wrote it.
     2. THE SHAPE. Seven variables in one exact order, mirrored in two registries. A borrowed or
        shifted var list returns 200 and reads as gibberish — the mistake audit_reply_warm's comment
        records, and the reason every sibling's order was read off WhatsApp Manager rather than
        inferred.
     3. THE WORDS. {{6}} exists because the report's fault sentences read like a scanner. A test that
        only checked it was non-empty would pass on exactly the output this template was built to
        stop being.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  AI_SITE_FINDINGS_V2,
  AI_SITE_FINDINGS_V2_APPROVED,
  COMFORTABLE_THREE_CHARS,
  MAX_FINDINGS_CHARS,
  MAX_SITE_FINDINGS,
  buildSiteFindings,
  candidateFindings,
  hasSiteFindings,
  resolveSiteFindings,
} from '../src/lib/siteFindings.ts';
import { CRAWL_CHECK_VERSION, THIN_WORDS, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { WA_TEMPLATE_REQS, getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { REPORT_LINK_TEMPLATES } from '../src/lib/templateAttribution.ts';
import { BRANCH_SUPPLIES, branchForVars, unsuppliedVars } from '../src/lib/templateRouting.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { INITIAL_OPENER_A, INITIAL_OPENER_B, openerArmFor, openerTemplateFor } from '../src/lib/openerVariant.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const SEND = read('supabase/functions/_shared/whatsapp-send.ts');
const QUEUE = read('supabase/functions/process-whatsapp-queue/index.ts');
const NAME = 'ai_site_findings_v2';

/* A crawl that found everything, so selection and ordering can be driven rather than described. */
const ALL: CrawlSignals = {
  homeUrl: 'https://example.co.uk',
  fetchFailed: false,
  searchBlocked: ['OAI-SearchBot', 'PerplexityBot'],
  readableAs: null,
  clientRendered: { flagged: true, visibleChars: 69, htmlBytes: 74000, appShell: true },
  missingH1: true,
  noJsonLd: true,
  duplicates: { clusterSize: 6, sampleSize: 8, similarityPct: 96 },
  thinPages: 4,
};
const only = (patch: Partial<CrawlSignals>): CrawlSignals => ({
  homeUrl: 'https://example.co.uk', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0, ...patch,
});
const CLEAN = only({});
const fresh = (signals: CrawlSignals) => ({ result: { version: CRAWL_CHECK_VERSION, status: 'complete', signals }, createdAtMs: Date.now(), complete: true });

/* The transitions the joiner may use. Declared ONCE so "did a transition appear" and "how many
   findings are in here" cannot drift apart from each other or from the module. */
const FIRST_OPENER_RE = /One thing that stood out is|One thing I noticed is|The main thing that stood out is/;
const SECOND_TRANSITION_RE = /The other thing I noticed is|The other thing that stood out is|Another thing I noticed is/;
const THIRD_TRANSITION_RE = /One last thing I spotted is|And the other thing is|The last thing I noticed is/;
const countFindings = (v: string) => 1 + (SECOND_TRANSITION_RE.test(v) ? 1 : 0) + (THIRD_TRANSITION_RE.test(v) ? 1 : 0);
/* A finding is stored as clause + rest so the OPENER can be chosen by position. Everything that
   scans "a finding" scans the sentence it actually becomes. */
const sentenceOf = (f: { clause: string; rest: string }) => f.clause + '. ' + f.rest;

console.log('── 1. THE NAME AND THE SWITCH ──');
ok(AI_SITE_FINDINGS_V2 === NAME, 'the constant is the Meta-registered name, exactly');
/* ⛔ THIS IS THE ASSERTION THE WHOLE TASK TURNS ON. Meta has not approved it. */
ok(AI_SITE_FINDINGS_V2_APPROVED === false, 'AI_SITE_FINDINGS_V2_APPROVED is FALSE — submitted to Meta, not approved');
ok((read('src/lib/siteFindings.ts').match(/export const AI_SITE_FINDINGS_V2_APPROVED/g) ?? []).length === 1,
  'there is exactly ONE switch — approval must be a one-line change, not a hunt');

console.log('── …and while it is false NOTHING can select the template ──');
const ready = { reportSlug: 'abc123', hasSiteFault: true, hasSiteFindings: true };
const gate = getTemplateSendability(NAME, { shareToken: null }, ready);
ok(gate.ok === false, 'a lead who satisfies EVERY other requirement is still refused');
ok(/approval/i.test(gate.reason ?? ''), `…and the reason says why: "${gate.reason}"`);
/* The approval gate must come FIRST, or a refactor that satisfies the other requirements quietly
   makes it sendable. Driven by a lead that fails everything: the reason must still be approval. */
const bare = getTemplateSendability(NAME, { shareToken: null }, { reportSlug: null, hasSiteFindings: false });
ok(/approval/i.test(bare.reason ?? ''), 'approval is checked BEFORE the audit and findings requirements');

console.log('── …and the live template it succeeds is completely unchanged ──');
ok(getTemplateSendability('audit_followup_fault', { shareToken: null }, { reportSlug: 'abc123', hasSiteFault: true }).ok === true,
  'audit_followup_fault is still sendable to a lead with a fault');
ok(getTemplateSendability('audit_followup_fault', { shareToken: null }, { reportSlug: 'abc123', hasSiteFault: false }).ok === false,
  '…and still refused without one');
ok(WA_TEMPLATE_REQS.audit_followup_fault.needsSiteFault === true && !WA_TEMPLATE_REQS.audit_followup_fault.needsSiteFindings,
  'audit_followup_fault keeps its OWN gate — the two flags are not merged');
/* ⛔ initial_opener_v2 and its A/B are untouched by this change. */
ok(openerTemplateFor(INITIAL_OPENER_A, 'lead-1') === openerArmFor('lead-1'), 'the opener split still substitutes normally');
ok(openerTemplateFor(NAME, 'lead-1') === NAME, 'the opener split leaves this template alone, as it does every non-opener');
ok(INITIAL_OPENER_B === 'initial_opener_v2' && !CONTINUATION_TEMPLATES.has(INITIAL_OPENER_B), 'initial_opener_v2 is still a COLD opener');

console.log('── 2. SEVEN VARIABLES, ONE ORDER, BOTH REGISTRIES ──');
const EXPECTED = ['trade_article', 'town', 'rival_1', 'rival_2', 'rival_3', 'site_findings', 'audit_url'];
const varsOf = (src: string) => {
  const m = src.match(new RegExp(NAME + ':\\s*\\{\\s*lang:\\s*"([a-z_]+)",\\s*vars:\\s*\\[([^\\]]*)\\]'));
  return m ? { lang: m[1], vars: m[2].split(',').map((v) => v.trim().replace(/^"|"$/g, '')).filter(Boolean) } : null;
};
const sendReg = varsOf(SEND);
const queueReg = varsOf(QUEUE);
ok(!!sendReg, 'registered in WA_TEMPLATES (whatsapp-send.ts)');
ok(!!queueReg, 'registered in the process-whatsapp-queue mirror');
ok(JSON.stringify(sendReg?.vars) === JSON.stringify(EXPECTED), `{{1}}-{{7}} are ${EXPECTED.join(', ')}`);
ok(sendReg?.vars.length === 7, 'exactly SEVEN variables — Meta rejects a param-count mismatch (#132000)');
ok(sendReg?.vars[5] === 'site_findings', '{{6}} is the site findings');
/* ⛔ {{7}} IS THE REPORT LINK, AND IT IS THE EXISTING ONE. audit_url is what both senders fill from
   resolveAuditReplyVars' `link` — the same findable.live report URL every sibling uses. No new
   scheme, and never /a/<id>, which is a deliberate 404. */
ok(sendReg?.vars[6] === 'audit_url', '{{7}} is audit_url — the existing public report URL, not a new scheme');
ok(JSON.stringify(sendReg?.vars) === JSON.stringify(queueReg?.vars), 'the two registries are byte-identical');
ok(sendReg?.lang === 'en' && queueReg?.lang === 'en', "language is 'en', matching its siblings and the submitted template");
/* The shape is deliberately its sibling's, so a mistake in one is visible against the other. */
const faultVars = varsOf(SEND.replace(NAME, '__x__'))?.vars;
ok(JSON.stringify(EXPECTED.map((v) => (v === 'site_findings' ? 'site_fault' : v)))
   === JSON.stringify(['trade_article', 'town', 'rival_1', 'rival_2', 'rival_3', 'site_fault', 'audit_url']),
  'the shape is audit_followup_fault\'s with site_fault swapped for site_findings');
void faultVars;

console.log('── …and every variable its branch must supply, it supplies ──');
ok(branchForVars(EXPECTED) === 'audit', 'it routes to the AUDIT branch (rivals + audit_url)');
ok(BRANCH_SUPPLIES.audit.has('site_findings'), 'the audit branch declares site_findings');
ok(unsuppliedVars(EXPECTED).length === 0, 'no variable is left unanswered — the audit_followup 500');

console.log('── 3. THE REGISTRIES THAT ARE NOT THE SEND PATH ──');
ok(WHATSAPP_TEMPLATES.some((t) => t.value === NAME), 'it is in the SPA picker list (never hidden — hidden is not a list)');
const entry = WHATSAPP_TEMPLATES.find((t) => t.value === NAME);
ok(/PENDING META APPROVAL/.test(entry?.label ?? ''), `…and its label warns the operator: "${entry?.label}"`);
ok(CONTINUATION_TEMPLATES.has(NAME) && !isColdOutreachTemplate(NAME),
  'it is a CONTINUATION — cold would refuse it for its entire audience (the audit_reply_warm trap)');
ok(REPORT_LINK_TEMPLATES.has(NAME), 'it is in REPORT_LINK_TEMPLATES — {{7}} is a report link, so its opens are report opens');
ok(!!READABLE_TEMPLATE_BODIES[NAME], 'it has a readable body, so a sent row never prints as a raw slug');
ok(WA_TEMPLATE_REQS[NAME]?.needsAudit === true, 'needsAudit — rivals and the report link come from the completed audit');
ok(WA_TEMPLATE_REQS[NAME]?.needsSiteFindings === true, 'needsSiteFindings — {{6}} cannot be empty');
ok(new RegExp('ai_site_findings_v2:').test(read('src/pages/Inbox.tsx')), 'TEMPLATE_DISPLAY names it, so a thread never shows the slug');

console.log('── 4. {{6}} — WHAT IT SAYS ──');
const findings = buildSiteFindings(ALL, { seed: 'lead-a' });
ok(!!findings, 'a site with faults produces findings');
ok((findings ?? '').length > 120, 'it is substantial, not a label');

console.log('── …no newline, ever, because Meta rejects the whole send (#132018) ──');
/* A parameter with a newline, a tab or 4+ consecutive spaces is rejected outright. forMeta() in
   whatsapp-send.ts is the last-resort collapse; a value that arrives clean never needs it. */
for (const seed of ['a', 'b', 'c', 'lead-1', '']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  ok(!/[\n\r\t]/.test(v) && !/ {4}/.test(v), `seed "${seed}": one line, no tabs, no 4-space runs`);
}
/* ⛔ AND A MULTILINE VALUE IS STILL ACCEPTED RATHER THAN REFUSED — it is collapsed. Losing a real
   message over a formatting artefact is the worse failure. */
const collapse = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();
ok(collapse('one.\n\ntwo.\n\n   three.') === 'one. two. three.', 'a multiline value collapses to one clean line rather than failing');

console.log('── …no markdown, no emoji, no headings ──');
for (const seed of ['a', 'b', 'c']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  ok(!/^[-*•]|\s[-*•]\s/.test(v), `seed "${seed}": no bullets`);
  ok(!/[#_`]|\*\*/.test(v), `seed "${seed}": no markdown`);
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅❌]/u.test(v), `seed "${seed}": no emoji`);
}

console.log('── …and NONE of the scanner phrases this template exists to replace ──');
/* 🔴 THE POINT OF THE WHOLE TASK. Every one of these is a real phrase from a real SEO tool, and each
   is the register that makes a tradesperson feel scanned rather than looked at. */
const SCANNER = [
  /detected\b/i, /\bissue\b/i, /\bwarning\b/i, /\berror\b/i, /\bscore\b/i, /\baudit score/i,
  /schema markup/i, /\bLocalBusiness\b/i, /structured data/i, /\bJSON-?LD\b/i, /\bmeta description/i,
  /\balt text/i, /\bH[1-6] tag/i, /heading hierarchy/i, /canonical tag/i, /\bXML\b/i,
  /duplicate content/i, /\bcrawl budget/i, /\bindexation/i, /could be improved/i, /\boptimi[sz]ed?\b/i,
  /\bmismatch\b/i, /\bnot found\b/i, /\bfailed\b/i, /\brecommendation:/i,
];
for (const seed of ['a', 'b', 'c', 'd', 'e']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  const hit = SCANNER.find((re) => re.test(v));
  ok(!hit, `seed "${seed}": no scanner phrasing${hit ? ` — matched ${hit}` : ''}`);
}
/* Every candidate string, not just the two or three that get chosen for one seed. */
for (const c of candidateFindings(ALL)) {
  const hit = SCANNER.find((re) => re.test(sentenceOf(c)));
  ok(!hit, `${c.kind}: no scanner phrasing${hit ? ` — matched ${hit}` : ''}`);
  ok(sentenceOf(c).trim().split('. ').length > 1,
    `${c.kind}: more than one sentence — what I saw, what it means, why it may matter`);
}

console.log('── …and NO CLAIM ABOUT HOW AI DECIDES, because we cannot see that ──');
/* 🔴 THE SECOND HALF OF THE POINT. Scanner phrasing makes a message sound automated; an ASSERTION
   about a process we have never observed makes it sound like a guess, and a prospect who knows more
   than we do about these systems spots it in one line. Every phrase here was in the first version of
   this file, or is the obvious way to write the same overreach. */
const UNSUPPORTED = [
  [/does ?n[o']t run (javascript|that)/i, 'asserts what a model does or does not execute'],
  [/AI (does|doesn|do)\b[^.]*\bjavascript/i, 'same claim, other phrasing'],
  [/read everyone else|everyone else's site/i, 'claims to know what AI has read'],
  [/reads? (those|them|these) as one page/i, 'claims de-duplication behaviour we have never measured'],
  [/(treats?|merges?) (those|them|these) (as|into) one/i, 'same claim, other phrasing'],
  [/nothing (specific )?to repeat back|to quote you from/i, 'claims what a model can or cannot produce'],
  [/when (somebody|someone) asks it to recommend[^.]*turned away/i, 'narrates an AI request path we do not observe'],
  [/AI is deciding who to name/i, 'asserts an internal decision process'],
  [/\bwill (not )?(get|be) (named|recommended|picked)/i, 'predicts an outcome we cannot promise'],
  [/\bstops? (you|your business) (from )?(being|getting)/i, 'absolute causal claim'],
  [/\bprevents?\b/i, 'absolute causal claim'],
  [/\bguarantee/i, 'a promise this message must never make'],
  [/\bcannot tell\b|\bcan't tell\b/i, 'asserts a model capability limit as fact'],
  [/\bblank page\b/i, 'describes what a model sees rather than what we measured'],
] as const;
for (const c of candidateFindings(ALL)) {
  const hit = UNSUPPORTED.find(([re]) => re.test(sentenceOf(c)));
  ok(!hit, `${c.kind}: no unsupported AI-decision claim${hit ? ` — ${hit[1]} (${hit[0]})` : ''}`);
}
for (const c of candidateFindings(only({ thinPages: 1, searchBlocked: ['OAI-SearchBot'] }))) {
  const hit = UNSUPPORTED.find(([re]) => re.test(sentenceOf(c)));
  ok(!hit, `${c.kind} (singular): no unsupported AI-decision claim${hit ? ` — ${hit[1]}` : ''}`);
}
for (const seed of ['a', 'b', 'c', 'd']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  const hit = UNSUPPORTED.find(([re]) => re.test(v));
  ok(!hit, `seed "${seed}": assembled message makes no unsupported claim${hit ? ` — ${hit[1]}` : ''}`);
}

console.log('── …and every finding HEDGES its third clause ──');
/* "can make it harder", "may mean", "gives AI less information to work with" — what the evidence
   actually supports, and also what a careful person sounds like. */
const HEDGES = /\b(may|can|might|could)\b|less information|less clear|harder/i;
for (const c of candidateFindings(ALL)) {
  ok(HEDGES.test(sentenceOf(c)), `${c.kind}: hedged rather than absolute`);
}

console.log('── …and the OPENER belongs to the joiner, never to a finding ──');
for (const c of candidateFindings(ALL)) {
  /* A finding can be first or second, so one that brought its own opener would double up when it
     moved: "The other thing I noticed is One thing that stood out is …". */
  ok(!FIRST_OPENER_RE.test(c.clause) && !SECOND_TRANSITION_RE.test(c.clause) && !THIRD_TRANSITION_RE.test(c.clause),
    `${c.kind}: the clause carries no opener of its own`);
  /* ⛔ THE TEMPLATE'S OWN FIXED LINE DIRECTLY ABOVE {{6}} IS "Had a proper look at your site as
     well". A finding that opens by saying it again reads like the message lost its place — and the
     first version of this generator opened exactly that way. */
  ok(!/had a (proper )?look/i.test(c.clause), `${c.kind}: does not repeat the template's own "had a look" line`);
  /* The clause follows an opener ending in "is", so it is a fragment, not a sentence. */
  ok(/^[a-z]/.test(c.clause), `${c.kind}: the clause is lower case — it continues the opener`);
  ok(!c.clause.trim().endsWith('.'), `${c.kind}: the clause carries no full stop of its own`);
}
for (const seed of ['a', 'b', 'c', 'd', 'e']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  ok(FIRST_OPENER_RE.test(v.slice(0, 40)), `seed "${seed}": the message opens with a natural opener`);
  ok(!/had a (proper )?look/i.test(v), `seed "${seed}": never repeats "had a look"`);
}

console.log('── …and NO MEASUREMENT REACHES THE MESSAGE ──');
/* 🔴 "91% the same", "under 120 words", "69 characters" are all real and all scanner. A tradesperson
   does not know whether 120 words is a lot, and a precise figure invites an argument about the
   figure instead of a conversation about the site. The numbers stay in the crawl signals and in the
   report, which is written for somebody sitting down to read it. NO DIGIT belongs in {{6}}. */
for (const c of candidateFindings(ALL)) {
  ok(!/\d/.test(sentenceOf(c)), `${c.kind}: carries no digits at all`);
  ok(!/%/.test(sentenceOf(c)), `${c.kind}: no percentage`);
}
for (const seed of ['a', 'b', 'c', 'd', 'e']) {
  ok(!/\d/.test(buildSiteFindings(ALL, { seed }) ?? ''), `seed "${seed}": the whole message carries no digits`);
}
/* Driven on the exact values the old copy printed, so a regression is caught by the number itself. */
const numeric = buildSiteFindings(only({
  clientRendered: { flagged: true, visibleChars: 69, htmlBytes: 74210, appShell: true },
  duplicates: { clusterSize: 6, sampleSize: 8, similarityPct: 91 },
  thinPages: 5,
}), { seed: 'a' }) ?? '';
for (const n of ['69', '91', String(THIN_WORDS), '%']) {
  ok(!numeric.includes(n), `the old measurement "${n}" is gone from the copy`);
}
/* ⛔ AND NO COMPARISON WITH GOOGLE. We never fetched the site as Googlebot, so "as reliably as
   Google can" was a comparison against a measurement we do not hold. */
for (const c of candidateFindings(ALL)) {
  ok(!/\bgoogle/i.test(sentenceOf(c)), `${c.kind}: makes no comparison with Google`);
}
/* ⛔ AND NO BOT NAMES. They mean nothing to a locksmith and read as jargon dropped in to sound
   authoritative. Singular/plural still carries the real shape of what was found. */
for (const c of candidateFindings(ALL)) {
  ok(!/SearchBot|PerplexityBot|ChatGPT-User|Claude-User|GPTBot/i.test(sentenceOf(c)),
    `${c.kind}: names no individual bot`);
}
ok(/^one of the crawlers/.test(candidateFindings(only({ searchBlocked: ['OAI-SearchBot'] }))[0].clause),
  'a single blocked crawler reads "one of the crawlers"');
ok(/^some of the crawlers/.test(candidateFindings(only({ searchBlocked: ['OAI-SearchBot', 'PerplexityBot'] }))[0].clause),
  '…and several read "some of the crawlers"');

console.log('── 5. WHICH FINDINGS, AND HOW MANY ──');
ok(MAX_SITE_FINDINGS === 3, 'at most three findings');
const chosen = candidateFindings(ALL);
ok(chosen.length === 4, 'four of the six signals are eligible');
ok(chosen[0].kind === 'crawler_blocked', 'a blocked crawler leads — AI cannot reach the site at all');
ok(chosen[1].kind === 'unreadable_homepage', '…then a homepage AI cannot read');
ok(chosen[2].kind === 'duplicate_pages', '…then duplicated town/service pages');
ok(chosen[3].kind === 'thin_pages', '…then thin pages');
/* 🔴 REVERSED ON PURPOSE. This used to assert the message carried this lead's measured character
   count, on the reasoning that a real number is what proves somebody looked. It reads as a scanner
   instead, so the evidence now shows up as a specific DESCRIPTION rather than a figure — the numbers
   live in the crawl signals and in the report, which is written for somebody sitting down to it. */
ok(!(buildSiteFindings(ALL, { seed: 'a' }) ?? '').includes('69'), 'the measured character count is NOT in the message');
ok((buildSiteFindings(ALL, { seed: 'a' }) ?? '').includes('homepage is very thin'), '…the description of it is');

console.log('── …TWO is the normal message; a third only when it comfortably fits ──');
/* Two findings is what a person reads on a phone between jobs; the third turns it into a list, and a
   third that only just squeezes under the Meta cap is exactly the one that does. So the third is held
   to a tighter bar, and the WEAKEST finding is dropped rather than the wording being compressed. */
ok(COMFORTABLE_THREE_CHARS < MAX_FINDINGS_CHARS, 'the third finding is held to a tighter bar than the hard cap');
for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  const n = countFindings(v);
  ok(n >= 1 && n <= 3, `seed "${seed}": ${n} findings, never more than three`);
  if (n === 3) ok(v.length <= COMFORTABLE_THREE_CHARS, `seed "${seed}": a third was taken only because it fits comfortably`);
  if (n === 2) ok(v.length <= MAX_FINDINGS_CHARS, `seed "${seed}": two findings, within the cap`);
}
/* 🔴 AND HERE IS WHAT THAT ACTUALLY SHIPS, DRIVEN RATHER THAN DESCRIBED — both sides of the rule.
   Dropping the measurements took each finding down to roughly 200-255 characters, so the THREE
   SHORTEST now do clear the comfortable bar where they did not before this rewrite. */
const shortest = buildSiteFindings(only({
  searchBlocked: ['OAI-SearchBot'],
  duplicates: { clusterSize: 3, sampleSize: 8, similarityPct: 90 },
  thinPages: 2,
}), { seed: 'a' }) ?? '';
ok(countFindings(shortest) === 3, 'the three SHORTEST findings all fit, so three is genuinely reachable');
ok(shortest.length <= COMFORTABLE_THREE_CHARS, '…because they clear the comfortable bar');
/* …and the other side: add the longest finding (the homepage one) and the third no longer fits, so
   the WEAKEST is dropped and the strongest always survives. */
const mixed = buildSiteFindings(ALL, { seed: 'a' }) ?? '';
ok(countFindings(mixed) === 2, 'a mixed site ships TWO — the third would not clear the bar');
ok(mixed.length <= MAX_FINDINGS_CHARS, '…and what does ship is inside the cap');
ok(/crawlers used by AI search tools/.test(mixed), '…the finding that survives is the strongest one');
ok(!/light on detail/.test(mixed), '…while the weakest is the one dropped');

console.log('── …and the weak ones are never said at all ──');
/* 🔴 missingH1 and noJsonLd are real and belong in the report. In a WhatsApp message they are the
   difference between "he looked at my site" and "this is an automated scan". Padding to three with
   them is the exact failure this template exists to fix. */
ok(candidateFindings(only({ missingH1: true, noJsonLd: true })).length === 0,
  'a site whose ONLY faults are a missing H1 and no structured data yields NOTHING');
ok(buildSiteFindings(only({ missingH1: true, noJsonLd: true })) === null,
  '…so the template is refused rather than padded with a weak finding');
ok(candidateFindings({ ...ALL, thinPages: 0 }).length === 3,
  'the weak signals do not fill the gap left by a missing strong one');

console.log('── …one strong finding is used alone rather than padded ──');
const oneOnly = buildSiteFindings(only({ duplicates: { clusterSize: 5, sampleSize: 8, similarityPct: 93 } }), { seed: 'a' });
ok(!!oneOnly, 'a single strong finding still produces a message');
ok(!SECOND_TRANSITION_RE.test(oneOnly ?? '') && !THIRD_TRANSITION_RE.test(oneOnly ?? ''),
  '…with NO transition, because there is nothing to transition to');
ok(!/\d|%/.test(oneOnly ?? ''), '…and it carries no cluster size and no similarity percentage');
ok(/basically the same apart from the town or the service/.test(oneOnly ?? ''), '…it describes the problem instead');

console.log('── …never more than three, however many were found ──');
for (const seed of ['a', 'b', 'c']) {
  const v = buildSiteFindings(ALL, { seed }) ?? '';
  ok(!/light on detail/.test(v), `seed "${seed}": the fourth (weakest) finding is dropped`);
}

console.log('── …and never past the length Meta accepts ──');
/* A text parameter over 1024 characters is refused outright (#131009) — the same invisible class of
   failure as a blank one. The worst realistic case is three findings with every search crawler named. */
const WORST = { ...ALL, searchBlocked: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'] };
for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
  const v = buildSiteFindings(WORST, { seed }) ?? '';
  ok(v.length <= MAX_FINDINGS_CHARS, `seed "${seed}": ${v.length} chars, within the ${MAX_FINDINGS_CHARS} cap`);
  ok(v.length < 1024, `seed "${seed}": inside Meta's 1024-character parameter limit`);
  /* Shortened by dropping the weakest finding, never by truncation — so it still ends in a full stop. */
  ok(v.trim().endsWith('.'), `seed "${seed}": ends on a complete sentence, not mid-explanation`);
  ok(/crawlers used by AI search tools/.test(v), `seed "${seed}": the STRONGEST finding survives the trim`);
}
ok(MAX_FINDINGS_CHARS < 1024, "the cap leaves headroom under Meta's limit");

console.log('── 6. IT READS LIKE A PERSON, NOT A MERGE ──');
const variants = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => buildSiteFindings(ALL, { seed: s })));
ok(variants.size > 1, 'different leads do not all get byte-identical wording');
ok(buildSiteFindings(ALL, { seed: 'x' }) === buildSiteFindings(ALL, { seed: 'x' }),
  'the SAME lead always reads the same message — a re-send never reshuffles its wording');
const two = buildSiteFindings({ ...ALL, duplicates: null, thinPages: 0 }, { seed: 'a' }) ?? '';
ok(SECOND_TRANSITION_RE.test(two), 'the second finding is introduced by a transition, not concatenated');

console.log('── 7. NO FABRICATED ANYTHING ──');
/* ⛔ The competitor names are {{3}}-{{5}} and they come from the audit, never from here. This module
   must not contain a business name, and must not be able to invent one. */
ok(!/rival|competitor/i.test(read('src/lib/siteFindings.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
  'the findings module names no competitor and cannot manufacture one');
ok(candidateFindings(only({ fetchFailed: true, searchBlocked: ['OAI-SearchBot'] })).length === 0,
  'a site we could not fetch produces NO findings — we do not describe a site we could not read');
ok(buildSiteFindings(null) === null && buildSiteFindings(undefined) === null, 'absent signals produce null, never a generic line');

console.log('── 8. WHEN IT MAY BE SENT AT ALL ──');
ok(resolveSiteFindings(true, [fresh(ALL)]) !== null, 'a website with strong faults → findings');
/* ⛔ STRICTER THAN siteFaultLine ON TWO LEADS, AND THE REGISTERED COPY IS WHY. */
ok(resolveSiteFindings(false, [fresh(ALL)]) === null,
  'NO WEBSITE → refused: the body says "Had a proper look at your site as well"');
ok(resolveSiteFindings(true, [fresh(CLEAN)]) === null,
  'a CLEAN site → refused: the body already blames the site, so there is nothing honest for {{6}}');
ok(resolveSiteFindings(true, []) === null, 'no crawl at all → refused');
ok(resolveSiteFindings(true, [{ result: { version: CRAWL_CHECK_VERSION, signals: ALL }, createdAtMs: Date.now() - (31 * 86_400_000) }]) === null,
  'a STALE crawl → refused (it describes the site as it was)');
ok(resolveSiteFindings(true, [{ result: { version: 1, signals: ALL }, createdAtMs: Date.now() }]) === null,
  'a pre-v2 crawl → refused (it can carry a finding that is no longer true)');
ok(resolveSiteFindings(true, [{ ...fresh(ALL), complete: false }]) === null, 'an incomplete crawl → refused');
ok(hasSiteFindings(true, [fresh(ALL)]) === true && hasSiteFindings(true, [fresh(CLEAN)]) === false,
  'the picker gate and the value come from the SAME function — offer and send cannot disagree');

console.log('── 9. THE SEND FAILS CLOSED IF IT EVER GETS THERE WITHOUT ONE ──');
ok(/unsafe_template_var:no_site_findings/.test(SEND), 'templateBodyParams throws on an empty {{6}} (Meta rejects a blank parameter)');
ok(/if \(templateName === "ai_site_findings_v2" && !siteFindings\?\.trim\(\)\)/.test(SEND),
  'renderTemplateBody refuses too, so the stored transcript never carries a hole');
ok(/site_findings/.test(read('supabase/functions/send-whatsapp-message/index.ts')), 'the Inbox sender threads the value');
ok(/site_findings/.test(QUEUE), 'the queue sender threads it as well');

console.log('── 10. STORAGE KEEPS THE REAL NAME ──');
/* The stored template name IS the receipt. Nothing here renames or canonicalises it away. */
ok(!new RegExp(NAME + "'?\\s*:").test(read('src/lib/whatsappTemplates.ts').match(/TEMPLATE_RENAMES[\s\S]*?\};/)?.[0] ?? ''),
  'it is not in TEMPLATE_RENAMES — rows store ai_site_findings_v2 and keep it');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
