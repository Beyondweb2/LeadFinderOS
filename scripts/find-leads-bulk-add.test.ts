/* FIND LEADS: ADD TO CRM IN ONE BATCH, UK MOBILES ONLY (2026-10-17) — src/lib/findLeadsBulkAdd.ts.
   22 fixture results (UK mobiles, every UK landline shape Paul named, duplicates, no number, a failed lookup,
   Malaysia / Singapore) through the real engine with a fake database and a fake Place Details: ONE committing
   call, the right counts, the right reasons. Numbers are Ofcom's drama ranges (07700 900xxx, 01632 960xxx). */
import { readFileSync } from 'node:fs';
import {
  runFindLeadsBulkAdd, findLeadsPhoneSkip, addSummaryTitle, addSummaryReasons, COVERAGE_ADD_MAX_ROWS,
  type BulkAddLead, type AddRowAnswer,
} from '../src/lib/findLeadsBulkAdd.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };

console.log('── 1. the phone rule ──');
ok(findLeadsPhoneSkip('07700 900123', 'UK') === null, 'UK 07 mobile is added');
ok(findLeadsPhoneSkip('+44 7700 900123', 'UK') === null, '+447 mobile is added');
ok(findLeadsPhoneSkip('+44 (0)7700 900123', 'UK') === null, '+44 (0)7… is read as a mobile');
for (const n of ['01632 960001', '020 7946 0001', '0333 010 0001', '0808 157 0001', '0300 123 0001', '+44 1632 960001', '+44 20 7946 0001', '+44 333 010 0001', '0800 123 4567', '0845 123 4567']) {
  ok(findLeadsPhoneSkip(n, 'UK') === 'landline', `UK ${n} is skipped as a landline`);
}
ok(findLeadsPhoneSkip('01632 960001', null) === 'landline', 'a blank country is the UK default');
ok(findLeadsPhoneSkip('', 'UK') === 'no_number' && findLeadsPhoneSkip(null, 'UK', 'a@b.co') === 'no_number', 'UK with no number is skipped, even with an email');
ok(findLeadsPhoneSkip('012-345 6789', 'Malaysia') === null && findLeadsPhoneSkip('03-2345 6789', 'Malaysia') === null, 'Malaysia: mobile and landline added, unchanged');
ok(findLeadsPhoneSkip('+65 9123 4567', 'Singapore') === null && findLeadsPhoneSkip('6123 4567', 'Singapore') === null, 'Singapore: unchanged');
ok(findLeadsPhoneSkip(null, 'Malaysia', 'x@y.my') === null && findLeadsPhoneSkip(null, 'Malaysia') === 'no_number', 'non-UK with no phone: the old rule (kept with an email)');
ok(findLeadsPhoneSkip('+44 1632 960001', 'Malaysia') === 'landline', 'a +44 landline is a UK number whatever the search country');

