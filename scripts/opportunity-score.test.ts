/* The opportunity score (2026-11-16, src/lib/opportunityScore.ts, docs/OPPORTUNITY_SCORE.md). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  OPP_BENCH, OPP_EXACT_READS, OPP_SIGNALS, OPP_WEBSITE_MAX, OPP_AI_NOT_NAMED, OPP_WORTH_MAX, OPP_WINNABLE_MAX, OPP_LOWERED_CAP,
  oppBand, oppSortKey, opportunityScore, topReasons, type OppAuditFacts, type OppLeadFacts, type OppWebsiteFacts,
} from '../src/lib/opportunityScore.ts';
import { CLIENT_HIDDEN_KINDS, ACCURACY_BAR } from '../src/lib/websiteCheckAccuracy.ts';
import type { StoredAuditScore } from '../src/lib/auditScore.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const lead = (o: Partial<OppLeadFacts> = {}): OppLeadFacts => ({ website: 'https://example.co.uk', phone: '07700 900123', country: 'UK', status: 'not_contacted', hasGoogleListing: true, reviewCount: 25, rating: 4.7, ...o });
const site = (ids: string[], o: Partial<OppWebsiteFacts> = {}): OppWebsiteFacts => ({ depth: 'deep', issueIds: ids, siteScore: 55, siteState: 'scored', ...o });
const score = (named: number, expected = 6, complete = true): StoredAuditScore => ({ v: 1, complete, chatgpt: { named: 0, valid: 3 }, gemini: { named, valid: 3 }, googleAi: { named: 0, shown: 0 }, scored: { named, expected, method: 1 }, share: null });
const audit = (named: number, o: Partial<OppAuditFacts> = {}): OppAuditFacts => ({ score: score(named), updating: false, ...o });

/* ── Only checks that passed the bench ── */
const used = new Set(OPP_SIGNALS.flatMap((s) => s.kinds));
for (const k of used) {
  const b = OPP_BENCH[k];
  ok(!CLIENT_HIDDEN_KINDS.has(k), `${k}: not a kind hidden for failing the bench`);
  ok(!!b ? b[0] / b[1] >= ACCURACY_BAR : OPP_EXACT_READS.has(k), `${k}: bench ≥ 90% (${b ? b.join('/') : 'exact one-file read'})`);
}
ok(!used.has('slow_pages') && !used.has('some_slow_pages'), 'page timing is never read (not on the bench)');
/* the bench numbers here match the bench run on disk */
{
  const truth = JSON.parse(read('scripts/website-check-bench/truth.json')) as Record<string, Record<string, [string, string]>>;
  const results = JSON.parse(read('scripts/website-check-bench/results/replay-post.json')) as Array<{ slug: string; issues: Array<{ id: string }> }>;
  const tally: Record<string, [number, number]> = {};
  for (const r of results) { const key = truth[r.slug]; if (!key || (key as { _excluded?: unknown })._excluded) continue; for (const i of r.issues) { const v = key[i.id]?.[0]; if (v !== 'T' && v !== 'F') continue; const t = tally[i.id] ?? [0, 0]; if (v === 'T') t[0]++; t[1]++; tally[i.id] = t; } }
  for (const [k, [r, n]] of Object.entries(OPP_BENCH)) ok((tally[k]?.[0] ?? -1) >= r && (tally[k]?.[1] ?? -1) >= n && tally[k][0] / tally[k][1] >= ACCURACY_BAR, `${k}: OPP_BENCH ${r}/${n} agrees with the bench run (${tally[k]?.join('/') ?? 'none'})`);
}

/* ── ICP: AI ignores them and the website is the reason → Hot ── */
const icp = opportunityScore(lead(), site(['no_service_pages', 'ct_areas_not_stated', 'no_business_schema']), audit(0));
ok(icp.kind === 'scored' && icp.band === 'hot' && icp.critical, `ICP lead is Hot with a critical issue (${icp.kind === 'scored' ? icp.score : icp.kind})`);
ok(icp.kind === 'scored' && icp.parts.website === 48, 'two criticals + one big = 48');
const capped = opportunityScore(lead(), site(['no_service_pages', 'ct_areas_not_stated', 'no_contact_details', 'no_business_schema']), audit(0));
ok(capped.kind === 'scored' && capped.parts.website === OPP_WEBSITE_MAX, 'three criticals + a big stop at the website cap');
ok(icp.reasons.length === 3 && icp.reasons.every((r) => r.text.length > 0), 'three plain reasons');
ok(icp.kind === 'scored' && icp.score <= 100 && icp.parts.ai === OPP_AI_NOT_NAMED && icp.parts.worth === OPP_WORTH_MAX, 'max parts add up within 100');

