/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BUSINESS AGE ON EVERY NEW FIND LEADS SEARCH (2026-10-02, Paul: "not starting on new searches").
   ROOT CAUSE: search-leads never asked Google for the address, so every result reached Find Leads with
   none, isCompaniesHouseTarget (UK address + no website) was false for all of them, and the checker was
   handed nothing — on every search. Plus three lifecycle faults in the checker itself (no immediate
   "Checking…", late results of a superseded run lost, an empty set not resetting). Pins the runner
   (src/lib/companiesHouseRunner.ts), the hook wiring, and the address on search results.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { CH_CHECK_VERSION, isCompaniesHouseTarget, listingFingerprint, type CompaniesHouseCheckRow } from '../src/lib/companiesHouse.ts';
import { chTargetsOf, createChRunner, type ChLookupResult, type ChTarget } from '../src/lib/companiesHouseRunner.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const tick = () => new Promise((r) => setTimeout(r, 0));

const NOW = Date.parse('2026-10-02T09:00:00Z');
const lead = (id: string, town = 'Sheffield', pc = 'S1 2AB') => ({ id, name: `Biz ${id}`, address: `1 High St, ${town} ${pc}, UK` });
const rowOf = (t: { id: string; name: string; address: string }, match: 'strong' | 'possible' | 'none' = 'none'): CompaniesHouseCheckRow => ({
  place_id: t.id, fingerprint: listingFingerprint(t.name, t.address), business_name: t.name, postcode: null, town: null, match,
  company_number: null, company_name: null, company_status: null, company_type: null, incorporated_on: null,
  registered_locality: null, registered_postcode: null, evidence: [], candidates_seen: 0, version: CH_CHECK_VERSION,
  checked_at: new Date(NOW - 3_600_000).toISOString(),
} as unknown as CompaniesHouseCheckRow);

/** A runner over a fake database and a fake Companies House; every call is recorded. */
function harness(stored: CompaniesHouseCheckRow[] = [], opts: { hold?: boolean; error?: string } = {}) {
  const db = new Map(stored.map((r) => [r.place_id, r]));
  const looked: string[] = [];
  const reads: string[][] = [];
  const held = new Map<string, (r: ChLookupResult) => void>();
  const runner = createChRunner({
    concurrency: 6, now: () => NOW,
    readStored: async (ids) => { reads.push(ids); return ids.map((i) => db.get(i)).filter((r): r is CompaniesHouseCheckRow => !!r); },
    lookup: (t: ChTarget) => {
      looked.push(t.id);
      if (opts.error) return Promise.resolve({ ok: false, error: opts.error });
      const res = { ok: true, check: rowOf(t) };
      if (opts.hold) return new Promise<ChLookupResult>((r) => held.set(t.id, r)).then(() => res);
      return Promise.resolve(res);
    },
  });
  return { runner, looked, reads, held, release: (id: string) => held.get(id)?.({ ok: true }) };
}
const T = (ls: ReturnType<typeof lead>[]) => chTargetsOf(ls);

console.log('── 0. THE ROOT CAUSE: SEARCH RESULTS NOW CARRY THE ADDRESS ──');
{
  const s = read('supabase/functions/search-leads/index.ts');
  const masks = s.match(/const FIELD_MASK = '[^']*'/g) ?? [];
  ok(masks.length === 3 && masks.every((m) => m.includes('places.formattedAddress')), 'every Text Search field mask asks for places.formattedAddress (3 of 3)');
  ok((s.match(/address: place\.formattedAddress \|\| undefined,/g) ?? []).length === 3, 'every result builder puts it on the result as address (3 of 3)');
  ok(/address\?: string;/.test(s) && /FREE for the same reason as\s+primaryType/.test(s), 'SearchLead carries address; recorded as free (the mask already bills at Enterprise for websiteUri)');
  ok(/cachedWithoutAddresses = cachedList\.length > 0 && !cachedList\.some/.test(s) && /if \(cached\?\.results && !cachedWithoutAddresses\)/.test(s), 'a cached set from before the fix (no addresses at all) is fetched fresh once, not served for 72 hours');
  ok(!isCompaniesHouseTarget({ id: 'x', websiteStatus: 'NO_WEBSITE', address: undefined }) && isCompaniesHouseTarget({ id: 'x', websiteStatus: 'NO_WEBSITE', address: '1 High St, Sheffield S1 2AB, UK' }),
    'why it mattered: with no address nothing was a target; with the Google address a UK no-website result is');
  ok(!isCompaniesHouseTarget({ id: 'x', websiteStatus: 'HAS_OWN_WEBSITE', address: '1 High St, Sheffield S1 2AB, UK' }), 'a result with a website is still never checked (shown as —)');
  ok(!/useCompaniesHouseChecks/.test(read('src/components/LeadsTable.tsx')), 'Find Leads no longer hands results to the checker (Business age removed 2026-10-09 — no Companies House calls from the search)');
}

