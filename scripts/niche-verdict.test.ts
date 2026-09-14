/* Tests for nicheVerdict (src/lib/nicheView.ts) — the decision sentence + the three honesty tiers.
   Driven with the REAL plumber fold numbers (the Phase-1 acceptance figures) so the test proves the
   verdict Paul will actually see. Run: npx tsx scripts/niche-verdict.test.ts */
import {
  nicheVerdict, NICHE_MIN_BUSINESSES, NICHE_MIN_TOWNS, NICHE_CONFIRM_MIN_MULTIRUN_SHARE,
  type NicheAnalysis,
} from '../src/lib/nicheView.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/** The real plumber niche as Phase 1 folds it. */
const plumbers = (over: Partial<NicheAnalysis['sample']> = {}, winOver: Record<string, number> | null = null): NicheAnalysis => ({
  trade: 'Plumbers', tradeKey: 'plumber',
  sample: { audits: 82, businesses: 72, towns: 17, questions: 337, cells: 1081, multiRunAudits: 4, multiRunQuestions: 35, ...over },
  engines: [
    { engine: 'chatgpt', label: 'ChatGPT', named: 109, answered: 476 },
    { engine: 'gemini', label: 'Gemini', named: 21, answered: 476 },
    { engine: 'ai_overview', label: 'Google AI Overview', named: 5, answered: 129 },
  ],
  winnability: winOver ?? { open: 258, unmeasured: 50, named: 22, contested: 4, no_local_race: 3 },
  sources: [
    { engine: 'chatgpt', label: 'ChatGPT', directory: 1469, ownSite: 18, authority: 27, other: 1615, total: 3129 },
    { engine: 'gemini', label: 'Gemini', directory: 302, ownSite: 25, authority: 0, other: 2019, total: 2346 },
    { engine: 'ai_overview', label: 'Google AI Overview', directory: 136, ownSite: 5, authority: 8, other: 176, total: 325 },
  ],
  topDomains: {}, towns: [], marketAudits: 6,
  /* Measured off every clean fold on file (the churn sweep): Gemini returns 4.6 names per answer
     for plumbers and 2.2 of them are the same firm every run — 2.4 free slots. */
  slots: [{ engine: 'gemini', label: 'Gemini', readableQuestions: 110, namesPerAnswer: 4.6, heldEveryRun: 2.2 }],
});

console.log('── THE PLUMBER VERDICT (the niche analysed by hand) ──');
{
  const v = nicheVerdict(plumbers());
  console.log(`   headline: ${v.headline}`);
  console.log(`   story   : ${v.engineStory}`);
  console.log(`   tier    : ${v.tier} — ${v.tierNote.slice(0, 80)}…`);
  ok(v.tier === 'indicative', `plumbers -> INDICATIVE (35 of 337 questions repeat-run, under the ${Math.round(100 * NICHE_CONFIRM_MIN_MULTIRUN_SHARE)}% bar)`);
  ok(v.kind === 'worth_outreach', 'plumbers -> WORTH OUTREACH (2.4 free slots on Gemini)');
  ok(v.opportunityEngine === 'Gemini', 'the opportunity engine is Gemini, not ChatGPT');
  ok(/worth outreach/i.test(v.headline) && /Gemini/.test(v.headline), '  headline names the call AND the engine');
  /* 🔴 THE HEADLINE IS ABOUT FREE SLOTS NOW. It used to be a named-rate sentence that quoted
     ChatGPT — the engine pages cannot move — because it was the biggest number on the row. */
  ok(/2 slots rotate/.test(v.headline), '  and says how many slots are actually free');
  ok(!/ChatGPT/.test(v.headline), '  the headline never quotes ChatGPT');
  ok(!/harder/.test(v.headline), '  and the "harder" wording is gone entirely');
  ok(/ChatGPT/.test(v.engineStory) && /director/i.test(v.engineStory), '  story explains the ChatGPT presence is directory-fed');
  ok(/own websites/.test(v.engineStory), '  and that Gemini reads businesses own sites');
  ok(/flip ~18%/.test(v.tierNote) && /30p/.test(v.tierNote), '  tier note carries the honesty label AND the priced upgrade path');
  ok(v.reasons.some((r) => r.includes('109 of 476')), '  numbers always shown, whatever the tier');
  ok(v.gaps.length >= 1 && /repeat-run/.test(v.gaps.join(' ')), '  gaps say exactly what would make it MEASURED');
}

