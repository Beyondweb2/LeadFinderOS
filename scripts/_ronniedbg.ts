import { execSync } from 'node:child_process';
import { buildBaselineView, type QueueRowLite } from '../src/lib/baselineView';
import { tradeWordHit } from '../src/lib/seedGuard';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());
const ID='1a0603aa-f91c-4a51-9112-cc9f1a70e96e';
const rows: QueueRowLite[] = await sel(`ai_audit_queue?select=run_id,question,engines,status,result&audit_id=eq.${ID}&order=id.asc&limit=2000`);
console.log('raw rows:', rows.length, 'statuses:', JSON.stringify(rows.reduce((m:Record<string,number>,r)=>{m[String(r.status)]=(m[String(r.status)]??0)+1;return m;},{})));
const runs = new Set(rows.map(r=>r.run_id)); console.log('runs:', runs.size);
const view = buildBaselineView(rows.filter(r=>r.status==='done'), { businessName: "Ronnie's Shoe Repairs & Key Cutting" });
for (const q of view.questions) {
  const cells = Object.values(q.engines).reduce((n,e)=>n+e.answered,0);
  const named = Object.values(q.engines).reduce((n,e)=>n+e.named,0);
  const firms = q.competitors.map(c=>c.name);
  const lk = firms.filter(f=>tradeWordHit(f,'Locksmiths')).length;
  console.log(`${q.band.padEnd(10)} cells ${String(cells).padStart(2)} named ${named}  firms ${String(firms.length).padStart(2)} lock ${String(lk).padStart(2)}  "${q.question}"`);
}
