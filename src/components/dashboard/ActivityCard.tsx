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
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <Zap className="h-4 w-4 text-amber-500" />
           Productivity
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Record Day - Hero */}
         {recordDay ? (
           <div>
             <div className="flex items-center gap-2">
               <Trophy className="h-5 w-5 text-amber-500" />
               <span className="text-3xl font-bold text-amber-500">{recordDay.count}</span>
             </div>
             <p className="text-xs text-muted-foreground">
               Record day • {formatDate(recordDay.date)}
             </p>
           </div>
         ) : (
           <div>
             <div className="text-3xl font-bold text-muted-foreground">—</div>
             <p className="text-xs text-muted-foreground">No activity yet</p>
           </div>
         )}
         
         {/* Averages */}
         <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
               <span className="text-xs text-muted-foreground">All time avg</span>
             </div>
             <div className="text-lg font-semibold">{avgPerDayAllTime.toFixed(1)}</div>
             <div className="text-xs text-muted-foreground">per day</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <TrendingUp className={`h-3.5 w-3.5 ${
                 trend === 'up' ? 'text-green-500' : 
                 trend === 'down' ? 'text-red-500' : 
                 'text-muted-foreground'
               }`} />
               <span className="text-xs text-muted-foreground">Last 7 days</span>
             </div>
             <div className={`text-lg font-semibold ${
               trend === 'up' ? 'text-green-500' : 
               trend === 'down' ? 'text-red-500' : ''
             }`}>
               {avgPerDayLast7Days.toFixed(1)}
             </div>
             <div className="text-xs text-muted-foreground">per day</div>
           </div>
         </div>
         
         {/* Trend indicator */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-sm text-muted-foreground">7-day trend</span>
             <span className={`text-sm font-medium ${
               trend === 'up' ? 'text-green-500' : 
               trend === 'down' ? 'text-red-500' : 
               'text-muted-foreground'
             }`}>
               {trend === 'up' ? '↑ Above average' : 
                trend === 'down' ? '↓ Below average' : 
                '→ On track'}
             </span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 }