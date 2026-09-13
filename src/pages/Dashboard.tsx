import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { Link } from 'react-router-dom';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { PipelineCard } from '@/components/dashboard/PipelineCard';
import { NextActionsCard } from '@/components/dashboard/NextActionsCard';
import { ClientDeliveryCard } from '@/components/dashboard/ClientDeliveryCard';
import { SubmissionsCard } from '@/components/dashboard/SubmissionsCard';
import { FreeCheckProgressCard } from '@/components/dashboard/FreeCheckProgressCard';
import { ChannelPerformanceCard } from '@/components/dashboard/ChannelPerformanceCard';
import { AuditFunnelCard } from '@/components/dashboard/AuditFunnelCard';
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
  const { isLoading: isSubscriptionLoading, isAdmin } = useSubscription();
  const { metrics, isLoading, refetch } = useDashboardMetrics(isAdmin);
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFullResetting, setIsFullResetting] = useState(false);

  // Clear a lead's task from the Next Actions card: set next_action='none' +
  // next_action_date=null (owner-RLS update, same shape as updateNextAction's clear).
  // Only the task fields change — the lead is otherwise untouched. Refetch so metrics
  // reflect it permanently; the card already removed the row optimistically.
  const handleClearTask = async (leadId: string) => {
    const { error } = await supabase
      .from('outreach_leads')
      .update({ next_action: 'none', next_action_date: null })
      .eq('id', leadId);
    if (error) {
      toast({ title: 'Could not clear task', description: error.message, variant: 'destructive' });
      return;
    }
    refetch();
  };

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

      {/* Audit funnel — the current contacted→pitch→pay funnel leads the dashboard */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Audit funnel</h2>
        <AuditFunnelCard funnel={metrics.auditFunnel} />
      </section>

      {/* Outreach performance — per-channel (what's working) + pipeline */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Outreach performance</h2>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChannelPerformanceCard data={metrics.channelPerf} />
          </div>
          <PipelineCard allLeads={metrics.allLeads} />
        </div>
      </section>

      {/* Paying clients — what each one needs next. Above "next steps" on purpose: a paying client's
          delivery outranks prospecting admin, and this card is the only per-client view in the app
          (2026-09-13). The door to the operator Baseline screen is here, through the pointer. */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Clients</h2>
        <ClientDeliveryCard leads={metrics.allLeads} onChanged={refetch} />
      </section>

      {/* Next steps */}
      <section>
        <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Activity &amp; next steps</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1">
          <NextActionsCard tasks={metrics.dashTasks} onClearTask={handleClearTask} />
          {/* Beside Next Actions on purpose: its chase task is keyed on a LEAD and only fires after
              a day, so a lead-less submission never appears there at all. */}
          <SubmissionsCard />
          {/* ⛔ ABOVE THE FOLD OF THIS SECTION AND NOT BEHIND A TOGGLE (2026-09-07). It is the screen
              that answers "where has my test got to", and the whole reason it exists is that the
              answer was unavailable while an operator sat waiting. A collapsed panel would put it
              back one click from useless. It polls only while something is mid-flight. */}
          <FreeCheckProgressCard />
        </div>
      </section>

      {/* Per-campaign monitoring — operator-level; admins only (same gate as Sites) */}
      {isAdmin && (
        <section>
          <h2 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3">Campaigns</h2>
          <CampaignStatsSection />
        </section>
      )}

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
                This wipes <strong>all your data</strong> — every lead (including Track Leads and paying customers), outreach history &amp; activity, contact logs, search history, and every generated site along with its bookings, staff, claim links and visit tracking. It also clears your claims &amp; business notes and resets your metrics to zero.
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
