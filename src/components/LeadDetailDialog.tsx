import { useState, useEffect, useRef, useMemo } from 'react';
import { isDemoLead } from '@/lib/demoLeads';
import { StickyNote, Save, Check, X, Pencil, Calendar as CalendarIconLucide, PoundSterling, Mail, Copy, Share2, Globe, Phone, MapPin, Loader2, PhoneCall, ChevronDown, MessageCircle, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { whatsAppLinkForLead } from '@/lib/salesLinks';
import { QuickCloseNav, QuickClosePanel } from '@/components/QuickCloseDialog';
import { LeadQuestionnaireSection } from '@/components/LeadQuestionnaireSection';
import { LeadSiteCheckButton } from '@/components/LeadSiteCheckButton';
import { CrawlCheckButton } from '@/components/CrawlCheckButton';
import { useLeadCrawl } from '@/hooks/useLeadCrawls';
import { WelcomePackButton } from '@/components/WelcomePackButton';
import { ColdCallPlaybookInline } from '@/components/ColdCallPlaybook';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProspectFacts } from '@/components/ProspectFacts';
import { LeadDeliveryCockpit } from '@/components/LeadDeliveryCockpit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { parseAmountPaid, isPaidLead } from '@/lib/leadPayment';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType } from '@/types/outreach';
import { CONTACT_METHOD_OPTIONS } from '@/types/outreach';
import { pipelineStatusLabel } from '@/components/PipelineStatusBadge';
import { PipelineStatusSelect } from '@/components/PipelineStatusSelect';
import { headerStateShown, markPaidIsMain } from '@/lib/workspaceHeader';
import { WhatsAppLeadControls } from '@/components/WhatsAppLeadControls';
import { OnboardingLinkCard } from '@/components/OnboardingLinkCard';
import { NextActionPill } from '@/components/NextActionPill';
import { LeadStateStrip } from '@/components/LeadStateStrip';
import { FindEmailButton } from '@/components/FindEmailButton';
import { SocialLinks, SocialProfilesPanel } from '@/components/SocialLinks';
import { cn } from '@/lib/utils';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { markLeadInterested } from '@/lib/leadQuickActions';
import { notifyLeadChanged } from '@/lib/leadSync';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { RecentWhatsApp } from '@/components/RecentWhatsApp';
import { useSubscription } from '@/hooks/useSubscription';
import { SalesStatePill } from '@/components/SalesStatePill';
import { useLeadSalesState } from '@/hooks/useLeadSalesState';
import { pillStatusOf } from '@/lib/leadState';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { LeadHistoryPanel, LeadHookPanel, LeadWorkPanel, ProspectProfilePanel } from '@/components/LeadCrmPanel';

/** Small coloured section header for visual hierarchy + fast scanning. */
/** The popup's Crawl site button, seeded with THIS lead's stored crawl (the one row every screen
 *  reads) so an existing crawl opens instead of silently re-running. */
function LeadDetailCrawlButton({ lead }: { lead: { id: string; website?: string | null } }) {
  // No onDone refetch: a stored crawl invalidates every ['lead-crawls'] read (this one included).
  const { crawl } = useLeadCrawl(lead.id);
  return <CrawlCheckButton lead={lead} crawl={crawl} from="lead_detail" />;
}

function SectionLabel({ icon: Icon, color, children }: { icon: React.ComponentType<{ className?: string }>; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Icon className={cn('h-3.5 w-3.5', color)} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{children}</span>
    </div>
  );
}

const CARD = 'rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm';

// Status options come from the shared PIPELINE_STATUS_OPTIONS (same list the
// Outreach row uses) — one source of truth so a lead offers identical options
// everywhere. Outcomes (Won/Lost) remain the footer Mark Paid/Lost actions.

/**
 * The COMPLETE lead row for the dialog, read by id when it opens (2026-09-27, site-wide speed pass).
 *
 * The lead handed in is a LIST row — the columns in src/lib/outreachLeadColumns.ts, not all 111. The
 * dialog reads (and writes back, read-modify-write) columns the list never downloads: payment,
 * project, delivery checklist/ref, remeasure dates, contact name. So it reads `*` for this one lead
 * and lays the list row ON TOP: the list row is the live one (every edit patches it, and updateLead
 * swaps in the full row it returns), so its fields win and the full row supplies everything else.
 * A demo lead has no database row; it is already complete.
 */