/* ── lowered ── */
const strong = opportunityScore(lead(), site(['long_titles'], { siteScore: 88 }), audit(0));
ok(strong.kind === 'scored' && strong.parts.website === 0 && strong.score <= OPP_LOWERED_CAP && strong.band === 'cold', 'strong site, no critical → Cold');
const widely = opportunityScore(lead(), site(['no_service_pages']), audit(5));
ok(widely.kind === 'scored' && widely.score <= OPP_LOWERED_CAP && widely.reasons[0].kind === 'lowered', 'named widely → capped Cold, said first');
const strongButCritical = opportunityScore(lead(), site(['robots_blocks_all'], { siteScore: 85 }), audit(0));
ok(strongButCritical.kind === 'scored' && strongButCritical.parts.website > 0, 'a critical issue is never cancelled by a high site score');

/* ── excluded ── */
for (const s of ['opted_out', 'do_not_contact', 'wrong_number']) ok(opportunityScore(lead({ status: s }), site(['no_service_pages']), audit(0)).kind === 'excluded', `${s} → excluded`);
ok(opportunityScore(lead({ suppressed: true }), site([]), audit(0)).kind === 'excluded', 'suppressed number → excluded');
ok(opportunityScore(lead({ status: 'opted_out' }), site(['no_service_pages']), audit(0)).critical === false && opportunityScore(lead({ status: 'payment_received' }), site(['robots_blocks_all']), audit(0)).critical === false, 'an excluded lead is never critical (the critical filter never surfaces it)');
ok(opportunityScore(lead({ findLeadsStatus: 'do_not_contact' }), null, null).kind === 'excluded', 'Find Leads DNC → excluded');
ok(opportunityScore(lead({ status: 'payment_received' }), site([]), audit(0)).kind === 'excluded', 'client → excluded');

/* ── incomplete, never guessed ── */
const noScan = opportunityScore(lead(), null, audit(0));
ok(noScan.kind === 'incomplete' && noScan.missing.some((m) => /scan/.test(m)), 'no scan → incomplete, says so');
const quick = opportunityScore(lead(), site(['no_service_pages'], { depth: 'quick' }), audit(0));
ok(quick.kind === 'incomplete' && !quick.critical, 'quick check → incomplete, its findings not read');
const noAudit = opportunityScore(lead(), site(['no_service_pages']), null);
ok(noAudit.kind === 'incomplete' && noAudit.critical && noAudit.missing.includes('no AI audit yet'), 'no audit → incomplete, critical still flagged');
ok(opportunityScore(lead(), site([]), { score: score(0, 6, false), updating: false }).kind === 'incomplete', 'an unfinished audit is not 0 named');
ok(opportunityScore(lead(), site([]), { score: null, updating: true }).kind === 'incomplete', 'audit updating → incomplete');
/* The row pill says WHICH input is missing (2026-11-17): Needs scan / Needs audit / Needs both; a score only when both ran. */
const needsOf = (r: ReturnType<typeof opportunityScore>) => (r.kind === 'incomplete' ? r.needs : null);
ok(needsOf(noScan) === 'scan' && needsOf(quick) === 'scan', 'scan missing, audit done → "Needs scan"');
ok(needsOf(noAudit) === 'audit', 'scan done, audit missing → "Needs audit"');
ok(needsOf(opportunityScore(lead(), null, null)) === 'both', 'neither → "Needs both"');
ok(needsOf(opportunityScore(lead(), site([]), audit(0))) === null, 'both done → scored, no "needs"');
const noSite = opportunityScore(lead({ website: null }), null, audit(0));
ok(noSite.kind === 'scored' && noSite.critical && noSite.reasons.some((r) => r.text.startsWith('No website')), 'no website needs no scan: critical, scored');
ok(opportunityScore(lead({ website: 'https://www.facebook.com/acme' }), null, audit(0)).critical, 'a Facebook page is not a website of their own');
ok(opportunityScore(lead(), site([], { depth: 'none', siteState: 'robots_blocked' }), audit(0)).critical, 'robots.txt blocks everything → critical');
ok(opportunityScore(lead(), site([], { depth: 'none', siteState: 'js_only' }), audit(0)).critical, 'JavaScript-only site → critical');
ok(opportunityScore(lead(), site(['ct_dead_links', 'ct_no_accreditations']), audit(0)).kind === 'scored'
  && (opportunityScore(lead(), site(['ct_dead_links']), audit(0)) as { parts: { website: number } }).parts.website === 0, 'a kind under the bar adds nothing');