console.log('── TIER GATING (numbers always shown; only the confident wording is gated) ──');
{
  ok(nicheVerdict(plumbers({ businesses: NICHE_MIN_BUSINESSES - 1 })).tier === 'unmeasured', 'too few businesses -> UNMEASURED');
  ok(nicheVerdict(plumbers({ towns: NICHE_MIN_TOWNS - 1 })).tier === 'unmeasured', 'single town -> UNMEASURED (that is a market read, not a niche)');
  ok(nicheVerdict(plumbers({ cells: 10 })).tier === 'unmeasured', 'too few answers -> UNMEASURED');
  const un = nicheVerdict(plumbers({ businesses: 1, towns: 1 }));
  /* ⛔ SPREAD IS CHECKED BEFORE SLOTS: one business in one town can still carry repeat runs, and a
   confident slot verdict about a single company is a market read wearing a niche's clothes. */
  ok(un.kind === 'no_verdict' && /not enough spread/i.test(un.headline), '  UNMEASURED refuses a verdict outright, even with readable slots');
  ok(un.reasons.length > 0, '  but STILL shows the numbers');
  ok(un.gaps.length >= 2, '  and itemises what is missing');
  const meas = nicheVerdict(plumbers({ multiRunQuestions: 300 }));
  ok(meas.tier === 'measured' && /^Measured:/.test(meas.tierNote), 'repeat-run majority -> MEASURED with the confident note');
  ok(!/flip ~18%/.test(meas.tierNote), '  and MEASURED drops the indicative caveat');
}

console.log('── THE DECISION: FREE SLOTS, NOT NAMED RATES ──');
{
  /* 🔴 EVERY ASSERTION IN THIS BLOCK USED TO PIN THE NAMED-RATE LADDER — "a Gemini gap but only 18%
     open -> AVOID", "no engine gap -> harder". That rule graded whether somebody was WINNING, which
     is not the question: AI returns a handful of names and a client only has to be one of them.
     openShare and lockedShare survive as supporting detail in `reasons`, and nowhere else. */
  const withSlots = (names: number, held: number, readable = 60) =>
    nicheVerdict({ ...plumbers(), slots: [{ engine: 'gemini', label: 'Gemini', readableQuestions: readable, namesPerAnswer: names, heldEveryRun: held }] } as NicheAnalysis);

  ok(withSlots(4.0, 1.3).kind === 'worth_outreach', '2.7 free slots -> WORTH OUTREACH (the electrician shape)');
  ok(withSlots(4.0, 2.6).kind === 'mixed', '1.4 free slots -> TIGHT');
  ok(withSlots(4.0, 3.4).kind === 'avoid', '0.6 free slots -> AVOID, the same firms hold every slot');
  ok(/0\.6 slots rotate/.test(withSlots(4.0, 3.4).headline), '  and the number shown agrees with the verdict, not a rounded 1');

  /* ⛔ THE OPEN/LOCKED SPLIT NO LONGER DECIDES ANYTHING. A niche the old rule called AVOID on a
     locked share is worth outreach if its slots rotate. */
  const locked = nicheVerdict({ ...plumbers({}, { open: 5, locked: 300 }),
    slots: [{ engine: 'gemini', label: 'Gemini', readableQuestions: 60, namesPerAnswer: 4.0, heldEveryRun: 1.3 }] } as NicheAnalysis);
  ok(locked.kind === 'worth_outreach', 'a heavily locked niche with free slots is still worth outreach');
  ok(locked.reasons.some((r) => /open/.test(r)), '  and the open/locked numbers survive in the reasons');

  /* ⛔ NOT MEASURED IS ITS OWN STATE AND MUST NOT READ AS A SOFT "TIGHT". Only 7.1% of
     question×engine buckets on file carry the repeat runs a slot read needs, so this is the common
     case — and the one where acting would mean acting on nothing. */
  const none = nicheVerdict({ ...plumbers(), slots: [] } as NicheAnalysis);
  ok(none.kind === 'no_verdict', 'no repeat data -> NO VERDICT, never mixed');
  ok(/not enough repeat data/.test(none.headline), '  and it says so plainly');
  ok(/3-run baselines/.test(none.headline), '  with the priced way to fix it');
  const thin = nicheVerdict({ ...plumbers(),
    slots: [{ engine: 'gemini', label: 'Gemini', readableQuestions: 3, namesPerAnswer: 4.0, heldEveryRun: 1.2 }] } as NicheAnalysis);
  ok(thin.kind === 'no_verdict', 'below the readable-question floor -> NO VERDICT');
  ok(/need 8/.test(thin.headline), '  naming the floor it missed');
}

console.log('── ABSENT-VALUE GUARDS ──');
{
  const empty = { ...plumbers({ cells: 0, questions: 0, businesses: 0, towns: 0 }), engines: [], sources: [], winnability: {} } as NicheAnalysis;
  const v = nicheVerdict(empty);
  ok(v.tier === 'unmeasured' && v.kind === 'no_verdict', 'a completely empty niche -> UNMEASURED, never a confident claim');
  ok(!v.headline.includes('NaN') && !v.reasons.join(' ').includes('NaN'), '  and no NaN anywhere');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
