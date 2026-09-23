import { useState, useEffect, useRef, Fragment } from 'react';
import { isDemoLead } from '@/lib/demoLeads';
import { Clock, ExternalLink, StickyNote, Save, Check, X, Tag, Pencil, Calendar as CalendarIconLucide, Route, Briefcase, PoundSterling, Mail, Copy, Share2, Facebook, Instagram, Globe, Phone, MapPin, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LeadQuestionnaireSection } from '@/components/LeadQuestionnaireSection';
import { LeadSiteCheckButton } from '@/components/LeadSiteCheckButton';
import { CrawlCheckButton } from '@/components/CrawlCheckButton';
import { useLeadCrawl } from '@/hooks/useLeadCrawls';
import { WelcomePackButton } from '@/components/WelcomePackButton';
import { ColdCallPlaybookButton } from '@/components/ColdCallPlaybook';
import { LeadDeliveryCockpit } from '@/components/LeadDeliveryCockpit';
import { Badge } from '@/components/ui/badge';
import { ContactMethodBadge } from '@/components/ContactMethodBadge';
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
import { format, formatDistanceToNow, startOfDay } from 'date-fns';
import { parseAmountPaid, isPaidLead } from '@/lib/leadPayment';
import { SALE_TYPES, SALE_TYPE_LABELS, resolveSaleType, type SaleType } from '@/lib/saleType';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType, ContactMethod, PipelineStatus } from '@/types/outreach';
import { CONTACT_METHOD_OPTIONS, PIPELINE_STATUS_OPTIONS, isSentStatus, isRepliedStatus, isSiteSentStatus } from '@/types/outreach';
import { PipelineStatusBadge } from '@/components/PipelineStatusBadge';
import { WhatsAppLeadControls } from '@/components/WhatsAppLeadControls';
import { OnboardingLinkCard } from '@/components/OnboardingLinkCard';
import { useCustomNextActions, getLeadCustomAction, setLeadCustomAction } from '@/hooks/useCustomNextActions';
import { cn } from '@/lib/utils';

/* ───────── constants (ported from PotentialWork) ───────── */

export const DEFAULT_POTENTIAL_WORK_STATUSES: { value: string; label: string }[] = [
  { value: 'qualified', label: 'Call Booked' },
  { value: 'discovery_call_booked', label: 'Sent Quote' },
  { value: 'proposal_sent', label: 'Sent Draft' },
  { value: 'reviewing_proposal', label: 'Waiting for Feedback' },
  { value: 'revision_requested', label: 'Changes Requested' },
  { value: 'paid', label: 'Invoice Sent' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'closed_lost', label: 'Not Going Ahead' },
];

/* Map legacy DB statuses → new pipeline statuses */
const LEGACY_STATUS_MAP: Record<string, string> = {
  interested: 'qualified',
  paid_for_draft: 'paid',
  reviewing_draft: 'reviewing_proposal',
  completed: 'paid',
  wants_draft: 'proposal_sent',
  on_hold: 'qualified',
};

export const PIPELINE_STAGES = DEFAULT_POTENTIAL_WORK_STATUSES.map((s) => s.value);

export const mapLegacyStatus = (status: string): string => LEGACY_STATUS_MAP[status] || status;

/* Track Leads pipeline actions — mapped to DB enum values */
// The barber-outreach Next Action list. Each option carries a dbValue that is a
// valid NextActionType (we reuse existing DB enum values rather than adding new
// columns); LEGACY_ACTION_MAP below maps every DB value back to exactly one of
// these keys so a lead always renders as one of the five (never blank/wrong).
const TRACK_NEXT_ACTION_OPTIONS: { value: string; label: string; dbValue: NextActionType }[] = [
  { value: 'none', label: 'None', dbValue: 'none' },
  { value: 'follow_up', label: 'Follow Up', dbValue: 'follow_up' },
  { value: 'send_link', label: 'Send Link', dbValue: 'send_draft' },
  { value: 'book_call', label: 'Book Call', dbValue: 'call' },
  { value: 'check_in', label: 'Check In', dbValue: 'send_follow_up' },
  { value: 'send_invoice', label: 'Send Invoice', dbValue: '2nd_follow_up' },
];

