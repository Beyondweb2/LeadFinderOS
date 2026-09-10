/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT BOOK — the list of past audits, extracted from AiAudit.tsx on 2026-09-10.

   A pure relocation: same markup, same wording, same rules. What changed is where it lives and
   what it owns.

   ⛔ WHAT IT OWNS, AND WHY THAT SPLIT. The two expand/collapse Sets are VIEW state and nothing
   outside this component ever read them, so they moved in. The search TERM stays with the page,
   because it also drives a server-side name search that hydrates audits beyond the fetched
   window — the list is not the only thing that cares about it.

   ⚠️ 901 ROWS. Measured against the live database: 968 audits fold to 901 businesses, and
   `closedTrades` starts EMPTY so every trade is expanded and all 901 render at once. The page
   feeling slow to type in was this. The fix is upstream (`useDeferredValue` on the query, in
   AiAudit.tsx) rather than here, so the input never waits on the list.
   ⛔ THE OPEN QUESTION THIS DOES NOT ANSWER: whether 901 rows should be rendered at all on
   arrival. Defaulting trades to collapsed is a one-line, 90x change — but it changes what the
   operator sees when the page opens, so it is a design decision for the list redesign, not a
   performance patch to slip in here.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Search, X, Plus, Sparkles, Globe, MapPin, FileText, Loader2, CircleStop,
  ChevronRight, ChevronDown, Archive, ArchiveRestore, Undo2,
} from 'lucide-react';
import { RunningChip, AuditPills, MentionPill } from '@/components/audit/AuditPills';
import type { AuditLite, BusinessGroup, RunLite } from '@/types/auditBook';

