import { useState, useMemo, useCallback, memo, useEffect, useRef } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { WebsiteStatusToggle } from './WebsiteStatusToggle';
import {
  Download, Filter, ChevronLeft, ChevronRight, ClipboardList, Check, Eye, Lock, MapPin, ExternalLink, Globe, Loader2,
  Instagram, Facebook, Sparkles, Mail, UserPlus, ChevronDown, MoreHorizontal, X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { socialKindOf } from '@/lib/socialUrl';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Lead, WebsiteStatus } from '@/types/lead';
import type { OutreachLead } from '@/types/outreach';
import { SearchLeadContact } from './SearchLeadContact';
import type { TeamClaim } from '@/hooks/useTeamClaims';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { readSearchResultsView, writeSearchResultsView } from '@/lib/searchResultsPrefs';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Soft teammate-claim indicator: a small avatar shown when a teammate has
 * already claimed this business in the active campaign. Purely informational —
 * the add button stays enabled.
 */
const TeamClaimBadge = memo(({ claim, small }: { claim: TeamClaim; small?: boolean }) => {
  const label = claim.displayName || 'A teammate';
  const size = small ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className={`${size} shrink-0 ring-1 ring-amber-400/60`}>
          {claim.avatarUrl && <AvatarImage src={claim.avatarUrl} alt={label} />}
          <AvatarFallback className="text-[8px] bg-amber-500/20 text-amber-700 dark:text-amber-300">
            {initials(claim.displayName)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>
        {label} {claim.contacted ? 'has contacted' : 'claimed'} this in the current campaign
      </TooltipContent>
    </Tooltip>
  );
});
TeamClaimBadge.displayName = 'TeamClaimBadge';

const ITEMS_PER_PAGE = 25;

const EyeIcon = memo(({ checked, small }: { checked: boolean; small?: boolean }) => (
  <Eye className={`${small ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${checked ? '' : 'text-muted-foreground'}`} />
));
EyeIcon.displayName = 'EyeIcon';

interface LeadsTableProps {
  leads: Lead[];
  onExport: () => void;
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
  /** Resolve a teammate's claim on this business in the active campaign (soft indicator). */
  getTeamClaim?: (lead: Lead) => TeamClaim | null;
  /** Contact-enrichment found per place_id before the lead is saved (search-time). */
  searchEnrichment?: Record<string, Partial<OutreachLead>>;
  /** Patch search-time enrichment state, keyed by place_id. */
  onEnrichPatch?: (placeId: string, patch: Partial<OutreachLead>) => Promise<any>;
  /** Manually correct a result's website status (persists + wins over auto-detection). */
  onSetWebsiteStatus?: (lead: Lead, status: WebsiteStatus) => void;
  /** Bulk-add the given leads to Outreach (silent per-lead, deduped). */
  onBulkAdd?: (leads: Lead[]) => Promise<{ added: number; skipped: number }>;
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
  onExportWithEmails?: () => void;
  /** Precomputed hover-tooltip text for the Add-to-CRM buttons (per-row + bulk).
   *  Index decides the wording: "Add to {campaign}" when adding silently, or
   *  "Choose a campaign…" when the ask-each-time toggle is on. */
  addCampaignTooltip?: string;
}

