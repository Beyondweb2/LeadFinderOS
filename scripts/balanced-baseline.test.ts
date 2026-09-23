/* ============================================================
   DISCOVERY → BALANCED PAID BASELINE (2026-09-23).

   BS4 Electrical's approved services and six approved areas produced a draft of 20 Bristol
   questions, eight of them near-duplicates. This pins: every approved area feeds Discovery, the home
   town cannot monopolise the set, rewording collapses, Discovery questions can be added, the balanced
   generator spreads services / towns / intents and never reads winnability, the draft stays editable,
   and the frozen baseline + day-28 replay are untouched.

   Run: npx tsx scripts/balanced-baseline.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBalancedBaseline, canonicalServices, classifyQuestion, coverageReport, dedupeByMeaning, nearDuplicates, sameIntent, type Candidate,
} from '../src/lib/baselineMix';
import { mixContext, perTownCounts, DISCOVERY_RUN_USABLE } from '../supabase/functions/_shared/baseline-discovery';
import { RUN_USABLE } from '../src/lib/queueAuditStatus';
import { judgeRemeasure } from '../src/lib/baselineReplay';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* BS4's approved onboarding, verbatim from production (2026-09-23). */
const SERVICES = ['Rewiring', 'Fuse board upgrades', 'EV charger installation', 'EICR reports', 'Lighting installation', 'Fault finding', 'Emergency callouts', 'Consumer Unit Upgrade', 'EICRs', 'EV Charger Installations', 'Rewiring Services', 'Additional Socket Installations', 'Lighting Installations', 'Commercial Electrical Services', 'Landlord Electrical Certificates', 'Emergency Electrician', 'Lighting Installations Bristol', 'Commercial Electrician Bristol', 'Smoke Alarm Installations', 'Consumer Unit Upgrades Bristol', 'EICR Bristol', 'EV Charger Installation Bristol', 'House Rewire Bristol', 'Electrical Fault Finding Bristol', 'Additional Sockets Bristol', 'Landlord EICR Bristol'];
const AREAS = ['Bath', 'Keynsham', 'Portishead', 'Clevedon', 'Nailsea', 'Weston-super-Mare'];
const ctx = mixContext({ primaryTown: 'Bristol', areas: AREAS, services: SERVICES });
const TOWNS = ['Bristol', ...AREAS];
/* BS4's actual draft (all Bristol). */
const DRAFT = ['emergency electrician who can come out today in Bristol UK', 'rewiring service for my home in Bristol UK', 'ev charger installation for businesses in Bristol UK', 'lighting installation for residential properties in Bristol UK', 'Electricians in Bristol UK to replace one that keeps letting me down', 'rewiring services in bristol uk', 'ev charger installation in bristol uk', 'eicr reports in bristol uk', 'lighting installation in bristol uk', 'fault finding services in bristol uk', 'best eicr services in bristol uk', 'emergency electrician in bristol uk', 'rewiring Electricians in Bristol UK', 'fuse board upgrades Electricians in Bristol UK', 'ev charger installation Electricians in Bristol UK', 'eicr reports Electricians in Bristol UK', 'lighting installation Electricians in Bristol UK', 'fault finding Electricians in Bristol UK', 'emergency callouts Electricians in Bristol UK', 'consumer unit upgrade Electricians in Bristol UK'];

/* A Discovery pool as the per-town generator returns it: each town's own questions, with rewordings. */
const svcPhr = ['rewiring', 'fuse board upgrade', 'ev charger installation', 'eicr', 'lighting installation', 'fault finding', 'commercial electrician', 'landlord electrical certificate', 'smoke alarm installation', 'extra sockets fitted'];
const pool: Candidate[] = [];
const gen = (town: string, n: number) => {
  const out = [`electrician in ${town} UK`, `best electrician in ${town} UK`, `emergency electrician in ${town} UK tonight`, `power keeps tripping who can fix it in ${town} UK`];
  for (const s of svcPhr) out.push(`${s} in ${town} UK`, `${s} services ${town} UK`, `who does ${s} in ${town} UK`);
  return out.slice(0, n);
};
for (const [town, n] of [['Bristol', 30], ...AREAS.map((a) => [a, 12] as const)] as Array<[string, number]>) for (const q of gen(town, n)) pool.push({ question: q, source: 'discovery' });

