 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { PoundSterling, TrendingUp, FileCheck, Trophy } from 'lucide-react';
 
 interface RevenueCardProps {
   totalRevenue: number;
   draftRevenue: number;
   completionRevenue: number;
   fullyPaidClients: number;
   paidForDraftCount: number;
 }
 
 export function RevenueCard({
   totalRevenue,
   draftRevenue,
   completionRevenue,
   fullyPaidClients,
   paidForDraftCount,
 }: RevenueCardProps) {
  return (
     <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20">
       <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
         <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
           <PoundSterling className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
           <span className="truncate">Revenue</span>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
         {/* Total Revenue - Hero */}
         <div>
           <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500">
             £{totalRevenue.toLocaleString()}
           </div>
           <p className="text-[10px] sm:text-xs text-muted-foreground">Total lifetime</p>
         </div>
         
         {/* Breakdown - Hidden on mobile for density */}
         <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <FileCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Drafts</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">£{draftRevenue.toLocaleString()}</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Complete</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">£{completionRevenue.toLocaleString()}</div>
           </div>
         </div>
         
         {/* Fully Paid Clients */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-xs sm:text-sm text-muted-foreground">Paid clients</span>
             <span className="text-base sm:text-xl font-bold">{fullyPaidClients}</span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 }