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
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <PoundSterling className="h-4 w-4 text-green-500" />
           Revenue Overview
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Total Revenue - Hero */}
         <div>
           <div className="text-3xl font-bold text-green-500">
             £{totalRevenue.toLocaleString()}
           </div>
           <p className="text-xs text-muted-foreground">Total lifetime revenue</p>
         </div>
         
         {/* Breakdown */}
         <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <FileCheck className="h-3.5 w-3.5 text-amber-500" />
               <span className="text-xs text-muted-foreground">Draft payments</span>
             </div>
             <div className="text-lg font-semibold">£{draftRevenue.toLocaleString()}</div>
             <div className="text-xs text-muted-foreground">
               {paidForDraftCount + fullyPaidClients} × £49
             </div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Trophy className="h-3.5 w-3.5 text-blue-500" />
               <span className="text-xs text-muted-foreground">Completions</span>
             </div>
             <div className="text-lg font-semibold">£{completionRevenue.toLocaleString()}</div>
             <div className="text-xs text-muted-foreground">
               {fullyPaidClients} × £450
             </div>
           </div>
         </div>
         
         {/* Fully Paid Clients */}
         <div className="pt-2 border-t border-border/50">
           <div className="flex items-center justify-between">
             <span className="text-sm text-muted-foreground">Fully paid clients</span>
             <span className="text-xl font-bold">{fullyPaidClients}</span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 }