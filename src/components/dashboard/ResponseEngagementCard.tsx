import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ThumbsUp, PhoneCall, CalendarCheck } from 'lucide-react';

interface ResponseEngagementCardProps {
  repliesReceived: number;
  positiveReplies: number;
  callsBooked: number;
  followUpsScheduled: number;
  responseRate: number;
  bookingRate: number;
  totalContacted: number;
}

export function ResponseEngagementCard({
  repliesReceived,
  positiveReplies,
  callsBooked,
  followUpsScheduled,
  responseRate,
  bookingRate,
  totalContacted,
}: ResponseEngagementCardProps) {
  const getRateColor = (rate: number) => {
    if (rate >= 15) return 'text-green-500';
    if (rate >= 5) return 'text-amber-500';
    return 'text-muted-foreground';
  };

  return (
    <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20">
      <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-500" />
          Response & Engagement
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-3">
        {/* Counts grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-green-500" />
              <span className="text-[10px] text-muted-foreground">Replies</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">{repliesReceived}</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Positive</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">{positiveReplies}</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <PhoneCall className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Calls Booked</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">{callsBooked}</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CalendarCheck className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] text-muted-foreground">Follow-ups</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">{followUpsScheduled}</div>
          </div>
        </div>

        {/* Rates */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Response Rate</span>
            <span className={`text-sm font-bold ${getRateColor(responseRate)}`}>
              {responseRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Booking Rate</span>
            <span className={`text-sm font-bold ${getRateColor(bookingRate)}`}>
              {bookingRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
