import { useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Globe, Loader2, UserPlus } from 'lucide-react';
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
import { useCountrySettings } from '@/hooks/useCountrySettings';
import { leadReadiness, readinessLines } from '@/lib/leadReadiness';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { BLOCKED_LINE, NOTHING_FOUND_LINE, UNREADABLE_LINE, countryFromPhone, fillBlanks, isMapsLink, type FillResult } from '@/lib/leadFromWebsite';

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
  { value: 'Ireland', label: 'Ireland', phoneHint: '085 123 4567 or +353 … (or give a Maps link)', example: '085 123 4567' },
  { value: 'Malaysia', label: 'Malaysia', phoneHint: '012-345 6789 or +60 … (or give a Maps link)', example: '012-345 6789' },
  { value: 'Singapore', label: 'Singapore', phoneHint: '9123 4567 or +65 … (or give a Maps link)', example: '9123 4567' },
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
/* The up-front "Phone (or Google Maps link)" box is `phone`; a Maps link typed there is saved as the Maps link. */
const EMPTY = { country: 'UK', businessName: '', trade: '', town: '', phone: '', website: '', email: '', contactName: '', mapsUrl: '', source: '', campaignId: '', note: '', address: '', services: '', areas: '' };
const labels = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/* FILL FROM WEBSITE (2026-11-14, src/lib/leadFromWebsite.ts; edge function lead-from-website): paste the website and
   the blank fields are filled with what the site STATES. A typed value is never overwritten; nothing is saved until
   Add lead. A site that blocks automated readers is said here, and once the lead is added its normal website check
   (crawl-check) runs, so the refusal is stored on the lead as a website finding.
   SIMPLE FORM (same day): Website, Business name, Trade, Town, Phone (or Maps link) and Where found are up front;
   everything else is under "More details" (opened by itself when a fill puts something there). */
type FillState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; line: string; tone: 'ok' | 'amber'; blocked?: boolean };

