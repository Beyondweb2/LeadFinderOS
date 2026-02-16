import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Phone, 
  ExternalLink, 
  Trash2, 
  Calendar as CalendarIcon,
  Pencil,
  ClipboardList,
  MessageSquare,
  Clock,
  Send,
  PhoneOff,
  PhoneCall,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { NextActionBadge } from './NextActionBadge';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType } from '@/types/outreach';
import { STATUS_OPTIONS, NEXT_ACTION_OPTIONS } from '@/types/outreach';
import { SingleWhatsAppDialog } from './SingleWhatsAppDialog';
import { FacebookSection } from './FacebookSection';

interface OutreachLeadDialogProps {
  lead: OutreachLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (leadId: string, status: LeadStatus) => Promise<any>;
  onUpdateNextAction: (leadId: string, action: NextActionType, date?: string) => Promise<any>;
  onUpdateNotes: (leadId: string, notes: string) => Promise<any>;
  onUpdateLead?: (leadId: string, updates: Partial<OutreachLead>) => Promise<any>;
  onDelete: (leadId: string) => Promise<boolean>;
  fetchActivities: (leadId: string) => Promise<OutreachActivity[]>;
  /** When true, hides status and next action editing */
  readOnly?: boolean;
}

export function OutreachLeadDialog({
  lead,
  open,
  onOpenChange,
  onUpdateStatus,
  onUpdateNextAction,
  onUpdateNotes,
  onUpdateLead,
  onDelete,
  fetchActivities,
  readOnly = false,
}: OutreachLeadDialogProps) {
  const [notes, setNotes] = useState('');
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [isEditingAction, setIsEditingAction] = useState(false);
  const [selectedAction, setSelectedAction] = useState<NextActionType>('call');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '');
      setSelectedAction(lead.next_action || 'call');
      setSelectedDate(lead.next_action_date ? new Date(lead.next_action_date) : undefined);
      
      fetchActivities(lead.id).then(setActivities);
    }
  }, [lead, fetchActivities]);

  const handleSaveAction = async () => {
    if (!lead) return;
    await onUpdateNextAction(
      lead.id,
      selectedAction,
      selectedDate?.toISOString().split('T')[0]
    );
    setIsEditingAction(false);
  };

  const handleNotesBlur = useCallback(async () => {
    if (!lead || notes === lead.notes) return;
    setIsSavingNotes(true);
    await onUpdateNotes(lead.id, notes);
    setIsSavingNotes(false);
  }, [lead, notes, onUpdateNotes]);

  const handleDelete = async () => {
    if (!lead) return;
    const confirmed = await onDelete(lead.id);
    if (confirmed) {
      onOpenChange(false);
    }
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-xl">{lead.business_name}</DialogTitle>
                <div className="mt-1">
                  {readOnly ? (
                    <OutreachStatusBadge status={lead.status} />
                  ) : (
                    <Select
                      value={lead.status}
                      onValueChange={(v) => onUpdateStatus(lead.id, v as LeadStatus)}
                    >
                      <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
                        <OutreachStatusBadge status={lead.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Next Action Section - Only show if not readOnly */}
            {!readOnly && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Pencil className="h-4 w-4" />
                    <span className="font-medium">Manual Next Action</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingAction(!isEditingAction)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>

                {isEditingAction ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Action</Label>
                        <Select
                          value={selectedAction}
                          onValueChange={(v) => setSelectedAction(v as NextActionType)}
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
                      <div>
                        <Label className="text-xs text-muted-foreground">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal',
                                !selectedDate && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={selectedDate}
                              onSelect={setSelectedDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveAction}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingAction(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
                    <NextActionBadge 
                      action={lead.next_action} 
                      date={lead.next_action_date}
                      leadId={lead.id}
                    />
                  </div>
                )}
              </div>
            )}

            {!readOnly && <Separator />}

            {/* Contact Information */}
            <div>
              <h3 className="font-semibold mb-3">Contact Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-24">Phone:</span>
                  {lead.phone ? (
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-primary hover:underline flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
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
                            <a
                              href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Phone className="h-4 w-4 text-green-500" />
                              WhatsApp Call
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {lead.status !== 'no_whatsapp' ? (
                        <>
                          <button
                            onClick={() => setShowWhatsAppDialog(true)}
                            className="text-green-500 hover:text-green-400 p-1 rounded hover:bg-muted"
                            title="Send WhatsApp message"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onUpdateStatus(lead.id, 'no_whatsapp')}
                            className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-muted"
                            title="Mark as No WhatsApp"
                          >
                            <PhoneOff className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <PhoneOff className="h-3.5 w-3.5" />
                          No WhatsApp
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-24">Google Maps:</span>
                  {lead.google_maps_url ? (
                    <a
                      href={lead.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Listing
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                {lead.address && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-24">Address:</span>
                    <span>{lead.address}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Facebook Section */}
            {onUpdateLead && (
              <>
                <FacebookSection lead={lead} onUpdate={onUpdateLead} />
                <Separator />
              </>
            )}

            {/* Activity Log */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Activity Log</h3>
                <span className="text-sm text-muted-foreground">
                  View All ({activities.length})
                </span>
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity logged yet.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {activities.slice(0, 5).map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30"
                    >
                      <Clock className="h-3 w-3 mt-0.5 text-muted-foreground" />
                      <div>
                        <p>{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Notes */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Notes</h3>
              </div>
              <Textarea
                placeholder="Add any relevant notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                className="min-h-[100px] resize-none bg-background border-border"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isSavingNotes ? 'Saving...' : 'Notes are automatically saved'}
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* WhatsApp Dialog */}
        <SingleWhatsAppDialog
          open={showWhatsAppDialog}
          onOpenChange={setShowWhatsAppDialog}
          lead={lead ? { phone: lead.phone || '', business_name: lead.business_name } : null}
        />
      </DialogContent>
    </Dialog>
  );
}
