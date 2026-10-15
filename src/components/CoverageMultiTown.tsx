import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Callout, ToneChip, type Tone } from '@/components/operator/ui';
import { CampaignPicker } from '@/components/CampaignPicker';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useMultiTownLeads, type TownToSearch } from '@/hooks/useMultiTownLeads';
import { useCountrySettings } from '@/hooks/useCountrySettings';
import { Input } from '@/components/ui/input';
import { ReadinessFixDialog, ReadinessSummaryBlock, type FixableLead } from '@/components/LeadReadiness';
import { leadReadiness, summariseReadiness, type ReadinessFix, type ReadinessLead } from '@/lib/leadReadiness';
import type { MergedLead } from '@/lib/multiTownSearch';
import { isWithoutWebsite } from '@/lib/websiteStatusClass';
import {
  ADD_REASON_WORDS, COVERAGE_ADD_MAX_ROWS, MULTI_TOWN_PAGE_SIZE, addLookupEstimate, addSummarySentence, gbpLabel,
  limitSummary, pageCount, pageRows, searchEstimateSentence, selectAllResults, selectPage, siteIdentity, townsToSearch,
  type TownStatus,
} from '@/lib/multiTownSearch';

/* ══ COVERAGE: FIND LEADS IN MANY TOWNS, ADD THEM IN ONE GO (2026-10-15) ═══════════════════════
   Sits above the town table. Selected towns (in the table's own order) → ONE "Find leads" press searches up
   to MULTI_TOWN_MAX_TOWNS of them (the rest stay selected) → ONE merged list with a Town column, duplicates
   across towns removed and counted → tick rows (this page, or every result — two separate controls) → ONE
   add into a chosen campaign, with progress and a summary. Rules: src/lib/multiTownSearch.ts.
   ⛔ A salesperson never sees a cost: the estimate line and the lookup price are admin-only.
   ⛔ The one-town "Find leads" link on each row is untouched; this is an addition beside it. */

const ACTIVE_CAMPAIGN_KEY = 'leadfinder_active_campaign';   // Find Leads' own remembered campaign (Index.tsx)

const STATUS_TONE: Record<TownStatus['kind'], Tone> = { waiting: 'grey', searching: 'blue', done: 'green', failed: 'red', not_searched: 'amber' };
function statusWords(s: TownStatus): string {
  switch (s.kind) {
    case 'waiting': return 'waiting';
    case 'searching': return 'searching…';
    case 'done': return `${s.found} found`;
    case 'failed': return 'failed';
    case 'not_searched': return 'not searched';
  }
}

