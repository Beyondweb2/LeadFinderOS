import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import type { PhoneFetchStatus } from '@/hooks/useOutreach';
import { isAggregatorUrl } from '@/lib/aggregators';
/* MEASURED audit costs, shared with the market panel and the audit page so no screen quotes a
   different figure. See CLAUDE.md section 8 — these came from actor_cost_usd, not a constant. */
import { AUDIT_EST_USD_PER_QUESTION, SEO_SCAN_USD } from '@/lib/marketView';
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
  ClipboardCheck,
  Download,
  Trash2,
  RotateCcw,
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
  Upload,
  Eye,
  PhoneOff,
  ThumbsDown,
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
  MapPin,
  Tag,
  Users,
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
import { townGated } from '@/lib/townVerdict';
import { Badge } from '@/components/ui/badge';
import { OutreachMobileCard } from './OutreachMobileCard';
import { LeadEnrichButtons } from './LeadEnrichButtons';
import { LeadDetailDialog } from './LeadDetailDialog';
import { isDemoLead } from '@/lib/demoLeads';
import { cn } from '@/lib/utils';
import type { OutreachLead, LeadStatus, NextActionType, Country, ContactMethod, PipelineStatus } from '@/types/outreach';
import { leadStatusLabel } from '@/types/outreach';
import { NEXT_ACTION_OPTIONS, OUTREACH_STATUS_OPTIONS, OUTREACH_STATUS_FILTER_OPTIONS, statusesForFilter, canonicalFilterValue, isPaidFilterValue, CONTACT_METHOD_OPTIONS, PIPELINE_STATUS_OPTIONS, WHATSAPP_TEMPLATES, PRODUCT_OPTIONS, PRODUCT_UNDECIDED, productOf, sharedPhoneLeadIds, type ProductValue, type StatusFilterValue } from '@/types/outreach';
import { isPaidLead } from '@/lib/leadPayment';
import { useApifyUsage } from '@/hooks/useApifyUsage';
import {
  splitAlreadyAudited, oldestFirst, estimateBatchCost, budgetVerdict, monthlyRemainingUsd,
  resolveTake,
} from '@/lib/auditBatchPlan';

/* ⛔ MIRRORS bulk-jobs' JOB_CAPS.audit. Stated here because the SPA cannot import an edge module —
   and the dialog must be able to SAY "that is over the cap" before the press, since bulk-jobs
   REFUSES a create above it rather than slicing. Change one, change the other. */
const AUDIT_JOB_CAP = 100;
/* ⛔ MIRRORS process-ai-audit-queue's DAILY_CAP_USD — the rolling-24h Apify ceiling per user, and
   the limit a big batch actually meets first (the monthly cap is far larger). NOT changed here and
   not changeable from here; this is the figure the warning is measured against. */
const AUDIT_DAILY_CAP_USD = 12.0;
import { SingleWhatsAppDialog } from '@/components/SingleWhatsAppDialog';
import { CampaignPicker } from '@/components/CampaignPicker';
import { TRADES } from '@/lib/trades';
import { AiOpenerModal } from '@/components/AiOpenerModal';
import { useSubscription } from '@/hooks/useSubscription';
import { useOutreachFindEmails, CRAWLABLE_STATUSES_DEFAULT, CRAWL_STATUS_OPTIONS } from '@/hooks/useOutreachFindEmails';
import { crawlButtonLabel } from '@/lib/crawlBatch';
import { isColdOutreachTemplate } from '@/lib/coldOutreach';

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
  onContactGated?: (channel: 'call' | 'whatsapp', leadId?: string) => boolean;
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
    channel: 'whatsapp' | 'call' | 'open';
    templateContent?: string | null;
    shareLink?: string | null;
  } | null;
  /** Called once a launchIntent has been acted on, so the parent can clear it. */
  onLaunchConsumed?: () => void;
  /** Create a server-side bulk job (enrich / site_gen / audit) for the given lead ids.
   *  Runs in the bulk-jobs edge function — survives leaving the page. */
  onBulkJob?: (type: 'enrich' | 'audit', leadIds: string[], params?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** True while a bulk job is queued/running (or being created) — disables new ones. */
  bulkJobActive?: boolean;
  /** Bulk-move the selected leads to a campaign (null = "No campaign"). Single
   *  batched write, owner-RLS scoped. Demo leads are filtered by the caller. */
  onAssignCampaign?: (leadIds: string[], campaignId: string | null) => Promise<boolean> | void;
}

const ITEMS_PER_PAGE_DESKTOP = 15;
const ITEMS_PER_PAGE_MOBILE = 10;


/* Don't chase an opener sooner than this. ⛔ MUST match CONTACT_FOLLOWUP_MIN_DAYS in
   supabase/functions/_shared/contact-followup-eligibility.ts — the server re-verifies with the same
   window, so a mismatch would let the UI queue leads the drainer then silently de-queues. */
