/* FIND LEADS: ADD TO CRM IN ONE BATCH — EVERY BUSINESS IS ADDABLE (2026-10-19; was UK mobiles only 2026-10-17).
   22 fixture results (UK mobiles, every UK landline shape, a Malaysian landline, duplicates, no number, a failed
   lookup, Malaysia / Singapore) through the real engine with a fake database and a fake Place Details: ONE committing
   call; a duplicate is the ONLY skip; lookups 8 at a time, a throttled one retried, an answer reused from the page's
   cache; live progress. Numbers are Ofcom's drama ranges (07700 900xxx, 01632 960xxx). */
import { readFileSync } from 'node:fs';
import {
  runFindLeadsBulkAdd, phoneKindOf, phoneLabelOf, addSummaryTitle, addSummaryReasons, addProgressText, clearLookupCache,
  COVERAGE_ADD_MAX_ROWS, PLACE_LOOKUP_CONCURRENCY, LOOKUP_RETRY_DELAYS_MS,
  type BulkAddLead, type AddRowAnswer, type AddProgress,
} from '../src/lib/findLeadsBulkAdd.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };

console.log('── 1. the number is a LABEL, never a skip ──');
ok(phoneKindOf('07700 900123', 'UK') === 'mobile' && phoneKindOf('+44 (0)7700 900123', 'UK') === 'mobile', 'UK mobiles (incl. +44 (0)7…)');
for (const n of ['01632 960001', '020 7946 0001', '0333 010 0001', '0808 157 0001', '+44 1632 960001', '0800 123 4567']) {
  ok(phoneKindOf(n, 'UK') === 'landline' && phoneLabelOf(n, 'UK') === 'Landline', `UK ${n} → "Landline"`);
}
ok(phoneKindOf('03-2345 6789', 'Malaysia') === 'landline' && phoneKindOf('012-345 6789', 'Malaysia') === 'mobile', 'Malaysia: 03 landline, 012 mobile');
ok(phoneKindOf('+65 9123 4567', 'Singapore') === 'mobile' && phoneKindOf('6123 4567', 'Singapore') === 'landline', 'Singapore: 9 mobile, 6 landline');
ok(phoneKindOf(null, 'UK') === 'no_phone' && phoneLabelOf('', 'Malaysia') === 'No phone', 'no number → "No phone"');
ok(phoneLabelOf('07700 900123', 'UK') === null, 'a mobile has no label');

console.log('── 2. 22 fixture leads, one batch, only duplicates skipped ──');
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
  { id: 'ChIJmalay001xx', name: 'ZZ QA Malaysia landline', phone: '03-2345 6789', country: 'Malaysia' },
  { id: 'ChIJsinga001xx', name: 'ZZ QA Singapore', phone: '+65 9123 4567', country: 'Singapore' },
];
// The search result never carries a phone (search-leads' field mask has none): it comes from the lookup.
const leads: BulkAddLead[] = fx.map((f) => ({ id: f.id, name: f.name, googleMapsUrl: `https://maps.google.com/?cid=${f.id}`, websiteStatus: 'NO_WEBSITE' }));
leads.push({ ...leads[0] });   // the same business twice on screen (many towns) is one row
const byId = new Map(fx.map((f) => [f.id, f]));

type Call = { commit: boolean; n: number; rows: Record<string, unknown>[] };
const fakeDb = (calls: Call[]) => async (rows: Record<string, unknown>[], _c: string | null, commit: boolean) => {
  calls.push({ commit, n: rows.length, rows });
  const out: AddRowAnswer[] = rows.map((r) => {
    const f = byId.get(String(r.k));
    if (f?.inCrm) return { k: String(r.k), business_name: f.name, outcome: 'skipped', reasons: ['already_yours'] };
    return commit ? { k: String(r.k), business_name: String(r.business_name), outcome: 'created', lead_id: `lead-${String(r.k)}` }
                  : { k: String(r.k), business_name: String(r.business_name), outcome: 'new' };
  });
  return { ok: true, rows: out };
};
const lookupOf = (count: { n: number }) => async (placeId: string) => {
  count.n++;
  const f = byId.get(placeId);
  if (!f || f.lookupFails) return null;
  return { phone: f.phone, address: f.country ? `1 Jalan, ${f.country}` : '1 High St, Rugby CV21 1AA, UK', derivedTown: 'Rugby', townNote: null, email: f.email ?? null };
};
const ctx = (l: BulkAddLead) => ({ trade: 'plumbers', town: 'Rugby', country: byId.get(l.id)?.country ?? 'UK' });

