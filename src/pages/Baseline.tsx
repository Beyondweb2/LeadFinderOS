import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Target, ArrowLeftRight, FileText } from 'lucide-react';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AiAuditReport } from '@/components/AiAuditReport';
import { downloadReportHtml } from '@/lib/aiAuditReportDownload';
import { isAggregatorUrl } from '@/lib/aggregators';
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from '@/lib/auditReport';
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells } from '@/lib/competitorCleaning';
import { type AiAuditReportData } from '@/lib/aiAuditReportHtml';
import {
  buildBaselineView, BANDS, BAND_LABEL, BAND_MEANING,
  type BaselineView, type Band, type QueueRowLite,
} from '@/lib/baselineView';
import { assessTradeFit, TRADE_FIT_LABEL, TRADE_FIT_REASON } from '@/lib/questionTradeFit';
import { SEOHead } from '@/components/SEOHead';
import { isInternalMeasurement, INTERNAL_MEASUREMENT_LABEL } from '@/lib/auditKind';

/**
 * OPERATOR VIEW of a paid client's baseline — /baseline/:auditId.
 *
 * The 12-question (home town only), 2-engine, 3-run baseline that runs when someone pays had no view at all: it was
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
  // Gate + carry the run target for "Re-run this measurement". is_measurement is a hand-added column
  // (absent from generated types) — read via the loosely-typed client below so it does not type-error.
  is_measurement: boolean | null;
  baseline_target_runs: number | null;
  /* With is_measurement + baseline_target_runs, feeds isInternalMeasurement: a full measure or a
     day-28 replay is an operator document, so this page must not offer a client report for it. */
  audit_purpose: string | null;
  // Report context only — buildReportData needs the trade, the town and the client's own domain
  // (the last one enables the citation half of the "cited as a source" figure; without it this
  // report would show a LOWER cited count than the live client report, which does pass it).
  business_type: string | null;
  location_text: string | null;
  website: string | null;
}

