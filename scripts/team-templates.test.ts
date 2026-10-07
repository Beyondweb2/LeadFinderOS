/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   TEAM TEMPLATES (2026-10-07, feature/shared-sales-templates). The rules the screens follow (src/lib/teamTemplates.ts), the shape of the
   one shared table, and the source pins. The database's own enforcement is proven by supabase/tests/team-templates.sql (a rolled-back
   RLS run, recorded in docs/pre-sales-certification/team-templates.md) — this file pins that the migration says it.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { MINE_HEADING, TEAM_HEADING, canManageTemplate, duplicateAsPersonal, isArchived, isTeamTemplate, splitTemplates, type ScopedTemplate } from '../src/lib/teamTemplates.ts';
import { fillTemplate } from '../src/lib/leadUtils.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const ADMIN = 'admin-1', A = 'sales-a', B = 'sales-b';
const row = (o: Partial<ScopedTemplate> & { id: string; user_id: string }): ScopedTemplate => ({ title: o.id, content: 'Hi {{business_name}}', category: 'initial', template_type: 'text', scope: 'personal', created_at: '2026-10-07T00:00:00Z', ...o });
/* What the database hands each person (RLS): their own rows + every active Team row. */
const TEAM1 = row({ id: 't1', user_id: ADMIN, scope: 'team', title: 'Opener', sort_order: 2 });
const TEAM2 = row({ id: 't2', user_id: ADMIN, scope: 'team', title: 'Audit reply', sort_order: 1 });
const TEAM_OLD = row({ id: 't3', user_id: ADMIN, scope: 'team', title: 'Retired', archived_at: '2026-10-06T00:00:00Z' });
const MINE_A = row({ id: 'pa', user_id: A, title: 'A mine' });
const MINE_B = row({ id: 'pb', user_id: B, title: 'B mine' });
const seenBy = (uid: string) => [TEAM1, TEAM2, TEAM_OLD, ...(uid === A ? [MINE_A] : uid === B ? [MINE_B] : [])];

console.log('\n── WHAT EACH PERSON SEES ──');
const a = splitTemplates(seenBy(A), A), b = splitTemplates(seenBy(B), B);
ok(a.team.map((t) => t.id).join() === 't2,t1' && b.team.map((t) => t.id).join() === 't2,t1', 'both salespeople see the SAME Team templates, in library order (sort_order)');
ok(!a.team.some((t) => t.id === 't3') && isArchived(TEAM_OLD), 'an archived Team template is not offered');
ok(a.mine.map((t) => t.id).join() === 'pa' && b.mine.map((t) => t.id).join() === 'pb', 'My templates are each person\'s own');
ok(!splitTemplates([MINE_A, MINE_B], B).mine.some((t) => t.id === 'pa'), 'salesperson A\'s personal templates never appear in B\'s list, even if a row leaked in');
ok(splitTemplates([MINE_A], null).mine.length === 0, 'no signed-in user → no "mine"');
ok(isTeamTemplate(TEAM1) && !isTeamTemplate(MINE_A) && !isTeamTemplate(row({ id: 'x', user_id: A, scope: null })) && !isTeamTemplate(row({ id: 'y', user_id: A, scope: 'TEAM ' })), 'only the exact word "team" is a Team template (an unknown scope is personal)');
ok(TEAM_HEADING === 'TEAM TEMPLATES' && MINE_HEADING === 'MY TEMPLATES', 'the two headings');

console.log('\n── WHO MAY CHANGE WHAT ──');
ok(!canManageTemplate(TEAM1, { isAdmin: false, userId: A }), 'a salesperson cannot edit / delete / archive a Team template');
ok(canManageTemplate(TEAM1, { isAdmin: true, userId: ADMIN }), 'the admin can manage Team templates');
ok(canManageTemplate(MINE_A, { isAdmin: false, userId: A }) && !canManageTemplate(MINE_A, { isAdmin: false, userId: B }), 'a salesperson manages their own personal template and nobody else\'s');
ok(!canManageTemplate(MINE_A, { isAdmin: true, userId: ADMIN }), 'not even the admin manages a salesperson\'s personal template (the database does not let them read it either)');
ok(!canManageTemplate(MINE_A, { isAdmin: false, userId: null }), 'signed out → nothing');

