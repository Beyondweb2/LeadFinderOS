/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT BOOK — the list of past audits. Rebuilt 2026-09-10 (Paul: "ugly and confusing").

   WHAT WAS WRONG, from the screen rather than from taste:

   · **901 rows rendered on arrival.** Trade groups started expanded and one of them holds 377
     businesses, so opening the page built the entire book. That is also why typing lagged.
   · **Two levels of nesting to reach one business** — Trade ▸ Business ▸ Audit ▸ Run — when the
     operator almost always arrives already knowing the name.
   · **`checklist` was a LINK dressed as a status chip, and it renders on EVERY row.** A chip that
     is present 901 times out of 901 carries no information; it just made every row look busy and
     made the chips that DO mean something (opened, paying client, SEO grade) impossible to spot.
     It moved into the row's own menu, where it is still one click away.
   · **No sort and no filter.** 312 businesses are invisible to AI and there was no way to see
     them together, which is the one view that says who to work on.
   · **Ragged right edge.** Score, Report and Archive each appeared or vanished per row, so
     nothing lined up and a missing Archive read as a bug rather than as protection.

   ⛔ WHAT DID NOT CHANGE: every action, every badge's meaning, the market badge, the archive
   protection, the expand-for-multiple-audits detail, and the wording of anything that states a
   fact. This is a re-layout, not a re-write of behaviour.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Search, X, Plus, Sparkles, Globe, MapPin, FileText, Loader2, CircleStop,
  ChevronRight, ChevronDown, Archive, ArchiveRestore, Undo2, MoreHorizontal, ListChecks,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RunningChip, AuditPills, MentionPill } from '@/components/audit/AuditPills';
import type { AuditLite, BusinessGroup, RunLite } from '@/types/auditBook';

/** How many rows to build at once. The book is 901 businesses; nobody reads past the first
 *  screenful without searching or sorting first, and rendering the rest costs a visibly slower
 *  page for information nobody asked for. "Show more" adds another page. */
const PAGE = 40;

type SortKey = 'recent' | 'worst' | 'best' | 'name';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'worst', label: 'Least visible first' },
  { value: 'best', label: 'Most visible first' },
  { value: 'name', label: 'Name A–Z' },
];

/** Latest mention rate, or null when this business has never been scored. Null is NOT zero:
 *  "never measured" and "measured at zero" are different answers and must not sort together. */
function rateOf(b: BusinessGroup): number | null {
  const r = b.latestRun?.mention_rate;
  return r === null || r === undefined ? null : r;
}

function sortBusinesses(list: BusinessGroup[], key: SortKey): BusinessGroup[] {
  const out = [...list];
  switch (key) {
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'worst':
    case 'best': {
      /* ⛔ UNSCORED ROWS SORT TO THE END IN BOTH DIRECTIONS, never to the top of "least
         visible". A business with no measurement is not a business at 0% — putting it first in
         a worst-first list would fill the one view that says "who needs work" with rows that
         say nothing at all. */
      const dir = key === 'worst' ? 1 : -1;
      return out.sort((a, b) => {
        const x = rateOf(a); const y = rateOf(b);
        if (x === null && y === null) return a.name.localeCompare(b.name);
        if (x === null) return 1;
        if (y === null) return -1;
        return (x - y) * dir || a.name.localeCompare(b.name);
      });
    }
    case 'recent':
    default:
      return out.sort((a, b) => b.latestAudit.created_at.localeCompare(a.latestAudit.created_at));
  }
}

export interface AuditBookListProps {
  /** Every business in the current view (archived or live), before the search filter. */
  businesses: BusinessGroup[];
  /** What survived the search. Equal to `businesses` when nothing is typed. */
  filteredBusinesses: BusinessGroup[];
  /** Header counts. Only `businesses` and `audits` are read here. */
  metrics: { businesses: number; audits: number; avgPct: number | null; invisible: number; inFlight: number; spend: number };
  /** The audits query came back full, so older audits exist beyond it — said out loud. */
  auditsCapped: boolean;
  fetchLimit: number;
  /** Below this many businesses a search box is furniture over a list you can already read. */
  searchMinBusinesses: number;

