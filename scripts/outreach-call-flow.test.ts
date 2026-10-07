/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH CALL FLOW + THE CALL-SCRIPT AUDIT GATE (Paul, 2026-10-07).

   Reps ring prospects from their OWN phone (or the WhatsApp app), not the laptop. Pinned here:
     1. OUTREACH CALL — opens the prospect popup on the Call tab with the small NUMBER window over it: the
        business, the number (UK / Australia normalised), Copy number, Call on WhatsApp (UK/AU only), Call
        manually, Cancel. No tel: link anywhere on the call path — on a laptop tel: belongs to WhatsApp Desktop,
        which is the root cause of the old "Open WhatsApp?" prompt.
     2. THE NUMBER WINDOW'S CALL — closes only that window: the prospect popup stays, the script stays, nothing
        is written, "What happened?" does not open.
     3. LOG CALL — the only way "What happened?" opens; the outcomes are unchanged and save only on a tap.
     4. AUDIT GATE — the popup opens in any state; the script shows ONLY for a valid completed check of THIS lead.
     5. PERMISSIONS — the number window reads only the popup's own lead row; nothing new is fetched.
     6. REGRESSION — WhatsApp messaging, Quick Close and India's exclusion are untouched.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterLogCall, afterStartCall, arrivalWindows, callArrivalOf } from '../src/lib/callArrival.ts';
import { callNumberView, WHATSAPP_CALL_PREFIXES } from '../src/lib/callNumber.ts';
import { CALL_SCRIPT_LOCKED_TITLE, CALL_SCRIPT_RECHECK_MS, callAuditProgress, callScriptGate, callScriptRecheckMs, type ProgressAuditRow } from '../src/lib/callScriptGate.ts';
import { buildColdCallPlaybook, PLAYBOOK_AUDIT_STALE_DAYS, type PlaybookInput } from '../src/lib/coldCallPlaybook.ts';
import { resolveLeadReportAudit } from '../src/lib/auditReportResolver.ts';
import { CallNumberCard } from '../src/components/CallNumberPopup.tsx';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const slice = (src: string, from: string, to: string) => { const i = src.indexOf(from); return i < 0 ? '' : src.slice(i, src.indexOf(to, i + from.length)); };

const table = read('src/components/OutreachTable.tsx');
const mobile = read('src/components/OutreachMobileCard.tsx');
const dlg = read('src/components/LeadDetailDialog.tsx');
const popup = read('src/components/CallNumberPopup.tsx');
const play = read('src/components/ColdCallPlaybook.tsx');
const flow = read('src/components/LeadCallFlow.tsx');

