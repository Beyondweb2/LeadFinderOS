import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { PERMISSION_MATRIX } from '@/lib/access';
import { OnboardingBadge, SalespersonDocumentsCard, SalespersonOnboardingPanel } from '@/components/SalespersonOnboardingPanel';
import { ONBOARDING_SAVE_ERRORS, onboardingSummary, type DocumentVersion, type OnboardingRecord } from '@/lib/salespersonOnboarding';

/* TEAM — admin only (multi-user, 2026-09-27). The route is admin-only in src/lib/access.ts, and every
 * action below goes to admin-users, which refuses anyone without the admin role. No password is ever
 * seen here: an invite produces a one-time link the admin sends; the salesperson sets their own. */

interface Member {
  user_id: string; display_name: string; status: 'active' | 'disabled'; is_book_owner: boolean; role: 'admin' | 'sales' | null;
  email: string | null; last_sign_in_at: string | null; has_signed_in: boolean; banned: boolean; assigned_leads: number;
  /** 2026-09-29: set = suspended (reads work, every protected action refuses). Null = not suspended. */
  suspended_at?: string | null;
  /** When Disable ended their engagement (the commission end date). Null while active. */
  disabled_at?: string | null;
}

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action, ...body } });
  if (error) {
    let detail: string | undefined;
    try { const j = await (error as { context?: Response }).context?.json(); detail = j?.error ?? j?.detail; } catch { /* keep the message */ }
    return { ok: false, error: detail ?? error.message } as Record<string, unknown>;
  }
  return data as Record<string, unknown>;
}

const ERR: Record<string, string> = {
  already_exists: 'That email already has an account.',
  bad_email: 'That is not a valid email address.',
  bad_name: 'Give them a name (up to 60 characters).',
  cannot_change_self: 'You cannot disable your own account.',
  cannot_change_book_owner: 'The book owner cannot be disabled.',
  cannot_change_admin: 'An admin cannot be disabled here.',
  not_ready_to_sell: 'That salesperson is not Ready to Sell, so leads cannot be moved to them.',
  not_an_active_member: 'Pick an active team member.',
};

function LinkBox({ link, onClose }: { link: string; onClose: () => void }) {
  const { toast } = useToast();
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
      <p className="text-sm">Send this link to them yourself (WhatsApp or email). It works once, and they choose their own password.</p>
      <div className="flex gap-2">
        <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast({ title: 'Link copied' }); }}><Copy className="h-4 w-4" /></Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onClose}>Done</Button>
    </div>
  );
}

