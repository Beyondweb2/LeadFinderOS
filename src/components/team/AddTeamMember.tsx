import { useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmented } from '@/components/salesDash/ui';
import { Callout } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { CREATE_USER_ERRORS, generateTempPassword, PASSWORD_PROBLEM_WORDS, passwordProblem, type TeamRole } from '@/lib/teamAccounts';

/* ADD A TEAM MEMBER (2026-10-14) — two ways, admin only (the Team route is admin-only and fn admin-users
 * refuses anyone without the admin role):
 *  · Set a temporary password (default): the account exists at once and they sign in straight away. The
 *    password is shown here ONCE and cleared on Done; the server never logs, stores or returns it.
 *  · Invite link: the existing flow — a one-time link the admin sends; they choose their own password.
 * Defaults: role Salesperson (Admin needs a second tick), "choose a new password at first sign-in" ON. */

/* The invite flow's own refusals (fn admin-users team_invite) — its role failure is NOT rolled back. */
const INVITE_ERRORS: Record<string, string> = {
  already_exists: 'That email already has an account. Use Send password reset on their row instead.',
  invite_failed: 'The sign-in provider could not make an invite link. Try again.',
  role_write_failed: 'The login was made but could not be given its role, so it can open nothing. Try again or ask for help.',
};

type Call = (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;
type Mode = 'password' | 'invite';

export function AddTeamMember({ call, onDone, inviteLinkBox }: {
  call: Call;
  onDone: () => void;
  /** The existing invite-link box (Team.tsx owns it). */
  inviteLinkBox: (link: string, close: () => void) => ReactNode;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('password');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('sales');
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [mustChange, setMustChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  /* Shown once: cleared by Done, never written anywhere else. */
  const [created, setCreated] = useState<{ name: string; email: string; password: string; mustChange: boolean; role: TeamRole } | null>(null);

  const problem = password ? passwordProblem(password, { email }) : null;
  const canCreate = !!name.trim() && !!email.trim() && !!password && !problem && (role !== 'admin' || confirmAdmin);

  const create = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await call('team_create_user', {
        name: name.trim(), email: email.trim(), role, confirm_admin: role === 'admin' ? confirmAdmin : undefined,
        password, must_change_password: mustChange,
      });
      if (!r.ok) { setErr(CREATE_USER_ERRORS[String(r.error)] ?? 'Not done. Try again.'); return; }
      setCreated({ name: name.trim(), email: email.trim().toLowerCase(), password, mustChange, role });
      setName(''); setEmail(''); setPassword(''); setRole('sales'); setConfirmAdmin(false); setMustChange(true); setShow(false);
      onDone();
    } finally { setBusy(false); }
  };

  const invite = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await call('team_invite', { name: name.trim(), email: email.trim() });
      if (!r.ok) { setErr(INVITE_ERRORS[String(r.error)] ?? CREATE_USER_ERRORS[String(r.error)] ?? 'Not done. Try again.'); return; }
      setInviteLink(String(r.link ?? ''));
      setName(''); setEmail('');
      onDone();
    } finally { setBusy(false); }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${what} copied` }); }
    catch { toast({ title: 'Could not copy automatically', description: 'Select it in the box and copy it.' }); }
  };

  if (created) {
    return (
      <Callout tone="green" icon={KeyRound} title={`Account ready for ${created.name}`}>
        <div className="space-y-2" data-testid="created-once">
          <p>They can sign in now at the normal sign-in page with this email and password. <strong>This is the only time the password is shown</strong> — copy it now and send it to them yourself (it is not emailed). {created.mustChange ? 'They will be asked to choose their own password the first time they sign in.' : 'They will NOT be asked to change it; they can change it later with Forgot password.'}{created.role === 'admin' ? ' This account has full admin access.' : ''}</p>
          <div className="flex min-w-0 gap-2">
            <Input readOnly value={created.email} className="h-9 min-w-0 flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={() => void copy(created.email, 'Email')}><Copy className="h-4 w-4" />Copy</Button>
          </div>
          <div className="flex min-w-0 gap-2">
            <Input readOnly value={created.password} className="h-9 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="created-password" />
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={() => void copy(created.password, 'Password')}><Copy className="h-4 w-4" />Copy</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done — hide the password</Button>
        </div>
      </Callout>
    );
  }

  return (
    <div className="space-y-3">
      <Segmented<Mode> label="How to add them" value={mode} onChange={(m) => { setMode(m); setErr(null); }}
        options={[{ key: 'password', label: 'Set a temporary password' }, { key: 'invite', label: 'Send an invite link' }]} />
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 w-full sm:w-48" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="off" className="h-9 w-full sm:w-64" />
        {mode === 'password' && (
          <Select value={role} onValueChange={(v) => { setRole(v as TeamRole); setConfirmAdmin(false); }}>
            <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Salesperson</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {mode === 'password' ? (
        <>
          <div className="flex min-w-0 flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" type={show ? 'text' : 'password'} autoComplete="new-password" className="h-9 pr-9 font-mono text-xs" data-testid="temp-password" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => { setPassword(generateTempPassword()); setShow(true); }}><Wand2 className="h-4 w-4" />Generate</Button>
          </div>
          <p className="text-xs text-muted-foreground">{problem ? PASSWORD_PROBLEM_WORDS[problem] : `${PASSWORD_PROBLEM_WORDS.too_short} ${PASSWORD_PROBLEM_WORDS.needs_letter_and_number}`}</p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={mustChange} onCheckedChange={(v) => setMustChange(v === true)} className="mt-0.5" data-testid="must-change" />
            <span>Ask them to choose their own password the first time they sign in <span className="text-muted-foreground">(recommended)</span></span>
          </label>
          {role === 'admin' && (
            <label className="flex items-start gap-2 text-sm text-destructive">
              <Checkbox checked={confirmAdmin} onCheckedChange={(v) => setConfirmAdmin(v === true)} className="mt-0.5" />
              <span className="inline-flex items-start gap-1"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Yes, give this person full admin access — every client, payment, setting and team control.</span>
            </label>
          )}
          <Button className="w-full sm:w-auto" disabled={busy || !canCreate} onClick={() => void create()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}</Button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Makes a one-time link for a salesperson. You send it yourself; they press Continue and choose their own password.</p>
          <Button className="w-full sm:w-auto" disabled={busy || !name.trim() || !email.trim()} onClick={() => void invite()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invite link'}</Button>
          {inviteLink && inviteLinkBox(inviteLink, () => setInviteLink(null))}
        </>
      )}
      {err && <Callout tone="red">{err}</Callout>}
    </div>
  );
}