  /** Bound to the input — instant. */
  auditQuery: string;
  /** What the list was actually filtered by; one render behind while typing. */
  deferredQuery: string;
  auditQueryTerms: string[];
  onQueryChange: (v: string) => void;

  /** False until the archived_at migration has run: every archive control hides rather than
   *  offering a button that cannot work. */
  archivedReady: boolean;
  archivedCount: number;
  showArchived: boolean;
  onToggleArchived: () => void;

  onNewAudit: () => void;
  onOpenAudit: (a: AuditLite, run?: RunLite) => void;
  onViewReport: (a: AuditLite) => void;
  onCancelRun: (a: AuditLite, runId: string) => void;
  onArchive: (a: AuditLite) => void;
  onRestore: (a: AuditLite) => void;
  /** Audit id currently being archived or restored — disables just that row's control. */
  busyId: string | null;
  /** Audit id currently being cancelled. */
  cancellingId: string | null;
}

export function AuditBookList({
  businesses, filteredBusinesses, metrics, auditsCapped, fetchLimit,
  searchMinBusinesses, auditQuery, deferredQuery, auditQueryTerms, onQueryChange,
  archivedReady, archivedCount, showArchived, onToggleArchived,
  onNewAudit, onOpenAudit, onViewReport, onCancelRun, onArchive, onRestore,
  busyId, cancellingId,
}: AuditBookListProps) {
  const [trade, setTrade] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [shown, setShown] = useState(PAGE);
  const [openBusinesses, setOpenBusinesses] = useState<Set<string>>(new Set());

  /** Trades present in the book, largest first, for the filter. Derived from the UNFILTERED set
   *  so the dropdown does not lose options as you type. */
  const trades = useMemo(() => {
    const count = new Map<string, number>();
    for (const b of businesses) count.set(b.trade, (count.get(b.trade) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [businesses]);

  const rows = useMemo(() => {
    const byTrade = trade === 'all' ? filteredBusinesses : filteredBusinesses.filter((b) => b.trade === trade);
    return sortBusinesses(byTrade, sort);
  }, [filteredBusinesses, trade, sort]);

  const page = rows.slice(0, shown);
  const runningCount = rows.filter((b) => b.runningRun).length;

  /* Any control that changes WHAT is listed resets the page window — otherwise "Show more"
     from a previous filter leaves you scrolled into a list that no longer exists. */
  const reset = () => setShown(PAGE);

  return (
    <Card><CardContent className="p-4 sm:p-5 space-y-3">
      {/* ── HEADER ───────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">Past audits</span>
          {/* Honest about the window: the count is what was LOADED, and says so when full. AND
              WITH A FILTER ACTIVE IT DESCRIBES THE FILTER, not the book — "901 businesses" over
              a list of three is how a filter left on by accident becomes a panic. */}
          <span className="text-[11px] text-muted-foreground">
            {auditQueryTerms.length > 0 || trade !== 'all'
              ? `${rows.length} of ${metrics.businesses} match`
              : `${metrics.businesses} business${metrics.businesses === 1 ? '' : 'es'} · ${metrics.audits} audit${metrics.audits === 1 ? '' : 's'}`}
            {auditsCapped ? ` (latest ${fetchLimit})` : ''}
            {runningCount > 0 ? ` · ${runningCount} running` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {archivedReady && (archivedCount > 0 || showArchived) && (
            <Button
              variant={showArchived ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { onToggleArchived(); reset(); }}
              title={showArchived ? 'Back to the live audit list' : 'Show audits you have archived'}
            >
              {showArchived
                ? (<><Undo2 className="mr-1.5 h-4 w-4" /> Back to live</>)
                : (<><Archive className="mr-1.5 h-4 w-4" /> Archived ({archivedCount})</>)}
            </Button>
          )}
          <Button size="sm" onClick={onNewAudit}>
            <Plus className="mr-1.5 h-4 w-4" /> New audit
          </Button>
        </div>
      </div>

      {showArchived && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Showing <span className="font-medium text-foreground">archived</span> audits. Nothing here is deleted —
          every run and every stored answer is still in the database. Use the restore arrow to put one back.
        </div>
      )}

      {/* ── TOOLBAR: find, narrow, order. One line. ───────────────────────────────────────── */}
      {businesses.length > searchMinBusinesses && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={auditQuery}
              onChange={(e) => { onQueryChange(e.target.value); reset(); }}
              /* Escape clears rather than blurring. preventDefault stops it closing anything
                 this input happens to sit inside. */
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onQueryChange(''); reset(); } }}
              placeholder="Search by name, trade or town"
              aria-label="Search past audits"
              className="h-8 pl-8 pr-8 text-[13px]"
            />
            {auditQuery !== '' && (
              <button
                type="button"
                onClick={() => { onQueryChange(''); reset(); }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* ⛔ TRADE IS A FILTER NOW, NOT A NESTING LEVEL. It used to be a collapsible group
              wrapping the rows, which is what put 377 locksmiths on screen at once and added a
              level of indentation to reach any single business. */}
          {trades.length > 1 && (
            <Select value={trade} onValueChange={(v) => { setTrade(v); reset(); }}>
              <SelectTrigger className="h-8 w-[170px] text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades ({businesses.length})</SelectItem>
                {trades.map(([t, n]) => (
                  <SelectItem key={t} value={t} className="capitalize">{t} ({n})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); reset(); }}>
            <SelectTrigger className="h-8 w-[175px] text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── THE LIST ─────────────────────────────────────────────────────────────────────── */}
      {businesses.length > 0 && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
          <Search className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">
            No audits match {deferredQuery ? <>&ldquo;{deferredQuery}&rdquo;</> : 'this filter'}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Searched {businesses.length} business{businesses.length === 1 ? '' : 'es'} by name, trade and town
            {auditsCapped ? `, from the latest ${fetchLimit} audits loaded` : ''}.
          </div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => { onQueryChange(''); setTrade('all'); reset(); }}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Clear filters
          </Button>
        </div>
      ) : businesses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">No audits yet</div>
          <div className="text-[11px] text-muted-foreground">Run your first audit to see how AI answers for a business.</div>
          <Button size="sm" className="mt-3" onClick={onNewAudit}>
            <Plus className="mr-1.5 h-4 w-4" /> New audit
          </Button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/50 rounded-lg border border-border/60">
            {page.map((b) => {
              const expanded = openBusinesses.has(b.key);
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
                        onClick={() => setOpenBusinesses((prev) => {
                          const next = new Set(prev);
                          if (next.has(b.key)) next.delete(b.key); else next.add(b.key);
                          return next;
                        })}
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
                        <DropdownMenuItem asChild>
                          <Link
                            to={`/playbook/${a.id}`}
                            state={{ from: run?.id ? `/ai-audit?runId=${run.id}` : '/ai-audit', fromLabel: 'AI Audit' }}
                          >
                            <ListChecks className="mr-2 h-4 w-4" /> Delivery checklist
                          </Link>
                        </DropdownMenuItem>
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
            })}
          </div>

          {/* ⛔ SAY WHAT IS NOT ON SCREEN. A list that silently stops at 40 of 901 is the
              truncation trap in a new place — the operator concludes the rest is not there. */}
          {rows.length > page.length && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="text-[11px] text-muted-foreground">
                Showing {page.length} of {rows.length}
              </span>
              <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, rows.length - page.length)} more
              </Button>
            </div>
          )}
        </>
      )}
    </CardContent></Card>
  );
}
