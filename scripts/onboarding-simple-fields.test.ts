/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIMPLE findable.live ONBOARDING'S NEW FIELDS (2026-10-16, migration 20261103090000).
   design_choice + agency_contract_ends must reach the row (findable-onboarding drops any key that is not in
   ALL THREE lists), access_ack_at is stamped by findable-checkout without ever gating, q2_prefill returns the
   confirmed town, and every operator screen reads ONE line builder.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { readContractEnd, readDesignChoice, contractEndWords, simpleOnboardingLines } from '../src/lib/onboardingSimpleAnswers.ts';

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
  ok(!/\bemail\b/.test(q2) && !/contact_name/.test(q2) && !/business_address/.test(q2), 'q2_prefill still returns no email, contact name or address (Paul has not approved that)');
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

console.log('── 5. THE SCREENS READ ONE BUILDER ──');
ok(/design_choice,agency_contract_ends,access_ack_at/.test(code('supabase/functions/paid-client-hub/index.ts')), 'paid-client-hub reads the three columns');
for (const p of ['src/pages/ClientHub.tsx', 'src/components/SimpleWebsiteBuild.tsx', 'src/components/LeadQuestionnaireSection.tsx']) {
  ok(/simpleOnboardingLines\(/.test(code(p)), `${p} shows them through simpleOnboardingLines`);
}
ok(/add column if not exists design_choice text/.test(read('supabase/migrations/20261103090000_onboarding_simple_fields.sql')) && /'keep', 'improve'/.test(read('supabase/migrations/20261103090000_onboarding_simple_fields.sql')), 'the migration adds design_choice with its CHECK');

if (f) { console.error(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
