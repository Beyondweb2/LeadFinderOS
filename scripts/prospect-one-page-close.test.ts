/* THE ONE-PAGE PROSPECT POPUP (Paul, 2026-11-04, docs/prospect-one-page-close.md).
   Questions on the page, the close at the foot of it, and a browser call nothing on the page can end. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { callNotesToCarry, closeStillNeeded, planSendName, sendConfirmText, shownCallNotes } from '../src/lib/prospectClose.ts';
import { callNotesLines, cleanCallNotes } from '../src/lib/quickClose.ts';
import { decideLinkRoute } from '../src/lib/paymentLinkRoute.ts';
import { paidClientRecord } from '../src/lib/paidClientRecord.ts';
import { CLIENT_PAYMENT_PLANS, PAYMENT_PLAN_SPEC, gbpWords } from '../src/lib/paymentPlans.ts';

let failed = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { failed++; console.log('  FAIL ' + m); } };
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── the words on the send ──');
ok(planSendName('complete') === 'Complete monthly', 'Complete monthly');
ok(planSendName('complete_upfront') === `Complete up front ${gbpWords(PAYMENT_PLAN_SPEC.complete_upfront.firstGbp)}`, 'Complete up front, its figure from the plan');
ok(planSendName('twelve') === `Essential ${gbpWords(PAYMENT_PLAN_SPEC.twelve.firstGbp)} then ${gbpWords(PAYMENT_PLAN_SPEC.twelve.monthlyGbp)}`, 'Essential first payment then monthly, from the plan');
ok(new Set(CLIENT_PAYMENT_PLANS.map(planSendName)).size === CLIENT_PAYMENT_PLANS.length, 'every plan a salesperson can pick has its own name');
ok(sendConfirmText('complete', '07700 900123', 'whatsapp') === 'Send Complete monthly link to 07700 900123 by WhatsApp?', "Paul's wording");
ok(sendConfirmText('full', 'a@b.example', 'email', true).includes('again to a@b.example by email?'), 'a resend says so');

console.log('── what must be answered before a link ──');
const done = { answers: { decision_maker: 'yes', manager: 'owner', route: 'build', payment_plan: 'complete' } as const, call: { jobs: 'lockouts', areas: 'Canterbury' }, lead: { trade: 'Locksmith' } };
ok(closeStillNeeded(done).length === 0, 'everything answered: nothing is missing');
ok(closeStillNeeded({ ...done, answers: { ...done.answers, manager: 'agency' } }).includes('whether they are tied into a contract'), 'an agency asks about the contract');
ok(closeStillNeeded({ ...done, answers: { ...done.answers, manager: 'owner', decision_maker: undefined } }).includes('who makes the decision'), 'unanswered is never ready');
ok(closeStillNeeded({ ...done, call: {} }).join().includes('jobs') && closeStillNeeded({ ...done, call: {} }).join().includes('areas'), 'no notes: both asked');
ok(closeStillNeeded({ ...done, lead: { trade: ' ' } }).includes('their trade'), 'a blank trade is asked');
ok(!closeStillNeeded({ ...done, answers: { decision_maker: 'yes', manager: 'owner' } }).join().includes('plan'), 'the plan is its own step, not in this list');
ok(!closeStillNeeded(done).join().includes('domain') && !closeStillNeeded({ ...done, answers: { ...done.answers, domain: undefined } }).join().includes('domain'), 'the domain never holds the link: it is a note for Paul, as before');

console.log('── the lead lists count, and opening a lead writes nothing ──');
const lead = { trade: 'Locksmith', services: ['lockouts', 'car keys'], service_areas: ['Canterbury'] };
ok(shownCallNotes({}, lead).jobs === 'lockouts, car keys', 'shows the services the lead holds');
ok(shownCallNotes({ jobs: 'boilers' }, lead).jobs === 'boilers', 'what the call heard wins');
ok(closeStillNeeded({ ...done, call: {}, lead }).length === 0, 'the lead lists count as answers');
ok(callNotesToCarry({}, lead).jobs === 'lockouts, car keys' && callNotesToCarry({}, lead).areas === 'Canterbury', 'they are carried onto the call notes before a link');
ok(Object.keys(callNotesToCarry({ jobs: 'a', areas: 'b' }, lead)).length === 0, 'nothing to carry once the call has them');
const questions = read('src/components/ProspectQuestions.tsx');
ok(!/useEffect/.test(code(questions)), 'the questions section has no effect that could write on open');

console.log('── everything answered reaches New paid clients ──');
ok(cleanCallNotes({ contract_until: ' March ', decision_who: 'Pat', nonsense: 'x' }).contract_until === 'March' && !('nonsense' in cleanCallNotes({ nonsense: 'x' })), 'the two new notes survive cleaning, unknown keys do not');
const lines = callNotesLines({ manager: 'agency', agency_contract: 'free', decision_maker: 'no', domain: 'not_sure' }, { jobs: 'j', areas: 'a', contract_until: 'March', decision_who: 'Pat' });
for (const k of ['manager', 'agency_contract', 'contract_until', 'jobs', 'areas', 'decision_maker', 'decision_who', 'domain']) ok(lines.some((l) => l.key === k), `the record carries ${k}`);
const rec = paidClientRecord({ lead: {}, onboarding: { quick_close: { answers: { manager: 'agency', agency_contract: 'free', decision_maker: 'no', domain: 'yes' }, call: { jobs: 'j', areas: 'a', contract_until: 'March', decision_who: 'Pat' } } }, activity: [] });
for (const v of ['March', 'Pat', 'j', 'a', 'They do']) ok(rec.lines.some((l) => l.value === v), `New paid clients shows "${v}"`);
const fn = read('supabase/functions/quick-close/index.ts');
ok(/\["jobs", "areas", "agency_monthly_gbp", "contract_until", "decision_who"\]/.test(fn), 'the server saves the two new notes');

console.log('── WhatsApp: free text inside the 24 hours ──');
const NOW = Date.parse('2026-11-04T12:00:00Z');
const replied = { hasPhone: true, firstOutboundAt: '2026-11-04T08:00:00Z', lastInboundAt: '2026-11-04T09:00:00Z' };
const stale = { ...replied, firstOutboundAt: '2026-11-01T08:00:00Z', lastInboundAt: '2026-11-01T09:00:00Z' };
const approved = { sendable: true, tryable: true, say: 'approved', label: 'approved', status: 'APPROVED' } as never;
ok(decideLinkRoute(replied, { template: approved, nowMs: NOW, freeTextInWindow: true }).route === 'whatsapp_reply', 'inside the window: free text, even with an approved template');
ok(decideLinkRoute(stale, { template: approved, nowMs: NOW, freeTextInWindow: true }).route === 'whatsapp_template', 'outside it: the approved template');
ok(decideLinkRoute(stale, { template: null, nowMs: NOW, freeTextInWindow: true }).route === 'none', 'outside it with no template: nothing');
ok(decideLinkRoute({ ...replied, blocked: true }, { template: approved, nowMs: NOW, freeTextInWindow: true }).route === 'none', 'an opt-out still stops everything');
ok(decideLinkRoute(replied, { template: approved, nowMs: NOW }).route === 'whatsapp_template', 'the onboarding link (paid-client-hub) keeps its own order');
ok((fn.match(/freeTextInWindow: true/g) ?? []).length === 3, 'the view and both sends in quick-close agree');

console.log('── no Quick Close, no Close tab ──');
function* walk(dir: string): Generator<string> { for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.tsx?$/.test(p)) yield p; } }
const every = [...walk('src')].map((f) => [f, read(f)] as const);
ok(!every.some(([, s]) => /QuickCloseButton|QuickCloseNav/.test(s)), 'neither name exists in the app');
const dlg = read('src/components/LeadDetailDialog.tsx');
ok(!/<TabsTrigger value="close"/.test(dlg) && !/<TabsContent value="close"/.test(dlg), 'no Close tab');
ok(/t === 'close'\) return 'call'/.test(dlg), 'an old link to the Close tab opens Call');
ok(/initialTab === 'close'\) goToClose\(\)/.test(dlg), '…at the close');
const tab = code(read('src/components/SimpleCallTab.tsx'));
const order = ['<Script ', '<ProspectQuestions ', '<Offer />', '<Objections ', '<ClosePanel ', '<LogCallBar '].map((n) => tab.indexOf(n));
ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), 'the page order: script, questions, offer, objections, close, log');
const panel = read('src/components/QuickCloseDialog.tsx');
ok(/data-testid="close-send-confirm"/.test(panel) && /onClick=\{\(\) => onAsk\(ch\)\}/.test(panel) && /data-testid="close-send-yes" onClick=\{\(\) => \{ if \(asking\) void send\(asking\); \}\}/.test(panel), 'a send button only asks; only Yes sends');
ok(!/findable\.live\/agree|stripe\.com/.test(code(panel)), 'the browser never builds a link');

console.log('── the call ──');
const app = read('src/App.tsx');
ok(app.indexOf('<LiveCallProvider>') > 0 && app.indexOf('<LiveCallProvider>') < app.indexOf('<Routes>') && app.indexOf('</LiveCallProvider>') > app.indexOf('</Routes>'), 'one call, above every route');
ok(every.map(([f, s]) => [f.replace(/\\/g, '/'), s] as const).filter(([f, s]) => f !== 'src/hooks/useTwilioCall.ts' && /useTwilioCall\(\)/.test(code(s))).map(([f]) => f).join() === 'src/components/LiveCall.tsx', 'only the provider holds a call: a second would be a second Twilio device');
const live = read('src/components/LiveCall.tsx');
ok(/data-testid="end-call"/.test(live) && /bg-red-600/.test(live) && /fixed right-0/.test(live) && /z-\[200\]/.test(live) && /pointer-events-auto/.test(live) && /createPortal/.test(live), 'End call: red, fixed on the right edge, above every window, pressable while a modal is open');
ok(/call\.active/.test(live) && /end-call-timer/.test(live) && /fmtDuration\(call\.seconds\)/.test(live), 'only while a call is live, with the timer');
ok(/data-keep-dialog-open/.test(live), 'pressing it never closes the window under it');
for (const f of ['src/components/ui/dialog.tsx', 'src/components/ui/sheet.tsx']) ok(/keepsDialogOpen\(e\)/.test(read(f)), `${f} honours that`);
ok(!/useLiveCall\(\)/.test(code(dlg)), 'the popup never reads the ticking call, so the timer cannot redraw a page being typed in');

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll passed.');
