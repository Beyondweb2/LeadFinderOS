import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { Link } from 'react-router-dom';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { PipelineCard } from '@/components/dashboard/PipelineCard';
import { OutreachCard } from '@/components/dashboard/OutreachCard';
import { NextActionsCard } from '@/components/dashboard/NextActionsCard';
import { ChannelPerformanceCard } from '@/components/dashboard/ChannelPerformanceCard';
import { SiteFunnelCard } from '@/components/dashboard/SiteFunnelCard';
import { CampaignStatsSection } from '@/components/dashboard/CampaignStatsSection';
import { AdminZone } from '@/components/dashboard/AdminZone';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  ArrowRight,
  Search,
  FileText,
  Users,
  Trash2,
} from 'lucide-react';
import { TipBar } from '@/components/TipBar';

const Dashboard = () => {
  const { metrics, isLoading, refetch } = useDashboardMetrics();
  const { isLoading: isSubscriptionLoading, isAdmin } = useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFullResetting, setIsFullResetting] = useState(false);

  if (isLoading || isSubscriptionLoading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleFullReset = async () => {
    if (!user) return;
    setIsFullResetting(true);
    try {
      // One atomic, user-scoped wipe (SECURITY DEFINER fn keyed to auth.uid()).
      // FK cascades clean the site/booking/claim children; templates + login +
      // admin survive. Reusable — safe to press between test runs.
      const { error } = await (supabase as unknown as {
        rpc: (fn: string) => Promise<{ error: { message: string } | null }>;
      }).rpc('reset_my_account');
      if (error) {
        console.error('Full reset failed:', error);
        toast({ title: 'Reset failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Account reset', description: 'All your test data was cleared. Templates and login kept.' });
      refetch();
    } catch (err) {
      console.error('Full reset failed:', err);
      toast({ title: 'Error', description: 'Failed to perform full reset.', variant: 'destructive' });
    } finally {
      setIsFullResetting(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-7">
      <SEOHead title="Dashboard | LeadFinder Pro" description="Track your outreach pipeline, revenue and follow-ups in one place." canonical="/" noindex />
      <TipBar />

      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track your performance and pipeline
        </p>
      </div>

      {/* Outreach performance — per-channel (what's working) leads the dashboard */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Outreach performance</h2>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChannelPerformanceCard data={metrics.channelPerf} />
          </div>
          <PipelineCard pipeline={metrics.pipeline} />
        </div>
      </section>

      {/* Activity pulse + next steps */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Activity &amp; next steps</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          <OutreachCard
            contactedTotal={metrics.contactedTotal}
            contactedToday={metrics.contactedToday}
            contactedYesterday={metrics.contactedYesterday}
            avg7Day={metrics.avg7Day}
            loggedLeads={metrics.loggedLeads}
          />
          <NextActionsCard trackedLeads={metrics.trackedLeads} />
        </div>
      </section>

      {/* Site funnel — operator-level barber-site tracking; admins only */}
      {isAdmin && (
        <section>
          <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Sites</h2>
          <SiteFunnelCard
            sent={metrics.siteFunnel.sent}
            opened={metrics.siteFunnel.opened}
            claimed={metrics.siteFunnel.claimed}
            addonRequested={metrics.siteFunnel.addonRequested}
          />
        </section>
      )}

      {/* Per-campaign monitoring — operator-level; admins only (same gate as Sites) */}
      {isAdmin && (
        <section>
          <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Campaigns</h2>
          <CampaignStatsSection />
        </section>
      )}

      {/* Revenue — kept for when Stripe is live; de-emphasised at the bottom */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Revenue</h2>
        <div className="sm:max-w-md">
          <RevenueCard
            revenueThisMonth={metrics.revenueThisMonth}
            revenueLastMonth={metrics.revenueLastMonth}
            totalRevenue={metrics.totalRevenue}
            fullyPaidClients={metrics.fullyPaidClients}
            activeProposals={metrics.activeProposals}
            pipelineDeals={metrics.pipeline.interested + metrics.pipeline.proposalSent}
            totalPotentialRevenue={metrics.totalPotentialRevenue}
            closedRevenue={metrics.closedRevenue}
          />
        </div>
      </section>

      {/* Admin zone — rendered ONLY for admins (role-based useSubscription().isAdmin) */}
      {isAdmin && (
        <section>
          <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Admin</h2>
          <AdminZone />
        </section>
      )}

      {/* Quick Links */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3 text-center sm:text-left">Quick Actions</h2>
        <div className="grid gap-2 sm:gap-4 grid-cols-3 max-w-md sm:max-w-none mx-auto">
          <Card className="border-border hover:bg-muted/50 transition-colors cursor-pointer">
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
          <Card className="border-border hover:bg-muted/50 transition-colors cursor-pointer">
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
          <Card className="border-border hover:bg-muted/50 transition-colors cursor-pointer">
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
       
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
        <Button variant="outline" asChild>
          <Link to="/outreach" className="flex items-center gap-2">
            Go to Outreach
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Full Reset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Full account reset?</AlertDialogTitle>
              <AlertDialogDescription>
                This wipes <strong>all your data</strong> — every lead (Outreach, Track Leads &amp; Paid Clients), outreach history &amp; activity, contact logs, search history, and every generated site along with its bookings, staff, claim links and visit tracking. It also clears your claims &amp; business notes and resets your metrics to zero.
                <br /><br />
                Your <strong>login, admin access and saved message/voice templates are kept</strong>. This only affects your own account and <strong>cannot be undone</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleFullReset}
                disabled={isFullResetting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isFullResetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Dashboard;
