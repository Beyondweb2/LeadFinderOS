import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Download, Gauge, History, OctagonX, PauseCircle, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Callout, EDGE, ErrorState, IconTile, LoadState, SURFACE, TONE, ToneChip } from '@/components/operator/ui';
import { Panel } from '@/components/salesDash/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge } from '@/lib/edgeInvoke';
import { edgeErrorMessage } from '@/lib/edgeInvokeCore';
import { GUARD_ACTIONS, type ProtectionLimits, type ProtectionMode, validateLimits, withDefaultActions } from '@/lib/protectionLimits';
import { actionWords, describeSecurityEvent, type SecurityEventRow } from '@/lib/securityAlerts';

/* SECURITY & USAGE — admin only (2026-09-29, docs/abuse-cost-protection.md). The whole page answers:
   is anyone abusing it, who is spending, what warned, who is restricted or suspended, are we near a cap.
   ONE control for paid actions (three states, never three switches). Suspend / reactivate live on Team.
   Data: fn security-admin → public.security_overview(). Refreshes on demand, never on a short timer. */

interface Overview {
  ok: true;
  mode: ProtectionMode;
  limits: ProtectionLimits;
  overrides: Record<string, string>;
  today_total_usd: number;
  team_24h_usd: number;
  team_1h_usd: number;
  by_provider: Array<{ provider: string; usd: number; rows: number }>;
  by_user: Array<{ user_id: string | null; name: string | null; role: string | null; usd: number; estimated_usd: number; refused: number }>;
  by_action: Array<{ user_id: string | null; name: string | null; action: string; allowed: number; warned: number; refused: number; units: number | null }>;
  events: Array<SecurityEventRow & { id: string; alerted_at: string | null; actor_user_id: string | null }>;
  recent: Array<{ created_at: string; name: string | null; action: string; outcome: string; reason: string | null; units: number; est_usd: number | null }>;
  restricted_now: Array<{ user_id: string; name: string | null; reason: string }>;
  members: Array<{ user_id: string; name: string; status: string; suspended_at: string | null; role: string | null; queued_leads: number }>;
  denied_24h: number;
  apify: { used_usd: number; cap_usd: number; pct: number | null; captured_at: string } | null;
  webhook_signature_enforced: boolean;
}

const usd = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const MODE_WORDS: Record<ProtectionMode, { label: string; explain: string }> = {
  running: { label: 'Running', explain: 'Everything normal.' },
  prospecting_paused: { label: 'Prospecting paused', explain: 'Paid actions people start (searches, lookups, enrichment, hook audits, AI drafts, bulk jobs) and the drip’s pre-send audits are paused. Client measurement — baselines, re-measures, discovery — keeps running. WhatsApp is untouched.' },
  all_stop: { label: 'EMERGENCY STOP', explain: 'Every paid action is stopped, client work included: no new audit questions, no SEO scans, no searches or lookups. Runs already started finish. Release it as soon as the cause is fixed.' },
};

