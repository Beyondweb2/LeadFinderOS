/* ============================================================
   FIND LEADS — MANY TOWNS (Paul, 2026-10-16: V2's "Many towns" mode, ported as behaviour).

   Pins: Coverage's ticked towns open Find Leads in Many towns mode with those towns selected (one town = the single
   row link, byte for byte); one press searches up to MANY_TOWNS_MAX_PER_PRESS, MANY_TOWNS_CONCURRENCY at a time, the
   rest stay selected; EACH TOWN IS THE ONE-TOWN SEARCH (the same fetchTown step, exclusions, ordering and its own
   search_history run); results land in the same table in town order, a business found twice shown once; a refusal
   stops new towns; Add saves each result with its own town. The single-row link and the niche panel are unchanged.

   Run: npx tsx scripts/find-leads-many-towns.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { findLeadsHref } from '../src/lib/coverageState';
import {
  MANY_TOWNS_CONCURRENCY, MANY_TOWNS_MAX_PER_PRESS, MANY_TOWNS_MAX_SELECTED, manyTownsHref, mergeTownLeads, parseTownList, runPool, townLineWords, townsForPress,
} from '../src/lib/manyTowns';
import { DEFAULT_PROTECTION_LIMITS } from '../src/lib/protectionLimits';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

(async () => {
  console.log('\n── 1. COVERAGE → FIND LEADS ──');
  {
    ok(manyTownsHref('plumber', ['Bedford'], 'UK') === findLeadsHref('plumber', 'Bedford', 'UK'), 'one ticked town = the single-row link, byte for byte');
    const href = manyTownsHref('plumber', ['Luton', 'Northampton', 'Milton Keynes'], 'UK')!;
    const q = new URLSearchParams(href.split('?')[1]);
    ok(href.startsWith('/find-leads?') && q.get('mode') === 'many' && q.get('keyword') === 'plumber' && q.get('country') === 'UK', 'several towns = Find Leads in Many towns mode, same trade and country');
    ok(q.get('towns') === 'Luton|Northampton|Milton Keynes', 'the towns, in the table\'s order');
    ok(!q.has('run') && !q.has('location'), 'nothing is searched on arrival — the person presses Find leads');
    ok(manyTownsHref('plumber', [], 'UK') === null, 'no towns → no link');
    ok(parseTownList(' Luton |luton||  Milton  Keynes ').join('|') === 'Luton|Milton Keynes', 'blanks and repeats dropped, first spelling kept');
    ok(parseTownList(Array.from({ length: 300 }, (_, i) => `T${i}`)).length === MANY_TOWNS_MAX_SELECTED, 'a pasted list is capped');
  }

  console.log('\n── 2. ONE PRESS ──');
  {
    ok(MANY_TOWNS_MAX_PER_PRESS === 10 && MANY_TOWNS_CONCURRENCY === 2, 'up to 10 towns a press, 2 at a time (V2)');
    const twelve = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const p = townsForPress(twelve);
    ok(p.run.length === 10 && p.later.join() === 'T10,T11', 'the first ten run; the rest stay selected');
    ok(MANY_TOWNS_MAX_PER_PRESS <= DEFAULT_PROTECTION_LIMITS.actions.lead_search.per_min, 'a press never asks for more searches than the lead_search per-minute burst allows');
    let live = 0, peak = 0; const order: string[] = [];
    await runPool(['a', 'b', 'c', 'd', 'e'], MANY_TOWNS_CONCURRENCY, async (t) => { live++; peak = Math.max(peak, live); order.push(t); await new Promise((r) => setTimeout(r, 10)); live--; });
    ok(peak === 2 && order.join('') === 'abcde', 'never more than two at once, started in order');
  }

  console.log('\n── 3. ONE LIST, IN TOWN ORDER, EACH BUSINESS ONCE ──');
  {
    const L = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, googleMapsUrl: `https://maps/?cid=${id}`, ...extra });
    const m = mergeTownLeads(['Luton', 'Dunstable'], [
      { town: 'Dunstable', leads: [L('d1', 'Dun Plumbing'), L('l2', 'Shared Heating')] },
      { town: 'Luton', leads: [L('l1', 'Luton Plumbing'), L('l2', 'Shared Heating')] },
    ]);
    ok(m.leads.map((l) => l.id).join() === 'l1,l2,d1', 'town order, not finishing order; the business found in both shown once, under the first town');
    ok(m.alsoIn.Dunstable === 1 && !m.alsoIn.Luton, '…and the second town says one was already shown');
    const byPhone = mergeTownLeads(['A', 'B'], [{ town: 'A', leads: [L('x1', 'Bob Plumbing', { phone: '07700 900111', googleMapsUrl: null })] }, { town: 'B', leads: [L('x2', 'Bob  plumbing', { phone: '+44 7700 900111', googleMapsUrl: null })] }]);
    ok(byPhone.leads.length === 1, 'the same name and phone is the same business');
    ok(townLineWords({ town: 'A', state: 'done', found: 4, duplicates: 1 }) === '4 found (1 already shown above)', 'a town line says what it found');
  }

  console.log('\n── 4. EACH TOWN IS THE ONE-TOWN SEARCH ──');
  {
    const ctx = read('src/contexts/LeadSearchContext.tsx');
    const searchFn = ctx.slice(ctx.indexOf('  const search = useCallback('), ctx.indexOf('  /** The page states a trial'));
    const manyFn = ctx.slice(ctx.indexOf('  const searchMany = useCallback('), ctx.indexOf('  const retryLastSearch'));
    ok((ctx.match(/supabase\.functions\.invoke<SearchResponse>\('search-leads'/g) ?? []).length === 1, 'ONE search-leads call site: the shared step');
    ok(/await fetchTown\(filters, controller\.signal, skipTrialCount, isDemo\)/.test(searchFn) && /shownResults\(data, ex\)/.test(searchFn) && /saveSearch\(filters,/.test(searchFn), 'one search: the shared step, the shared exclusions/order, its search_history run');
    ok(/await fetchTown\(filters, controller\.signal, false, false\)/.test(manyFn) && /shownResults\(r\.data, ex\)/.test(manyFn) && /saveSearch\(filters, shown\.length, noWebsiteCount, r\.data\.leads/.test(manyFn), 'each town: the same step, the same exclusions/order, its OWN search_history run (Coverage Found vs Added per town)');
    ok(/const filters: SearchFilters = \{ \.\.\.base, keyword, location: town \}/.test(manyFn), 'each town is sent as an ordinary search of that town');
    ok(/searchTown: town, searchCountry: townCountry, \.\.\.\(runId \? \{ searchRunId: runId \} : \{\}\)/.test(manyFn), 'each result carries its town, country and run');
    ok(/if \(r\.kind === 'code'\) \{ stopped = true;/.test(manyFn) && /if \(r\.refusal\) stopped = true;/.test(manyFn) && /if \(stopped \|\| controller\.signal\.aborted\) \{ setLine\(town, \{ state: 'not_searched' \}\)/.test(manyFn), 'a refusal stops new towns starting; a plain failure does not');
    ok(/townsForPress\(towns\)/.test(manyFn) && /runPool\(plan\.run, MANY_TOWNS_CONCURRENCY/.test(manyFn), 'up to ten, two at a time');
    ok(/return lines\.filter\(\(l\) => l\.state === 'done' \|\| l\.state === 'not_found'\)/.test(manyFn), 'searched towns leave the selection; failed and not-searched stay');
  }

  console.log('\n── 5. FIND LEADS PAGE AND THE TABLE ──');
  {
    const page = read('src/pages/Index.tsx');
    const form = read('src/components/SearchForm.tsx');
    const table = read('src/components/LeadsTable.tsx');
    ok(/useState\(\(\) => searchParams\.get\('mode'\) === MANY_MODE_VALUE\)/.test(page) && /parseTownList\(searchParams\.get\(MANY_TOWNS_PARAM\)\)/.test(page), 'mode=many opens Many towns with the towns selected');
    ok(/next\.delete\(MANY_TOWNS_PARAM\)/.test(page), 'the towns are taken once and stripped from the URL');
    ok(/if \(readiness\.gated && !readiness\.ready\)/.test(page.slice(page.indexOf('const handleSearchMany'))), 'the same selling gate as one search');
    ok(/addToOutreach\(lead, countryOf\(lead\), 'no_website', campaignId, getEnrichment\(lead\.id\), true, lastSearchKeyword, townOf\(lead\)\)/.test(page)
      && /addToOutreach\(lead, countryOf\(lead\), 'no_website', activeCampaign/.test(page) && /addToOutreach\(p\.lead, countryOf\(p\.lead\)/.test(page)
      && !/addToOutreach\([^)]*lastSearchLocation\)/.test(page), 'every Add saves the result with ITS town and country');
    ok(/lead\.searchTown \?\? lastSearchLocation/.test(page), '…and a one-town result exactly as before');
    ok(/onSearchMany\(\{ keyword: keyword\.trim\(\), radius: radius \* 1000, country: selectedCountry, townOnly: true \}\)/.test(form), 'the form sends the one-town filters, each town only');
    ok((form.match(/onSearch\(\{/g) ?? []).length === 1, 'the one-town search still has ONE place that builds its filters');
    ok((table.match(/data-testid="result-town"/g) ?? []).length === 2, 'the same table, each row naming its town (desktop and phone)');
    ok(/<LeadsTable/.test(page) && !/ManyTownsResults|MultiTownTable/.test(page), 'results are the ordinary Find Leads table — no second results list');
  }

  console.log('\n── 6. UNCHANGED ──');
  {
    const cov = read('src/pages/Coverage.tsx');
    ok(/<Link to=\{findLeadsHref\(tradeSearchWord\(trade\), townLocation\(t\.name\), country\)\}/.test(cov), 'the single-row Find leads link is unchanged');
    ok(/manyTownsHref\(tradeSearchWord\(trade\), selectedTowns\.map\(\(t\) => t\.location\), country\)/.test(cov) && /'Find leads in these ' \+ selectedTowns\.length \+ ' towns'/.test(cov), 'ticked towns: one button, "Find leads in these N towns"');
    ok(!/CoverageMultiTown|multiTownSearch|useMultiTownLeads/.test(cov), 'the in-Coverage multi-town search is gone');
    for (const gone of ['src/components/CoverageMultiTown.tsx', 'src/hooks/useMultiTownLeads.ts', 'src/lib/multiTownSearch.ts']) ok(!fs.existsSync(path.join(ROOT, gone)), `${gone} deleted`);
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
  process.exit(failures ? 1 : 0);
})();
