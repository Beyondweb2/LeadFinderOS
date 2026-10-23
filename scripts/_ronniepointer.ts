/* READ-ONLY, ONE QUESTION: what does Ronnie's baseline_audit_id resolve to? */
import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());

const [lead] = await sel(`outreach_leads?select=id,business_name,baseline_audit_id,remeasure_audit_id,remeasure_due_date&business_name=ilike.*Ronnie*`);
console.log(`${lead.business_name}`);
console.log(`  baseline_audit_id  : ${lead.baseline_audit_id ?? '(null)'}`);
console.log(`  remeasure_audit_id : ${lead.remeasure_audit_id ?? '(null)'}`);
console.log(`  remeasure_due_date : ${lead.remeasure_due_date ?? '(null)'}\n`);

const audits = await sel(`ai_audits?select=id,audit_purpose,baseline_target_runs,is_measurement,is_market,baseline_completed_at,baseline_contract,created_at&lead_id=eq.${lead.id}&order=created_at.asc`);
console.log(`every audit on this lead (${audits.length}):`);
for (const a of audits) {
  const runs = await sel(`ai_audit_runs?select=run_number,status&audit_id=eq.${a.id}&order=run_number.asc`);
  const rows = await sel(`ai_audit_queue?select=run_id,question&audit_id=eq.${a.id}&limit=2000`);
  const qs = new Set(rows.map((r:any)=>String(r.question??'').toLowerCase().trim()));
  const perRun = new Map<string,number>(); for (const r of rows) perRun.set(String(r.run_id),(perRun.get(String(r.run_id))??0)+1);
  const ptr = a.id === lead.baseline_audit_id;
  console.log(`\n  ${ptr ? '>>>' : '   '} ${a.id.slice(0,8)}  purpose=${a.audit_purpose ?? '(legacy null)'}  target_runs=${a.baseline_target_runs ?? 'null'}  is_measurement=${a.is_measurement ?? 'null'}  is_market=${a.is_market ?? 'null'}`);
  console.log(`      frozen=${a.baseline_completed_at ? String(a.baseline_completed_at).slice(0,10) : 'no'}  contract=${a.baseline_contract ? 'yes' : 'NO'}  created=${String(a.created_at).slice(0,10)}`);
  console.log(`      runs=${runs.length} [${runs.map((r:any)=>`#${r.run_number}:${r.status}`).join(' ')}]  queue rows=${rows.length}  distinct questions=${qs.size}  rows/run=${[...perRun.values()].join('/')}`);
  if (ptr) console.log(`      ^^^ THIS IS WHAT baseline_audit_id POINTS AT`);
}
