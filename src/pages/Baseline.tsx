import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { paidClientToolUrl } from '@/lib/paidClientTools';
import { BackLink } from '@/components/BackLink';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Target, ArrowLeftRight, FileText, AlertTriangle, Sparkles } from 'lucide-react';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { AiAuditReport } from '@/components/AiAuditReport';
import { downloadReportHtml } from '@/lib/aiAuditReportDownload';
import { paidReportKind } from '@/lib/reportKind';
import { isAggregatorUrl } from '@/lib/aggregators';
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from '@/lib/auditReport';
import { opportunityFor } from '@/lib/discoveryOpportunity';
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells } from '@/lib/competitorCleaning';
import { type AiAuditReportData } from '@/lib/aiAuditReportHtml';
import {
  buildBaselineView, BANDS, BAND_LABEL, BAND_MEANING,
  type BaselineView, type Band, type QueueRowLite,
} from '@/lib/baselineView';
import { assessTradeFit, TRADE_FIT_LABEL, TRADE_FIT_REASON } from '@/lib/questionTradeFit';
import { SEOHead } from '@/components/SEOHead';
import { Callout, EmptyState, ErrorState, Figure, LoadState, PageHeader, SubSection, SURFACE, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { isInternalMeasurement, isClientBaseline, auditRoleLabel } from '@/lib/auditKind';

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

/* The operator tones (components/operator/ui): red absent · amber one engine · blue fragile ·
   green (drawn teal) held · grey no race. */
const BAND_STYLE: Record<Band, { row: string; tone: Tone }> = {
  absent:     { row: 'border-l-2 border-l-red-500/70',    tone: 'red' },
  one_engine: { row: 'border-l-2 border-l-amber-500/70',  tone: 'amber' },
  fragile:    { row: 'border-l-2 border-l-blue-500/70',   tone: 'blue' },
  held:       { row: 'border-l-2 border-l-teal-500/60',   tone: 'green' },
  // Visually demoted on purpose: there is nothing to win here, so it must not compete for attention.
  no_race:    { row: 'border-l-2 border-l-border opacity-50', tone: 'grey' },
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

/* The classifier lives in src/lib/discoveryOpportunity.ts — the paid-client Discovery step uses the
   same one. It performs no provider call and does not create a second measurement. */
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
      /* The operator's view of a paid baseline shows the SAME top the client sees, so this page and
         findable.live/r/<code> cannot disagree about what the report looks like. Legacy rows with no
         recorded purpose are covered by the lead's claim on the public route; here the audit row is
         all this page has, so an unmarked legacy baseline keeps the existing header in the internal
         view only. */
      const paidKind = paidReportKind({
        auditId: audit.id,
        auditPurpose: (audit as { audit_purpose?: string | null }).audit_purpose ?? null,
      });
      if (paidKind) data.paidSummary = paidKind;
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
        /* Trade + town let the answer TEXT decide "named" (namedSignal.ts) — the same context the
           report builder below is given, so summary and report read one ruler. */
        trade: row.business_type,
        town: row.location_text,
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
    return <LoadState label="Loading the baseline…" className="py-16" />;
  }

  if (error || !audit || !view) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-12">
        {error ? <ErrorState title={error} onRetry={() => void load()} /> : <EmptyState icon={Target} tone="purple" title="No baseline to show." />}
        {/* Same component as the success state below and as /playbook/:id — one pattern, three
            places, so they cannot drift apart. */}
        <div><BackLink /></div>
      </div>
    );
  }

  /* THE REPORT TAKES OVER THE PAGE while open. Not a dialog and not persisted: onBack returns to
     the baseline, and a reload lands back on the operator view, which is this page's job. */
  if (report) {
    return (
      <>
        <SEOHead title={`Report — ${audit.business_name ?? 'client'}`} description="Client report preview." noindex />
        <div className="mx-auto min-w-0 max-w-5xl space-y-4 px-4 py-4 sm:px-0">
          {reportDirty && (
            <Callout tone="amber" icon={AlertTriangle} className="text-xs">
              Competitor names not cleaned &mdash; do not send to client. Rival names are withheld from
              this report because the cleaner never covered this measurement, so an empty rivals list
              here means &ldquo;we cannot vouch for the names&rdquo;, not &ldquo;AI named nobody&rdquo;.
            </Callout>
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
  const internalOnly = isInternalMeasurement(audit);
  /* ⛔ ASK THE POSITIVE QUESTION. `!internalOnly` is not "this is the client's baseline" — it is
     "this is not a full measure", and discovery, the free check and every ordinary outreach audit
     satisfy it. On 2026-09-21 that announced MCLocksmiths' 80-question discovery scan as their
     client baseline. One rule, in src/lib/auditKind.ts, asserted on 'baseline'. */
  const clientBaseline = isClientBaseline(audit);
  const roleLabel = auditRoleLabel(audit);
  const opportunities = audit.baseline_completed_at && !internalOnly
    ? view.questions.map((q) => ({ question: q.question, ...opportunityFor(q.question, queueRows, { businessName: audit.business_name ?? '', location: audit.location_text ?? '', website: audit.website ?? '', trade: audit.business_type ?? '', isAggregatorUrl }) }))
    : [];
  const opportunityCounts = opportunities.reduce((m, q) => { m[q.classification] = (m[q.classification] ?? 0) + 1; return m; }, {} as Record<string, number>);
  /* A full measure / day-28 replay: operator document, no client report offered, labelled as
     what it is rather than "Baseline" (this route serves both — the cockpit and Compare link here
     for measurements too). */
  return (
    <>
      <SEOHead
        title={`${clientBaseline ? 'Baseline' : roleLabel} — ${audit.business_name ?? 'client'}`}
        description={clientBaseline ? "Operator view of a paid client's baseline." : 'Operator view of an audit that is not a client baseline.'}
        noindex
      />
      <div className="mx-auto min-w-0 max-w-5xl space-y-4 px-4 py-4 sm:px-0">
        {/* Was missing entirely — this view was reachable only by URL and had no way out. */}
        <BackLink />
        <PageHeader icon={Target} tone="purple" eyebrow="Paid client" title={audit.business_name ?? 'Baseline'}
          subtitle={<>
            {/* What this audit IS, in the operator's words. The stored purpose stays 'measurement';
                the label is the only thing that changed (Paul, 2026-09-13). */}
            <span className={clientBaseline ? 'font-semibold text-foreground' : 'font-semibold text-amber-600 dark:text-amber-400'}>
              {roleLabel}
            </span>
            {' · '}{view.questions.length} questions · {view.runsCounted} runs
            {view.measuredAt && ` · measured ${new Date(view.measuredAt).toLocaleDateString('en-GB')}`}
          </>}
          actions={<div className="min-w-[10rem]"><Figure tone="purple" strong
            label={`named in ${view.namedCells} of ${view.answeredCells} answers`}
            value={view.namedRatePct === null ? '—' : `${view.namedRatePct}%`} /></div>} />

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
          {/* ⛔ AND THE CLIENT DOCUMENT IS OFFERED ONLY FOR A CLIENT BASELINE. Under `!internalOnly`
              this button also appeared on a discovery scan, i.e. it offered to build a client report
              out of an 80-question operator breadth scan. */}
          {clientBaseline && (
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
            <ToneChip key={b} tone={BAND_STYLE[b].tone} dot title={BAND_MEANING[b]}>
              {BAND_LABEL[b]} {view.bandCounts[b]}
            </ToneChip>
          ))}
          {/* Counted separately from the bands ON PURPOSE: it is not a sixth band, it is a
              statement that some of the bands beside it cannot be trusted. */}
          {tradeFit.report.offTrade.length > 0 && (
            <ToneChip tone="amber" icon={AlertTriangle} title={TRADE_FIT_REASON.off_trade ?? undefined}>
              {TRADE_FIT_LABEL.off_trade} {tradeFit.report.offTrade.length}
            </ToneChip>
          )}
        </div>

        {opportunities.length > 0 && (
          <section className={cn(SURFACE, 'min-w-0 p-4 sm:p-5')}>
            <SubSection title="Winnability from this baseline" icon={Sparkles} tone="purple">
              <p className="text-xs font-normal text-muted-foreground">Same approved questions and completed results; named means success. No additional audit was run.</p>
            </SubSection>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <ToneChip tone="green">Named {opportunityCounts.named ?? 0}</ToneChip>
                <ToneChip tone="amber">Winnable {opportunityCounts.winnable ?? 0}</ToneChip>
                <ToneChip tone="blue">Possible {opportunityCounts.possible ?? 0}</ToneChip>
                <ToneChip tone="grey">Low priority {opportunityCounts.low ?? 0}</ToneChip>
              </div>
              <div className="space-y-1.5">
                {opportunities.map((q) => (
                  <div key={q.question} className="min-w-0 rounded-xl bg-muted/40 p-2.5 text-xs ring-1 ring-inset ring-border/40">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words font-medium">{q.question}</span><span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase">{q.classification}</span></div>
                    <p className="mt-1 text-muted-foreground">{q.reason} · {q.fragmentation}</p>
                  </div>
                ))}
              </div>
              <Button asChild variant="outline" size="sm"><Link to={paidClientToolUrl('page-plan')}>Build Action Plan</Link></Button>
            </div>
          </section>
        )}

        {BANDS.filter((b) => view.bandCounts[b] > 0).map((band) => (
          <section key={band} className={cn(SURFACE, 'min-w-0 p-4 sm:p-5', band === 'no_race' && 'opacity-60')}>
            <SubSection icon={Target} tone={BAND_STYLE[band].tone} hint={BAND_MEANING[band]}
              title={<ToneChip tone={BAND_STYLE[band].tone}>{BAND_LABEL[band]}</ToneChip>}>
            <div className="space-y-1.5">
              {view.questions.filter((q) => q.band === band).map((q) => (
                <div key={q.question} className={`min-w-0 rounded-r-xl bg-muted/30 py-2 pl-3 pr-2 ${BAND_STYLE[band].row}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-medium">{q.question}</span>
                    {/* ⛔ THE BAND IS NOT A FACT ABOUT THIS CLIENT WHEN THE ENGINES ANSWERED ABOUT
                        SOMEBODY ELSE'S TRADE. "fault diagnosis services in thetford UK" sat here
                        under ABSENT — "the race exists and you are invisible" — naming six car
                        garages. Rendered BEFORE the counts, because the counts are the thing it
                        disqualifies. Operator screen only: see questionTradeFit's header. */}
                    {tradeFit.byQuestion.get(q.question) === 'off_trade' && (
                      <ToneChip tone="amber" title={TRADE_FIT_REASON.off_trade ?? undefined}>
                        {TRADE_FIT_LABEL.off_trade}
                      </ToneChip>
                    )}
                    <span className="flex shrink-0 flex-wrap gap-x-3 text-[11px] tabular-nums text-muted-foreground">
                      {engineNames.map((e) => {
                        const c = q.engines[e];
                        if (!c) return null;
                        const all = c.named > 0 && c.named >= c.runs;
                        const none = c.named === 0;
                        return (
                          <span key={e}>
                            {/* "named", always: a bare "0/3" read as measurements (Paul, 2026-09-30). */}
                            {e} named{' '}
                            <span className={cn('font-bold', all ? TONE.green.text : none ? TONE.red.text : TONE.amber.text)}>
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
            </div>
            </SubSection>
          </section>
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
