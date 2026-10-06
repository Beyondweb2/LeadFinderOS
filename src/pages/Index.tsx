import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
// EmailListBuilder kept in the repo for the future bulk-add flow; no longer rendered
// here (email finding is now an in-place scan on the results).
import { CampaignPicker } from '@/components/CampaignPicker';
import { CampaignsButton } from '@/components/campaigns/CampaignsButton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isFreshLead } from '@/lib/leadStatus';
import { leadRpc } from '@/lib/leadRpc';

import { supabase } from '@/integrations/supabase/client';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';

import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useSearchEnrichment } from '@/hooks/useSearchEnrichment';
import { useFindEmails } from '@/hooks/useFindEmails';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { Flame, Zap, Search, MapPin, Info, Globe2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/salesDash/primitives';
import { useToast } from '@/hooks/use-toast';
import { logDataAccess } from '@/lib/dataAccessLog';
import type { Country, Lead, SearchMode } from '@/types/lead';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@/hooks/useSubscription';
import { lookupIdentities, useSalesActions, useTeamDirectory } from '@/hooks/useSalesCrm';
import { refusalText } from '@/lib/salesCrm';
import { NotReadyToSellBanner } from '@/components/NotReadyToSellBanner';
import { useMyReadiness, type MyReadiness } from '@/hooks/useMyReadiness';
import { missingItemWords } from '@/lib/readinessWords';

/** Find Leads refused before searching: ONLY a genuine account restriction (2026-10-06 — the onboarding checklist
 *  no longer blocks anything). Loading / unreadable status is said as such. */
function findLeadsNotReadyToast(r: Pick<MyReadiness, 'loading' | 'failed' | 'missing' | 'startsOn'>) {
  if (r.loading) return { title: 'Checking your access', description: 'Try again in a moment.' };
  if (r.failed) return { title: 'Could not check your access', description: 'Try again in a moment, or contact Paul.', variant: 'destructive' as const };
  const items = missingItemWords(r.missing, r.startsOn);
  return { title: 'Your sales access is not active.', description: (items.length ? `(${items.join(' · ')}) ` : '') + 'Speak to Paul.', variant: 'destructive' as const };
}
import type { OwnershipInfo } from '@/components/FindLeadsOwnership';

const ACTIVE_CAMPAIGN_KEY = 'leadfinder_active_campaign';
const ASK_CAMPAIGN_KEY = 'lf_ask_campaign_each_time';

const Index = () => {
  const { leads, isLoading, search, retryLastSearch, exportToCsv, searchError, searchNotice, expanded, setWebsiteOverride, regionMeta, regionDowngraded, townFilterFallback, resolvedLocation, locationCandidates, lastSearch } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: crmLeads, removeFreshLead, refetch: refetchCrm } = useOutreach();
  const { searchEnrichment, patchEnrichment, getEnrichment } = useSearchEnrichment();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { toast } = useToast();
  const readiness = useMyReadiness();

  /* ══ WHO ALREADY HAS EACH RESULT (multi-user, 2026-09-27) ═══════════════════════════════════════
     ⛔ The server's answer across EVERY user's leads (lead_identity_lookup: place id, then phone, then
     Maps URL) — not this browser's CRM list, which for a salesperson is empty by design. The admin's
     own buttons (getCrmState below) are untouched; this adds the owner marker for the admin and, for
     a salesperson, replaces Add with Claim / "Already added · <name>" wherever the business exists. */
  const { role: viewerRole } = useSubscription();
  const teamDir = useTeamDirectory();
  const salesActions = useSalesActions();
  const identityQc = useQueryClient();
  const identityKey = useMemo(() => leads.map((l) => l.id).join('|'), [leads]);
  const identity = useQuery({
    queryKey: ['sales', 'identity', identityKey],
    enabled: !!viewerRole && leads.length > 0,
    staleTime: 15_000,
    queryFn: () => lookupIdentities(leads.map((l) => ({ k: l.id, place_id: l.id, phone: l.phone ?? null, maps_url: l.googleMapsUrl ?? null }))),
  });
  useEffect(() => {
    const refresh = () => { void identityQc.invalidateQueries({ queryKey: ['sales', 'identity'] }); };
    window.addEventListener('crm-lead-added', refresh);
    window.addEventListener('sales-lead-changed', refresh);
    return () => { window.removeEventListener('crm-lead-added', refresh); window.removeEventListener('sales-lead-changed', refresh); };
  }, [identityQc]);
  const ownership = useCallback((lead: Lead): OwnershipInfo | null => {
    const hit = identity.data?.get(lead.id);
    if (!hit) return null;
    const m = hit.owner_id ? teamDir.byId.get(hit.owner_id) : undefined;
    return { state: hit.state, leadId: hit.lead_id, ownerName: hit.owner_name, avatarUrl: m?.avatar_url ?? null, addedAt: hit.added_at };
  }, [identity.data, teamDir.byId]);
  const handleClaim = useCallback(async (leadId: string) => {
    const r = await salesActions.claim.mutateAsync({ leadId });
    if (!r.ok) toast({ title: 'Not claimed', description: refusalText(r.error, r.owner_name as string | undefined), variant: 'destructive' });
    else toast({ title: 'Claimed', description: 'It is now in My leads.' });
    void identityQc.invalidateQueries({ queryKey: ['sales', 'identity'] });
  }, [salesActions.claim, toast, identityQc]);

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
  /* ⛔ READ ON FIRST RENDER AND NEVER RE-READ. `confirm=search` is an INTENT that arrived with a
     click on Coverage, not a piece of page state — so it is captured once into a ref and the param
     is stripped below. Left in the URL it would re-open the dialog on a refresh or a back button,
     which is the "modal springs open on return" §6c forbids. */
  const openSearchConfirm = useRef(searchParams.get('confirm') === 'search').current;
  /* ⛔ THE ARRIVAL INTENT FROM COVERAGE'S "Find leads": run the normal search, prefilled. Captured
     on first render and stripped below — left in the URL it re-runs a PAID search on every refresh
     and every back button.
     ⚠️ It no longer checks for mode=leads. Coverage used to have two buttons and the mode said
     which; the market view is gone (2026-09-09) and there is only one thing a Coverage row can
     ask for. */
  const runLeadSearchOnArrival = useRef(searchParams.get('run') === 'search').current;
  const urlKeyword = (searchParams.get('keyword') ?? '').trim();
  const urlLocation = (searchParams.get('location') ?? '').trim();
  const { user } = useAuth();
  /* ⛔ THESE WERE useState AND THAT WAS THE BUG. They were set only by pressing Search, while the
     RESULTS came back from sessionStorage on mount — so returning to this page rather than
     re-searching left the results on screen with no keyword or town behind them, and Add wrote a
     lead with neither. 168 rows in the CRM are that exact shape and cannot be audited.
     They now come from the context, which persists them alongside the leads in a single write. */
  const lastSearchCountry: Country = lastSearch?.country ?? 'UK';
  const lastSearchKeyword = lastSearch?.keyword ?? null;
  const lastSearchLocation = lastSearch?.location ?? null;
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
  /* Consume the one-shot intent. `replace` so it does not become a history entry you can go BACK
     to and re-trigger, and the trade/town params are deliberately left alone — those ARE page
     state (what am I looking at) and belong in the URL. */
  /* ⛔ `run` IS STRIPPED WHETHER OR NOT THE SEARCH ACTUALLY FIRES. If the seeds were empty nothing
     runs — and leaving the param behind would make the next refresh try again. Both intents were
     already captured into refs on first render, so removing them here cannot cancel either. */
  useEffect(() => {
    if (searchParams.get('confirm') !== 'search' && searchParams.get('run') !== 'search') return;
    const next = new URLSearchParams(searchParams);
    next.delete('confirm');
    next.delete('run');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);


  const handleSearch = useCallback((filters: any) => {
    /* THE SELLING GATE (2026-10-06): only a genuinely restricted salesperson (no sales role, login disabled,
       suspended, engagement ended) is stopped here — an incomplete onboarding checklist is NOT. The Search button
       AND Coverage's "Find leads" both pass through here; the server refuses the same people (guard_action). */
    if (readiness.gated && !readiness.ready) {
      toast(findLeadsNotReadyToast(readiness));
      return;
    }
    /* No longer recorded here — the context records it inside search(), which is the one point every
       search passes through, and persists it with the results. */

    // Drop any leftover params so a refresh does not resurrect an old arrival intent.
    setSearchParams({}, { replace: true });
    // Region tiling is capped out of the UI (slider max = 50km) — always a normal
    // single-centre search. The backend tiledRegionSearch stays in place but
    // dormant: the frontend never sends region:true.
    search(filters, false, false);
  }, [search, setSearchParams, readiness.gated, readiness.ready, toast]);

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
  /* Sales workspace v2: a business already in the CRM joins the selected campaign from its row. One rule for both
     roles (lead_set_campaign): own, non-client leads into a campaign the person may use. Contact history never
     stops it — sending an opener is a separate decision with its own reasons. */
  const handleMoveToCampaign = useCallback(async (crmLeadId: string) => {
    if (!activeCampaign) return;
    const r = await leadRpc('lead_set_campaign', { _lead_id: crmLeadId, _campaign_id: activeCampaign });
    if (!r.ok) { toast({ title: 'Not moved', description: refusalText(String(r.error)), variant: 'destructive' }); return; }
    toast({ title: `Added to ${activeCampaignName ?? 'the campaign'}`, description: 'It keeps its status and history.' });
    refetchCrm();
  }, [activeCampaign, activeCampaignName, toast, refetchCrm]);
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
  const getCrmState = useCallback((lead: Lead): { inCrm: boolean; isFresh: boolean; crmLeadId: string | null; campaignId: string | null } => {
    const match = crmLeads.find(
      (l) =>
        (lead.googleMapsUrl && l.google_maps_url === lead.googleMapsUrl) ||
        l.business_name === lead.name ||
        (lead.id && (l as { place_id?: string | null }).place_id === lead.id),
    );
    if (!match) return { inCrm: false, isFresh: false, crmLeadId: null, campaignId: null };
    return { inCrm: true, isFresh: isFreshLead(match), crmLeadId: match.id, campaignId: match.campaign_id ?? null };
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

  /* ⛔ CSV EXPORT IS ADMIN ONLY (Paul, 2026-09-29, docs/abuse-cost-protection.md) and every export is
     recorded first (who, when, rows, the search); a refused or failed record downloads nothing. Sales
     gets no Export menu, and the server refuses a Sales export anyway. */
  const canExport = viewerRole === 'admin';
  const loggedExport = useCallback(async (download: () => void, rows: number, what: string) => {
    const logged = await logDataAccess(supabase, 'export_csv', rows, null, { view: 'find_leads', what, search: lastSearch ? { keyword: lastSearch.keyword, location: lastSearch.location } : null });
    if (!logged.ok) {
      toast({ title: 'Export not downloaded', description: logged.message, variant: 'destructive' });
      return;
    }
    download();
  }, [lastSearch, toast]);

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
      <PageHeader
        icon={Search}
        tone="blue"
        title="Find Leads"
        subtitle="Find businesses without websites in any area. Search by business type and location, then add hot leads to your Outreach."
        actions={
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Adding to</span>
            {/* 2026-10-03: both roles create and manage their campaigns from here (New / Manage, and the Campaigns
                button) — a salesperson sees and adds to only their own; the server decides. */}
            <CampaignPicker mode="assign" value={activeCampaign} onChange={handleCampaignChange} className="h-8 w-[180px]" />
            <CampaignsButton />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ask-campaign" checked={askCampaignEachTime} onCheckedChange={handleAskToggle} />
            <Label htmlFor="ask-campaign" className="text-[10px] sm:text-xs text-muted-foreground cursor-pointer">Ask campaign each time</Label>
          </div>
          <div className="flex flex-wrap items-center sm:justify-end gap-2 sm:gap-4 text-[10px] sm:text-sm text-muted-foreground">
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
        }
      />

      {/* READY TO SELL: why Find Leads is closed to a salesperson whose onboarding is incomplete (handleSearch). */}
      <NotReadyToSellBanner />

      {/* Search Section */}
      <section>
        <SearchForm
          onSearch={handleSearch}
          isLoading={isLoading}
          isPaidSubscriber={true}
          /* ⛔ `mode=leads` IN THE URL MUST FORCE THE FORM TO LEADS. The mode is persisted per user,
             so an operator whose last visit was a market view arrives with 'market' already set —
             and Find leads would then run a market view. Only an EXPLICIT mode param overrides the
             persisted value; a plain visit to /find-leads still restores whatever was last used. */
          initialKeyword={urlKeyword || undefined}
          initialLocation={urlLocation || undefined}
          /* Runs the search once, on arrival, when Coverage asked for it. */
          autoSubmit={runLeadSearchOnArrival}
        />
      </section>

      {/* "THIS TOWN ONLY" ASKED FOR, NOT APPLIED. A persistent banner, deliberately NOT a toast:
          the results below it are wider than the toggle claims, and that has to stay readable for
          as long as they are on screen rather than fading after four seconds. */}
      {/* ⛔ WHICH PLACE, ON EVERY SEARCH. Paul's rule for normal mode: always DISPLAY the resolution,
          block only when Google returned more than one candidate. A dialog in front of a search run
          constantly is friction; a wrong town is 11p and a polluted lead list. Ambiguity is rare
          (St Ives, Newport, Richmond) so the block almost never fires, and on the searches where it
          does it is the whole point.
          ⚠️ The amber form is NOT an error — the search DID run and these are real leads. It says
          which place they are from, so a wrong one is caught by reading rather than by a Cornish
          business name three screens later. */}
      {resolvedLocation && !isLoading && (
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
          locationCandidates.length > 1
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-border/50 bg-muted/30'
        }`}>
          <MapPin className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
            locationCandidates.length > 1 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'
          }`} />
          <p className="text-xs leading-snug text-muted-foreground">
            Searched <span className="font-semibold text-foreground">{resolvedLocation}</span>
            {locationCandidates.length > 1 && (
              <>
                {' '}&mdash; <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {locationCandidates.length} places share this name
                </span>. If that is the wrong one, add the county and search again:{' '}
                {locationCandidates.slice(0, 4).join('  ·  ')}
              </>
            )}
          </p>
        </div>
      )}

      {townFilterFallback && !isLoading && (
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
      {searchNotice && !searchError && !isLoading && (
        <div className="flex flex-col items-center gap-3 p-5 bg-muted/40 border border-border rounded-lg text-center">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-md">{searchNotice}</p>
          <Button size="sm" variant="outline" onClick={retryLastSearch} className="gap-2">
            Try again
          </Button>
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

      {/* ⛔ NO SEARCH-SUMMARY BANNER (Paul, 2026-09-28). "32 found for Plumber in Manchester: 32 new to
          add…" repeated the Search Results heading, and over a filtered table it claimed rows that
          were not on screen. The heading's own count — with "Showing X of Y" whenever a filter hides
          any — is the one statement of what the search returned. */}

      {/* Results Section */}
      {leads.length > 0 && (
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
                onExport={canExport ? () => void loggedExport(exportToCsv, leads.length, 'results') : undefined}
                onAddToOutreach={handleRowAdd}
                addCampaignTooltip={addCampaignTooltip}
                getCrmState={getCrmState}
                onRemoveFromCrm={handleRequestRemove}
                activeCampaign={activeCampaign && activeCampaignName ? { id: activeCampaign, name: activeCampaignName } : null}
                onMoveToCampaign={(id) => void handleMoveToCampaign(id)}
                ownership={ownership}
                onClaim={(id) => void handleClaim(id)}
                claiming={salesActions.claim.isPending}
                viewerRole={viewerRole}
                isInOutreach={isInOutreach}
                searchEnrichment={searchEnrichment}
                onEnrichPatch={patchEnrichment}
                onMapLinkClick={(name, url) => {
                  markAsChecked(name, url);
                }}
                isChecked={isChecked}
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
                onExportWithEmails={canExport ? () => void loggedExport(handleExportWithEmails, leads.length, 'results_with_emails') : undefined}
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
          <CampaignPicker mode="assign" value={chosenCampaign} onChange={setChosenCampaign} className="h-9 w-full" hideCreate={viewerRole !== 'admin'} />
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
