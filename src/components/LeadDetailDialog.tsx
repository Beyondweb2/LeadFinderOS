import { useState, useEffect, useRef } from 'react';
import { isDemoLead } from '@/lib/demoLeads';
import { Clock, ExternalLink, StickyNote, Save, Check, X, Tag, Pencil, Calendar as CalendarIconLucide } from 'lucide-react';
import { TeamNotes } from '@/components/TeamNotes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { barberSiteUrl } from '@/config/publicSite';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, formatDistanceToNow, startOfDay } from 'date-fns';
import { SALE_TYPES, SALE_TYPE_LABELS, resolveSaleType, type SaleType } from '@/lib/saleType';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType } from '@/types/outreach';
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
const TRACK_NEXT_ACTION_OPTIONS: { value: string; label: string; dbValue: NextActionType }[] = [
  { value: 'none', label: 'None', dbValue: 'none' },
  { value: 'follow_up_proposal', label: 'Follow Up', dbValue: 'follow_up' },
  { value: 'send_proposal', label: 'Send Quote', dbValue: 'send_draft' },
  { value: 'prepare_proposal', label: 'Send Draft', dbValue: 'send_draft' },
  { value: 'send_revision', label: 'Send Updated Draft', dbValue: 'send_follow_up' },
  { value: 'schedule_discovery', label: 'Book Call', dbValue: 'call' },
  { value: 'collect_payment', label: 'Send Invoice', dbValue: 'follow_up' },
  { value: 'check_in', label: 'Check In', dbValue: 'follow_up' },
  { value: 'start_project', label: 'Start Work', dbValue: 'follow_up' },
];

/* Map legacy DB actions → new Track page action keys */
const LEGACY_ACTION_MAP: Record<string, string> = {
  call: 'schedule_discovery',
  send_draft: 'send_proposal',
  follow_up: 'follow_up_proposal',
  '2nd_follow_up': 'follow_up_proposal',
  send_initial_text: 'schedule_discovery',
  send_voice_note: 'follow_up_proposal',
  send_follow_up: 'follow_up_proposal',
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

const setTrackActionForLead = (leadId: string, actionKey: string | null) => {
  try {
    if (actionKey && actionKey !== 'none') {
      localStorage.setItem(`${TRACK_ACTION_KEY_PREFIX}${leadId}`, actionKey);
    } else {
      localStorage.removeItem(`${TRACK_ACTION_KEY_PREFIX}${leadId}`);
    }
  } catch {}
};

const NEXT_ACTION_COLORS: Record<string, string> = {
  schedule_discovery: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent',
  prepare_proposal: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))] border-transparent',
  send_proposal: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent',
  follow_up_proposal: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent',
  send_revision: 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))] border-transparent',
  collect_payment: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent',
  start_project: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent',
  check_in: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent',
  call: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent',
  follow_up: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent',
  send_draft: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent',
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