/* Map every DB next_action value → one of the five Track action keys above, so
   stored/auto-filled actions always round-trip to a valid option. */
const LEGACY_ACTION_MAP: Record<string, string> = {
  follow_up: 'follow_up',
  send_draft: 'send_link',
  call: 'book_call',
  send_follow_up: 'check_in',
  '2nd_follow_up': 'send_invoice',
  // Older / Outreach-side enum values fold to sensible equivalents.
  send_initial_text: 'send_link',
  send_voice_note: 'follow_up',
  check_3_day_removal: 'follow_up',
  remove_if_no_reply: 'follow_up',
};

const mapLegacyAction = (action: string | null): string => {
  if (!action || action === 'none') return 'none';
  return LEGACY_ACTION_MAP[action] || action;
};

const TRACK_ACTION_KEY_PREFIX = 'leadfinder_track_action_';

const getTrackActionForLead = (leadId: string): string | null => {
  try {
    const raw = localStorage.getItem(`${TRACK_ACTION_KEY_PREFIX}${leadId}`);
    return raw || null;
  } catch {
    return null;
  }
};

// The UI choice is stored device-locally; an older build may have saved a key
// that no longer exists in TRACK_NEXT_ACTION_OPTIONS. Only trust it if it's still
// a valid option — otherwise callers fall back to the DB value (mapLegacyAction),
// which always resolves to one of the five. Keeps the pill from showing blank.
const getValidTrackActionForLead = (leadId: string): string | null => {
  const raw = getTrackActionForLead(leadId);
  return raw && TRACK_NEXT_ACTION_OPTIONS.some((o) => o.value === raw) ? raw : null;
};

const setTrackActionForLead = (leadId: string, actionKey: string | null) => {
  try {
    if (actionKey && actionKey !== 'none') {
      localStorage.setItem(`${TRACK_ACTION_KEY_PREFIX}${leadId}`, actionKey);
    } else {
      localStorage.removeItem(`${TRACK_ACTION_KEY_PREFIX}${leadId}`);
    }
  } catch {}
};

// Keyed by Track action key (the value in TRACK_NEXT_ACTION_OPTIONS).
const NEXT_ACTION_COLORS: Record<string, string> = {
  follow_up: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent',
  send_link: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent',
  book_call: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent',
  check_in: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent',
  send_invoice: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent',
  none: 'bg-muted text-muted-foreground border-border/50',
};

const STATUS_COLORS: Record<string, string> = {
  qualified: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent',
  discovery_call_booked: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent',
  proposal_sent: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent',
  reviewing_proposal: 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))] border-transparent',
  revision_requested: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))] border-transparent',
  paid: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent',
  payment_received: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent',
  closed_lost: 'bg-[hsl(var(--badge-not-interested))] text-[hsl(var(--badge-not-interested-fg))] border-transparent',
  interested: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent',
  not_interested: 'bg-[hsl(var(--badge-not-interested))] text-[hsl(var(--badge-not-interested-fg))] border-transparent',
};

/* ───────── helpers ───────── */

const getDueLabel = (nextActionDate: string | null, nextAction: NextActionType | null) => {
  if (!nextActionDate || !nextAction || nextAction === 'none') return null;
  const d = startOfDay(new Date(nextActionDate));
  const today = startOfDay(new Date());
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, cls: 'text-red-500 bg-red-500/10 border-red-500/25' };
  if (diffDays === 0) return { text: 'Today', cls: 'text-amber-500 bg-amber-500/10 border-amber-500/25' };
  if (diffDays === 1) return { text: 'Tomorrow', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  return { text: `${diffDays}d`, cls: 'text-muted-foreground bg-muted border-border/50' };
};

const getStatusLabel = (status: string, customStatuses: { value: string; label: string }[]) => {
  const mapped = mapLegacyStatus(status);
  const found = [...DEFAULT_POTENTIAL_WORK_STATUSES, ...customStatuses].find((s) => s.value === mapped);
  return found?.label || status;
};