console.log('── 2. 22 fixture leads, one batch ──');
type Fx = { id: string; name: string; phone: string | null; inCrm?: boolean; lookupFails?: boolean; country?: string; email?: string };
const fx: Fx[] = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `ChIJmobile00${i}x`, name: `ZZ QA Mobile ${i}`, phone: `07700 90010${i}` })),
  { id: 'ChIJland0001xx', name: 'ZZ QA Land 01', phone: '01632 960001' },
  { id: 'ChIJland0002xx', name: 'ZZ QA Land 02', phone: '020 7946 0002' },
  { id: 'ChIJland0003xx', name: 'ZZ QA Land 03', phone: '0333 010 0003' },
  { id: 'ChIJland0808xx', name: 'ZZ QA Land 0808', phone: '0808 157 0004' },
  { id: 'ChIJland0441xx', name: 'ZZ QA Land +441', phone: '+44 1632 960005' },
  { id: 'ChIJdupe0001xx', name: 'ZZ QA Dupe 1', phone: '07700 900201', inCrm: true },
  { id: 'ChIJdupe0002xx', name: 'ZZ QA Dupe 2', phone: '07700 900202', inCrm: true },
  { id: 'ChIJdupe0003xx', name: 'ZZ QA Dupe 3', phone: '01632 960203', inCrm: true },
  { id: 'ChIJnone0001xx', name: 'ZZ QA No number 1', phone: null },
  { id: 'ChIJnone0002xx', name: 'ZZ QA No number 2 (email only)', phone: null, email: 'qa@example.invalid' },
  { id: 'ChIJfail0001xx', name: 'ZZ QA Lookup fails', phone: null, lookupFails: true },
  { id: 'ChIJmalay001xx', name: 'ZZ QA Malaysia', phone: '03-2345 6789', country: 'Malaysia' },
  { id: 'ChIJsinga001xx', name: 'ZZ QA Singapore', phone: '+65 9123 4567', country: 'Singapore' },
];
// The search result never carries a phone (search-leads' field mask has none): it comes from the lookup.
const leads: BulkAddLead[] = fx.map((f) => ({ id: f.id, name: f.name, googleMapsUrl: `https://maps.google.com/?cid=${f.id}`, websiteStatus: 'NO_WEBSITE' }));
// The same business twice on screen (many towns) is one row.
leads.push({ ...leads[0] });
const byId = new Map(fx.map((f) => [f.id, f]));
ok(leads.length === 23 && fx.length === 22, '22 fixture businesses (+1 repeat on screen)');

const calls: { commit: boolean; n: number }[] = [];
let lookups = 0;
const res = await runFindLeadsBulkAdd(
  leads,
  (l) => ({ trade: 'plumbers', town: 'Rugby', country: byId.get(l.id)?.country ?? 'UK' }),
  () => null,
  null,
  {
    addLeads: async (rows, _c, commit) => {
      calls.push({ commit, n: rows.length });
      const out: AddRowAnswer[] = rows.map((r) => {
        const f = byId.get(String(r.k));
        if (f?.inCrm) return { k: String(r.k), business_name: f.name, outcome: 'skipped', reasons: ['already_yours'] };
        return commit ? { k: String(r.k), business_name: String(r.business_name), outcome: 'created', lead_id: `lead-${String(r.k)}` }
                      : { k: String(r.k), business_name: String(r.business_name), outcome: 'new' };
      });
      return { ok: true, rows: out };
    },
    lookup: async (placeId) => {
      lookups++;
      const f = byId.get(placeId);
      if (!f || f.lookupFails) return null;
      return { phone: f.phone, address: f.country ? `1 Jalan, ${f.country}` : '1 High St, Rugby CV21 1AA, UK', derivedTown: 'Rugby', townNote: null, email: f.email ?? null };
    },
    sleep: async () => {},
  },
);
ok(res.ok, 'the add answered');
if (res.ok) {
  const commits = calls.filter((c) => c.commit);
  ok(calls.filter((c) => !c.commit).length === 1, 'ONE preview call (duplicates decided by the database)');
  ok(commits.length === 1 && res.saveCalls === 1, 'ONE committing call — not one per lead');
  ok(commits[0]?.n === 11, `the save holds exactly the 11 addable leads (9 UK mobiles + Malaysia + Singapore) — got ${commits[0]?.n}`);
  ok(lookups === 19, `each NEW lead looked up once, none for the 3 already in the CRM — got ${lookups}`);
  const s = res.summary;
  ok(s.added === 11, `added 11 — got ${s.added}`);
  ok(s.by.in_crm === 3, `3 already in CRM — got ${s.by.in_crm}`);
  ok(s.by.landline === 5, `5 landlines (01, 02, 03/0333, 0808, +441) — got ${s.by.landline}`);
  ok(s.by.no_number === 2, `2 no number (incl. the UK email-only lead) — got ${s.by.no_number}`);
  ok(s.by.lookup_failed === 1, `1 lookup failed (not added blind) — got ${s.by.lookup_failed}`);
  ok(s.skipped === 11 && s.added + s.skipped === 22, `22 rows answered: 11 added + 11 skipped (the on-screen repeat is one row) — ${s.added}+${s.skipped}`);
  ok(addSummaryTitle(s) === "Added 11, skipped 11", `title: "${addSummaryTitle(s)}"`);
  const reasons = addSummaryReasons(s);
  ok(/5 landline/.test(reasons) && /3 already in CRM/.test(reasons) && /2 no number/.test(reasons) && /1 number could not be looked up/.test(reasons), `reasons: "${reasons}"`);
  const created = new Set(res.rows.filter((r) => r.outcome === 'created').map((r) => r.k));
  ok(created.has('ChIJmalay001xx') && created.has('ChIJsinga001xx'), 'Malaysia and Singapore still added');
  ok(![...created].some((k) => /land|none|fail|dupe/.test(String(k))), 'no landline / no-number / failed / duplicate row was saved');
}

