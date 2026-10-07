/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   THE CUSTOMER'S EMAIL IN THE CLOSE FLOW (2026-10-07, fix/customer-email-close-flow). Pins:
     · the link is emailed to the CUSTOMER only — never Paul, the admin or the logged-in salesperson;
     · no customer email → the screen ASKS for one, inline; WhatsApp and Copy still work without it;
     · saving writes the lead's canonical email field (and the sign-up's confirmed contact), server-side, owner/admin only;
     · both close routes (Agreement & Payment, Full Setup) use the one recipient rule and the one send.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { cleanCloseEmail, closeRecipient, fullSetupEmail } from '../src/lib/closeEmail.ts';
import { canWorkLead, type Actor } from '../src/lib/roleRules.ts';
import { QA_EMAIL_SINK } from '../src/lib/qaSafety.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const PAUL = [QA_EMAIL_SINK, 'paul@findable.live', 'paul@move37.fun', 'pauljsales455@outlook.com'];

console.log('\n── THE RECIPIENT: the customer, or nobody ──');
ok(closeRecipient('Owner@Shop.co.uk', null) === 'owner@shop.co.uk', 'a sign-up contact email is used (trimmed, lower-cased)');
ok(closeRecipient(null, ' Owner@Shop.co.uk ') === 'owner@shop.co.uk', "the lead's own email is used when the sign-up has none");
ok(closeRecipient('row@shop.co.uk', 'lead@shop.co.uk') === 'row@shop.co.uk', "the sign-up's confirmed email wins over the lead's");
ok(closeRecipient(null, null) === null && closeRecipient('', '  ') === null && closeRecipient(undefined, undefined) === null, 'no customer email → null (the screen asks), never a substitute');
ok(closeRecipient('not an email', 'also bad') === null, 'unusable stored values are not a recipient');
ok(closeRecipient.length === 2, 'the rule takes ONLY the two stored customer fields — there is no argument for the actor, admin or operator address');
for (const a of PAUL) ok(closeRecipient(null, null) !== a, `${a} is never produced as a fallback`);

console.log('\n── VALIDATION: practical, not clever ──');
ok(cleanCloseEmail('  Name@Example.COM ').ok && (cleanCloseEmail('  Name@Example.COM ') as { email: string }).email === 'name@example.com', 'trimmed and lower-cased');
for (const bad of ['', '   ', 'plain', 'a@b', 'a@b.c', 'a b@c.com', '@c.com', 'a@@c.com', 'a@c..com', '.a@c.com', 'a.@c.com', 'a@.com', 'a@c.com.', 'a@-c.com', 'x'.repeat(260) + '@c.com']) ok(!cleanCloseEmail(bad).ok, `rejected: ${JSON.stringify(bad.slice(0, 30))}`);
for (const good of ['a@b.co', 'first.last+tag@sub.domain.co.uk', "o'neil@shop.uk"]) ok(cleanCloseEmail(good).ok, `accepted: ${good}`);

console.log('\n── PERMISSIONS: the same rule as every other lead action ──');
const salesA: Actor = { id: 'sa', role: 'sales' } as Actor;
const salesB: Actor = { id: 'sb', role: 'sales' } as Actor;
const admin: Actor = { id: 'ad', role: 'admin' } as Actor;
ok(canWorkLead(salesA, { assigned_to_user_id: 'sa' }), 'a salesperson can work their own lead');
ok(!canWorkLead(salesB, { assigned_to_user_id: 'sa' }), "a salesperson cannot work another rep's lead");
ok(canWorkLead(admin, { assigned_to_user_id: 'sa' }), 'the admin keeps normal permissions');

