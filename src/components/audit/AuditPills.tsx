/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT LIST'S PILLS — extracted from AiAudit.tsx, 2026-09-10.

   The small status chips every row of the audit book renders: what state the run is in, whether
   a report exists, whether the prospect opened it, the SEO grade, the mention rate. A pure move
   out of the page component — same markup, same wording, same thresholds.

   ⚠️ THESE RENDER 901 TIMES. The audit book folds 968 audits into 901 business rows and every
   trade group starts EXPANDED, so a keystroke in the search box re-rendered all of them. That is
   the measured cause of the page feeling slow, and it is why these moved out: the row that uses
   them is memoised now, and a memoised row is only worth having if its children are stable
   module-level components rather than closures redefined on every parent render.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom';
import { Eye, Loader2 } from 'lucide-react';
import type { AuditLite, RunLite } from '@/types/auditBook';

export function RunningChip({ run }: { run: RunLite }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[hsl(var(--badge-waiting))]/40 bg-[hsl(var(--badge-waiting))]/15 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--badge-waiting))]"
      title={run.total ? `${run.done} of ${run.total} questions answered` : 'Starting'}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      {run.total ? <>running <span className="tabular-nums">{run.done}/{run.total}</span></> : <>starting</>}
    </span>
  );
}

/* ── PILL VOCABULARY ────────────────────────────────────────────────────────────────────
   Four categories, four deliberately different treatments, because they mean different things
   and previously all read as one thing ("opened" and "baseline 3/3" were both plain green).

     engagement  a PROSPECT ACTED. The most commercially useful signal here, so it gets the only
                 solid high-contrast fill on the row, and the repeat count is set larger than the
                 label so "7" is what the eye lands on.
     client      a PAYING CUSTOMER. Distinct from engagement AND from assets: bordered, tinted,
                 with a filled dot, so it reads as a status rather than an event.
     asset       a FACT about what exists (report, playbook). Deliberately recessive - ghost grey.
     data        a MEASUREMENT (SEO grade). Recessive frame, but the value itself is
                 colour-coded, since C/D/F is the part worth noticing. */

function EngagementPill({ count, title }: { count: number; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[hsl(var(--badge-closed))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--badge-closed-fg))]"
    >
      <Eye className="h-3 w-3" />
      opened
      {count > 1 && <span className="ml-0.5 text-[12px] font-extrabold leading-none tabular-nums">{count}&times;</span>}
    </span>
  );
}

