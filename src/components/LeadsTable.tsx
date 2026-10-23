import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import { addProgressText, type AddProgress } from '@/lib/findLeadsBulkAdd';
import { outsideSearchedTown, heldOutOfTown } from '@/lib/inTown';
import { heldNotMatch, nicheProfile, notNicheMatch } from '@/lib/nicheMatch';
import { salesOwnershipCell, adminOwnerMarker, isAlreadyAdded, AlreadyAddedMarker, type OwnershipInfo } from '@/components/FindLeadsOwnership';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { WebsiteStatusToggle } from './WebsiteStatusToggle';
import {
  Download, Filter, ChevronLeft, ChevronRight, ClipboardList, Check, Eye, Lock, MapPin, ExternalLink, Globe, Loader2,
  Instagram, Facebook, Sparkles, Mail, UserPlus, ChevronDown, MoreHorizontal, X, Trash2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { socialKindOf } from '@/lib/socialUrl';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAgencyChecks } from '@/hooks/useAgencyChecks';
import { SiteManagementCell } from './SiteManagementCell';
import { agencyCheckDomain, ALL_SITE_FILTERS, isHighConfidenceAgency, passesSiteFilter, siteStateOf, SITE_FILTERS, type SiteFilter } from '@/lib/agencyCheck';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Lead, WebsiteStatus } from '@/types/lead';
import type { OutreachLead } from '@/types/outreach';
import { SearchLeadContact } from './SearchLeadContact';
import { useAuth } from '@/hooks/useAuth';
import { readSearchResultsView, writeSearchResultsView, readSiteFilters, writeSiteFilters } from '@/lib/searchResultsPrefs';
import { resultSetSignature } from '@/lib/searchResultsCache';
import { visibleResults } from '@/lib/searchResultsView';
import { SelectionModeBar } from './SelectionModeBar';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}


const ITEMS_PER_PAGE = 25;

const EyeIcon = memo(({ checked, small }: { checked: boolean; small?: boolean }) => (
  <Eye className={`${small ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${checked ? '' : 'text-muted-foreground'}`} />
));
EyeIcon.displayName = 'EyeIcon';

interface LeadsTableProps {
  leads: Lead[];
  /** Absent = no Export menu (Sales, 2026-09-29: CSV export is admin-only). */
  /** Told which rows are showing (after every filter), so Find emails / Add all with emails act on them only. */
  onShownChange?: (rows: Lead[]) => void;
  /** Receives the rows showing now (after every filter), never the whole result set. */
  onExport?: (rows: Lead[]) => void;
  onAddToOutreach?: (lead: Lead) => Promise<any>;
  isInOutreach?: (leadName: string, googleMapsUrl?: string) => boolean;
  onMapLinkClick?: (businessName: string, googleMapsUrl?: string) => void;
  isChecked?: (businessName: string, googleMapsUrl?: string) => boolean;
  blurred?: boolean;
  gated?: boolean;
  onGatedAction?: () => void;
  savedLeadCount?: number;
  maxFreeSaves?: number;
  onViewDetailsGated?: () => void;
  viewDetailsExhausted?: boolean;
  /** Contact-enrichment found per place_id before the lead is saved (search-time). */
  searchEnrichment?: Record<string, Partial<OutreachLead>>;
  /** Patch search-time enrichment state, keyed by place_id. */
  onEnrichPatch?: (placeId: string, patch: Partial<OutreachLead>) => Promise<any>;
  /** Manually correct a result's website status (persists + wins over auto-detection). */
  onSetWebsiteStatus?: (lead: Lead, status: WebsiteStatus) => void;
  /** Bulk-add the given leads to Outreach (silent per-lead, deduped). */
  /** Find Leads' one batch add (src/lib/findLeadsBulkAdd.ts): the counts plus the summary it words. */
  onBulkAdd?: (leads: Lead[]) => Promise<{ added: number; skipped: number; title?: string; description?: string; cancelled?: boolean }>;
  /** Bulk in-place enrich (writes to searchEnrichment; does NOT add to CRM). */
  onBulkEnrich?: (
    leads: Lead[],
    onProgress: (done: number) => void,
    shouldCancel: () => boolean,
  ) => Promise<{ enriched: number; cached: number; skipped: number; failed: number; stoppedAtCap: boolean; cancelled: boolean }>;
  /** Whether a lead was already enriched this session (skipped = free). */
  isLeadEnriched?: (placeId: string) => boolean;
  // ── Email-scan actions (unified toolbar; handlers live in Index, behaviour unchanged) ──
  /** Free website-crawl email scan across the results. */
  onFindEmails?: () => void;
  onCancelFindEmails?: () => void;
  findingEmails?: boolean;
  emailProgress?: { done: number; total: number } | null;
  emailResult?: { found: number; scanned: number } | null;
  /** How many results have a website (crawlable for an email). */
  withWebsiteCount?: number;
  /** Bulk-add every result that has a found email. */
  onAddAllWithEmails?: () => void;
  addingEmails?: boolean;
  addAllWithEmailsCount?: number;
  /** Export CSV including any emails found this session. */
  onExportWithEmails?: (rows: Lead[]) => void;
  /** Precomputed hover-tooltip text for the Add-to-CRM buttons (per-row + bulk).
   *  Index decides the wording: "Add to {campaign}" when adding silently, or
   *  "Choose a campaign…" when the ask-each-time toggle is on. */
  addCampaignTooltip?: string;
  /** The town the results were searched in ("This town only" / Coverage). Results outside it are hidden behind one
   *  grey line and can never be added (src/lib/inTown.ts). Many towns: each result's own searchTown. */
  searchedTown?: string | null;
  /** The niche searched (the keyword): a result whose name and Google category both miss it is hidden behind one grey
   *  "Not a match" line (src/lib/nicheMatch.ts). Absent = nothing is judged. */
  searchedNiche?: string | null;
  /** Per-result CRM state (from Index's matcher): whether the business is in the
   *  ACTIVE CRM, and if so whether it's still fresh/removable + the row id. When
   *  provided, the action cell shows a three-state Add / Remove / In-CRM toggle;
   *  when absent, falls back to the legacy "ever added" indicator. */
  getCrmState?: (lead: Lead) => { inCrm: boolean; isFresh: boolean; crmLeadId: string | null; campaignId?: string | null };
  /** Sales workspace v2: the campaign selected at the top of Find Leads. A business ALREADY in the CRM can be
   *  put into it from its row (lead_set_campaign) — membership never depends on contact history. */
  activeCampaign?: { id: string; name: string } | null;
  onMoveToCampaign?: (crmLeadId: string) => void;
  /** Multi-user: the server's ownership state for a result (lead_identity_lookup). */
  ownership?: (lead: Lead) => OwnershipInfo | null;
  onClaim?: (leadId: string) => void;
  claiming?: boolean;
  viewerRole?: 'admin' | 'sales' | null;
  /** Remove a FRESH lead from the CRM (Index opens a confirm, then deletes with a
   *  live freshness re-check). */
  onRemoveFromCrm?: (leadId: string, businessName: string) => void;
  /** A batch add in progress ("Adding 23 of 40"); null when idle. */
  addProgress?: AddProgress | null;
}

