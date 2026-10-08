/* RESEND ACTIVATION for an existing salesperson (2026-10-08). The flow is injected, so an in-memory
 * "world" stands in for auth + team + leads + commission and we assert the world is untouched except for
 * one audit row. The admin gate and the UI are pinned by reading the source. */
import fs from 'node:fs';
import path from 'node:path';
import { reissueActivation, type ActivationDeps } from '../supabase/functions/_shared/team-activation.ts';
import { activationPending, resendRefusal, RESEND_ERRORS, RESEND_MAX_PER_HOUR, type ResendFacts } from '../src/lib/teamActivation.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const REP = '11111111-1111-1111-1111-111111111111', ADMIN = '22222222-2222-2222-2222-222222222222';

type Over = Partial<{ passwordSet: boolean | null; status: string; suspended: string | null; banned: boolean; role: 'sales' | 'admin' | null; bookOwner: boolean; email: string | null; linkError: string | null }>;

function world(over: Over = {}) {
  const w = {
    authUsers: [{ id: REP, email: 'rep@example.com' }],
    teamMembers: [{ user_id: REP, display_name: 'Rep', status: over.status ?? 'active', suspended_at: over.suspended ?? null, is_book_owner: over.bookOwner ?? false }],
    roles: [{ user_id: REP, role: over.role === undefined ? 'sales' : over.role }],
    leads: [{ id: 'L1', assigned_to_user_id: REP }, { id: 'L2', assigned_to_user_id: REP }],
    ledger: [{ id: 'P1', sold_by_user_id: REP, amount_gbp: 99, commission_rate: '0.3' }],
    history: [{ lead: 'L1', kind: 'note' }],
    audit: [] as { actor: string; target: string; at: string }[],
    links: 0, tokens: new Set<string>(),
  };
  const deps: ActivationDeps = {
    facts: async (uid): Promise<ResendFacts> => ({
      member: w.teamMembers.find((m) => m.user_id === uid) ?? null,
      role: (w.roles.find((r) => r.user_id === uid)?.role as 'sales' | 'admin' | undefined) ?? null,
      email: over.email === undefined ? (w.authUsers.find((u) => u.id === uid)?.email ?? null) : over.email,
      banned: over.banned ?? false,
      passwordSet: over.passwordSet === undefined ? false : over.passwordSet,
      resendsLastHour: w.audit.filter((a) => a.target === uid).length,
    }),
    /* The provider: an existing email gets a fresh token that REPLACES the previous one; it can never create a user. */
    makeLink: async (email) => {
      if (over.linkError) return { link: null, error: over.linkError };
      if (!w.authUsers.some((u) => u.email === email)) return { link: null, error: 'no such user' };
      w.tokens.clear(); w.links++;
      const t = `tok${w.links}`; w.tokens.add(t);
      return { link: `https://example.test/verify?token=${t}`, error: null };
    },
    audit: async (ev) => { w.audit.push(ev); },
  };
  return { w, deps };
}
const snapshot = (w: ReturnType<typeof world>['w']) => JSON.stringify({ a: w.authUsers, t: w.teamMembers, r: w.roles, l: w.leads, c: w.ledger, h: w.history });

