import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCampaignActions } from '@/hooks/useMyCampaigns';
import {
  CAMPAIGN_FIELD_MAX, CAMPAIGN_NAME_MAX, campaignErrorText, campaignFormError, suggestCampaignName,
  type CampaignMethod, type CampaignSummary,
} from '@/lib/campaignRules';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ONE CAMPAIGN FORM (sales workspace v2, Paul, 2026-10-05): name · niche / trade · Call or WhatsApp ·
   optional area → Create. No lead step, no message step, no review: leads come in from Find Leads (pick
   the campaign, then add) or are moved in from Outreach. The same form edits a campaign.
   The name is the person's; a suggestion ("Plumbers · Halifax · Call") fills in until they type their own.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export function CampaignEditDialog({ open, onOpenChange, campaign, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  /** Edit this one; absent = a new campaign. */
  campaign?: Pick<CampaignSummary, 'id' | 'name' | 'trade' | 'area' | 'method' | 'queued'> | null;
  onSaved?: (c: { id: string; name: string }) => void;
}) {
  const { create, update } = useCampaignActions();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [trade, setTrade] = useState('');
  const [area, setArea] = useState('');
  const [method, setMethod] = useState<CampaignMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(campaign?.name ?? ''); setNameTouched(!!campaign);
    setTrade(campaign?.trade ?? ''); setArea(campaign?.area ?? ''); setMethod(campaign ? (campaign.method ?? 'whatsapp') : null);
    setError(null);
  }, [open, campaign]);

  /* The suggestion follows the fields until the person writes a name of their own. */
  useEffect(() => {
    if (!nameTouched && trade.trim() && method) setName(suggestCampaignName(trade, area, method));
  }, [trade, area, method, nameTouched]);

  const save = async () => {
    const f = { name: name.trim(), trade: trade.trim(), method, area: area.trim() || null };
    const err = campaignFormError(f);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      const fields = { name: f.name, trade: f.trade, method: f.method as CampaignMethod, area: f.area };
      const r = campaign ? await update(campaign.id, fields) : await create(fields);
      if (!r.ok) { setError(campaignErrorText(String(r.error))); return; }
      onOpenChange(false);
      onSaved?.({ id: String(campaign?.id ?? r.id), name: String(r.name ?? f.name) });
    } finally { setBusy(false); }
  };

  const methodBtn = (m: CampaignMethod, Icon: typeof Phone, label: string, hint: string) => (
    <button type="button" onClick={() => { setMethod(m); setError(null); }} data-testid={`campaign-method-${m}`} aria-pressed={method === m}
      className={cn('flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md border p-2.5 text-left text-sm transition-colors',
        method === m ? 'border-primary bg-primary/10' : 'hover:bg-muted')}>
      <span className="flex items-center gap-1.5 font-medium"><Icon className="h-4 w-4" />{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );

  return <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="sm:max-w-md" data-testid="campaign-form">
      <DialogHeader>
        <DialogTitle>{campaign ? 'Edit campaign' : 'New campaign'}</DialogTitle>
        <DialogDescription>Add leads to it from Find Leads — pick the campaign first, then add businesses.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Niche / trade</span>
          <Input autoFocus={!campaign} placeholder="e.g. Plumbers" value={trade} maxLength={CAMPAIGN_FIELD_MAX} data-testid="campaign-trade"
            onChange={(e) => { setTrade(e.target.value); setError(null); }} />
        </label>
        <div className="space-y-1 text-sm">
          <span className="font-medium">Contact method</span>
          <div className="flex gap-2">
            {methodBtn('call', Phone, 'Call', 'Work them from Outreach. No WhatsApp is sent.')}
            {methodBtn('whatsapp', MessageCircle, 'WhatsApp', 'You can send the approved opener when ready.')}
          </div>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Area / town <span className="font-normal text-muted-foreground">(optional)</span></span>
          <Input placeholder="e.g. Halifax" value={area} maxLength={CAMPAIGN_FIELD_MAX} data-testid="campaign-area"
            onChange={(e) => { setArea(e.target.value); setError(null); }} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Campaign name</span>
          <Input placeholder="e.g. Plumbers · Halifax · Call" value={name} maxLength={CAMPAIGN_NAME_MAX + 20} data-testid="campaign-name-input"
            onChange={(e) => { setName(e.target.value); setNameTouched(true); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void save(); }} />
        </label>
        {campaign && campaign.method === 'whatsapp' && method === 'call' && (campaign.queued ?? 0) > 0 &&
          <p className="text-xs text-amber-700 dark:text-amber-300">Openers are waiting to send. Pause sending first, then switch to Call.</p>}
        {error && <p role="alert" className="text-sm text-destructive" data-testid="campaign-form-error">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy} data-testid="campaign-save">
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{campaign ? 'Save' : 'Create campaign'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
