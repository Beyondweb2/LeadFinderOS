import { useState, useMemo } from 'react';
import { useOutreach } from '@/hooks/useOutreach';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { 
  DollarSign, 
  Phone, 
  Search, 
  Calendar as CalendarIcon, 
  ExternalLink, 
  Trash2,
  Save,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  MessageCircle,
  PhoneCall,
  MoreVertical,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import type { OutreachLead } from '@/types/outreach';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

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

  const saveDetails = async (overrides: Partial<{ amountPaid: string; paidFor: string; paymentDate: Date | undefined; projectDuration: string; nextCheckinDate: Date | undefined; checkinNotes: string }> = {}) => {
    const ap = overrides.amountPaid ?? amountPaid;
    const pf = overrides.paidFor ?? paidFor;
    const pd = overrides.paymentDate !== undefined ? overrides.paymentDate : paymentDate;
    const dur = overrides.projectDuration ?? projectDuration;
    const ncd = overrides.nextCheckinDate !== undefined ? overrides.nextCheckinDate : nextCheckinDate;
    const cn2 = overrides.checkinNotes ?? checkinNotes;
    await onUpdateClientDetails(lead.id, {
      amount_paid: ap ? parseFloat(ap) : null,
      paid_for: pf || null,
      payment_date: pd ? format(pd, 'yyyy-MM-dd') : null,
      project_duration: dur || null,
      next_checkin_date: ncd ? format(ncd, 'yyyy-MM-dd') : null,
      checkin_notes: cn2 || null,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveDetails();
      await onNotesChange(lead.id, notes);
      setIsExpanded(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentDateChange = (date: Date | undefined) => {
    setPaymentDate(date);
    saveDetails({ paymentDate: date });
  };

  const handleCheckinDateChange = (date: Date | undefined) => {
    setNextCheckinDate(date);
    saveDetails({ nextCheckinDate: date });
  };

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== lead.business_name) {
      await onBusinessNameChange(lead.id, trimmed);
    }
    setIsEditingName(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to remove this client?')) {
      await onDelete(lead.id);
    }
  };

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
    <div className={cn(
      'border-l-2 transition-all bg-card rounded-lg border border-border',
      checkinStatus?.type === 'overdue' ? 'border-l-destructive' : 'border-l-emerald-500',
      isExpanded ? 'ring-1 ring-primary/20 ring-inset' : ''
    )}>
      {/* ═══ COLLAPSED (always visible) ═══ */}
      <div
        className="py-3.5 px-3.5 lg:py-5 lg:px-5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3 lg:gap-4">
          {/* Left: Avatar + payment amount */}
          <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs sm:text-sm lg:text-base font-bold text-emerald-500">
              {getInitials(lead.business_name)}
            </div>
            {lead.amount_paid && (
              <span className="text-[9px] text-emerald-500/70 font-semibold leading-none whitespace-nowrap">£{lead.amount_paid.toLocaleString()}</span>
            )}
          </div>

          {/* Middle: Name + Phone + Meta + Status badges */}
          <div className="flex-1 min-w-0 space-y-1.5 lg:space-y-2">
            {/* Name */}
            <div className="flex items-center gap-1.5">
              {isEditingName ? (
                <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-7 text-xs font-semibold px-1.5 flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') { setEditedName(lead.business_name); setIsEditingName(false); }
                    }}
                  />
                  <button onClick={handleSaveName} className="h-6 w-6 flex items-center justify-center text-green-500 hover:bg-green-500/10 rounded"><Check className="h-3 w-3" /></button>
                  <button onClick={() => { setEditedName(lead.business_name); setIsEditingName(false); }} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:bg-muted/40 rounded"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <>
                  <span className="font-semibold text-sm sm:text-base lg:text-[17px] leading-tight truncate">{lead.business_name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }}
                    className="h-5 w-5 flex items-center justify-center text-muted-foreground/30 hover:text-foreground rounded transition-colors shrink-0"
                    title="Edit name"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                </>
              )}
            </div>

            {/* Phone number */}
            {lead.phone && (
              <p className="text-[11px] text-muted-foreground/50 leading-none truncate">{lead.phone}</p>
            )}

            {/* Meta line */}
            <div className="flex items-center gap-1 text-[10px] lg:text-[11px] text-muted-foreground/60 flex-wrap">
              {lead.category && <span className="truncate max-w-[120px]">{lead.category}</span>}
              {lead.paid_for && (
                <>
                  {lead.category && <span className="text-muted-foreground/20">·</span>}
                  <span className="text-primary/50 truncate max-w-[180px]">{lead.paid_for}</span>
                </>
              )}
              {lead.project_duration && (
                <>
                  <span className="text-muted-foreground/20">·</span>
                  <span className="truncate">{lead.project_duration}</span>
                </>
              )}
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
              <span className="inline-flex items-center h-5 lg:h-[22px] px-2 lg:px-2.5 rounded-full text-[10px] lg:text-[11px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                <Check className="h-2.5 w-2.5 mr-0.5" />
                Paid
              </span>
              {lead.payment_date && (
                <span className="text-[10px] text-muted-foreground/50">
                  {format(new Date(lead.payment_date), 'MMM d, yyyy')}
                </span>
              )}
              {checkinStatus && (
                <span className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] lg:text-[11px] font-semibold px-1.5 py-0.5 rounded-full border',
                  checkinStatus.type === 'overdue' && 'bg-destructive/10 text-destructive border-destructive/25',
                  checkinStatus.type === 'today' && 'bg-yellow-500/10 text-yellow-500 border-yellow-500/25',
                  checkinStatus.type === 'upcoming' && 'bg-blue-500/10 text-blue-500 border-blue-500/25',
                )}>
                  {checkinStatus.type === 'overdue' ? <AlertCircle className="h-2.5 w-2.5" /> :
                   checkinStatus.type === 'today' ? <Clock className="h-2.5 w-2.5" /> :
                   <CheckCircle2 className="h-2.5 w-2.5" />}
                  Check-in {checkinStatus.label}
                </span>
              )}
            </div>
          </div>

          {/* Right: Contact icons + overflow */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Row 1: Maps + Menu */}
            <div className="flex items-center gap-0.5">
              {lead.google_maps_url && (
                <a
                  href={lead.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-blue-500 hover:bg-blue-500/10 transition-colors"
                  title="Google Maps"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuItem onClick={() => setIsExpanded(true)} className="text-xs">
                    <FileText className="h-3.5 w-3.5 mr-2" /> Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-xs text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Client
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* Row 2: SMS / WhatsApp / Call */}
            {lead.phone && (
              <div className="flex items-center gap-0.5">
                <a
                  href={`sms:+${formatPhoneForWhatsApp(lead.phone)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors"
                  title="SMS"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
                <a
                  href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors"
                  title="WhatsApp"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-7 flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-500/10 transition-colors"
                      title="Call"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    <DropdownMenuItem asChild>
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer">
                        <Phone className="h-4 w-4 text-amber-500" /> Normal Call
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <MessageCircle className="h-4 w-4 text-green-500" /> WhatsApp Call
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Notes preview + expand button when collapsed */}
        {!isExpanded && (
          <div className="flex items-center gap-2 mt-2 lg:mt-3 ml-[52px] sm:ml-[60px] lg:ml-[72px]">
            <div className="flex-1 min-w-0">
              {(lead.notes || lead.checkin_notes) && (
                <p className="text-[11px] lg:text-xs text-muted-foreground/50 line-clamp-1 leading-relaxed">
                  {lead.checkin_notes || lead.notes}
                </p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
              className="shrink-0 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              <ChevronDown className="h-3 w-3" /> Edit
            </button>
          </div>
        )}
      </div>

      {/* ═══ EXPANDED ═══ */}
      {isExpanded && (
        <div className="px-3.5 pb-4 lg:px-5 lg:pb-5 space-y-3 border-t border-border/40 pt-3">
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
                      onSelect={handlePaymentDateChange}
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
                      onSelect={handleCheckinDateChange}
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
        </div>
      )}
    </div>
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
    const paidStatuses = ['completed', 'paid_for_draft', 'payment_received'];
    
    let result = leads.filter((lead) => paidStatuses.includes(lead.status));
    
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

  const totalRevenue = useMemo(() => {
    return paidClients.reduce((sum, c) => sum + (c.amount_paid || 0), 0);
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
          {totalRevenue > 0 && (
            <span className="text-xs sm:text-sm font-bold text-emerald-500 flex items-center gap-1 whitespace-nowrap">
              <DollarSign className="h-3.5 w-3.5" />
              £{totalRevenue.toLocaleString()}
            </span>
          )}
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
        <div className="rounded-xl border border-border bg-card divide-y divide-border/40">
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
