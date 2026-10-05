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

console.log('\n-- business name is asked whenever it would otherwise be BLANK --');
/* 🔴 REVISED 2026-10-02. This used to demand the panel UNCONDITIONALLY. Paul's 2026-09-18
   simplification (findable-site e48f787) hid it on the tagged path, where the lead row already holds
   the name, and this test was red from then on. What it protects is unchanged and still enforced:
   nobody reaches the pay screen with business_name blank (create-ai-audit 400s without one). So: the
   cold path always; the tagged path whenever the prefilled name is blank, through a MONOTONIC latch
   (askBusiness, the same shape as askTradeTown). Gating on isGeneric ALONE fails here. */
const list = flow.slice(flow.indexOf('const preSubs: PreSub[] = ['), flow.indexOf('];', flow.indexOf('const preSubs: PreSub[] = [')));
ok(/"you",/.test(list) && /\.\.\.\(isGeneric \|\| askBusiness \? \(\["business"\] as PreSub\[\]\) : \[\]\),/.test(list),
   'the panel list asks "business" on the cold path OR when the tagged name is blank');
ok(!/\.\.\.\(isGeneric \? \(\["business"\]/.test(list), 'and it is NOT gated on the cold path alone');
ok(/if \(!isGeneric && !businessName\.trim\(\)\) setAskBusiness\(true\);/.test(flow),
   'a tagged lead with a blank name turns the panel on');
ok(!/setAskBusiness\(false\)/.test(flow), 'and it is never turned back off');
ok(/case "business": return bizName\.trim\(\)\.length > 1;/.test(flow), 'and it is required to advance');

console.log('\n-- one business-name value, not two --');
/* 🔴 THE CONFLATION THIS REPLACES. Two backing states are fine; two MEANINGS are not. */
ok(/const bizName = isGeneric \? genericBizName : businessName;/.test(flow), 'the panel reads one value');
ok(/const setBizName = isGeneric \? setGenericBizName : setBusinessName;/.test(flow), 'and writes one value');
ok(/business_name: isGeneric \? genericBizName\.trim\(\) : businessName/.test(flow), 'the payload sends the same one');
/* An edit on a tagged link must survive a reload, or prefill simply refills it. */
ok(/businessName\?: string;/.test(flow), 'the draft carries the tagged business name');
ok(/if \(draft\.businessName\) setBusinessName\(draft\.businessName\);/.test(flow), 'and restores it');

console.log('\n-- the contact-name field is only ever the person --');
ok(/<label className="mb-1\.5 block text-\[0\.82rem\] font-semibold text-ink">Your name<\/label>/.test(flow),
   'the label is "Your name"');
/* ⚠️ COMMENTS STRIPPED. Three comment blocks legitimately QUOTE the old label as the record of
   what was wrong — matching the raw file would fail on prose that is saying the right thing. The
   substring trap, inside the assertion written to catch a substring problem. */
const flowCode = flow.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
ok(!/Your name or business name/.test(flowCode), 'and "Your name or business name" is gone from the UI');

console.log('\n-- trade and town: asked when blank, hidden when known --');
ok(/askTradeTown \? \(\["trade_town"\] as PreSub\[\]\) : \[\]/.test(flow), 'the panel appears only when asked for');
ok(/if \(!businessType\.trim\(\) \|\| !location\.trim\(\)\) setAskTradeTown\(true\);/.test(flow),
   'and it is asked for when EITHER is blank — not only when there is no lead');
/* 🔴 THE REGRESSION THAT WOULD REOPEN THE HOLE: gating on isGeneric again would leave the 62
   tagged-but-incomplete leads exactly where they were. */
ok(!/isGeneric[\s\S]{0,40}\["you", "business", "trade_town"/.test(flow),
   'the old isGeneric-only panel list is gone');
/* ⛔ MONOTONIC. A panel appearing is safe; one disappearing mid-flow is not. */
ok(!/setAskTradeTown\(false\)/.test(flow), 'it is never turned back off');

console.log('\n-- every step opens at the top --');
ok(/window\.scrollTo\(\{ top: 0, behavior: "auto" \}\)/.test(flow), 'it scrolls to the top');
ok(/\}, \[step, preSubIdx, phase\]\);/.test(flow), 'on the step, the panel AND the phase — so Back is covered too');
/* ⚠️ smooth animates while the next panel is rendering, which reads as the page moving by itself. */
ok(!/behavior: "smooth"/.test(flow), 'instantly, never smoothly');
ok(/typeof window === "undefined"/.test(flow), 'and it is SSR-guarded — this is an Astro island');

console.log('\n-- the confirmation line, and it has to actually DO something --');
/* ⛔ A CONTROL THAT VISIBLY DOES NOTHING IS WORSE THAN NO CONTROL. On the tagged path the trade
   the audit uses comes from the LEAD, not from this form, so the inline edit only means anything
   because it is sent AND written back. The town needs no plumbing: confirmed_location is already
   sent on both paths and outranks everything in pickAuditTown. */
ok(/We&rsquo;ll check how AI answers for/.test(flow), 'the line states what will be measured');
ok(/Not right\?/.test(flow), 'with a way out');
ok(/!askTradeTown && businessType\.trim\(\) && location\.trim\(\)/.test(flow),
   'shown ONLY when we hold both — otherwise the trade_town panel has already asked');
/* Flipping askTradeTown would insert a panel EARLIER than the one being read, shifting preSubIdx
   under the visitor and jumping them backwards mid-sentence. */
ok(/const \[correctTradeTown, setCorrectTradeTown\] = useState\(false\);/.test(flow),
   'the reveal is inline state, not a panel insert');
ok(/business_type_correction: correctTradeTown && businessType\.trim\(\)/.test(flow),
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
