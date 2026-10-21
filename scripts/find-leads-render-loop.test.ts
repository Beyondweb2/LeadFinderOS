/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS SHOWED "SOMETHING WENT WRONG" ON EVERY SEARCH (2026-10-21, fix/find-leads-multi-town-crash).

   Cause (reproduced in a production build with fake data): useAgencyChecks returned a NEW object on every render, so
   LeadsTable's filteredLeads (which depends on it) was rebuilt every render, and the effect that reports the shown rows
   to the page stored a new array every time → render → report → render… React error #185, "Maximum update depth
   exceeded", as soon as a search returned rows (one town or many, any country).

   Pinned here (no DOM in this runner, so the two ends of the loop are pinned separately):
     1. The page keeps its OLD array when the table reports the same rows (src/lib/shownRows.ts) — the loop cannot spin.
     2. useAgencyChecks returns a memoised object, and Index reports through keepIfSame.
     3. The error screen shows a short readable reason, never a stack.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { sameRows, keepIfSame } from '../src/lib/shownRows.ts';

let failures = 0;
const check = (ok: boolean, label: string) => { if (ok) console.log('  ok   ' + label); else { failures++; console.log('  FAIL ' + label); } };
const src = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const a = [{ id: 'p1' }, { id: 'p2' }];

console.log('1. the page keeps its array when the same rows are reported again');
check(sameRows(a, [{ id: 'p1' }, { id: 'p2' }]), 'same ids in the same order are the same rows');
check(!sameRows(a, [{ id: 'p2' }, { id: 'p1' }]), 'a different order is a change');
check(!sameRows(a, [{ id: 'p1' }]), 'a different length is a change');
check(!sameRows(null, a) && sameRows(null, null), 'null only equals null');
check(keepIfSame(a, [{ id: 'p1' }, { id: 'p2' }]) === a, 'keepIfSame returns the OLD array for equal rows (state does not change, no re-render)');
const next = [{ id: 'p1' }, { id: 'p3' }];
check(keepIfSame(a, next) === next, 'keepIfSame takes the new array when the rows changed');
check(keepIfSame(null, next) === next, 'the first report is stored');

console.log('2. the two ends of the loop');
const hook = src('src/hooks/useAgencyChecks.ts');
check(hook.includes('\n  return useMemo((): AgencyChecks => ({') && !hook.includes('\n  return {\n    rowFor'),'useAgencyChecks returns a memoised object (not a fresh literal each render)');
const index = src('src/pages/Index.tsx');
check(/onShownChange=\{reportShown\}/.test(index) && /keepIfSame\(prev, rows\)/.test(index), 'Index stores shown rows through keepIfSame');
check(!/onShownChange=\{setShownReported\}/.test(index), 'Index no longer hands the raw setter to the table');

console.log('3. the error screen says why');
const app = src('src/App.tsx');
check(/static getDerivedStateFromError\(error: unknown\)/.test(app) && /data-testid="error-reason"/.test(app), 'ErrorBoundary keeps and shows a reason');
check(/split\(\/\\r\?\\n\/\)\[0\]\.slice\(0, 160\)/.test(app), 'the reason is the first line, 160 characters at most (never a stack)');

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
