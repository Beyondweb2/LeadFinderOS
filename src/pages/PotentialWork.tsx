import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useOutreach } from '@/hooks/useOutreach';
import { AlertTriangle, Clock, CalendarCheck } from 'lucide-react';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
import { 
  Briefcase, 
  Search, 
  Calendar as CalendarIcon, 
  ExternalLink, 
  Trash2,
  StickyNote,
  Save,
  Pencil,
  Check,
  X,
  MessageSquare,
  MessageCircle,
  PhoneCall,
  MoreVertical,
  Plus,
  Tag,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isToday, isPast, startOfDay } from 'date-fns';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import type { OutreachLead, LeadStatus, NextActionType } from '@/types/outreach';
import { useCustomNextActions, getLeadCustomAction, setLeadCustomAction } from '@/hooks/useCustomNextActions';
import { FacebookSection } from '@/components/FacebookSection';
import { cn } from '@/lib/utils';

/* ───────── constants ───────── */

const DEFAULT_POTENTIAL_WORK_STATUSES: { value: string; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'wants_draft', label: 'Wants a Draft' },
  { value: 'on_hold', label: 'Waiting' },
  { value: 'reviewing_draft', label: 'Reviewing Draft' },
  { value: 'paid_for_draft', label: 'Paid for Draft' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'completed', label: 'Completed → Paid Client' },
];

const CUSTOM_STATUSES_KEY = 'leadfinder_custom_statuses';

const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: '2nd_follow_up', label: '2nd Follow Up' },
  { value: 'send_draft', label: 'Send Draft' },
  { value: 'send_initial_text', label: 'Send Initial Text' },
  { value: 'send_voice_note', label: 'Send Voice Note' },
  { value: 'send_follow_up', label: 'Send Follow-up' },
];

const CONTACT_METHOD_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  contacted: 'Call',
  facebook_msg: 'Facebook',
};

const NEXT_ACTION_COLORS: Record<string, string> = {
  call: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  follow_up: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  '2nd_follow_up': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  send_draft: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  send_initial_text: 'bg-green-500/15 text-green-400 border-green-500/25',
  send_voice_note: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  send_follow_up: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  none: 'bg-muted text-muted-foreground border-border/50',
};

const STATUS_COLORS: Record<string, string> = {
  interested: 'bg-green-500/15 text-green-400 border-green-500/25',
  wants_draft: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  on_hold: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  reviewing_draft: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  paid_for_draft: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  not_interested: 'bg-red-500/15 text-red-400 border-red-500/25',
  completed: 'bg-green-600/15 text-green-500 border-green-600/25',
};

/* ───────── helpers ───────── */

const getInitials = (name: string) =>
  name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const getDueBorderColor = (nextActionDate: string | null, nextAction: NextActionType | null) => {
  if (!nextActionDate || !nextAction || nextAction === 'none') return 'border-l-border/40';
  const d = startOfDay(new Date(nextActionDate));
  const today = startOfDay(new Date());
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'border-l-red-500';
  if (diffDays === 0) return 'border-l-amber-500';
  if (diffDays <= 2) return 'border-l-yellow-500';
  if (diffDays <= 7) return 'border-l-blue-500';
  return 'border-l-border/40';
};

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
  const found = [...DEFAULT_POTENTIAL_WORK_STATUSES, ...customStatuses].find(s => s.value === status);
  return found?.label || status;
};

const getNextActionLabel = (action: NextActionType | null, leadId: string) => {
  const customLabel = getLeadCustomAction(leadId);
  if (customLabel) return customLabel;
  if (!action || action === 'none') return null;
  return NEXT_ACTION_OPTIONS.find(o => o.value === action)?.label || null;
};

/* ───────── LeadCard ───────── */