clearLookupCache();
const calls: Call[] = [];
const count = { n: 0 };
const progress: AddProgress[] = [];
const res = await runFindLeadsBulkAdd(leads, ctx, () => null, null, { addLeads: fakeDb(calls), lookup: lookupOf(count), sleep: async () => {}, onProgress: (p) => progress.push(p) });
ok(res.ok, 'the add answered');
if (res.ok) {
  const commits = calls.filter((c) => c.commit);
  ok(calls.filter((c) => !c.commit).length === 1, 'ONE preview call (duplicates decided by the database)');
  ok(commits.length === 1 && res.saveCalls === 1, 'ONE committing call — not one per lead');
  ok(commits[0]?.n === 19, `the save holds all 19 new businesses (mobiles, 5 UK landlines, MY landline, no number, failed lookup) — got ${commits[0]?.n}`);
  ok(count.n === 19, `each NEW lead looked up once, none for the 3 already in the CRM — got ${count.n}`);
  const s = res.summary;
  ok(s.added === 19 && s.skipped === 3 && s.by.in_crm === 3, `added 19, skipped 3 (already in CRM) — got ${s.added}/${s.skipped}`);
  ok(addSummaryTitle(s) === 'Added 19, skipped 3' && addSummaryReasons(s) === '3 already in CRM', `"${addSummaryTitle(s)}" · "${addSummaryReasons(s)}"`);
  const saved = new Map(commits[0].rows.map((r) => [String(r.k), r]));
  ok(saved.has('ChIJland0001xx') && saved.has('ChIJland0441xx') && saved.has('ChIJmalay001xx'), 'UK and Malaysian landlines are saved');
  ok(saved.has('ChIJnone0001xx') && saved.has('ChIJfail0001xx'), 'no-number and failed-lookup leads are saved too ("No phone")');
  ok(!saved.has('ChIJdupe0001xx'), 'a duplicate is never saved');
  ok(res.lookups.made === 19 && res.lookups.withoutAnswer === 1, `lookup stats: 19 made, 1 without an answer — ${JSON.stringify(res.lookups)}`);
  ok(progress[0]?.phase === 'checking' && progress.some((p) => p.phase === 'lookups' && p.done === 3) && progress.at(-1)?.phase === 'done', 'progress: checking → lookups (duplicates count as done) → done');
  const lk = progress.filter((p) => p.phase === 'lookups').map((p) => p.done);
  ok(lk.every((d, i) => i === 0 || d >= lk[i - 1]), 'progress only moves forward');
  ok(addProgressText({ phase: 'lookups', done: 23, total: 40 }) === 'Adding 23 of 40', '"Adding 23 of 40"');
}

console.log('── 3. the cache: a second add of the same businesses looks nothing up again ──');
{
  const n2 = { n: 0 };
  const r = await runFindLeadsBulkAdd(leads.slice(0, 9), ctx, () => null, null, { addLeads: fakeDb([]), lookup: lookupOf(n2), sleep: async () => {} });
  ok(r.ok && n2.n === 0 && r.lookups.cached === 9, `9 results already looked up this session → 0 new lookups — got ${n2.n}`);
}

console.log('── 4. throttling waits and retries; a refusal stops lookups but never the add ──');
{
  clearLookupCache();
  let n = 0; const waits: number[] = [];
  const r = await runFindLeadsBulkAdd(leads.slice(0, 6), ctx, () => null, null, {
    addLeads: fakeDb([]),
    lookup: async (pid) => (++n <= 2 ? { throttled: true } : { phone: byId.get(pid)?.phone ?? null }),
    sleep: async (ms) => { waits.push(ms); },
  });
  ok(r.ok && r.summary.added === 6 && r.lookups.retries === 2 && waits.length === 2 && waits[0] === LOOKUP_RETRY_DELAYS_MS[0], `two 429s are waited out and retried; all 6 added — ${JSON.stringify(r.ok && r.lookups)}`);
}
{
  clearLookupCache();
  const r = await runFindLeadsBulkAdd(leads.slice(0, 4), ctx, () => null, null, {
    addLeads: fakeDb([]), lookup: async () => ({ throttled: true }), sleep: async () => {},
  });
  ok(r.ok && r.summary.added === 4 && r.lookups.withoutAnswer === 4, 'retries exhausted → still added, without a looked-up number');
}
{
  clearLookupCache();
  let n = 0;
  const r = await runFindLeadsBulkAdd(leads.slice(0, 8), ctx, () => null, null, {
    addLeads: fakeDb([]), lookup: async (pid) => (++n > 3 ? { limit: true } : { phone: byId.get(pid)?.phone ?? null }), sleep: async () => {},
  });
  ok(r.ok && r.summary.added === 8 && r.summary.skipped === 0, 'a refusal (paused / not allowed) stops further lookups; all 8 are still added');
  ok(r.ok && r.lookups.made <= 3 + PLACE_LOOKUP_CONCURRENCY, `…and lookups stop once the refusal is seen (made ${r.ok && r.lookups.made})`);
}
{
  const r = await runFindLeadsBulkAdd(leads.slice(0, 3), ctx, () => null, 'c1', {
    addLeads: async () => ({ ok: false, error: 'unknown_campaign' }), lookup: async () => null, sleep: async () => {},
  });
  ok(!r.ok && /campaign is not available/.test((r as { message: string }).message), 'a refused call adds nothing and says why');
}