console.log('\n── USING, AND DUPLICATING ──');
const before = JSON.stringify(TEAM1);
const filled = fillTemplate(TEAM1.content, { businessName: 'Ace Locksmiths' });
ok(filled === 'Hi Ace Locksmiths' && JSON.stringify(TEAM1) === before, 'using a Team template fills the variables for THIS lead and leaves the master untouched');
ok(fillTemplate('Hi {{business_name}} {{link}}', { businessName: 'Ace', link: 'https://findable.live/r/abc123' }) === 'Hi Ace https://findable.live/r/abc123', 'business name and link variables still resolve exactly as before');
ok(fillTemplate(MINE_A.content, { businessName: 'Beta Plumbing' }) === 'Hi Beta Plumbing', 'an existing personal template still works');
const copy = duplicateAsPersonal(TEAM1) as Record<string, unknown>;
ok(copy.scope === 'personal' && copy.content === TEAM1.content && copy.title === 'Opener (my copy)' && !('id' in copy) && !('user_id' in copy) && !('archived_at' in copy) && !('sort_order' in copy), '"Save as my template": a NEW personal row — no id, owner, archive or order carried over');

console.log('\n── THE SHARED SOURCE (one row, no per-person copies) ──');
const mig = read('supabase/migrations/20261016100000_team_templates.sql');
ok(/add column if not exists scope text not null default 'personal'/.test(mig) && /check \(scope in \('personal', 'team'\)\)/.test(mig), 'one column on the one table; every existing row stays personal');
ok(!/insert into public\.templates/i.test(mig) && !/update public\.templates set scope/i.test(mig), 'the migration copies nothing and promotes nothing (no template is silently shared)');
ok(/create policy templates_select[\s\S]*scope = 'team' and archived_at is null and \(select public\.my_role\(\)\) in \('admin', 'sales'\)/.test(mig), 'every admin and salesperson reads ACTIVE Team templates');
ok(/create policy templates_insert[\s\S]*scope = 'personal' or \(scope = 'team' and \(select public\.my_role\(\)\) = 'admin'\)/.test(mig), 'only an admin may create a Team template');
ok(/create policy templates_update[\s\S]*with check/.test(mig) && /create policy templates_delete[\s\S]*scope = 'team' and \(select public\.my_role\(\)\) = 'admin'/.test(mig), 'only an admin may change or delete a Team template; a salesperson cannot promote their own row');
const rls = read('supabase/tests/team-templates.sql');
ok(/cannot edit the team template/.test(rls) && /cannot delete the team template/.test(rls) && /cannot create a team template/.test(rls) && /cannot promote their row to team/.test(rls) && /cannot see salesperson A personal/.test(rls) && /sees the admin edit immediately/.test(rls), 'the rolled-back RLS proof covers every permission case');

console.log('\n── THE SCREENS ──');
const hook = read('src/hooks/useTemplates.ts');
ok(/scope === 'team' && isAdmin \? 'team' : 'personal'/.test(hook) && /duplicateToMine/.test(hook) && /scope: 'personal'/.test(hook), 'the hook only lets an admin author a Team template; a duplicate is always personal');
const inbox = read('src/pages/Inbox.tsx');
ok(/const insertTemplate = \(content: string\) => \{(?:\s*\/\*[\s\S]*?\*\/)?\s*setText\(fillTemplate\(content/.test(inbox) && !/insertTemplate[\s\S]{0,200}updateTemplate/.test(inbox), 'Quick reply only writes the draft (editing the message never edits the template)');
ok(/data-testid=\{g\.team \? 'quick-reply-team' : 'quick-reply-mine'\}/.test(inbox) && /TEAM_HEADING/.test(inbox), 'the Inbox quick reply shows TEAM TEMPLATES then MY TEMPLATES');
const picker = read('src/components/TemplatePicker.tsx');
ok(/TEAM_HEADING/.test(picker) && /MINE_HEADING/.test(picker) && /isArchived/.test(picker), 'the WhatsApp composer\'s picker shows the same two groups');
const page = read('src/pages/Templates.tsx');
ok(/data-testid="team-templates"/.test(page) && /data-testid="my-templates"/.test(page) && /data-testid="save-as-mine"/.test(page) && /data-testid="share-with-team"/.test(page) && /data-testid="archive-team"/.test(page) && /canManageTemplate\(template, who\)/.test(page), 'the Templates page: Team section, My section, Save as my template, and admin-only Share / Archive');
ok(/\{isAdmin && !editingTemplate && \(/.test(page), 'only an admin is asked "who can use it?"');

console.log('\n── THE META WHATSAPP TEMPLATES ARE A DIFFERENT SYSTEM ──');
const lib = read('src/lib/teamTemplates.ts');
ok(!/^import .*(whatsapp|WHATSAPP|templateBodies)/mi.test(lib), 'the Team library imports nothing from the Meta-template registry');
ok(!/findable_signup_link|findable_onboarding/.test(mig + hook + page + picker.replace(/\/\/.*$/gm, '')), 'findable_signup_link / findable_onboarding appear nowhere in this change');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
