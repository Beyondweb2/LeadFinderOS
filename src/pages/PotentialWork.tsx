import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Facebook } from 'lucide-react';
import { useOutreach } from '@/hooks/useOutreach';
import { AlertTriangle, Clock, CalendarCheck } from 'lucide-react';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { AddCustomLeadDialog } from '@/components/AddCustomLeadDialog';
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
// Collapsible removed — notes always visible
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OutreachStatusBadge } from '@/components/OutreachStatusBadge';
import { 
  Briefcase, 
  Phone, 
  Search, 
  Calendar as CalendarIcon, 
  ExternalLink, 
  Trash2,
  ChevronDown,
  StickyNote,
  Save,
  Pencil,
  Check,
  X,
  MessageSquare,
  MessageCircle,
  PhoneCall,
  MoreVertical,
  MapPin,
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
import { Plus, Tag } from 'lucide-react';
import { FacebookSection } from '@/components/FacebookSection';

const DEFAULT_POTENTIAL_WORK_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'wants_draft', label: 'Wants a Draft' },
  { value: 'on_hold', label: 'Waiting' },
  { value: 'reviewing_draft', label: 'Reviewing Draft' },
  { value: 'paid_for_draft', label: 'Paid for Draft' },
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

interface LeadCardProps {
  lead: OutreachLead;
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

const getInitials = (name: string) => {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

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
  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)}d`, cls: 'text-red-500' };
  if (diffDays === 0) return { text: 'Due today', cls: 'text-amber-500' };
  if (diffDays === 1) return { text: 'Due tomorrow', cls: 'text-amber-400' };
  return { text: `Due in ${diffDays}d`, cls: 'text-muted-foreground' };
};

const LeadCard = ({ lead, onStatusChange, onNextActionChange, onNotesChange, onBusinessNameChange, onImageChange, onUpdateLead, onDelete, customStatuses, onAddCustomStatus, userId }: LeadCardProps) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');
  const [notesDirty, setNotesDirty] = useState(false);
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
  const [notesExpanded, setNotesExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { customActions, addAction } = useCustomNextActions();

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
    if (notesDirty) {
      await onNotesChange(lead.id, notes);
      setNotesDirty(false);
    }
  };

  const handleNextActionChange = async (v: string) => {
    setNextAction(v);
    const isCustom = v.startsWith('custom::');
    const dbAction: NextActionType = isCustom ? 'follow_up' : v as NextActionType;
    if (isCustom) setLeadCustomAction(lead.id, v.slice(8));
    else setLeadCustomAction(lead.id, null);
    await onNextActionChange(lead.id, dbAction, nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined);
    if (dbAction !== 'none' && nextActionDate) {
      window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
    }
  };

  const handleDateChange = async (d: Date | undefined) => {
    setNextActionDate(d);
    if (d) {
      const isCustom = nextAction.startsWith('custom::');
      const dbAction: NextActionType = isCustom ? 'follow_up' : nextAction as NextActionType;
      await onNextActionChange(lead.id, dbAction, format(d, 'yyyy-MM-dd'));
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

  const hasFollowUp = lead.next_action && lead.next_action !== 'none';
  const dueLabel = getDueLabel(lead.next_action_date, lead.next_action);
  const borderColor = getDueBorderColor(lead.next_action_date, lead.next_action);

  return (
    <>
      <Card className={`border border-border/60 border-l-[4px] ${borderColor} hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all bg-card overflow-hidden`}>
        {/* === 1. IDENTITY SECTION === */}
        <div className="flex items-start gap-3 p-3 sm:p-4 pb-2 sm:pb-2.5">
          {/* Image / Avatar */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 relative group/img"
            title={lead.image_url ? 'Change image' : 'Add image'}
          >
            {lead.image_url ? (
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-muted/30 ring-1 ring-border/30 group-hover/img:ring-primary/40 transition-all">
                <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-xs sm:text-sm font-bold text-primary/50 group-hover/img:border-primary/30 transition-all">
                {getInitials(lead.business_name)}
              </div>
            )}
            <div className="absolute inset-0 rounded-xl bg-black/0 group-hover/img:bg-black/20 flex items-center justify-center transition-all opacity-0 group-hover/img:opacity-100">
              <Pencil className="h-3 w-3 text-white" />
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {/* Name + Category + Status */}
          <div className="flex-1 min-w-0 space-y-0.5">
            {editingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-7 text-sm font-bold px-1.5"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditedName(lead.business_name); setEditingName(false); } }}
                />
                <button onClick={handleSaveName} className="h-6 w-6 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => { setEditedName(lead.business_name); setEditingName(false); }} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <h3
                className="text-sm sm:text-base font-bold leading-tight truncate cursor-pointer hover:text-primary/80 transition-colors"
                onClick={() => setEditingName(true)}
                title="Click to edit"
              >
                {lead.business_name}
              </h3>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {lead.category && (
                <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 truncate max-w-[140px]">{lead.category}</span>
              )}
              <OutreachStatusBadge status={lead.status} compact />
            </div>
          </div>

          {/* Maps + Menu */}
          <div className="flex items-center gap-0.5 shrink-0">
            {lead.google_maps_url && (
              <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="h-7 w-7 flex items-center justify-center rounded-md text-blue-500 hover:bg-blue-500/10 transition-colors" title="Google Maps">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="text-xs" disabled={isUploadingImage}>
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
          </div>
        </div>

        {/* === 2. QUICK CONTACT ROW === */}
        {lead.phone && (
          <div className="flex items-center gap-1.5 px-3 sm:px-4 pb-2">
            <a
              href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <a
              href={`sms:+${formatPhoneForWhatsApp(lead.phone)}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" /> SMS
            </a>
            <a
              href={`tel:${lead.phone}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5" /> Call
            </a>
          </div>
        )}

        {/* === 3. STATUS + NEXT ACTION === */}
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-2">
          {/* Status dropdown */}
          <div className="flex-1 min-w-0">
            <Select value={lead.status} onValueChange={(v) => {
              if (v === '__add_custom__') { onAddCustomStatus(); return; }
              onStatusChange(lead.id, v as LeadStatus);
            }}>
              <SelectTrigger className="h-7 text-[11px] sm:text-xs border-border/50 px-2">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_POTENTIAL_WORK_STATUSES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
                {customStatuses.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
                <SelectItem value="__add_custom__" className="text-primary">+ Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Next action dropdown */}
          <div className="flex-1 min-w-0">
            <Select value={nextAction} onValueChange={handleNextActionChange}>
              <SelectTrigger className="h-7 text-[11px] sm:text-xs border-border/50 px-2">
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
              </SelectContent>
            </Select>
          </div>

          {/* Date picker */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-border/50 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors shrink-0">
                <CalendarIcon className="h-3 w-3" />
                {nextActionDate ? format(nextActionDate, 'MMM d') : 'Date'}
              </button>
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

          {/* Complete action button */}
          {hasFollowUp && (
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 transition-colors shrink-0"
              onClick={() => onNextActionChange(lead.id, 'none' as NextActionType)}
              title="Mark as done"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Due label */}
        {dueLabel && (
          <div className="px-3 sm:px-4 pb-1.5">
            <span className={`text-[10px] sm:text-xs font-semibold ${dueLabel.cls}`}>
              {dueLabel.text}
            </span>
          </div>
        )}

        {/* === 4. NOTES SECTION === */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4">
          {notes ? (
            <div>
              <p
                className={`text-xs sm:text-sm text-foreground/70 leading-relaxed cursor-pointer hover:text-foreground/90 transition-colors ${notesExpanded ? '' : 'line-clamp-2'}`}
                onClick={() => setNotesExpanded(!notesExpanded)}
                title="Click to expand"
              >
                {notes}
              </p>
              {notesExpanded && (
                <div className="mt-1.5">
                  <Textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                    rows={3}
                    className="resize-none text-xs sm:text-sm border-border/50"
                    placeholder="Add notes..."
                  />
                  {notesDirty && (
                    <div className="flex justify-end mt-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-primary" onClick={handleSaveNotes}>
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
              onClick={() => { setNotesExpanded(true); setNotes(' '); setTimeout(() => setNotes(''), 0); }}
            >
              <StickyNote className="h-3 w-3" /> Add notes...
            </button>
          )}
        </div>
      </Card>

      {/* Detail / Edit Dialog (kept for full editing) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg border-primary/20 bg-card/95 backdrop-blur-xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Edit Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Image section */}
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
            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-primary mb-1.5 block">Business Name</label>
              <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="h-9 text-sm border-border/50 focus-visible:ring-primary/30" />
            </div>
            {/* Notes */}
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
  const [metricFilter, setMetricFilter] = useState<'overdue' | 'today' | 'upcoming' | 'no_action' | null>(null);
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [customStatuses, setCustomStatuses] = useState<{ value: string; label: string }[]>([]);
  const [showCustomStatusDialog, setShowCustomStatusDialog] = useState(false);
  const [newStatusLabel, setNewStatusLabel] = useState('');

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

  // Load custom statuses from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_STATUSES_KEY);
      if (saved) setCustomStatuses(JSON.parse(saved));
    } catch {}
  }, []);

  const handleAddCustomStatus = () => {
    const label = newStatusLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const allStatuses = [...DEFAULT_POTENTIAL_WORK_STATUSES, ...customStatuses];
    if (allStatuses.some(s => s.value === value)) return;
    const updated = [...customStatuses, { value, label }];
    setCustomStatuses(updated);
    localStorage.setItem(CUSTOM_STATUSES_KEY, JSON.stringify(updated));
    setNewStatusLabel('');
    setShowCustomStatusDialog(false);
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
    
    result.sort((a, b) => {
      const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
      const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
      return dateA - dateB;
    });
    
    return result;
  }, [leads, archivedLeads, searchQuery]);

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

      {/* Search + Add + Count */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {/* AddCustomLeadDialog removed — leads should be added via Find Leads */}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {potentialWorkLeads.length} leads
        </span>
      </div>

      {/* Metrics Summary */}
      {allPotentialLeads.length > 0 && (() => {
        const now = new Date();
        const todayStart = startOfDay(now);
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-2.5">
          {potentialWorkLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
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
              <DialogTitle>Add Custom Status</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="e.g. Sent Quote"
              value={newStatusLabel}
              onChange={(e) => setNewStatusLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomStatus()}
              autoFocus
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCustomStatusDialog(false)}>Cancel</Button>
              <Button onClick={handleAddCustomStatus} disabled={!newStatusLabel.trim()}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

export default PotentialWorkPage;
