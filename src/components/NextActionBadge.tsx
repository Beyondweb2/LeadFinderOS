import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Clock, FileText, Trash2, Circle, MessageSquare, Mic, RefreshCw, AlertTriangle } from 'lucide-react';
import type { NextActionType } from '@/types/outreach';

interface NextActionBadgeProps {
  action: NextActionType | null;
  date?: string | null;
  compact?: boolean;
}

const actionConfig: Record<NextActionType, { label: string; shortLabel: string; icon: React.ReactNode; className: string }> = {
  send_initial_text: {
    label: 'Send Initial Text',
    shortLabel: 'Text',
    icon: <MessageSquare className="h-3 w-3" />,
    className: 'text-green-400',
  },
  send_voice_note: {
    label: 'Send Voice Note',
    shortLabel: 'Voice',
    icon: <Mic className="h-3 w-3" />,
    className: 'text-purple-400',
  },
  send_follow_up: {
    label: 'Send Follow-up',
    shortLabel: 'Follow-up',
    icon: <RefreshCw className="h-3 w-3" />,
    className: 'text-amber-400',
  },
  check_3_day_removal: {
    label: 'Check 3-Day Removal',
    shortLabel: '3-Day Check',
    icon: <AlertTriangle className="h-3 w-3" />,
    className: 'text-red-400',
  },
  call: {
    label: 'Call',
    shortLabel: 'Call',
    icon: <Phone className="h-3 w-3" />,
    className: 'text-blue-400',
  },
  follow_up: {
    label: 'Follow-up',
    shortLabel: 'Follow-up',
    icon: <Clock className="h-3 w-3" />,
    className: 'text-orange-400',
  },
  send_draft: {
    label: 'Send Draft',
    shortLabel: 'Draft',
    icon: <FileText className="h-3 w-3" />,
    className: 'text-cyan-400',
  },
  remove_if_no_reply: {
    label: 'Remove if no reply',
    shortLabel: 'Remove',
    icon: <Trash2 className="h-3 w-3" />,
    className: 'text-red-400',
  },
  none: {
    label: 'None',
    shortLabel: 'None',
    icon: <Circle className="h-3 w-3" />,
    className: 'text-muted-foreground',
  },
};

export function NextActionBadge({ action, date, compact }: NextActionBadgeProps) {
  if (!action || action === 'none') {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const config = actionConfig[action];
  const formattedDate = date ? new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: compact ? undefined : 'numeric',
  }) : null;

  const isOverdue = date && new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date && new Date(date).toDateString() === new Date().toDateString();

  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${config.className}`}>
        {React.cloneElement(config.icon as React.ReactElement, { className: 'h-2.5 w-2.5' })}
        <span className="text-[10px]">{config.shortLabel}</span>
        {formattedDate && (
          <span className={`text-[10px] ${isOverdue ? 'text-red-400' : isToday ? 'text-yellow-400' : 'text-muted-foreground'}`}>
            {isToday ? 'Today' : formattedDate}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 ${config.className}`}>
        {config.icon}
        <span className="text-sm">{config.label}</span>
      </div>
      {formattedDate && (
        <span className={`text-xs ${isOverdue ? 'text-red-400' : isToday ? 'text-yellow-400' : 'text-muted-foreground'}`}>
          {isToday ? 'Due Today' : formattedDate}
        </span>
      )}
    </div>
  );
}
