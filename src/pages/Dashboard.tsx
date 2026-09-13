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
import { DashboardSection } from '@/components/dashboard/DashboardSection';

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

  /* "Clear all stored tasks" (2026-09-13): every stored next_action on MY leads back to none, in
     one owner-RLS update. Only rows that actually carry a task are touched (.neq none), so the
     count that comes back is the real number cleared. Derived rows are not stored and are not
     affected — they leave when the thing they describe is answered, paid or closed. */
  const handleClearAllTasks = async (): Promise<number> => {
    if (!user) return 0;
    const { data, error } = await supabase
      .from('outreach_leads')
      .update({ next_action: 'none', next_action_date: null })
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .not('next_action', 'is', null)
      .neq('next_action', 'none')
      .select('id');
    if (error) {
      toast({ title: 'Could not clear tasks', description: error.message, variant: 'destructive' });
      return 0;
    }
    refetch();
    return data?.length ?? 0;
  };

  /* Dismiss a derived task = mark the lead closed (a DEAD status in dashboardTasks.ts, so the
     reply / chase / quoted rules stop firing for it). The card confirms first. */
  const handleDismissTask = async (leadId: string): Promise<void> => {
    const { error } = await supabase.from('outreach_leads').update({ status: 'closed' }).eq('id', leadId);
    if (error) {
      toast({ title: 'Could not close the lead', description: error.message, variant: 'destructive' });
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
      {/* OPEN: small, fixed height, and it is the headline. Paul kept it knowing it overlaps the
          per-campaign funnel below — that overlap is not reason enough to cut it. */}
      <DashboardSection storageKey="audit-funnel" title="Audit funnel" defaultOpen>
        <AuditFunnelCard funnel={metrics.auditFunnel} />
      </DashboardSection>

      {/* Outreach performance — per-channel (what's working) + pipeline */}
      {/* COLLAPSED: reference figures, not a daily read. The pipeline breakdown in particular is
          21 status rows of which 7 are permanent zeroes — see PipelineCard's own toggle. */}
      <DashboardSection storageKey="outreach-performance" title="Outreach performance"
        defaultOpen={false} collapsedHint="channels and pipeline">
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChannelPerformanceCard data={metrics.channelPerf} />
          </div>
          <PipelineCard allLeads={metrics.allLeads} />
        </div>
      </DashboardSection>

      {/* Paying clients — what each one needs next. Above "next steps" on purpose: a paying client's
          delivery outranks prospecting admin, and this card is the only per-client view in the app
          (2026-09-13). The door to the operator Baseline screen is here, through the pointer. */}
      {/* OPEN: the only per-client view in the app and the door to the Baseline screen. */}
      <DashboardSection storageKey="clients" title="Clients" defaultOpen>
        <ClientDeliveryCard leads={metrics.allLeads} onChanged={refetch} />
      </DashboardSection>

      {/* Next steps */}
      {/* OPEN. NextActionsCard already caps itself at max-h-[220px] and scrolls internally, so 43
          live tasks cost ~220px, not 43 rows — it looked like the worst card and is one of the
          smallest. FreeCheckProgressCard's own comment argues it must not sit behind a toggle, and
          that argument stands: it answers "where has my test got to". */}
      <DashboardSection storageKey="next-steps" title="Activity &amp; next steps" defaultOpen>
        <div className="grid gap-3 sm:gap-4 grid-cols-1">
          <NextActionsCard tasks={metrics.dashTasks} onClearTask={handleClearTask} onClearAll={handleClearAllTasks} onDismiss={handleDismissTask} />
          {/* ⛔ ABOVE THE FOLD OF THIS SECTION AND NOT BEHIND A TOGGLE (2026-09-07). It is the screen
              that answers "where has my test got to", and the whole reason it exists is that the
              answer was unavailable while an operator sat waiting. A collapsed panel would put it
              back one click from useless. It polls only while something is mid-flight. */}
          <FreeCheckProgressCard />
        </div>
      </DashboardSection>

      {/* ⚠️ SUBMISSIONS MOVED OUT OF "next steps" TO BE COLLAPSED SEPARATELY (2026-09-13), and the
          reason it was grouped there still holds: its chase task is keyed on a LEAD and only fires
          after a day, so a lead-less submission never appears in Next Actions at all. Adjacency is
          what that argument needs, and adjacency is kept — it is the very next section. */}
      <DashboardSection storageKey="submissions" title="Questionnaire submissions"
        defaultOpen={false} collapsedHint="who filled the form">
        <SubmissionsCard />
      </DashboardSection>

      {/* 🔴 COLLAPSED, AND THIS IS THE ONE THAT MADE THE PAGE "MASSIVE". It is the only card that
          multiplies a large component by a row count: 13 campaigns x a 386-line CampaignStatsCard,
          every one expanded, with no max-height anywhere in the chain. Nothing else on this page
          grows like that. The per-campaign hide it already has is untouched. */}
      {isAdmin && (
        <DashboardSection storageKey="campaigns" title="Campaigns"
          defaultOpen={false} collapsedHint="per-campaign funnels">
          <CampaignStatsSection />
        </DashboardSection>
      )}

      {/* Admin zone — rendered ONLY for admins (role-based useSubscription().isAdmin) */}
      {isAdmin && (
        <DashboardSection storageKey="admin" title="Admin"
          defaultOpen={false} collapsedHint="status, usage, recent events">
          <AdminZone />
        </DashboardSection>
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