console.log('── 1. SEARCH A, THEN SEARCH B WITH DIFFERENT LEADS ──');
{
  const h = harness([rowOf(lead('a1'))]);
  const A = T([lead('a1'), lead('a2'), lead('a3'), lead('a4')]);
  const pA = h.runner.setTargets(A);
  ok(['a1', 'a2', 'a3', 'a4'].every((id) => h.runner.state().checking.has(id)), 'Search A: every eligible row is Checking… at once (before any read lands)');
  await pA;
  ok(JSON.stringify(h.looked) === JSON.stringify(['a2', 'a3', 'a4']), `Search A: stored a1 resolves from the cache, a2–a4 go to Companies House (looked up ${h.looked.join(',')})`);
  ok(A.every((t) => !!h.runner.rowFor(t.id, t.fp)) && h.runner.state().checking.size === 0, 'Search A: every row filled, nothing left checking');
  const B = T([lead('b1', 'Exeter', 'EX1 1AA'), lead('b2', 'Exeter', 'EX1 1AA'), lead('b3', 'Exeter', 'EX1 1AA')]);
  const pB = h.runner.setTargets(B);
  ok(['b1', 'b2', 'b3'].every((id) => h.runner.state().checking.has(id)) && h.runner.state().checking.size === 3, "Search B (no refresh): B's rows are Checking… at once, A's are not");
  await pB;
  ok(['b1', 'b2', 'b3'].every((id) => h.looked.includes(id)), 'Search B: Companies House checks run for every one of B’s eligible leads');
  ok(B.every((t) => !!h.runner.rowFor(t.id, t.fp)) && h.runner.state().checking.size === 0, 'Search B: every row filled, then settled (rows may reorder)');
  ok(h.reads.length === 2 && h.reads[1].join() === 'b1,b2,b3', 'each new search reads the stored checks for its own rows');
}

console.log('── 2. SEARCH B WITH SOME CACHED AND SOME NEW BUSINESSES ──');
{
  const h = harness([rowOf(lead('db1'))]);
  await h.runner.setTargets(T([lead('s1'), lead('s2')]));
  h.looked.length = 0;
  const B = T([lead('s1'), lead('db1'), lead('n1'), lead('n2')]);
  const p = h.runner.setTargets(B);
  ok(!h.runner.state().checking.has('s1') && !!h.runner.rowFor('s1', B.find((t) => t.id === 's1')!.fp), 'a business already checked this session shows its result at once (not Checking…)');
  ok(['db1', 'n1', 'n2'].every((id) => h.runner.state().checking.has(id)), 'the rest are Checking…');
  await p;
  ok(JSON.stringify(h.looked) === JSON.stringify(['n1', 'n2']), `only the new businesses go to Companies House (looked up ${h.looked.join(',')}); db1 comes from the stored checks`);
  ok(B.every((t) => !!h.runner.rowFor(t.id, t.fp)), 'all four filled');
  const renamed = T([{ ...lead('s2'), name: 'Biz s2 Renamed' }]);
  await h.runner.setTargets(renamed);
  ok(h.looked.includes('s2'), 'a listing that changed (new name) is looked up again, not served the old result');
}

console.log('── 3. A NEW SEARCH WHILE THE LAST IS STILL CHECKING ──');
{
  const h = harness([], { hold: true });
  const A = T([lead('x1'), lead('x2')]);
  void h.runner.setTargets(A);
  await tick(); await tick();
  ok(h.looked.join() === 'x1,x2', 'Search A has two lookups in flight');
  const B = T([lead('x2'), lead('y1')]);
  const pB = h.runner.setTargets(B);
  ok(h.runner.state().checking.has('x2') && h.runner.state().checking.has('y1') && !h.runner.state().checking.has('x1'), "Search B takes over: B's rows Checking…, A's x1 no longer counted");
  await tick(); await tick();
  ok(h.looked.filter((id) => id === 'x2').length === 1, 'x2 (in flight for A, also in B) is awaited, never looked up twice');
  h.release('x1'); h.release('x2'); await tick(); await tick();
  ok(!!h.runner.rowFor('x1', A[0].fp), "A's late x1 result is KEPT (it used to be saved, then skipped as done, never drawn)");
  h.release('y1'); await pB;
  ok(B.every((t) => !!h.runner.rowFor(t.id, t.fp)) && h.runner.state().checking.size === 0, "B's rows all filled; settled");
}

console.log('── 4. EDGES ──');
{
  const h = harness([], { hold: true });
  void h.runner.setTargets(T([lead('z1')]));
  await tick();
  await h.runner.setTargets([]);
  ok(h.runner.state().checking.size === 0, 'a search with no eligible rows clears the last run’s Checking… (the finished order is not held back)');
  const off = harness([], { error: 'not_configured' });
  await off.runner.setTargets(T([lead('q1'), lead('q2'), lead('q3')]));
  ok(off.runner.state().stoppedBecause === 'not_configured' && off.runner.state().checking.size === 0, 'not connected: the run stops, the rest read Not checked with the reason');
  const broken = createChRunner({ concurrency: 2, now: () => NOW, readStored: async () => { throw new Error('read failed'); }, lookup: async (t) => ({ ok: true, check: rowOf(t) }) });
  const L = T([lead('r1')]);
  await broken.setTargets(L);
  ok(!!broken.rowFor('r1', L[0].fp), 'a failed read of the stored checks fails safe: it is looked up');
}

console.log('── 5. THE HOOK ──');
{
  const hook = read('src/hooks/useCompaniesHouseChecks.ts');
  ok(/const runner = createChRunner\(/.test(hook) && /runner\.setTargets\(targets\)/.test(hook) && /\[key\]\)/.test(hook), 'the hook is a thin wrapper: one runner, a new run on every change of the target set');
  ok(!/if \(!targets\.length\) return;/.test(hook), 'an empty set is not skipped (it resets)');
  ok(/const starting = s\.key !== key;/.test(hook), 'the render before a new run starts already shows Checking…');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
