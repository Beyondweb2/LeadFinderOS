/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WEBSITE A CUSTOMER TYPES — and the one thing it must never be allowed to mean.

   🔴 BLANK IS UNKNOWN, NEVER FALSE. `has_website` is a tri-state (§22): a site on the audit or the
   lead → true; no site but a place_id, so Google was asked → false; no place_id, so nobody looked →
   null, and the report says NOTHING about their website. Somebody skipping an OPTIONAL box is not
   evidence, and if blank collapsed into "no website" the report would offer to build a site to a
   business that already has one — on the one document they paid for.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWebsite, sameWebsite, looksLikeAggregator } from '../src/lib/websiteUrl';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('-- 🔴 blank is UNKNOWN, and so is every way of saying "I have not got one" --');
for (const v of ['', '   ', null, undefined, 'none', 'None', 'N/A', 'n/a', 'no', 'not yet', 'TBC', '-']) {
  ok(readWebsite(v).kind === 'blank', `${JSON.stringify(v)} -> blank`);
}
/* ⛔ THE ASSERTION THAT MATTERS. Nothing may turn a blank into a stored value of any kind — the
   server writes null and never touches the lead, so the tri-state keeps Google's evidence. */
ok(readWebsite('').kind !== 'invalid', 'blank is never an ERROR either — the field is optional');

console.log('\n-- a bare host is a real answer, not a mistake --');
/* People type "whitesparks.co.uk". A form that calls that wrong is wrong about who is mistaken. */
for (const [inp, want] of [
  ['whitesparks.co.uk', 'https://whitesparks.co.uk'],
  ['www.whitesparks.co.uk', 'https://www.whitesparks.co.uk'],
  ['https://whitesparks.co.uk/', 'https://whitesparks.co.uk'],
  ['HTTP://WhiteSparks.co.uk', 'http://whitesparks.co.uk'],
  ['whitesparks.co.uk/shop', 'https://whitesparks.co.uk/shop'],
] as const) {
  const r = readWebsite(inp);
  ok(r.kind === 'ok' && r.url === want, `"${inp}" -> ${want}${r.kind === 'ok' ? '' : ` (got ${r.kind})`}`);
}
/* ⚠️ THE PATH SURVIVES. A business really can live at /shop, and truncating it would point the
   scan at a homepage they do not control. */
ok((readWebsite('acme.co.uk/shop') as { url: string }).url.endsWith('/shop'), 'a path is kept, not trimmed');

console.log('\n-- what is refused, and refused by name --');
const why = (v: string) => { const r = readWebsite(v); return r.kind === 'invalid' ? r.reason : `NOT REFUSED (${r.kind})`; };
ok(/email/i.test(why('paul@move37.fun')), 'an email address is named as such, not called "invalid"');
ok(/space/i.test(why('acme co uk')), 'a space is named as such');
for (const bad of ['nothinghere', 'http://localhost', 'https://127.0.0.1', 'ftp://acme.co.uk', 'acme.']) {
  ok(readWebsite(bad).kind === 'invalid', `refused: ${JSON.stringify(bad)}`);
}

console.log('\n-- an aggregator is ACCEPTED, and only flagged --');
/* ⛔ NOT REFUSED. A Facebook page is a real answer to "where are you online", and refusing it pushes
   the customer into typing nothing — the one outcome that destroys information. The SEO scan
   already declines to scan these and the report already treats them as no own website. */
ok(readWebsite('facebook.com/whitesparks').kind === 'ok', 'a Facebook page is stored, not rejected');
ok(looksLikeAggregator('https://facebook.com/whitesparks'), 'and it is flagged as somebody else\'s platform');
ok(!looksLikeAggregator('https://whitesparks.co.uk'), 'a real site is not');

console.log('\n-- the same site in different clothes is NOT a disagreement --');
/* Mirrors the phone rule: digits only, so punctuation never triggers a pointless overwrite and a
   spurious note on the lead. */
