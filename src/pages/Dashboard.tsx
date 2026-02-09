import { Link } from 'react-router-dom';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { ConversionCard } from '@/components/dashboard/ConversionCard';
import { OutreachCard } from '@/components/dashboard/OutreachCard';
import { ActivityCard } from '@/components/dashboard/ActivityCard';
import { TrialProgressCard } from '@/components/dashboard/TrialProgressCard';
import { Card } from '@/components/ui/card';
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
  const { subscribed, isLoading: isSubscriptionLoading } = useSubscription();
  const { isOnTrial, searchesToday, dailyLimit, isStripeTrialing, isLoading: isTrialLoading } = useTrial();
  
  // Show trial progress for free trial users only (and only after loading is complete)
  const showTrialProgress = !isSubscriptionLoading && !isTrialLoading && isOnTrial && !subscribed && !isStripeTrialing;

  // Wait for all data to load before rendering
  if (isLoading || isSubscriptionLoading || isTrialLoading) {
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
          {showTrialProgress 
            ? 'Track your trial progress and activity' 
            : 'Track your performance and revenue'
          }
        </p>
      </div>

      {/* Trial Progress Card - Only for trial users */}
      {showTrialProgress && (
        <section>
          <TrialProgressCard
            searchesUsedToday={searchesToday}
            dailyLimit={dailyLimit}
            noWebsiteBusinesses={metrics.noWebsiteBusinesses}
            addedToCRM={metrics.totalBusinessesAdded}
          />
        </section>
      )}

      {/* Primary Metrics - Revenue & Conversion (for paid users) */}
      {!showTrialProgress && (
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
            <OutreachCard
              totalBusinessesAdded={metrics.totalBusinessesAdded}
              addedToday={metrics.addedToday}
              addedYesterday={metrics.addedYesterday}
              avgPerDay={metrics.avgPerDayAllTime}
            />
            <ActivityCard activity={metrics.activity} />
          </div>
        </section>
      )}

      {/* Simplified metrics for trial users */}
      {showTrialProgress && (
        <section>
          <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Activity</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-2">
            <OutreachCard
              totalBusinessesAdded={metrics.totalBusinessesAdded}
              addedToday={metrics.addedToday}
              addedYesterday={metrics.addedYesterday}
              avgPerDay={metrics.avgPerDayAllTime}
            />
            <ActivityCard activity={metrics.activity} />
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3 text-center sm:text-left">Quick Actions</h2>
        <div className="grid gap-2 sm:gap-4 grid-cols-3 max-w-md sm:max-w-none mx-auto">
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/find-leads" className="block p-2 sm:p-4 md:p-6">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 sm:gap-2">
                <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                  <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                </div>
                <span className="text-xs sm:text-base font-medium">Find</span>
                <span className="hidden sm:block text-xs text-muted-foreground">Search for businesses</span>
              </div>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/templates" className="block p-2 sm:p-4 md:p-6">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 sm:gap-2">
                <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10">
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                </div>
                <span className="text-xs sm:text-base font-medium">Templates</span>
                <span className="hidden sm:block text-xs text-muted-foreground">Edit scripts</span>
              </div>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/outreach" className="block p-2 sm:p-4 md:p-6">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left gap-1 sm:gap-2">
                <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                </div>
                <span className="text-xs sm:text-base font-medium">Outreach</span>
                <span className="hidden sm:block text-xs text-muted-foreground">Manage leads</span>
              </div>
            </Link>
          </Card>
        </div>
      </section>
       
      {/* CTA to outreach */}
      <div className="flex justify-center pt-4">
        <Button variant="outline" asChild>
          <Link to="/outreach" className="flex items-center gap-2">
            Go to Outreach
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
