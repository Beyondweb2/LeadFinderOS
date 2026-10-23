import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());

for (const id of ['5892a831-dd80-4543-9679-155ce1190265','304d5ff1-16df-43d7-8444-a8170aeed9d6']) {
  const [a] = await sel(`ai_audits?select=id,business_name,audit_purpose,has_website,website,lead_id&id=eq.${id}`);
  console.log(`\n████ ${a.business_name} · ${a.audit_purpose} · ${a.id.slice(0,8)}`);
  console.log(`   ai_audits.has_website = ${JSON.stringify(a.has_website)}   ai_audits.website = ${JSON.stringify(a.website)}`);
  const [l] = await sel(`outreach_leads?select=id,business_name,website,phone,email,contact_name,place_id,category,search_keyword&id=eq.${a.lead_id}`);
  console.log(`   lead.website = ${JSON.stringify(l?.website)}`);
  console.log(`   lead.phone = ${JSON.stringify(l?.phone)}  email = ${JSON.stringify(l?.email)}  contact_name = ${JSON.stringify(l?.contact_name)}`);
  const runs = await sel(`ai_audit_runs?select=id,run_number,status,results&audit_id=eq.${a.id}&order=run_number.asc`);
  for (const r of runs) {
    const seo = (r.results ?? {}).seo;
    console.log(`   run #${r.run_number} ${r.status}: results.seo = ${seo === undefined ? 'ABSENT' : JSON.stringify(seo).slice(0,220)}`);
  }
}

/* How much of the book would actually gain from prefilling these. */
const all = async (t:string,c:string)=>{ const o:any[]=[]; let last:string|null=null;
  for(let i=0;i<200;i++){ const p=await sel(`${t}?select=${c}&order=id.asc&limit=1000${last?`&id=gt.${last}`:''}`); o.push(...p); if(p.length<1000) return o; last=p[p.length-1].id; } throw new Error('pages'); };
const leads = await all('outreach_leads','id,phone,website,email,contact_name,is_archived');
const live = leads.filter(l=>!l.is_archived);
const has=(v:unknown)=>!!String(v??'').trim();
console.log(`\n\nUNARCHIVED LEADS: ${live.length}`);
for (const [k,f] of [['phone',(l:any)=>has(l.phone)],['website',(l:any)=>has(l.website)],['email',(l:any)=>has(l.email)],['contact_name',(l:any)=>has(l.contact_name)]] as const)
  console.log(`   ${k.padEnd(14)} present on ${String(live.filter(f).length).padStart(5)}  (${((live.filter(f).length/live.length)*100).toFixed(1)}%)`);
