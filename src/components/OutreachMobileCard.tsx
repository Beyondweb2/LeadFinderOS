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
import { ExternalLink, MessageSquare, MessageCircle, Star, Phone, PhoneCall, Facebook, Loader2, RefreshCw, MoreHorizontal } from 'lucide-react';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { NextActionEditor } from './NextActionEditor';
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
  phoneFetchStatus?: PhoneFetchStatus;
  onRetryPhoneFetch?: () => void;
  onUpdateNextAction?: (action: NextActionType, date?: string) => void;
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
  phoneFetchStatus,
  onRetryPhoneFetch,
  onUpdateNextAction,
}: OutreachMobileCardProps) {
  const initials = lead.business_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const categoryLabel = lead.category || '';

  return (
    <div
      className={`p-4 sm:px-5 sm:py-4 border-b border-border/50 space-y-3 ${
        lead.is_potential_work ? 'bg-primary/5' : ''
      } ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
    >
      {/* Row 1: Avatar + Name + Actions */}
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select ${lead.business_name}`}
            className="h-4 w-4"
          />
        </div>

        {/* Avatar */}
        <div
          className="flex-shrink-0 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-primary/10 border border-primary/20 cursor-pointer"
          onClick={onLeadClick}
        >
          <span className="text-lg sm:text-xl font-bold text-primary">{initials}</span>
        </div>

        {/* Name + Category + Status */}
        <div className="flex-1 min-w-0 pt-0.5 cursor-pointer" onClick={onLeadClick}>
          <div className="flex items-center gap-1.5">
            {lead.country === 'Australia' && (
              <span className="text-xs" title="Australia">🇦🇺</span>
            )}
            <h3 className="font-bold text-base sm:text-lg leading-tight truncate">
              {lead.business_name}
            </h3>
            {lead.is_potential_work && (
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
          {categoryLabel && (
            <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{categoryLabel}</p>
          )}
          {/* Status badge */}
          {!readOnly && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
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
                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0" data-walkthrough-step="status">
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
            </div>
          )}
        </div>

        {/* Top-right: External links + menu */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {lead.google_maps_url && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10" asChild>
              <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-500 hover:bg-blue-500/10" asChild>
            <a
              href={`https://www.facebook.com/search/pages/?q=${encodeURIComponent(lead.business_name)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Facebook className="h-4 w-4" />
            </a>
          </Button>
          {!readOnly && showTrackButton && onTrack && !lead.is_potential_work && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
              onClick={onTrack}
              data-walkthrough-step="track-star"
            >
              <Star className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Contact Buttons */}
      {lead.phone ? (
        <div className="flex items-center gap-2 pl-8 sm:pl-9" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 gap-1.5 text-green-500 border-green-500/20 hover:bg-green-500/10 hover:text-green-400 rounded-lg text-xs font-medium"
            onClick={onWhatsAppClick}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            WhatsApp
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9 gap-1.5 text-blue-400 border-blue-400/20 hover:bg-blue-400/10 hover:text-blue-300 rounded-lg text-xs font-medium"
            onClick={onSMSClick}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            SMS
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 gap-1.5 text-amber-500 border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-400 rounded-lg text-xs font-medium"
              >
                <Phone className="h-3.5 w-3.5" />
                Call
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
        </div>
      ) : phoneFetchStatus === 'pending' ? (
        <div className="flex items-center gap-2 pl-8 sm:pl-9 text-muted-foreground text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Fetching phone...
        </div>
      ) : phoneFetchStatus === 'failed' ? (
        <div className="flex items-center gap-2 pl-8 sm:pl-9" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="text-destructive text-xs gap-1" onClick={onRetryPhoneFetch}>
            <RefreshCw className="h-3 w-3" />
            Retry phone lookup
          </Button>
        </div>
      ) : null}

      {/* Row 3: Next Action */}
      {!readOnly && onUpdateNextAction && (
        <div className="pl-8 sm:pl-9" onClick={(e) => e.stopPropagation()}>
          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
            <NextActionEditor
              action={lead.next_action}
              date={lead.next_action_date}
              onUpdate={onUpdateNextAction}
              leadId={lead.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