const getMappedStatusColor = (status: string): string => {
  const mapped = mapLegacyStatus(status);
  return STATUS_COLORS[mapped] || STATUS_COLORS[status] || 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent';
};

const getStageIndex = (status: string): number => {
  const mapped = mapLegacyStatus(status);
  return PIPELINE_STAGES.indexOf(mapped);
};

const PROJECT_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_on_client', label: 'Waiting On Client' },
  { value: 'completed', label: 'Completed' },
];


/** Small coloured section header for visual hierarchy + fast scanning. */
/** The popup's Crawl site button, seeded with THIS lead's stored crawl (the one row every screen
 *  reads) so an existing crawl opens instead of silently re-running. */
function LeadDetailCrawlButton({ lead }: { lead: { id: string; website?: string | null } }) {
  const { crawl, refetch } = useLeadCrawl(lead.id);
  return <CrawlCheckButton lead={lead} crawl={crawl} onDone={() => void refetch()} from="lead_detail" />;
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
}: LeadDetailDialogProps) {
  if (!lead) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden !flex flex-col !p-0 !gap-0">
        <LeadDetailBody
          key={lead.id}
          lead={lead}
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
}: LeadDetailBodyProps) {
  const effectiveSaleType: SaleType = resolveSaleType(lead.sale_type, campaignDefaultSaleType);

  const [notes, setNotes] = useState(lead.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const customLabel = getLeadCustomAction(lead.id);
  const [nextAction, setNextAction] = useState<string>(
    customLabel ? `custom::${customLabel}` : getValidTrackActionForLead(lead.id) || mapLegacyAction(lead.next_action || 'none')
  );
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);
  const [emailCopied, setEmailCopied] = useState(false);
  // Inline edit for the contact fields (phone/email/website/address) — mirrors the
  // name-edit UX (Pencil → input + Check/X). One field editable at a time.
  const [editingField, setEditingField] = useState<null | 'phone' | 'email' | 'website' | 'address'>(null);
  const [editValue, setEditValue] = useState('');
  const { customActions, addAction } = useCustomNextActions();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [showAddCustomAction, setShowAddCustomAction] = useState(false);
  const [newCustomAction, setNewCustomAction] = useState('');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [potentialRevenue, setPotentialRevenue] = useState<string>(lead.potential_revenue?.toString() || '');
  const [projectOverview, setProjectOverview] = useState(lead.project_overview || '');
  const [projectStatus, setProjectStatus] = useState(lead.project_status || 'not_started');
  const [deliveryNotes, setDeliveryNotes] = useState(lead.delivery_notes || '');
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

  const handleNextActionChange = async (v: string) => {
    if (v === '__add_custom_action__') {
      setShowAddCustomAction(true);
      return;
    }
    setNextAction(v);
    const isCustom = v.startsWith('custom::');
    let dbAction: NextActionType;
    if (isCustom) {
      dbAction = 'follow_up';
      setLeadCustomAction(lead.id, v.slice(8));
      setTrackActionForLead(lead.id, null);
    } else {
      setLeadCustomAction(lead.id, null);
      const trackOpt = TRACK_NEXT_ACTION_OPTIONS.find((o) => o.value === v);
      dbAction = trackOpt ? trackOpt.dbValue : (v as NextActionType);
      setTrackActionForLead(lead.id, v);
    }
    if (dbAction === 'none' || v === 'none') {
      setNextActionDate(undefined);
      setTrackActionForLead(lead.id, null);
    }
    await onNextActionChange(lead.id, dbAction, dbAction === 'none' ? undefined : nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined);
    if (dbAction !== 'none') {
      window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
      window.dispatchEvent(new CustomEvent('demo-checklist-step4-action-set'));
    }
  };

  const handleDateChange = async (d: Date | undefined) => {
    setNextActionDate(d);
    if (d) {
      setDatePopoverOpen(false);
      const isCustom = nextAction.startsWith('custom::');
      const trackOpt = TRACK_NEXT_ACTION_OPTIONS.find((o) => o.value === nextAction);
      const dbAction: NextActionType = isCustom ? 'follow_up' : trackOpt?.dbValue || (nextAction as NextActionType);
      await onNextActionChange(lead.id, dbAction, format(d, 'yyyy-MM-dd'));
      if (dbAction !== 'none') {
        window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
        window.dispatchEvent(new CustomEvent('demo-checklist-step4-action-set'));
      }
      window.dispatchEvent(new CustomEvent('demo-checklist-next-date-set'));
      window.dispatchEvent(new CustomEvent('demo-checklist-step4-date-set'));
    }
  };

  const copyEmail = async () => {
    if (!lead.email) return;
    try {
      await navigator.clipboard.writeText(lead.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    } catch { /* ignore */ }
  };


  const handleAddCustomActionSubmit = () => {
    const trimmed = newCustomAction.trim();
    if (!trimmed) return;
    addAction(trimmed);
    setNewCustomAction('');
    setShowAddCustomAction(false);
    handleNextActionChange(`custom::${trimmed}`);
  };

  const handleStatusSelect = async (v: string) => {
    if (v === '__add_custom__') {
      onAddCustomStatus?.();
      return;
    }
    await onStatusChange(lead.id, v as LeadStatus);
    if (v === 'paid' || v === 'closed_lost' || v === 'payment_received') {
      setNextAction('none');
      setNextActionDate(undefined);
      setTrackActionForLead(lead.id, null);
      setLeadCustomAction(lead.id, null);
      await onNextActionChange(lead.id, 'none' as NextActionType);
    }
    if (v === 'payment_received') {
      const seenKey = 'leadfinder_seen_paid_popup';
      if (!localStorage.getItem(seenKey)) {
        localStorage.setItem(seenKey, '1');
        setShowPaidPopup(true);
      }
    }
    window.dispatchEvent(new CustomEvent('demo-checklist-track-status-changed'));
    window.dispatchEvent(new CustomEvent('demo-checklist-track-status-update'));
  };

  // Exit actions. Paid -> Payment Received + leaves Track; Lost -> Not Going
  // Ahead + leaves Track. Both also clear is_potential_work.
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
  const handleMarkLost = async () => {
    await onStatusChange(lead.id, 'closed_lost' as LeadStatus);
    await onUpdateLead(lead.id, { is_potential_work: false } as Partial<OutreachLead>);
    onClose();
  };

  const dueLabel = getDueLabel(lead.next_action_date, lead.next_action);

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
                <button onClick={() => setEditingName(true)} className="h-5 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground rounded transition-colors shrink-0" title="Edit name">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </DialogTitle>
        </div>

        <DialogDescription className="sr-only">Lead detail, pipeline status and notes for {lead.business_name}</DialogDescription>

        {/* Glanceable pills — status / next action / due / contact / revenue */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Status — the SAME list as the Outreach row (PIPELINE_STATUS_OPTIONS) so a
              lead offers identical options everywhere; badge matches the row too. */}
          <Select value={PIPELINE_STATUS_OPTIONS.some((o) => o.value === lead.status) ? lead.status : ''} onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}>
            <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
              <PipelineStatusBadge status={lead.status as PipelineStatus} />
            </SelectTrigger>
            <SelectContent className="pointer-events-auto">
              {PIPELINE_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
            </SelectContent>
          </Select>

          {/* REMOVED 2026-08-18 (delivery-cockpit redesign): the next-action Select and its due-date
              pill were prospecting machinery — a client cockpit keeps only status. The re-measure
              date (the date that actually matters) now lives in the cockpit's Key Dates. */}

          {/* Contact method — same component + dropdown as the Outreach table */}
          <Select value={lead.contact_method || ''} onValueChange={(v) => onUpdateLead(lead.id, { contact_method: v } as Partial<OutreachLead>)}>
            <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
              <ContactMethodBadge method={lead.contact_method as ContactMethod} />
            </SelectTrigger>
            <SelectContent className="pointer-events-auto">
              {CONTACT_METHOD_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
            </SelectContent>
          </Select>

          {/* DELIVERY CHECKLIST — /playbook/:id, resolved from this LEAD id. onClose fires alongside
              the navigation: this is a modal, and leaving it mounted over the new route would trap
              the operator behind an overlay. */}
          <Link
            to={`/playbook/${lead.id}`}
            state={{ from: '/outreach', fromLabel: 'Outreach' }}
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
            title="Open the delivery checklist for this lead"
          >
            <ClipboardList className="h-3 w-3" />
            Playbook
          </Link>

          {/* CLIENT WELCOME PACK — one PDF: cover, plan, get more reviews, then their audit report
              with the selling sections hidden. Refuses with a toast when the lead has no completed
              audit, because the report IS the pack's last section. */}
          {!isDemoLead(lead.id) && <WelcomePackButton leadId={lead.id} businessName={lead.business_name} />}

          {/* Read-only call guide from this lead's stored evidence — the SAME panel Inbox opens. */}
          {!isDemoLead(lead.id) && <ColdCallPlaybookButton leadId={lead.id} />}

          {/* Site check on engagement — renders only for a replied-or-beyond lead with a real
              website whose completed audit skipped the SEO scan (the email lane's up-front skip). */}
          {!isDemoLead(lead.id) && <LeadSiteCheckButton lead={lead} />}
          {/* Free crawlability check — run on the prospect BEFORE messaging so the outreach can name
              their actual problem. Fetches only (£0), never the Apify SEO scanner. */}
          {!isDemoLead(lead.id) && <LeadDetailCrawlButton lead={lead} />}
          {/* REMOVED 2026-08-18: the Revenue field (top-right) — confirmed waste for the cockpit. */}
        </div>

        {/* Contact — email, from scraping or from the questionnaire. */}
        {lead.email && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/40 pt-2.5 text-xs">
            {lead.email && (
              <div className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <a href={`mailto:${lead.email}`} className="truncate text-foreground/80 hover:text-primary hover:underline">{lead.email}</a>
                <button onClick={copyEmail} className="text-muted-foreground/60 hover:text-foreground shrink-0" title="Copy email">
                  {emailCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto thin-scrollbar px-5 py-4 space-y-4">

        {/* ══ THE DELIVERY COCKPIT — key dates, quick launch, checklist, reference (2026-08-18).
            The at-a-glance client control panel; shared by Outreach + Inbox via this one dialog. ══ */}
        {!isDemoLead(lead.id) && (
          <LeadDeliveryCockpit lead={lead} onUpdateLead={onUpdateLead} context={context} onClose={onClose} />
        )}

        {/* REMOVED 2026-08-18: the Journey stepper (Contacted → Replied → Site sent → Opened →
            Add-on) — vague prospecting funnel, not real delivery. Binned per Paul's spec. */}

        {/* ── Two-column body ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left: client info — questionnaire, socials/contact, onboarding link */}
          <div className="space-y-4">
            {/* The questionnaire's answers + the manual payment nudge. Fetches through the
                `submissions` endpoint (onboarding_responses has RLS with no policies — a direct
                read silently returns nothing, CLAUDE.md §8). Demo leads have no submissions and
                no edge access, so the section is simply absent for them. */}
            {!isDemoLead(lead.id) && (
              <LeadQuestionnaireSection lead={lead} onUpdateLead={onUpdateLead} />
            )}
            {/* REMOVED 2026-08-18: the free-text Delivery section (overview / status / selling /
                deliverables) is replaced by the cockpit's tickable checklist at the top. The
                columns still exist and their data is untouched; they simply have no editor here. */}

                        {/* Socials & contact — found socials (FB/IG) are read-only links; the
                contact fields (email / website / phone / address) are inline-editable
                (Pencil → input + Check/X), mirroring the name-edit UX. */}
            {(() => {
              const socials = [
                lead.facebook_url ? { key: 'fb', Icon: Facebook, label: 'Facebook', value: lead.facebook_url, href: lead.facebook_url, color: 'text-blue-600', external: true } : null,
                lead.instagram_url ? { key: 'ig', Icon: Instagram, label: 'Instagram', value: lead.instagram_url, href: lead.instagram_url, color: 'text-pink-500', external: true } : null,
              ].filter(Boolean) as { key: string; Icon: typeof Mail; label: string; value: string; href: string; color: string; external: boolean }[];
              // Editable contact fields — rendered even when empty so a missing value
              // can be added. `hrefFor` keeps the mailto/tel/open affordance in view mode.
              const editableFields = [
                { field: 'email' as const, Icon: Mail, label: 'Email', value: lead.email, color: 'text-violet-400', external: false, hrefFor: (v: string) => `mailto:${v}` },
                { field: 'website' as const, Icon: Globe, label: 'Website', value: lead.website, color: 'text-emerald-500', external: true, hrefFor: (v: string) => v },
                { field: 'phone' as const, Icon: Phone, label: 'Phone', value: lead.phone, color: 'text-sky-400', external: false, hrefFor: (v: string) => `tel:${v}` },
                { field: 'address' as const, Icon: MapPin, label: 'Address', value: lead.address, color: 'text-amber-500', external: false, hrefFor: null },
              ];
              return (
                <section className={CARD}>
                  <SectionLabel icon={Share2} color="text-blue-400">Socials &amp; contact</SectionLabel>
                  <ul className="space-y-1.5">
                    {socials.map(({ key, Icon, label, value, href, color, external }) => (
                      <li key={key} className="flex items-center gap-2 text-xs">
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                        <span className="w-16 shrink-0 text-muted-foreground/70">{label}</span>
                        <a
                          href={href}
                          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="min-w-0 flex-1 truncate text-foreground/80 hover:text-primary hover:underline"
                          title={value}
                        >
                          {external ? value.replace(/^https?:\/\//, '').replace(/\/$/, '') : value}
                        </a>
                      </li>
                    ))}
                    {editableFields.map(({ field, Icon, label, value, color, external, hrefFor }) => {
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
                              <button
                                onClick={() => startEditField(field, value)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground"
                                title={`Edit ${label.toLowerCase()}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            {/* WhatsApp outreach: per-lead template + add/remove from the daily queue. */}
            {!isDemoLead(lead.id) && <WhatsAppLeadControls lead={lead} onUpdate={onUpdateLead} />}

            {/* Sign-up link. Sits directly under the WhatsApp controls because that is where the
                decision to message someone gets made — the link is needed in the same breath. */}
            {!isDemoLead(lead.id) && <OnboardingLinkCard lead={lead} />}
          </div>

          {/* Right: money + operator — payment, notes, activity */}
          <div className="space-y-4">
            {/* ── PAYMENT ─────────────────────────────────────────────────────────────────────
                ⛔ THE ONLY PLACE A PAYMENT AMOUNT CAN BE CORRECTED. It used to be the Paid
                Clients page; that page is gone, so this editor is the whole of it.
                ⛔ AND A CLEARED AMOUNT WRITES null, NOT 0 — `paid` means `amount_paid > 0`
                everywhere (CLAUDE.md §6), so a 0 written for an empty box would un-pay a real
                customer: out of the Paid filter, out of the Inbox's paid exemption, out of every
                revenue figure, silently. parseAmountPaid owns that rule and is tested. */}
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

            {!isDemoLead(lead.id) && (
              <section className={CARD}>
                <SectionLabel icon={Clock} color="text-cyan-400">Activity</SectionLabel>
                {activities.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50">No activity yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto thin-scrollbar pr-1">
                    {activities.slice(0, 20).map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-[11px]">
                        <Clock className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-foreground/70">{a.description}</span>
                          <span className="text-muted-foreground/40 ml-1.5">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Mark Paid is my revenue/convert action and shows ONLY while UNPAID — once
          amount_paid > 0 it hides (the Payment block is then the editor). Mark Lost removed from
          the detail view (2026-08-18); a lost lead is set via the status control. When paid there
          is nothing to show, so the footer bar is absent rather than empty. */}
      {!isPaidLead(lead) && (
        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border/60 bg-card/30 px-5 py-3">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkPaid}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Mark Paid
          </Button>
        </div>
      )}

      {/* Custom Action Dialog */}
      <Dialog open={showAddCustomAction} onOpenChange={setShowAddCustomAction}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Action</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. Send Proposal"
            value={newCustomAction}
            onChange={(e) => setNewCustomAction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomActionSubmit()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddCustomAction(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomActionSubmit} disabled={!newCustomAction.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
