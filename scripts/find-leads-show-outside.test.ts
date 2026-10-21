/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS: "SHOW" ON THE "N OUTSIDE THE SEARCHED TOWNS" LINE (2026-10-21, fix/find-leads-show-all-select).

   Bug: after Show, Select this page / Select all / Add all shown / Find emails / Add all with emails still used only
   the in-town leads (14 of 53). Rule now: HIDDEN (default) → only in-town leads count; SHOWN → every visible lead counts,
   and an out-of-town lead is saved with no Coverage town (its own address decides the audit's place).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { heldOutOfTown, outsideSearchedTown } from '../src/lib/inTown.ts';
import { coverageTownFor, type BulkAddLead } from '../src/lib/findLeadsBulkAdd.ts';

let failures = 0;
const check = (ok: boolean, label: string) => { if (ok) console.log('  ok   ' + label); else { failures++; console.log('  FAIL ' + label); } };
const src = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const inTown = { townCheck: { inTown: true as boolean | null } };
const out = { townCheck: { inTown: false as boolean | null } };
const flagOnly = { outsideTown: true };
const unjudged = { townCheck: { inTown: null as boolean | null } };

console.log('1. hidden (default): only in-town leads count');
check(!heldOutOfTown(inTown, false), 'in-town lead is usable');
check(heldOutOfTown(out, false), 'out-of-town lead is held');
check(heldOutOfTown(flagOnly, false), 'unjudged lead outside Google\'s boundary is held');
check(!heldOutOfTown(unjudged, false), 'unjudged lead inside the boundary is usable');

console.log('2. shown: every visible lead counts');
check(!heldOutOfTown(out, true) && !heldOutOfTown(flagOnly, true) && !heldOutOfTown(inTown, true), 'nothing is held once Show is pressed');
const leads = [...Array(14).fill(inTown), ...Array(39).fill(out)];
check(leads.filter((l) => !heldOutOfTown(l, false)).length === 14, 'hidden: 14 of 53');
check(leads.filter((l) => !heldOutOfTown(l, true)).length === 53, 'shown: 53 of 53');
check(leads.filter(outsideSearchedTown).length === 39, 'the grey line still counts 39');

console.log('3. an out-of-town lead is saved with its own town, never the Coverage town');
check(coverageTownFor(out as BulkAddLead, 'Rugby', 'United Kingdom') === null, 'out-of-town → coverage_town null');
check(coverageTownFor(inTown as BulkAddLead, 'Rugby', 'United Kingdom') === 'Rugby', 'in-town → coverage_town is the searched town');

console.log('4. wiring');
const table = src('src/components/LeadsTable.tsx');
const index = src('src/pages/Index.tsx');
check(!/!outsideSearchedTown\(l\)\)\s*\)/.test(table.split('onShownChange?.(')[1]?.split('\n')[0] ?? ''), 'the table reports every shown row (outside ones included once shown)');
check(/!heldOutOfTown\(l, showOutside\)/.test(table), 'selection pool uses heldOutOfTown');
check(!/disabled=\{[^}]*outsideSearchedTown\(lead\)/.test(table), 'no row button is disabled by the raw outside test');
check(/shownIdsRef\.current\.has\(l\.id\)/.test(index), 'the add door lets a shown out-of-town row through');
check(/outsideSearchedTown\(l\) \|\|/.test(index), 'the add door still refuses a hidden out-of-town row');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
