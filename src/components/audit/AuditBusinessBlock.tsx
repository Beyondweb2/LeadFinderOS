/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE BUSINESS IN THE PAST AUDITS LIST: a header, then ONE CLEAR ROW PER AUDIT (Paul, 2026-11-15).

   Paul could not open each audit and could not tell which kind it was. So every audit now shows, on its own row:
     · a big coloured TYPE badge from the recorded purpose (auditListSummary.auditTypeOf), not a guess;
     · the POOLED result of the whole audit — the same functions as the public report, so the numbers match it;
     · an Open report button (the findable.live/r/ link) and the Opened count;
     · its runs folded away under "Show runs".
   A re-scored copy says so and shows no cost: it re-read stored answers, it asked nobody and spent nothing.

   ⛔ Presentation only: nothing here scores, ranks or changes a rule. The numbers come from auditListSummary.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Globe, MapPin, FileText, Loader2, CircleStop, ChevronRight, ChevronDown, Archive, ArchiveRestore,
  MoreHorizontal, Sparkles, Eye, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RunningChip, MentionPill, AuditPills } from '@/components/audit/AuditPills';
import { isNewStyleAudit } from '@/lib/auditStyle';
import { useAuditPooled } from '@/hooks/useAuditPooled';
import { auditTypeOf, isRescoredCopy, type AuditTypeKey } from '@/lib/auditListSummary';
import { shortReportUrl } from '@/lib/reportSlug';
import { isClientBaseline } from '@/lib/auditKind';
import type { AuditLite, BusinessGroup, RunLite } from '@/types/auditBook';

const TYPE_STYLE: Record<AuditTypeKey, string> = {
  discovery: 'bg-violet-600 text-white dark:bg-violet-500',
  baseline: 'bg-blue-600 text-white dark:bg-blue-500',
  quick: 'bg-slate-600 text-white dark:bg-slate-500',
  website: 'bg-teal-600 text-white dark:bg-teal-500',
  measurement: 'bg-amber-600 text-white dark:bg-amber-500',
  weekly: 'bg-zinc-600 text-white dark:bg-zinc-500',
};

/** Does this audit have a public report to open? A market audit and the internal weekly check have none. */
export function hasReport(a: AuditLite): boolean {
  if (!a.short_code || a.is_market === true) return false;
  if (String(a.audit_purpose ?? '').toLowerCase() === 'weekly_check') return false;
  return a.runs.some((r) => r.status === 'complete');
}

function gradeTone(grade: string): string {
  const l = grade.trim().charAt(0).toUpperCase();
  return l === 'A' || l === 'B' ? 'text-[hsl(var(--badge-closed))]' : l === 'C' ? 'text-[hsl(var(--badge-waiting))]' : 'text-[hsl(var(--badge-not-interested))]';
}

