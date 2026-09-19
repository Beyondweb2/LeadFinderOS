import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanAuditQuestions, editAuditQuestion } from '../src/components/AuditQuestionEditor';
import { missingQuestionnaireFields } from '../src/lib/questionnaireComplete';
import { paidBaselineRunState } from '../src/lib/paidBaselineState';
import { BASELINE_RUNS } from '../src/lib/auditQuestionCounts';

const root = resolve(import.meta.dirname, '..');
const edge = readFileSync(resolve(root, 'supabase/functions/paid-baseline/index.ts'), 'utf8');
const baseline = readFileSync(resolve(root, 'supabase/functions/_shared/audit-baseline.ts'), 'utf8');
const hub = readFileSync(resolve(root, 'src/pages/ClientHub.tsx'), 'utf8');
const shown = Array.from({ length: 20 }, (_, i) => `Q${i + 1}`);
const latest = cleanAuditQuestions(editAuditQuestion(shown, 2, 'Q3 latest edit'));
const waiting = paidBaselineRunState({ skipped: 'awaiting_questionnaire_2 (services)' });
const running = paidBaselineRunState({ audit_id: 'audit-1' });

const checks: Array<[string, boolean]> = [
  ['latest Q3 edit is the exact approved value', latest[2] === 'Q3 latest edit'],
  ['approval order remains exact', latest[0] === 'Q1' && latest[19] === 'Q20' && latest.length === 20],
  ['approve consumes current submitted questions instead of stale stored draft', edge.includes('if (action === "approve") {\n      next = cleanQuestions(body.questions);')],
  ['ClientHub saves and approves the same current ordered array', hub.includes("act('save', { questions: qs })") && hub.includes("act('approve', { questions: qs })")],
  ['structured services satisfy the baseline questionnaire', missingQuestionnaireFields({ confirmed_location: 'Canterbury', services: '', services_list: ['Emergency entry'] }).length === 0],
  ['missing required category remains a useful refusal', edge.includes('started.error || started.skipped') && readFileSync(resolve(root, 'src/lib/paidBaseline.ts'), 'utf8').includes('Add a business category')],
  ['skipped start remains approved and truthful', waiting.status === 'approved' && waiting.start_note?.startsWith('awaiting_questionnaire_2') === true],
  ['created audit is reported running', running.status === 'running' && running.audit_id === 'audit-1'],
  ['baseline creation requests exactly three runs', BASELINE_RUNS === 3 && baseline.includes('baseline_target_runs: BASELINE_RUNS')],
  ['start submits approved questions and never asks generation to replace them', baseline.includes('questions: approvedQuestions')],
];

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
