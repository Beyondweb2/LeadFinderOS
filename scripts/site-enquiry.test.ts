/* SITE ENQUIRY (_shared/site-enquiry.ts) — the rules behind a client website's enquiry form.
   A. who gets it: only the production origin delivers; preview / localhost are test mode; others refused
   B. the recipient is never from the request
   C. validation, honeypot, fill time
   D. the email
   E. the function wiring (config.toml entry, stores before it sends) */

import { readFileSync } from 'node:fs';
import { CLIENT_SITES, TEST_RECIPIENT, MIN_FILL_MS, corsHeaders, enquiryEmail, originMode, validateEnquiry } from '../supabase/functions/_shared/site-enquiry.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const bs4 = CLIENT_SITES.bs4;
const NOW = 1_800_000_000_000;
const good = { name: 'Jo Bloggs', phone: '07700 900123', email: 'jo@example.com', service: 'EICRs', location: 'BS3', message: 'Landlord EICR please', started_at: String(NOW - 60_000) };

/* A */
ok(originMode(bs4, 'https://www.bs4electricalservices.co.uk') === 'production' && originMode(bs4, 'https://bs4electricalservices.co.uk/') === 'production', 'A: the live domain (with or without www) delivers');
ok(originMode(bs4, 'https://preview.bs4-electrical-services.pages.dev') === 'test' && originMode(bs4, 'https://abc123.bs4-electrical-services.pages.dev') === 'test', 'A: the preview and branch previews are TEST mode');
ok(originMode(bs4, 'http://localhost:4321') === 'test' && originMode(bs4, 'http://127.0.0.1:4321') === 'test', 'A: local dev is TEST mode');
ok(originMode(bs4, 'https://evil.example') === 'refused' && originMode(bs4, null) === 'refused' && originMode(bs4, 'https://bs4-electrical-services.pages.dev.evil.example') === 'refused', 'A: any other origin — or none — is refused');
ok(originMode(bs4, 'http://bs4electricalservices.co.uk') === 'refused', 'A: plain http is not the production origin');
ok(Object.keys(corsHeaders('https://evil.example', 'refused')).length === 0 && corsHeaders('http://localhost:4321', 'test')['Access-Control-Allow-Origin'] === 'http://localhost:4321', 'A: CORS only for an allowed origin');

/* B */
const v = validateEnquiry({ ...good, to: 'attacker@example.com', recipient: 'x@y.z' }, NOW);
ok(v.ok, 'B: extra fields are ignored, not refused');
if (v.ok) {
  const prod = enquiryEmail(bs4, v.fields, 'production', 'https://www.bs4electricalservices.co.uk');
  const test = enquiryEmail(bs4, v.fields, 'test', 'https://preview.bs4-electrical-services.pages.dev');
  ok(prod.to.length === 1 && prod.to[0] === 'info@bs4electricalservices.co.uk', 'B: production goes to the business, from the site list');
  ok(test.to.length === 1 && test.to[0] === TEST_RECIPIENT && /^\[TEST\]/.test(test.subject), 'B: test mode goes to the Resend test inbox, subject marked [TEST]');
  ok(!JSON.stringify(prod).includes('attacker@example.com'), 'B: a recipient in the request never reaches the email');
  ok(prod.reply_to === 'jo@example.com', 'B: reply-to is the visitor, so the business can answer directly');
  ok(/Property location: BS3/.test(prod.text) && /Landlord EICR please/.test(prod.text) && /Service: EICRs/.test(prod.text), 'D: the email carries every field, labelled');
}

/* C */
ok(!validateEnquiry({ ...good, company_website: 'http://spam' }, NOW).ok && (validateEnquiry({ ...good, company_website: 'x' }, NOW) as { reason: string }).reason === 'honeypot', 'C: a filled honeypot is dropped');
ok((validateEnquiry({ ...good, started_at: String(NOW - MIN_FILL_MS + 500) }, NOW) as { reason: string }).reason === 'too_fast', 'C: a form filled faster than a human is dropped');
const bad = validateEnquiry({ name: '', phone: 'call me', email: 'nope', location: '', message: '' }, NOW);
ok(!bad.ok && (bad as { problems: string[] }).problems.join() === 'name,phone,email,location,message', 'C: missing / malformed fields are named');
const noContact = validateEnquiry({ ...good, phone: '', email: '' }, NOW);
ok(!noContact.ok && (noContact as { problems: string[] }).problems.includes('phone or email'), 'C: a phone OR an email is required');
const inj = validateEnquiry({ ...good, name: 'Jo\r\nBcc: x@y.z', phone: '', email: 'jo@example.com' }, NOW);
ok(inj.ok && !/[\r\n]/.test(inj.fields.name), 'C: header-style line breaks are flattened out of single-line fields');
ok(validateEnquiry({ ...good, started_at: '' }, NOW).ok, 'C: no start time (JavaScript off) is not treated as a bot');

/* E */
const cfg = readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n');
ok(/\[functions\.site-enquiry\]\nverify_jwt = false/.test(cfg), 'E: config.toml has the explicit verify_jwt entry');
const fn = readFileSync('supabase/functions/site-enquiry/index.ts', 'utf8');
ok(fn.indexOf('.insert(') > 0 && fn.indexOf('.insert(') < fn.indexOf('api.resend.com'), 'E: the enquiry is stored before the email is sent');
ok(!/data\.(to|recipient)/.test(fn), 'E: the function never reads a recipient from the request');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures) process.exit(1);
