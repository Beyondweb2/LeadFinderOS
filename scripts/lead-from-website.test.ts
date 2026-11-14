/* ============================================================
   FILL A LEAD FROM ITS WEBSITE (2026-11-14, v1/add-lead-from-website) — src/lib/leadFromWebsite.ts.
   Pins (behaviour ported from V2's add-by-website):
     · the name: structured data → footer legal name → og:site_name → title; a service heading never wins;
     · londondomesticmaintenance.com's real markup → "London Domestic Maintenance Ltd", trade "domestic maintenance";
     · the trade is the business as a whole (schema type → name minus place → the model's, only if stated);
     · only stated facts survive the model (phone digits, email, address parts, services, areas, town);
     · a blocked reader (403 / 429 / challenge page) is detected; addresses are refused that are not public http(s);
     · the form fills blanks only; the form keeps the up-front fields to the six asked for;
     · the edge function: team role, cost guard, homepage always read, a blocked read never calls the model.
   Run: npx tsx scripts/lead-from-website.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  pickBusinessName, footerLegalName, cleanTitle, ldBusinesses, tradeFromSchema, tradeFromName, keepStatedFacts, readMarkup,
  combineFacts, isBlockedResponse, websiteToRead, isSocialOrDirectory, telLinks, emailsOn, pickEmail, fillBlanks, htmlToText,
  pagesWorthReading, looksLikeServiceHeading, tradeStated, isMapsLink, countryFromPhone,
} from '../src/lib/leadFromWebsite.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label}`); }
}
const eq = (a: unknown, b: unknown, label: string) => {
  const same = JSON.stringify(a) === JSON.stringify(b);
  ok(same, `${label}${same ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);
};
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

console.log('── the name ──');
/* londondomesticmaintenance.com as read 2026-11-14 (trimmed): no JSON-LD, title + footer. */
const LDM = `<html><head><title>London Domestic Maintenance Ltd | Professional Property Services Across London</title>
<meta name="description" content="London Domestic Maintenance Ltd | Professional Property Services Across London"></head>
<body><nav><a href="/">Home</a><a href="#services">Services</a><a href="contact.html">Contact</a></nav>
<img src="full-logo.png" alt="London Domestic Maintenance Ltd">
<p>London Domestic Maintenance Ltd provides dependable domestic maintenance services across London.</p>
<a href="tel:07700900123">07700 900123</a> <a href="mailto:info@londondomesticmaintenance.com">Email us</a>
<footer><p>&copy; 2026 London Domestic Maintenance Ltd. All rights reserved.</p></footer></body></html>`;
eq(pickBusinessName(LDM), { name: 'London Domestic Maintenance Ltd', source: 'footer_legal_name' }, 'LDM: the footer legal name');
const ldmMarkup = readMarkup(LDM, [], 'londondomesticmaintenance.com');
eq(ldmMarkup.phone, '07700900123', 'LDM: tel: link');
eq(ldmMarkup.email, 'info@londondomesticmaintenance.com', 'LDM: mailto');
const ldmText = htmlToText(LDM);
const ldmModel = keepStatedFacts({ trade: 'domestic maintenance', town: 'London', services: ['domestic maintenance services', 'roof repairs'], areas: ['London', 'Surrey'] }, ldmText);
const ldm = combineFacts(LDM, ldmMarkup, ldmModel);
eq(ldm.trade, 'domestic maintenance', 'LDM: trade is the business as a whole');
eq(ldm.town, 'London', 'LDM: town stated');
eq(ldm.services, ['domestic maintenance services'], 'LDM: an unstated service is dropped');
eq(ldm.areas, ['London'], 'LDM: an unstated area is dropped');
eq(tradeFromName('London Domestic Maintenance Ltd', ['London']), 'domestic maintenance', 'trade from the name minus its place');

