/* FINDABLE'S OWN SITE IN SEARCH CONSOLE — kept apart from paid-client reporting (2026-10-02).
   findable.live rides the existing performance-sync (same credential, same cron) but must never be
   counted as a client: no lead, no client tables, no fake "paid lead". Static checks on the real
   source, because the live path cannot run here without the Google credential. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWN_SITE_KEY, resolvePerformanceState } from '../src/lib/searchPerformance.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const sync = read('supabase/functions/performance-sync/index.ts');
const load = read('supabase/functions/_shared/admin-overview-load.ts');
const sql = read('supabase/migrations/20261002090000_own_site_search_console.sql');
const fnBody = (src: string, name: string) => { const i = src.indexOf(`async function ${name}(`); const j = src.indexOf('\nasync function ', i + 10); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j); };

console.log('-- the own-site sync writes ONLY own_site_* --');
const own = fnBody(sync, 'syncOwnSite');
ok(own.length > 0, 'syncOwnSite exists');
ok(/own_site_search_page_daily/.test(own) && /own_site_search_query_daily/.test(own), 'it writes the own-site page and query tables');
ok(!/search_console_(page|query)_daily/.test(own) && !/lead_id/.test(own), 'and never the client tables, never a lead');
const client = fnBody(sync, 'syncClient');
ok(client.length > 0 && !/own_site_search/.test(client), 'the client sync never touches own_site_*');

console.log('\n-- the daily run syncs findable.live whether or not any client is connected --');
const daily = fnBody(sync, 'daily');
ok(daily.indexOf('runOwnSite(') > -1 && daily.indexOf('runOwnSite(') < daily.indexOf('if (!conns.length) return'), 'own site runs before the "no connected clients" early return');
ok(/status: "not_configured"[^}]*own_site: "not_configured"/.test(daily), 'no credential -> recorded as not configured, nothing fetched');
ok(!/GOOGLE_SERVICE_ACCOUNT_JSON\s*=|private_key"\s*:/.test(sync), 'no credential hardcoded');

console.log('\n-- the property is ONE record, and the browser cannot touch any of it --');
ok(/insert into public\.own_site_search_property \(site_key, gsc_property, canonical_domain\)\s*values \('findable', 'sc-domain:findable\.live', 'findable\.live'\)\s*on conflict \(site_key\) do nothing/.test(sql), 'one seeded property record: findable -> sc-domain:findable.live');
ok(OWN_SITE_KEY === 'findable', 'OWN_SITE_KEY matches the seeded record');
for (const t of ['own_site_search_property', 'own_site_search_page_daily', 'own_site_search_query_daily']) {
  ok(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t}: RLS on`);
}
ok(!/create policy/i.test(sql), 'and no policy: service role only, like the client tables');
ok(/revoke all on function public\.own_site_search_page_totals[^;]*from public, anon, authenticated/.test(sql), 'the totals functions are revoked from the browser roles');

console.log('\n-- the dashboard shows real numbers or an honest state, never an estimate --');
ok(/ownSearch/.test(load) && /own_site_search_page_totals/.test(load), 'admin-overview reads the own-site totals');
ok(!/own_site_search/.test(load.slice(load.indexOf('Google Search Console per paying client'), load.indexOf("FINDABLE'S OWN SITE in Search Console"))), 'the paid-client block does not read own_site_*');
ok(resolvePerformanceState({ gsc_property: 'sc-domain:findable.live', status: 'not_connected', last_sync_error: null } as never, 0) === 'not_connected', 'seeded record with no sync -> Not connected');
ok(resolvePerformanceState({ gsc_property: 'sc-domain:findable.live', status: 'connected', last_sync_error: null } as never, 0) === 'no_data', 'connected but no rows -> no data (not zero clicks)');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
