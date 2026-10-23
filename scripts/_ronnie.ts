/* READ-ONLY. Ronnie's refund arithmetic, given three frozen questions that measure the locksmith
   trade. His baseline stays frozen — this is the consequence, not a proposal. */
import { execSync } from 'node:child_process';
import { buildBaselineView, type QueueRowLite } from '../src/lib/baselineView';
import { NOISE_BAND_PP, MIN_CELLS_FOR_QUESTION_CLAIM } from '../src/lib/measurementCompare';
import { MEASUREMENT_RUNS } from '../src/lib/measurementRuns';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());

for (const [who, ID] of [["Ronnie's", '1a0603aa-f91c-4a51-9112-cc9f1a70e96e'], ['RG Locksmiths', 'f64920ce-0000-0000-0000-000000000000']] as const) {
  const q = ID.startsWith('f64920ce') ? `ai_audits?select=*&business_name=ilike.*RG Locksmiths*&baseline_completed_at=not.is.null` : `ai_audits?select=*&id=eq.${ID}`;
  const [a] = await sel(q);
  if (!a) { console.log(`\n${who}: not found`); continue; }
  const rows: QueueRowLite[] = await sel(`ai_audit_queue?select=run_id,question,engines,status,result&audit_id=eq.${a.id}&order=id.asc&limit=2000`);
  const done = rows.filter(r=>r.status==='done');
  const view = buildBaselineView(done, { businessName: a.business_name });
  const [lead] = await sel(`outreach_leads?select=remeasure_due_date,amount_paid&id=eq.${a.lead_id}`);
  const perQ = view.questions.map(x=>({ q:x.question, cells:Object.values(x.engines).reduce((n,e)=>n+e.answered,0), named:Object.values(x.engines).reduce((n,e)=>n+e.named,0) }));
  const cellsPerQ = [...new Set(perQ.map(p=>p.cells))];
  console.log(`\n████ ${who} — "${a.business_type}" · baseline ${a.id.slice(0,8)} frozen ${String(a.baseline_completed_at).slice(0,10)} · due ${lead?.remeasure_due_date}`);
  console.log(`   ${view.questions.length} questions · ${view.namedCells}/${view.answeredCells} cells named = ${view.namedRatePct}% · cells per question: ${cellsPerQ.join('/')}`);
  console.log(`   per-question claim needs ${MIN_CELLS_FOR_QUESTION_CLAIM} cells a side — ${cellsPerQ.every(c=>c>=MIN_CELLS_FOR_QUESTION_CLAIM) ? 'OK' : '⛔ NOT PROVABLE PER QUESTION'}`);
  console.log(`   the day-28 replay runs MEASUREMENT_RUNS=${MEASUREMENT_RUNS} -> ${MEASUREMENT_RUNS*2} cells/question = ${view.questions.length*MEASUREMENT_RUNS*2} cells`);
  console.log(`   ${cellsPerQ.every(c=>c===MEASUREMENT_RUNS*2) ? 'sides match' : `⛔ UNEVEN: before ${cellsPerQ.join('/')} cells/question vs after ${MEASUREMENT_RUNS*2}`}`);

  if (!ID.startsWith('1a0603aa')) continue;
  /* The three: the question names the LOCKSMITH trade, which is not his. Read off the text, not off
     the competitor fold — this is a legacy audit and its folds hold 50-108 "firms" apiece. */
  const dead = perQ.filter(p=>/\blocksmith/i.test(p.q));
  const live = perQ.filter(p=>!/\blocksmith/i.test(p.q));
  const sum = (xs:typeof perQ, k:'cells'|'named') => xs.reduce((n,x)=>n+x[k],0);
  const [dc,dn,lc,ln] = [sum(dead,'cells'),sum(dead,'named'),sum(live,'cells'),sum(live,'named')];
  const pc=(n:number,d:number)=>d?(n/d)*100:0;
  console.log(`\n   THE THREE (frozen, cannot move):`);
  for (const d of dead) console.log(`      ${d.named}/${d.cells}  "${d.q}"`);
  console.log(`\n   dead ${dn}/${dc} = ${pc(dn,dc).toFixed(1)}%   live ${ln}/${lc} = ${pc(ln,lc).toFixed(1)}%   all ${dn+ln}/${dc+lc} = ${pc(dn+ln,dc+lc).toFixed(1)}%`);
  const total = dc+lc;
  console.log(`\n   ══ WHAT IT COSTS HIM ══`);
  console.log(`   The refund turns on the OVERALL rate rising more than ${NOISE_BAND_PP}pp.`);
  console.log(`   One cell is worth ${(100/total).toFixed(2)}pp, so he needs ${Math.ceil((NOISE_BAND_PP/100)*total)} newly-named cells to clear the band.`);
  console.log(`   He has ${lc} cells that can move and ${dc} that cannot.`);
  console.log(`   ceiling WITH the three   : ${pc(lc+dn,total).toFixed(1)}%  (delta up to +${(pc(lc+dn,total)-pc(dn+ln,total)).toFixed(1)}pp)`);
  console.log(`   ceiling if all 18 counted: ${pc(total,total).toFixed(1)}%  (delta up to +${(100-pc(dn+ln,total)).toFixed(1)}pp)`);
  console.log(`   so the three cost him ${((100-pc(dn+ln,total))-(pc(lc+dn,total)-pc(dn+ln,total))).toFixed(1)}pp of CEILING, and 0pp of the bar he has to clear.`);
}
