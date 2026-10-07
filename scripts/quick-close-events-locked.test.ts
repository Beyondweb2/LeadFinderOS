/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE EVENTS ARE COMMISSION EVIDENCE (2026-10-02). The payment link a salesperson generated is
   the proof a sale was closed before their engagement ended (src/lib/commission.ts closedWhileEngaged),
   so the table is locked (migration 20261005120000): no browser privilege at all, the database sets the
   time, rows are never edited, deleted or wiped — except by the lead's own cascade. Every reader and
   writer is server-side. (The live behaviour was proven by a rolled-back SQL run on 2026-10-02 —
   docs/sales-page-monthly-commission.md §7.)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : []);

const mig = read('supabase/migrations/20261005120000_quick_close_events_locked.sql');
ok(/revoke all on public\.quick_close_events from anon, authenticated;/.test(mig), 'no privilege at all for anon / authenticated (insert, update, delete, truncate, select)');
ok(/new\.created_at := now\(\);/.test(mig) && /before insert on public\.quick_close_events/.test(mig), 'the database sets the time on every insert — nothing can backdate an event');
ok(/before update or delete on public\.quick_close_events/.test(mig) && /before truncate on public\.quick_close_events/.test(mig) && /raise exception 'quick_close_events is append-only/.test(mig), 'rows are never edited, deleted or wiped, by any role');
ok(/if tg_op = 'DELETE' and pg_trigger_depth\(\) > 1 then\s*return old;/.test(mig), "…except the lead's own cascade, so deleting a lead still works");
ok(!/delete from public\.quick_close_events|update public\.quick_close_events/i.test(mig), 'the migration rewrites and deletes no existing row');

// Every use of the table is server-side (service role); the browser never reads or writes it.
const front = walk('src').filter((p) => read(p).includes('quick_close_events') && !/^src\/lib\/commission\.ts$/.test(p));
ok(front.length === 0, `no browser code touches quick_close_events (found: ${front.join(', ') || 'none'})`);
const qc = read('supabase/functions/quick-close/index.ts');
ok(/service\.from\("quick_close_events"\)\.insert\(\{ lead_id: leadId, onboarding_id: onboardingId, actor_user_id: actor, kind, data \}\)/.test(qc), 'Quick Close still writes its events through the service role (no created_at sent)');
ok(/service\.from\("quick_close_events"\)\.insert\(\{ lead_id: leadId, onboarding_id: onboardingId, actor_user_id: null, kind: "paid"/.test(read('supabase/functions/stripe-webhook/index.ts')), 'the Stripe webhook writes its "paid" event through the service role');
ok(/service\.from\("quick_close_events"\)\.select\("lead_id, actor_user_id, created_at, kind, data"\)/.test(read('supabase/functions/_shared/earnings.ts')), 'the commission proof lookup reads through the service role');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
