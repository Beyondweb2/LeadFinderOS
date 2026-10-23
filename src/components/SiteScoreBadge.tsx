import { useState, type MouseEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { classifyLeadWebsite } from '@/lib/leadWebsiteKind';
import { SITE_SCORE_BAND_LABELS, siteScoreView, type SiteScoreBand, type SiteScoreView, type StoredSiteScore } from '@/lib/siteScore';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SITE SCORE BADGE (2026-10-23, Paul: ring on the Outreach row, number pill on the Inbox row).
   Reads the stored score columns only (src/lib/siteScore.ts) — it never judges the site itself.
   Hover (desktop) or tap (phone) shows the top reasons. ⛔ TEAM ONLY: nothing here is sent or shown to a prospect.
   ⛔ "Can't read site" and "Quick check only" are their own grey states, never a zero. No website → nothing drawn.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const BAND_TEXT: Record<SiteScoreBand, string> = {
  strong: 'text-emerald-600 dark:text-emerald-400',
  fair: 'text-amber-600 dark:text-amber-400',
  weak: 'text-red-600 dark:text-red-400',
};
const BAND_STROKE: Record<SiteScoreBand, string> = { strong: 'stroke-emerald-500', fair: 'stroke-amber-500', weak: 'stroke-red-500' };
const BAND_PILL: Record<SiteScoreBand, string> = {
  strong: 'border-emerald-500/60 bg-emerald-500/10',
  fair: 'border-amber-500/60 bg-amber-500/10',
  weak: 'border-red-500/60 bg-red-500/10',
};

function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

function Reasons({ view }: { view: SiteScoreView }) {
  if (view.kind === 'none') return null;
  const day = dayOf(view.checkedAt);
  if (view.kind !== 'scored') {
    return (
      <div className="space-y-1.5 text-xs" data-testid="site-score-reasons">
        <div className="font-semibold text-sm">{view.kind === 'unreadable' ? 'Can’t read this site' : 'Quick check only'}</div>
        <p className="text-muted-foreground">{view.reason}</p>
        {view.kind === 'unreadable' && <p className="text-muted-foreground">No number given. This is not a low score.</p>}
        <p className="border-t pt-1.5 text-[11px] text-muted-foreground">{[day ? `Checked ${day}` : null, `rubric v${view.version}`, 'team only'].filter(Boolean).join(' · ')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 text-xs" data-testid="site-score-reasons">
      <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        <span>Site score</span>
        <span className={BAND_TEXT[view.band]}>{view.score}/100 · {SITE_SCORE_BAND_LABELS[view.band]}</span>
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
      <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
        {[view.pagesRead != null ? `${view.pagesRead} pages read` : null, day ? `checked ${day}` : null, `rubric v${view.version}`, 'team only'].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

/** Hover opens it on a desktop, a tap toggles it on a phone; the click never reaches the row underneath (the Inbox row opens
 *  the conversation on click). */
function WithReasons({ view, label, children }: { view: SiteScoreView; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  return (
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
      <PopoverContent side="bottom" align="end" className="w-72 p-3" onClick={stop} onOpenAutoFocus={(e) => e.preventDefault()}>
        <Reasons view={view} />
      </PopoverContent>
    </Popover>
  );
}

const RING_R = 11;
const RING_C = 2 * Math.PI * RING_R;

/** The Outreach row's ring (variant B). */
export function SiteScoreRing({ score, website }: { score: StoredSiteScore | null | undefined; website: string | null | undefined }) {
  if (classifyLeadWebsite(website).source === 'none') return null;
  const view = siteScoreView(score);
  if (view.kind === 'none') {
    return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground" title="No site score yet" data-testid="site-score-none">–</span>;
  }
  if (view.kind !== 'scored') {
    const unreadable = view.kind === 'unreadable';
    return (
      <WithReasons view={view} label={unreadable ? 'Site score: can’t read site' : 'Site score: quick check only'}>
        <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed text-[11px] font-semibold text-muted-foreground',
          unreadable ? 'border-muted-foreground/60 bg-[repeating-linear-gradient(135deg,transparent_0_3px,hsl(var(--muted))_3px_6px)]' : 'border-border')}
          data-state={view.kind}>{unreadable ? '?' : 'Q'}</span>
      </WithReasons>
    );
  }
  return (
    <WithReasons view={view} label={`Site score ${view.score} out of 100, ${SITE_SCORE_BAND_LABELS[view.band]}`}>
      <span className="relative inline-flex h-7 w-7 items-center justify-center" data-state="scored">
        <svg viewBox="0 0 28 28" className="absolute inset-0 h-7 w-7 -rotate-90" aria-hidden>
          <circle cx="14" cy="14" r={RING_R} fill="none" strokeWidth="3" className="stroke-muted" />
          <circle cx="14" cy="14" r={RING_R} fill="none" strokeWidth="3" strokeLinecap="round" className={BAND_STROKE[view.band]}
            strokeDasharray={`${(RING_C * view.score) / 100} ${RING_C}`} />
        </svg>
        <span className={cn('relative text-[10px] font-bold tabular-nums', BAND_TEXT[view.band])}>{view.score}</span>
      </span>
    </WithReasons>
  );
}

/** The Inbox row's number pill (variant A). Not scored yet → nothing (the row stays calm). */
export function SiteScorePill({ score, website }: { score: StoredSiteScore | null | undefined; website: string | null | undefined }) {
  if (classifyLeadWebsite(website).source === 'none') return null;
  const view = siteScoreView(score);
  if (view.kind === 'none') return null;
  if (view.kind !== 'scored') {
    const unreadable = view.kind === 'unreadable';
    return (
      <WithReasons view={view} label={unreadable ? 'Site score: can’t read site' : 'Site score: quick check only'}>
        <span className="whitespace-nowrap rounded-full border border-dashed border-muted-foreground/50 px-1.5 py-px text-[10px] text-muted-foreground" data-state={view.kind}>
          {unreadable ? 'Can’t read site' : 'Quick check'}
        </span>
      </WithReasons>
    );
  }
  return (
    <WithReasons view={view} label={`Site score ${view.score} out of 100, ${SITE_SCORE_BAND_LABELS[view.band]}`}>
      <span className={cn('whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-bold tabular-nums', BAND_PILL[view.band], BAND_TEXT[view.band])} data-state="scored">
        {view.score}<span className="ml-0.5 text-[9px] font-medium opacity-70">/100</span>
      </span>
    </WithReasons>
  );
}
