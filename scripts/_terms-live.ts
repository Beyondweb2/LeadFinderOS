/* UNTRACKED SCRATCH — never stage. Runs the DEPLOYED predicate over the LIVE rows, read-only. */
import { execFileSync } from 'node:child_process';
import { currentTermsVerdict } from '../src/lib/remeasureResults.ts';
const REF='ruusxpkkmwtljxxulhbq';
const keys=JSON.parse(execFileSync('npx',['supabase','projects','api-keys','--project-ref',REF,'--output','json'],{encoding:'utf8',shell:true}));
const jwt=(keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const g=async(p:string)=>{const r=await fetch(`https://${REF}.supabase.co/rest/v1`+p,{headers:{apikey:jwt,Authorization:'Bearer '+jwt}});if(!r.ok)throw new Error(p+' '+r.status);return r.json();};
async function main(){
  const leads=await g('/outreach_leads?amount_paid=gt.0&select=business_name,amount_paid,remeasure_due_date,baseline_audit_id,status');
  for(const l of leads){
    const a=l.baseline_audit_id?await g(`/ai_audits?id=eq.${l.baseline_audit_id}&select=baseline_contract,baseline_completed_at`):[];
    const v=currentTermsVerdict({contract:a[0]?.baseline_contract??null,amountPaid:l.amount_paid,baselineFrozenAt:a[0]?.baseline_completed_at??null,remeasureDueDate:l.remeasure_due_date});
    console.log(`${v.current?'ALLOW ':'REFUSE'}  ${String(l.business_name).padEnd(36)} £${l.amount_paid}  due ${l.remeasure_due_date ?? '(none)'}  ${v.current?'':'— '+v.reason}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