console.log('── 3. limits, refusals, big batches ──');
{
  // A limit refusal on a lookup stops the lookups; those leads are reported, never added without a lookup.
  let n = 0;
  const r = await runFindLeadsBulkAdd(leads.slice(0, 8), () => ({ trade: 'plumbers', town: 'Rugby', country: 'UK' }), () => null, null, {
    addLeads: async (rows, _c, commit) => ({ ok: true, rows: rows.map((x) => ({ k: String(x.k), outcome: commit ? 'created' : 'new', lead_id: 'x' } as AddRowAnswer)) }),
    lookup: async (pid) => (++n > 3 ? { limit: true } : { phone: byId.get(pid)?.phone ?? null }),
    sleep: async () => {},
  });
  ok(r.ok && r.summary.added === 3 && r.summary.by.limit === 5, 'a lookup limit: 3 added, 5 "limit reached", none added blind');
}
{
  const r = await runFindLeadsBulkAdd(leads.slice(0, 3), () => ({ trade: 'plumbers', town: 'Rugby', country: 'UK' }), () => null, 'c1', {
    addLeads: async () => ({ ok: false, error: 'unknown_campaign' }), lookup: async () => null, sleep: async () => {},
  });
  ok(!r.ok && /campaign is not available/.test((r as { message: string }).message), 'a refused call adds nothing and says why');
}
{
  const many: BulkAddLead[] = Array.from({ length: COVERAGE_ADD_MAX_ROWS + 20 }, (_, i) => ({ id: `ChIJbig${String(i).padStart(6, '0')}`, name: `ZZ QA Big ${i}` }));
  const cs: boolean[] = [];
  const r = await runFindLeadsBulkAdd(many, () => ({ trade: 'plumbers', town: 'Rugby', country: 'UK' }), () => null, null, {
    addLeads: async (rows, _c, commit) => { cs.push(commit); return { ok: true, rows: rows.map((x) => ({ k: String(x.k), outcome: commit ? 'created' : 'new' } as AddRowAnswer)) }; },
    lookup: async () => ({ phone: '07700 900999' }), sleep: async () => {},
  });
  ok(r.ok && cs.filter((c) => c).length === 2 && r.summary.added === COVERAGE_ADD_MAX_ROWS + 20, 'over the function ceiling: chunks of COVERAGE_ADD_MAX_ROWS');
}

console.log('── 4. the page uses it, and Needs info is gone ──');
const page = readFileSync('src/pages/Index.tsx', 'utf8');
ok(/useFindLeadsBulkAdd\(\)/.test(page) && !/for \(const lead of sel\)/.test(page), 'Find Leads bulk add is the batch, not a per-lead loop');
ok(/coverage_add_leads/.test(readFileSync('src/hooks/useFindLeadsBulkAdd.ts', 'utf8')), 'the batch saves through coverage_add_leads (one request)');
ok(!/Needs info/.test(readFileSync('src/components/LeadReadiness.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'no Needs info tag is drawn');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
