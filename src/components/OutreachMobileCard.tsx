import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, MessageSquare, MessageCircle, Star, PhoneOff } from 'lucide-react';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { NextActionBadge } from './NextActionBadge';
import type { OutreachLead, LeadStatus, NextActionType } from '@/types/outreach';
import { STATUS_OPTIONS } from '@/types/outreach';

interface OutreachMobileCardProps {
  lead: OutreachLead;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onLeadClick: () => void;
  onStatusChange: (status: LeadStatus) => void;
  onWhatsAppClick: () => void;
  onSMSClick?: () => void;
  onTrack?: () => void;
  readOnly?: boolean;
  showTrackButton?: boolean;
  isHighlighted?: boolean;
}

export function OutreachMobileCard({
  lead,
  isSelected,
  onSelect,
  onLeadClick,
  onStatusChange,
  onWhatsAppClick,
  onSMSClick,
  onTrack,
  readOnly = false,
  showTrackButton = true,
  isHighlighted = false,
}: OutreachMobileCardProps) {
  return (
    <div 
      className={`py-2 px-2.5 border-b border-border/50 ${lead.is_potential_work ? 'bg-primary/5' : ''} ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
      onClick={onLeadClick}
    >
      {/* Row 1: Checkbox + Business Name */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select ${lead.business_name}`}
            className="h-4 w-4"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {lead.country === 'Australia' && (
              <span className="text-[10px]" title="Australia">🇦🇺</span>
            )}
            <span className="font-medium text-xs truncate">{lead.business_name}</span>
            {lead.is_potential_work && (
              <Star className="h-2.5 w-2.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Status + Next Action */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 mb-2" onClick={(e) => e.stopPropagation()}>
          <Select
            value={lead.status}
            onValueChange={onStatusChange}
          >
            <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0">
              <OutreachStatusBadge status={lead.status} compact />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {lead.next_action && (
            <NextActionBadge 
              action={lead.next_action} 
              date={lead.next_action_date}
              compact
            />
          )}
        </div>
      )}

      {/* Row 3: Action Buttons - Compact */}
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {/* Google Maps */}
        {lead.google_maps_url && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs flex-1"
            asChild
          >
            <a
              href={lead.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Maps
            </a>
          </Button>
        )}

        {/* WhatsApp */}
        {lead.phone && lead.status !== 'no_whatsapp' && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex-1 text-green-500 border-green-500/30 hover:bg-green-500/10 hover:text-green-400"
              onClick={onWhatsAppClick}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              onClick={() => onStatusChange('no_whatsapp')}
              title="Mark as No WhatsApp"
            >
              <PhoneOff className="h-3 w-3" />
            </Button>
          </>
        )}
        {lead.phone && lead.status === 'no_whatsapp' && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex-1 text-blue-500 border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-400"
              onClick={onSMSClick}
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              SMS
            </Button>
            <span className="h-7 px-2 text-xs flex items-center gap-1 text-muted-foreground" title="No WhatsApp">
              <PhoneOff className="h-3 w-3" />
            </span>
          </>
        )}

        {/* Track Button */}
        {!readOnly && showTrackButton && onTrack && (
          lead.is_potential_work ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-yellow-500 cursor-default"
              disabled
            >
              <Star className="h-3 w-3 mr-0.5 fill-yellow-500" />
              Tracked
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex-1 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-400"
              onClick={onTrack}
            >
              <Star className="h-3 w-3 mr-1" />
              Track
            </Button>
          )
        )}
      </div>
    </div>
  );
}
