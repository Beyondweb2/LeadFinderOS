/* ============================================================
   CLIENT AGREEMENT — the v1 words are fixed, the evidence row uses the live column names, and an
   agree-page signature cannot be built with a required field missing.
   Run: npx tsx scripts/client-agreement.test.ts
   ============================================================ */
import {
  acceptanceRowFrom, agreePageMissing, fillFromAcceptanceRow, renderAgreementText, sha256Hex, versionTemplateText,
  AGREEMENT_COPY_TO_PAUL, CLIENT_AGREEMENT_VERSION, NOT_PROVIDED, type AgreementFill,
} from '../src/lib/clientAgreement.ts';

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
  ok(AGREEMENT_COPY_TO_PAUL === 'paul@move37.fun', 'the receiving inbox, not the displayed address');
  ok(t.includes('Email for notices: paul@findable.live'), 'the agreement still DISPLAYS paul@findable.live');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
  process.exit(failures ? 1 : 0);
}
main();
