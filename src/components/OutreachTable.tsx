import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import type { PhoneFetchStatus } from '@/hooks/useOutreach';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Phone, 
  ExternalLink, 
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Trash2,
  RotateCcw,
  Send,
  Copy,
  CheckCheck,
  Star,
  StickyNote,
  Mail,
  Instagram,
  Facebook,
  Smartphone,
  Globe,
  RefreshCw,
  DatabaseZap,
  Loader2,
  MessageSquare,
  MessageCircle,
  Upload,
  Eye,
  PhoneOff,
  PhoneCall,
  X,
  Wand2,
  Settings2,
  Scissors,
  Flower2,
  Wrench,
  CalendarClock,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { classifyLineType } from '@/lib/lineType';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import { useContactAction } from '@/hooks/useContactAction';
import { useDebouncedCallback } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { useCopiedPhones } from '@/hooks/useCopiedPhones';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { WhatsAppStatusBadge } from './WhatsAppStatusBadge';
import { ContactMethodBadge } from './ContactMethodBadge';
import { PipelineStatusBadge } from './PipelineStatusBadge';
import { PipelineStatusSelect } from './PipelineStatusSelect';
import { NextActionEditor } from './NextActionEditor';
import { CSVImportDialog } from './CSVImportDialog';
import { OutreachMobileCard } from './OutreachMobileCard';
import { LeadEnrichButtons } from './LeadEnrichButtons';
import { LeadDetailDialog } from './LeadDetailDialog';
import { isDemoLead } from '@/lib/demoLeads';
import { isTestBarberLead, TEST_BARBER_LEAD_ID } from '@/config/testBarber';
import { clearPendingBarberEdit } from '@/lib/barberEdits';
import { cn } from '@/lib/utils';
import type { OutreachLead, LeadStatus, NextActionType, Country, ContactMethod, PipelineStatus } from '@/types/outreach';
import { STATUS_OPTIONS, NEXT_ACTION_OPTIONS, OUTREACH_STATUS_OPTIONS, CONTACT_METHOD_OPTIONS, PIPELINE_STATUS_OPTIONS, WHATSAPP_TEMPLATES } from '@/types/outreach';
import { SingleWhatsAppDialog } from '@/components/SingleWhatsAppDialog';
import { CampaignPicker } from '@/components/CampaignPicker';
import { SingleSMSDialog } from '@/components/SingleSMSDialog';
import { PushToInstantlyDialog } from '@/components/PushToInstantlyDialog';
import { AiOpenerModal } from '@/components/AiOpenerModal';
import { useSubscription } from '@/hooks/useSubscription';

interface OutreachTableProps {
  leads: OutreachLead[];
  onLeadClick: (lead: OutreachLead) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onContactMethodChange?: (leadId: string, method: ContactMethod) => void;
  onPipelineStatusChange?: (leadId: string, status: PipelineStatus) => void;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => void;
  onRemoveAll: () => void;
  onArchive?: (leadId: string) => void;
  onArchiveSelected?: (leadIds: string[]) => void;
  onDelete?: (leadId: string) => void;
  onDeleteSelected?: (leadIds: string[]) => void;
  /** Reset = fully wipe (outreach_leads + outreach_history) so the lead is re-addable.
   *  Distinct from onDeleteSelected, which keeps the added-history ledger. */
  onResetSelected?: (leadIds: string[]) => Promise<unknown> | void;
  /** Reset to fresh = server-side delete the lead's generated site + null its enrichment
   *  fields + clear its enrichment_cache. KEEPS the lead, its identity, notes, status,
   *  tracking and history. Ownership-guarded server-side. */
  onResetToFreshSelected?: (leadIds: string[]) => Promise<unknown> | void;
  onBulkStatusChange?: (leadIds: string[], status: LeadStatus) => void;
  onMarkAsInterested?: (leadIds: string[]) => void;
  onRefreshLeads?: () => void;
  onImportLeads?: (leads: Array<Partial<OutreachLead>>) => Promise<void>;
  onBulkLookupPhones?: (leadIds: string[], onProgress: (current: number, total: number) => void) => Promise<{ updated: number; skipped: number; failed: number; total: number }>;
  showArchiveButton?: boolean;
  isArchiveView?: boolean;
  /** When true, hides status and next action editing (for simplified Outreach CRM view) */
  readOnly?: boolean;
  phoneFetchStatus?: Record<string, PhoneFetchStatus>;
  onRetryPhoneFetch?: (leadId: string) => void;
  /** Called before a contact action. Return true to allow, false to block (show paywall). */
  onContactGated?: (channel: 'call' | 'sms' | 'whatsapp', leadId?: string) => boolean;
  /** Persist enrichment results found via the per-row enrich buttons. */
  onUpdateLead?: (leadId: string, data: Partial<OutreachLead>) => Promise<any>;
  /** Lead-detail modal callbacks (opened on row click) — fold-in of Track Leads. */
  onNotesChange?: (leadId: string, notes: string) => Promise<any> | void;
  onBusinessNameChange?: (leadId: string, name: string) => Promise<any> | void;
  onImageChange?: (leadId: string, imageUrl: string | null) => Promise<any> | void;
  fetchActivities?: (leadId: string) => Promise<any[]>;
  campaignDefaultSaleTypeByLead?: Record<string, string | null>;
  /** Per-lead campaign NAME (built once by the parent). Rendered as a muted sub-line
   *  under the business name — only when showCampaignName is true. */
  campaignNameByLead?: Record<string, string | null>;
  /** Show the campaign sub-line (true only in the "All campaigns" view). */
  showCampaignName?: boolean;
  /** Launch-pad intent (e.g. from the Manage page): open a specific lead's composer
   *  fresh with a chosen template + that barber's /s/ link. */
  launchIntent?: {
    leadId: string;
    /** 'open' just opens the lead's detail modal (for non-messaging next actions, or
     *  email/messenger leads that have no per-lead composer). */
    channel: 'sms' | 'whatsapp' | 'call' | 'open';
    templateContent?: string | null;
    shareLink?: string | null;
  } | null;
  /** Called once a launchIntent has been acted on, so the parent can clear it. */
  onLaunchConsumed?: () => void;
  /** Create a server-side bulk job (enrich / site_gen) for the given lead ids.
   *  Runs in the bulk-jobs edge function — survives leaving the page. */
  onBulkJob?: (type: 'enrich' | 'site_gen', leadIds: string[], params?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** True while a bulk job is queued/running (or being created) — disables new ones. */
  bulkJobActive?: boolean;
  /** Bumped when a site-gen bulk job completes → re-read generated_sites. */
  sitesRefreshToken?: number;
  /** Lead ids currently being generated by an active bulk site-gen job (item
   *  status 'running') — drives the same per-row spinner as single site-gen. */
  bulkGeneratingIds?: Set<string>;
  /** Bulk-move the selected leads to a campaign (null = "No campaign"). Single
   *  batched write, owner-RLS scoped. Demo leads are filtered by the caller. */
  onAssignCampaign?: (leadIds: string[], campaignId: string | null) => Promise<boolean> | void;
}

const ITEMS_PER_PAGE_DESKTOP = 15;
const ITEMS_PER_PAGE_MOBILE = 10;

// Bulk site-gen template options — the SAME set the single per-row picker offers
// (full sites + booking-only pages). `value` is the Select key; template + mode are
// what get sent to the bulk-jobs `params` (which forwards them to generate-barber-site).
const BULK_SITE_GEN_OPTIONS: { value: string; label: string; template: 'barber' | 'salon' | 'plumber'; mode?: 'booking_only' }[] = [
  { value: 'barber', label: 'Barber site', template: 'barber' },
  { value: 'salon', label: 'Salon site', template: 'salon' },
  { value: 'plumber', label: 'Plumber site', template: 'plumber' },
  { value: 'barber:booking_only', label: 'Barber booking page', template: 'barber', mode: 'booking_only' },
  { value: 'salon:booking_only', label: 'Salon booking page', template: 'salon', mode: 'booking_only' },
];

type SortField = 'business_name' | 'status' | 'next_action_date' | 'created_at' | 'tracked';
type SortDirection = 'asc' | 'desc';

// Cheap LISTING-level channel signals — derived for free from the stored `website`
// field (no API call, no enrich). "FB/IG (listing)" = the Maps listing's website is
// a Facebook/Instagram link; "has own website" = a real site (not social/booking).
// Honest: these are listing signals, NOT verified socials (those need deep enrich).
const SIGNAL_NON_OWN_DOMAINS = [
  'facebook.com', 'fb.com', 'instagram.com',
  'fresha.com', 'booksy.com', 'treatwell.com', 'vagaro.com', 'styleseat.com',
  'setmore.com', 'gettimely.com', 'squareup.com', 'acuityscheduling.com',
  'linktr.ee', 'linktree.com',
];
function siteDomain(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
const isFacebookListing = (url?: string | null) => /(?:^|\.)(?:facebook|fb)\.com$/.test(siteDomain(url));
const isInstagramListing = (url?: string | null) => /(?:^|\.)instagram\.com$/.test(siteDomain(url));
const isOwnWebsite = (url?: string | null) => {
  const d = siteDomain(url);
  return !!d && !SIGNAL_NON_OWN_DOMAINS.some((x) => d === x || d.endsWith(`.${x}`));
};

export function OutreachTable({ 
  leads, 
  onLeadClick, 
  onStatusChange,
  onContactMethodChange,
  onPipelineStatusChange,
  onNextActionChange, 
  onRemoveAll,
  onArchive,
  onArchiveSelected,
  onDelete,
  onDeleteSelected,
  onResetSelected,
  onResetToFreshSelected,
  onBulkStatusChange,
  onMarkAsInterested,
  onRefreshLeads,
  onImportLeads,
  onBulkLookupPhones,
  showArchiveButton = true,
  isArchiveView = false,
  readOnly = false,
  phoneFetchStatus = {},
  onRetryPhoneFetch,
  onContactGated,
  onUpdateLead,
  onNotesChange,
  onBusinessNameChange,
  onImageChange,
  fetchActivities,
  campaignDefaultSaleTypeByLead,
  campaignNameByLead,
  showCampaignName,
  launchIntent,
  onLaunchConsumed,
  onBulkJob,
  bulkJobActive = false,
  sitesRefreshToken = 0,
  bulkGeneratingIds,
  onAssignCampaign,
}: OutreachTableProps) {
  const { toast } = useToast();
  const { isPhoneCopied, markMultipleAsCopied } = useCopiedPhones();
  const isMobile = useIsMobile();
  const ITEMS_PER_PAGE = isMobile ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP;
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const [aiOpenerLead, setAiOpenerLead] = useState<OutreachLead | null>(null);
  // Site-gen "building" state is SERVER-DRIVEN (no in-memory Set). Every single-row
  // build now runs as a durable server-side site-gen job (see handleGenerateSite),
  // exactly like the bulk "Generate sites" button, so the spinner is read from the
  // job's per-item status (bulkGeneratingIds). That means it survives leaving/
  // returning to the page and clears itself the moment a build finishes or fails —
  // no state is lost on re-mount.
  const isRowGenerating = useCallback(
    (id: string) => !!bulkGeneratingIds?.has(id),
    [bulkGeneratingIds],
  );
  // Bulk site-gen template picker dialog.
  const [siteGenDialogOpen, setSiteGenDialogOpen] = useState(false);
  const [siteGenChoice, setSiteGenChoice] = useState<string>('barber');
  const [sitesByLead, setSitesByLead] = useState<Record<string, { id: string; slug: string; opened: boolean; claimed: boolean; addon: boolean }>>({});
  // Per-lead LATEST audit state (mirrors sitesByLead) — drives the upcoming "Run audit" /
  // "Manage" row control. Keyed by lead_id, newest audit first; each entry carries that
  // audit's latest run + its status (pending|running|complete|capped|failed).
  const [auditsByLead, setAuditsByLead] = useState<Record<string, { auditId: string; runId: string; status: string }>>({});
  const navigate = useNavigate();
  const [resettingTestBarber, setResettingTestBarber] = useState(false);

  // One-click reset of the permanent TEST barber fixture. Guarded by a confirm and
  // hard-locked server-side to the single test id (reset-test-barber refuses any
  // other lead). Restores the site + lead to "newly added" and clears local edits.
  const handleResetTestBarber = useCallback(async () => {
    if (resettingTestBarber) return;
    const ok = window.confirm(
      "Reset the TEST barber to a fresh, unclaimed state?\n\n" +
        "This wipes its test claim/ownership, colour + photo edits, and any test bookings, " +
        "and puts the lead back to New. It only ever affects the test fixture — no real barber is touched.",
    );
    if (!ok) return;
    setResettingTestBarber(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-test-barber', {
        body: { lead_id: TEST_BARBER_LEAD_ID },
      });
      if (error || !data?.ok) throw new Error((data?.error as string) || 'reset_failed');
      clearPendingBarberEdit(); // drop any pre-auth colour/photo edits held in this browser
      toast({ title: 'Test barber reset', description: 'Back to New — site, claim, edits and test bookings cleared.' });
      onRefreshLeads?.();
    } catch (e) {
      toast({ title: "Couldn't reset", description: (e as Error).message, variant: 'destructive' });
    } finally {
      setResettingTestBarber(false);
    }
  }, [resettingTestBarber, toast, onRefreshLeads]);

