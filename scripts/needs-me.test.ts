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
  ok(s0.action && s0.dueIso === new Date(NOW - H + 2 * H).toISOString() && s0.escalation === 0 && s0.template === 'questionnaire_followup', 'fresh: payment-step nudge, due 2 h after it landed');
  ok(questionnaireStep(q({ ...ready, created_at: ago(30) }), NOW)!.escalation === 1, 'nothing sent, 30 h quiet → escalated (24 h)');
  ok(questionnaireStep(q({ ...ready, created_at: ago(50) }), NOW)!.escalation === 2, 'nothing sent, 50 h quiet → escalated (48 h)');
  const n24 = questionnaireStep(q({ ...ready, created_at: ago(60), last_out_at: ago(30), last_out_template: 'questionnaire_followup' }), NOW)!;
  ok(n24.template === 'nudge_24h' && n24.escalation === 1, 'our nudge 30 h ago, no answer → the 24-hour nudge');
  const n48 = questionnaireStep(q({ ...ready, created_at: ago(90), last_out_at: ago(50), last_out_template: 'nudge_24h' }), NOW)!;
  ok(n48.template === 'final_nudge' && n48.escalation === 2, 'no answer 50 h after the 24-hour nudge → the final nudge');
  const done = questionnaireStep(q({ ...ready, created_at: ago(150), last_out_at: ago(50), last_out_template: 'final_nudge' }), NOW)!;
  ok(done.action === 'Record the outcome' && done.template === null && done.escalation === 3, 'final nudge 50 h ago → record the outcome');
  const wait = questionnaireStep(q({ ...ready, created_at: ago(10), last_out_at: ago(2), last_out_template: 'questionnaire_followup' }), NOW)!;
  ok(wait.template === null && wait.action === 'Wait for their answer' && !!wait.dueIso, 'we wrote 2 h ago → waiting, still with a due time');
  const replied = questionnaireStep(q({ ...ready, created_at: ago(10), last_out_at: ago(5), last_in_at: ago(1) }), NOW)!;
  ok(replied.template === 'questionnaire_followup' && replied.escalation === 0, 'they replied after us → back to the stop\'s own action');
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
  ok(rows.some((r) => r.kind === 'payment' && r.template === 'payment_help'), 'a failed payment → payment row with payment help');
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
  ok(templateGate('questionnaire_followup', { approvals: [], prospectOnly: false, hasPhone: true }).ok, 'the registered payment-step nudge can send');
  ok(!templateGate('questionnaire_followup', { approvals: [], prospectOnly: false, hasPhone: true, alreadySent: true }).ok, 'one per lead: already sent → disabled');
  const g1 = templateGate('domain_help', { approvals: [], prospectOnly: false, hasPhone: true });
  ok(!g1.ok && /Meta approval/.test((g1 as { reason: string }).reason), 'a new template → disabled, waiting for Meta approval');
  const g2 = templateGate('domain_help', { approvals: ['domain_help'], prospectOnly: false, hasPhone: true });
  ok(!g2.ok && /added to the sender/.test((g2 as { reason: string }).reason), 'marked approved but not in the sender → still disabled');
  ok(!templateGate('questionnaire_followup', { approvals: [], prospectOnly: true, hasPhone: true }).ok, 'Australia (prospect-only) → no payment messages');
  ok(!templateGate('questionnaire_followup', { approvals: [], prospectOnly: false, hasPhone: false }).ok, 'no phone → disabled');
  ok(Object.values(NEEDS_TEMPLATES).filter((t) => t.inSender).map((t) => t.key).join() === 'questionnaire_followup', 'only the registered template is marked as in the sender');
  for (const t of Object.values(NEEDS_TEMPLATES)) {
    ok((t.body.match(/\?/g) ?? []).length <= 1 && !/£|chatgpt|gemini|guarantee|money back/i.test(t.body), `${t.key}: one question at most, no price, no AI brand, no guarantee wording`);
  }
  const card = readFileSync('src/components/admin/NeedsMeList.tsx', 'utf8');
  ok(card.includes('sendWhatsAppRequest(') && !/functions\.invoke\(\s*['"]send-whatsapp-message/.test(card), 'the row sends through sendWhatsAppRequest (the one browser send), never its own call');
  ok(/templateGate\(/.test(card), 'the row asks templateGate before enabling the button');
}

console.log('6. labels');
ok(sinceLabel(ago(26), NOW) === '26h' && sinceLabel(ago(72), NOW) === '3d' && sinceLabel(ago(0.5), NOW) === '30 min', 'time since reads 26h / 3d / 30 min');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
