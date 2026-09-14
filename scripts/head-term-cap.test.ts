/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A JUDGED SET MUST NOT BE TWELVE WAYS OF ASKING ONE QUESTION.

   🔴 WHITE SPARKS' FROZEN BASELINE IS 11 OF 12 HEAD TERMS — best / top rated / recommended / local
   / reliable / affordable / certified / emergency / easy to contact / which-do-people-recommend /
   the bare term / and one that literally says "electrician electrician". That is the set his refund
   is measured against and the set day 28 replays verbatim. AD Locksmithing's, generated the same
   day, is 5 of 11: so this is CHANCE, both are over the cap, and nothing about either looked wrong.

   ⛔ THE CAP IS A THIRD, MEASURED. Head terms are named in 313 of 2,032 answer cells (15.4%) across
   every clean fold on file; service terms in 1,256 of 5,413 (23.2%). And the SURPLUS above a third
   is far worse than the average head term: of the 315 questions a one-third cap would have dropped,
   eleven were ever named (3.5%), pooled rate 4.7%. It replaces questions that win 1 time in 21 with
   questions that win 1 in 4.

   ⛔ THE FLOOR OF ONE IS NOT A ROUNDING DETAIL. isHeadIntent's own note calls the head term "the
   single most valuable question in a market — worth asking ONCE and then deliberately not
   repeating". A cap that reached zero would delete the query a client most wants to win.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capHeadTerms, headTermCap, isHeadIntent } from '../src/lib/seedGuard';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('-- the cap --');
ok(headTermCap(12) === 4, '12 questions → 4 head terms (a third)');
ok(headTermCap(20) === 6, '20 → 6');
ok(headTermCap(11) === 3, '11 → 3');
/* ⛔ NEVER ZERO. */
ok(headTermCap(3) === 1, '3 → 1, never none');
ok(headTermCap(1) === 1, '1 → 1');
ok(headTermCap(0) === 1, 'and a nonsense target still allows the one that matters');

console.log('\n-- 🔴 it would have caught White Sparks --');
/* The real frozen set, verbatim. */
const WS = [
  'top rated electrician in thetford UK', 'electrician electrician in thetford UK',
  'certified electrician in thetford UK', 'affordable electrician in thetford UK',
  'best electrician in thetford UK', 'which electrician in thetford UK do people recommend',
  'electrician in thetford UK that is easy to contact', 'recommended electrician in thetford UK',
  'electrician in thetford UK', 'local electrician in thetford UK',
  'reliable electrician in thetford UK', 'emergency electrician in thetford UK',
];
ok(WS.filter((q) => isHeadIntent(q, 'electrician')).length === 11, 'the real set is 11 of 12 head terms');
const ws = capHeadTerms(WS, 12, 'electrician', 'thetford UK');
const wsHeads = ws.questions.filter((q) => isHeadIntent(q, 'electrician')).length;
ok(wsHeads <= 4, `after the cap it holds ${wsHeads} head terms, not 11`);
ok(ws.dropped.length === 7, `and names the 7 it dropped`);
ok(ws.questions.length === 12, 'the set is still 12 questions — topped up, not shortened');
/* ⛔ THE TOP-UPS ARE REAL SERVICES, NOT MORE HEAD TERMS. This is the trap in this guard: the
   deterministic fallback templates are ALL head terms ("best {trade} in {town}", "most popular…"),
   so topping up from the usual source would reintroduce exactly what was removed. */
ok(ws.added.length === 7, `it added ${ws.added.length} replacements from the trade's intents`);
ok(ws.added.every((q) => !isHeadIntent(q, 'electrician')), 'and NOT ONE of them is another head term');
ok(ws.added.every((q) => q.includes('thetford UK')), 'every top-up names the town, so the town guard after it passes them');
console.log(`     kept: ${ws.questions.filter((q) => !ws.added.includes(q)).join(' | ')}`);
console.log(`     added: ${ws.added.join(' | ')}`);

console.log('\n-- a healthy set is left alone --');
/* ⚠️ A guard that rewrites good sets is worse than none. AD's is over the cap and must be trimmed;
   a set already inside it must come back byte-identical. */
const GOOD = [
  'emergency lockout in Leeds UK', 'lock repair in Leeds UK', 'key cutting in Leeds UK',
  'uPVC door locks in Leeds UK', 'safes in Leeds UK', 'best locksmith in Leeds UK',
];
const good = capHeadTerms(GOOD, 6, 'Locksmiths', 'Leeds UK');
ok(good.dropped.length === 0, 'nothing dropped from a set already inside the cap');
ok(good.questions.join('|') === GOOD.join('|'), 'and it comes back in the same order, unchanged');

console.log('\n-- order is the model\'s confidence ranking, so only the surplus moves --');
ok(ws.questions[0] === 'top rated electrician in thetford UK', 'the first question it offered survives');

console.log('\n-- absent cases --');
ok(capHeadTerms([], 12, 'electrician', 'thetford UK').questions.length === 0, 'an empty set stays empty');
/* ⛔ NO TOWN, NO INVENTED QUESTIONS. A national audit has no place to name, and "emergency
   electrician in " is not a question. It comes up SHORT instead — the same choice dropResearchIntent
   makes, and the right one: filler is how the LLM playbook happened. */
const noTown = capHeadTerms(WS, 12, 'electrician', '');
ok(noTown.added.length === 0, 'with no town nothing is invented');
ok(noTown.questions.length === 5, 'the set comes up short rather than being padded');
/* A trade with no intent list falls back to the generic one rather than throwing. */
const odd = capHeadTerms(['best cobbler in Ely UK', 'top rated cobbler in Ely UK', 'cobbler in Ely UK'], 3, 'cobbler', 'Ely UK');
ok(odd.questions.length > 0, 'an unknown trade still produces a set');
ok(odd.questions.filter((q) => isHeadIntent(q, 'cobbler')).length <= headTermCap(3), 'and is still capped');

console.log('\n-- it is wired to the JUDGED sets and to nothing else --');
const fn = read('supabase/functions/create-ai-audit/index.ts');
ok(/capHeads = false,/.test(fn), 'the cap is opt-in, default off');
/* ⛔ THE OUTREACH HOOK MUST NOT BE CAPPED. It is 3 throwaway questions, never compared, and capping
   it to one head term changes cold outreach — a decision nobody asked for. */
ok((fn.match(/coverage, true,?\n?\s*\)?;?/g) ?? []).length >= 1 || /coverage, true\)/.test(fn),
   'the judged call sites pass true');
ok(/generateQuestions\(businessName, businessType, locationText, hasWebsite, specialisms, questionCount, businessScope, country, "", moneyQuestionCount\)/.test(fn),
   'and the outreach hook call site is untouched — no flag, no cap');
ok(/pooled\.questions = spread\.questions;/.test(fn), 'the cap runs on the POOLED set, before the caller slices');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
