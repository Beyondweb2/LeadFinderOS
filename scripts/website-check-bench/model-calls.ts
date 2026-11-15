// FETCH THE MODEL ANSWERS THE BENCH IS WAITING FOR (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// A bench run saves every service-review question it could not answer (cache/model-pending.json). This asks them through
// the internal edge function website-check-bench — called from the database with pg_net and the vault's CRON_SECRET, so no
// key is ever on this machine — and saves the answers (cache/model-answers.json). Spends money: each question is one call.
//
//   node --import tsx scripts/website-check-bench/model-calls.ts send --models gpt-4o-mini,gpt-5-mini     → prints request ids
//   node --import tsx scripts/website-check-bench/model-calls.ts collect                                → saves the answers
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { modelFiles, modelKey, storeModelAnswers, CACHE_DIR } from './net.ts';

const REF = 'ruusxpkkmwtljxxulhbq';
const SENT = path.join(CACHE_DIR, 'model-sent.json');
const REPO = path.resolve(import.meta.dirname, '..', '..');
const sqlFile = path.join(CACHE_DIR, '_query.sql');
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function query(sql: string, write: boolean): any[] {
  writeFileSync(sqlFile, sql);
  const out = execFileSync('npx', ['supabase', 'db', 'query', `--remote=${REF}`, write ? '--yes' : '--read-only', '-o', 'json', '-f', sqlFile], { cwd: REPO, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out).rows ?? [];
}

const cmd = process.argv[2];
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

if (cmd === 'send') {
  const models = String(arg('--models') ?? 'gpt-4o-mini').split(',').map((s) => s.trim()).filter(Boolean);
  const pending = JSON.parse(readFileSync(modelFiles.MODEL_PENDING, 'utf8')) as Record<string, any>;
  const answers = existsSync(modelFiles.MODEL_CACHE) ? JSON.parse(readFileSync(modelFiles.MODEL_CACHE, 'utf8')) : {};
  const sent = existsSync(SENT) ? JSON.parse(readFileSync(SENT, 'utf8')) : {};
  const bodies: Array<{ key: string; body: any }> = [];
  const seen = new Set<string>();
  for (const b of Object.values(pending)) for (const m of models) {
    const body = { ...b, model: m };
    const key = modelKey(body);
    if (answers[key] || sent[key] || seen.has(key)) continue;
    seen.add(key);
    bodies.push({ key, body });
  }
  if (!bodies.length) { console.log('nothing to send'); process.exit(0); }
  const calls = bodies.map(({ body }) => `net.http_post(
    url := 'https://${REF}.supabase.co/functions/v1/website-check-bench',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' limit 1)),
    body := ${lit(JSON.stringify({ action: 'review', model: body.model, messages: body.messages }))}::jsonb,
    timeout_milliseconds := 120000)`);
  const rows = query(`select array[${calls.join(',\n')}] as ids;`, true);
  const ids: number[] = rows[0].ids;
  bodies.forEach((b, i) => { sent[b.key] = { id: ids[i], model: b.body.model }; });
  writeFileSync(SENT, JSON.stringify(sent, null, 1));
  console.log(`sent ${ids.length} calls`);
} else if (cmd === 'collect') {
  const sent = JSON.parse(readFileSync(SENT, 'utf8')) as Record<string, { id: number; model: string }>;
  const ids = Object.values(sent).map((s) => s.id);
  const rows = query(`select id, status_code, content, error_msg from net._http_response where id in (${ids.join(',')});`, false);
  console.log(`rows read: ${rows.length}`);
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const fresh: Record<string, any> = {};
  let waiting = 0, failed = 0;
  for (const [key, s] of Object.entries(sent)) {
    const r = byId.get(Number(s.id));
    if (!r) { waiting++; continue; }
    const c = (() => { try { return JSON.parse(r.content); } catch { return null; } })();
    if (c?.ok && c.answer) fresh[key] = { ...c.answer, bench_ms: c.ms };
    else { failed++; console.log(`${s.model} #${s.id}: ${r.status_code} ${c?.error ?? r.error_msg ?? ''}`.slice(0, 300)); delete sent[key]; }
  }
  storeModelAnswers(fresh);
  writeFileSync(SENT, JSON.stringify(sent, null, 1));
  console.log(`answers saved: ${Object.keys(fresh).length}; still waiting: ${waiting}; failed (will be re-sent): ${failed}`);
}
process.exit(0);
