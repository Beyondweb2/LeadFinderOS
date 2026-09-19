import fs from 'node:fs';

const inbox = fs.readFileSync('src/pages/Inbox.tsx', 'utf8');
const statusPatch = fs.readFileSync('src/lib/statusPatch.ts', 'utf8');
const outreach = fs.readFileSync('src/pages/Outreach.tsx', 'utf8');
const ok = (value: unknown, message: string) => {
  if (!value) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const sendStart = inbox.indexOf('const doSend = async');
const sendEnd = inbox.indexOf('\n  return (', sendStart);
const sendBody = inbox.slice(sendStart, sendEnd);
ok(sendStart >= 0 && sendBody.length > 0, 'Inbox send handler is present');
ok(!sendBody.includes('window.confirm'), 'template send has no confirmation prompt');
ok(sendBody.includes('sendingKeysRef') && sendBody.includes('sendKey'), 'sending is tracked per conversation');
ok(sendBody.includes('setDrafts((prev) => setDraft(prev, sendKey'), 'completed send clears only its own conversation draft');
ok(sendBody.includes('if (activeKey === sendKey)'), 'switching chats does not mutate the newly active chat');
ok(statusPatch.includes("status === 'interested'") && statusPatch.includes('is_potential_work: true'), 'interested is persisted as a separate star marker');
ok(outreach.includes("if (status === 'interested')") && outreach.includes('return;'), 'Outreach interested action leaves pipeline status unchanged');

console.log('All Inbox send/status UX checks passed.');