async function main() {
  { const { w, deps } = world(); const before = snapshot(w);
    const r = await reissueActivation(deps, ADMIN, REP);
    ok(r.ok && r.status === 200 && !!r.link, '1. a pending salesperson receives a fresh activation link');
    ok(r.ok && r.user_id === REP && w.authUsers.length === 1 && w.authUsers[0].id === REP, '3. the same user id remains');
    ok(w.authUsers.length === 1 && w.teamMembers.length === 1 && w.roles.length === 1, '4. no duplicate auth user, team member or role');
    ok(JSON.stringify(w.roles) === JSON.stringify([{ user_id: REP, role: 'sales' }]), '5. role / permissions unchanged');
    ok(JSON.stringify(w.leads.map((l) => l.assigned_to_user_id)) === JSON.stringify([REP, REP]), '6. lead ownership unchanged');
    ok(JSON.stringify(w.ledger) === JSON.stringify([{ id: 'P1', sold_by_user_id: REP, amount_gbp: 99, commission_rate: '0.3' }]) && w.history.length === 1, '7. commission and history unchanged');
    ok(snapshot(w) === before, '7b. the whole account world is byte-identical after the resend');
    ok(w.audit.length === 1 && w.audit[0].actor === ADMIN && w.audit[0].target === REP && !!w.audit[0].at && !JSON.stringify(w.audit).includes('tok'), 'audit: who, whom, when - and no token or link');
  }
  { const { w, deps } = world();
    const first = await reissueActivation(deps, ADMIN, REP); const oldToken = [...w.tokens][0];
    const again = await reissueActivation(deps, ADMIN, REP);
    ok(first.ok && again.ok && first.link !== again.link, '2. an expired activation is replaced by a different, fresh one');
    ok(!w.tokens.has(oldToken) && w.tokens.size === 1, '11. the old activation is superseded - only one token is live');
    for (let i = 0; i < 2; i++) await reissueActivation(deps, ADMIN, REP);
    ok(w.authUsers.length === 1 && w.teamMembers.length === 1 && w.roles.length === 1, '10. repeated resend never duplicates the account');
    ok(w.tokens.size === 1, '11b. still exactly one live token after several resends');
  }
  { const { w, deps } = world({ passwordSet: true }); const before = snapshot(w);
    const r = await reissueActivation(deps, ADMIN, REP);
    ok(!r.ok && r.error === 'already_activated' && r.status === 409 && w.links === 0 && w.audit.length === 0 && snapshot(w) === before, '8. an activated salesperson gets no link (use Forgot password)');
    ok(activationPending(true) === false && activationPending(false) === true && activationPending(null) === false && activationPending(undefined) === false, '8b. only a confirmed "no password yet" is pending - unknown is not');
    const u = await reissueActivation(world({ passwordSet: null }).deps, ADMIN, REP);
    ok(!u.ok && u.error === 'state_unknown', '8c. an unreadable state fails closed (no login link for an account that may be live)');
  }
  { const cases: [string, Over, string][] = [
      ['disabled / ended', { status: 'disabled' }, 'not_active'], ['suspended', { suspended: '2026-10-01T00:00:00Z' }, 'suspended'],
      ['banned', { banned: true }, 'banned'], ['admin role', { role: 'admin' }, 'not_sales'], ['book owner', { bookOwner: true }, 'not_sales'],
      ['no email', { email: null }, 'no_email'], ['no role', { role: null }, 'not_sales'],
    ];
    for (const [name, over, code] of cases) { const { w, deps } = world(over); const r = await reissueActivation(deps, ADMIN, REP);
      ok(!r.ok && r.error === code && w.links === 0 && w.authUsers.length === 1, `refused: ${name} -> ${code}, no link, no new account`); }
    const nf = await reissueActivation(world().deps, ADMIN, '33333333-3333-3333-3333-333333333333');
    ok(!nf.ok && nf.error === 'not_found' && nf.status === 404, 'refused: account not found');
    const bad = await reissueActivation(world().deps, ADMIN, 'not-a-uuid');
    ok(!bad.ok && bad.error === 'bad_user' && bad.status === 400, 'refused: malformed id');
    const { w, deps } = world({ linkError: 'smtp down' }); const before = snapshot(w);
    const lf = await reissueActivation(deps, ADMIN, REP);
    ok(!lf.ok && lf.error === 'link_failed' && lf.status === 502 && w.audit.length === 0 && snapshot(w) === before, 'auth provider failure: reported, nothing created, no replacement account, nothing audited');
    const rl = world(); let last: Awaited<ReturnType<typeof reissueActivation>> = { ok: false, status: 0, error: 'bad_user' };
    for (let i = 0; i <= RESEND_MAX_PER_HOUR; i++) last = await reissueActivation(rl.deps, ADMIN, REP);
    ok(!last.ok && last.error === 'rate_limited' && last.status === 429 && rl.w.links === RESEND_MAX_PER_HOUR, 'rate limit: the next request after the hourly cap is refused');
    ok(['already_activated', 'rate_limited', 'link_failed', 'suspended', 'not_active', 'no_email', 'not_found', 'banned', 'state_unknown'].every((k) => RESEND_ERRORS[k]), 'every refusal has plain-English UI wording');
    ok(resendRefusal({ member: null, role: null, email: null, banned: false, passwordSet: false, resendsLastHour: 0 }) === 'not_found', 'the rule is one pure function');
  }

  const au = strip(read('supabase/functions/admin-users/index.ts'));
  const gate = au.indexOf('Not authorized - no admin role'), act = au.indexOf("action === 'team_new_link'");
  ok(gate > 0 && act > gate, '9. team_new_link sits AFTER the server-side admin role gate');
  ok(/if \(!roleData\) \{[\s\S]{0,400}403/.test(au), '9b. the gate answers 403 to a non-admin, whatever the UI shows');
  const block = au.slice(act, au.indexOf("action === 'team_disable'"));
  ok(!/createUser|type: 'invite'|from\('team_members'\)\.insert|from\('user_roles'\)\.insert|\.upsert\(/.test(block), '4b/11c. the resend block creates no user, team member or role, and never uses the invite type');
  ok(/rpc\('team_password_is_set'/.test(block) && /generateLink\(\{\s*type: 'magiclink'/.test(block) && /redirectTo: SET_PASSWORD_URL/.test(block), 'it asks the database whether a password exists and mints a magic link to the one set-password URL');
  ok(/kind: 'activation_resent'/.test(block) && !/detail: \{[^}]*link/.test(block), 'it audits activation_resent without the link');
  ok(/password_set: pwSetErr/.test(au), 'team_list reports password_set for each member');

  const ui = strip(read('src/pages/Team.tsx'));
  ok(/activationPending\(m\.password_set\)/.test(ui) && /Resend activation/.test(ui) && /data-testid="resend-activation"/.test(ui), '12. the Team row shows Resend activation on every active salesperson (the server refuses an activated one)');
  ok(/activation pending/.test(ui) && /fail\(r\.ok \? \{ error: 'link_failed' \} : r\)/.test(ui) && /New activation link made for/.test(ui), '12b. success shows a toast + the link box; failure shows the mapped reason');
  ok(/\.\.\.RESEND_ERRORS/.test(ui), '12c. the page maps every server refusal to plain wording');
  ok(!/!m\.has_signed_in/.test(ui), '12d. the old "has not signed in" test (fooled by link scanners) no longer decides');
  const mig = read('supabase/migrations/20261017000000_team_password_is_set.sql');
  ok(/security definer/.test(mig) && /revoke all on function public\.team_password_is_set\(uuid\) from public, anon, authenticated/.test(mig) && /grant execute[\s\S]*service_role/.test(mig), 'the migration exposes a boolean to the service role only, never the hash');
  console.log(f ? `\n${f} FAILED` : '\nALL PASS'); process.exit(f ? 1 : 0);
}
main();
