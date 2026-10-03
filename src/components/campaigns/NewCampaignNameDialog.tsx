import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCampaignActions } from '@/hooks/useMyCampaigns';
import { CAMPAIGN_NAME_MAX, campaignErrorText } from '@/lib/campaignRules';

/* "New campaign…" from a campaign dropdown (Outreach, Find Leads — 2026-10-03): just a name, created by the
   server (campaign_create: the owner is the signed-in account; a taken name is refused there, never whose).
   Leads and the first message are added on the campaign's page or by picking it here. */
export function NewCampaignNameDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (c: { id: string; name: string }) => void }) {
  const { create } = useCampaignActions();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(''); setError(null); } }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await create(name);
      if (!r.ok) { setError(campaignErrorText(String(r.error))); return; }
      onOpenChange(false);
      onCreated({ id: String(r.id), name: String(r.name) });
    } finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>New campaign</DialogTitle><DialogDescription>Usually the trade and the town. Every campaign name is unique.</DialogDescription></DialogHeader>
      <Input autoFocus placeholder="e.g. Roofers - Manchester" value={name} maxLength={CAMPAIGN_NAME_MAX + 20}
        onChange={(e) => { setName(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !busy) void save(); }} />
      {error && <p role="alert" className="text-sm text-destructive" data-testid="new-campaign-error">{error}</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy || !name.trim()}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
