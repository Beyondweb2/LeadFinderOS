import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokePaidBaselineRaw, type HealthLine, type PaidBaseline } from '@/lib/paidBaseline';
import { needsAttention } from '@/lib/measurementHealth';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT HAPPENED TO THE MEASUREMENT, AND WHAT PAUL DOES ABOUT IT (2026-10-04, fix/04 — Session C C-10,
   C-11; master plan M-027 / M-032).

   One line per guarantee measurement (the baseline, and the day-28 re-measure once it exists):
   running / complete / partial / capped / failed — "118 of 120 answers — 2 missing (…)". The actions
   are the server's, each with its own claim:
     Retry missing answers  — re-asks ONLY the missing cells, inside the existing runs (paid-baseline
                              retry_missing). Never a new run, never a second baseline.
     Accept as partial…     — only when the missing cells cannot be re-asked; a written reason is kept.
     Send four-week results — the same claim-first sender as the queue; still held while the results
                              copy is unapproved, never sent twice, never to an ended client.
   And the budget line: whether client measurement has room today (src/lib/auditBudget.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const STATE_LABEL: Record<HealthLine['state'], string> = {
  running: 'Measuring', complete: 'Complete', partial: 'Partial', capped: 'Stopped by a cap', failed_retryable: 'Failed — retryable', failed_permanent: 'Failed',
};

export function MeasurementHealthPanel({ data, leadId, onChanged }: { data: PaidBaseline; leadId: string; onChanged: (next: PaidBaseline) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = async (key: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(key); setNote(null);
    try {
      const res = await invokePaidBaselineRaw<{ requeued?: number; results?: { kind: string; reason?: string } }>(action, leadId, extra);
      onChanged(res.baseline);
      if (action === 'retry_missing') setNote(res.requeued ? `${res.requeued} missing question(s) re-asked. The queue picks them up within a minute.` : 'Nothing was missing that could be re-asked.');
      if (action === 'accept_partial') setNote('Accepted as partial. It freezes on the next tick, marked partial.');
      if (action === 'send_results') setNote(res.results?.kind === 'sent' ? 'Results sent.' : `Not sent: ${res.results?.reason ?? 'held'}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not do that — try again.');
    } finally { setBusy(null); }
  };
  const line = (title: string, h: (HealthLine & { frozen_at?: string | null }) | null | undefined, target: 'baseline' | 'remeasure') => {
    if (!h) return null;
    /* A FROZEN measurement short of its cells (accepted partial, or legacy) is history: shown, not actionable. */
    const frozen = !!h.frozen_at;
    const attention = !frozen && needsAttention(h.state);
    return <div className={`rounded border p-2 text-sm ${attention ? 'border-amber-400/60 bg-amber-500/10' : ''}`}>
      <p className="flex items-center gap-1.5 font-medium">
        {attention ? <AlertTriangle className="h-4 w-4 text-amber-600"/> : h.state === 'complete' || frozen ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>}
        {title}: {STATE_LABEL[h.state]}
      </p>
      <p className="text-xs text-muted-foreground">{h.label}</p>
      {h.action && <p className="mt-1 text-xs">{h.action}</p>}
      {!frozen && (h.state === 'capped' || h.state === 'failed_retryable') && h.retryable > 0 && <Button size="sm" variant="outline" className="mt-2" disabled={!!busy} onClick={() => void act(`retry-${target}`, 'retry_missing', { target })}>
        {busy === `retry-${target}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <RotateCcw className="mr-1 h-4 w-4"/>}Retry missing answers
      </Button>}
      {!frozen && h.state === 'partial' && h.retryable === 0 && <Button size="sm" variant="ghost" className="mt-2" disabled={!!busy} onClick={() => {
        const reason = window.prompt(`Freeze this ${title.toLowerCase()} with ${h.missing} answer(s) missing?\n\nNothing is invented — the missing answers are simply not counted. Why is that acceptable?`);
        if (reason !== null) void act(`accept-${target}`, 'accept_partial', { target, reason });
      }}>Accept as partial…</Button>}
    </div>;
  };
  const rm = data.remeasure;
  const guarantee = data.budget?.pools.find((p) => p.pool === 'guarantee');
  const apify = data.budget?.apify;
  if (!data.health && !rm && !data.budget) return null;
  return <section className="mt-3 space-y-2" aria-live="polite">
    {line('Baseline', data.health, 'baseline')}
    {rm && line('Re-measure', rm.health, 'remeasure')}
    {rm && !rm.results_sent_at && rm.health?.state === 'complete' && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void act('send', 'send_results')}>
      {busy === 'send' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Send className="mr-1 h-4 w-4"/>}Send four-week results
    </Button>}
    {rm?.results_sent_at && <p className="text-xs text-muted-foreground">Four-week results sent {new Date(rm.results_sent_at).toLocaleDateString('en-GB')}.</p>}
    {guarantee && <p className="text-xs text-muted-foreground">
      Client measurement budget (last 24h): {guarantee.spentUsd == null ? 'unknown' : `$${guarantee.spentUsd.toFixed(2)}`} of ${guarantee.capUsd.toFixed(2)}{!guarantee.pooledLedger ? ' (the budget-pool SQL has not run yet)' : ''}
      {apify?.pct != null ? ` · Apify ${apify.pct}% of the month` : ''}
      {guarantee.decision && !guarantee.decision.allowed ? ` — ${guarantee.decision.message}` : ''}
    </p>}
    {note && <p className="text-xs">{note}</p>}
  </section>;
}