/** Per-lead funnel tracking pulled from generated_sites (by lead_id). */
interface LeadFunnel {
  share_token: string | null;
  site_name: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  replied_at: string | null;
  claimed_at: string | null;
  addon_interest_at: string | null;
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
}: LeadDetailDialogProps) {
  if (!lead) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
  onClose,
}: LeadDetailBodyProps) {
  const effectiveSaleType: SaleType = resolveSaleType(lead.sale_type, campaignDefaultSaleType);

  const [notes, setNotes] = useState(lead.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const customLabel = getLeadCustomAction(lead.id);
  const [nextAction, setNextAction] = useState<string>(
    customLabel ? `custom::${customLabel}` : getTrackActionForLead(lead.id) || mapLegacyAction(lead.next_action || 'none')
  );
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { customActions, addAction } = useCustomNextActions();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [showAddCustomAction, setShowAddCustomAction] = useState(false);
  const [newCustomAction, setNewCustomAction] = useState('');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [potentialRevenue, setPotentialRevenue] = useState<string>(lead.potential_revenue?.toString() || '');
  const [projectOverview, setProjectOverview] = useState(lead.project_overview || '');
  const [projectStatus, setProjectStatus] = useState(lead.project_status || 'not_started');
  const [showPaidPopup, setShowPaidPopup] = useState(false);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);

  // Funnel for THIS lead — fetched on open from generated_sites by lead_id.
  const [funnel, setFunnel] = useState<LeadFunnel | null>(null);
  useEffect(() => {
    if (isDemoLead(lead.id)) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as unknown as SupabaseClient)
        .from('generated_sites')
        .select('lead_id, site_name, share_token, sent_at, first_opened_at, replied_at, claimed_at, addon_interest_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled || !data || data.length === 0) return;
      setFunnel(data[0] as unknown as LeadFunnel);
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.id]);

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${lead.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('lead-images').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('lead-images').getPublicUrl(path);
      if (onImageChange) await onImageChange(lead.id, publicUrl);
      else await onUpdateLead(lead.id, { image_url: publicUrl });
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (onImageChange) await onImageChange(lead.id, null);
    else await onUpdateLead(lead.id, { image_url: null });
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
  const statusLabel = getStatusLabel(lead.status, customStatuses);
  const statusColorCls = getMappedStatusColor(lead.status);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="h-7 text-sm font-semibold px-1.5 flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') {
                    setEditedName(lead.business_name);
                    setEditingName(false);
                  }
                }}
              />
              <button onClick={handleSaveName} className="h-6 w-6 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditedName(lead.business_name);
                  setEditingName(false);
                }}
                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="truncate">{lead.business_name}</span>
              <button
                onClick={() => setEditingName(true)}
                className="h-5 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-foreground rounded transition-colors shrink-0"
                title="Edit name"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {/* Hero image */}
        <section className="rounded-xl border border-border/50 bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Image</label>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isUploadingImage} onClick={() => fileInputRef.current?.click()}>
                <Pencil className="h-3 w-3 mr-1" /> {lead.image_url ? 'Change' : 'Add image'}
              </Button>
              {lead.image_url && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleRemoveImage}>
                  <X className="h-3 w-3 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
          {lead.image_url && (
            <img src={lead.image_url} alt={lead.business_name} className="mt-2 w-full max-h-40 object-cover rounded-lg border border-border/50" />
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </section>

        {/* Funnel panel: their journey timeline + the /s/ site link */}
        {funnel && (funnel.sent_at || funnel.first_opened_at || funnel.replied_at || funnel.claimed_at || funnel.addon_interest_at || funnel.share_token) && (
          <section className="rounded-xl border border-border/50 bg-card/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Funnel</label>
              {funnel.share_token && (
                <a
                  href={barberSiteUrl(funnel.share_token)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  title="Open the site link you sent them"
                >
                  <ExternalLink className="h-3 w-3" /> Their site
                </a>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5 text-[11px]">
              {(
                [
                  { label: 'Sent', at: funnel.sent_at },
                  { label: 'Opened', at: funnel.first_opened_at },
                  { label: 'Replied', at: funnel.replied_at },
                  { label: 'Claimed', at: funnel.claimed_at },
                  { label: 'Upsell', at: funnel.addon_interest_at },
                ] as { label: string; at: string | null }[]
              ).map((s, i, arr) => (
                <span key={s.label} className="inline-flex items-center gap-1">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', s.at ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground/50')}>
                    {s.at && <Check className="h-2.5 w-2.5" />}
                    {s.label}
                    {s.at ? ` ${format(new Date(s.at), 'd MMM')}` : ''}
                  </span>
                  {i < arr.length - 1 && <span className="text-muted-foreground/30 px-0.5">→</span>}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Stage progress */}
        <section className="rounded-xl border border-border/50 bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Stage</label>
            <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            {(() => {
              const currentIdx = getStageIndex(lead.status);
              const isPaid = mapLegacyStatus(lead.status) === 'paid';
              const isLost = mapLegacyStatus(lead.status) === 'closed_lost';
              const stages = PIPELINE_STAGES.filter((s) => s !== 'closed_lost');
              return stages.map((stage, idx) => {
                const isActive = idx === currentIdx;
                const isCompleted = currentIdx >= 0 && idx < currentIdx && !isLost;
                return (
                  <div
                    key={stage}
                    className={cn('h-1.5 rounded-full flex-1 transition-colors', isCompleted || isActive ? (isPaid ? 'bg-emerald-500' : 'bg-primary') : isLost ? 'bg-zinc-700' : 'bg-border/60')}
                  />
                );
              });
            })()}
          </div>
        </section>

        {/* Status + Next action editors */}
        <section className="rounded-xl border border-border/50 bg-card/40 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Status</label>
              <Select value={mapLegacyStatus(lead.status)} onValueChange={handleStatusSelect}>
                <SelectTrigger className="w-full h-auto p-0 border-0 bg-transparent focus:ring-0">
                  <span className={cn('inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold', statusColorCls)}>
                    {mapLegacyStatus(lead.status) === 'paid' && <Check className="h-3 w-3 mr-0.5" />}
                    <span className="truncate">{statusLabel}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_POTENTIAL_WORK_STATUSES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  {customStatuses.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  {onAddCustomStatus && (
                    <SelectItem value="__add_custom__" className="text-primary">
                      + Custom Status
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Next action</label>
              <Select value={nextAction} onValueChange={handleNextActionChange}>
                <SelectTrigger className="w-full h-auto p-0 border-0 bg-transparent focus:ring-0">
                  {(() => {
                    const cl = getLeadCustomAction(lead.id);
                    const trackKey = getTrackActionForLead(lead.id);
                    const opt = TRACK_NEXT_ACTION_OPTIONS.find((o) => o.value === (trackKey || mapLegacyAction(lead.next_action || 'none')));
                    const label = cl || (opt && opt.value !== 'none' ? opt.label : null);
                    const colorCls = cl ? 'bg-teal-500 text-white border-transparent' : NEXT_ACTION_COLORS[trackKey || mapLegacyAction(lead.next_action || 'none')] || NEXT_ACTION_COLORS.none;
                    return label ? (
                      <span className={cn('inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', colorCls)}>{label}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/50">+ Set action</span>
                    );
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {TRACK_NEXT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                  {customActions.length > 0 && (
                    <>
                      <div className="h-px bg-border my-1" />
                      {customActions.map((ca) => (
                        <SelectItem key={ca.id} value={`custom::${ca.label}`}>
                          <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3 text-teal-400" />
                            {ca.label}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  <div className="h-px bg-border my-1" />
                  <SelectItem value="__add_custom_action__" className="text-primary">
                    + Custom Action
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date + Revenue */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Due date</label>
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('h-8 px-2.5 text-xs w-full justify-start gap-1', dueLabel ? dueLabel.cls : 'text-muted-foreground')}>
                    <CalendarIconLucide className="h-3 w-3" />
                    {nextActionDate ? format(nextActionDate, 'MMM d') : 'Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={nextActionDate} onSelect={handleDateChange} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Revenue</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={potentialRevenue}
                  onChange={(e) => setPotentialRevenue(e.target.value)}
                  onBlur={async () => {
                    const val = potentialRevenue ? parseFloat(potentialRevenue) : null;
                    if (val !== (lead.potential_revenue ?? null)) {
                      await onUpdateLead(lead.id, { potential_revenue: val } as Partial<OutreachLead>);
                    }
                  }}
                  className="h-8 text-xs border-border/50 pl-6 w-full"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Notes: private | team side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Private note */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <StickyNote className="h-3 w-3" /> Private note <span className="text-muted-foreground/40 font-normal">· only you</span>
            </label>
            {isEditingNotes ? (
              <div className="space-y-1.5">
                <Textarea
                  ref={notesRef}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesDirty(true);
                  }}
                  rows={2}
                  className="resize-none text-xs border-border/50 min-h-[52px]"
                  placeholder="Add a private note..."
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground" onClick={handleCancelNotes}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-6 text-[11px] gap-1" onClick={handleSaveNotes}>
                    <Save className="h-2.5 w-2.5" /> Save
                  </Button>
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
                  <span className="text-[10px] text-green-500 shrink-0 flex items-center gap-0.5">
                    <Check className="h-2.5 w-2.5" /> Saved
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Team notes */}
          {!isDemoLead(lead.id) && (
            <div>
              <TeamNotes placeId={(lead as any).place_id ?? null} googleMapsUrl={lead.google_maps_url ?? null} businessName={lead.business_name} />
            </div>
          )}
        </div>

        {/* Project delivery */}
        <div className="rounded-xl border border-border/50 bg-card/40 p-3">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">What you're delivering</label>
              <Textarea
                value={projectOverview}
                onChange={(e) => setProjectOverview(e.target.value)}
                onBlur={async () => {
                  if (projectOverview !== (lead.project_overview || '')) {
                    await onUpdateLead(lead.id, { project_overview: projectOverview || null } as Partial<OutreachLead>);
                  }
                }}
                rows={3}
                className="resize-none text-xs border-border/50 min-h-[64px]"
                placeholder="What are you building / delivering for this lead?"
              />
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Project status</label>
                <Select
                  value={projectStatus}
                  onValueChange={async (v) => {
                    setProjectStatus(v);
                    await onUpdateLead(lead.id, { project_status: v } as Partial<OutreachLead>);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs border-border/50 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Selling</label>
                <Select value={lead.sale_type ?? '__default__'} onValueChange={(v) => onUpdateLead(lead.id, { sale_type: v === '__default__' ? null : v } as Partial<OutreachLead>)}>
                  <SelectTrigger className="h-8 text-xs border-border/50 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      Default{campaignDefaultSaleType ? ` (${SALE_TYPE_LABELS[resolveSaleType(null, campaignDefaultSaleType)]})` : ' (Website)'}
                    </SelectItem>
                    {SALE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Activity log */}
        {!isDemoLead(lead.id) && (
          <div className="rounded-xl border border-border/50 bg-card/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1.5">
              <Clock className="h-3.5 w-3.5" /> Activity log
            </div>
            {activities.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/50">No activity yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
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
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="ghost" size="sm" onClick={handleMarkLost}>
          <X className="h-3.5 w-3.5 mr-1.5" /> Mark Lost
        </Button>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkPaid}>
          <Check className="h-3.5 w-3.5 mr-1.5" /> Mark Paid
        </Button>
      </DialogFooter>

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
              Client Moved to Paid Clients
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This lead has been moved to your <strong>Paid Clients</strong> page where you can track payments, project details, and schedule check-ins.
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
