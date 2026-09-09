/* ============================================================
   THE INSTANTLY MERGE FIELDS, WITHOUT AN AUDIT.

   Run: npx tsx scripts/instantly-vars.test.ts

   ⛔ WHAT THIS GUARDS. Cold email to a real business, where a missing variable is not an error —
   it is a sentence with a hole in it, sent, and discovered from a reply that never comes. The old
   path got its refusal for free from resolveAuditReplyVars ("no completed audit -> not pushed at
   all"); dropping the audit had to keep the refusal and drop only the audit.
   ============================================================ */
import { instantlyVarsFor, type InstantlyLeadRow } from '../supabase/functions/_shared/instantly-vars.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const row = (o: Partial<InstantlyLeadRow>): InstantlyLeadRow => ({ id: 'l1', ...o });

console.log('\n── THE HAPPY PATH ──');
{
  const r = instantlyVarsFor(row({
    business_name: 'RG Locksmiths', search_keyword: 'locksmiths', derived_town: 'Huntingdon',
  }));
  ok(r.ok, 'a lead with a name, trade and town resolves');
  if (r.ok) {
    ok(r.vars.business_name === 'RG Locksmiths', `business_name (${r.vars.business_name})`);
    ok(r.vars.trade === 'locksmiths', `trade (${r.vars.trade})`);
    ok(r.vars.city === 'Huntingdon', `city (${r.vars.city})`);
    /* ⛔ NOTHING ELSE. competitors and report_url are gone with the audit; sending them empty is
       the mid-sentence hole this whole file exists to prevent. */
    ok(Object.keys(r.vars).sort().join(',') === 'business_name,city,trade',
       `exactly three fields, no competitors and no report_url (${Object.keys(r.vars).sort()})`);
  }
}

console.log('\n── EVERY MISSING FIELD REFUSES, AND SAYS WHICH ──');
for (const [label, patch] of [
  ['no business name', { search_keyword: 'plumbers', derived_town: 'Ely' }],
  ['no trade at all', { business_name: 'A Ltd', derived_town: 'Ely' }],
  ['no town at all', { business_name: 'A Ltd', search_keyword: 'plumbers' }],
] as [string, Partial<InstantlyLeadRow>][]) {
  const r = instantlyVarsFor(row(patch));
  ok(!r.ok, `${label} -> refused`);
  if (!r.ok) ok(/\{\{/.test(r.reason), `  and the reason names the variable that would break (${r.reason.slice(0, 60)})`);
}

console.log('\n── ⛔ WHITESPACE IS MISSING, NOT PRESENT ──');
/* A trade of " " passes a bare truthiness test, uploads happily, and renders as a gap. */
for (const [label, patch] of [
  ['whitespace business name', { business_name: '   ', search_keyword: 'plumbers', derived_town: 'Ely' }],
  ['whitespace trade', { business_name: 'A Ltd', search_keyword: '  ', derived_town: 'Ely' }],
  ['whitespace town', { business_name: 'A Ltd', search_keyword: 'plumbers', derived_town: '\t' }],
] as [string, Partial<InstantlyLeadRow>][]) {
  ok(!instantlyVarsFor(row(patch)).ok, `${label} -> refused, not uploaded as a blank`);
}
ok(!instantlyVarsFor(row({})).ok, 'a completely empty row is refused');

console.log('\n── THE FALLBACK ORDER IS THE ONE THE REST OF THE APP USES ──');
{
  const t = instantlyVarsFor(row({ business_name: 'A', category: 'Locksmith', derived_town: 'Ely' }));
  ok(t.ok && t.vars.trade === 'Locksmith', 'category is used when search_keyword is absent');
  const both = instantlyVarsFor(row({ business_name: 'A', search_keyword: 'locksmiths', category: 'Locksmith', derived_town: 'Ely' }));
  ok(both.ok && both.vars.trade === 'locksmiths', 'search_keyword WINS over category (the searched term is what we sold)');

  /* ⛔ THE WRONG-TOWN RULE. derived_town comes from the Places address; search_location is what was
     TYPED into the search and can be a neighbouring town — the incident that put a Huntingdon
     locksmith in a Wisbech report. Derived wins wherever both exist. */
  const derived = instantlyVarsFor(row({ business_name: 'A', search_keyword: 'x', derived_town: 'Huntingdon', search_location: 'Wisbech' }));
  ok(derived.ok && derived.vars.city === 'Huntingdon', 'derived_town WINS over the typed search_location');
  const typed = instantlyVarsFor(row({ business_name: 'A', search_keyword: 'x', search_location: 'Wisbech' }));
  ok(typed.ok && typed.vars.city === 'Wisbech', 'search_location is the fallback, not the preference');
}

console.log('\n── VALUES ARE CLEANED, BECAUSE THEY GO INTO A SENTENCE ──');
{
  const r = instantlyVarsFor(row({ business_name: '  RG   Locksmiths \n', search_keyword: ' locksmiths ', derived_town: ' Huntingdon ' }));
  ok(r.ok && r.vars.business_name === 'RG Locksmiths', `internal runs of whitespace collapse (${r.ok && r.vars.business_name})`);
  ok(r.ok && r.vars.trade === 'locksmiths' && r.vars.city === 'Huntingdon', 'trade and town are trimmed');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
