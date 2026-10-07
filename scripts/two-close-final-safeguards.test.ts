/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   TWO CLOSE OPTIONS — FINAL SAFEGUARDS (2026-10-07, fix/two-close-final-safeguards). Pins:
     · FULL SETUP KEEPS ITS SALESPERSON: the client's own sign-up row gets the sender's creation event (the same event + trigger a
       phone close uses), once, and only from a recorded setup send;
     · THE AGENCY-CONTRACT SAFEGUARD holds a self-serve Build on an agency-run site they may still be tied into — the SAME rule,
       the SAME release (quick_close.review_approved_at) as the phone close — and never holds Optimise, a ended contract or silence.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { selfServeBuildHold, SELF_SERVE_HOLD_TEXT } from '../src/lib/selfServeContract.ts';
import { QC_REVIEW_TEXT, agencyContractBlocksBuild } from '../src/lib/quickClose.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const BUILD = { plan_tier: 'new_site', website_addon: true } as const;
const OPT = { plan_tier: 'keep', website_addon: false } as const;
console.log('\n── THE SELF-SERVE CONTRACT SAFEGUARD ──');
ok(selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: 'in_contract' }), 'Build + agency + still in contract → HELD');
ok(selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: 'not_sure' }), 'Build + agency + not sure → HELD (the phone close holds it too)');
ok(!selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: 'free' }), 'Build + agency + contract ended → not held, Build is available');
ok(!selfServeBuildHold({ ...OPT, website_manager: 'web_company', agency_contract: 'in_contract' }), 'Optimise + agency + in contract → not held (it is the plan we recommend)');
ok(!selfServeBuildHold({ ...BUILD, website_manager: 'direct_access', agency_contract: 'in_contract' }) && !selfServeBuildHold({ ...BUILD, website_manager: null, agency_contract: 'not_sure' }), 'no agency running the site → not held');
ok(!selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: null }) && !selfServeBuildHold({ ...BUILD, website_manager: 'web_company' }) && !selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: 'maybe' }), 'no answer / an unknown answer never holds (silence is not "in contract")');
ok(!selfServeBuildHold({ plan_tier: null, website_addon: null, website_manager: 'web_company', agency_contract: 'in_contract' }) && !selfServeBuildHold(null) && !selfServeBuildHold(undefined), 'an undecided route or no row → not held here (checkout refuses those on their own rules)');
ok(!selfServeBuildHold({ ...BUILD, website_manager: 'web_company', agency_contract: 'in_contract', quick_close: { review_approved_at: '2026-10-07T10:00:00Z' } }), "Paul's release (quick_close.review_approved_at — the phone close's own field) lifts it");
ok(SELF_SERVE_HOLD_TEXT === QC_REVIEW_TEXT.agency_contract_build, "Paul is told in the phone close's own words");
ok(agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'in_contract' }) && agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'not_sure' }) && !agencyContractBlocksBuild({ manager: 'agency', agency_contract: 'free' }), 'the phone close blocks exactly the same three cases');
ok(/agencyContractBlocksBuild\(\{ manager: 'agency'/.test(read('src/lib/selfServeContract.ts')), 'and the self-serve rule CALLS that predicate (one rule, not a copy)');

console.log('\n── WHERE IT IS ENFORCED ──');
const co = read('supabase/functions/findable-checkout/index.ts');
ok(/agency_contract, quick_close, " \+ DOMAIN_ROW_COLUMNS/.test(co) && /if \(selfServeBuildHold\(ob as never\)\)/.test(co) && /held_for_review/.test(co.slice(co.indexOf('selfServeBuildHold(ob'), co.indexOf('selfServeBuildHold(ob') + 400)), 'findable-checkout reads the answer from the row and refuses with held_for_review');
ok(co.indexOf('selfServeBuildHold(ob') < co.indexOf('const domain = domainAuthority'), '…before any domain / Stripe work');
const on = read('supabase/functions/findable-onboarding/index.ts');
ok(/selfServeBuildHold\(\{ plan_tier: \(answers/.test(on) && /self_serve_review:\$\{row\.id\}/.test(on), 'a held self-serve Build tells Paul once (deduped per sign-up)');
const qc = read('supabase/functions/quick-close/index.ts');
ok(/selfHold \? "needs_review"/.test(qc) && /selfHold \? \[SELF_SERVE_HOLD_TEXT\]/.test(qc) && /Object\.keys\(answers\)\.length === 0 && selfServeBuildHold\(row as never\)/.test(qc), "the Close tab shows the stop for a client's own sign-up, and never for a phone-close row");
ok(/website_manager, agency_contract";/.test(qc), 'quick-close reads the two columns it needs');
const cp = read('src/components/ClosePanel.tsx');
ok(/data-testid="self-serve-hold"/.test(cp) && /mode: 'approve_review'/.test(cp) && /role === 'admin'/.test(cp), 'Paul gets the SAME Release button (approve_review, admin only); a salesperson sees the stop only');

console.log('\n── FULL SETUP KEEPS ITS SALESPERSON ──');
const sc = read('supabase/functions/_shared/setup-link-creator.ts');
ok(/kind", "link_shared"/.test(sc) && /data\?\.variant === "setup"/.test(sc) && /!!s\.actor_user_id/.test(sc), "the creator is read from the lead's own recorded Full Setup send");
ok(/kind: "link_generated"/.test(sc) && /onboarding_id: onboardingId/.test(sc) && /actor_user_id: send\.actor_user_id/.test(sc), "the event is the phone close's own 'link_generated', on the NEW sign-up, by the sender");
ok(/eq\("onboarding_id", onboardingId\)\.eq\("kind", "link_generated"\)/.test(sc) && /already_recorded/.test(sc), 'one creation per sign-up, never twice');
ok(/SETUP_SEND_WINDOW_DAYS/.test(sc) && /gte\("created_at", since\)/.test(sc), 'a send from months ago is not this sale');
ok(/no_setup_send/.test(sc), 'no recorded send → nothing recorded (the existing no-creator rule decides, never a guess)');
ok(/recordSetupSignupCreator\(service, leadId, row\.id as string\)/.test(on) && on.indexOf('recordSetupSignupCreator(service') > on.indexOf('await saveAnswers({ lead_id: leadId, status: "submitted" })'), 'findable-onboarding records it right after the client\'s sign-up row is saved');
ok(/await event\(service, leadId, row\?\.id \?\? null, actor\.id, "link_shared", \{ channel, variant: "setup", status \}\)/.test(qc), 'share_setup writes the send event the creator is read from (both WhatsApp and Copy)');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
