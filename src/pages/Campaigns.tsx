import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListFilter, Loader2, Megaphone, MessageCircle, Pause, Pencil, Phone, Plus, Send, Trash2 } from 'lucide-react';
import { EmptyState, ErrorState, LoadState, PageHeader } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CampaignEditDialog } from '@/components/campaigns/CampaignEditDialog';
import { useCampaignActions, useMyCampaigns } from '@/hooks/useMyCampaigns';
import {
  CAMPAIGN_METHOD_LABEL, campaignDisplayName, campaignErrorText, campaignStats, launchSkipLine, type CampaignSummary,
} from '@/lib/campaignRules';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MANAGE CAMPAIGNS (sales workspace v2, Paul, 2026-10-05). A campaign is a container: a niche, a contact
   method (Call / WhatsApp) and an optional area. This page lists them with the numbers that matter, in the
   channel's own words, and offers Edit / Send openers · Pause sending (WhatsApp only) / Delete. It is NOT a
   lead screen: "Open leads" goes to Outreach filtered to the campaign; leads join from Find Leads.
   ⛔ Delete archives (campaign_archive): leads, their history and their campaign link all stay.
   A salesperson sees only their own campaigns (my_campaigns); the admin sees all, owner in brackets.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const MINE = '__mine__';
const ALL = '';

function CampaignCard({ c, admin, onEdit }: { c: CampaignSummary; admin: boolean; onEdit: (c: CampaignSummary) => void }) {
  const actions = useCampaignActions();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const method = c.method ?? 'whatsapp';
  const run = async (key: string, fn: () => Promise<{ ok?: boolean; error?: unknown } & Record<string, unknown>>, done: (r: Record<string, unknown>) => string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) toast({ title: 'Not done', description: campaignErrorText(String(r.error)), variant: 'destructive' });
      else toast({ title: done(r) });
    } finally { setBusy(null); }
  };
  const send = () => run('send', () => actions.launch(c.id), (r) => `${r.queued} ${Number(r.queued) === 1 ? 'opener' : 'openers'} queued. ${launchSkipLine(r.skipped as Record<string, number>)}`.trim());
  const pause = () => { if (window.confirm(`Pause sending? The ${c.queued} ${c.queued === 1 ? 'lead' : 'leads'} still waiting go back to how they were. Messages already sent are not affected.`)) void run('pause', () => actions.stop(c.id), (r) => `Paused: ${r.stopped} taken out of the queue.`); };
  const del = () => {
    if (!window.confirm(`Delete “${c.name}”? Its ${c.leads} ${c.leads === 1 ? 'lead stays' : 'leads stay'} in your CRM with their history — only the campaign is removed.${c.queued ? ` The ${c.queued} waiting ${c.queued === 1 ? 'opener is' : 'openers are'} paused first.` : ''}`)) return;
    void run('delete', () => actions.remove(c.id), () => 'Campaign deleted — its leads and history are kept');
  };
  const Icon = method === 'call' ? Phone : MessageCircle;
  const spin = (k: string, I: typeof Send) => busy === k ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <I className="mr-1 h-3.5 w-3.5" />;

  return <Card className="min-w-0" data-testid="campaign-card">
    <CardContent className="space-y-3 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold" data-testid="campaign-name">{campaignDisplayName(c, admin)}</p>
          <p className="truncate text-xs text-muted-foreground">{[c.trade, c.area].filter(Boolean).join(' · ') || 'No niche set'}</p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white',
          method === 'call' ? 'bg-sky-700' : 'bg-emerald-700')} data-testid="campaign-method"><Icon className="h-3 w-3" />{CAMPAIGN_METHOD_LABEL[method]}</span>
      </div>
      <dl className="grid grid-cols-5 gap-1 text-center" data-testid="campaign-stats">
        {campaignStats({ ...c, method }).map((s) => <div key={s.label} className="min-w-0 rounded-md bg-muted/50 px-1 py-1.5">
          <dd className="text-base font-semibold leading-none">{s.value}</dd><dt className="mt-1 truncate text-[10px] text-muted-foreground">{s.label}</dt>
        </div>)}
      </dl>
      {method === 'whatsapp' && c.queued > 0 && <p className="text-xs text-muted-foreground">{c.queued} {c.queued === 1 ? 'opener' : 'openers'} waiting to send in the send window.</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline"><Link to={`/outreach?campaign=${c.id}`} data-testid="campaign-open-leads"><ListFilter className="mr-1 h-3.5 w-3.5" />Open leads</Link></Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(c)} disabled={!!busy} data-testid="campaign-edit"><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
        {method === 'whatsapp' && c.ready > 0 && <Button size="sm" variant="ghost" onClick={() => void send()} disabled={!!busy} data-testid="campaign-send">{spin('send', Send)}Send openers ({c.ready})</Button>}
        {method === 'whatsapp' && c.queued > 0 && <Button size="sm" variant="ghost" onClick={pause} disabled={!!busy} data-testid="campaign-pause">{spin('pause', Pause)}Pause sending</Button>}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={del} disabled={!!busy} data-testid="campaign-delete">{spin('delete', Trash2)}Delete</Button>
      </div>
    </CardContent>
  </Card>;
}

export default function Campaigns() {
  const q = useMyCampaigns();
  const [editing, setEditing] = useState<CampaignSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [owner, setOwner] = useState<string>(ALL);
  const admin = q.data?.admin === true;
  const all = q.data?.campaigns ?? [];
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of all) if (!c.is_mine && c.owner_id) m.set(c.owner_id, c.owner_name?.trim() || 'Another user');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const shown = !admin || owner === ALL ? all : owner === MINE ? all.filter((c) => c.is_mine) : all.filter((c) => c.owner_id === owner);

  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-0">
    <PageHeader icon={Megaphone} tone="blue" title="Manage campaigns"
      subtitle="A campaign groups leads for one niche and one way of contacting them. Add leads from Find Leads; work them in Outreach."
      actions={<Button onClick={() => setCreating(true)} data-testid="new-campaign"><Plus className="mr-1 h-4 w-4" />New campaign</Button>} />

    {admin && owners.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="campaign-owner" className="text-xs font-medium">Owner</label>
      <select id="campaign-owner" className="h-8 rounded-md border bg-background px-2 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value={ALL}>Everyone</option>
        <option value={MINE}>Mine</option>
        {owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
    </div>}

    {q.isLoading && <LoadState label="Loading campaigns…" />}
    {q.isError && <ErrorState title="Could not load campaigns." onRetry={() => void q.refetch()} />}
    {q.data && shown.length === 0 && <EmptyState icon={Megaphone} tone="blue" title={all.length === 0 ? 'No campaigns yet.' : 'No campaigns for this owner.'}>
      {all.length === 0 ? 'Create one (niche, Call or WhatsApp, optional area), then pick it in Find Leads before you add businesses.' : undefined}
    </EmptyState>}
    {shown.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map((c) => <CampaignCard key={c.id} c={c} admin={admin} onEdit={setEditing} />)}</div>}

    <CampaignEditDialog open={creating} onOpenChange={setCreating} />
    <CampaignEditDialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }} campaign={editing} />
  </div>;
}
