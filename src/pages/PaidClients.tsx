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
  DollarSign, 
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

const NEXT_ACTION_OPTIONS: { value: NextActionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'call', label: 'Call' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'send_draft', label: 'Send Draft' },
];

interface ClientCardProps {
  lead: OutreachLead;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => Promise<OutreachLead | null>;
  onNotesChange: (leadId: string, notes: string) => Promise<OutreachLead | null>;
  onDelete: (leadId: string, silent?: boolean) => Promise<boolean>;
}

const ClientCard = ({ lead, onNextActionChange, onNotesChange, onDelete }: ClientCardProps) => {
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
    if (confirm('Are you sure you want to remove this client?')) {
      await onDelete(lead.id);
    }
  };

  return (
    <Card className="bg-card/80 border-border/50 border-l-4 border-l-emerald-500 transition-all hover:shadow-lg">
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

        {/* Next Action Row */}
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
                placeholder="Add notes about this client..."
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

const PaidClientsPage = () => {
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

  // Filter to only show completed/paid clients
  const paidClients = useMemo(() => {
    const paidStatuses: LeadStatus[] = ['completed', 'paid_for_draft'];
    
    let result = leads.filter((lead) => paidStatuses.includes(lead.status));
    
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
    <div className="space-y-3 sm:space-y-6">
      {/* Page Header - Compact on mobile */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
          <DollarSign className="h-4 w-4 sm:h-6 sm:w-6" />
          Paid Clients
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground">
          Clients who have completed payment
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
          {paidClients.length} clients
        </div>
      </div>

      {/* Client Cards Grid */}
      {paidClients.length === 0 ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-10 sm:py-16 text-center text-muted-foreground text-sm">
            No paid clients yet. When leads complete payment, they'll appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {paidClients.map((lead) => (
            <ClientCard
              key={lead.id}
              lead={lead}
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

export default PaidClientsPage;
