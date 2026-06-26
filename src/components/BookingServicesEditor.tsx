import { useMemo, useState } from 'react';
import { ScanLine, Loader2, Plus, Trash2, Save, Check, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead, ConfirmedService } from '@/types/outreach';

interface ScanResult {
  found: boolean;
  cached: boolean;
  services: ConfirmedService[];
  source_urls: string[];
  cost_usd: number;
}

/** Trim + drop blank-name rows; price/duration optional. */
function clean(rows: ConfirmedService[]): ConfirmedService[] {
  return rows
    .map((r) => {
      const out: ConfirmedService = { name: (r.name ?? '').trim() };
      if (r.price && r.price.trim()) out.price = r.price.trim();
      if (typeof r.durationMins === 'number' && r.durationMins > 0) out.durationMins = Math.round(r.durationMins);
      return out;
    })
    .filter((r) => r.name.length > 0);
}

function eq(a: ConfirmedService[], b: ConfirmedService[]): boolean {
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}

/**
 * PHASE 3b — booking-page services editor.
 *
 * The operator's services-customization section for a booking page. Pre-fills from
 * the lead's confirmed_services (or its existing service names), is fully editable,
 * and has a "Scan website" button that extracts services + prices from the barber's
 * own site. SAFETY: a scan never silently overwrites — it opens a review step where
 * the operator can edit/remove/fix scanned prices, and only an explicit "Replace"
 * swaps the rows. Saving persists confirmed_services to the lead; generate-barber-site
 * (booking_only) then uses them. A wrong scraped price can never reach a live page
 * unseen. Services stay editable here and later in the live editor.
 */
export function BookingServicesEditor({
  lead,
  onUpdate,
}: {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown> | void;
}) {
  const { toast } = useToast();

  const saved = useMemo<ConfirmedService[]>(() => {
    if (Array.isArray(lead.confirmed_services) && lead.confirmed_services.length) {
      return lead.confirmed_services.map((s) => ({ name: s.name, price: s.price, durationMins: s.durationMins }));
    }
    if (Array.isArray(lead.services_included) && lead.services_included.length) {
      return lead.services_included.map((n) => ({ name: n }));
    }
    return [];
  }, [lead.confirmed_services, lead.services_included]);

  const [rows, setRows] = useState<ConfirmedService[]>(saved);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ConfirmedService[]>([]);
  const [scanMeta, setScanMeta] = useState<{ urls: string[]; cached: boolean } | null>(null);

  const dirty = !eq(rows, saved);
  const hasWebsite = !!(lead.website && lead.website.trim());

  const setRow = (i: number, patch: Partial<ConfirmedService>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const next = clean(rows);
      await onUpdate(lead.id, { confirmed_services: next.length ? next : null });
      setRows(next);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      toast({ title: 'Services saved', description: next.length ? `${next.length} service${next.length === 1 ? '' : 's'} will pre-fill the booking page.` : 'Cleared — booking page falls back to defaults.' });
    } catch (e) {
      toast({ title: "Couldn't save", description: (e as Error)?.message ?? 'Save failed.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-services', {
        body: { lead_id: lead.id, place_id: lead.place_id ?? null, business_name: lead.business_name ?? null, website: lead.website ?? null },
      });
      if (error) throw error;
      if (data?.limit_reached) {
        toast({ title: 'Daily limit reached', description: data.error ?? 'Try again tomorrow.', variant: 'destructive' });
        return;
      }
      if (!data?.success) {
        toast({ title: "Couldn't scan", description: data?.error ?? 'Scan failed.', variant: 'destructive' });
        return;
      }
      const result = data as ScanResult;
      if (!result.found || !result.services.length) {
        // Nothing found → leave existing services untouched.
        toast({ title: 'Nothing found', description: 'No services/prices on the site — your services are unchanged.' });
        return;
      }
      setScanned(result.services.map((s) => ({ name: s.name, price: s.price, durationMins: s.durationMins })));
      setScanMeta({ urls: result.source_urls ?? [], cached: result.cached });
      setReviewOpen(true); // review-before-overwrite
    } catch (e) {
      toast({ title: "Couldn't scan", description: (e as Error)?.message ?? 'Scan failed.', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const setScannedRow = (i: number, patch: Partial<ConfirmedService>) =>
    setScanned((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeScannedRow = (i: number) => setScanned((rs) => rs.filter((_, idx) => idx !== i));

  const applyScanned = () => {
    const next = clean(scanned);
    setRows(next); // REPLACE the current/example services (not yet saved — operator still confirms via Save)
    setReviewOpen(false);
    toast({ title: 'Services replaced', description: 'Review them below, then Save to apply to the booking page.' });
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Booking page services</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={scan}
          disabled={scanning || !hasWebsite}
          title={hasWebsite ? 'Read their website and extract services + prices' : 'This lead has no website'}
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
          {scanning ? 'Scanning…' : 'Scan website'}
        </Button>
      </div>

      <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
        Pre-fills the booking page. Scanned prices are shown for you to check first — nothing goes live until you Save.
      </p>

      {rows.length === 0 ? (
        <p className="mb-2.5 rounded-md border border-dashed border-border/50 px-2.5 py-3 text-center text-xs text-muted-foreground/50">
          No services yet — Scan the website or add them by hand. The booking page falls back to generic examples until you save some.
        </p>
      ) : (
        <ul className="mb-2.5 space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Service" className="h-7 flex-1 text-xs" />
              <Input value={r.price ?? ''} onChange={(e) => setRow(i, { price: e.target.value })} placeholder="£" className="h-7 w-16 text-xs" />
              <Input
                value={r.durationMins?.toString() ?? ''}
                onChange={(e) => setRow(i, { durationMins: e.target.value ? parseInt(e.target.value, 10) || undefined : undefined })}
                placeholder="min" inputMode="numeric" className="h-7 w-14 text-xs"
              />
              <button onClick={() => removeRow(i)} className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add service
        </Button>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : justSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {justSaved ? 'Saved' : 'Save'}
        </Button>
      </div>

      {/* Review-before-overwrite: edit scanned services, then explicitly Replace. */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4 text-violet-400" /> Review scanned services
            </DialogTitle>
            <DialogDescription className="text-xs">
              Check these against the real site — fix any wrong price, remove junk, add a missing one. They replace your current list only when you click Replace.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[46vh] space-y-1.5 overflow-y-auto thin-scrollbar pr-1">
            {scanned.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input value={r.name} onChange={(e) => setScannedRow(i, { name: e.target.value })} placeholder="Service" className="h-7 flex-1 text-xs" />
                <Input value={r.price ?? ''} onChange={(e) => setScannedRow(i, { price: e.target.value })} placeholder="£" className="h-7 w-16 text-xs" />
                <Input
                  value={r.durationMins?.toString() ?? ''}
                  onChange={(e) => setScannedRow(i, { durationMins: e.target.value ? parseInt(e.target.value, 10) || undefined : undefined })}
                  placeholder="min" inputMode="numeric" className="h-7 w-14 text-xs"
                />
                <button onClick={() => removeScannedRow(i)} className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {scanned.length === 0 && <p className="text-xs text-muted-foreground/50">All removed — nothing to apply.</p>}
          </div>

          {scanMeta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/50">
              {scanMeta.cached && <span className="rounded bg-muted/50 px-1 py-0.5">cached</span>}
              {scanMeta.urls.map((u) => (
                <span key={u} className="truncate">{u.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={applyScanned} disabled={clean(scanned).length === 0}>
              Replace {clean(scanned).length} service{clean(scanned).length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
