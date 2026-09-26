import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { HOOK_ALL_NAMED_REASON, HOOK_SCORE_QUESTIONS, HOOK_ENGINES, isHookStateV2, type HookResult, type HookScore } from '@/lib/hookScore';
import type { HookCardScore, HookReportLink, HookReportState } from '@/lib/hookVisibility';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI VISIBILITY (the presentational half; HookVisibilityCard.tsx loads the data): the Inbox's compact read of the lead's hook audit (2026-09-25, redesigned 2026-09-26).

   🔴 COMPACT BY DEFAULT (Paul, 2026-09-26: "far too large and takes over the conversation"). The
   conversation is the Inbox's primary content. Collapsed, the card is a glance: the percentage and
   count, the engine split, the best missed search, and the report action. Everything else (the
   hook's competitors, the other misses, the named searches, the six results) sits behind "View
   details", and even then inside a height-capped panel that scrolls on its own.

   ⛔ NO PERCENTAGE UNTIL COMPLETE. A running check shows progress ("Checking AI results 2/6"). A
   finished check with a failed result says INCOMPLETE, and a failure is never shown as "not named".
   ⛔ AN OLD AUDIT KEEPS ITS OWN DENOMINATOR, AND SAYS IT IS OLD. A version-1 hook that stopped after
   one question reads "50% named (1/2)" under an explicit "Older quick check" label, with the
   "Run new 3 × 2 audit" action beside it. It is never padded to six and never rewritten.
   ⛔ THE REPORT ACTION IS THE REPORT OF THE AUDIT SHOWN. It reads HookReportState (hookVisibility.ts),
   computed from the same poll as the score, so "Report ready" cannot contradict a visible result
   and a running audit never borrows an older audit's link as its own.
   ⛔ ENGINE-SPECIFIC WORDS, AND "Google AI", NEVER the internal engine key, on this surface.
   ⛔ NO LABELS LIKE poor/good/excellent. The numbers are the judgement (Paul).
   ⛔ IT READS AND IT STARTS AN AUDIT. It never sends. The "Run new 3 × 2 audit" callback it is given
   must not queue a pitch (Inbox.tsx startHookRerun).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const countWord = (n: number) => (['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n));
const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';
const ACTION_BTN = 'inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50';
const RUN_NEW_LABEL = `Run new ${HOOK_SCORE_QUESTIONS} × ${HOOK_ENGINES.length} audit`;

export interface HookRunNewProps {
  /** Start a new current-format hook audit for this lead. Absent = the action is not offered. */
  onRunNew?: () => void;
  runNewBusy?: boolean;
}

/* ── The report action row ───────────────────────────────────────────────────────────────────── */

function CopyLink({ link }: { link: HookReportLink }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        navigator.clipboard?.writeText(link.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        toast({ title: 'Report URL copied' });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

function PreviousLink({ link }: { link: HookReportLink | null }) {
  if (!link) return null;
  return (
    <a href={link.url} target="_blank" rel="noreferrer" data-audit-id={link.auditId} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
      Previous report
    </a>
  );
}

function ReportAction({ report, legacy, onRefresh, refreshing }: { report: HookReportState; legacy: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  switch (report.kind) {
    case 'ready':
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={report.link.url}
            target="_blank"
            rel="noreferrer"
            data-testid="hook-open-report"
            data-audit-id={report.link.auditId}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-green-700"
          >
            <ExternalLink className="h-3 w-3" /> Open report
          </a>
          <CopyLink link={report.link} />
          {!report.isCurrent && <span className="text-[11px] text-muted-foreground">(from a newer audit)</span>}
        </span>
      );
    case 'running':
      return <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">Audit running <PreviousLink link={report.previous} /></span>;
    case 'preparing':
      return (
        <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Preparing report…</span>
          <PreviousLink link={report.previous} />
        </span>
      );
    case 'slow':
      return (
        <span className="inline-flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          Report is taking longer than usual.
          <button type="button" className={ACTION_BTN} onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} /> Check again
          </button>
          <PreviousLink link={report.previous} />
        </span>
      );
    case 'incomplete':
      return <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">No report: this check is incomplete. <PreviousLink link={report.previous} /></span>;
    case 'failed':
      return <span className="inline-flex items-center gap-2 text-[11px] text-destructive">Audit failed, so there is no report. <PreviousLink link={report.previous} /></span>;
    case 'historical_no_report':
      return <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">No public report generated for this historical check. <PreviousLink link={report.previous} /></span>;
    case 'none':
      return <span className="text-[11px] text-muted-foreground">{legacy ? 'No public report generated for this historical check.' : 'No audit yet for this lead.'}</span>;
  }
}

/* ── Details (only after "View details") ─────────────────────────────────────────────────────── */

function statusText(r: HookResult): string {
  return r.status === 'named' ? 'Named' : r.status === 'not_named' ? 'Not named' : r.status === 'failed' ? 'Failed (not counted)' : 'Waiting';
}
function statusClass(r: HookResult): string {
  return r.status === 'named' ? 'text-green-600 dark:text-green-400' : r.status === 'not_named' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
}

function Details({ score, rivalsWithheld, legacy }: { score: HookScore; rivalsWithheld: boolean; legacy: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const hookKey = score.hook ? `${score.hook.questionIndex}:${score.hook.engine}` : null;
  const otherMisses = score.misses.filter((m) => `${m.questionIndex}:${m.engine}` !== hookKey);
  // Google AI misses first, then ChatGPT: the order the hook is picked in.
  const missGroups = ['gemini', 'chatgpt']
    .map((engine) => ({ engine, label: score.perEngine.find((t) => t.engine === engine)?.label ?? engine, items: otherMisses.filter((m) => m.engine === engine) }))
    .filter((g) => score.perEngine.some((t) => t.engine === g.engine));
  const named = score.results.filter((r) => r.status === 'named');
  return (
    <div className="mt-2 max-h-[20vh] space-y-2.5 overflow-y-auto overscroll-contain rounded-md border border-border bg-muted/30 p-2 text-xs" data-testid="hook-visibility-details">
      {score.hook && (
        <div>
          <div className={EYEBROW}>Selected outreach search</div>
          <p className="mt-0.5 break-words font-medium">“{score.hook.question}”</p>
          <p className="mt-0.5"><span className="font-semibold">{score.hook.label}</span><span className="text-amber-700 dark:text-amber-400"> · Not named</span></p>
          <p className="mt-0.5 break-words">
            <span className="text-muted-foreground">{score.hook.label} named instead: </span>
            {rivalsWithheld
              ? <span className="italic text-muted-foreground">names withheld (this run’s competitor list failed cleaning)</span>
              : score.hook.competitors.length
                ? score.hook.competitors.slice(0, 5).join(', ')
                : <span className="italic text-muted-foreground">no competitor names extracted for this answer</span>}
          </p>
        </div>
      )}
      {score.complete && !score.allNamed && missGroups.map((g) => (
        <div key={g.engine}>
          <div className={EYEBROW}>Other {g.label} misses</div>
          {g.items.length === 0
            ? <p className="text-muted-foreground">None.</p>
            : <ul className="ml-4 list-disc space-y-0.5">{g.items.map((m) => <li key={m.questionIndex} className="break-words">{m.question}</li>)}</ul>}
        </div>
      ))}
      <div>
        <div className={EYEBROW}>Named searches</div>
        {named.length === 0
          ? <p className="text-muted-foreground">Not named in any valid result.</p>
          : <ul className="ml-4 list-disc space-y-0.5">{named.map((r) => <li key={`${r.questionIndex}:${r.engine}`} className="break-words">{r.question} <span className="text-muted-foreground">· {r.label}</span></li>)}</ul>}
      </div>
      <div>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          All {score.expected} {legacy ? 'results in this older check' : 'results'}
        </button>
        {showAll && (
          <ul className="mt-1.5 space-y-1.5">
            {score.results.map((r) => (
              <li key={`${r.questionIndex}:${r.engine}`} className="rounded border border-border bg-background p-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 break-words font-medium">{r.question}</span>
                  <span className={cn('whitespace-nowrap', statusClass(r))}>{r.label} · {statusText(r)}</span>
                </div>
                {r.status === 'not_named' && r.competitors.length > 0 && !rivalsWithheld && (
                  <p className="mt-0.5 break-words text-muted-foreground">Named: {r.competitors.slice(0, 5).join(', ')}</p>
                )}
                {r.answerExcerpt && <p className="mt-0.5 line-clamp-3 break-words text-muted-foreground">{r.answerExcerpt}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── The card ────────────────────────────────────────────────────────────────────────────────── */

/** The presentational half: no fetching, so it renders from plain data. */
export function HookVisibilityView({ card, inFlight, state, report, onRunNew, runNewBusy, onRefresh, refreshing, defaultExpanded = false }: {
  card: HookCardScore | null;
  inFlight: boolean;
  state: unknown;
  report: HookReportState;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Tests and the QA harness only. The Inbox always starts collapsed. */
  defaultExpanded?: boolean;
} & HookRunNewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // No outreach audit at all: one quiet line. The header's Audit button is how one is started.
  if (!card || card.score.expected === 0) {
    if (report.kind === 'none') return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5" data-testid="hook-visibility-card">
        <span className={EYEBROW}>AI visibility</span>
        <ReportAction report={report} legacy={false} onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    );
  }

  const { score, rivalsWithheld } = card;
  const legacy = score.shape !== 'six';
  const askedQuestions = new Set(score.results.map((r) => r.questionIndex)).size;
  const autoMoved = isHookStateV2(state) ? state.auto_not_interested ?? null : null;
  const offerRunNew = !!onRunNew && (legacy || report.kind === 'incomplete' || report.kind === 'failed' || (!inFlight && !score.complete));
  const legacyLabel = score.shape === 'adaptive_legacy' ? 'Older quick check' : 'Older audit format';

  const runNewButton = offerRunNew ? (
    <button
      type="button"
      onClick={onRunNew}
      disabled={runNewBusy}
      data-testid="hook-run-new"
      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {runNewBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {RUN_NEW_LABEL}
    </button>
  ) : null;

  const engineSplit = (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs" data-testid="hook-engine-split">
      {score.perEngine.map((t) => (
        <span key={t.engine} className="whitespace-nowrap">
          <span className="text-muted-foreground">{t.label}</span>{' '}
          {inFlight && !score.complete ? (
            <span className="tabular-nums">{t.valid + t.failed}/{t.expected} checked</span>
          ) : t.valid === t.expected ? (
            <span className="font-semibold tabular-nums">{t.named}/{t.expected}</span>
          ) : (
            <span className="tabular-nums">{t.named} named of {t.valid} valid</span>
          )}
          {t.failed > 0 && <span className="text-destructive"> · {t.failed} failed</span>}
          {!inFlight && t.pending > 0 && <span className="text-muted-foreground"> · {t.pending} not run</span>}
        </span>
      ))}
    </div>
  );

  // The headline, right-aligned beside the eyebrow. A percentage only when complete.
  const headline = score.complete && score.percent !== null ? (
    <span className="whitespace-nowrap text-sm" data-testid="hook-headline">
      <span className="text-lg font-bold leading-none tabular-nums">{score.percent}%</span>{' '}
      <span className="font-medium">named</span>{' '}
      <span className="text-muted-foreground tabular-nums">({score.named}/{score.expected})</span>
    </span>
  ) : inFlight ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" data-testid="hook-headline">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking AI results {score.valid + score.failed}/{score.expected}
    </span>
  ) : (
    <span className="text-xs font-semibold" data-testid="hook-headline">{legacy ? 'Incomplete older check' : 'Incomplete quick check'}</span>
  );

  return (
    <div className="border-b border-border px-3 py-1.5 text-sm" data-testid="hook-visibility-card" data-expanded={expanded ? 'true' : 'false'}>
      {/* Row 1: label, engine split, headline. One line on desktop so the thread keeps its room. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={EYEBROW}>AI visibility</span>
          {legacy && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400" data-testid="hook-legacy-label">
              {legacyLabel}
            </span>
          )}
          {engineSplit}
        </span>
        {headline}
      </div>

      {legacy && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {score.shape === 'adaptive_legacy'
            ? `This used the previous early-stop method: it stopped after ${askedQuestions === 1 ? 'one question' : `${countWord(askedQuestions)} questions`}, so it is scored out of ${score.expected}, not ${HOOK_SCORE_QUESTIONS * HOOK_ENGINES.length}.`
            : `An older audit, scored out of its own ${score.expected} results.`}
        </p>
      )}

      {/* Incomplete: say why, never a score. */}
      {!score.complete && !inFlight && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {score.questionShortfall ? `Unable to create ${HOOK_SCORE_QUESTIONS} valid questions (only ${askedQuestions} could be asked). ` : ''}
          {score.valid} of {score.expected} results valid{score.failed ? `, ${score.failed} failed` : ''}{score.pending ? `, ${score.pending} not run` : ''}. No final score. Failed results are not counted as “not named”.
        </p>
      )}

      {/* The one line that matters for outreach. Current format only; an older check points at the rerun. */}
      {score.complete && !legacy && (
        score.allNamed ? (
          <p className="mt-1 text-xs">
            <span className="font-medium">Named in all {countWord(score.expected)} results.</span>{' '}
            <span className="text-muted-foreground">No missed-search hook.</span>
            {autoMoved && <span className="text-muted-foreground" title={autoMoved.reason}> Moved to Not interested automatically ({HOOK_ALL_NAMED_REASON}). Nothing was deleted or sent.</span>}
          </p>
        ) : score.hook ? (
          <p className={cn('mt-1 break-words text-xs', !expanded && 'line-clamp-2')} data-testid="hook-best-miss" title={score.hook.question}>
            <span className="text-muted-foreground">Best missed search: </span>
            <span className="font-medium">“{score.hook.question}”</span>{' '}
            <span className="whitespace-nowrap"><span className="font-semibold">{score.hook.label}</span><span className="text-amber-700 dark:text-amber-400"> · Not named</span></span>
          </p>
        ) : null
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {runNewButton}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          data-testid="hook-toggle-details"
          className={ACTION_BTN}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? 'Hide details' : legacy ? 'View old details' : 'View details'}
        </button>
        <ReportAction report={report} legacy={legacy} onRefresh={onRefresh} refreshing={refreshing} />
      </div>

      {expanded && <Details score={score} rivalsWithheld={rivalsWithheld} legacy={legacy} />}
    </div>
  );
}
