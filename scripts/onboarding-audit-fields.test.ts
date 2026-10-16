/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FORM MUST ASK FOR EVERYTHING AN AUDIT NEEDS.

   🔴 THE FAULT, MEASURED 2026-09-14. A paid baseline needs four things and each has its own
   refusal: business_name (a hard 400 in create-ai-audit), the trade (`no_business_type`), the town
   (`no_location`) and the lead id (`no_lead_id`). On the TAGGED path the form showed NONE of the
   first three — they rode along invisibly from prefill — so a lead missing one reached the form
   looking complete, took the money, and startPaidBaseline then refused.

   ⛔ 62 OF 3,292 unarchived unpaid leads (1.9%) are missing a trade or a town. Sixty-two people who
   could pay and get no measurement, with nothing on screen saying so.

   ⛔ AND THE NAME FIELD WAS TWO FACTS UNDER ONE LABEL: "Your name or business name". contact_name
   is the PERSON (it prints on every page we build and is the WhatsApp follow-up's first name);
   business_name resolves the business on Google. They are separate fields now.

   ⚠️ HIDDEN WHEN KNOWN, ASKED WHEN BLANK — Paul's call. Every field on the way to paying costs
   conversions and 98% of leads carry all three, so a tagged visitor who already has them is never
   asked. The trade is the weaker of the two prefills (it is `category || search_keyword`, the term
   that was SEARCHED, which is how a PAT-testing company is filed as a locksmith); the town is the
   stronger (derived_town is Google's structured address for that business). Both risks are smaller
   than a field in front of everyone.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { findableSiteDir } from './findable-site-dir.mjs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* ⛔ READ WHAT IS DEPLOYED, NOT WHATEVER IS CHECKED OUT (2026-10-02). This suite failed on main for days while
   findable-site's origin/master passed it in full: it read the WORKING TREE of whichever findable-site copy was
   on disk (an old worktree, or the stale primary checkout). findable-site deploys only from origin/master, so
   that is what this reads — through git, whatever the checkout's state — and it says which revision. If git
   cannot answer, it falls back to the file and says so. */
const siteDir = findableSiteDir(ROOT);
const FLOW_PATH = 'src/components/OnboardingFlow.tsx';
const flow = (() => {
  try {
    const rev = execFileSync('git', ['-C', siteDir, 'rev-parse', '--short', 'origin/master'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const src = execFileSync('git', ['-C', siteDir, 'show', `origin/master:${FLOW_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
    console.log(`(findable-site ${FLOW_PATH} read at origin/master ${rev} — what is deployed)`);
    return src;
  } catch {
    console.log(`(findable-site: no origin/master at ${siteDir}; reading its working tree — may not be what is deployed)`);
    return fs.readFileSync(path.join(siteDir, FLOW_PATH), 'utf8');
  }
})();
const baseline = read('supabase/functions/_shared/audit-baseline.ts');
const create = read('supabase/functions/create-ai-audit/index.ts');

console.log('-- the four things an audit refuses without (the list this test exists to track) --');
ok(/error: "business_name required"/.test(create), 'create-ai-audit still 400s without a business name');
ok(/skipped: "no_business_type"/.test(baseline), 'startPaidBaseline still refuses without a trade');
ok(/skipped: "no_location"/.test(baseline), 'and without a town');
ok(/skipped: "no_lead_id"/.test(baseline), 'and without a lead');

console.log('\n-- the first screen: what we hold is shown, a blank is a field, and nothing blank gets past it --');
/* 🔴 REVISED 2026-10-16 FOR THE SIMPLE ONBOARDING (findable-site 58e5497, merged to master). The separate "business",
   "trade_town" and "you" panels are gone: the first panel, "Is this right?" (preSub "confirm"), SHOWS what the lead
   already holds and opens a field for anything blank or invalid. What this suite protects is unchanged: nobody reaches
   the pay screen with the business name, the trade or the town blank (create-ai-audit / startPaidBaseline refuse each). */
const list = flow.slice(flow.indexOf('const preSubs: PreSub[] = ['), flow.indexOf('];', flow.indexOf('const preSubs: PreSub[] = [')));
ok(list.replace(/\s+/g, ' ').startsWith('const preSubs: PreSub[] = [ "confirm",'), 'the first panel is "Is this right?" (confirm), on every path');
const confirmCase = flow.slice(flow.indexOf('case "confirm": return'), flow.indexOf('case "agency":'));
ok(confirmCase.includes('bizName.trim().length > 1') && confirmCase.includes('tradeValue.trim().length > 1') && confirmCase.includes('location.trim().length > 1'),
   'it will not advance with the business name, the trade or the town blank');
ok(flow.includes('["biz", bizName.trim().length > 1], ["trade", tradeValue.trim().length > 1], ["town", location.trim().length > 1]'),
   'a blank business name, trade or town opens as a field (hidden when known, asked when blank)');
ok(!flow.includes('setOpenRows(new Set())') && !flow.includes('openRows.delete'), 'and an open field is never closed under the person typing');

console.log('\n-- one business-name value, not two --');
/* 🔴 THE CONFLATION THIS REPLACES. Two backing states are fine; two MEANINGS are not. */
ok(/const bizName = isGeneric \? genericBizName : businessName;/.test(flow), 'the panel reads one value');
ok(/const setBizName = isGeneric \? setGenericBizName : setBusinessName;/.test(flow), 'and writes one value');
ok(/business_name: isGeneric \? genericBizName\.trim\(\) : businessName/.test(flow), 'the payload sends the same one');
/* An edit on a tagged link must survive a reload, or prefill simply refills it. */
ok(/businessName\?: string;/.test(flow), 'the draft carries the tagged business name');
ok(/if \(draft\.businessName\) setBusinessName\(draft\.businessName\);/.test(flow), 'and restores it');

console.log('\n-- the contact-name field is only ever the person --');
ok(flow.includes('<KnownRow label="Your name" htmlFor="ob-name"'), 'the label is "Your name"');
ok(flow.includes('<KnownRow label="Business name" htmlFor="ob-biz" value={bizName}'), 'and the business name is its own row');
/* ⚠️ COMMENTS STRIPPED. Comment blocks legitimately QUOTE the old label as the record of what was wrong. */
const flowCode = flow.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
ok(!/Your name or business name/.test(flowCode), 'and "Your name or business name" is gone from the UI');

console.log('\n-- every step opens at the top --');
ok(/window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/.test(flow), 'it scrolls to the top');
ok(/\}, \[step, preSubIdx, phase\]\);/.test(flow), 'on the step, the panel AND the phase — so Back is covered too');
/* ⚠️ smooth animates while the next panel is rendering, which reads as the page moving by itself. */
ok(!/behavior: "smooth"/.test(flow), 'instantly, never smoothly');
ok(/typeof window === "undefined"/.test(flow), 'and it is SSR-guarded — this is an Astro island');

console.log('\n-- a corrected trade is sent, and it has to actually DO something --');
/* ⛔ On the tagged path the trade the audit uses comes from the LEAD, so an edit on the first panel only means anything
   because it is sent AND written back. The simple onboarding sends it only when it differs from what prefill gave. */
ok(flow.includes('<KnownRow label="What you do" htmlFor="ob-trade" value={tradeValue}') && flow.includes('<KnownRow label="Your town" htmlFor="ob-town" value={location}'),
   'the trade and the town are shown on the first panel, with a way to fix them');
ok(flow.includes('business_type_correction: !isGeneric && businessType.trim() && businessType.trim() !== prefillTrade.current ? businessType.trim() : null'),
   'and a typed correction is actually sent');
const fn2 = read('supabase/functions/findable-onboarding/index.ts');
ok(/const tradeFix = clip\(a\.business_type_correction, 120\);/.test(fn2), 'the server reads it');
ok(/\.update\(\{ category: tradeFix/.test(fn2), 'and writes it to category, where the audit reads it');
/* search_keyword is the record of HOW the lead was found; overwriting it destroys the provenance
   and makes a mis-filing unauditable afterwards. */
ok(!/search_keyword: tradeFix/.test(fn2), 'never over search_keyword — that is the provenance');
ok(/trade corrected by the customer at signup/.test(fn2), 'and the old value goes to notes');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
