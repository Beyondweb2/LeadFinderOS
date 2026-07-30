import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ExternalLink, AlertTriangle, Clock, Trophy, Ban, Globe, ArrowDownToLine, CheckCircle2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/BackLink';
import { SEOHead } from '@/components/SEOHead';
import { usePlaybook } from '@/hooks/usePlaybook';
import { thinTradeMessage, type PlaybookStep, type Section } from '@/lib/buildPlaybook';
import { printPlaybookDoc } from '@/lib/playbookDoc';

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
        </div>
        <Evidence step={step} />
      </div>

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
  const { playbook: pb, resolvedAs, auditId, isLoading, error } = usePlaybook(id);

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
        label: 'Run one audit on this business type and read which sources get cited — about 15p.',
        host: null, signupUrl: null, urlVerified: true, fields: [], minutes: 15,
        citations: 0, audits: 0, strength: 'evidenced',
        notes: 'Nothing below is a measured list for this trade. One audit turns this page from an inference into evidence.',
        done: false, verified: false, listingUrl: null,
      }, ...pb.steps]
    : pb.steps;

  const doNowMinutes = steps.filter((s) => s.section === 'do_now').reduce((n, s) => n + s.minutes, 0);

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
                {/* Prints the same fold through the old document's stylesheet. Browser print dialog,
                    no PDF library — see playbookDoc.ts. */}
                <Button size="sm" variant="outline" onClick={() => printPlaybookDoc({ ...pb, steps })}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0">
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
