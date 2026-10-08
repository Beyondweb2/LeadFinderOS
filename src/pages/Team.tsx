import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, Link2, Loader2, Scale, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Callout, EDGE, ErrorState, LoadState, PageHeader, ToneChip } from '@/components/operator/ui';
import { useEarnings } from '@/hooks/useEarnings';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });
import { Panel } from '@/components/salesDash/ui';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { PERMISSION_MATRIX } from '@/lib/access';
import { OnboardingBadge, SalespersonDocumentsCard, SalespersonOnboardingPanel } from '@/components/SalespersonOnboardingPanel';
import { AttributionReviewsCard } from '@/components/AttributionReviews';
import type { AttributionPerson, AttributionReview } from '@/lib/attributionReviewView';
import { activationPending, RESEND_ERRORS } from '@/lib/teamActivation';
import { ONBOARDING_SAVE_ERRORS, onboardingSummary, type DocumentVersion, type OnboardingRecord } from '@/lib/salespersonOnboarding';

/* TEAM — admin only (multi-user, 2026-09-27). The route is admin-only in src/lib/access.ts, and every
 * action below goes to admin-users, which refuses anyone without the admin role. No password is ever
 * seen here: an invite produces a one-time link the admin sends; the salesperson sets their own. */

interface Member {
  user_id: string; display_name: string; status: 'active' | 'disabled'; is_book_owner: boolean; role: 'admin' | 'sales' | null;
  email: string | null; last_sign_in_at: string | null; has_signed_in: boolean; banned: boolean;
  /** Chose a password (true), never did (false), or could not be read (null/absent). Drives Resend activation. */
  password_set?: boolean | null; assigned_leads: number;
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
  ...RESEND_ERRORS,
  already_exists: 'That email already has an account.',
  bad_email: 'That is not a valid email address.',
  bad_name: 'Give them a name (up to 60 characters).',
  cannot_change_self: 'You cannot disable your own account.',
  cannot_change_book_owner: 'The book owner cannot be disabled.',
  cannot_change_admin: 'An admin cannot be disabled here.',
  not_ready_to_sell: 'That salesperson\'s sales access is not active (suspended, ended or login off), so leads cannot be moved to them.',
  not_an_active_member: 'Pick an active team member.',
};

