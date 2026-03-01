import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send } from 'lucide-react';

interface OutreachActivityCardProps {
  contactsLifetime: number;
  contactsToday: number;
  repliesReceived: number;
  callsBooked: number;
}

export function OutreachActivityCard({
  contactsLifetime,
  contactsToday,
  repliesReceived,
  callsBooked,
}: OutreachActivityCardProps) {
  return (
    <Card className="bg-gradient-to-br from-primary/8 via-primary/3 to-transparent border-primary/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
          Outreach Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        <div className="mb-4 sm:mb-6">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            {contactsLifetime.toLocaleString()}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Contacts made</p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-border/40">
          <div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{contactsToday}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Today</p>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{repliesReceived}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Replies</p>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{callsBooked}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Calls booked</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
