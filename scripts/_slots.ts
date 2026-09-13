/* UNTRACKED SCRATCH — read-only slot-stability analysis. Never stage. */
import { execFileSync } from 'node:child_process';
import { isUncleanedName } from '../src/lib/knownEntities.ts';
import { buildMatchContext, groupNames, keyIndex } from '../supabase/functions/_shared/market-match.ts';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
const ENG=['chatgpt','gemini'] as const;
const normKey=(s:string)=>s.trim();
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\b(ltd|limited|services|service|the)\b/g,'').replace(/\s+/g,' ').trim();

async function main(){
  const auditId=process.argv[2];
  const rows=await g(`/ai_audit_queue?audit_id=eq.${auditId}&select=run_id,question,status,result&order=id.asc`);
  const byQ=new Map<string,any[]>();
  for(const r of rows){ if(!byQ.has(r.question))byQ.set(r.question,[]); byQ.get(r.question)!.push(r); }
  /* ⛔ GROUP THE NAMES WITH THE PRODUCT'S OWN GROUPER FIRST. A naive key reads "NLS Security" and
     "N L S Security" as two rotating firms when they are one stable one — the Chapman's split in a
     new place. Build ONE context/index per audit so the same firm has the same key everywhere. */
  const ctx=buildMatchContext('locksmith', process.argv[3] ?? 'Newcastle upon tyne');
  const allNames:string[]=[];
  for(const rs of byQ.values()) for(const r of rs) for(const e of ENG){
    const c=r.result?.[e]?.competitors; if(Array.isArray(c)) allNames.push(...c.filter((n:string)=>!isUncleanedName(n)));
  }
  const idx=keyIndex(groupNames(allNames,ctx));
  const key=(n:string)=>idx.get(normKey(n)) ?? norm(n);
  let junk=0, totalNames=0, cellCount=0, emptyAnswered=0, emptyNoAnswer=0;
  const slotCounts:number[]=[];
  console.log(`questions: ${byQ.size}\n`);
  for(const [q,rs] of byQ){
    for(const e of ENG){
      const perRun:string[][]=[];
      for(const r of rs){
        const blk=r.result?.[e];
        if(!blk||!Array.isArray(blk.competitors))continue;
        const names=(blk.competitors as string[]).filter(n=>{ totalNames++; if(isUncleanedName(n)){junk++;return false;} return true; });
        const answered=typeof blk.answer_text==='string'&&blk.answer_text.trim().length>0;
        if(names.length===0){ if(answered)emptyAnswered++; else emptyNoAnswer++; }
        perRun.push(names.map(key).filter(Boolean));
        cellCount++;
      }
      if(perRun.length===0)continue;
      const counts=new Map<string,number>();
      for(const run of perRun) for(const n of new Set(run)) counts.set(n,(counts.get(n)??0)+1);
      const runs=perRun.length;
      const sizes=perRun.map(r=>new Set(r).size);
      slotCounts.push(...sizes);
      const stable=[...counts.entries()].filter(([,c])=>c===runs).length;
      const churn=[...counts.entries()].filter(([,c])=>c<runs).length;
      const dist=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([n,c])=>`${n} ${c}/${runs}`).slice(0,7).join(', ');
      console.log(`${e.padEnd(8)} ${String(sizes.join('/')).padEnd(8)} stable ${stable} churn ${churn}  | ${q.slice(0,46)}`);
      console.log(`         ${dist}`);
    }
  }
  slotCounts.sort((a,b)=>a-b);
  const med=slotCounts[Math.floor(slotCounts.length/2)];
  console.log(`\nSLOTS PER ANSWER: n=${slotCounts.length} min ${slotCounts[0]} median ${med} max ${slotCounts[slotCounts.length-1]} mean ${(slotCounts.reduce((a,b)=>a+b,0)/slotCounts.length).toFixed(2)}`);
  const hist=new Map<number,number>(); for(const s of slotCounts) hist.set(s,(hist.get(s)??0)+1);
  console.log('histogram: '+[...hist.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join(' '));
  console.log(`junk names filtered: ${junk} of ${totalNames} (${cellCount} answer cells)`);
  console.log(`zero-name cells: ${emptyAnswered} answered-but-named-nobody, ${emptyNoAnswer} with no answer text at all`);
}
main().catch(e=>{console.error(e);process.exit(1);});
