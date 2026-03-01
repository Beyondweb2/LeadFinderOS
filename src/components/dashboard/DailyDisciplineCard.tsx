import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame } from 'lucide-react';

interface DailyDisciplineCardProps {
  contactsToday: number;
  contactsYesterday: number;
  avg7Day: number;
  currentStreak: number;
}

export function DailyDisciplineCard({
  contactsToday,
  contactsYesterday,
  avg7Day,
  currentStreak,
}: DailyDisciplineCardProps) {
  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Flame className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
          <span className="truncate">Daily Discipline</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Today contacts - Hero */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-500">
            {contactsToday}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Contacts Today</p>
        </div>
        
        {/* Yesterday & 7-day avg - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Yesterday</span>
            <div className="text-sm sm:text-lg font-semibold">{contactsYesterday}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">7d Avg</span>
            <div className="text-sm sm:text-lg font-semibold">{avg7Day.toFixed(1)}</div>
          </div>
        </div>
        
        {/* Streak */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">Streak (5+/day)</span>
            <div className="flex items-center gap-1.5">
              {currentStreak > 0 && <Flame className="h-3.5 w-3.5 text-amber-500" />}
              <span className={`text-base sm:text-xl font-bold ${currentStreak > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {currentStreak}d
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