console.log('── 5. concurrency and big batches ──');
{
  clearLookupCache();
  let inFlight = 0, peak = 0;
  const many: BulkAddLead[] = Array.from({ length: 40 }, (_, i) => ({ id: `ChIJforty${String(i).padStart(3, '0')}`, name: `ZZ QA Forty ${i}` }));
  const r = await runFindLeadsBulkAdd(many, () => ({ trade: 'plumbers', town: 'Rugby', country: 'UK' }), () => null, null, {
    addLeads: async (rows, _c, commit) => ({ ok: true, rows: rows.map((x) => ({ k: String(x.k), outcome: commit ? 'created' : 'new' } as AddRowAnswer)) }),
    lookup: async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((done) => setTimeout(done, 5)); inFlight--; return { phone: '01632 960999' }; },
    sleep: async () => {},
  });
  ok(r.ok && r.summary.added === 40 && peak === PLACE_LOOKUP_CONCURRENCY && PLACE_LOOKUP_CONCURRENCY >= 8 && PLACE_LOOKUP_CONCURRENCY <= 10, `40 leads: ${PLACE_LOOKUP_CONCURRENCY} lookups at a time (peak ${peak}), all 40 added`);
}
{
  clearLookupCache();
  const many: BulkAddLead[] = Array.from({ length: COVERAGE_ADD_MAX_ROWS + 20 }, (_, i) => ({ id: `ChIJbig${String(i).padStart(6, '0')}`, name: `ZZ QA Big ${i}` }));
  const cs: boolean[] = [];
  const r = await runFindLeadsBulkAdd(many, () => ({ trade: 'plumbers', town: 'Rugby', country: 'UK' }), () => null, null, {
    addLeads: async (rows, _c, commit) => { cs.push(commit); return { ok: true, rows: rows.map((x) => ({ k: String(x.k), outcome: commit ? 'created' : 'new' } as AddRowAnswer)) }; },
    lookup: async () => ({ phone: '07700 900999' }), sleep: async () => {},
  });
  ok(r.ok && cs.filter((c) => c).length === 2 && r.summary.added === COVERAGE_ADD_MAX_ROWS + 20, 'over the function ceiling: chunks of COVERAGE_ADD_MAX_ROWS');
}

console.log('── 6. the pages use it ──');
const page = readFileSync('src/pages/Index.tsx', 'utf8');
const table = readFileSync('src/components/LeadsTable.tsx', 'utf8');
const niche = readFileSync('src/components/NichePanel.tsx', 'utf8');
const hook = readFileSync('src/hooks/useFindLeadsBulkAdd.ts', 'utf8');
ok(/useFindLeadsBulkAdd\(\)/.test(page) && !/for \(const lead of sel\)/.test(page), 'Find Leads bulk add is the batch, not a per-lead loop');
ok(/coverage_add_leads/.test(hook) && /status === 429\) return \{ throttled: true \}/.test(hook), 'the batch saves through coverage_add_leads; a 429 is retried');
ok(/addProgress=\{addProgress\}/.test(page) && /addProgressText\(addProgress\)/.test(table), 'Find Leads shows "Adding N of M" on the bulk button');
ok(/bulkRunning\.current\) return;/.test(table), 'a second click while it runs does nothing');
ok(/campaignId, setProgress\)/.test(niche) && /addProgressText\(progress\)/.test(niche), 'the Coverage niche panel shows the same progress');
ok(!/Needs info/.test(readFileSync('src/components/LeadReadiness.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'no Needs info tag is drawn');
const gpd = readFileSync('supabase/functions/google-place-details/index.ts', 'utf8');
ok(!/checkRateLimit\(/.test(gpd) && /guardAction\(supabase, actor\.id, 'place_details'/.test(gpd), 'google-place-details: the in-memory 30/min counter is gone; the guard is the one limit');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
