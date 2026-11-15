/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ORIGINAL BUSINESS ROW of the Past audits list, unchanged (moved here verbatim from AuditBookList, 2026-11-15).
   Every audit older than the new-rules cut-off (except the two businesses Paul named) keeps exactly this look,
   with no extra counting. See auditStyle.ts for who gets the new rows.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Globe, MapPin, FileText, Loader2, CircleStop, ChevronRight, ChevronDown, Archive, ArchiveRestore, MoreHorizontal, Sparkles } from 'lucide-react';
import { RunningChip, AuditPills, MentionPill } from '@/components/audit/AuditPills';
import type { AuditLite, BusinessGroup, RunLite } from '@/types/auditBook';

export interface LegacyBusinessRowProps {
  b: BusinessGroup; archivedReady: boolean; showArchived: boolean;
  onOpenAudit: (a: AuditLite, run?: RunLite) => void; onViewReport: (a: AuditLite) => void;
  onCancelRun: (a: AuditLite, runId: string) => void; onArchive: (a: AuditLite) => void; onRestore: (a: AuditLite) => void;
  busyId: string | null; cancellingId: string | null;
}

export function LegacyBusinessRow({ b, archivedReady, showArchived, onOpenAudit, onViewReport, onCancelRun, onArchive, onRestore, busyId, cancellingId }: LegacyBusinessRowProps) {
  const [expanded, setExpanded] = useState(false);
      const nested = b.auditCount > 1 || b.runCount > 1;
      const inFlight = b.runningRun;
      const a = b.latestAudit;
      const run = b.latestRun;
      const scored = run?.mention_rate !== null && run?.mention_rate !== undefined;
      return (
        <div key={b.key} className="transition-colors hover:bg-muted/30">
          {/* ⛔ ONE ROW, FIXED COLUMNS. Every cell below renders in every row, empty or
              not, so the right-hand edge lines up down the whole list. The old row let
              the score, the Report button and the archive control each appear or vanish,
              which made a PROTECTED audit (no archive control, deliberately) look like a
              row that had lost a button. */}
          <div className="flex items-center gap-3 px-3 py-2">
            {/* expander, or a fixed gap so names align whether or not a row has one */}
            {nested ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
                title={expanded ? 'Hide runs' : `Show ${b.auditCount} audits, ${b.runCount} runs`}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-[18px] shrink-0" />}

            <button onClick={() => onOpenAudit(a)} className="min-w-0 flex-1 text-left" title="Open latest results">
              <div className="flex items-center gap-1.5 truncate text-[0.9rem] font-medium text-foreground">
                {b.has_website
                  ? <Globe className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                  : <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
                <span className="truncate">{b.name}</span>
                {/* A MARKET AUDIT IS NOT A CLIENT. It sits in this list because it is an
                    audit and stays searchable — but "[market] locksmiths · Hastings"
                    reading like a business name is how one gets pitched by mistake. */}
                {b.isMarket && (
                  <span className="shrink-0 rounded border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-muted-foreground">market</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
                <span className="truncate">{b.business_type || '—'}{b.location ? ` · ${b.location}` : ''}</span>
                {nested && <span className="text-muted-foreground/60">{b.runCount} runs</span>}
                {/* Only the chips that MEAN something at list level: opened, paying
                    client, SEO grade. `checklist` moved to the row menu — it rendered on
                    all 901 rows, so as a chip it distinguished nothing. */}
                <AuditPills audit={a} run={run} />
              </div>
            </button>

            {/* SCORE — fixed width so every row's number sits on the same axis. */}
            <div className="w-[86px] shrink-0 text-right">
              {inFlight ? <RunningChip run={inFlight} /> : scored ? <MentionPill rate={run?.mention_rate ?? null} /> : null}
            </div>

            {/* REPORT — fixed slot, so a row without one leaves a gap rather than
                shifting everything after it leftwards. */}
            <div className="w-[92px] shrink-0">
              {scored && (
                <Button variant="ghost" size="sm" className="h-7 w-full justify-start px-2" onClick={() => onViewReport(a)} title="View report">
                  <FileText className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Report</span>
                </Button>
              )}
            </div>

            {/* Stop is urgent and stays on the row while a run is draining. */}
            {inFlight && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onCancelRun(a, inFlight.id)} disabled={cancellingId === a.id} title="Stop this audit">
                {cancellingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
              </Button>
            )}

            {/* Row menu: the per-row actions that are not the main one. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" title={`More for ${b.name}`}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => onOpenAudit(a)}>
                  <Sparkles className="mr-2 h-4 w-4" /> Open results
                </DropdownMenuItem>
                {/* The delivery checklist — /playbook/:id. It used to be a chip on every
                    row; here it is one click away and out of the way. */}
                {/* ⛔ THE `from` CARRIES THE RUN, so Back returns you to the AUDIT you
                    were reading rather than to the top of a 901-row list. The results
                    view is not its own URL — it is `step === 'results'` on /ai-audit —
                    so a bare '/ai-audit' asks for the LIST, and landing there after
                    reading one audit is losing your place (CLAUDE.md §6c). The page
                    already reads ?runId= on mount, which is how Outreach and the Inbox
                    deep-link into a specific audit.
                    ⚠️ Falls back to the plain path when there is no run: a link that
                    cannot say which run should ask for the list, not for a broken one. */}
                {/* ⛔ REMOVED 2026-09-29 (UI cleanup): "Delivery checklist" (the Playbook) — no longer used. */}
                {/* ⛔ ARCHIVE IS ONLY OFFERED FOR A SINGLE-AUDIT BUSINESS. With several
                    audits it is ambiguous which one goes, so it lives on each audit in
                    the expanded detail instead. Unchanged from before. */}
                {!nested && archivedReady && (
                  showArchived ? (
                    <DropdownMenuItem onSelect={() => onRestore(a)} disabled={busyId === a.id}>
                      <ArchiveRestore className="mr-2 h-4 w-4" /> Restore to list
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => onArchive(a)} disabled={busyId === a.id}>
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Expanded: every audit, and every run inside it */}
          {expanded && nested && (
            <div className="border-t border-border/60 bg-muted/20 px-3 py-2 space-y-2">
              {b.audits.map((au) => (
                <div key={au.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {/* Year included: a before/after pair can straddle a year end, and
                          "21 Jul" alone would not distinguish them. */}
                      Audit {new Date(au.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <AuditPills audit={au} run={au.runs[0] ?? null} />
                    <span className="flex-1" />
                    {archivedReady && (showArchived ? (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onRestore(au)} disabled={busyId === au.id} title="Restore this audit to the list">
                        {busyId === au.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onArchive(au)} disabled={busyId === au.id} title="Archive this audit — hides it from the list, deletes nothing">
                        {busyId === au.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                      </Button>
                    ))}
                  </div>
                  {au.runs.length === 0 ? (
                    <div className="pl-3 text-[11px] text-muted-foreground">No runs</div>
                  ) : au.runs.map((r) => {
                    const draining = r.status === 'pending' || r.status === 'running';
                    return (
                      <div key={r.id} className="flex items-center gap-2 pl-3">
                        <button onClick={() => onOpenAudit(au, r)} className="min-w-0 flex-1 text-left text-[11px] hover:underline" title="Open this run">
                          Run {r.run_number}
                          <span className="text-muted-foreground"> · {r.status}</span>
                          {r.actor_cost_usd !== null && <span className="text-muted-foreground"> · ${r.actor_cost_usd.toFixed(3)}</span>}
                        </button>
                        {draining ? <RunningChip run={r} /> : <MentionPill rate={r.mention_rate} />}
                        {draining && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onCancelRun(au, r.id)} disabled={cancellingId === au.id} title="Stop this run">
                            <CircleStop className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      );
}