console.log('\n── 1. EVERY APPROVED AREA FEEDS DISCOVERY ──');
{
  const src = read('supabase/functions/_shared/baseline-discovery.ts');
  ok(/const towns = \[\{ town: input\.primaryTown, n: counts\.primary \}, \.\.\.ctx\.areas\.map\(\(town\) => \(\{ town, n: counts\.area \}\)\)\];/.test(src), '1. one generator call per approved town: the home town and EVERY area');
  ok(/primary_location: town,/.test(src) && !/leadId: /.test(src.slice(src.indexOf('generateDiscoveryPool'), src.indexOf('startDiscoveryRun'))), '1. each call is about ITS town (no lead id, so the home town cannot override it)');
  ok(ctx.areas.length === 6 && ctx.areas.join('|') === AREAS.join('|'), '1. all six of BS4\'s approved areas are in the Discovery context');
  const c = perTownCounts(6);
  ok(c.area > 0 && c.primary + c.area * 6 <= 80 && c.primary < c.area * 6, `1. the home town gets more weight (${c.primary}) but not the pool (areas ${c.area} × 6)`);
  ok(/if \(!hasBroad\) interleaved\.push\(`\$\{trade\} in \$\{t\} UK`\);/.test(src), '1. every approved town gets its plain core query ("[approved trade] in [town] UK") when the generator wrote none');
  ok(classifyQuestion('electricians in Bath UK', ctx).intent === 'broad' && classifyQuestion('electricians in Bath UK', ctx).town === 'Bath', '1. …and it counts as a broad question for that town');
  const covered = new Set(pool.map((p) => classifyQuestion(p.question, ctx).town));
  ok(TOWNS.every((t) => covered.has(t)), '1. the pool covers every approved town');
}

console.log('\n── 2. THE HOME TOWN DOES NOT MONOPOLISE ──');
const balanced = buildBalancedBaseline(pool, ctx, 20);
const rep = coverageReport(balanced, ctx, 20);
{
  const bristol = rep.areas.find((a) => a.town === 'Bristol')!.count;
  ok(balanced.length === 20, '20 questions');
  ok(bristol <= 9, `2. Bristol holds ${bristol} of 20, not all of them`);
  const draftRep = coverageReport(DRAFT, ctx, 20);
  ok(draftRep.warnings.some((w) => /^20 of 20 questions target Bristol while 6 other approved service areas are unused/.test(w)), '2. BS4\'s old draft is flagged: "20 of 20 questions target Bristol while 6 other approved service areas are unused…"');
}

console.log('\n── 3/4. REWORDINGS COLLAPSE ──');
{
  ok(sameIntent('rewiring service in Bristol', 'rewiring services Bristol', TOWNS) && sameIntent('rewiring service in Bristol', 'rewiring electricians in Bristol', TOWNS), '3. rewiring service in / services / electricians Bristol are one intent');
  ok(sameIntent('EV charger installation Bristol', 'EV charger installers Bristol', TOWNS) && sameIntent('EV charger installation Bristol', 'electricians for EV chargers Bristol', TOWNS), '4. EV charger installation / installers / electricians for EV chargers are one intent');
  ok(!sameIntent('rewiring in Bath', 'rewiring in Bristol', TOWNS), 'the same service in a different town is a different question');
  ok(!sameIntent('eicr in Bristol', 'landlord eicr in Bristol', TOWNS), 'a landlord EICR is not a plain EICR');
  const draftDups = nearDuplicates(DRAFT, TOWNS).length;
  ok(draftDups >= 6, `BS4's old draft has ${draftDups} near-duplicate pairs, all detected`);
  ok(dedupeByMeaning(DRAFT, TOWNS).length <= 13, 'de-duplicating BS4\'s draft leaves ≤ 13 distinct intents out of 20');
  ok(canonicalServices(SERVICES, TOWNS).length <= 12, `BS4's 26 service entries are ${canonicalServices(SERVICES, TOWNS).length} real services`);
}

