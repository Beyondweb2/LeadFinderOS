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
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const flow = read('../findable-site/src/components/OnboardingFlow.tsx');
const baseline = read('supabase/functions/_shared/audit-baseline.ts');
const create = read('supabase/functions/create-ai-audit/index.ts');

console.log('-- the four things an audit refuses without (the list this test exists to track) --');
ok(/error: "business_name required"/.test(create), 'create-ai-audit still 400s without a business name');
ok(/skipped: "no_business_type"/.test(baseline), 'startPaidBaseline still refuses without a trade');
ok(/skipped: "no_location"/.test(baseline), 'and without a town');
ok(/skipped: "no_lead_id"/.test(baseline), 'and without a lead');

console.log('\n-- business name is asked on BOTH paths --');
/* It is unconditional in the panel list: no isGeneric, no askTradeTown. */
const list = flow.slice(flow.indexOf('const preSubs: PreSub[] = ['), flow.indexOf('];', flow.indexOf('const preSubs: PreSub[] = [')));
ok(/"you",/.test(list) && /"business",/.test(list), 'the panel list always contains "business"');
ok(!/isGeneric \? \[?"business"/.test(list), 'and it is NOT conditional on there being no lead');
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

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
