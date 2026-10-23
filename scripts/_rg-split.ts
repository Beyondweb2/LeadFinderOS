/* UNTRACKED SCRATCH — read-only. RG Locksmiths per-engine, per-town named rates across his three
   real measurements. Tests Paul's claim that pages moved GEMINI on the rewritten town only. */
import { execFileSync } from 'node:child_process';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
const AUDITS:[string,string][]=[['11 Aug baseline','f64920ce-8bdc-44b3-b35a-a63a75ee4395'],['26 Aug re-measure','f0aaa9cd-6211-4c87-b5e4-e5591e7e8d44'],['8 Sep re-measure','876579bd-656e-4b73-a29d-d83f79b4495c']];
const TOWNS=['huntingdon','st neots','peterborough','cambridge'];
const townOf=(q:string)=>TOWNS.find(t=>q.toLowerCase().includes(t)) ?? 'other';
async function main(){
  type Cell={named:number;total:number};
  const table=new Map<string,Map<string,Cell>>();
  for(const [label,id] of AUDITS){
    const rows=await g(`/ai_audit_queue?audit_id=eq.${id}&select=run_id,question,result&order=id.asc`);
    const runs=new Set(rows.map((r:any)=>r.run_id));
    const per=new Map<string,Cell>();
    for(const r of rows) for(const e of ['chatgpt','gemini']){
      const b=r.result?.[e]; if(!b)continue;
      const k=`${e}|${townOf(r.question)}`;
      const c=per.get(k)??{named:0,total:0}; c.total++; if(b.named===true)c.named++; per.set(k,c);
      const a=per.get(`${e}|ALL`)??{named:0,total:0}; a.total++; if(b.named===true)a.named++; per.set(`${e}|ALL`,a);
    }
    table.set(label,per);
    console.log(`${label}: ${rows.length} rows, ${runs.size} runs, ${new Set(rows.map((r:any)=>r.question)).size} questions`);
  }
  const pct=(c?:Cell)=>c&&c.total?`${c.named}/${c.total} ${(100*c.named/c.total).toFixed(1)}%`.padEnd(16):'—'.padEnd(16);
  console.log('\n' + 'engine | town'.padEnd(26) + AUDITS.map(a=>a[0].padEnd(16)).join(''));
  for(const e of ['chatgpt','gemini']) for(const t of ['ALL',...TOWNS,'other']){
    const cells=AUDITS.map(([l])=>table.get(l)!.get(`${e}|${t}`));
    if(cells.every(c=>!c||!c.total))continue;
    console.log(`${e} | ${t}`.padEnd(26)+cells.map(pct).join(''));
  }
  console.log('\nPer-question GEMINI, 11 Aug -> 8 Sep:');
  const qrows=await g(`/ai_audit_queue?audit_id=in.(f64920ce-8bdc-44b3-b35a-a63a75ee4395,876579bd-656e-4b73-a29d-d83f79b4495c)&select=audit_id,question,result&order=id.asc`);
  const byQ=new Map<string,{b:Cell;a:Cell}>();
  for(const r of qrows){ const b=r.result?.gemini; if(!b)continue;
    const rec=byQ.get(r.question)??{b:{named:0,total:0},a:{named:0,total:0}};
    const side=r.audit_id==='f64920ce-8bdc-44b3-b35a-a63a75ee4395'?rec.b:rec.a;
    side.total++; if(b.named===true)side.named++; byQ.set(r.question,rec); }
  for(const [q,{b,a}] of byQ) console.log(`  ${String(b.named+'/'+b.total).padEnd(6)}-> ${String(a.named+'/'+a.total).padEnd(6)} [${townOf(q)}] ${q.slice(0,52)}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
