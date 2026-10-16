/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIMPLE findable.live ONBOARDING'S NEW FIELDS (2026-10-16, migration 20261103090000).
   design_choice + agency_contract_ends must reach the row (findable-onboarding drops any key that is not in
   ALL THREE lists), access_ack_at is stamped by findable-checkout without ever gating, q2_prefill returns the
   confirmed town, and every operator screen reads ONE line builder.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { readContractEnd, readDesignChoice, contractEndWords, simpleOnboardingLines, maskEmail } from '../src/lib/onboardingSimpleAnswers.ts';
import { onboardingQuestionsFor } from '../src/lib/clientOnboardingForm.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('── 1. THE VALUES ──');
ok(readDesignChoice('keep') === 'keep' && readDesignChoice('improve') === 'improve', 'keep / improve are answers');
ok(readDesignChoice('KEEP') === null && readDesignChoice('') === null && readDesignChoice(undefined) === null && readDesignChoice(true) === null, 'anything else is null, never a guess');
ok(readContractEnd('2027-03-17') === '2027-03-17' && readContractEnd(' 2027-03-17 ') === '2027-03-17', 'a real yyyy-mm-dd day is kept');
ok(readContractEnd('2027-02-30') === null && readContractEnd('2027-13-01') === null, 'an impossible day is null');
ok(readContractEnd('17/03/2027') === null && readContractEnd('2027-3-17') === null && readContractEnd('soon') === null && readContractEnd(20270317) === null, 'any other shape is null');
ok(contractEndWords('2027-03-17') === '17 March 2027', 'the end date in words, as a day (UTC, no BST shift)');
ok(contractEndWords(null) === null && contractEndWords('nope') === null, 'no date → no words');

console.log('── 2. THE OPERATOR LINES ──');
ok(simpleOnboardingLines(null).length === 0 && simpleOnboardingLines({}).length === 0, 'an old row shows nothing new');
{
  const l = simpleOnboardingLines({ design_choice: 'improve', agency_contract_ends: '2027-03-17', access_ack_at: '2026-10-16T10:00:00Z' });
  ok(l.length === 3 && l[0].value === 'Improve the design' && l[1].value === '17 March 2027' && /can get us access/.test(l[2].value), 'design, contract end and access each get one line');
}
ok(simpleOnboardingLines({ design_choice: 'paint it red' }).length === 0, 'an unknown stored value is not shown as an answer');

console.log('── 3. findable-onboarding: ALL THREE LISTS ──');
{
  const on = code('supabase/functions/findable-onboarding/index.ts');
  for (const col of ['design_choice', 'agency_contract_ends']) {
    ok(new RegExp(`\\b${col}: read`).test(on), `${col} is in the answers object, validated`);
    const newer = on.match(/const NEWER_COLS = \[([^\]]*)\]/)?.[1] ?? '';
    ok(newer.includes(`"${col}"`), `${col} is in NEWER_COLS`);
    const optional = on.match(/const optional = \[([^\]]*)\]/)?.[1] ?? '';
    ok(optional.includes(`"${col}"`), `${col} is in the optional shedding list`);
  }
  const optional = on.match(/const optional = \[([^\]]*)\]/)?.[1] ?? '';
  ok(optional.indexOf('"agency_contract_ends"') < optional.indexOf('"agency_contract"'), 'agency_contract_ends is shed-tested before agency_contract (substring rule)');
  ok(/They say their agency contract ends on \$\{ends\}/.test(on) && /contractEndWords\(/.test(on), 'the hold notice names the end date when given');
  ok(/select\("id, status, lead_id, services, services_list, areas_list, areas_wanted, confirmed_location"\)/.test(on) && /confirmed_location: confirmedLocation \}\)/.test(on), 'q2_prefill returns the confirmed town');
  const q2 = on.slice(on.indexOf('action === "q2_prefill"'), on.indexOf('action === "complete_q2"'));
  ok(!/\bemail\b/.test(q2) && !/contact_name/.test(q2) && !/business_address/.test(q2), 'q2_prefill returns no email, contact name or address (prefill does — masked email only)');
}

