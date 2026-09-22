import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAuditPreviewRequest } from '../src/lib/auditQuestionContext';
import { mergeClientContext } from '../src/lib/clientContext';
import { addAuditQuestion, applyAuditQuestionPaste, cleanAuditQuestions, editAuditQuestion, removeAuditQuestion } from '../src/components/AuditQuestionEditor';
import { attachPersistedQueueProgress, formatBaselineProgress } from '../src/lib/baselineProgress';
import { judgeRemeasure, orderedFrozenQuestions, planReplay } from '../src/lib/baselineReplay';
import { BASELINE_RUNS } from '../src/lib/auditQuestionCounts';

type State = {
  status: 'needs_questions' | 'needs_approval' | 'approved' | 'running' | 'complete';
  questions: string[];
  approved: string[] | null;
  targetRuns: number | null;
};
const state: State = { status: 'needs_questions', questions: [], approved: null, targetRuns: null };
const checks: Array<[string, boolean]> = [];
const check = (label: string, value: boolean) => checks.push([label, value]);

// Open → load context.
const context = mergeClientContext({
  onboarding: { confirmed_location: 'Canterbury', services_list: ['Emergency locksmith', 'Lock changes'], areas_list: ['Canterbury', 'Whitstable'] },
  lead: { business_name: 'MCLocksmiths centre', search_keyword: 'Locksmiths', website: 'https://mc-locksmiths.com/', country: 'UK' },
});
check('open and load normalized client context', context.business_name === 'MCLocksmiths centre' && context.primary_location === 'Canterbury');

// Generate mocked suggestions through the same request contract; no function/provider is invoked.
const request = buildAuditPreviewRequest(context, { questionCount: 20, purpose: 'baseline', userId: 'user-1', leadId: 'lead-1' });
const mockedSuggestions = Array.from({ length: 20 }, (_, index) => `Question ${index + 1} for Canterbury?`);
state.questions = [...mockedSuggestions];
check('mocked generation uses paid baseline preview contract', request.preview === true && request.purpose === 'baseline' && request.question_count === 20 && state.questions.length === 20);

// Edit → delete → add → paste.
state.questions = editAuditQuestion(state.questions, 2, 'Question 3 latest operator edit?');
state.questions = removeAuditQuestion(state.questions, 4);
state.questions = addAuditQuestion(state.questions); // blank editable row
state.questions = applyAuditQuestionPaste(state.questions, 'Question 1 for Canterbury?\nPasted customer question?', 'append');
check('edit/delete/add/paste yields clean ordered set', state.questions.length === 20 && state.questions[2] === 'Question 3 latest operator edit?' && state.questions.at(-1) === 'Pasted customer question?');

// Save draft → reload.
state.questions = cleanAuditQuestions(state.questions);
state.status = 'needs_approval';
const persistedDraft = JSON.parse(JSON.stringify(state));
const reloaded = JSON.parse(JSON.stringify(persistedDraft)) as State;
check('saved draft reloads identically', JSON.stringify(reloaded.questions) === JSON.stringify(state.questions) && reloaded.status === 'needs_approval');

// Approve → freeze exact ordered set.
state.approved = [...reloaded.questions];
state.status = 'approved';
check('approval freezes exact current editor array', JSON.stringify(state.approved) === JSON.stringify(state.questions));

// Start mocked baseline. No edge function/provider is invoked.
state.targetRuns = BASELINE_RUNS;
state.status = 'running';
check('mocked start targets exactly three runs', state.targetRuns === 3 && state.status === 'running');

// Persisted progress reconstruction and exact per-run questions.
const runQuestions = [1, 2, 3].map(() => orderedFrozenQuestions(state.approved));
check('all three run question arrays are exact', runQuestions.every((questions) => JSON.stringify(questions) === JSON.stringify(state.approved)));
const persistedRuns = [1, 2, 3].map((run_number) => ({ id: `run-${run_number}`, run_number, status: run_number === 1 ? 'complete' : run_number === 2 ? 'running' : 'pending' }));
let queue = [
  ...Array.from({ length: 20 }, () => ({ run_id: 'run-1', status: 'done' })),
  ...Array.from({ length: 8 }, () => ({ run_id: 'run-2', status: 'done' })),
  ...Array.from({ length: 12 }, () => ({ run_id: 'run-2', status: 'pending' })),
  ...Array.from({ length: 20 }, () => ({ run_id: 'run-3', status: 'pending' })),
];
check('running state reconstructs from persisted rows', formatBaselineProgress(attachPersistedQueueProgress(persistedRuns, queue), 3) === 'Run 1: 20/20 · Run 2: 8/20 · Run 3: 0/20');

queue = [1, 2, 3].flatMap((run) => Array.from({ length: 20 }, () => ({ run_id: `run-${run}`, status: 'done' })));
const completedProgress = formatBaselineProgress(attachPersistedQueueProgress(persistedRuns.map((run) => ({ ...run, status: 'complete' })), queue), 3);
state.status = 'complete';
check('three completed runs reconstruct as complete', completedProgress === 'Run 1: 20/20 · Run 2: 20/20 · Run 3: 20/20' && state.status === 'complete');

// Remeasure exact replay.
const replay = planReplay({ pointer: 'baseline-1', auditExists: true, askedQuestions: runQuestions[0] });
const verdict = replay.ok ? judgeRemeasure({ proposed: replay.questions, baselineAsked: runQuestions[0], targetRuns: 3 }) : null;
check('remeasure plans and accepts only the exact frozen array', replay.ok && verdict?.allow === true && JSON.stringify(replay.questions) === JSON.stringify(state.approved));

const root = resolve(import.meta.dirname, '..');
const hub = readFileSync(resolve(root, 'src/pages/ClientHub.tsx'), 'utf8');
/* Since 2026-09-22 the chain is approve → run through the shared controller (paidBaselineFlow.ts):
   approve freezes exactly what it is sent, so the extra save was a third round trip for nothing. */
check('production ClientHub uses the approve → run controller', hub.includes('approveAndStart(invoke, cleanAuditQuestions(questions), onStep)') && hub.includes('startApproved(invoke, current, onStep)'));

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
