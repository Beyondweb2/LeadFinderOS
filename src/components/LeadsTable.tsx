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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
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
}

export function LeadsTable({ leads, onExport, onAddToOutreach, isInOutreach, onMapLinkClick, isChecked, blurred = false, gated = false, onGatedAction, savedLeadCount = 0, maxFreeSaves = 3, onViewDetailsGated, viewDetailsExhausted = false, getTeamClaim, searchEnrichment, onEnrichPatch, onSetWebsiteStatus }: LeadsTableProps) {
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
  const [currentPage, setCurrentPage] = useState<number>(() => Math.max(1, savedView?.page ?? 1));

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const effectiveStatus = lead.websiteStatus === 'DIRECTORY_ONLY' ? 'NO_WEBSITE' : lead.websiteStatus;
      return statusFilters.includes(effectiveStatus);
    });
  }, [leads, statusFilters]);

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
  }, [leads]);

  // Reconcile state to the clamped page so persistence + pagination buttons stay
  // in range (e.g. after a filter toggle reduces the page count).
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  // Persist page + filters (per-user, survives nav / reload / re-login).
  useEffect(() => {
    writeSearchResultsView(user?.id, { filters: statusFilters, page: safePage });
  }, [user?.id, statusFilters, safePage]);

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

  const statusFilterOptions: WebsiteStatus[] = useMemo(() => ['NO_WEBSITE', 'HAS_OWN_WEBSITE', 'UNCERTAIN'], []);

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
      </DropdownMenuContent>
    </DropdownMenu>
  ), [statusFilters, toggleFilter, statusFilterOptions]);

  // View Details is always accessible — paywall only triggers on save/contact actions

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="pb-3 md:pb-4">
        {/* Mobile Header */}
        <div className="md:hidden space-y-3">
          <div>
            <CardTitle className="text-lg font-semibold">Search Results</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {leads.length} found • <span className="text-status-hot font-medium">{noWebsiteCount} hot leads</span>
            </p>
             <p className="text-[11px] text-muted-foreground/70 mt-0.5">
               Tap 👁 to view details · 📋 to save to your list
             </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {renderFilterMenu('start')}
            {!isLocked && onSetWebsiteStatus && noWebsiteFiltered.length > 0 && (
              <Button onClick={handleCheckBulk} disabled={bulkChecking} size="sm" variant="outline" className="h-8 px-2.5 text-xs border-border" title="Web-search the no-website leads for a real own-site (~$0.02 each, daily-capped)">
                {bulkChecking ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Globe className="h-3.5 w-3.5 mr-1.5" />}
                {bulkChecking && bulkProgress ? `Checking ${bulkProgress.done}/${bulkProgress.total}` : `Check website (${noWebsiteFiltered.length})`}
              </Button>
            )}
            <Button onClick={isLocked ? () => onGatedAction?.() : handleExport} size="sm" className="h-8 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground" disabled={blurred}>
              {gated ? <Lock className="h-3.5 w-3.5 mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}Export
            </Button>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">Search Results</CardTitle>
            <p className="text-sm text-muted-foreground">
              Found {leads.length} businesses •
               <span className="text-status-hot font-semibold ml-1">{noWebsiteCount} without websites</span>
               <span className="text-muted-foreground/70 ml-2">— Click 👁 to view details, 📋 to save to your list</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {renderFilterMenu('end')}
            {!isLocked && onSetWebsiteStatus && noWebsiteFiltered.length > 0 && (
              <Button onClick={handleCheckBulk} disabled={bulkChecking} variant="outline" className="border-border" title="Web-search the no-website leads for a real own-site (~$0.02 each, daily-capped)">
                {bulkChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                {bulkChecking && bulkProgress ? `Checking ${bulkProgress.done}/${bulkProgress.total}` : `Check website (${noWebsiteFiltered.length})`}
              </Button>
            )}
            <Button onClick={isLocked ? () => onGatedAction?.() : handleExport} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={blurred}>
              {gated ? <Lock className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}Export CSV
            </Button>
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
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-1.5">
                    {(() => { const tc = getTeamClaim?.(lead); return tc ? <TeamClaimBadge claim={tc} small /> : null; })()}
                    <p className="font-medium text-sm truncate leading-tight">{lead.name}</p>
                    {lead.isExpanded && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Nearby</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <WebsiteStatusToggle lead={lead} onSet={onSetWebsiteStatus} compact />
                    {!isLocked && onSetWebsiteStatus && (lead.websiteStatus === 'NO_WEBSITE' || lead.websiteStatus === 'DIRECTORY_ONLY') && (
                      <Button onClick={() => handleCheckOne(lead)} disabled={checkingId === lead.id} size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground" title="Web-search for a real own-website (~$0.02, daily-capped)">
                        {checkingId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Globe className="h-3 w-3 mr-1" />Check</>}
                      </Button>
                    )}
                  </div>
                  {onEnrichPatch && (
                    <div className="mt-1.5">
                      <SearchLeadContact lead={lead} enrichment={searchEnrichment?.[lead.id]} onPatch={onEnrichPatch} />
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
                <TableHead className="w-[30%] pl-5">Business Name</TableHead>
                <TableHead className="w-[20%]">Website Status</TableHead>
                <TableHead className="w-[30%]">More Details</TableHead>
                <TableHead className="w-[20%]" data-walkthrough="actions-column-header">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
                  <TableCell className="font-medium pl-5">
                    <div className="flex items-center gap-2">
                      {(() => { const tc = getTeamClaim?.(lead); return tc ? <TeamClaimBadge claim={tc} /> : null; })()}
                      <span className="truncate block">{lead.name}</span>
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
                      {!isLocked && onSetWebsiteStatus && (lead.websiteStatus === 'NO_WEBSITE' || lead.websiteStatus === 'DIRECTORY_ONLY') && (
                        <Button onClick={() => handleCheckOne(lead)} disabled={checkingId === lead.id} size="sm" variant="ghost" className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground" title="Web-search for a real own-website (~$0.02, daily-capped)">
                          {checkingId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Globe className="h-3 w-3 mr-1" />Check</>}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                    {lead.googleMapsUrl && (
                      viewDetailsExhausted ? (
                        <button
                          onClick={(e) => { e.preventDefault(); onViewDetailsGated?.(); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                          title="Open Google Maps"
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
                          title="Open Google Maps"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )
                    )}
                    {onEnrichPatch && (
                      <SearchLeadContact lead={lead} enrichment={searchEnrichment?.[lead.id]} onPatch={onEnrichPatch} />
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