interface LeadCardProps {
  lead: OutreachLead;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<OutreachLead | null>;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => Promise<OutreachLead | null>;
  onNotesChange: (leadId: string, notes: string) => Promise<OutreachLead | null>;
  onBusinessNameChange: (leadId: string, name: string) => Promise<OutreachLead | null>;
  onImageChange: (leadId: string, imageUrl: string | null) => Promise<OutreachLead | null>;
  onUpdateLead: (leadId: string, updates: Partial<OutreachLead>) => Promise<OutreachLead | null>;
  onDelete: (leadId: string, silent?: boolean) => Promise<boolean>;
  customStatuses: { value: string; label: string }[];
  onAddCustomStatus: () => void;
  userId: string | undefined;
}

const LeadCard = ({ lead, isExpanded, onToggleExpand, onStatusChange, onNextActionChange, onNotesChange, onBusinessNameChange, onImageChange, onUpdateLead, onDelete, customStatuses, onAddCustomStatus, userId }: LeadCardProps) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const customLabel = getLeadCustomAction(lead.id);
  const [nextAction, setNextAction] = useState<string>(
    customLabel ? `custom::${customLabel}` : (lead.next_action || 'none')
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
  const expandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotes(lead.notes || '');
    setNotesDirty(false);
    const cl = getLeadCustomAction(lead.id);
    setNextAction(cl ? `custom::${cl}` : (lead.next_action || 'none'));
    setNextActionDate(lead.next_action_date ? new Date(lead.next_action_date) : undefined);
    setEditedName(lead.business_name);
  }, [lead.notes, lead.next_action, lead.next_action_date, lead.business_name, lead.id]);

  const handleSaveName = async () => {
    if (editedName.trim() && editedName.trim() !== lead.business_name) {
      await onBusinessNameChange(lead.id, editedName.trim());
    }
    setEditingName(false);
  };

  const handleSaveNotes = async () => {
    await onNotesChange(lead.id, notes);
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
    const dbAction: NextActionType = isCustom ? 'follow_up' : v as NextActionType;
    if (isCustom) setLeadCustomAction(lead.id, v.slice(8));
    else setLeadCustomAction(lead.id, null);
    await onNextActionChange(lead.id, dbAction, nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined);
    if (dbAction !== 'none') {
      window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
    }
  };

  const handleDateChange = async (d: Date | undefined) => {
    setNextActionDate(d);
    if (d) {
      const isCustom = nextAction.startsWith('custom::');
      const dbAction: NextActionType = isCustom ? 'follow_up' : nextAction as NextActionType;
      await onNextActionChange(lead.id, dbAction, format(d, 'yyyy-MM-dd'));
      if (dbAction !== 'none') {
        window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
      }
      window.dispatchEvent(new CustomEvent('demo-checklist-next-date-set'));
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to remove this lead?')) {
      await onDelete(lead.id);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${lead.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('lead-images')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('lead-images')
        .getPublicUrl(path);
      await onImageChange(lead.id, publicUrl);
    } catch (err: any) {
      console.error('Image upload failed:', err);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    await onImageChange(lead.id, null);
  };

  const handleContactMethodUpdate = async (method: string) => {
    await onUpdateLead(lead.id, { contact_method: method } as Partial<OutreachLead>);
  };

  const handleAddCustomActionSubmit = () => {
    const trimmed = newCustomAction.trim();
    if (!trimmed) return;
    addAction(trimmed);
    setNewCustomAction('');
    setShowAddCustomAction(false);
    handleNextActionChange(`custom::${trimmed}`);
  };

  const borderColor = getDueBorderColor(lead.next_action_date, lead.next_action);
  const dueLabel = getDueLabel(lead.next_action_date, lead.next_action);
  const contactMethodDisplay = lead.contact_method ? CONTACT_METHOD_LABELS[lead.contact_method] || lead.contact_method : null;
  const nextActionLabel = getNextActionLabel(lead.next_action, lead.id);
  const statusLabel = getStatusLabel(lead.status, customStatuses);
  const statusColorCls = STATUS_COLORS[lead.status] || 'bg-muted text-muted-foreground border-border/50';
  const actionColorCls = customLabel
    ? 'bg-teal-500/15 text-teal-400 border-teal-500/25'
    : NEXT_ACTION_COLORS[lead.next_action || 'none'] || NEXT_ACTION_COLORS.none;

  return (
    <>
      <Card className={cn(
        'border border-border/60 border-l-[3px] transition-all bg-card overflow-hidden',
        borderColor,
        isExpanded ? 'shadow-lg shadow-primary/5 border-border' : 'hover:border-border hover:shadow-sm'
      )}>
        {/* ═══ COLLAPSED (always visible) — fixed height structure ═══ */}
        <div
          className="cursor-pointer"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-contact-zone]')) return;
            if ((e.target as HTMLElement).closest('[data-no-expand]')) return;
            onToggleExpand();
          }}
        >
          {/* ZONE 1 — Identity Block */}
          <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
            {/* Avatar */}
            <div className="shrink-0 relative group/avatar cursor-pointer" data-no-expand onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              {lead.image_url ? (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-muted/40 ring-1 ring-border/50 shadow-sm">
                  <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm sm:text-lg font-bold text-primary/70 shadow-sm">
                  {getInitials(lead.business_name)}
                </div>
              )}
              {/* Edit overlay */}
              <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                <Pencil className="h-3.5 w-3.5 text-white" />
              </div>
            </div>

            {/* Title block */}
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] sm:text-base font-bold leading-tight truncate text-foreground">
                {lead.business_name}
              </h3>
              {lead.category && (
                <span className="text-[11px] sm:text-xs text-muted-foreground/50 block leading-tight mt-0.5 truncate">
                  {lead.category}
                </span>
              )}
              {contactMethodDisplay && (
                <span className="text-[10px] sm:text-[11px] text-muted-foreground/35 block leading-tight mt-0.5">
                  Contacted via {contactMethodDisplay}
                </span>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 shrink-0" data-no-expand>
              {lead.google_maps_url && (
                <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="h-7 w-7 flex items-center justify-center rounded-md text-blue-500 hover:bg-blue-500/10 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  <DropdownMenuItem onClick={() => { fileInputRef.current?.click(); }} className="text-xs" disabled={isUploadingImage}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> {lead.image_url ? 'Change Image' : 'Add Image'}
                  </DropdownMenuItem>
                  {lead.image_url && (
                    <DropdownMenuItem onClick={handleRemoveImage} className="text-xs">
                      <X className="h-3.5 w-3.5 mr-2" /> Remove Image
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDetailOpen(true)} className="text-xs">
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Full Edit
                  </DropdownMenuItem>
                  <FacebookSection lead={lead} onUpdate={onUpdateLead} compact />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-xs text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                className={cn(
                  'inline-flex items-center gap-0.5 h-6 px-1.5 rounded-md text-[10px] font-medium transition-colors ml-0.5',
                  isExpanded
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30'
                )}
              >
                <ChevronDown className={cn(
                  'h-3 w-3 transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )} />
              </button>
            </div>
          </div>

          {/* ZONE 2 — Workflow Row (visual core) */}
          <div className="flex items-center gap-1.5 flex-wrap px-4 sm:px-5 pt-3 sm:pt-3.5">
            <span className={cn('inline-flex items-center h-7 px-3 rounded-full text-[11px] sm:text-xs font-semibold border', statusColorCls)}>
              {statusLabel}
            </span>
            {nextActionLabel ? (
              <span className={cn('inline-flex items-center h-7 px-3 rounded-full text-[11px] sm:text-xs font-semibold border', actionColorCls)}>
                {nextActionLabel}
              </span>
            ) : (
              <button
                className="inline-flex items-center h-7 px-3 rounded-full text-[11px] sm:text-xs font-medium border border-dashed border-border/40 text-muted-foreground/40 hover:text-muted-foreground/60 hover:border-border/60 transition-colors"
                onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                data-no-expand
              >
                + Set next action
              </button>
            )}
            {dueLabel && (
              <span className={cn('inline-flex items-center gap-1 h-7 px-3 rounded-full text-[11px] sm:text-xs font-bold border', dueLabel.cls)}>
                <Clock className="h-3 w-3" />
                {dueLabel.text}
              </span>
            )}
            {lead.next_action && lead.next_action !== 'none' && !isExpanded && (
              <button
                className="inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[10px] font-medium text-green-500 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); onNextActionChange(lead.id, 'none' as NextActionType); }}
                title="Mark as done"
                data-no-expand
              >
                <Check className="h-2.5 w-2.5" /> Done
              </button>
            )}
          </div>

          {/* ZONE 3 — Notes Preview */}
          {!isExpanded && (
            <div className="px-4 sm:px-5 pt-2.5 sm:pt-3">
              {lead.notes ? (
                <p className="text-xs sm:text-[13px] text-foreground/80 leading-relaxed line-clamp-2">
                  {lead.notes}
                </p>
              ) : (
                <p className="text-xs sm:text-[13px] text-muted-foreground/25 italic">
                  Add note…
                </p>
              )}
            </div>
          )}
        </div>

        {/* ZONE 4 — Contact Actions (icon-only, secondary) */}
        {!isExpanded && lead.phone && (
          <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 pb-4 sm:pb-5" data-contact-zone>
            <a
              href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleContactMethodUpdate('whatsapp')}
              className="h-7 w-7 flex items-center justify-center rounded-md text-green-500/60 hover:text-green-500 hover:bg-green-500/10 transition-colors"
              title="WhatsApp"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </a>
            <a
              href={`sms:+${formatPhoneForWhatsApp(lead.phone)}`}
              onClick={() => handleContactMethodUpdate('sms')}
              className="h-7 w-7 flex items-center justify-center rounded-md text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              title="SMS"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
            <a
              href={`tel:${lead.phone}`}
              onClick={() => handleContactMethodUpdate('contacted')}
              className="h-7 w-7 flex items-center justify-center rounded-md text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
              title="Call"
            >
              <PhoneCall className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        {/* Bottom padding when no phone or expanded */}
        {!isExpanded && !lead.phone && <div className="pb-4 sm:pb-5" />}

        {/* ═══ EXPANDED PANEL ═══ */}
        <div
          ref={expandRef}
          className={cn(
            'overflow-hidden transition-all duration-300 ease-out',
            isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="border-t border-border/40 px-3 py-3 space-y-3 bg-muted/5">
            {/* Status selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-12 shrink-0">Status</span>
              <Select value={lead.status} onValueChange={(v) => {
                if (v === '__add_custom__') { onAddCustomStatus(); return; }
                onStatusChange(lead.id, v as LeadStatus);
                window.dispatchEvent(new CustomEvent('demo-checklist-track-status-changed'));
              }}>
                <SelectTrigger className="h-8 text-xs border-border/50 flex-1" data-walkthrough-step="track-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_POTENTIAL_WORK_STATUSES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  {customStatuses.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  <SelectItem value="__add_custom__" className="text-primary">+ Custom Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Next Action + Due Date */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-12 shrink-0">Action</span>
              <div className="flex-1">
                <Select value={nextAction} onValueChange={handleNextActionChange}>
                  <SelectTrigger className="h-8 text-xs border-border/50">
                    <SelectValue placeholder="Next action" />
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT_ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
                    <SelectItem value="__add_custom_action__" className="text-primary">+ Custom Action</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-8 px-2.5 text-xs shrink-0 gap-1',
                      dueLabel ? dueLabel.cls : 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    {nextActionDate ? format(nextActionDate, 'MMM d') : 'Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={nextActionDate}
                    onSelect={handleDateChange}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

            </div>

            {/* Notes */}
            <div className="pt-1">
              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                    rows={4}
                    className="resize-none text-sm border-border/50 min-h-[90px]"
                    placeholder="Add notes about this lead..."
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
                <div className="flex items-start gap-2">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {notes ? (
                      <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">{notes}</p>
                    ) : (
                      <span className="text-xs text-muted-foreground/30 italic">No notes</span>
                    )}
                  </div>
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="shrink-0 h-6 px-1.5 inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border border-border/40"
                    data-walkthrough-step="track-notes-edit"
                  >
                    <Pencil className="h-2.5 w-2.5" /> {notes ? 'Edit' : 'Add'}
                  </button>
                  {notesSaved && (
                    <span className="text-[10px] text-green-500 shrink-0 flex items-center gap-0.5">
                      <Check className="h-2.5 w-2.5" /> Saved
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Edit name inline */}
            {editingName ? (
              <div className="flex items-center gap-1 pt-1">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-7 text-xs font-semibold px-1.5 flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditedName(lead.business_name); setEditingName(false); } }}
                />
                <button onClick={handleSaveName} className="h-6 w-6 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded"><Check className="h-3 w-3" /></button>
                <button onClick={() => { setEditedName(lead.business_name); setEditingName(false); }} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 pt-1"
              >
                <Pencil className="h-2.5 w-2.5" /> Edit name
              </button>
            )}
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </Card>

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
            <Button variant="ghost" onClick={() => setShowAddCustomAction(false)}>Cancel</Button>
            <Button onClick={handleAddCustomActionSubmit} disabled={!newCustomAction.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Edit Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Edit Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {lead.image_url ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted/30 ring-2 ring-primary/20">
                  <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
                  <button onClick={handleRemoveImage} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center text-lg font-bold text-primary/30">
                  {getInitials(lead.business_name)}
                </div>
              )}
              <Button variant="outline" size="sm" className="text-xs border-primary/20 hover:border-primary/40 hover:bg-primary/5" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}>
                <Pencil className="h-3 w-3 mr-1.5" /> {lead.image_url ? 'Change' : 'Add Image'}
              </Button>
            </div>
            <div>
              <label className="text-xs font-semibold text-primary mb-1.5 block">Business Name</label>
              <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="h-9 text-sm border-border/50 focus-visible:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary mb-1.5 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={3}
                className="resize-none text-sm border-border/50 focus-visible:ring-primary/30"
              />
            </div>
            <FacebookSection lead={lead} onUpdate={onUpdateLead} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setDetailOpen(false)} className="h-9 text-sm">Cancel</Button>
            <Button size="sm" onClick={async () => {
              if (editedName.trim() && editedName.trim() !== lead.business_name) {
                await onBusinessNameChange(lead.id, editedName.trim());
              }
              await onNotesChange(lead.id, notes);
              setDetailOpen(false);
            }} className="h-9 text-sm gap-1.5 btn-premium">
              <Save className="h-3.5 w-3.5" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/* ───────── Page ───────── */

const PotentialWorkPage = () => {
  const {
    leads,
    archivedLeads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    updateBusinessName,
    updateLead,
    deleteLead,
    fetchActivities,
    refetch,
  } = useOutreach();

  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'action_date' | 'recent' | 'alpha'>('action_date');
  const [metricFilter, setMetricFilter] = useState<'overdue' | 'today' | 'upcoming' | 'no_action' | null>(null);
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [customStatuses, setCustomStatuses] = useState<{ value: string; label: string }[]>([]);
  const [showCustomStatusDialog, setShowCustomStatusDialog] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [editingStatusIdx, setEditingStatusIdx] = useState<number | null>(null);
  const [editStatusLabel, setEditStatusLabel] = useState('');

  const updateImageUrl = useCallback(async (leadId: string, imageUrl: string | null) => {
    const { data, error } = await supabase
      .from('outreach_leads')
      .update({ image_url: imageUrl })
      .eq('id', leadId)
      .select()
      .single();
    if (error) return null;
    return data as OutreachLead;
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_STATUSES_KEY);
      if (saved) setCustomStatuses(JSON.parse(saved));
    } catch {}
  }, []);

  const saveCustomStatuses = (updated: { value: string; label: string }[]) => {
    setCustomStatuses(updated);
    localStorage.setItem(CUSTOM_STATUSES_KEY, JSON.stringify(updated));
  };

  const handleAddCustomStatus = () => {
    const label = newStatusLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const allStatuses = [...DEFAULT_POTENTIAL_WORK_STATUSES, ...customStatuses];
    if (allStatuses.some(s => s.label.toLowerCase() === label.toLowerCase())) return;
    saveCustomStatuses([...customStatuses, { value, label }]);
    setNewStatusLabel('');
    setShowCustomStatusDialog(false);
  };

  const handleEditCustomStatus = (idx: number) => {
    const label = editStatusLabel.trim();
    if (!label) return;
    const allDefault = DEFAULT_POTENTIAL_WORK_STATUSES.map(s => s.label.toLowerCase());
    const otherCustom = customStatuses.filter((_, i) => i !== idx).map(s => s.label.toLowerCase());
    if ([...allDefault, ...otherCustom].includes(label.toLowerCase())) return;
    const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const updated = customStatuses.map((s, i) => i === idx ? { value, label } : s);
    saveCustomStatuses(updated);
    setEditingStatusIdx(null);
    setEditStatusLabel('');
  };

  const handleDeleteCustomStatus = (idx: number) => {
    saveCustomStatuses(customStatuses.filter((_, i) => i !== idx));
  };

  const allPotentialLeads = useMemo(() => {
    const interestedStatuses: LeadStatus[] = ['interested', 'wants_draft', 'on_hold', 'reviewing_draft', 'paid_for_draft'];
    const allLeads = [...leads, ...archivedLeads];
    let result = allLeads.filter((lead) => 
      (lead.is_potential_work || interestedStatuses.includes(lead.status)) && 
      lead.status !== 'completed'
    );
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.business_name.toLowerCase().includes(query) ||
          lead.phone?.toLowerCase().includes(query)
      );
    }
    if (sortOrder === 'action_date') {
      result.sort((a, b) => {
        const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
        const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
        return dateA - dateB;
      });
    } else if (sortOrder === 'recent') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortOrder === 'alpha') {
      result.sort((a, b) => a.business_name.localeCompare(b.business_name));
    }
    return result;
  }, [leads, archivedLeads, searchQuery, sortOrder]);

  const potentialWorkLeads = useMemo(() => {
    if (!metricFilter) return allPotentialLeads;
    return allPotentialLeads.filter(l => {
      if (!l.next_action_date || !l.next_action || l.next_action === 'none') {
        return metricFilter === 'no_action';
      }
      const d = new Date(l.next_action_date);
      if (isPast(startOfDay(d)) && !isToday(d)) return metricFilter === 'overdue';
      if (isToday(d)) return metricFilter === 'today';
      return metricFilter === 'upcoming';
    });
  }, [allPotentialLeads, metricFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center justify-center sm:justify-start gap-1.5">
          <Briefcase className="h-4 w-4 sm:h-5 sm:w-5" />
          Track Leads
        </h1>
        <p className="text-xs text-muted-foreground">
          Manage interested leads from first response to completed deal.
        </p>
      </div>

      {/* Search + Sort + Count */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {!metricFilter && (
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="action_date">Next Action</SelectItem>
              <SelectItem value="recent">Recently Added</SelectItem>
              <SelectItem value="alpha">A → Z</SelectItem>
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {potentialWorkLeads.length} leads
        </span>
      </div>

      {/* Metrics Summary */}
      {allPotentialLeads.length > 0 && (() => {
        let overdueCount = 0;
        let todayCount = 0;
        let upcomingCount = 0;
        let noActionCount = 0;

        allPotentialLeads.forEach(l => {
          if (!l.next_action_date || !l.next_action || l.next_action === 'none') {
            noActionCount++;
            return;
          }
          const d = new Date(l.next_action_date);
          if (isPast(startOfDay(d)) && !isToday(d)) overdueCount++;
          else if (isToday(d)) todayCount++;
          else upcomingCount++;
        });

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={() => setMetricFilter(f => f === 'overdue' ? null : 'overdue')} className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${metricFilter === 'overdue' ? 'ring-2 ring-red-500/50 border-red-500/50 bg-red-500/10' : overdueCount > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border/50 bg-muted/20'}`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 ${overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`} />
              <div>
                <p className={`text-lg sm:text-xl font-bold leading-none ${overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`}>{overdueCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Overdue</p>
              </div>
            </button>
            <button onClick={() => setMetricFilter(f => f === 'today' ? null : 'today')} className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${metricFilter === 'today' ? 'ring-2 ring-amber-500/50 border-amber-500/50 bg-amber-500/10' : todayCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/20'}`}>
              <Clock className={`h-4 w-4 shrink-0 ${todayCount > 0 ? 'text-amber-500' : 'text-muted-foreground/50'}`} />
              <div>
                <p className={`text-lg sm:text-xl font-bold leading-none ${todayCount > 0 ? 'text-amber-500' : 'text-muted-foreground/50'}`}>{todayCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Due Today</p>
              </div>
            </button>
            <button onClick={() => setMetricFilter(f => f === 'upcoming' ? null : 'upcoming')} className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${metricFilter === 'upcoming' ? 'ring-2 ring-primary/50 border-primary/50 bg-primary/10' : 'border-border/50 bg-muted/20'}`}>
              <CalendarCheck className="h-4 w-4 shrink-0 text-primary/60" />
              <div>
                <p className="text-lg sm:text-xl font-bold leading-none text-foreground/80">{upcomingCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Upcoming</p>
              </div>
            </button>
            <button onClick={() => setMetricFilter(f => f === 'no_action' ? null : 'no_action')} className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all text-left ${metricFilter === 'no_action' ? 'ring-2 ring-muted-foreground/50 border-muted-foreground/50 bg-muted/30' : 'border-border/50 bg-muted/20'}`}>
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <div>
                <p className="text-lg sm:text-xl font-bold leading-none text-muted-foreground/60">{noActionCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">No Action Set</p>
              </div>
            </button>
          </div>
        );
      })()}

      {/* Cards */}
      {potentialWorkLeads.length === 0 ? (
        <Card className="border-border/50">
          <div className="py-10 text-center text-muted-foreground text-sm">
            No tracked leads yet. Click "Track" in the Outreach CRM to see them here.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 lg:gap-3 items-start">
          {potentialWorkLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isExpanded={expandedCardId === lead.id}
              onToggleExpand={() => setExpandedCardId(prev => prev === lead.id ? null : lead.id)}
              onStatusChange={updateStatus}
              onNextActionChange={updateNextAction}
              onNotesChange={updateNotes}
              onBusinessNameChange={updateBusinessName}
              onImageChange={updateImageUrl}
              onUpdateLead={updateLead}
              onDelete={deleteLead}
              customStatuses={customStatuses}
              onAddCustomStatus={() => setShowCustomStatusDialog(true)}
              userId={user?.id}
            />
          ))}
        </div>
      )}

      <OutreachLeadDialog
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        onUpdateStatus={updateStatus}
        onUpdateNextAction={updateNextAction}
        onUpdateNotes={updateNotes}
        onUpdateLead={updateLead}
        onDelete={deleteLead}
        fetchActivities={fetchActivities}
      />

      {/* Custom Status Dialog */}
      <Dialog open={showCustomStatusDialog} onOpenChange={setShowCustomStatusDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage Custom Statuses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {customStatuses.length > 0 && (
              <div className="space-y-1.5">
                {customStatuses.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {editingStatusIdx === idx ? (
                      <>
                        <Input
                          value={editStatusLabel}
                          onChange={(e) => setEditStatusLabel(e.target.value)}
                          className="h-8 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleEditCustomStatus(idx)}
                        />
                        <button onClick={() => handleEditCustomStatus(idx)} className="h-7 w-7 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { setEditingStatusIdx(null); setEditStatusLabel(''); }} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"><X className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm flex-1">{s.label}</span>
                        <button onClick={() => { setEditingStatusIdx(idx); setEditStatusLabel(s.label); }} className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => handleDeleteCustomStatus(idx)} className="h-7 w-7 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Sent Quote"
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomStatus()}
                className="flex-1"
              />
              <Button onClick={handleAddCustomStatus} disabled={!newStatusLabel.trim()} size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCustomStatusDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PotentialWorkPage;
