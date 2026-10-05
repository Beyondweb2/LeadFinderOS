/* SITE ENQUIRY (_shared/site-enquiry.ts) — the rules behind a client website's enquiry form.
   A. who gets it: only the production origin delivers; preview / localhost are test mode; others refused
   B. the recipient is never from the request
   C. validation, honeypot, fill time
   D. the email
   E. the function wiring (config.toml entry, stores before it sends)
   F. the REGISTRY (fix workstream 6, D-12): a client's form is configured from its own Website Build
      record — no code edit, no deploy — and only a Build client Paul switched on is ever served */

import { readFileSync } from 'node:fs';
import { LEGACY_CLIENT_SITES, TEST_RECIPIENT, MIN_FILL_MS, corsHeaders, enquiryEmail, originMode, resolveClientSite, validateEnquiry } from '../supabase/functions/_shared/site-enquiry.ts';
import { readSiteForm, siteFormProblems } from '../src/lib/siteForm.ts';
import { websiteServiceRoute } from '../src/lib/websiteRoute.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const bs4 = LEGACY_CLIENT_SITES.bs4;
const NOW = 1_800_000_000_000;
const good = { name: 'Jo Bloggs', phone: '07700 900123', email: 'jo@example.com', service: 'EICRs', location: 'BS3', message: 'Landlord EICR please', fill_ms: '45000' };

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
ok((validateEnquiry({ ...good, fill_ms: String(MIN_FILL_MS - 500) }, NOW) as { reason: string }).reason === 'too_fast', 'C: a form filled faster than a human is dropped');
ok(validateEnquiry({ ...good, fill_ms: '20000', started_at: String(NOW + 60_000) }, NOW).ok, 'C: a visitor whose clock runs ahead is NOT dropped (a duration, never a timestamp compared across clocks)');
const bad = validateEnquiry({ name: '', phone: 'call me', email: 'nope', location: '', message: '' }, NOW);
ok(!bad.ok && (bad as { problems: string[] }).problems.join() === 'name,phone,email,location,message', 'C: missing / malformed fields are named');
const noContact = validateEnquiry({ ...good, phone: '', email: '' }, NOW);
ok(!noContact.ok && (noContact as { problems: string[] }).problems.includes('phone or email'), 'C: a phone OR an email is required');
const inj = validateEnquiry({ ...good, name: 'Jo\r\nBcc: x@y.z', phone: '', email: 'jo@example.com' }, NOW);
ok(inj.ok && !/[\r\n]/.test(inj.fields.name), 'C: header-style line breaks are flattened out of single-line fields');
ok(validateEnquiry({ ...good, fill_ms: '' }, NOW).ok && validateEnquiry({ name: 'Jo', phone: '07700 900123', location: 'BS3', message: 'x' }, NOW).ok, 'C: no fill time (JavaScript off) is not treated as a bot');

/* E */
const cfg = readFileSync('supabase/config.toml', 'utf8').replace(/\r\n/g, '\n');
ok(/\[functions\.site-enquiry\]\nverify_jwt = false/.test(cfg), 'E: config.toml has the explicit verify_jwt entry');
const fn = readFileSync('supabase/functions/site-enquiry/index.ts', 'utf8');
ok(fn.indexOf('.insert(') > 0 && fn.indexOf('.insert(') < fn.indexOf('api.resend.com'), 'E: the enquiry is stored before the email is sent');
ok(!/data\.(to|recipient)/.test(fn), 'E: the function never reads a recipient from the request');

