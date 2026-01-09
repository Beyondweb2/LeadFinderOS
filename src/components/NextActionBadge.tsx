import { Badge } from '@/components/ui/badge';
import { Phone, Clock, FileText, Trash2, Circle } from 'lucide-react';
import type { NextActionType } from '@/types/outreach';

interface NextActionBadgeProps {
  action: NextActionType | null;
  date?: string | null;
}

const actionConfig: Record<NextActionType, { label: string; icon: React.ReactNode; className: string }> = {
  call: {
    label: 'Call',
    icon: <Phone className="h-3 w-3" />,
    className: 'text-blue-400',
  },
  follow_up: {
    label: 'Follow-up',
    icon: <Clock className="h-3 w-3" />,
    className: 'text-orange-400',
  },
  send_draft: {
    label: 'Send Draft',
    icon: <FileText className="h-3 w-3" />,
    className: 'text-cyan-400',
  },
  remove_if_no_reply: {
    label: 'Remove if no reply',
    icon: <Trash2 className="h-3 w-3" />,
    className: 'text-red-400',
  },
  none: {
    label: 'None',
    icon: <Circle className="h-3 w-3" />,
    className: 'text-muted-foreground',
  },
};

export function NextActionBadge({ action, date }: NextActionBadgeProps) {
  if (!action || action === 'none') {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const config = actionConfig[action];
  const formattedDate = date ? new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) : null;

  const isOverdue = date && new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date && new Date(date).toDateString() === new Date().toDateString();

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