function LinkBox({ link, onClose }: { link: string; onClose: () => void }) {
  const { toast } = useToast();
  return (
    <Callout tone="blue" icon={Link2} title="Invite link ready">
      <div className="space-y-2">
        <p>Send this link to them yourself (WhatsApp or email). It works once, and they choose their own password.</p>
        <div className="flex min-w-0 gap-2">
          <Input readOnly value={link} className="h-9 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 p-0" aria-label="Copy link" onClick={async () => { await navigator.clipboard.writeText(link); toast({ title: 'Link copied' }); }}><Copy className="h-4 w-4" /></Button>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Done</Button>
      </div>
    </Callout>
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
  const reviews = useQuery({
    queryKey: ['team', 'attribution-reviews'],
    queryFn: async () => {
      const r = await call('attribution_reviews_list');
      if (!r.ok) throw new Error(String(r.error ?? 'could not load attribution reviews'));
      /* serverReady: the list came from the admin-users that resolves WITH a chosen seller (it sends people). An older
         admin-users would confirm the CLAIMED seller whoever was picked, so the card will not resolve against it. */
      return { reviews: (r.reviews ?? []) as AttributionReview[], people: (r.people ?? []) as AttributionPerson[], serverReady: Array.isArray(r.people) };
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
  /* Each salesperson's money at a glance (2026-10-06, full-app design): read from the SAME commission
     ledger the Sales dashboard uses (fn sales-earnings, admin 'all'), never computed here. Absent while it
     loads or if it fails — the row then shows no figures rather than a guessed zero. */
  const earn = useEarnings('all');
  const salesOf = (id: string) => (earn.data?.clients ?? []).filter((c) => c.sellerId === id).length;
  const moneyOf = (id: string) => (earn.data?.bySeller ?? []).find((s) => s.sellerId === id) ?? null;
  const heldFor = (id: string) => (reviews.data?.reviews ?? []).filter((r) => r.status === 'open' && r.claimed_seller_user_id === id).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div className="space-y-3">
        <PageHeader icon={Users} tone="blue" eyebrow="Admin" title="Team" subtitle="Salespeople get their own login. They see only their own leads and never delivery, clients, money or settings." />
        <p className="text-xs leading-snug text-muted-foreground">Click a salesperson's onboarding badge to see their checklist. The checklist is your record only — it does not block selling. Only a suspended, ended or disabled salesperson is stopped. Only you can see these records.</p>
        {onboarding.error && <Callout tone="red">Onboarding records could not be loaded: {String((onboarding.error as Error).message)}</Callout>}
      </div>

      <Panel title="Invite a salesperson" icon={UserPlus} tone="blue">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 w-full sm:w-48" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="h-9 w-full sm:w-64" />
            <Button className="w-full sm:w-auto" disabled={busy || !name.trim() || !email.trim()} onClick={() => void invite()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invite link'}</Button>
          </div>
          {link && <LinkBox link={link} onClose={() => setLink(null)} />}
        </div>
      </Panel>

      <Panel title="Team members" icon={Users} tone="blue">
        {team.isLoading ? <LoadState label="Loading the team…" compact /> : team.error ? (
          <ErrorState title="Couldn’t load the team" detail={String((team.error as Error).message)} onRetry={() => void team.refetch()} />
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.user_id} className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-muted/20 p-3', m.status !== 'active' ? EDGE.grey : m.suspended_at ? EDGE.red : undefined)}>
                <OwnerAvatar name={m.display_name} className="h-8 w-8 text-xs" />
                {/* basis-56: on a phone the details take the line and the chips wrap under them (never a squeezed column). */}
                <div className="min-w-0 flex-1 basis-56">
                  <div className="break-words font-semibold">{m.display_name} {m.is_book_owner && <span className="text-xs font-normal text-muted-foreground">(book owner)</span>}</div>
                  <div className="break-words text-xs text-muted-foreground">
                    {m.email ?? '—'} · {m.last_sign_in_at ? `last active ${new Date(m.last_sign_in_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}` : 'has not signed in yet'} · {m.assigned_leads} leads
                  </div>
                  {m.role === 'sales' && earn.data && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="team-member-money">
                      <ToneChip tone="blue">{salesOf(m.user_id)} sale{salesOf(m.user_id) === 1 ? '' : 's'}</ToneChip>
                      <ToneChip tone="green">Earned {GBP.format(moneyOf(m.user_id)?.earned ?? 0)}</ToneChip>
                      <ToneChip tone={(moneyOf(m.user_id)?.due ?? 0) > 0 ? 'amber' : 'grey'}>Owed {GBP.format(moneyOf(m.user_id)?.due ?? 0)}</ToneChip>
                      {heldFor(m.user_id) > 0 && <ToneChip tone="amber" icon={Scale}>{heldFor(m.user_id)} held for review</ToneChip>}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                <ToneChip tone={m.status === 'active' ? 'blue' : 'grey'} dot>{m.status === 'active' ? (m.role ?? 'no role') : m.disabled_at ? `ended ${new Date(m.disabled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}` : 'ended'}</ToneChip>
                {m.status === 'active' && m.role === 'sales' && activationPending(m.password_set) && <ToneChip tone="amber" dot>activation pending</ToneChip>}
                {m.status === 'active' && m.suspended_at && <ToneChip tone="red" dot title={`Suspended ${new Date(m.suspended_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`}>suspended</ToneChip>}
                {m.role !== 'admin' && !m.is_book_owner && onboarding.data && (
                  <button type="button" className="inline-flex min-h-[28px] items-center rounded-full" onClick={() => setOpenOnboarding((o) => (o === m.user_id ? null : m.user_id))} aria-expanded={openOnboarding === m.user_id}>
                    <OnboardingBadge summary={onboardingSummary(onboarding.data.rows.get(m.user_id) ?? null, m, onboarding.data.documents, undefined, onboarding.data.missing[m.user_id] ?? null)} />
                  </button>
                )}
                </div>
                {m.role !== 'admin' && !m.is_book_owner && (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    {m.status === 'active' && m.role === 'sales' && activationPending(m.password_set) && (
                      <Button size="sm" variant="outline" data-testid="resend-activation" onClick={async () => {
                        const r = await call('team_new_link', { user_id: m.user_id });
                        if (!r.ok || !r.link) { fail(r.ok ? { error: 'link_failed' } : r); return; }
                        setLink(String(r.link));
                        toast({ title: `New activation link made for ${m.display_name}`, description: 'Same account. Send it to them — the old link no longer works.' });
                        void refresh();
                      }}>Resend activation</Button>
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
                  <div className="w-full sm:pl-11">
                    <SalespersonOnboardingPanel userId={m.user_id} record={onboarding.data.rows.get(m.user_id) ?? null} member={m} docs={onboarding.data.documents} serverMissing={onboarding.data.missing[m.user_id] ?? null} onSave={(patch) => saveOnboarding(m.user_id, patch)} />
                  </div>
                )}
                {m.assigned_leads > 0 && (
                  <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/50 pt-2 sm:pl-11">
                    <span className="text-xs text-muted-foreground">Move all {m.assigned_leads} leads to</span>
                    <Select value={moveTo[m.user_id] ?? ''} onValueChange={(v) => setMoveTo((p) => ({ ...p, [m.user_id]: v }))}>
                      <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Choose…" /></SelectTrigger>
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
      </Panel>

      {reviews.error && <Callout tone="red">Attribution reviews could not be loaded: {String((reviews.error as Error).message)}</Callout>}
      {reviews.data && reviews.data.reviews.length > 0 && (() => {
        const openCount = reviews.data.reviews.filter((r) => r.status === 'open').length;
        return (
          <Panel title={openCount ? `Sales needing an attribution review (${openCount})` : 'Attribution reviews'} icon={Scale} tone={openCount ? 'amber' : 'grey'}>
            {openCount > 0 && <p className="mb-3 text-xs leading-snug text-muted-foreground">These clients paid, but who sold it is not clear, so no seller has been recorded. Their payments count as business revenue, never as anyone's sales or commission, until you decide. Check the evidence, then confirm the seller or record Not credited. Each decision is final and kept with the sale.</p>}
            <AttributionReviewsCard reviews={reviews.data.reviews} people={reviews.data.people} serverReady={reviews.data.serverReady} call={call} onChanged={(message, error) => {
              if (error) toast({ title: 'Not done', description: error, variant: 'destructive' });
              else toast({ title: message ?? 'Saved' });
              void qc.invalidateQueries({ queryKey: ['team', 'attribution-reviews'] });
            }} />
          </Panel>
        );
      })()}

      {onboarding.data && (
        <Panel title="Salesperson documents" icon={FileText} tone="blue" hint="For your records only. Contractor agreements and privacy notices are handled outside LeadFinderOS. None of these documents affects whether someone can sell.">
          <SalespersonDocumentsCard docs={onboarding.data.documents} call={call} onChanged={(message, error) => {
            if (error) toast({ title: 'Not done', description: ONBOARDING_SAVE_ERRORS[error] ?? error, variant: 'destructive' });
            else toast({ title: message ?? 'Saved' });
            void qc.invalidateQueries({ queryKey: ['team', 'onboarding'] });
          }} />
        </Panel>
      )}

      <Panel title="What each role can do" icon={ShieldCheck} tone="grey" hint="Enforced by the database and the server, not by hiding screens.">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-1.5 pr-3 font-semibold">Feature</th><th className="py-1.5 pr-3 font-semibold">Admin</th><th className="py-1.5 font-semibold">Sales</th></tr></thead>
            <tbody className="divide-y divide-border/50">
              {PERMISSION_MATRIX.map((r) => (
                <tr key={r.feature}><td className="py-2 pr-3 font-medium">{r.feature}</td><td className="py-2 pr-3 text-muted-foreground">{r.admin}</td><td className="py-2 text-muted-foreground">{r.sales}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