eq(pickBusinessName(ld({ '@type': 'Plumber', name: 'Bright Sparks Plumbing', legalName: 'Bright Sparks Limited', telephone: '0113 496 0000' }) + '<title>Plumbers Leeds</title>').name, 'Bright Sparks Limited', 'structured data: legalName first');
eq(pickBusinessName(ld({ '@type': 'LocalBusiness', name: 'Acme Roofing' }) + '<footer>© 2024 Other Name Ltd</footer>').name, 'Acme Roofing', 'structured data beats the footer');
eq(pickBusinessName(ld({ '@graph': [{ '@type': 'WebSite', name: 'Site' }, { '@type': 'Organization', name: 'Graph Co' }] })).name, 'Graph Co', '@graph is read; WebSite skipped');
eq(pickBusinessName(ld({ '@type': 'Service', name: 'Boiler Repairs' }) + '<footer>© 2025 Kestrel Property Care Ltd</footer>').name, 'Kestrel Property Care Ltd', 'a Service node never names the business');
eq(pickBusinessName(ld({ '@type': 'LocalBusiness', name: 'Boiler Repairs Leeds' }) + '<footer>© Kestrel Property Care Ltd</footer>').name, 'Kestrel Property Care Ltd', 'a LocalBusiness named like a service heading falls back to the footer');
eq(pickBusinessName('<script type="application/ld+json">{bad json</script><meta property="og:site_name" content="Acme Roofing"><title>Home | Something</title>').name, 'Acme Roofing', 'broken JSON-LD ignored; og:site_name');
eq(pickBusinessName('<meta property="og:site_name" content="Bloom"><footer>© Bloom Studio Ltd</footer>').name, 'Bloom Studio Ltd', 'the footer legal name beats og:site_name');
eq(pickBusinessName('<title>Home - Moments Photography</title>'), { name: 'Moments Photography', source: 'title' }, 'title last, "Home" dropped');
eq(pickBusinessName('<title>EICR Certificate Camden Town</title>'), {}, 'a service-heading title is not a name');
eq(footerLegalName('Copyright © 2019 – 2024 Acme Plumbing Limited. Registered in England'), 'Acme Plumbing Limited', 'year range + Limited');
eq(footerLegalName('Leeds Property Care Ltd, Company No 01234567'), 'Leeds Property Care Ltd', 'company-number line');
eq(footerLegalName('We are a friendly team. All rights reserved.'), undefined, 'no legal name, nothing invented');
eq(cleanTitle('Welcome to Acme Plumbing | Leeds'), 'Acme Plumbing', 'title cleaned');
ok(looksLikeServiceHeading('Emergency Plumber in Leeds') && !looksLikeServiceHeading('Acme Plumbing'), 'service-heading test');

console.log('── the trade ──');
eq(tradeFromSchema(ld({ '@type': 'RoofingContractor', name: 'X' })), 'roofing contractor', 'schema type in words');
eq(tradeFromSchema(ld({ '@type': 'LocalBusiness', name: 'X' })), undefined, 'a generic type says nothing');
eq(tradeFromName('Acme Roofing Ltd', ['Leeds']), undefined, 'no place removed → nothing');
eq(tradeFromName('Moments', ['Leeds']), undefined, 'one-word brand → nothing');
eq(tradeFromName('Bow Plumbing & Heating Ltd', ['Bow']), 'plumbing & heating', 'Bow Plumbing & Heating Ltd');
ok(tradeStated('We are electricians in Leeds', 'electrician'), 'plural on the page counts');
ok(!tradeStated('We fix roofs', 'electrician'), 'a trade not on the page is dropped');
const lpc = `${ld({ '@type': 'LocalBusiness', name: 'Leeds Property Care Ltd' })}<p>Leeds Property Care Ltd. Property care across Leeds.</p>`;
eq(combineFacts(lpc, readMarkup(lpc, [], 'lpc.co.uk'), keepStatedFacts({ trade: 'electrician', town: 'Leeds' }, htmlToText(lpc))).trade, 'property care', "the model's unstated trade is ignored");

console.log('── only stated facts ──');
const page = 'Call 0113 496 0000 or email hello@acme.co.uk. Find us: 4 Mill Lane, Leeds, LS6 2AB. We cover Leeds, Otley and Ilkley.';
const k = keepStatedFacts({ phone: '0113 496 0000', email: 'hello@acme.co.uk', address: '4 Mill Lane, Leeds, LS6 2AB', town: 'Leeds', areas: ['Leeds', 'Otley', 'Harrogate', 'surrounding areas'] }, page);
eq(k.phone, '0113 496 0000', 'stated phone kept');
eq(k.address, '4 Mill Lane, Leeds, LS6 2AB', 'stated address kept');
eq(k.areas, ['Leeds', 'Otley'], 'unstated / vague areas dropped');
eq(keepStatedFacts({ phone: '0113 496 9999', email: 'sales@acme.co.uk', address: '9 High Street, Leeds', town: 'York' }, page), {}, 'invented phone / email / address / town all dropped');
eq(keepStatedFacts({ trade: 42, services: 'not a list' }, page), {}, 'malformed model output → blanks');

