import { useState, type MouseEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLeadSiteScore } from '@/hooks/useLeadCrawls';
import {
  SITE_SCORE_BAND_LABELS, SITE_SCORE_CATEGORY_LABELS, SITE_SCORE_CATEGORY_POINTS, SITE_SCORE_STATE_LABELS, siteScoreViewFor,
  type SiteScoreBand, type SiteScoreCategory, type SiteScoreView, type StoredSiteScore,
} from '@/lib/siteScore';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ROOM TO IMPROVE THE WEBSITE — the pill (v1 2026-10-23; v2 2026-10-30, Paul: one pill on the Inbox's AI line and on the
   Outreach row, with the band word). Reads the stored score columns only (src/lib/siteScore.ts) — it never judges the
   site itself. Hover (desktop) or tap (phone) shows the top reasons; "Full breakdown" opens every point lost with its page
   and quote. ⛔ TEAM ONLY: nothing here is sent or shown to a prospect. ⛔ Never worded as a prediction of AI visibility.
   ⛔ A site we could not judge is its own grey state with its own words, never a number or a zero; "Not checked" is faint.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const BAND_TEXT: Record<SiteScoreBand, string> = {
  big: 'text-red-600 dark:text-red-400',
  some: 'text-amber-600 dark:text-amber-400',
  little: 'text-emerald-600 dark:text-emerald-400',
};
const BAND_PILL: Record<SiteScoreBand, string> = {
  big: 'border-red-500/60 bg-red-500/10',
  some: 'border-amber-500/60 bg-amber-500/10',
  little: 'border-emerald-500/60 bg-emerald-500/10',
};
export const ROOM_TO_IMPROVE = 'Room to improve the website';
const NOT_A_PREDICTION = 'How much the website itself has to gain, from what our crawl read. Not a prediction of AI visibility. Team only.';

function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

const STATE_WORDS: Partial<Record<string, string>> = {
  no_website: 'No website on file.',
  not_checked: 'No crawl of this site yet. Crawl site runs one.',
  profile_only: 'The website on file is a social or directory page, not the business’s own site.',
};

