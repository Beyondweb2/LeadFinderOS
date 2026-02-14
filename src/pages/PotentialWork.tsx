import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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

const LeadCard = ({ lead, onStatusChange, onNextActionChange, onNotesChange, onBusinessNameChange, onImageChange, onDelete, customStatuses, onAddCustomStatus, userId }: LeadCardProps) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');
  const [nextAction, setNextAction] = useState<NextActionType>(lead.next_action || 'none');
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [editedName, setEditedName] = useState(lead.business_name);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync from prop changes
  useEffect(() => {
    setNotes(lead.notes || '');
    setNextAction(lead.next_action || 'none');
    setNextActionDate(lead.next_action_date ? new Date(lead.next_action_date) : undefined);
    setEditedName(lead.business_name);
  }, [lead.notes, lead.next_action, lead.next_action_date, lead.business_name]);

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      if (editedName.trim() && editedName.trim() !== lead.business_name) {
        await onBusinessNameChange(lead.id, editedName.trim());
      }
      await onNotesChange(lead.id, notes);
      await onNextActionChange(lead.id, nextAction, nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined);
      if (nextAction && nextAction !== 'none' && nextActionDate) {
        window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
      }
      setDetailOpen(false);
    } finally {
      setIsSaving(false);
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
  const actionLabel = hasFollowUp ? NEXT_ACTION_OPTIONS.find(o => o.value === lead.next_action)?.label : null;
  const dueLabel = getDueLabel(lead.next_action_date, lead.next_action);
  const borderColor = getDueBorderColor(lead.next_action_date, lead.next_action);

  return (
    <>
      <Card
        className={`border border-border/50 border-l-[3px] ${borderColor} hover:border-border/80 transition-all cursor-pointer group`}
        onClick={() => setDetailOpen(true)}
      >
        <div className="flex flex-col sm:flex-row sm:items-start p-3 sm:py-4 sm:px-5 gap-3 md:gap-4">
          {/* LEFT: Image / Initials */}
          <div className="hidden sm:flex shrink-0">
            {lead.image_url ? (
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted/30">
                <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted/30 flex items-center justify-center text-sm font-bold text-muted-foreground/60">
                {getInitials(lead.business_name)}
              </div>
            )}
          </div>

          {/* MIDDLE: Details + Notes */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* Name row */}
            <div className="flex items-center gap-2">
              {/* Mobile image */}
              {lead.image_url ? (
                <div className="w-9 h-9 rounded-md overflow-hidden bg-muted/30 sm:hidden shrink-0">
                  <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-md bg-muted/30 flex items-center justify-center text-[10px] font-bold text-muted-foreground/60 sm:hidden shrink-0">
                  {getInitials(lead.business_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold leading-tight truncate">{lead.business_name}</h3>
                {lead.category && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground/70 truncate">{lead.category}</p>
                )}
              </div>
              {/* Kebab menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="text-xs" disabled={isUploadingImage}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> {lead.image_url ? 'Change Image' : 'Add Image'}
                  </DropdownMenuItem>
                  {lead.image_url && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }} className="text-xs">
                      <X className="h-3.5 w-3.5 mr-2" /> Remove Image
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(); }} className="text-xs text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} onClick={(e) => e.stopPropagation()} />
            </div>

            {/* Meta row: status pill + phone + map */}
            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
              <OutreachStatusBadge status={lead.status} compact />
              {lead.phone && (
                <span className="flex items-center gap-0.5 font-mono">
                  <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5" />{lead.phone}
                </span>
              )}
              {lead.google_maps_url && (
                <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={(e) => e.stopPropagation()}>
                  <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" /><ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                </a>
              )}
            </div>

            {/* Notes preview — visible, 2 lines clamped */}
            {lead.notes && (
              <p className="text-xs sm:text-sm text-foreground/70 leading-relaxed line-clamp-2">{lead.notes}</p>
            )}
          </div>

          {/* RIGHT: Next Action + Due */}
          <div className="sm:w-32 shrink-0 flex sm:flex-col items-start sm:items-end gap-1 sm:gap-0.5 sm:text-right sm:pt-0.5">
            {actionLabel ? (
              <>
                <span className="text-[11px] sm:text-sm font-medium text-foreground/80">{actionLabel}</span>
                {lead.next_action_date && (
                  <span className="text-[11px] sm:text-xs text-muted-foreground">
                    {format(new Date(lead.next_action_date), 'MMM d')}
                  </span>
                )}
                {dueLabel && (
                  <span className={`text-[10px] sm:text-xs font-medium ${dueLabel.cls}`}>
                    {dueLabel.text}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] sm:text-xs text-muted-foreground/40">No action set</span>
            )}
          </div>
        </div>
      </Card>

      {/* Detail / Edit Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Image */}
            {lead.image_url && (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted/30">
                <img src={lead.image_url} alt="" className="w-full h-full object-cover" />
                <button onClick={handleRemoveImage} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-background/80 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
            {!lead.image_url && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}>
                <Pencil className="h-3 w-3 mr-1.5" /> Add Image
              </Button>
            )}

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Name</label>
              <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="h-8 text-sm" />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={lead.status} onValueChange={(v) => {
                if (v === '__add_custom__') { onAddCustomStatus(); return; }
                onStatusChange(lead.id, v as LeadStatus);
              }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_POTENTIAL_WORK_STATUSES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  {customStatuses.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  <SelectItem value="__add_custom__" className="text-primary">+ Add Custom Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Next Action + Date */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Next Action</label>
                <Select value={nextAction} onValueChange={(v) => setNextAction(v as NextActionType)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT_ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8 text-xs w-full justify-start">
                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                      {nextActionDate ? format(nextActionDate, 'MMM d, yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={nextActionDate} onSelect={setNextActionDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={3}
                className="resize-none text-sm bg-muted/10 border-border/30"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDetailOpen(false)} className="h-8 text-xs">Cancel</Button>
            <Button size="sm" onClick={handleSaveAll} disabled={isSaving} className="h-8 text-xs gap-1">
              <Save className="h-3 w-3" />
              {isSaving ? 'Saving...' : 'Save Changes'}
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
    deleteLead,
    fetchActivities,
    refetch,
  } = useOutreach();

  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
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

  const potentialWorkLeads = useMemo(() => {
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
        <AddCustomLeadDialog onLeadAdded={refetch} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {potentialWorkLeads.length} leads
        </span>
      </div>

      {/* Metrics Summary */}
      {potentialWorkLeads.length > 0 && (() => {
        const now = new Date();
        const todayStart = startOfDay(now);
        let overdueCount = 0;
        let todayCount = 0;
        let upcomingCount = 0;
        let noActionCount = 0;

        potentialWorkLeads.forEach(l => {
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
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${overdueCount > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border/50 bg-muted/20'}`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 ${overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`} />
              <div>
                <p className={`text-lg sm:text-xl font-bold leading-none ${overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`}>{overdueCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Overdue</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${todayCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50 bg-muted/20'}`}>
              <Clock className={`h-4 w-4 shrink-0 ${todayCount > 0 ? 'text-amber-500' : 'text-muted-foreground/50'}`} />
              <div>
                <p className={`text-lg sm:text-xl font-bold leading-none ${todayCount > 0 ? 'text-amber-500' : 'text-muted-foreground/50'}`}>{todayCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Due Today</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <CalendarCheck className="h-4 w-4 shrink-0 text-primary/60" />
              <div>
                <p className="text-lg sm:text-xl font-bold leading-none text-foreground/80">{upcomingCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">Upcoming</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              <div>
                <p className="text-lg sm:text-xl font-bold leading-none text-muted-foreground/60">{noActionCount}</p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground">No Action Set</p>
              </div>
            </div>
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
