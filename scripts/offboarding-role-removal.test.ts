/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OFF-BOARDING: REMOVING THE ROLE IS THE KILL SWITCH (2026-10-04, pre-sales certification M-054 /
   E-09; docs/pre-sales-certification/fixes-01-security-inbound.md).

   Signing out does NOT end access at once: a signed-out access token stays valid against the database
   API until it expires (≤1 h), and functions that verified tokens locally (getClaims) accepted it too.
   Removing the salesperson's ROLE is immediate everywhere, because the role is read on every call:
   my_role() in every RLS policy and RPC, user_roles in every edge function. Team → Disable removes the
   role AND bans the login. This suite keeps that true:
     · Team → Disable deletes the 'sales' role row and bans the account;
     · the shared resolver reads user_roles on EVERY call (no cache), and no role = refused;
     · every edge function that still checks a token locally ALSO reads the role per call (so a removed
       role is refused even while the token lives) — the one exception is listed with its reason;
     · the operational functions a rep uses for Inbox, Outreach, inbound/crawl and lead work are on
       the shared resolver.
   The live proof (rolled back, 2026-10-04): with the rep's role row removed mid-session, my_role()
   null, can_work_lead false, sales_leads 0 rows, their lead's messages 0, unread 0.
   Run: npx tsx scripts/offboarding-role-removal.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pickRole } from '../src/lib/roleRules.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('── Team → Disable ──');
{
  const au = read('supabase/functions/admin-users/index.ts');
  const disable = au.slice(au.indexOf("if (action === 'team_disable') {"), au.indexOf("/* ⛔ RE-ENABLE NEVER REACHES BACK"));
  ok(/from\('user_roles'\)\.delete\(\)\.eq\('user_id', uid\)\.eq\('role', 'sales'\)/.test(disable), 'Disable deletes the sales role row (the immediate kill switch)');
  ok(/ban_duration: '876000h'/.test(disable), '…and bans the login, so the session cannot be refreshed');
}

console.log('\n── the role is read on every call ──');
{
  const acc = read('supabase/functions/_shared/access.ts');
  const resolver = acc.slice(acc.indexOf('export async function resolveActor'), acc.indexOf('export async function userTeamRole'));
  ok(/service\.from\("user_roles"\)\.select\("role"\)\.eq\("user_id", who\.user\.id\)/.test(resolver), 'resolveActor reads user_roles itself, every call');
  ok(/if \(!role\) return \{ ok: false, status: 403, error: "no_role"/.test(resolver), '…and no role → 403');
  ok(pickRole([]) === null && pickRole(undefined) === null, 'no role rows → no role');
  ok(pickRole([{ role: 'sales' }]) === 'sales' && pickRole([{ role: 'admin' }, { role: 'sales' }]) === 'admin', 'a present role still resolves');
}

console.log('\n── every local-token function also reads the role ──');
{
  /* clear-enrichment-cache acts only on leads whose user_id IS the caller (the book owner's rows);
     a salesperson owns no lead rows, so a removed rep can reach nothing through it. */
  const EXEMPT: Record<string, string> = { 'clear-enrichment-cache': 'acts only on rows whose user_id is the caller (reps own none)' };
  const root = new URL('../supabase/functions/', import.meta.url);
  const missing: string[] = [];
  let checked = 0;
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const p = `supabase/functions/${d.name}/index.ts`;
    if (!existsSync(new URL(`../${p}`, import.meta.url))) continue;
    const src = read(p);
    if (!/\.getClaims\(/.test(src)) continue;
    checked++;
    const readsRole = /from\(['"]user_roles['"]\)|userTeamRole\(|resolveActor\(|requireAdmin\(/.test(src);
    if (!readsRole && !EXEMPT[d.name]) missing.push(d.name);
  }
  ok(checked > 0, `${checked} functions still verify a token locally`);
  ok(missing.length === 0, `each of them also reads the role per call, so a removed role is refused at once (missing: ${missing.join(', ') || 'none'})`);
}

console.log('\n── the rep\'s operational functions are on the shared resolver ──');
{
  for (const fn of ['crawl-check', 'send-whatsapp-message', 'send-whatsapp-media', 'send-whatsapp-voice', 'create-ai-audit', 'warm-lead-reply', 'voice-note-script', 'quick-close', 'enrich-lead']) {
    ok(/resolveActor\(req, /.test(read(`supabase/functions/${fn}/index.ts`)), `${fn} → resolveActor (revoked session 401, removed role 403, outage 503)`);
  }
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
