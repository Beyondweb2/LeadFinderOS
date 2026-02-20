import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ExternalLink, MessageSquare, MessageCircle, Star, Phone, PhoneCall, Facebook } from 'lucide-react';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { NextActionBadge } from './NextActionBadge';
import type { OutreachLead, LeadStatus, NextActionType } from '@/types/outreach';
import { STATUS_OPTIONS, OUTREACH_STATUS_OPTIONS } from '@/types/outreach';

interface OutreachMobileCardProps {
  lead: OutreachLead;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onLeadClick: () => void;
  onStatusChange: (status: LeadStatus) => void;
  onWhatsAppClick: () => void;
  onSMSClick?: () => void;
  onCallClick?: () => void;
  onTrack?: () => void;
  readOnly?: boolean;
  showTrackButton?: boolean;
  isHighlighted?: boolean;
  onAutoTrack?: () => void;
  onCompleteAction?: () => void;
}

export function OutreachMobileCard({
  lead,
  isSelected,
  onSelect,
  onLeadClick,
  onStatusChange,
  onWhatsAppClick,
  onSMSClick,
  onCallClick,
  onTrack,
  readOnly = false,
  showTrackButton = true,
  isHighlighted = false,
  onAutoTrack,
  onCompleteAction,
}: OutreachMobileCardProps) {
  return (
    <div 
      className={`py-3 px-3 border-b border-border/50 ${lead.is_potential_work ? 'bg-primary/5' : ''} ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
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

        {/* Middle: Name + Status + Next Action */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            {lead.country === 'Australia' && (
              <span className="text-xs" title="Australia">🇦🇺</span>
            )}
            <span className="font-semibold text-sm leading-tight">{lead.business_name}</span>
            {lead.is_potential_work && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>

          {/* Status + Next Action under name */}
          <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {!readOnly && (
              <Select
                value={lead.status}
                onValueChange={(v) => {
                  const status = v as LeadStatus;
                  onStatusChange(status);
                  if (status === 'interested' && onAutoTrack && !lead.is_potential_work) {
                    onAutoTrack();
                  }
                }}
              >
                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
                  <OutreachStatusBadge status={lead.status} compact />
                </SelectTrigger>
                <SelectContent>
                  {OUTREACH_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {!readOnly && lead.next_action && lead.next_action !== 'none' && (
              <NextActionBadge 
                action={lead.next_action} 
                date={lead.next_action_date}
                compact
                leadId={lead.id}
                onComplete={onCompleteAction}
              />
            )}
          </div>
        </div>

        {/* Right: Action buttons - 2 rows on mobile */}
        <div className="flex flex-col gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Row 1: Maps, Facebook, Call */}
          <div className="flex items-center gap-0.5">
            {lead.google_maps_url && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10" asChild>
                <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-500 hover:bg-blue-500/10" asChild>
              <a
                href={`https://www.facebook.com/search/pages/?q=${encodeURIComponent(lead.business_name)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Facebook className="h-3.5 w-3.5" />
              </a>
            </Button>
            {lead.phone && (
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
                      href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
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
            )}
          </div>
          {/* Row 2: SMS, WhatsApp, Track */}
          <div className="flex items-center gap-0.5">
            {lead.phone && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  onClick={onSMSClick}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                  onClick={onWhatsAppClick}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {!readOnly && showTrackButton && onTrack && (
              lead.is_potential_work ? (
                <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 mx-1" />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                  onClick={onTrack}
                >
                  <Star className="h-3.5 w-3.5" />
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
