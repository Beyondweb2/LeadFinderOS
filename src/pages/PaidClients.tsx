import { useState, useMemo } from 'react';
import { useOutreach } from '@/hooks/useOutreach';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
  Save,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  MessageCircle,
  PhoneCall,
  MoreHorizontal,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import type { OutreachLead, LeadStatus } from '@/types/outreach';

interface ClientCardProps {
  lead: OutreachLead;
  onUpdateClientDetails: (leadId: string, details: Partial<Pick<OutreachLead, 'amount_paid' | 'paid_for' | 'payment_date' | 'project_duration' | 'next_checkin_date' | 'checkin_notes'>>) => Promise<OutreachLead | null>;
  onNotesChange: (leadId: string, notes: string) => Promise<OutreachLead | null>;
  onBusinessNameChange: (leadId: string, name: string) => Promise<OutreachLead | null>;
  onDelete: (leadId: string, silent?: boolean) => Promise<boolean>;
}

const ClientCard = ({ lead, onUpdateClientDetails, onNotesChange, onBusinessNameChange, onDelete }: ClientCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead.business_name);

  // Local form state
  const [amountPaid, setAmountPaid] = useState(lead.amount_paid?.toString() || '');
  const [paidFor, setPaidFor] = useState(lead.paid_for || '');
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(
    lead.payment_date ? new Date(lead.payment_date) : undefined
  );
  const [projectDuration, setProjectDuration] = useState(lead.project_duration || '');
  const [nextCheckinDate, setNextCheckinDate] = useState<Date | undefined>(
    lead.next_checkin_date ? new Date(lead.next_checkin_date) : undefined
  );
  const [checkinNotes, setCheckinNotes] = useState(lead.checkin_notes || '');
  const [notes, setNotes] = useState(lead.notes || '');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateClientDetails(lead.id, {
        amount_paid: amountPaid ? parseFloat(amountPaid) : null,
        paid_for: paidFor || null,
        payment_date: paymentDate ? format(paymentDate, 'yyyy-MM-dd') : null,
        project_duration: projectDuration || null,
        next_checkin_date: nextCheckinDate ? format(nextCheckinDate, 'yyyy-MM-dd') : null,
        checkin_notes: checkinNotes || null,
      });
      await onNotesChange(lead.id, notes);
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
    if (confirm('Are you sure you want to remove this client?')) {
      await onDelete(lead.id);
    }
  };

  // Check-in status
  const getCheckinStatus = () => {
    if (!lead.next_checkin_date) return null;
    const checkinDate = new Date(lead.next_checkin_date);
    if (isPast(checkinDate) && !isToday(checkinDate)) {
      const daysOverdue = differenceInDays(new Date(), checkinDate);
      return { type: 'overdue' as const, label: `${daysOverdue}d overdue`, date: checkinDate };
    }
    if (isToday(checkinDate)) {
      return { type: 'today' as const, label: 'Due today', date: checkinDate };
    }
    const daysUntil = differenceInDays(checkinDate, new Date());
    return { type: 'upcoming' as const, label: `In ${daysUntil}d`, date: checkinDate };
  };

  const checkinStatus = getCheckinStatus();

  return (
    <Card className="bg-card border border-border border-l-4 border-l-emerald-500 transition-all hover:shadow-lg shadow-md">
      <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
        {/* Business Name */}
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
            <button
              onClick={() => setIsEditingName(true)}
              className="text-left group flex items-start gap-1.5 min-w-0 w-full"
            >
              <h3 className="text-base sm:text-lg font-semibold break-words leading-tight">
                {lead.business_name}
              </h3>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
            </button>
          )}
          {lead.category && (
            <p className="text-xs text-muted-foreground">{lead.category}</p>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
        {/* Quick Info Row: Payment + Check-in badge */}
        <div className="flex flex-wrap items-center gap-2">
          {lead.amount_paid && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
              <DollarSign className="h-3 w-3" />
              £{lead.amount_paid}
            </span>
          )}
          {lead.paid_for && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              <FileText className="h-3 w-3" />
              {lead.paid_for}
            </span>
          )}
          {lead.project_duration && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Clock className="h-3 w-3" />
              {lead.project_duration}
            </span>
          )}
          {checkinStatus && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              checkinStatus.type === 'overdue' && "bg-destructive/10 text-destructive",
              checkinStatus.type === 'today' && "bg-yellow-500/10 text-yellow-600",
              checkinStatus.type === 'upcoming' && "bg-blue-500/10 text-blue-500",
            )}>
              {checkinStatus.type === 'overdue' ? (
                <AlertCircle className="h-3 w-3" />
              ) : checkinStatus.type === 'today' ? (
                <Clock className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Check-in {checkinStatus.label}
            </span>
          )}
        </div>

        {/* Contact + Actions row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-sm">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {lead.phone && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm">{lead.phone}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  <DropdownMenuItem asChild>
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer">
                      <PhoneCall className="h-4 w-4" />
                      Normal Call
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                      <Phone className="h-4 w-4 text-green-500" />
                      WhatsApp Call
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {lead.google_maps_url && (
              <a
                href={lead.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm">Maps</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {lead.phone && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer">
                    <PhoneCall className="h-4 w-4 text-primary" />
                    Normal Call
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                    <Phone className="h-4 w-4 text-green-500" />
                    WhatsApp Call
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`sms:${lead.phone}`} className="flex items-center gap-2 cursor-pointer">
                    <MessageCircle className="h-4 w-4 text-blue-500" />
                    SMS
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a 
                    href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4 text-green-500" />
                    WhatsApp
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Payment date preview */}
        {lead.payment_date && (
          <p className="text-xs text-muted-foreground">
            Paid on {format(new Date(lead.payment_date), 'MMM d, yyyy')}
          </p>
        )}

        {/* Notes preview when collapsed */}
        {!isExpanded && (lead.notes || lead.checkin_notes) && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {lead.checkin_notes || lead.notes}
          </p>
        )}

        {/* Expandable Details Section */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8">
              <span className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5" />
                {isExpanded ? 'Hide Details' : 'Edit Details'}
              </span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-3 pt-3">
            {/* Payment Details */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment Details</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Amount (£)</label>
                  <Input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Payment Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-8 text-sm">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {paymentDate ? format(paymentDate, 'MMM d') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={setPaymentDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Paid For</label>
                  <Input
                    value={paidFor}
                    onChange={(e) => setPaidFor(e.target.value)}
                    placeholder="e.g. Website redesign"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Duration</label>
                  <Input
                    value={projectDuration}
                    onChange={(e) => setProjectDuration(e.target.value)}
                    placeholder="e.g. 2 weeks"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Check-in Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Check-in</label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Next Check-in Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-8 text-sm">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {nextCheckinDate ? format(nextCheckinDate, 'MMM d, yyyy') : 'Schedule check-in'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={nextCheckinDate}
                        onSelect={setNextCheckinDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Check-in Notes</label>
                  <Textarea
                    value={checkinNotes}
                    onChange={(e) => setCheckinNotes(e.target.value)}
                    placeholder="Notes from last check-in or reminders..."
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            </div>

            {/* General Notes */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">General Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                className="resize-none text-sm"
              />
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

const PaidClientsPage = () => {
  const {
    leads,
    isLoading,
    updateClientDetails,
    updateNotes,
    updateBusinessName,
    deleteLead,
  } = useOutreach();

  const [searchQuery, setSearchQuery] = useState('');

  // Filter to only show completed/paid clients
  const paidClients = useMemo(() => {
    const paidStatuses: LeadStatus[] = ['completed', 'paid_for_draft', 'payment_received' as LeadStatus];
    
    let result = leads.filter((lead) => paidStatuses.includes(lead.status) || mapLegacyStatus(lead.status) === 'payment_received');
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.business_name.toLowerCase().includes(query) ||
          lead.phone?.toLowerCase().includes(query) ||
          lead.paid_for?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [leads, searchQuery]);

  // Count clients with overdue check-ins
  const overdueCount = useMemo(() => {
    return paidClients.filter(c => {
      if (!c.next_checkin_date) return false;
      const d = new Date(c.next_checkin_date);
      return isPast(d) && !isToday(d);
    }).length;
  }, [paidClients]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Page Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
          <DollarSign className="h-4 w-4 sm:h-6 sm:w-6" />
          Paid Clients
        </h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Track payments, project details, and schedule check-ins with your paying clients.
        </p>
      </div>

      {/* Search & Stats */}
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
        <div className="flex items-center gap-3">
          {overdueCount > 0 && (
            <span className="text-xs font-medium text-destructive flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              {overdueCount} overdue
            </span>
          )}
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {paidClients.length} clients
          </span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-4">
          {paidClients.map((lead) => (
            <ClientCard
              key={lead.id}
              lead={lead}
              onUpdateClientDetails={updateClientDetails}
              onNotesChange={updateNotes}
              onBusinessNameChange={updateBusinessName}
              onDelete={deleteLead}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PaidClientsPage;
