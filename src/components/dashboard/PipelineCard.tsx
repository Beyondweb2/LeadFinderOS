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
       <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
         <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
           <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
           <span className="truncate">Pipeline</span>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
         {/* Total Added - Hero */}
         <div>
           <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">
             {totalBusinessesAdded.toLocaleString()}
           </div>
           <p className="text-[10px] sm:text-xs text-muted-foreground">Total added</p>
         </div>
         
         {/* Breakdown - Hidden on mobile */}
         <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Active</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">{totalActive.toLocaleString()}</div>
           </div>
           
           <div className="space-y-1">
             <div className="flex items-center gap-1.5">
               <Archive className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
               <span className="text-[10px] sm:text-xs text-muted-foreground">Archived</span>
             </div>
             <div className="text-sm sm:text-lg font-semibold">{totalArchived.toLocaleString()}</div>
           </div>
         </div>
         
         {/* Active percentage */}
         {totalBusinessesAdded > 0 && (
           <div className="pt-2 border-t border-border/50">
             <div className="flex items-center justify-between">
               <span className="text-xs sm:text-sm text-muted-foreground">Active</span>
               <span className="text-base sm:text-xl font-bold">
                 {((totalActive / totalBusinessesAdded) * 100).toFixed(0)}%
               </span>
             </div>
           </div>
         )}
       </CardContent>
     </Card>
   );
 }