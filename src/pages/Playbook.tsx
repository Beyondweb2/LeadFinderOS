import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ExternalLink, AlertTriangle, Clock, Trophy, Ban, Globe, ArrowDownToLine, CheckCircle2, Printer, Quote, Send, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/BackLink';
import { SEOHead } from '@/components/SEOHead';
import { usePlaybook } from '@/hooks/usePlaybook';
import { thinTradeMessage, type PlaybookStep, type Section } from '@/lib/buildPlaybook';
import { ABSENCE_CAVEAT } from '@/lib/ownCitations';
import { printPlaybookDoc } from '@/lib/playbookDoc';
import { printClientRequestDoc } from '@/lib/clientRequestDoc';
import { buildClientRequest } from '@/lib/clientRequestSelect';
import { useDirectoryCheck } from '@/hooks/useDirectoryCheck';
import { gatingFor } from '@/lib/directoryHosts';

/**
 * OPERATOR DELIVERY CHECKLIST — /playbook/:id.
 *
 * The evidence layer had no view: buildPlaybook, directoryFacts and playbook-evidence were all built
 * and merged without anyone once seeing the output on screen. This is that output, and nothing else —
 * every value printed here comes off the Playbook object, so the page cannot disagree with the fold.
 *
 * THREE THINGS ARE ALWAYS VISIBLE, because hiding any of them makes the list read more confident
 * than the data supports:
 *   - `audits` next to every source. Volume alone lies — Companies House had 32 citations from ONE
 *     audit and read as a pattern until breadth was shown.
 *   - `thin` on anything under EVIDENCE_MIN_AUDITS.
 *   - UNVERIFIED on any signup URL nobody has clicked. 63 of 66 are unverified; only Yell, MyBuilder,
 *     192.com and Checkatrade are checked.
 *
 * OPERATOR-ONLY, like /baseline/:auditId — ProtectedRoute + SubscriptionGate + noindex. WHO'S WINNING
 * is a list of the client's competitors; it is working intelligence, not something a client sees.
 */

const SECTION_META: Record<Section, { title: string; blurb: string; icon: typeof Clock; tone: string }> = {
  do_now: {
    title: 'DO NOW',
    blurb: 'You can complete these yourself, in this order.',
    icon: Clock, tone: 'text-primary',
  },
  blocked: {
    title: 'BLOCKED — client only',
    blurb: 'These need the client to act. They go in the client pack; they never move without it.',
    icon: Ban, tone: 'text-amber-400',
  },
  no_website: {
    title: 'NO WEBSITE',
    blurb: 'Gemini reads businesses’ own sites. Without one there is nothing of theirs to read.',
    icon: Globe, tone: 'text-red-400',
  },
  deprioritised: {
    title: 'DEPRIORITISED',
    blurb: 'Measured and found not to move the needle. Deliberately last — do not spend the hour here.',
    icon: ArrowDownToLine, tone: 'text-muted-foreground',
  },
};

const ORDER: Section[] = ['do_now', 'blocked', 'no_website', 'deprioritised'];

/** Citations/audits chip. Always shown together — breadth is what stops volume lying. */
function Evidence({ step }: { step: PlaybookStep }) {
  if (!step.host) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
      <span>{step.citations} citations</span>
      <span className="text-muted-foreground/40">·</span>
      <span className={step.strength === 'thin' ? 'font-semibold text-amber-400' : 'font-semibold text-foreground/80'}>
        {step.audits} audits
      </span>
      {step.strength === 'thin' && (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          thin
        </span>
      )}
    </span>
  );
}