/** The audit's pooled result, in words: "16% named · 14 of 88 answers · Winnable 7 of 20". */
function PooledResult({ audit, big }: { audit: AuditLite; big?: boolean }) {
  const type = auditTypeOf(audit);
  const { data, isLoading, isError } = useAuditPooled(audit);
  const grade = audit.runs.find((r) => r.seo_grade)?.seo_grade ?? null;
  const running = audit.runs.some((r) => r.status === 'pending' || r.status === 'running');
  if (running) return <span className="text-[11px] text-muted-foreground">Running…</span>;
  if (type.key === 'website') {
    return grade
      ? <span className="leading-none"><span className={`text-[1.05rem] font-bold ${gradeTone(grade)}`}>{grade}</span><span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">website grade</span></span>
      : <span className="text-[11px] text-muted-foreground">No grade</span>;
  }
  if (isLoading) return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Counting…</span>;
  if (isError || !data) {
    const stored = audit.runs.find((r) => r.mention_rate !== null)?.mention_rate ?? null;
    return stored !== null ? <MentionPill rate={stored} /> : <span className="text-[11px] text-muted-foreground">No result yet</span>;
  }
  if (data.pct === null) return <span className="text-[11px] text-muted-foreground">No answers yet</span>;
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${big ? '' : ''}`}>
      <MentionPill rate={data.pct / 100} />
      <span className="text-[11px] text-muted-foreground tabular-nums" title="Named answers over all ChatGPT + Gemini answers, every run pooled">{data.named} of {data.answers} answers</span>
      {data.winnable && data.winnable.n > 0 && (
        <span className="rounded border border-border/70 px-1.5 py-0.5 text-[11px] font-medium text-foreground tabular-nums" title="Searches with room to be named (the report's Winnable count)">
          Winnable {data.winnable.x} of {data.winnable.n}
        </span>
      )}
    </span>
  );
}

/** The big coloured type badge. The search count comes from the same pooled read as the result (cached). */
function TypeBadge({ audit }: { audit: AuditLite }) {
  const type = auditTypeOf(audit);
  const { data } = useAuditPooled(audit, type.key === 'discovery' || type.key === 'baseline');
  return (
    <span title={type.hint} className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide ${TYPE_STYLE[type.key]}`}>
      {type.label}{data && data.searches > 0 && (type.key === 'discovery' || type.key === 'baseline') ? ` (${data.searches})` : ''}
    </span>
  );
}

/** The business header's named %: the LATEST audit's pooled figure, so it matches that audit's report. */
export function HeaderPooled({ audit }: { audit: AuditLite }) {
  const type = auditTypeOf(audit);
  const { data } = useAuditPooled(audit);
  if (type.key === 'website') return null;
  if (!data || data.pct === null) return null;
  return <MentionPill rate={data.pct / 100} />;
}

/** Live progress of an audit still running, from the counts the page already loads for its in-flight runs. */
export function progressOf(au: AuditLite): { done: number; total: number } | null {
  const live = au.runs.filter((r) => r.status === 'pending' || r.status === 'running');
  if (!live.length) return null;
  return { done: live.reduce((n, r) => n + r.done, 0), total: live.reduce((n, r) => n + r.total, 0) };
}

/** Spinner + "18 of 40 searches · 45%" or "Queued". Becomes a normal row by itself when the run settles. */
function RunningProgress({ audit }: { audit: AuditLite }) {
  const p = progressOf(audit);
  const label = p && p.total > 0 ? `${p.done} of ${p.total} searches · ${Math.round((100 * p.done) / p.total)}%` : 'Queued';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--badge-waiting))]/40 bg-[hsl(var(--badge-waiting))]/15 px-2 py-1 text-[11px] font-semibold tabular-nums text-[hsl(var(--badge-waiting))]">
      <Loader2 className="h-3 w-3 animate-spin" /> {label}
    </span>
  );
}

export interface AuditBusinessBlockProps {
  b: BusinessGroup;
  archivedReady: boolean;
  showArchived: boolean;
  onOpenAudit: (a: AuditLite, run?: RunLite) => void;
  onCancelRun: (a: AuditLite, runId: string) => void;
  onArchive: (a: AuditLite) => void;
  onRestore: (a: AuditLite) => void;
  busyId: string | null;
  cancellingId: string | null;
}

type CardProps = Omit<AuditBusinessBlockProps, 'b'> & { au: AuditLite };

