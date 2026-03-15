import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, UserPlus, TrendingUp, Loader2 } from 'lucide-react';

interface FunnelMetrics {
  guestSearchesToday: number;
  trialsStartedToday: number;
  conversionRate: number;
}

export function FunnelMetricsCard() {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        const [searchRes, trialRes] = await Promise.all([
          supabase
            .from('funnel_analytics')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'guest_search_performed')
            .gte('created_at', todayISO),
          supabase
            .from('funnel_analytics')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'trial_started')
            .gte('created_at', todayISO),
        ]);

        const searches = searchRes.count ?? 0;
        const trials = trialRes.count ?? 0;
        const rate = searches > 0 ? Math.round((trials / searches) * 100) : 0;

        setMetrics({
          guestSearchesToday: searches,
          trialsStartedToday: trials,
          conversionRate: rate,
        });
      } catch (err) {
        console.error('Failed to fetch funnel metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (isLoading) {
    return (
      <Card className="border-border col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Funnel Metrics</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics) return null;

  return (
    <Card className="border-border col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Funnel Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/40">
            <Search className="h-4 w-4 text-primary mb-1" />
            <span className="text-2xl font-bold">{metrics.guestSearchesToday}</span>
            <span className="text-[11px] text-muted-foreground text-center leading-tight">Guest Searches Today</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/40">
            <UserPlus className="h-4 w-4 text-green-500 mb-1" />
            <span className="text-2xl font-bold">{metrics.trialsStartedToday}</span>
            <span className="text-[11px] text-muted-foreground text-center leading-tight">Trials Started Today</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/40">
            <TrendingUp className="h-4 w-4 text-amber-500 mb-1" />
            <span className="text-2xl font-bold">{metrics.conversionRate}%</span>
            <span className="text-[11px] text-muted-foreground text-center leading-tight">Search → Trial</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
