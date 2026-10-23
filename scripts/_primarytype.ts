/* READ-ONLY. Exactly how many rows the backfill will touch, measured rather than estimated. */
import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch('https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/'+p,{headers:{apikey:KEY,Authorization:'Bearer '+KEY}})).text());
const all = async (t:string,c:string)=>{ const o:any[]=[]; let last:string|null=null;
  for(let i=0;i<300;i++){ const p=await sel(`${t}?select=${c}&order=id.asc&limit=1000${last?`&id=gt.${last}`:''}`); o.push(...p); if(p.length<1000) return o; last=p[p.length-1].id; }
  throw new Error('page budget exhausted'); };

const cache = await all('search_cache','id,results,created_at');
/* Newest wins: a business can appear in several cached searches and Google's answer can change. */
const byPlace = new Map<string,{t:string;l:string;at:string}>();
let entries = 0, withType = 0;
for (const row of cache) {
  const res = Array.isArray(row.results) ? row.results : [];
  for (const b of res) {
    entries++;
    const id = b?.id, t = b?.primaryType, l = b?.primaryTypeLabel;
    if (!id || !t) continue;
    withType++;
    const prev = byPlace.get(id);
    if (!prev || String(row.created_at) > prev.at) byPlace.set(id, { t, l: l ?? '', at: String(row.created_at) });
  }
}
console.log(`search_cache rows                : ${cache.length}`);
console.log(`cached business entries          : ${entries}`);
console.log(`  ...carrying a primaryType      : ${withType}`);
console.log(`distinct place_ids with a type   : ${byPlace.size}`);

const leads = await all('outreach_leads','id,place_id,category,search_keyword,business_name,is_archived');
const withPlace = leads.filter(l=>l.place_id);
const matched = withPlace.filter(l=>byPlace.has(l.place_id));
console.log(`\noutreach_leads                   : ${leads.length}`);
console.log(`  with a place_id                : ${withPlace.length}`);
console.log(`  MATCHED in search_cache        : ${matched.length}   <-- the backfill UPDATE count`);
console.log(`  unarchived among those         : ${matched.filter(l=>!l.is_archived).length}`);

/* And the point of the whole exercise: how many DISAGREE with the trade they were filed under. */
const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sing=(s:string)=>s.split(' ').map(w=>w.replace(/s$/,'')).join(' ');
let agree=0; const dis: Array<[string,string,string]> = [];
for (const l of matched) {
  const stored = sing(norm(l.search_keyword ?? l.category));
  const google = sing(norm(byPlace.get(l.place_id)!.l || byPlace.get(l.place_id)!.t));
  if (!stored || !google) continue;
  if (stored===google || stored.includes(google) || google.includes(stored)) agree++;
  else dis.push([l.business_name, stored, google]);
}
console.log(`\n  agree with the searched trade  : ${agree}`);
console.log(`  DISAGREE                       : ${dis.length}  (${((dis.length/(agree+dis.length))*100).toFixed(1)}%)`);
const tally=new Map<string,number>();
for(const [,s,g] of dis) tally.set(`${s}  ->  ${g}`,(tally.get(`${s}  ->  ${g}`)??0)+1);
console.log('\n  commonest disagreements:');
for(const [k,v] of [...tally].sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(`    ${String(v).padStart(4)}  ${k}`);
console.log('\n  examples:');
for(const [n,s,g] of dis.slice(0,6)) console.log(`    "${n}" — searched ${s}, Google says ${g}`);