export function LeadsTable({ leads, onExport, onAddToOutreach, isInOutreach, onMapLinkClick, isChecked, blurred = false, gated = false, onGatedAction, savedLeadCount = 0, maxFreeSaves = 3, onViewDetailsGated, viewDetailsExhausted = false, getTeamClaim, searchEnrichment, onEnrichPatch, onSetWebsiteStatus, onBulkAdd, onBulkEnrich, isLeadEnriched, onFindEmails, onCancelFindEmails, findingEmails = false, emailProgress, emailResult, withWebsiteCount = 0, onAddAllWithEmails, addingEmails = false, addAllWithEmailsCount = 0, onExportWithEmails, addCampaignTooltip = 'Add to CRM' }: LeadsTableProps) {
  const isLocked = blurred || gated;
  const handleExport = isLocked ? undefined : onExport;
  const { state, isDemoUser } = useDemoChecklist();
  const { user } = useAuth();
  const shouldPulseCrm = isDemoUser && !state.addedToCrm;
  // Allow saving up to maxFreeSaves leads even for gated users
  const canSave = !gated || savedLeadCount < maxFreeSaves;
  const handleAddToOutreach = useCallback((lead: Lead) => {
    if (gated && !canSave) { onGatedAction?.(); return; }
    return onAddToOutreach?.(lead);
  }, [onAddToOutreach, gated, canSave, onGatedAction]);

  const checkIsInOutreach = useCallback((name: string, url?: string) => {
    return isInOutreach?.(name, url) ?? false;
  }, [isInOutreach]);

  const ALL_STATUSES = useMemo<WebsiteStatus[]>(() => ['NO_WEBSITE', 'HAS_OWN_WEBSITE', 'UNCERTAIN'], []);

  // Restore the saved page + website filter once (per-user, safe-wrapped storage).
  // Invalid/empty saved filters fall back to "all" so we never restore a view that
  // shows nothing. The saved page is clamped to the live result set below.
  const savedView = useRef(readSearchResultsView(user?.id)).current;
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

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const effectiveStatus = lead.websiteStatus === 'DIRECTORY_ONLY' ? 'NO_WEBSITE' : lead.websiteStatus;
      if (!statusFilters.includes(effectiveStatus)) return false;
      if (socialFilters.length) {
        const kind = socialKindOf(lead.websiteUrl);
        if (!kind || !socialFilters.includes(kind)) return false;
      }
      return true;
    });
  }, [leads, statusFilters, socialFilters]);

  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  // Render against a CLAMPED page so a page beyond the current set (restored from
  // storage, or after a filter toggle shrinks the results) never shows an empty
  // page — it falls back to the LAST valid page, not page 1.
  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const paginatedLeads = filteredLeads.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  // Reset to page 1 only when a NEW search loads (leads change while mounted) — NOT
  // on first mount (we restore the saved page) and NOT on filter toggle (Fix B:
  // keep the page; the clamp below handles out-of-range).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    setCurrentPage(1);
    setSelectedIds(new Set()); // new search → stale selection would act on gone rows
  }, [leads]);

  // Reconcile state to the clamped page so persistence + pagination buttons stay
  // in range (e.g. after a filter toggle reduces the page count).
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  // Persist page + filters (per-user, survives nav / reload / re-login).
  useEffect(() => {
    writeSearchResultsView(user?.id, { filters: statusFilters, page: safePage, socials: socialFilters });
  }, [user?.id, statusFilters, safePage, socialFilters]);

  // ── Multi-select (mirrors OutreachTable's pattern: Set-based ids, header
  // select-all across ALL filtered rows, per-row checkboxes, cleared after acting).
  // Rows already in Outreach are unselectable (can't be re-added).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectableLeads = useMemo(
    () => filteredLeads.filter((l) => !checkIsInOutreach(l.name, l.googleMapsUrl)),
    [filteredLeads, checkIsInOutreach],
  );
  // Resolve the selection against the CURRENT filtered set, so a filter change
  // after selecting can never bulk-act on rows that are no longer shown.
  const selectedLeads = useMemo(
    () => selectableLeads.filter((l) => selectedIds.has(l.id)),
    [selectableLeads, selectedIds],
  );
  const allSelected = selectableLeads.length > 0 && selectableLeads.every((l) => selectedIds.has(l.id));
  const handleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableLeads.map((l) => l.id)));
  }, [allSelected, selectableLeads]);
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

  const noWebsiteCount = leads.filter((l) => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

  const toggleFilter = useCallback((status: WebsiteStatus, checked: boolean) => {
    setStatusFilters(prev => checked ? [...prev, status] : prev.filter(s => s !== status));
  }, []);

  const toggleSocialFilter = useCallback((kind: 'instagram' | 'facebook', checked: boolean) => {
    setSocialFilters(prev => checked ? [...prev, kind] : prev.filter(k => k !== kind));
  }, []);

  const statusFilterOptions: WebsiteStatus[] = useMemo(() => ['NO_WEBSITE', 'HAS_OWN_WEBSITE', 'UNCERTAIN'], []);

  // ── Bulk ADD to CRM: the selected rows, or (with nothing selected) every
  // filtered row not already in Outreach. Silent per-lead adds; one summary toast.
  const [bulkAdding, setBulkAdding] = useState(false);
  const runBulkAdd = useCallback(async (targets: Lead[]) => {
    if (!targets.length || !onBulkAdd || bulkAdding) return;
    setBulkAdding(true);
    try {
      const { added, skipped } = await onBulkAdd(targets);
      toast({
        title: `Added ${added} lead${added === 1 ? '' : 's'} to your CRM`,
        description: skipped ? `${skipped} skipped (already in your list).` : undefined,
      });
      setSelectedIds(new Set());
    } finally {
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
      <DropdownMenuContent align={align} className="bg-popover border-border">
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
      </DropdownMenuContent>
    </DropdownMenu>
  ), [statusFilters, toggleFilter, statusFilterOptions, socialFilters, toggleSocialFilter]);

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
              Add to CRM ({selectedLeads.length})
            </Button>
          </TooltipTrigger>
          <TooltipContent>{addCampaignTooltip}</TooltipContent>
        </Tooltip>
      );
    }
    if (selectableLeads.length > 0) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => runBulkAdd(selectableLeads)} disabled={bulkAdding} className="h-9 px-3 text-xs border-border">
              {bulkAdding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
              Add all shown ({selectableLeads.length})
            </Button>
          </TooltipTrigger>
          <TooltipContent>{addCampaignTooltip}</TooltipContent>
        </Tooltip>
      );
    }
    return null;
  }, [bulkAllowed, onBulkAdd, selectedLeads, selectableLeads, bulkAdding, runBulkAdd, addCampaignTooltip]);

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
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); isLocked ? onGatedAction?.() : handleExport?.(); }}>
          <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
        </DropdownMenuItem>
        {onExportWithEmails && (
          <DropdownMenuItem disabled={!leads.length} onSelect={(e) => { e.preventDefault(); onExportWithEmails(); }}>
            <Mail className="mr-2 h-3.5 w-3.5" /> Export with emails
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ), [blurred, gated, isLocked, onGatedAction, handleExport, onExportWithEmails, leads.length]);

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
              {leads.length} found • <span className="text-status-hot font-medium">{noWebsiteCount} hot leads</span>
            </p>
             <p className="text-[11px] text-muted-foreground/70 mt-0.5">
               Tap 👁 to view details · 📋 to save to your list
             </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {renderFilterMenu('start')}
            {renderPrimaryAdd()}
            {renderBulkMenu()}
            {renderExportMenu()}
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
              Found {leads.length} businesses •
               <span className="text-status-hot font-semibold ml-1">{noWebsiteCount} without websites</span>
               <span className="text-muted-foreground/70 ml-2">— Click 👁 to view details, 📋 to save to your list</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {renderFilterMenu('end')}
            {renderPrimaryAdd()}
            {renderBulkMenu()}
            {renderExportMenu()}
          </div>
        </div>
      </CardHeader>

      <CardContent className={`p-3 md:p-6 ${blurred ? 'relative select-none' : ''}`}>
        {blurred && (
          <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/30 rounded-b-lg" />
        )}
        {/* Mobile View */}
        <div className="md:hidden space-y-1.5">
          {paginatedLeads.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No leads match your current filters.</div>
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
                    disabled={inOutreach}
                    aria-label={`Select ${lead.name}`}
                    className="mr-2.5 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {(() => { const tc = getTeamClaim?.(lead); return tc ? <TeamClaimBadge claim={tc} small /> : null; })()}
                    <p className="font-medium text-sm truncate leading-tight min-w-0">{lead.name}</p>
                    {lead.isExpanded && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Nearby</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <WebsiteStatusToggle lead={lead} onSet={onSetWebsiteStatus} compact />
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
                  {onAddToOutreach && (
                    inOutreach ? (
                      <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-[11px] font-medium whitespace-nowrap">
                        <Check className="h-3.5 w-3.5" />
                        In your list
                      </span>
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
                            className={`h-8 w-8 bg-primary hover:bg-primary/90 ${shouldPulseCrm ? 'animate-crm-pulse' : ''}`}
                            onClick={() => handleAddToOutreach(lead)}
                            data-walkthrough-step="add-to-crm"
                            data-walkthrough="add-crm"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                         <TooltipContent>Save this lead</TooltipContent>
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
                      aria-label="Select all"
                      disabled={selectableLeads.length === 0}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[28%] pl-2">Business Name</TableHead>
                <TableHead className="w-[20%]">Website Status</TableHead>
                <TableHead className="w-[30%]">More Details</TableHead>
                <TableHead className="w-[20%]" data-walkthrough="actions-column-header">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={bulkAllowed ? 5 : 4} className="h-24 text-center text-muted-foreground">
                    No leads match your current filters.
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
                        disabled={inOutreach}
                        aria-label={`Select ${lead.name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium pl-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => { const tc = getTeamClaim?.(lead); return tc ? <TeamClaimBadge claim={tc} /> : null; })()}
                      {/* Wrap (not truncate) a long name within a bounded width so the
                          row height grows but the columns to its right stay aligned. */}
                      <span className="min-w-0 break-words max-w-[220px]">{lead.name}</span>
                      {lead.isExpanded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Nearby</span>
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
                      {onAddToOutreach && (
                        inOutreach ? (
                          <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium whitespace-nowrap">
                            <Check className="h-3.5 w-3.5" />
                            In your list
                          </span>
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
                              <Lock className="h-4 w-4" />
                            </Button>
                            {index === 0 && safePage === 1 && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 overflow-hidden rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md whitespace-nowrap pointer-events-none">
                                🔒 Start trial to save this lead
                              </div>
                            )}
                          </div>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-8 px-3 text-xs gap-1.5 text-green-600 dark:text-green-500 border-green-600/30 hover:bg-green-500/10 hover:text-green-500 ${shouldPulseCrm ? 'animate-crm-pulse' : ''}`}
                                onClick={() => handleAddToOutreach(lead)}
                                data-walkthrough-step="add-to-crm"
                                data-walkthrough="add-crm"
                              >
                                <ClipboardList className="h-3.5 w-3.5" />
                                Add to CRM
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{addCampaignTooltip}</TooltipContent>
                          </Tooltip>
                        )
                      )}
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
