import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { OutreachActivityCard } from '@/components/dashboard/OutreachActivityCard';
import { ResponseEngagementCard } from '@/components/dashboard/ResponseEngagementCard';
import { PipelineSnapshotCard } from '@/components/dashboard/PipelineSnapshotCard';
import { DailyDisciplineCard } from '@/components/dashboard/DailyDisciplineCard';
import { TrialProgressCard } from '@/components/dashboard/TrialProgressCard';
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

const Dashboard = () => {
  const { metrics, isLoading, refetch } = useDashboardMetrics();
  const { subscribed, isLoading: isSubscriptionLoading, isPaidSubscriber, isStripeTrialing, trialEnd } = useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFullResetting, setIsFullResetting] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  
  const isAdmin = user?.email === 'pauljsales455@outlook.com';
  // Show trial progress only for Stripe trialing users (not paid subscribers)
  const showTrialProgress = !isSubscriptionLoading && isStripeTrialing && !isPaidSubscriber;

  // Wait for all data to load before rendering
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
        // Activity data
        supabase.from('copied_phones').delete().eq('user_id', user.id),
        supabase.from('outreach_activities').delete().eq('user_id', user.id),
        supabase.from('lead_contacts').delete().eq('user_id', user.id),
        supabase.from('search_history').delete().eq('user_id', user.id),
        supabase.from('checked_businesses').delete().eq('user_id', user.id),
        // CRM data
        supabase.from('outreach_leads').delete().eq('user_id', user.id),
        supabase.from('outreach_history').delete().eq('user_id', user.id),
        // Templates (non-default)
        supabase.from('templates').delete().eq('user_id', user.id),
        // Metrics
        supabase.rpc('reset_my_metrics'),
      ]);
      
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Full reset errors:', errors.map(e => e.error));
      }
      
      // Full reset complete — no toast
      refetch();
    } catch (err) {
      console.error('Full reset failed:', err);
      toast({ title: 'Error', description: 'Failed to perform full reset.', variant: 'destructive' });
    } finally {
      setIsFullResetting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {showTrialProgress 
            ? 'Full access is active — everything unlocked'
            : 'Track your performance and revenue'
          }
        </p>
      </div>

      {/* Trial Progress Card - Only for Stripe trialing users */}
      {showTrialProgress && (
        <section>
          <TrialProgressCard
            trialEnd={trialEnd}
            noWebsiteBusinesses={metrics.noWebsiteBusinesses}
            addedToCRM={metrics.totalBusinessesAdded}
            searchesToday={metrics.activity.activitiesToday}
            totalLeadsAdded={metrics.totalBusinessesAdded}
          />
        </section>
      )}

      {/* Primary Metrics */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Performance</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <OutreachActivityCard
            contactsLifetime={metrics.contactedCount}
            contactsToday={metrics.addedToday}
            repliesReceived={metrics.repliedCount}
            callsBooked={metrics.callsBookedCount}
          />
          <ResponseEngagementCard
            replyRate={metrics.replyRate}
            bookingRate={metrics.bookingRate}
            positiveReplies={metrics.positiveReplies}
            contactedCount={metrics.contactedCount}
          />
          <PipelineSnapshotCard leads={metrics.allLeads} />
          <DailyDisciplineCard
            contactsToday={metrics.addedToday}
            sevenDayAvg={metrics.avgPerDayLast7Days}
            leads={metrics.allLeads}
          />
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
       
      {/* Reset Counters & CTA */}
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
                console.log('Test abandoned email response:', data);
                if (error) throw error;
                toast({ title: 'Test email sent', description: 'Check your inbox.' });
              } catch (err: any) {
                console.error('Test email error:', err);
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
                This will delete <strong>everything</strong> — all CRM leads, outreach history, templates, contact logs, search history, and metrics. Only your subscription will remain. This cannot be undone.
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
