/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EVERY DASHBOARD ITEM OPENS WHERE ITS ACTION IS DONE (2026-09-30, docs/sales-workflow-nav.md).
   Run: npx tsx scripts/dashboard-links.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { attentionPath, clientHubLink, nextActionLink, outreachLeadLink, leadTarget } from '../src/lib/salesLinks.ts';
import { WHATSAPP_NEXT_ACTIONS, NEXT_ACTION_LABEL } from '../src/lib/nextActionView.ts';
import { stripeDashboardUrl, foldAdminOverview, type AdminInput, type AdminLead } from '../src/lib/adminMetrics.ts';
import { blockerSection } from '../src/lib/clientHealth.ts';
import { isLiveLeadWithoutTrade } from '../src/lib/leadTrade.ts';
import { resolvePeriod } from '../src/lib/reportingPeriod.ts';
import { NO_EXCLUSIONS } from '../src/lib/metricExclusions.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── the destinations ──');
{
  ok(outreachLeadLink('L1') === '/outreach?lead=L1', 'a lead\'s workspace is a URL (/outreach?lead=), so refresh and Back work');
  ok(leadTarget('whatsapp', 'L1')[0] === '/inbox?lead=L1' && leadTarget('lead', 'L1')[0] === '/outreach?lead=L1' && leadTarget('lead', 'L1')[1] === undefined, 'no router state left in the shared targets');
  ok(clientHubLink('C1', 'baseline') === '/paid-clients/C1?section=baseline' && clientHubLink('C1') === '/paid-clients/C1', 'a client task opens the hub at its stage');
  ok(attentionPath({ open: 'inbox', leadId: 'L1' }) === '/inbox?lead=L1', 'a WhatsApp item opens that conversation');
  ok(attentionPath({ open: 'outreach', leadId: null, show: 'no_trade' }) === '/outreach?show=no_trade', 'a list problem opens Outreach showing that list');
}

console.log('\n── every attention kind, from the real fold ──');
{
  const NOW = Date.parse('2026-09-30T12:00:00Z');
  const p = (k: string) => resolvePeriod(k, NOW);
  let n = 0;
  const lead = (o: Partial<AdminLead>): AdminLead => ({ id: `L${++n}`, business_name: `Biz ${n}`, created_at: '2026-08-01T10:00:00Z', added_by_user_id: 'P', assigned_to_user_id: null, sold_by_user_id: 'P', sold_at: null, status: 'new', amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: null, next_action: null, next_action_date: null, is_archived: false, phone: `0770090${String(n).padStart(4, '0')}`, email: null, search_keyword: 'plumber', category: null, payment_date: null, refunded_at: null, service_terminated_at: null, subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o });
  const unstarted = lead({ status: 'payment_received', amount_paid: 99, sold_at: '2026-09-20T10:00:00Z' });
  const overdue = lead({ status: 'payment_received', amount_paid: 99, baseline_audit_id: 'B', remeasure_due_date: '2026-09-20' });
  const pastDue = lead({ status: 'payment_received', amount_paid: 99, baseline_audit_id: 'B2', subscription_status: 'past_due', stripe_subscription_id: 'sub_ABC123' });
  const quoted = lead({ status: 'price_given' });
  const signup = lead({ status: 'interested' });
  const noTrade = lead({ status: 'contacted', search_keyword: null });
  const input: AdminInput = {
    period: p('30d'), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW, bookOwnerId: 'P',
    people: [{ userId: 'P', name: 'Paul', role: 'admin', excluded: false }], exclusions: NO_EXCLUSIONS,
    leads: [unstarted, overdue, pastDue, quoted, signup, noTrade],
    messages: [{ lead_id: quoted.id, direction: 'outbound', status: 'delivered', created_at: '2026-09-10T10:00:00Z', body: 'price', sent_by_user_id: 'P', template_name: null, test_mode: false }],
    activity: [], suppressions: [], onboarding: [{ lead_id: signup.id, status: 'submitted', created_at: '2026-09-25T10:00:00Z', plan_tier: 'keep', website_addon: null }],
    ledger: [{ id: 'd1', lead_id: pastDue.id, kind: 'chargeback', status: 'needs_response', amount_gbp: 99, occurred_at: '2026-09-29T10:00:00Z', sold_by_user_id: 'P', stripe_object_id: 'du_XYZ9' }],
    commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] },
  } as AdminInput;
  const o = foldAdminOverview(input);
  const item = (kind: string) => o.attention.find((a) => a.kind === kind);
  ok(attentionPath(item('quote_quiet')!) === `/inbox?lead=${quoted.id}`, 'Quote gone quiet → the Inbox conversation (it was the lead popup)');
  ok(attentionPath(item('signup_unpaid')!) === `/inbox?lead=${signup.id}`, 'Signed up, not paid → the Inbox conversation (it was the lead popup)');
  ok(attentionPath(item('setup_not_started')!) === `/paid-clients/${unstarted.id}?section=baseline`, 'Setup not started → the hub at the baseline stage');
  ok(attentionPath(item('remeasure_overdue')!) === `/paid-clients/${overdue.id}?section=remeasure`, 'Re-measure overdue → the hub at the re-measure stage');
  ok(attentionPath(item('payment_failed')!) === `/paid-clients/${pastDue.id}?section=payment` && item('payment_failed')!.external?.url === 'https://dashboard.stripe.com/subscriptions/sub_ABC123', 'Payment failed → the hub\'s payment card, plus the subscription in Stripe');
  ok(item('payment_dispute')!.external?.url === 'https://dashboard.stripe.com/disputes/du_XYZ9', 'A dispute links to the dispute in Stripe');
  ok(attentionPath(item('no_trade')!) === '/outreach?show=no_trade' && item('no_trade')!.business === '1 lead', 'No trade → Outreach showing exactly those leads');
  ok(isLiveLeadWithoutTrade(noTrade) && !isLiveLeadWithoutTrade(quoted) && !isLiveLeadWithoutTrade({ ...noTrade, status: 'not_interested' }), 'the list and the count share one rule');
  ok(o.attention.every((a) => a.open !== 'lead' || !!a.leadId), 'no item points at a lead it does not name');
}

