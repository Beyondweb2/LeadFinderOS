/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEAM VISIBILITY (Paul, 2026-11-16 — new salespeople start today; nobody may double up).
   1. Coverage: a town ANY teammate searched shows as searched for everyone, with who and when (per trade).
   2. Find Leads: a business already in the CRM shows "Added by <name> · <status>", whatever its status; an opt-out /
      Do Not Contact phone blocks Add even when no lead holds it. Ids stay masked for a salesperson.
   docs/multi-user.md §11. Migration 20261217090000_find_leads_lead_status.sql.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  coverageKey, coverageStateFor, searchersByPair, describeSearchers, summarise, COVERAGE_STATES, COVERAGE_LABEL, COVERAGE_ORDER,
  type CoverageFacts, type SearchRunRecord,
} from '../src/lib/coverageState.ts';
import { alreadyAddedLine, findLeadsStatusLabel, isStopStatus, FIND_LEADS_STATUS_LABEL } from '../src/lib/findLeadsLeadStatus.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');

console.log('── 1. COVERAGE: SEARCHED BY ANYONE = SEARCHED FOR EVERYONE ──');
const town = { id: 't1', name: 'Wisbech', region: 'East', population: 30000 };
const facts = (over: Partial<CoverageFacts> = {}): CoverageFacts => ({ leadPairs: new Set(), workedPairs: new Set(), ...over });
const k = coverageKey('plumbers', 'Wisbech');
ok(coverageStateFor('plumbers', town, facts({ searchedPairs: new Set([k]) })) === 'searched', 'a searched town with nothing added is "searched", not "untouched"');
ok(coverageStateFor('plumber', town, facts({ searchedPairs: new Set([k]) })) === 'searched', '…folded on the same trade key (plumber = plumbers)');
ok(coverageStateFor('locksmiths', town, facts({ searchedPairs: new Set([k]) })) === 'untouched', '…per trade: another trade in the same town is still untouched');
ok(coverageStateFor('plumbers', town, facts({ searchedPairs: new Set([k]), leadPairs: new Set([k]) })) === 'leads', 'added leads outrank searched');
ok(coverageStateFor('plumbers', town, facts({ searchedPairs: new Set([k]), leadPairs: new Set([k]), workedPairs: new Set([k]) })) === 'worked', 'contacted outranks both');
ok(coverageStateFor('plumbers', town, facts()) === 'untouched', 'no searchedPairs from an older endpoint → untouched, exactly as before');
ok(COVERAGE_STATES.join() === 'worked,leads,searched,untouched' && COVERAGE_LABEL.searched === 'Searched, none added' && COVERAGE_ORDER.searched === 2, 'the ladder has the new rung in effort order');
const s = summarise([{ ...town, state: 'searched' }, { ...town, id: 't2', state: 'untouched' }]);
ok(s.counts.searched === 1 && s.started === 1 && s.total === 2, 'a searched town counts as started in the headline');

const run = (by: string | null, at: string | null, trade = 'plumbers', t = 'wisbech'): SearchRunRecord => ({ trade, town: t, found: null, added: null, by, at });
const by = searchersByPair([
  run('u-paul', '2026-11-01T10:00:00Z'), run('u-chris', '2026-11-14T09:00:00Z'), run('u-paul', '2026-11-10T10:00:00Z'),
  run('u-paul', null), run(null, '2026-10-01T00:00:00Z'), run('u-amy', '2026-11-12T00:00:00Z', 'locksmiths'),
]).get(k) ?? [];
ok(by.length === 3 && by[0].id === 'u-chris' && by[1].id === 'u-paul' && by[1].count === 3 && by[1].lastAt === '2026-11-10T10:00:00Z', 'searchers: latest first, counted, the latest date kept (a run without a date never wins)');
ok(by[2].id === null && by[2].count === 1, 'a run with no searcher recorded is counted, never named');
ok(!by.some((x) => x.id === 'u-amy'), 'per trade: a locksmiths search is not a plumbers search');
const names: Record<string, string> = { 'u-paul': 'Paul', 'u-chris': 'Chris' };
const d = describeSearchers(by, (id) => names[id]);
ok(d.text === 'Searched by Chris · 14 Nov, +2 more', 'the line: who searched last and when, then how many others — ' + d.text);
ok(d.detail === 'Searched by Chris 14 Nov, Paul 10 Nov (3×), a teammate 1 Oct', 'the tooltip lists everyone — ' + d.detail);
ok(describeSearchers([], () => 'x').text === '', 'never searched → no line');
ok(describeSearchers([{ id: 'u-gone', count: 1, lastAt: null }], () => null).text === 'Searched by a teammate', 'an unnamed searcher is "a teammate", never a guess');