export function SecurityPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ProtectionLimits | null>(null);
  const q = useQuery({
    queryKey: ['security', 'overview'],
    queryFn: () => invokeEdge<Overview>('security-admin', { action: 'overview' }),
    staleTime: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['security', 'overview'] });

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await invokeEdge('security-admin', body);
      toast({ title: done });
      await refresh();
      return true;
    } catch (e) {
      toast({ title: 'Not done', description: edgeErrorMessage(e, 'The change was not saved'), variant: 'destructive' });
      return false;
    } finally { setBusy(false); }
  };

  const setMode = async (mode: ProtectionMode) => {
    if (mode === 'all_stop' && !window.confirm('Emergency stop: EVERY paid action pauses, including client measurement work, until you release it. Continue?')) return;
    await act({ action: 'set_mode', mode }, `Paid actions: ${MODE_WORDS[mode].label}`);
  };

  if (q.isLoading) return <LoadState compact label="Loading the security overview…" className={SURFACE} />;
  if (q.error || !q.data) {
    return (
      <ErrorState title="Could not load the security overview" detail={edgeErrorMessage(q.error, 'request failed')} onRetry={() => void refresh()} retryLabel="Retry" />
    );
  }
  const d = q.data;
  /* An action added by a newer release (sales_check) is shown from the defaults until its SQL adds it to
     the live row, so the table never reads an undefined action and a save carries it. */
  const L = withDefaultActions(d.limits);
  const warnings = d.events.filter((e) => e.severity !== 'info' || ['not_allowed', 'suspended', 'webhook_unsigned'].includes(e.kind));
  const exports = d.events.filter((e) => e.kind === 'data_export');
  const suspended = d.members.filter((m) => m.suspended_at);
  const teamPct = L.team_day_cap_usd > 0 ? Math.round((100 * d.team_24h_usd) / L.team_day_cap_usd) : 0;
  const mode = MODE_WORDS[d.mode] ?? MODE_WORDS.running;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2.5 text-lg font-bold tracking-tight"><IconTile icon={ShieldCheck} tone="blue" size="sm" /> Security &amp; usage</h2>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={q.isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      {!d.webhook_signature_enforced && (
        <Callout tone="red" icon={ShieldAlert} title="WhatsApp webhook signatures are not verified.">
          <span className="break-words">WHATSAPP_APP_SECRET is not set. Until it is, the current webhook accepts unsigned posts (anyone who finds its address could post a fake reply), and the fail-closed webhook (built, held until the Findable Meta App is ready) would refuse every reply. Add the Meta App Secret (see the setup note) and this warning clears.</span>
        </Callout>
      )}

      {/* The ONE control for paid actions. */}
      <section className={cn('min-w-0 p-4 space-y-3', SURFACE, EDGE[d.mode === 'all_stop' ? 'red' : d.mode === 'prospecting_paused' ? 'amber' : 'green'])}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Paid actions:</span>
            <ToneChip tone={d.mode === 'all_stop' ? 'red' : d.mode === 'prospecting_paused' ? 'amber' : 'green'} dot className="text-xs">{mode.label}</ToneChip>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant={d.mode === 'running' ? 'default' : 'outline'} disabled={busy || d.mode === 'running'} onClick={() => void setMode('running')}><PlayCircle className="h-4 w-4 mr-1.5" />Resume</Button>
              <Button size="sm" variant="outline" disabled={busy || d.mode === 'prospecting_paused'} onClick={() => void setMode('prospecting_paused')}><PauseCircle className="h-4 w-4 mr-1.5" />Pause paid prospecting</Button>
              <Button size="sm" variant="destructive" disabled={busy || d.mode === 'all_stop'} onClick={() => void setMode('all_stop')}><OctagonX className="h-4 w-4 mr-1.5" />Emergency stop — all paid API</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{mode.explain}</p>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Spend today (actual)" value={usd(d.today_total_usd)} />
        <Stat label={`Team 24 h vs cap ${usd(L.team_day_cap_usd)}`} value={`${usd(d.team_24h_usd)} · ${teamPct}%`} alert={d.team_24h_usd >= L.team_day_warn_usd} />
        <Stat label="Last hour" value={usd(d.team_1h_usd)} alert={d.team_1h_usd >= L.team_hour_warn_usd} />
        <Stat label="Apify this month" value={d.apify ? `${d.apify.pct ?? '?'}% (${usd(d.apify.used_usd)} of ${usd(d.apify.cap_usd)})` : 'unknown'} alert={(d.apify?.pct ?? 0) >= L.apify_warn_pct} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Spend today by provider" icon={Wallet} tone="green">
            <Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>{d.by_provider.map((p) => <TableRow key={p.provider}><TableCell>{p.provider}</TableCell><TableCell className="text-right">{p.rows}</TableCell><TableCell className="text-right font-medium">{usd(p.usd)}</TableCell></TableRow>)}
                {!d.by_provider.length && <TableRow><TableCell colSpan={3} className="text-muted-foreground text-center">Nothing yet today</TableCell></TableRow>}</TableBody></Table>
        </Panel>
        <Panel title="Spend today by person" icon={Users} tone="grey">
            <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Refused</TableHead></TableRow></TableHeader>
              <TableBody>{d.by_user.map((u) => (
                <TableRow key={u.user_id ?? 'system'}>
                  <TableCell>{u.name ?? (u.user_id ? 'Unknown account' : 'System / background')} {u.role && <span className="text-xs text-muted-foreground">({u.role})</span>}</TableCell>
                  <TableCell className="text-right font-medium" title={u.estimated_usd ? `${usd(u.estimated_usd)} of it is estimated (hook audits and AI drafts billed to the book)` : undefined}>{usd(u.usd)}{u.estimated_usd > 0 && <span className="text-xs text-muted-foreground"> *</span>}</TableCell>
                  <TableCell className="text-right">{u.refused || ''}</TableCell>
                </TableRow>))}</TableBody></Table>
            <p className="text-[11px] text-muted-foreground mt-1">* includes an estimate for work billed to the book owner (a salesperson&apos;s hook audits, AI drafts).</p>
        </Panel>
      </div>

      <Panel title="Warnings (7 days)" icon={AlertTriangle} tone="amber">
        <div className="space-y-2">
          {!warnings.length && <p className="text-sm text-muted-foreground">Nothing unusual.</p>}
          {warnings.slice(0, 25).map((e) => (
            <div key={e.id} className="flex flex-wrap items-start gap-2 text-sm border-b last:border-0 pb-2">
              <Badge variant={e.severity === 'warning' ? 'secondary' : 'destructive'}>{e.severity}</Badge>
              <span className="font-medium">{e.name ?? 'System'}</span>
              <span className="text-muted-foreground flex-1 min-w-0 basis-[240px] break-words">{describeSecurityEvent(e)}</span>
              <span className="text-xs text-muted-foreground">{when(e.last_at)}{e.alerted_at ? ' · emailed' : ''}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Restricted and suspended" icon={Ban} tone="red">
          <div className="space-y-2 text-sm">
            {!d.restricted_now.length && !suspended.length && <p className="text-muted-foreground">Nobody is restricted or suspended.</p>}
            {d.restricted_now.map((r) => (
              <div key={`${r.user_id}-${r.reason}`} className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">restricted</Badge><span className="font-medium">{r.name ?? r.user_id}</span>
                <span className="text-muted-foreground">{r.reason.replace(/_/g, ' ')}</span>
                <Button size="sm" variant="outline" className="ml-auto h-7" disabled={busy} onClick={() => void act({ action: 'unlock_user', user_id: r.user_id, hours: 24 }, `Limits lifted for ${r.name ?? 'them'} for 24 hours`)}>Unlock 24 h</Button>
              </div>
            ))}
            {suspended.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">suspended</Badge><span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground">since {when(m.suspended_at)}</span>
                {m.queued_leads > 0 && <span className="text-destructive">{m.queued_leads} queued opener{m.queued_leads === 1 ? '' : 's'} HELD — reassign or remove them from the queue in Outreach</span>}
                <a href="/team" className="ml-auto text-xs underline">Team</a>
              </div>
            ))}
            {Object.entries(d.overrides ?? {}).filter(([, until]) => Date.parse(until) > Date.now()).map(([uid, until]) => (
              <div key={uid} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Limits lifted for {d.members.find((m) => m.user_id === uid)?.name ?? uid} until {when(until)}
                <Button size="sm" variant="ghost" className="h-6 ml-auto" disabled={busy} onClick={() => void act({ action: 'unlock_user', user_id: uid, hours: 0 }, 'Limits restored')}>Restore limits</Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">Refused requests in the last 24 h: {d.denied_24h}. Ten from one person in ten minutes emails you.</p>
          </div>
        </Panel>
        <Panel title="Exports and Copy Numbers (7 days)" icon={Download} tone="blue">
          <div className="space-y-1 text-sm">
            {!exports.length && <p className="text-muted-foreground">None.</p>}
            {exports.slice(0, 15).map((e) => (
              <div key={e.id} className="flex flex-wrap gap-x-2"><span className="font-medium">{e.name ?? '—'}</span><span className="text-muted-foreground flex-1 min-w-0 break-words">{describeSecurityEvent(e)}</span><span className="text-xs text-muted-foreground">{when(e.created_at)}</span></div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Recent guarded activity" icon={History} tone="grey">
          <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Person</TableHead><TableHead>Action</TableHead><TableHead>Outcome</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
            <TableBody>{d.recent.slice(0, 20).map((r, i) => (
              <TableRow key={`${r.created_at}-${i}`}>
                <TableCell className="text-xs">{when(r.created_at)}</TableCell><TableCell>{r.name ?? '—'}</TableCell><TableCell>{actionWords(r.action)}</TableCell>
                <TableCell>{r.outcome === 'allowed' ? 'ok' : <Badge variant={r.outcome === 'warned' ? 'secondary' : 'destructive'}>{r.outcome}{r.reason ? ` · ${r.reason.replace(/_/g, ' ')}` : ''}</Badge>}</TableCell>
                <TableCell className="text-right">{r.units}</TableCell>
              </TableRow>))}</TableBody></Table>
      </Panel>

      <Panel title="Thresholds" icon={Gauge} tone="blue" action={
          !editing ? <Button size="sm" variant="outline" onClick={() => setEditing(structuredClone(L))}>Edit</Button> : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={busy} onClick={async () => {
                const v = validateLimits(editing);
                if (!v.ok) { toast({ title: 'Not saved', description: `Check the numbers (${'error' in v ? v.error : 'invalid'}).`, variant: 'destructive' }); return; }
                if (await act({ action: 'set_limits', limits: v.limits }, 'Thresholds saved')) setEditing(null);
              }}>Save</Button>
            </div>
          )}>
        <div className="text-sm space-y-3">
          <p className="text-xs text-muted-foreground">Per salesperson (the admin is never limited). Set from real usage on 29 Sep 2026 — a very productive day stays under every line.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['user_hour_warn_usd', 'user_hour_hard_usd', 'user_day_warn_usd', 'user_day_hard_usd', 'team_hour_warn_usd', 'team_day_warn_usd', 'team_day_cap_usd', 'denied_alert_10min', 'apify_warn_pct'] as const).map((k) => (
              <label key={k} className="space-y-0.5">
                <span className="text-xs text-muted-foreground">{k.replace(/_/g, ' ').replace(' usd', ' ($)')}</span>
                {editing ? <Input type="number" min={0} step="any" value={editing[k]} className="h-8" onChange={(e) => setEditing({ ...editing, [k]: Number(e.target.value) })} /> : <div className="font-medium">{L[k]}</div>}
              </label>
            ))}
          </div>
          <Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Paid</TableHead>{(['per_min', 'per_10min', 'per_hour', 'per_day', 'warn_day', 'max_rows', 'rows_per_day', 'warn_rows'] as const).map((k) => <TableHead key={k} className="text-right">{k.replace(/_/g, ' ')}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{GUARD_ACTIONS.map((a) => {
              const src = (editing ?? L).actions[a];
              return (
                <TableRow key={a}>
                  <TableCell>{actionWords(a)}{src.sales_allowed === false ? <span className="text-xs text-muted-foreground"> (admin only)</span> : null}</TableCell>
                  <TableCell>{src.paid ? 'yes' : 'no'}</TableCell>
                  {(['per_min', 'per_10min', 'per_hour', 'per_day', 'warn_day', 'max_rows', 'rows_per_day', 'warn_rows'] as const).map((k) => (
                    <TableCell key={k} className="text-right">
                      {editing && src[k] !== undefined ? (
                        <Input type="number" min={0} className="h-7 w-20 ml-auto text-right" value={src[k]} onChange={(e) => setEditing({ ...editing, actions: { ...editing.actions, [a]: { ...src, [k]: Number(e.target.value) } } })} />
                      ) : (src[k] ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}</TableBody></Table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-2xl px-3.5 py-3', alert ? TONE.red.tint : 'bg-muted/40 ring-1 ring-inset ring-border/40')}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 break-words text-lg font-extrabold tabular-nums leading-tight tracking-tight', alert && TONE.red.text)}>{value}</p>
    </div>
  );
}