function Reasons({ view, onBreakdown }: { view: SiteScoreView; onBreakdown?: () => void }) {
  const day = dayOf(view.checkedAt);
  if (view.kind === 'state') {
    return (
      <div className="space-y-1.5 text-xs" data-testid="site-score-reasons">
        <div className="text-[11px] text-muted-foreground">{ROOM_TO_IMPROVE}</div>
        <div className="font-semibold text-sm">{SITE_SCORE_STATE_LABELS[view.state]}</div>
        <p className="text-muted-foreground">{view.reason ?? STATE_WORDS[view.state] ?? ''}</p>
        {view.state !== 'no_website' && view.state !== 'not_checked' && <p className="text-muted-foreground">No number given. This is not a low score.</p>}
        <p className="border-t pt-1.5 text-[11px] text-muted-foreground">{[day ? `Checked ${day}` : null, view.version ? `rubric v${view.version}` : null, 'team only'].filter(Boolean).join(' · ')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 text-xs" data-testid="site-score-reasons">
      <div className="text-[11px] text-muted-foreground">{ROOM_TO_IMPROVE}</div>
      <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        <span className={BAND_TEXT[view.band]}>{SITE_SCORE_BAND_LABELS[view.band]}</span>
        <span className={BAND_TEXT[view.band]}>{view.score}/100</span>
      </div>
      {view.reasons.length ? (
        <ul className="space-y-1">
          {view.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5">
              <span className={cn('mt-[3px] text-[9px]', r.kind === 'down' ? 'text-red-500' : 'text-emerald-500')} aria-hidden>{r.kind === 'down' ? '▼' : '▲'}</span>
              <span>{r.text}{r.kind === 'down' && r.points ? <span className="text-muted-foreground"> (−{r.points})</span> : null}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground">Nothing took points off.</p>}
      {view.capped && <p className="text-muted-foreground">Capped in Big gains by the first reason above (one page, no real service pages, or a serious problem).</p>}
      {onBreakdown && view.version >= 2 && (
        <button type="button" className="text-[11px] font-medium text-primary hover:underline" data-testid="site-score-breakdown"
          onClick={(e) => { e.stopPropagation(); onBreakdown(); }}>
          Full breakdown, with the evidence
        </button>
      )}
      <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
        {[view.pagesRead != null ? `${view.pagesRead} pages read` : null, day ? `checked ${day}` : null, `rubric v${view.version}`, 'team only'].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

/** Every point lost, with the page and the quote the crawl read — one lead, read when opened. */
export function SiteScoreBreakdown({ leadId, website }: { leadId: string; website: string | null | undefined }) {
  const { score, isLoading, isError, refetch } = useLeadSiteScore(leadId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-sm text-muted-foreground">Couldn’t load the breakdown. <button type="button" className="text-primary hover:underline" onClick={() => void refetch()}>Retry</button></p>;
  const view = siteScoreViewFor(website, score);
  const ev = score?.site_score_evidence ?? null;
  if (view.kind === 'state') {
    return (
      <div className="space-y-2 text-sm" data-testid="site-score-breakdown-body">
        <div className="font-semibold">{SITE_SCORE_STATE_LABELS[view.state]}</div>
        <p className="text-muted-foreground">{view.reason ?? STATE_WORDS[view.state] ?? ''}</p>
        {view.state !== 'no_website' && view.state !== 'not_checked' && <p className="text-muted-foreground">No number given. This is not a low score.</p>}
      </div>
    );
  }
  const cats = score?.site_score_detail?.categories ?? null;
  const losses = ev?.losses ?? [];
  return (
    <div className="space-y-3 text-sm" data-testid="site-score-breakdown-body">
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold tabular-nums', BAND_TEXT[view.band])}>{view.score}<span className="text-sm font-medium opacity-70">/100</span></span>
        <span className={cn('font-semibold', BAND_TEXT[view.band])}>{SITE_SCORE_BAND_LABELS[view.band]}</span>
      </div>
      {ev?.cap && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-xs">
          <div className="font-medium">{ev.cap.reason}</div>
          <div className="text-muted-foreground">Would be {ev.cap.uncapped} without the cap.</div>
          <Quote url={ev.cap.url} quote={ev.cap.quote} />
        </div>
      )}
      {cats && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
          {(Object.keys(SITE_SCORE_CATEGORY_POINTS) as SiteScoreCategory[]).map((c) => (
            <div key={c} className="flex justify-between gap-2"><span className="text-muted-foreground">{SITE_SCORE_CATEGORY_LABELS[c]}</span><span className="tabular-nums">{cats[c]}/{SITE_SCORE_CATEGORY_POINTS[c]}</span></div>
          ))}
        </div>
      )}
      {(Object.keys(SITE_SCORE_CATEGORY_POINTS) as SiteScoreCategory[]).map((c) => {
        const mine = losses.filter((l) => l.category === c);
        if (!mine.length) return null;
        return (
          <div key={c} className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{SITE_SCORE_CATEGORY_LABELS[c]}</div>
            {mine.map((l, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2 text-xs" data-testid="site-score-loss">
                <div className="flex justify-between gap-2"><span className="font-medium">{l.title}</span><span className="shrink-0 tabular-nums text-red-600 dark:text-red-400">−{l.points}</span></div>
                <div className="text-muted-foreground">{l.label} · {l.severity}</div>
                <Quote url={l.url} quote={l.quote} />
              </div>
            ))}
          </div>
        );
      })}
      {!losses.length && <p className="text-muted-foreground">Nothing took points off.</p>}
      {!!ev?.notJudged?.length && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Not judged ({ev.notJudged.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{ev.notJudged.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      )}
      {!ev && <p className="text-xs text-muted-foreground">This score was given before the evidence was kept (rubric v{view.version}). The next crawl adds it.</p>}
    </div>
  );
}

function Quote({ url, quote }: { url: string | null; quote: string }) {
  return (
    <div className="mt-1 space-y-0.5">
      <blockquote className="border-l-2 border-border pl-2 italic text-foreground/80">{quote}</blockquote>
      {url && <a href={url} target="_blank" rel="noreferrer noopener" className="block truncate text-[11px] text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{url}</a>}
    </div>
  );
}

function BreakdownDialog({ open, onOpenChange, leadId, website }: { open: boolean; onOpenChange: (o: boolean) => void; leadId: string; website: string | null | undefined }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{ROOM_TO_IMPROVE}</DialogTitle>
          <DialogDescription>{NOT_A_PREDICTION}</DialogDescription>
        </DialogHeader>
        {open && <SiteScoreBreakdown leadId={leadId} website={website} />}
      </DialogContent>
    </Dialog>
  );
}

/** Hover opens it on a desktop, a tap toggles it on a phone; the click never reaches the row underneath (the Inbox row opens
 *  the conversation on click). */
function WithReasons({ view, label, leadId, website, children }: { view: SiteScoreView; label: string; leadId: string | null; website: string | null | undefined; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-testid="site-score"
            onClick={(e) => { stop(e); setOpen((o) => !o); }}
            onKeyDown={stop}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="inline-flex shrink-0 items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {children}
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-72 p-3" onClick={stop} onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
          <Reasons view={view} onBreakdown={leadId ? () => { setOpen(false); setFull(true); } : undefined} />
        </PopoverContent>
      </Popover>
      {leadId && <BreakdownDialog open={full} onOpenChange={setFull} leadId={leadId} website={website} />}
    </>
  );
}

/** THE pill — the Inbox's AI line, the Outreach row and the lead detail all draw this one. Number + band word, or the state's
 *  own words; "Not checked" is faint; no website says so. */
export function SiteScorePill({ score, website, leadId = null }: { score: StoredSiteScore | null | undefined; website: string | null | undefined; leadId?: string | null }) {
  const view = siteScoreViewFor(website, score);
  if (view.kind === 'state') {
    const faint = view.state === 'not_checked';
    return (
      <WithReasons view={view} label={`${ROOM_TO_IMPROVE}: ${SITE_SCORE_STATE_LABELS[view.state]}`} leadId={leadId} website={website}>
        <span className={cn('whitespace-nowrap rounded-full border border-dashed px-1.5 py-px text-[10px]',
          faint ? 'border-border/60 text-muted-foreground/60' : 'border-muted-foreground/50 text-muted-foreground')} data-state={view.state}>
          {SITE_SCORE_STATE_LABELS[view.state]}
        </span>
      </WithReasons>
    );
  }
  return (
    <WithReasons view={view} label={`${ROOM_TO_IMPROVE}: ${view.score} out of 100, ${SITE_SCORE_BAND_LABELS[view.band]}`} leadId={leadId} website={website}>
      <span className={cn('whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold tabular-nums', BAND_PILL[view.band], BAND_TEXT[view.band])} data-state="scored" data-band={view.band}>
        {view.score} · {SITE_SCORE_BAND_LABELS[view.band]}
      </span>
    </WithReasons>
  );
}

const BAND_BAR: Record<SiteScoreBand, string> = { big: 'bg-red-500', some: 'bg-amber-500', little: 'bg-emerald-500' };

/** Outreach's own "Website" column (2026-10-30, Paul chose "B"): the number, the band word, and a thin bar the length of the
 *  number — easy to scan down a long list. The same reasons and breakdown as the pill; a state is its own grey words. */
export function SiteScoreBar({ score, website, leadId = null }: { score: StoredSiteScore | null | undefined; website: string | null | undefined; leadId?: string | null }) {
  const view = siteScoreViewFor(website, score);
  if (view.kind === 'state') {
    const faint = view.state === 'not_checked';
    return (
      <WithReasons view={view} label={`${ROOM_TO_IMPROVE}: ${SITE_SCORE_STATE_LABELS[view.state]}`} leadId={leadId} website={website}>
        <span className={cn('whitespace-nowrap text-[11px]', faint ? 'text-muted-foreground/60' : 'text-muted-foreground')} data-state={view.state}>
          {SITE_SCORE_STATE_LABELS[view.state]}
        </span>
      </WithReasons>
    );
  }
  return (
    <WithReasons view={view} label={`${ROOM_TO_IMPROVE}: ${view.score} out of 100, ${SITE_SCORE_BAND_LABELS[view.band]}`} leadId={leadId} website={website}>
      <span className="flex w-[104px] flex-col items-stretch gap-1 text-left" data-state="scored" data-band={view.band} data-testid="site-score-bar">
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className={cn('text-sm font-semibold tabular-nums', BAND_TEXT[view.band])}>{view.score}</span>
          <span className="text-[11px] text-muted-foreground">{SITE_SCORE_BAND_LABELS[view.band]}</span>
        </span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', BAND_BAR[view.band])} style={{ width: `${Math.max(0, Math.min(100, view.score))}%` }} />
        </span>
      </span>
    </WithReasons>
  );
}

/** The lead detail's line: the same pill, read for this one lead (the lists' read is not loaded there). */
export function LeadSiteScore({ leadId, website }: { leadId: string; website: string | null | undefined }) {
  const { score } = useLeadSiteScore(leadId);
  return <SiteScorePill score={score} website={website} leadId={leadId} />;
}
