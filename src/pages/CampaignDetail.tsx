import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, Pencil, Plus, RefreshCw, Send, Settings2, Square, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LeadChooser } from '@/components/campaigns/LeadChooser';
import { CampaignFormDialog } from '@/components/CampaignFormDialog';
import { TemplateSnippet } from '@/components/TemplateWordingPreview';
import { useCampaignActions, useCampaignDetail, useCampaignLeads } from '@/hooks/useMyCampaigns';
import { useCampaigns } from '@/hooks/useCampaigns';
import { CAMPAIGN_NAME_MAX, CAMPAIGN_STATUS_LABEL, campaignDisplayName, campaignErrorText, campaignNextStep, campaignStatus, launchSkipLine, openerPurpose } from '@/lib/campaignRules';
import { OUTREACH_STATUS_OPTIONS, templateLabel } from '@/types/outreach';
import { STATUS_TONE } from '@/pages/Campaigns';
import { outreachLeadLink } from '@/lib/salesLinks';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE CAMPAIGN (2026-10-03): what it is, how far it has got, and the actions that apply now — Launch / Send
   to new leads, Stop sending, Add leads, Rename, Delete (only while empty). Every action is a role-checked
   function; another owner's campaign is "not available" here exactly as at the server. The admin also gets
   the owner and the old advanced settings (type, trade, sale type), which a salesperson never needs.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const statusLabel = (s: string | null) => OUTREACH_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? (s ?? '—');

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const d = useCampaignDetail(campaignId);
  const leads = useCampaignLeads(campaignId);
  const actions = useCampaignActions();
  const admin = !!d.data?.campaign.owner_id; // owner fields come only to the admin
  const { campaigns: adminRows, updateCampaign } = useCampaigns();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  if (d.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (d.isError || !d.data) {
    const notFound = (d.error as Error & { code?: string })?.code === 'not_found';
    return <div className="mx-auto max-w-4xl space-y-4 py-6"><Link to="/campaigns" className="text-xs text-muted-foreground">← Campaigns</Link>
      <Card><CardContent className="flex flex-wrap items-center gap-2 p-6 text-sm">{notFound ? <span>That campaign is not available.</span> : <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive">Could not load this campaign.</span><Button size="sm" variant="outline" onClick={() => void d.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Try again</Button></>}</CardContent></Card></div>;
  }
  const c = d.data.campaign;
  const st = campaignStatus(c);
  const message = c.default_template ?? d.data.opener;
  const pct = c.leads ? Math.round((c.contacted / c.leads) * 100) : 0;

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: unknown; [k: string]: unknown }>, done: (r: Record<string, unknown>) => string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) toast({ title: 'Not done', description: campaignErrorText(String(r.error)), variant: 'destructive' });
      else toast({ title: done(r) });
      return r;
    } finally { setBusy(null); }
  };
  const launch = () => run('launch', () => actions.launch(c.id), (r) => `${r.queued} ${Number(r.queued) === 1 ? 'message' : 'messages'} queued. ${launchSkipLine(r.skipped as Record<string, number>)}`.trim());
  const stop = () => { if (window.confirm(`Stop sending? The ${c.queued} ${c.queued === 1 ? 'lead' : 'leads'} still waiting go back to how they were. Messages already sent are not affected.`)) void run('stop', () => actions.stop(c.id), (r) => `Stopped: ${r.stopped} taken out of the queue.`); };
  const del = async () => { if (!window.confirm(c.leads > 0 ? `Delete “${c.name}”? Its ${c.leads} leads move to “No campaign”: they are never deleted.` : `Delete “${c.name}”?`)) return; const r = await run('delete', () => actions.remove(c.id), () => 'Campaign deleted'); if (r?.ok) navigate('/campaigns'); };
  const add = async () => { const r = await run('add', () => actions.addLeads(c.id, [...toAdd]), (x) => `${x.moved} added.`); if (r?.ok) { setAdding(false); setToAdd(new Set()); } };
  const rename = async () => {
    setBusy('rename');
    try {
      const r = await actions.rename(c.id, newName);
      if (!r.ok) { setRenameError(campaignErrorText(String(r.error))); return; }
      setRenaming(false); toast({ title: 'Renamed' });
    } finally { setBusy(null); }
  };
  const adminRow = adminRows.find((x) => x.id === c.id) ?? null;

  return <div className="mx-auto max-w-5xl space-y-4 py-6">
    <Link to="/campaigns" className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="h-3 w-3" />Campaigns</Link>
    <Card><CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold" data-testid="campaign-title">{campaignDisplayName(c, admin)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Message: <span className="font-medium text-foreground">{message ? openerPurpose(message, templateLabel(message)) : 'not set'}</span></p>
          {message && <TemplateSnippet selected={message} className="max-w-xl" />}
        </div>
        <Badge className={cn('text-xs text-white', STATUS_TONE[st])} data-testid="campaign-status">{CAMPAIGN_STATUS_LABEL[st]}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {([['Leads', c.leads], ['Waiting to send', c.queued], ['Messaged', c.contacted], ['Replied', c.replied], ['Interested', c.interested]] as const).map(([k, v]) =>
          <div key={k} className="rounded-md border p-2.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>)}
      </dl>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${pct}% messaged`}><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-xs text-muted-foreground">{pct}% of the leads messaged · Next: {campaignNextStep(c)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {c.ready > 0 && <Button onClick={() => void launch()} disabled={!!busy} data-testid="campaign-launch">{busy === 'launch' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}{c.contacted > 0 || c.queued > 0 ? `Send to ${c.ready} new ${c.ready === 1 ? 'lead' : 'leads'}` : 'Launch'}</Button>}
        {c.queued > 0 && <Button variant="outline" onClick={stop} disabled={!!busy} data-testid="campaign-stop">{busy === 'stop' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Square className="mr-1 h-4 w-4" />}Stop sending</Button>}
        <Button variant="outline" onClick={() => { setToAdd(new Set()); setAdding(true); }} disabled={!!busy}><Plus className="mr-1 h-4 w-4" />Add leads</Button>
        <Button variant="ghost" onClick={() => { setNewName(c.name); setRenameError(null); setRenaming(true); }} disabled={!!busy}><Pencil className="mr-1 h-4 w-4" />Rename</Button>
        {(c.leads === 0 || admin) && <Button variant="ghost" className="text-destructive" onClick={() => void del()} disabled={!!busy}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>}
        {admin && adminRow && <Button variant="ghost" onClick={() => setAdvanced(true)}><Settings2 className="mr-1 h-4 w-4" />Advanced settings</Button>}
      </div>
    </CardContent></Card>

    <Card><CardContent className="p-0">
      <div className="border-b px-4 py-3 text-sm font-semibold">Leads in this campaign</div>
      {leads.isLoading ? <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        : leads.isError ? <p className="p-4 text-sm text-destructive">Could not load the leads.</p>
        : (leads.data ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">No leads yet. Use Add leads.</p>
        : <ul className="divide-y">{(leads.data ?? []).map((l) => <li key={l.id}>
            <Link to={outreachLeadLink(l.id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-muted/50">
              <span className="min-w-0"><span className="block truncate font-medium">{l.business_name ?? 'Unnamed business'}</span><span className="block truncate text-xs text-muted-foreground">{[l.trade, l.town].filter(Boolean).join(' · ')}</span></span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full border px-2 py-0.5">{statusLabel(l.status)}</span>
                {l.replied && <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">Replied</span>}
                {l.interested && <span className="rounded-full border border-amber-500/40 px-2 py-0.5">⭐ Interested</span>}
              </span>
            </Link>
          </li>)}</ul>}
    </CardContent></Card>

    <Dialog open={adding} onOpenChange={(v) => { if (!busy) setAdding(v); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add leads</DialogTitle><DialogDescription>Your leads that are not in this campaign yet.</DialogDescription></DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto"><LeadChooser campaignId={c.id} selected={toAdd} onChange={setToAdd} /></div>
        <DialogFooter><Button variant="ghost" onClick={() => setAdding(false)} disabled={!!busy}>Cancel</Button><Button onClick={() => void add()} disabled={!!busy || toAdd.size === 0}>{busy === 'add' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add {toAdd.size}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={renaming} onOpenChange={(v) => { if (!busy) setRenaming(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Rename campaign</DialogTitle><DialogDescription className="sr-only">A new, unique name.</DialogDescription></DialogHeader>
        <Input value={newName} maxLength={CAMPAIGN_NAME_MAX + 20} onChange={(e) => { setNewName(e.target.value); setRenameError(null); }} />
        {renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
        <DialogFooter><Button variant="ghost" onClick={() => setRenaming(false)} disabled={!!busy}>Cancel</Button><Button onClick={() => void rename()} disabled={!!busy || !newName.trim()}>{busy === 'rename' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    {admin && adminRow && <CampaignFormDialog open={advanced} onOpenChange={setAdvanced} campaign={adminRow} onSubmit={async (v) => { const r = await updateCampaign(c.id, v); await actions.refresh(c.id); return r; }} />}
  </div>;
}
