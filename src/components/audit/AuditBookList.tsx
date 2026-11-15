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
import { EmptyState } from '@/components/operator/ui';
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
import { AuditBusinessBlock } from '@/components/audit/AuditBusinessBlock';
import { LegacyBusinessRow } from '@/components/audit/LegacyBusinessRow';
import { isNewStyleAudit } from '@/lib/auditStyle';
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
        <EmptyState icon={Search} tone="grey"
          title={<>No audits match {deferredQuery ? <>&ldquo;{deferredQuery}&rdquo;</> : 'this filter'}</>}
          action={<Button size="sm" variant="outline" onClick={() => { onQueryChange(''); setTrade('all'); reset(); }}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Clear filters
          </Button>}>
          Searched {businesses.length} business{businesses.length === 1 ? '' : 'es'} by name, trade and town
          {auditsCapped ? `, from the latest ${fetchLimit} audits loaded` : ''}.
        </EmptyState>
      ) : businesses.length === 0 ? (
        <EmptyState icon={Sparkles} tone="purple" title="No audits yet"
          action={<Button size="sm" onClick={onNewAudit}>
            <Plus className="mr-1.5 h-4 w-4" /> New audit
          </Button>}>
          Run your first audit to see how AI answers for a business.
        </EmptyState>
      ) : (
        <>
          <div className="divide-y divide-border/50 rounded-lg border border-border/60">
            {page.map((b) => (isNewStyleAudit(b.latestAudit) ? (
              <AuditBusinessBlock
                key={b.key} b={b} archivedReady={archivedReady} showArchived={showArchived}
                onOpenAudit={onOpenAudit} onCancelRun={onCancelRun} onArchive={onArchive} onRestore={onRestore}
                busyId={busyId} cancellingId={cancellingId}
              />
            ) : (
              <LegacyBusinessRow
                key={b.key} b={b} archivedReady={archivedReady} showArchived={showArchived}
                onOpenAudit={onOpenAudit} onViewReport={onViewReport} onCancelRun={onCancelRun} onArchive={onArchive} onRestore={onRestore}
                busyId={busyId} cancellingId={cancellingId}
              />
            )))}
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
