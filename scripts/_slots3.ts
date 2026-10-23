/* UNTRACKED SCRATCH — does grouping the names change the stability picture? */
import { execFileSync } from 'node:child_process';
import { buildBaselineView } from '../src/lib/baselineView.ts';
import { buildMatchContext, groupNames, keyIndex } from '../supabase/functions/_shared/market-match.ts';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
async function main(){
  const rows=await g(`/ai_audit_queue?audit_id=eq.${process.argv[2]}&select=run_id,question,engines,status,result&order=id.asc`);
  const view=buildBaselineView(rows as never,{businessName:'AD Locksmithing'});
  const ctx=buildMatchContext('locksmith','Newcastle upon tyne');
  const all=view.questions.flatMap(q=>q.competitors.map(c=>c.name));
  const idx=keyIndex(groupNames(all,ctx));
  let rawStable=0, grpStable=0, rawFirms=0, grpFirms=0, changed=0;
  for(const q of view.questions){
    const of=q.competitors[0]?.of ?? 0;
    const merged=new Map<string,number>();
    for(const c of q.competitors){ const k=idx.get(c.name.trim()) ?? c.name.toLowerCase(); merged.set(k,(merged.get(k)??0)+c.times); }
    const rs=q.competitors.filter(c=>c.times>=of).length;
    const gs=[...merged.values()].filter(t=>t>=of).length;
    rawStable+=rs; grpStable+=gs; rawFirms+=q.competitors.length; grpFirms+=merged.size;
    if(gs!==rs){ changed++; console.log(`stable ${rs} -> ${gs}, firms ${q.competitors.length} -> ${merged.size}  ${q.question.slice(0,44)}`);
      console.log(`   ${[...merged.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,t])=>`${k} ${t}/${of}`).join(', ')}`); }
  }
  console.log(`\nRAW (what the Baseline screen counts): ${rawFirms} firm entries, ${rawStable} stable`);
  console.log(`GROUPED (what the market view counts): ${grpFirms} firms, ${grpStable} stable`);
  console.log(`questions whose stable-firm count changes when names are grouped: ${changed} of ${view.questions.length}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
