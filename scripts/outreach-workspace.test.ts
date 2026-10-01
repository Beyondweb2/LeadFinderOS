/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH AS THE SALES WORKSPACE (2026-10-01, docs/outreach-workspace.md): truthful Contacted, one
   WhatsApp truth model, Next Action in its column, audits from Outreach, grouped replies, trade auto-fix.
   Run: node scripts/run-tests.mjs outreach-workspace
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { salesStateOf, openerReallySent } from '../src/lib/leadState.ts';
import { whatsAppCapabilityOf, isWhatsAppWorthTrying, WHATSAPP_CAPABILITY_LABEL } from '../src/lib/whatsAppCapability.ts';
import { nextActionViewOf } from '../src/lib/nextActionView.ts';
import { bellCount, replyCardTitle, replySummary } from '../src/lib/notificationGrouping.ts';
import { inferTrade, tradeFromText } from '../src/lib/tradeInference.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-10-01T10:00:00Z');
const SENT = '2026-09-29T09:00:00Z';
const st = (l: Parameters<typeof salesStateOf>[0]) => salesStateOf(l, NOW).label;

console.log('── Contacted means a real contact ──');
ok(st({ status: 'not_contacted' }) === 'New', '1. new, nothing attempted → New');
ok(st({ status: 'queued' }) === 'New', '2. WhatsApp queued, not sent → not Contacted');
ok(st({ status: 'no_whatsapp', whatsapp_sent_at: SENT }) === 'New', '3. Meta said not on WhatsApp (leftover send stamp) → NOT Contacted');
ok(st({ status: 'whatsapp_failed', whatsapp_sent_at: SENT }) === 'New', '4. send failed → NOT Contacted');
ok(st({ status: 'initial_contact', whatsapp_sent_at: SENT }) === 'Contacted', '5. sent → Contacted');
ok(st({ status: 'replied', whatsapp_sent_at: SENT }) === 'Replied', '6. replied → Replied');
ok(st({ status: 'not_contacted', lastLogged: { outcome: 'no_answer', at: SENT } }) === 'New', '7. a no-answer call is an ATTEMPT, not Contacted (History keeps it)');
ok(st({ status: 'not_contacted', lastLogged: { outcome: 'spoke_to_owner', at: SENT } }) === 'Contacted', '8. spoke to owner → Contacted');
ok(st({ status: 'no_whatsapp', whatsapp_sent_at: SENT, whatsapp_ever_delivered: true }) === 'Contacted', 'a number Meta once delivered to still counts as contacted');
ok(!openerReallySent({ status: 'no_whatsapp', whatsapp_sent_at: SENT }) && openerReallySent({ status: 'report_sent', whatsapp_sent_at: SENT }) && !openerReallySent({ status: 'initial_contact', whatsapp_sent_at: null }), 'openerReallySent: the stamp only, and never for a failed send');
ok(st({ status: 'queued', is_potential_work: true }) === 'Interested', '15. interested + follow-up queued → Interested');
ok(st({ status: 'initial_contact', call_booked_at: '2026-10-02T13:00:00Z' }) === 'Meeting booked', '16. meeting booked');
const admin = read('src/lib/adminMetrics.ts');
ok(/openerReallySent\(f\.lead\)/.test(admin) && !/\|\| !!f\.lead\.whatsapp_sent_at/.test(admin), 'the admin funnel counts only real openers');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/\.or\("delivery_status\.is\.null,delivery_status\.not\.in\.\(failed,failed_temporary,simulated\)"\)/.test(q), 'the queue\'s already-sent guard ignores failed sends (a NULL still blocks)');

console.log('\n── WhatsApp: one truth model ──');
ok(whatsAppCapabilityOf({ status: 'no_whatsapp', line_type: 'mobile' }) === 'not_on_whatsapp', 'mobile + Meta rejection → No WhatsApp (never "WhatsApp-capable")');
ok(whatsAppCapabilityOf({ status: 'initial_contact', line_type: 'mobile' }) === 'mobile_unchecked' && WHATSAPP_CAPABILITY_LABEL.mobile_unchecked === 'Mobile number', 'a mobile alone → "Mobile number"');
ok(whatsAppCapabilityOf({ status: 'replied', line_type: 'mobile', whatsapp_delivery_status: 'read' }) === 'verified', 'delivered / read → WhatsApp verified');
ok(whatsAppCapabilityOf({ status: 'no_whatsapp_needs_sms', line_type: 'landline' }) === 'not_mobile', 'landline → Not a mobile');
ok(whatsAppCapabilityOf({ status: 'not_contacted', line_type: null }) === 'unchecked', 'nothing known → WhatsApp not checked');
ok(!isWhatsAppWorthTrying('not_on_whatsapp') && isWhatsAppWorthTrying('mobile_unchecked'), 'the WhatsApp-capable filter drops rejected numbers');
const leb = read('src/components/LeadEnrichButtons.tsx');
ok(!/WhatsApp-capable \(line-type check\)/.test(leb) && /whatsAppCapabilityOf\(lead\)/.test(leb), 'the row phone icon reads the truth model, not line_type alone');

