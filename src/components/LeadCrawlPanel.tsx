import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { isAggregatorUrl } from '@/lib/aggregators';
import type { CrawlRequestSource, FullCrawlEvidence } from '@/lib/fullCrawl';
import type { LeadCrawlSummary } from '@/lib/leadCrawlSummary';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE EVIDENCE — the lead's latest crawl, and the Crawl site / Re-crawl site button.

   ⛔ THE BUTTON IS THE CANONICAL FULL MANUAL CRAWL. It calls crawl-check with the lead id and
   `mode: "full"` — the same call the Outreach row, the Inbox header and the lead popup make — so the
   result lands on the ONE lead_crawl_checks row every screen reads. The screen is recorded
   (`requested_from`) and decides nothing.
   ⛔ OPENING THIS PANEL CRAWLS NOTHING. The crawl runs only when the button is pressed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export async function runFullLeadCrawl(leadId: string, from: CrawlRequestSource) {
  return invokeEdge<Record<string, any>>('crawl-check', { lead_id: leadId, mode: 'full', requested_from: from });
}

export function LeadCrawlPanel({ leadId, website, summary, from, onDone }: {
  leadId: string; website: string | null | undefined; summary: LeadCrawlSummary; from: CrawlRequestSource; onDone: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const site = (website ?? '').trim();
  const crawlable = !!site && !isAggregatorUrl(site);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const res = await runFullLeadCrawl(leadId, from);
      if (res.stored === false) throw new Error('The crawl ran but could not be saved to this lead. Try again.');
      /* Every screen's copy of the crawl rows is refreshed, so Outreach and the Inbox show it too. */
      void queryClient.invalidateQueries({ queryKey: ['lead-crawls'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      const f = res.full as { completeness?: string; stats?: { pagesFetched?: number; urlsDiscovered?: number } } | null;
      toast({
        title: f?.completeness === 'partial' ? 'Crawl finished — partial' : 'Crawl complete',
        description: f?.stats ? `${f.stats.pagesFetched} page(s) read of ${f.stats.urlsDiscovered} found. Saved to this lead.` : 'Saved to this lead.',
      });
      await onDone();
    } catch (e) {
      const msg = edgeErrorMessage(e, 'The crawl failed');
      setError(msg);
      toast({ title: 'Crawl failed', description: msg, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  const tone = summary.status === 'failed' ? 'text-destructive' : summary.status === 'partial' ? 'text-amber-700 dark:text-amber-300' : summary.status === 'complete' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground';
  return <div className="space-y-2 text-sm">
    <div className="grid gap-2 sm:grid-cols-2">
      <div><div className="text-xs text-muted-foreground">Website</div><div className="break-all">{site || 'No website recorded'}</div></div>
      <div><div className="text-xs text-muted-foreground">Latest crawl</div><div>{summary.crawledAt ? new Date(summary.crawledAt).toLocaleString('en-GB') : '—'}</div></div>
    </div>
    <p className={`flex items-start gap-1.5 ${tone}`} aria-live="polite">
      {running ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : summary.status === 'complete' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : summary.status === 'none' ? <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{running ? 'Crawling the whole site — this can take up to two minutes…' : summary.label}</span>
    </p>
    {summary.status !== 'none' && !running && <p className="text-xs text-muted-foreground">
      {summary.counts.services} service name(s) · {summary.counts.towns} town(s) · {summary.counts.credentials} credential mention(s) · {summary.counts.profiles} profile link(s) · {summary.counts.technical} technical finding(s){summary.requestedFrom ? ` · started from ${summary.requestedFrom.replace('_', ' ')}` : ''}. Everything found is DETECTED, not approved.
    </p>}
    {summary.mode === 'standard' && summary.status !== 'none' && !running && <p className="text-xs text-amber-700 dark:text-amber-300">This is the small automatic crawl. Re-crawl to read the whole site.</p>}
    {summary.warnings.length > 0 && !running && <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{summary.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Button size="sm" variant={summary.status === 'none' ? 'default' : 'outline'} disabled={running || !crawlable} onClick={() => void run()}
      title={crawlable ? 'Full crawl of the public website — saved to this lead, seen on every screen.' : 'No website to crawl — add one in the onboarding answers.'}>
      {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
      {summary.status === 'none' ? 'Crawl site' : 'Re-crawl site'}
    </Button>
  </div>;
}

/* ── the evidence itself, for Website Build ───────────────────────────────────────────────────── */

function Seen({ title, items }: { title: string; items: Array<{ value: string; url: string }> | undefined }) {
  if (!items?.length) return null;
  return <div><p className="font-medium">{title}</p><ul className="ml-4 list-disc space-y-0.5">{items.map((s, i) =>
    <li key={i}>{s.value} <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">(source)</a></li>)}</ul></div>;
}

/** Everything the full crawl read, labelled DETECTED. Read-only; nothing here approves a fact. */
export function CrawlEvidenceDetails({ full }: { full: Partial<FullCrawlEvidence> | null | undefined }) {
  if (!full) return <p className="text-xs text-muted-foreground">No full crawl stored yet — press Crawl site / Re-crawl site to read the whole website.</p>;
  const b = full.business;
  return <details className="rounded-md border p-2 text-xs">
    <summary className="cursor-pointer font-medium">What the website currently says (detected — not approved)</summary>
    <div className="mt-2 space-y-3">
      {full.redirectedFrom && <p>Served from <b>{full.servedUrl}</b> (requested {full.redirectedFrom}).</p>}
      <p>Sitemaps read: {full.sitemaps?.read?.length ? full.sitemaps.read.join(', ') : 'none found'} · URLs in sitemaps: {full.sitemaps?.urlCount ?? 0}{full.sitemaps?.offSiteCount ? ` (${full.sitemaps.offSiteCount} on a different website)` : ''} · robots.txt: {full.robots?.found ? 'found' : 'not found'}{full.robots?.disallowsAll ? ' — it disallows everything' : ''}.</p>
      {!!full.families?.length && <div><p className="font-medium">Page families</p><p>{full.families.map((f) => `${f.family} (${f.count})`).join(' · ')}</p></div>}
      {!!full.technical?.length && <div><p className="font-medium">Technical findings</p><ul className="ml-4 list-disc space-y-0.5">{full.technical.map((t) =>
        <li key={t.kind}>{t.detail}{t.urls.length ? ` — ${t.urls.length}: ${t.urls.slice(0, 5).join(', ')}${t.urls.length > 5 ? '…' : ''}` : ''}</li>)}</ul></div>}
      {!!full.navigation?.length && <div><p className="font-medium">Navigation</p><p>{full.navigation.map((n) => n.label).join(' · ')}</p></div>}
      {b && <>
        <Seen title="Business names" items={b.names} />
        <Seen title="Phone numbers" items={b.phones} />
        <Seen title="Email addresses" items={b.emails} />
        <Seen title="Addresses" items={b.addresses} />
        <Seen title="People named" items={b.people} />
        <Seen title="Credentials / memberships mentioned" items={b.credentials} />
        <Seen title="Guarantees / warranties" items={b.guarantees} />
        <Seen title="Experience claims" items={b.experience} />
        <Seen title="Prices" items={b.prices} />
        <Seen title="Reviews / testimonials" items={b.reviews} />
        <Seen title="Third-party profiles" items={b.profiles} />
        {(b.logo || b.favicon) && <p>Logo: {b.logo || '—'} · Favicon: {b.favicon || '—'}</p>}
        {!!b.images?.length && <p>{b.images.length} image reference(s) recorded.</p>}
      </>}
      {!!full.pages?.length && <div><p className="font-medium">Pages read ({full.pages.length})</p><ul className="max-h-64 space-y-0.5 overflow-y-auto">{full.pages.map((p) =>
        <li key={p.url} className="truncate"><a className="text-primary hover:underline" href={p.finalUrl} target="_blank" rel="noreferrer">{p.finalUrl}</a> <span className="text-muted-foreground">· {p.family} · {p.status} · {p.words} words{p.title ? ` · “${p.title}”` : ''}{p.noindex ? ' · noindex' : ''}</span></li>)}</ul></div>}
    </div>
  </details>;
}
