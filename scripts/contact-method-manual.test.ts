/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   CONTACT METHOD BY HAND (2026-10-07, Paul: "I should be able to set the contact method on the Outreach page manually, so I can
   select Call or WhatsApp"). Before: the pill was a menu only for the admin (perms.editLeadRecord); a salesperson saw it read-only.
   Now: admin (any method) and a selling salesperson (Call or WhatsApp — the two lead_set_contact_method accepts) can set it on the
   Outreach row, the phone card and the lead workspace header. The same ONE column the pill and the queue use.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { leadPermissions } from '../src/lib/access.ts';
import { CONTACT_METHOD_OPTIONS, REP_CONTACT_METHOD_OPTIONS } from '../src/types/outreach.ts';
import { planSalesPatch } from '../src/lib/salesPatchPlan.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

console.log('\n── WHO MAY SET IT ──');
ok(leadPermissions('admin').setContactMethod === true, 'admin: yes');
ok(leadPermissions('sales', true).setContactMethod === true, 'a selling salesperson: yes');
ok(leadPermissions('sales', false).setContactMethod === false && leadPermissions(null).setContactMethod === false, 'a restricted salesperson, or nobody signed in: no (the server refuses the same)');
ok(REP_CONTACT_METHOD_OPTIONS.map((o) => o.value).join() === 'call,whatsapp' && CONTACT_METHOD_OPTIONS.length > 2, 'a salesperson is offered exactly Call and WhatsApp; the admin keeps the full list');
let planned = '';
try { planned = JSON.stringify(planSalesPatch({ contact_method: 'call' })); } catch { planned = 'threw'; }
ok(/lead_set_contact_method/.test(planned) && !/threw/.test(planned), 'a salesperson\'s Call write goes through lead_set_contact_method (the one server function), never a direct row write');

console.log('\n── WHERE IT IS OFFERED ──');
const page = read('src/pages/Outreach.tsx');
ok(/onContactMethodChange=\{perms\.setContactMethod \? handleContactMethodChange : undefined\}/.test(page), 'the Outreach page hands the control to everyone who may set it (it was admin only)');
const table = read('src/components/OutreachTable.tsx');
ok(/\(perms\.editLeadRecord \? CONTACT_METHOD_OPTIONS : REP_CONTACT_METHOD_OPTIONS\)\.map/.test(table), 'the Outreach row\'s menu offers a salesperson only Call / WhatsApp');
const card = read('src/components/OutreachMobileCard.tsx');
ok(/\(perms\.editLeadRecord \? CONTACT_METHOD_OPTIONS : REP_CONTACT_METHOD_OPTIONS\)\.map/.test(card), 'the phone card likewise');
const dlg = read('src/components/LeadDetailDialog.tsx');
ok(/perms\.setContactMethod && \(\s*<Select value=\{lead\.contact_method/.test(dlg) && /aria-label="Preferred channel"/.test(dlg) && /\(perms\.editLeadRecord \? CONTACT_METHOD_OPTIONS : REP_CONTACT_METHOD_OPTIONS\)/.test(dlg) && !/<ContactMethodBadge/.test(dlg), 'the lead window\'s Details tab has the Preferred channel menu for anyone who may set it (still no pill beside the status)');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
