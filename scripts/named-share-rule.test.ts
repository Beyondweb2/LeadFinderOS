/* "AI NAMED OTHERS INSTEAD" ONLY WHEN NAMED IN AT MOST A THIRD (2026-10-20, Paul) — src/lib/namedShareRule.ts.
   The template text is never edited; the rule decides who gets it, inside resolveAuditReplyVars (every audit-class door).
   The sweep: any readable template body that makes the claim must be in NAMED_INSTEAD_TEMPLATES. Pure. */
import { readFileSync } from 'node:fs';
import { NAMED_INSTEAD_TEMPLATES, mayClaimNamedInstead, namedShareOf } from '../src/lib/namedShareRule.ts';
import { scoreHookRun, type HookStateV2 } from '../src/lib/hookScore.ts';
import { AI_OVERVIEW_STAMP_KEY, scoringMethodFor } from '../src/lib/aiOverview.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. the rule');
ok(mayClaimNamedInstead(0, 6) && mayClaimNamedInstead(2, 6) && mayClaimNamedInstead(1, 3), 'named in a third or fewer → allowed');
ok(!mayClaimNamedInstead(3, 6) && !mayClaimNamedInstead(5, 6) && !mayClaimNamedInstead(6, 6) && !mayClaimNamedInstead(2, 5), 'named in more than a third → not allowed');
ok(!mayClaimNamedInstead(null, 6) && !mayClaimNamedInstead(0, 0) && !mayClaimNamedInstead(undefined, undefined), 'no counts on record → not allowed (absence never allows the claim)');