export function AddLeadDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded?: (leadId: string) => void }) {
  const { toast } = useToast();
  const { campaigns } = useCampaigns();
  const [f, setF] = useState(EMPTY);
  const fRef = useRef(f);
  fRef.current = f;
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [fill, setFill] = useState<FillState>({ kind: 'idle' });
  /* The country was set by the person (never changed by a fill after that). */
  const [countryTouched, setCountryTouched] = useState(false);
  /* A website match the person has not yet confirmed as a different branch. */
  const [siteMatch, setSiteMatch] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const phoneBoxIsMaps = isMapsLink(f.phone);
  const ready = f.businessName.trim() && f.trade.trim() && f.source && (f.phone.trim() || f.mapsUrl.trim());
  /* READINESS (2026-10-15, src/lib/leadReadiness.ts): what this lead will still need for the audit and a message, said
     before it is saved. Never blocks the add — a hand-added lead with no Google place is audited on its typed town. */
  const { settings: countrySettings } = useCountrySettings();
  const typed = { business_name: f.businessName, search_keyword: f.trade, search_location: f.town, address: f.address,
    phone: phoneBoxIsMaps ? '' : f.phone, country: f.country, lead_source: f.source || 'other', place_id: null };
  const typedReadiness = f.businessName.trim() ? leadReadiness(typed, { countrySettings }) : null;
  const canFill = /\./.test(f.website) && !/\s/.test(f.website.trim()) && fill.kind !== 'busy' && !busy;

  const fillFromWebsite = async () => {
    if (!canFill) return;
    setFill({ kind: 'busy' });
    try {
      const r = await invokeEdge<FillResult>('lead-from-website', { website: f.website.trim() });
      if (!r.ok) {
        setFill({ kind: 'done', tone: 'amber', line: r.error === 'not_own_website'
          ? 'That is a social or directory page, not the business’s own website. Paste their own site, or type the details.'
          : 'That does not look like a website address. Check it, or type the details.' });
        return;
      }
      if (r.blocked) { setFill({ kind: 'done', tone: 'amber', line: BLOCKED_LINE, blocked: true }); return; }
      if (r.unreadable) { setFill({ kind: 'done', tone: 'amber', line: UNREADABLE_LINE }); return; }
      /* The form as it is NOW (the person may have typed while the site was read): only its blanks are filled. */
      const p = fRef.current;
      const { next, filled } = fillBlanks(p, r.facts ?? {});
      const filledCount = filled.length;
      const c = countryFromPhone(r.facts?.phone);
      if (c && !countryTouched && !p.phone.trim()) next.country = c;
      setF(next);
      if (filled.some((k) => k === 'email' || k === 'address' || k === 'services' || k === 'areas')) setMore(true);
      const titleOnly = r.facts?.nameSource === 'title' ? ' The name came from the page title, so check it.' : '';
      setFill(filledCount
        ? { kind: 'done', tone: 'ok', line: `Filled ${filledCount} field${filledCount === 1 ? '' : 's'} from ${r.pagesRead ?? 1} page${(r.pagesRead ?? 1) === 1 ? '' : 's'} of the site. Blanks stay blank where the site does not say.${titleOnly}` }
        : { kind: 'done', tone: 'amber', line: NOTHING_FOUND_LINE });
    } catch (e) {
      setFill({ kind: 'done', tone: 'amber', line: edgeErrorMessage(e, 'The website could not be read just now. Type the details, or try again.') });
    }
  };

  const submit = async (confirmSiteMatch = false) => {
    setRefusal(null); setSiteMatch(null);
    const mapsUrl = phoneBoxIsMaps ? f.phone.trim() : f.mapsUrl;
    /* A non-UK typed number is stored the way Google stores one ("+61 412 345 678"); one that is not a
       valid number there is refused here rather than saved in a form the WhatsApp paths cannot place. */
    let phone = phoneBoxIsMaps ? '' : f.phone;
    if (f.country !== 'UK' && phone.trim()) {
      const intl = internationalPhone(phone, f.country);
      if (!intl) {
        const example = ADD_COUNTRIES.find((c) => c.value === f.country)?.example ?? '+61 412 345 678';
        setRefusal(`That phone number is not a valid ${f.country} number. Check it, or type it with its country code (e.g. ${example}). The country is under More details.`);
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
          google_maps_url: mapsUrl, lead_source: f.source, campaign_id: f.campaignId || null,
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
      /* The site blocked our reader: the lead's own website check stores that as a website finding (best effort —
         the lead is added either way, and the check runs again whenever the lead is audited or called). */
      if (fill.kind === 'done' && fill.blocked && f.website.trim()) {
        void invokeEdge('crawl-check', { lead_id: id, requested_from: 'add_lead' }).catch(() => {});
      }
      toast({ title: 'Lead added', description: `${f.businessName} is in your Outreach list.` });
      notifyLeadChanged(id); // Outreach reads the new row in from the server
      onAdded?.(id);
      setF(EMPTY); setSiteMatch(null); setFill({ kind: 'idle' }); setMore(false); setCountryTouched(false);
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  const field = 'h-9 text-sm';
  const label = 'mb-1 block text-[11px] font-medium text-muted-foreground';
  const countryHint = ADD_COUNTRIES.find((c) => c.value === f.country)?.phoneHint ?? '';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) { setRefusal(null); setSiteMatch(null); } } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHero icon={UserPlus} tone="blue" title="Add a lead you found"
          subtitle="Paste their website to fill it in. It goes into your Outreach list; a business already in the book is not added twice." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Website</label>
            <div className="flex gap-2">
              <Input className={field} value={f.website} onChange={set('website')} placeholder="e.g. acmeplumbing.co.uk" inputMode="url"
                data-testid="add-lead-website" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fillFromWebsite(); } }} />
              <Button type="button" variant="outline" className="h-9 shrink-0 text-xs" disabled={!canFill} onClick={() => void fillFromWebsite()} data-testid="add-lead-fill">
                {fill.kind === 'busy' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Globe className="mr-1.5 h-4 w-4" />}Fill from website
              </Button>
            </div>
            {fill.kind === 'busy' && <p className="mt-1 text-[11px] text-muted-foreground">Reading the site — about 10 to 20 seconds.</p>}
            {fill.kind === 'done' && (
              <p className={`mt-1 text-[11px] ${fill.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`} data-testid="add-lead-fill-result">{fill.line}</p>
            )}
          </div>
          <div className="sm:col-span-2"><label className={label}>Business name *</label><Input className={field} value={f.businessName} onChange={set('businessName')} data-testid="add-lead-name" /></div>
          <div><label className={label}>Trade *</label><Input className={field} value={f.trade} onChange={set('trade')} placeholder="e.g. plumber" data-testid="add-lead-trade" /></div>
          <div><label className={label}>Town</label><Input className={field} value={f.town} onChange={set('town')} data-testid="add-lead-town" /></div>
          <div><label className={label}>Phone or Google Maps link *</label><Input className={field} value={f.phone} onChange={set('phone')} placeholder={countryHint} data-testid="add-lead-phone" /></div>
          <div>
            <label className={label}>Where did you find them? *</label>
            <Select value={f.source} onValueChange={(v) => setF((p) => ({ ...p, source: v }))}>
              <SelectTrigger className={field}><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <button type="button" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setMore((m) => !m)} aria-expanded={more} data-testid="add-lead-more">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? 'rotate-180' : ''}`} />More details{f.country !== 'UK' ? ` (${f.country})` : ''}
            </button>
          </div>
          {more && <>
            <div>
              <label className={label}>Country</label>
              <Select value={f.country} onValueChange={(v) => { setCountryTouched(true); setF((p) => ({ ...p, country: v })); }}>
                <SelectTrigger className={field} data-testid="add-lead-country"><SelectValue /></SelectTrigger>
                <SelectContent>{ADD_COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className={label}>Contact name</label><Input className={field} value={f.contactName} onChange={set('contactName')} placeholder="Only if you know it" /></div>
            <div><label className={label}>Email</label><Input className={field} value={f.email} onChange={set('email')} inputMode="email" /></div>
            <div><label className={label}>Address</label><Input className={field} value={f.address} onChange={set('address')} /></div>
            {!phoneBoxIsMaps && <div className="sm:col-span-2"><label className={label}>Google Maps link (as well as the phone)</label><Input className={field} value={f.mapsUrl} onChange={set('mapsUrl')} /></div>}
            <div className="sm:col-span-2"><label className={label}>Main services (comma separated, only what you know)</label><Input className={field} value={f.services} onChange={set('services')} placeholder="e.g. boiler repair, bathroom fitting" /></div>
            <div><label className={label}>Service areas</label><Input className={field} value={f.areas} onChange={set('areas')} placeholder="e.g. Wakefield, Ossett" /></div>
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
          </>}
        </div>
        {siteMatch && (
          <Callout tone="amber" icon={AlertTriangle} testId="add-lead-site-match">
            <p>{siteMatch}</p>
            <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" disabled={busy} onClick={() => void submit(true)}>It's a different branch — add it</Button>
          </Callout>
        )}
        {typedReadiness && (typedReadiness.ok
          ? <p className="text-xs text-emerald-700 dark:text-emerald-400" data-testid="add-lead-readiness">Ready for an AI audit and a message.</p>
          : (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs" data-testid="add-lead-readiness">
              <p className="font-medium">This lead will still need:</p>
              <ul className="mt-0.5 list-disc pl-4">{readinessLines(typedReadiness).filter((l) => !/^Report offer/.test(l)).map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          ))}
        {refusal && <Callout tone="amber" icon={AlertTriangle} testId="add-lead-refusal">{refusal}</Callout>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit(false)} disabled={!ready || busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Add lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
