import { useState } from 'react';
import { ScanLine, Loader2, ExternalLink, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

interface ScannedService {
  name: string;
  price?: string;
  durationMins?: number;
}

interface ScanResult {
  found: boolean;
  cached: boolean;
  services: ScannedService[];
  source_urls: string[];
  cost_usd: number;
}

/**
 * PHASE 3a MEASUREMENT ONLY — operator tool.
 *
 * Calls scan-services and DISPLAYS what the model extracted from the lead's own
 * website (services + prices, or "nothing found"). It is purely for eyeballing
 * the real extraction hit rate across leads. There is NO confirm, NO auto-fill,
 * and it is NOT wired into generate or the booking page. Nothing here publishes.
 */
export function WebsiteServicesScan({ lead }: { lead: OutreachLead }) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const hasWebsite = !!(lead.website && lead.website.trim());

  const scan = async () => {
    setScanning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('scan-services', {
        body: {
          lead_id: lead.id,
          place_id: lead.place_id ?? null,
          business_name: lead.business_name ?? null,
          website: lead.website ?? null,
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
      setResult(data as ScanResult);
    } catch (e) {
      toast({ title: "Couldn't scan", description: (e as Error)?.message ?? 'Scan failed.', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ScanLine className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Website services scan</span>
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

      {/* Read-only measurement note — this never publishes or auto-fills anything. */}
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground/70">
        Measurement only — reads their own site and shows what it found. Nothing is saved or applied.
      </p>

      {!hasWebsite && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <Ban className="h-3.5 w-3.5" /> No website on this lead.
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {result.found ? (
            <ul className="divide-y divide-border/40 rounded-md border border-border/40 bg-background/40">
              {result.services.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-xs text-foreground/80">
                    {s.name}
                    {s.durationMins ? <span className="ml-1.5 text-[10px] text-muted-foreground/50">{s.durationMins}m</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-foreground/70">{s.price ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground/60">
              Nothing found — no services or prices were literally present on the page.
            </p>
          )}

          {/* Provenance + cost so you can judge the hit rate honestly. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/50">
            {result.found && <span>{result.services.length} found · {result.services.filter((s) => s.price).length} with price</span>}
            {result.cached && <span className="rounded bg-muted/50 px-1 py-0.5">cached</span>}
            {!result.cached && <span>${result.cost_usd.toFixed(4)}</span>}
            {result.source_urls?.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground/70">
                <ExternalLink className="h-2.5 w-2.5" /> {u.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
