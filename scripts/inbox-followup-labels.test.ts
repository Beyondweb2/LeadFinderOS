/* Inbox follow-up hooks + plain send errors (Paul, 2026-11-16): polite_hook2 on an open-window conversation showed "Opener" and
   its preview said "This would NOT send — Edge Function returned a non-2xx status code". The real answer (function logs) was
   503 auth_unavailable: the sign-in service timed out. Now: the six follow-ups read Follow-up everywhere, and a rep always sees
   the server's own reason, never the SDK wrapper. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { templateGroupLabel, WA_TEMPLATE_REQS } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { invokeFailure, isInvokeWrapperText, plainRefusal } from '../src/lib/functionError.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const WRAPPER = 'Edge Function returned a non-2xx status code';

console.log('── the six follow-ups are follow-ups ──');
const SIX = ['polite_hook', 'polite_hook2', 'webdev_hook', 'webdev_report', 'webdev_example', 'initial_question'];
for (const t of SIX) {
  ok(templateGroupLabel(t) === 'Follow-up', `${t}: picker label Follow-up`);
  ok(WA_TEMPLATE_REQS[t]?.group === 'followup', `${t}: group followup`);
  ok(!isColdOutreachTemplate(t) && NEEDS_PRIOR_WHATSAPP.has(t), `${t}: a continuation that needs a prior WhatsApp (single send, preview, bulk all use this)`);
}
ok(WA_TEMPLATE_REQS.webdev_report.needsAudit === true, 'webdev_report still needs a report');
ok(templateGroupLabel('initial_contact') === 'Opener' && templateGroupLabel('initial_contact_short') === 'Opener', 'real cold openers still read Opener');
ok(templateGroupLabel('contact_followup') === 'Follow-up', 'any other continuation in the old opener group reads Follow-up too');
ok(templateGroupLabel('video_template') === 'Audit' && templateGroupLabel('booking_page_intro') === 'Site / claim', 'other groups unchanged');
const inbox = read('src/pages/Inbox.tsx');
ok(/const groupLabel = templateGroupLabel\(t\.value\);/.test(inbox) && !/: 'Opener';/.test(inbox), 'the Inbox picker reads the one label rule');

console.log('\n── a rep never sees the non-2xx wrapper ──');
const httpErr = (status: number, body: string | null) => ({ message: WRAPPER, context: { status, text: async () => body ?? '' } });
const a = await invokeFailure(httpErr(503, JSON.stringify({ ok: false, error: 'auth_unavailable', detail: 'The sign-in service did not answer in time. Try again.' })));
ok(a.error === 'auth_unavailable' && a.reason === 'The sign-in service did not answer in time. Try again.' && a.status === 503, 'the polite_hook2 case: 503 auth_unavailable -> its own sentence');
const b = await invokeFailure(httpErr(400, JSON.stringify({ ok: false, error: 'follow_up_needs_contact', reason: 'This template is a follow-up…' })));
ok(b.error === 'follow_up_needs_contact' && b.reason === 'This template is a follow-up…', 'reason field (send-whatsapp-message) is used');
const c = await invokeFailure(httpErr(503, JSON.stringify({ ok: false, error: 'auth_unavailable' })));
ok(c.reason.includes('sign-in service') && !isInvokeWrapperText(c.reason), 'token only -> the known sentence');
const d = await invokeFailure(httpErr(500, null));
ok(d.error === 'server_error' && /error 500/.test(d.reason) && !isInvokeWrapperText(d.reason), 'no body, 500 -> plain words with the status');
const e = await invokeFailure(httpErr(502, '<html>bad gateway</html>'));
ok(!isInvokeWrapperText(e.reason) && !e.reason.includes('<html'), 'an HTML error page is never shown');
const f = await invokeFailure({ message: 'Failed to send a request to the Edge Function' });
ok(f.error === 'server_unreachable' && /Could not reach the server/.test(f.reason), 'network failure -> could not reach the server');
const g = await invokeFailure(httpErr(400, JSON.stringify({ ok: false, error: 'lead_archived' })));
ok(g.error === 'lead_archived' && !isInvokeWrapperText(g.reason) && g.reason.includes('lead_archived'), 'unknown token -> a sentence quoting it');
ok(!isInvokeWrapperText(plainRefusal(WRAPPER)) && !isInvokeWrapperText(plainRefusal('')) && plainRefusal('auth_unavailable').includes('sign-in'), 'plainRefusal never passes the wrapper through');

console.log('\n── every send/preview door reads the body ──');
const useInbox = read('src/hooks/useInbox.ts');
ok(/if \(error\) \{ const f = await invokeFailure\(error\); return \{ ok: false, error: f\.error, reason: f\.reason \}; \}/.test(useInbox) && !/if \(error\) return \{ ok: false, error: error\.message \}/.test(useInbox), 'Inbox preview (dry run)');
const req = read('src/lib/whatsAppSendRequest.ts');
ok(/invokeFailure\(error\)/.test(req) && !/error: error\.message/.test(req), 'single + bulk send (sendWhatsAppRequest)');
ok(/invokeFailure\(r\.error\)/.test(inbox), 'Inbox named follow-ups (sendNamed)');
ok(/This would NOT send — \{previewResult\.reason \|\| plainRefusal\(previewResult\.error\)\}/.test(inbox), 'the preview line shows the reason, never the bare token');
for (const p of ['src/components/dashboard/SubmissionsCard.tsx', 'src/components/LeadQuestionnaireSection.tsx']) {
  const s = read(p);
  ok(/invokeFailure\(e\)/.test(s) && !/e\?\.message \?\?/.test(s), `${p}: no wrapper`);
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
