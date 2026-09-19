import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attachPersistedQueueProgress, formatBaselineProgress } from '../src/lib/baselineProgress';

const runs = [
  { id: 'run-1', run_number: 1, status: 'complete' },
  { id: 'run-2', run_number: 2, status: 'running' },
];
const queue = [
  ...Array.from({ length: 20 }, () => ({ run_id: 'run-1', status: 'done' })),
  ...Array.from({ length: 8 }, () => ({ run_id: 'run-2', status: 'done' })),
  ...Array.from({ length: 12 }, () => ({ run_id: 'run-2', status: 'pending' })),
];
const firstLoad = attachPersistedQueueProgress(runs, queue);
const afterReturn = attachPersistedQueueProgress(JSON.parse(JSON.stringify(runs)), JSON.parse(JSON.stringify(queue)));
const expected = 'Run 1: 20/20 · Run 2: 8/20 · Run 3: waiting';
const root = resolve(import.meta.dirname, '..');
const edge = readFileSync(resolve(root, 'supabase/functions/paid-client-hub/index.ts'), 'utf8');
const hub = readFileSync(resolve(root, 'src/pages/ClientHub.tsx'), 'utf8');

const checks: Array<[string, boolean]> = [
  ['successful queue rows use done vocabulary', firstLoad[0].queue_complete === 20 && edge.includes('attachPersistedQueueProgress')],
  ['partial persisted progress is accurate', firstLoad[1].queue_complete === 8 && firstLoad[1].queue_total === 20],
  ['missing third run renders waiting', formatBaselineProgress(firstLoad, 3) === expected],
  ['closing and returning reconstructs identical state', formatBaselineProgress(afterReturn, 3) === expected],
  ['ClientHub formats server-persisted runs rather than modal state', hub.includes('formatBaselineProgress(runs, 3)') && !hub.includes('setInterval(')],
];

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
