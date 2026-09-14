/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE DEFINITION OF "THE QUESTIONNAIRE IS FINISHED", AND FOUR SURFACES THAT READ IT.

   🔴 WHAT THIS PINS (2026-09-14). The rule was written out FOUR times. `business_address` left the
   questionnaire on 2026-08-22; two copies were relaxed and two were not, and the two that were not
   are the two a customer meets:

     • stripe-webhook's PAID email said "details not yet collected" on every real first payment.
     • LeadQuestionnaireSection's lead card said "Paid — awaiting details" for ever.

   ⛔ SO THE ASSERTION THAT MATTERS IS NOT "the predicate is right" — each of the four copies was
   defensible read on its own. It is that THERE IS ONLY ONE. The behaviour half is a handful of
   cases; the structural half greps the four importers and fails if any of them grows a local copy
   back. That is the only thing that could have caught the original fault.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  questionnaireComplete,
  missingQuestionnaireFields,
  QUESTIONNAIRE_REQUIRED_FIELDS,
} from '../src/lib/questionnaireComplete';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('-- the two fields, and only those two --');
ok(QUESTIONNAIRE_REQUIRED_FIELDS.join(',') === 'confirmed_location,services',
   'town + services — exactly what startPaidBaseline waits for');
/* 🔴 THE REGRESSION IN ONE LINE. A third field here makes a client complete on one screen and
   outstanding on another, which is the whole fault. */
ok(!QUESTIONNAIRE_REQUIRED_FIELDS.includes('business_address' as never),
   'business_address is NOT required — the product stopped collecting it on 2026-08-22');

console.log('\n-- what counts as given --');
ok(questionnaireComplete({ confirmed_location: 'Huntingdon', services: 'lock changes' }), 'both answered');
ok(!questionnaireComplete({ confirmed_location: 'Huntingdon', services: null }), 'no services');
ok(!questionnaireComplete({ confirmed_location: null, services: 'lock changes' }), 'no town');
ok(!questionnaireComplete(null), 'a null row is not complete');
ok(!questionnaireComplete(undefined), 'an absent row is not complete');
ok(!questionnaireComplete({}), 'an empty row is not complete');
/* Absence has several spellings and they all mean the same thing (the house rule for a held value). */
ok(!questionnaireComplete({ confirmed_location: '   ', services: 'x' }), 'whitespace is not an answer');
ok(!questionnaireComplete({ confirmed_location: '', services: 'x' }), 'empty string is not an answer');
/* ⛔ THE ROW CARRIES MORE COLUMNS THAN THE RULE READS, AND MUST STILL PASS. A real onboarding row
   arrives with business_address null at the moment of every payment — that is the exact shape that
   was reading incomplete on two surfaces. */
ok(questionnaireComplete({ confirmed_location: 'Wisbech', services: 'plumbing', business_address: null } as never),
   'a real post-payment row (address still null) IS complete');

console.log('\n-- it names the missing field, so a caller never re-derives which --');
ok(missingQuestionnaireFields({ confirmed_location: 'x', services: 'y' }).length === 0, 'none missing');
ok(missingQuestionnaireFields({}).join(',') === 'confirmed_location,services', 'both named');
ok(missingQuestionnaireFields({ confirmed_location: 'x' }).join(',') === 'services', 'just the one');

console.log('\n-- and the leaf stays importable from an edge function --');
/* Comments stripped, or this check reads the file's own sentence ABOUT edge imports as an import
   — the substring trap (§4), on the assertion written to prevent a deploy failure. */
const leaf = read('src/lib/questionnaireComplete.ts').replace(/\/\*[\s\S]*?\*\//g, ' ');
/* Two Deno functions import it, so it must have no imports of its own and no Deno reads; and every
   edge import of it needs the explicit .ts extension or the bundler refuses at deploy time (§4). */
ok(!/^\s*import\s/m.test(leaf), 'zero imports — it is a leaf');
ok(!/\bDeno\./.test(leaf), 'no Deno');

console.log('\n-- FIVE IMPORTERS, ZERO LOCAL COPIES --');
/* ⚠️ FIVE, NOT FOUR. findable-onboarding's `complete_q2` 400 gate asks the same question of the
   INCOMING answers one tick before they are stored. It was found by sweeping for the columns rather
   than for the shape the first four shared, and it happened to be correct — which is exactly what
   the two stale copies also looked like from inside their own file. */
/* The structural half. Each surface must READ the leaf, and none may restate the rule. The second
   pattern is the shape all four copies had: both columns tested in one boolean expression. */
const RESTATED = /confirmed_location[\s\S]{0,120}&&[\s\S]{0,60}\bservices\b/;
for (const [file, spec] of [
  ['src/hooks/useSubmissions.ts', "@/lib/questionnaireComplete"],
  ['src/components/LeadQuestionnaireSection.tsx', "@/lib/questionnaireComplete"],
  ['supabase/functions/stripe-webhook/index.ts', '../../../src/lib/questionnaireComplete.ts'],
  ['supabase/functions/_shared/audit-baseline.ts', '../../../src/lib/questionnaireComplete.ts'],
  ['supabase/functions/findable-onboarding/index.ts', '../../../src/lib/questionnaireComplete.ts'],
] as const) {
  const src = read(file);
  /* Two of the five are `index.ts`, so label by the folder — a failure has to name the surface. */
  const name = file.split('/').slice(-2).join('/');
  ok(src.includes(`from "${spec}"`) || src.includes(`from '${spec}'`), `${name} imports the leaf (${spec})`);
  /* Comments are stripped first: these files EXPLAIN the rule at length, and the explanation is not
     a second copy of it. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  ok(!RESTATED.test(code), `${name} does not restate the rule in code`);
  ok(!/business_address[\s\S]{0,80}&&/.test(code) && !/&&[\s\S]{0,80}business_address/.test(code),
     `${name} has no business_address completeness test left`);
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
