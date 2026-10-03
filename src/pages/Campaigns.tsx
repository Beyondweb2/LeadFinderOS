import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2, Megaphone, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
import { useMyCampaigns } from '@/hooks/useMyCampaigns';
import { CAMPAIGN_STATUS_LABEL, campaignDisplayName, campaignNextStep, campaignStatus, type CampaignStatus, type CampaignSummary } from '@/lib/campaignRules';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAMPAIGNS (2026-10-03). A salesperson's own campaigns — the server returns nothing else (my_campaigns).
   The admin sees every campaign, with the owner in brackets beside any that is not theirs, and an Owner
   filter. One clear "New campaign"; each card says its status, its leads and the one thing to do next.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: 'bg-slate-500 hover:bg-slate-500', ready: 'bg-sky-700 hover:bg-sky-700', sending: 'bg-indigo-600 hover:bg-indigo-600',
  partly_sent: 'bg-amber-700 hover:bg-amber-700', sent: 'bg-emerald-700 hover:bg-emerald-700',
};

const MINE = '__mine__';
const ALL = '';

function CampaignCard({ c, admin }: { c: CampaignSummary; admin: boolean }) {
  const st = campaignStatus(c);
  return <Link to={`/campaigns/${c.id}`} className="block min-w-0" data-testid="campaign-card">
    <Card className="h-full transition-colors hover:border-primary/60">
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-words font-semibold" data-testid="campaign-name">{campaignDisplayName(c, admin)}</span>
          <Badge className={cn('shrink-0 text-[11px] text-white', STATUS_TONE[st])}>{CAMPAIGN_STATUS_LABEL[st]}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{c.leads} {c.leads === 1 ? 'lead' : 'leads'}</span>
          <span>{c.contacted} messaged</span>
          <span>{c.replied} replied</span>
          {c.interested > 0 && <span>{c.interested} interested</span>}
        </div>
        <p className="text-xs font-medium">Next: {campaignNextStep(c)}</p>
      </CardContent>
    </Card>
  </Link>;
}

export default function Campaigns() {
  const q = useMyCampaigns();
  const [wizard, setWizard] = useState(false);
  const [owner, setOwner] = useState<string>(ALL);
  const admin = q.data?.admin === true;
  const all = q.data?.campaigns ?? [];
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of all) if (!c.is_mine && c.owner_id) m.set(c.owner_id, c.owner_name?.trim() || 'Another user');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const shown = !admin || owner === ALL ? all : owner === MINE ? all.filter((c) => c.is_mine) : all.filter((c) => c.owner_id === owner);

  return <div className="mx-auto max-w-6xl space-y-5 py-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Megaphone className="h-6 w-6" />Campaigns</h1>
        <p className="text-sm text-muted-foreground">{admin ? 'Every campaign. Ones created by someone else show who in brackets.' : 'Your campaigns: a group of your leads and the first message they get.'}</p>
      </div>
      <Button onClick={() => setWizard(true)} data-testid="new-campaign"><Plus className="mr-1 h-4 w-4" />New campaign</Button>
    </div>

    {admin && owners.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="campaign-owner" className="text-xs font-medium">Owner</label>
      <select id="campaign-owner" className="h-8 rounded-md border bg-background px-2 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value={ALL}>Everyone</option>
        <option value={MINE}>Mine</option>
        {owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
    </div>}

    {q.isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
    {q.isError && <Card><CardContent className="flex flex-wrap items-center gap-2 p-6 text-sm text-destructive"><AlertCircle className="h-4 w-4" />Could not load campaigns.<Button size="sm" variant="outline" onClick={() => void q.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Try again</Button></CardContent></Card>}
    {q.data && shown.length === 0 && <Card><CardContent className="space-y-3 p-6 text-sm">
      <p className="font-medium">{all.length === 0 ? 'No campaigns yet.' : 'No campaigns for this owner.'}</p>
      {all.length === 0 && <p className="text-muted-foreground">A campaign is a group of your leads that get the first message together. Name it, pick the leads, launch.</p>}
    </CardContent></Card>}
    {shown.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map((c) => <CampaignCard key={c.id} c={c} admin={admin} />)}</div>}

    <CampaignWizard open={wizard} onOpenChange={setWizard} opener={q.data?.opener ?? null} />
  </div>;
}
