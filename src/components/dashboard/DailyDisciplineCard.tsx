import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OutreachLead } from '@/types/outreach';

interface DailyDisciplineCardProps {
  contactsToday: number;
  sevenDayAvg: number;
  leads: OutreachLead[];
}

export function DailyDisciplineCard({ contactsToday, sevenDayAvg, leads }: DailyDisciplineCardProps) {
  // Calculate streak: consecutive days with at least 1 lead added
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysWithActivity = new Set<string>();
  leads.forEach(l => {
    daysWithActivity.add(l.created_at.split('T')[0]);
  });

  let streak = 0;
  const checkDate = new Date(today);
  // If nothing today, start from yesterday
  const todayStr = checkDate.toISOString().split('T')[0];
  if (!daysWithActivity.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (daysWithActivity.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return (
    <Card className="bg-gradient-to-br from-amber-500/8 via-amber-500/3 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
          Daily Discipline
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        <div className="mb-4 sm:mb-6">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            {contactsToday}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Contacts today</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-3 sm:pt-4 border-t border-border/40">
          <div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{sevenDayAvg.toFixed(1)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">7-day avg</p>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-semibold text-foreground">{streak}d</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Streak</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