const cov = code('supabase/functions/coverage/index.ts');
ok(/from\("search_history"\)\.select\("keyword, location, found_keys, added_keys, user_id, searched_at"\)\s*\.order\("searched_at"/.test(cov), 'the endpoint reads every run in the book (no user filter) with who + when');
ok(/by: typeof r\.user_id === "string"/.test(cov) && /at: typeof r\.searched_at === "string"/.test(cov), '…and sends them on each run');
ok(/if \(who\.actor\.role === "sales"\) \{\s*const owner = await bookOwnerId\(service\);[\s\S]*?userId = owner;/.test(cov), 'a salesperson (a brand-new one too) reads the ONE book, not an empty one of their own');
const hook = read('src/hooks/useCoverage.ts');
ok(/searchedPairs: pairs\?\.runs\s*\? new Set\(pairs\.runs\.map\(\(r\) => coverageKey\(r\.trade, r\.town\)\)\)\s*: undefined/.test(hook), 'the hook builds searchedPairs from the runs; absent runs → undefined (never an empty set)');
ok(/<CoverageSearchedBy searchers=\{t\.searchers\}/.test(read('src/pages/Coverage.tsx')), 'the Coverage row shows who searched it, for every role');
ok(/searched: 'blue'/.test(read('src/pages/Coverage.tsx')), 'the new rung has its own colour');

console.log('── 2. FIND LEADS: ALREADY ADDED BY <NAME> · <STATUS> ──');
ok(alreadyAddedLine('Paul', 'opted_out') === 'Added by Paul · Opted out', 'Added by Paul · Opted out');
ok(alreadyAddedLine('Paul', 'archived', 'Chris') === 'Added by Paul · Archived', 'archived shows too');
ok(alreadyAddedLine(null, 'contacted', 'Chris') === 'Already added · Chris · Contacted', 'no adder on record → the owner');
ok(alreadyAddedLine(null, 'do_not_contact', null, false) === 'Do Not Contact', 'a DNC phone with no lead → the status alone');
ok(alreadyAddedLine('Paul', null) === 'Added by Paul' && alreadyAddedLine('Paul', 'some_new_key') === 'Added by Paul', 'an absent / unknown status shows none (never guessed)');
ok(isStopStatus('opted_out') && isStopStatus('do_not_contact') && isStopStatus('wrong_number') && !isStopStatus('archived') && !isStopStatus(null), 'stop statuses are marked red');
ok(findLeadsStatusLabel('not_contacted') === 'Not contacted yet' && Object.keys(FIND_LEADS_STATUS_LABEL).length === 8, 'eight status keys, one label each');

const mig = code('supabase/migrations/20261217090000_find_leads_lead_status.sql');
const SERVER_KEYS = new Set([...mig.matchAll(/then '([a-z_]+)'/g)].map((m) => m[1]).filter((x) => x in FIND_LEADS_STATUS_LABEL));
ok(Object.keys(FIND_LEADS_STATUS_LABEL).every((key) => mig.includes("'" + key + "'")), 'every label key is one the server can send');
ok(SERVER_KEYS.size >= 7, 'the server sends the status keys the screen knows (' + [...SERVER_KEYS].join(', ') + ')');
ok(/returns table \(k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamptz, added_by_name text, lead_status text\)/.test(mig), 'the lookup gains ONE column, lead_status, at the end');
ok(mig.indexOf("then 'opted_out'") < mig.indexOf("then 'client'") && mig.indexOf("then 'do_not_contact'") < mig.indexOf("then 'archived'"), 'safety first: an opt-out / DNC wins over client and archived');
ok(/when coalesce\(sf\.supp, false\) then 'protected'/.test(mig) && /from public\.contact_suppressions s\s*where s\.phone_e164 in \(select it\.e164/.test(mig), 'a phone on the opt-out / DNC list with no lead is refused (protected), not offered as new');
ok(/case when v_role = 'admin' or r\.state in \('yours', 'claimable'\) then r\.lead_id end/.test(mig) && /case when v_role = 'admin' or r\.state = 'yours' then r\.owner_id end/.test(mig), 'ids stay masked for a salesperson (unchanged)');
ok(/v_g := public\.guard_action\(v_uid, 'lead_lookup'/.test(mig), 'the salesperson rate limit stays');
ok(/revoke all on function public\.lead_identity_lookup\(jsonb\) from public, anon;/.test(mig) && /grant execute on function public\.lead_identity_lookup\(jsonb\) to authenticated;/.test(mig), 'grants restated: anon none, signed-in yes');
ok(!/create or replace function public\.(sales_add_lead|coverage_add_leads|_lead_identity_rows|lead_claim_block)\b/.test(mig), 'the add / claim rules are not touched');

const own = read('src/components/FindLeadsOwnership.tsx');
ok(/leadStatus=\{own\.leadStatus\}/.test(own) && /isAlreadyAdded\(own: OwnershipInfo \| null \| undefined\): boolean \{\s*return !!own && own\.state !== 'new' && own\.state !== 'paused';/.test(own), 'the badge gets the status; anything not new (protected DNC included) has no Add and is left out of bulk select');
ok(/leadStatus: hit\.lead_status \?\? null/.test(read('src/pages/Index.tsx')), 'Find Leads passes the server status through');

console.log(f === 0 ? '\nALL PASS' : '\n' + f + ' FAILURE(S)');
process.exit(f === 0 ? 0 : 1);
