import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, Plus, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { isAggregatorUrl } from '@/lib/aggregators';
import type { CrawlRequestSource, FullCrawlEvidence } from '@/lib/fullCrawl';
import type { CrawlJobLike, LeadCrawlSummary } from '@/lib/leadCrawlSummary';
import { progressLabel, remaining, type JobStatus } from '@/lib/crawlJob';
import { SKIP_REASON_LABELS, type SkipReason } from '@/lib/crawlUrl';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE EVIDENCE — the lead's latest crawl, the live progress of a running one, and the
   Crawl site / Re-crawl site button.

   ⛔ THE BUTTON STARTS THE EXHAUSTIVE CRAWL JOB (crawl-check, `mode: "full"`) — the same call every
   manual crawl button makes. The job runs on the server until its frontier is empty; this panel only
   WATCHES it (crawl-check `status`, every CRAWL_POLL_MS), so leaving the page never stops it and
   coming back picks the progress up again.
   ⛔ OPENING THIS PANEL CRAWLS NOTHING.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CRAWL_POLL_MS = 5_000;

export async function startFullLeadCrawl(leadId: string, from: CrawlRequestSource) {
  return invokeEdge<Record<string, any>>('crawl-check', { lead_id: leadId, mode: 'full', requested_from: from });
}
export async function crawlJobStatus(body: { job_id?: string; lead_id?: string; include_result?: boolean }) {
  return invokeEdge<{ job: (CrawlJobLike & { label: string }) | null; result: any; full: any }>('crawl-check', { action: 'status', ...body });
}

/** Watch a job until it leaves `running`. Returns the latest job. Stops on unmount. */
export function useCrawlJobWatch(jobId: string | null, onFinished: () => void | Promise<void>) {
  const [job, setJob] = useState<(CrawlJobLike & { label: string }) | null>(null);
  const finished = useRef(onFinished);
  finished.current = onFinished;
  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    let stopped = false;
    let timer: number | null = null;
    const tick = async () => {
      try {
        const res = await crawlJobStatus({ job_id: jobId });
        if (stopped) return;
        setJob(res.job);
        if (res.job && res.job.status !== 'running') { await finished.current(); return; }
      } catch { /* a missed poll is retried */ }
      if (!stopped) timer = window.setTimeout(tick, CRAWL_POLL_MS);
    };
    void tick();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [jobId]);
  return job;
}

