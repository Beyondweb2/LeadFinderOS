import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Target, ArrowLeft } from 'lucide-react';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  buildBaselineView, BANDS, BAND_LABEL, BAND_MEANING,
  type BaselineView, type Band, type QueueRowLite,
} from '@/lib/baselineView';
import { SEOHead } from '@/components/SEOHead';

/**
 * OPERATOR VIEW of a paid client's baseline — /baseline/:auditId.
 *
 * The 10-question, 2-engine, 3-run baseline that runs when someone pays had no view at all: it was
 * measured, stored in ai_audits.baseline, and never shown. This is that data as delivery work.
 *
 * Counts only — no score and no verdict. Notably NOT the winnability classifier: it reads a single
 * run, and competitor lists differ between runs, so its output flips between identical runs. Every
 * number here is "named in N of the 3 runs", which you can check against the raw rows by eye.
 *
 * OPERATOR-ONLY. Mounted inside the authenticated shell, never on a public route. The customer gets
 * a before-and-after at week 8, not the working detail: the answer text and the competitor lists are
 * for deciding what to do, and handing them over turns your delivery insight into their shopping
 * list. Do not link this from anything a client can reach.
 */

const BAND_STYLE: Record<Band, { row: string; chip: string }> = {
  absent:     { row: 'border-l-2 border-l-red-500/70',    chip: 'bg-red-500/15 text-red-400' },
  one_engine: { row: 'border-l-2 border-l-amber-500/70',  chip: 'bg-amber-500/15 text-amber-400' },
  fragile:    { row: 'border-l-2 border-l-sky-500/70',    chip: 'bg-sky-500/15 text-sky-400' },
  held:       { row: 'border-l-2 border-l-green-500/60',  chip: 'bg-green-500/15 text-green-500' },
  // Visually demoted on purpose: there is nothing to win here, so it must not compete for attention.
  no_race:    { row: 'border-l-2 border-l-border opacity-50', chip: 'bg-muted text-muted-foreground' },
};

interface AuditRow {
  id: string;
  lead_id: string | null;
  business_name: string | null;
  baseline: { measured_at?: string } | null;
  baseline_completed_at: string | null;
}

export default function Baseline() {
  const { auditId } = useParams<{ auditId: string }>();
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [view, setView] = useState<BaselineView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!auditId) return;
    setIsLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as SupabaseClient;
      const { data: a, error: aErr } = await client
        .from('ai_audits')
        .select('id, lead_id, business_name, baseline, baseline_completed_at')
        .eq('id', auditId).maybeSingle();
      if (aErr) throw aErr;
      if (!a) { setError('No audit with that id.'); setAudit(null); setView(null); return; }
      const row = a as AuditRow;
      setAudit(row);

      /* Paginated: ai_audit_queue is questions x runs, the table likeliest to cross the 1000-row cap
         PostgREST truncates at silently. A truncated page here would quietly shrink a denominator and
         make a question look better than it is, which is the one thing this view must not do. */
      const { rows } = await fetchAllRows<QueueRowLite>('Baseline (queue)', (from, to) =>
        client.from('ai_audit_queue')
          .select('run_id, question, engines, status, result')
          .eq('audit_id', auditId)
          .order('id', { ascending: true })
          .range(from, to));

      setView(buildBaselineView(rows, {
        businessName: row.business_name,
        measuredAt: row.baseline?.measured_at ?? row.baseline_completed_at ?? null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that baseline.');
    } finally {
      setIsLoading(false);
    }
  }, [auditId]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error || !audit || !view) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-muted-foreground">{error ?? 'No baseline to show.'}</p>
        <Link to="/paid-clients" className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Paid Clients
        </Link>
      </div>
    );
  }

  const engineNames = [...new Set(view.questions.flatMap((q) => Object.keys(q.engines)))].sort();

  return (
    <>
      <SEOHead
        title={`Baseline — ${audit.business_name ?? 'client'}`}
        description="Operator view of a paid client's baseline."
        noindex
      />
      <div className="mx-auto max-w-5xl space-y-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{audit.business_name ?? 'Baseline'}</h1>
            <p className="text-xs text-muted-foreground">
              {view.questions.length} questions · {view.runsCounted} runs
              {view.measuredAt && ` · measured ${new Date(view.measuredAt).toLocaleDateString('en-GB')}`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {view.namedRatePct === null ? '—' : `${view.namedRatePct}%`}
            </div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              named in {view.namedCells} of {view.answeredCells} answers
            </p>
          </div>
        </div>

        {/* Band counts — the shape of the work at a glance, worst first. */}
        <div className="flex flex-wrap gap-1.5">
          {BANDS.filter((b) => view.bandCounts[b] > 0).map((b) => (
            <span key={b} className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BAND_STYLE[b].chip}`} title={BAND_MEANING[b]}>
              {BAND_LABEL[b]} {view.bandCounts[b]}
            </span>
          ))}
        </div>

        {BANDS.filter((b) => view.bandCounts[b] > 0).map((band) => (
          <Card key={band} className={band === 'no_race' ? 'opacity-60' : undefined}>
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${BAND_STYLE[band].chip}`}>
                  {BAND_LABEL[band]}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{BAND_MEANING[band]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-3 pt-0 sm:p-4 sm:pt-0">
              {view.questions.filter((q) => q.band === band).map((q) => (
                <div key={q.question} className={`rounded-r-md bg-muted/20 py-2 pl-3 pr-2 ${BAND_STYLE[band].row}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{q.question}</span>
                    <span className="flex shrink-0 gap-3 text-[11px] tabular-nums text-muted-foreground">
                      {engineNames.map((e) => {
                        const c = q.engines[e];
                        if (!c) return null;
                        const all = c.named > 0 && c.named >= c.runs;
                        const none = c.named === 0;
                        return (
                          <span key={e}>
                            {e}{' '}
                            <span className={`font-bold ${all ? 'text-green-500' : none ? 'text-red-400' : 'text-amber-400'}`}>
                              {c.named}/{c.runs}
                            </span>
                          </span>
                        );
                      })}
                    </span>
                  </div>
                  {q.competitors.length > 0 && (
                    /* Recurrence, not a ranking. A firm at 6/6 was named in every cell — that is the
                       incumbent to study, and it is a count you can verify. */
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                      named instead:{' '}
                      {q.competitors.slice(0, 5).map((c, i) => (
                        <span key={c.name}>
                          {i > 0 && ', '}
                          {c.name} <span className="tabular-nums text-muted-foreground/60">({c.times}/{c.of})</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          Counts across {view.runsCounted} runs on {engineNames.join(' and ')}. No score or verdict is
          used: a single-run classification flips between identical runs, which is why the baseline is
          averaged. Operator view — not for the client.
        </p>
      </div>
    </>
  );
}
