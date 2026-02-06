 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { TrendingUp, Users, ThumbsUp } from 'lucide-react';
 
 interface ConversionCardProps {
   interestRate: number;
   responseToInterestRate: number;
   interestedCount: number;
   contactedCount: number;
   totalBusinessesAdded: number;
 }
 
 export function ConversionCard({
   interestRate,
   responseToInterestRate,
   interestedCount,
   contactedCount,
   totalBusinessesAdded,
 }: ConversionCardProps) {
   // Determine rate quality for styling
   const getRateColor = (rate: number) => {
     if (rate >= 10) return 'text-green-500';
     if (rate >= 5) return 'text-amber-500';
     return 'text-muted-foreground';
   };
 
  return (
     <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
       <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
         <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
           <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
           <span className="truncate">Conversion</span>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
         {/* Interest Rate - Hero */}
         <div>
           <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${getRateColor(interestRate)}`}>
             {interestRate.toFixed(1)}%
           </div>
           <p className="text-[10px] sm:text-xs text-muted-foreground">
             Interest rate
           </p>
         </div>
         
         {/* Secondary metrics - Hidden on mobile */}
         <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <ThumbsUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Interested</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">{interestedCount}</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Contacted</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">{contactedCount}</div>
           </div>
         </div>
         
         {/* Response to Interest Rate */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-xs sm:text-sm text-muted-foreground">Resp→Int</span>
             <span className={`text-base sm:text-xl font-bold ${getRateColor(responseToInterestRate)}`}>
               {responseToInterestRate.toFixed(1)}%
             </span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 }