export function useFullLeadRow(lead: OutreachLead | null, open: boolean): { row: OutreachLead | null; error: string | null } {
  /* ⛔ A SALESPERSON'S FULL ROW IS THE SAFE VIEW'S ROW (2026-09-27): every column sales_leads has,
     named — no payment, delivery or admin-note column exists there, so none can reach the browser.
     The admin reads the table as before. */
  const { role } = useSubscription();
  const id = lead?.id ?? null;
  const demo = !!id && isDemoLead(id);
  const [fetched, setFetched] = useState<{ id: string; row: OutreachLead } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    if (!open || !id || demo) return;
    let cancelled = false;
    setError(null);
    const src = leadSourceFor(role);
    void (supabase as unknown as SupabaseClient).from(src.table).select(src.detailSelect).eq('id', id).maybeSingle().then(({ data, error: e }) => {
      if (cancelled) return;
      if (e || !data) { setError({ id, message: e?.message ?? 'lead not found' }); return; }
      setFetched({ id, row: data as unknown as OutreachLead });
    });
    return () => { cancelled = true; };
  }, [open, id, demo, role]);
  const row = useMemo<OutreachLead | null>(() => {
    if (!lead) return null;
    if (demo) return lead;
    if (!fetched || fetched.id !== lead.id) return null;
    return { ...fetched.row, ...lead };
  }, [lead, demo, fetched]);
  return { row, error: error && error.id === id ? error.message : null };
}

interface LeadDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: OutreachLead | null;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<OutreachLead | null> | void;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => Promise<OutreachLead | null> | void;
  onUpdateLead: (leadId: string, updates: Partial<OutreachLead>) => Promise<OutreachLead | null> | void;
  onNotesChange?: (leadId: string, notes: string) => Promise<OutreachLead | null> | void;
  onBusinessNameChange?: (leadId: string, name: string) => Promise<OutreachLead | null> | void;
  onImageChange?: (leadId: string, imageUrl: string | null) => Promise<OutreachLead | null> | void;
  fetchActivities?: (leadId: string) => Promise<OutreachActivity[]>;
  userId: string | undefined;
  campaignDefaultSaleType?: string | null;
  customStatuses?: { value: string; label: string }[];
  onAddCustomStatus?: () => void;
  /** Which page mounted the dialog — drives the cockpit's "Go to Inbox conversation" (Outreach
   *  only) and back-link labels. Defaults to 'outreach'. */
  context?: 'outreach' | 'inbox';
  /** Which workspace tab opens first. Default: Call (a paying client opens on Client for the admin). */
  initialTab?: WorkspaceTabInput;
  /** The person came to log a contact (Outreach's Call button): the Call tab opens with Log a contact expanded. */
  openLogContact?: boolean;
  /** Previous / Next through the list the popup was opened from (Focus Mode's stepping, moved here
   *  2026-10-01). Omitted = no stepping. ← / → step too, except while typing. */
  stepper?: LeadStepper | null;
}

export interface LeadStepper { index: number; total: number; onPrev?: () => void; onNext?: () => void }

/** True when a key press belongs to a field (typing), not to the popup. */
function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[role="listbox"],[role="menu"],[role="dialog"] [role="dialog"]');
}

