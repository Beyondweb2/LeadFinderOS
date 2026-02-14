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

const LeadCard = ({ lead, onStatusChange, onNextActionChange, onNotesChange, onBusinessNameChange, onImageChange, onDelete, customStatuses, onAddCustomStatus, userId }: LeadCardProps) => {
  const [notes, setNotes] = useState(lead.notes || '');
  const [nextAction, setNextAction] = useState<NextActionType>(lead.next_action || 'none');
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onNotesChange(lead.id, notes);
      await onNextActionChange(
        lead.id,
        nextAction,
        nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined
      );
      if (nextAction && nextAction !== 'none' && nextActionDate) {
        window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
      }
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== lead.business_name) {
      await onBusinessNameChange(lead.id, trimmed);
    }
    setIsEditingName(false);
  };

  const handleCancelNameEdit = () => {
    setEditedName(lead.business_name);
    setIsEditingName(false);
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

  // Follow-up date styling
  const getFollowUpStyle = () => {
    if (!lead.next_action_date) return '';
    const d = new Date(lead.next_action_date);
    if (isToday(d)) return 'text-amber-500 font-medium';
    if (isPast(startOfDay(d))) return 'text-red-500 font-medium';
    return 'text-muted-foreground';
  };

  const getStatusBorderColor = (status: LeadStatus) => {
    switch (status) {
      case 'interested': return 'border-l-primary';
      case 'wants_draft': return 'border-l-yellow-500';
      case 'on_hold': return 'border-l-orange-500';
      case 'reviewing_draft': return 'border-l-blue-500';
      case 'paid_for_draft': return 'border-l-green-500';
      case 'completed': return 'border-l-emerald-500';
      default: return 'border-l-muted';
    }
  };

  const hasFollowUp = lead.next_action && lead.next_action !== 'none';
  const actionLabel = hasFollowUp ? NEXT_ACTION_OPTIONS.find(o => o.value === lead.next_action)?.label : null;

  // Days till due helper
  const getDueBadge = () => {
    if (!lead.next_action_date || !lead.next_action || lead.next_action === 'none') return null;
    const d = startOfDay(new Date(lead.next_action_date));
    const today = startOfDay(new Date());
    const diffMs = d.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: 'text-red-500 bg-red-500/10 border-red-500/30' };
    if (diffDays === 0) return { label: 'Due today', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' };
    if (diffDays === 1) return { label: 'Tomorrow', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' };
    if (diffDays <= 3) return { label: `In ${diffDays}d`, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' };
    return { label: `In ${diffDays}d`, color: 'text-muted-foreground bg-muted/30 border-border/50' };
  };

  const dueBadge = getDueBadge();

  const [showDetails, setShowDetails] = useState(false);

  const allStatuses = [...DEFAULT_POTENTIAL_WORK_STATUSES, ...customStatuses.map(s => ({ value: s.value as LeadStatus, label: s.label }))];

  return (
    <Card className={`border border-border/60 border-l-[3px] ${getStatusBorderColor(lead.status)} hover:border-border transition-colors shadow-sm`}>
      <div className="p-4 sm:p-5 space-y-2.5">
        {/* Row 1: Name + Status Badge + Menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-7 text-sm font-medium"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') handleCancelNameEdit();
                  }}
                />
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleSaveName}>
                  <Check className="h-3 w-3 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCancelNameEdit}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-left group flex items-start gap-1 min-w-0 w-full"
              >
                <span className="text-base sm:text-lg font-bold leading-snug break-words">{lead.business_name}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1.5" />
              </button>
            )}
            {lead.category && (
              <p className="text-xs text-muted-foreground mt-0.5">{lead.category}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <OutreachStatusBadge status={lead.status} compact />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
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
                <DropdownMenuItem onClick={handleDelete} className="text-xs text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Lead
                </DropdownMenuItem>
              </DropdownMenuContent>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </DropdownMenu>
          </div>
        </div>

        {/* Image — medium sized, inline */}
        {lead.image_url && (
          <div className="relative w-28 h-28 rounded-md overflow-hidden bg-muted/30">
            <img src={lead.image_url} alt={lead.business_name} className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        )}

        {/* Row 2: Phone + Maps link */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          {lead.phone && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 hover:text-foreground transition-colors font-mono text-xs">
                  <Phone className="h-3.5 w-3.5" />{lead.phone}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                <DropdownMenuItem asChild><a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer text-xs"><PhoneCall className="h-3.5 w-3.5" /> Call</a></DropdownMenuItem>
                <DropdownMenuItem asChild><a href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer text-xs"><Phone className="h-3.5 w-3.5 text-green-500" /> WhatsApp Call</a></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><a href={`sms:${lead.phone}`} className="flex items-center gap-2 cursor-pointer text-xs"><MessageCircle className="h-3.5 w-3.5 text-blue-500" /> SMS</a></DropdownMenuItem>
                <DropdownMenuItem asChild><a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer text-xs"><MessageSquare className="h-3.5 w-3.5 text-green-500" /> WhatsApp</a></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {lead.google_maps_url && (
            <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors text-xs">
              <MapPin className="h-3.5 w-3.5" /> View on Maps <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>

        {/* Row 3: Status dropdown + Next Action + Date */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={lead.status} onValueChange={(v) => {
              if (v === '__add_custom__') {
                onAddCustomStatus();
                return;
              }
              const isDefaultStatus = DEFAULT_POTENTIAL_WORK_STATUSES.some(s => s.value === v);
              onStatusChange(lead.id, (isDefaultStatus ? v : v) as LeadStatus);
            }}>
              <SelectTrigger className="h-8 text-xs border-border/50 bg-muted/20 px-2.5 gap-1 w-auto">
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

          {isEditing ? (
            <>
              <Select value={nextAction} onValueChange={(v) => setNextAction(v as NextActionType)}>
                <SelectTrigger className="w-auto h-8 text-xs border-border/50 bg-muted/20 px-2.5 gap-1">
                  <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEXT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`h-8 text-xs px-2.5 border-border/50`}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {nextActionDate ? format(nextActionDate, 'MMM d') : 'Set date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={nextActionDate} onSelect={setNextActionDate} initialFocus />
                </PopoverContent>
              </Popover>
            </>
          ) : hasFollowUp ? (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-xs group/action">
              <CalendarIcon className={`h-3.5 w-3.5 ${getDueBadge()?.color.split(' ')[0] || 'text-primary'}`} />
              <span className="font-medium text-primary">{actionLabel}</span>
              {lead.next_action_date && (
                <span className={`${getFollowUpStyle()}`}>
                  {format(new Date(lead.next_action_date), 'MMM d')}
                </span>
              )}
            </button>
          ) : null}

          {dueBadge && !isEditing && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${dueBadge.color}`}>
              {dueBadge.label}
            </span>
          )}
        </div>

        {/* Notes display (always visible when present) */}
        {!isEditing && lead.notes && (
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
        )}

        {/* Edit mode: notes textarea + save */}
        {isEditing && (
          <div className="space-y-2 pt-1">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes..."
              rows={2}
              className="resize-none text-sm min-h-0 bg-muted/10 border-border/30"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-7 text-xs gap-1 px-3">
                <Save className="h-3 w-3" />
                {isSaving ? '...' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setNotes(lead.notes || '');
                setNextAction(lead.next_action || 'none');
                setNextActionDate(lead.next_action_date ? new Date(lead.next_action_date) : undefined);
                setIsEditing(false);
              }} className="h-7 text-xs px-2">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Show Details & Notes — collapsible for edit access */}
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-between w-full pt-2 border-t border-border/30 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              {lead.notes || hasFollowUp ? 'Edit Details & Notes' : 'Show Details & Notes'}
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Card>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
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