export function LeadCrawlPanel({ leadId, website, summary, from, onDone }: {
  leadId: string; website: string | null | undefined; summary: LeadCrawlSummary; from: CrawlRequestSource; onDone: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedJob, setStartedJob] = useState<string | null>(null);
  const watchId = startedJob ?? summary.running?.id ?? null;
  const job = useCrawlJobWatch(watchId, async () => {
    void queryClient.invalidateQueries({ queryKey: ['lead-crawls'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    setStartedJob(null);
    await onDone();
  });
  const site = (website ?? '').trim();
  const crawlable = !!site && !isAggregatorUrl(site);
  const live = job && job.status === 'running' ? job : (watchId ? summary.running : null);
  const running = !!live || starting;

  const start = async () => {
    setStarting(true); setError(null);
    try {
      const res = await startFullLeadCrawl(leadId, from);
      if (res.job_id) {
        setStartedJob(String(res.job_id));
        toast({ title: res.reused ? 'Already crawling' : 'Crawl started', description: 'It runs on the server until every page is done — you can leave this page.' });
      } else {
        // The homepage could not be read, so there was nothing to crawl: the inline check recorded it.
        toast({ title: 'Could not start a full crawl', description: 'No search crawler could read the homepage. The result is saved to this lead.', variant: 'destructive' });
        await onDone();
      }
    } catch (e) {
      const msg = edgeErrorMessage(e, 'The crawl could not start');
      setError(msg);
      toast({ title: 'Crawl failed to start', description: msg, variant: 'destructive' });
    } finally { setStarting(false); }
  };

  const tone = summary.status === 'failed' ? 'text-destructive' : summary.status === 'partial' || summary.status === 'complete_with_failures' ? 'text-amber-700 dark:text-amber-300' : summary.status === 'complete' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground';
  const c = live?.counts ?? null;
  return <div className="space-y-2 text-sm">
    <div className="grid gap-2 sm:grid-cols-2">
      <div><div className="text-xs text-muted-foreground">Website</div><div className="break-all">{site || 'No website recorded'}</div></div>
      <div><div className="text-xs text-muted-foreground">Last completed crawl</div><div>{summary.crawledAt ? new Date(summary.crawledAt).toLocaleString('en-GB') : '—'}</div></div>
    </div>
    {running ? <div className="rounded-md border border-primary/30 bg-primary/5 p-2" aria-live="polite">
      <p className="flex items-center gap-1.5 font-medium text-primary"><Loader2 className="h-4 w-4 animate-spin" />Crawling the whole site…</p>
      {c ? <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-5">
        <span><b>{c.discovered.toLocaleString('en-GB')}</b> discovered</span>
        <span><b>{(c.done + c.failed + c.skipped).toLocaleString('en-GB')}</b> processed</span>
        <span><b>{remaining(c).toLocaleString('en-GB')}</b> remaining</span>
        <span><b>{c.failed.toLocaleString('en-GB')}</b> failed</span>
        <span><b>{c.skipped.toLocaleString('en-GB')}</b> skipped</span>
      </div> : <p className="text-xs text-muted-foreground">Starting…</p>}
      {c && c.sitemaps_pending > 0 && <p className="mt-1 text-xs text-muted-foreground">{c.sitemaps_pending} sitemap file(s) still to read — the discovered count will keep rising.</p>}
      <p className="mt-1 text-xs text-muted-foreground">It runs on the server; you can leave and come back.</p>
    </div> : <p className={`flex items-start gap-1.5 ${tone}`}>
      {summary.status === 'complete' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : summary.status === 'none' ? <ScanSearch className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{summary.label}</span>
    </p>}
    {summary.status !== 'none' && !running && <p className="text-xs text-muted-foreground">
      {summary.counts.services} service name(s) · {summary.counts.towns} town(s) · {summary.counts.credentials} credential(s) · {summary.counts.profiles} profile link(s) · {summary.counts.technical} technical finding type(s){summary.requestedFrom ? ` · started from ${summary.requestedFrom.replace('_', ' ')}` : ''}. Everything found is DETECTED, not approved.
    </p>}
    {(summary.mode === 'standard' || summary.mode === 'capped') && summary.status !== 'none' && !running && <p className="text-xs text-amber-700 dark:text-amber-300">{summary.mode === 'capped' ? 'This crawl stopped at a 60-page limit that no longer exists.' : 'This is the small automatic crawl.'} Re-crawl to read the whole site.</p>}
    {summary.warnings.length > 0 && !running && <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{summary.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Button size="sm" variant={summary.status === 'none' ? 'default' : 'outline'} disabled={running || !crawlable} onClick={() => void start()}
      aria-label={summary.status === 'none' ? 'Crawl site' : 'Re-crawl site'}
      title={crawlable ? 'Exhaustive crawl of the public website — runs until every page is done, saved to this lead.' : 'No website to crawl — add one in the onboarding answers.'}>
      {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
      {running ? 'Crawling…' : summary.status === 'none' ? 'Crawl site' : 'Re-crawl site'}
    </Button>
  </div>;
}

/* ── the crawl-wide evidence, for Website Build ───────────────────────────────────────────────── */

function Seen({ title, items, pages }: { title: string; items: Array<{ value: string; url: string }> | undefined; pages?: number }) {
  if (!items?.length) return null;
  return <div><p className="font-medium">{title}{pages ? ` — on ${pages} page(s)` : ''}</p><ul className="ml-4 list-disc space-y-0.5">{items.map((s, i) =>
    <li key={i}>{s.value} <a className="text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">(source)</a></li>)}</ul></div>;
}

/** Everything the full crawl read, labelled DETECTED. Read-only; nothing here approves a fact. */
export function CrawlEvidenceDetails({ full }: { full: Partial<FullCrawlEvidence> | null | undefined }) {
  if (!full) return <p className="text-xs text-muted-foreground">No full crawl stored yet — press Crawl site / Re-crawl site to read the whole website.</p>;
  const b = full.business;
  const st = full.stats;
  return <details className="rounded-md border p-2 text-xs">
    <summary className="cursor-pointer font-medium">What the website currently says (detected — not approved)</summary>
    <div className="mt-2 space-y-3">
      {st && <p><b>{(st.urlsDiscovered ?? 0).toLocaleString('en-GB')}</b> discovered · <b>{(st.pagesOk ?? 0).toLocaleString('en-GB')}</b> fetched · <b>{(st.failed ?? 0).toLocaleString('en-GB')}</b> failed · <b>{(st.skipped ?? 0).toLocaleString('en-GB')}</b> skipped{st.ms ? ` · took ${Math.round(st.ms / 60000)} min` : ''}.
        {st.skippedByReason && Object.keys(st.skippedByReason).length > 0 && <> Skipped: {Object.entries(st.skippedByReason).map(([k, v]) => `${v} ${SKIP_REASON_LABELS[k as SkipReason] ?? k}`).join(' · ')}.</>}</p>}
      {full.redirectedFrom && <p>Served from <b>{full.servedUrl}</b> (requested {full.redirectedFrom}).</p>}
      <p>Sitemap files read: {typeof full.sitemaps?.read === 'number' ? full.sitemaps.read : 0} · URLs listed in sitemaps: {full.sitemaps?.urlCount ?? 0}{full.sitemaps?.offSiteCount ? ` (${full.sitemaps.offSiteCount} on a different website)` : ''} · robots.txt: {full.robots?.found ? 'found' : 'not found'}{full.robots?.disallowsAll ? ' — it disallows everything' : ''}.</p>
      {!!full.families?.length && <div><p className="font-medium">Page families</p><p>{full.families.map((f) => `${f.family} (${f.count})`).join(' · ')}</p></div>}
      {!!full.technical?.length && <div><p className="font-medium">Technical findings</p><ul className="ml-4 list-disc space-y-0.5">{full.technical.map((t) =>
        <li key={t.kind}>{t.detail}{t.count ? ` — ${t.count} page(s)` : ''}{t.urls.length ? `, e.g. ${t.urls.slice(0, 3).join(', ')}` : ''}</li>)}</ul></div>}
      {!!full.navigation?.length && <div><p className="font-medium">Navigation</p><p>{full.navigation.map((n) => n.label).join(' · ')}</p></div>}
      {b && <>
        <Seen title="Business names" items={b.names} />
        <Seen title="Phone numbers" items={b.phones} pages={b.pagesWith?.phones} />
        <Seen title="Email addresses" items={b.emails} pages={b.pagesWith?.emails} />
        <Seen title="Addresses" items={b.addresses} pages={b.pagesWith?.addresses} />
        <Seen title="People named" items={b.people} pages={b.pagesWith?.people} />
        <Seen title="Credentials / memberships mentioned" items={b.credentials} pages={b.pagesWith?.credentials} />
        <Seen title="Guarantees / warranties" items={b.guarantees} pages={b.pagesWith?.guarantees} />
        <Seen title="Experience claims" items={b.experience} pages={b.pagesWith?.experience} />
        <Seen title="Prices" items={b.prices} pages={b.pagesWith?.prices} />
        <Seen title="Reviews / testimonials" items={b.reviews} pages={b.pagesWith?.reviews} />
        <Seen title="Third-party profiles" items={b.profiles} pages={b.pagesWith?.profiles} />
        {(b.logo || b.favicon) && <p>Logo: {b.logo || '—'} · Favicon: {b.favicon || '—'}</p>}
      </>}
      <p className="text-muted-foreground">Examples are listed here; every page's own evidence is in the inventory below.</p>
    </div>
  </details>;
}

/* ── THE COMPLETE INVENTORY — paged, filtered, exportable; nothing left out ───────────────────── */

export interface InventoryRow { id: number; url: string; status: string; skip_reason: string | null; http_status: number | null; final_url: string | null; source: string | null; depth: number; family: string | null; title: string | null; words: string | null; noindex: string | null }

const hubCall = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
const PAGE_SIZE = 50;

export function CrawlInventory({ leadId, onAdd, addRoom }: { leadId: string; onAdd?: (rows: InventoryRow[]) => void; addRoom?: number }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState({ status: '', family: '', q: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; rows: InventoryRow[]; job_id: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    setBusy(true); setError(null);
    try {
      const res = await hubCall({ action: 'crawl_inventory', lead_id: leadId, offset: off, limit: PAGE_SIZE, ...filters });
      setData(res.inventory); setOffset(off);
    } catch (e) { setError(edgeErrorMessage(e, 'Could not load the inventory')); }
    finally { setBusy(false); }
  }, [leadId, filters]);
  useEffect(() => { void load(0); }, [load]);

  /** Every row matching the current filters, 1,000 at a time. */
  const all = async (): Promise<InventoryRow[]> => {
    const out: InventoryRow[] = [];
    for (let off = 0; ; off += 1000) {
      const res = await hubCall({ action: 'crawl_inventory', lead_id: leadId, offset: off, limit: 1000, ...filters });
      const rows = (res.inventory?.rows ?? []) as InventoryRow[];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  };
  const download = async () => {
    setBusy(true);
    try {
      const rows = await all();
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = ['url,status,http_status,final_url,family,title,words,noindex,skip_reason,source,depth', ...rows.map((r) => [r.url, r.status, r.http_status, r.final_url, r.family, r.title, r.words, r.noindex, r.skip_reason, r.source, r.depth].map(esc).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `crawl-inventory-${rows.length}-urls.csv`;
      a.click();
      toast({ title: `Downloaded ${rows.length.toLocaleString('en-GB')} URLs` });
    } catch (e) { toast({ title: 'Download failed', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const addFiltered = async () => {
    if (!onAdd) return;
    setBusy(true);
    try {
      const rows = (await all()).filter((r) => r.status === 'done');
      onAdd(rows);
    } catch (e) { toast({ title: 'Could not add', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const total = data?.total ?? 0;
  const set = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const sel = 'h-8 rounded-md border border-input bg-background px-2 text-xs';
  return <div className="space-y-2 rounded-md border p-2 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">Old-site inventory — {total.toLocaleString('en-GB')} URL(s){filters.status || filters.family || filters.q ? ' matching' : ''}{!data?.job_id && !busy ? ' (no full crawl yet)' : ''}</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Status" className={sel} value={filters.status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option><option value="done">Fetched</option><option value="failed">Failed</option><option value="skipped">Skipped</option></select>
        <select aria-label="Page family" className={sel} value={filters.family} onChange={(e) => set('family', e.target.value)}><option value="">All families</option>{['homepage', 'service', 'location', 'about', 'contact', 'faq', 'pricing', 'reviews', 'gallery', 'blog', 'legal', 'other'].map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <Input aria-label="Search URLs" className="h-8 w-44 text-xs" placeholder="Search URLs" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || !total} onClick={() => void download()}><Download className="mr-1 h-3.5 w-3.5" />CSV (all {total.toLocaleString('en-GB')})</Button>
        {onAdd && <Button size="sm" variant="outline" disabled={busy || !total} onClick={() => void addFiltered()}><Plus className="mr-1 h-3.5 w-3.5" />Add fetched pages to architecture{typeof addRoom === 'number' ? ` (room for ${addRoom})` : ''}</Button>}
      </div>
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {data && data.rows.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-2">URL</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Family</th><th className="py-1 pr-2">Title</th><th className="py-1">Words</th></tr></thead>
      <tbody>{data.rows.map((r) => <tr key={r.id} className="border-b align-top">
        <td className="max-w-[340px] truncate py-1 pr-2"><a className="text-primary hover:underline" href={r.final_url || r.url} target="_blank" rel="noreferrer">{r.url}</a>{r.final_url && r.final_url !== r.url ? <span className="text-muted-foreground"> → {r.final_url}</span> : null}</td>
        <td className="py-1 pr-2">{r.status}{r.http_status ? ` ${r.http_status}` : ''}{r.skip_reason ? ` · ${SKIP_REASON_LABELS[r.skip_reason as SkipReason] ?? r.skip_reason}` : ''}{r.noindex === 'true' ? ' · noindex' : ''}</td>
        <td className="py-1 pr-2">{r.family ?? '—'}</td>
        <td className="max-w-[240px] truncate py-1 pr-2">{r.title ?? ''}</td>
        <td className="py-1">{r.words ?? ''}</td>
      </tr>)}</tbody></table></div>}
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString('en-GB')}` : busy ? 'Loading…' : 'Nothing here yet.'}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" aria-label="Previous page" disabled={busy || offset === 0} onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" aria-label="Next page" disabled={busy || offset + PAGE_SIZE >= total} onClick={() => void load(offset + PAGE_SIZE)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}

/** The status line a watched job shows (for callers without the panel). */
export const jobLine = (job: { status: JobStatus; counts?: import('@/lib/crawlJob').JobCounts | null } | null) =>
  job?.counts ? progressLabel(job.status, job.counts) : '';
