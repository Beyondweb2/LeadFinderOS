/* READ-ONLY. How many leads carry a trade that contradicts their own business NAME?
   Same symptom as an off-trade question (a measurement aimed at the wrong race), different cause:
   here the question is right for the stored trade and the STORED TRADE is wrong. */
import { execSync } from 'node:child_process';
import { tradeWordHit } from '../src/lib/seedGuard';
import { MARKER } from './_markers';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());
const all = async (t:string,c:string,x='')=>{ const o:any[]=[]; let last:string|null=null;
  for(let i=0;i<200;i++){ const p=await sel(`${t}?select=${c}&order=id.asc&limit=1000${last?`&id=gt.${last}`:''}${x}`); o.push(...p); if(p.length<1000) return o; last=p[p.length-1].id; }
  throw new Error('page budget exhausted'); };

const leads = await all('outreach_leads','id,business_name,category,search_keyword,is_archived,amount_paid');
const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const tradeOf=(l:any)=>String(l.search_keyword ?? l.category ?? '').trim();

/* The stored trade must be one we can actually read off a name, or "the name does not carry it" is
   a statement about the checker. Only trades with a marker vocabulary in the book qualify. */
const READABLE = new Set([...MARKER.values()].map(v=>v.trade));
const conflicts: Array<{l:any;stored:string;looksLike:string}> = [];
let considered = 0;
for (const l of leads) {
  const stored = tradeOf(l); const name = String(l.business_name ?? '');
  if (!stored || !name) continue;
  const storedKey = norm(stored).split(' ').map(w=>w.replace(/s$/,'')).join(' ');
  if (!READABLE.has(storedKey)) continue;
  considered++;
  if (tradeWordHit(name, stored)) continue;                 // the name agrees, nothing to see
  /* The name has to positively claim ANOTHER trade — absence alone is normal ("Ronnie's"). */
  const votes = new Map<string,number>();
  for (const w of norm(name).split(' ')) { const m = MARKER.get(w); if (m && m.trade !== storedKey) votes.set(m.trade,(votes.get(m.trade)??0)+1); }
  let best=''; let top=0; for (const [k,v] of votes) if (v>top){top=v;best=k;}
  if (best) conflicts.push({ l, stored, looksLike: best });
}
console.log(`leads on file                    : ${leads.length}`);
console.log(`with a trade the checker can read: ${considered}`);
console.log(`NAME CONTRADICTS STORED TRADE    : ${conflicts.length}  (${((conflicts.length/considered)*100).toFixed(1)}%)\n`);
const live = conflicts.filter(c=>!c.l.is_archived);
const paid = conflicts.filter(c=>(c.l.amount_paid??0)>0);
console.log(`  of those, unarchived: ${live.length} · PAYING: ${paid.length}\n`);
for (const c of conflicts.slice(0,30)) {
  console.log(`  "${c.l.business_name}"`);
  console.log(`      stored "${c.stored}"  ->  reads as ${c.looksLike}${c.l.is_archived?'  [archived]':''}${(c.l.amount_paid??0)>0?'  [PAID]':''}`);
}
