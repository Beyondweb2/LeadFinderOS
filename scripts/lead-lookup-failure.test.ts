/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A FAILED READ IS NOT A MISSING ROW.

   🔴 THE INCIDENT, 2026-09-14. `findable-onboarding` destructured the lead query's `error` away and
   tested only `data`. A database that timed out produced `data = null` — byte-identical to a lead
   that does not exist — so the customer was told "We couldn't find your details. Reply to our
   message and we'll send you a fresh link." A dead end, on a valid outreach link, caused entirely
   by our own infrastructure.

   ⛔ IT WAS NOT THEORETICAL. Supabase went Partially Degraded that afternoon: every PostgREST read
   answered HTTP 522 after ~20 seconds, and prefill returned `unknown_lead` for leads that plainly
   exist. Paul walked his own onboarding link and hit it. A prospect would simply have left.

   ⛔ THE TWO ANSWERS ARE NOW DIFFERENT ANSWERS, and only one of them is allowed to mention the link.
   This is the absent-value law (CLAUDE.md §6) on the front door of the paid funnel: silence from a
   database must never be read as a fact about the customer.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const fn = read('supabase/functions/findable-onboarding/index.ts');

console.log('-- the server tells them apart --');
/* 🔴 THE REGRESSION IN ONE LINE. If either lookup goes back to discarding `error`, an outage
   becomes a dead end again. */
ok(!/const \{ data: lead \} = await service\s*\n\s*\.from\("outreach_leads"\)\s*\n\s*\.select\("id, user_id, business_name, category, search_keyword, status/.test(fn),
   'the SUBMIT lookup no longer discards the query error');
ok((fn.match(/const \{ data: lead, error: leadErr \}/g) ?? []).length >= 2,
   'both gating lookups capture the error');
ok((fn.match(/error: "lookup_failed" \}, 503\)/g) ?? []).length === 2,
   'and each returns lookup_failed as a 503, not a 404');
ok(/if \(leadErr\) \{[\s\S]{0,200}?lookup_failed/.test(fn), 'the failure is tested BEFORE the absence');
/* Order matters: testing !lead first would swallow the error case back into unknown_lead. */
const submitIdx = fn.indexOf('.select("id, user_id, business_name, category, search_keyword, status');
const after = fn.slice(submitIdx, submitIdx + 1600);
ok(after.indexOf('leadErr') < after.indexOf('if (!lead)'),
   'and it is tested first — !lead before leadErr would swallow it straight back');

console.log('\n-- unknown_lead still means exactly one thing --');
ok((fn.match(/error: "unknown_lead" \}, 404\)/g) ?? []).length === 3,
   'unknown_lead stays a 404 and stays reserved for a genuinely absent row');

console.log('\n-- q2_prefill is deliberately NOT changed --');
/* A failed read there means the phone box arrives empty instead of filled: a missing convenience,
   not a refusal. Adding a 503 would turn a working degradation into a blocked screen. */
ok(/THIS ONE IS DELIBERATELY LEFT ALONE/.test(fn), 'and the reason is written down beside it');

console.log('\n-- the page says the right thing, and never blames the link --');
const flow = read('../findable-site/src/components/OnboardingFlow.tsx');
ok(/case "lookup_failed":/.test(flow), 'the flow handles lookup_failed');
const msg = flow.slice(flow.indexOf('case "lookup_failed":'), flow.indexOf('case "unknown_lead":'));
ok(/that's us, not you/.test(msg), 'it says the fault is ours');
ok(/Try again in a moment/.test(msg), 'and that trying again is what works');
/* ⛔ THE ONE THING IT MUST NOT DO. "Reply to our message" is a dead end: a prospect will not reply,
   they will leave. It belongs only on the answer that genuinely means the link is wrong. */
ok(!/Reply to our message/.test(msg), 'and it NEVER sends them back to WhatsApp');
ok(!/fresh link/.test(msg), 'nor implies their link is broken');

console.log('\n-- a late definite negative can undo the 2.5s failsafe --');
/* 🔴 WHY THIS MATTERS. The failsafe attributes from the URL when prefill has not answered in 2.5s.
   With prefill taking ~20 SECONDS during the outage it won every time, so the guard beneath it was
   dead code: leadId was already set and nothing could unset it. The submit then sent an id the
   server refused — which is how a database outage surfaced as "we couldn't find your details". */
ok(/if \(r\.error === "unknown_lead"\) setLeadId\(null\);/.test(flow),
   'a definite unknown_lead clears the attribution whenever it arrives');
ok(/else attributeFromUrl\(\);/.test(flow), 'and every other failure keeps it — the lead is probably real');

console.log('\n-- a late answer fills a blank, it never overwrites one --');
/* Twenty seconds is long enough for a first-time visitor to be several fields in. */
for (const [label, re] of [
  ['business name', /setBusinessName\(\(cur\) => \(cur\.trim\(\) \? cur : nameGuess\)\)/],
  ['phone', /setConfirmedPhone\(\(cur\) => \(cur\.trim\(\) \? cur : phoneGuess\)\)/],
  ['website', /setBusinessWebsite\(\(cur\) => \(cur\.trim\(\) \? cur : siteGuess\)\)/],
  ['town', /setLocation\(\(cur\) => \(cur\.trim\(\) \? cur : guess\)\)/],
] as const) ok(re.test(flow), `${label} is filled only when still empty`);

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
