/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO NEW WRITE STORES THE PRE-STAR STATUS 'interested', AND THE OPEN INBOX CONVERSATION STAYS PINNED
   (2026-10-02, docs/outreach-workspace.md §I). Live SQL half: supabase/tests/no-legacy-interested.sql
   (13 rolled-back checks: direct update, insert, lead_set_stage as admin and as sales, a raw revive,
   a previous_status restore, a legacy row).
   Run: node scripts/run-tests.mjs no-legacy-interested
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { statusUpdatePatch } from '../src/lib/statusPatch.ts';
import { planSalesPatch } from '../src/lib/salesPatchPlan.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('── the database refuses to store a NEW interested status ──');
const mig = read('supabase/migrations/20261002140000_no_legacy_interested_status.sql');
ok(/if _status = 'interested' then\n\s+return public\.lead_mark_interested\(_lead_id, true\);/.test(mig), 'lead_set_stage("interested") → the star (lead_mark_interested), no status write');
ok(mig.indexOf("if _status = 'interested' then") < mig.indexOf('update public.outreach_leads set status = _status'), '…decided before the status write');
ok(/before insert or update of status on public\.outreach_leads/.test(mig), 'a BEFORE trigger on every insert and status update (admin, service role, SQL)');
ok(/if new\.status = 'interested' and \(tg_op = 'INSERT' or old\.status is distinct from 'interested'\) then\n\s+new\.status := case when tg_op = 'UPDATE' then old\.status else 'not_contacted' end;\n\s+new\.is_potential_work := true;/.test(mig), '…a new interested becomes the star, the real status kept; a row already holding it is history');
ok('trg_outreach_leads_no_legacy_interested' < 'trg_outreach_leads_not_interested_clears_star' && 'trg_outreach_leads_no_legacy_interested' < 'trg_outreach_leads_sold_by', '…it fires before the other status triggers (Postgres runs BEFORE triggers by name)');
ok(!/delete from|update public\.outreach_leads set status = 'interested'/.test(mig), 'no historical row is deleted or rewritten');

console.log('\n── no client request asks for it ──');
ok(JSON.stringify(statusUpdatePatch('interested' as never)) === JSON.stringify({ is_potential_work: true }), 'the admin status patch for "Interested" writes only the star');
ok(planSalesPatch({ status: 'interested' }).steps.every((s) => s.fn === 'lead_mark_interested'), 'a salesperson\'s "Interested" is lead_mark_interested, never lead_set_stage');
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []);
const sources = [...walk('src'), ...walk('supabase/functions')].filter((p) => !p.endsWith('integrations/supabase/types.ts') && !p.endsWith('lib/demoLeads.ts'));
const writers = sources.filter((p) => /status: ["']interested["']|_status: ["']interested["']|status = ["']interested["']/.test(read(p)));
ok(writers.length === 0, `no source writes status "interested" (${sources.length} files swept${writers.length ? ': ' + writers.join(', ') : ''})`);

console.log('\n── the open conversation stays pinned when nothing matches ──');
const inbox = read('src/pages/Inbox.tsx');
ok(inbox.includes(') : shownList.length === 0 ? (') && !inbox.includes(') : filteredList.length === 0 ? ('), 'the empty state waits for shownList (which pins the open conversation), not filteredList');
ok(/const activeOutsideFilters = !!activeKey && !filteredList\.some\(\(c\) => c\.key === activeKey\) && shownList\.some\(\(c\) => c\.key === activeKey\);/.test(inbox), '…the "outside your current filters" marker is unchanged');
ok(inbox.includes('onClick={() => setBulkSelected(new Set(filteredList.map((c) => c.key)))}'), '…and a pinned row is never counted as a match (select-all reads filteredList)');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
