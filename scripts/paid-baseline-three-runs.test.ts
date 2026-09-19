import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderedFrozenQuestions } from '../src/lib/baselineReplay';
import { BASELINE_RUNS } from '../src/lib/auditQuestionCounts';

const approved = Array.from({ length: 20 }, (_, index) => `Q${index + 1}: exact Text ${index + 1}?`);
const run1 = orderedFrozenQuestions(approved);
const run2 = orderedFrozenQuestions(run1);
const run3 = orderedFrozenQuestions(run1);
const exact = (value: string[]) => JSON.stringify(value) === JSON.stringify(approved);
const root = resolve(import.meta.dirname, '..');
const starter = readFileSync(resolve(root, 'supabase/functions/_shared/audit-baseline.ts'), 'utf8');
const creator = readFileSync(resolve(root, 'supabase/functions/create-ai-audit/index.ts'), 'utf8');

const checks: Array<[string, boolean]> = [
  ['baseline target is exactly three runs', BASELINE_RUNS === 3],
  ['run 1 equals the approved ordered array', exact(run1)],
  ['run 2 equals run 1 exactly', exact(run2)],
  ['run 3 equals run 1 exactly', exact(run3)],
  ['repeat source is always run number 1', starter.includes('run.run_number) === 1') && starter.includes('.eq("run_id", first.id)')],
  ['repeat payload submits the frozen questions verbatim', starter.includes('questions,                   // verbatim repeat')],
  ['provided questions bypass generation', creator.includes('if (providedQuestions && providedQuestions.length)') && creator.includes('questions = isMeasurement ? disjoint(providedQuestions) : providedQuestions')],
  ['repeat has no regeneration fallback', creator.includes('repeat_questions_unreadable') && creator.includes('return json({ ok: false, error: "repeat_questions_unreadable"')],
];

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
