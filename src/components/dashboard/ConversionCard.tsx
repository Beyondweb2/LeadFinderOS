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
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <TrendingUp className="h-4 w-4 text-blue-500" />
           Conversion Metrics
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Interest Rate - Hero */}
         <div>
           <div className={`text-3xl font-bold ${getRateColor(interestRate)}`}>
             {interestRate.toFixed(1)}%
           </div>
           <p className="text-xs text-muted-foreground">
             Interest rate ({interestedCount} / {totalBusinessesAdded})
           </p>
         </div>
         
         {/* Secondary metrics */}
         <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <ThumbsUp className="h-3.5 w-3.5 text-green-500" />
               <span className="text-xs text-muted-foreground">Interested</span>
             </div>
             <div className="text-lg font-semibold">{interestedCount}</div>
             <div className="text-xs text-muted-foreground">businesses</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Users className="h-3.5 w-3.5 text-blue-500" />
               <span className="text-xs text-muted-foreground">Contacted</span>
             </div>
             <div className="text-lg font-semibold">{contactedCount}</div>
             <div className="text-xs text-muted-foreground">businesses</div>
           </div>
         </div>
         
         {/* Response to Interest Rate */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-sm text-muted-foreground">Response → Interest</span>
             <span className={`text-xl font-bold ${getRateColor(responseToInterestRate)}`}>
               {responseToInterestRate.toFixed(1)}%
             </span>
           </div>
           <p className="text-xs text-muted-foreground">
             Of those contacted, {responseToInterestRate.toFixed(1)}% became interested
           </p>
         </div>
       </CardContent>
     </Card>
   );
 }