/* F */
{
  /* A brand-new fixture client: Website Build record with the form switched on. NOTHING in code names it. */
  const record = (over: Record<string, unknown> = {}, formOver: Record<string, unknown> = {}) => ({
    business_name: 'Pengwern Lock & Key', service_terminated_at: null,
    website_build: { canonical_domain: 'pengwernlocks.example', cloudflare_project: 'pengwern-lock-key', form: { enabled: true, site_key: 'pengwern', recipient: 'gareth@pengwernlocks.example', thanks_path: '', enabled_at: '2026-10-04T00:00:00Z', ...formOver }, ...over },
  });
  const build = { row: record(), route: 'build' as const };
  const r = resolveClientSite('pengwern', [build]);
  ok(r.site !== null && 'source' in r && r.source === 'registry', 'F: a NEW client’s form resolves from its own Website Build record — no code edit, no deploy');
  if (r.site) {
    ok(originMode(r.site, 'https://pengwernlocks.example') === 'production' && originMode(r.site, 'https://www.pengwernlocks.example') === 'production', 'F: its live domain (apex and www) delivers to the business');
    ok(originMode(r.site, 'https://preview.pengwern-lock-key.pages.dev') === 'test' && originMode(r.site, 'https://abc.pengwern-lock-key.pages.dev') === 'test' && originMode(r.site, 'http://localhost:4321') === 'test', 'F: its own preview (every branch alias) and localhost are TEST mode');
    ok(originMode(r.site, 'https://preview.bs4-electrical-services.pages.dev') === 'refused' && originMode(r.site, 'https://evil.example') === 'refused' && originMode(r.site, 'http://pengwernlocks.example') === 'refused', 'F: another client’s preview, a stranger, or plain http are refused');
    const v2 = validateEnquiry({ ...good, to: 'attacker@example.com' }, NOW);
    if (v2.ok) { const e = enquiryEmail(r.site, v2.fields, 'production', 'https://pengwernlocks.example'); ok(e.to.join() === 'gareth@pengwernlocks.example' && !JSON.stringify(e).includes('attacker@'), 'F: the recipient is the record’s verified email — never one from the request'); }
    ok(r.site.thanksPath === '/contact/?sent=1#enquiry', 'F: a blank thank-you address uses the default');
  }
  const refused = (rs: ReturnType<typeof resolveClientSite>) => rs.site === null ? ('reason' in rs ? rs.reason : '') : '';
  ok(refused(resolveClientSite('nobody', [])) === 'unknown_site', 'F: an unknown key is refused');
  ok(refused(resolveClientSite('../etc', [])) === 'unknown_site' && refused(resolveClientSite('', [build])) === 'unknown_site', 'F: a malformed key is refused before any lookup');
  ok(refused(resolveClientSite('pengwern', [{ row: record({}, { enabled: false }), route: 'build' }])) === 'form_not_enabled', 'F: a form Paul has not switched on is refused');
  ok(refused(resolveClientSite('pengwern', [{ row: record(), route: 'optimise' }])).startsWith('not_servable') && /Optimise/.test(refused(resolveClientSite('pengwern', [{ row: record(), route: 'optimise' }]))), 'F: an OPTIMISE client is never served (their site is their own)');
  ok(refused(resolveClientSite('pengwern', [{ row: record(), route: null }])).startsWith('not_servable'), 'F: an unrecorded route is refused (absent is never "build")');
  ok(refused(resolveClientSite('pengwern', [{ row: { ...record(), service_terminated_at: '2026-10-01T00:00:00Z' }, route: 'build' }])).startsWith('not_servable'), 'F: an ended engagement is refused');
  ok(refused(resolveClientSite('pengwern', [{ row: record({ canonical_domain: '' }), route: 'build' }])).startsWith('not_servable'), 'F: no canonical domain → refused (nothing could ever deliver)');
  ok(refused(resolveClientSite('pengwern', [build, { row: record(), route: 'build' }])) === 'ambiguous_site_key', 'F: two records claiming one key → refused, never a guess which inbox');
  ok(refused(resolveClientSite('pengwern', [{ row: record({}, { site_key: 'other' }), route: 'build' }])) === 'key_mismatch', 'F: a record whose stored key differs is refused');
  ok(refused(resolveClientSite('pengwern', [{ row: record({}, { recipient: 'not-an-email' }), route: 'build' }])) === 'form_not_enabled' || refused(resolveClientSite('pengwern', [{ row: record({}, { recipient: 'not-an-email' }), route: 'build' }])).startsWith('not_servable'), 'F: a stored recipient that is not an email is never served');
  /* BS4: carried over until its record has the form switched on; then the record wins. */
  const legacy = resolveClientSite('bs4', []);
  ok(legacy.site !== null && 'source' in legacy && legacy.source === 'legacy' && legacy.site.to === 'info@bs4electricalservices.co.uk', 'F: BS4 keeps working from the transitional entry while no record claims "bs4"');
  const claimed = resolveClientSite('bs4', [{ row: record({ canonical_domain: 'bs4electricalservices.co.uk', cloudflare_project: 'bs4-electrical-services' }, { site_key: 'bs4', recipient: 'info@bs4electricalservices.co.uk' }), route: 'build' }]);
  ok(claimed.site !== null && 'source' in claimed && claimed.source === 'registry', 'F: once a record claims "bs4", the record wins');
  ok(refused(resolveClientSite('bs4', [{ row: record({}, { site_key: 'bs4', enabled: false }), route: 'build' }])) === 'form_not_enabled', 'F: a record that claims "bs4" but is switched off is refused — never the legacy fallback');
  /* The switch-on rule the screen and the save both use. */
  const form = readSiteForm({ enabled: true, site_key: 'pengwern', recipient: 'gareth@pengwernlocks.example' });
  ok(siteFormProblems({ form, canonicalDomain: 'pengwernlocks.example', cloudflareProject: 'pengwern-lock-key', verifiedEmails: ['gareth@pengwernlocks.example'], clientRoute: 'build', ended: false }).length === 0, 'F: a Build client with a verified email, domain and project can switch the form on');
  ok(siteFormProblems({ form, canonicalDomain: 'pengwernlocks.example', cloudflareProject: 'pengwern-lock-key', verifiedEmails: ['other@x.co.uk'], clientRoute: 'build', ended: false }).some((p) => /verified in the fact ledger/.test(p)), 'F: …but only to the VERIFIED business email (no arbitrary relay)');
  ok(readSiteForm({ site_key: 'Bad Key!', recipient: 'x' }).site_key === '' && readSiteForm({ thanks_path: '//evil.example' }).thanks_path === '', 'F: a malformed key or an off-site thank-you address is dropped by the save rule');
  /* BS4's route: only the older website_route marks it Build — the resolver must accept that. */
  ok(websiteServiceRoute({ website_route: 'rebuild_existing' }, {}).route === 'build' && websiteServiceRoute({ plan_tier: 'keep', website_addon: false }, {}).route === 'optimise', 'F: the route resolver reads the plan and the older website route (BS4)');
  ok(websiteServiceRoute({ plan_tier: 'keep', website_addon: false }, { contract_total_payments: 12 }).route === null, 'F: two records that disagree → no route (never a guess)');
  /* The wiring. */
  const fnF = readFileSync('supabase/functions/site-enquiry/index.ts', 'utf8');
  ok(/website_build->form->>site_key/.test(fnF) && /resolveClientSite\(/.test(fnF) && !/CLIENT_SITES\[/.test(fnF), 'F: the function reads the registry from the record, not a code list');
  ok(/x-site-enquiry-build/.test(fnF), 'F: the deploy marker header is set (CLAUDE.md §4)');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures) process.exit(1);
