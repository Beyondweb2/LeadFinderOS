import { useState } from 'react';
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Callout, DialogHero } from '@/components/operator/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCampaigns } from '@/hooks/useCampaigns';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { LEAD_SOURCE_LABELS } from '@/lib/salesPerformance';
import { refusalText } from '@/lib/salesCrm';
import { internationalPhone } from '@/lib/lineType';

/* ⛔ THE COUNTRY IS ASKED, NOT ASSUMED (2026-09-28). It was hard-coded UK, so a hand-added Pune lead was
   stored as UK: its audit questions read "Pune UK", the engines were asked from Great Britain, and its
   typed "98765 43210" had no country code. UK stays the default and a UK lead is saved exactly as before.
   Only countries a salesperson is actually working are offered. India was removed 2026-10-15 (no longer an outreach
   market; old India leads are untouched and keep their country). Australia added 2026-10-07: a typed
   "0412 345 678" is stored "+61 412 345 678" (never a UK 44… number); a landline / 1300 number is stored too
   (it can be called), it is just never a WhatsApp destination. */
const ADD_COUNTRIES = [
  { value: 'UK', label: 'United Kingdom', phoneHint: '07… (or give a Maps link)', example: '07700 900123' },
  { value: 'Australia', label: 'Australia', phoneHint: '0412 345 678 or +61 … (or give a Maps link)', example: '0412 345 678' },
] as const;

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ADD A LEAD YOU FOUND YOURSELF (2026-09-28) — LinkedIn, a referral, networking, Google / Maps, social,
   AI research, cold research, someone you know, other.

   ⛔ ONE BUSINESS = ONE RECORD, DECIDED BY THE SERVER. The dialog calls sales_add_lead (both roles):
   it looks the business up by place id, then phone, then Maps URL (lead_identity_lookup, row-locked
   by phone), and an existing business is REFUSED with who has it — so a contacted or owned lead can
   never be re-added or taken. The new lead is assigned to whoever added it and lands in the normal
   Outreach list; there is no second list.
   ⚠️ A business with no phone and no Maps link cannot be matched, so the phone is asked for up front.
   ⚠️ THE WEBSITE WARNS, IT NEVER REFUSES (2026-09-28): chains share one domain (149 hosts measured), so
   a website already in the book returns `site_match` naming who has it, and the person may confirm it
   is a different branch. Services / areas / address are optional here and can be added later on the
   Prospect tab (progressive) — they feed the AI check's questions and the paid-client handoff.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* camelCase form keys: this is a form, not a lead row (the list-columns walker reads .snake_case as a lead field). */
const EMPTY = { country: 'UK', businessName: '', trade: '', town: '', phone: '', website: '', email: '', contactName: '', mapsUrl: '', source: '', campaignId: '', note: '', address: '', services: '', areas: '' };
const labels = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: (leadId: string) => void }) {
  const { toast } = useToast();
  const { campaigns } = useCampaigns();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  /* A website match the person has not yet confirmed as a different branch. */
  const [siteMatch, setSiteMatch] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const ready = f.businessName.trim() && f.trade.trim() && f.source && (f.phone.trim() || f.mapsUrl.trim());

  const submit = async (confirmSiteMatch = false) => {
    setRefusal(null); setSiteMatch(null);
    /* A non-UK typed number is stored the way Google stores one ("+61 412 345 678"); one that is not a
       valid number there is refused here rather than saved in a form the WhatsApp paths cannot place. */
    let phone = f.phone;
    if (f.country !== 'UK' && f.phone.trim()) {
      const intl = internationalPhone(f.phone, f.country);
      if (!intl) {
        const example = ADD_COUNTRIES.find((c) => c.value === f.country)?.example ?? '+61 412 345 678';
        setRefusal(`That phone number is not a valid ${f.country} number. Check it, or type it with its country code (e.g. ${example}).`);
        return;
      }
      phone = intl;
    }
    setBusy(true);
    try {
      const r = await leadRpc('sales_add_lead', {
        _lead: {
          business_name: f.businessName, search_keyword: f.trade, search_location: f.town,
          phone, website: f.website, email: f.email, contact_name: f.contactName,
          google_maps_url: f.mapsUrl, lead_source: f.source, campaign_id: f.campaignId || null,
          list_type: 'manual', note: f.note, country: f.country, address: f.address,
          services: labels(f.services), service_areas: labels(f.areas),
          ...(confirmSiteMatch ? { confirm_site_match: true } : {}),
        },
      });
      if (!r.ok) {
        if (r.error === 'site_match') {
          const who = typeof r.owner_name === 'string' && r.owner_name ? r.owner_name : null;
          setSiteMatch(`A business with this website is already in the book${who ? `, with ${who}` : ''}. If this is a different branch of it, you can still add it.`);
        } else if (r.error === 'exists') {
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
      setF(EMPTY); setSiteMatch(null);
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  const field = 'h-9 text-sm';
  const label = 'mb-1 block text-[11px] font-medium text-muted-foreground';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setRefusal(null); setSiteMatch(null); } } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHero icon={UserPlus} tone="blue" title="Add a lead you found"
          subtitle="It goes into your Outreach list. If the business is already in the book, it is not added twice." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Country</label>
            <Select value={f.country} onValueChange={(v) => setF((p) => ({ ...p, country: v }))}>
              <SelectTrigger className={field} data-testid="add-lead-country"><SelectValue /></SelectTrigger>
              <SelectContent>{ADD_COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div />
          <div className="sm:col-span-2"><label className={label}>Business name *</label><Input className={field} value={f.businessName} onChange={set('businessName')} /></div>
          <div><label className={label}>Trade *</label><Input className={field} value={f.trade} onChange={set('trade')} placeholder="e.g. plumber" /></div>
          <div><label className={label}>Town</label><Input className={field} value={f.town} onChange={set('town')} /></div>
          <div><label className={label}>Phone *</label><Input className={field} value={f.phone} onChange={set('phone')} inputMode="tel" placeholder={ADD_COUNTRIES.find((c) => c.value === f.country)?.phoneHint ?? ''} /></div>
          <div><label className={label}>Contact name</label><Input className={field} value={f.contactName} onChange={set('contactName')} placeholder="Only if you know it" /></div>
          <div><label className={label}>Website</label><Input className={field} value={f.website} onChange={set('website')} /></div>
          <div><label className={label}>Email</label><Input className={field} value={f.email} onChange={set('email')} inputMode="email" /></div>
          <div className="sm:col-span-2"><label className={label}>Google Maps link (if no phone)</label><Input className={field} value={f.mapsUrl} onChange={set('mapsUrl')} /></div>
          <div className="sm:col-span-2"><label className={label}>Main services (comma separated, only what you know)</label><Input className={field} value={f.services} onChange={set('services')} placeholder="e.g. boiler repair, bathroom fitting" /></div>
          <div><label className={label}>Service areas</label><Input className={field} value={f.areas} onChange={set('areas')} placeholder="e.g. Wakefield, Ossett" /></div>
          <div><label className={label}>Address</label><Input className={field} value={f.address} onChange={set('address')} /></div>
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
        {siteMatch && (
          <Callout tone="amber" icon={AlertTriangle} testId="add-lead-site-match">
            <p>{siteMatch}</p>
            <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit(true)}>It's a different branch — add it</Button>
          </Callout>
        )}
        {refusal && <Callout tone="amber" icon={AlertTriangle} testId="add-lead-refusal">{refusal}</Callout>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit(false)} disabled={!ready || busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Add lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
