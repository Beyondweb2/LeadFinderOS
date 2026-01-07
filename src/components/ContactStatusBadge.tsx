import { Badge } from '@/components/ui/badge';
import { 
  ThumbsUp, 
  ThumbsDown, 
  PhoneMissed, 
  Calendar, 
  PhoneOff,
  Voicemail 
} from 'lucide-react';
import type { CallOutcome } from '@/hooks/useContactTracking';

interface ContactStatusBadgeProps {
  outcome: CallOutcome;
}

const outcomeConfig: Record<CallOutcome, { label: string; icon: React.ReactNode; className: string }> = {
  interested: { 
    label: 'Interested', 
    icon: <ThumbsUp className="h-3 w-3" />, 
    className: 'bg-green-500/20 text-green-400 border-green-500/30' 
  },
  not_interested: { 
    label: 'Not Interested', 
    icon: <ThumbsDown className="h-3 w-3" />, 
    className: 'bg-red-500/20 text-red-400 border-red-500/30' 
  },
  no_answer: { 
    label: 'No Answer', 
    icon: <PhoneMissed className="h-3 w-3" />, 
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
  },
  callback_scheduled: { 
    label: 'Callback', 
    icon: <Calendar className="h-3 w-3" />, 
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
  },
  left_voicemail: { 
    label: 'Voicemail', 
    icon: <Voicemail className="h-3 w-3" />, 
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
  },
  wrong_number: { 
    label: 'Wrong #', 
    icon: <PhoneOff className="h-3 w-3" />, 
    className: 'bg-muted text-muted-foreground border-muted' 
  },
};

export function ContactStatusBadge({ outcome }: ContactStatusBadgeProps) {
  const config = outcomeConfig[outcome];
  
  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
