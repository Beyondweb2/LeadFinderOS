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
    className: 'bg-green-600 text-white border-transparent' 
  },
  not_interested: { 
    label: 'Not Interested', 
    icon: <ThumbsDown className="h-3 w-3" />, 
    className: 'bg-red-600 text-white border-transparent' 
  },
  no_answer: { 
    label: 'No Answer', 
    icon: <PhoneMissed className="h-3 w-3" />, 
    className: 'bg-yellow-600 text-white border-transparent' 
  },
  callback_scheduled: { 
    label: 'Callback', 
    icon: <Calendar className="h-3 w-3" />, 
    className: 'bg-blue-600 text-white border-transparent' 
  },
  left_voicemail: { 
    label: 'Voicemail', 
    icon: <Voicemail className="h-3 w-3" />, 
    className: 'bg-purple-600 text-white border-transparent' 
  },
  wrong_number: { 
    label: 'Wrong #', 
    icon: <PhoneOff className="h-3 w-3" />, 
    className: 'bg-gray-600 text-white border-transparent' 
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