/* ── worth it ── */
const landline = opportunityScore(lead({ phone: '01733 123456', reviewCount: 0, rating: null }), site(['no_service_pages']), audit(0));
const mobile = opportunityScore(lead({ reviewCount: 0, rating: null }), site(['no_service_pages']), audit(0));
ok(landline.kind === 'scored' && mobile.kind === 'scored' && mobile.score > landline.score, 'a reachable UK mobile ranks higher');
ok(landline.reasons.some((r) => r.text === 'No UK mobile to reach'), 'no mobile is said');

/* ── rules v3 winnable, only when stored ── */
const v3 = opportunityScore(lead({ reviewCount: 0, phone: '' }), site(['no_service_pages']), audit(0, { v3: { winnable: 5, judged: 6 } }));
const nov3 = opportunityScore(lead({ reviewCount: 0, phone: '' }), site(['no_service_pages']), audit(0));
ok(v3.kind === 'scored' && nov3.kind === 'scored' && v3.score - nov3.score === OPP_WINNABLE_MAX, 'winnable searches add up to the cap, only when stored');

/* ── determinism, ordering ── */
ok(JSON.stringify(opportunityScore(lead(), site(['no_service_pages']), audit(1))) === JSON.stringify(opportunityScore(lead(), site(['no_service_pages']), audit(1))), 'same inputs, same score');
ok(oppBand(60) === 'hot' && oppBand(59) === 'warm' && oppBand(35) === 'warm' && oppBand(34) === 'cold', 'band lines 60 / 35');
ok(oppSortKey(icp) < oppSortKey(noAudit) && oppSortKey(noAudit) < oppSortKey(noScan) && oppSortKey(noScan) < oppSortKey(opportunityScore(lead({ status: 'opted_out' }), null, null)), 'sort: scored, incomplete (critical first), excluded');
ok(topReasons([{ text: 'a', points: 1, kind: 'website' }, { text: 'b', points: 9, kind: 'ai' }, { text: 'c', points: 0, kind: 'lowered' }, { text: 'd', points: 5, kind: 'worth' }]).map((r) => r.text).join('') === 'cbd', 'reasons: lowering first, then biggest');

/* ── Master Standard §05/§19: never suggests thin service × town pages ── */
const allWords = OPP_SIGNALS.map((s) => s.words).join(' | ');
ok(!/(add|create|build)\b[^|]*\bpage[s]? (for|per) (each|every)? ?(town|area|location)/i.test(allWords), 'no reason suggests a page per town');
ok(OPP_SIGNALS.find((s) => s.key === 'town_swap_pages')!.points > 0, 'copy-paste town pages count as a problem, not a plan');

/* ── team only: never imported by anything a business reads or a sender ── */
const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((n) => { const p = `${dir}/${n}`; return statSync(path.join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
const importers = [...walk('src'), ...walk('supabase/functions')].filter((p) => /from ['"][^'"]*opportunity(Score|ForLead)(\.ts)?['"]/.test(read(p)) && !/opportunity(Score|ForLead)\.ts$/.test(p));
const allowed = new Set(['src/components/OutreachTable.tsx', 'src/components/LeadsTable.tsx', 'src/components/OpportunityCell.tsx']);
ok(importers.length > 0 && importers.every((p) => allowed.has(p)), `only the two lists and the cell import the score (${importers.join(', ')})`);
ok(!read('src/hooks/useOpportunityInputs.ts').includes('results'.concat(',')) && !/select\([^)]*\bresults\b/.test(read('src/hooks/useOpportunityInputs.ts')), 'the audit read never selects results');

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall opportunity score checks passed');
