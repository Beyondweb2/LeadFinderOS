/* ============================================================
   CLIENT AGREEMENT — the v1 words are fixed, the evidence row uses the live column names, and an
   agree-page signature cannot be built with a required field missing.
   Run: npx tsx scripts/client-agreement.test.ts
   ============================================================ */
import {
  acceptanceRowFrom, agreePageMissing, fillFromAcceptanceRow, renderAgreementText, sha256Hex, versionTemplateText,
  AGREEMENT_COPY_TO_PAUL, CLIENT_AGREEMENT_VERSION, NOT_PROVIDED, type AgreementFill,
} from '../src/lib/clientAgreement.ts';
import { agreementPageHtml } from '../src/lib/agreementPageHtml.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

const full: AgreementFill = {
  businessName: 'Test Co', route: 'optimise', legalName: 'Test Co Ltd', companyNumber: '', contactName: 'Sam', role: 'Owner',
  address: '1 Street', email: 'sam@test.example', phone: '01234', websiteDomain: '',
};

async function main() {
  console.log('── THE WORDS ──');
  /* ⛔ PINNED. If this fails, the agreement text was edited: publish a NEW version instead of changing v1. */
  const V1_TEMPLATE_SHA = '10b3fd557cc247d445f537255e1472bd851df1f894e229da31e5d18eb87a80ff';
  const tsha = await sha256Hex(versionTemplateText('v1'));
  ok(tsha === V1_TEMPLATE_SHA, `v1 template fingerprint is unchanged (got ${tsha.slice(0, 12)}…)`);
  ok(CLIENT_AGREEMENT_VERSION === 'v1', 'the current version is v1');
  const t = renderAgreementText(full);
  ok(t.includes('[X] Findable Optimise') && t.includes('[ ] Findable Build'), 'the recorded route is the ticked one');
  ok(!/eight weeks|eight if/i.test(t) && t.includes('four weeks after the baseline'), 'the agreement says four weeks, never eight');
  ok(renderAgreementText(full) === t, 'rendering is deterministic (same fill, same bytes)');
  ok(renderAgreementText({ businessName: 'X', route: 'build' }).includes(`Business address: ${NOT_PROVIDED}`), 'an absent field reads Not provided');

  console.log('\n── THE EVIDENCE ROW ──');
  const row = acceptanceRowFrom({ leadId: 'L', fill: full, method: 'agree_page', agreedText: t, sha256: 'a'.repeat(64), ip: '1.2.3.4', userAgent: 'UA' });
  const COLS = ['lead_id', 'business_name', 'service_route', 'agreement_version', 'agreed_text', 'agreed_text_sha256', 'method',
    'legal_business_name', 'company_number', 'typed_name', 'typed_role', 'business_address', 'email', 'phone', 'website_domain',
    'ip_address', 'user_agent', 'stripe_session_id'];
  ok(JSON.stringify(Object.keys(row).sort()) === JSON.stringify([...COLS].sort()), 'the row has exactly the live column names (id and accepted_at are DB defaults)');
  ok(row.typed_name === 'Sam' && row.typed_role === 'Owner', 'the signer is the contact: typed_name / typed_role');
  ok(row.company_number === null && row.website_domain === null, 'blank optional fields are stored as null, not ""');
  ok(fillFromAcceptanceRow(row).legalName === 'Test Co Ltd', 'a row maps back to the same fill');

  console.log('\n── REQUIRED ON THE AGREEMENT PAGE (mirrors agree_page_is_complete) ──');
  ok(agreePageMissing(full).length === 0, 'a complete form may sign (company number optional)');
  ok(JSON.stringify(agreePageMissing({ ...full, phone: ' ', legalName: '' })) === '["legalName","phone"]', 'missing legal name and phone are named');

  console.log('\n── WHERE PAUL’S COPY GOES ──');
  ok(AGREEMENT_COPY_TO_PAUL === 'paul@findable.live', 'Paul’s copy goes to the canonical business email');
  ok(!/move37/i.test(renderAgreementText(full)) && !/move37/.test(String(AGREEMENT_COPY_TO_PAUL)), 'the legacy inbox is never a recipient or on the agreement');
  ok(t.includes('Email for notices: paul@findable.live'), 'the agreement still DISPLAYS paul@findable.live');

  console.log('\n── THE AGREEMENT PAGE ──');
  const sign = agreementPageHtml({ mode: 'sign', businessName: 'Test Co', route: 'build', values: {}, errors: [] });
  const consent = "By ticking this box and clicking &#39;I agree and sign&#39;, I confirm that I have read the Findable Client Service Agreement, that I agree to it on behalf of Test Co, that I am authorised to do so, and that I intend this to be my electronic signature.";
  ok(sign.includes(consent), 'the consent sentence is Paul’s, verbatim, with the business name');
  ok(/<button type="submit">I agree and sign<\/button>/.test(sign) && /name="agree" value="yes"[^>]*required/.test(sign), 'one "I agree and sign" button behind a required tick');
  for (const f of ['legalName', 'contactName', 'role', 'address', 'email', 'phone']) ok(new RegExp(`name="${f}"[^>]*required`).test(sign), `the form requires ${f}`);
  ok(!/name="companyNumber"[^>]*required/.test(sign) && !/name="websiteDomain"[^>]*required/.test(sign), 'company number and website domain are optional');
  ok(/<div class="svc on"><div class="box">&#10003;<\/div><div><b>Findable Build/.test(sign), 'the recorded route is shown ticked');
  ok(sign.includes('four weeks after the baseline') && !/eight weeks|eight if/i.test(sign), 'the page shows the agreement’s four weeks, never eight');
  ok(/noindex/.test(sign), 'the page is never indexed');
  const done = agreementPageHtml({ mode: 'accepted', businessName: 'Test Co', acceptedAtIso: '2026-10-02T13:42:07Z', acceptedBy: 'Sam', pdfHref: '?pdf=1' });
  ok(done.includes('Accepted on 2 October 2026, 14:42 (UK time) by Sam') && !done.includes('I agree and sign</button>'), 'already accepted → "Accepted on … by …" instead of the button');
  ok(agreementPageHtml({ mode: 'not_ready', businessName: 'Test Co' }).includes('not ready yet'), 'no route → the page refuses to show the agreement');
  const blank = agreementPageHtml({ mode: 'blank' });
  ok(blank.includes('5.3') && !blank.includes('I agree and sign</button>'), 'the general version carries the whole agreement and no signature form');

  console.log('\n── ADDRESSES SURVIVE CLOUDFLARE EMAIL OBFUSCATION (findable.live) ──');
  const blankPage = agreementPageHtml({ mode: 'blank' });
  ok(blankPage.includes('<td><!--email_off-->paul@findable.live<!--/email_off--></td>'), 'the agreement’s "Email for notices" is kept out of obfuscation');
  const confirm = agreementPageHtml({ mode: 'accepted', businessName: 'X', acceptedAtIso: '2026-10-02T13:00:00Z', acceptedBy: 'Y', pdfHref: '?pdf=1', justSigned: true, emailedTo: 'a@b.co' });
  ok(confirm.includes('to <!--email_off-->a@b.co<!--/email_off-->.'), 'the confirmation names the client’s address as typed');
  ok(!/[^>]paul@findable\.live/.test(blankPage.replace(/<!--email_off-->paul@findable\.live/g, '')), 'no unprotected address left on the page');

  console.log('\n── VIEWING A CLIENT NEVER PUTS THEM ON THE CURRENT AGREEMENT ──');
  {
    const hub = (await import('node:fs')).readFileSync(new URL('../supabase/functions/paid-client-hub/index.ts', import.meta.url), 'utf8');
    const linkWrites = [...hub.matchAll(/from\("client_agreement_links"\)\s*\.upsert\(/g)].length;
    const setRoute = hub.slice(hub.indexOf('if (action === "agreement_set_route") {'), hub.indexOf('if (action === "agreement_send_link") {'));
    ok(linkWrites === 1 && /from\("client_agreement_links"\)\s*\.upsert\(\{ lead_id: L\.id, service_route: route \}/.test(setRoute),
      'the hub writes a route in exactly one place: Paul’s Build / Optimise click');
    ok(!/client_agreement_acceptances"\)\s*\.(insert|update|upsert|delete)\(/.test(hub), 'the hub never writes an acceptance');
    const render = (await import('node:fs')).readFileSync(new URL('../supabase/functions/_shared/welcome-pack-render.ts', import.meta.url), 'utf8');
    ok(!/client_agreement_(links|acceptances)"\)\s*\.(insert|update|upsert|delete)\(/.test(render), 'the public pack route only reads the agreement');
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
  process.exit(failures ? 1 : 0);
}
main();