  // Map lead_id -> existing generated site (most recent) so each row shows "Manage
  // Site" instead of "Generate Site". RLS scopes the result: admins see all sites,
  // reps see only sites for their own leads (lead-owner policy). Additive — never
  // affects leads without a site.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Untyped client: tracking columns aren't in the generated types yet.
      const { data } = await (supabase as unknown as SupabaseClient)
        .from('generated_sites')
        .select('id, site_name, lead_id, first_opened_at, claimed_at, addon_interest_at')
        .order('created_at', { ascending: false });
      if (cancelled || !data) return;
      const map: Record<string, { id: string; slug: string; opened: boolean; claimed: boolean; addon: boolean }> = {};
      for (const row of data as Array<{ id: string; site_name: string; lead_id: string | null; first_opened_at: string | null; claimed_at: string | null; addon_interest_at: string | null }>) {
        if (row.lead_id && !map[row.lead_id]) {
          map[row.lead_id] = {
            id: row.id,
            slug: row.site_name,
            opened: !!row.first_opened_at,
            claimed: !!row.claimed_at,
            addon: !!row.addon_interest_at,
          };
        }
      }
      setSitesByLead(map);
    })();
    return () => { cancelled = true; };
  }, [isAdmin, sitesRefreshToken]);

  // Map lead_id -> its LATEST audit run + status, so each row can show "Run audit" (none) /
  // "Running…" / "Manage" (complete). Mirrors sitesByLead: RLS-scoped (no explicit user filter),
  // newest audit first, keep the FIRST audit seen per lead_id. For that audit, pick its latest
  // run (max run_number, else newest created_at); audits with no runs are skipped.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as unknown as SupabaseClient)
        .from('ai_audits')
        .select('id, lead_id, ai_audit_runs(id, run_number, status, created_at)')
        .order('created_at', { ascending: false });
      if (cancelled || !data) return;
      const map: Record<string, { auditId: string; runId: string; status: string }> = {};
      for (const row of data as Array<{ id: string; lead_id: string | null; ai_audit_runs: Array<{ id: string; run_number: number | null; status: string | null; created_at: string | null }> | null }>) {
        if (!row.lead_id || map[row.lead_id]) continue; // no lead, or a newer audit already won
        const runs = Array.isArray(row.ai_audit_runs) ? row.ai_audit_runs : [];
        if (runs.length === 0) continue;               // no run yet → nothing to show
        const latestRun = [...runs].sort((a, b) =>
          (b.run_number ?? 0) - (a.run_number ?? 0) ||
          (new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        )[0];
        map[row.lead_id] = { auditId: row.id, runId: latestRun.id, status: latestRun.status ?? 'pending' };
      }
      setAuditsByLead(map);
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [countryFilter, setCountryFilter] = useState<Country | 'all'>('all');
  const [trackedOnly, setTrackedOnly] = useState(false);
  // Contactability filters (AND-combined, stack with the others). Each matches the
  // SAME stored fields that drive the row icons, so the count is consistent.
  const [hasEmail, setHasEmail] = useState(false);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [hasFacebook, setHasFacebook] = useState(false);
  const [hasWhatsApp, setHasWhatsApp] = useState(false);
  // Hide leads confirmed NOT on WhatsApp (status='no_whatsapp'). A durable hygiene
  // preference, so it's persisted with the rest of the table state (below).
  const [hideNoWhatsApp, setHideNoWhatsApp] = useState(false);
  // Listing-level signal filters — free (derived from stored website), not verified.
  const [sigWebsite, setSigWebsite] = useState(false);
  const [sigFacebook, setSigFacebook] = useState(false);
  const [sigInstagram, setSigInstagram] = useState(false);
  // Push-to-Instantly dialog (campaign picker), opened from the bulk bar.
  const [pushInstantlyOpen, setPushInstantlyOpen] = useState(false);
  // Lead-detail modal (Track Leads fold-in) — opened on row click.
  const [detailLead, setDetailLead] = useState<OutreachLead | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRecoveringPhones, setIsRecoveringPhones] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<{ current: number; total: number } | null>(null);
  const { logAttempt } = useOutreachAttempt();
  const [showImportDialog, setShowImportDialog] = useState(false);
  // "Reset to fresh" confirm (destructive — deletes the site + wipes enrichment).
  const [resetFreshOpen, setResetFreshOpen] = useState(false);
  // Bulk WhatsApp-queue template picker (chosen at queue-time).
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [queueTemplate, setQueueTemplate] = useState<string>(WHATSAPP_TEMPLATES[0].value);
  const [lastContactedLeadId, setLastContactedLeadId] = useState<string | null>(null);
  // Dialog state for WhatsApp/SMS template pages
  const [whatsappDialogLead, setWhatsappDialogLead] = useState<OutreachLead | null>(null);
  // Launch-pad: template + /s/ link injected into the composer for THIS launch only
  // (cleared on dialog close so a later manual open behaves normally).
  const [launchTemplate, setLaunchTemplate] = useState<string | null>(null);
  const [launchLink, setLaunchLink] = useState<string | null>(null);
  const [smsDialogLead, setSmsDialogLead] = useState<OutreachLead | null>(null);
  // Optimistic UI state: leadId -> partial overrides
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, Record<string, any>>>(new Map());
  // Track leads contacted during walkthrough (so highlight moves to next business)
  const [walkthroughContactedIds, setWalkthroughContactedIds] = useState<Set<string>>(new Set());

  // Reset walkthroughContactedIds when walkthrough is restarted (replay)
  useEffect(() => {
    const onReset = () => setWalkthroughContactedIds(new Set());
    window.addEventListener('start-walkthrough', onReset);
    return () => window.removeEventListener('start-walkthrough', onReset);
  }, []);

  // Contact action hook: immediate persist, no undo
  const { executeContact } = useContactAction({
    onUpdate: useCallback((leadId: string, updates: Record<string, any>) => {
      setOptimisticUpdates(prev => {
        const next = new Map(prev);
        next.set(leadId, { ...(prev.get(leadId) || {}), ...updates });
        return next;
      });
    }, []),
    onPersisted: useCallback((leadId: string, _channel: 'whatsapp' | 'sms' | 'call') => {
      // Keep optimistic updates (including status) until the leads prop syncs.
      // The useEffect below will clear them when leads catch up.
      // We no longer strip `status` here because leads aren't re-fetched after
      // logAttempt, which caused the status to revert to 'not_contacted'.
    }, []),
  });

  // Clear optimistic updates when the leads prop catches up with the persisted values
  useEffect(() => {
    if (optimisticUpdates.size === 0) return;
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [leadId, updates] of prev) {
        const lead = leads.find(l => l.id === leadId);
        // If lead now has the status we optimistically set, clear the override
        if (lead && updates.status && lead.status === updates.status) {
          next.delete(leadId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [leads, optimisticUpdates]);

  // Keep a ref to current leads for use in callbacks
  const leadsRef = useRef(leads);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // Debounced search handlers (200ms)
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, 200);

  const debouncedLocation = useDebouncedCallback((value: string) => {
    setLocationFilter(value);
    setCurrentPage(1);
  }, 200);

  // When a new lead arrives, always bring the user back to page 1 so it's visible immediately.
  const prevNewestLeadIdRef = useRef<string | null>(null);

  const tableStateKey = user?.id
    ? `leadfinder_outreach_table_state:${user.id}`
    : 'leadfinder_outreach_table_state';
  
  const lastContactedKey = user?.id
    ? `leadfinder_last_contacted:${user.id}`
    : 'leadfinder_last_contacted';

  const highlightLead = (leadId: string) => {
    setLastContactedLeadId(leadId);
    try {
      sessionStorage.setItem(lastContactedKey, leadId);
      localStorage.setItem(lastContactedKey, leadId);
    } catch {
      // ignore
    }
  };

  const forcePage1Key = user?.id
    ? `leadfinder_outreach_force_page1:${user.id}`
    : 'leadfinder_outreach_force_page1';

  // Helper to read from sessionStorage with localStorage fallback
  const readStoredState = () => {
    try {
      // Try sessionStorage first
      let raw = sessionStorage.getItem(tableStateKey);
      // If sessionStorage is empty, try localStorage as fallback
      if (!raw) {
        raw = localStorage.getItem(tableStateKey);
      }
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  // Helper to write to both storages for redundancy
  const writeStoredState = (state: object) => {
    try {
      const json = JSON.stringify(state);
      sessionStorage.setItem(tableStateKey, json);
      localStorage.setItem(tableStateKey, json);
    } catch {
      // ignore quota errors
    }
  };

  // Restore table state after any reload (e.g. returning from WhatsApp)
  useEffect(() => {
    const parsed = readStoredState();
    if (!parsed) return;

    // If a lead was just added (from Find Leads), always reset to page 1 so it shows immediately.
    let shouldForcePage1 = false;
    try {
      shouldForcePage1 = !!(sessionStorage.getItem(forcePage1Key) || localStorage.getItem(forcePage1Key));
      if (shouldForcePage1) {
        sessionStorage.removeItem(forcePage1Key);
        localStorage.removeItem(forcePage1Key);
      }
    } catch {
      // ignore
    }

    if (typeof parsed.searchQuery === 'string') setSearchQuery(parsed.searchQuery);
    if (typeof parsed.locationFilter === 'string') setLocationFilter(parsed.locationFilter);
    if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
    if (parsed.countryFilter) setCountryFilter(parsed.countryFilter);
    if (typeof parsed.trackedOnly === 'boolean') setTrackedOnly(parsed.trackedOnly);
    if (typeof parsed.hideNoWhatsApp === 'boolean') setHideNoWhatsApp(parsed.hideNoWhatsApp);
    // Contactability + listing-signal filter toggles (persisted alongside the rest so
    // they don't reset on navigation while the neighbouring filters survive).
    if (typeof parsed.hasEmail === 'boolean') setHasEmail(parsed.hasEmail);
    if (typeof parsed.hasInstagram === 'boolean') setHasInstagram(parsed.hasInstagram);
    if (typeof parsed.hasFacebook === 'boolean') setHasFacebook(parsed.hasFacebook);
    if (typeof parsed.hasWhatsApp === 'boolean') setHasWhatsApp(parsed.hasWhatsApp);
    if (typeof parsed.sigWebsite === 'boolean') setSigWebsite(parsed.sigWebsite);
    if (typeof parsed.sigFacebook === 'boolean') setSigFacebook(parsed.sigFacebook);
    if (typeof parsed.sigInstagram === 'boolean') setSigInstagram(parsed.sigInstagram);
    if (parsed.sortField) setSortField(parsed.sortField);
    if (parsed.sortDirection) setSortDirection(parsed.sortDirection);
    if (shouldForcePage1) {
      setCurrentPage(1);
    } else if (typeof parsed.currentPage === 'number' && parsed.currentPage > 0) {
      setCurrentPage(parsed.currentPage);
    }
    // Restore last contacted lead highlight
    try {
      const last = sessionStorage.getItem(lastContactedKey) || localStorage.getItem(lastContactedKey);
      if (last) setLastContactedLeadId(last);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableStateKey]);

  

  // Persist table state to both storages
  useEffect(() => {
    writeStoredState({
      searchQuery,
      locationFilter,
      statusFilter,
      countryFilter,
      trackedOnly,
      hideNoWhatsApp,
      hasEmail,
      hasInstagram,
      hasFacebook,
      hasWhatsApp,
      sigWebsite,
      sigFacebook,
      sigInstagram,
      sortField,
      sortDirection,
      currentPage,
    });
  }, [tableStateKey, searchQuery, locationFilter, statusFilter, countryFilter, trackedOnly, hideNoWhatsApp, hasEmail, hasInstagram, hasFacebook, hasWhatsApp, sigWebsite, sigFacebook, sigInstagram, sortField, sortDirection, currentPage]);

  // Apply optimistic updates to leads for rendering
  const leadsWithOptimistic = useMemo(() => {
    if (optimisticUpdates.size === 0) return leads;
    return leads.map(lead => {
      const updates = optimisticUpdates.get(lead.id);
      if (!updates) return lead;
      return { ...lead, ...updates };
    });
  }, [leads, optimisticUpdates]);

  // Handle WhatsApp button click - open template dialog + count walkthrough contact
  const handleWhatsAppClick = useCallback((lead: OutreachLead) => {
    if (lead.whatsapp_status === 'no') {
      toast({
        description: `${lead.business_name} not on WhatsApp. Try SMS or Call.`,
        duration: 3000,
      });
      return;
    }
    if (onContactGated && !onContactGated('whatsapp', lead.id)) return;
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'whatsapp' as ContactMethod);
    // Treat opening contact panel as selecting this lead for next walkthrough step
    highlightLead(lead.id);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    // Primary WhatsApp path now = the in-app Inbox (real API send + conversation).
    // The wa.me "Open in WhatsApp app" fallback lives in the Inbox thread header.
    navigate('/inbox', { state: { launch: { leadId: lead.id } } });
  }, [toast, onContactGated, onContactMethodChange, navigate]);

  // Handle SMS button click - open template dialog + count walkthrough contact
  const handleSMSClick = useCallback((lead: OutreachLead) => {
    if (onContactGated && !onContactGated('sms', lead.id)) return;
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'sms' as ContactMethod);
    // Treat opening contact panel as selecting this lead for next walkthrough step
    highlightLead(lead.id);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    setSmsDialogLead(lead);
  }, [onContactGated, onContactMethodChange]);

  // Single-row "Generate site": enqueue a DURABLE, server-side site-gen job — the same
  // bulk-jobs pipeline the "Generate sites" button uses — instead of an in-memory build.
  // The job lives in bulk_jobs, so its spinner (bulkGeneratingIds) survives leaving and
  // returning to the page and clears itself the moment the build finishes or fails; on
  // completion the parent refetches generated_sites (sitesRefreshToken) so the View
  // site / Manage link appears. One build at a time (the server allows one active job
  // per user) — to build several at once, use the "Generate sites" button up top.
  const handleGenerateSite = useCallback(async (
    lead: OutreachLead,
    template: 'barber' | 'salon' | 'plumber' = 'barber',
    mode?: 'booking_only',
  ) => {
    if (!onBulkJob) return;
    if (isRowGenerating(lead.id)) return; // already building this row
    // A build is already running (this row's, or a bulk run). Enforced server-side too;
    // guard here to give a helpful message that points at the bulk button.
    if (bulkJobActive) {
      toast({
        title: 'A build is already running',
        description: 'Wait for it to finish — or use the “Generate sites” button at the top of the list to build several at once.',
      });
      return;
    }
    const res = await onBulkJob('site_gen', [lead.id], { template, ...(mode ? { mode } : {}) });
    if (!res.ok) {
      const busy = /already have a bulk job|running/i.test(res.error ?? '');
      toast({
        title: busy ? 'A build is already running' : "Couldn't start the build",
        description: busy
          ? 'Wait for it to finish — or use the “Generate sites” button to build several at once.'
          : (res.error || 'Please try again.'),
        variant: busy ? undefined : 'destructive',
      });
    }
    // Success: the row spins as soon as the job's item appears (bulkGeneratingIds
    // includes the pending item), and the parent's poll clears it on done/failed.
  }, [onBulkJob, bulkJobActive, isRowGenerating, toast]);

  const handleCallClick = useCallback((lead: OutreachLead) => {
    if (onContactGated && !onContactGated('call', lead.id)) return;
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'call' as ContactMethod);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    // Call has no dialog panel, so mark panel as closed immediately
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
    highlightLead(lead.id);
    executeContact(lead, 'call');
  }, [executeContact, onContactMethodChange]);

  // Launch-pad: when the parent passes a launchIntent (e.g. from Manage), open the
  // matching lead's composer FRESH with the chosen template + that barber's link.
  // Waits until the target lead is present in the list, then consumes the intent.
  useEffect(() => {
    if (!launchIntent) return;
    const lead = leads.find((l) => l.id === launchIntent.leadId);
    if (!lead) return; // not loaded/filtered yet — rerun when leads change
    setLaunchTemplate(launchIntent.templateContent ?? null);
    setLaunchLink(launchIntent.shareLink ?? null);
    if (launchIntent.channel === 'sms') setSmsDialogLead(lead);
    else if (launchIntent.channel === 'whatsapp') setWhatsappDialogLead(lead);
    else if (launchIntent.channel === 'call') handleCallClick(lead);
    else if (launchIntent.channel === 'open') setDetailLead(lead);
    onLaunchConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchIntent, leads]);

  // Called when user clicks "Open App" in WhatsApp/SMS dialog
  const handleDialogSent = useCallback((leadId: string, channel: 'whatsapp' | 'sms') => {
    const lead = leadsRef.current.find(l => l.id === leadId);
    if (!lead) return;
    highlightLead(lead.id);
    executeContact(lead, channel);
  }, [executeContact]);

  // Count leads missing phone numbers
  const leadsWithMissingPhones = useMemo(() => {
    return leads.filter(l => !l.phone);
  }, [leads]);

  // Recover missing phone numbers via edge function
  const handleRecoverPhones = async () => {
    if (leadsWithMissingPhones.length === 0) {
      toast({
        title: 'All phones available',
        description: 'All leads already have phone numbers.',
      });
      return;
    }

    if (!onBulkLookupPhones) {
      toast({
        title: 'Not available',
        description: 'Bulk phone lookup is not available.',
        variant: 'destructive',
      });
      return;
    }

    setIsRecoveringPhones(true);
    setRecoveryProgress({ current: 0, total: leadsWithMissingPhones.length });

    try {
      const leadIds = leadsWithMissingPhones.map(l => l.id);
      const result = await onBulkLookupPhones(leadIds, (current, total) => {
        setRecoveryProgress({ current, total });
      });

      if (result.updated > 0 || result.failed > 0) {
        toast({
          title: 'Phone recovery complete',
          description: `${result.updated} found, ${result.skipped} skipped, ${result.failed} failed`,
        });
      }
    } catch (err) {
      console.error('Phone recovery error:', err);
      toast({
        title: 'Recovery failed',
        description: 'An error occurred while recovering phone numbers.',
        variant: 'destructive',
      });
    } finally {
      setIsRecoveringPhones(false);
      setRecoveryProgress(null);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedLeads.map(l => l.id)));
    }
  };

  const handleSelectOne = useCallback((leadId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(leadId);
      } else {
        newSet.delete(leadId);
      }
      return newSet;
    });
  }, []);

  // Copy selected phones in bulk format: "447477932564, 447477932565"
  const copySelectedPhones = async () => {
    const leadsWithPhones = filteredAndSortedLeads
      .filter(l => selectedIds.has(l.id) && l.phone);
    
    const phones = leadsWithPhones
      .map(l => l.phone!.replace(/\D/g, '').replace(/^\+/, ''))
      .filter(p => p.length > 0);
    
    if (phones.length === 0) {
      toast({
        title: 'No phone numbers',
        description: 'No phone numbers found in selected leads.',
        variant: 'destructive',
      });
      return;
    }
    
    navigator.clipboard.writeText(phones.join(', '));
    
    // Mark all as copied in backend
    const leadIds = leadsWithPhones.map(l => l.id);
    await markMultipleAsCopied(leadIds);
    
    // Copied — no toast
  };

  // ── Server-side bulk jobs (enrich / site-gen): confirm-before-spend, hand the
  // ids to the bulk-jobs edge function, clear the selection. The job runs
  // server-side (leave-safe); progress renders in the page-level banner.
  const handleBulkEnrichJob = async () => {
    if (!onBulkJob || bulkJobActive) return;
    const ids = Array.from(selectedIds).filter((id) => !isDemoLead(id));
    if (!ids.length) return;
    const est = (ids.length * 0.035).toFixed(2);
    if (!window.confirm(
      `Enrich ${ids.length} selected lead${ids.length === 1 ? '' : 's'} — finds email, Facebook, Instagram & WhatsApp signal?

` +
      `~$0.035 each · up to ~$${est} (already-cached leads are free). Respects the $2/day enrichment cap — remaining leads are skipped if it's reached.

` +
      `Runs server-side: you can leave this page or close the browser. Progress shows in the banner; results save to your leads.`,
    )) return;
    const res = await onBulkJob('enrich', ids);
    if (res.ok) {
      toast({ title: `Bulk enrich started (${ids.length} leads)`, description: 'Running server-side — safe to leave this page.' });
      setSelectedIds(new Set());
    } else {
      toast({ title: 'Could not start bulk enrich', description: res.error, variant: 'destructive' });
    }
  };

  // Leads eligible for bulk site-gen: selected, real (non-demo), no existing site.
  const siteGenEligibleIds = useMemo(
    () => Array.from(selectedIds).filter((id) => !isDemoLead(id) && !sitesByLead[id]),
    [selectedIds, sitesByLead],
  );

  // Open the template picker (validates there's something to generate first).
  const handleBulkSiteGenJob = () => {
    if (!onBulkJob || bulkJobActive) return;
    if (!siteGenEligibleIds.length) {
      toast({ title: 'Nothing to generate', description: 'All selected leads already have a site.' });
      return;
    }
    setSiteGenDialogOpen(true);
  };

  // Start the job with the chosen template (+ optional booking_only mode).
  const confirmBulkSiteGen = async () => {
    if (!onBulkJob || bulkJobActive) return;
    const ids = siteGenEligibleIds;
    if (!ids.length) { setSiteGenDialogOpen(false); return; }
    const opt = BULK_SITE_GEN_OPTIONS.find((o) => o.value === siteGenChoice) ?? BULK_SITE_GEN_OPTIONS[0];
    const res = await onBulkJob('site_gen', ids, { template: opt.template, ...(opt.mode ? { mode: opt.mode } : {}) });
    if (res.ok) {
      toast({ title: `Bulk ${opt.label.toLowerCase()} generation started (${ids.length} lead${ids.length === 1 ? '' : 's'})`, description: 'Running server-side — safe to leave this page.' });
      setSelectedIds(new Set());
      setSiteGenDialogOpen(false);
    } else {
      toast({ title: 'Could not start bulk site generation', description: res.error, variant: 'destructive' });
    }
  };

  // Mark selected leads as contacted (Initial Contact)
  const handleMarkAsContacted = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Update each lead's status to 'initial_contact'
    ids.forEach(id => onStatusChange(id, 'initial_contact'));
    setSelectedIds(new Set());
    // Status updated — no toast
  };

  // Add selected leads to the WhatsApp outreach queue (status='queued' + queued_at
  // for FIFO order). The template is chosen at queue-time and applied to every
  // selected lead (overrides any per-lead template).
  const handleQueueForWhatsApp = (template: string) => {
    if (selectedIds.size === 0 || !onUpdateLead) return;
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    // Don't re-queue leads already flagged not-on-WhatsApp (permanent skip).
    const queueable = ids.filter((id) => leads.find((l) => l.id === id)?.status !== 'no_whatsapp');
    const skipped = ids.length - queueable.length;
    // Tier-1 offline line-type gate: only mobiles may be queued. Landline/VoIP/etc.
    // never enter the queue — they're flagged 'no_whatsapp_needs_sms' so they're easy
    // to find for SMS later (no send is ever attempted at a non-mobile number).
    let blockedNonMobile = 0;
    queueable.forEach((id) => {
      const lead = leads.find((l) => l.id === id);
      const { lineType, whatsappEligible } = classifyLineType(lead?.phone, lead?.country);
      if (!whatsappEligible) {
        blockedNonMobile++;
        onUpdateLead(id, {
          status: 'no_whatsapp_needs_sms',
          line_type: lineType,
          line_type_checked_at: now,
        });
        return;
      }
      // Reset whatsapp_attempts so a re-queued (whatsapp_failed) lead gets fresh retries.
      // Capture the pre-queue status so cancelling restores it (not a wipe to not_contacted).
      const patch: Partial<OutreachLead> = {
        status: 'queued', queued_at: now, whatsapp_attempts: 0, whatsapp_template: template,
        previous_status: lead?.status ?? null,
        line_type: lineType, // cache the offline result
        contact_method: 'whatsapp', // attribute to WhatsApp immediately (cleared on cancel / permanent fail)
      };
      onUpdateLead(id, patch);
    });
    const queuedCount = queueable.length - blockedNonMobile;
    setSelectedIds(new Set());
    setQueueDialogOpen(false);
    const tmplLabel = WHATSAPP_TEMPLATES.find((t) => t.value === template)?.label ?? template;
    const notes = [
      skipped ? `${skipped} skipped (not on WhatsApp).` : '',
      blockedNonMobile ? `${blockedNonMobile} not a mobile → flagged for SMS.` : '',
    ].filter(Boolean).join(' ');
    toast({
      title: `Queued ${queuedCount} for WhatsApp`,
      description: `Template: ${tmplLabel}. ${notes ? notes + ' ' : ''}Sends within the daily 7am–9:30pm UK window, capped at 40/day.`,
    });
  };

  // Archive selected leads
  const handleArchiveSelected = () => {
    if (selectedIds.size === 0) return;
    if (onArchiveSelected) {
      onArchiveSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Delete selected leads
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (onDeleteSelected) {
      onDeleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Reset selected leads: fully wipe (outreach_leads + added-history) so they're
  // re-addable. Deliberate, confirmed — different from Remove which keeps the ledger.
  const handleResetSelected = () => {
    if (selectedIds.size === 0 || !onResetSelected) return;
    const n = selectedIds.size;
    const ok = window.confirm(
      `Reset ${n} lead${n === 1 ? '' : 's'}? This fully removes ${n === 1 ? 'it' : 'them'} and clears the ` +
      `added-history, so they can be added again. Use this for test leads or to start over.`,
    );
    if (!ok) return;
    onResetSelected(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  // Reset selected leads "to fresh" (confirmed via AlertDialog): server-side deletes
  // the site + nulls enrichment + clears cache; keeps the lead/identity/notes/status/
  // history. Runs only after the dialog's action is clicked.
  const handleResetToFreshSelected = () => {
    if (selectedIds.size === 0 || !onResetToFreshSelected) return;
    onResetToFreshSelected(Array.from(selectedIds));
    setSelectedIds(new Set());
    setResetFreshOpen(false);
  };

  const exportToCsv = (mode: 'crm' | 'import' = 'crm') => {
    const leadsToExport = selectedIds.size > 0 
      ? filteredAndSortedLeads.filter(l => selectedIds.has(l.id))
      : filteredAndSortedLeads;
      
    if (leadsToExport.length === 0) {
      toast({
        title: 'No leads to export',
        description: selectedIds.size > 0 
          ? 'No leads selected for export.'
          : 'There are no leads matching your current filters.',
        variant: 'destructive',
      });
      return;
    }

    // Standard CSV escape: only quote if cell contains comma, quote, CR, or LF
    const csvEscape = (value: string): string => {
      if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const normalizeDate = (dateStr: string | null): string => {
      if (!dateStr) return '';
      return dateStr.split('T')[0];
    };

    const buildCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
      return [headers, ...rows]
        .map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(','))
        .join('\r\n');
    };

    const crmHeaders = [
      'businessName',
      'contactPerson',
      'phone',
      'email',
      'googleMapsUrl',
      'notes',
      'status',
      'nextAction',
      'nextActionDate',
      'country',
      'address',
      'category',
    ];

    const crmRows = leadsToExport.map((lead) => [
      lead.business_name,
      '', // contactPerson - not stored in this app
      lead.phone || '',
      lead.email || '',
      lead.google_maps_url || '',
      lead.notes || '',
      lead.status,
      lead.next_action || '',
      normalizeDate(lead.next_action_date),
      lead.country || '',
      lead.address || '',
      lead.category || '',
    ]);

    // Other app importer (per its UI): requires businessName, optionally accepts only these columns
    const importHeaders = ['businessName', 'contactPerson', 'phone', 'email', 'googleMapsUrl', 'notes'];
    const importRows = leadsToExport.map((lead) => [
      lead.business_name,
      '',
      lead.phone || '',
      lead.email || '',
      lead.google_maps_url || '',
      lead.notes || '',
    ]);

    const csvContent = mode === 'import' ? buildCsv(importHeaders, importRows) : buildCsv(crmHeaders, crmRows);

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        mode === 'import'
          ? `import-businesses-${new Date().toISOString().split('T')[0]}.csv`
          : `outreach-leads-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Export complete — no toast
    } catch (err) {
      console.error('CSV export failed:', err);
      toast({
        title: 'Export failed',
        description: 'Failed to export leads to CSV. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredAndSortedLeads = useMemo(() => {
    let result = [...leadsWithOptimistic];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      // Normalize query for phone search (remove spaces and non-digits)
      const normalizedQuery = query.replace(/\s+/g, '');
      const isPhoneSearch = /^\d+$/.test(normalizedQuery);
      
      result = result.filter((lead) => {
        // Check business name and address normally
        if (lead.business_name.toLowerCase().includes(query)) return true;
        if (lead.address?.toLowerCase().includes(query)) return true;
        
        // For phone, normalize by removing spaces for comparison
        if (lead.phone) {
          const normalizedPhone = lead.phone.replace(/\s+/g, '').toLowerCase();
          // If user typed only digits, compare normalized versions
          if (isPhoneSearch) {
            return normalizedPhone.includes(normalizedQuery);
          }
          // Otherwise do normal search
          return normalizedPhone.includes(query.replace(/\s+/g, ''));
        }
        
        return false;
      });
    }

    // Filter by location
    if (locationFilter.trim()) {
      const tokens = locationFilter.trim().toLowerCase().replace(/\s+/g, ' ').split(' ');
      result = result.filter((lead) => {
        const haystack = `${lead.address || ''} ${lead.country || ''}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
      });
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    // Filter by country
    if (countryFilter !== 'all') {
      result = result.filter((lead) => lead.country === countryFilter);
    }

    // Filter: interested-only toggle (status = 'interested')
    if (trackedOnly) {
      result = result.filter((lead) => lead.status === 'interested');
    }

    // Contactability filters (AND) — only REAL stored values, matching the row icons.
    if (hasEmail) result = result.filter((lead) => !!lead.email);
    if (hasInstagram) result = result.filter((lead) => !!lead.instagram_url);
    if (hasFacebook) result = result.filter((lead) => !!lead.facebook_url);
    if (hasWhatsApp) result = result.filter((lead) => lead.line_type === 'mobile');

    // Hide leads confirmed not on WhatsApp (permanent 131026 → status='no_whatsapp').
    if (hideNoWhatsApp) result = result.filter((lead) => lead.status !== 'no_whatsapp');

    // Listing-level signal filters (free, derived from stored website; AND).
    if (sigWebsite) result = result.filter((lead) => isOwnWebsite(lead.website));
    if (sigFacebook) result = result.filter((lead) => isFacebookListing(lead.website));
    if (sigInstagram) result = result.filter((lead) => isInstagramListing(lead.website));

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'business_name':
          comparison = a.business_name.localeCompare(b.business_name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'next_action_date':
          const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
          const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
          comparison = dateA - dateB;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'tracked':
          // Tracked (is_potential_work) leads first.
          comparison = (b.is_potential_work ? 1 : 0) - (a.is_potential_work ? 1 : 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [leadsWithOptimistic, searchQuery, locationFilter, statusFilter, countryFilter, trackedOnly, hasEmail, hasInstagram, hasFacebook, hasWhatsApp, hideNoWhatsApp, sigWebsite, sigFacebook, sigInstagram, sortField, sortDirection]);

  const newestLeadId = useMemo(() => {
    if (leads.length === 0) return null;
    let newest = leads[0];
    for (let i = 1; i < leads.length; i++) {
      const candidate = leads[i];
      if (new Date(candidate.created_at).getTime() > new Date(newest.created_at).getTime()) {
        newest = candidate;
      }
    }
    return newest.id;
  }, [leads]);

  useEffect(() => {
    if (!newestLeadId) return;
    const prev = prevNewestLeadIdRef.current;

    // Only jump when the newest lead actually changed (i.e. a new lead was inserted).
    if (prev && prev !== newestLeadId) {
      setCurrentPage(1);
    }

    prevNewestLeadIdRef.current = newestLeadId;
  }, [newestLeadId]);

  const totalPages = Math.ceil(filteredAndSortedLeads.length / ITEMS_PER_PAGE);

  // If restoring state lands on a page that no longer exists (after filters/search), clamp it.
  useEffect(() => {
    const safeTotal = totalPages || 1;
    if (currentPage > safeTotal) setCurrentPage(safeTotal);
  }, [currentPage, totalPages]);

  const paginatedLeads = filteredAndSortedLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Always point walkthrough Step 5 to a visible, actionable track button
  const walkthroughTrackLeadId = (
    paginatedLeads.find(l => l.id === lastContactedLeadId && !l.is_potential_work)?.id
    || paginatedLeads.find(l => !l.is_potential_work)?.id
    || null
  );

  // Sorting is consolidated into the single "Sort by" dropdown in the toolbar — the
  // per-column header sort buttons were removed (one place to sort).

  // Count overdue items
  const overdueCount = leads.filter(
    (l) => l.next_action_date && new Date(l.next_action_date) < new Date(new Date().setHours(0, 0, 0, 0))
  ).length;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="border-b border-border/50 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">
              {isArchiveView ? 'Archived' : 'Outreach'}
              <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-muted-foreground">
                ({leads.length})
              </span>
              {selectedIds.size > 0 && (
                <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-primary">
                  {selectedIds.size} sel
                </span>
              )}
              {!isArchiveView && overdueCount > 0 && (
                <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-destructive">
                  {overdueCount} due
                </span>
              )}
            </CardTitle>
          </div>
          
          {/* Actions rows — all buttons equal-weight outline; two tidy rows. */}
          <div className="flex flex-col gap-2">
            {/* Row 1 — primary actions (selection-only) */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copySelectedPhones}
                  className="bg-background text-xs h-8"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy Numbers ({selectedIds.size})
                </Button>
                {!readOnly && onUpdateLead && (
                  <Button variant="outline" size="sm" className="bg-background text-xs h-8" onClick={() => setQueueDialogOpen(true)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                    Queue WhatsApp ({selectedIds.size})
                  </Button>
                )}
                {!readOnly && onBulkJob && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-background text-xs h-8"
                    disabled={bulkJobActive}
                    title={bulkJobActive ? 'A bulk job is already running' : 'Find email / Facebook / Instagram / WhatsApp signal for the selected leads — runs server-side, safe to leave the page'}
                    onClick={handleBulkEnrichJob}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
                    Enrich selected ({selectedIds.size})
                  </Button>
                )}
                {!readOnly && onBulkJob && isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-background text-xs h-8"
                    disabled={bulkJobActive}
                    title={bulkJobActive ? 'A bulk job is already running' : 'Generate a website for each selected lead — runs server-side, safe to leave the page'}
                    onClick={handleBulkSiteGenJob}
                  >
                    <Globe className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                    Generate sites ({selectedIds.size})
                  </Button>
                )}
              </div>
            )}
            {/* Row 2 — edit | destructive | data (Export/Import always visible) */}
            <div className="flex flex-wrap gap-2">
              {selectedIds.size > 0 && (
                <>
                  {!readOnly && (
                    <>
                      {/* Bulk Status Dropdown */}
                      <Select
                        onValueChange={(v) => {
                          const ids = Array.from(selectedIds);
                          ids.forEach(id => onStatusChange(id, v as LeadStatus));
                          // Auto-track when setting to interested
                          if (v === 'interested' && onMarkAsInterested) {
                            const untracked = ids.filter(id => !leads.find(l => l.id === id)?.is_potential_work);
                            if (untracked.length > 0) onMarkAsInterested(untracked);
                          }
                          setSelectedIds(new Set());
                          // Status updated — no toast
                        }}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                          <SelectValue placeholder="Set Status..." />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTREACH_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Bulk Next Action Dropdown */}
                      <Select
                        onValueChange={(v) => {
                          const ids = Array.from(selectedIds);
                          ids.forEach(id => onNextActionChange(id, v as NextActionType));
                          setSelectedIds(new Set());
                          // Next action updated — no toast
                        }}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                          <SelectValue placeholder="Set Action..." />
                        </SelectTrigger>
                        <SelectContent>
                          {NEXT_ACTION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Bulk "Move to campaign" — reuses CampaignPicker (assign mode,
                          which adds a "No campaign" option). Each pick fires one batched
                          write over the selection, skipping demo leads, then clears it. */}
                      {onAssignCampaign && (
                        <CampaignPicker
                          mode="assign"
                          value={null}
                          triggerLabel={`Move to campaign (${selectedIds.size})`}
                          className="w-[180px] h-8 text-xs bg-background"
                          onChange={(campaignId) => {
                            const ids = Array.from(selectedIds).filter((id) => !isDemoLead(id));
                            if (ids.length === 0) return;
                            onAssignCampaign(ids, campaignId);
                            setSelectedIds(new Set());
                          }}
                        />
                      )}
                    </>
                  )}
                  {/* Visual divider before the destructive cluster */}
                  {!readOnly && (onDeleteSelected || onResetSelected || onResetToFreshSelected) && (
                    <div className="w-px h-6 bg-border mx-1 self-center" />
                  )}
                  {onDeleteSelected && !readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteSelected}
                      className="bg-background text-xs h-8 text-destructive hover:text-destructive"
                      title="Removes these leads but keeps their history, so they won't be re-added or re-contacted on Find Leads. (Use Reset to fully clear and allow re-adding.)"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  )}
                  {onResetSelected && !readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetSelected}
                      className="bg-background text-xs h-8 text-amber-600 hover:text-amber-600"
                      title="Fully clears the lead — removes it AND its added-history — so it can be added again on Find Leads. For test leads or starting over. (Unlike Remove, which keeps the history so you don't re-contact.)"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Reset (re-addable)
                    </Button>
                  )}
                  {onResetToFreshSelected && !readOnly && (
                    <AlertDialog open={resetFreshOpen} onOpenChange={setResetFreshOpen}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetFreshOpen(true)}
                        className="bg-background text-xs h-8 text-sky-700 hover:text-sky-700"
                        title="Deletes the generated website and its live/claim link, and wipes all enriched data (Facebook, Instagram, email, line-type) so the enrichment icons return to default. Keeps the lead, its name, phone, notes, status, tracking and history."
                      >
                        <DatabaseZap className="h-3.5 w-3.5 mr-1.5" />
                        Reset to fresh
                      </Button>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset {selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'} to fresh?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes their generated website and its live/claim link, and wipes all enriched data — Facebook, Instagram, email, and phone line-type — so the enrichment icons return to default. The lead stays in your list; its name, phone, notes, status, tracking and history are kept. This can't be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleResetToFreshSelected}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Reset to fresh
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPushInstantlyOpen(true)}
                      className="bg-background text-xs h-8 text-sky-600 hover:text-sky-600"
                      title="Push the selected leads (those with an email) into an Instantly.ai email campaign."
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Push to Instantly
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCsv('crm')}
                className="bg-background text-xs h-8"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Export </span>CSV
              </Button>
              {/* Import button */}
              {!readOnly && onImportLeads && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportDialog(true)}
                  className="bg-background text-xs h-8"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
              )}
            </div>
          </div>
          
          {/* Filters row */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[120px] max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                defaultValue={searchQuery}
                onChange={(e) => {
                  debouncedSearch(e.target.value);
                }}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
            <div className="relative flex-1 min-w-[120px] max-w-[200px]">
              <Input
                placeholder="City, postcode, area..."
                defaultValue={locationFilter}
                onChange={(e) => {
                  debouncedLocation(e.target.value);
                }}
                className="h-8 text-xs bg-background pr-7"
              />
              {locationFilter && (
                <button
                  onClick={() => { setLocationFilter(''); setCurrentPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as LeadStatus | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] sm:w-[140px] bg-background h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {OUTREACH_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={countryFilter}
              onValueChange={(v) => {
                setCountryFilter(v as Country | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[90px] sm:w-[100px] bg-background h-8 text-xs">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="UK">🇬🇧 UK</SelectItem>
                <SelectItem value="AUS">🇦🇺 AUS</SelectItem>
              </SelectContent>
            </Select>
            {/* Interested filter toggle — show only leads with status 'interested' */}
            <Button
              variant={trackedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setTrackedOnly((v) => !v); setCurrentPage(1); }}
              className={cn('h-8 text-xs', !trackedOnly && 'bg-background')}
              title="Show only interested leads"
            >
              <Star className={cn('h-3.5 w-3.5 mr-1.5', trackedOnly && 'fill-current')} />
              Interested
            </Button>
            {/* Contact / signal filters — collapsed into one dropdown. All AND-combined
                (unchanged); the trigger shows the active count. */}
            {(() => {
              const activeFilterCount =
                [hasEmail, hasInstagram, hasFacebook, hasWhatsApp, hideNoWhatsApp, sigWebsite, sigFacebook, sigInstagram].filter(Boolean).length;
              const toggle = (setter: (updater: (prev: boolean) => boolean) => void) => () => {
                setter((v) => !v);
                setCurrentPage(1);
              };
              const clearAll = () => {
                setHasEmail(false); setHasInstagram(false); setHasFacebook(false); setHasWhatsApp(false);
                setHideNoWhatsApp(false);
                setSigWebsite(false); setSigFacebook(false); setSigInstagram(false);
                setCurrentPage(1);
              };
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={activeFilterCount > 0 ? 'default' : 'outline'}
                      size="sm"
                      className={cn('h-8 text-xs', activeFilterCount === 0 && 'bg-background')}
                      title="Filter by contact details and listing signals"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                      Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Has contact detail</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={hasEmail} onCheckedChange={toggle(setHasEmail)} onSelect={(e) => e.preventDefault()}>
                      <Mail className="h-3.5 w-3.5 mr-2" /> Email
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={hasInstagram} onCheckedChange={toggle(setHasInstagram)} onSelect={(e) => e.preventDefault()}>
                      <Instagram className="h-3.5 w-3.5 mr-2" /> Instagram
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={hasFacebook} onCheckedChange={toggle(setHasFacebook)} onSelect={(e) => e.preventDefault()}>
                      <Facebook className="h-3.5 w-3.5 mr-2" /> Facebook
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={hasWhatsApp} onCheckedChange={toggle(setHasWhatsApp)} onSelect={(e) => e.preventDefault()}>
                      <Smartphone className="h-3.5 w-3.5 mr-2" /> WhatsApp-capable
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Hide</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={hideNoWhatsApp} onCheckedChange={toggle(setHideNoWhatsApp)} onSelect={(e) => e.preventDefault()}>
                      <PhoneOff className="h-3.5 w-3.5 mr-2" /> Hide no-WhatsApp
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Listing signal (not verified)</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={sigWebsite} onCheckedChange={toggle(setSigWebsite)} onSelect={(e) => e.preventDefault()}>
                      <Globe className="h-3.5 w-3.5 mr-2" /> Has own website
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={sigFacebook} onCheckedChange={toggle(setSigFacebook)} onSelect={(e) => e.preventDefault()}>
                      <Facebook className="h-3.5 w-3.5 mr-2" /> FB (listing)
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={sigInstagram} onCheckedChange={toggle(setSigInstagram)} onSelect={(e) => e.preventDefault()}>
                      <Instagram className="h-3.5 w-3.5 mr-2" /> IG (listing)
                    </DropdownMenuCheckboxItem>
                    {activeFilterCount > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={clearAll} className="justify-center text-xs text-muted-foreground">
                          Clear filters
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })()}
            {(hasEmail || hasInstagram || hasFacebook || hasWhatsApp || hideNoWhatsApp || sigWebsite || sigFacebook || sigInstagram) && (
              <span className="self-center text-xs text-muted-foreground whitespace-nowrap" title="Leads matching all active filters">
                {filteredAndSortedLeads.length} match
              </span>
            )}
            {/* Sort — status / date added / due date / tracked-first */}
            <Select
              value={`${sortField}:${sortDirection}`}
              onValueChange={(v) => {
                const [field, dir] = v.split(':') as [SortField, SortDirection];
                setSortField(field);
                setSortDirection(dir);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[130px] sm:w-[150px] bg-background h-8 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tracked:asc">Tracked first</SelectItem>
                <SelectItem value="created_at:desc">Newest added</SelectItem>
                <SelectItem value="created_at:asc">Oldest added</SelectItem>
                <SelectItem value="next_action_date:asc">Due date</SelectItem>
                <SelectItem value="status:asc">Status</SelectItem>
                <SelectItem value="business_name:asc">A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile Card View */}
        {isMobile ? (
          <div>
            {paginatedLeads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {leads.length === 0
                  ? isArchiveView 
                    ? 'No archived leads yet.'
                    : 'No leads yet. Add from search.'
                  : 'No leads match filters.'}
              </div>
            ) : (
              paginatedLeads.map((lead) => (
                <OutreachMobileCard
                  key={lead.id}
                  lead={lead}
                  campaignName={showCampaignName && lead.campaign_id ? (campaignNameByLead?.[lead.id] ?? null) : null}
                  isSelected={selectedIds.has(lead.id)}
                  onSelect={(checked) => handleSelectOne(lead.id, checked as boolean)}
                  onLeadClick={() => { onLeadClick(lead); setDetailLead(lead); }}
                  onStatusChange={(status) => onStatusChange(lead.id, status)}
                  onNextActionChange={(action, date) => onNextActionChange(lead.id, action, date)}
                  onContactMethodChange={onContactMethodChange ? (method) => onContactMethodChange(lead.id, method) : undefined}
                onPipelineStatusChange={onPipelineStatusChange ? (status) => {
                    // Clear optimistic override so manual change isn't blocked
                    setOptimisticUpdates(prev => { const next = new Map(prev); next.delete(lead.id); return next; });
                    onPipelineStatusChange(lead.id, status);
                  } : undefined}
                  onWhatsAppClick={() => handleWhatsAppClick(lead)}
                  onSMSClick={() => handleSMSClick(lead)}
                  onCallClick={() => handleCallClick(lead)}
                  onTrack={onMarkAsInterested ? () => onMarkAsInterested([lead.id]) : undefined}
                  onAutoTrack={onMarkAsInterested ? () => onMarkAsInterested([lead.id]) : undefined}
                  readOnly={readOnly}
                  showTrackButton={!!onMarkAsInterested}
                  isHighlighted={lastContactedLeadId === lead.id}
                  isLastContacted={lastContactedLeadId === lead.id || walkthroughTrackLeadId === lead.id}
                  onCompleteAction={() => onNextActionChange(lead.id, 'none' as NextActionType)}
                  phoneFetchStatus={phoneFetchStatus[lead.id]}
                  onRetryPhoneFetch={() => onRetryPhoneFetch?.(lead.id)}
                  isWalkthroughContacted={walkthroughContactedIds.has(lead.id)}
                  onUpdateLead={onUpdateLead && !isDemoLead(lead.id) ? onUpdateLead : undefined}
                  onGenerateSite={!sitesByLead[lead.id] ? (template, mode) => handleGenerateSite(lead, template, mode) : undefined}
                  isGeneratingSite={isRowGenerating(lead.id)}
                  onManageSite={sitesByLead[lead.id] ? () => navigate(isAdmin ? `/admin/sites/${sitesByLead[lead.id].id}` : `/sites/${sitesByLead[lead.id].id}`) : undefined}
                  onManageAudit={(() => { const a = auditsByLead[lead.id]; return a && (a.status === 'complete' || a.status === 'capped') ? () => navigate(`/ai-audit?runId=${a.runId}`) : undefined; })()}
                  auditRunning={(() => { const a = auditsByLead[lead.id]; return !!a && (a.status === 'pending' || a.status === 'running'); })()}
                  onRunAudit={(() => { const a = auditsByLead[lead.id]; return a && (a.status === 'complete' || a.status === 'capped' || a.status === 'pending' || a.status === 'running') ? undefined : () => navigate(`/ai-audit?leadId=${lead.id}`); })()}
                  
                />
              ))
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[40px] sm:w-[50px]">
                    <Checkbox
                      checked={selectedIds.size === filteredAndSortedLeads.length && filteredAndSortedLeads.length > 0}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[150px] sm:w-[250px]">Business</TableHead>
                  <TableHead className="min-w-[120px] sm:w-[150px]">Phone</TableHead>
                  {!readOnly && (
                    <>
                      <TableHead className="min-w-[100px] sm:w-[120px]">Contact</TableHead>
                      <TableHead className="min-w-[100px] sm:w-[140px]">Status</TableHead>
                      <TableHead className="min-w-[140px] sm:w-[180px]">Next Action</TableHead>
                    </>
                  )}
                  <TableHead className="w-[160px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 4 : 7} className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
                      {leads.length === 0
                        ? isArchiveView 
                          ? 'No archived leads yet.'
                          : 'No leads yet. Add from search.'
                        : 'No leads match filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className={`border-border/50 cursor-pointer hover:bg-muted/30 ${
                        lead.status === 'interested' ? 'bg-primary/5' : ''
                      } ${lastContactedLeadId === lead.id ? 'ring-1 ring-primary/30 ring-inset bg-primary/5' : ''}`}
                      onClick={() => { onLeadClick(lead); setDetailLead(lead); }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={(checked) => handleSelectOne(lead.id, checked as boolean)}
                          aria-label={`Select ${lead.business_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 min-w-0">
                          {lead.country === 'Australia' && (
                            <span className="text-xs" title="Australia">🇦🇺</span>
                          )}
                          {/* Wrap a long name within a bounded width so the row grows
                              but the columns to its right stay aligned (matches LeadsTable). */}
                          <span className="min-w-0 break-words max-w-[200px]">{lead.business_name}</span>
                          {lead.status === 'interested' && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          )}
                          {!!lead.notes && lead.notes.trim().length > 0 && (
                            <StickyNote className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" title="Has a note" />
                          )}
                          {isTestBarberLead(lead.id) && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleResetTestBarber(); }}
                              disabled={resettingTestBarber}
                              title="Reset this TEST barber to a fresh, unclaimed state"
                              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-400"
                            >
                              {resettingTestBarber
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Reset test
                            </button>
                          )}
                          <WhatsAppStatusBadge status={lead.whatsapp_status} />
                          {/* Site claim/upsell funnel (admin) — from generated_sites tracking */}
                          {(() => {
                            const f = sitesByLead[lead.id];
                            if (!f) return null;
                            const pill = 'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border-transparent';
                            return (
                              <span className="flex items-center gap-1">
                                {f.opened && <span className={`${pill} bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))]`} title="Opened the site link">Opened</span>}
                                {f.claimed && <span className={`${pill} bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))]`} title="Claimed the free site">Claimed</span>}
                                {f.addon && <span className={`${pill} bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))]`} title="Requested the booking + SMS add-on">Upsell</span>}
                              </span>
                            );
                          })()}
                        </div>
                        {/* Muted campaign sub-line — only in the All-campaigns view when
                            the lead belongs to a campaign (parent gates via showCampaignName). */}
                        {showCampaignName && lead.campaign_id && campaignNameByLead?.[lead.id] && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {campaignNameByLead[lead.id]}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-primary hover:underline flex items-center gap-1.5 text-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-mono">{lead.phone}</span>
                            </a>
                            {isPhoneCopied(lead.id) && (
                              <span title="Copied">
                                <CheckCheck className="h-3.5 w-3.5 text-primary" />
                              </span>
                            )}
                          </div>
                        ) : phoneFetchStatus[lead.id] === 'failed' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onRetryPhoneFetch?.(lead.id); }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        ) : phoneFetchStatus[lead.id] === 'no_phone' ? (
                          <span className="text-muted-foreground text-xs">No phone listed</span>
                        ) : phoneFetchStatus[lead.id] === 'pending' ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Fetching…</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No phone listed</span>
                        )}
                      </TableCell>
                      {!readOnly && (
                        <>
                          {/* Contact Method column */}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {onContactMethodChange ? (
                              <Select
                                value={lead.contact_method || ''}
                                onValueChange={(v) => {
                                  onContactMethodChange(lead.id, v as ContactMethod);
                                }}
                              >
                                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0" {...(lastContactedLeadId === lead.id ? { 'data-walkthrough-step': 'contact-method', 'data-walkthrough': 'contact-method' } : {})}>
                                  <ContactMethodBadge method={lead.contact_method as ContactMethod} />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONTACT_METHOD_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <ContactMethodBadge method={lead.contact_method as ContactMethod} />
                            )}
                          </TableCell>
                          {/* Pipeline Status column */}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {onPipelineStatusChange ? (
                              <PipelineStatusSelect
                                value={lead.status}
                                triggerProps={lastContactedLeadId === lead.id ? { 'data-walkthrough-step': 'pipeline-status', 'data-walkthrough': 'pipeline-status' } : undefined}
                                onValueChange={(status) => {
                                  // Clear optimistic override so manual change isn't blocked
                                  setOptimisticUpdates(prev => { const next = new Map(prev); next.delete(lead.id); return next; });
                                  onPipelineStatusChange(lead.id, status);
                                  if (status === 'interested' && onMarkAsInterested && !lead.is_potential_work) {
                                    onMarkAsInterested([lead.id]);
                                  }
                                }}
                              />
                            ) : (
                              <PipelineStatusBadge status={lead.status as PipelineStatus} />
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <NextActionEditor
                              action={lead.next_action}
                              date={lead.next_action_date}
                              onUpdate={(action, date) => onNextActionChange(lead.id, action, date)}
                              leadId={lead.id}
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {/* Action icons in a fixed 5-per-row grid: every icon is an
                            individual grid item (the enrich group and the SMS/WhatsApp
                            pair are flattened), so 9 icons wrap as 5 + 4, not uneven rows. */}
                        <div className="mx-auto grid w-fit [grid-template-columns:repeat(5,auto)] place-items-center gap-1">
                          {(lead.google_maps_url || ((lead as any).place_id ? `https://www.google.com/maps/place/?q=place_id:${(lead as any).place_id}` : null)) && (
                            <a
                              href={lead.google_maps_url || `https://www.google.com/maps/place/?q=place_id:${(lead as any).place_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-500 hover:text-blue-400 transition-colors"
                              title="View on Google Maps"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {onUpdateLead && !isDemoLead(lead.id) && (
                            <LeadEnrichButtons lead={lead} onUpdate={onUpdateLead} className="contents" />
                          )}
                          {lead.phone ? (
                            <>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="p-1.5 rounded-md hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 transition-colors"
                                    title="Call options"
                                  >
                                    <Phone className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="min-w-[160px]">
                                  <DropdownMenuItem asChild>
                                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer" onClick={() => handleCallClick(lead)}>
                                      <PhoneCall className="h-4 w-4" />
                                      Normal Call
                                    </a>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 cursor-pointer"
                                      onClick={() => handleCallClick(lead)}
                                    >
                                      <Phone className="h-4 w-4 text-green-500" />
                                      WhatsApp Call
                                    </a>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <button
                                onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'sms' } })); handleSMSClick(lead); }}
                                className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 transition-colors"
                                title="Send SMS"
                                data-walkthrough={lead.outreach_attempts === 0 && !walkthroughContactedIds.has(lead.id) ? 'contact' : undefined}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'whatsapp' } })); handleWhatsAppClick(lead); }}
                                className="p-1.5 rounded-md hover:bg-green-500/10 text-green-500 hover:text-green-400 transition-colors"
                                title="Send WhatsApp message"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                            </>
                          ) : phoneFetchStatus[lead.id] === 'pending' ? (
                            <span className="text-muted-foreground text-xs flex items-center gap-1">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            </span>
                          ) : phoneFetchStatus[lead.id] === 'failed' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); onRetryPhoneFetch?.(lead.id); }}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          ) : null}
                          {(
                            sitesByLead[lead.id] ? (
                              <button
                                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                                title="Manage site"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate(isAdmin ? `/admin/sites/${sitesByLead[lead.id].id}` : `/sites/${sitesByLead[lead.id].id}`);
                                }}
                              >
                                <Settings2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="p-1.5 rounded-md text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-colors disabled:opacity-50"
                                    title={isRowGenerating(lead.id) ? 'Building…' : 'Generate site'}
                                    disabled={isRowGenerating(lead.id)}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  >
                                    {isRowGenerating(lead.id) ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Wand2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="min-w-[160px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Full site</DropdownMenuLabel>
                                  <DropdownMenuItem onSelect={() => handleGenerateSite(lead, 'barber')}>
                                    <Scissors className="h-4 w-4 mr-2" />
                                    Barber site
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => handleGenerateSite(lead, 'salon')}>
                                    <Flower2 className="h-4 w-4 mr-2" />
                                    Salon site
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => handleGenerateSite(lead, 'plumber')}>
                                    <Wrench className="h-4 w-4 mr-2" />
                                    Plumber site
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Booking page (has a website)</DropdownMenuLabel>
                                  <DropdownMenuItem onSelect={() => handleGenerateSite(lead, 'barber', 'booking_only')}>
                                    <CalendarClock className="h-4 w-4 mr-2" />
                                    Barber booking page
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => handleGenerateSite(lead, 'salon', 'booking_only')}>
                                    <CalendarClock className="h-4 w-4 mr-2" />
                                    Salon booking page
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          )}
                          {/* AI audit control — mirrors the site button. Reads auditsByLead[lead.id]:
                              complete/capped → Manage audit; pending/running → Running…; else (incl.
                              failed → re-runnable) → Run audit. Deep-links to the audit page. */}
                          {(() => {
                            const a = auditsByLead[lead.id];
                            if (a && (a.status === 'complete' || a.status === 'capped')) {
                              return (
                                <button
                                  className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                                  title="Manage audit"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/ai-audit?runId=${a.runId}`); }}
                                >
                                  <ClipboardList className="h-4 w-4" />
                                </button>
                              );
                            }
                            if (a && (a.status === 'pending' || a.status === 'running')) {
                              return (
                                <button
                                  className="p-1.5 rounded-md text-muted-foreground/70 cursor-default disabled:opacity-100"
                                  title="Audit running"
                                  disabled
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                >
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </button>
                              );
                            }
                            return (
                              <button
                                className="p-1.5 rounded-md text-sky-400 hover:bg-sky-500/10 hover:text-sky-300 transition-colors"
                                title="Run AI audit"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/ai-audit?leadId=${lead.id}`); }}
                              >
                                <ClipboardList className="h-4 w-4" />
                              </button>
                            );
                          })()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedLeads.length)} of{' '}
              {filteredAndSortedLeads.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Page selector dropdown */}
              <Select
                value={String(currentPage)}
                onValueChange={(v) => setCurrentPage(Number(v))}
              >
                <SelectTrigger className="w-[80px] h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] bg-background">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <SelectItem key={page} value={String(page)}>
                      Page {page}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">of {totalPages}</span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>


      {/* CSV Import Dialog */}
      {onImportLeads && (
        <CSVImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          onImport={onImportLeads}
          existingLeads={leads}
        />
      )}

      {/* Bulk site-gen template picker — choose the template applied to the batch. */}
      <Dialog open={siteGenDialogOpen} onOpenChange={setSiteGenDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Generate {siteGenEligibleIds.length} site{siteGenEligibleIds.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription className="text-xs">
              Choose the template — it’s applied to every selected lead. ~$0.03 each
              (~${(siteGenEligibleIds.length * 0.03).toFixed(2)} total)
              {selectedIds.size - siteGenEligibleIds.length > 0 && ` · ${selectedIds.size - siteGenEligibleIds.length} skipped (already have a site)`}.
              Capped at 40 sites/24h + $10/day. Runs server-side — safe to leave this page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <Select value={siteGenChoice} onValueChange={setSiteGenChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BULK_SITE_GEN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSiteGenDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmBulkSiteGen} disabled={bulkJobActive || !siteGenEligibleIds.length}>
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Generate {siteGenEligibleIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk "Queue WhatsApp" template picker — choose the template at queue-time. */}
      <Dialog open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Queue {selectedIds.size} for WhatsApp</DialogTitle>
            <DialogDescription className="text-xs">
              Choose the approved template to send. It’s applied to all selected leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <Select value={queueTemplate} onValueChange={setQueueTemplate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setQueueDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => handleQueueForWhatsApp(queueTemplate)}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Queue {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Template Dialog */}
      <SingleWhatsAppDialog
        open={!!whatsappDialogLead}
        onOpenChange={(open) => {
          if (!open) {
            setWhatsappDialogLead(null);
            setLaunchTemplate(null);
            setLaunchLink(null);
            window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
          }
        }}
        lead={whatsappDialogLead}
        initialTemplate={launchTemplate}
        shareLink={launchLink}
        onSent={handleDialogSent}
        onAiOpener={isAdmin && whatsappDialogLead ? () => {
          setAiOpenerLead(whatsappDialogLead);
        } : undefined}
      />

      {/* SMS Template Dialog */}
      <SingleSMSDialog
        open={!!smsDialogLead}
        onOpenChange={(open) => {
          if (!open) {
            setSmsDialogLead(null);
            setLaunchTemplate(null);
            setLaunchLink(null);
            window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
          }
        }}
        lead={smsDialogLead}
        initialTemplate={launchTemplate}
        shareLink={launchLink}
        onSent={handleDialogSent}
        onAiOpener={isAdmin && smsDialogLead ? () => {
          setAiOpenerLead(smsDialogLead);
        } : undefined}
      />

      {/* Push selected leads into an Instantly.ai email campaign */}
      <PushToInstantlyDialog
        open={pushInstantlyOpen}
        onOpenChange={setPushInstantlyOpen}
        leadIds={Array.from(selectedIds)}
        onPushed={() => { onRefreshLeads?.(); setSelectedIds(new Set()); }}
      />

      {/* Lead detail modal (Track Leads fold-in) — opened on row click */}
      <LeadDetailDialog
        open={!!detailLead}
        onOpenChange={(open) => { if (!open) setDetailLead(null); }}
        lead={detailLead}
        onStatusChange={onStatusChange}
        onNextActionChange={onNextActionChange}
        onUpdateLead={onUpdateLead ?? (() => Promise.resolve(null))}
        onNotesChange={onNotesChange}
        onBusinessNameChange={onBusinessNameChange}
        onImageChange={onImageChange}
        fetchActivities={fetchActivities}
        userId={user?.id}
        campaignDefaultSaleType={detailLead && campaignDefaultSaleTypeByLead ? campaignDefaultSaleTypeByLead[detailLead.id] ?? null : null}
      />

      {/* Admin AI Opener Modal */}
      {isAdmin && (
        <AiOpenerModal
          lead={aiOpenerLead}
          open={!!aiOpenerLead}
          onOpenChange={(open) => { if (!open) setAiOpenerLead(null); }}
          onSelectMessage={(msg) => {
            window.dispatchEvent(new CustomEvent('ai-opener-selected', { detail: { message: msg } }));
          }}
        />
      )}
    </Card>
  );
}
