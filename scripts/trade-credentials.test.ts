/* Tests for src/lib/tradeCredentials.ts. Run: npx tsx scripts/trade-credentials.test.ts
 *
 * The trade strings are the REAL ones from the CRM's search_keyword column, because that is what
 * the page generator passes in: "Plumbers", "Driving instructors", "Locksmiths", "Electricians".
 */
import { suggestCredentials, CREDENTIAL_SUGGESTIONS } from '../src/lib/tradeCredentials';

let fails = 0;
let pass = 0;
const ok = (cond: boolean, label: string) => { if (cond) pass++; else { fails++; console.log(`FAIL ${label}`); } };
const labels = (t: string | null | undefined) => suggestCredentials(t).map((c) => c.label);

/* ── the real trades in the book get their real schemes ─────────────────────────────────────── */
{
  const p = labels('Plumbers');
  ok(p.includes('Gas Safe registered'), 'Plumbers → Gas Safe registered');
  ok(p.includes('CIPHE member'), 'Plumbers → CIPHE');
  ok(!p.includes('NICEIC approved contractor'), 'Plumbers do NOT get NICEIC');
  ok(!p.includes('MLA approved (Master Locksmiths Association)'), 'Plumbers do NOT get MLA');

  const e = labels('Electricians');
  ok(e.includes('NICEIC approved contractor') && e.includes('Part P registered'), 'Electricians → NICEIC + Part P');
  ok(!e.includes('Gas Safe registered'), 'Electricians do NOT get Gas Safe');

  const l = labels('Locksmiths');
  ok(l.includes('MLA approved (Master Locksmiths Association)'), 'Locksmiths → MLA');
  ok(!l.includes('Gas Safe registered'), 'Locksmiths do NOT get Gas Safe');

  const d = labels('Driving instructors');
  ok(d.includes('DVSA approved driving instructor (ADI)'), 'Driving instructors → DVSA ADI');
  ok(!d.includes('Gas Safe registered'), 'Driving instructors do NOT get Gas Safe');

  const h = labels('Heating engineer');
  ok(h.includes('Gas Safe registered') && h.includes('OFTEC registered'), 'Heating → Gas Safe + OFTEC');
}

/* ── every trade always gets the universal ones, so "fully insured" is never unreachable ────── */
{
  for (const t of ['Plumbers', 'Locksmiths', 'Driving instructors', 'Shoe repairs', 'Mobile valeting']) {
    const l = labels(t);
    ok(l.includes('fully insured'), `${t} → fully insured offered`);
    ok(l.includes('DBS checked'), `${t} → DBS checked offered`);
  }
}

/* ⛔ ABSENCE IS NEVER AN ANSWER: an unknown/blank trade still offers the universal set rather than
      leaving the operator with nothing and no way to record insurance. */
{
  for (const t of [null, undefined, '', '   ', 'Something Nobody Has Heard Of']) {
    const l = labels(t as string | null | undefined);
    ok(l.length > 0, `trade ${JSON.stringify(t)} → still offers the universal set`);
    ok(l.includes('fully insured'), `trade ${JSON.stringify(t)} → includes fully insured`);
    ok(!l.includes('Gas Safe registered'), `trade ${JSON.stringify(t)} → no trade-specific claim invented`);
  }
}

/* ── the substring traps this codebase keeps hitting ────────────────────────────────────────── */
{
  ok(!labels('Blocked drains').includes('MLA approved (Master Locksmiths Association)'),
    '"Blocked drains" must NOT match "lock"');
  ok(!labels('Glazing').includes('Gas Safe registered'),
    '"Glazing" must NOT match "gas"');
  ok(!labels('Window cleaning').includes('Gas Safe registered'),
    '"Window cleaning" gets no gas credential');
  ok(labels('Window fitters').includes('FENSA registered'), '"Window fitters" → FENSA');
  ok(labels('Landscaping').includes('NPTC certified'), '"Landscaping" → NPTC (stem match)');
  ok(labels('Roofing').includes('NFRC member'), '"Roofing" → NFRC');
}

/* ── no duplicates, and every entry is usable as page text ──────────────────────────────────── */
{
  const p = labels('Plumbers');
  ok(new Set(p.map((x) => x.toLowerCase())).size === p.length, 'no duplicate labels for a trade');
  // "Gas Safe registered" appears twice in the source (plumbing + appliances) — dedup must fold it.
  const gas = CREDENTIAL_SUGGESTIONS.filter((c) => c.label === 'Gas Safe registered').length;
  ok(gas >= 2, 'the source really does list Gas Safe under two trade groups (so dedup is exercised)');
  ok(labels('Gas appliance repairs').filter((x) => x === 'Gas Safe registered').length === 1,
    'and a trade matching both groups still sees it ONCE');

  for (const c of CREDENTIAL_SUGGESTIONS) {
    ok(c.label.trim().length > 2 && !/[<>]/.test(c.label), `label is safe page text: ${c.label}`);
    /* ⛔ NO REGISTRATION NUMBERS IN A SUGGESTION. A number is client-specific; a canned one would be
       a fabricated trust claim the moment it was ticked. */
    ok(!/\d{4,}/.test(c.label), `label carries no invented registration number: ${c.label}`);
  }
}

console.log(`\ntrade-credentials: ${pass} passed, ${fails} failed`);
if (fails) process.exit(1);
console.log('ALL PASS');