export default function Team() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ['team', 'list'],
    queryFn: async () => {
      const r = await call('team_list');
      if (!r.ok) throw new Error(String(r.error ?? 'could not load the team'));
      return (r.team ?? []) as Member[];
    },
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [openOnboarding, setOpenOnboarding] = useState<string | null>(null);
  /* Salesperson onboarding (2026-10-05): admin-users is the only way to the records (no RLS policy). */
  const onboarding = useQuery({
    queryKey: ['team', 'onboarding'],
    queryFn: async () => {
      const r = await call('team_onboarding_list');
      if (!r.ok) throw new Error(String(r.error ?? 'could not load onboarding'));
      return {
        rows: new Map(((r.rows ?? []) as OnboardingRecord[]).map((x) => [x.user_id, x])),
        documents: (r.documents ?? []) as DocumentVersion[],
        /** The gate's own answer per member (null = could not be read). */
        missing: (r.missing ?? {}) as Record<string, string[] | null>,
      };
    },
  });
  const saveOnboarding = async (userId: string, patch: Partial<OnboardingRecord>): Promise<boolean> => {
    const r = await call('team_onboarding_save', { user_id: userId, patch });
    if (!r.ok) {
      toast({ title: 'Not saved', description: ONBOARDING_SAVE_ERRORS[String(r.error)] ?? String(r.error ?? 'Try again'), variant: 'destructive' });
      return false;
    }
    await qc.invalidateQueries({ queryKey: ['team', 'onboarding'] });
    return true;
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] });
  const fail = (r: Record<string, unknown>) => toast({ title: 'Not done', description: ERR[String(r.error)] ?? String(r.error ?? 'Try again'), variant: 'destructive' });

  const invite = async () => {
    setBusy(true);
    try {
      const r = await call('team_invite', { name: name.trim(), email: email.trim() });
      if (!r.ok) { fail(r); return; }
      setLink(String(r.link ?? ''));
      setName(''); setEmail('');
      void refresh();
    } finally { setBusy(false); }
  };

  const members = team.data ?? [];
  const active = members.filter((m) => m.status === 'active' && m.role);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">Salespeople get their own login. They see only their own leads and never delivery, clients, money or settings.</p>
        <p className="text-xs text-muted-foreground">Click a salesperson's onboarding badge to see what is still missing. Until they are Ready to Sell they can sign in and see their onboarding, but every sales action is blocked. Only you can see these records.</p>
        {onboarding.error && <p className="text-xs text-destructive">Onboarding records could not be loaded: {String((onboarding.error as Error).message)}</p>}
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4" />Invite a salesperson</h2>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-48" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-64" />
          <Button disabled={busy || !name.trim() || !email.trim()} onClick={() => void invite()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invite link'}</Button>
        </div>
        {link && <LinkBox link={link} onClose={() => setLink(null)} />}
      </Card>

      <Card className="p-0 overflow-hidden">
        {team.isLoading ? <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : team.error ? (
          <p className="p-4 text-sm text-destructive">{String((team.error as Error).message)}</p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.user_id} className="p-3 flex flex-wrap items-center gap-3">
                <OwnerAvatar name={m.display_name} className="h-8 w-8 text-xs" />
                <div className="min-w-0 mr-auto">
                  <div className="font-medium">{m.display_name} {m.is_book_owner && <span className="text-xs text-muted-foreground">(book owner)</span>}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.email ?? '—'} · {m.last_sign_in_at ? `last active ${new Date(m.last_sign_in_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}` : 'has not signed in yet'} · {m.assigned_leads} leads
                  </div>
                </div>
                <Badge variant={m.status === 'active' ? 'secondary' : 'outline'}>{m.status === 'active' ? (m.role ?? 'no role') : m.disabled_at ? `ended ${new Date(m.disabled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}` : 'ended'}</Badge>
                {m.status === 'active' && m.suspended_at && <Badge variant="destructive" title={`Suspended ${new Date(m.suspended_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`}>suspended</Badge>}
                {m.role !== 'admin' && !m.is_book_owner && onboarding.data && (
                  <button type="button" onClick={() => setOpenOnboarding((o) => (o === m.user_id ? null : m.user_id))} aria-expanded={openOnboarding === m.user_id}>
                    <OnboardingBadge summary={onboardingSummary(onboarding.data.rows.get(m.user_id) ?? null, m, onboarding.data.documents, undefined, onboarding.data.missing[m.user_id] ?? null)} />
                  </button>
                )}
                {m.role !== 'admin' && !m.is_book_owner && (
                  <div className="flex flex-wrap items-center gap-2">
                    {m.status === 'active' && !m.has_signed_in && (
                      <Button size="sm" variant="outline" onClick={async () => { const r = await call('team_new_link', { user_id: m.user_id }); if (!r.ok) fail(r); else setLink(String(r.link ?? '')); }}>New link</Button>
                    )}
                    {/* ⛔ SUSPEND SALES ACCESS (2026-09-29): the middle state. They keep their login and can READ
                        their leads; every paid action, search, lookup, claim, export, copy and send is refused on
                        the server at once. Nothing deleted; reversible. Disable (below) is the full lock-out. */}
                    {m.status === 'active' && (m.suspended_at ? (
                      <Button size="sm" variant="outline" onClick={async () => {
                        const r = await call('team_unsuspend', { user_id: m.user_id }); if (!r.ok) fail(r); else { toast({ title: `${m.display_name} reactivated` }); void refresh(); }
                      }}>Reactivate</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="border-destructive/50 text-destructive" onClick={async () => {
                        if (!window.confirm(`Suspend Sales access for ${m.display_name}? They stay signed in and can read their leads, but every paid action, search, claim, export, copy and WhatsApp send is refused immediately. Nothing is deleted, and you can reactivate them at any time.`)) return;
                        const r = await call('team_suspend', { user_id: m.user_id });
                        if (!r.ok) { fail(r); return; }
                        const queued = Number(r.queued_leads ?? 0);
                        toast({ title: `${m.display_name} suspended`, description: queued > 0 ? `${queued} of their leads were queued for an opener — they are held, not sent. Decide on the API Usage page.` : undefined });
                        void refresh();
                      }}>Suspend Sales access</Button>
                    ))}
                    {m.status === 'active' ? (
                      <Button size="sm" variant="destructive" onClick={async () => {
                        if (!window.confirm(`Disable ${m.display_name}? This ends their engagement. They are signed out of everything at once. Their notes, history and sales stay; their ${m.assigned_leads} leads stay assigned until you move them.\n\nCommission they have already earned stays payable. Client payments from now on earn them no new commission.`)) return;
                        const r = await call('team_disable', { user_id: m.user_id }); if (!r.ok) fail(r); else { toast({ title: `${m.display_name} disabled` }); void refresh(); }
                      }}>Disable</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={async () => { const r = await call('team_reactivate', { user_id: m.user_id }); if (!r.ok) fail(r); else { toast({ title: `${m.display_name} re-enabled` }); void refresh(); } }}>Re-enable</Button>
                    )}
                  </div>
                )}
                {openOnboarding === m.user_id && onboarding.data && m.role !== 'admin' && !m.is_book_owner && (
                  <div className="w-full pl-11">
                    <SalespersonOnboardingPanel userId={m.user_id} record={onboarding.data.rows.get(m.user_id) ?? null} member={m} docs={onboarding.data.documents} serverMissing={onboarding.data.missing[m.user_id] ?? null} onSave={(patch) => saveOnboarding(m.user_id, patch)} />
                  </div>
                )}
                {m.assigned_leads > 0 && (
                  <div className="w-full flex flex-wrap items-center gap-2 pl-11">
                    <span className="text-xs text-muted-foreground">Move all {m.assigned_leads} leads to</span>
                    <Select value={moveTo[m.user_id] ?? ''} onValueChange={(v) => setMoveTo((p) => ({ ...p, [m.user_id]: v }))}>
                      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__pool">Unassigned pool</SelectItem>
                        {active.filter((a) => a.user_id !== m.user_id).map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={!moveTo[m.user_id]} onClick={async () => {
                      const to = moveTo[m.user_id] === '__pool' ? null : moveTo[m.user_id];
                      if (!window.confirm(`Move all ${m.assigned_leads} of ${m.display_name}'s leads? Same records, nothing is sent, and each move is logged.`)) return;
                      const r = await call('team_reassign_all', { from_user_id: m.user_id, to_user_id: to });
                      if (!r.ok) fail(r); else { toast({ title: `Moved ${r.moved} leads` }); void refresh(); }
                    }}>Move</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {onboarding.data && (
        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Salesperson documents</h2>
          <p className="text-xs text-muted-foreground">Only the approved (current) contractor agreement and privacy notice count towards Ready to Sell. Drafts can be recorded for history but never count.</p>
          <SalespersonDocumentsCard docs={onboarding.data.documents} call={call} onChanged={(message, error) => {
            if (error) toast({ title: 'Not done', description: ONBOARDING_SAVE_ERRORS[error] ?? error, variant: 'destructive' });
            else toast({ title: message ?? 'Saved' });
            void qc.invalidateQueries({ queryKey: ['team', 'onboarding'] });
          }} />
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">What each role can do</h2>
        <p className="text-xs text-muted-foreground">Enforced by the database and the server, not by hiding screens.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2 font-normal">Feature</th><th className="py-1 pr-2 font-normal">Admin</th><th className="py-1 font-normal">Sales</th></tr></thead>
          <tbody className="divide-y">
            {PERMISSION_MATRIX.map((r) => (
              <tr key={r.feature}><td className="py-1.5 pr-2">{r.feature}</td><td className="py-1.5 pr-2">{r.admin}</td><td className="py-1.5">{r.sales}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
