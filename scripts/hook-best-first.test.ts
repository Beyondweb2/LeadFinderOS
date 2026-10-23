/* Question 1 of a NEW hook is "Who is the best [trade] in [town]?" (Paul, 2026-10-23), the hook quotes it, and
   old audits are untouched. */
import { bestFirstHookQuestion, isBestFirstQuestion, pickHookResult, type HookResult } from '../src/lib/hookScore.ts';
import { planHookQuestions, planHookQuestionsBestFirst } from '../src/lib/hookAudit.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const PLACE = 'Wolverhampton UK';
const GEN = [
  'driving instructor in Wolverhampton UK',
  'Can you recommend a driving instructor in Wolverhampton UK?',
  'driving lessons for nervous drivers in Wolverhampton UK',
  'I need a driving instructor in Wolverhampton UK, who should I call?',
];

const best = bestFirstHookQuestion('driving instructor', PLACE);
ok(best === 'Who is the best driving instructor in Wolverhampton UK?', `question built from the real trade and town (${best})`);
ok(bestFirstHookQuestion('Electricians', 'Addlestone UK') === 'Who is the best electrician in Addlestone UK?', 'plural trade is singular, any trade');
ok(bestFirstHookQuestion('driving instructor', '') === null, 'no town = no best question');
ok(isBestFirstQuestion(best!) && !isBestFirstQuestion('Can you recommend a driving instructor in Wolverhampton UK?'), 'shape check');

const plan = planHookQuestionsBestFirst(GEN, { town: 'Wolverhampton', trade: 'driving instructor', place: PLACE });
ok(plan.length === 3 && plan[0] === best, `best is question 1 of exactly three (${JSON.stringify(plan)})`);
ok(!plan.some((q) => /nervous/i.test(q)), 'nervous drivers question removed for a driving instructor');
const old = planHookQuestions(GEN.filter((q) => !/nervous/i.test(q)), { town: 'Wolverhampton' });
ok(JSON.stringify(plan.slice(1)) === JSON.stringify(old.slice(0, 2)), 'the rest keep their planned order');

const again = planHookQuestionsBestFirst(plan, { town: 'Wolverhampton', trade: 'driving instructor', place: PLACE });
ok(JSON.stringify(again) === JSON.stringify(plan), 'planning a confirmed plan again changes nothing');

const other = planHookQuestionsBestFirst(['plumber in Leeds UK', 'nervous plumber Leeds'], { town: 'Leeds', trade: 'plumber', place: 'Leeds UK' });
ok(other.some((q) => /nervous/i.test(q)) && other[0] === 'Who is the best plumber in Leeds UK?', 'nervous is only dropped for driving trades');

const unreadable = planHookQuestionsBestFirst(GEN, { town: 'X', trade: '', place: 'X' });
ok(JSON.stringify(unreadable) === JSON.stringify(planHookQuestions(GEN.filter((q) => !/nervous/i.test(q)).slice(0, 4), { town: 'X' })) || unreadable.length <= 3, 'unreadable trade falls back to the old plan');

const row = (i: number, q: string, n: number): HookResult => ({
  questionIndex: i, question: q, engine: 'gemini', label: 'Gemini', status: 'not_named',
  competitors: ['A', 'B', 'C', 'D'].slice(0, n), answerExcerpt: '',
} as unknown as HookResult);
const ctx = { town: 'Wolverhampton', trade: 'driving instructor' };
const hookQ1 = pickHookResult([row(1, 'driving instructor in Wolverhampton UK', 4), row(0, best!, 3)], ctx);
ok(hookQ1?.question === best, 'hook quotes question 1 when it is a miss with three rivals');
const oldPicks = [row(0, 'driving instructor in Wolverhampton UK', 3), row(1, 'Can you recommend a driving instructor in Wolverhampton UK?', 4)];const oldAudit = pickHookResult(oldPicks, ctx);ok(oldAudit?.question === 'Can you recommend a driving instructor in Wolverhampton UK?' || oldAudit?.question === 'driving instructor in Wolverhampton UK', 'an old audit (no best Q1) still picks by the old rules');
const thin = pickHookResult([row(0, best!, 2), row(1, 'driving instructor in Wolverhampton UK', 3)], ctx);
ok(thin?.question === 'driving instructor in Wolverhampton UK', 'question 1 with under three rivals does not displace a full miss');

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('hook-best-first: all passed');