console.log('\n── Stripe links are only ever built from a recognised id ──');
{
  ok(stripeDashboardUrl('pi_123') === 'https://dashboard.stripe.com/payments/pi_123', 'payment intent → payments');
  ok(stripeDashboardUrl(null, 'cus_9') === 'https://dashboard.stripe.com/customers/cus_9', 'falls through to the next id');
  ok(stripeDashboardUrl('not an id', '', undefined) === null && stripeDashboardUrl('sk_live_x') === null, 'anything unrecognised (or a key-shaped string) gives no link');
}

console.log('\n── follow-ups open where they are done ──');
{
  ok(nextActionLink('send_follow_up') === 'whatsapp' && nextActionLink('2nd_follow_up') === 'whatsapp', 'a WhatsApp follow-up → the Inbox');
  ok(nextActionLink('call') === 'lead' && nextActionLink('meeting') === 'lead' && nextActionLink('email') === 'lead' && nextActionLink('send_info') === 'lead', 'a call, meeting, email or send-info → the lead\'s workspace (the call script and number are there)');
  ok(nextActionLink(null) === 'lead' && nextActionLink('something_new') === 'lead', 'unknown → the workspace, never a guessed thread');
  ok([...WHATSAPP_NEXT_ACTIONS].every((a) => a in NEXT_ACTION_LABEL), 'every WhatsApp action is a stored, labelled value');
  const ws = read('src/lib/salesWorkspace.ts');
  ok(/const WHATSAPP_ACTIONS = WHATSAPP_NEXT_ACTIONS;/.test(ws) && !/new Set\(\['send_follow_up'/.test(ws), 'the Sales workspace reads the one list, not its own copy');
  ok(/link: WHATSAPP_ACTIONS\.has\(na\) \? 'whatsapp' : 'lead' \};/.test(ws) && /go\(l\.link \?\? g\.link, l\.id\)/.test(read('src/components/salesDash/sections.tsx')), 'the follow-up queue opens each row by its own action type (it always opened the popup)');
  ok(!/executeContact|handleCallClick/.test(read('src/lib/salesLinks.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'no link can log a call attempt');
}

console.log('\n── client-health blockers open their stage ──');
{
  ok(blockerSection('Official baseline not started') === 'baseline' && blockerSection('Official re-measure overdue (due 2026-09-01)') === 'remeasure', 'baseline / re-measure');
  ok(blockerSection('New site not live yet') === 'build' && blockerSection('Monthly payment failed') === 'payment', 'build / payment');
}

console.log('\n── the pages honour the links ──');
{
  const outreach = read('src/pages/Outreach.tsx');
  ok(/searchParams\.get\('lead'\)/.test(outreach) && /onDetailClosed=\{clearUrlLead\}/.test(outreach) && /searchParams\.get\('show'\)/.test(outreach), 'Outreach reads ?lead= (kept until the workspace closes) and ?show=');
  const table = read('src/components/OutreachTable.tsx');
  ok(/if \(listComplete\) \{\s*toast\(\{ title: 'That lead is not in your list'/.test(table), 'a stale Outreach link says so once the list has loaded');
  const hub = read('src/pages/ClientHub.tsx');
  ok(/searchParams\.get\('section'\)/.test(hub) && /forceOpen=\{focused\}/.test(hub) && /id="hub-payment"/.test(hub), 'the hub opens and scrolls to the linked stage');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/void loadLead\(leadParam\)/.test(inbox), 'the Inbox loads a not-yet-listed lead (the assignment notification) before saying "not found"');
  ok(/conversations\.find\(\(c\) => c\.key === activeKey\)/.test(inbox.slice(inbox.indexOf('const shownList'))), 'the open conversation is drawn even when the filters exclude it');
  ok(/This conversation is no longer in your Inbox/.test(inbox), 'a stale conversation link says so');
  const notes = read('src/hooks/useNotifications.ts');
  ok(/p\.new\?\.kind === 'lead_assigned' && p\.new\.lead_id\) notifyLeadChanged\(p\.new\.lead_id\)/.test(notes), 'an assignment notification puts the lead in the Inbox and Outreach at once');
  const useInbox = read('src/hooks/useInbox.ts');
  ok(/const loadLead = useCallback/.test(useInbox) && /fetchOneInboxLead\(leadId, leadTable\)/.test(useInbox) && /\.eq\('lead_id', leadId\)/.test(useInbox), 'loadLead reads through the person\'s own lead source and RLS-scoped messages');
  const sd = read('src/pages/SalesDashboard.tsx');
  ok(/isAdmin \? \(linkedPerson/.test(sd), 'Team comparison opens one salesperson\'s view — admin only');
}

console.log('\n── one lead-link convention: ?lead=, built only by the helpers (2026-10-01) ──');
{
  /* 🔴 The Submissions card navigated to /outreach?leadId= from 2026-08-10. Outreach has never read
     ?leadId (it read no URL at all until Release A, and then only ?lead=), so clicking a submission
     never opened the lead. Release A's sweep missed it because the card built its own string.
     ⚠️ /ai-audit?leadId= is NOT this bug: it is the AI Audit page's own deep link and that page
     reads 'leadId' (AiAudit.tsx). Only /outreach and /inbox are swept here. */
  ok(/navigate\(outreachLeadLink\(r\.lead_id!\)\)/.test(read('src/components/dashboard/SubmissionsCard.tsx')), 'a dashboard submission opens /outreach?lead= through outreachLeadLink');
  ok(/to=\{whatsAppLinkForLead\(p\.lead\.id\)\}/.test(read('src/components/team/TeamOversight.tsx')), 'Team oversight "Open the lead" uses whatsAppLinkForLead');
  const walk = (d: string): string[] => readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => {
    const p = `${d}/${n}`; return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
  /* The two helpers own the strings. teamBoard.ts is edge-shared (admin-overview, business-summary)
     and builds the same /inbox?lead= shape itself, so moving it means redeploying both — left as is. */
  const OWNERS = new Set(['src/lib/salesLinks.ts', 'src/lib/conversationState.ts', 'src/lib/teamBoard.ts']);
  const wrong: string[] = []; const handBuilt: string[] = [];
  for (const f of walk('src')) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    if (/\/(outreach|inbox)\?(?:[^'"`\s]*&)?leadId=/.test(code)) wrong.push(f);
    if (!OWNERS.has(f) && /['"`]\/(outreach|inbox)\?lead=/.test(code)) handBuilt.push(f);
  }
  ok(wrong.length === 0, `no /outreach or /inbox link uses ?leadId=${wrong.length ? ': ' + wrong.join(', ') : ''}`);
  ok(handBuilt.length === 0, `no screen hand-builds /outreach?lead= or /inbox?lead=${handBuilt.length ? ': ' + handBuilt.join(', ') : ''}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
