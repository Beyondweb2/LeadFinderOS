/* Prove the measurement-time flag bites on the real audits, and stays quiet where it should. */
import { execSync } from 'node:child_process';
import { buildBaselineView, type QueueRowLite } from '../src/lib/baselineView';
import { assessTradeFit } from '../src/lib/questionTradeFit';
const keys = JSON.parse(execSync('npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const KEY = (keys as Array<{ name: string; api_key: string }>).find((k) => k.name === 'service_role')!.api_key;
const sel = async (p: string) => JSON.parse(await (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).text());

const TARGETS = process.argv.slice(2);
for (const id of TARGETS) {
  const [a] = await sel(`ai_audits?select=id,business_name,business_type,audit_purpose&id=eq.${id}`);
  const rows: QueueRowLite[] = await sel(`ai_audit_queue?select=run_id,question,engines,status,result&audit_id=eq.${id}&order=id.asc&limit=1000`);
  const view = buildBaselineView(rows.filter((r) => r.status === 'done'), { businessName: a.business_name });
  const fit = assessTradeFit(view, a.business_type);
  console.log(`\n████ ${a.business_name} · "${a.business_type}" · ${a.audit_purpose} · ${view.questions.length} questions`);
  console.log(`   readable: ${fit.readable}  (median in-trade share ${fit.medianShare === null ? 'n/a' : `${Math.round(fit.medianShare * 100)}%`})`);
  console.log(`   flagged off-trade: ${fit.offTrade.length}`);
  for (const q of fit.questions) {
    const band = view.questions.find((v) => v.question === q.question)?.band;
    const mark = q.state === 'off_trade' ? '⛔' : q.state === 'too_few_firms' ? '··' : '  ';
    console.log(`   ${mark} [${String(band).padEnd(10)}] ${q.firms ? `${q.inTrade}/${q.firms}` : '   '}  "${q.question}"`);
    if (q.state === 'off_trade') console.log(`         strangers: ${q.strangers.slice(0, 6).join(', ')}`);
  }
}