console.log('── 4. findable-checkout: A RECORD, NEVER A GATE ──');
{
  const co = code('supabase/functions/findable-checkout/index.ts');
  const i = co.indexOf('body.access_ack === true');
  ok(i > 0, 'stamped only on a strict true');
  const block = co.slice(i, co.indexOf('const gate = serveDecision'));
  ok(/\.is\("access_ack_at", null\)/.test(block), 'stamped once (only while null)');
  ok(/try \{/.test(block) && !/return json/.test(block), 'it cannot return a refusal or throw out of the handler');
  ok(i > co.indexOf('checkout_refused_row_already_paid'), 'a paid row is refused before anything is stamped');
}

console.log('── 4b. PREFILL: NAME, ADDRESS, EMAIL MASKED ONLY (Paul, 2026-10-16) ──');
ok(maskEmail('paul@gmail.com') === 'p***@gmail.com' && maskEmail(' Jo.Smith@Example.CO.UK ') === 'J***@example.co.uk', 'first letter, ***, then the domain');
ok(maskEmail('not an email') === null && maskEmail('') === null && maskEmail(undefined) === null && maskEmail('a@b') === null, 'not an address → null, never the raw value');
{
  const on = code('supabase/functions/findable-onboarding/index.ts');
  const pre = on.slice(on.indexOf('action === "prefill"'), on.indexOf('action === "revise"'));
  ok(/contact_name: heldName,/.test(pre) && /business_address: heldAddress,/.test(pre) && /contact_email_masked: heldEmailMasked,/.test(pre), 'prefill returns exactly the three agreed field names');
  ok(/maskEmail\(heldFirst\("contact_email", lead\.email\)\)/.test(pre), 'the email goes out only through maskEmail');
  ok(!/\bcontact_email:/.test(pre) && !/\bemail:/.test(pre) && !/\bnotes\b/.test(pre), 'no full email and no notes in the response');
  ok(pre.indexOf('error: "already_client"') < pre.indexOf('contact_email_masked'), 'same capability: the already_client refusal still comes first');
  ok(/contact_name, email"\)/.test(pre) && /quick_close, contact_name, contact_email, business_address"\)/.test(pre), 'the columns are actually selected');
}

console.log('── 4c. THE /details/ FORM FOR A NEW-FLOW BUILD CLIENT ──');
{
  const row = {
    contact_name: 'Sam Jones', contact_email: 'sam@jonesplumbing.co.uk', confirmed_phone: '07700 900123', confirmed_location: 'Rugby',
    business_address: '1 High St, Rugby', business_website: null, services_list: ['Boiler repair'], areas_list: ['Coventry'],
    website_manager: 'web_company', agency_contract: 'free', design_choice: 'keep',
    domain_status: 'existing', domain_owned: 'yes', domain_access: 'yes', domain_third_party: 'no',
    authority_confirmed: true, dns_permission: true, materials_confirmed: true, plan_tier: 'new_site', website_addon: true,
  };
  const keys = (r: Record<string, unknown>, hasWebsite: boolean) =>
    onboardingQuestionsFor({ route: 'build', row: r, profile: {}, hasWebsite }).map((q) => q.key);
  const asked = keys(row, true);
  for (const held of ['contact_name', 'contact_email', 'confirmed_phone', 'confirmed_location', 'domain_status', 'domain_owned', 'domain_access', 'domain_third_party', 'authority_confirmed', 'dns_permission', 'materials_confirmed', 'services_list', 'areas_list']) {
    ok(!asked.includes(held as never), `held ${held} is not asked again`);
  }
  ok(asked.includes('photos_status') && asked.includes('must_not_say') && asked.includes('site_rights'), 'Build-only gaps still asked: photos, must-not-say, rights to reuse the current site');
  ok(!asked.some((k) => ['business_website', 'website_platform', 'website_manager'].includes(k)), 'no Optimise question for a Build client');
  const filled = keys({ ...row, photos_status: 'phone', must_not_say: 'no gas work', site_rights: 'yes', top_requests: 'boilers', gbp_status: 'done' }, true);
  ok(filled.length === 0, 'once they are answered, nothing is asked');
  const cs = read('supabase/functions/_shared/client-onboarding.ts');
  ok(/business_address,agency_contract,design_choice,agency_contract_ends/.test(cs), 'the form reads business_address, agency_contract, design_choice and the contract end');
  ok(/readDesignChoice\(row\?\.design_choice\)/.test(cs), 'a design choice means they have a website (so the rights question is asked)');
}

console.log('── 5. THE SCREENS READ ONE BUILDER ──');
ok(/design_choice,agency_contract_ends,access_ack_at/.test(code('supabase/functions/paid-client-hub/index.ts')), 'paid-client-hub reads the three columns');
for (const p of ['src/pages/ClientHub.tsx', 'src/components/SimpleWebsiteBuild.tsx', 'src/components/LeadQuestionnaireSection.tsx']) {
  ok(/simpleOnboardingLines\(/.test(code(p)), `${p} shows them through simpleOnboardingLines`);
}
ok(/add column if not exists design_choice text/.test(read('supabase/migrations/20261103090000_onboarding_simple_fields.sql')) && /'keep', 'improve'/.test(read('supabase/migrations/20261103090000_onboarding_simple_fields.sql')), 'the migration adds design_choice with its CHECK');

if (f) { console.error(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
