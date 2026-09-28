import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCampaigns } from '@/hooks/useCampaigns';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { LEAD_SOURCE_LABELS } from '@/lib/salesPerformance';
import { refusalText } from '@/lib/salesCrm';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ADD A LEAD YOU FOUND YOURSELF (2026-09-28) — LinkedIn, a referral, networking, Google / Maps, social,
   AI research, cold research, someone you know, other.

   ⛔ ONE BUSINESS = ONE RECORD, DECIDED BY THE SERVER. The dialog calls sales_add_lead (both roles):
   it looks the business up by place id, then phone, then Maps URL (lead_identity_lookup, row-locked
   by phone), and an existing business is REFUSED with who has it — so a contacted or owned lead can
   never be re-added or taken. The new lead is assigned to whoever added it and lands in the normal
   Outreach list; there is no second list.
   ⚠️ A business with no phone and no Maps link cannot be matched, so the phone is asked for up front.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* camelCase form keys: this is a form, not a lead row (the list-columns walker reads .snake_case as a lead field). */
const EMPTY = { businessName: '', trade: '', town: '', phone: '', website: '', email: '', contactName: '', mapsUrl: '', source: '', campaignId: '', note: '' };

export function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: (leadId: string) => void }) {
  const { toast } = useToast();
  const { campaigns } = useCampaigns();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ready = f.businessName.trim() && f.trade.trim() && f.source && (f.phone.trim() || f.mapsUrl.trim());

  const submit = async () => {
    setBusy(true); setRefusal(null);
    try {
      const r = await leadRpc('sales_add_lead', {
        _lead: {
          business_name: f.businessName, search_keyword: f.trade, search_location: f.town,
          phone: f.phone, website: f.website, email: f.email, contact_name: f.contactName,
          google_maps_url: f.mapsUrl, lead_source: f.source, campaign_id: f.campaignId || null,
          list_type: 'manual', note: f.note, country: 'UK',
        },
      });
      if (!r.ok) {
        if (r.error === 'exists') {
          const who = typeof r.owner_name === 'string' && r.owner_name ? r.owner_name : null;
          setRefusal(`This business is already in the book${who ? `, with ${who}` : ''}. It has not been added again.`);
        } else {
          setRefusal(refusalText(r.error));
        }
        return;
      }
      const id = String(r.lead_id);
      toast({ title: 'Lead added', description: `${f.businessName} is in your Outreach list.` });
      notifyLeadChanged(id); // Outreach reads the new row in from the server
      onAdded?.(id);
      setF(EMPTY);
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  const field = 'h-9 text-sm';
  const label = 'mb-1 block text-[11px] font-medium text-muted-foreground';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setRefusal(null); } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Add a lead you found</DialogTitle>
          <DialogDescription>It goes into your Outreach list. If the business is already in the book, it is not added twice.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Business name *</label><Input className={field} value={f.businessName} onChange={set('businessName')} /></div>
          <div><label className={label}>Trade *</label><Input className={field} value={f.trade} onChange={set('trade')} placeholder="e.g. plumber" /></div>
          <div><label className={label}>Town</label><Input className={field} value={f.town} onChange={set('town')} /></div>
          <div><label className={label}>Phone *</label><Input className={field} value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="07… (or give a Maps link)" /></div>
          <div><label className={label}>Contact name</label><Input className={field} value={f.contactName} onChange={set('contactName')} placeholder="Only if you know it" /></div>
          <div><label className={label}>Website</label><Input className={field} value={f.website} onChange={set('website')} /></div>
          <div><label className={label}>Email</label><Input className={field} value={f.email} onChange={set('email')} inputMode="email" /></div>
          <div className="sm:col-span-2"><label className={label}>Google Maps link (if no phone)</label><Input className={field} value={f.mapsUrl} onChange={set('mapsUrl')} /></div>
          <div>
            <label className={label}>Where did you find them? *</label>
            <Select value={f.source} onValueChange={(v) => setF((p) => ({ ...p, source: v }))}>
              <SelectTrigger className={field}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className={label}>Campaign</label>
            <Select value={f.campaignId || 'none'} onValueChange={(v) => setF((p) => ({ ...p, campaignId: v === 'none' ? '' : v }))}>
              <SelectTrigger className={field}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No campaign</SelectItem>
                {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><label className={label}>First note (internal, never sent)</label><Textarea rows={2} className="resize-none text-sm" value={f.note} onChange={set('note')} placeholder="How you know them, what they said…" /></div>
        </div>
        {refusal && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200" data-testid="add-lead-refusal">{refusal}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!ready || busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Add lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
