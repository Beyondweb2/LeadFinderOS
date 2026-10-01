/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE TWO REMAINING STATUS INCONSISTENCIES (2026-10-02, docs/outreach-workspace.md §H).
   1. A no turned yes is REVIVED (lead_revive) to a real workflow status, never the pre-star 'interested',
      so a later reply moves it to Replied and an Inbox reply reads "You replied".
   2. The Inbox status filters use the Outreach match (shownStatusMatches): the status the pill SHOWS.
   Live SQL half: supabase/tests/lead-revive.sql (rolled back, 18 checks).
   Run: node scripts/run-tests.mjs revive-and-inbox-filter
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { outcomePlan, salesStateOf, type LeadStateInput } from '../src/lib/leadState.ts';
import { shownStatusMatches } from '../src/lib/statusFilter.ts';
import { INBOUND_NO_DOWNGRADE } from '../src/lib/strongStatuses.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-10-02T10:00:00Z');
const S = '2026-09-28T10:00:00Z';

console.log('── 1. a no turned yes is revived, never written back as "interested" ──');
for (const s of ['not_interested', 'closed']) for (const o of ['interested', 'meeting_booked']) {
  const p = outcomePlan(o, { status: s });
  ok(p.revive && p.status === null && p.star, `${s} + ${o} → revive + the star (no status written by the client)`);
}
ok(!outcomePlan('interested', { status: 'opted_out' }).revive, 'an opt-out (a WhatsApp STOP) is never revived');
const ALL_STATUSES = ['', 'not_contacted', 'queued', 'initial_contact', 'replied', 'awaiting_reply', 'report_sent', 'price_given', 'no_whatsapp', 'whatsapp_failed', 'not_interested', 'closed', 'opted_out', 'won_pending_onboarding', 'payment_received'];
const OUTCOMES = ['no_answer', 'left_voicemail', 'message_sent', 'connection_sent', 'spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'wrong_number', 'agency_controls_site'];
let wrote = 0;
for (const s of ALL_STATUSES) for (const o of OUTCOMES) if ((outcomePlan(o, { status: s }).status as string | null) === 'interested') wrote++;
ok(wrote === 0, `no outcome on any status writes "interested" (${OUTCOMES.length} outcomes × ${ALL_STATUSES.length} statuses)`);

const outcome = read('src/lib/leadOutcome.ts');
ok(outcome.includes("await leadRpc('lead_revive', { _lead_id: lead.id })") && !/_status: 'interested'/.test(outcome), 'applyOutcome revives through lead_revive and never sets stage "interested"');
const srcHits = ['src/lib/leadOutcome.ts', 'src/lib/leadRpc.ts', 'src/lib/salesPatchPlan.ts', 'src/hooks/useOutreach.ts', 'src/lib/leadQuickActions.ts'].filter((p) => /_status: 'interested'/.test(read(p)));
ok(srcHits.length === 0, 'no client write sends lead_set_stage("interested")');

const mig = read('supabase/migrations/20261002120000_lead_revive.sql');
const revive = mig.slice(mig.indexOf('create or replace function public.lead_revive'));
const targets = [...revive.matchAll(/then '([a-z_]+)'|else '([a-z_]+)'/g)].map((m) => m[1] ?? m[2]);
ok(JSON.stringify([...new Set(targets)].sort()) === JSON.stringify(['awaiting_reply', 'initial_contact', 'not_contacted', 'replied']), `lead_revive writes only workflow statuses (${[...new Set(targets)].join(', ')})`);
ok(!/set status = 'interested'/.test(revive) && !/is_potential_work/.test(revive.replace(/--.*$/gm, '')), '…never "interested", and never touches the star');
ok(targets.every((t) => t === 'replied' || !INBOUND_NO_DOWNGRADE.includes(t)), 'a later inbound reply can move every revived status to Replied (none is protected from the flip)');
ok(INBOUND_NO_DOWNGRADE.includes('interested'), '…the old written status WAS protected — the bug');
const swm = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/\.update\(\{ status: "awaiting_reply"[\s\S]{0,200}\.eq\("status", "replied"\)/.test(swm), 'an Inbox reply moves replied → awaiting_reply ("You replied")');
ok((mig.match(/delete from public\.contact_suppressions/g) ?? []).length === 1 && /perform public\._lift_not_interested_block\(new\.id, new\.phone, new\.email\)/.test(mig) && /v_lifted := public\._lift_not_interested_block\(l\.id, l\.phone, l\.email\)/.test(mig), 'ONE block-lift rule, used by the existing trigger and by lead_revive');
ok(/where s\.reason = 'not_interested' and s\.wrong_number_at is null/.test(mig), '…it lifts only the Not interested block, never a wrong number');
ok(/if l\.status = 'not_interested' then/.test(revive), '…and only when leaving not_interested (Closed keeps its old rule)');
ok(/grant execute on function public\.lead_revive\(uuid\) to authenticated/.test(mig) && /perform public\._require_work\(_lead_id\)/.test(revive), 'both roles, ownership-checked (_require_work)');

console.log('\n── 2. the Inbox status filter = the Outreach match (what the pill shows) ──');
const view = (l: LeadStateInput) => salesStateOf(l, NOW);
const m = (f: string, l: LeadStateInput) => shownStatusMatches(f, l, view(l));
const phone = { status: 'not_contacted', lastLogged: { outcome: 'spoke_to_owner', at: S } };
ok(m('initial_contact', phone) && !m('not_contacted', phone), 'reached by phone (pipeline New) → under Contacted, not New');
const noAnswer = { status: 'not_contacted', lastLogged: { outcome: 'no_answer', at: S } };
ok(m('not_contacted', noAnswer) && !m('initial_contact', noAnswer), 'no answer only → under New');
ok(m('replied', { status: 'replied', whatsapp_sent_at: S }) && !m('awaiting_reply', { status: 'replied', whatsapp_sent_at: S }), 'Replied → only under Replied');
ok(m('awaiting_reply', { status: 'awaiting_reply', whatsapp_sent_at: S }) && !m('replied', { status: 'awaiting_reply', whatsapp_sent_at: S }), 'You replied → only under You replied');
ok(m('initial_contact', { status: 'no_whatsapp', lastLogged: { outcome: 'spoke_to_owner', at: S } }), 'No WhatsApp, reached by phone → under Contacted');
ok(m('no_whatsapp', { status: 'no_whatsapp_needs_sms' }), 'No WhatsApp covers the landline too (the pill reads No WhatsApp for both)');
ok(m('interested', { status: 'not_contacted', is_potential_work: true }) && m('interested', { status: 'replied', is_potential_work: true }), 'Interested = the star, whatever the status');
ok(!m('interested', { status: 'price_given', is_potential_work: false }) && !m('interested', { status: 'interested', is_potential_work: false }), '…no star → not Interested (Price given, the old stored status)');
ok(shownStatusMatches('replied', { status: 'replied' }, null), 'a row with no lead to read (unassigned) falls back to its stored status');

const inbox = read('src/pages/Inbox.tsx');
ok(inbox.includes('byCampaign.filter((c) => shownStatusMatches(statusFilter, { status: c.leadStatus, is_potential_work: c.isPotentialWork }, listStageOf(c.leadId)) || c.unassigned || c.isPaid)'), 'the Inbox filter uses the shared match over the row pill\'s stage');
ok(!inbox.includes('c.leadStatus === statusFilter'), '…not the stored status');
ok(inbox.includes('const allLogged = useAllLoggedContacts();') && !inbox.includes('useLastLoggedContacts(listLeadIds)'), '…with every logged contact (not only the shown rows — the filter decides which rows are shown)');
ok(inbox.indexOf('const listStageOf = useCallback(') < inbox.indexOf('const list = useMemo(() => {'), '…read before the list is filtered');
ok(/<PipelineStatusSelect value=\{c\.leadStatus\} stage=\{listStageOf\(c\.leadId\)\}/.test(inbox), 'the list pill reads the same stage as the filter');
const table = read('src/components/OutreachTable.tsx');
ok(table.includes('result = result.filter((lead) => shownStatusMatches(statusFilter, lead, rowSalesState(lead)));'), 'Outreach uses the same match (one rule, two pages)');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