function StepperBar({ s }: { s: LeadStepper }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 pr-12 text-xs" data-testid="lead-stepper">
      <button type="button" onClick={s.onPrev} disabled={!s.onPrev} className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label="Previous lead"><ChevronLeft className="h-4 w-4" />Previous</button>
      <span className="tabular-nums text-muted-foreground">{s.index + 1} of {s.total}</span>
      <button type="button" onClick={s.onNext} disabled={!s.onNext} className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label="Next lead">Next<ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

/* ⛔ SALES WORKSPACE V2 (Paul, 2026-10-05): FOUR TABS — CALL (everything needed while talking, the status and the ONE
   Next Action at the bottom), DETAILS (what was learned: campaign, services, website & domain, note), CLOSE (the
   one close UI — QuickClosePanel), HISTORY. CLIENT stays the admin's delivery tab. */
export type WorkspaceTab = 'call' | 'details' | 'close' | 'history' | 'client';
/** Older callers and links named the tabs Work / Scripts / Prospect (before v2): they open the matching new tab. */
export type WorkspaceTabInput = WorkspaceTab | 'work' | 'scripts' | 'prospect';
export function workspaceTabOf(t: WorkspaceTabInput | string | null | undefined): WorkspaceTab | undefined {
  if (t === 'work' || t === 'scripts' || t === 'call') return 'call';
  if (t === 'prospect' || t === 'details') return 'details';
  if (t === 'close' || t === 'history' || t === 'client') return t;
  return undefined;
}

export function LeadDetailDialog({
  open,
  onOpenChange,
  lead,
  onStatusChange,
  onNextActionChange,
  onUpdateLead,
  onNotesChange,
  onBusinessNameChange,
  onImageChange,
  fetchActivities,
  userId,
  campaignDefaultSaleType,
  customStatuses = [],
  onAddCustomStatus,
  context = 'outreach',
  initialTab,
  stepper,
  openLogContact = false,
}: LeadDetailDialogProps) {
  const { row: fullLead, error: fullLeadError } = useFullLeadRow(lead, open);
  if (!lead) return null;
  /* ⛔ NEVER THE BODY FROM A LIST ROW. The list downloads 41 columns (src/lib/outreachLeadColumns.ts);
     the body's editors seed their state ONCE, on mount, from fields the list does not carry (payment,
     project, delivery checklist, contact name…). Mounted on a list row they would open blank and
     save blanks. So it waits for the complete row. */
  if (!fullLead) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="sr-only">{lead.business_name}</DialogTitle>
          <DialogDescription className="sr-only">Loading the full lead</DialogDescription>
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            {fullLeadError
              ? `Could not load this lead (${fullLeadError}). Close and open it again.`
              : <><Loader2 className="h-4 w-4 animate-spin" /> Loading the full lead…</>}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[100dvh] max-h-[100dvh] sm:h-[88vh] sm:max-h-[88vh] overflow-hidden !flex flex-col !p-0 !gap-0 max-sm:rounded-none max-sm:border-0"
        onKeyDown={(e) => {
          if (!stepper || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typingIn(e.target)) return;
          if (e.key === 'ArrowRight' && stepper.onNext) { e.preventDefault(); stepper.onNext(); }
          else if (e.key === 'ArrowLeft' && stepper.onPrev) { e.preventDefault(); stepper.onPrev(); }
        }}>
        {stepper && stepper.total > 1 && <StepperBar s={stepper} />}
        <LeadDetailBody
          initialTab={initialTab}
          openLogContact={openLogContact}
          key={fullLead.id}
          lead={fullLead}
          onStatusChange={onStatusChange}
          onNextActionChange={onNextActionChange}
          onUpdateLead={onUpdateLead}
          onNotesChange={onNotesChange}
          onBusinessNameChange={onBusinessNameChange}
          onImageChange={onImageChange}
          fetchActivities={fetchActivities}
          userId={userId}
          campaignDefaultSaleType={campaignDefaultSaleType}
          customStatuses={customStatuses}
          onAddCustomStatus={onAddCustomStatus}
          context={context}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface LeadDetailBodyProps extends Omit<LeadDetailDialogProps, 'open' | 'onOpenChange' | 'lead'> {
  lead: OutreachLead;
  onClose: () => void;
}

function LeadDetailBody({
  lead,
  onStatusChange,
  onNextActionChange,
  onUpdateLead,
  onNotesChange,
  onBusinessNameChange,
  onImageChange,
  fetchActivities,
  userId,
  campaignDefaultSaleType,
  customStatuses = [],
  onAddCustomStatus,
  context = 'outreach',
  onClose,
  initialTab,
  openLogContact = false,
}: LeadDetailBodyProps) {
  const permsForTab = useLeadPermissions();
  /* A paying client opens on Client for the admin (delivery is the work then); everyone else on Call. */
  const [tab, setTab] = useState<WorkspaceTab>(() => workspaceTabOf(initialTab) ?? (permsForTab.clientDelivery && isPaidLead(lead) ? 'client' : 'call'));
  const bodyRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const aiToolsRef = useRef<HTMLDetailsElement>(null);
  const [moreTools, setMoreTools] = useState(false);
  /* The script's "Log this call": the bottom of this same Call tab, with Log a contact open (remounted by key). */
  const [logCallRequested, setLogCallRequested] = useState(0);
  const logThisCall = () => { setLogCallRequested((n) => n + 1); requestAnimationFrame(() => actionsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
  /* "Run the AI check" on the evidence card: the AI check tools just below, opened. */
  const openAiTools = () => { if (aiToolsRef.current) { aiToolsRef.current.open = true; aiToolsRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' }); } };
  const goTab = (next: WorkspaceTab) => { setTab(next); if (bodyRef.current) bodyRef.current.scrollTop = 0; };

  const [notes, setNotes] = useState(lead.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);
  const [emailCopied, setEmailCopied] = useState(false);
  // Inline edit for the contact fields (phone/email/website/address) — mirrors the
  // name-edit UX (Pencil → input + Check/X). One field editable at a time.
  const [editingField, setEditingField] = useState<null | 'phone' | 'email' | 'website' | 'address'>(null);
  const [editValue, setEditValue] = useState('');
  /* ⛔ THE SAME DIALOG FOR BOTH ROLES (2026-09-27). A salesperson gets everything that works or closes
     a lead — status (their allowed stages), the CRM panel, contact details, WhatsApp outreach, the
     call playbook, voice-note script, sign-up link — and not the admin's record editing, client
     delivery, payment or private-note sections, whose data the safe view never sends them anyway. */
  const perms = useLeadPermissions();
  // The sales state at the top — the same reading Focus Mode, Outreach and the Inbox draw.
  const salesState = useLeadSalesState(isDemoLead(lead.id) ? '' : lead.id);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  /* ── PAYMENT. Lives here because the Paid Clients page (its previous and only home) is gone, and
        without an editor there would be no way to correct an amount that arrived wrong. ── */
  const [amountPaid, setAmountPaid] = useState<string>(lead.amount_paid?.toString() ?? '');
  const [paidFor, setPaidFor] = useState(lead.paid_for || '');
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(
    lead.payment_date ? new Date(lead.payment_date) : undefined
  );
  const [paymentDatePopoverOpen, setPaymentDatePopoverOpen] = useState(false);
  const [showPaidPopup, setShowPaidPopup] = useState(false);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);


  // Activity log — loaded once on open.
  useEffect(() => {
    if (!activitiesLoaded && fetchActivities && !isDemoLead(lead.id)) {
      setActivitiesLoaded(true);
      fetchActivities(lead.id).then(setActivities).catch(() => {});
    }
  }, [activitiesLoaded, fetchActivities, lead.id]);

  const handleSaveName = async () => {
    if (editedName.trim() && editedName.trim() !== lead.business_name) {
      if (onBusinessNameChange) await onBusinessNameChange(lead.id, editedName.trim());
      else await onUpdateLead(lead.id, { business_name: editedName.trim() });
    }
    setEditingName(false);
  };

  type ContactField = 'phone' | 'email' | 'website' | 'address';
  const startEditField = (field: ContactField, current: string | null) => {
    setEditingField(field);
    setEditValue(current ?? '');
  };
  const cancelEditField = () => setEditingField(null);
  const saveField = async (field: ContactField) => {
    // Store raw-trimmed for ALL fields (no normalisation / E.164 / URL reformat) —
    // existing leads store raw-trimmed and the send-time helpers expect that.
    const trimmed = editValue.trim() || null;
    const current = ((lead[field] as string | null) ?? null);
    if (trimmed !== current) {
      // Phone-change guard: only on a queued or already-messaged lead. The next send
      // reads phone from the lead row, and replies from a new number start a new thread.
      if (
        field === 'phone' &&
        (lead.status === 'queued' || !!lead.whatsapp_sent_at) &&
        !window.confirm(
          'Changing the number will message the new number on the next send and future replies start a new conversation thread. Continue?'
        )
      ) {
        return;
      }
      await onUpdateLead(lead.id, { [field]: trimmed } as Partial<OutreachLead>);
    }
    setEditingField(null);
  };

  const handleSaveNotes = async () => {
    if (onNotesChange) await onNotesChange(lead.id, notes);
    else await onUpdateLead(lead.id, { notes });
    setNotesDirty(false);
    setNotesSaved(true);
    setIsEditingNotes(false);
    setTimeout(() => setNotesSaved(false), 2000);
    window.dispatchEvent(new CustomEvent('demo-checklist-track-note-saved'));
  };

  const handleCancelNotes = () => {
    setNotes(lead.notes || '');
    setNotesDirty(false);
    setIsEditingNotes(false);
  };

  const copyEmail = async () => {
    if (!lead.email) return;
    try {
      await navigator.clipboard.writeText(lead.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    } catch { /* ignore */ }
  };


  // Mark Paid: Payment Received + leaves Track (clears is_potential_work).
  const handleMarkPaid = async () => {
    await onStatusChange(lead.id, 'payment_received' as LeadStatus);
    await onUpdateLead(lead.id, { is_potential_work: false } as Partial<OutreachLead>);
    const seenKey = 'leadfinder_seen_paid_popup';
    if (!localStorage.getItem(seenKey)) {
      localStorage.setItem(seenKey, '1');
      setShowPaidPopup(true);
    }
    onClose();
  };

  return (
    <>
      {/* ── Header: name + glanceable pills (does not scroll) ── */}
      <div className="shrink-0 border-b border-border/60 bg-card/30 px-5 pt-5 pb-3.5">
        <div className="flex items-start justify-between gap-3 pr-9">
          <DialogTitle className="flex items-center gap-2 min-w-0 text-lg">
            {editingName ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-8 text-base font-semibold px-2 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') { setEditedName(lead.business_name); setEditingName(false); }
                  }}
                />
                <button onClick={handleSaveName} className="h-7 w-7 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditedName(lead.business_name); setEditingName(false); }} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <span className="truncate">{lead.business_name}</span>
                {!isDemoLead(lead.id) && <StarToggle leadId={lead.id} on={!!lead.is_potential_work} canWriteRow={perms.editLeadRecord} />}
                {perms.editLeadRecord && <button onClick={() => setEditingName(true)} className="h-5 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground rounded transition-colors shrink-0" title="Edit name">
                  <Pencil className="h-3.5 w-3.5" />
                </button>}
              </>
            )}
          </DialogTitle>
          {/* Lead → its WhatsApp conversation (the one Inbox deep link). Not shown inside the Inbox,
              where the conversation is already open beside this panel. */}
          {/* QUICK CLOSE (2026-09-29): take the £99 on the call — every context (Outreach, the WhatsApp Inbox). */}
          <div className="flex shrink-0 items-center gap-1.5">
          {/* ⛔ A TAP IS NOT A CALL: tel: opens the phone's own dialler and writes nothing. What happened is logged at
              the bottom of the Call tab (lead_log_contact) — that is the only record of a call. */}
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" title={`Call ${lead.phone}`} data-testid="workspace-call">
              <PhoneCall className="h-3.5 w-3.5" /><span className="hidden sm:inline">Call</span>
            </a>
          )}
          {context !== 'inbox' && lead.phone && (
            <Link to={whatsAppLinkForLead(lead.id)} onClick={() => onClose?.()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-500/20 dark:text-blue-300" aria-label={`Open ${lead.business_name} on WhatsApp`}>
              <MessageCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">WhatsApp</span>
            </Link>
          )}
          </div>
        </div>

        <DialogDescription className="sr-only">Lead detail, pipeline status and notes for {lead.business_name}</DialogDescription>

        {/* ── WHERE THIS LEAD STANDS (declutter pass, 2026-10-01; first built in the UI cleanup pass) ────────
            Three concepts, kept apart, each drawn ONCE (src/lib/workspaceHeader.ts):
              STATUS      — the ONE solid status pill, the same control as the Outreach row and the Inbox
                            (PipelineStatusSelect → pillStatusOf: a reached lead reads Contacted, an attempt
                            does not). The sales-state pill joins it only when it adds a fact the pill, the
                            star and the chips do not (a meeting that is NOT the Next Action, Won, Client,
                            Not interested by a logged call) — never "Meeting booked" above the same meeting
                            in the Next Action bar.
              NEXT ACTION — the bar: the display of the one stored next action; Edit opens the Work tab's
                            editor. The owner sits with the status; the last contact is a quiet line.
              TOOLS       — how to reach them and the everyday tools; the less frequent ones (crawl, the
                            welcome pack before they pay, the site check, the channel) under More tools.
            ⛔ REMOVED 2026-09-29: the Playbook pill (the delivery checklist — unused, Paul). ── */}
        {(() => {
          const shown = pipelineStatusLabel(pillStatusOf(lead.status, salesState.view));
          const statusPill = <span className="inline-flex h-7 items-center rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-semibold" data-testid="workspace-status-pill" title="Change it at the bottom of the Call tab">{shown}</span>;
          const extraState = salesState.view && headerStateShown(salesState.view, shown, salesState.row)
            ? <SalesStatePill view={salesState.view} /> : null;
          if (isDemoLead(lead.id)) return <div className="mt-3 flex flex-wrap items-center gap-2">{statusPill}<NextActionPill lead={lead} /></div>;
          /* ⛔ ONE NEXT ACTION (v2): not drawn here — its one display and editor are at the bottom of the Call tab. */
          return <LeadStateStrip leadId={lead.id} status={<span className="inline-flex flex-wrap items-center gap-1.5">{statusPill}{extraState}</span>} />;
        })()}

        {lead.email && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-border/40 pt-2 text-xs" data-testid="workspace-tools">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a href={`mailto:${lead.email}`} className="truncate text-foreground/80 hover:text-primary hover:underline">{lead.email}</a>
              <button type="button" onClick={copyEmail} className="shrink-0 text-muted-foreground/60 hover:text-foreground" title="Copy email" aria-label="Copy email">
                {emailCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
          </div>
        )}
      </div>

      {/* ══ THE PROSPECT WORKSPACE (2026-09-28, Paul: "open one prospect and do the job"). ONE dialog
          for both roles and both pages (Outreach and the Inbox mount this same component), in tabs so
          the call tools are never buried under client delivery: WORK (log the call, next action, note,
          sign-up link, WhatsApp), SCRIPTS (call script / voice note), PROSPECT (who they are, the AI
          check, contact), HISTORY (everything recorded), CLIENT (admin only: delivery, payment, private
          note). Every write in here is the same server function Outreach uses. Full screen on a phone. ══ */}
      <QuickCloseNav.Provider value={{ openClose: () => goTab('close') }}>
      <Tabs value={tab} onValueChange={(v) => goTab(v as WorkspaceTab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className={cn('mx-3 mt-2.5 grid h-9 shrink-0 sm:mx-5', perms.clientDelivery ? 'grid-cols-5' : 'grid-cols-4')}>
          <TabsTrigger value="call" className="text-xs">Call</TabsTrigger>
          <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
          <TabsTrigger value="close" className="text-xs">Close</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
          {perms.clientDelivery && <TabsTrigger value="client" className="text-xs">Client</TabsTrigger>}
        </TabsList>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-3 py-3 sm:px-5 sm:py-4">
          {/* ── CALL: A evidence → B script → C why it matters → D what Findable does → E how we build → F questions
                (the playbook, read-only), then the AI check tools, the recent WhatsApp, and G STATUS + THE NEXT ACTION. ── */}
          <TabsContent value="call" className="mt-0 space-y-4" data-testid="workspace-call">
            {!isDemoLead(lead.id) && <ColdCallPlaybookInline leadId={lead.id} initialScript="call" onLogCall={logThisCall} onRunCheck={openAiTools} />}
            {!isDemoLead(lead.id) && (
              <details ref={aiToolsRef} className="rounded-xl border border-border/60 bg-card/60 px-3.5 py-2.5" data-testid="ai-check-tools">
                <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI check — run, re-run, report, earlier checks</summary>
                <div className="mt-2.5"><LeadHookPanel leadId={lead.id} /></div>
              </details>
            )}
            {!isDemoLead(lead.id) && context !== 'inbox' && <RecentWhatsApp leadId={lead.id} />}
            <div ref={actionsRef} className="scroll-mt-2" data-testid="call-actions">
              {!isDemoLead(lead.id) && <LeadWorkPanel key={`call-${logCallRequested}`} part="call" leadId={lead.id} onRemoved={onClose} logContactOpen={openLogContact || logCallRequested > 0}
                statusControl={
                  <PipelineStatusSelect value={lead.status} stage={salesState.view} onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}
                    askReasonFor={{ leadId: lead.id, businessName: lead.business_name }}
                    triggerProps={{ 'aria-label': 'Status', 'data-testid': 'workspace-status' }} />
                } />}
            </div>
          </TabsContent>

          {/* ── DETAILS: what was learned on the call, recorded — never a script. ── */}
          <TabsContent value="details" className="mt-0 space-y-4" data-testid="workspace-details">
            <ProspectFacts lead={lead} />
            {!isDemoLead(lead.id) && <ProspectProfilePanel leadId={lead.id} />}
            {!isDemoLead(lead.id) && <LeadWorkPanel part="details" leadId={lead.id} onRemoved={onClose} />}
            {!isDemoLead(lead.id) && <WhatsAppLeadControls lead={lead} onUpdate={onUpdateLead} />}
            {!isDemoLead(lead.id) && <SocialProfilesPanel lead={lead} />}
            {!isDemoLead(lead.id) && (
              <section className={CARD} data-testid="details-tools">
                <button type="button" onClick={() => setMoreTools((v) => !v)} aria-expanded={moreTools} data-testid="more-tools-toggle"
                  className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                  <Wrench className="h-3.5 w-3.5" />More tools<ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', moreTools && 'rotate-180')} />
                </button>
                {moreTools && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs" data-testid="more-tools">
                    {!lead.email && perms.enrichLeads && <FindEmailButton leadId={lead.id} website={lead.website} />}
                    <SocialLinks lead={lead} withFind />
                    {perms.crawlOwnLead && <LeadDetailCrawlButton lead={lead} />}
                    {perms.clientDelivery && <WelcomePackButton leadId={lead.id} businessName={lead.business_name} />}
                    {perms.clientDelivery && <LeadSiteCheckButton lead={lead} />}
                    {perms.editLeadRecord && (
                      <Select value={lead.contact_method || ''} onValueChange={(v) => onUpdateLead(lead.id, { contact_method: v } as Partial<OutreachLead>)}>
                        <SelectTrigger className="h-7 w-auto gap-1 border-border/60 px-2 text-xs" aria-label="Preferred channel">
                          <span className="text-muted-foreground">Preferred channel:</span>
                          <span className="font-medium">{CONTACT_METHOD_OPTIONS.find((o) => o.value === lead.contact_method)?.label ?? 'not set'}</span>
                        </SelectTrigger>
                        <SelectContent className="pointer-events-auto">
                          {CONTACT_METHOD_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </section>
            )}
            {(() => {
              /* Social profiles live in ONE place, SocialProfilesPanel above (2026-09-30) — never a second
                 list of the same links here. This card is the admin's editable contact fields only. */
              // Editable contact fields — rendered even when empty so a missing value
              // can be added. `hrefFor` keeps the mailto/tel/open affordance in view mode.
              const editableFields = [
                { field: 'email' as const, Icon: Mail, label: 'Email', value: lead.email, color: 'text-violet-400', external: false, hrefFor: (v: string) => `mailto:${v}` },
                { field: 'website' as const, Icon: Globe, label: 'Website', value: lead.website, color: 'text-emerald-500', external: true, hrefFor: (v: string) => v },
                { field: 'phone' as const, Icon: Phone, label: 'Phone', value: lead.phone, color: 'text-sky-400', external: false, hrefFor: (v: string) => `tel:${v}` },
                { field: 'address' as const, Icon: MapPin, label: 'Address', value: lead.address, color: 'text-amber-500', external: false, hrefFor: null },
              ];
              /* A salesperson cannot edit these, and the facts card above already shows them. */
              if (!perms.editLeadRecord) return null;
              return (
                <section className={CARD}>
                  <SectionLabel icon={Share2} color="text-blue-400">Contact details</SectionLabel>
                  <ul className="space-y-1.5">
                    {(perms.editLeadRecord ? editableFields : []).map(({ field, Icon, label, value, color, external, hrefFor }) => {
                      const isEditing = editingField === field;
                      return (
                        <li key={field} className="flex items-center gap-2 text-xs">
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                          <span className="w-16 shrink-0 text-muted-foreground/70">{label}</span>
                          {isEditing ? (
                            <>
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                className="h-7 flex-1 min-w-0 px-2 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveField(field);
                                  if (e.key === 'Escape') cancelEditField();
                                }}
                              />
                              <button onClick={() => saveField(field)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-green-500 hover:bg-green-500/10" title="Save">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={cancelEditField} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40" title="Cancel">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {value ? (
                                hrefFor ? (
                                  <a
                                    href={hrefFor(value)}
                                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                    className="min-w-0 flex-1 truncate text-foreground/80 hover:text-primary hover:underline"
                                    title={value}
                                  >
                                    {external ? value.replace(/^https?:\/\//, '').replace(/\/$/, '') : value}
                                  </a>
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-foreground/80" title={value}>{value}</span>
                                )
                              ) : (
                                <span className="min-w-0 flex-1 truncate italic text-muted-foreground/40">Not set</span>
                              )}
                              {perms.editLeadRecord && <button
                                onClick={() => startEditField(field, value)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground"
                                title={`Edit ${label.toLowerCase()}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}
          </TabsContent>

          {/* ── CLOSE: the one close UI (QuickClosePanel), then — before payment only — the self-service sign-up link. ── */}
          <TabsContent value="close" className="mt-0 space-y-4" data-testid="workspace-close">
            {!isDemoLead(lead.id) && <QuickClosePanel leadId={lead.id} active={tab === 'close'} />}
            {!isDemoLead(lead.id) && !isPaidLead(lead) && (
              <div className="space-y-1.5" data-testid="close-self-service">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Or let them do it themselves</p>
                <p className="text-xs text-muted-foreground">The sign-up link takes them through the same questions, the client agreement and the same £99 payment page. The full setup questions come from Paul after they pay.</p>
                <OnboardingLinkCard lead={lead} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-0 space-y-4" data-testid="workspace-history">
            {/* ONE timeline (2026-09-29): the CRM activity, the sign-up link events and the older
                outreach_activities rows (lead added, status changes) — no second "Activity" card. */}
            {!isDemoLead(lead.id) && <LeadHistoryPanel leadId={lead.id} older={activities} />}
          </TabsContent>

          {perms.clientDelivery && (
          <TabsContent value="client" className="mt-0 space-y-4" data-testid="workspace-client">
        {perms.clientDelivery && !isDemoLead(lead.id) && (
          <LeadDeliveryCockpit lead={lead} onUpdateLead={onUpdateLead} context={context} onClose={onClose} />
        )}
            {perms.clientDelivery && !isDemoLead(lead.id) && (
              <LeadQuestionnaireSection lead={lead} onUpdateLead={onUpdateLead} />
            )}
            {perms.clientDelivery && (
            <section className={CARD}>
              <SectionLabel icon={PoundSterling} color="text-emerald-500">Payment</SectionLabel>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">Amount paid (£)</label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    onBlur={async () => {
                      const val = parseAmountPaid(amountPaid);
                      if (val !== (lead.amount_paid ?? null)) {
                        await onUpdateLead(lead.id, { amount_paid: val } as Partial<OutreachLead>);
                      }
                    }}
                    className="h-8 text-xs border-border/50"
                    placeholder="Not paid"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">Payment date</label>
                  <Popover open={paymentDatePopoverOpen} onOpenChange={setPaymentDatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-8 w-full justify-start px-2 text-xs font-normal border-border/50">
                        <CalendarIconLucide className="mr-1.5 h-3 w-3 shrink-0" />
                        {paymentDate ? format(paymentDate, 'd MMM yyyy') : <span className="text-muted-foreground/50">Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={async (d) => {
                          setPaymentDate(d);
                          setPaymentDatePopoverOpen(false);
                          await onUpdateLead(lead.id, { payment_date: d ? format(d, 'yyyy-MM-dd') : null } as Partial<OutreachLead>);
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="mt-2.5">
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Paid for</label>
                <Input
                  value={paidFor}
                  onChange={(e) => setPaidFor(e.target.value)}
                  onBlur={async () => {
                    const val = paidFor.trim() || null;
                    if (val !== (lead.paid_for ?? null)) {
                      await onUpdateLead(lead.id, { paid_for: val } as Partial<OutreachLead>);
                    }
                  }}
                  className="h-8 text-xs border-border/50"
                  placeholder="e.g. Findable setup"
                />
              </div>
            </section>
            )}

            {perms.privateNote && (
            <section className={CARD}>
              <SectionLabel icon={StickyNote} color="text-amber-400">Notes</SectionLabel>
              {/* Private note */}
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  Private <span className="text-muted-foreground/40 font-normal">· only you</span>
                </div>
                {isEditingNotes ? (
                  <div className="space-y-1.5">
                    <Textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                      rows={2}
                      className="resize-none text-xs border-border/50 min-h-[52px]"
                      placeholder="Add a private note..."
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground" onClick={handleCancelNotes}>Cancel</Button>
                      <Button size="sm" className="h-6 text-[11px] gap-1" onClick={handleSaveNotes}><Save className="h-2.5 w-2.5" /> Save</Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-start gap-2 cursor-pointer rounded-md p-2 border border-border/40 bg-background/40 hover:bg-muted/30 transition-colors min-h-[36px]"
                    onClick={() => setIsEditingNotes(true)}
                  >
                    <div className="flex-1 min-w-0">
                      {notes ? (
                        <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">{notes}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground/30 italic">Click to add a private note...</span>
                      )}
                    </div>
                    {notesSaved && (
                      <span className="text-[10px] text-green-500 shrink-0 flex items-center gap-0.5"><Check className="h-2.5 w-2.5" /> Saved</span>
                    )}
                  </div>
                )}
              </div>
              {/* REMOVED 2026-08-18: Team notes — confirmed waste. Private note stays. */}
            </section>
            )}

          </TabsContent>
          )}
        </div>
      </Tabs>
      </QuickCloseNav.Provider>

      {/* Footer: Mark Paid is my revenue/convert action and shows ONLY while UNPAID — once
          amount_paid > 0 it hides (the Payment block is then the editor). Mark Lost removed from
          the detail view (2026-08-18); a lost lead is set via the status control. When paid there
          is nothing to show, so the footer bar is absent rather than empty.
          ⛔ CONTEXTUAL (declutter pass, 2026-10-01): the big green button only at a payment stage — a price
          given, the deal agreed, delivery running with no amount recorded (workspaceHeader.markPaidIsMain).
          Before that the same action is a small one in a thin footer: still one tap, never the loudest thing
          on a lead that is merely New, Contacted or has a meeting booked. Same handler, same writes. */}
      {perms.clientDelivery && !isPaidLead(lead) && (
        markPaidIsMain(lead.status, salesState.view) ? (
          <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border/60 bg-card/30 px-5 py-3" data-testid="mark-paid-main">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkPaid}>
              <Check className="h-3.5 w-3.5 mr-1.5" /> Mark Paid
            </Button>
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-end border-t border-border/40 px-4 py-1" data-testid="mark-paid-quiet">
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-300" onClick={handleMarkPaid} title="Record that they have paid">
              <Check className="h-3 w-3" /> Mark paid
            </Button>
          </div>
        )
      )}

      {/* Payment Received popup */}
      <Dialog open={showPaidPopup} onOpenChange={setShowPaidPopup}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <Check className="h-5 w-5" />
              Marked as Paid
            </DialogTitle>
          </DialogHeader>
          {/* ⚠️ THIS USED TO SEND THE OPERATOR TO A PAGE THAT NO LONGER EXISTS. Paying customers
              stay in Outreach and the Inbox now; the amount is recorded in the Payment section of
              this dialog, and Outreach's "Paid (money in)" filter is how you find them again.
              ⛔ AND THE STATUS ALONE DOES NOT MAKE THEM PAID — `amount_paid > 0` does. Saying so
              here is the difference between the operator recording the money and assuming the
              status did it for them. */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            They stay in <strong>Outreach</strong> and the <strong>Inbox</strong> — nothing moves.
            Enter what they paid in the <strong>Payment</strong> section of this dialog: the
            <strong> Paid (money in)</strong> filter on Outreach matches the amount, not the status,
            so a customer with no amount recorded will not show up there.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowPaidPopup(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* THE STAR — the one interest mark, now also in the workspace header (2026-10-01; the Inbox header has the
   same toggle). lead_mark_interested for both roles: History records Starred / Unstarred. Shown on only after
   the server said yes. */
function StarToggle({ leadId, on, canWriteRow }: { leadId: string; on: boolean; canWriteRow: boolean }) {
  const { toast } = useToast();
  const [state, setState] = useState(on);
  const [busy, setBusy] = useState(false);
  useEffect(() => setState(on), [on]);
  return (
    <button type="button" disabled={busy} aria-pressed={state} data-testid="workspace-star"
      aria-label={state ? 'Remove the interested star' : 'Mark as interested'} title={state ? 'Interested — click to remove the star' : 'Mark as interested (star)'}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await markLeadInterested(leadId, canWriteRow, !state);
          if (!r.ok) { toast({ title: state ? 'Could not remove the star' : 'Could not mark interested', description: r.error, variant: 'destructive' }); return; }
          setState(!state);
          notifyLeadChanged(leadId, 'workspace-star', { is_potential_work: !state });
        } finally { setBusy(false); }
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50">
      <Star className={state ? 'h-4 w-4 fill-amber-400 text-amber-500' : 'h-4 w-4 text-muted-foreground/60'} />
    </button>
  );
}
