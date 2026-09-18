import { useEffect, useState, type ReactNode } from 'react';
import { ScanSearch, Loader2, Copy, Check, AlertTriangle, CircleCheck, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isAggregatorUrl } from '@/lib/aggregators';
import { buildFaultLines, type CrawlSignals, type CrawlFault } from '@/lib/crawlCheck';
import type { SiteInfo } from '@/lib/siteInfo';
import { siteInfoHasAnything } from '@/lib/siteInfo';
import type { CrawlRow } from '@/lib/crawlResult';

/** The minimal lead shape the crawl button/dialog need — an id to crawl by and a website to gate on.
 *  Both the Outreach row (OutreachLead) and the Inbox thread (its lead-lite) satisfy it. */
type CrawlLead = { id: string; website?: string | null };

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWL CHECK — the button + popup (Paul, 2026-09-16, extended 2026-09-17). Runs the
   `crawl-check` edge function (fetches only, £0 — never the Apify SEO scanner) once and stores the
   result on lead_crawl_checks. ONE code path, three entry points:
     (a) CrawlCheckButton   — on a lead, in the Inbox header AND the Outreach row. Not run → runs it;
         already run → opens the popup on the stored result; no website → disabled.
     (b) CrawlCheckUrlButton — a paste-a-URL box, for a site sent before it's a lead (no storage).

   ⛔ THE POPUP HAS TWO SEPARATE SECTIONS AND THEY MUST NOT LEAK INTO EACH OTHER:
     1. AI VISIBILITY — buildFaultLines(signals), the report's exact wording. THIS is what decides
        whether audit_followup_fault is available. The button's dot reflects ONLY this.
     2. SITE INFO — everything else in the same HTML (who built it, directories, contact, …), reading
        material for before a conversation. Its presence NEVER changes the button or the template.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

interface Verdict { ok: boolean; headline: string; problems: string[] }
interface Result {
  ok: boolean; url?: string; verdict?: Verdict;
  signals?: CrawlSignals; siteInfo?: SiteInfo | null;
  fetches?: number; ms?: number; error?: string; checked_at?: string;
}

/** Seed the popup's display state from a stored crawl row (so "already run" shows instantly). */
function resultFromRow(row: CrawlRow | null | undefined): Result | null {
  if (!row?.result?.signals) return null;
  return {
    ok: true, url: row.result.url,
    verdict: row.result.verdict, signals: row.result.signals, siteInfo: row.result.siteInfo ?? null, checked_at: row.result.checked_at ?? row.created_at,
  };
}

function CopyIcon({ text }: { text: string }) {
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

/* ── SITE INFO rendering ────────────────────────────────────────────────────────────────────────── */

function InfoRow({ label, children, missing }: { label: string; children?: ReactNode; missing?: boolean }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={missing ? 'text-muted-foreground/50 italic' : 'flex-1 break-words'}>
        {missing ? 'Not found' : children}
      </span>
    </div>
  );
}

function SiteInfoView({ info }: { info: SiteInfo | null | undefined }) {
  if (!info) {
    return <p className="text-sm text-muted-foreground/70 italic">Site info wasn&rsquo;t captured on this check — run again to read it.</p>;
  }
  if (!siteInfoHasAnything(info)) {
    return <p className="text-sm text-muted-foreground/70 italic">Nothing readable found on the page.</p>;
  }
  const built = info.builtBy;
  const builtMissing = !built.credit && !built.platform && built.footerLinks.length === 0;
  return (
    <div className="divide-y divide-border/50">
      {/* The two Paul reads first. */}
      <InfoRow label="Who built it" missing={builtMissing}>
        {!builtMissing && (
          <span className="space-y-0.5">
            {built.credit && <span className="block">{built.credit}</span>}
            {built.platform && <span className="block text-muted-foreground">Platform: {built.platform}</span>}
            {built.footerLinks.length > 0 && (
              <span className="block text-muted-foreground">Footer links: {built.footerLinks.join(', ')}</span>
            )}
          </span>
        )}
      </InfoRow>
      <InfoRow label="Directories" missing={info.directories.length === 0}>
        {info.directories.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {info.directories.map((d) => (
              <span key={d} className={`rounded-full px-2 py-0.5 text-xs ${d === 'Yell' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold' : 'bg-muted text-foreground/80'}`}>{d}</span>
            ))}
          </span>
        )}
      </InfoRow>

      <InfoRow label="Email" missing={!info.email}>{info.email}</InfoRow>
      <InfoRow label="Phone" missing={!info.phone}>{info.phone}</InfoRow>
      <InfoRow label="Address" missing={!info.address}>{info.address}</InfoRow>
      <InfoRow label="Opening hours" missing={!info.openingHours?.length}>
        {info.openingHours?.join(' · ')}
      </InfoRow>
      <InfoRow label="Company no." missing={!info.companyNumber}>{info.companyNumber}</InfoRow>
      <InfoRow label="Social" missing={info.socialLinks.length === 0}>
        {info.socialLinks.length > 0 && (
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {info.socialLinks.map((s) => (
              <a key={s.platform} href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{s.platform}</a>
            ))}
          </span>
        )}
      </InfoRow>
      <InfoRow label="Services" missing={info.services.length === 0}>
        {info.services.length > 0 && info.services.join(', ')}
      </InfoRow>
      <InfoRow label="Towns" missing={info.towns.length === 0}>
        {info.towns.length > 0 && info.towns.join(', ')}
      </InfoRow>
      <InfoRow label="Copyright yr" missing={!info.staleness.copyrightYear}>{info.staleness.copyrightYear}</InfoRow>
      <InfoRow label="Latest date" missing={!info.staleness.lastDatePublished}>{info.staleness.lastDatePublished}</InfoRow>
    </div>
  );
}

