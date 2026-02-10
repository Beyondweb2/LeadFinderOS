import { useState, useMemo } from 'react';
import { useOutreach } from '@/hooks/useOutreach';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OutreachStatusBadge } from '@/components/OutreachStatusBadge';
import { NextActionBadge } from '@/components/NextActionBadge';
import { 
  Briefcase, 
  Phone, 
  Search, 
  Calendar as CalendarIcon, 
  MapPin, 
  ExternalLink, 
  Trash2,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Save,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import type { OutreachLead, LeadStatus, NextActionType } from '@/types/outreach';

// Potential work specific statuses (completed goes to Paid Clients page)
const POTENTIAL_WORK_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'wants_draft', label: 'Wants a Draft' },
  { value: 'on_hold', label: 'Waiting' },
  { value: 'reviewing_draft', label: 'Reviewing Draft' },
  { value: 'paid_for_draft', label: 'Paid for Draft' },
  { value: 'completed', label: 'Completed → Paid Client' },
];

const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'send_draft', label: 'Send Draft' },
];

interface LeadCardProps {
  lead: OutreachLead;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<OutreachLead | null>;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => Promise<OutreachLead | null>;
  onNotesChange: (leadId: string, notes: string) => Promise<OutreachLead | null>;
  onBusinessNameChange: (leadId: string, name: string) => Promise<OutreachLead | null>;
  onDelete: (leadId: string, silent?: boolean) => Promise<boolean>;
}

const LeadCard = ({ lead, onStatusChange, onNextActionChange, onNotesChange, onBusinessNameChange, onDelete }: LeadCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');
  const [nextAction, setNextAction] = useState<NextActionType>(lead.next_action || 'none');
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onNotesChange(lead.id, notes);
      await onNextActionChange(
        lead.id,
        nextAction,
        nextActionDate ? format(nextActionDate, 'yyyy-MM-dd') : undefined
      );
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

  // Get status color for card accent
  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'interested':
        return 'border-l-primary';
      case 'wants_draft':
        return 'border-l-yellow-500';
      case 'on_hold':
        return 'border-l-orange-500';
      case 'reviewing_draft':
        return 'border-l-blue-500';
      case 'paid_for_draft':
        return 'border-l-green-500';
      case 'completed':
        return 'border-l-emerald-500';
      default:
        return 'border-l-muted';
    }
  };

  return (
    <Card className={`bg-card/80 border-border/50 border-l-4 ${getStatusColor(lead.status)} transition-all hover:shadow-lg`}>
      <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
        {/* Business Name - full width, no truncation on mobile */}
        <div className="space-y-1">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="h-8 text-base font-semibold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') handleCancelNameEdit();
                }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveName}>
                <Check className="h-4 w-4 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCancelNameEdit}>
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <button
                onClick={() => setIsEditingName(true)}
                className="text-left group flex items-start gap-1.5 min-w-0 flex-1"
              >
                <h3 className="text-base sm:text-lg font-semibold break-words leading-tight">
                  {lead.business_name}
                </h3>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </button>
              <div className="shrink-0">
                <OutreachStatusBadge status={lead.status} />
              </div>
            </div>
          )}
          {lead.category && (
            <p className="text-xs text-muted-foreground">{lead.category}</p>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
        {/* Contact Info */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-sm">
          {lead.phone && (
            <a 
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
            >
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-sm">{lead.phone}</span>
            </a>
          )}
          {lead.google_maps_url && (
            <a
              href={lead.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm">View on Maps</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Status Select + Next Action */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Select
            value={lead.status}
            onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}
          >
            <SelectTrigger className="h-9 w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POTENTIAL_WORK_STATUSES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {lead.next_action && lead.next_action !== 'none' && (
            <div className="flex items-center gap-2">
              <NextActionBadge action={lead.next_action} />
              {lead.next_action_date && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(lead.next_action_date), 'MMM d')}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Notes Preview (collapsed) */}
        {!isExpanded && lead.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            <StickyNote className="h-3.5 w-3.5 inline mr-1.5" />
            {lead.notes}
          </p>
        )}

        {/* Expandable Notes Section */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8">
              <span className="flex items-center gap-2 text-sm">
                <StickyNote className="h-3.5 w-3.5" />
                {isExpanded ? 'Hide Details' : 'Show Details & Notes'}
              </span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-3 pt-3">
            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* Next Action */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Next Action</label>
                <Select
                  value={nextAction}
                  onValueChange={(v) => setNextAction(v as NextActionType)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT_ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Action Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {nextActionDate ? format(nextActionDate, 'MMM d') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={nextActionDate}
                      onSelect={setNextActionDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="h-8 text-xs"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
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
  } = useOutreach();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Filter to only show interested leads (potential work) - uses is_potential_work flag OR interested statuses
  // This ensures leads marked as interested from the CRM appear here
  // Must check BOTH active leads and archived leads (since archived leads can also be potential work)
  const potentialWorkLeads = useMemo(() => {
    const interestedStatuses: LeadStatus[] = ['interested', 'wants_draft', 'on_hold', 'reviewing_draft', 'paid_for_draft'];
    
    // Combine active and archived leads for filtering
    const allLeads = [...leads, ...archivedLeads];
    
    // Include leads that have is_potential_work=true OR have an interested status
    // Exclude completed status as those go to Paid Clients page
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
    <div className="space-y-3 sm:space-y-6">
      {/* Page Header - Compact on mobile */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
          <Briefcase className="h-4 w-4 sm:h-6 sm:w-6" />
          Track Leads
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Track leads who've responded positively to your outreach. Manage their status from first response to completed deal.
        </p>
      </div>

      {/* Search & Stats - Compact on mobile */}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 sm:pl-9 h-8 sm:h-10 text-sm"
          />
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          {potentialWorkLeads.length} leads
        </div>
      </div>

      {/* Lead Cards Grid */}
      {potentialWorkLeads.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-10 sm:py-16 text-center text-muted-foreground text-sm">
            No tracked leads yet. Click "Track" in the Outreach CRM to see them here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {potentialWorkLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={updateStatus}
              onNextActionChange={updateNextAction}
              onNotesChange={updateNotes}
              onBusinessNameChange={updateBusinessName}
              onDelete={deleteLead}
            />
          ))}
        </div>
      )}

      {/* Lead Detail Dialog (for full history view) */}
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
    </div>
  );
};

export default PotentialWorkPage;
