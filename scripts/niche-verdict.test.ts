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
});

console.log('── THE PLUMBER VERDICT (the niche analysed by hand) ──');
{
  const v = nicheVerdict(plumbers());
  console.log(`   headline: ${v.headline}`);
  console.log(`   story   : ${v.engineStory}`);
  console.log(`   tier    : ${v.tier} — ${v.tierNote.slice(0, 80)}…`);
  ok(v.tier === 'indicative', `plumbers -> INDICATIVE (35 of 337 questions repeat-run, under the ${Math.round(100 * NICHE_CONFIRM_MIN_MULTIRUN_SHARE)}% bar)`);
  ok(v.kind === 'worth_outreach', 'plumbers -> WORTH OUTREACH (77% open + a Gemini gap)');
  ok(v.opportunityEngine === 'Gemini', 'the opportunity engine is Gemini, not ChatGPT');
  ok(/worth outreach/i.test(v.headline) && /Gemini/.test(v.headline), '  headline names the call AND the engine');
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
  ok(un.kind === 'no_verdict' && /Not enough spread/.test(un.headline), '  UNMEASURED refuses a verdict outright');
  ok(un.reasons.length > 0, '  but STILL shows the numbers');
  ok(un.gaps.length >= 2, '  and itemises what is missing');
  const meas = nicheVerdict(plumbers({ multiRunQuestions: 300 }));
  ok(meas.tier === 'measured' && /^Measured:/.test(meas.tierNote), 'repeat-run majority -> MEASURED with the confident note');
  ok(!/flip ~18%/.test(meas.tierNote), '  and MEASURED drops the indicative caveat');
}

console.log('── AVOID / MIXED shapes ──');
{
  const locked = nicheVerdict(plumbers({}, { open: 20, locked: 40, named: 100 }));
  ok(locked.kind === 'avoid' && /not worth mass outreach/i.test(locked.headline), 'locked questions -> AVOID');
  // Very few open questions -> AVOID even with a Gemini gap (18% open is concentrated).
  const veryClosed = nicheVerdict(plumbers({}, { open: 60, named: 200, contested: 77 }));
  ok(veryClosed.kind === 'avoid' && /only 18% of 337 questions are open/.test(veryClosed.headline),
    'a Gemini gap but only 18% open -> AVOID (open share leads)');
  // Middling open share (44%) with a Gemini gap -> MIXED, not a confident yes.
  const midOpen = nicheVerdict(plumbers({}, { open: 150, named: 150, contested: 37 }));
  ok(midOpen.kind === 'mixed' && /mixed/i.test(midOpen.headline), '44% open + a Gemini gap -> MIXED, not a confident yes');
  // ⛔ A genuinely locked-up niche needs a locked SHARE, not one locked question (the locksmith fault).
  const oneLocked = nicheVerdict(plumbers({}, { open: 258, locked: 2, named: 77 }));
  ok(oneLocked.kind !== 'avoid', '2 locked questions of 337 does NOT condemn a niche (the locksmith fault)');
  const trulyLocked = nicheVerdict(plumbers({}, { open: 100, locked: 150, named: 87 }));
  ok(trulyLocked.kind === 'avoid' && /locked up by incumbents/.test(trulyLocked.headline), '45% locked -> AVOID');
  // No engine clears the absence bar: honest "harder / no clear gap", never "named everywhere".
  const present = { ...plumbers(), engines: [
    { engine: 'chatgpt', label: 'ChatGPT', named: 400, answered: 476 },
    { engine: 'gemini', label: 'Gemini', named: 380, answered: 476 },
  ] } as NicheAnalysis;
  const p = nicheVerdict(present);
  ok(p.kind === 'mixed' && p.opportunityEngine === null && /no engine shows a clear gap/.test(p.headline),
    'no engine gap -> "harder, no clear gap" with the real rate, never an overstated "named everywhere"');
  // ⛔ The opportunity engine is only ever ChatGPT/Gemini — never the unscored engines.
  const organicGap = { ...plumbers(), engines: [
    { engine: 'chatgpt', label: 'ChatGPT', named: 200, answered: 476 },
    { engine: 'gemini', label: 'Gemini', named: 300, answered: 476 },
    { engine: 'google_organic', label: 'Google organic', named: 1, answered: 476 },
  ] } as NicheAnalysis;
  ok(nicheVerdict(organicGap).opportunityEngine === null,
    'an unscored engine (Google organic) is NEVER offered as the opportunity — no evidence pages move it');
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