/** One audit's full row: badge, pooled result, Open report, Opened count, runs folded. New-style audits only. */
function AuditRowCard({ au, archivedReady, showArchived, onOpenAudit, onCancelRun, onArchive, onRestore, busyId, cancellingId }: CardProps) {
  const [open, setOpen] = useState(false);
  const type = auditTypeOf(au);
  const rescored = isRescoredCopy(au);
  const report = hasReport(au);
  const running = au.runs.some((r) => r.status === 'pending' || r.status === 'running');
  const runningRun = au.runs.find((r) => r.status === 'pending' || r.status === 'running') ?? null;
  const baselineClient = isClientBaseline({ audit_purpose: au.audit_purpose ?? null, baseline_target_runs: au.baseline_target_runs ?? null, is_measurement: au.is_measurement ?? null });
  const grade = au.runs.find((r) => r.seo_grade)?.seo_grade ?? null;
  const archiveItem = archivedReady && (showArchived ? (
    <DropdownMenuItem onSelect={() => onRestore(au)} disabled={busyId === au.id}><ArchiveRestore className="mr-2 h-4 w-4" /> Restore to list</DropdownMenuItem>
  ) : (
    <DropdownMenuItem onSelect={() => onArchive(au)} disabled={busyId === au.id}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
  ));
  return (
    <div className="rounded-md border border-border/60 bg-muted/20">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2">
        <TypeBadge audit={au} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] text-muted-foreground">
            {new Date(au.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          {rescored && (
            <span className="rounded border border-violet-500/50 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300" title="A copy made from the stored answers with the new audit rules. It asked no AI and cost nothing.">
              Re-scored (new rules)
            </span>
          )}
          {baselineClient && au.baseline_completed_at && (
            <Link to={`/baseline/${au.id}`} state={{ from: au.runs[0]?.id ? `/ai-audit?runId=${au.runs[0].id}` : '/ai-audit', fromLabel: 'AI Audit' }}
              className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:no-underline" title="Open the operator baseline view">
              operator view
            </Link>
          )}
          {au.lead_paid === true && <span className="rounded border border-[hsl(var(--badge-closed))]/50 bg-[hsl(var(--badge-closed))]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--badge-closed))]" title="This lead has paid">client</span>}
          {au.first_opened_at && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--badge-closed))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--badge-closed-fg))]"
              title={`Report first opened ${new Date(au.first_opened_at).toLocaleString('en-GB')}`}>
              <Eye className="h-3 w-3" /> Opened {au.open_count ?? 1}&times;
            </span>
          )}
          {type.key !== 'website' && grade && (
            <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title="Website check grade">
              Website check <span className={`text-[11px] font-bold ${gradeTone(grade)}`}>{grade}</span>
            </span>
          )}
        </div>
        <div className="min-w-0">{running ? <RunningProgress audit={au} /> : <PooledResult audit={au} />}</div>
        <div className="flex shrink-0 items-center gap-1">
          {running && runningRun && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onCancelRun(au, runningRun.id)} disabled={cancellingId === au.id} title="Stop this audit">
              {cancellingId === au.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
            </Button>
          )}
          {report && !running && (
            <Button size="sm" variant="outline" className="h-7 px-2.5" asChild title="Open the public report (findable.live)">
              <a href={`${shortReportUrl(au.short_code!)}?preview=1`} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Open report <ExternalLink className="ml-1.5 h-3 w-3 opacity-60" />
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="More for this audit">
                <MoreHorizontal className="h-3.5 w-3.5" /><span className="sr-only">More for this audit</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => onOpenAudit(au)}><Sparkles className="mr-2 h-4 w-4" /> Open results</DropdownMenuItem>
              {archiveItem}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="border-t border-border/50 px-2.5 py-1">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {open ? 'Hide runs' : 'Show runs'} ({au.runs.length})
        </button>
        {open && (
          <div className="space-y-1 pb-1 pt-1">
            {au.runs.length === 0 ? <div className="pl-4 text-[11px] text-muted-foreground">No runs</div> : au.runs.map((r) => {
              const draining = r.status === 'pending' || r.status === 'running';
              return (
                <div key={r.id} className="flex items-center gap-2 pl-4">
                  <button onClick={() => onOpenAudit(au, r)} className="min-w-0 flex-1 text-left text-[11px] hover:underline" title="Open this run">
                    Run {r.run_number}
                    <span className="text-muted-foreground"> · {r.status}</span>
                    {rescored
                      ? <span className="text-muted-foreground"> · no cost (re-scored)</span>
                      : r.actor_cost_usd !== null && <span className="text-muted-foreground"> · ${r.actor_cost_usd.toFixed(3)}</span>}
                  </button>
                  {draining ? <RunningChip run={r} /> : rescored ? null : <MentionPill rate={r.mention_rate} />}
                  {draining && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onCancelRun(au, r.id)} disabled={cancellingId === au.id} title="Stop this run">
                      <CircleStop className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** An audit older than the cut-off, inside a business that has newer ones: the original look, no counting. */
function OlderPlainAudit({ au, archivedReady, showArchived, onOpenAudit, onArchive, onRestore, busyId }: CardProps) {
  const run = au.runs[0] ?? null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        Audit {new Date(au.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>
      <AuditPills audit={au} run={run} />
      <span className="flex-1" />
      {run && <MentionPill rate={run.mention_rate} />}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onOpenAudit(au)}>Open results</Button>
      {archivedReady && (showArchived ? (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => onRestore(au)} disabled={busyId === au.id} title="Restore this audit to the list"><ArchiveRestore className="h-3 w-3" /></Button>
      ) : (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => onArchive(au)} disabled={busyId === au.id} title="Archive this audit — hides it from the list, deletes nothing"><Archive className="h-3 w-3" /></Button>
      ))}
    </div>
  );
}

export function AuditBusinessBlock(props: AuditBusinessBlockProps) {
  const { b, archivedReady, showArchived, onOpenAudit, onCancelRun, onArchive, onRestore, busyId, cancellingId } = props;
  const [olderOpen, setOlderOpen] = useState(false);
  const latest = b.latestAudit;
  const older = b.audits.filter((a) => a.id !== latest.id);
  const nested = b.auditCount > 1;
  const card = { archivedReady, showArchived, onOpenAudit, onCancelRun, onArchive, onRestore, busyId, cancellingId };
  const row = (au: AuditLite) => (isNewStyleAudit(au) ? <AuditRowCard key={au.id} au={au} {...card} /> : <OlderPlainAudit key={au.id} au={au} {...card} />);
  return (
    <div className="transition-colors">
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={() => onOpenAudit(latest)} className="min-w-0 flex-1 text-left" title="Open latest results">
          <div className="flex items-center gap-1.5 truncate text-[0.95rem] font-semibold text-foreground">
            {b.has_website ? <Globe className="h-3 w-3 shrink-0 text-muted-foreground/70" /> : <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
            <span className="truncate">{b.name}</span>
            {b.isMarket && <span className="shrink-0 rounded border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-muted-foreground">market</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground/80">
            <span className="truncate">{b.business_type || '—'}{b.location ? ` · ${b.location}` : ''}</span>
          </div>
        </button>
        <div className="shrink-0 text-right" title="Latest audit, all runs pooled — the same figure as its report">
          {b.runningRun ? null : <HeaderPooled audit={latest} />}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" title={`More for ${b.name}`}>
              <MoreHorizontal className="h-3.5 w-3.5" /><span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onOpenAudit(latest)}><Sparkles className="mr-2 h-4 w-4" /> Open results</DropdownMenuItem>
            {/* ⛔ Archive here only for a single-audit business; with several, each audit has its own. Unchanged. */}
            {!nested && archivedReady && (showArchived ? (
              <DropdownMenuItem onSelect={() => onRestore(latest)} disabled={busyId === latest.id}><ArchiveRestore className="mr-2 h-4 w-4" /> Restore to list</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onArchive(latest)} disabled={busyId === latest.id}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1.5 px-3 pb-3">
        {/* The latest audit is always open. */}
        {row(latest)}
        {older.length > 0 && (
          <>
            <button type="button" onClick={() => setOlderOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              {olderOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {older.length} older audit{older.length === 1 ? '' : 's'}
            </button>
            {olderOpen && older.map(row)}
          </>
        )}
      </div>
    </div>
  );
}