console.log('── markup reads ──');
eq(telLinks('<a href="tel:+44%20113%20496%200000">x</a><a href="tel:123">y</a>'), ['+44 113 496 0000'], 'tel decoded; too short skipped');
eq(emailsOn('<a href="mailto:noreply@acme.co.uk">a</a><a href="mailto:Info@Acme.co.uk?subject=hi">b</a>'), ['info@acme.co.uk'], 'noreply skipped, ?subject cut, lowercased');
eq(pickEmail(['acme@gmail.com', 'info@acme.co.uk'], 'www.acme.co.uk'), 'info@acme.co.uk', 'own-domain email first');
eq(ldBusinesses(ld({ '@type': 'Plumber', name: 'P', address: { streetAddress: '4 Mill Lane', addressLocality: 'Leeds', postalCode: 'LS6 2AB' } }))[0]?.town, 'Leeds', 'schema town');
const base = new URL('https://acme.co.uk/');
eq(pagesWorthReading('<a href="/about">About</a><a href="/contact-us">Contact</a><a href="https://other.com/contact">x</a><a href="/brochure.pdf">contact pdf</a><a href="mailto:a@b.c">contact</a>', base), ['https://acme.co.uk/contact-us', 'https://acme.co.uk/about'], 'contact first, same site, no files');

console.log('── blocked / addresses ──');
ok(isBlockedResponse(403, ''), '403 is blocked');
ok(isBlockedResponse(429, ''), '429 is blocked');
ok(isBlockedResponse(200, '<title>Just a moment...</title>'), 'Cloudflare challenge is blocked');
ok(isBlockedResponse(202, '<script src="/.well-known/sgcaptcha/?r=1"></script>'), 'SiteGround captcha is blocked');
ok(!isBlockedResponse(200, LDM), 'a real page is not blocked');
eq(websiteToRead('londondomesticmaintenance.com')?.href, 'https://londondomesticmaintenance.com/', 'https added');
for (const bad of ['localhost:3000', 'ftp://acme.co.uk', 'https://user:pw@acme.co.uk', 'javascript:alert(1)', 'not a url', 'router.local'])
  eq(websiteToRead(bad), null, `refused: ${bad}`);
ok(isSocialOrDirectory(new URL('https://www.facebook.com/acme')) && !isSocialOrDirectory(new URL('https://acme.co.uk')), 'social pages are not own websites');

console.log('── the form ──');
const form = { businessName: '', trade: 'plumber', town: '', phone: '', email: '', address: '', services: '', areas: '', website: 'x' };
const f = fillBlanks(form, { name: 'Acme Ltd', trade: 'heating', town: 'Leeds', services: ['a', 'b'] });
eq(f.next.trade, 'plumber', 'a typed value is never overwritten');
eq(f.filled, ['businessName', 'town', 'services'], 'only blanks filled');
eq(f.next.services, 'a, b', 'services comma-joined');
ok(isMapsLink('https://maps.app.goo.gl/abc') && isMapsLink('https://www.google.com/maps/place/x') && !isMapsLink('07700 900123'), 'a Maps link in the phone box is told apart');
eq(countryFromPhone('+353 85 123 4567'), 'Ireland', '+353 → Ireland');
eq(countryFromPhone('0061 412 345 678'), 'Australia', '0061 → Australia');
eq(countryFromPhone('07700 900123'), null, 'no country code says nothing');

const dlg = readFileSync('src/components/AddLeadDialog.tsx', 'utf8');
const upFront = dlg.slice(0, dlg.indexOf('data-testid="add-lead-more"'));
for (const lbl of ['Website', 'Business name', 'Trade', 'Town', 'Phone', 'Where did you find them'])
  ok(upFront.includes(`>${lbl}`), `"${lbl}" is up front`);
for (const lbl of ['Email', 'Contact name', 'Address', 'Main services', 'Service areas', 'Campaign', 'First note'])
  ok(!upFront.includes(`>${lbl}`), `"${lbl}" is under More details`);
ok(/Fill from website/.test(dlg) && /invokeEdge[\s\S]{0,40}'lead-from-website'/.test(dlg), 'the form calls lead-from-website through invokeEdge');
ok(/fillBlanks\(/.test(dlg), 'the form fills blanks only');
ok(/BLOCKED_LINE/.test(dlg) && /'crawl-check'/.test(dlg), 'a blocked site is said on the form and recorded on the lead by its website check');

console.log('── the edge function ──');
const fn = readFileSync('supabase/functions/lead-from-website/index.ts', 'utf8');
ok(/userTeamRole\(/.test(fn), 'requires a team role');
ok(/guardAction\(guardService, userId, "enrich"/.test(fn), 'asks the cost guard');
ok(/new URL\("\/", /.test(fn), 'always reads the homepage');
ok(fn.indexOf('isBlockedResponse(') > 0 && fn.indexOf('isBlockedResponse(') < fn.indexOf('api.openai.com'), 'a blocked read stops before the model');
ok(/isPrivateHostname\(/.test(fn) && /redirect: "manual"/.test(fn), 'SSRF guard on every hop');
ok(/SITE_CHECK_HEADERS/.test(fn), 'reads as the one site-check identity');
ok(/\[functions\.lead-from-website\]\s*\nverify_jwt = false/.test(readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n')), 'config.toml entry');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall ok');