function ClientPill({ children, title, bad }: { children: React.ReactNode; title?: string; bad?: boolean }) {
  const tone = bad
    ? 'border-[hsl(var(--badge-not-interested))]/50 bg-[hsl(var(--badge-not-interested))]/10 text-[hsl(var(--badge-not-interested))]'
    : 'border-[hsl(var(--badge-closed))]/50 bg-[hsl(var(--badge-closed))]/10 text-[hsl(var(--badge-closed))]';
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${bad ? 'bg-[hsl(var(--badge-not-interested))]' : 'bg-[hsl(var(--badge-closed))]'}`} />
      {children}
    </span>
  );
}

function AssetPill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** SEO grade: recessive frame, grade-coloured value. A/B fine, C/D/F worth noticing. */
function GradePill({ grade }: { grade: string }) {
  const letter = grade.trim().charAt(0).toUpperCase();
  const cls = letter === 'A' || letter === 'B'
    ? 'text-[hsl(var(--badge-closed))]'
    : letter === 'C'
    ? 'text-[hsl(var(--badge-waiting))]'
    : 'text-[hsl(var(--badge-not-interested))]';
  return (
    <span title="Website SEO grade from the latest run" className="inline-flex shrink-0 items-baseline gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      SEO <span className={`text-[11px] font-bold ${cls}`}>{grade}</span>
    </span>
  );
}

export function AuditPills({ audit, run }: { audit: AuditLite; run: RunLite | null }) {
  const target = Number(audit.baseline_target_runs ?? 0);
  const counted = audit.baseline_runs_counted;
  return (
    <>
      {/* ENGAGEMENT first: it is the signal most likely to change what the operator does next. */}
      {audit.first_opened_at && (
        <EngagementPill
          count={audit.open_count ?? 1}
          title={`Report opened ${new Date(audit.first_opened_at).toLocaleString('en-GB')}${audit.open_count ? ` - ${audit.open_count} view${audit.open_count === 1 ? '' : 's'}` : ''}`}
        />
      )}
      {/* PAID CLIENT. Errors win: a stalled baseline is what needs attention. */}
      {target > 1 && (
        audit.baseline_error
          ? <ClientPill bad title={audit.baseline_error}>baseline failed</ClientPill>
          /* A FINISHED baseline links to the operator view, because until now it was measured and
             then invisible. Still-measuring stays a plain pill — there is nothing to read yet. */
          : audit.baseline_completed_at
            ? <Link
                to={`/baseline/${audit.id}`}
                /* Carries the run so Back reopens this audit, not the list — see AuditBookList. */
                state={{ from: run?.id ? `/ai-audit?runId=${run.id}` : '/ai-audit', fromLabel: 'AI Audit' }}
                onClick={(e) => e.stopPropagation()}
                title={`Baseline finalised ${new Date(audit.baseline_completed_at).toLocaleString('en-GB')} — open the operator view`}
                className="underline decoration-dotted underline-offset-2 hover:no-underline"
              >
                <ClientPill>client &middot; baseline {counted ?? target}/{target}</ClientPill>
              </Link>
            : <ClientPill title="Baseline still being measured">
                client &middot; baseline {counted ?? 0}/{target}
              </ClientPill>
      )}
      {/* ⛔ THE `checklist` CHIP WAS REMOVED FROM THIS ROW ON 2026-09-10, AND THE ROUTE IT
         CARRIED WAS NOT. It linked to /playbook/:auditId and rendered on EVERY row — 901 of 901
         — so as a chip it distinguished nothing and was most of why the list looked busy. It is
         now "Delivery checklist" in each row's own menu in AuditBookList.
         ⚠️ CLAUDE.md §9 says do not remove it, and the reason still stands: for a business with
         an audit and NO outreach_leads row (ABLM, the only delivery client) this is the ONLY
         route to that document, because the lead dialog's Playbook pill is keyed on a LEAD id.
         The route survives on every row. If the row menu ever loses it, put the chip back. */}
      {audit.lead_paid === true && target <= 1 && <ClientPill title="This lead has paid">client</ClientPill>}
      {/* ASSETS: facts, not signals. */}
      {audit.report_slug && <AssetPill title={`Published at /r/${audit.report_slug}`}>report</AssetPill>}
      {/* REMOVED 2026-07-30: the `playbook` asset pill. It was never a link — just a marker saying an
          LLM playbook existed for the run — and sitting one pill away from `checklist` it read as a
          duplicate of it when the two are different documents entirely. `checklist` above is the one
          that opens /playbook/:id and is KEPT: for a business with an audit but no outreach_leads row
          (ABLM, the only delivery client) it is the ONLY route to that document, because the other
          entry point — the lead detail dialog's Playbook pill — is keyed on a LEAD id.
          ⚠️ THERE WERE THREE ROUTES UNTIL 2026-08-12; the Paid Clients page carried the third and was
          deleted with it. That makes this pill MORE load-bearing, not less. Do not remove it. */}
      {/* DATA */}
      {run?.seo_grade && <GradePill grade={run.seo_grade} />}
    </>
  );
}

export function MentionPill({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return <span className="shrink-0 text-right text-[13px] tabular-nums text-muted-foreground/50">&mdash;</span>;
  }
  const pct = Math.round(rate * 100);
  // THE headline number: biggest type on the row, so the eye lands on the result first. Tone
  // carries the meaning; no pill chrome competing with the pill vocabulary to its left.
  const cls = pct >= 50 ? 'text-[hsl(var(--badge-closed))]'
    : pct > 0 ? 'text-[hsl(var(--badge-waiting))]'
    : 'text-[hsl(var(--badge-not-interested))]';
  return (
    <span className="shrink-0 text-right leading-none" title={`${pct}% of AI answers named this business`}>
      <span className={`font-sans text-[1.05rem] font-bold tabular-nums ${cls}`}>{pct}%</span>
      <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">named</span>
    </span>
  );
}