export default function Baseline() {
  /* The state THIS page was reached with, forwarded to anywhere that links onward, so a
     multi-hop trail (AI Audit → Baseline → Compare → Baseline) still knows its origin. */
  const backState = useLocation().state ?? undefined;
  const { auditId } = useParams<{ auditId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [view, setView] = useState<BaselineView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /* THE CLIENT REPORT, shown over this page on request. Deliberately NOT persisted: it is a view
     you opened, and springing it open on return is the "never restore an interruption" rule. The
     queue rows are kept from the page's own load so opening it costs no extra read. */
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [report, setReport] = useState<AiAuditReportData | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  /* Whether the rival names in that report can be trusted. buildReportData ALREADY withholds them
     on a dirty run — the report itself is safe by construction — but silence with no explanation
     reads as "AI named nobody", which is the opposite of what a dirty run means. This state exists
     to tell the OPERATOR the difference, exactly as the AI Audit page does. */
  const [reportDirty, setReportDirty] = useState(false);

  /* WHY THIS PAGE CAN SHOW A CLIENT REPORT AT ALL, given the operator-only warning above: the
     REPORT is the client artefact — it is what render-audit-report serves at findable.live and
     what the prospect already receives. What must never reach a client is THIS page's working
     detail (answer text, full rival lists). Showing the report here changes who can see nothing.

     ⛔ RENDERED IN-APP, NEVER BY OPENING findable.live/report/<auditId>. That public URL is the
     one the prospect opens, and fetching it stamps ai_audits.open_count + first_opened_at — so an
     operator preview would forge a "human open" and permanently own the first one. The Inbox and
     LeadDeliveryCockpit already link to the public URL and pay exactly that cost (useCampaignStats
     records it). This path touches no tracking.

     ⛔ POOLED ACROSS EVERY RUN, which is why it passes the page's own rows. buildReportData counts
     over the rows it is HANDED (it does not filter by run), and this page already loads every run's
     rows for the same reason the header can say "0 of 30". Handing it one run's rows would report a
     3-run measurement on a third of its evidence, and the report would quietly disagree with the
     figure printed directly above the button. */
  const openReport = async () => {
    if (!audit || reportBusy) return;
    setReportBusy(true);
    try {
      /* The newest run, for its cleaning receipt and metadata only — the COUNTS come from the
         pooled rows above. `results` is where extract-competitors stamps whether it covered the
         run; buildReportData reads it to decide whether rival names can be trusted. */
      const { data: runRow } = await (supabase as unknown as SupabaseClient)
        .from('ai_audit_runs')
        .select('id, audit_id, run_number, status, mention_rate, results, created_at')
        .eq('audit_id', audit.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const data = buildReportData(queueRows, (runRow as RunRow | null) ?? null, {
        businessName: audit.business_name ?? '',
        businessType: audit.business_type ?? '',
        locationText: audit.location_text ?? '',
        specialisms: '',
        isAggregatorUrl,
        seoStyle: seoStyleForAudit(audit.baseline_target_runs, audit.is_measurement),
        ownWebsite: audit.website ?? '',
      });
      if (!data) {
        toast({ title: 'No completed results to report yet', variant: 'destructive' });
        return;
      }
      setReportDirty(
        assessCompetitorCleanliness(
          collectCompetitorNames(queueRows),
          (runRow as RunRow | null)?.results,
          { answeredCells: countAnsweredCells(queueRows) },
        ).suppressNames,
      );
      setReport(data);
    } catch (e) {
      toast({
        title: "Couldn't build the report",
        description: e instanceof Error ? e.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setReportBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!auditId) return;
    setIsLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as SupabaseClient;
      const { data: a, error: aErr } = await client
        .from('ai_audits')
        .select('id, lead_id, business_name, baseline, baseline_completed_at, is_measurement, baseline_target_runs, audit_purpose, business_type, location_text, website')
        .eq('id', auditId).maybeSingle();
      if (aErr) throw aErr;
      if (!a) { setError('No audit with that id.'); setAudit(null); setView(null); return; }
      const row = a as AuditRow;
      setAudit(row);

      /* Paginated: ai_audit_queue is questions x runs, the table likeliest to cross the 1000-row cap
         PostgREST truncates at silently. A truncated page here would quietly shrink a denominator and
         make a question look better than it is, which is the one thing this view must not do. */
      /* `id` is here only for the report: buildReportData takes QueueRow (id/question/status/
         result). One read feeds both consumers rather than two reads that could disagree. */
      const { rows } = await fetchAllRows<QueueRowLite & { id: string }>('Baseline (queue)', (from, to) =>
        client.from('ai_audit_queue')
          .select('id, run_id, question, engines, status, result')
          .eq('audit_id', auditId)
          .order('id', { ascending: true })
          .range(from, to));

      setQueueRows(rows as unknown as QueueRow[]);
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
        {/* Same component as the success state below and as /playbook/:id — one pattern, three
            places, so they cannot drift apart. */}
        <div className="mt-3"><BackLink /></div>
      </div>
    );
  }

  /* THE REPORT TAKES OVER THE PAGE while open. Not a dialog and not persisted: onBack returns to
     the baseline, and a reload lands back on the operator view, which is this page's job. */
  if (report) {
    return (
      <>
        <SEOHead title={`Report — ${audit.business_name ?? 'client'}`} description="Client report preview." noindex />
        <div className="mx-auto max-w-5xl space-y-4 py-4">
          {reportDirty && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
              Competitor names not cleaned &mdash; do not send to client. Rival names are withheld from
              this report because the cleaner never covered this measurement, so an empty rivals list
              here means &ldquo;we cannot vouch for the names&rdquo;, not &ldquo;AI named nobody&rdquo;.
            </div>
          )}
          <AiAuditReport
            data={report}
            onBack={() => setReport(null)}
            onDownload={(internal) => downloadReportHtml({ ...report, internal })}
            onCompare={() => navigate(`/compare/${auditId}`)}
          />
        </div>
      </>
    );
  }

  const engineNames = [...new Set(view.questions.flatMap((q) => Object.keys(q.engines)))].sort();

  /* ⛔ COMPUTED HERE, NOT INSIDE buildBaselineView, AND THAT IS THE GATE. The fold feeds
     measurementCompare, which feeds the four-week results document a CLIENT reads; a flag hung on
     BaselineQuestion would travel there by default and have to be stripped by somebody remembering
     to. Keeping it in its own module, read only by this operator page, means it structurally
     cannot. ⚠️ `readable` false = this trade cannot be read off company names (a cocktail bar is
     not called "hospitality"), and nothing is flagged — see questionTradeFit's header. */
  const tradeFit = (() => {
    const report = assessTradeFit(view, audit.business_type);
    return { report, byQuestion: new Map(report.questions.map((q) => [q.question, q.state])) };
  })();
  /* A full measure / day-28 replay: operator document, no client report offered, labelled as
     what it is rather than "Baseline" (this route serves both — the cockpit and Compare link here
     for measurements too). */
  const internalOnly = isInternalMeasurement(audit);

  return (
    <>
      <SEOHead
        title={`${internalOnly ? INTERNAL_MEASUREMENT_LABEL : 'Baseline'} — ${audit.business_name ?? 'client'}`}
        description={internalOnly ? 'Operator view of an internal measurement.' : "Operator view of a paid client's baseline."}
        noindex
      />
      <div className="mx-auto max-w-5xl space-y-4 py-4">
        {/* Was missing entirely — this view was reachable only by URL and had no way out. */}
        <BackLink />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{audit.business_name ?? 'Baseline'}</h1>
            <p className="text-xs text-muted-foreground">
              {/* What this audit IS, in the operator's words. The stored purpose stays 'measurement';
                  the label is the only thing that changed (Paul, 2026-09-13). */}
              <span className={internalOnly ? 'font-semibold text-amber-500' : 'font-semibold'}>
                {internalOnly ? INTERNAL_MEASUREMENT_LABEL : 'Client baseline'}
              </span>
              {' · '}{view.questions.length} questions · {view.runsCounted} runs
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

        {/* BEFORE AND AFTER. Free — it re-reads runs that already exist and spends nothing, so it is
            a plain link rather than a priced action. Always offered: which runs are the "before" is
            the operator's call, and the comparison itself refuses honestly when there is nothing to
            compare rather than being hidden behind a guess made here. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            {/* ⛔ CARRY THE BACK-CHAIN FORWARD. Baseline ↔ Compare link to each other, so
                without passing state the trail from AI Audit is lost at the first hop and the
                two pages become a loop with no way out (Paul, 2026-09-10). Forwarding this
                page's own `from` means Compare, and Baseline again after it, still know where
                the operator actually started. */}
            <Link to={`/compare/${auditId}`} state={backState}>
              <ArrowLeftRight className="mr-2 h-4 w-4" /> Before and after
            </Link>
          </Button>
          {/* THE CLIENT REPORT. Read-only — it re-renders rows already loaded and calls no paid
              API. Rendered in-app, so it does NOT count as a report open (see openReport).
              ⛔ NOT OFFERED FOR AN INTERNAL MEASUREMENT (2026-09-13). A full measure or a day-28
              replay has no client document: the public renderer refuses it and this button must
              not manufacture one. Same predicate as the renderer (src/lib/auditKind.ts). */}
          {!internalOnly && (
            <Button variant="outline" size="sm" onClick={openReport} disabled={reportBusy}>
              {reportBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {reportBusy ? 'Building…' : 'View client report'}
            </Button>
          )}
        </div>

        {/* ⛔ THERE IS NO "RE-RUN THIS MEASUREMENT" BUTTON ANY MORE (2026-09-12). The day-28
            replay of a paid baseline is fired by process-ai-audit-queue against the lead's
            baseline_audit_id on the stored remeasure_due_date, and refused server-side if the
            question set differs. A hand-fired copy here was a second route to a comparable audit
            that nothing recorded. */}
        {/* Band counts — the shape of the work at a glance, worst first. */}
        <div className="flex flex-wrap gap-1.5">
          {BANDS.filter((b) => view.bandCounts[b] > 0).map((b) => (
            <span key={b} className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${BAND_STYLE[b].chip}`} title={BAND_MEANING[b]}>
              {BAND_LABEL[b]} {view.bandCounts[b]}
            </span>
          ))}
          {/* Counted separately from the bands ON PURPOSE: it is not a sixth band, it is a
              statement that some of the bands beside it cannot be trusted. */}
          {tradeFit.report.offTrade.length > 0 && (
            <span
              className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-500"
              title={TRADE_FIT_REASON.off_trade ?? undefined}
            >
              {TRADE_FIT_LABEL.off_trade} {tradeFit.report.offTrade.length}
            </span>
          )}
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
                    {/* ⛔ THE BAND IS NOT A FACT ABOUT THIS CLIENT WHEN THE ENGINES ANSWERED ABOUT
                        SOMEBODY ELSE'S TRADE. "fault diagnosis services in thetford UK" sat here
                        under ABSENT — "the race exists and you are invisible" — naming six car
                        garages. Rendered BEFORE the counts, because the counts are the thing it
                        disqualifies. Operator screen only: see questionTradeFit's header. */}
                    {tradeFit.byQuestion.get(q.question) === 'off_trade' && (
                      <span
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-500"
                        title={TRADE_FIT_REASON.off_trade ?? undefined}
                      >
                        {TRADE_FIT_LABEL.off_trade}
                      </span>
                    )}
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
                    /* ⛔ NAMES ONLY ON THIS SCREEN (Paul, 2026-09-14). It used to print "(6/6)" after
                       each firm. The COUNTS ARE NOT DELETED and nothing downstream changed: they
                       still order this list, and `topCompetitorTimes` is still the within-band sort
                       key in buildBaselineView — so the firm named in every cell is still the one
                       printed first. What went is the formatting of a number the operator reading
                       his own screen does not need spelled out; the order already says it.
                       ⚠️ THE CLIENT REPORT IS A DIFFERENT DECISION and still carries its counts —
                       there the number is the proof that the ranking is real to somebody who cannot
                       check it. Do not "make these consistent". */
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                      named instead: {q.competitors.slice(0, 5).map((c) => c.name).join(', ')}
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