export interface AuditBookListProps {
  /** Every business in the current view (archived or live), before the search filter. */
  businesses: BusinessGroup[];
  /** What survived the search. Equal to `businesses` when nothing is typed. */
  filteredBusinesses: BusinessGroup[];
  /** Those, folded by trade, largest group first. */
  tradeGroups: { trade: string; items: BusinessGroup[] }[];
  /** Header counts. Only `businesses` and `audits` are read here. */
  metrics: { businesses: number; audits: number };
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
  businesses, filteredBusinesses, tradeGroups, metrics, auditsCapped, fetchLimit,
  searchMinBusinesses, auditQuery, deferredQuery, auditQueryTerms, onQueryChange,
  archivedReady, archivedCount, showArchived, onToggleArchived,
  onNewAudit, onOpenAudit, onViewReport, onCancelRun, onArchive, onRestore,
  busyId, cancellingId,
}: AuditBookListProps) {
  /* Which trade groups are CLOSED (not which are open): a new trade appearing in the book should
     arrive expanded like the rest, and an "open" set would leave it collapsed and easy to miss. */
  const [closedTrades, setClosedTrades] = useState<Set<string>>(new Set());
  const [openBusinesses, setOpenBusinesses] = useState<Set<string>>(new Set());

  return (
    <Card><CardContent className="p-4 sm:p-5 space-y-4">
        {/* THE PAGE IS NOW JUST THE LIST. The source picker and the whole business-details form
            moved into the dialog at the bottom of this component — they used to sit in this same
            card, above the list, which is what made the page feel cluttered. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <Label className="text-sm font-semibold text-foreground">Past audits</Label>
                {/* Honest about the window: the count is what was LOADED, and says so when full.
                    AND WITH A SEARCH ACTIVE IT DESCRIBES THE SEARCH, not the page — leaving
                    "129 businesses" above a list of three would make the filter look broken. */}
                <span className="text-[11px] text-muted-foreground">
                  {auditQueryTerms.length > 0
                    ? `${filteredBusinesses.length} of ${metrics.businesses} match`
                    : `${metrics.businesses} business${metrics.businesses === 1 ? '' : 'es'} · ${metrics.audits} audit${metrics.audits === 1 ? '' : 's'}`}
                  {auditsCapped ? ` (latest ${fetchLimit})` : ''}
                </span>
              </div>
              {/* Opens the dialog WITHOUT resetting, so this is a pure relocation of what the page
                  did before: any form state restored from sessionStorage is still there, exactly as
                  it would have been sitting on the page. Choosing "New business" or a different
                  lead inside the dialog is what changes the subject, same as it always was. */}
              <div className="flex items-center gap-2">
                {/* ⛔ THE TOGGLE ONLY EXISTS ONCE SOMETHING IS ARCHIVED, and only once the
                    column is proven present. An "Archived (0)" control on a fresh install is
                    furniture, and one that 400s because the migration has not run is worse. */}
                {archivedReady && (archivedCount > 0 || showArchived) && (
                  <Button
                    variant={showArchived ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={onToggleArchived}
                    title={showArchived ? 'Back to the live audit list' : 'Show audits you have archived'}
                  >
                    {showArchived
                      ? (<><Undo2 className="mr-1.5 h-4 w-4" /> Back to live</>)
                      : (<><Archive className="mr-1.5 h-4 w-4" /> Archived ({archivedCount})</>)}
                  </Button>
                )}
                <Button size="sm" onClick={() => onNewAudit()}>
                  <Plus className="mr-1.5 h-4 w-4" /> New audit
                </Button>
              </div>
            </div>

            {/* Say which list you are looking at. Without this an archived view with three rows
                in it is indistinguishable from an audit book that has lost everything. */}
            {showArchived && (
              <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                Showing <span className="font-medium text-foreground">archived</span> audits. Nothing here is deleted —
                every run and every stored answer is still in the database. Use the restore arrow to put one back.
              </div>
            )}

            {/* ── SEARCH ────────────────────────────────────────────────────────────────────────
                Only once there is enough to lose something in. Below that the list IS the search,
                and a box over four rows is furniture. */}
            {businesses.length > searchMinBusinesses && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={auditQuery}
                  onChange={(e) => onQueryChange(e.target.value)}
                  /* Escape clears rather than blurring. preventDefault stops it closing anything
                     this input happens to sit inside. */
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); onQueryChange(''); }
                  }}
                  placeholder="Search by name, trade or town"
                  aria-label="Search past audits"
                  className="h-8 pl-8 pr-8 text-[13px]"
                />
                {auditQuery !== '' && (
                  <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* NOTHING MATCHED — said out loud, with the term quoted back and a way out. An empty
                list reads as "you have no audits", which is the opposite of the truth, and is
                exactly how a filter left on by accident becomes a panic. */}
            {businesses.length > 0 && filteredBusinesses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
                <Search className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <div className="text-sm font-medium">No audits match &ldquo;{deferredQuery}&rdquo;</div>
                <div className="text-[11px] text-muted-foreground">
                  Searched {businesses.length} business{businesses.length === 1 ? '' : 'es'} by name, trade and town
                  {auditsCapped ? `, from the latest ${fetchLimit} audits loaded` : ''}.
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => onQueryChange('')}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Clear search
                </Button>
              </div>
            ) : businesses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <div className="text-sm font-medium">No audits yet</div>
                {/* "above" was correct when the form sat at the top of this card. It doesn't now. */}
                <div className="text-[11px] text-muted-foreground">Run your first audit to see how AI answers for a business.</div>
                <Button size="sm" className="mt-3" onClick={() => onNewAudit()}>
                  <Plus className="mr-1.5 h-4 w-4" /> New audit
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {tradeGroups.map(({ trade, items }) => {
                  const collapsed = closedTrades.has(trade);
                  const running = items.filter((b) => b.runningRun).length;
                  return (
                    <div key={trade} className="space-y-1.5">
                      {/* Trade header — collapsible, largest trade first */}
                      <button
                        onClick={() => setClosedTrades((prev) => {
                          const next = new Set(prev);
                          if (next.has(trade)) next.delete(trade); else next.add(trade);
                          return next;
                        })}
                        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                      >
                        {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-xs font-semibold capitalize">{trade}</span>
                        <span className="text-[11px] text-muted-foreground">{items.length}</span>
                        {running > 0 && (
                          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--badge-waiting))] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--badge-waiting-fg))]">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />{running} running
                          </span>
                        )}
                      </button>

                      {!collapsed && items.map((b) => {
                        const expanded = openBusinesses.has(b.key);
                        const nested = b.auditCount > 1 || b.runCount > 1;
                        const inFlight = b.runningRun;
                        const a = b.latestAudit;
                        const run = b.latestRun;
                        return (
                          <div key={b.key} className="rounded-lg border border-border/60 bg-card/60 transition-colors hover:bg-card">
                            {/* Collapsed row: ONE per business */}
                            <div className="flex items-center gap-2 px-3 py-2">
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
                                {/* PRIMARY: the business. Heavier and darker than everything else on the row. */}
                                <div className="flex items-center gap-1.5 truncate text-[0.95rem] font-semibold text-foreground">
                                  {b.has_website ? <Globe className="h-3 w-3 shrink-0 text-muted-foreground/70" /> : <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
                                  <span className="truncate">{b.name}</span>
                                  {/* A MARKET AUDIT IS NOT A CLIENT. It sits in this list because it
                                      is an audit, and it stays searchable — but "[market] locksmiths
                                      · Hastings" reading like a business name is how one gets pitched
                                      by mistake. Badged, not hidden. */}
                                  {b.isMarket && (
                                    <span className="shrink-0 rounded border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-muted-foreground">market</span>
                                  )}
                                  {nested && <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{b.runCount} runs</span>}
                                </div>
                                {/* SECONDARY: trade and place, deliberately recessive. */}
                                <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                                  {b.business_type || '—'}{b.location ? ` · ${b.location}` : ''}
                                </div>
                                {/* TERTIARY: the pill row gets its own line so it is readable rather than
                                    squeezed against the location text. */}
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <AuditPills audit={a} run={run} />
                                </div>
                              </button>

                              {/* State: live progress while draining, else the score */}
                              {inFlight ? <RunningChip run={inFlight} /> : <MentionPill rate={run?.mention_rate ?? null} />}

                              {/* Report — once the latest run has a score */}
                              {run?.mention_rate !== null && run?.mention_rate !== undefined && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => onViewReport(a)} title="View report">
                                  <FileText className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Report</span>
                                </Button>
                              )}
                              {/* REMOVED 2026-07-30: the row's "Playbook" button. It opened the
                                  generate-playbook LLM document, which is NOT the same thing as the
                                  `checklist` pill beside it — that one links to /playbook/:id, the
                                  evidence-derived document a client actually receives.
                                  Still reachable: open the audit's results and use View playbook.
                                  The LLM document is also the one with the known content problem
                                  (recommends Bing Places, which has zero citations across 8,913;
                                  omits Yell, which is cited). CLAUDE.md §5 and §9. */}
                              {inFlight && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onCancelRun(a, inFlight.id)} disabled={cancellingId === a.id} title="Stop this audit">
                                  {cancellingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                              {/* Archive stays on the row ONLY for a single-audit business. With several
                                  audits it would be ambiguous which one goes, so it moves inside.
                                  ⚠️ NOT destructive-red any more, and not a bin: this hides a row, it
                                  does not destroy a measurement. The red is spent on the confirm. */}
                              {!nested && archivedReady && (
                                showArchived ? (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onRestore(a)} disabled={busyId === a.id} title="Restore this audit to the list">
                                    {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onArchive(a)} disabled={busyId === a.id} title="Archive this audit — hides it from the list, deletes nothing">
                                    {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                                  </Button>
                                )
                              )}
                            </div>

                            {/* Expanded: every audit, and every run inside it */}
                            {expanded && nested && (
                              <div className="border-t border-border/60 bg-muted/20 px-3 py-2 space-y-2">
                                {b.audits.map((au) => (
                                  <div key={au.id} className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-medium text-muted-foreground">
                                        {/* Year included: a before/after pair can straddle a year end,
                                            and "21 Jul" alone would not distinguish them. */}
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
                  );
                })}
              </div>
            )}
          </div>
    </CardContent></Card>
  );
}