ok(sameWebsite('whitesparks.co.uk', 'https://www.whitesparks.co.uk/'), 'scheme, www and trailing slash ignored');
ok(sameWebsite('HTTPS://WhiteSparks.co.uk', 'whitesparks.co.uk'), 'casing ignored');
ok(!sameWebsite('whitesparks.co.uk', 'whitesparksltd.co.uk'), 'a different host IS a disagreement');
ok(!sameWebsite('acme.co.uk/shop', 'acme.co.uk/other'), 'a different path IS a disagreement');
ok(!sameWebsite('', 'acme.co.uk'), 'blank never equals a real site — it must not suppress a write');
ok(!sameWebsite('', ''), 'and two blanks are not "the same site" either');

console.log('\n-- the server stores only what it judged ok --');
const fn = read('supabase/functions/findable-onboarding/index.ts');
ok(/business_website: \(\(\) => \{ const w = readWebsite/.test(fn), 'the insert runs the value through readWebsite');
ok(/w\.kind === "ok" \? w\.url : null/.test(fn), 'and stores null for anything else — never raw input');
/* 🔴 THE REGRESSION THAT WOULD COST THE MOST: clearing a real website because somebody skipped an
   optional box. The write-back must be gated on `ok`, never on "they submitted the form". */
ok(/const submittedSite = readWebsite\(a\.business_website as string\);\s*\n\s*if \(submittedSite\.kind === "ok"\) \{/.test(fn),
   'the lead write-back happens ONLY for a valid typed URL');
ok(!/update\(\{ website: null/.test(fn), 'nothing ever writes a null website onto the lead');
ok(/sameWebsite\(existing, submittedSite\.url\)/.test(fn), 'and an unchanged site writes nothing');
ok(/website replaced by the customer at signup; previous:/.test(fn), 'an overwrite keeps the old value in notes');

console.log('\n-- three lists or the field vanishes (the willing_to_migrate lesson) --');
for (const [label, re] of [
  ['the insert key list', /business_website: \(\(\)/],
  ['NEWER_COLS', /const NEWER_COLS = \[[^\]]*"business_website"/],
  ['the shed list', /const optional = \["business_website"/],
] as const) ok(re.test(fn), `business_website is in ${label}`);
/* It leads the shed list because the matcher is a substring regex: a shorter name tested first
   could shed the wrong column on one miss. */
ok(fn.indexOf('const optional = ["business_website"') > 0, 'and leads it, so no shorter name can match its error first');

console.log('\n-- prefill returns Google\'s values, and only Google\'s --');
ok(/phone_guess: String\(lead\.phone \?\? ""\)\.trim\(\)/.test(fn), 'phone_guess is returned');
ok(/website_guess: String\(lead\.website \?\? ""\)\.trim\(\)/.test(fn), 'website_guess is returned');
ok(/amount_paid, phone, website"\)/.test(fn), 'and both columns are actually SELECTED — an unselected column reads as undefined');
/* ⛔ THE LINE THAT MUST NOT MOVE. email/contact_name/notes come from enrichment and from the
   operator, not from a public Maps listing, and are present on 10.1% / 0.2% of leads — all of the
   risk, none of the value. */
/* ⚠️ COMMENTS STRIPPED FIRST. The block carries a note EXPLAINING that email, contact_name and
   notes stay out, so a raw substring test matches the explanation and fails on prose that is
   saying the right thing — the substring trap, inside the assertion written to prevent it. */
const prefillBlock = fn.slice(fn.indexOf('const offer = offerPrice();'), fn.indexOf('/* ── revise'))
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
ok(!/\bemail\b\s*:/.test(prefillBlock), 'prefill does NOT return the email');
ok(!/contact_name/.test(prefillBlock), 'prefill does NOT return the operator\'s contact name');
ok(!/\bnotes\b/.test(prefillBlock), 'prefill does NOT return notes');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
