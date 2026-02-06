 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Zap, Trophy, TrendingUp, Calendar } from 'lucide-react';
 
 interface ActivityCardProps {
   recordDay: { date: string; count: number } | null;
   avgPerDayAllTime: number;
   avgPerDayLast7Days: number;
 }
 
 export function ActivityCard({
   recordDay,
   avgPerDayAllTime,
   avgPerDayLast7Days,
 }: ActivityCardProps) {
   const formatDate = (dateStr: string) => {
     const date = new Date(dateStr);
     return date.toLocaleDateString('en-GB', { 
       day: 'numeric', 
       month: 'short',
       year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
     });
   };
 
   // Determine trend
   const trend = avgPerDayLast7Days > avgPerDayAllTime ? 'up' : avgPerDayLast7Days < avgPerDayAllTime ? 'down' : 'stable';
 
  return (
     <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
       <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
         <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
           <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
           <span className="truncate">Activity</span>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
         {/* Record Day - Hero */}
         {recordDay ? (
           <div>
             <div className="flex items-center gap-1.5 sm:gap-2">
               <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
               <span className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-500">{recordDay.count}</span>
             </div>
             <p className="text-[10px] sm:text-xs text-muted-foreground">
               Record • {formatDate(recordDay.date)}
             </p>
           </div>
         ) : (
           <div>
             <div className="text-xl sm:text-2xl md:text-3xl font-bold text-muted-foreground">—</div>
             <p className="text-[10px] sm:text-xs text-muted-foreground">No activity</p>
           </div>
         )}
         
         {/* Averages - Hidden on mobile */}
         <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Avg/day</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">{avgPerDayAllTime.toFixed(1)}</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <TrendingUp className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${
                 trend === 'up' ? 'text-green-500' : 
                 trend === 'down' ? 'text-red-500' : 
                 'text-muted-foreground'
               }`} />
               <span className="text-[10px] sm:text-xs text-muted-foreground">7 days</span>
             </div>
             <div className={`text-sm sm:text-lg font-semibold ${
               trend === 'up' ? 'text-green-500' : 
               trend === 'down' ? 'text-red-500' : ''
             }`}>
               {avgPerDayLast7Days.toFixed(1)}
             </div>
           </div>
         </div>
         
         {/* Trend indicator */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-xs sm:text-sm text-muted-foreground">Trend</span>
             <span className={`text-xs sm:text-sm font-medium ${
               trend === 'up' ? 'text-green-500' : 
               trend === 'down' ? 'text-red-500' : 
               'text-muted-foreground'
             }`}>
               {trend === 'up' ? '↑ Up' : 
                trend === 'down' ? '↓ Down' : 
                '→ Stable'}
             </span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 }