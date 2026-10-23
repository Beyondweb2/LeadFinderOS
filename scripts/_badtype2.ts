/* The root cause is not the name — it is that the trade a lead carries is THE TERM THAT WAS
   SEARCHED, and a radius search returns businesses that are not that trade. Google's own category
   is the independent witness. */
import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());
const all = async (t:string,c:string)=>{ const o:any[]=[]; let last:string|null=null;
  for(let i=0;i<200;i++){ const p=await sel(`${t}?select=${c}&order=id.asc&limit=1000${last?`&id=gt.${last}`:''}`); o.push(...p); if(p.length<1000) return o; last=p[p.length-1].id; } throw new Error('pages'); };
const leads = await all('outreach_leads','id,business_name,category,search_keyword,is_archived,amount_paid');
const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const sing=(s:string)=>s.split(' ').map(w=>w.replace(/s$/,'')).join(' ');

let bothSet=0, agree=0; const disagree:any[]=[];
let noCategory=0, noKeyword=0;
for (const l of leads) {
  const c=norm(l.category), k=norm(l.search_keyword);
  if (!c) noCategory++; if (!k) noKeyword++;
  if (!c || !k) continue;
  bothSet++;
  const a=sing(c), b=sing(k);
  if (a===b || a.includes(b) || b.includes(a)) agree++; else disagree.push({...l,c,k});
}
console.log(`leads                          : ${leads.length}`);
console.log(`  no Google category stored    : ${noCategory}`);
console.log(`  no search keyword stored     : ${noKeyword}`);
console.log(`  BOTH stored (comparable)     : ${bothSet}`);
console.log(`    agree                      : ${agree}`);
console.log(`    DISAGREE                   : ${disagree.length}  (${((disagree.length/bothSet)*100).toFixed(1)}% of comparable)\n`);
const byPair=new Map<string,{n:number;ex:string[]}>();
for (const d of disagree){ const key=`searched "${d.k}"  ->  Google says "${d.c}"`; const v=byPair.get(key)??{n:0,ex:[]}; v.n++; if(v.ex.length<3)v.ex.push(d.business_name); byPair.set(key,v); }
console.log('the disagreements, commonest first:');
for (const [k,v] of [...byPair].sort((a,b)=>b[1].n-a[1].n).slice(0,22)) console.log(`  ${String(v.n).padStart(4)}  ${k}\n           e.g. ${v.ex.join(' · ')}`);
const pat = leads.find(l=>/B PAT Testing/i.test(String(l.business_name??'')));
console.log(`\nB PAT Testing: category=${JSON.stringify(pat?.category)} search_keyword=${JSON.stringify(pat?.search_keyword)}`);
console.log(`paying leads among the disagreements: ${disagree.filter(d=>(d.amount_paid??0)>0).length}`);
console.log(`unarchived among them: ${disagree.filter(d=>!d.is_archived).length}`);