console.log('\n── 5/9. ADD TO BASELINE; THE DRAFT STAYS EDITABLE ──');
{
  const mine = 'smoke alarm installation for a rental flat in Clevedon UK';
  const withMine = buildBalancedBaseline([{ question: mine, source: 'manual' }, ...pool], ctx, 20);
  ok(withMine[0] === mine || withMine.includes(mine), '5. a question Paul added from Discovery is kept by the balanced generator');
  const hub = read('src/pages/ClientHub.tsx');
  ok(/const addFromDiscovery = \(q: string\) => \{ setQuestions\(/.test(hub) && /onAdd=\{addFromDiscovery\}/.test(hub), '5. "Add to baseline" appends to the draft on screen');
  ok(/keep_current: added\.length > 0, questions: added/.test(hub), '5. …and the balanced generator is told to keep those');
  ok(/<AuditQuestionEditor questions=\{questions\} onChange=\{setQuestions\} disabled=\{frozen\}/.test(hub), '9. the draft is edited, removed and added to until frozen');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  ok(/baseline_questions: next, baseline_status: "needs_approval"/.test(pb.slice(pb.indexOf('if (action === "generate" || action === "balanced")'))), '9. the balanced generator writes a DRAFT (needs_approval), never an approval');
  ok(!/baseline_questions:|baseline_status:/.test(pb.slice(pb.indexOf('if (action === "discovery_generate")'), pb.indexOf('if (action === "generate" || action === "balanced")'))), '9. Discovery never writes the baseline draft or its status');
}

console.log('\n── 6/7. THE BALANCED GENERATOR SPREADS SERVICES AND AREAS ──');
{
  const services = rep.services.filter((s) => s.count > 0).length;
  const towns = rep.areas.filter((a) => a.count > 0).length;
  ok(services >= 7, `6. ${services} different services represented`);
  ok(rep.services.every((s) => s.count <= 4), '6. no service takes more than 4 of 20');
  ok(towns >= 5, `7. ${towns} of 7 approved towns represented`);
  ok(rep.intents.broad >= 3 && rep.intents.service >= 5 && rep.intents.location >= 4 && rep.intents.emergency >= 2, `mix: broad ${rep.intents.broad} · service ${rep.intents.service} · service+area ${rep.intents.location} · emergency ${rep.intents.emergency}`);
  ok(rep.duplicates.length === 0, 'no near-duplicates in the balanced set');
  ok(JSON.stringify(buildBalancedBaseline(pool, ctx, 20)) === JSON.stringify(balanced), 'deterministic: the same pool gives the same 20');
}

console.log('\n── 8. WINNABILITY INFORMS, IT DOES NOT CHOOSE ──');
{
  const mix = read('src/lib/baselineMix.ts');
  ok(!/discoveryOpportunity|classifyWinnability|opportunity/.test(mix.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '8. the balanced generator has no access to winnability at all');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const genBlock = pb.slice(pb.indexOf('if (action === "generate" || action === "balanced")'), pb.indexOf('if (action === "save")'));
  ok(!/opportunity/.test(genBlock), '8. paid-baseline builds the draft without reading opportunities');
  const ui = read('src/components/BaselineDiscovery.tsx');
  ok(/OPPORTUNITY_GROUP_LABELS/.test(ui) && /They explain a question; they do not decide the baseline/.test(ui), '8. the screen shows Winnable / Possible / Already named / Weak as information');
}

console.log('\n── 10/11. THE FROZEN BASELINE AND THE REPLAY ARE UNCHANGED ──');
{
  const pb = read('supabase/functions/paid-baseline/index.ts');
  for (const a of ['discovery_generate', 'discovery_run', 'generate" || action === "balanced']) {
    const i = pb.indexOf(`if (action === "${a}")`);
    ok(i > 0 && /if \(isFrozenBaselineStatus\(status\)\) return json\(\{ ok: false, error: "baseline_questions_locked" \}, 409\);/.test(pb.slice(i, i + 400)), `10. "${a.split('"')[0]}" refuses once the questions are frozen`);
  }
  ok(/if \(next\.length !== BASELINE_QUESTIONS\) \{/.test(pb), '10. approval is still exactly 20');
  ok(/if \(dups\.length && body\.accept_duplicates !== true\)/.test(pb), '10. approval refuses near-duplicates unless Paul explicitly accepts them');
  const ab = read('supabase/functions/_shared/audit-baseline.ts');
  ok(/questions: plan\.questions,\s+\/\/ the baseline's ASKED set, verbatim/.test(ab), '11. the day-28 replay still posts the baseline\'s asked set verbatim');
  const frozen = ['rewiring in Bath UK', 'eicr in Bristol UK', 'emergency electrician in Keynsham UK'];
  ok(judgeRemeasure({ proposed: frozen, baselineAsked: frozen, targetRuns: 3 }).allow === true && judgeRemeasure({ proposed: [frozen[1], frozen[0], frozen[2]], baselineAsked: frozen, targetRuns: 3 }).allow === false, '11. the replay gate still demands the exact frozen list in order — multi-town sets included');
}

console.log('\n── 12. OPENING THE PAGE MEASURES NOTHING ──');
{
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const beforeGet = pb.slice(0, pb.indexOf('if (action === "get") return json('));
  ok(!/fetch\(`\$\{url\}\/functions\/v1\//.test(beforeGet), '12. the `get` path calls no function (no question writing, no engine)');
  const disc = read('supabase/functions/_shared/baseline-discovery.ts');
  const state = disc.slice(disc.indexOf('export async function discoveryState'));
  ok(!/fetch\(|\.insert\(|\.update\(|\.upsert\(/.test(state), '12. the Discovery state read is read-only');
  ok(/if \(body\.confirm_cost !== true\)/.test(read('supabase/functions/paid-baseline/index.ts')) && /window\.confirm\(`Run Discovery:/.test(read('src/pages/ClientHub.tsx')), '12. running Discovery needs an explicit, priced confirmation');
}

ok([...DISCOVERY_RUN_USABLE].sort().join() === [...RUN_USABLE].sort().join(), 'the edge copy of the usable-run statuses matches RUN_USABLE');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
