import { useState } from 'react';
import { ScanLine, Loader2, Trash2 } from 'lucide-react';
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
import type { ConfirmedService } from '@/types/outreach';

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

export interface ServiceScanContext {
  website: string;
  placeId?: string | null;
  businessName?: string | null;
  leadId?: string | null;
}

/**
 * The "Scan website" button + its review-before-overwrite dialog, extracted from
 * BookingServicesEditor so the same flow can live in the site editor. The scan
 * calls scan-services (extracts services + prices from the business's own site),
 * opens a review step where the operator can edit/fix/remove rows, and only an
 * explicit "Replace" hands the chosen services back via onApply — nothing is ever
 * applied silently. The host decides what to do with the result (here: load them
 * into the site editor's Services list, saved via "Save all changes").
 */
export function ServiceScanButton({
  context,
  onApply,
  disabled,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  context: ServiceScanContext;
  onApply: (services: ConfirmedService[]) => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
  className?: string;
}) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scanned, setScanned] = useState<ConfirmedService[]>([]);
  const [scanMeta, setScanMeta] = useState<{ urls: string[]; cached: boolean } | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-services', {
        body: {
          lead_id: context.leadId ?? null,
          place_id: context.placeId ?? null,
          business_name: context.businessName ?? null,
          website: context.website ?? null,
        },
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
    onApply(clean(scanned)); // REPLACE — host loads these into its list (not yet saved)
    setReviewOpen(false);
    toast({ title: 'Services replaced', description: 'Review them below, then Save to apply.' });
  };

  const hasWebsite = !!(context.website && context.website.trim());

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className ?? 'h-8 gap-1.5 text-xs'}
        onClick={scan}
        disabled={disabled || scanning || !hasWebsite}
        title={hasWebsite ? 'Read their website and extract services + prices' : 'This lead has no website'}
      >
        {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
        {scanning ? 'Scanning…' : 'Scan website'}
      </Button>

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
                <Input value={r.name} onChange={(e) => setScannedRow(i, { name: e.target.value })} placeholder="Service" className="h-7 min-w-0 flex-1 text-xs" />
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
    </>
  );
}