const fn = read('supabase/functions/quick-close/index.ts');
const save = fn.slice(fn.indexOf('if (mode === "save_email")'), fn.indexOf('if (mode === "share_setup")'));
ok(save.length > 200, 'quick-close has a save_email mode');
ok(/if \(!access\.ok\) return json\(\{ ok: false, error: "not_your_lead"/.test(save) && save.indexOf('access.ok') < save.indexOf('.update('), 'save_email refuses a lead the caller may not work BEFORE any write (server-side)');
ok(/isPaidLead\(lead\) \|\| row\?\.status === "paid"/.test(save) && /quickCloseClosedRefusal/.test(save), 'save_email refuses a paid client or an ended engagement');
ok(/cleanCloseEmail\(body\.email\)/.test(save) && /error: "bad_email"[\s\S]{0,60}400/.test(save), 'save_email validates with the one shared validator and rejects with 400');
ok(/from\("outreach_leads"\)\.update\(\{ email: ce\.email \}\)\.eq\("id", leadId\)/.test(save), "it writes the lead's canonical email column");
ok(/from\("onboarding_responses"\)\.update\(\{ contact_email: ce\.email \}\)/.test(save) && /row\?\.id/.test(save), "and the sign-up's existing contact email — no new field");
ok(!/close_email|closeEmail\s*[:=]/.test(save), 'no second "close email" field is created');
ok(/return json\(await view\(\)\)/.test(save), 'the fresh view comes straight back (the screen updates with no refresh)');
ok(/mode === "save_email"\)\) \{\s*const readiness/.test(fn), 'a salesperson not yet Ready to Sell cannot use it (same gate as every other close write)');

console.log('\n── SERVER: no fallback anywhere on the send path ──');
ok(/const shareEmailOf = \(r: Obj \| null\): string \| null => closeRecipient\(r\?\.contact_email, lead\.email\);/.test(fn), 'the screen and the send share ONE recipient function (closeRecipient)');
const send = fn.slice(fn.indexOf('const emailCustomerLink'), fn.indexOf('const view = async'));
ok(/const to = shareEmailOf\(row\);\s*if \(!to\) return \{ ok: false, response: json\(\{ ok: false, error: "no_email"/.test(send), 'no customer email → refused (409 no_email), nothing sent');
ok(!/actor\.(email|user)|ADMIN_EMAIL|FINDABLE_CONTACT_EMAIL\]|to: \[(?!to\])/.test(send) && /to: \[to\]/.test(send), 'the only recipient is `to` — no actor, admin or operator address in the send');
ok(!/body\.to\b/.test(fn), 'a `to` sent by the browser is not honoured anywhere');
ok(/reply_to: FINDABLE_CONTACT_EMAIL/.test(send), "Findable's address is the reply-to only, never the recipient");
ok(/checkSuppressed/.test(send) && /qaEmailHold\(service, leadId, to\)/.test(send), 'do-not-contact and the QA sink still run before the send');
const shareLink = fn.slice(fn.indexOf('if (mode === "share_link")'), fn.indexOf('if (mode === "share_link")') + 4500);
ok(/emailCustomerLink\(row\.id, async \(senderName\) => quickCloseEmail\(\{ greetName, businessName: lead\.business_name, url, route, senderName \}\)\)/.test(shareLink), 'Agreement & Payment: emailed through the one send, carrying the SAME agreement & payment link');
ok(/share\.to = sent\.to; share\.status = "sent"/.test(shareLink), 'the share record keeps who it went to, and only after Resend accepted it');
const setup = fn.slice(fn.indexOf('if (mode === "share_setup")'));
ok(/channel !== "copy" && channel !== "whatsapp" && channel !== "email"/.test(setup), 'Full Setup accepts an email channel');
ok(/if \(channel === "email"\) \{\s*const sent = await emailCustomerLink\(/.test(setup) && /fullSetupEmail\(/.test(setup) && /url, senderName/.test(setup), 'Full Setup: emailed through the SAME one send, carrying the Full Setup link (url = setupLinkUrl(leadId))');
ok(/const url = setupLinkUrl\(leadId\);/.test(setup) && !/stripe/i.test(fullSetupEmail({ greetName: 'A', businessName: 'B', url: 'https://findable.live/onboarding/?lead=x', senderName: 'S', greeting: 'Hi A' }).text), 'the Full Setup email carries no Stripe link');
ok(!/insert\(\{[^}]*onboarding/.test(setup) && !/quick_close_row/.test(setup), 'Full Setup email creates no sign-up record (the page resumes whatever exists — no duplicate)');
ok(/"payment_link_shared"/.test(setup) && /to: emailedTo/.test(setup), 'the Full Setup email is recorded in History, with the address');
const mail = fullSetupEmail({ greetName: 'Dan', businessName: 'Dan Plumbing', url: 'https://findable.live/onboarding/?lead=abc', senderName: 'Sam', greeting: 'Hi Dan' });
ok(mail.text.includes('https://findable.live/onboarding/?lead=abc') && mail.text.startsWith('Hi Dan') && mail.subject.includes('Dan Plumbing'), 'the Full Setup email body carries the link, the greeting and the business');

console.log('\n── SELLER ATTRIBUTION AND SIGN-UP RECORDS UNTOUCHED ──');
const emailBits = fn.slice(fn.indexOf('const emailCustomerLink'), fn.indexOf('const view = async')) + save;
ok(!/sold_by_user_id|seller|quick_close_row|generate_link|payment_date|amount_paid/.test(emailBits.replace(/isPaidLead\(lead\)/g, '')), 'neither the email send nor the email save touches the seller, the sign-up creation or any payment field');

console.log('\n── THE SCREEN ──');
const ctl = read('src/components/CustomerEmailControl.tsx');
const dlg = read('src/components/QuickCloseDialog.tsx');
const cp = read('src/components/ClosePanel.tsx');
ok(/asking = !email \|\| changing/.test(ctl) && /Customer email/.test(ctl) && /type="email"/.test(ctl) && /Save email/.test(ctl), 'no customer email → an inline "Customer email" input with a Save button appears');
ok(/Email goes to/.test(ctl) && /\{email\}/.test(ctl), 'with a customer email it says who the email goes to');
ok(/disabled=\{!email \|\| changing \|\| !!busy\}/.test(ctl), '"Email the link" is off until a customer email exists — and nothing else is blocked');
ok(/cleanCloseEmail\(draft\)/.test(ctl) && /setErr\(CLOSE_EMAIL_INVALID_TEXT\)/.test(ctl), 'an invalid address is rejected on the spot with a message');
ok(/await onSave\(c\.email\)/.test(ctl) && /setChanging\(false\)/.test(ctl), 'after a save the control flips to "Email goes to …" with no refresh');
ok(/mode: 'save_email', email/.test(dlg) && /mode: 'save_email', email/.test(cp), 'both close routes save through the same server mode');
ok(/qc\.setQueryData\(quickCloseKey\(leadId\), r\)/.test(dlg) && /qc\.setQueryData\(quickCloseKey\(leadId\), r\)/.test(cp), 'both routes put the server\'s fresh view straight into the cache (instant update; a reopen reads the saved value)');
ok(/<CustomerEmailControl testId="qc-customer-email"/.test(dlg) && /<CustomerEmailControl testId="setup-customer-email"/.test(cp), 'Agreement & Payment AND Full Setup both use the one control');
ok(!/No email address on file/.test(dlg) && !/No email address for them — add one under/.test(dlg), 'the old "add one under Correct a detail" dead end is gone');
ok(/data-testid="qc-send-whatsapp"/.test(dlg) && /doCopy\('message'/.test(dlg) && /doCopy\('link'/.test(dlg), 'WhatsApp, Copy link and Copy message do not depend on an email');
ok(/data-testid="setup-send-whatsapp"/.test(cp) && /data-testid="setup-copy-link"/.test(cp), 'Full Setup: WhatsApp and Copy link do not depend on an email');
ok(!/useAuth|user\??\.email|session\??\.user/.test(ctl + dlg.slice(dlg.indexOf('saveEmail')) + cp), 'no screen reads the logged-in user\'s email');
ok(/inputMode="email"/.test(ctl) && /w-full/.test(ctl) && /flex-1/.test(ctl), 'compact, full-width on a phone');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
process.exit(f ? 1 : 0);
