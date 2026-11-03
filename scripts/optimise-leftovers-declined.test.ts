/* 2026-10-17 tidy-ups: (1) no leftover Optimise option in the two admin forms; (2) the "declined" close state
   (still tied into a contract) is labelled in the sales next actions like the other close states. */
import { existsSync, readFileSync } from 'node:fs';
import { WORK_TYPE_OPTIONS } from '../src/lib/salesHandoff.ts';
import { QUICK_CLOSE_STATE_LABEL } from '../src/lib/quickClose.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

console.log('── 1. Add paid client manually (Paid Clients) ──');
const pc = strip(readFileSync('src/pages/PaidClients.tsx', 'utf8'));
ok(!/optimise_existing|Optimise existing site/.test(pc), 'no "Optimise existing site" option and no optimise default');
ok(/<option value="rebuild_existing">Rebuild existing site<\/option><option value="new_site">New site<\/option>/.test(pc), 'Rebuild existing site and New site remain');
const hub = readFileSync('supabase/functions/paid-client-hub/index.ts', 'utf8');
ok(!/website_route: text\(body\.website_route\) \|\| "optimise_existing"/.test(hub) && /\["rebuild_existing", "new_site"\]\.includes\(text\(body\.website_route\)\)/.test(hub), 'the server never writes optimise_existing for a new manual client');

console.log('── 2. the handoff form is gone (Paul, 2026-11-03) ──');
ok(!existsSync('src/components/SalesHandoffForm.tsx'), 'no form left to offer Optimise');

console.log('── 3. the declined state in the sales next actions ──');
const ws = readFileSync('src/lib/salesWorkspace.ts', 'utf8');
ok(/qcs\.state === 'declined'\) act\(\{ kind: 'quick_close_declined'[^}]*title: QUICK_CLOSE_STATE_LABEL\.declined[^}]*tone: 'red'/.test(ws), 'declined → its own action, in the state\'s own words, red');
ok(QUICK_CLOSE_STATE_LABEL.declined === 'Not taken on (tied into a contract)', 'the label');
ok(/quick_close_declined: Ban/.test(readFileSync('src/components/salesDash/sections.tsx', 'utf8')), 'it has its own icon');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
