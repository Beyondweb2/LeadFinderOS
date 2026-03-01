import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Flame, Target, TrendingUp, Trophy } from 'lucide-react';

interface DailyDisciplineCardProps {
  contactsToday: number;
  avg7Day: number;
  currentStreak: number;
  bestDay: { date: string; count: number } | null;
}

function getMotivation(contactsToday: number, streak: number): string {
  if (contactsToday >= 20) return '🔥 Machine mode! Unstoppable!';
  if (contactsToday >= 10) return '💪 Strong day! Keep pushing!';
  if (contactsToday >= 5) return '✅ Daily target hit!';
  if (contactsToday >= 1) return '👍 Good start — reach 5 to keep your streak!';
  if (streak > 0) return `⚡ Don't break your ${streak}-day streak!`;
  return '🚀 Contact 5 businesses to start a streak!';
}

function formatBestDay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function DailyDisciplineCard({
  contactsToday,
  avg7Day,
  currentStreak,
  bestDay,
}: DailyDisciplineCardProps) {
  const dailyTarget = 5;
  const progress = Math.min((contactsToday / dailyTarget) * 100, 100);

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-500" />
          Daily Discipline
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-3">
        {/* Today's progress */}
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-amber-500">{contactsToday}</div>
              <p className="text-[10px] text-muted-foreground">Contacts Today</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Goal: {dailyTarget}</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                progress >= 100 ? 'bg-green-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Motivation */}
        <p className="text-xs font-medium text-center py-1">
          {getMotivation(contactsToday, currentStreak)}
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className={`h-3.5 w-3.5 ${currentStreak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}`} />
              <span className="text-lg font-bold">{currentStreak}</span>
            </div>
            <p className="text-[9px] text-muted-foreground">Day Streak</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-lg font-bold">{avg7Day.toFixed(1)}</span>
            </div>
            <p className="text-[9px] text-muted-foreground">7-Day Avg</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-lg font-bold">{bestDay?.count ?? 0}</span>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Best {bestDay ? formatBestDay(bestDay.date) : '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
