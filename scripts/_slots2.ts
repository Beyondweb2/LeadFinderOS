/* UNTRACKED SCRATCH — pooled slot stability, the way the Baseline screen counts (cells = run x engine). */
import { execFileSync } from 'node:child_process';
import { buildBaselineView } from '../src/lib/baselineView.ts';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
async function main(){
  const rows=await g(`/ai_audit_queue?audit_id=eq.${process.argv[2]}&select=run_id,question,engines,status,result&order=id.asc`);
  const view=buildBaselineView(rows as never, { businessName: process.argv[3] ?? '' });
  console.log(`questions ${view.questions.length}, runs ${view.runsCounted}, named ${view.namedCells}/${view.answeredCells}\n`);
  const stableCounts:number[]=[], totalCounts:number[]=[];
  for(const q of view.questions){
    const of=q.competitors[0]?.of ?? 0;
    const stable=q.competitors.filter(c=>c.times>=of).length;                 // in every cell that produced a list
    const most=q.competitors.filter(c=>c.times>of/2 && c.times<of).length;    // in most, not all
    const churn=q.competitors.filter(c=>c.times<=of/2).length;
    stableCounts.push(stable); totalCounts.push(q.competitors.length);
    console.log(`${q.band.padEnd(10)} of=${of} firms=${String(q.competitors.length).padEnd(3)} stable=${stable} most=${most} churn=${churn}  ${q.question.slice(0,44)}`);
    console.log(`   ${q.competitors.slice(0,6).map(c=>`${c.name} ${c.times}/${c.of}`).join(', ')}`);
  }
  const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
  console.log(`\nacross ${view.questions.length} questions: ${sum(stableCounts)} firm-slots appear in EVERY cell, ${sum(totalCounts)-sum(stableCounts)} do not`);
  console.log(`questions with 0 stable firms: ${stableCounts.filter(s=>s===0).length}; with exactly 1: ${stableCounts.filter(s=>s===1).length}; with 2+: ${stableCounts.filter(s=>s>=2).length}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
