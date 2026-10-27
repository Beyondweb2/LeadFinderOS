/* GOOGLE AI WITH NO ANSWER IS NEVER A MISS AND NEVER "IN SCORE" (2026-10-27).
   Google shows no AI answer for roughly one search in four, so every surface that sits beside the score must
   say a search with none shown is "left out of the score" — not "in score", not "not named". Pins:
     A. overviewScoreNote: "in score" only for a shown answer on a method-2 audit; none shown is "left out";
        a method-1 audit never scored Google AI.
     B. a not-shown search has no named verdict, a neutral chip, and counts nowhere.
     C. the two screens that used to say "In the score" / "(not scored)" regardless now use the note. */
import { readFileSync } from 'node:fs';
import { overviewFor, overviewScoreNote, overviewTally, overviewChipTone, overviewChipTitle, AI_OVERVIEW_STAMP_KEY } from '../src/lib/aiOverview.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

ok(overviewScoreNote('shown', true) === 'in score', 'A: shown answer on a method-2 audit is in score');
ok(overviewScoreNote('not_shown', true) === 'left out of the score', 'A: none shown on a method-2 audit is left out of the score');
for (const s of ['pending', 'failed', 'not_recorded'] as const) ok(overviewScoreNote(s, true) === 'left out of the score', `A: ${s} is never in score`);
ok(overviewScoreNote('shown', false) === 'not in score' && overviewScoreNote('not_shown', false) === 'not in score', 'A: a method-1 audit never scored Google AI');

const none = overviewFor({ status: 'done', cells: { [AI_OVERVIEW_STAMP_KEY]: 'not_shown', _google_serp: { results: [], count: 0 } } }, { stamped: true });
ok(none.state === 'not_shown' && none.named === null, 'B: a search with no AI answer has no named verdict');
const t = overviewTally([none, none]);
ok(!!t && t.shown === 0 && t.named === 0 && t.notShown === 2, 'B: it is counted as not shown, never as shown-and-missed');
ok(overviewChipTone(t) === 'neutral', 'B: the chip stays neutral (never the red not-named tone)');
ok(/left out of the score/.test(overviewChipTitle(t, true)) && !/Counted in the score/.test(overviewChipTitle(t, true)), 'B: the tooltip says left out of the score, not counted');

const hook = readFileSync(new URL('../src/components/HookVisibilityView.tsx', import.meta.url), 'utf8');
const prospect = readFileSync(new URL('../src/components/ProspectAuditView.tsx', import.meta.url), 'utf8');
ok(!hook.includes('(not scored)') && hook.includes('overviewScoreNote('), 'C: the call-card Google AI line takes its score note from overviewScoreNote');
ok(!/inScore \? 'In the score' :/.test(prospect) && /googleAi\.shown > 0/.test(prospect), 'C: the prospect audit tile says "In the score" only when Google showed an answer');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
