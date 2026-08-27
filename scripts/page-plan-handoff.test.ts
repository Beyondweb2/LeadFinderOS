/* Tests for src/lib/pagePlanHandoff.ts — the "Build this page" resolution. Mode is DERIVED (never
   asked, never read from page_type); exact-question join (no job parsing, no town casing); the
   no-page case falls back to Q&A WITH the generator's reason; an unreadable generator plan is an
   honest 'unresolved', never a guess. Run: npx tsx scripts/page-plan-handoff.test.ts */
import { resolveHandoff, handoffUrl, type GenPlanPage } from '../src/lib/pagePlanHandoff.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const GEN: GenPlanPage[] = [
  { key: 'lock changes|peterborough', queries: ['lock changes locksmiths in Peterborough UK'] },
  // Composite: ONE page answering TWO measured queries (uPVC door + window locks).
  { key: 'upvc door and window locks|huntingdon', queries: ['upvc door locksmiths in Huntingdon UK', 'window locks locksmiths in Huntingdon UK'] },
];
const EXCLUDED = [
  { question: 'best locksmiths in Huntingdon UK', reason: 'no listed service in the query — trade-level, the homepage covers it' },
];
const row = (lead: string | null, q: string, extra: string[] = []) =>
  ({ lead_id: lead, baseline_audit_id: 'AUDIT1', primary_question: q, questions: [q, ...extra] });

console.log('── MODE DERIVATION ──');
{
  const svc = resolveHandoff(row('LEAD1', 'lock changes locksmiths in Peterborough UK'), GEN, EXCLUDED);
  ok(svc.mode === 'service' && svc.clientId === 'LEAD1' && svc.pageKey === 'lock changes|peterborough',
    'lead + question in a service page -> Service+Area with the resolved key');
  const nat = resolveHandoff(row(null, 'How much does AndroFeme cost in the UK?'), null, null);
  ok(nat.mode === 'qa' && nat.clientId === 'AUDIT1' && nat.question === 'How much does AndroFeme cost in the UK?',
    'no lead (national client) -> Q&A with audit id + verbatim question, no generator call needed');
}

console.log('── ⛔ NO-PAGE ROWS NEVER DEAD-END, NEVER THE WRONG PAGE ──');
{
  const trade = resolveHandoff(row('LEAD1', 'best locksmiths in Huntingdon UK'), GEN, EXCLUDED);
  ok(trade.mode === 'qa' && trade.clientId === 'AUDIT1', 'trade-level question -> falls back to Q&A');
  ok(trade.mode === 'qa' && (trade.note ?? '').includes('homepage covers it'), '  carrying the generator\'s OWN exclusion reason');
  const notOffered = resolveHandoff(row('LEAD1', 'cobbler in Halifax'), GEN, EXCLUDED);
  ok(notOffered.mode === 'qa' && (notOffered.note ?? '').includes('No service page'), 'measured-but-not-offered -> Q&A with an honest note');
  const unreadable = resolveHandoff(row('LEAD1', 'lock changes locksmiths in Peterborough UK'), null, null);
  ok(unreadable.mode === 'unresolved', 'an UNREADABLE generator plan (null) is unresolved — never a guessed page');
}

console.log('── COMPOSITE: N ROWS → ONE PAGE ──');
{
  const a = resolveHandoff(row('LEAD1', 'upvc door locksmiths in Huntingdon UK'), GEN, EXCLUDED);
  const b = resolveHandoff(row('LEAD1', 'window locks locksmiths in Huntingdon UK'), GEN, EXCLUDED);
  ok(a.mode === 'service' && b.mode === 'service' && a.pageKey === b.pageKey && a.pageKey === 'upvc door and window locks|huntingdon',
    'either composite row resolves to the SAME single correct page');
  // A merged row whose primary is unmatched still resolves via a VARIANT question.
  const viaVariant = resolveHandoff(row('LEAD1', 'some unmatched phrasing', ['window locks locksmiths in Huntingdon UK']), GEN, EXCLUDED);
  ok(viaVariant.mode === 'service' && viaVariant.pageKey === 'upvc door and window locks|huntingdon',
    '  variant questions are tried when the primary does not match');
}

console.log('── URL BUILDING ──');
{
  const u = handoffUrl({ mode: 'service', clientId: 'L', pageKey: 'lock changes|st neots' })!;
  ok(u === '/page-generator?mode=service&client=L&page_key=lock%20changes%7Cst%20neots', 'service URL encodes the key');
  const q = handoffUrl({ mode: 'qa', clientId: 'A', question: 'How? & why' })!;
  ok(q.includes('question=How%3F%20%26%20why'), 'qa URL encodes the question');
  ok(handoffUrl({ mode: 'unresolved', reason: 'x' }) === null, 'unresolved builds NO url (the caller must not navigate)');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