const CONTACT_FOLLOWUP_MIN_DAYS = 3;

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
  onAssignCampaign,
}: OutreachTableProps) {
  const { toast } = useToast();
  const { isPhoneCopied, markMultipleAsCopied } = useCopiedPhones();
  const isMobile = useIsMobile();
  const ITEMS_PER_PAGE = isMobile ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP;
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const [aiOpenerLead, setAiOpenerLead] = useState<OutreachLead | null>(null);
  // Bulk AI-audit question-count + cost-confirm dialog. Count range mirrors the server's
  // HARD 3..5 clamp (default 3) — unified across wizard/bulk/auto-chain.
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [auditQuestionCount, setAuditQuestionCount] = useState<number>(3);
  /* How many to audit THIS run. Empty string = "all eligible" — a blank box must not read as 0 and
     silently disable the button. Held as a string so the input can be cleared while typing. */
  const [auditTakeInput, setAuditTakeInput] = useState<string>('');
  /* OFF by default: a business with no website is a different product with a different opening, and
     auditing one buys an answer we already know — Gemini cannot name a business it has nothing of to
     read (measured: MK Plumbing, 0/10 on Gemini). Overridable, because the ChatGPT-via-directories
     number is occasionally worth having. NEVER silent: the count and the saving are both stated. */
  const [auditIncludeNoWebsite, setAuditIncludeNoWebsite] = useState(false);
  // Per-lead LATEST audit state (mirrors sitesByLead) — drives the upcoming "Run audit" /
  // "Manage" row control. Keyed by lead_id, newest audit first; each entry carries that
  // audit's latest run + its status (pending|running|complete|capped|failed).
  const [auditsByLead, setAuditsByLead] = useState<Record<string, { auditId: string; runId: string; status: string }>>({});
  const navigate = useNavigate();



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
  /* StatusFilterValue, not LeadStatus: the list also carries the Paid sentinel, which is not a
     status (see OUTREACH_STATUS_FILTER_OPTIONS — paid means amount_paid > 0, not payment_received). */
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue | 'all'>('all');
  /* Product is HOW THE PAGE IS CONFIGURED, so it persists like the other filters rather than
     living in the URL (the app-wide rule: the URL is for what you are looking at). */
  const [productFilter, setProductFilter] = useState<ProductValue | typeof PRODUCT_UNDECIDED | 'all'>('all');
  const [productBusy, setProductBusy] = useState(false);
  /* Off by default: it is a warning about a minority, not a lens Paul works through. */
  const [sharedPhoneOnly, setSharedPhoneOnly] = useState(false);
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
  // Hide leads marked NOT INTERESTED (status='not_interested') — same durable hygiene
  // preference, persisted alongside hideNoWhatsApp so dead leads stay out of the list.
  const [hideNotInterested, setHideNotInterested] = useState(false);
  // Listing-level signal filters — free (derived from stored website), not verified.
  const [sigWebsite, setSigWebsite] = useState(false);
  /* ⛔ THE INVERSE OF sigWebsite, AND IT IS NOT REDUNDANT. "Has own website" off is not the same
     as "has none" — off means the filter is not applied at all. Without this there is no way to
     SELECT the no-website leads, which is exactly the pile Paul needs to bulk-set to
     product=no_website (68 of them replied before the auto-verdict existed, so nothing will ever
     reach them automatically). */
  const [sigNoWebsite, setSigNoWebsite] = useState(false);
  const [sigFacebook, setSigFacebook] = useState(false);
  const [sigInstagram, setSigInstagram] = useState(false);
  // Lead-detail modal (Track Leads fold-in) — opened on row click.
  const [detailLead, setDetailLead] = useState<OutreachLead | null>(null);
  /* ⛔ KEEP THE OPEN DETAIL DIALOG POINTED AT THE LIVE LEAD ROW, NOT A FROZEN SNAPSHOT (fixed
     2026-08-18). `detailLead` was set once on row click and never tracked `leads`, so an edit made
     inside the dialog — a delivery-checklist tick especially — neither showed nor ACCUMULATED:
     each toggle spread the stale open-time copy, so every tick silently overwrote the last (RG's
     row ended up with only {remeasure:true}). updateLead replaces the row object in `leads`, so
     re-selecting it by id here picks up every change and the cockpit re-renders fresh. (The Inbox
     mount never had this — it derives the lead from a live leads.find.) */
  useEffect(() => {
    setDetailLead((prev) => (prev ? (leads.find((l) => l.id === prev.id) ?? prev) : prev));
  }, [leads]);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /* Bumped whenever filter STATE is written from outside the inputs (the restore-on-mount effect,
     and Clear all). The search/location inputs are UNCONTROLLED (defaultValue + debounce, for typing
     performance), so a restored or cleared value would otherwise apply to the table while the box
     kept showing its old text — an invisible filter, which reads as "my leads vanished". Keying the
     inputs on this stamp remounts them with the current value. */
  const [filterInputStamp, setFilterInputStamp] = useState(0);
  const [isRecoveringPhones, setIsRecoveringPhones] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<{ current: number; total: number } | null>(null);
  const { logAttempt } = useOutreachAttempt();
  const [showImportDialog, setShowImportDialog] = useState(false);
  // "Reset to fresh" confirm (destructive — deletes the site + wipes enrichment).
  const [resetFreshOpen, setResetFreshOpen] = useState(false);
  // Bulk WhatsApp-queue template picker (chosen at queue-time).
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  /* Unselected by default. This pre-selected WHATSAPP_TEMPLATES[0] = booking_page_intro, the barber
     booking pitch, and line ~2428 applies the choice to EVERY selected lead — so bulk-queueing a
     batch of accountants without touching the dropdown stamped a barber template on all of them.
     Same class of bug as the Inbox picker; '' means not set and the Queue button stays disabled. */
  const [queueTemplate, setQueueTemplate] = useState<string>('');
  const [lastContactedLeadId, setLastContactedLeadId] = useState<string | null>(null);
  // Dialog state for the WhatsApp template page
  const [whatsappDialogLead, setWhatsappDialogLead] = useState<OutreachLead | null>(null);
  // Launch-pad: template + /s/ link injected into the composer for THIS launch only
  // (cleared on dialog close so a later manual open behaves normally).
  const [launchTemplate, setLaunchTemplate] = useState<string | null>(null);
  const [launchLink, setLaunchLink] = useState<string | null>(null);
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
    onPersisted: useCallback((leadId: string, _channel: 'whatsapp' | 'call') => {
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
    /* Normalised onto the filter list: a state saved before the no-WhatsApp options merged may hold
       'no_whatsapp_needs_sms', which is no longer an option's own value. Without this the Select
       would render blank while still filtering — the control disagreeing with the table. */
    if (parsed.productFilter) setProductFilter(parsed.productFilter);
    if (parsed.statusFilter) {
      setStatusFilter(parsed.statusFilter === 'all' ? 'all' : canonicalFilterValue(parsed.statusFilter as StatusFilterValue));
    }
    if (parsed.countryFilter) setCountryFilter(parsed.countryFilter);
    if (typeof parsed.trackedOnly === 'boolean') setTrackedOnly(parsed.trackedOnly);
    if (typeof parsed.hideNoWhatsApp === 'boolean') setHideNoWhatsApp(parsed.hideNoWhatsApp);
    if (typeof parsed.hideNotInterested === 'boolean') setHideNotInterested(parsed.hideNotInterested);
    // Contactability + listing-signal filter toggles (persisted alongside the rest so
    // they don't reset on navigation while the neighbouring filters survive).
    if (typeof parsed.hasEmail === 'boolean') setHasEmail(parsed.hasEmail);
    if (typeof parsed.hasInstagram === 'boolean') setHasInstagram(parsed.hasInstagram);
    if (typeof parsed.hasFacebook === 'boolean') setHasFacebook(parsed.hasFacebook);
    if (typeof parsed.hasWhatsApp === 'boolean') setHasWhatsApp(parsed.hasWhatsApp);
    if (typeof parsed.sigWebsite === 'boolean') setSigWebsite(parsed.sigWebsite);
    if (typeof parsed.sigNoWebsite === 'boolean') setSigNoWebsite(parsed.sigNoWebsite);
    if (typeof parsed.sigFacebook === 'boolean') setSigFacebook(parsed.sigFacebook);
    if (typeof parsed.sigInstagram === 'boolean') setSigInstagram(parsed.sigInstagram);
    if (parsed.sortField) setSortField(parsed.sortField);
    if (parsed.sortDirection) setSortDirection(parsed.sortDirection);
    if (shouldForcePage1) {
      setCurrentPage(1);
    } else if (typeof parsed.currentPage === 'number' && parsed.currentPage > 0) {
      setCurrentPage(parsed.currentPage);
    }
    // Remount the uncontrolled search/location inputs so they DISPLAY the restored values.
    setFilterInputStamp((v) => v + 1);
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
      productFilter,
      countryFilter,
      trackedOnly,
      hideNoWhatsApp,
      hideNotInterested,
      hasEmail,
      hasInstagram,
      hasFacebook,
      hasWhatsApp,
      sigWebsite,
      sigNoWebsite,
      sigFacebook,
      sigInstagram,
      sortField,
      sortDirection,
      currentPage,
    });
  }, [tableStateKey, searchQuery, locationFilter, statusFilter, productFilter, countryFilter, trackedOnly, hideNoWhatsApp, hideNotInterested, hasEmail, hasInstagram, hasFacebook, hasWhatsApp, sigWebsite, sigNoWebsite, sigFacebook, sigInstagram, sortField, sortDirection, currentPage]);

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
        description: `${lead.business_name} not on WhatsApp. Try a call.`,
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

  // Single-row "Generate site": enqueue a DURABLE, server-side site-gen job — the same

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
    if (launchIntent.channel === 'whatsapp') setWhatsappDialogLead(lead);
    else if (launchIntent.channel === 'call') handleCallClick(lead);
    else if (launchIntent.channel === 'open') setDetailLead(lead);
    onLaunchConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchIntent, leads]);

  // Called when user clicks "Open App" in the WhatsApp dialog
  const handleDialogSent = useCallback((leadId: string, channel: 'whatsapp') => {
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


  // Leads eligible for a bulk AI audit: selected, real (non-demo), NOT already audited
  // (auditsByLead — avoids double-spend), and carrying a usable business type + location
  // (search_keyword||category / search_location||address — the audit's inputs, sourced the
  // same way the wizard's pickLead does). Mirrors siteGenEligibleIds.
  const auditSelectedLeads = useMemo(
    () => leads.filter((l) =>
      selectedIds.has(l.id) &&
      !isDemoLead(l.id) &&
      !auditsByLead[l.id] &&
      !!(l.search_keyword || l.category) &&
      !!(l.search_location || l.address)),
    [leads, selectedIds, auditsByLead],
  );
  /* NO WEBSITE = no own site AI can read. isAggregatorUrl is the same classifier search-leads and
     the audit report use, so a Facebook-only listing counts as no website here too — which it is. */
  const auditNoWebsiteLeads = useMemo(
    () => auditSelectedLeads.filter((l) => {
      const w = (l.website ?? '').trim();
      return !w || isAggregatorUrl(w);
    }),
    [auditSelectedLeads],
  );
  const auditEligibleLeads = useMemo(
    () => (auditIncludeNoWebsite
      ? auditSelectedLeads
      : auditSelectedLeads.filter((l) => !auditNoWebsiteLeads.includes(l))),
    [auditSelectedLeads, auditNoWebsiteLeads, auditIncludeNoWebsite],
  );
  const auditEligibleIds = useMemo(() => auditEligibleLeads.map((l) => l.id), [auditEligibleLeads]);
  /* MEASURED CONSTANTS, not invented ones. This read $0.05 a question and $0.02 an SEO scan; the
     measured figures are $0.0125 (ai_audit_runs.actor_cost_usd over 81 runs) and $0.12 (the Apify
     on-page scan). Wrong in BOTH directions — 4x high on questions, 6x low on the scan — which for a
     no-website batch overstated the bill 4x and for a website-heavy one understated the biggest line.
     Imported rather than re-typed so they move with the rest of the app.
     The SEO count uses the SAME own-website test as the eligibility above, because a Facebook page no
     longer triggers a scan (see the has_website fix in bulk-jobs). */
  /* ⚠️ auditCostUsd WAS DELETED HERE (2026-08-30), not left beside its replacement. It priced the
     WHOLE eligible list; the dialog now prices the SLICE that will actually run (auditBatchCost via
     estimateBatchCost). Two cost rules in one component is one autocomplete away from a screen that
     quotes one figure and a press that spends another — the fault the re-audit dialog already had.
     The measured rates it used are unchanged and still imported below. */
  /* ══ THE BATCH PREVIEW ═══════════════════════════════════════════════════════════════════════
     Everything below is DERIVED from data already on screen — no new query, no new endpoint.
     ⛔ THE ELIGIBILITY RULE IS UNTOUCHED. auditEligibleLeads still excludes every lead that holds
     ANY audit, exactly as before; the split is shown so the operator can SEE which of the excluded
     are genuinely done and which merely failed, without changing who gets audited. */
  const { usage: apifyUsage } = useApifyUsage();
  const auditAlreadySplit = useMemo(
    () => splitAlreadyAudited(selectedIds, auditsByLead),
    [selectedIds, auditsByLead],
  );
  /* ⛔ OLDEST-ADDED FIRST, on outreach_leads.created_at. A lead that has sat in the CRM for months
     is audited before one added this morning — otherwise a capped run always serves the newest and
     the backlog never moves. */
  const auditOrdered = useMemo(() => oldestFirst(auditEligibleLeads), [auditEligibleLeads]);
  const auditTake = useMemo(
    () => resolveTake(
      auditTakeInput.trim() === '' ? auditOrdered.length : Number(auditTakeInput),
      auditOrdered.length,
      AUDIT_JOB_CAP,
    ),
    [auditTakeInput, auditOrdered.length],
  );
  /** The leads this press will actually audit — the slice that is priced and sent. */
  const auditBatch = useMemo(() => auditOrdered.slice(0, auditTake.take), [auditOrdered, auditTake.take]);
  const auditBatchCost = useMemo(
    () => estimateBatchCost(
      auditBatch,
      Math.max(3, Math.min(5, auditQuestionCount)),
      { usdPerQuestion: AUDIT_EST_USD_PER_QUESTION, usdPerSeoScan: SEO_SCAN_USD },
      isAggregatorUrl,
    ),
    [auditBatch, auditQuestionCount],
  );
  /* Two budgets, and the DAILY one is what a big batch meets first — it is the rolling-24h Apify
     ceiling in process-ai-audit-queue. Stated as a constant here, not imported: the SPA cannot
     import an edge module, and a wrong-but-visible figure is worse than none, so it is named. */
  const auditDailyVerdict = useMemo(
    () => budgetVerdict(auditBatchCost.totalUsd, AUDIT_DAILY_CAP_USD),
    [auditBatchCost.totalUsd],
  );
  const auditMonthlyVerdict = useMemo(
    () => budgetVerdict(auditBatchCost.totalUsd, monthlyRemainingUsd(apifyUsage)),
    [auditBatchCost.totalUsd, apifyUsage],
  );

  /** What holding the no-website leads back is saving, at the same measured rates. */
  const auditNoWebsiteSavingUsd = useMemo(
    () => auditNoWebsiteLeads.length * Math.max(3, Math.min(5, auditQuestionCount)) * AUDIT_EST_USD_PER_QUESTION,
    [auditNoWebsiteLeads, auditQuestionCount],
  );

  /* ══ THE TWO REPAIRS FOR LEADS ADDED WITHOUT A TRADE OR A TOWN ══════════════════════════════
     168 rows were written with neither, by the sessionStorage fault fixed in LeadSearchContext.
     They are invisible to every audit path, because create-ai-audit needs a business type AND a
     location. The two halves are repaired differently ON PURPOSE:
       TOWN  Google's structured address genuinely knows it. One Essentials call, $0.005.
       TRADE Nothing in a Place Details response reliably says what a UK business SELLS at a tier
             anyone here has verified against a bill, so it is set BY HAND on a selection. The leads
             arrived in homogeneous batches, so this is a handful of presses, not 90.
     ⚠️ Guessing the trade would be worse than leaving it: a wrong business_type produces an audit
     that measures the wrong market and reads as valid. An absent one refuses to run, loudly. */
  const [townFixOpen, setTownFixOpen] = useState(false);
  const [townFixPreview, setTownFixPreview] = useState<{ candidates: number; estimated_usd: number; names: string[] } | null>(null);
  const [townFixBusy, setTownFixBusy] = useState(false);

  /** Leads in the selection that an audit cannot use, so the buttons can say how many they help. */
  /* ⚠️ MUST MATCH backfill-lead-towns' OWN RULE, and it did not: this also excluded any lead with a
     search_location, so the button offered 89 when the real backlog was 112. search_location is the
     town that was SEARCHED, not where the business is — see the eligibility comment in that
     function. The server re-filters regardless, so a mismatch here understates rather than
     overspends, but an understated count is still the button lying about its own job. */
  const missingTownIds = useMemo(
    () => leads.filter((l) => selectedIds.has(l.id) && !isDemoLead(l.id)
      && !(l.address || l.derived_town) && !!l.place_id).map((l) => l.id),
    [leads, selectedIds],
  );
  const missingTradeIds = useMemo(
    () => leads.filter((l) => selectedIds.has(l.id) && !isDemoLead(l.id)
      && !(l.search_keyword || l.category)).map((l) => l.id),
    [leads, selectedIds],
  );

  /* ⛔ "non 2xx error" IS NOT AN ERROR MESSAGE. supabase.functions.invoke throws a
     FunctionsHttpError whose .message is that generic string and whose .context is the actual
     Response — body and all. Reading only .message threw away the server's own explanation, which
     turned a one-line diagnosis into a hunt: the real body said the candidate lookup had failed.
     Same rule as src/lib/auditErrors.ts — when a UI explains a failure, the explanation must be
     derived from the failure. */
  const edgeErrorText = async (error: unknown, data: unknown): Promise<string> => {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const raw = await ctx.text();
        try {
          const j = JSON.parse(raw);
          if (typeof j?.error === "string" && j.error) return `${j.error} (HTTP ${ctx.status})`;
        } catch { /* not JSON — fall through to the raw text, which is still better than nothing */ }
        if (raw.trim()) return `${raw.trim().slice(0, 300)} (HTTP ${ctx.status})`;
      } catch { /* body already consumed or unreadable */ }
    }
    const d = (data as { error?: string } | null)?.error;
    if (typeof d === "string" && d) return d;
    return (error as Error)?.message || "unknown error";
  };

  /** Ask what it would do and what it would cost. Spends nothing. */
  const openTownFix = async () => {
    setTownFixOpen(true);
    setTownFixPreview(null);
    const { data, error } = await supabase.functions.invoke('backfill-lead-towns', {
      body: { lead_ids: Array.from(selectedIds), dry_run: true },
    });
    if (error || !data?.ok) {
      toast({ title: 'Could not check', description: await edgeErrorText(error, data), variant: 'destructive' });
      setTownFixOpen(false);
      return;
    }
    setTownFixPreview({ candidates: data.candidates ?? 0, estimated_usd: data.estimated_usd ?? 0, names: data.names ?? [] });
  };

  const confirmTownFix = async () => {
    setTownFixBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-lead-towns', {
        body: { lead_ids: Array.from(selectedIds) },
      });
      if (error || !data?.ok) throw new Error(await edgeErrorText(error, data));
      /* ⛔ EVERY OUTCOME NAMED, AND THE CAP NAMED LOUDEST. This used to print "89 failed" and a
         spend figure, both wrong: the daily enrichment cost cap had refused every lead before any
         Google call, so nothing failed and nothing was spent. A count with no cause is what sent
         Paul hunting a Google problem that did not exist — and the reasons were in the response all
         along, in data.unresolved, thrown away by this toast. */
      if (data.cap_blocked) {
        toast({
          title: 'Stopped — the daily enrichment budget is used up',
          description: `Nothing was spent and nothing is wrong with these leads. The $2/day cap covers `
            + `all enrichment (audits and SEO scans too), and today's is gone. None of the `
            + `${data.candidates} were looked up — try again tomorrow.`,
          variant: 'destructive',
        });
        return;
      }
      const bits = [`${data.filled} got a town`];
      if (data.no_town) bits.push(`${data.no_town} have no town in their Google address`);
      if (data.failed) bits.push(`${data.failed} failed`);
      /* The server's own reasons, not a recount. First distinct one is enough for a toast. */
      const firstReason = (data.unresolved ?? [])[0]?.reason;
      if (data.failed && firstReason) bits.push(`first reason: ${firstReason}`);
      toast({
        title: `Town backfill: ${data.filled} of ${data.candidates} filled`,
        description: `${bits.join(' · ')} · spent ~$${Number(data.spent_usd ?? 0).toFixed(2)} across `
          + `${data.attempted ?? 0} lookup${(data.attempted ?? 0) === 1 ? '' : 's'} that reached Google`,
        variant: data.filled === 0 ? 'destructive' : undefined,
      });
      setTownFixOpen(false);
      onRefreshLeads?.();
    } catch (e) {
      toast({ title: 'Town backfill failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setTownFixBusy(false);
    }
  };

  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [tradeChoice, setTradeChoice] = useState('');
  const [tradeBusy, setTradeBusy] = useState(false);

  /* ── SET THE PRODUCT ON A SELECTION ────────────────────────────────────────────────────────
     🔴 BULK IS THE POINT, NOT A CONVENIENCE. The pile is 421 leads at report_sent with no
     decision recorded; deciding them one row at a time is the thing that has not happened for
     months. Selecting a screenful and setting one product is what makes the pile workable.
     ⛔ IT WRITES A COLUMN AND SENDS NOTHING. `product` is an operator's note about intent — no
     send path reads it, and Paul's rule when he approved it was that none ever may. */
  const setProductOn = async (ids: string[], value: ProductValue | null) => {
    if (!onUpdateLead || !ids.length) return;
    setProductBusy(true);
    try {
      /* ⚠️ null, not the string "undecided" — clearing a decision must restore ABSENCE, the same
         rule as clearing amount_paid writing null rather than 0. */
      const results = await Promise.allSettled(ids.map((id) => onUpdateLead(id, { product: value } as Partial<OutreachLead>)));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const label = value ? (PRODUCT_OPTIONS.find((o) => o.value === value)?.label ?? value) : 'Undecided';
      toast({
        title: `${label} set on ${okCount} of ${ids.length} lead${ids.length === 1 ? '' : 's'}`,
        description: okCount < ids.length ? `${ids.length - okCount} failed — try again`
          : 'Nothing was sent. This only records which pitch they are for.',
        variant: okCount === 0 ? 'destructive' : undefined,
      });
      setSelectedIds(new Set());
      onRefreshLeads?.();
    } finally {
      setProductBusy(false);
    }
  };

  /* Writes search_keyword, which is what create-ai-audit reads first (search_keyword || category).
     The canonical LABEL is stored rather than the slug, because the stored string is what the audit
     questions and the report print — and trades.ts maps labels back onto the fixed list at read
     time, so grouping still collapses the spellings. */
  const confirmSetTrade = async () => {
    if (!tradeChoice || !onUpdateLead) return;
    setTradeBusy(true);
    try {
      const ids = missingTradeIds.length ? missingTradeIds : Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map((id) => onUpdateLead(id, { search_keyword: tradeChoice })));
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      toast({
        title: `Set trade on ${okCount} of ${ids.length} lead${ids.length === 1 ? '' : 's'}`,
        description: okCount < ids.length ? `${ids.length - okCount} failed — try again` : `They can be audited as “${tradeChoice}” now.`,
        variant: okCount === 0 ? 'destructive' : undefined,
      });
      setTradeDialogOpen(false);
      setSelectedIds(new Set());
      onRefreshLeads?.();
    } finally {
      setTradeBusy(false);
    }
  };

  // Open the question-count + cost-confirm dialog (validates there's something eligible first).
  const handleBulkRunAudit = () => {
    if (!onBulkJob || bulkJobActive) return;
    if (!auditEligibleIds.length) {
      toast({ title: 'Nothing to audit', description: 'Selected leads are already audited or missing a business type / location.' });
      return;
    }
    setAuditDialogOpen(true);
  };

  // Fire the bulk audit: one queued audit per eligible lead, drained by the existing
  // process-ai-audit-queue cron (no direct Apify). Clears the selection on success.
  const confirmBulkAudit = async () => {
    if (!onBulkJob || bulkJobActive) return;
    /* ⛔ THE ORDERED SLICE, not auditEligibleIds. auditBatch is oldest-added first and already cut
       to the typed number and the job cap, so the ids sent are exactly the ones the dialog priced.
       Sending the full eligible list would spend more than the screen said. */
    const ids = auditBatch.map((l) => l.id);
    if (!ids.length) { setAuditDialogOpen(false); return; }
    const q = Math.max(3, Math.min(5, auditQuestionCount));
    const res = await onBulkJob('audit', ids, { question_count: q });
    if (res.ok) {
      toast({ title: `Bulk audit started (${ids.length} lead${ids.length === 1 ? '' : 's'} × ${q}q)`, description: 'Enqueuing server-side — audits drain through the queue. Safe to leave this page.' });
      setSelectedIds(new Set());
      setAuditDialogOpen(false);
    } else {
      toast({ title: 'Could not start bulk audit', description: res.error, variant: 'destructive' });
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
  /* Bulk-queue the OPENER follow-up (contact_followup) for Contacted businesses that never replied.
     Its own lane — sets contact_followup_queued_at, leaves the status pill alone. Only leads
     contacted 3+ days ago are queued; everything held back is reported with a count, nothing is
     silently dropped. The server (contactFollowupEligible) re-verifies each at send time. */
  const handleQueueContactFollowup = async () => {
    if (selectedIds.size === 0 || !onUpdateLead) return;
    const now = new Date().toISOString();
    const cutoff = Date.now() - CONTACT_FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;
    const ids = Array.from(selectedIds);
    const leadOf = (id: string) => leads.find((l) => l.id === id);
    const e164 = (l?: OutreachLead) => (l?.phone ? `+${formatPhoneForWhatsApp(l.phone)}` : '');

    // Cross-channel suppression (one-no-forever): best-effort; the drainer is authoritative.
    const phones = [...new Set(ids.map((id) => e164(leadOf(id))).filter(Boolean))];
    let suppressed = new Set<string>();
    if (phones.length) {
      const { data: supp } = await (supabase as unknown as SupabaseClient)
        .from('contact_suppressions').select('phone_e164').in('phone_e164', phones);
      suppressed = new Set(((supp ?? []) as { phone_e164: string }[]).map((r) => r.phone_e164));
    }

    // Bucket every selected lead so the toast can account for all of them.
    let notContacted = 0;   // never got the opener / progressed past it (not an un-replied Contacted lead)
    let noDate = 0;         // Contacted but no recorded send time — can't judge the 3-day rule (Paul: skip)
    let tooRecent = 0;      // opener sent < 3 days ago
    let alreadyQueued = 0;  // already sitting in this lane
    let suppressedN = 0;    // said no
    let noPhone = 0;
    const queueable: string[] = [];
    for (const id of ids) {
      const l = leadOf(id);
      if (!l) continue;
      if (!l.phone) { noPhone++; continue; }
      if (suppressed.has(e164(l))) { suppressedN++; continue; }
      // "Never replied to the opener" proxy: still sitting at initial_contact. A lead that replied
      // has moved on (replied/interested/…), a fresh lead is not_contacted — both excluded. The
      // server's no-inbound-since check is authoritative; this keeps the batch honest up front.
      if (l.status !== 'initial_contact') { notContacted++; continue; }
      if (l.contact_followup_queued_at) { alreadyQueued++; continue; }
      const sentAt = l.whatsapp_sent_at ? new Date(l.whatsapp_sent_at).getTime() : NaN;
      if (!Number.isFinite(sentAt)) { noDate++; continue; }
      if (sentAt > cutoff) { tooRecent++; continue; }
      queueable.push(id);
    }

    /* Queue: stamp the lane marker AND move the Status pill to "2nd attempt". previous_status is
       captured so removing it from the queue can restore the lead to Contacted (mirrors the opener
       queue's cancel). The status change is display only — the drain lane keys on the marker and on
       message history, never on status, so "2nd attempt" doesn't affect eligibility. It persists
       after the send (the lane never touches status), which is why it reads for sent as well as
       queued leads. */
    queueable.forEach((id) => {
      const l = leadOf(id);
      onUpdateLead(id, {
        contact_followup_queued_at: now,
        status: 'second_attempt',
        previous_status: (l?.status ?? 'initial_contact') as LeadStatus,
      });
    });
    setSelectedIds(new Set());
    setQueueDialogOpen(false);

    const skips = [
      tooRecent ? `${tooRecent} too recent (<${CONTACT_FOLLOWUP_MIN_DAYS} days)` : '',
      notContacted ? `${notContacted} not an un-replied Contacted lead` : '',
      alreadyQueued ? `${alreadyQueued} already queued` : '',
      noDate ? `${noDate} no recorded contact date` : '',
      suppressedN ? `${suppressedN} opted out` : '',
      noPhone ? `${noPhone} no phone` : '',
    ].filter(Boolean).join(' · ');
    toast({
      title: queueable.length ? `Queued ${queueable.length} for no-reply follow-up` : 'Nothing queued',
      description: `${skips ? `Skipped: ${skips}. ` : ''}Follow-ups drain after openers, within the 7am–9:30pm UK window and daily cap. The server re-checks each one (no reply since, once per business) before it sends.`,
      variant: queueable.length ? undefined : 'destructive',
    });
  };

  const handleQueueForWhatsApp = async (template: string) => {
    if (selectedIds.size === 0 || !onUpdateLead) return;
    /* Refuse an unset template here as well as disabling the button. Stamping '' on a batch of leads
       would queue them with no template, and the drainer would then flag every one of them. */
    if (!template) { toast({ title: 'No template chosen', description: 'Pick a template before queueing.', variant: 'destructive' }); return; }
    /* The OPENER follow-up drains in its OWN lane (contact_followup_queued_at), NOT the status=queued
       opener path: that path's already_sent guard refuses any lead with prior WhatsApp — which every
       Contacted business has — and forces status→initial_contact on send. Route it separately. */
    if (template === 'contact_followup') { await handleQueueContactFollowup(); return; }
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    const leadOf = (id: string) => leads.find((l) => l.id === id);
    // Canonical E.164 ("+…") for a lead, matching the drainer's suppression key (and the SMS lane's, before it went).
    const e164 = (l?: OutreachLead) => (l?.phone ? `+${formatPhoneForWhatsApp(l.phone)}` : '');

    /* ⛔ PRIOR CONTACT AND SUPPRESSION BOTH COME FROM THE SERVER NOW, AND THAT IS A BUG FIX, NOT
       A REFACTOR. This block used to read contact_suppressions directly - a table with RLS enabled
       and NO POLICIES, which returns HTTP 200 and an empty array to the anon key (CLAUDE.md §8), so
       `suppressed` was structurally always empty and this filter has never excluded a single
       suppressed number since it was written. It read like a guard and did nothing.

       🔴 AND IT COULD NOT SEE THE REAL PROBLEM ANYWAY. On 2026-09-02, 12 of 16 audit_result_hook
       sends went to numbers already in conversation - 11 on a SECOND lead row for the same phone.
       Every test here was per-lead-row (`l.status`, `l.whatsapp_delivery_status`), and a fresh
       duplicate row has a null delivery status, so it sailed through. 104 numbers currently have more
       than one unarchived lead row. 'Has this NUMBER been messaged' cannot be answered from the row
       in front of you, and the SPA's own RLS scope cannot answer it either.

       ⛔ IT FAILS CLOSED. If the check cannot be made, NOTHING is queued and the operator is told.
       Every other client-side guard here is a best-effort UX filter deferring to the drip - right for
       cosmetics, wrong for this: the drip is the backstop for a number it can SEE, and queueing blind
       is what put the messages out. */
    const wantsColdGuard = isColdOutreachTemplate(template);
    const phones = [...new Set(ids.map((id) => e164(leadOf(id))).filter(Boolean))];
    let suppressed = new Set<string>();
    let contacted = new Set<string>();
    if (phones.length) {
      const { data: chk, error: chkErr } = await supabase.functions.invoke('process-whatsapp-queue', {
        body: { mode: 'contact_check', phones },
      });
      const res = chk as { ok?: boolean; contacted?: string[]; suppressed?: string[] } | null;
      if (chkErr || !res?.ok) {
        toast({
          title: 'Could not check contact history',
          description: 'Nothing was queued. This check is what stops a business being messaged twice, so the queue will not run without it.',
          variant: 'destructive',
        });
        return;
      }
      /* Compared on bare digits - the endpoint normalises both conventions, so nothing here needs to
         know that whatsapp_messages stores '447…' and contact_suppressions stores '+447…'. */
      const bare = (v: string) => v.replace(/\D/g, '');
      suppressed = new Set((res.suppressed ?? []).map(bare));
      contacted = new Set((res.contacted ?? []).map(bare));
    }
    // A SUCCESSFUL prior WhatsApp = already contacted → never re-queue (Decision 1: only a real
    // success blocks; 'simulated'/failed don't).
    const SENT_OK = new Set(['sent', 'delivered', 'read']);
    // Exclude: not-on-WhatsApp (permanent), already queued (in-flight), already successfully sent,
    // suppressed, or - for a COLD template - a number with any prior conversation on ANY lead row.
    let blockedContacted = 0;
    const queueable = ids.filter((id) => {
      const l = leadOf(id);
      if (!l) return false;
      if (l.status === 'no_whatsapp') return false;
      if (l.status === 'queued') return false;
      if (SENT_OK.has((l.whatsapp_delivery_status ?? '') as string)) return false;
      const digits = e164(l).replace(/\D/g, '');
      if (digits && suppressed.has(digits)) return false;
      /* ⚠️ ONLY for cold templates. re_engage and the follow-ups EXIST to reach a number with
         history, so blocking them here would make them unqueueable for their only audience - the
         same reasoning as the drip's guard, reading the same leaf. */
      if (wantsColdGuard && digits && contacted.has(digits)) { blockedContacted++; return false; }
      return true;
    });
    const skipped = ids.length - queueable.length;
    // Tier-1 offline line-type gate: only mobiles may be queued. Landline/VoIP/etc.
    // never enter the queue — they're flagged 'no_whatsapp_needs_sms' (the status name is
    // historical; it is the landline marker, and no send is ever attempted at one).
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
    /* ⚠️ THE NUMBER-LEVEL BLOCK GETS ITS OWN LINE. Folded into `skipped` it would read as
       "already contacted", which an operator takes to mean THIS lead - hiding the fact that the
       block came from a DIFFERENT lead row carrying the same phone. That distinction is the whole
       finding of 2026-09-02, and it is what tells you a duplicate row exists. */
    const notes = [
      blockedContacted ? `${blockedContacted} skipped — that number is already in a conversation (probably a duplicate lead row).` : '',
      skipped - blockedContacted > 0 ? `${skipped - blockedContacted} skipped (already contacted, queued or suppressed).` : '',
      blockedNonMobile ? `${blockedNonMobile} landline — flagged, not queued.` : '',
    ].filter(Boolean).join(' ');
    toast({
      title: `Queued ${queuedCount} for WhatsApp`,
      description: `Template: ${tmplLabel}. ${notes ? notes + ' ' : ''}Sends within the daily 7am–9:30pm UK window, at the queue's daily cap (shown live on the queue panel).`,
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

  /* Over every loaded lead, so a pair is still a pair when one half is filtered out. */
  const sharedPhoneIds = useMemo(() => sharedPhoneLeadIds(leadsWithOptimistic), [leadsWithOptimistic]);

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
      /* ⛔ THE PAID SENTINEL IS TESTED FIRST, AND IT READS THE MONEY, NOT THE STATUS. `paid` means
         `amount_paid > 0` everywhere (CLAUDE.md §6): a customer moved on to `in_delivery` is still
         paid, so filtering on `payment_received` would hide exactly the people Paul is mid-delivery
         with, and a £0 lead dragged to `payment_received` would be counted as one of them.
         It must come BEFORE statusesForFilter, which returns [] for this value on purpose — falling
         through would show an empty table and read as "no paying customers". */
      if (isPaidFilterValue(statusFilter)) {
        result = result.filter((lead) => isPaidLead(lead));
      } else {
        /* ⚠️ A FILTER OPTION CAN COVER MORE THAN ONE STATUS. "No WhatsApp" means both the mobile with
           no account and the landline — everyone unreachable that way. statusesForFilter returns the
           group, and returns [value] for anything it does not recognise, so an unknown filter narrows
           rather than widening to everything. */
        const wanted = statusesForFilter(statusFilter);
        result = result.filter((lead) => wanted.includes(lead.status as LeadStatus));
      }
    }

    /* ── SHARES A PHONE WITH ANOTHER LIVE LEAD ────────────────────────────────────────────
       ⛔ THE SET IS BUILT FROM EVERY LOADED LEAD, NOT FROM THE FILTERED VIEW. A duplicate whose
       twin is hidden by the current filter is still a duplicate — computing it after filtering
       would quietly under-report exactly the pairs that matter, which is how the August incident
       stayed invisible. */
    if (sharedPhoneOnly) {
      result = result.filter((lead) => sharedPhoneIds.has(lead.id));
    }

    /* ── PRODUCT: WHICH PITCH, NOT WHERE IN THE CONVERSATION ──────────────────────────────
       ⛔ UNDECIDED IS ITS OWN CHOICE AND IS TESTED SEPARATELY. It is the pile that matters most
       — 421 leads sat at report_sent with no decision recorded — so it needs to be selectable,
       and it cannot be expressed as "one of the three products" because it is the absence of
       one. `productOf` returns null for undecided AND for an unrecognised value, so a value this
       build does not know about surfaces here instead of joining a pile silently. */
    if (productFilter !== 'all') {
      result = productFilter === PRODUCT_UNDECIDED
        ? result.filter((lead) => productOf(lead) === null)
        : result.filter((lead) => productOf(lead) === productFilter);
    }

    /* ⛔ "Already Visible" is HIDDEN FROM THE DEFAULT LIST — a lead AI already names (>=3 of 6),
       parked so it is not chased. It stays fully reachable: the status filter offers it permanently
       (a static option — see OUTREACH_STATUS_OPTIONS), and selecting it runs the wanted-status path
       ABOVE, which shows exactly these rows. So the hide fires ONLY when no specific status is chosen.
       All active leads are already loaded client-side (useOutreach fetches every non-archived lead),
       so this is a reveal, not a fetch. */
    if (statusFilter === 'all') {
      result = result.filter((lead) => lead.status !== 'already_visible');
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

    // Hide leads marked not interested (status='not_interested').
    if (hideNotInterested) result = result.filter((lead) => lead.status !== 'not_interested');

    // Listing-level signal filters (free, derived from stored website; AND).
    if (sigWebsite) result = result.filter((lead) => isOwnWebsite(lead.website));
    /* Their own site is absent OR it is a Facebook/directory listing — the same test the mockup
       trigger refuses on, so the filter and the auto-verdict agree on who counts. */
    if (sigNoWebsite) result = result.filter((lead) => !isOwnWebsite(lead.website));
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
  }, [leadsWithOptimistic, searchQuery, locationFilter, statusFilter, productFilter, sharedPhoneOnly, sharedPhoneIds, countryFilter, trackedOnly, hasEmail, hasInstagram, hasFacebook, hasWhatsApp, hideNoWhatsApp, hideNotInterested, sigWebsite, sigNoWebsite, sigFacebook, sigInstagram, sortField, sortDirection]);

  // Bulk "Find emails" — free website crawl (extract-email) over the filtered leads
  // with a website and no email yet, persisting to outreach_leads.email via updateLead.
  /* Which statuses the email crawl targets. Defaults to the two that make sense — WhatsApp could
     not reach them, or an opener went unanswered. Held here rather than in the hook so the count on
     the button and the set actually crawled can never disagree. */
  const [crawlStatuses, setCrawlStatuses] = useState<LeadStatus[]>([...CRAWLABLE_STATUSES_DEFAULT]);

  /* ⛔ THE SAME TEST THE PUSH TRIAGE USES. bulk-jobs' triageForPush refuses a lead on
     `!String(l.email ?? "").trim()`, so this selection must trim too — otherwise a whitespace-only
     address would be TICKED here and then refused there as "no email address", which is exactly the
     row-says-yes/push-says-no mismatch this pair of changes closes. One rule, both ends.
     ⚠️ Scoped to filteredAndSortedLeads: it selects what is IN VIEW, never the whole book.
     ⚠️ DECLARED HERE, BELOW filteredAndSortedLeads — it cannot sit with the other selection
     handlers further up, because that is above the list it reads (TS2448). */
  const leadsWithEmail = useMemo(
    () => filteredAndSortedLeads.filter((l) => !!(l.email ?? '').trim()),
    [filteredAndSortedLeads],
  );
  /* Replaces the selection rather than adding to it: "select all with email" is a statement about
     what should be ticked, not an increment. Pressing it twice is idempotent. */
  const handleSelectAllWithEmail = () => {
    setSelectedIds(new Set(leadsWithEmail.map((l) => l.id)));
  };

  const {
    findEmails,
    cancel: cancelFindEmails,
    finding: findingEmails,
    progress: emailProgress,
    withWebsiteCount,
    crawlPlan,
    usingSelection: crawlUsingSelection,
    /* ⛔ `leads`, NOT `filteredAndSortedLeads`, WHEN RESOLVING A SELECTION. Rows are ticked from the
       visible list, but the filter can change afterwards — resolving against the filtered view would
       silently drop the ticked leads that are no longer on screen, crawl fewer than the button said,
       and look like the crawl having failed on exactly the leads the operator cared about. The hook
       intersects with selectedIds itself, so passing the full list cannot widen the set. */
  } = useOutreachFindEmails(
    selectedIds.size > 0 ? leads : filteredAndSortedLeads,
    onUpdateLead ?? (async () => null),
    crawlStatuses,
    selectedIds,
  );

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
                {!readOnly && onBulkJob && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-background text-xs h-8"
                    disabled={bulkJobActive}
                    title={bulkJobActive ? 'A bulk job is already running' : 'Run an AI-visibility audit for each selected lead (with a business type + location) — enqueues server-side and drains through the audit queue'}
                    onClick={handleBulkRunAudit}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5 text-sky-500" />
                    Run audits ({auditEligibleIds.length})
                  </Button>
                )}
                {/* ── SET PRODUCT ON THE SELECTION ──────────────────────────────────────────
                    ⛔ WRITES A COLUMN, SENDS NOTHING. Deciding what to pitch is not pitching. */}
                {!readOnly && onUpdateLead && (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      const ids = Array.from(selectedIds);
                      void setProductOn(ids, v === PRODUCT_UNDECIDED ? null : (v as ProductValue));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[150px] bg-background text-xs" disabled={productBusy}>
                      <SelectValue placeholder={productBusy ? 'Setting…' : `Set product (${selectedIds.size})`} />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="font-medium">{opt.label}</span>
                          <span className="ml-1 text-muted-foreground">— {opt.hint}</span>
                        </SelectItem>
                      ))}
                      {/* Clearing writes NULL, restoring absence rather than storing a word. */}
                      <SelectItem value={PRODUCT_UNDECIDED}>Back to undecided</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {/* Shown only when the selection actually contains repairable rows, so they do not
                    clutter the bar for the 846 leads that are fine. */}
                {!readOnly && missingTownIds.length > 0 && (
                  <Button
                    variant="outline" size="sm" className="bg-background text-xs h-8"
                    title="Ask Google for the real town of the selected leads that have none. One address-only Place Details call each ($0.005) — the cheapest tier there is."
                    onClick={openTownFix}
                  >
                    <MapPin className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                    Fix missing town ({missingTownIds.length})
                  </Button>
                )}
                {!readOnly && onUpdateLead && missingTradeIds.length > 0 && (
                  <Button
                    variant="outline" size="sm" className="bg-background text-xs h-8"
                    title="Set the trade on the selected leads that have none — they cannot be audited without one"
                    onClick={() => { setTradeChoice(''); setTradeDialogOpen(true); }}
                  >
                    <Tag className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
                    Set trade ({missingTradeIds.length})
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
                </>
              )}
              {/* ⛔ OUTSIDE the selectedIds.size > 0 gate, deliberately: its whole job is to CREATE a
                  selection, so a control that only appears once you already have one is useless.
                  Sits with Export/Import, the other always-visible row-2 items. */}
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllWithEmail}
                  disabled={!leadsWithEmail.length}
                  className="bg-background text-xs h-8"
                  title={leadsWithEmail.length
                    ? `Tick the ${leadsWithEmail.length} lead${leadsWithEmail.length === 1 ? '' : 's'} in this view that have an email address. Replaces the current selection.`
                    : 'No leads in this view have an email address yet — run the email crawl first.'}
                >
                  <Mail className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                  Select {leadsWithEmail.length} with email
                </Button>
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
              {/* Find emails — free website crawl (extract-email) over filtered leads
                  with a website and no email yet; writes to outreach_leads.email. */}
              {!readOnly && onUpdateLead && (
                findingEmails ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelFindEmails}
                    className="bg-background text-xs h-8"
                    title="Cancel the email scan"
                  >
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Finding… ({emailProgress ? `${emailProgress.done}/${emailProgress.total}` : '…'})
                    <X className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={findEmails}
                    disabled={!crawlPlan.batch}
                    className="bg-background text-xs h-8"
                    /* ⛔ THE LABEL NAMES THE SET *AND* THE BATCH. "Crawl 187 leads" was true and
                       useless: it never said WHICH 187, so a ticked row outside the status
                       allow-list looked like a crawl that had failed rather than one that never
                       included it. It was then WRONG as well as vague — it printed the uncapped
                       candidate count while a press crawls at most CRAWL_MAX_PER_RUN, so "Crawl
                       1968 in view" did 200 and reported success. crawlButtonLabel prints both
                       numbers when the cap bites, and the title says how many presses are left. */
                    title={crawlPlan.candidates
                      ? (crawlUsingSelection
                          ? `Crawl ${crawlPlan.batch} of the ${crawlPlan.candidates} ticked lead${crawlPlan.candidates === 1 ? '' : 's'} that ha${crawlPlan.candidates === 1 ? 's' : 've'} a website and no email — free. A selection overrides the status filter and re-crawls even if checked recently. Archived leads are never crawled.${crawlPlan.remaining ? ` ${crawlPlan.remaining} would be left over — press again to carry on.` : ''}`
                          : `Crawl ${crawlPlan.batch} lead${crawlPlan.batch === 1 ? '' : 's'} in the current view for a contact email — free. Targeting: ${crawlStatuses.join(', ')}. Skips anything checked in the last 30 days. Archived and suppressed leads are never crawled. Tick rows to crawl exactly those instead.${crawlPlan.remaining ? ` ${crawlPlan.remaining.toLocaleString()} more qualify than one press can do — press again to carry on.` : ''}`)
                      : (crawlUsingSelection
                          ? 'None of the ticked leads need crawling — they have no website, already have an email, or are archived.'
                          : `Nothing left to crawl in: ${crawlStatuses.join(', ')} — everything with a website either has an email or was checked in the last 30 days.`)}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1.5" />
                    {crawlButtonLabel(crawlPlan, crawlUsingSelection)}
                  </Button>
                )
              )}
              {/* ⛔ THE STATUS PICKER, BESIDE THE COUNT. The count above is computed from exactly
                    this selection, so "crawling 187 leads" is always the set that will be crawled —
                    the two cannot disagree, which is the point of holding the selection here rather
                    than inside the hook.
                    ⚠️ It is a CONVENIENCE, not the safety net. Every sender checks
                    _shared/suppression.ts at send time. Widening this can waste a crawl; it cannot
                    cause a message. */}
              {!readOnly && onUpdateLead && !findingEmails && (
                <details className="relative inline-block align-middle">
                    <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
                      targeting: {crawlStatuses.length} status{crawlStatuses.length === 1 ? '' : 'es'}
                    </summary>
                    <div className="absolute z-20 mt-1 w-64 rounded-md border border-border bg-popover p-2 shadow-md">
                      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
                        Archived and suppressed leads are never crawled, whatever is ticked.
                      </p>
                      {CRAWL_STATUS_OPTIONS.map((st) => (
                        <label key={st} className="flex items-center gap-2 py-0.5 text-xs">
                          <input
                            type="checkbox"
                            checked={crawlStatuses.includes(st)}
                            onChange={(e) => setCrawlStatuses((prev) =>
                              e.target.checked ? [...prev, st] : prev.filter((x) => x !== st))}
                          />
                          {/* ⛔ THE SAME LABEL THE REST OF THE CRM SHOWS. This printed the raw value,
                              so `not_contacted` read as "not_contacted" here and "New" in the status
                              filter and every row dropdown — which reads as two different statuses
                              and cost a round trip working out that New leads were crawlable all
                              along. leadStatusLabel reads OUTREACH_STATUS_OPTIONS, the one map, so
                              this control cannot drift from the others again. Value and behaviour
                              unchanged: `st` is still what is ticked and still what is filtered on. */}
                          <span className={CRAWLABLE_STATUSES_DEFAULT.includes(st) ? 'font-medium' : ''}>{leadStatusLabel(st)}</span>
                        </label>
                      ))}
                      <button
                        type="button"
                        className="mt-1.5 text-[11px] text-muted-foreground underline"
                        onClick={() => setCrawlStatuses(CRAWLABLE_STATUSES_DEFAULT)}
                      >
                        reset to default
                      </button>
                  </div>
                </details>
              )}
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
            {/* ⛔ THE FILTERED PILL — filters PERSIST across navigation (the tableState restore
                above), which is the feature; the risk it creates is a remembered filter reading as
                "my leads vanished" days later. So whenever ANY filter is non-default, say so
                visibly, with a one-click reset of ALL of them (the dropdown's own Clear only covers
                its nine toggles). Clearing also bumps filterInputStamp so the uncontrolled inputs
                visibly empty rather than keeping stale text over an unfiltered table. */}
            {(searchQuery !== '' || locationFilter !== '' || statusFilter !== 'all' || countryFilter !== 'all'
              || trackedOnly || hasEmail || hasInstagram || hasFacebook || hasWhatsApp
              || hideNoWhatsApp || hideNotInterested || sigWebsite || sigNoWebsite || sigFacebook || sigInstagram) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery(''); setLocationFilter('');
                  setStatusFilter('all'); setCountryFilter('all');
                  setTrackedOnly(false);
                  setHasEmail(false); setHasInstagram(false); setHasFacebook(false); setHasWhatsApp(false);
                  setHideNoWhatsApp(false); setHideNotInterested(false);
                  setSigWebsite(false); setSigNoWebsite(false); setSigFacebook(false); setSigInstagram(false);
                  setCurrentPage(1);
                  setFilterInputStamp((v) => v + 1);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                title="Filters are active (they persist between visits) — click to clear them all and show every lead"
              >
                <X className="h-3 w-3" />
                Filtered
              </button>
            )}
            <div className="relative flex-1 min-w-[120px] max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                key={`sq-${filterInputStamp}`}
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
                key={`lq-${filterInputStamp}`}
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
                setStatusFilter(v as StatusFilterValue | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] sm:w-[140px] bg-background h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {/* The FILTER list, not the status list — statuses sharing a label are one option.
                    It leads with "Paid (money in)", which is NOT a status: it matches amount_paid > 0,
                    so an in_delivery customer is included and a £0 payment_received lead is not. */}
                {OUTREACH_STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ── PRODUCT: work one pile at a time ──────────────────────────────────────────
                Beside Status rather than inside it, because they answer different questions:
                status is where they are in the conversation, product is what the pitch should
                be. Paul had one field doing both, which is why 421 leads reached report_sent
                with no record of what to sell next. */}
            <Select
              value={productFilter}
              onValueChange={(v) => {
                setProductFilter(v as ProductValue | typeof PRODUCT_UNDECIDED | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] sm:w-[140px] bg-background h-8 text-xs">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {/* The pile that matters most, and it is the ABSENCE of a product rather than one
                    of them — so it is its own option, not a fourth value. */}
                <SelectItem value={PRODUCT_UNDECIDED}>Undecided</SelectItem>
                {PRODUCT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
                [hasEmail, hasInstagram, hasFacebook, hasWhatsApp, hideNoWhatsApp, hideNotInterested, sigWebsite, sigNoWebsite, sigFacebook, sigInstagram].filter(Boolean).length;
              const toggle = (setter: (updater: (prev: boolean) => boolean) => void) => () => {
                setter((v) => !v);
                setCurrentPage(1);
              };
              const clearAll = () => {
                setHasEmail(false); setHasInstagram(false); setHasFacebook(false); setHasWhatsApp(false);
                setHideNoWhatsApp(false); setHideNotInterested(false);
                setSigWebsite(false); setSigNoWebsite(false); setSigFacebook(false); setSigInstagram(false);
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
                    {/* ⛔ A WARNING, NOT A HIDE — it is under "Show only" for that reason. Paul:
                        "I would rather see them than trust a send-time catch." The count is on the
                        label so the size of the problem is visible without switching it on. */}
                    <DropdownMenuCheckboxItem checked={sharedPhoneOnly} onCheckedChange={toggle(setSharedPhoneOnly)} onSelect={(e) => e.preventDefault()}>
                      <Users className="h-3.5 w-3.5 mr-2 text-amber-600" /> Shares a phone ({sharedPhoneIds.size})
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Hide</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={hideNoWhatsApp} onCheckedChange={toggle(setHideNoWhatsApp)} onSelect={(e) => e.preventDefault()}>
                      <PhoneOff className="h-3.5 w-3.5 mr-2" /> Hide no-WhatsApp
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={hideNotInterested} onCheckedChange={toggle(setHideNotInterested)} onSelect={(e) => e.preventDefault()}>
                      <ThumbsDown className="h-3.5 w-3.5 mr-2" /> Hide not interested
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Listing signal (not verified)</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={sigWebsite} onCheckedChange={toggle(setSigWebsite)} onSelect={(e) => e.preventDefault()}>
                      <Globe className="h-3.5 w-3.5 mr-2" /> Has own website
                    </DropdownMenuCheckboxItem>
                    {/* The inverse, because "has own website" switched OFF means "not filtered",
                        not "has none" — and the no-website pile is one Paul has to select. */}
                    <DropdownMenuCheckboxItem checked={sigNoWebsite} onCheckedChange={toggle(setSigNoWebsite)} onSelect={(e) => e.preventDefault()}>
                      <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> No own website
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
            {(hasEmail || hasInstagram || hasFacebook || hasWhatsApp || hideNoWhatsApp || hideNotInterested || sigWebsite || sigNoWebsite || sigFacebook || sigInstagram) && (
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
                          {/* ⛔ THE TOWN GATE'S VISIBLE HALF — same predicate every server gate
                              reads (townVerdict.ts), so the badge and the gates cannot disagree.
                              A gated lead is EXCLUDED from outreach and audits automatically; this
                              is how the operator sees why a queued lead never sends. */}
                          {townGated(lead) && (
                            <Badge
                              variant="outline"
                              className="flex-shrink-0 border-destructive/40 text-[10px] font-normal text-destructive"
                              title="Google was asked where this business is and could not confirm a town — the town on the lead is what was typed or searched, not a Google-confirmed one. Excluded from outreach and audits until it is confirmed (edit the lead, or re-run town verification)."
                            >
                              Google couldn&rsquo;t confirm the town
                            </Badge>
                          )}
                          {lead.status === 'interested' && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          )}
                          {!!lead.notes && lead.notes.trim().length > 0 && (
                            <span title="Has a note" className="inline-flex flex-shrink-0">
                              <StickyNote className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </span>
                          )}
                          <WhatsAppStatusBadge status={lead.whatsapp_status} />
                          {/* The no-reply follow-up state now shows in the STATUS pill ("2nd attempt"),
                              not a separate tag here — see the second_attempt status set when queueing. */}
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
                                  {/* ⛔ WAS A wa.me LINK LABELLED "WhatsApp Call", AND BOTH HALVES OF
                                      THAT WERE WRONG. wa.me opens a CHAT, not a call — so this was
                                      never a calling affordance, it was a second way to message
                                      someone OUTSIDE the app. Anything sent that way writes no
                                      whatsapp_messages row, so it has no thread, no reply window and
                                      is invisible to every count in the CRM (CLAUDE.md §6: counts
                                      come from whatsapp_messages, never from lead status).
                                      Now the in-app thread, via the same handler as the green
                                      WhatsApp button — which resolves the conversation key from the
                                      lead (normalizeWaNumber) and creates a synthetic thread when
                                      there are no messages yet, then lands on /inbox?c=<key>.
                                      Hand-building that URL here would need a second copy of the key
                                      rule and would open an EMPTY inbox for a lead with no thread.
                                      ⛔ AND handleCallClick IS DELIBERATELY NOT CALLED. It was on the
                                      old link and keeping it "to preserve behaviour" would now RECORD
                                      A CALL THAT NEVER HAPPENS: it writes contact_method='call' and
                                      runs executeContact(lead,'call'), so this item would log a call
                                      attempt and then race handleWhatsAppClick's 'whatsapp' write for
                                      the same field. The item is not a call any more, so it does
                                      exactly what the green WhatsApp button does and nothing else. */}
                                  <DropdownMenuItem
                                    className="flex items-center gap-2 cursor-pointer"
                                    onClick={() => handleWhatsAppClick(lead)}
                                  >
                                    <Phone className="h-4 w-4 text-green-500" />
                                    WhatsApp thread
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                                  <ClipboardCheck className="h-4 w-4" />
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


      {/* Bulk AI-audit — question count (1–5) + explicit cost-confirm guard before firing, so a
          large accidental selection can't quietly run a costly batch. Enqueues one audit per
          eligible lead; the existing queue drains them (no direct Apify). */}
      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Run AI audits</DialogTitle>
            <DialogDescription className="text-xs">
              One AI-visibility audit per selected lead — enqueued server-side and drained through the
              audit queue (no direct Apify). Uses each lead’s stored business type + location.
              {selectedIds.size - auditSelectedLeads.length > 0 && ` · ${selectedIds.size - auditSelectedLeads.length} skipped (already audited or missing type/location)`}.
              Capped at $3/audit + $15/day. Safe to leave this page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Questions per business</label>
            <Select value={String(auditQuestionCount)} onValueChange={(v) => setAuditQuestionCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} question{n === 1 ? '' : 's'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── THE NO-WEBSITE HOLD-BACK, STATED ─────────────────────────────────────────────────
              A silent exclusion reads as "everything selected was audited" when it wasn't, which is
              the failure mode CLAUDE.md keeps warning about. So the count and the saving are both on
              screen, and the checkbox is right next to them. */}
          {auditNoWebsiteLeads.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <Checkbox
                checked={auditIncludeNoWebsite}
                onCheckedChange={(v) => setAuditIncludeNoWebsite(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs leading-snug">
                <span className="font-semibold">
                  {auditNoWebsiteLeads.length} of these {auditNoWebsiteLeads.length === 1 ? 'has' : 'have'} no website
                </span>
                {auditIncludeNoWebsite
                  ? <> — included, adding ~${auditNoWebsiteSavingUsd.toFixed(2)}.</>
                  : <> — held back, saving ~${auditNoWebsiteSavingUsd.toFixed(2)}.</>}
                {' '}AI has nothing of theirs to read, so Gemini can't name them at all. Tick to audit
                them anyway.
              </span>
            </label>
          )}
          {/* ══ THE PREVIEW — what is selected, what is already done, and what this press spends,
              before it is pressed. Every number is derived from data already on screen. */}
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
            <div className="flex justify-between"><span>Selected</span><span className="font-semibold tabular-nums">{selectedIds.size}</span></div>
            {auditAlreadySplit.total > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>· already audited</span><span className="tabular-nums">{auditAlreadySplit.total}</span>
                </div>
                {/* Split so "already audited" is not one lump: a FAILED audit is not a finished one,
                    and the two were previously indistinguishable. Both stay EXCLUDED — the
                    eligibility rule is unchanged — but which is which is now visible. */}
                <div className="pl-3 text-[11px] text-muted-foreground">
                  {auditAlreadySplit.completed} completed
                  {auditAlreadySplit.failed > 0 && <> · <span className="text-amber-600">{auditAlreadySplit.failed} failed</span></>}
                  {auditAlreadySplit.inProgress > 0 && <> · {auditAlreadySplit.inProgress} in progress</>}
                </div>
              </>
            )}
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1">
              <span className="font-medium">Eligible to audit</span>
              <span className="font-semibold tabular-nums">{auditOrdered.length}</span>
            </div>
          </div>

          {/* HOW MANY THIS RUN. Blank = all eligible; an empty box must not read as 0 and disable
              the button. The cost below updates live from this number. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              How many this run — oldest-added first
            </label>
            <Input
              type="number" min={1} max={AUDIT_JOB_CAP} inputMode="numeric"
              placeholder={`All ${Math.min(auditOrdered.length, AUDIT_JOB_CAP)} (max ${AUDIT_JOB_CAP})`}
              value={auditTakeInput}
              onChange={(e) => setAuditTakeInput(e.target.value)}
              className="h-8 text-xs"
            />
            {auditTake.overCap && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px]">
                <span className="font-semibold">Over the {AUDIT_JOB_CAP}-lead cap</span> — this run takes {AUDIT_JOB_CAP}.
                Run it again afterwards for the rest.
              </p>
            )}
            {!auditTake.overCap && auditTake.overEligible && (
              <p className="text-[11px] text-muted-foreground">
                Only {auditOrdered.length} eligible — auditing all of them.
              </p>
            )}
          </div>

          {/* ⛔ THE DAILY CAP IS THE PROMINENT ONE: it is the rolling-24h Apify ceiling and what a
              large batch meets first. Tripping it mid-run leaves half-finished audits — and a lead
              whose audit FAILED is excluded from this button's eligible set, so the damage hides
              itself. That is why this warns rather than merely informing. */}
          {auditDailyVerdict.exceeds && (
            <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs">
              <span className="font-semibold">Over the ${AUDIT_DAILY_CAP_USD.toFixed(2)} daily Apify cap.</span>{' '}
              This run is ~${auditBatchCost.totalUsd.toFixed(2)}. Questions will start failing part-way
              through and leave half-finished audits. Lower the number above, or run the rest tomorrow.
            </p>
          )}
          {auditMonthlyVerdict.exceeds && (
            <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs">
              <span className="font-semibold">Over the remaining monthly Apify budget</span> — about
              {' '}${(auditMonthlyVerdict.remainingUsd ?? 0).toFixed(2)} left this cycle, this run is
              {' '}~${auditBatchCost.totalUsd.toFixed(2)}. Hitting the account cap stops every audit AND
              every SEO scan, not just this batch.
            </p>
          )}
          {/* ⚠️ AN UNREADABLE BUDGET SAYS SO. Rendering nothing would imply headroom nobody checked —
              the absent-value fault on a spend guard. Nothing is blocked by it. */}
          {auditMonthlyVerdict.unknown && (
            <p className="text-[11px] text-muted-foreground">
              Couldn&rsquo;t read the Apify monthly usage, so the monthly budget isn&rsquo;t checked here.
              The daily cap check above still applies.
            </p>
          )}

          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            Audit <span className="font-semibold">{auditBatchCost.leads}</span> business{auditBatchCost.leads === 1 ? '' : 'es'}
            {' '}× <span className="font-semibold">{auditQuestionCount}</span> question{auditQuestionCount === 1 ? '' : 's'}
            {' '}(~<span className="font-semibold">${auditBatchCost.totalUsd.toFixed(2)}</span>
            {auditBatchCost.withWebsite > 0 && <>, incl. {auditBatchCost.withWebsite} site scan{auditBatchCost.withWebsite === 1 ? '' : 's'}</>}). Proceed?
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAuditDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmBulkAudit} disabled={bulkJobActive || !auditBatchCost.leads}>
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Audit {auditBatchCost.leads}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fix missing town — preview first, so the spend is on screen before it happens. */}
      <Dialog open={townFixOpen} onOpenChange={setTownFixOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Fix missing town</DialogTitle>
            <DialogDescription className="text-xs">
              Asks Google for the real town of each selected lead that has none, using its stored
              place id. Address-only call — the cheapest tier Google sells.
            </DialogDescription>
          </DialogHeader>
          {!townFixPreview ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking which leads need one…
            </div>
          ) : townFixPreview.candidates === 0 ? (
            <p className="text-sm text-muted-foreground">
              None of the selected leads need a town — or they have no Google place id, which means
              there is nothing to ask.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                Look up <span className="font-semibold">{townFixPreview.candidates}</span> town
                {townFixPreview.candidates === 1 ? '' : 's'} (~
                <span className="font-semibold">${townFixPreview.estimated_usd.toFixed(2)}</span>). Proceed?
              </p>
              {townFixPreview.names.length > 0 && (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {townFixPreview.names.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
              {/* Stated up front rather than discovered in the result. */}
              <p className="text-xs text-muted-foreground">
                Some will come back with no town — Google's address genuinely has none for a few
                places. Those are billed too, and named afterwards.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setTownFixOpen(false)} disabled={townFixBusy}>Cancel</Button>
            <Button size="sm" onClick={confirmTownFix} disabled={townFixBusy || !townFixPreview?.candidates}>
              {townFixBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 mr-1.5" />}
              Look up {townFixPreview?.candidates ?? 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set trade on a selection — the hand half of the repair. */}
      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Set trade on {missingTradeIds.length} lead{missingTradeIds.length === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription className="text-xs">
              These have no business type stored, so they cannot be audited. Only the leads that are
              missing one are changed — anything already set is left alone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Trade</label>
            <Select value={tradeChoice} onValueChange={setTradeChoice}>
              <SelectTrigger><SelectValue placeholder="Pick a trade" /></SelectTrigger>
              <SelectContent>
                {TRADES.map((t) => (
                  <SelectItem key={t.slug} value={t.label}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The fixed list is deliberately short (trades.ts): a free-text box here is how the
                same trade ends up stored under six spellings again. */}
            <p className="text-xs text-muted-foreground">
              From the fixed list. Add a trade in <span className="font-mono">src/lib/trades.ts</span> if
              one is missing.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setTradeDialogOpen(false)} disabled={tradeBusy}>Cancel</Button>
            <Button size="sm" onClick={confirmSetTrade} disabled={!tradeChoice || tradeBusy}>
              {tradeBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Tag className="h-3.5 w-3.5 mr-1.5" />}
              Set on {missingTradeIds.length}
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
              <SelectTrigger><SelectValue placeholder="Not set — choose a template" /></SelectTrigger>
              <SelectContent>
                {WHATSAPP_TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setQueueDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!queueTemplate} onClick={() => handleQueueForWhatsApp(queueTemplate)}>
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