export function CoverageMultiTown({ trade, selected, onSearched, isAdmin }: {
  trade: string;
  /** The ticked towns, in the table's order. */
  selected: TownToSearch[];
  /** Towns that were searched (done or failed) — the page unticks them so the next press takes the rest. */
  onSearched: (towns: string[]) => void;
  isAdmin: boolean;
}) {
  const m = useMultiTownLeads(trade);
  const rows = m.merged.rows;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { campaigns } = useCampaigns();
  const [campaignId, setCampaignId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || null; } catch { return null; }
  });
  /* A remembered campaign that no longer exists (or is not this person's) falls back to "No campaign". */
  useEffect(() => {
    if (campaignId && campaigns.length > 0 && !campaigns.some((c) => c.id === campaignId)) setCampaignId(null);
  }, [campaigns, campaignId]);

  /* A different trade is a different search: the old list would be added under the wrong trade. */
  useEffect(() => { m.clear(); setPicked(new Set()); setPage(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [trade]);

  const visible = pageRows(rows, page);
  const pages = pageCount(rows.length);
  const pickedRows = useMemo(() => rows.filter((r) => picked.has(r.rowKey)), [rows, picked]);
  const pageAllOn = visible.length > 0 && visible.every((r) => picked.has(r.rowKey));
  const pageSomeOn = visible.some((r) => picked.has(r.rowKey));
  const { run } = townsToSearch(selected);

  const find = async () => {
    const res = await m.searchTowns(run);
    if (!res) return;
    // Searched towns (found or failed) are unticked; a town a limit stopped stays ticked for the next press.
    onSearched(res.searchedTowns);
  };

  const townChips = Object.entries(m.statuses);
  const addable = pickedRows.filter((r) => !m.inCrm[r.rowKey]);
  const busy = m.addPhase.kind === 'checking' || m.addPhase.kind === 'lookups' || m.addPhase.kind === 'saving';

  /* ── READINESS (2026-10-15, src/lib/leadReadiness.ts) ─────────────────────────────────────────────────────────
     Before the add: what each picked lead needs, with the phone and town as "will be looked up" (the add does it).
     A name or town can be fixed here, in place; "Add only the ready ones" leaves the rest out. After the add: the
     same check on what was SAVED (with the looked-up phone and town) says what is still missing, with a fix. */
  const { settings: countrySettings } = useCountrySettings();
  const [overrides, setOverrides] = useState<Record<string, { name?: string; town?: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const [postFix, setPostFix] = useState<{ lead: FixableLead; fixes: ReadinessFix[] } | null>(null);
  const withOverrides = (r: MergedLead): MergedLead => {
    const o = overrides[r.rowKey];
    return o ? { ...r, name: o.name?.trim() || r.name, searchLocation: o.town?.trim() || r.searchLocation } : r;
  };
  const asLead = (r: MergedLead): ReadinessLead => ({
    business_name: r.name, search_keyword: trade, search_location: r.searchLocation, place_id: r.id || null,
    country: r.country, phone: r.phone ?? null, address: r.address ?? null,
  });
  const preRows = addable.map(withOverrides).map((r) => ({ row: r, readiness: leadReadiness(asLead(r), { willLookUp: true, countrySettings }) }));
  const preSummary = summariseReadiness(preRows.map((x) => ({ name: x.row.name, readiness: x.readiness })));
  const readyRows = preRows.filter((x) => x.readiness.ok).map((x) => x.row);
  const toAdd = readyOnly ? readyRows : [...pickedRows.filter((r) => m.inCrm[r.rowKey]), ...preRows.map((x) => x.row)];
  const doneRows = m.addPhase.kind === 'done' ? m.addPhase.rows : [];
  const post = (m.addPhase.kind === 'done' ? m.addPhase.saved ?? [] : []).map((row) => {
    const created = doneRows.find((a) => a.k === row.k && a.outcome === 'created');
    return created?.lead_id ? { id: String(created.lead_id), row, readiness: leadReadiness(row as ReadinessLead, { countrySettings }) } : null;
  }).filter((x): x is { id: string; row: Record<string, unknown>; readiness: ReturnType<typeof leadReadiness> } => !!x);
  const postSummary = summariseReadiness(post.map((x) => ({ name: String(x.row.business_name ?? ''), readiness: x.readiness })));

  if (selected.length === 0 && townChips.length === 0 && rows.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3 md:p-4" data-testid="coverage-multi-town">
      {/* ── 1. The selection and the press ── */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{selected.length} town{selected.length === 1 ? '' : 's'} selected.</span>{' '}
            <span className="text-muted-foreground" data-testid="multi-town-estimate">{searchEstimateSentence({ selected: selected.length, isAdmin })}</span>
          </div>
          <Button size="sm" className="h-9" onClick={() => { void find(); }} disabled={m.running || busy} data-testid="multi-town-find">
            {m.running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
            Find leads in {run.length} town{run.length === 1 ? '' : 's'}
          </Button>
          {m.running && <Button size="sm" variant="outline" className="h-9" onClick={m.stop}>Stop</Button>}
        </div>
      )}

      {/* ── 2. Each town as it goes ── */}
      {townChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="multi-town-status">
          {townChips.map(([town, s]) => (
            <ToneChip key={town} tone={STATUS_TONE[s.kind]} dot title={'message' in s ? s.message : undefined}>
              {town}: {statusWords(s)}
            </ToneChip>
          ))}
        </div>
      )}
      {m.lastRun && m.lastRun.notSearched > 0 && m.lastRun.limitMessage && (
        <Callout tone="amber" icon={AlertTriangle} testId="multi-town-limit">
          {limitSummary({ searched: m.lastRun.searched, total: m.lastRun.total, notSearched: m.lastRun.notSearched, message: m.lastRun.limitMessage })}
        </Callout>
      )}
      {m.lastRun && m.lastRun.failed > 0 && (
        <p className="text-xs text-muted-foreground">{m.lastRun.failed} town{m.lastRun.failed === 1 ? '' : 's'} failed (hover the red chip for why); the others are in the list.</p>
      )}

      {/* ── 3. One merged list ── */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{rows.length} lead{rows.length === 1 ? '' : 's'} from {m.results.length} town{m.results.length === 1 ? '' : 's'}</span>
            {m.merged.removed > 0 && (
              <span className="text-muted-foreground" data-testid="multi-town-removed">
                · {m.merged.removed} duplicate{m.merged.removed === 1 ? '' : 's'} removed (found in more than one town)
              </span>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPicked(selectAllResults(rows))} data-testid="multi-town-select-all-results">
                Select all {rows.length} results
              </Button>
              {picked.size > 0 && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPicked(new Set())}>Clear selection</Button>}
              <Button size="sm" className="h-8 text-xs" disabled={picked.size === 0 || busy || m.running} onClick={() => { m.resetAdd(); setDialogOpen(true); }} data-testid="multi-town-add">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />Add {picked.size} to CRM
              </Button>
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" data-testid="multi-town-results">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-9 px-3 py-2 text-left">
                    <Checkbox aria-label="Select all on this page" title="Select all on this page"
                      checked={pageAllOn ? true : pageSomeOn ? 'indeterminate' : false}
                      onCheckedChange={(v) => setPicked(selectPage(picked, visible, v === true))} data-testid="multi-town-select-page" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Business</th>
                  <th className="px-3 py-2 text-left font-medium">Town</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Website</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const crm = m.inCrm[r.rowKey];
                  return (
                    <tr key={r.rowKey} className="border-t border-border">
                      <td className="px-3 py-1.5 align-top">
                        <Checkbox aria-label={`Select ${r.name}`} checked={picked.has(r.rowKey)}
                          onCheckedChange={(v) => setPicked((p) => { const n = new Set(p); if (v === true) n.add(r.rowKey); else n.delete(r.rowKey); return n; })} />
                      </td>
                      <td className="min-w-0 px-3 py-1.5 align-top">
                        <a href={r.googleMapsUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">{r.name}</a>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {crm && <ToneChip tone={crm === 'added_now' ? 'green' : 'grey'}>{crm === 'added_now' ? 'Added' : 'In CRM'}</ToneChip>}
                          {r.outsideTown && <ToneChip tone="amber" title="Just outside the town's own boundary">outside town</ToneChip>}
                          <span className="text-xs text-muted-foreground sm:hidden">{isWithoutWebsite(r.websiteStatus) ? 'No website' : 'Has website'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 align-top text-muted-foreground">
                        {r.town}
                        {r.alsoIn.length > 0 && <span className="block text-xs" title={`Also found in ${r.alsoIn.join(', ')}`}>also {r.alsoIn.join(', ')}</span>}
                      </td>
                      <td className="hidden px-3 py-1.5 align-top sm:table-cell">
                        {isWithoutWebsite(r.websiteStatus)
                          ? <ToneChip tone="green">No website</ToneChip>
                          : <span className="text-xs text-muted-foreground">{siteIdentity(r.websiteUrl) || 'Has website'}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Page {Math.min(page, pages - 1) + 1} of {pages} · {MULTI_TOWN_PAGE_SIZE} per page · {picked.size} selected</span>
              <span className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Next</Button>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 4. The add ── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!busy) setDialogOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{m.addPhase.kind === 'done' ? 'Added to the CRM' : `Add ${toAdd.length} lead${toAdd.length === 1 ? '' : 's'} to the CRM`}</DialogTitle>
            <DialogDescription>
              One add for all of them. Leads already in the CRM are skipped, never added twice.
            </DialogDescription>
          </DialogHeader>
          {m.addPhase.kind === 'idle' && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Which campaign?</label>
                <CampaignPicker mode="assign" value={campaignId} onChange={setCampaignId} testId="multi-town-campaign" />
              </div>
              <p className="text-muted-foreground">
                {pickedRows.length - addable.length > 0 && <>{pickedRows.length - addable.length} of these {pickedRows.length - addable.length === 1 ? 'is' : 'are'} already in the CRM and will be skipped. </>}
                Each new lead&rsquo;s phone number and town are looked up first, as a single add does
                ({addLookupEstimate(addable.length).label}{isAdmin && addable.length > 0 ? `, ${gbpLabel(addLookupEstimate(addable.length).usd)} on Google` : ''}).
                A business with no phone and no email is not added.
              </p>
              {preRows.length > 0 && (
                <div className="space-y-2 rounded-md border border-border/60 p-2">
                  <ReadinessSummaryBlock summary={preSummary} testId="multi-town-readiness"
                    onFixName={(name) => { const x = preRows.find((q) => q.row.name === name); if (x) setEditing(x.row.rowKey); }} />
                  {editing && (() => {
                    const base = rows.find((x) => x.rowKey === editing);
                    if (!base) return null;
                    const r = withOverrides(base);
                    return (
                      <div className="grid gap-2 sm:grid-cols-2" data-testid="multi-town-fix">
                        <Input aria-label="Business name" placeholder="Business name" value={overrides[editing]?.name ?? r.name}
                          onChange={(e) => setOverrides((q) => ({ ...q, [editing]: { ...q[editing], name: e.target.value } }))} />
                        <Input aria-label="Town" placeholder="Town" value={overrides[editing]?.town ?? r.searchLocation}
                          onChange={(e) => setOverrides((q) => ({ ...q, [editing]: { ...q[editing], town: e.target.value } }))} />
                        <Button size="sm" variant="outline" className="sm:col-span-2" onClick={() => setEditing(null)}>Done</Button>
                      </div>
                    );
                  })()}
                  {preSummary.needs > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={readyOnly} onCheckedChange={(v) => setReadyOnly(v === true)} data-testid="multi-town-ready-only" />
                      Add only the ready ones ({readyRows.length})
                    </label>
                  )}
                </div>
              )}
              {picked.size > COVERAGE_ADD_MAX_ROWS && <Callout tone="red">Up to {COVERAGE_ADD_MAX_ROWS} leads can be added at once. Select fewer.</Callout>}
            </div>
          )}
          {m.addPhase.kind === 'checking' && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Checking which are already in the CRM…</p>}
          {m.addPhase.kind === 'lookups' && (
            <div className="space-y-2 text-sm" data-testid="multi-town-progress">
              <p>Looking up phone numbers and towns: {m.addPhase.done} of {m.addPhase.total}{m.addPhase.waiting ? ' — pausing a moment for Google’s lookup limit' : ''}</p>
              <Progress value={m.addPhase.total ? (100 * m.addPhase.done) / m.addPhase.total : 100} />
              <Button size="sm" variant="outline" onClick={m.stop}>Stop and save what is looked up</Button>
            </div>
          )}
          {m.addPhase.kind === 'saving' && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Saving {m.addPhase.total} lead{m.addPhase.total === 1 ? '' : 's'}…</p>}
          {m.addPhase.kind === 'error' && <Callout tone="red" icon={AlertTriangle}>{m.addPhase.message}</Callout>}
          {m.addPhase.kind === 'done' && (
            <div className="space-y-2 text-sm" data-testid="multi-town-summary">
              <Callout tone={m.addPhase.summary.added > 0 ? 'green' : 'amber'} icon={CheckCircle2}>{addSummarySentence(m.addPhase.summary)}</Callout>
              {post.length > 0 && (
                <div className="rounded-md border border-border/60 p-2" data-testid="multi-town-post-readiness">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">After the phone and town lookups:</p>
                  <ReadinessSummaryBlock summary={postSummary} testId="multi-town-post-summary"
                    onFixName={(name) => {
                      const x = post.find((q) => String(q.row.business_name ?? '') === name);
                      if (x) setPostFix({ lead: { id: x.id, business_name: String(x.row.business_name ?? ''), phone: (x.row.phone as string | null) ?? null, search_keyword: trade, search_location: (x.row.search_location as string | null) ?? null }, fixes: x.readiness.needsInfo.map((i) => i.fix) });
                    }} />
                </div>
              )}
              {m.addPhase.rows.some((r) => r.outcome !== 'created') && (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {m.addPhase.rows.filter((r) => r.outcome !== 'created').map((r, i) => (
                    <li key={`${r.k}-${i}`}>{r.business_name}: {ADD_REASON_WORDS[r.reasons?.[0] ?? ''] ?? r.outcome}{r.owner_name ? ` (${r.owner_name})` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <DialogFooter>
            {m.addPhase.kind === 'idle' ? (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button disabled={toAdd.length === 0 || picked.size > COVERAGE_ADD_MAX_ROWS}
                  onClick={() => {
                    try { if (campaignId) localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaignId); } catch { /* a convenience only */ }
                    void m.addLeads(toAdd, campaignId).then((s) => { if (s) { setPicked(new Set()); setOverrides({}); setEditing(null); } });
                  }}
                  data-testid="multi-town-add-confirm">
                  Add {toAdd.length} lead{toAdd.length === 1 ? '' : 's'}
                </Button>
              </>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReadinessFixDialog lead={postFix?.lead ?? null} fixes={postFix?.fixes ?? []} isAdmin={isAdmin} open={!!postFix}
        onOpenChange={(o) => { if (!o) setPostFix(null); }} />
    </div>
  );
}
