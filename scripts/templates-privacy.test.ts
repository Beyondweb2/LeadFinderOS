/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SAVED TEXTS ARE PRIVATE (2026-10-04, pre-sales certification M-002 / A-02;
   docs/pre-sales-certification/fixes-01-security-inbound.md).

   Every salesperson could SELECT all 15 of Paul's saved texts (policy sales_select_templates): his
   personal working note with his login email and account id, a "Pricing" text with two old live
   Stripe Payment Links, old "eight weeks" prices — and send any of them from the Inbox Quick reply.
   Guarded here:
     · the migration drops the policy, and NO later migration re-creates it or any other cross-owner
       read of templates (the last word on sales_select_templates is a drop);
     · the remaining policies are owner-only (auth.uid() = user_id) for read, insert, update, delete;
     · nothing on the server reads `templates`, so there is no path that sends a saved text by id —
       a rep can only send text they could read, i.e. their own;
     · the browser no longer seeds the barber-era defaults into an account whose list is empty
       (which, with Paul's rows now hidden, would have been every new rep).
   The live proof (rolled back, 2026-10-04): as a rep, 0 of Paul's rows and 1 own; another rep 0 of
   either; Paul still 15 of his own; the four owner policies remain — in the fixes document.
   Run: npx tsx scripts/templates-privacy.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (sql: string) => sql.replace(/--.*$/gm, '');

console.log('── the policy ──');
{
  const mig = strip(read('supabase/migrations/20261006010000_templates_owner_only.sql'));
  ok(/drop policy if exists sales_select_templates on public\.templates;/.test(mig), 'the migration drops sales_select_templates');
  ok(!/create policy/i.test(mig), '…and creates nothing in its place (no shared-template concept exists)');
  ok(!/delete from|truncate|update public\.templates/i.test(mig), '…and touches no rows (Paul\'s records stay)');

  const names = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((n) => n.endsWith('.sql')).sort();
  const events: Array<{ file: string; kind: 'create' | 'drop' }> = [];
  for (const n of names) {
    const sql = strip(read(`supabase/migrations/${n}`));
    const re = /(create|drop) policy (?:if exists )?sales_select_templates/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) events.push({ file: n, kind: m[1].toLowerCase() as 'create' | 'drop' });
  }
  ok(events.length > 0 && events[events.length - 1].kind === 'drop', `the LAST migration to mention sales_select_templates drops it (${events.length ? events[events.length - 1].file : 'none'})`);

  const dropAt = names.indexOf('20261006010000_templates_owner_only.sql');
  /* The ONE sanctioned later SELECT policy (2026-10-07, team templates): own rows + ACTIVE rows an admin marked scope 'team' — never "every row of Paul's". */
  const TEAM_MIG = '20261016100000_team_templates.sql';
  const later = names.slice(dropAt + 1).filter((n) => n !== TEAM_MIG && /create policy [^;]*on public\.templates[^;]*for select/i.test(strip(read(`supabase/migrations/${n}`)).replace(/\n/g, ' ')));
  ok(later.length === 0, `no later migration adds another SELECT policy on templates (${later.join(', ') || 'none'})`);
  const teamSql = strip(read(`supabase/migrations/${TEAM_MIG}`)).replace(/\s+/g, ' ');
  ok(/create policy templates_select on public\.templates for select to authenticated using \( user_id = \(select auth\.uid\(\)\) or \(scope = 'team' and archived_at is null and \(select public\.my_role\(\)\) in \('admin', 'sales'\)\)/.test(teamSql) && !/sales_select_templates/.test(teamSql),
    'the team migration shares ONLY scope = team rows, and only active ones (a personal row is never visible to anyone but its owner)');
}

console.log('\n── no server path sends a saved text by id ──');
{
  const fnRoot = new URL('../supabase/functions/', import.meta.url);
  const offenders: string[] = [];
  const walk = (dir: URL, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir), `${rel}${e.name}/`);
      else if (e.name.endsWith('.ts') && /\.from\(\s*["']templates["']\s*\)/.test(readFileSync(new URL(e.name, dir), 'utf8'))) offenders.push(`${rel}${e.name}`);
    }
  };
  walk(fnRoot, '');
  ok(offenders.length === 0, `no edge function reads the templates table (${offenders.join(', ') || 'none'}) — sending is message text the rep could read`);
  const inbox = read('src/pages/Inbox.tsx');
  ok(/const \{ templates, grouped: templateGroups \} = useTemplates\(\);/.test(inbox) && /templates\.filter\(\(t\) => t\.template_type === 'text'\)/.test(inbox),
    'the Inbox Quick reply is built only from useTemplates (an RLS-scoped read: the caller\'s own rows plus active Team templates)');
}

console.log('\n── the browser does not seed defaults into an account ──');
{
  const hook = read('src/hooks/useTemplates.ts');
  ok(!/DEFAULT_TEMPLATES\.map\(\(t\) => \(\{ \.\.\.t, user_id/.test(hook), 'no DEFAULT_TEMPLATES rows are written to an account');
  ok(/return \(data \?\? \[\]\)\.map\(typeRow\);/.test(hook), 'an empty list stays empty (a new rep starts with none of their own)');
  ok(/if \(!user\) return GUEST_TEMPLATES;/.test(hook), 'a signed-out visitor still sees the hardcoded set (never written anywhere)');
}

console.log(`\n${f === 0 ? 'ALL PASS' : `${f} FAILED`}`);
if (f) process.exit(1);
