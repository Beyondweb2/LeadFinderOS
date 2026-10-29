/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WELCOME PACK EMAIL (Paul, 2026-10-29) — src/lib/welcomePackEmail.ts and paid-client-hub welcome_pack_send.
   Sending stays manual; a test goes to Paul only and is never recorded; the email gives the pack's own Google steps.
   Run: npx tsx scripts/welcome-pack-send.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { sendableEmail, welcomePackEmail, WELCOME_PACK_FROM, WELCOME_PACK_REPLY_TO, WELCOME_PACK_TEST_TO } from '../src/lib/welcomePackEmail.ts';
import { GBP_PACK_STEPS } from '../src/lib/welcomePackHtml.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const url = 'https://findable.live/w/abc123';
const m = welcomePackEmail({ businessName: 'Leeds Boilers', contactName: 'Sam Jones', url });
ok(m.subject === 'Welcome to Findable: your welcome pack for Leeds Boilers', 'subject names the business');
ok(m.text.startsWith('Hello Sam,') && m.text.includes(url), 'greets by first name and carries the link');
ok(GBP_PACK_STEPS.every((s) => m.text.includes(s)), 'the Google steps are the pack\'s own, word for word');
ok(/You stay the owner, you never share a password with us, and you can remove our access at any time/.test(m.text), 'owner / no password / removable');
ok(!/move37|outlook\.com/i.test(m.text) && m.text.includes('paul@findable.live'), 'only paul@findable.live is named');
ok(welcomePackEmail({ businessName: 'X', url, test: true }).subject.startsWith('[TEST] '), 'a test is tagged [TEST]');
ok(welcomePackEmail({ businessName: 'X', url }).text.startsWith('Hello,'), 'no name → plain "Hello,"');
ok(WELCOME_PACK_TEST_TO === 'paul@findable.live' && WELCOME_PACK_REPLY_TO === 'paul@findable.live' && WELCOME_PACK_FROM === 'Findable <alerts@findable.live>', 'test address, reply-to and sender');
ok(sendableEmail(' A@B.co ') === 'a@b.co' && sendableEmail('nope') === null && sendableEmail('') === null, 'address shape check');

const hub = read('supabase/functions/paid-client-hub/index.ts');
const block = hub.slice(hub.indexOf('if (action === "welcome_pack_status" || action === "welcome_pack_send")'), hub.indexOf('SECTION 5 — EVERYTHING'));
ok(block.length > 0, 'the send action exists in paid-client-hub');
ok(/const to = isTest \? WELCOME_PACK_TEST_TO :/.test(block), 'a test send goes to the constant, never the request body');
ok(/if \(isTest\) return json\(/.test(block) && block.indexOf('if (isTest) return json(') < block.indexOf('from("welcome_pack_sends").insert'), 'a test send returns BEFORE anything is recorded');
ok(/prior && body\.resend !== true/.test(block), 'a second real send needs Resend');
ok(/qaEmailHold\(/.test(block) && /carriesMoney\(L\)/.test(block) && /if \(closed && !isTest\)/.test(block), 'QA sink, paid, and ended/refunded guards (a test to Paul is allowed on a closed client; a real send is not)');
ok(/\.eq\("user_id", user\.id\)/.test(block), 'owner-scoped like every hub action');
ok(!/setInterval|cron|setTimeout/.test(block), 'nothing in the send path runs on its own');
const mig = read('supabase/migrations/20261130110000_welcome_pack_sends.sql');
ok(/enable row level security/.test(mig) && !/create policy/i.test(mig), 'the send log is server-only (RLS on, no policies)');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
