/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE ROADMAP (live read) — per measured question: named/not-named per engine + whether a page
   exists. The "NO PAGE" rows ARE the content roadmap, and fall out of the data automatically.
   Uses the SAME pure fold the in-app view will use (src/lib/pageRoadmap.ts), so they can't drift.

   Run (service-role key from the linked Supabase CLI, never pasted):
     SRV=$(npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json \
       | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).find(x=>x.name==='service_role').api_key))")
     SRV=$SRV npx deno run --allow-net --allow-env scripts/page-roadmap.mjs [lead_id]
   Defaults to RG Locksmiths' lead.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { buildPageRoadmap } from '../src/lib/pageRoadmap.ts';

const KEY = Deno.env.get('SRV');
const BASE = 'https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1';
const LEAD = Deno.args[0] || '800425fe-00cc-46bf-a281-df57de6f8d4e';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (p) => { const r = await fetch(`${BASE}/${p}`, { headers: h }); if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`); return r.json(); };

// Pages that already exist for this lead → the set of question texts they target.
const pages = await get(`client_pages?lead_id=eq.${LEAD}&select=id,slug`);
const pageIds = pages.map((p) => p.id);
const slugById = new Map(pages.map((p) => [p.id, p.slug]));
const links = pageIds.length
  ? await get(`client_page_questions?page_id=in.(${pageIds.join(',')})&select=page_id,question_text`)
  : [];
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const slugByQ = new Map(links.map((l) => [norm(l.question_text), slugById.get(l.page_id)]));
const pageQuestionTexts = links.map((l) => l.question_text);

// Choose the audit to build the roadmap from: a Full Measurement audit if one exists (a run tagged
// results.measurement), else the lead's baseline, else the audit with the most distinct questions.
const audits = await get(`ai_audits?lead_id=eq.${LEAD}&select=id,baseline_target_runs,created_at&order=created_at.desc`);
let chosen = null, chosenWhy = '';
for (const a of audits) {
  const runs = await get(`ai_audit_runs?audit_id=eq.${a.id}&select=id,results`);
  if (runs.some((r) => r.results && r.results.measurement === true)) { chosen = a; chosenWhy = 'Full Measurement audit'; break; }
}
if (!chosen) {
  const baseline = audits.find((a) => Number(a.baseline_target_runs ?? 0) > 1);
  if (baseline) { chosen = baseline; chosenWhy = `baseline audit (${baseline.baseline_target_runs} runs)`; }
}
if (!chosen && audits.length) { chosen = audits[0]; chosenWhy = 'most recent audit'; }
if (!chosen) { console.log('No audits for this lead.'); Deno.exit(0); }

const rows = await get(`ai_audit_queue?audit_id=eq.${chosen.id}&select=question,result`);
const roadmap = buildPageRoadmap(rows, pageQuestionTexts);

const fmtEng = (e) => e.total === 0 ? '   —   ' : `${e.named}/${e.total}`.padStart(7);
const instead = (e) => (e.named < e.total && e.namedInstead.length) ? `  ↳ named instead: ${e.namedInstead.slice(0, 3).join(', ')}` : '';

console.log(`\n═══ PAGE ROADMAP — lead ${LEAD} ═══`);
console.log(`source: ${chosenWhy} (${chosen.id}) · ${rows.length} answers · ${pages.length} pages exist\n`);
console.log(`${'ChatGPT'.padStart(7)} ${'Gemini'.padStart(7)} ${'GoogleAI'.padStart(8)}  page?   question   (named / total answers per engine, worst first)`);
console.log('─'.repeat(96));
for (const r of roadmap.rows) {
  const pg = r.hasPage ? `PAGE:${slugByQ.get(norm(r.question)) ?? 'yes'}` : 'NO PAGE';
  console.log(`${fmtEng(r.engines.chatgpt)} ${fmtEng(r.engines.gemini)} ${fmtEng(r.engines.ai_overview)}  ${pg.padEnd(24)} ${r.question}`);
  for (const e of ['chatgpt', 'gemini', 'ai_overview']) { const s = instead(r.engines[e]); if (s) console.log(`${' '.repeat(24)}${e}${s}`); }
}

console.log(`\n═══ CONTENT ROADMAP — measured questions with NO page yet (${roadmap.gaps.length}) ═══`);
if (roadmap.gaps.length === 0) console.log('  (every measured question already has a page)');
for (const r of roadmap.gaps) {
  const c = r.engines.chatgpt, g = r.engines.gemini;
  console.log(`  • ${r.question}   [ChatGPT ${c.total ? c.named + '/' + c.total : '—'} · Gemini ${g.total ? g.named + '/' + g.total : '—'}]`);
}
console.log(`\nsummary: ${roadmap.rows.length} measured · ${roadmap.covered.length} have a page · ${roadmap.gaps.length} need one (the roadmap)`);
console.log('(named/total = how many runs named the business, per engine · GoogleAI "—" = no AI Overview shown for that query)');
