import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ResponseEngagementCardProps {
  replyRate: number;
  bookingRate: number;
  positiveReplies: number;
  contactedCount: number;
}

export function ResponseEngagementCard({
  replyRate,
  bookingRate,
  positiveReplies,
  contactedCount,
}: ResponseEngagementCardProps) {
  const hasEnoughData = contactedCount >= 10;

  return (
    <Card className="bg-gradient-to-br from-blue-500/8 via-blue-500/3 to-transparent border-blue-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
          Response & Engagement
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {hasEnoughData ? (
          <>
            <div className="mb-4 sm:mb-6">
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                {replyRate.toFixed(1)}%
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Reply rate</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-border/40">
              <div>
                <div className="text-lg sm:text-xl font-semibold text-foreground">{bookingRate.toFixed(1)}%</div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Booking rate</p>
              </div>
              <div>
                <div className="text-lg sm:text-xl font-semibold text-foreground">{positiveReplies}</div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Positive replies</p>
              </div>
            </div>
          </>
        ) : (
          <div className="py-4 sm:py-6 text-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-muted-foreground/40">
              {contactedCount}/10
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Contact 10 businesses to unlock insights
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
