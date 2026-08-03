import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import MarketPanel from '@/components/MarketPanel';
import { LeadsTable } from '@/components/LeadsTable';
// EmailListBuilder kept in the repo for the future bulk-add flow; no longer rendered
// here (email finding is now an in-place scan on the results).
import { CampaignPicker } from '@/components/CampaignPicker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isFreshLead } from '@/lib/leadStatus';

import { supabase } from '@/integrations/supabase/client';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';

import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useSearchEnrichment } from '@/hooks/useSearchEnrichment';
import { useFindEmails } from '@/hooks/useFindEmails';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTeamClaims } from '@/hooks/useTeamClaims';
import { Flame, Zap, Search, MapPin, Info, Globe2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Country, Lead, SearchMode } from '@/types/lead';

const ACTIVE_CAMPAIGN_KEY = 'leadfinder_active_campaign';
const ASK_CAMPAIGN_KEY = 'lf_ask_campaign_each_time';

const Index = () => {
  const { leads, isLoading, search, retryLastSearch, exportToCsv, searchError, searchNotice, expanded, setWebsiteOverride, regionMeta, regionDowngraded, townFilterFallback } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: crmLeads, removeFreshLead, refetch: refetchCrm } = useOutreach();
  const { searchEnrichment, patchEnrichment, getEnrichment } = useSearchEnrichment();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { toast } = useToast();

  /* THE URL IS THE MARKET VIEW'S MEMORY.
     A market view used to vanish on navigating away: the lead search survives via sessionStorage,
     this did not. Putting mode + trade + town in the query string makes one mechanism cover
     everything at once — the back button, a refresh, a pasted link, and returning to the page.

     WHY townOnly IS NOT CARRIED: market-view never receives it. The server resolves the pool from
     search_history on its own, trying the town-scoped cache key first and the radius key second,
     and reports which it used via poolState.scope. The flag is not an input, so a rebuilt view
     cannot look up a different pool than the one first shown. In market mode the form forces it on
     regardless, so there is no variation to carry either. */
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get('mode') === 'market' ? 'market' : 'leads';
  const urlTrade = (searchParams.get('trade') ?? '').trim();
  const urlTown = (searchParams.get('town') ?? '').trim();
  /* Seeded from the URL on FIRST RENDER, not in an effect, so the panel never paints an empty
     market for a frame before correcting itself. */
  const [activeMode, setActiveMode] = useState<SearchMode>(
    urlMode === 'market' && urlTrade && urlTown ? 'market' : 'leads',
  );
  const [marketTrade, setMarketTrade] = useState(urlMode === 'market' ? urlTrade : '');
  const [marketTown, setMarketTown] = useState(urlMode === 'market' ? urlTown : '');
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [lastSearchKeyword, setLastSearchKeyword] = useState<string | null>(null);
  const [lastSearchLocation, setLastSearchLocation] = useState<string | null>(null);
  // One page, one search. The radius slider is the single control: ≤50km = a
  // normal single-centre search only — region tiling is capped out of the UI.

  // Active campaign — new leads added from search are tagged with it.
  // Persisted so it survives navigation/reload.
  const [activeCampaign, setActiveCampaign] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || null; } catch { return null; }
  });
  const handleCampaignChange = useCallback((id: string | null) => {
    setActiveCampaign(id);
    try {
      if (id) localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
      else localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    } catch {}
  }, []);

  // "Ask which campaign each time" toggle — when ON, an Add-to-CRM action prompts
  // for a campaign instead of silently using activeCampaign. Persisted like the
  // active campaign so the preference sticks.
  const [askCampaignEachTime, setAskCampaignEachTime] = useState<boolean>(() => {
    try { return localStorage.getItem(ASK_CAMPAIGN_KEY) === '1'; } catch { return false; }
  });
  const handleAskToggle = useCallback((on: boolean) => {
    setAskCampaignEachTime(on);
    try {
      if (on) localStorage.setItem(ASK_CAMPAIGN_KEY, '1');
      else localStorage.removeItem(ASK_CAMPAIGN_KEY);
    } catch {}
  }, []);

  // Campaign-choice dialog (only used when askCampaignEachTime is ON). Holds the
  // pending add — a single row lead, or the bulk batch — plus the chosen campaign.
  // For bulk, LeadsTable awaits onBulkAdd's result for its summary toast, so we
  // resolve that promise once the dialog is confirmed/cancelled.
  const [pendingAdd, setPendingAdd] = useState<
    | { kind: 'row'; lead: Lead }
    | { kind: 'bulk'; leads: Lead[] }
    | null
  >(null);
  const [chosenCampaign, setChosenCampaign] = useState<string | null>(null);
  const bulkResolverRef = useRef<((r: { added: number; skipped: number }) => void) | null>(null);

  // Self-heal a stale active campaign: if the persisted id no longer exists
  // (campaign deleted by anyone, or the whole account was wiped), fall back to
  // "No campaign" so adding a lead can't fail with a campaign_id foreign-key
  // violation. Reconciles only after the real list has loaded.
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();
  useEffect(() => {
    if (campaignsLoading) return;
    if (activeCampaign && !campaigns.some((c) => c.id === activeCampaign)) {
      handleCampaignChange(null);
    }
  }, [campaignsLoading, campaigns, activeCampaign, handleCampaignChange]);

  // Teammate claims on the current results, scoped to the active campaign.
  const { getTeamClaim } = useTeamClaims(leads, activeCampaign);

  // Count businesses without websites — only from the most recent search
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

  // Fire the post-search tip once results land
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      setTimeout(() => window.dispatchEvent(new CustomEvent('post-search-tip')), 300);
    }
  }, [isLoading, leads.length]);

  /* BACK AND FORWARD change the URL without remounting this page, so the initial state above is
     not enough on its own — this re-syncs when the query string moves under us. Guarded on real
     change so it cannot loop against setSearchParams. */
  useEffect(() => {
    const wantMode: SearchMode = urlMode === 'market' && urlTrade && urlTown ? 'market' : 'leads';
    setActiveMode((m) => (m === wantMode ? m : wantMode));
    if (wantMode === 'market') {
      setMarketTrade((t) => (t === urlTrade ? t : urlTrade));
      setMarketTown((w) => (w === urlTown ? w : urlTown));
    }
  }, [urlMode, urlTrade, urlTown]);

  /* Lead results and market output are mutually exclusive. Gating each block on the mode the last
     search RAN in (rather than hiding them by clearing `leads`) keeps the lead results intact
     underneath, so switching back to Find leads shows them again without re-running the search. */
  const showLeadResults = activeMode === 'leads';

  const handleSearch = useCallback((filters: any) => {
    setLastSearchCountry(filters.country || 'UK');
    setLastSearchKeyword(filters.keyword?.trim() || null);
    setLastSearchLocation(filters.location?.trim() || null);

    /* MARKET MODE SPENDS NOTHING AND CALLS NO SEARCH. It reads audits and the cached pool for the
       trade and town in the boxes. The lead search is left completely untouched below. */
    if (filters.mode === 'market') {
      const t = filters.keyword?.trim() || '';
      const w = filters.location?.trim() || '';
      setActiveMode('market');
      setMarketTrade(t);
      setMarketTown(w);
      // replace, not push: re-searching the same page should not stack history entries the back
      // button then has to walk through one at a time.
      setSearchParams({ mode: 'market', trade: t, town: w }, { replace: true });
      return;
    }
    setActiveMode('leads');
    // Drop the market params so a later refresh does not resurrect a market view over lead results.
    setSearchParams({}, { replace: true });
    // Region tiling is capped out of the UI (slider max = 50km) — always a normal
    // single-centre search. The backend tiledRegionSearch stays in place but
    // dormant: the frontend never sends region:true.
    search(filters, false, false);
  }, [search, setSearchParams]);

  // Notify when a region search was downgraded to a single area (daily budget).
  useEffect(() => {
    if (regionDowngraded) {
      toast({
        title: 'Daily search budget reached',
        description: `Ran a single-area search instead (today's spend ~$${regionDowngraded.spentUsd.toFixed(2)}). Region search resumes tomorrow.`,
      });
    }
  }, [regionDowngraded, toast]);

  // Bulk add (list-builder): add each selected lead, deduped + silent (one summary
  // toast from the component). addToOutreach returns null on dupe/failure.
  // campaignId defaults to the active campaign (toggle OFF); the ask-each-time flow
  // passes the chosen campaign instead.
  const handleBulkAdd = useCallback(async (sel: Lead[], campaignId: string | null = activeCampaign) => {
    let added = 0, skipped = 0;
    for (const lead of sel) {
      const res = await addToOutreach(lead, lastSearchCountry, 'no_website', campaignId, getEnrichment(lead.id), true, lastSearchKeyword, lastSearchLocation);
      if (res) added++; else skipped++;
    }
    return { added, skipped };
  }, [addToOutreach, lastSearchCountry, lastSearchKeyword, lastSearchLocation, activeCampaign, getEnrichment]);

  // ── Add-to-CRM entry points (Index decides whether to prompt) ───────────────
  const activeCampaignName = useMemo(
    () => campaigns.find((c) => c.id === activeCampaign)?.name ?? null,
    [campaigns, activeCampaign],
  );
  // Tooltip text for the Add buttons: names the silent target, or signals a prompt.
  const addCampaignTooltip = askCampaignEachTime
    ? 'Choose a campaign…'
    : (activeCampaignName ? `Add to ${activeCampaignName}` : 'Add to Outreach (no campaign)');

  // Per-row Add: prompt when the toggle is ON, else add to the active campaign as today.
  const handleRowAdd = useCallback((lead: Lead) => {
    if (askCampaignEachTime) {
      setChosenCampaign(activeCampaign);
      setPendingAdd({ kind: 'row', lead });
      return Promise.resolve(null);
    }
    return addToOutreach(lead, lastSearchCountry, 'no_website', activeCampaign, getEnrichment(lead.id), false, lastSearchKeyword, lastSearchLocation);
  }, [askCampaignEachTime, activeCampaign, addToOutreach, lastSearchCountry, lastSearchKeyword, lastSearchLocation, getEnrichment]);

  // Bulk Add: prompt ONCE for the batch when ON, else run as today. When prompting,
  // return a promise that resolves after the dialog so LeadsTable's summary toast is accurate.
  const handleBulkAddEntry = useCallback((sel: Lead[]) => {
    if (askCampaignEachTime) {
      setChosenCampaign(activeCampaign);
      setPendingAdd({ kind: 'bulk', leads: sel });
      return new Promise<{ added: number; skipped: number }>((resolve) => { bulkResolverRef.current = resolve; });
    }
    return handleBulkAdd(sel, activeCampaign);
  }, [askCampaignEachTime, activeCampaign, handleBulkAdd]);

  // Dialog confirm: run the pending add against the chosen campaign.
  const handleConfirmCampaign = useCallback(async () => {
    const p = pendingAdd;
    setPendingAdd(null);
    if (!p) return;
    if (p.kind === 'row') {
      await addToOutreach(p.lead, lastSearchCountry, 'no_website', chosenCampaign, getEnrichment(p.lead.id), false, lastSearchKeyword, lastSearchLocation);
    } else {
      const res = await handleBulkAdd(p.leads, chosenCampaign);
      bulkResolverRef.current?.(res);
      bulkResolverRef.current = null;
    }
  }, [pendingAdd, chosenCampaign, addToOutreach, lastSearchCountry, lastSearchKeyword, lastSearchLocation, getEnrichment, handleBulkAdd]);

  // Dialog cancel/close: nothing added; resolve a pending bulk promise so the caller unblocks.
  const handleCancelCampaign = useCallback(() => {
    if (pendingAdd?.kind === 'bulk') { bulkResolverRef.current?.({ added: 0, skipped: 0 }); bulkResolverRef.current = null; }
    setPendingAdd(null);
  }, [pendingAdd]);

  // ── Remove-from-CRM (FRESH leads only) ──────────────────────────────────────
  // Match a search result to its ACTIVE CRM lead row (mirrors addLead's dedup:
  // google_maps_url OR business_name OR place_id). Returns whether it's in the CRM,
  // whether it's still fresh (removable), and the row id — LeadsTable renders from this.
  const getCrmState = useCallback((lead: Lead): { inCrm: boolean; isFresh: boolean; crmLeadId: string | null } => {
    const match = crmLeads.find(
      (l) =>
        (lead.googleMapsUrl && l.google_maps_url === lead.googleMapsUrl) ||
        l.business_name === lead.name ||
        (lead.id && (l as { place_id?: string | null }).place_id === lead.id),
    );
    if (!match) return { inCrm: false, isFresh: false, crmLeadId: null };
    return { inCrm: true, isFresh: isFreshLead(match), crmLeadId: match.id };
  }, [crmLeads]);

  // Remove confirm dialog (fresh leads). Holds the pending lead id + name.
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
  const handleRequestRemove = useCallback((leadId: string, name: string) => {
    setPendingRemove({ id: leadId, name });
  }, []);
  const handleConfirmRemove = useCallback(async () => {
    const p = pendingRemove;
    setPendingRemove(null);
    if (!p) return;
    const res = await removeFreshLead(p.id);
    // Click-time guard tripped: the lead was actioned since page load. Tell the user
    // and refresh so the button flips to the disabled "In CRM" state.
    if (!res.ok && res.reason === 'not_fresh') {
      toast({
        title: 'This lead has been contacted',
        description: 'Manage it on the Outreach page — it can no longer be removed here.',
      });
      await refetchCrm();
    }
  }, [pendingRemove, removeFreshLead, refetchCrm, toast]);

  // Bulk "Add all with emails": the Targeted results that have a found email AND
  // aren't already in Outreach. Recomputes as emails are found / leads are added, so
  // the button count is always live and excludes anything already added.
  const [addingEmails, setAddingEmails] = useState(false);
  const leadsWithEmail = useMemo(
    () =>
      leads.filter(
        (l) =>
          (((searchEnrichment[l.id]?.email as string | undefined) ?? '').trim().length > 0) &&
          !isInOutreach(l.name, l.googleMapsUrl),
      ),
    [leads, searchEnrichment, isInOutreach],
  );

  // Adds every with-email candidate into the CURRENT campaign via the exact single-add
  // path (reuses handleBulkAdd → addToOutreach: same status/fields, deduped, silent).
  const handleAddAllWithEmails = useCallback(async () => {
    if (!leadsWithEmail.length || addingEmails) return;
    setAddingEmails(true);
    try {
      const { added } = await handleBulkAdd(leadsWithEmail);
      toast({
        title: `Added ${added} lead${added === 1 ? '' : 's'} with emails`,
        description: activeCampaign ? 'to the current campaign.' : 'to outreach.',
      });
    } finally {
      setAddingEmails(false);
    }
  }, [leadsWithEmail, addingEmails, handleBulkAdd, activeCampaign, toast]);

  // Bulk ENRICH: add each selected lead to Outreach (silent), then run the full
  // enrich-business pipeline on it IN PLACE — no CRM add. Mirrors the per-lead ✨
  // pattern (SearchLeadContact): a synthetic lead_id (matches no outreach row) +
  // place_id, results written into searchEnrichment so the row icons light up and
  // the data carries over for free when the lead is later added. SEQUENTIAL so the
  // $2/day cap is respected exactly. Stops on cap or cancel.
  const [enrichedIds, setEnrichedIds] = useState<Set<string>>(new Set());
  const isLeadEnriched = useCallback((placeId: string) => enrichedIds.has(placeId), [enrichedIds]);
  const handleBulkEnrich = useCallback(async (
    sel: Lead[],
    onProgress: (done: number) => void,
    shouldCancel: () => boolean,
  ): Promise<{ enriched: number; cached: number; skipped: number; failed: number; stoppedAtCap: boolean; cancelled: boolean }> => {
    let enriched = 0, cached = 0, skipped = 0, failed = 0, stoppedAtCap = false, cancelled = false;
    for (let i = 0; i < sel.length; i++) {
      if (shouldCancel()) { cancelled = true; break; }
      const lead = sel[i];
      if (enrichedIds.has(lead.id)) { skipped++; onProgress(i + 1); continue; } // already done this session
      try {
        const prior = getEnrichment(lead.id) ?? {};
        const { data, error } = await supabase.functions.invoke('enrich-business', {
          body: {
            lead_id: crypto.randomUUID(), // synthetic — matches no outreach row (clean no-op server-side)
            place_id: lead.id,
            google_maps_url: lead.googleMapsUrl ?? null,
            phone: lead.phone ?? null,
            country: lastSearchCountry ?? null,
            business_name: lead.name ?? null,
            facebook_url: (prior.facebook_url as string | undefined) ?? null,
            instagram_url: (prior.instagram_url as string | undefined) ?? null,
            website: lead.websiteUrl ?? null,
          },
        });
        if (error) { failed++; }
        else if (data?.limit_reached) { stoppedAtCap = true; onProgress(i + 1); break; }
        else if (data?.success) {
          // Apply the same patch shape as the per-lead hook (useEnrichBusiness).
          const patch: Record<string, unknown> = {};
          if (data.lineType) patch.line_type = data.lineType;
          if (data.website && !lead.websiteUrl) patch.website = data.website;
          if (data.applied) {
            if (data.email) Object.assign(patch, { email: data.email, email_status: 'found', email_method: 'apify', enrichment_source: 'apify' });
            if (data.facebook) Object.assign(patch, { facebook_url: data.facebook, facebook_status: 'found', facebook_method: data.facebookMethod ?? 'apify' });
            if (data.instagram) Object.assign(patch, { instagram_url: data.instagram, instagram_status: 'found', instagram_method: data.instagramMethod ?? 'apify' });
          }
          if (Object.keys(patch).length) await patchEnrichment(lead.id, patch);
          setEnrichedIds((prev) => new Set(prev).add(lead.id));
          data.cached ? cached++ : enriched++;
        } else failed++;
      } catch { failed++; }
      onProgress(i + 1);
    }
    return { enriched, cached, skipped, failed, stoppedAtCap, cancelled };
  }, [enrichedIds, getEnrichment, patchEnrichment, lastSearchCountry]);

  // In-place email scan for the Targeted results (writes into searchEnrichment →
  // Mail icon appears on rows via LeadEnrichButtons → carries over on add).
  const { findEmails, cancel: cancelFindEmails, finding, progress: emailProgress, result: emailResult, withWebsiteCount } =
    useFindEmails(leads, patchEnrichment);

  // CSV export including any emails found this session (from searchEnrichment).
  const handleExportWithEmails = useCallback(() => {
    const cell = (v: string) => {
      const s = (v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = ['Business', 'Email', 'Phone', 'Maps', 'Website'];
    const rows = leads.map((l) => [
      l.name,
      (searchEnrichment[l.id]?.email as string) ?? '',
      l.phone ?? '',
      l.googleMapsUrl ?? '',
      l.websiteUrl ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-with-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [leads, searchEnrichment]);

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Find Leads</h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
            Find businesses without websites in any area. Search by business type and location, then add hot leads to your Outreach.
          </p>
        </div>
        <div className="flex flex-col items-center sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Adding to</span>
            <CampaignPicker mode="assign" value={activeCampaign} onChange={handleCampaignChange} className="h-8 w-[180px]" />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ask-campaign" checked={askCampaignEachTime} onCheckedChange={handleAskToggle} />
            <Label htmlFor="ask-campaign" className="text-[10px] sm:text-xs text-muted-foreground cursor-pointer">Ask campaign each time</Label>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 text-[10px] sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-1 sm:gap-2">
              <Flame className="h-3 w-3 sm:h-4 sm:w-4 text-status-hot" />
              <span>Hot = No website</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span>AI-powered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <section>
        <SearchForm
          onSearch={handleSearch}
          isLoading={isLoading}
          isPaidSubscriber={true}
          initialMode={urlMode === 'market' && urlTrade && urlTown ? 'market' : undefined}
          initialKeyword={urlMode === 'market' ? urlTrade || undefined : undefined}
          initialLocation={urlMode === 'market' ? urlTown || undefined : undefined}
        />
      </section>

      {/* MARKET MODE. Same two boxes, different question: what do we already know about this trade
          in this town. Spends nothing on mount — it reads audits and the cached lead pool. */}
      {activeMode === 'market' && (
        <section>
          <MarketPanel trade={marketTrade} town={marketTown} />
        </section>
      )}

      {/* "THIS TOWN ONLY" ASKED FOR, NOT APPLIED. A persistent banner, deliberately NOT a toast:
          the results below it are wider than the toggle claims, and that has to stay readable for
          as long as they are on screen rather than fading after four seconds. */}
      {showLeadResults && townFilterFallback && !isLoading && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-xs leading-snug text-amber-700 dark:text-amber-400">
            <span className="font-semibold">&ldquo;This town only&rdquo; did not apply.</span>{' '}
            {townFilterFallback.reason} Results below may include nearby towns.
          </p>
        </div>
      )}

      {/* Handled notice (location not found / map lookup unavailable) — a calm
          empty-state with a retry, NOT the destructive "Search failed" card. */}
      {showLeadResults && searchNotice && !searchError && !isLoading && (
        <div className="flex flex-col items-center gap-3 p-5 bg-muted/40 border border-border rounded-lg text-center">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-md">{searchNotice}</p>
          <Button size="sm" variant="outline" onClick={retryLastSearch} className="gap-2">
            Try again
          </Button>
        </div>
      )}

      {/* Search Error + Retry */}
      {showLeadResults && searchError && !isLoading && (
        <div className="flex flex-col items-center gap-3 p-5 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
          <p className="text-base font-semibold text-destructive">Search failed</p>
          <p className="text-sm text-muted-foreground">{searchError.message}</p>
          {searchError.errorId && <p className="text-[11px] text-muted-foreground/60 font-mono">Error ID: {searchError.errorId}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={retryLastSearch} className="gap-2">
              Retry
            </Button>
          </div>
        </div>
      )}


      {/* Expanded search indicator */}
      {showLeadResults && leads.length > 0 && expanded && noWebsiteCount >= 5 && (
        <div className="flex items-center gap-2 py-2 px-3 sm:px-4 bg-muted/30 border border-border/50 rounded-lg">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Expanded to nearby areas to find more businesses without websites.
          </span>
        </div>
      )}

      {/* Fallback: expansion couldn't find 3 No Website leads */}
      {showLeadResults && leads.length > 0 && expanded && noWebsiteCount < 5 && !isLoading && (
        <div className="flex flex-col gap-3 py-3 px-4 bg-muted/20 border border-border/40 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs sm:text-sm text-muted-foreground">
              We couldn't find 3 businesses without websites nearby for this search. Try a broader category for better results.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Electrician', 'Plumber', 'Landscaper'].map((cat) => (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => handleSearch({ keyword: cat, location: '', radius: 50000, country: lastSearchCountry })}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Results Section */}
      {showLeadResults && leads.length > 0 && (
        <section data-walkthrough="results-header">
          {(
            <div className="space-y-3">
              {/* Region search banner — the grid actually used (echoed from the server). */}
              {regionMeta && (
                <div className="flex items-start gap-2 py-2 px-3 sm:px-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <Globe2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    Region <span className="font-medium text-foreground">{regionMeta.area}</span>: searched{' '}
                    <span className="font-medium text-foreground">{regionMeta.tilesSucceeded}/{regionMeta.tilesTotal}</span> areas
                    ({regionMeta.cols}×{regionMeta.rows} grid at {regionMeta.effectiveSpacingKm}km)
                    {regionMeta.coarsened && ' — region large, coarsened to fit; search a sub-area for finer coverage'}
                    {regionMeta.cappedAt && ` — capped at ${regionMeta.cappedAt} results`}.
                  </span>
                </div>
              )}
              {/* In-place email scan (crawl results for emails, annotate rows, export
                  with emails) is now folded into the LeadsTable toolbar's Bulk ▾ /
                  Export ▾ menus — the handlers/state are threaded in below. Behaviour,
                  cost (find-emails free) and gating are unchanged. */}
              <LeadsTable
                leads={leads}
                onExport={exportToCsv}
                onAddToOutreach={handleRowAdd}
                addCampaignTooltip={addCampaignTooltip}
                getCrmState={getCrmState}
                onRemoveFromCrm={handleRequestRemove}
                isInOutreach={isInOutreach}
                searchEnrichment={searchEnrichment}
                onEnrichPatch={patchEnrichment}
                onMapLinkClick={(name, url) => {
                  markAsChecked(name, url);
                }}
                isChecked={isChecked}
                getTeamClaim={getTeamClaim}
                onSetWebsiteStatus={setWebsiteOverride}
                onBulkAdd={handleBulkAddEntry}
                onBulkEnrich={handleBulkEnrich}
                isLeadEnriched={isLeadEnriched}
                onFindEmails={findEmails}
                onCancelFindEmails={cancelFindEmails}
                findingEmails={finding}
                emailProgress={emailProgress}
                emailResult={emailResult}
                withWebsiteCount={withWebsiteCount}
                onAddAllWithEmails={handleAddAllWithEmails}
                addingEmails={addingEmails}
                addAllWithEmailsCount={leadsWithEmail.length}
                onExportWithEmails={handleExportWithEmails}
              />
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {showLeadResults && leads.length === 0 && !isLoading && (
        <section className="text-center py-16">
          <div className="inline-flex p-4 rounded-full bg-muted/50 mb-6">
            <Search className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">
            Ready to find leads
          </h2>
        </section>
      )}

      {/* Campaign-choice dialog — only shown when "Ask campaign each time" is on and
          the user triggers an Add (per-row or bulk). Seeds to the active campaign. */}
      <Dialog open={!!pendingAdd} onOpenChange={(open) => { if (!open) handleCancelCampaign(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to which campaign?</DialogTitle>
            <DialogDescription>
              {pendingAdd?.kind === 'bulk'
                ? `Choose the campaign for these ${pendingAdd.leads.length} lead${pendingAdd.leads.length === 1 ? '' : 's'}.`
                : 'Choose the campaign for this lead.'}
            </DialogDescription>
          </DialogHeader>
          <CampaignPicker mode="assign" value={chosenCampaign} onChange={setChosenCampaign} className="h-9 w-full" />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCancelCampaign}>Cancel</Button>
            <Button onClick={handleConfirmCampaign}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove-from-CRM confirm — only offered for FRESH leads. The DELETE itself is
          re-guarded against live data in removeFreshLead, so a lead actioned since
          page load is refused there even if this dialog was open. */}
      <AlertDialog open={!!pendingRemove} onOpenChange={(open) => { if (!open) setPendingRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name ?? 'this lead'} from your CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. It's untouched (no message sent, no notes), so nothing is lost — you can add it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
