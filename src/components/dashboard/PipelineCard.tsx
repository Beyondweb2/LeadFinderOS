 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Database, Archive, Activity } from 'lucide-react';
 
 interface PipelineCardProps {
   totalBusinessesAdded: number;
   totalArchived: number;
   totalActive: number;
 }
 
 export function PipelineCard({
   totalBusinessesAdded,
   totalArchived,
   totalActive,
 }: PipelineCardProps) {
   return (
     <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
       <CardHeader className="pb-2">
         <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <Database className="h-4 w-4 text-purple-500" />
           Pipeline Volume
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Total Added - Hero */}
         <div>
           <div className="text-3xl font-bold text-purple-500">
             {totalBusinessesAdded.toLocaleString()}
           </div>
           <p className="text-xs text-muted-foreground">Total businesses added (all time)</p>
         </div>
         
         {/* Breakdown */}
         <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Activity className="h-3.5 w-3.5 text-green-500" />
               <span className="text-xs text-muted-foreground">Active</span>
             </div>
             <div className="text-lg font-semibold">{totalActive.toLocaleString()}</div>
             <div className="text-xs text-muted-foreground">in pipeline</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Archive className="h-3.5 w-3.5 text-muted-foreground" />
               <span className="text-xs text-muted-foreground">Archived</span>
             </div>
             <div className="text-lg font-semibold">{totalArchived.toLocaleString()}</div>
             <div className="text-xs text-muted-foreground">processed</div>
           </div>
         </div>
         
         {/* Active percentage */}
         {totalBusinessesAdded > 0 && (
           <div className="pt-2 border-t border-border/50">
             <div className="flex items-center justify-between">
               <span className="text-sm text-muted-foreground">Active rate</span>
               <span className="text-xl font-bold">
                 {((totalActive / totalBusinessesAdded) * 100).toFixed(0)}%
               </span>
             </div>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }