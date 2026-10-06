/* ============================================================
   CLIENT SERVICE AGREEMENT v3 (2026-10-05) — the words are Paul's .docx VERBATIM, the version is pinned
   and immutable, the acceptance evidence is complete and bound to ONE sign-up, nothing is pre-ticked,
   and NO Stripe session can be created without that signature (server-side, every path).
   Run: npx tsx scripts/client-agreement-v3.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  acceptanceRowFrom, agreementVersion, blockText, CLIENT_AGREEMENT_VERSION, renderAgreementText, sha256Hex, versionTemplateText,
  type AgreementFill,
} from '../src/lib/clientAgreement.ts';
import { agreementPageHtml, authoritySentence, MARKETING_OPT_OUT_SENTENCE } from '../src/lib/agreementPageHtml.ts';
import { checkoutAgreementGate, type GateAcceptance } from '../src/lib/signupGate.ts';
import { COMMERCIAL_TERMS_V3 } from '../src/lib/clientTimeline.ts';

let failures = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const fill: AgreementFill = {
  businessName: 'Acme Plumbing', route: 'build', legalName: 'Acme Plumbing Ltd', companyNumber: '01234567', contactName: 'Sam Smith', role: 'Director',
  address: '1 High Street, Leeds', email: 'sam@acme.example', phone: '07700 900123', websiteDomain: 'acme.example',
};

async function main() {
  console.log('── THE WORDS: Paul\'s v3 .docx, verbatim ──');
  /* 2026-10-06: v4 is current (Optimise fixed term); v3 stays readable and its fingerprint stays pinned below. */
  ok(CLIENT_AGREEMENT_VERSION === 'v4', 'v4 is the current version — v3 is kept, unedited, for the signatures made on it');
  /* scripts/fixtures/client-agreement-v3-source.txt is the plain text of Findable_Client_Service_Agreement_v3_clean.docx
     (one paragraph per line, tabs as spaces). Every clause paragraph — "1. ABOUT…" to the end of 16.7 — must
     appear, in order, as a line of the agreed text. One changed word fails. */
  const src = read('scripts/fixtures/client-agreement-v3-source.txt').split('\n').map((l) => l.trim()).filter(Boolean);
  const start = src.indexOf('1. ABOUT THIS AGREEMENT');
  const end = src.findIndex((l) => l.startsWith('SCHEDULE 1'));
  const clauses = src.slice(start, end);
  const lines = renderAgreementText(fill, 'v3').split('\n');
  let at = 0; let missing = '';
  for (const c of clauses) {
    const i = lines.indexOf(c, at);
    if (i < 0) { missing = c; break; }
    at = i + 1;
  }
  ok(clauses.length > 100 && !missing, `all ${clauses.length} clause paragraphs of the .docx appear verbatim and in order${missing ? ` — MISSING: "${missing.slice(0, 80)}"` : ''}`);
  ok(agreementVersion('v3').body.map(blockText).join('\n') === clauses.join('\n'), 'the body is exactly the .docx clauses — nothing added, nothing dropped');
  const v = agreementVersion('v3');
  const keyLines = src.filter((l) => l.startsWith('•')).map((l) => l.replace(/^•\s+/, ''));
  ok(keyLines.length === 3 && keyLines.every((k) => v.keyPoints!.points.includes(k)), 'the three KEY POINTS are the .docx\'s');
  ok(src.some((l) => l.includes(v.services.build.description)) && src.some((l) => l.includes(v.services.optimise.description)), 'both service boxes are the .docx\'s words');
  ok(src.includes(v.intro), 'the intro is the .docx\'s');
  for (const [label, a, b] of v.schedule.rows) ok(src.includes(label) && src.includes(a) && src.includes(b), `Schedule 1 row "${label}" is the .docx\'s`);
  const t = renderAgreementText(fill, 'v3');
  ok(t.includes('5.6 Payment Start Date. Your first monthly payment is taken on the day after your Refund Window ends'), 'clause 5.6 — the Payment Start Date — is in the agreed text');
  ok(t.includes('9A.1 When your minimum term ends, your service continues on a rolling monthly basis'), 'clause 9A — the Continuing Service — is in the agreed text');
  ok(t.includes('(a) give us, within 7 days of us asking') && t.includes('(i) give you the information you reasonably need'), 'the lettered sub-items (7.1 a–e, 12.2 a–i) are kept');

  console.log('\n── VERSION IMMUTABLE ──');
  const V3_TEMPLATE_SHA = '3e1edf3b7ee6ca38704dbfb3dc4fdce67c1c73863b62c689510d304b3c2e6bc2';
  ok(await sha256Hex(versionTemplateText('v3')) === V3_TEMPLATE_SHA, 'v3 template fingerprint is pinned (a word changed = publish v4, never edit v3)');
  ok(await sha256Hex(versionTemplateText('v1')) === '10b3fd557cc247d445f537255e1472bd851df1f894e229da31e5d18eb87a80ff', 'v1 is byte-for-byte unchanged — copies already signed still prove themselves');
  ok(renderAgreementText(fill, 'v3') === t, 'rendering is deterministic');
  const shared = read('supabase/functions/_shared/client-agreement.ts');
  ok(/ensureAgreementVersion\(service, row\.agreement_version\)/.test(shared) && /differs from the stored version - publish a new version/.test(shared), 'the stored version row is checked against the text; a mismatch is a hard stop');

  console.log('\n── THE ACCEPTANCE EVIDENCE ──');
  const sha = await sha256Hex(t);
  const row = acceptanceRowFrom({ leadId: 'L1', fill, method: 'agree_page', agreedText: t, sha256: sha, version: 'v3', ip: '203.0.113.9', userAgent: 'UA',
    v3: { onboardingId: 'OB1', authorityConfirmed: true, marketingOptOut: false, commercialTerms: COMMERCIAL_TERMS_V3 } });
  ok(row.lead_id === 'L1' && row.business_name === 'Acme Plumbing' && row.agreement_version === 'v3' && row.agreed_text === t && row.agreed_text_sha256 === sha, 'client, business, version, the exact text and its fingerprint');
  ok(row.service_route === 'build' && row.typed_name === 'Sam Smith' && row.typed_role === 'Director' && row.email === 'sam@acme.example' && row.phone === '07700 900123', 'the chosen offer, the person accepting and their contact details');
  ok(row.onboarding_id === 'OB1' && row.authority_confirmed === true && row.commercial_terms === COMMERCIAL_TERMS_V3 && row.marketing_opt_out === false, 'the sign-up it binds to, the authority confirmation and the terms');
  ok(row.ip_address === '203.0.113.9' && row.user_agent === 'UA' && row.method === 'agree_page', 'the acceptance event: method, IP and browser (time is the database\'s)');
  const v1row = acceptanceRowFrom({ leadId: 'L1', fill, method: 'agree_page', agreedText: 'x', sha256: 'y', version: 'v1' });
  ok(!('onboarding_id' in v1row) && !('authority_confirmed' in v1row), 'a v1 row is written exactly as before (no new keys)');
  const mig = read('supabase/migrations/20261010090000_client_agreement_v3_commercial.sql');
  ok(/constraint v3_acceptance_is_complete check \(\s*agreement_version <> 'v3'\s*or \(method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null\)/.test(mig), 'the database refuses an incomplete v3 acceptance');
  ok(/client_agreement_acceptances_one_v3_per_signup[\s\S]{0,120}\(onboarding_id, agreement_version\)/.test(mig), 'one v3 signature per sign-up (a double submit cannot make two)');

  console.log('\n── THE PAGE: details, offer, key points, the FULL agreement, nothing pre-ticked ──');
  const page = agreementPageHtml({ mode: 'sign', businessName: 'Acme Plumbing', route: 'build', values: {}, errors: [], signupId: 'OB1' });
  ok(page.includes('Your offer: Findable Build') && page.includes('KEY POINTS: please read before you accept') && page.includes('9A. CONTINUING SERVICE AFTER THE MINIMUM TERM') && page.includes('16.7'), 'offer, key points and the whole agreement are on the page');
  ok(!/name="agree"[^>]*checked/.test(page) && !/name="authority"[^>]*checked/.test(page) && !/name="marketingOptOut"[^>]*checked/.test(page), 'NOTHING is pre-ticked');
  ok(/name="agree" value="yes"[^>]*required/.test(page) && /name="authority" value="yes"[^>]*required/.test(page), 'agree AND authority are both required affirmative ticks');
  ok(page.includes(authoritySentence('Acme Plumbing').replace(/'/g, '&#39;')) && page.includes(MARKETING_OPT_OUT_SENTENCE), 'the authority confirmation (1.4) and the marketing opt-out (12.4) are offered');
  ok(/<input type="hidden" name="s" value="OB1"\/>/.test(page) && /I agree and sign/.test(page), 'the form carries the sign-up it signs for; the button is "I agree and sign"');
  const accepted = agreementPageHtml({ mode: 'accepted', businessName: 'Acme', acceptedAtIso: '2026-10-05T10:00:00Z', acceptedBy: 'Sam', pdfHref: '?pdf=1', justSigned: true, emailedTo: null, payFor: { signupId: 'OB1', route: 'build' } });
  ok(/Continue to secure payment/.test(accepted) && /name="action" value="pay"/.test(accepted), 'payment appears only AFTER signing');
  ok(/Please download your copy below/.test(accepted) && !/We have emailed/.test(accepted), 'no email claimed when the provider did not confirm it');
  const redirect = agreementPageHtml({ mode: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  ok(/http-equiv="refresh" content="0;url=https:\/\/checkout\.stripe\.com/.test(redirect), 'the pay step forwards with a page (the findable.live proxy passes HTML through)');

  console.log('\n── THE PAYMENT GATE (pure) ──');
  const good: GateAcceptance = { id: 'A1', lead_id: 'L1', onboarding_id: 'OB1', agreement_version: 'v3', service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha };
  const gate = (a: GateAcceptance | null, o: Partial<{ leadId: string; onboardingId: string; route: 'build' | 'optimise'; sha: string | null }> = {}) =>
    checkoutAgreementGate({ acceptance: a, leadId: o.leadId ?? 'L1', onboardingId: o.onboardingId ?? 'OB1', route: o.route ?? 'build', currentVersion: 'v3', recomputedSha: o.sha === undefined ? sha : o.sha });
  ok(gate(good).ok, 'a complete v3 signature for this lead, sign-up and route → payment may open');
  const refused = (r: ReturnType<typeof gate>, code: string, m: string) => ok(!r.ok && r.refusal === code, m);
  refused(gate(null), 'not_signed', 'CANNOT PAY BEFORE ACCEPTANCE: no signature → refused');
  refused(gate({ ...good, agreement_version: 'v1' }), 'old_version', 'an old (v1) signature never opens a v3 payment');
  refused(gate(good, { leadId: 'L2' }), 'other_client', 'another client\'s signature is refused');
  refused(gate(good, { onboardingId: 'OB0' }), 'other_signup', 'the same client\'s OLDER sign-up\'s signature is refused');
  refused(gate(good, { route: 'optimise' }), 'other_route', 'a Build signature never pays an Optimise checkout');
  refused(gate({ ...good, method: 'checkout' }), 'wrong_method', 'a checkout tick is not a v3 acceptance');
  refused(gate({ ...good, authority_confirmed: false }), 'no_authority', 'no authority confirmation → refused');
  refused(gate(good, { sha: 'f'.repeat(64) }), 'tampered', 'stored text that no longer matches its fingerprint → refused');

  console.log('\n── SERVER-SIDE ON EVERY PATH ──');
  const co = read('supabase/functions/findable-checkout/index.ts');
  const gateAt = co.indexOf('checkoutAgreementGate(');
  const stripeAt = co.indexOf('https://api.stripe.com/v1/checkout/sessions');
  ok(gateAt > 0 && stripeAt > gateAt, 'findable-checkout runs the gate BEFORE the only Stripe session call');
  ok(/if \(!gateResult\.ok\) \{[\s\S]{0,400}return json\(\{ ok: true, kind: "agreement_required", url: signupUrl/.test(co), 'unsigned → no session; the visitor is sent to their agreement page (the site already navigates to `url`)');
  ok(/if \(purpose === "signup_link"\) \{[\s\S]{0,300}kind: "signup_link", url: signupUrl, session_id: null/.test(co) && co.indexOf('purpose === "signup_link"') < stripeAt, 'Quick Close gets the sign-up link — never a Stripe URL');
  ok(!/consent_collection/.test(co) && !/checkoutConsentText/.test(co), 'no checkout tick any more — v3 is accepted on the agreement page only');
  ok(/metadata\[agreement_acceptance_id\]", gateResult\.acceptanceId/.test(co) && /metadata\[commercial_terms\]", COMMERCIAL_TERMS_CURRENT/.test(co), 'the session carries the exact signature it rests on and the terms');
  ok(/return json\(\{ ok: false, error: "agreement_unavailable" \}, 503\)/.test(co), 'no agreement link / unreadable acceptance → fails CLOSED (no session)');
  ok(/form\.set\("cancel_url", signupUrl\)/.test(co), 'backing out of Stripe returns to the agreement page');
  const ag = read('supabase/functions/client-agreement/index.ts');
  ok(/purpose: "pay"/.test(ag) && /\/\^https:\\\/\\\/checkout\\\.stripe\\\.com\\\/\/\.test\(out\.url\)/.test(ag), 'the agreement page pays only through findable-checkout, and only forwards to a Stripe URL');
  ok(/if \(form && clip\(form\.get\("s"\)\) !== signup\.id\)/.test(ag), 'a stale page for an older sign-up can neither sign nor pay for the current one');
  ok(/if \(form\.get\("action"\) === "pay"\) \{\s*\n\s*return html\(agreementPageHtml\(\{ mode: "not_ready"[^\n]*Please sign the agreement first/.test(ag), 'pressing pay before signing is refused');
  const wh = read('supabase/functions/stripe-webhook/index.ts');
  /* 2026-10-05 (correction): an alert after the fact is not a gate. An unsigned payment is HELD before any
     lifecycle runs (scripts/legacy-cutover.test.ts proves the order and what is not written). */
  ok(/const verdict = await verifyV3Checkout\(/.test(wh) && /await holdPayment\(/.test(wh) && !/sendOperatorAlert\("Paid WITHOUT the v3 agreement/.test(wh), 'an unsigned payment (e.g. an OLD open session) is HELD by the webhook backstop — never processed as a sale');

  console.log('\n── THE EMAILED COPY ──');
  ok(/logAgreementEmail\(service, acceptanceId, row\.lead_id, sent\.to, sent\.ok \? "sent" : "failed"/.test(shared), 'every copy email is logged with what the provider answered');
  ok(/if \(sent\.ok\) emailedTo = sent\.to;/.test(shared) && /emailedTo: stored\.emailedTo \? values\.email! : null/.test(ag), 'the page says "emailed" only when Resend accepted it');
  ok(/create table if not exists public\.client_agreement_emails[\s\S]{0,300}status text not null check \(status in \('sent', 'failed', 'refused'\)\)/.test(mig), 'client_agreement_emails records sent / failed / refused');

  if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
  console.log('\nAll v3 agreement checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
