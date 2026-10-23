/* READ-ONLY, ONE QUESTION: for every lead carrying a baseline_audit_id, does the pointed-at audit
   REPEAT one question set across its runs (a real baseline), or ask DIFFERENT questions per run
   (an audit that was grown)? The Saturday backfill tested `baseline_target_runs > 1`, which cannot
   tell these apart. */
import { execSync } from 'node:child_process';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }));
const KEY = (keys as Array<{name:string;api_key:string}>).find(k=>k.name==='service_role')!.api_key;
const sel = async (p:string)=>JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}})).text());
const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const leads = await sel(`outreach_leads?select=id,business_name,amount_paid,status,baseline_audit_id,remeasure_due_date,remeasure_audit_id&baseline_audit_id=not.is.null&order=business_name.asc`);
console.log(`leads carrying a baseline_audit_id: ${leads.length}\n`);

for (const l of leads) {
  const [a] = await sel(`ai_audits?select=id,business_type,audit_purpose,baseline_target_runs,is_measurement,baseline_completed_at,baseline_contract,created_at&id=eq.${l.baseline_audit_id}`);
  if (!a) { console.log(`⛔ ${l.business_name}: pointer ${l.baseline_audit_id} resolves to NO AUDIT`); continue; }
  const rows = await sel(`ai_audit_queue?select=run_id,question&audit_id=eq.${a.id}&limit=3000`);

  /* Per run, the SET of questions it asked. A baseline repeats one set; a grown audit does not. */
  const byRun = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = String(r.run_id);
    if (!byRun.has(k)) byRun.set(k, new Set());
    byRun.get(k)!.add(norm(r.question));
  }
  const sets = [...byRun.values()];
  const all = new Set(rows.map((r:any)=>norm(r.question)));
  const biggest = sets.reduce((m,s)=>Math.max(m,s.size),0);
  /* Questions present in EVERY run — the repeated core. */
  const core = [...all].filter((q)=>sets.every((s)=>s.has(q)));
  const repeats = sets.length > 1 && core.length === all.size && sets.every((s)=>s.size===all.size);
  const verdict = sets.length <= 1 ? 'SINGLE RUN — nothing repeated'
    : repeats ? 'repeats one set — a real baseline'
    : core.length === 0 ? '⛔ NO QUESTION APPEARS IN EVERY RUN — grown, not repeated'
    : `⛔ PARTIAL — only ${core.length} of ${all.size} questions appear in every run`;

  console.log(`${verdict.startsWith('⛔')||verdict.startsWith('SINGLE')?'⛔':'✅'} ${l.business_name}  £${l.amount_paid ?? 0}  due ${l.remeasure_due_date ?? '—'}`);
  console.log(`     audit ${a.id.slice(0,8)}  purpose=${a.audit_purpose ?? '(legacy null)'}  target_runs=${a.baseline_target_runs ?? 'null'}  contract=${a.baseline_contract?'yes':'NO'}  frozen=${a.baseline_completed_at?String(a.baseline_completed_at).slice(0,10):'no'}`);
  console.log(`     runs=${sets.length}  questions/run=${sets.map(s=>s.size).join('/')}  distinct overall=${all.size}  in EVERY run=${core.length}`);
  console.log(`     ${verdict}\n`);
}