console.log('2. every door goes through it');
const AR = read('supabase/functions/_shared/audit-reply.ts');
ok(/const share = namedShareOf\(hookScore\);\s*if \(share && opts\.templateName && NAMED_INSTEAD_TEMPLATES\.has\(opts\.templateName\) && !mayClaimNamedInstead\(share\.named, share\.total\)\)/.test(AR), 'resolveAuditReplyVars refuses the claim templates above a third, counted with namedShareOf');
ok(/scoringMethod: scoringMethodFor\(audit\.created_at/.test(AR) && /scoreNamed: share\?\.named \?\? null, scoreTotal: share\?\.total \?\? null/.test(AR), "the send gate and the reply drafter read the SAME count (the audit screen's score)");
ok(!/mayClaimNamedInstead\(hookScore\./.test(AR), 'no second, two-engine count left in the send path');
ok(/reason: `\$\{HOOK_NO_GAP_REASON\}: \$\{namedShareRefusal/.test(AR), '…with the no-gap prefix every caller already handles');
for (const fn of ['supabase/functions/send-whatsapp-message/index.ts', 'supabase/functions/process-whatsapp-queue/index.ts']) {
  const src = read(fn);
  const calls = src.match(/resolveAuditReplyVars\([^)]*\)/g) ?? [];
  ok(calls.length > 0 && calls.every((c) => /templateName/.test(c)), `${fn.split('/')[2]}: every call passes the template name`);
}

console.log('2b. Nola: Google AI counts (Paul, 2026-10-20)');
{
  /* Nola's Driving School, live audit 2026-10-19 16:03 (after Google AI joined the score): one sequential question,
     ChatGPT named her, Gemini did not, Google showed an AI answer that did not. The audit screen says 1 of 3 (33%). */
  const BIZ = "Nola's Driving School";
  const cell = (named: boolean) => ({ named, self_named: named, answer_text: named ? `Try ${BIZ} in Halstead.` : 'Try Driving 4CE Driving School, Reliant Driver Training or One Direction Driving School.', competitors: named ? [] : ['Driving 4CE Driving School', 'Reliant Driver Training', 'One Direction Driving School'], citations: [] });
  const state = { version: 2, engines: ['chatgpt', 'gemini'], planned: ['who is the best driving instructor for beginners in Halstead UK', 'driving instructors in Halstead UK', 'emergency driving lessons in Halstead UK'], sequential: true, next_index: 1, executed: 1, stop_reason: 'not_named' } as HookStateV2;
  const rows = [{ question: state.planned[0], status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell(true), gemini: cell(false), ai_overview: cell(false), [AI_OVERVIEW_STAMP_KEY]: 'shown' } }];
  const ctx = { named: { businessName: BIZ, trade: 'Driving instructors', town: 'Halstead' }, town: 'Halstead', trade: 'Driving instructors' };
  const now = scoreHookRun(state, rows, { ...ctx, scoringMethod: scoringMethodFor('2026-10-19T16:03:39Z') });
  const share = namedShareOf(now);
  ok(now.scored.percent === 33 && share?.named === 0 && share?.total === 2, `Nola: ChatGPT is not counted (2026-10-21) — Gemini 0/1 + Google AI 0/1 = 0 of 2 (${share?.named} of ${share?.total})`);
  ok(mayClaimNamedInstead(share?.named, share?.total), 'Nola: still allowed');
  const old = namedShareOf(scoreHookRun(state, rows, { ...ctx, scoringMethod: scoringMethodFor('2026-10-18T12:00:00Z') }));
  ok(old?.named === 0 && old?.total === 1, 'an audit from before Google AI joined the score: Gemini alone (ChatGPT never counted)');
  ok(namedShareOf(null) === null && namedShareOf({ complete: false, scored: { named: 0, expected: 3 } }) === null, 'no score, or an incomplete one → no count (the claim is never allowed on absence)');
}

console.log('2c. GSI Driving School: ChatGPT is not counted (Paul, 2026-10-21)');
{
  /* GSI Driving School, live audit 2026-10-21: two questions. ChatGPT named them in both, Gemini in one, Google showed an AI answer
     once and did not name them. Counted with ChatGPT this read 3 of 5 and lost "AI is recommending your competitors instead". */
  const BIZ = 'GSI Driving School';
  const cell = (named: boolean) => ({ named, self_named: named, answer_text: named ? `Try ${BIZ} in Woking.` : "Try PassMeFast, LPOD Academy or driveJohnson's.", competitors: named ? [] : ['PassMeFast', 'LPOD Academy', "driveJohnson's"], citations: [] });
  const state = { version: 2, engines: ['chatgpt', 'gemini'], planned: ['driving instructors in Woking UK', 'emergency driving lessons for new drivers in Woking UK', 'best driving school in Woking UK'], sequential: true, next_index: 2, executed: 2, stop_reason: 'not_named' } as HookStateV2;
  const rows = [
    { question: state.planned[0], status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell(true), gemini: cell(true), [AI_OVERVIEW_STAMP_KEY]: 'not_shown' } },
    { question: state.planned[1], status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell(true), gemini: cell(false), ai_overview: cell(false), [AI_OVERVIEW_STAMP_KEY]: 'shown' } },
  ];
  const ctx = { named: { businessName: BIZ, trade: 'Driving instructors', town: 'Woking' }, town: 'Woking', trade: 'Driving instructors' };
  const sc = scoreHookRun(state, rows, { ...ctx, scoringMethod: scoringMethodFor('2026-10-21T08:10:00Z') });
  const share = namedShareOf(sc);
  ok(share?.named === 1 && share?.total === 3, `GSI: Gemini 1/2 + Google AI 0/1 = 1 of 3, ChatGPT's 2/2 left out (${share?.named} of ${share?.total})`);
  ok(mayClaimNamedInstead(share?.named, share?.total), 'GSI: 1 of 3 → the full pitch / claim templates are allowed');
}

console.log('3. the sweep: a body that claims it is in the set');
const CLAIM = /\bnot\s+you\b|\bnaming\b[^.]{0,60}\b(not|instead)\b|\binstead\s+of\s+you\b|\bahead\s+of\s+you\b|\bit\s+mentioned\b|came\s+back\s+with\s+businesses/i;
for (const [name, fn] of Object.entries(READABLE_TEMPLATE_BODIES)) {
  const body = fn('ZZ Fixture Plumbing', 'https://findable.live/r/abc123', 'plumber', 'Rival A, Rival B', 'Sam', 'Leeds', 'a fault', 'a finding', '20%', 'Paul');
  if (CLAIM.test(body) && !/explain_offer|STALE/.test(name)) ok(NAMED_INSTEAD_TEMPLATES.has(name), `${name}: claims AI named others → in the set`);
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
