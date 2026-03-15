import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { RevenueCard } from '@/components/dashboard/RevenueCard';
import { PipelineCard } from '@/components/dashboard/PipelineCard';
import { OutreachCard } from '@/components/dashboard/OutreachCard';
import { NextActionsCard } from '@/components/dashboard/NextActionsCard';
import { TrialProgressCard } from '@/components/dashboard/TrialProgressCard';
import { FunnelMetricsCard } from '@/components/dashboard/FunnelMetricsCard';
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
  Mail,
} from 'lucide-react';
import { TipBar } from '@/components/TipBar';

const Dashboard = () => {
  const { metrics, isLoading, refetch } = useDashboardMetrics();
  const { subscribed, isLoading: isSubscriptionLoading, isPaidSubscriber, isStripeTrialing, trialEnd } = useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFullResetting, setIsFullResetting] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  
  const isAdmin = user?.email === 'pauljsales455@outlook.com';

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
      const results = await Promise.all([
        supabase.from('copied_phones').delete().eq('user_id', user.id),
        supabase.from('outreach_activities').delete().eq('user_id', user.id),
        supabase.from('lead_contacts').delete().eq('user_id', user.id),
        supabase.from('search_history').delete().eq('user_id', user.id),
        supabase.from('checked_businesses').delete().eq('user_id', user.id),
        supabase.from('outreach_leads').delete().eq('user_id', user.id),
        supabase.from('outreach_history').delete().eq('user_id', user.id),
        supabase.from('templates').delete().eq('user_id', user.id),
        supabase.rpc('reset_my_metrics'),
      ]);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) console.error('Full reset errors:', errors.map(e => e.error));
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
      <TipBar />

      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track your performance and pipeline
        </p>
      </div>

      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Performance</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
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
          <PipelineCard pipeline={metrics.pipeline} />
          <OutreachCard
            contactedToday={metrics.contactedToday}
            contactedYesterday={metrics.contactedYesterday}
            avg7Day={metrics.avg7Day}
            channels7d={metrics.channels7d}
          />
          <NextActionsCard trackedLeads={metrics.trackedLeads} />
        </div>
      </section>

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

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={isSendingTestEmail}
            onClick={async () => {
              setIsSendingTestEmail(true);
              try {
                const { data, error } = await supabase.functions.invoke('test-abandoned-email', {
                  body: { email: 'pauljsales455@outlook.com' },
                });
                if (error) throw error;
                toast({ title: 'Test email sent', description: 'Check your inbox.' });
              } catch (err: any) {
                toast({ title: 'Failed to send test email', description: err.message || 'Unknown error', variant: 'destructive' });
              } finally {
                setIsSendingTestEmail(false);
              }
            }}
          >
            {isSendingTestEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Test Abandoned Email
          </Button>
        )}

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
                This will delete <strong>everything</strong> — all outreach leads, outreach history, templates, contact logs, search history, and metrics. Only your subscription will remain. This cannot be undone.
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
