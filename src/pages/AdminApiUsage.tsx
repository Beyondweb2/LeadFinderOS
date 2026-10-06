import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft, DollarSign, AlertTriangle, Activity, Database, RefreshCw, ShieldCheck, BarChart3, MapPin, Users,
} from 'lucide-react';
import { Callout, ErrorState, KpiCard, LoadState, PageHeader, SectionHeading } from '@/components/operator/ui';
import { Panel } from '@/components/salesDash/ui';
import { SecurityPanel } from '@/components/SecurityPanel';
import { SalesChecksAdminCard } from '@/components/SalesChecksAdminCard';

interface ApiUsageData {
  spendToday: number;
  spendMonth: number;
  costByApiType: Record<string, { cost: number; calls: number }>;
  costByUser: Array<{
    userId: string;
    email: string;
    costMonth: number;
    costToday: number;
    searches: number;
    searchesToday: number;
  }>;
  placeDetailsByTrigger: Record<string, number>;
  cacheStats: Record<string, { hits: number; total: number }>;
  cacheSizes: { search_cache: number; phone_cache: number; geocode_cache: number };
  alerts: Array<{ type: string; message: string; severity: 'warning' | 'critical' }>;
}

export default function AdminApiUsage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ApiUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); return; }

      const { data: result, error: fnError } = await supabase.functions.invoke('admin-api-usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  /* The page keeps its header while loading and when the load fails (2026-10-06) — never a bare box. */
  const bareHeader = <PageHeader icon={ShieldCheck} tone="blue" title="API Usage & Security" />;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl min-w-0 space-y-6 p-4 md:p-8">
        {bareHeader}
        <LoadState label="Loading API usage…" className="min-h-[40vh]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-4 md:p-8">
        {bareHeader}
        <ErrorState title="Couldn’t load API usage" detail={error} onRetry={fetchData} />
        <Button variant="outline" onClick={() => navigate('/admin')}>Back to Admin</Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-7xl mx-auto space-y-6 min-w-0">
      {/* Header */}
      <PageHeader icon={ShieldCheck} tone="blue" title="API Usage & Security"
        subtitle={<>
          Everything the code recorded, as the spend guard sees it — including usage Move37 paid for before each provider moved to your own account.
          {' '}Findable's own cost figures are on the Admin dashboard (API &amp; system costs).
        </>}
        actions={<>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} aria-label="Back to Admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </>} />

      {/* Security & usage (2026-09-29): who spent what, warnings, restrictions, the paid-action control. */}
      <SecurityPanel />

      {/* Salespeople's bulk pre-call checks (fix/07): batches, fresh vs reused, estimated and actual spend, problems. */}
      <SalesChecksAdminCard />

      <SectionHeading title="Google API detail" tone="blue" />

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <Callout
              key={i}
              tone={alert.severity === 'critical' ? 'red' : 'amber'}
              icon={AlertTriangle}
              title={alert.message}
              action={<Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>{alert.severity}</Badge>}
            />
          ))}
        </div>
      )}

      {/* Spend Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Spend Today" value={'$' + data.spendToday.toFixed(2)} icon={DollarSign} tone="green" />
        <KpiCard label="Spend This Month" value={'$' + data.spendMonth.toFixed(2)} icon={DollarSign} tone="green" />
        <Panel title="Cache Entries" icon={Database} tone="grey">
          <div className="text-sm space-y-1">
            <p className="text-foreground">Search: <span className="font-semibold">{data.cacheSizes.search_cache}</span></p>
            <p className="text-foreground">Phone: <span className="font-semibold">{data.cacheSizes.phone_cache}</span></p>
            <p className="text-foreground">Geocode: <span className="font-semibold">{data.cacheSizes.geocode_cache}</span></p>
          </div>
        </Panel>
        <Panel title="Cache Hit Rates" icon={Activity} tone="blue">
          <div className="text-sm space-y-1">
            {Object.entries(data.cacheStats).map(([type, stats]) => (
              <p key={type} className="text-foreground break-words">
                {type}: <span className="font-semibold">
                  {stats.total > 0 ? ((stats.hits / stats.total) * 100).toFixed(1) : '0'}%
                </span>
                <span className="text-muted-foreground ml-1">({stats.hits}/{stats.total})</span>
              </p>
            ))}
          </div>
        </Panel>
      </div>

      {/* Cost by API Type */}
      <Panel title="Cost by API Type (This Month)" icon={BarChart3} tone="green">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API Type</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.costByApiType)
                .sort(([, a], [, b]) => b.cost - a.cost)
                .map(([type, stats]) => (
                  <TableRow key={type}>
                    <TableCell className="font-medium">{type}</TableCell>
                    <TableCell className="text-right">{stats.calls}</TableCell>
                    <TableCell className="text-right font-semibold">${stats.cost.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
      </Panel>

      {/* Place Details by Trigger */}
      <Panel title="Place Details Calls by Trigger Source" icon={MapPin} tone="blue">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger Source</TableHead>
                <TableHead className="text-right">Calls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.placeDetailsByTrigger)
                .sort(([, a], [, b]) => b - a)
                .map(([source, calls]) => (
                  <TableRow key={source}>
                    <TableCell className="font-medium">{source}</TableCell>
                    <TableCell className="text-right">{calls}</TableCell>
                  </TableRow>
                ))}
              {Object.keys(data.placeDetailsByTrigger).length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">No data</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
      </Panel>

      {/* Cost by User */}
      <Panel title="Cost by User (This Month)" icon={Users} tone="grey">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Searches (Month)</TableHead>
                <TableHead className="text-right">Searches (Today)</TableHead>
                <TableHead className="text-right">Cost Today</TableHead>
                <TableHead className="text-right">Cost Month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.costByUser.slice(0, 50).map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium text-xs">{u.email}</TableCell>
                  <TableCell className="text-right">{u.searches}</TableCell>
                  <TableCell className="text-right">{u.searchesToday}</TableCell>
                  <TableCell className="text-right">${u.costToday.toFixed(3)}</TableCell>
                  <TableCell className="text-right font-semibold">${u.costMonth.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </Panel>
    </div>
  );
}
