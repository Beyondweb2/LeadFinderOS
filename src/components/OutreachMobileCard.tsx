import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, MessageSquare, MessageCircle, Star, Phone } from 'lucide-react';
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
      className={`py-1.5 px-3 border-b border-border/50 ${lead.is_potential_work ? 'bg-primary/5' : ''} ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
      onClick={onLeadClick}
    >
      {/* Row 1: Checkbox + Business Name + Action Buttons */}
      <div className="flex items-center gap-2">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select ${lead.business_name}`}
            className="h-4 w-4"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {lead.country === 'Australia' && (
              <span className="text-xs" title="Australia">🇦🇺</span>
            )}
            <span className="font-semibold text-sm truncate">{lead.business_name}</span>
            {lead.is_potential_work && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Inline icon buttons */}
        <div className="grid grid-cols-5 gap-0.5 w-auto" onClick={(e) => e.stopPropagation()}>
          {lead.google_maps_url && (
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}

          {lead.phone && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" asChild>
                <a href={`tel:${lead.phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
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

      {/* Row 2: Status + Next Action */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 mt-1 ml-6" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}
