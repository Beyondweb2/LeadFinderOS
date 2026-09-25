import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { HOOK_ALL_NAMED_REASON, hookMissSentence, isHookStateV2, type HookResult, type HookScore } from '@/lib/hookScore';
import type { HookCardScore } from '@/lib/hookVisibility';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI VISIBILITY: the Inbox's compact read of the lead's hook audit (2026-09-25).

   At a glance: "they're visible in four of six results" and "this is the exact search I can use to
   message them". Operator-only. It reads, it never sends.

   ⛔ NO PERCENTAGE UNTIL COMPLETE. A running check shows progress per engine. A finished check with
   a failed result says INCOMPLETE, and a failure is never shown as "not named".
   ⛔ AN OLD AUDIT KEEPS ITS OWN DENOMINATOR. A version-1 hook that stopped after one question reads
   "50% named (1/2)" and is labelled as the older format. It is never padded to six.
   ⛔ ENGINE-SPECIFIC WORDS. "Google AI didn't name you for this search", never "AI doesn't …".
   ⛔ NO LABELS LIKE poor/good/excellent. The numbers are the judgement (Paul).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const countWord = (n: number) => (['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n));

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

/** Per-engine line. In flight it is PROGRESS (results checked), never a partial score. An engine with
 *  a failed result shows named-of-valid plus the failure, never a count out of the full three. */
function engineTally(score: HookScore, inFlight: boolean) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
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
}

function MissedList({ score, excludeKey }: { score: HookScore; excludeKey: string | null }) {
  const others = score.misses.filter((m) => `${m.questionIndex}:${m.engine}` !== excludeKey);
  const byEngine = score.perEngine.map((t) => ({ t, items: others.filter((m) => m.engine === t.engine) }));
  return (
    <div className="space-y-1.5">
      <div className={EYEBROW}>{excludeKey ? 'Other missed searches' : 'Missed searches'}</div>
      {byEngine.map(({ t, items }) => (
        <div key={t.engine} className="text-xs">
          <div className="font-medium">{t.label}</div>
          {t.named === t.expected && t.expected > 0 ? (
            <p className="text-muted-foreground">{t.expected === 1 ? `Named in the one ${t.label} search.` : `Named in all ${countWord(t.expected)} ${t.label} searches.`}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">No other missed {t.label} searches.</p>
          ) : (
            <ul className="ml-4 list-disc space-y-0.5">
              {items.map((m) => <li key={m.questionIndex} className="break-words">{m.question}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function statusText(r: HookResult): string {
  return r.status === 'named' ? 'Named' : r.status === 'not_named' ? 'Not named' : r.status === 'failed' ? 'Failed (not counted)' : 'Waiting';
}

function AllResults({ score }: { score: HookScore }) {
  const [open, setOpen] = useState(false);
  const namedBy = score.perEngine.map((t) => `${t.label}: ${t.named}`).join(' · ');
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Named searches: {score.named} <span className="hidden sm:inline">({namedBy})</span> · all {score.expected} results
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {score.results.map((r) => (
            <li key={`${r.questionIndex}:${r.engine}`} className="rounded border border-border p-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="break-words font-medium">{r.question}</span>
                <span className={cn('whitespace-nowrap', r.status === 'named' ? 'text-green-600 dark:text-green-400' : r.status === 'not_named' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  {r.label} · {statusText(r)}
                </span>
              </div>
              {r.answerExcerpt && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{r.answerExcerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HookVisibilityCard({ leadId }: { leadId: string | null | undefined }) {
  const q = useHookVisibility(leadId);
  if (!leadId || q.isLoading || !q.data) {
    if (q.isError) return <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">AI visibility: could not load the audit results.</div>;
    return null;
  }
  return <HookVisibilityView card={q.data.card} inFlight={q.data.inFlight} state={q.data.state} />;
}

/** The presentational half: no fetching, so it renders from plain data. */
export function HookVisibilityView({ card, inFlight, state }: { card: HookCardScore; inFlight: boolean; state: unknown }) {
  const [collapsed, setCollapsed] = useState(false);
  const { score, rivalsWithheld } = card;
  if (score.expected === 0) return null;

  const legacy = score.shape !== 'six';
  const autoMoved = isHookStateV2(state) ? state.auto_not_interested ?? null : null;
  const hookKey = score.hook ? `${score.hook.questionIndex}:${score.hook.engine}` : null;

  return (
    <div className="border-b border-border px-3 py-2 text-sm" data-testid="hook-visibility-card">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCollapsed((v) => !v)} className={cn(EYEBROW, 'inline-flex items-center gap-1 hover:text-foreground')}>
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} AI visibility
        </button>
        {legacy && (
          <span className="text-right text-[10px] text-muted-foreground">
            {score.shape === 'adaptive_legacy' ? 'Older quick check (stopped early)' : 'Older audit format'} · scored out of {score.expected}
          </span>
        )}
      </div>

      {/* The headline. A percentage only when every expected result is a valid answer. */}
      {score.complete && score.percent !== null ? (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold leading-none tabular-nums">{score.percent}%</span>
          <span className="text-sm font-medium">named</span>
          <span className="text-sm text-muted-foreground tabular-nums">({score.named}/{score.expected})</span>
        </div>
      ) : inFlight ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Checking AI results {score.valid + score.failed}/{score.expected}</span>
        </div>
      ) : (
        <div className="mt-0.5 text-sm">
          <span className="font-semibold">Incomplete</span>
          <span className="text-muted-foreground"> · {score.valid} of {score.expected} results valid{score.failed ? `, ${score.failed} failed` : ''}{score.pending ? `, ${score.pending} not run` : ''}. No final score. Failed results are not counted as “not named”.</span>
        </div>
      )}
      {engineTally(score, inFlight)}

      {!collapsed && score.complete && (
        <div className="mt-2 space-y-2">
          {score.allNamed ? (
            <div className="text-xs">
              <p className="font-medium">
                Named in all {countWord(score.expected)} tested AI results.
              </p>
              <p className="text-muted-foreground">No missed-search hook available.</p>
              {autoMoved && (
                <p className="mt-0.5 text-muted-foreground" title={autoMoved.reason}>
                  Moved to Not interested automatically ({HOOK_ALL_NAMED_REASON}). Nothing was deleted or sent.
                </p>
              )}
            </div>
          ) : score.hook ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <div className={EYEBROW}>Best outreach search</div>
              <p className="mt-0.5 break-words font-medium">“{score.hook.question}”</p>
              <p className="mt-0.5 text-xs">
                <span className="font-semibold">{score.hook.label}</span>
                <span className="text-amber-700 dark:text-amber-400"> · Not named</span>
                <span className="text-muted-foreground"> · {hookMissSentence(score.hook.label)}</span>
              </p>
              <p className="mt-1 break-words text-xs">
                <span className="text-muted-foreground">{score.hook.label} mentioned: </span>
                {rivalsWithheld
                  ? <span className="italic text-muted-foreground">names withheld (this run’s competitor list failed cleaning)</span>
                  : score.hook.competitors.length
                    ? score.hook.competitors.slice(0, 5).join(', ')
                    : <span className="italic text-muted-foreground">no competitor names extracted for this answer</span>}
              </p>
            </div>
          ) : null}
          {!score.allNamed && <MissedList score={score} excludeKey={hookKey} />}
          <AllResults score={score} />
        </div>
      )}
      {!collapsed && !score.complete && !inFlight && <div className="mt-2"><AllResults score={score} /></div>}
    </div>
  );
}
