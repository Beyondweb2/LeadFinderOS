import { useState } from 'react';
import { ScanSearch, Loader2, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isAggregatorUrl } from '@/lib/aggregators';
import type { OutreachLead } from '@/types/outreach';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWLABILITY CHECK — the UI (Paul, 2026-09-16). Runs the `crawl-check` edge function (fetches
   only, £0 — never the Apify SEO scanner) and shows a paste-ready verdict naming the prospect's
   actual problem, so the outreach message can be specific.
   Two entry points, one dialog:
     (a) CrawlCheckButton  — on the lead, checks lead.website. What Paul runs on every prospect.
     (b) CrawlCheckUrlButton — a paste-a-URL box, for a site sent to him before it's a lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

interface Verdict { ok: boolean; headline: string; problems: string[] }
interface Result { ok: boolean; url?: string; verdict?: Verdict; fetches?: number; ms?: number; error?: string }

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
        catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
      }}
      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
      title="Copy this line"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CrawlCheckDialog(
  { open, onOpenChange, lead, urlMode }:
  { open: boolean; onOpenChange: (o: boolean) => void; lead?: OutreachLead; urlMode?: boolean },
) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [url, setUrl] = useState('');

  const run = async (body: { lead_id?: string; url?: string; town?: string }) => {
    setRunning(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('crawl-check', { body });
      if (error) throw new Error(error.message);
      setResult(data as Result);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'check failed' });
    } finally {
      setRunning(false);
    }
  };

  // In lead mode, kick the check off as the dialog opens.
  const onOpen = (o: boolean) => {
    onOpenChange(o);
    if (o && lead && !result && !running) void run({ lead_id: lead.id });
    if (!o) { setResult(null); setUrl(''); }
  };

  const problems = result?.verdict?.problems ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4" /> Crawlability check
            <span className="text-xs font-normal text-muted-foreground">free · what AI sees</span>
          </DialogTitle>
        </DialogHeader>

        {urlMode && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (url.trim()) void run({ url: url.trim() }); }}
            className="flex gap-2"
          >
            <Input placeholder="example.co.uk" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            <Button type="submit" disabled={running || !url.trim()}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
            </Button>
          </form>
        )}

        {running && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching the site as a crawler…
          </div>
        )}

        {result && !running && (
          <div className="space-y-3 text-sm">
            {result.error && <p className="text-destructive">{result.error}</p>}
            {result.verdict && (
              <>
                <p className="font-semibold leading-snug">{result.verdict.headline}</p>
                {problems.length > 1 && (
                  <ul className="space-y-2">
                    {problems.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                        <span className="flex-1">{p}</span>
                        <CopyLine text={p} />
                      </li>
                    ))}
                  </ul>
                )}
                {problems.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="secondary" onClick={async () => {
                      try { await navigator.clipboard.writeText(result.verdict!.headline); toast({ title: 'Copied the headline' }); }
                      catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
                    }}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy the main problem
                    </Button>
                  </div>
                )}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {result.url}{result.fetches != null ? ` · ${result.fetches} fetches` : ''}{result.ms != null ? ` · ${(result.ms / 1000).toFixed(1)}s` : ''}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** (a) On the lead — checks lead.website. Shown whenever the lead has a real (non-aggregator) site;
 *  Paul runs it on a prospect BEFORE messaging, so it is NOT gated on engagement like the paid scan. */
export function CrawlCheckButton({ lead }: { lead: OutreachLead }) {
  const [open, setOpen] = useState(false);
  const hasRealSite = !!lead.website?.trim() && !isAggregatorUrl(lead.website);
  if (!hasRealSite) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
        title="Fetch their site as a crawler and name the crawlability problem for your message (free)"
      >
        <ScanSearch className="h-3 w-3" /> Crawl check
      </button>
      <CrawlCheckDialog open={open} onOpenChange={setOpen} lead={lead} />
    </>
  );
}

/** (b) Paste a URL — for a site sent to Paul before it's a lead. */
export function CrawlCheckUrlButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Crawl check
      </Button>
      <CrawlCheckDialog open={open} onOpenChange={setOpen} urlMode />
    </>
  );
}