console.log('\n── Next Action lives in the Next Action column ──');
const table = read('src/components/OutreachTable.tsx');
ok(!/data-testid="row-last-contact"/.test(table) && !/data-testid="row-meeting"/.test(table), 'nothing under the Status pill');
ok(/Last contact: \$\{lc\.method\}/.test(table), 'the last contact moved to the status tooltip');
/* 2026-10-02: no derived "what is coming" line (nextUpHint is gone) — scripts/one-next-action.test.ts. */
ok(!/data-testid="row-next-up"/.test(table) && !/nextUpHint/.test(table), 'the Next Action column carries only the saved Next Action');
ok(nextActionViewOf('call', '2026-09-28', null, '2026-10-01')?.bucket === 'overdue' && nextActionViewOf('call', '2026-10-01', null, '2026-10-01')?.bucket === 'today' && nextActionViewOf('none', '2026-10-01', null, '2026-10-01') === null, 'overdue / today / cleared (UK days, the existing rule)');
ok(!/executeContact\(lead, 'call'\)/.test(table) && /setDetailTab\('work'\)/.test(table), 'tapping Call never logs a call; it opens the workspace on Work');

const inboxSrc = read('src/pages/Inbox.tsx');
ok(inboxSrc.includes('const allLogged = useAllLoggedContacts();') && inboxSrc.includes('reached: lc.everReached'), 'the Inbox list reads the same logged contacts, so list and header agree (Contacted) — every contact since 2026-10-02, so the filter can read them too');

console.log('\n── Audits from Outreach (the same engine) ──');
const dlg = read('src/components/LeadDetailDialog.tsx');
const work = dlg.slice(dlg.indexOf('TabsContent value="work"'), dlg.indexOf('TabsContent value="scripts"'));
ok(/<LeadHookPanel leadId=\{lead\.id\} \/>/.test(work), 'the audit card is on the Work tab');
const crm = read('src/components/LeadCrmPanel.tsx');
ok(/data-testid="hook-rerun"/.test(crm) && /data-testid="hook-history"/.test(crm) && /data-testid="hook-need-details"/.test(crm), 're-run, previous checks, and trade/town asked where it is needed');
ok((crm.match(/invokeEdge<[^>]*>\('create-ai-audit'/g) ?? []).length === 2 && !/question_count: [0-9]/.test(crm), 'the one create-ai-audit hook path (preview + run), no new engine');
ok(/data-testid="workspace-star"/.test(dlg) && /markLeadInterested\(/.test(dlg), 'the star toggle is in the workspace');

console.log('\n── Grouped replies ──');
ok(replyCardTitle(replySummary([{ phone: 'a', lead_id: 'A', unread_messages: 1 }])) === '1 new WhatsApp reply', '1 reply');
const six = Array.from({ length: 6 }, (_, i) => ({ phone: `p${i}`, lead_id: `L${i}`, unread_messages: 1 }));
ok(replyCardTitle(replySummary(six)) === '6 new WhatsApp replies', '6 replies from 6 businesses');
ok(replyCardTitle(replySummary([{ phone: 'a', lead_id: 'A', unread_messages: 2 }, { phone: 'b', lead_id: 'B', unread_messages: 2 }, { phone: 'c', lead_id: 'C', unread_messages: 1 }, { phone: 'd', lead_id: 'D', unread_messages: 1 }])) === '6 new replies from 4 businesses', '6 replies from 4 businesses');
ok(bellCount(4, [{ kind: 'whatsapp_reply', read_at: null }, { kind: 'client_paid', read_at: null }, { kind: 'lead_assigned', read_at: '2026-10-01' }]) === 5, 'badge = unread conversations + other unread items (reply rows never double count)');
const nc = read('src/components/NotificationCenter.tsx');
ok(/useWhatsAppUnreadCounts\(\)/.test(nc) && /!GROUPED_NOTIFICATION_KINDS\.has\(r\.kind\)/.test(nc) && /data-testid="grouped-replies"/.test(nc), 'the bell draws one reply card from the Inbox\'s unread state');

console.log('\n── Trades from data we already hold ──');
const t = (businessName: string, extra: Partial<Parameters<typeof inferTrade>[0]> = {}) => inferTrade({ businessName, ...extra });
ok(t('Grays Plumbing and Heating', { campaignTradeSlug: 'plumber' }).confidence === 'high' && t('Grays Plumbing and Heating', { campaignTradeSlug: 'plumber' }).trade === 'plumbers', 'plumber: campaign trade + name → high');
ok(t('Ace Roofing & Guttering', { auditBusinessTypes: ['roofers'] }).trade === 'roofers', 'roofer: the lead\'s audit');
ok(t('Bright Spark Electricians', { campaignName: 'Electricians Leeds' }).confidence === 'high', 'electrician: name + campaign name agree → high');
ok(t('Leeds Locksmiths Ltd').confidence === 'medium', 'locksmith from the name alone → review, never saved blind');
ok(tradeFromText('Sarah\'s Driving School') === 'driving instructors' && tradeFromText('driving lessons in York') === 'driving instructors', 'driving instructor');
ok(t('Smith Accountancy', { auditBusinessTypes: ['accountants'] }).trade === 'accountants', 'accountant');
ok(t('Premier Services').confidence === 'low' && t('Premier Services').trade === null, 'an ambiguous name → unresolved');
ok(t('Joe Bloggs Ltd', {}).trade === null, 'no website, no evidence → unresolved');
ok(t('Kings Roofing', { campaignTradeSlug: 'plumber' }).confidence === 'low', 'conflicting evidence → unresolved');
const mig = read('supabase/migrations/20261001220100_admin_set_lead_trade.sql');
ok(/coalesce\(btrim\(search_keyword\), ''\) = '' and coalesce\(btrim\(category\), ''\) = ''/.test(mig) && !/status|assigned_to|next_action/.test(mig.replace(/--.*$/gm, '')), 'the fix writes only the trade, only while blank — no status, owner or Next Action');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
