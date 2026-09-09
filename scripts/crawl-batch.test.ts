/* ============================================================
   WHAT ONE PRESS OF "FIND EMAILS" DOES, AND WHAT IT SAYS IT DOES.

   Run: npx tsx scripts/crawl-batch.test.ts

   ⛔ WHAT THIS GUARDS. The button printed the UNCAPPED candidate count and then crawled 200, so
   "Crawl 1968 in view" did 200 leads and toasted "Found emails for 137 of 200" — a control whose
   number was true of nothing, on the only mechanism that produces email addresses. The property
   under test is not the arithmetic, it is that the batch, the label and the remainder all come
   from ONE plan and therefore cannot disagree.

   ⛔ IT IMPORTS THE SHIPPED MODULE. The hook itself imports '@/hooks/use-toast', which no test
   here can resolve — the same reason pushCrawlTargets was extracted. The cap moved into this leaf
   so the test proves the deployed rule rather than a restatement of it.
   ============================================================ */
import {
  CRAWL_MAX_PER_RUN, crawlBatchPlan, crawlButtonLabel, crawlDoneMessage,
} from '../src/lib/crawlBatch.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('\n── THE CAP DECIDES THE BATCH, AND THE REMAINDER IS NAMED ──');
{
  const p = crawlBatchPlan(1968, 200);
  ok(p.batch === 200, 'a 1,968-lead backlog crawls 200 in one press');
  ok(p.remaining === 1768, 'and reports 1,768 left over — the number that used to vanish');
  ok(p.capped === true, 'capped is true, so the label can show both figures');
  ok(p.candidates === 1968, 'the total is still carried, for "how much work exists"');
}
{
  const p = crawlBatchPlan(37, 200);
  ok(p.batch === 37 && p.remaining === 0 && !p.capped,
     'under the cap: one press does all of them and nothing is left');
}
{
  const p = crawlBatchPlan(200, 200);
  ok(p.batch === 200 && p.remaining === 0 && !p.capped,
     'EXACTLY at the cap is not capped — an off-by-one here would claim a phantom leftover');
}
{
  const p = crawlBatchPlan(201, 200);
  ok(p.batch === 200 && p.remaining === 1 && p.capped, 'one over the cap leaves exactly one');
}

console.log('\n── ABSENT / NONSENSE COUNTS PLAN NOTHING, NEVER EVERYTHING ──');
/* ⛔ The safe direction on a control that WRITES to outreach_leads.email is zero. A miss writes
   null, so a plan that fell through to the cap on an unreadable count would crawl 200 arbitrary
   leads. Absence is never an answer (CLAUDE.md §6). */
for (const bad of [0, -1, -999, Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number]) {
  const p = crawlBatchPlan(bad as number, 200);
  ok(p.batch === 0 && p.remaining === 0 && p.candidates === 0,
     `candidates ${String(bad)} plans an empty batch`);
}
for (const badCap of [0, -5, -200, Number.NaN]) {
  const p = crawlBatchPlan(500, badCap as number);
  ok(p.batch === 0, `an unusable cap (${String(badCap)}) crawls nothing rather than everything`);
}
/* ⚠️ `undefined` IS NOT AN UNUSABLE CAP — it is "not supplied", and the default parameter is what
   answers it. Asserted separately and deliberately: the first draft of this test lumped it in with
   the junk above and failed, which is the right way round to find out that a caller omitting the
   argument gets the shipped cap rather than zero. */
ok(crawlBatchPlan(500, undefined).batch === CRAWL_MAX_PER_RUN,
   'an omitted cap falls back to CRAWL_MAX_PER_RUN, not to zero');
ok(crawlBatchPlan(500).batch === CRAWL_MAX_PER_RUN,
   'and calling it with one argument does the same');
{
  const p = crawlBatchPlan(10.7, 200);
  ok(p.batch === 10, 'a fractional count floors — it can never exceed the real candidate list');
}

console.log('\n── THE LABEL CANNOT PROMISE MORE THAN THE PRESS DELIVERS ──');
{
  const capped = crawlBatchPlan(1968, 200);
  const label = crawlButtonLabel(capped, false);
  ok(label === 'Crawl 200 of 1,968 in view', `capped label names both numbers: "${label}"`);
  ok(!/^Crawl 1,?968 /.test(label), 'the label never leads with a total the press will not reach');

  const small = crawlBatchPlan(37, 200);
  ok(crawlButtonLabel(small, false) === 'Crawl 37 in view', 'uncapped label stays simple');
  ok(crawlButtonLabel(small, true) === 'Crawl 37 selected', 'a selection says "selected"');
  ok(crawlButtonLabel(crawlBatchPlan(0, 200), false) === 'Crawl 0 in view',
     'nothing to do reads as 0, not as a blank');
}
{
  /* THE PROPERTY, stated over the range rather than at chosen points: whatever the backlog, the
     number on the button is the number of leads the press will touch. */
  let holds = true;
  for (let n = 0; n <= 1000; n += 7) {
    const p = crawlBatchPlan(n, CRAWL_MAX_PER_RUN);
    const shown = Number((crawlButtonLabel(p, false).match(/Crawl ([\d,]+)/)?.[1] ?? '').replace(/,/g, ''));
    if (shown !== p.batch) { holds = false; break; }
    if (p.batch + p.remaining !== p.candidates) { holds = false; break; }
  }
  ok(holds, 'across 0..1000: the leading number IS the batch, and batch + remaining = candidates');
}

console.log('\n── THE RESULT SENTENCE TELLS HIM WHETHER TO PRESS AGAIN ──');
{
  const more = crawlDoneMessage(137, 200, 1768);
  ok(more.includes('1,768 still to crawl'), `names the remainder: "${more}"`);
  ok(more.includes('press again'), 'and says what to do about it');

  const done = crawlDoneMessage(12, 37, 0);
  ok(done.includes('last of them'), `finished reads as finished: "${done}"`);
  ok(!done.includes('press again'), 'and does not invite a pointless press');
}

console.log('\n── THE SHIPPED CAP ──');
ok(CRAWL_MAX_PER_RUN === 200, 'cap is 200 (change deliberately: it only changes run length)');
ok(CRAWL_MAX_PER_RUN >= 2, 'a cap of 1 would make every backlog need one press per lead');

console.log(f ? `\n${f} FAILED` : '\nAll passed.');
process.exit(f ? 1 : 0);
