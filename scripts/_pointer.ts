/* READ-ONLY. (a) What does Ronnie's baseline pointer actually resolve to? */
import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());

const leads = await sel(`outreach_leads?select=id,business_name,amount_paid,status,baseline_audit_id,remeasure_audit_id,remeasure_due_date,remeasure_results_sent_at&amount_paid=gt.0&order=business_name.asc`);
console.log(`PAYING LEADS: ${leads.length}\n`);
for (const l of leads) {
  console.log(`████ ${l.business_name} · £${l.amount_paid} · ${l.status} · due ${l.remeasure_due_date ?? '(none)'}`);
  console.log(`   baseline_audit_id : ${l.baseline_audit_id ?? '(null)'}`);
  console.log(`   remeasure_audit_id: ${l.remeasure_audit_id ?? '(null)'}`);
  const audits = await sel(`ai_audits?select=id,business_type,audit_purpose,baseline_target_runs,is_measurement,is_market,baseline_completed_at,baseline_contract,created_at&lead_id=eq.${l.id}&order=created_at.asc`);
  for (const a of audits) {
    const runs = await sel(`ai_audit_runs?select=id,run_number,status,created_at&audit_id=eq.${a.id}&order=run_number.asc`);
    const rows = await sel(`ai_audit_queue?select=run_id,question,status&audit_id=eq.${a.id}&limit=2000`);
    const distinctQ = new Set(rows.map((r:any)=>String(r.question??'').toLowerCase().trim())).size;
    const perRun = new Map<string,number>();
    for (const r of rows) perRun.set(String(r.run_id), (perRun.get(String(r.run_id))??0)+1);
    const isPointer = a.id === l.baseline_audit_id ? '  <<== baseline_audit_id POINTS HERE' : '';
    console.log(`   · ${a.id.slice(0,8)} ${String(a.audit_purpose ?? '(legacy)').padEnd(12)} target_runs=${String(a.baseline_target_runs ?? 'null').padEnd(4)} is_meas=${String(a.is_measurement ?? false).padEnd(5)} frozen=${a.baseline_completed_at?String(a.baseline_completed_at).slice(0,10):'no'.padEnd(10)} contract=${a.baseline_contract?'yes':'NO '} ${String(a.created_at).slice(0,10)}${isPointer}`);
    console.log(`       runs=${runs.length} (${runs.map((r:any)=>`#${r.run_number}:${r.status}`).join(' ')}) · queue rows=${rows.length} · distinct questions=${distinctQ} · rows per run=${[...perRun.values()].join('/')}`);
  }
  console.log('');
}