/* ── the dialog ─────────────────────────────────────────────────────────────────────────────────── */

function CrawlCheckDialog(
  { open, onOpenChange, lead, initialCrawl, urlMode, onDone, onRunningChange, onErrorChange }:
  { open: boolean; onOpenChange: (o: boolean) => void; lead?: CrawlLead; initialCrawl?: CrawlRow | null; urlMode?: boolean; onDone?: () => void; onRunningChange?: (running: boolean) => void; onErrorChange?: (failed: boolean) => void },
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [url, setUrl] = useState('');

  const run = async (body: { lead_id?: string; url?: string; town?: string }) => {
    setRunning(true); onRunningChange?.(true); setResult(null); onErrorChange?.(false);
    try {
      const { data, error } = await supabase.functions.invoke('crawl-check', { body });
      if (error) throw new Error(error.message);
      const next = data as Result;
      if (!next?.ok) throw new Error(next?.error || 'check failed');
      setResult(next);
      if (body.lead_id) {
        // Inbox intentionally has a five-minute cache; invalidate it so returning to a
        // conversation immediately re-reads this manual crawl for audit_followup_fault.
        void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      }
      if (body.lead_id) onDone?.();     // stored → let the parent refresh the button state
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'check failed' });
      onErrorChange?.(true);
    } finally {
      setRunning(false);
      onRunningChange?.(false);
    }
  };

  /* On open: show the STORED result if there is one (already run → open the popup), otherwise run it
     (not run yet → run the crawl). Reset when closed. */
  useEffect(() => {
    if (!open) { setResult(null); setUrl(''); setRunning(false); return; }
    if (urlMode) return;
    const stored = resultFromRow(initialCrawl);
    if (stored) setResult(stored);
    else if (lead && !running) void run({ lead_id: lead.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const faults: CrawlFault[] = result?.signals ? buildFaultLines(result.signals) : [];
  const fetchFailed = result?.signals?.fetchFailed === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4" /> Crawl check
            <span className="text-xs font-normal text-muted-foreground">free · what AI sees</span>
            {lead && !urlMode && (
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" disabled={running}
                onClick={() => void run({ lead_id: lead.id })}>
                {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                Run again
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {urlMode && (
          <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) void run({ url: url.trim() }); }} className="flex gap-2">
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
          <div className="space-y-5">
            {result.error && <p className="text-sm text-destructive">{result.error}</p>}

            {result.signals && (
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{fetchFailed ? 'Could not read website' : 'Crawl complete'}</span>
                {result.signals.pagesChecked != null && ` · ${result.signals.pagesChecked} pages checked`}
                {result.checked_at && ` · ${new Date(result.checked_at).toLocaleString()}`}
              </div>
            )}

            {/* ── SECTION 1: AI VISIBILITY (the faults — this feeds audit_followup_fault) ── */}
            {result.signals && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> AI visibility
                </h3>
                {fetchFailed ? (
                  <p className="text-sm text-muted-foreground">Couldn&rsquo;t read the site — it may be down or blocking automated requests.</p>
                ) : faults.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <CircleCheck className="h-4 w-4" /> No AI-visibility faults found.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {faults.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${f.minor ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className="flex-1">
                          <span className="font-medium">{f.title}. </span>
                          <span className="text-muted-foreground">{f.detail}</span>
                        </span>
                        <CopyIcon text={f.detail} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── SECTION 2: SITE INFO (reading material — never gates a template) ── */}
            {result.signals && !fetchFailed && (
              <p className={`text-xs ${faults.length ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {faults.length
                  ? 'Usable for audit_followup_fault — the first finding is the client-facing fault.'
                  : 'Not usable for audit_followup_fault — this crawl found no meaningful fault.'}
              </p>
            )}

            {!urlMode && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Site info</h3>
                <SiteInfoView info={result.siteInfo} />
              </section>
            )}

            {result.signals?.checkedPages && result.signals.checkedPages.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pages checked</h3>
                <ul className="space-y-1 text-xs">
                  {result.signals.checkedPages.map((page) => (
                    <li key={page.url} className="flex items-start justify-between gap-3 rounded border border-border/50 px-2 py-1.5">
                      <a href={page.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary hover:underline">{page.url}</a>
                      <span className="shrink-0 text-muted-foreground">{page.kind} · {page.readable ? page.words + ' words' : 'unreadable'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-[11px] text-muted-foreground">
              {result.url}{result.fetches != null ? ` · ${result.fetches} fetches` : ''}{result.ms != null ? ` · ${(result.ms / 1000).toFixed(1)}s` : ''}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── (a) the per-lead button — Inbox header + Outreach row ──────────────────────────────────────── */

/** Crawl-site button for a lead. `crawl` is that lead's newest stored crawl row (from the caller's
 *  map), or null/undefined when it hasn't been run. The dot reflects ONLY an AI-visibility fault.
 *  `onDone` refetches the caller's crawl data after a run so the button restyles. */
export function CrawlCheckButton(
  { lead, crawl, onDone, className, iconOnly = false }:
  { lead: CrawlLead; crawl?: CrawlRow | null; onDone?: () => void; className?: string; iconOnly?: boolean },
) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasRealSite = !!lead.website?.trim() && !isAggregatorUrl(lead.website);
  const ran = !!crawl?.result?.signals;
  const crawlFailed = crawl?.result?.signals?.fetchFailed === true;
  const faults = ran ? buildFaultLines(crawl!.result!.signals!) : [];
  const faulted = faults.length > 0;

  const base = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors';

  if (!hasRealSite) {
    return (
      <button type="button" disabled title="No website to crawl."
        className={`${base} cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground/50 ${className ?? ''}`}>
        <ScanSearch className="h-3 w-3" /> Crawl site
      </button>
    );
  }

  const tone = !ran
    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
    : faulted
      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20';
  if (iconOnly) {
    const iconTitle = running ? 'Crawling website…' : failed || crawlFailed ? 'Crawl failed — click to retry' : ran ? 'View crawl result' : 'Crawl website';
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} disabled={running} title={iconTitle} aria-label={iconTitle}
          className={`${className ?? ''} ${failed || crawlFailed ? 'text-destructive hover:text-destructive' : faulted ? 'text-red-500 hover:text-red-500' : ran ? 'text-emerald-600 hover:text-emerald-600 dark:text-emerald-400' : ''}`}>
          {running ? <ScanSearch className="h-4 w-4 animate-spin" /> : failed || crawlFailed ? <AlertTriangle className="h-4 w-4" /> : <ScanSearch className="h-4 w-4" />}
        </button>
        <CrawlCheckDialog open={open} onOpenChange={setOpen} lead={lead} initialCrawl={crawl} onDone={onDone} onRunningChange={setRunning} onErrorChange={setFailed} />
      </>
    );
  }

  const title = !ran
    ? 'Not checked yet — click to crawl the site (free)'
    : faulted
      ? `AI-visibility fault found — click to view (${faults.length})`
      : 'Checked — no AI-visibility fault. Click to view what the site says.';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} className={`${base} ${tone} ${className ?? ''}`}>
        <ScanSearch className="h-3 w-3" /> Crawl site
        {ran && (faulted
          ? <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />
          : <CircleCheck className="ml-0.5 h-3 w-3" />)}
      </button>
      <CrawlCheckDialog open={open} onOpenChange={setOpen} lead={lead} initialCrawl={crawl} onDone={onDone} onRunningChange={setRunning} onErrorChange={setFailed} />
    </>
  );
}

/* ── (b) paste a URL — for a site sent before it's a lead ───────────────────────────────────────── */

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
