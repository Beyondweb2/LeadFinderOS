import { useState, useCallback, useEffect, useMemo } from 'react';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { BroadListBuilder } from '@/components/BroadListBuilder';
// EmailListBuilder kept in the repo for the future bulk-add flow; no longer rendered
// here (email finding is now an in-place scan on the Targeted results).
import { CampaignPicker } from '@/components/CampaignPicker';

import { supabase } from '@/integrations/supabase/client';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';

import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useSearchEnrichment } from '@/hooks/useSearchEnrichment';
import { useFindEmails } from '@/hooks/useFindEmails';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTeamClaims } from '@/hooks/useTeamClaims';
import { Flame, Target, Zap, Search, MapPin, Info, Mail, Download, Loader2, X, UserPlus, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Country, Lead, RegionDensity } from '@/types/lead';

const ACTIVE_CAMPAIGN_KEY = 'leadfinder_active_campaign';

const Index = () => {
  const { leads, isLoading, search, retryLastSearch, exportToCsv, searchError, expanded, setWebsiteOverride, regionMeta, regionDowngraded } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach } = useOutreach();
  const { searchEnrichment, patchEnrichment, getEnrichment } = useSearchEnrichment();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { toast } = useToast();

  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  // Find Leads mode: 'targeted' (curated) | 'list' (broad list-builder).
  // (Email sourcing is no longer a separate mode — it's a "Find emails" action on
  // the Targeted results below.)
  const [mode, setMode] = useState<'targeted' | 'list' | 'region'>('targeted');
  // Region tiling density (only used in region mode). Medium = 8km tiles.
  const [density, setDensity] = useState<RegionDensity>('medium');

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

  const handleSearch = useCallback((filters: any) => {
    setLastSearchCountry(filters.country || 'UK');
    // List-builder mode asks for the full pool; region mode tiles the whole area.
    search({ ...filters, broad: mode === 'list', region: mode === 'region', density }, false, false);
  }, [search, mode, density]);

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
  const handleBulkAdd = useCallback(async (sel: Lead[]) => {
    let added = 0, skipped = 0;
    for (const lead of sel) {
      const res = await addToOutreach(lead, lastSearchCountry, 'no_website', activeCampaign, getEnrichment(lead.id), true);
      if (res) added++; else skipped++;
    }
    return { added, skipped };
  }, [addToOutreach, lastSearchCountry, activeCampaign, getEnrichment]);

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
  // enrich-business pipeline on it — SEQUENTIALLY so the $2/day cap is respected
  // exactly (no concurrent overshoot) and progress is clean. Stops on cap or cancel.
  const handleBulkEnrich = useCallback(async (
    sel: Lead[],
    onProgress: (done: number) => void,
    shouldCancel: () => boolean,
  ): Promise<{ added: number; enriched: number; cached: number; failed: number; stoppedAtCap: boolean; cancelled: boolean }> => {
    let added = 0, enriched = 0, cached = 0, failed = 0, stoppedAtCap = false, cancelled = false;
    for (let i = 0; i < sel.length; i++) {
      if (shouldCancel()) { cancelled = true; break; }
      const lead = sel[i];
      // 1) Ensure the lead is stored in Outreach (enrich works on a stored row).
      const row = await addToOutreach(lead, lastSearchCountry, 'no_website', activeCampaign, getEnrichment(lead.id), true);
      if (!row) { failed++; onProgress(i + 1); continue; }
      added++;
      // 2) Full enrich on the stored row (reuses enrich-business + its cache/cap).
      try {
        const { data, error } = await supabase.functions.invoke('enrich-business', {
          body: {
            lead_id: row.id,
            place_id: row.place_id ?? null,
            google_maps_url: row.google_maps_url ?? null,
            phone: row.phone ?? null,
            country: row.country ?? null,
            business_name: row.business_name ?? null,
            facebook_url: row.facebook_url ?? null,
            instagram_url: row.instagram_url ?? null,
            website: row.website ?? null,
          },
        });
        if (error) failed++;
        else if (data?.limit_reached) { stoppedAtCap = true; onProgress(i + 1); break; }
        else if (data?.success) { data.cached ? cached++ : enriched++; }
        else failed++;
      } catch { failed++; }
      onProgress(i + 1);
    }
    return { added, enriched, cached, failed, stoppedAtCap, cancelled };
  }, [addToOutreach, lastSearchCountry, activeCampaign, getEnrichment]);

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
          {/* Mode: Targeted (curated, no-website-first) vs List builder (cast wide). */}
          <div className="inline-flex rounded-md border border-border p-0.5">
            <Button
              variant={mode === 'targeted' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode('targeted')}
              title="Curated: no-website leads first"
            >
              <Target className="h-3.5 w-3.5 mr-1.5" /> Targeted
            </Button>
            <Button
              variant={mode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode('list')}
              title="Cast wide: full list, filter by signal, bulk-add"
            >
              <Search className="h-3.5 w-3.5 mr-1.5" /> List builder
            </Button>
            <Button
              variant={mode === 'region' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode('region')}
              title="Region: tile the whole area (multiple searches) for far more coverage"
            >
              <Globe2 className="h-3.5 w-3.5 mr-1.5" /> Region
            </Button>
          </div>
          {/* Region density — only when Region mode is active. Finer = more tiles,
              more coverage, more cost/time. */}
          {mode === 'region' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Tile density</span>
              <Select value={density} onValueChange={(v) => setDensity(v as RegionDensity)}>
                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fine">Fine (5km · most)</SelectItem>
                  <SelectItem value="medium">Medium (8km)</SelectItem>
                  <SelectItem value="coarse">Coarse (12km · fastest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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
        />
      </section>

      {/* Region scanning — informative spinner for the (slower) tiled search */}
      {isLoading && mode === 'region' && (
        <div className="flex items-center gap-3 py-3 px-4 bg-primary/5 border border-primary/20 rounded-lg">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Scanning the whole region — searching multiple areas and merging results. This can take ~15–30s.
          </span>
        </div>
      )}

      {/* Search Error + Retry */}
      {searchError && !isLoading && (
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
      {leads.length > 0 && expanded && noWebsiteCount >= 5 && (
        <div className="flex items-center gap-2 py-2 px-3 sm:px-4 bg-muted/30 border border-border/50 rounded-lg">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Expanded to nearby areas to find more businesses without websites.
          </span>
        </div>
      )}

      {/* Fallback: expansion couldn't find 3 No Website leads */}
      {leads.length > 0 && expanded && noWebsiteCount < 5 && !isLoading && (
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
      {leads.length > 0 && (
        <section data-walkthrough="results-header">
          {mode === 'list' ? (
            <BroadListBuilder
              leads={leads}
              isLoading={isLoading}
              isInOutreach={isInOutreach}
              onBulkAdd={handleBulkAdd}
              onBulkEnrich={handleBulkEnrich}
            />
          ) : (
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
              {/* In-place email scan: crawl the current results for emails, annotate
                  the rows (Mail icon via LeadEnrichButtons), and export with emails.
                  No table rebuild — found emails land in searchEnrichment. */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {emailResult && !finding && (
                  <span className="text-xs text-muted-foreground">Found emails for {emailResult.found} of {emailResult.scanned}</span>
                )}
                {finding && emailProgress && (
                  <span className="text-xs text-muted-foreground">Finding emails {emailProgress.done} of {emailProgress.total}…</span>
                )}
                {finding ? (
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={cancelFindEmails}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={findEmails}
                    disabled={!withWebsiteCount}
                    title="Find emails across these results (free website crawl)"
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    Find emails ({withWebsiteCount} with a website)
                  </Button>
                )}
                {/* After a Find-emails scan: bulk-add every result that has an email
                    into the current campaign (skips any already in Outreach). */}
                {emailResult && leadsWithEmail.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleAddAllWithEmails}
                    disabled={addingEmails}
                    title="Add every result that has an email into your current campaign"
                  >
                    {addingEmails ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                    Add all with emails ({leadsWithEmail.length})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleExportWithEmails}
                  disabled={!leads.length}
                  title="Export the results as CSV including any emails found"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Export with emails
                </Button>
              </div>
              <LeadsTable
                leads={leads}
                onExport={exportToCsv}
                onAddToOutreach={(lead) => addToOutreach(lead, lastSearchCountry, 'no_website', activeCampaign, getEnrichment(lead.id))}
                isInOutreach={isInOutreach}
                searchEnrichment={searchEnrichment}
                onEnrichPatch={patchEnrichment}
                onMapLinkClick={(name, url) => {
                  markAsChecked(name, url);
                }}
                isChecked={isChecked}
                getTeamClaim={getTeamClaim}
                onSetWebsiteStatus={setWebsiteOverride}
              />
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {leads.length === 0 && !isLoading && (
        <section className="text-center py-16">
          <div className="inline-flex p-4 rounded-full bg-muted/50 mb-6">
            <Search className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">
            Ready to find leads
          </h2>
        </section>
      )}
    </div>
  );
};

export default Index;
