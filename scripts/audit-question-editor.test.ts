import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addAuditQuestion, applyAuditQuestionPaste, cleanAuditQuestions, editAuditQuestion, removeAuditQuestion } from '../src/components/AuditQuestionEditor';

const root = resolve(import.meta.dirname, '..');
const surfaces = ['src/pages/AiAudit.tsx', 'src/pages/PaidBaselineSetup.tsx', 'src/pages/ClientHub.tsx'];
const generated = ['Q1', 'Q2', 'Q3'];
const edited = editAuditQuestion(generated, 1, 'Q2 edited');
const removed = removeAuditQuestion(edited, 0);
const added = addAuditQuestion(removed);
const pasted = applyAuditQuestionPaste(['Q1', 'Q2'], '1. Q2\n- Q3\n\nQ4\nq3', 'append');
const replaced = applyAuditQuestionPaste(['old'], 'Q3\nQ1\nQ2', 'replace');

const checks: Array<[string, boolean]> = [
  ['all three operator surfaces use the shared editor', surfaces.every((file) => readFileSync(resolve(root, file), 'utf8').includes('AuditQuestionEditor'))],
  ['generated questions remain in display order', generated.join('|') === 'Q1|Q2|Q3'],
  ['editing changes only the selected question', edited.join('|') === 'Q1|Q2 edited|Q3'],
  ['delete removes only the selected question', removed.join('|') === 'Q2 edited|Q3'],
  ['add appends one editable blank row', added.length === 3 && added[2] === ''],
  ['multiline paste strips list markers and deduplicates case-insensitively', pasted.join('|') === 'Q1|Q2|Q3|Q4'],
  ['replace paste preserves parsed ordering', replaced.join('|') === 'Q3|Q1|Q2'],
  ['blank questions are rejected from the clean submission', cleanAuditQuestions([' Q1 ', '', '   ', 'q1', 'Q2']).join('|') === 'Q1|Q2'],
];

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
