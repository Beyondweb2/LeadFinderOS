 import { Link } from 'react-router-dom';
 import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
 import { RevenueCard } from '@/components/dashboard/RevenueCard';
 import { ConversionCard } from '@/components/dashboard/ConversionCard';
 import { PipelineCard } from '@/components/dashboard/PipelineCard';
 import { ActivityCard } from '@/components/dashboard/ActivityCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  ArrowRight,
   Search,
   FileText,
   Users
} from 'lucide-react';

const Dashboard = () => {
   const { metrics, isLoading } = useDashboardMetrics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
     <div className="space-y-4 sm:space-y-6">
       {/* Page Header */}
       <div className="text-center sm:text-left">
         <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
         <p className="text-sm sm:text-base text-muted-foreground">
           Track your performance and revenue
         </p>
       </div>
 
       {/* Primary Metrics - Revenue & Conversion */}
      <section>
         <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Performance</h2>
         <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
           <RevenueCard
             totalRevenue={metrics.totalRevenue}
             draftRevenue={metrics.draftRevenue}
             completionRevenue={metrics.completionRevenue}
             fullyPaidClients={metrics.fullyPaidClients}
             paidForDraftCount={metrics.paidForDraftCount}
           />
           <ConversionCard
             interestRate={metrics.interestRate}
             responseToInterestRate={metrics.responseToInterestRate}
             interestedCount={metrics.interestedCount}
             contactedCount={metrics.contactedCount}
             totalBusinessesAdded={metrics.totalBusinessesAdded}
           />
           <PipelineCard
             totalBusinessesAdded={metrics.totalBusinessesAdded}
             totalArchived={metrics.totalArchived}
             totalActive={metrics.totalActive}
           />
           <ActivityCard
             recordDay={metrics.recordDay}
             avgPerDayAllTime={metrics.avgPerDayAllTime}
             avgPerDayLast7Days={metrics.avgPerDayLast7Days}
           />
         </div>
      </section>

      {/* Quick Links */}
      <section>
         <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Quick Actions</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/">
               <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
                 <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 w-fit mb-1.5 sm:mb-2">
                   <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                 </div>
                <CardTitle className="text-sm sm:text-base">Find Leads</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Find businesses without websites in your area.</span>
                  <span className="sm:hidden">Search for businesses</span>
                </p>
              </CardContent>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/templates">
               <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
                 <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 w-fit mb-1.5 sm:mb-2">
                   <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                 </div>
                <CardTitle className="text-sm sm:text-base">Templates</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Customize your outreach scripts.</span>
                  <span className="sm:hidden">Edit scripts</span>
                </p>
              </CardContent>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/outreach">
               <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
                 <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 w-fit mb-1.5 sm:mb-2">
                   <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                 </div>
                <CardTitle className="text-sm sm:text-base">Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="hidden sm:inline">Manage leads and track progress.</span>
                  <span className="sm:hidden">Manage leads</span>
                </p>
              </CardContent>
            </Link>
          </Card>
        </div>
      </section>
       
       {/* CTA to outreach */}
       <div className="flex justify-center pt-4">
         <Button variant="outline" asChild>
           <Link to="/outreach" className="flex items-center gap-2">
             Go to CRM Pipeline
             <ArrowRight className="h-4 w-4" />
           </Link>
         </Button>
       </div>
    </div>
  );
};

export default Dashboard;
