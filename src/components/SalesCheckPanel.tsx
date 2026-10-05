/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "CHECK BEFORE CALLING" — the rep's progress and results on Outreach (2026-10-04, fix/07).

   Select leads → Check before calling → this panel: each lead's state in plain words, the call card's
   own one-line result for every ready lead (callCardAudit, the line the call screen shows), and the
   next step — open the call screen, ring, set a Next Action, or skip it for now.
   ⛔ NOTHING HERE CONTACTS ANYONE OR WRITES A LEAD. "Call" is a tel: link (logging the call is the
   workspace's Log this call); "Next Action" opens the workspace's own form; "Skip" only hides a row
   from "Open the next ready lead" on this device.
   ⛔ NO COST IS SHOWN. The allowance is counted in checks.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Loader2, Phone, PhoneCall, RotateCcw, SearchCheck, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { checkedAgo, readyItems, SALES_CHECK_AUDIT_REUSE_DAYS, SALES_CHECK_BATCH_MAX, SALES_CHECK_REFRESH_MIN_DAYS } from '@/lib/salesCheck';
import { useCallCardSummaries, type CallCardSummary } from '@/hooks/useColdCallPlaybook';
import type { SalesCheckItemView, useSalesChecks } from '@/hooks/useSalesChecks';

type Checks = ReturnType<typeof useSalesChecks>;
/** v2: the call screen and the Next Action are both on the Call tab (the Next Action at its bottom). */
export type OpenLeadTab = 'call' | 'next_action';

const STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting', starting: 'Starting', running: 'Checking…', done: 'Ready', reused: 'Ready', failed: 'Failed', skipped: 'Skipped',
};
const STATUS_TONE: Record<string, string> = {
  queued: 'border-border text-muted-foreground', starting: 'border-sky-500/40 text-sky-600 dark:text-sky-300',
  running: 'border-sky-500/40 text-sky-600 dark:text-sky-300', done: 'border-teal-500/50 text-teal-700 dark:text-teal-300',
  reused: 'border-teal-500/50 text-teal-700 dark:text-teal-300', failed: 'border-destructive/50 text-destructive',
  skipped: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
};
const CRAWL_WORDS: Record<string, string> = {
  new: 'Website checked', reused: 'Website check reused', with_audit: 'Website check follows the AI check',
  none: 'No website on file', failed: 'Website couldn\'t be read',
};

