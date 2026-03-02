import { memo } from 'react';
import { WhatsAppStatusBadge } from './WhatsAppStatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { PhoneFetchStatus } from '@/hooks/useOutreach';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink, MessageSquare, MessageCircle, Star, Phone, PhoneCall, Facebook, Loader2, RefreshCw, CalendarClock } from 'lucide-react';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { openFacebookSearch } from '@/lib/facebookSearch';
import { ContactMethodBadge } from './ContactMethodBadge';
import { PipelineStatusBadge } from './PipelineStatusBadge';
import { NextActionBadge } from './NextActionBadge';
import { NextActionEditor } from './NextActionEditor';
import type { OutreachLead, LeadStatus, NextActionType, ContactMethod, PipelineStatus } from '@/types/outreach';
import { CONTACT_METHOD_OPTIONS, PIPELINE_STATUS_OPTIONS, OUTREACH_STATUS_OPTIONS } from '@/types/outreach';

interface OutreachMobileCardProps {
  lead: OutreachLead;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onLeadClick: () => void;
  onStatusChange: (status: LeadStatus) => void;
  onNextActionChange?: (action: NextActionType, date?: string) => void;
  onContactMethodChange?: (method: ContactMethod) => void;
  onPipelineStatusChange?: (status: PipelineStatus) => void;
  onWhatsAppClick: () => void;
  onSMSClick?: () => void;
  onCallClick?: () => void;
  onTrack?: () => void;
  readOnly?: boolean;
  showTrackButton?: boolean;
  isHighlighted?: boolean;
  isLastContacted?: boolean;
  onAutoTrack?: () => void;
  onCompleteAction?: () => void;
  phoneFetchStatus?: PhoneFetchStatus;
  onRetryPhoneFetch?: () => void;
}

export const OutreachMobileCard = memo(function OutreachMobileCard({
  lead,
  isSelected,
  onSelect,
  onLeadClick,
  onStatusChange,
  onNextActionChange,
  onContactMethodChange,
  onPipelineStatusChange,
  onWhatsAppClick,
  onSMSClick,
  onCallClick,
  onTrack,
  readOnly = false,
  showTrackButton = true,
  isHighlighted = false,
  isLastContacted = false,
  onAutoTrack,
  onCompleteAction,
  phoneFetchStatus,
  onRetryPhoneFetch,
}: OutreachMobileCardProps) {
  const isPhoneFetching = phoneFetchStatus === 'pending';
  const isPhoneFailed = phoneFetchStatus === 'failed';
  const hasPhone = !!lead.phone;
  const showFetchingState = !hasPhone && isPhoneFetching;

  return (
    <div 
      className={`py-3 px-3 border-b border-border/50 ${lead.is_potential_work ? 'bg-primary/5' : ''} ${isHighlighted ? 'ring-1 ring-primary/30 ring-inset bg-primary/5' : ''}`}
      onClick={onLeadClick}
    >
      <div className="flex items-start gap-2.5">
        {/* Left: Checkbox */}
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select ${lead.business_name}`}
            className="h-4 w-4"
          />
        </div>

        {/* Middle: Name + 3 Buttons */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            {lead.country === 'Australia' && (
              <span className="text-xs" title="Australia">🇦🇺</span>
            )}
            <span className="font-semibold text-sm leading-tight">{lead.business_name}</span>
            {lead.is_potential_work && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
            <WhatsAppStatusBadge status={lead.whatsapp_status} compact />
          </div>
          {hasPhone && (
            <a href={`tel:${lead.phone}`} className="text-[11px] text-muted-foreground leading-none truncate">
              {lead.phone}
            </a>
          )}

          {/* Three dropdowns: Contact Method, Status, Next Action */}
          {!readOnly && (
            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
              {/* Row 1: Contact Method + Status */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Contact Method */}
                {onContactMethodChange && (
                  <Select
                    value={lead.contact_method || ''}
                    onValueChange={(v) => {
                      onContactMethodChange(v as ContactMethod);
                    }}
                  >
                    <SelectTrigger 
                      className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0"
                      {...(isLastContacted ? { 'data-walkthrough-step': 'contact-method', 'data-walkthrough': 'contact-method' } : {})}
                    >
                      <ContactMethodBadge method={lead.contact_method as ContactMethod} compact />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Pipeline Status */}
                {onPipelineStatusChange && (
                  <Select
                    value={lead.status || 'not_contacted'}
                    onValueChange={(v) => {
                      const status = v as PipelineStatus;
                      onPipelineStatusChange(status);
                      if (status === 'interested' && onAutoTrack && !lead.is_potential_work) {
                        onAutoTrack();
                      }
                    }}
                  >
                    <SelectTrigger 
                      className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0"
                      {...(isLastContacted ? { 'data-walkthrough-step': 'pipeline-status', 'data-walkthrough': 'pipeline-status' } : {})}
                    >
                      <PipelineStatusBadge status={lead.status as PipelineStatus} compact />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Row 2: Next Action (always below) */}
              {onNextActionChange && (
                <div>
                  <NextActionEditor
                    action={lead.next_action as NextActionType | null}
                    date={lead.next_action_date}
                    onUpdate={(action, date) => onNextActionChange(action, date)}
                    leadId={lead.id}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex flex-col gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {showFetchingState ? (
            <div className="flex items-center gap-1.5 px-2 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Fetching...</span>
            </div>
          ) : (
            <>
              {/* Row 1: Maps, Facebook, Call */}
              <div className="flex items-center gap-0.5">
                {lead.google_maps_url && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10" asChild>
                    <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-blue-600 hover:text-blue-500 hover:bg-blue-500/10"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('crm-contact-action', { detail: { leadId: lead.id, method: 'facebook_msg' } }));
                    openFacebookSearch(lead.business_name);
                  }}
                >
                  <Facebook className="h-3.5 w-3.5" />
                </Button>
                {hasPhone ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <DropdownMenuItem asChild>
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer" onClick={() => onCallClick?.()}>
                          <PhoneCall className="h-4 w-4" />
                          Normal Call
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a
                          href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone!)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => onCallClick?.()}
                        >
                          <Phone className="h-4 w-4 text-green-500" />
                          WhatsApp Call
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : isPhoneFailed ? (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRetryPhoneFetch}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              {/* Row 2: SMS, WhatsApp, Track */}
              <div className="flex items-center gap-0.5" data-walkthrough={lead.outreach_attempts === 0 ? 'contact' : undefined}>
                {hasPhone ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'sms' } })); onSMSClick?.(); }}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                      onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'whatsapp' } })); onWhatsAppClick?.(); }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
                {!readOnly && showTrackButton && onTrack && (
                  lead.is_potential_work ? (
                    <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 mx-1" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                      onClick={onTrack}
                      {...(isLastContacted ? { 'data-walkthrough-step': 'track-star', 'data-walkthrough': 'track' } : {})}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
