import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, MessageSquare, Star } from 'lucide-react';
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
  onTrack?: () => void;
  readOnly?: boolean;
  showTrackButton?: boolean;
}

export function OutreachMobileCard({
  lead,
  isSelected,
  onSelect,
  onLeadClick,
  onStatusChange,
  onWhatsAppClick,
  onTrack,
  readOnly = false,
  showTrackButton = true,
}: OutreachMobileCardProps) {
  return (
    <div 
      className={`p-3 border-b border-border/50 ${lead.is_potential_work ? 'bg-primary/5' : ''}`}
      onClick={onLeadClick}
    >
      {/* Row 1: Checkbox + Business Name */}
      <div className="flex items-center gap-2 mb-2">
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label={`Select ${lead.business_name}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {lead.country === 'Australia' && (
              <span className="text-xs" title="Australia">🇦🇺</span>
            )}
            <span className="font-medium text-sm truncate">{lead.business_name}</span>
            {lead.is_potential_work && (
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Status + Next Action */}
      {!readOnly && (
        <div className="flex items-center gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
          <Select
            value={lead.status}
            onValueChange={onStatusChange}
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
          
          {lead.next_action && (
            <NextActionBadge 
              action={lead.next_action} 
              date={lead.next_action_date} 
            />
          )}
        </div>
      )}

      {/* Row 3: Action Buttons */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Google Maps */}
        {lead.google_maps_url && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 flex-1"
            asChild
          >
            <a
              href={lead.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Maps
            </a>
          </Button>
        )}

        {/* WhatsApp */}
        {lead.phone && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 flex-1 text-green-500 border-green-500/30 hover:bg-green-500/10 hover:text-green-400"
            onClick={onWhatsAppClick}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            WhatsApp
          </Button>
        )}

        {/* Track Button */}
        {!readOnly && showTrackButton && onTrack && (
          lead.is_potential_work ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-yellow-500 cursor-default"
              disabled
            >
              <Star className="h-3.5 w-3.5 mr-1 fill-yellow-500" />
              Tracked
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 flex-1 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-400"
              onClick={onTrack}
            >
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Track
            </Button>
          )
        )}
      </div>
    </div>
  );
}
