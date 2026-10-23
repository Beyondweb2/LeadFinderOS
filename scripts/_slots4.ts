/* UNTRACKED SCRATCH — how often is ONE firm split across two spellings inside one question? */
import { execFileSync } from 'node:child_process';
import { buildBaselineView } from '../src/lib/baselineView.ts';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
const letters=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
async function main(){
  const rows=await g(`/ai_audit_queue?audit_id=eq.${process.argv[2]}&select=run_id,question,engines,status,result&order=id.asc`);
  const view=buildBaselineView(rows as never,{businessName:'AD Locksmithing'});
  let qWith=0, pairs=0, newStable=0;
  for(const q of view.questions){
    const of=q.competitors[0]?.of ?? 0;
    const m=new Map<string,{names:string[];times:number}>();
    for(const c of q.competitors){ const k=letters(c.name); const e=m.get(k)??{names:[],times:0}; e.names.push(`${c.name} ${c.times}/${of}`); e.times+=c.times; m.set(k,e); }
    const split=[...m.values()].filter(v=>v.names.length>1);
    if(split.length){ qWith++; pairs+=split.length;
      for(const s of split){ if(s.times>=of) newStable++; console.log(`  ${q.question.slice(0,40)} :: ${s.names.join('  +  ')}  = ${s.times}/${of}${s.times>=of?'  <- ONE STABLE FIRM, counted as two rotating':''}`); } }
  }
  const rawStable=view.questions.reduce((n,q)=>n+q.competitors.filter(c=>c.times>=(q.competitors[0]?.of??0)).length,0);
  console.log(`\n${qWith} of ${view.questions.length} questions contain a same-firm spelling split (${pairs} pairs)`);
  console.log(`stable firms: ${rawStable} as counted today, ${rawStable+newStable} once the spellings are joined`);
}
main().catch(e=>{console.error(e);process.exit(1);});