/** Per-device convenience only (what was skipped / opened in this batch). Never decides anything. */
function readLocal(key: string): string[] {
  try { const v = JSON.parse(window.sessionStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function writeLocal(key: string, ids: string[]) {
  try { window.sessionStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable — the list still works this session */ }
}

export function SalesCheckPanel({ checks, onOpenLead }: { checks: Checks; onOpenLead: (leadId: string, tab: OpenLeadTab) => void }) {
  const view = checks.view;
  const batch = view?.batch ?? null;
  const items = useMemo(() => view?.items ?? [], [view?.items]);
  const [collapsed, setCollapsed] = useState(false);
  const skipKey = batch ? `sales-check-skipped:${batch.id}` : '';
  const openKey = batch ? `sales-check-opened:${batch.id}` : '';
  const [skipped, setSkipped] = useState<string[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
  useEffect(() => { if (skipKey) { setSkipped(readLocal(skipKey)); setOpened(readLocal(openKey)); } }, [skipKey, openKey]);

  const ready = useMemo(() => readyItems(items), [items]);
  const summaryLeads = useMemo(() => ready.map((i) => ({ id: i.lead_id, business_name: i.business_name, website: i.website, phone: i.phone })), [ready]);
  const summaries = useCallCardSummaries(summaryLeads);

  if (!batch) return null;
  const c = batch.counts;
  const settled = c.done + c.reused + c.failed + c.skipped;
  const pct = c.total ? Math.round((settled / c.total) * 100) : 100;
  const nextReady = ready.find((i) => !skipped.includes(i.id) && !opened.includes(i.id)) ?? null;
  const headline = batch.status === 'active'
    ? `Checking ${c.total} lead${c.total === 1 ? '' : 's'} — ${c.total - c.queued} of ${c.total} started`
    : batch.status === 'waiting'
      ? `AI checks running — ${c.done + c.reused} ready so far`
      : `Done — ${c.done + c.reused} ready to call`;

  const open = (it: SalesCheckItemView, tab: OpenLeadTab) => {
    if (tab === 'call' && !opened.includes(it.id)) { const n = [...opened, it.id]; setOpened(n); writeLocal(openKey, n); }
    onOpenLead(it.lead_id, tab);
  };
  const toggleSkip = (it: SalesCheckItemView) => {
    const n = skipped.includes(it.id) ? skipped.filter((x) => x !== it.id) : [...skipped, it.id];
    setSkipped(n); writeLocal(skipKey, n);
  };

  return (
    <section data-testid="sales-check-panel" className="min-w-0 space-y-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {batch.status === 'finished' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
        <span className="font-medium text-foreground">Check before calling</span>
        <span className="min-w-0 text-muted-foreground">{headline}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" className="h-7 text-xs" disabled={!nextReady} onClick={() => nextReady && open(nextReady, 'call')} data-testid="sales-check-next">
            <PhoneCall className="mr-1 h-3.5 w-3.5" />{nextReady ? 'Open the next ready lead' : 'No ready lead left'}
          </Button>
          {c.queued > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void checks.cancel(batch.id)} title="Leads not started yet are skipped; checks already started finish on their own.">
              <Square className="mr-1 h-3 w-3" />Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Show the list' : 'Hide the list'}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span><b className="text-foreground">{c.done + c.reused}</b> ready{c.reused ? ` (${c.reused} reused)` : ''}</span>
        {c.running > 0 && <span><b className="text-foreground">{c.running}</b> checking</span>}
        {c.queued > 0 && <span><b className="text-foreground">{c.queued}</b> waiting to start</span>}
        {c.skipped > 0 && <span><b className="text-foreground">{c.skipped}</b> skipped</span>}
        {c.failed > 0 && <span className="text-destructive"><b>{c.failed}</b> failed</span>}
        {view?.allowance && <span>Checks left today: <b className="text-foreground">{view.allowance.remaining}</b> of {view.allowance.limit}</span>}
      </div>
      {checks.lastError && <p className="text-xs text-destructive">{checks.lastError}</p>}
      {!collapsed && (
        <>
          <p className="text-xs text-muted-foreground">Nothing is sent to anyone. Results also show on each lead and on its call screen.{batch.status !== 'finished' ? ' Checks already started finish on their own, even if you leave this page.' : ''}</p>
          <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-background/60" data-testid="sales-check-items">
            {items.map((it) => (
              <SalesCheckRow key={it.id} it={it} summary={summaries.data?.[it.lead_id] ?? null} summaryLoading={summaries.isLoading}
                skipped={skipped.includes(it.id)} onOpen={open} onToggleSkip={toggleSkip} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SalesCheckRow({ it, summary, summaryLoading, skipped, onOpen, onToggleSkip }: {
  it: SalesCheckItemView; summary: CallCardSummary | null; summaryLoading: boolean; skipped: boolean;
  onOpen: (it: SalesCheckItemView, tab: OpenLeadTab) => void; onToggleSkip: (it: SalesCheckItemView) => void;
}) {
  const isReady = it.status === 'done' || it.status === 'reused';
  /* The website line: "follows the AI check" while it runs; once ready the audit queue has crawled
     (a run is released only after its crawl), so it was checked WITH it. No website is already said by
     the result line, so it is not said twice. */
  const crawlLine = it.status === 'running' ? (it.crawl_source ? CRAWL_WORDS[it.crawl_source] ?? null : null)
    : !isReady || !it.crawl_source ? null
    : it.crawl_source === 'with_audit' ? 'Website checked with the AI check'
    : it.crawl_source === 'none' && summary?.finding ? null
    : CRAWL_WORDS[it.crawl_source] ?? null;
  const reusedLine = it.audit_source === 'reused' || it.audit_source === 'in_flight'
    ? `Reused — ${checkedAgo(it.result_at, Date.now()) ?? 'checked recently'}, no new check needed`
    : null;
  return (
    <li className={cn('flex min-w-0 flex-col gap-1.5 px-2.5 py-2 sm:flex-row sm:items-start', skipped && 'opacity-60')} data-testid="sales-check-item" data-status={it.status}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words font-medium text-foreground">{it.business_name ?? 'A lead that isn\'t yours'}</span>
          <span className={cn('rounded-full border px-1.5 py-px text-[11px] font-medium', STATUS_TONE[it.status] ?? STATUS_TONE.queued)}>
            {it.status === 'running' && <Loader2 className="mr-0.5 inline h-3 w-3 animate-spin" />}{STATUS_LABEL[it.status] ?? it.status}
          </span>
          {skipped && <span className="text-[11px] text-muted-foreground">skipped for now</span>}
        </div>
        {isReady && (summary
          ? <>
              <p className="break-words text-xs text-foreground">{summary.headline}</p>
              {summary.finding && <p className="break-words text-xs text-muted-foreground">Website: {summary.finding}</p>}
            </>
          : <p className="text-xs text-muted-foreground">{summaryLoading ? 'Loading the result…' : 'Open the call screen to read the result.'}</p>)}
        {isReady && reusedLine && <p className="text-[11px] text-muted-foreground">{reusedLine}</p>}
        {crawlLine && <p className="text-[11px] text-muted-foreground">{crawlLine}</p>}
        {it.status === 'running' && <p className="text-[11px] text-muted-foreground">{it.audit_source === 'in_flight' ? 'An AI check was already running for this lead — waiting for it, no new one started.' : 'Asking ChatGPT and Google AI — usually a few minutes.'}</p>}
        {(it.status === 'failed' || it.status === 'skipped') && it.message && <p className={cn('break-words text-xs', it.status === 'failed' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300')}>{it.message}</p>}
      </div>
      {isReady && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={() => onOpen(it, 'call')}><PhoneCall className="mr-1 h-3.5 w-3.5" />Call screen</Button>
          {it.phone && (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <a href={`tel:${it.phone.replace(/[^\d+]/g, '')}`}><Phone className="mr-1 h-3.5 w-3.5" />Call</a>
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(it, 'next_action')} title="Open the lead to set its Next Action"><CalendarClock className="mr-1 h-3.5 w-3.5" />Next Action</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onToggleSkip(it)}>{skipped ? <><RotateCcw className="mr-1 h-3 w-3" />Undo</> : 'Skip'}</Button>
        </div>
      )}
    </li>
  );
}

/** The press: what will happen, in words, before anything starts. */
export function SalesCheckDialog({ open, onOpenChange, selected, checks, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; selected: number; checks: Checks; onConfirm: (refresh: boolean) => void;
}) {
  const [refresh, setRefresh] = useState(false);
  useEffect(() => { if (open) setRefresh(false); }, [open]);
  const allowance = checks.view?.allowance ?? null;
  const max = checks.view?.max ?? SALES_CHECK_BATCH_MAX;
  const tooMany = selected > max;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SearchCheck className="h-5 w-5" />Check {selected} lead{selected === 1 ? '' : 's'} before calling</DialogTitle>
          <DialogDescription>Research only. Nothing is sent to anyone — no WhatsApp, no email.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Each lead gets the same AI check as the single “Run the AI check” button (ChatGPT and Google AI), plus a free check of their website.</li>
          <li>A lead checked in the last {SALES_CHECK_AUDIT_REUSE_DAYS} days reuses that result — free, and it doesn't use your allowance.</li>
          <li>New checks use your allowance{allowance ? <>: <b className="text-foreground">{allowance.remaining}</b> of {allowance.limit} left today</> : ''}.</li>
          <li>Leads that can't be checked (not yours, archived, a client, no trade or town) are skipped and say why.</li>
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={refresh} onCheckedChange={(v) => setRefresh(v === true)} className="mt-0.5" />
          <span>Check again even if checked recently <span className="text-muted-foreground">(only results at least {SALES_CHECK_REFRESH_MIN_DAYS} days old are re-checked)</span></span>
        </label>
        {tooMany && <p className="text-sm text-destructive">Select at most {max} leads per check — you selected {selected}.</p>}
        {checks.lastError && <p className="text-sm text-destructive">{checks.lastError}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={tooMany || checks.starting || selected === 0} onClick={() => onConfirm(refresh)} data-testid="sales-check-confirm">
            {checks.starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-1.5 h-4 w-4" />}
            Check {selected} lead{selected === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
