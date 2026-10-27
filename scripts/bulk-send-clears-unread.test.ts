/* A bulk send (Send drafts, or the bulk template send) answers a conversation without opening it, so the blue Unread dot
   used to stay (2026-10-27). Both loops must clear it for every send that went through (sent or queued for their hours),
   and only then. Source-level pin on src/pages/Inbox.tsx. */
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const src = readFileSync(new URL('../src/pages/Inbox.tsx', import.meta.url), 'utf8');

ok(/const clearUnreadAfterSend = \(phone: string\) => \{[\s\S]{0,260}markSmsRead\(phone\)[\s\S]{0,200}void markRead\(phone\)/.test(src), 'one helper clears the dot (SMS read mark or WhatsApp read mark)');
const draftSend = src.slice(src.indexOf('send: async (it) => {'), src.indexOf('complete: async (draftId'));
ok(/const res = await send\(\{ phone: it\.phone[\s\S]*?if \(res\.ok\) clearUnreadAfterSend\(it\.phone\);[\s\S]*?return res;/.test(draftSend), 'Send drafts clears the dot only when the send went through');
const bulk = src.slice(src.indexOf('const runBulkSend'), src.indexOf('setBulkBusy(false);\n    setBulkConfirm(false);\n    setBulkReport({ sent, queued, failed })'));
ok(/if \(res\.ok\) clearUnreadAfterSend\(target\.phone\);/.test(bulk), 'the bulk template send clears the dot only when the send went through');
ok(!/else if \(res\.ok\) sent\+\+;[\s\S]{0,40}clearUnreadAfterSend/.test(bulk), 'a failed send never clears it');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