export function LeadsTable({ leads, onShownChange, onExport, onAddToOutreach, isInOutreach, onMapLinkClick, isChecked, blurred = false, gated = false, onGatedAction, savedLeadCount = 0, maxFreeSaves = 3, onViewDetailsGated, viewDetailsExhausted = false, searchEnrichment, onEnrichPatch, onSetWebsiteStatus, onBulkAdd, onBulkEnrich, isLeadEnriched, onFindEmails, onCancelFindEmails, findingEmails = false, emailProgress, emailResult, withWebsiteCount = 0, onAddAllWithEmails, addingEmails = false, addAllWithEmailsCount = 0, onExportWithEmails, addCampaignTooltip = 'Add to CRM', getCrmState, onRemoveFromCrm, ownership, onClaim, claiming, viewerRole, activeCampaign, onMoveToCampaign, addProgress, searchedTown, searchedNiche }: LeadsTableProps) {
  const isLocked = blurred || gated;
  const handleExport = isLocked ? undefined : onExport;
  const { user } = useAuth();
  // Allow saving up to maxFreeSaves leads even for gated users
  const canSave = !gated || savedLeadCount < maxFreeSaves;
  /* Rows whose Add to CRM is running: the button shows a spinner and cannot be pressed again until the add
     answers (useOutreach.addLead also joins a repeat press to the same add — this is the visible half). */
  /* Show/Hide on the grey "outside" line. Shown = those rows are ordinary rows for every count and action (heldOutOfTown). */
  const [showOutside, setShowOutside] = useState(false);
  /* Show/Hide on the grey "Not a match" line (src/lib/nicheMatch.ts) — the same rule as the outside line. */
  const [showNotMatch, setShowNotMatch] = useState(false);
  const niche = useMemo(() => nicheProfile(searchedNiche), [searchedNiche]);
  const [addingIds, setAddingIds] = useState<ReadonlySet<string>>(() => new Set());
  const handleAddToOutreach = useCallback((lead: Lead) => {
    if (gated && !canSave) { onGatedAction?.(); return; }
    if (heldOutOfTown(lead, showOutside)) return; // hidden out-of-town rows are never added
    if (heldNotMatch(lead, niche, showNotMatch)) return; // nor hidden "not a match" rows
    if (addingIds.has(lead.id)) return;
    const run = onAddToOutreach?.(lead);
    if (!run || typeof (run as Promise<unknown>).finally !== 'function') return run;
    setAddingIds((prev) => new Set(prev).add(lead.id));
    return (run as Promise<unknown>).finally(() => {
      setAddingIds((prev) => { const next = new Set(prev); next.delete(lead.id); return next; });
    });
  }, [onAddToOutreach, gated, canSave, onGatedAction, addingIds, showOutside, niche, showNotMatch]);

  const checkIsInOutreach = useCallback((name: string, url?: string) => {
    return isInOutreach?.(name, url) ?? false;
  }, [isInOutreach]);

  const ALL_STATUSES = useMemo<WebsiteStatus[]>(() => ['NO_WEBSITE', 'HAS_OWN_WEBSITE', 'UNCERTAIN'], []);

  // Restore the saved page + website filter once (per-user, safe-wrapped storage).
  // Invalid/empty saved filters fall back to "all" so we never restore a view that
  // shows nothing. The saved page is clamped to the live result set below.
  /* ⛔ THE SAVED VIEW BELONGS TO ONE RESULT SET (2026-09-28). Coverage → Find Leads showed "10 found"
     over "No leads match your current filters": the website/listing filters were remembered per
     person and applied, unseen, to every LATER search — an earlier "Listing = Instagram" or
     website-only choice hid all ten. Now the view is stored with the signature of the results it was
     set on and restored only onto that same set (leaving and returning keeps your place); a new
     search starts with every result shown. */
  const signature = useMemo(() => resultSetSignature(leads), [leads]);
  const savedView = useRef((() => {
    const v = readSearchResultsView(user?.id);
    return v && v.sig === signature ? v : null;
  })()).current;
  const [statusFilters, setStatusFilters] = useState<WebsiteStatus[]>(() => {
    const restored = (savedView?.filters ?? []).filter((s): s is WebsiteStatus => (ALL_STATUSES as string[]).includes(s));
    return restored.length ? restored : ALL_STATUSES;
  });
  // Free listing-social filters: the listing "website" IS an Instagram/Facebook
  // link (socialKindOf — no enrichment needed). Empty = no social filtering.
  const [socialFilters, setSocialFilters] = useState<('instagram' | 'facebook')[]>(() =>
    (savedView?.socials ?? []).filter((s): s is 'instagram' | 'facebook' => s === 'instagram' || s === 'facebook'),
  );
  const [currentPage, setCurrentPage] = useState<number>(() => Math.max(1, savedView?.page ?? 1));
  /* ══ WHO RUNS THEIR WEBSITE? (2026-10-01) ══ Every result with its own website is checked as soon as
     the results arrive (useAgencyChecks, a few at a time; each row fills in as it finishes). */
  const [siteFilters, setSiteFilters] = useState<SiteFilter[]>(() => readSiteFilters(user?.id, ALL_SITE_FILTERS));
  useEffect(() => { writeSiteFilters(user?.id, siteFilters); }, [user?.id, siteFilters]);
  const toggleSiteFilter = useCallback((f: SiteFilter, on: boolean) => {
    setSiteFilters((prev) => ALL_SITE_FILTERS.filter((v) => (v === f ? on : prev.includes(v))));
  }, []);
  /* ⛔ NO BUSINESS AGE (2026-10-09, Paul): the Business age column, its filter, its sort boost and its Companies House lookups are
     gone from Find Leads. Nothing here calls Companies House any more; the stored data and the companies-house-check function are untouched. */
  const clearFilters = useCallback(() => { setStatusFilters(ALL_STATUSES); setSocialFilters([]); setSiteFilters(ALL_SITE_FILTERS); }, [ALL_STATUSES]);
  const hasOwnSite = useCallback((l: Lead) => l.websiteStatus === 'HAS_OWN_WEBSITE' && !!agencyCheckDomain(l.websiteUrl), []);
  const agencyItems = useMemo(() => leads.map((l) => ({ websiteUrl: l.websiteUrl, hasOwnWebsite: hasOwnSite(l) })), [leads, hasOwnSite]);
  const agency = useAgencyChecks(agencyItems);
  const highAgency = useCallback((l: Lead) => hasOwnSite(l) && isHighConfidenceAgency(agency.rowFor(l.websiteUrl)), [agency, hasOwnSite]);

  /* ⛔ OUTSIDE THE SEARCHED TOWN (2026-10-20, src/lib/inTown.ts): hidden by default behind ONE grey line, never a badge,
     never added (Add, Select all and Add all leave them out). Show lists them at the bottom, still not addable. */
  const outsideCount = useMemo(() => leads.filter(outsideSearchedTown).length, [leads]);
  /* ⛔ NOT A MATCH (2026-10-23, src/lib/nicheMatch.ts): a result whose name AND Google category both miss the niche searched
     ("Mackay Hyundai" for driving instructors) is hidden behind ONE grey line, like the outside line, and never added or
     counted while hidden. Show makes them ordinary rows. A row outside the town is counted on the outside line only. */
  const nicheWords = (searchedNiche ?? '').trim().toLowerCase();
  const isNotMatch = useCallback((l: Lead) => notNicheMatch(l, niche), [niche]);
  const notMatchCount = useMemo(() => leads.filter((l) => isNotMatch(l) && (showOutside || !outsideSearchedTown(l))).length, [leads, isNotMatch, showOutside]);
  const baseLeads = useMemo(() => leads.filter((l) => (showOutside || !outsideSearchedTown(l)) && (showNotMatch || !isNotMatch(l))), [leads, showOutside, showNotMatch, isNotMatch]);
  const outsideTownName = useMemo(() => {
    const towns = new Set(leads.filter(outsideSearchedTown).map((l) => (l.searchTown ?? searchedTown ?? '').split(',')[0].trim()).filter(Boolean));
    return towns.size === 1 ? [...towns][0] : 'the searched towns';
  }, [leads, searchedTown]);
  /* One "held" test for every Add, Select and tooltip below: hidden outside OR hidden not-a-match. */
  const held = useCallback((l: Lead) => heldOutOfTown(l, showOutside) || heldNotMatch(l, niche, showNotMatch), [showOutside, niche, showNotMatch]);
  const heldWhy = useCallback((l: Lead) => (heldOutOfTown(l, showOutside) ? `Outside ${outsideTownName}: not added` : `Not a match for ${nicheWords}: not added`), [showOutside, outsideTownName, nicheWords]);

  const filteredLeads = useMemo(() => {
    const kept = baseLeads.filter((lead) => {
      const effectiveStatus = lead.websiteStatus === 'DIRECTORY_ONLY' ? 'NO_WEBSITE' : lead.websiteStatus;
      if (!statusFilters.includes(effectiveStatus)) return false;
      if (socialFilters.length) {
        const kind = socialKindOf(lead.websiteUrl);
        if (!kind || !socialFilters.includes(kind)) return false;
      }
      if (!passesSiteFilter(siteFilters, siteStateOf(hasOwnSite(lead), agency.rowFor(lead.websiteUrl)))) return false;
      return true;
    });
    /* Shown out-of-town and not-a-match rows come after the rest. */
    const aside = (l: Lead) => outsideSearchedTown(l) || isNotMatch(l);
    const shown = [...kept.filter((l) => !aside(l)), ...kept.filter((l) => aside(l))];
    /* High-confidence agency sites go to the bottom (kept, never hidden) once every check has finished —
       rows never jump under the cursor while results are still arriving. The rest keep their order. */
    if (agency.pending > 0) return shown;
    const last = shown.filter((l) => highAgency(l));
    const rest = shown.filter((l) => !highAgency(l));
    return [...rest, ...last];
  }, [baseLeads, statusFilters, socialFilters, siteFilters, agency, hasOwnSite, highAgency, isNotMatch]);

  useEffect(() => { onShownChange?.(filteredLeads); }, [filteredLeads, onShownChange]);
  const visible = visibleResults(baseLeads.length, filteredLeads.length);
  const filterNotice = visible.filtered ? (
    <span className="ml-2 inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400" data-testid="results-filtered">
      {visible.line}
      <button type="button" className="font-medium underline underline-offset-2 hover:no-underline" onClick={clearFilters}>Show all</button>
    </span>
  ) : null;
  const emptyRows = (
    <span className="inline-flex flex-wrap items-center justify-center gap-2">
      {visible.emptyText}
      {visible.filtered && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearFilters}>Show all {baseLeads.length}</Button>}
    </span>
  );

  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  // Render against a CLAMPED page so a page beyond the current set (restored from
  // storage, or after a filter toggle shrinks the results) never shows an empty
  // page — it falls back to the LAST valid page, not page 1.
  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const paginatedLeads = filteredLeads.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  // A NEW result set while mounted (a new search — the ids changed): page 1, every
  // filter off, selection cleared. NOT on first mount (the saved view was restored above
  // when it belongs to these results), NOT on a filter toggle (the clamp handles range),
  // and NOT on a website-status correction (same ids, same result set).
  const lastSigRef = useRef(signature);
  useEffect(() => {
    if (lastSigRef.current === signature) return;
    lastSigRef.current = signature;
    setCurrentPage(1);
    clearFilters();
    setShowOutside(false);
    setShowNotMatch(false);
    setSelectedIds(new Set()); // new search → stale selection would act on gone rows
  }, [signature, clearFilters]);

  // Reconcile state to the clamped page so persistence + pagination buttons stay
  // in range (e.g. after a filter toggle reduces the page count).
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  // Persist page + filters (per-user, survives nav / reload / re-login).
  useEffect(() => {
    writeSearchResultsView(user?.id, { filters: statusFilters, page: safePage, socials: socialFilters, sig: signature });
  }, [user?.id, statusFilters, safePage, socialFilters, signature]);

  // ── Multi-select (mirrors OutreachTable's pattern: Set-based ids, header
  // select-all across ALL filtered rows, per-row checkboxes, cleared after acting).
  // Rows already in Outreach are unselectable (can't be re-added).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableLeads = useMemo(
    () => filteredLeads.filter((l) => !checkIsInOutreach(l.name, l.googleMapsUrl) && !held(l)),
    [filteredLeads, checkIsInOutreach, held],
  );
  // Resolve the selection against the CURRENT filtered set, so a filter change
  // after selecting can never bulk-act on rows that are no longer shown.
  const selectedLeads = useMemo(
    () => selectableLeads.filter((l) => selectedIds.has(l.id)),
    [selectableLeads, selectedIds],
  );
  /* Select all leaves out high-confidence agency sites (they can still be ticked one by one). */
  const selectAllPool = useMemo(() => selectableLeads.filter((l) => !highAgency(l)), [selectableLeads, highAgency]);
  const allSelected = selectAllPool.length > 0 && selectAllPool.every((l) => selectedIds.has(l.id));
  const handleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(selectAllPool.map((l) => l.id)));
  }, [allSelected, selectableLeads]);
  /* "Select this page" (2026-10-14): the same pool as Select all, limited to the rows showing now. */
  const selectAllIds = useMemo(() => selectAllPool.map((l) => l.id), [selectAllPool]);
  const pagePoolIds = useMemo(() => {
    const pool = new Set(selectAllIds);
    return paginatedLeads.filter((l) => pool.has(l.id)).map((l) => l.id);
  }, [paginatedLeads, selectAllIds]);
  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // ── On-demand "Check for website" (Apify web-results, ~$0.02/lead, daily-capped) ──
  const { toast } = useToast();
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const bulkCancelRef = useRef(false);

  // Returns 'capped' if the daily cap stops it, else true/false for completed.
  const runWebsiteCheck = useCallback(async (lead: Lead, quiet = false): Promise<'capped' | boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-website', {
        body: { google_maps_url: lead.googleMapsUrl, business_name: lead.name, website: lead.websiteUrl ?? null },
      });
      if (error) throw error;
      if (data?.limit_reached) {
        if (!quiet) toast({ title: 'Daily enrichment limit reached', description: 'Try again tomorrow.', variant: 'destructive' });
        return 'capped';
      }
      if (!data?.success) {
        if (!quiet) toast({ title: 'Check failed', description: data?.error ?? 'Please try again.', variant: 'destructive' });
        return false;
      }
      const status = data.websiteStatus as WebsiteStatus;
      // Apply + persist via the existing override (stays manually overridable).
      onSetWebsiteStatus?.(lead, status);
      if (!quiet) {
        if (status === 'HAS_OWN_WEBSITE') toast({ title: 'Website found', description: data.website || 'Marked as has-website.' });
        else if (status === 'UNCERTAIN') toast({ title: '⚠ Possible website — verify', description: `${data.candidate || 'A candidate was found'} — check it's theirs, then keep or change the status.` });
        else toast({ title: 'No website found', description: 'No real own-site in web results — left as no-website.' });
      }
      return true;
    } catch {
      if (!quiet) toast({ title: 'Check failed', description: 'Please try again.', variant: 'destructive' });
      return false;
    }
  }, [onSetWebsiteStatus, toast]);

  const handleCheckOne = useCallback(async (lead: Lead) => {
    setCheckingId(lead.id);
    try { await runWebsiteCheck(lead); } finally { setCheckingId(null); }
  }, [runWebsiteCheck]);

  // Bulk: check every NO_WEBSITE lead in the current filtered set (confirm-before-spend).
  const noWebsiteFiltered = useMemo(
    () => filteredLeads.filter((l) => (l.websiteStatus === 'DIRECTORY_ONLY' ? 'NO_WEBSITE' : l.websiteStatus) === 'NO_WEBSITE'),
    [filteredLeads],
  );
  const handleCheckBulk = useCallback(async () => {
    const targets = noWebsiteFiltered;
    if (!targets.length) return;
    const est = (targets.length * 0.02).toFixed(2);
    if (!window.confirm(`Check ${targets.length} no-website ${targets.length === 1 ? 'business' : 'businesses'} for a real website?\n\nUses Apify web search (~$0.02 each · ~$${est} total) and respects your daily cap. You can cancel partway.`)) return;
    bulkCancelRef.current = false;
    setBulkChecking(true);
    setBulkProgress({ done: 0, total: targets.length });
    let done = 0;
    for (const lead of targets) {
      if (bulkCancelRef.current) break;
      const res = await runWebsiteCheck(lead, true);
      if (res === 'capped') {
        toast({ title: 'Daily limit reached', description: `Stopped after ${done} — cap hit. Resume tomorrow.`, variant: 'destructive' });
        break;
      }
      done++;
      setBulkProgress({ done, total: targets.length });
    }
    setBulkChecking(false);
    setBulkProgress(null);
    if (!bulkCancelRef.current) toast({ title: 'Website check done', description: `Checked ${done} of ${targets.length}.` });
  }, [noWebsiteFiltered, runWebsiteCheck, toast]);

  const noWebsiteCount = filteredLeads.filter((l) => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

  const toggleFilter = useCallback((status: WebsiteStatus, checked: boolean) => {
    setStatusFilters(prev => checked ? [...prev, status] : prev.filter(s => s !== status));
  }, []);

  const toggleSocialFilter = useCallback((kind: 'instagram' | 'facebook', checked: boolean) => {
    setSocialFilters(prev => checked ? [...prev, kind] : prev.filter(k => k !== kind));
  }, []);

  const statusFilterOptions: WebsiteStatus[] = useMemo(() => ['NO_WEBSITE', 'HAS_OWN_WEBSITE', 'UNCERTAIN'], []);

  // ── Bulk ADD to CRM: the selected rows, or (with nothing selected) every
  // filtered row not already in Outreach. ONE batch add; one summary toast: "Added N, skipped M" + reasons.
  const [bulkAdding, setBulkAdding] = useState(false);
  /* A ref as well as the state: two clicks in one frame both read bulkAdding === false. No second run while one runs. */
  const bulkRunning = useRef(false);
  const runBulkAdd = useCallback(async (targets: Lead[]) => {
    if (!targets.length || !onBulkAdd || bulkAdding || bulkRunning.current) return;
    bulkRunning.current = true;
    setBulkAdding(true);
    try {
      const res = await onBulkAdd(targets);
      if (!res.cancelled) toast({ title: res.title ?? `Added ${res.added}, skipped ${res.skipped}`, description: res.description });
      setSelectedIds(new Set());
    } finally {
      bulkRunning.current = false;
      setBulkAdding(false);
    }
  }, [onBulkAdd, bulkAdding, toast]);

  // ── Bulk ENRICH (in place): confirm-before-spend (mirrors the Check-website
  // pattern), skips already-enriched (free), respects the server $2/day cap, and
  // writes into searchEnrichment — nothing is added to the CRM.
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);
  const enrichCancelRef = useRef(false);
  const handleBulkEnrichClick = useCallback(async () => {
    if (!onBulkEnrich) return;
    if (bulkEnriching) { enrichCancelRef.current = true; return; } // click again = cancel
    const targets = selectedLeads;
    if (!targets.length) return;
    const fresh = targets.filter((t) => !(isLeadEnriched?.(t.id)));
    const already = targets.length - fresh.length;
    if (!fresh.length) {
      toast({ title: 'Already enriched', description: 'All selected leads were enriched this session — nothing to spend.' });
      return;
    }
    const est = (fresh.length * 0.035).toFixed(2);
    if (!window.confirm(
      `Enrich ${fresh.length} selected ${fresh.length === 1 ? 'business' : 'businesses'} — finds email, Facebook, Instagram & WhatsApp signal?\n\n` +
      `~$0.035 each · ~$${est} total${already ? ` · ${already} already enriched (skipped, free)` : ''}. ` +
      `Respects the $2/day enrichment cap (stops early if reached). Results attach to the rows — nothing is added to your CRM. ` +
      `Click the button again to cancel partway.`,
    )) return;
    enrichCancelRef.current = false;
    setBulkEnriching(true);
    setEnrichProgress({ done: 0, total: targets.length });
    try {
      const res = await onBulkEnrich(
        targets,
        (done) => setEnrichProgress({ done, total: targets.length }),
        () => enrichCancelRef.current,
      );
      toast({
        title: res.stoppedAtCap ? 'Stopped at the daily enrichment cap' : res.cancelled ? 'Enrich cancelled' : 'Enrich complete',
        description: `${res.enriched} enriched · ${res.cached} from cache (free) · ${res.skipped} skipped · ${res.failed} failed.`,
      });
      setSelectedIds(new Set());
    } finally {
      setBulkEnriching(false);
      setEnrichProgress(null);
    }
  }, [onBulkEnrich, bulkEnriching, selectedLeads, isLeadEnriched, toast]);

  // Bulk buttons never bypass the single-add gate: hidden whenever saving is gated.
  const bulkAllowed = !isLocked && !(gated && !canSave);

  const renderFilterMenu = useCallback((align: 'start' | 'end' = 'start') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-border">
          <Filter className="h-3.5 w-3.5 mr-1.5" />Filter
        </Button>
      </DropdownMenuTrigger>
      {/* ⛔ NEVER TALLER THAN THE SCREEN (2026-10-02): Site management + Business age made the menu run off a
          laptop screen. It is capped at the space Radix measures beside the trigger (minus collisionPadding)
          and at the viewport, and the CONTENT scrolls inside it — the page never has to. Fixed width. */}
      <DropdownMenuContent align={align} collisionPadding={8} data-testid="find-leads-filter-menu"
        className="w-64 max-w-[calc(100vw-1rem)] max-h-[min(var(--radix-dropdown-menu-content-available-height,100dvh),calc(100dvh-1rem))] overflow-x-hidden overflow-y-auto overscroll-contain bg-popover border-border">
        {statusFilterOptions.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={statusFilters.includes(status)}
            onCheckedChange={(checked) => toggleFilter(status, !!checked)}
          >
            <StatusBadge status={status} />
          </DropdownMenuCheckboxItem>
        ))}
        {/* Free listing-social signals — the listing's "website" IS a social link
            (socialKindOf), no enrichment spend needed. */}
        <DropdownMenuCheckboxItem
          checked={socialFilters.includes('instagram')}
          onCheckedChange={(checked) => toggleSocialFilter('instagram', !!checked)}
          onSelect={(e) => e.preventDefault()}
        >
          <span className="flex items-center gap-1.5 text-sm"><Instagram className="h-3.5 w-3.5 text-pink-500" /> Listing = Instagram</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={socialFilters.includes('facebook')}
          onCheckedChange={(checked) => toggleSocialFilter('facebook', !!checked)}
          onSelect={(e) => e.preventDefault()}
        >
          <span className="flex items-center gap-1.5 text-sm"><Facebook className="h-3.5 w-3.5 text-blue-600" /> Listing = Facebook</span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Website · site management</DropdownMenuLabel>
        {SITE_FILTERS.map((f) => (
          <DropdownMenuCheckboxItem key={f.value} checked={siteFilters.includes(f.value)} onCheckedChange={(on) => toggleSiteFilter(f.value, !!on)} onSelect={(e) => e.preventDefault()} className="py-1 text-sm" data-testid={`site-filter-${f.value}`}>{f.label}</DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [statusFilters, toggleFilter, statusFilterOptions, socialFilters, toggleSocialFilter, siteFilters, toggleSiteFilter]);

  // Bulk action buttons (shared by the mobile + desktop headers), mirroring the
  // Outreach pattern: appear with a selection; "Add all shown" when none selected.
  // Primary bulk action — always visible: "Add to CRM (N)" with a selection, else
  // "Add all shown (M)". The money action stays prominent.
  const renderPrimaryAdd = useCallback(() => {
    if (!bulkAllowed || !onBulkAdd) return null;
    if (selectedLeads.length > 0) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={() => runBulkAdd(selectedLeads)} disabled={bulkAdding} className="h-9 px-3 text-xs">
              {bulkAdding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
              {bulkAdding ? (addProgressText(addProgress) ?? 'Adding…') : `Add to CRM (${selectedLeads.length})`}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{addCampaignTooltip}</TooltipContent>
        </Tooltip>
      );
    }
    /* "Add all shown" leaves out high-confidence agency sites too, the same as Select all (2026-10-01). */
    if (selectAllPool.length > 0) {
      const left = selectableLeads.length - selectAllPool.length;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => runBulkAdd(selectAllPool)} disabled={bulkAdding} className="h-9 px-3 text-xs border-border" data-testid="add-all-shown">
              {bulkAdding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
              {bulkAdding ? (addProgressText(addProgress) ?? 'Adding…') : `Add all shown (${selectAllPool.length})`}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{left > 0 ? `${addCampaignTooltip}. Leaves out ${left} site${left === 1 ? '' : 's'} an agency likely runs — add ${left === 1 ? 'it' : 'them'} one by one if you want.` : addCampaignTooltip}</TooltipContent>
        </Tooltip>
      );
    }
    return null;
  }, [bulkAllowed, onBulkAdd, selectedLeads, selectableLeads, selectAllPool, bulkAdding, runBulkAdd, addCampaignTooltip, addProgress]);

  // Secondary bulk/scan actions, grouped under one "Bulk ▾" menu:
  //   Enrich selected · Check for websites · Find emails · Add all with emails.
  // Behaviour/cost of each is unchanged — this is purely grouping + labelling.
  const renderBulkMenu = useCallback(() => {
    if (isLocked) return null;
    const canEnrich = !!onBulkEnrich;
    const canCheck = !!onSetWebsiteStatus && noWebsiteFiltered.length > 0;
    const canFindEmails = !!onFindEmails;
    const canExportEmails = !!onAddAllWithEmails; // add-all only shown after a scan (count>0)
    if (!canEnrich && !canCheck && !canFindEmails && !canExportEmails) return null;
    const busyLabel = bulkEnriching
      ? (enrichProgress ? `Enriching ${enrichProgress.done}/${enrichProgress.total}…` : 'Enriching…')
      : bulkChecking
        ? (bulkProgress ? `Checking ${bulkProgress.done}/${bulkProgress.total}…` : 'Checking…')
        : findingEmails
          ? (emailProgress ? `Finding emails ${emailProgress.done}/${emailProgress.total}…` : 'Finding emails…')
          : null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 border-border">
            {busyLabel ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-500" />}
            {busyLabel ?? 'Bulk'}
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Bulk actions</DropdownMenuLabel>
          {canEnrich && (
            <DropdownMenuItem
              disabled={selectedLeads.length === 0 && !bulkEnriching}
              onSelect={(e) => { e.preventDefault(); handleBulkEnrichClick(); }}
            >
              <Sparkles className="mr-2 h-3.5 w-3.5 text-violet-500" />
              {bulkEnriching ? 'Cancel enrich' : `Enrich selected (${selectedLeads.length}) · ~$0.035 each`}
            </DropdownMenuItem>
          )}
          {canCheck && (
            <DropdownMenuItem disabled={bulkChecking} onSelect={(e) => { e.preventDefault(); handleCheckBulk(); }}>
              <Globe className="mr-2 h-3.5 w-3.5" />
              Check for websites ({noWebsiteFiltered.length}) · ~$0.02 each
            </DropdownMenuItem>
          )}
          {(canFindEmails || canExportEmails) && <DropdownMenuSeparator />}
          {canFindEmails && (
            findingEmails ? (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onCancelFindEmails?.(); }}>
                <X className="mr-2 h-3.5 w-3.5" /> Cancel find emails
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={!withWebsiteCount} onSelect={(e) => { e.preventDefault(); onFindEmails?.(); }}>
                <Mail className="mr-2 h-3.5 w-3.5" /> Find emails ({withWebsiteCount} with a website) · free
              </DropdownMenuItem>
            )
          )}
          {canExportEmails && addAllWithEmailsCount > 0 && (
            <DropdownMenuItem disabled={addingEmails} onSelect={(e) => { e.preventDefault(); onAddAllWithEmails?.(); }}>
              <UserPlus className="mr-2 h-3.5 w-3.5" /> Add all with emails ({addAllWithEmailsCount})
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }, [isLocked, onBulkEnrich, onSetWebsiteStatus, noWebsiteFiltered.length, onFindEmails, onAddAllWithEmails, bulkEnriching, enrichProgress, bulkChecking, bulkProgress, findingEmails, emailProgress, selectedLeads.length, handleBulkEnrichClick, handleCheckBulk, onCancelFindEmails, withWebsiteCount, addAllWithEmailsCount, addingEmails]);

  // Exports grouped under one "Export ▾": plain CSV + CSV with found emails.
  const renderExportMenu = useCallback(() => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground" disabled={blurred}>
          {gated ? <Lock className="h-3.5 w-3.5 mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Export <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); isLocked ? onGatedAction?.() : handleExport?.(filteredLeads); }}>
          <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
        </DropdownMenuItem>
        {onExportWithEmails && (
          <DropdownMenuItem disabled={!filteredLeads.length} onSelect={(e) => { e.preventDefault(); onExportWithEmails(filteredLeads); }}>
            <Mail className="mr-2 h-3.5 w-3.5" /> Export with emails
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [blurred, gated, isLocked, onGatedAction, handleExport, onExportWithEmails, filteredLeads]);

  // View Details is always accessible — paywall only triggers on save/contact actions

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="pb-3 md:pb-4">
        {/* Mobile Header */}
        <div className="md:hidden space-y-3">
          <div>
            <CardTitle className="text-lg font-semibold">
              Search Results
              {selectedIds.size > 0 && <span className="ml-2 text-xs font-normal text-primary">{selectedIds.size} sel</span>}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredLeads.length} found • <span className="text-status-hot font-medium">{noWebsiteCount} hot leads</span>
              {filterNotice && <><br />{filterNotice}</>}
            </p>
             <p className="text-[11px] text-muted-foreground/70 mt-0.5">
               Tap 👁 to view details · 📋 to save to your list
             </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {renderFilterMenu('start')}
            {renderPrimaryAdd()}
            {renderBulkMenu()}
            {onExport && renderExportMenu()}
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">
              Search Results
              {selectedIds.size > 0 && <span className="ml-2 text-sm font-normal text-primary">{selectedIds.size} sel</span>}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Found {filteredLeads.length} businesses •
               <span className="text-status-hot font-semibold ml-1">{noWebsiteCount} without websites</span>
               {filterNotice ?? <span className="text-muted-foreground/70 ml-2">— Click 👁 to view details, 📋 to save to your list</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {renderFilterMenu('end')}
            {renderPrimaryAdd()}
            {renderBulkMenu()}
            {onExport && renderExportMenu()}
          </div>
        </div>
      </CardHeader>

      <CardContent className={`p-3 md:p-6 ${blurred ? 'relative select-none' : ''}`}>
        {blurred && (
          <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/30 rounded-b-lg" />
        )}
        {outsideCount > 0 && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="outside-town-line">
            {outsideCount} outside {outsideTownName} {showOutside ? 'shown' : 'hidden'}{' · '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setShowOutside((v) => !v)}>
              {showOutside ? 'Hide' : 'Show'}
            </button>
          </p>
        )}
        {notMatchCount > 0 && (
          <p className="mb-2 text-xs text-muted-foreground" data-testid="not-a-match-line"
            title="Their name and Google’s category don’t fit what you searched. Nothing is deleted, and they are not counted in found.">
            {notMatchCount} not a match for {nicheWords} {showNotMatch ? 'shown' : 'hidden'}{' · '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setShowNotMatch((v) => !v)}>
              {showNotMatch ? 'Hide' : 'Show'}
            </button>
          </p>
        )}
        {bulkAllowed && (
          <SelectionModeBar className="mb-2" pageIds={pagePoolIds} allIds={selectAllIds} selected={new Set(selectedLeads.map((l) => l.id))} onChange={setSelectedIds} />
        )}
        {/* Mobile View */}
        <div className="md:hidden space-y-1.5">
          {paginatedLeads.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">{emptyRows}</div>
              ) : paginatedLeads.map((lead, index) => {
            const checked = isChecked?.(lead.name, lead.googleMapsUrl);
            const inOutreach = checkIsInOutreach(lead.name, lead.googleMapsUrl);
            return (
              <div
                key={lead.id}
                className={`flex items-center justify-between py-2.5 px-3 rounded-md border border-border ${inOutreach ? 'bg-muted/30 opacity-70' : 'bg-background/80'}`}
              >
                {bulkAllowed && (
                  <Checkbox
                    checked={selectedIds.has(lead.id)}
                    onCheckedChange={(checked) => handleSelectOne(lead.id, checked as boolean)}
                    disabled={inOutreach || held(lead)}
                    aria-label={`Select ${lead.name}`}
                    className="mr-2.5 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-medium text-sm truncate leading-tight min-w-0">{lead.name}</p>
                    {lead.isExpanded && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Nearby</span>
                    )}
                    {/* MANY TOWNS (2026-10-16): which ticked town this result was searched in. */}
                    {lead.searchTown && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 font-medium shrink-0" data-testid="result-town">{lead.searchTown}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <WebsiteStatusToggle lead={lead} onSet={onSetWebsiteStatus} compact />
                    {hasOwnSite(lead) && <SiteManagementCell row={agency.rowFor(lead.websiteUrl)} checking={agency.isChecking(lead.websiteUrl)} hasWebsite compact />}
                  </div>
                  {onEnrichPatch && (
                    <div className="mt-1.5">
                      <SearchLeadContact
                        lead={lead}
                        enrichment={searchEnrichment?.[lead.id]}
                        onPatch={onEnrichPatch}
                        overflowMenu
                        onCheckWebsite={() => handleCheckOne(lead)}
                        checkWebsiteAvailable={!isLocked && !!onSetWebsiteStatus && (lead.websiteStatus === 'NO_WEBSITE' || lead.websiteStatus === 'DIRECTORY_ONLY')}
                        checkingWebsite={checkingId === lead.id}
                      />
                    </div>
                  )}
                </div>
                 <div className="flex items-center gap-1.5 flex-shrink-0">
                   {/* View Details — gated after 5 views for free users */}
                   <Tooltip>
                     <TooltipTrigger asChild>
                       {viewDetailsExhausted ? (
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-8 px-2.5 text-xs gap-1.5 hover:bg-muted"
                           onClick={(e) => { e.preventDefault(); onViewDetailsGated?.(); }}
                         >
                           <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                           <span>View Details</span>
                         </Button>
                       ) : (
                         <Button
                           variant="ghost"
                           size="sm"
                           className={`h-8 px-2.5 text-xs gap-1.5 ${checked ? 'text-muted-foreground/50 bg-muted/30' : 'hover:bg-muted'}`}
                           asChild
                         >
                           <a
                             href={lead.googleMapsUrl}
                             target="_blank"
                             rel="noopener noreferrer"
                             onClick={() => onMapLinkClick?.(lead.name, lead.googleMapsUrl)}
                           >
                             <EyeIcon checked={!!checked} small />
                             <span>View Details</span>
                           </a>
                         </Button>
                       )}
                     </TooltipTrigger>
                     <TooltipContent>{viewDetailsExhausted ? 'Start trial to view more' : checked ? 'Already viewed' : 'View business info'}</TooltipContent>
                   </Tooltip>
                  {onAddToOutreach && viewerRole === 'sales' && salesOwnershipCell(ownership?.(lead), onClaim, claiming)}
                  {onAddToOutreach && !(viewerRole === 'sales' && salesOwnershipCell(ownership?.(lead), onClaim, claiming)) && (
                    inOutreach ? (
                      <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] font-medium whitespace-nowrap">
                        <Check className="h-3.5 w-3.5" />
                        In your list
                      </span>
                    ) : viewerRole === 'admin' && isAlreadyAdded(ownership?.(lead)) ? (
                      /* The server knows it (a lead that came in by file, 2026-10-19): never an Add button. */
                      <AlreadyAddedMarker own={ownership!(lead)!} compact />
                    ) : gated && !canSave ? (
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 bg-primary/15 text-primary hover:bg-primary/25"
                          onClick={() => onGatedAction?.()}
                          data-walkthrough-step="add-to-crm"
                          data-walkthrough="add-crm"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </Button>
                        {index === 0 && safePage === 1 && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 overflow-hidden rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md whitespace-nowrap pointer-events-none">
                             🔒 Start trial to save this lead
                           </div>
                        )}
                      </div>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="default"
                            size="icon"
                            className={`h-8 w-8 bg-primary hover:bg-primary/90`}
                            onClick={() => handleAddToOutreach(lead)}
                            disabled={addingIds.has(lead.id) || held(lead)}
                            aria-busy={addingIds.has(lead.id)}
                            data-walkthrough-step="add-to-crm"
                            data-walkthrough="add-crm"
                          >
                            {addingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                          </Button>
                        </TooltipTrigger>
                         <TooltipContent>{held(lead) ? heldWhy(lead) : 'Save this lead'}</TooltipContent>
                      </Tooltip>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {bulkAllowed && (
                  <TableHead className="w-[36px] pl-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all on every page"
                      title="Select all on every page"
                      disabled={selectableLeads.length === 0}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[27%] pl-2">Business Name</TableHead>
                <TableHead className="w-[16%]">Website Status</TableHead>
                <TableHead className="w-[17%]" title="Who runs their website — a machine check of the site">Site management</TableHead>
                <TableHead className="w-[20%]">More Details</TableHead>
                <TableHead className="w-[20%]" data-walkthrough="actions-column-header">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={bulkAllowed ? 6 : 5} className="h-24 text-center text-muted-foreground">
                    {emptyRows}
                  </TableCell>
                </TableRow>
              ) : paginatedLeads.map((lead, index) => {
                const inOutreach = checkIsInOutreach(lead.name, lead.googleMapsUrl);
                return (
                <TableRow
                  key={lead.id}
                  className={`border-border hover:bg-muted/30 ${inOutreach ? 'bg-muted/20 opacity-70' : ''}`}
                >
                  {bulkAllowed && (
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={(checked) => handleSelectOne(lead.id, checked as boolean)}
                        disabled={inOutreach || held(lead)}
                        aria-label={`Select ${lead.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium pl-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Wrap (not truncate) a long name within a bounded width so the
                          row height grows but the columns to its right stay aligned. */}
                      <span className="min-w-0 break-words max-w-[220px]">{lead.name}</span>
                      {lead.isExpanded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Nearby</span>
                      )}
                      {/* MANY TOWNS (2026-10-16): which ticked town this result was searched in. */}
                      {lead.searchTown && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 font-medium shrink-0" data-testid="result-town">{lead.searchTown}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div><WebsiteStatusToggle lead={lead} onSet={onSetWebsiteStatus} /></div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[300px] bg-popover border-border">
                          <p className="text-sm">{lead.reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <SiteManagementCell row={agency.rowFor(lead.websiteUrl)} checking={agency.isChecking(lead.websiteUrl)} hasWebsite={hasOwnSite(lead)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                    {lead.googleMapsUrl && (
                      viewDetailsExhausted ? (
                        <button
                          onClick={(e) => { e.preventDefault(); onViewDetailsGated?.(); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                          title="Open in Google Maps"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      ) : (
                        <a
                          href={lead.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onMapLinkClick?.(lead.name, lead.googleMapsUrl)}
                          className="p-1.5 rounded-md text-blue-500 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
                          title="Open in Google Maps"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )
                    )}
                    {onEnrichPatch && (
                      <SearchLeadContact
                        lead={lead}
                        enrichment={searchEnrichment?.[lead.id]}
                        onPatch={onEnrichPatch}
                        overflowMenu
                        onCheckWebsite={() => handleCheckOne(lead)}
                        checkWebsiteAvailable={!isLocked && !!onSetWebsiteStatus && (lead.websiteStatus === 'NO_WEBSITE' || lead.websiteStatus === 'DIRECTORY_ONLY')}
                        checkingWebsite={checkingId === lead.id}
                      />
                    )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      {onAddToOutreach && (() => {
                        /* Multi-user: a salesperson sees the SERVER's ownership state first — no Add or
                           Claim on anything owned or contacted. 'new' falls through to the Add button. */
                        if (viewerRole === 'sales') {
                          const cell = salesOwnershipCell(ownership?.(lead), onClaim, claiming);
                          if (cell) return cell;
                        }
                        // Three-state action when Index supplies live CRM state:
                        //   in CRM + fresh   → Remove (destructive; deletes after a live re-check)
                        //   in CRM + actioned → "In CRM" (disabled, protected)
                        //   not in CRM       → Add to CRM (with the campaign tooltip)
                        // Without getCrmState (other callers), keep the legacy
                        // "In your list" indicator for the ever-added case.
                        const crm = getCrmState?.(lead);
                        /* v2: in the CRM but not in the campaign picked above → offer to put it there. */
                        const moveBtn = crm?.inCrm && crm.crmLeadId && activeCampaign && onMoveToCampaign && crm.campaignId !== activeCampaign.id
                          ? <Button variant="outline" size="sm" className="h-8 px-2 text-xs" data-testid="crm-move-to-campaign"
                              title={`Put this lead into ${activeCampaign.name}`} onClick={() => onMoveToCampaign(crm.crmLeadId!)}>
                              → {activeCampaign.name.length > 18 ? `${activeCampaign.name.slice(0, 17)}…` : activeCampaign.name}
                            </Button>
                          : null;
                        if (crm?.inCrm && moveBtn) {
                          return <div className="flex items-center gap-1.5">{moveBtn}</div>;
                        }
                        if (crm?.inCrm) {
                          if (crm.isFresh && crm.crmLeadId && onRemoveFromCrm) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs gap-1.5 text-red-600 dark:text-red-500 border-red-600/30 hover:bg-red-500/10 hover:text-red-600"
                                    onClick={() => onRemoveFromCrm(crm.crmLeadId!, lead.name)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Remove
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove from CRM (only while untouched)</TooltipContent>
                              </Tooltip>
                            );
                          }
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium whitespace-nowrap cursor-default">
                                  <Check className="h-3.5 w-3.5" />
                                  In CRM
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>In your CRM and already being worked (status, star, note or Next Action) — manage it on the Outreach page</TooltipContent>
                            </Tooltip>
                          );
                        }
                        /* ⛔ THE SERVER RECOGNISES IT, THIS PAGE'S OWN MATCH DID NOT (2026-10-19): a lead that came in by FILE
                           (Ethan's Malaysian / Singapore leads — no place id, phone +60, a different spelling) is matched by
                           lead_identity_lookup on phone, website or name + town. It is already added: no Add button, the
                           owner's avatar ("Added by <name>") or a neutral In CRM tick, not clickable. */
                        if (viewerRole === 'admin' && !crm?.inCrm && isAlreadyAdded(ownership?.(lead))) {
                          return <AlreadyAddedMarker own={ownership!(lead)!} />;
                        }
                        // Legacy indicator when no live CRM state is provided.
                        if (!crm && inOutreach) {
                          return (
                            <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium whitespace-nowrap">
                              <Check className="h-3.5 w-3.5" />
                              In your list
                            </span>
                          );
                        }
                        if (gated && !canSave) {
                          return (
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-primary/15 text-primary hover:bg-primary/25"
                                onClick={() => onGatedAction?.()}
                                data-walkthrough-step="add-to-crm"
                                data-walkthrough="add-crm"
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                              {index === 0 && safePage === 1 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 overflow-hidden rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md whitespace-nowrap pointer-events-none">
                                  🔒 Start trial to save this lead
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-8 px-3 text-xs gap-1.5 text-green-600 dark:text-green-500 border-green-600/30 hover:bg-green-500/10 hover:text-green-500`}
                                onClick={() => handleAddToOutreach(lead)}
                                disabled={addingIds.has(lead.id) || held(lead)}
                                aria-busy={addingIds.has(lead.id)}
                                data-testid="find-leads-add-to-crm"
                                data-walkthrough-step="add-to-crm"
                                data-walkthrough="add-crm"
                              >
                                {addingIds.has(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
                                {addingIds.has(lead.id) ? 'Adding…' : 'Add to CRM'}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{held(lead) ? heldWhy(lead) : addCampaignTooltip}</TooltipContent>
                          </Tooltip>
                        );
                      })()}
                      {/* Beside In CRM / Remove only — the AlreadyAddedMarker above carries its own avatar. */}
                      {viewerRole === 'admin' && (getCrmState ? getCrmState(lead).inCrm : true) && adminOwnerMarker(ownership?.(lead))}
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {((safePage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(safePage * ITEMS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="border-border">
                <ChevronLeft className="h-4 w-4 mr-1" />Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (safePage <= 3) pageNum = i + 1;
                  else if (safePage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = safePage - 2 + i;
                  return (
                    <Button
                      key={pageNum}
                      variant={safePage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      className={`w-8 h-8 p-0 ${safePage === pageNum ? 'bg-primary' : 'border-border'}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} className="border-border">
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