console.log('── 1. OUTREACH CALL opens the prospect popup with the number window over it ──');
{
  const call = code(slice(table, 'const handleCallClick', '}, [onContactGated, onContactMethodChange]);'));
  ok(/setDetailTab\('call'\);\s*setDetailLogContact\(false\);\s*setDetailNumberPopup\(true\);\s*setDetailLead\(lead\);/.test(call), 'Call opens the lead popup on the Call tab, number window on, Log window off');
  ok(!/executeContact|logAttempt|updateLead|leadRpc|supabase|invoke|navigate\(|window\.open|location/.test(call), '…and records no call (no attempt, no status, no history), navigates nowhere, opens nothing external — only the Contact Method pill is set (scripts/contact-method-auto-select.test.ts)');
  ok(/openNumberPopup=\{detailNumberPopup\}/.test(table) && /openLogContact=\{detailLogContact\}/.test(table), 'the popup is told which window to arrive on');
  ok(!/tel:/.test(code(table)) && !/tel:/.test(code(mobile)), 'no tel: link left in the Outreach table or the phone card');
  ok(/<button type="button" onClick=\{\(\) => handleCallClick\(lead\)\}[^>]*data-testid="outreach-call"/.test(table), 'the row\'s phone icon is a button that runs the Call flow');
  ok(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); handleCallClick\(lead\); \}\}/.test(table), 'the number in the phone column opens the same Call flow');
  ok(/<DropdownMenuItem[^>]*onClick=\{\(\) => onCallClick\?\.\(\)\}[^>]*data-testid="outreach-call"/.test(mobile) && /onCallClick=\{\(\) => handleCallClick\(lead\)\}/.test(table), 'the phone card\'s Call is the same Call flow');
  ok(/else if \(launchIntent\.channel === 'call'\) handleCallClick\(lead\);/.test(table), 'a Call link from elsewhere (dashboard, team board) lands on the same flow');
  for (const [where, re] of [['openStep', /const openStep = [^\n]*setDetailNumberPopup\(false\)/], ['openCallScreen', /const openCallScreen = [^\n]*setDetailNumberPopup\(false\)/], ['close', /setDetailLogContact\(false\); setDetailNumberPopup\(false\); onDetailClosed/]] as const)
    ok(re.test(table), `the number window does not follow to another lead or reopen (${where})`);
  const w = arrivalWindows(callArrivalOf(true, false), true);
  ok(w.numberOpen && !w.logOpen, 'arrival from Call: number window open, "What happened?" closed');
  ok(!arrivalWindows(callArrivalOf(true, true), true).logOpen, 'Call wins over Log: a popup opened by Call never arrives on "What happened?"');
  ok(!arrivalWindows('call', false).numberOpen, 'no phone on file → no number window');
  ok(/const \[windows, setWindows\] = useState\(\(\) => arrivalWindows\(callArrivalOf\(openNumberPopup, openLogContact\)/.test(dlg), 'the popup\'s windows start from that one rule');
}

console.log('── the number window: business, number, Copy, the two ways to call ──');
{
  const uk = callNumberView('07700 900123', 'UK')!;
  ok(uk.display === '+44 7700 900123' && uk.copy === '+447700900123' && uk.stored === '07700 900123', 'UK mobile: +44 7700 900123, copies +447700900123, shows the stored form under it');
  ok(callNumberView('01632 960123', null)!.display === '+44 1632 960123', 'UK landline (blank country = UK, as everywhere)');
  const au = callNumberView('0412 345 678', 'Australia')!;
  ok(au.display === '+61 412 345 678' && au.copy === '+61412345678', 'Australian mobile: +61 412 345 678');
  ok(callNumberView('(02) 9876 5432', 'AU')!.display === '+61 2 9876 5432', 'Australian landline: +61 2 9876 5432');
  const thirteen = callNumberView('1300 123 456', 'Australia')!;
  ok(thirteen.display === '1300 123 456' && thirteen.whatsappUrl === null, 'an Australian 1300 number shows as stored, no WhatsApp');
  const au04onUk = callNumberView('0412 345 678', 'UK')!;
  ok(au04onUk.display === '0412 345 678' && au04onUk.whatsappUrl === null, 'an 04… number on a UK lead is never re-shaped into a +44 number');
  ok(callNumberView('+44 7700 900123', 'UK')!.stored === null, 'already international: no second line');
  ok(callNumberView('', 'UK') === null && callNumberView(null) === null, 'no number → null');
  ok(uk.whatsappUrl === 'https://wa.me/447700900123' && au.whatsappUrl === 'https://wa.me/61412345678', 'UK and Australian numbers offer Call on WhatsApp');
  ok(callNumberView('+91 98765 43210', 'India')!.whatsappUrl === null && WHATSAPP_CALL_PREFIXES.join() === '44,61', 'INDIA NOT RE-ENABLED: an Indian number has no WhatsApp option (UK / Australia only)');
  const html = (copied: boolean, view = uk) => renderToStaticMarkup(createElement(CallNumberCard, { businessName: 'Calder Plumbing', view, copied, onCopy: () => {}, onStartCall: () => {}, onCancel: () => {} }));
  const h = html(false);
  ok(h.includes('Calder Plumbing') && h.includes('+44 7700 900123') && h.includes('On file as 07700 900123'), 'shows the business and the number prominently');
  ok(/data-testid="call-number-copy"[^>]*>[\s\S]*?Copy number/.test(h) && html(true).includes('Copied'), 'Copy number, and Copied after a copy');
  ok(/data-testid="call-number-whatsapp"/.test(h) && h.includes('Call on WhatsApp') && /href="https:\/\/wa\.me\/447700900123"/.test(h) && /target="_blank"/.test(h), 'Call on WhatsApp opens the WhatsApp app at this number (a new tab, only on the rep\'s tap)');
  ok(/data-testid="call-number-start"/.test(h) && h.includes('Call manually') && /data-testid="call-number-cancel"/.test(h), 'Call manually and Cancel');
  ok(!/tel:/.test(h) && !/tel:/.test(code(popup)), 'no tel: link in the window');
  const india = html(false, callNumberView('+91 98765 43210', 'India')!);
  ok(!/wa\.me/.test(india) && india.includes('Call manually'), '…an Indian number gets only Call manually');
  ok(!/window\.open|location\.|navigate|supabase|leadRpc|invokeEdge|fetch\(|useQuery|useMutation/.test(code(popup)), 'the window opens nothing by itself and reads / writes nothing');
  ok(/navigator\.clipboard\?\.writeText\(view\.copy\)/.test(popup) && !/onOpenChange\(false\)/.test(slice(popup, 'const copy = ', '};')), 'Copy copies the number and does not close the window');
  ok(/overlayClassName="bg-black\/25 !backdrop-blur-none"/.test(popup) && /sm:max-w-sm/.test(popup), 'small, with a light overlay — the prospect popup stays visible underneath');
  ok(/max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0/.test(popup) && /break-all/.test(popup), '390 px: a compact bottom sheet over the popup; a long number wraps (no sideways scroll)');
  ok(/overlayClassName\?: string;/.test(read('src/components/ui/dialog.tsx')) && /<DialogOverlay className=\{overlayClassName\} \/>/.test(read('src/components/ui/dialog.tsx')), 'the dialog primitive takes a lighter overlay only when asked (every other dialog unchanged)');
}

console.log('── 2. CALL in the number window closes only that window ──');
{
  const before = { numberOpen: true, logOpen: false };
  const after = afterStartCall(before);
  ok(!after.numberOpen && !after.logOpen, 'Call (WhatsApp or manual) closes the number window, does not open "What happened?"');
  ok(/onStartCall=\{startCall\}/.test(dlg) && /const startCall = \(\) => setWindows\(afterStartCall\);/.test(dlg), 'the popup wires both Call buttons to that rule');
  ok(/onClick=\{onStartCall\} data-testid="call-number-whatsapp"/.test(popup) && /onClick=\{onStartCall\} data-testid="call-number-start"/.test(popup), '…both buttons');
  ok(!/onClose|onOpenChange\(false\)|setTab|goTab/.test(slice(dlg, 'const startCall', '\n')), 'the prospect popup stays open, on the same tab');
  ok(/<CallNumberPopup open=\{windows\.numberOpen\}/.test(dlg) && dlg.indexOf('<CallNumberPopup') > dlg.indexOf('<LeadCallFlow'), 'the number window is mounted inside the popup (over it), not instead of it');
  ok(/<button type="button" onClick=\{showNumber\}[^>]*data-testid="workspace-call"/.test(dlg) && !/tel:/.test(code(dlg)), 'the popup\'s own Call reopens the number window; no tel: link anywhere in the popup');
}

console.log('── 3. LOG CALL is the only way "What happened?" opens ──');
{
  ok(afterLogCall().logOpen && !afterLogCall().numberOpen, 'Log call opens "What happened?"');
  ok(/const logThisCall = \(\) => setWindows\(afterLogCall\(\)\);/.test(dlg), 'the popup\'s Log call is that rule');
  const opens = [...code(dlg).matchAll(/logOpen: true|setLogOpen\(true\)|afterLogCall\(\)/g)].length;
  ok(opens === 1, `exactly one place opens "What happened?" (found ${opens})`);
  ok(/onClick=\{logThisCall\}[^>]*data-testid="workspace-log"[^]*?Log call/.test(dlg) && /onLogCall=\{logThisCall\}/.test(dlg), 'Log call in the header and Log this call on the script\'s bar');
  ok(/<LeadCallFlow leadId=\{lead\.id\}[^>]*logOpen=\{logOpen\} onLogOpenChange=\{setLogOpen\}/.test(dlg), 'the one Log window, unchanged');
  for (const o of ['interested', 'not_interested', 'no_answer', 'call_back', 'send_onboarding', 'wrong_number', 'left_voicemail']) ok(new RegExp('\\b' + o + ':').test(flow), `outcome still offered: ${o}`);
  const tap = slice(flow, 'const tap = async', 'const chooseInterestedNext');
  ok(/work\.logOutcome\(/.test(tap), 'an outcome is saved only when one is tapped (lead_log_contact through useLeadWork)');
}

console.log('── 4. AUDIT GATE — no valid completed audit, no script ──');
{
  const NOW = Date.parse('2026-10-07T10:00:00Z');
  const DAY = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const LEAD = 'lead-1';
  type Row = ProgressAuditRow & { short_code: string | null; business_name: string; business_type: string; location_text: string; audit_purpose: string | null };
  const audit = (id: string, runs: string[], over: Partial<Row> = {}): Row => ({ id, lead_id: LEAD, created_at: iso(NOW - DAY), short_code: 'abc123', business_name: 'Calder Plumbing', business_type: 'Plumbers', location_text: 'Halifax', audit_purpose: 'audit', ai_audit_runs: runs.map((status) => ({ status })), ...over });
  const REPORT = { hook: { questionsTested: 3, gap: { question: 'best plumber in Halifax', engineLabel: 'Gemini', namedInstead: ['Sunnybank Plumbing'], answerExcerpt: 'Several plumbers operate in Halifax and offer emergency call-outs across the town.' }, tested: [] } };
  /** The loader's own composition (useColdCallPlaybook.loadPlaybook): the resolver picks the audit, its report is
   *  built only when one was picked, progress is read from this lead's newest audit. */
  const playbookFor = (audits: Row[], leadId = LEAD) => {
    const reportAudit = resolveLeadReportAudit(audits as never[], leadId) as Row | null;
    const input: PlaybookInput = {
      lead: { id: leadId, business_name: 'Calder Plumbing', phone: '07700 900123', website: 'https://calder.co.uk', category: 'Plumber', derived_town: 'Halifax', status: 'not_contacted' },
      reportAudit, report: reportAudit ? REPORT : null,
      auditRunning: audits.some((a) => (a.ai_audit_runs ?? []).some((r) => r.status === 'pending' || r.status === 'running')),
      auditProgress: callAuditProgress(audits, leadId),
      runCrawls: [], leadCrawl: null, messages: [], nowMs: NOW, callerName: 'Sam Rep',
    } as PlaybookInput;
    return buildColdCallPlaybook(input);
  };
  const gateOf = (audits: Row[]) => callScriptGate(LEAD, playbookFor(audits));
  const locked = (g: ReturnType<typeof callScriptGate>, reason: string, label: string) =>
    ok(!g.show && g.reason === reason && g.title === CALL_SCRIPT_LOCKED_TITLE, `${label} → no script (${reason})`);
  locked(gateOf([]), 'no_audit', 'no audit');
  locked(gateOf([audit('a1', [])]), 'queued', 'queued (audit created, no run yet)');
  locked(gateOf([audit('a1', ['pending'])]), 'queued', 'pending');
  locked(gateOf([audit('a1', ['running'])]), 'running', 'running');
  locked(gateOf([audit('a1', ['failed'])]), 'failed', 'failed');
  locked(gateOf([audit('a1', ['cancelled'])]), 'cancelled', 'cancelled');
  ok(gateOf([audit('a1', ['complete'])]).show, 'valid completed audit → script visible');
  ok(gateOf([audit('a1', ['capped'])]).show, 'a capped run counts as usable — the one RUN_USABLE rule, as everywhere');
  locked(callScriptGate(LEAD, { ...playbookFor([audit('a1', ['complete'])]), auditLeadId: 'lead-2' }), 'wrong_lead', 'an audit of another lead');
  locked(gateOf([audit('a1', ['complete'], { lead_id: 'lead-2' })]), 'no_audit', 'another lead\'s audit in the list is never picked');
  locked(callScriptGate(LEAD, { ...playbookFor([audit('a1', ['complete'])]), evidence: { kind: 'none' } as never }), 'no_result', 'a completed audit with no usable result');
  locked(gateOf([audit('m1', ['complete'], { audit_purpose: 'measurement' })]), 'no_result', 'only an internal measurement (never the report) — no script');
  locked(callScriptGate(LEAD, null), 'no_audit', 'no playbook at all');
  const olderOk = gateOf([audit('a2', ['running'], { created_at: iso(NOW) }), audit('a1', ['complete'], { created_at: iso(NOW - 2 * DAY) })]);
  ok(olderOk.show, 'reuse rule kept: a newer check running never hides an older usable one');
  const stale = playbookFor([audit('a1', ['complete'], { created_at: iso(NOW - (PLAYBOOK_AUDIT_STALE_DAYS + 5) * DAY) })]);
  ok(callScriptGate(LEAD, stale).show && stale.context.auditStale && stale.warnings.some((w) => /days old/.test(w)), `stale (> ${PLAYBOOK_AUDIT_STALE_DAYS} days) follows the existing rule: script shown with the out-of-date warning`);
  ok(callScriptRecheckMs(LEAD, playbookFor([audit('a1', ['running'])])) === CALL_SCRIPT_RECHECK_MS && callScriptRecheckMs(LEAD, playbookFor([audit('a1', ['complete'])])) === false && callScriptRecheckMs(LEAD, playbookFor([])) === false,
    'while queued / running the script is re-read so it appears by itself; never polled otherwise');
  ok(callAuditProgress([audit('x', ['complete'], { lead_id: 'lead-2' })], LEAD) === 'none' && callAuditProgress([audit('x', ['weird'])], LEAD) === 'queued', 'progress reads only this lead; an unknown status is never "complete"');

  const inline = slice(play, 'export function ColdCallPlaybookInline', 'export function ColdCallPlaybookSheet');
  ok(/const gate = callScriptGate\(leadId, q\.data\);/.test(inline) && /\{gate\.show \? <>\s*<Warnings p=\{q\.data\} \/>\s*<Scripts p=\{q\.data\}/.test(inline) && /: <ScriptLocked gate=\{gate\} onShowCheck=\{onShowCheck\} \/>\}/.test(inline), 'the Call tab: script only when the gate says so, else the locked state');
  ok(/\{onLogCall && <LogCallBar onLogCall=\{onLogCall\} leadId=\{leadId\} \/>\}/.test(inline), '…Log call and Quick Close stay either way');
  const sheet = slice(play, 'export function ColdCallPlaybookSheet', 'export function ColdCallPlaybookButton');
  ok(/const gate = callScriptGate\(leadId, q\.data\);/.test(sheet) && /gate\.show \? <><Warnings p=\{q\.data\} \/><Scripts/.test(sheet), 'the Outreach / Inbox script sheet is gated the same way');
  ok((play.match(/<Scripts /g) ?? []).length === 2, 'no other place renders the script');
  ok(/data-testid="call-script-locked"/.test(play) && /data-testid="call-script-go-to-check"/.test(play) && /\{gate\.title\}/.test(play), 'the locked state: the one line, why, and Go to the AI check');
  ok(/<section ref=\{aiCheckRef\}[^>]*data-testid="ai-check-tools"/.test(dlg) && /onShowCheck=\{showCheck\}/.test(dlg), '…which scrolls to the existing check controls (LeadHookPanel) at the top of the Call tab');
  ok(/callAuditProgress\(audits, leadId\)/.test(read('src/hooks/useColdCallPlaybook.ts')) && /refetchInterval: \(query\) => \(leadId \? callScriptRecheckMs\(leadId, query\.state\.data\) : false\)/.test(read('src/hooks/useColdCallPlaybook.ts')), 'the loader passes progress and re-reads while the check runs');
}

console.log('── 5. PERMISSIONS ──');
{
  ok(/businessName=\{lead\.business_name\} phone=\{lead\.phone\} country=\{lead\.country\}/.test(dlg), 'the number window shows the popup\'s own lead row — the one the caller was allowed to open (sales_leads for a rep)');
  ok(/readLeadRow<Record<string, unknown>>\(leadId, LEAD_COLUMNS\)/.test(read('src/hooks/useColdCallPlaybook.ts')) && /from\('sales_leads'/.test(read('src/lib/leadRead.ts')), 'the script and its audit are still read through the caller\'s own session (a rep: sales_leads + RLS)');
  ok(!/supabase|leadRpc|invokeEdge/.test(code(read('src/lib/callScriptGate.ts')) + code(read('src/lib/callNumber.ts')) + code(read('src/lib/callArrival.ts'))), 'the new rules read nothing — no new data path, nothing to leak across reps');
}

console.log('── 6. REGRESSION ──');
{
  ok(/navigate\('\/inbox', \{ state: \{ launch: \{ leadId: lead\.id \} \} \}\);/.test(table) && /handleWhatsAppClick\(lead\)/.test(table), 'the green WhatsApp button still opens the in-app conversation (messaging is separate from calling)');
  ok(/whatsAppLinkForLead\(lead\.id\)/.test(dlg), 'the popup\'s WhatsApp link to the Inbox conversation is unchanged');
  ok(/<QuickCloseButton leadId=\{leadId\}/.test(play) && /QuickCloseNav\.Provider/.test(dlg), 'Quick Close unchanged');
  ok(!/INDIA|India/.test(read('src/lib/callNumber.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'no India rule added for calling');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall outreach call-flow checks passed');