function StepRow({ step }: { step: PlaybookStep }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {step.done && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
          <span className={`text-sm font-medium ${step.done ? 'line-through opacity-60' : ''}`}>{step.label}</span>
          {step.host && <span className="text-[11px] text-muted-foreground/70">{step.host}</span>}
          {step.minutes > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {step.minutes} min
            </span>
          )}
          {/* Mirrors the printed document. Without this the screen would show a plain task while the
              print said ALREADY LISTED for the same host — the two must not disagree. */}
          {step.alreadyListed && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
              already listed
            </span>
          )}
        </div>
        <Evidence step={step} />
      </div>

      {step.alreadyListed && (
        <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
          <p className="text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400">
            A directory check found a live listing. Open it and confirm the <b>category</b> and the
            <b> town</b> match what is being measured — a listing under the wrong category is a
            different problem from no listing, not a smaller one.
          </p>
          <a href={step.alreadyListed.url} target="_blank" rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 break-all text-[11px] text-primary hover:underline">
            <ExternalLink className="h-3 w-3 shrink-0" />
            {step.alreadyListed.url}
          </a>
        </div>
      )}

      {step.signupUrl && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a
            href={step.signupUrl} target="_blank" rel="noreferrer noopener"
            className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {step.signupUrl}
          </a>
          {/* Loud on purpose: this is the one thing that wastes the operator's time mid-task. */}
          {!step.urlVerified && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
              url unverified
            </span>
          )}
        </div>
      )}

      {step.blockedReason && (
        <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-amber-400/90">
          <Ban className="mt-0.5 h-3 w-3 shrink-0" />
          {step.blockedReason}
        </p>
      )}

      {step.notes && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">{step.notes}</p>}

      {step.fields.length > 0 && (
        /* Exact values to paste, in field order. A missing value is flagged, never blank — a blank
           field reads as "nothing needed" and the whole signup fails without it. */
        <dl className="mt-2 grid gap-x-4 gap-y-1 border-t border-border/40 pt-2 sm:grid-cols-2">
          {step.fields.map((f) => (
            <div key={f.name} className="flex gap-2 text-[11px]">
              <dt className="w-24 shrink-0 uppercase tracking-wide text-muted-foreground/60">{f.name}</dt>
              <dd className={`min-w-0 break-words ${f.missing ? 'font-semibold text-red-400' : 'text-foreground/90'}`}>
                {f.value || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {step.listingUrl && (
        <a href={step.listingUrl} target="_blank" rel="noreferrer noopener"
           className="mt-2 inline-flex items-center gap-1 text-[11px] text-green-500 hover:underline">
          <CheckCircle2 className="h-3 w-3" /> live listing
        </a>
      )}
    </div>
  );
}

export default function Playbook() {
  const { id } = useParams<{ id: string }>();
  const {
    playbook: pb, ownCitations: oc, seo, naming, directoryCheck, resolvedAs, auditId, leadId,
    isLoading, error, reload,
  } = usePlaybook(id);
  /* Running is separate from reading: usePlaybook owns the stored result because the fold needs it.
     onDone reloads the whole playbook, because a completed check changes which steps are tasks. */
  const dirCheck = useDirectoryCheck(leadId, reload);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error || !pb) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-muted-foreground">{error ?? 'No playbook to show.'}</p>
        <div className="mt-3"><BackLink /></div>
      </div>
    );
  }

  /* THIN TRADE. The step is unshifted here rather than in buildPlaybook because it is an instruction
     to the operator about measurement, not a directory task derived from evidence. */
  const steps: PlaybookStep[] = pb.tradeTooThin
    ? [{
        key: 'measure-trade', section: 'do_now',
        /* COST IS NOW MEASURED, not guessed. Settled 2026-07-30 from ai_audit_runs.actor_cost_usd:
           81 runs, mean $0.042 per run ≈ 3.4p, so a 3-question audit is about 3p. This line has said
           two wrong things before — "about 15p" (~5x too high) and then a hedged "a few pence". */
        label: 'Run one audit on this business type and read which sources get cited — about 3p.',
        host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 15,
        citations: 0, audits: 0, strength: 'evidenced',
        notes: 'Nothing below is a measured list for this trade. One audit turns this page from an inference into evidence. About 3p, from measured spend across 81 runs.',
        done: false, verified: false, listingUrl: null,
      }, ...pb.steps]
    : pb.steps;

  /* AFTER SUPPRESSION, matching the printed header. An already-listed host contributes no minutes:
     it is not work. buildPlaybook already zeroes their minutes, so this filter is belt-and-braces
     against a future step that sets both. */
  const doNowMinutes = steps
    .filter((s) => s.section === 'do_now' && !s.alreadyListed)
    .reduce((n, s) => n + s.minutes, 0);

  /* Capped at the same 20 the printed sheet uses. Uncapped this was 181 rows for a plumber, which
     drowned the four or five incumbents actually worth studying. */
  const shownWinners = pb.whoIsWinning.slice(0, 20);
  const hiddenWinners = pb.whoIsWinning.length - shownWinners.length;

  return (
    <>
      <SEOHead
        title={`Playbook — ${pb.businessName}`}
        description="Operator delivery checklist."
        noindex
      />
      <div className="mx-auto max-w-4xl space-y-4 py-4">
        <BackLink />
        {/* CLIENT CARD */}
        <Card>
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-xl">{pb.businessName}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {pb.trade ?? 'trade unknown'}
                  {pb.town ? ` · ${pb.town}` : ''}
                  {' · '}{pb.tradeAudits} audit{pb.tradeAudits === 1 ? '' : 's'} measured for this trade
                  {resolvedAs && ` · resolved by ${resolvedAs} id`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">{doNowMinutes}</div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">operator minutes</p>
                </div>
                {/* TWO DOCUMENTS, LABELLED SO THE WRONG ONE CANNOT BE SENT BY ACCIDENT.
                    Sending the operator copy to a client would hand over the full citation ranking and
                    their competitors, so the labels say who each one is FOR rather than what it is, the
                    internal one is visually recessive with an explicit warning line beneath, and the
                    client one is the primary action. Both are generated for THIS business from the data
                    already on the page — neither is a blank template. */}
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:text-destructive"
                      onClick={() => printPlaybookDoc({ ...pb, steps }, seo, naming, !!directoryCheck)}>
                      <Printer className="mr-1.5 h-3.5 w-3.5" /> Print operator copy
                    </Button>
                    <Button size="sm" onClick={() => printClientRequestDoc(buildClientRequest({ ...pb, steps }, naming))}>
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Print client request
                    </Button>
                    {/* ON DEMAND, BEHIND A CONFIRM THAT STATES THE COST. Disabled without a lead:
                        the check is keyed on outreach_leads, so an audit-only business has nothing
                        to key on and says so rather than offering a button that cannot work. */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!leadId || dirCheck.running}
                      title={leadId
                        ? 'Search for listings this business already has on the directories cited for its trade'
                        : 'This business has no CRM lead record, so there is nothing to key a check on'}
                      onClick={() => {
                        if (!window.confirm(
                          'Run a live search for existing directory listings?\n\n'
                          + 'Two Google searches via Apify. Estimated cost ~8p.\n'
                          + 'Nothing is spent until you press OK.',
                        )) return;
                        void dirCheck.run();
                      }}
                    >
                      {dirCheck.running
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <Search className="mr-1.5 h-3.5 w-3.5" />}
                      {dirCheck.running ? 'Checking…' : directoryCheck ? 'Re-check listings (~8p)' : 'Check existing directory listings (~8p)'}
                    </Button>
                  </div>
                  <p className="text-[10px] leading-tight text-destructive/80">
                    Operator copy contains their competitors — never send it
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0">
            {/* ── DIRECTORY CHECK RESULT ──────────────────────────────────────────────────────────
                FOUND / NOT FOUND only. Never "not listed" or "missing": one search failing to
                surface a listing is not proof there is no listing, and the UI will not claim it.
                The gating badge comes from directoryFacts via gatingFor — the same hand-maintained
                classification the rest of the system uses, never a second source and never
                defaulted to self-serve. */}
            {dirCheck.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                <span className="font-semibold">Directory check failed.</span> {dirCheck.error}
              </div>
            )}
            {directoryCheck && (
              <div className="rounded-lg border border-border/60 bg-card/60 p-3 text-[12px]">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">Directory check</span>
                  <span className="text-[11px] text-muted-foreground">
                    {directoryCheck.checked_at
                      ? new Date(directoryCheck.checked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                    {typeof directoryCheck.cost_estimate_usd === 'number'
                      ? ` · $${Number(directoryCheck.cost_estimate_usd).toFixed(3)}`
                      : ''}
                  </span>
                </div>

                {directoryCheck.status !== 'ok' ? (
                  /* Every non-ok state says what it actually was. A refused or empty search is NOT
                     reported as NOT FOUND for every host — that would be a lie about eight hosts. */
                  <p className="text-[12px] text-amber-600 dark:text-amber-500">
                    <span className="font-semibold uppercase">{directoryCheck.status.replace('_', ' ')}</span>
                    {directoryCheck.error ? ` — ${directoryCheck.error}` : ''}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {(directoryCheck.hosts_checked ?? []).map((h) => {
                      const hit = (directoryCheck.found ?? []).find((f) => f.host === h.host);
                      const g = gatingFor(h.host);
                      return (
                        <li key={h.host} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/40 py-1 last:border-b-0">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            hit ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                            {hit ? 'FOUND' : 'NOT FOUND'}
                          </span>
                          <span className="font-medium">{h.host}</span>
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                            g.gating === 'client-gated' ? 'border-blue-500/40 text-blue-500'
                              : g.gating === 'unclassified' ? 'border-amber-500/40 text-amber-600 dark:text-amber-500'
                              : 'border-border text-muted-foreground'}`}>
                            {g.label}
                          </span>
                          {hit && (
                            <a href={hit.url} target="_blank" rel="noreferrer"
                              className="w-full break-all text-[11px] text-primary underline decoration-dotted underline-offset-2 hover:no-underline">
                              {hit.url}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {(directoryCheck.queries_run ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Searched: {(directoryCheck.queries_run ?? []).map((q) => `“${q}”`).join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  NOT FOUND means this search did not surface a listing — it is not proof one does not exist.
                </p>
              </div>
            )}
            {!directoryCheck && leadId && (
              <p className="text-[11px] text-muted-foreground">
                Directory check not run — some of the tasks below may already be done.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {pb.missingAddress && (
                /* THE BLOCKING GAP. Every directory signup asks for it, so without it none of DO NOW
                   can actually be completed. Stated at the top, not buried in each step's fields. */
                <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                  <AlertTriangle className="h-3 w-3" /> No address on file — every signup below needs one
                </span>
              )}
              {!pb.hasWebsite && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                  <Globe className="h-3 w-3" /> No website
                </span>
              )}
              {auditId && (
                <Link to={`/baseline/${auditId}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-primary hover:underline">
                  baseline
                </Link>
              )}
            </div>

            {pb.tradeTooThin && (
              /* Must never print a confident list off this little data. thinTradeMessage owns the
                 wording so the page cannot soften it. */
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-300/90">
                {thinTradeMessage(pb.trade, pb.tradeAudits)}
              </p>
            )}
          </CardContent>
        </Card>

        {ORDER.map((section) => {
          const rows = steps.filter((s) => s.section === section);
          if (!rows.length) return null;
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          const mins = rows.reduce((n, s) => n + s.minutes, 0);
          return (
            <Card key={section} className={section === 'deprioritised' ? 'opacity-70' : undefined}>
              <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${meta.tone}`} />
                  <span className={`font-semibold tracking-wide ${meta.tone}`}>{meta.title}</span>
                  <span className="text-[11px] font-normal tabular-nums text-muted-foreground/70">
                    {rows.length} item{rows.length === 1 ? '' : 's'}{mins > 0 && ` · ${mins} min`}
                  </span>
                </CardTitle>
                <p className="text-[11px] leading-relaxed text-muted-foreground/80">{meta.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0">
                {rows.map((s) => <StepRow key={s.key} step={s} />)}
              </CardContent>
            </Card>
          );
        })}

        {/* ALREADY LISTED — the free qualification signal. If their own listing page on a directory was
            cited and they are STILL not being named, that directory is not a lever for them and the
            sale may not be there. Costs nothing: it is the audit we already ran. */}
        {oc && oc.alreadyListedOn.length > 0 && (
          <Card className="border-green-500/30">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-semibold tracking-wide text-green-500">ALREADY LISTED — {oc.alreadyListedOn.length} found free</span>
              </CardTitle>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                A page that looks like <span className="font-medium text-foreground">{pb.businessName}</span>’s own
                listing was cited on these hosts, so they are already on them. Click through and confirm — this is
                matched on the URL, so treat it as a strong hint rather than a fact.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5 p-3 pt-0 sm:p-4 sm:pt-0">
              {oc.alreadyListedOn.map((h) => (
                <div key={h.host} className="rounded-md border border-green-500/20 bg-green-500/5 p-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[12px] font-semibold">{h.label}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      cited in {h.questions} of {oc.questionsCounted} questions
                    </span>
                  </div>
                  <a href={h.ownListingUrl ?? '#'} target="_blank" rel="noreferrer noopener"
                     className="mt-0.5 inline-flex items-center gap-1 break-all text-[11px] text-primary hover:underline">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {h.ownListingUrl}
                  </a>
                </div>
              ))}
              {/* Stated on screen, not just in a comment: the asymmetry is the whole risk here. */}
              <p className="pt-1 text-[11px] leading-relaxed text-amber-400/90">{ABSENCE_CAVEAT}</p>
            </CardContent>
          </Card>
        )}

        {/* THIS AUDIT'S OWN CITATIONS — separate from the trade list above, and labelled so the two
            cannot be confused. The trade fold says what generally works across many audits; this says
            what was actually read for THIS business in THIS town. One audit, so it is never presented
            as evidence of what works — only as what was read. */}
        {oc && oc.hosts.length > 0 && (
          <Card className="border-sky-500/30">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Quote className="h-4 w-4 text-sky-400" />
                <span className="font-semibold tracking-wide text-sky-400">CITED IN THIS BUSINESS’S OWN AUDIT</span>
                <span className="text-[11px] font-normal tabular-nums text-muted-foreground/70">
                  {oc.hosts.length} hosts · {oc.totalCitations} citations
                </span>
              </CardTitle>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                What {oc.engines.join(' and ') || 'the engines'} actually read when asked about{' '}
                {pb.town ? `${pb.trade ?? 'this business'} in ${pb.town}` : 'this business'} —{' '}
                {oc.questionsWithCitations} of {oc.questionsCounted} questions returned citations. This is{' '}
                <span className="font-medium text-foreground">one audit</span>, so it shows what was read for this
                client, not what works in general. The DO NOW list above is the cross-audit view.
              </p>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0 sm:p-4 sm:pt-0">
              {oc.hosts.map((h) => (
                <div key={h.host} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/30 py-1.5 last:border-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-[12px] font-medium">{h.label}</span>
                    {h.label !== h.host && <span className="text-[10px] text-muted-foreground/60">{h.host}</span>}
                    {/* C3: a known directory is marked as actionable; anything else is intelligence. */}
                    {h.actionable ? (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {h.kind === 'trade-body' ? 'trade body' : 'directory'}
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                            title={h.kind === 'unclassified' ? 'No fact held for this host — almost always a competitor’s own site' : undefined}>
                        {h.kind === 'unclassified' ? 'intelligence' : h.kind}
                      </span>
                    )}
                    {h.ownListingUrl && (
                      <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-500">
                        already listed
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{h.questions}/{oc.questionsCounted} questions</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{h.mentions} citation{h.mentions === 1 ? '' : 's'}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-[10px]">{h.engines.join(', ')}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* WHO'S WINNING — the most useful intelligence in the data, and it used to be discarded.
            These are never tasks: a client cannot be listed on a competitor's own website. */}
        {pb.whoIsWinning.length > 0 && (
          <Card>
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 text-sky-400" />
                <span className="font-semibold tracking-wide text-sky-400">WHO’S WINNING</span>
                <span className="text-[11px] font-normal tabular-nums text-muted-foreground/70">
                  top {shownWinners.length} of {pb.whoIsWinning.length} hosts
                </span>
              </CardTitle>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                Cited by the engines but not joinable — mostly national operators’ own sites. Study
                them; never task them. Sorted by breadth of audits, not citations.
              </p>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="space-y-1">
                {shownWinners.map((w) => (
                  <div key={w.host} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/30 py-1 last:border-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[12px] font-medium">{w.host}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {w.kind}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {w.citations} citations · <span className="font-semibold text-foreground/80">{w.audits} audits</span>
                    </span>
                  </div>
                ))}
              </div>
              {/* NEVER a silent truncation. 181 rows for a plumber buries the handful that matter,
                  but hiding the count would read as "this is all of them". */}
              {hiddenWinners > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground/70">
                  + {hiddenWinners} more cited host{hiddenWinners === 1 ? '' : 's'} below these, not shown.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {pb.notListings.length > 0 && (
          <Card className="opacity-80">
            <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
              <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground">
                CITED BUT NOT A LISTING
              </CardTitle>
              <p className="text-[11px] text-muted-foreground/80">Nobody can join these. Shown so they are not mistaken for missed work.</p>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0 sm:p-4 sm:pt-0">
              {pb.notListings.map((n) => (
                <div key={n.label} className="border-b border-border/30 py-1 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[12px] font-medium">{n.label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {n.citations} citations · <span className="font-semibold text-foreground/80">{n.audits} audits</span>
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">{n.why}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          Which hosts matter is derived only from citations in completed audits; what each host IS and
          who may action it is hand-maintained per host, never per trade. Sources under{' '}
          {'5'} audits are marked thin and sources under 2 are not shown at all. Operator view — not
          for the client.
        </p>
      </div>
    </>
  );
}
