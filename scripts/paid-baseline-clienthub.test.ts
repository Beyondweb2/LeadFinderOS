import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const hub = readFileSync(resolve(root, 'src/pages/ClientHub.tsx'), 'utf8');
const setup = readFileSync(resolve(root, 'src/pages/PaidBaselineSetup.tsx'), 'utf8');
const helper = readFileSync(resolve(root, 'src/lib/paidBaseline.ts'), 'utf8');

const checks: Array<[string, boolean]> = [
  ['both entry points use the shared paid-baseline helper', hub.includes('invokePaidBaseline') && setup.includes('invokePaidBaseline')],
  ['ClientHub uses the same action/lead_id request shape', helper.includes('body: { action, lead_id: leadId, ...extra }')],
  ['generate does not force save_context first', !hub.includes("if (!data || !(await saveContext()))") && hub.includes("act('generate'")],
  ['optional blank services do not block generation', !hub.includes("if (!data || !(await saveContext()))")],
  ['server error response is surfaced when available', helper.includes('context.clone().json()') && helper.includes('payload?.error')],
  ['server validation codes become actionable operator text', helper.includes('FRIENDLY_ERRORS') && helper.includes('Add a location, service, and business category')],
  ['approve and run actions remain the existing sequence', hub.includes("act('save'") && hub.includes("act('approve'") && hub.includes("act('run'")],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
if (failures) throw new Error(`${failures} failures`);
