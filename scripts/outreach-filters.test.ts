/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH FILTERS (2026-09-30, release D): Product and Country gone, Next Action + owner in, the
   stored data and the sending rules untouched. Run: npx tsx scripts/outreach-filters.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const table = read('src/components/OutreachTable.tsx');

console.log('── Product and Country are gone from the toolbar ──');
{
  ok(!/All products/.test(table) && !/placeholder="Product"/.test(table), 'no Product filter');
  ok(!/placeholder="Country"/.test(table) && !/🇦🇺 AUS/.test(table), 'no Country filter (its AUS option matched no lead)');
  ok(!/setProductFilter|setCountryFilter|countryFilter|productFilter/.test(table), 'no hidden Product / Country filter state left to hide leads');
  ok(!/parsed\.productFilter|parsed\.countryFilter/.test(table), 'an old saved Product / Country value is ignored on restore');
  ok(/setProductOn\(ids, v === PRODUCT_UNDECIDED/.test(table), 'the admin\'s bulk "Set product" (the data) is kept');
}

console.log('\n── the stored country still drives sending ──');
{
  ok(/formatPhoneForWhatsApp\(/.test(table) && /classifyLineType\(/.test(table), 'WhatsApp number format and the mobile check still read the lead\'s country');
  ok(/'country'/.test(read('src/lib/outreachLeadColumns.ts')), 'country is still read with every lead');
}

console.log('\n── Next Action and owner filters ──');
{
  ok(/passesNextActionFilter\(lead, naWhen, naKind, today\)/.test(table), 'Next Action day + type filter, the shared rule');
  ok(/NEXT_ACTION_WHEN_OPTIONS\.map/.test(table) && /NEXT_ACTION_KIND_OPTIONS\.map/.test(table), 'both selects are drawn');
  ok(!/perms\.assignOwner && \(\s*<Select value=\{naWhen\}/.test(table), 'the Next Action filters are for both roles');
  ok(/\{perms\.assignOwner && <OwnerFilterSelect value=\{ownerFilter\}/.test(table) && /if \(perms\.assignOwner && ownerFilter !== 'all'\)/.test(table), 'the owner filter is admin only (a salesperson\'s list is already their own leads)');
  ok(/naWhen,\s*naKind,\s*ownerFilter,/.test(table), 'the choices are remembered with the rest of the table state');
  ok(/naWhen !== 'all' \|\| naKind !== 'all' \|\| ownerFilter !== 'all'/.test(table) && /setNaWhen\('all'\); setNaKind\('all'\); setOwnerFilter\('all'\);/.test(table), 'the Filtered pill shows them and clears them');
  ok(/filteredAndSortedLeads = useMemo/.test(table) && /visibleWhileLoading\(loadState/.test(table), 'filters run over every loaded lead, not the visible page');
}

console.log('\n── sorts ──');
{
  ok(/next_action_date:asc">Next action: most overdue first/.test(table) && /comparison = nextActionSortKey\(a\)\.localeCompare\(nextActionSortKey\(b\)\)/.test(table), 'next action sort: most overdue first, a cleared action never sorts as due');
  ok(/last_contact:desc">Most recent contact/.test(table), 'most recent contact');
  ok(/created_at:desc">Newest added/.test(table) && /tracked:asc">Tracked first/.test(table), 'the useful existing sorts stay');
}

console.log('\n── the overdue count is the shared rule, and opens the list ──');
{
  ok(/passesNextActionFilter\(l, 'overdue', 'all', overdueToday\)/.test(table) && !/new Date\(new Date\(\)\.setHours\(0, 0, 0, 0\)\)/.test(table), 'London day, cleared actions excluded (it used the browser clock and counted cleared ones)');
  ok(/onClick=\{\(\) => \{ setNaWhen\('overdue'\)/.test(table), 'clicking it shows exactly those leads');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
