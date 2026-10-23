import { conversationLeadId } from '../src/lib/inboxCache.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

/* The real-world case this guards: a phone re-contacted under a LATER (duplicate) lead row,
   whose report/audit lives on that later lead, never the first one messaged. Reproduced from a
   live phone with four `outreach_leads` rows: the oldest lead got only an unanswered opener, a
   later lead got the audit_reply (the report send). Picking the first lead_id in the thread
   strands the report panel on the lead nothing was ever sent to — "No public report yet" for a
   conversation that has one. */
const oldLeadOpener = { created_at: '2026-08-15T14:50:06.000Z', lead_id: 'old-lead-no-report' };
const oldLeadInbound = { created_at: '2026-08-15T14:50:17.000Z', lead_id: 'old-lead-no-report' };
const newLeadOpener = { created_at: '2026-08-17T11:20:02.000Z', lead_id: 'new-lead-has-report' };
const newLeadReport = { created_at: '2026-08-17T11:40:02.000Z', lead_id: 'new-lead-has-report' };

ok(
  conversationLeadId([oldLeadOpener, oldLeadInbound, newLeadOpener, newLeadReport]) === 'new-lead-has-report',
  'a phone re-contacted under a later lead resolves to that lead, not the first one messaged',
);

ok(
  conversationLeadId([{ created_at: 'x', lead_id: 'only-lead' }]) === 'only-lead',
  'a single-lead thread still resolves (the ordinary case is unaffected)',
);

ok(
  conversationLeadId([{ created_at: 'x', lead_id: null }, { created_at: 'y', lead_id: null }]) === null,
  'an unassigned thread (no message ever carried a lead_id) stays unassigned',
);

ok(
  conversationLeadId([{ created_at: 'x', lead_id: 'lead-a' }, { created_at: 'y', lead_id: null }]) === 'lead-a',
  'a trailing unassigned message does not blank out an earlier lead link',
);

if (failures) process.exit(1);
