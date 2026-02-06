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
  onDelete: (leadId: string, silent?: boolean) => Promise<boolean>;
}

const LeadCard = ({ lead, onStatusChange, onNextActionChange, onNotesChange, onDelete }: LeadCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(lead.notes || '');
  const [nextAction, setNextAction] = useState<NextActionType>(lead.next_action || 'none');
  const [nextActionDate, setNextActionDate] = useState<Date | undefined>(
    lead.next_action_date ? new Date(lead.next_action_date) : undefined
  );
  const [isSaving, setIsSaving] = useState(false);

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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate">{lead.business_name}</h3>
            {lead.category && (
              <p className="text-sm text-muted-foreground truncate">{lead.category}</p>
            )}
          </div>
          <OutreachStatusBadge status={lead.status} />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Contact Info Row */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {lead.phone && (
            <a 
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono">{lead.phone}</span>
            </a>
          )}
          {lead.google_maps_url && (
            <a
              href={lead.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
            >
              <MapPin className="h-4 w-4" />
              <span>View on Maps</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Status & Next Action Row */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={lead.status}
            onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}
          >
            <SelectTrigger className="h-9 w-[160px]">
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
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                {isExpanded ? 'Hide Details' : 'Show Details & Notes'}
              </span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead..."
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Next Action */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Next Action</label>
                <Select
                  value={nextAction}
                  onValueChange={(v) => setNextAction(v as NextActionType)}
                >
                  <SelectTrigger>
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
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Action Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
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
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Remove
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-1.5" />
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
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    fetchActivities,
  } = useOutreach();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Filter to only show interested leads (potential work) - excludes completed/paid_for_draft which go to Paid Clients
  const potentialWorkLeads = useMemo(() => {
    const interestedStatuses: LeadStatus[] = ['interested', 'wants_draft', 'on_hold', 'reviewing_draft', 'paid_for_draft'];
    
    let result = leads.filter((lead) => interestedStatuses.includes(lead.status));
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.business_name.toLowerCase().includes(query) ||
          lead.phone?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [leads, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6" />
          Potential Work
        </h1>
        <p className="text-muted-foreground max-w-lg">
          Track potential clients who've responded to your outreach. Manage their status through your sales pipeline from interested to completed.
        </p>
      </div>

      {/* Search & Stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {potentialWorkLeads.length} potential clients
        </div>
      </div>

      {/* Lead Cards Grid */}
      {potentialWorkLeads.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-16 text-center text-muted-foreground">
            No potential work leads yet. Mark leads as "Interested" in the Archive to see them here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {potentialWorkLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onStatusChange={updateStatus}
              onNextActionChange={updateNextAction}
              onNotesChange={updateNotes}
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
