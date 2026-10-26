/* The admin home's "What needs you" list (Concept A, 2026-10-26): src/lib/needsMe.ts, questionnaireStop.ts,
   needsMeTemplates.ts. Pure; fake "ZZ" businesses; nothing is sent. Run: npx tsx scripts/needs-me.test.ts */
import { readFileSync } from 'node:fs';
import { buildNeedsRows, splitByMarks, hiddenByMark, sinceLabel, type NeedsFacts, type QuestionnaireRowFact } from '../src/lib/needsMe.ts';
import { questionnaireStop, questionnaireStep, questionnaireRowKey } from '../src/lib/questionnaireStop.ts';
import { templateGate, NEEDS_TEMPLATES } from '../src/lib/needsMeTemplates.ts';
import type { AttentionItem } from '../src/lib/adminMetrics.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const H = 3_600_000;
const NOW = Date.parse('2026-10-26T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * H).toISOString();

const ready = { plan_tier: 'new_site', domain_status: 'existing', domain_owned: 'yes', domain_third_party: 'no', domain_access: 'yes', business_website: 'x.co.uk', site_rights: 'yes', authority_confirmed: true, dns_permission: true, materials_confirmed: true, website_manager: 'direct_access', incomplete: false };
const q = (o: Partial<QuestionnaireRowFact>): QuestionnaireRowFact => ({ id: 'q1', lead_id: 'L1', business_name: 'ZZ Demo Driving A', created_at: ago(3), lead_phone: '447700900001', lead_country: 'UK', ...o });
const facts = (o: Partial<NeedsFacts> = {}): NeedsFacts => ({ questionnaires: [], interested: [], followups: [], marks: [], approvals: [], today: '2026-10-26', ...o });

console.log('1. where a questionnaire stopped');
{
  ok(questionnaireStop(q({ plan_tier: 'new_site', domain_status: null })) === 'domain', 'new site, domain blank → domain');
  ok(questionnaireStop(q({ ...ready, website_manager: 'web_company', agency_contract: 'not_sure' })) === 'agency', 'web company + "not sure" → agency');
  ok(questionnaireStop(q({ ...ready, website_manager: 'web_company', agency_contract: 'in_contract' })) === 'tied_in', 'tied in → decline (agreement 1.6)');
  ok(questionnaireStop(q({ ...ready, dns_permission: false })) === 'rights', 'a permission unticked → rights');
  ok(questionnaireStop(q({ ...ready })) === 'agreement', 'everything answered → agreement not signed');
  ok(questionnaireStop(q({ ...ready, agreement_signed_at: ago(1) })) === 'payment', 'agreement signed → payment');
  ok(questionnaireStop(q({ plan_tier: 'keep', domain_status: 'existing', incomplete: true })) === 'questions', 'keep route, not finished → questions');
}

console.log('2. every submission has a next action and a due time; 24 h and 48 h escalate');
{
  const s0 = questionnaireStep(q({ ...ready, created_at: ago(1) }), NOW)!;
  ok(s0.action && s0.dueIso === new Date(NOW - H + 2 * H).toISOString() && s0.escalation === 0 && s0.template === 'agreement_next_steps', 'fresh, everything answered: agreement & next steps, due 2 h after it landed');
  ok(questionnaireStep(q({ ...ready, created_at: ago(30) }), NOW)!.escalation === 1, 'nothing sent, 30 h quiet → escalated (24 h)');
  ok(questionnaireStep(q({ ...ready, created_at: ago(50) }), NOW)!.escalation === 2, 'nothing sent, 50 h quiet → escalated (48 h)');
  const n24 = questionnaireStep(q({ ...ready, created_at: ago(60), last_out_at: ago(30), last_out_template: 'questionnaire_followup' }), NOW)!;
  ok(n24.template === 'nudge_24h' && n24.escalation === 1, 'our nudge 30 h ago, no answer → the 24-hour nudge');
  const call = questionnaireStep(q({ ...ready, created_at: ago(90), last_out_at: ago(30), last_out_template: 'nudge_24h' }), NOW)!;
  ok(call.action === 'Call them' && call.template === null && call.escalation === 2, 'no answer 30 h after the 24-hour nudge → call them (there is no final-nudge template)');
  const done = questionnaireStep(q({ ...ready, created_at: ago(150), last_out_at: ago(50), last_out_template: 'nudge_24h' }), NOW)!;
  ok(done.action === 'Record the outcome' && done.template === null && done.escalation === 3, 'no answer 50 h after the nudge → record the outcome');
  const domain = questionnaireStep(q({ plan_tier: 'new_site', domain_status: null, created_at: ago(1) }), NOW)!;
  ok(domain.template === 'questionnaire_domain_help', 'domain blank → domain help');
  ok(questionnaireStep(q({ ...ready, agreement_signed_at: ago(2), created_at: ago(3) }), NOW)!.template === 'questionnaire_payment_help', 'signed, not paid → payment help');
  const wait = questionnaireStep(q({ ...ready, created_at: ago(10), last_out_at: ago(2), last_out_template: 'questionnaire_followup' }), NOW)!;
  ok(wait.template === null && wait.action === 'Wait for their answer' && !!wait.dueIso, 'we wrote 2 h ago → waiting, still with a due time');
  const replied = questionnaireStep(q({ ...ready, created_at: ago(10), last_out_at: ago(5), last_in_at: ago(1) }), NOW)!;
  ok(replied.template === 'agreement_next_steps' && replied.escalation === 0, 'they replied after us → back to the stop\'s own action');
  ok(questionnaireStep(q({ ...ready, lead_amount_paid: 99 }), NOW) === null, 'paid → closed (no row)');
  ok(questionnaireStep(q({ ...ready, outcome: 'lost', lost_reason: 'price' }), NOW) === null, 'lost with a reason → closed (no row)');
}

console.log('3. the list: one row per business, most urgent first, no replies');
{
  const attention: AttentionItem[] = [
    { key: 'pay1', group: 'urgent', kind: 'payment_failed', leadId: 'L2', business: 'ZZ Demo Plumbing B', why: 'Monthly payment failed', owner: null, sinceIso: ago(48), state: 'Paid', action: 'Chase the payment', open: 'client' },
    { key: 'tri1', group: 'urgent', kind: 'whatsapp', leadId: 'L9', business: 'ZZ Reply Lead', why: 'Asked the price', owner: null, sinceIso: ago(1), state: 'Replied', action: 'Reply', open: 'inbox', triageId: 't1' },
    { key: 'su1', group: 'today', kind: 'signup_unpaid', leadId: 'L1', business: 'ZZ Demo Driving A', why: 'Signed up, unpaid', owner: null, sinceIso: ago(3), state: '', action: '', open: 'signups' },
  ];
  const rows = buildNeedsRows({
    facts: facts({
      questionnaires: [q({ ...ready, created_at: ago(30) })],
      interested: [{ lead_id: 'L3', business_name: 'ZZ Demo Electrical E', phone: '447700900003', country: 'UK', contact_name: 'Sam Smith', last_in_at: ago(5), last_out_at: ago(20) },
                   { lead_id: 'L1', business_name: 'ZZ Demo Driving A', phone: null, country: 'UK', contact_name: null, last_in_at: ago(2), last_out_at: null }],
      followups: [{ lead_id: 'L4', business_name: 'ZZ Demo Driving G', phone: null, country: 'UK', contact_name: null, next_action: 'call', next_action_date: '2026-10-25', next_action_time: null, next_action_note: null, starred: false },
                  { lead_id: 'L5', business_name: 'ZZ Later', phone: null, country: 'UK', contact_name: null, next_action: 'call', next_action_date: '2026-10-30', next_action_time: null, next_action_note: null, starred: false }],
    }), attention, clients: [], nowMs: NOW,
  });
  ok(!rows.some((r) => /Reply Lead/.test(r.business)), 'a reply (triage) item never shows');
  ok(rows.filter((r) => r.leadId === 'L1').length === 1 && rows.find((r) => r.leadId === 'L1')!.kind === 'questionnaire', 'one row per business: the escalated questionnaire wins over the star and the sign-up line');
  ok(rows.some((r) => r.kind === 'payment' && r.template === null), 'a failed payment → payment row, no template (payment_failed is not wired, Paul 2026-10-26)');
  ok(rows.some((r) => r.kind === 'interested' && r.star && r.firstName === 'Sam'), 'interested shows as a star, with the first name');
  ok(rows.some((r) => r.kind === 'follow_up' && r.flag === 'Overdue') && !rows.some((r) => r.business === 'ZZ Later'), 'follow-ups: overdue shows, a future one does not');
  const order = rows.map((r) => r.group);
  ok(order.join() === [...order].sort((a, b) => ['urgent', 'today', 'waiting'].indexOf(a) - ['urgent', 'today', 'waiting'].indexOf(b)).join(), 'urgent first, then today, then waiting');
  ok(rows.every((r) => r.action && r.sinceIso !== undefined), 'every row has one next action and a time since');
}

console.log('4. snooze, dismiss, archive');
{
  const row = { key: questionnaireRowKey('q1'), sinceIso: ago(30) };
  ok(hiddenByMark(row, [{ id: 'm', item_key: row.key, action: 'archive', until: null, created_at: ago(1) }], NOW), 'archived → hidden');
  ok(hiddenByMark(row, [{ id: 'm', item_key: row.key, action: 'snooze', until: new Date(NOW + H).toISOString(), created_at: ago(1) }], NOW), 'snoozed → hidden until then');
  ok(!hiddenByMark(row, [{ id: 'm', item_key: row.key, action: 'snooze', until: ago(1), created_at: ago(5) }], NOW), 'snooze over → back');
  ok(hiddenByMark(row, [{ id: 'm', item_key: row.key, action: 'dismiss', until: null, created_at: ago(1) }], NOW), 'dismissed → hidden');
  ok(!hiddenByMark({ ...row, sinceIso: ago(0.5) }, [{ id: 'm', item_key: row.key, action: 'dismiss', until: null, created_at: ago(1) }], NOW), 'dismissed, then something new happened → back');
  const split = splitByMarks([{ key: 'a', sinceIso: null } as never, { key: 'b', sinceIso: null } as never], [{ id: 'm', item_key: 'a', action: 'archive', until: null, created_at: ago(1) }], NOW);
  ok(split.visible.length === 1 && split.hidden.length === 1, 'archived rows are kept for undo, not dropped');
}

console.log('5. send buttons go through the normal sender, new templates stay disabled');
{
  /* 2026-10-26: the six Meta templates are wired; on / off is Meta's own answer (dashboard-templates.test.ts has the rule). */
  const live = { prospectOnly: false, hasPhone: true, nowMs: Date.parse('2026-11-05T12:00:00Z') };
  ok(templateGate('questionnaire_domain_help', live).ok, 'a wired template with no refusal from Meta can send');
  const refused = templateGate('questionnaire_domain_help', { ...live, lastSend: { status: 'failed', error_code: '132001', created_at: '2026-11-05T11:00:00Z' } });
  ok(!refused.ok && /Meta refused it/.test(refused.reason ?? ''), 'Meta refused it an hour ago as a template problem → disabled with Meta\'s reason');
  ok(!templateGate('final_nudge', live).ok && !templateGate('interested_follow_up', live).ok, 'the two Paul did not wire stay disabled');
  ok(!templateGate('needs_from_you', { ...live, neededItem: '' }).ok && templateGate('needs_from_you', { ...live, neededItem: 'logo, photos' }).ok, 'needs_from_you needs an item to ask for');
  ok(!templateGate('questionnaire_payment_help', { ...live, prospectOnly: true }).ok, 'Australia (prospect-only) → no payment messages');
  ok(!templateGate('questionnaire_domain_help', { ...live, hasPhone: false }).ok, 'no phone → disabled');
  ok(Object.values(NEEDS_TEMPLATES).filter((t) => t.wired).map((t) => t.key).sort().join() === 'agency_access,agreement_next_steps,needs_from_you,nudge_24h,questionnaire_domain_help,questionnaire_payment_help', 'exactly the six are wired');
  const card = readFileSync('src/components/admin/NeedsMeList.tsx', 'utf8');
  ok(card.includes('sendWhatsAppRequest(') && !/functions\.invoke\(\s*['"]send-whatsapp-message/.test(card), 'the row sends through sendWhatsAppRequest (the one browser send), never its own call');
  ok(/templateGate\(/.test(card), 'the row asks templateGate before enabling the button');
}

console.log('5b. clicking a lead row opens their Inbox conversation (Paul, 2026-10-26)');
{
  const dash = readFileSync('src/pages/Dashboard.tsx', 'utf8');
  const open = dash.slice(dash.indexOf('const openRow'), dash.indexOf('if (roleLoading)'));
  ok(/navigate\(whatsAppLinkForLead\(r\.leadId\)\)/.test(open) && !/outreachLeadLink/.test(dash), 'a lead row and the questionnaire log open the Inbox conversation, never the Outreach page');
}

console.log('6. labels');
ok(sinceLabel(ago(26), NOW) === '26h' && sinceLabel(ago(72), NOW) === '3d' && sinceLabel(ago(0.5), NOW) === '30 min', 'time since reads 26h / 3d / 30 min');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
