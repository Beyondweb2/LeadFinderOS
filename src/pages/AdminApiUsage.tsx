import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft, Loader2, DollarSign, AlertTriangle, Activity, Database, RefreshCw,
} from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => navigate('/admin')}>Back to Admin</Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Google API Usage</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                alert.severity === 'critical'
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              }`}
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{alert.message}</span>
              <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'} className="ml-auto">
                {alert.severity}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Spend Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Spend Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${data.spendToday.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Spend This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">${data.spendMonth.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" /> Cache Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <p className="text-foreground">Search: <span className="font-semibold">{data.cacheSizes.search_cache}</span></p>
              <p className="text-foreground">Phone: <span className="font-semibold">{data.cacheSizes.phone_cache}</span></p>
              <p className="text-foreground">Geocode: <span className="font-semibold">{data.cacheSizes.geocode_cache}</span></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" /> Cache Hit Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              {Object.entries(data.cacheStats).map(([type, stats]) => (
                <p key={type} className="text-foreground">
                  {type}: <span className="font-semibold">
                    {stats.total > 0 ? ((stats.hits / stats.total) * 100).toFixed(1) : '0'}%
                  </span>
                  <span className="text-muted-foreground ml-1">({stats.hits}/{stats.total})</span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost by API Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost by API Type (This Month)</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Place Details by Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Place Details Calls by Trigger Source</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Cost by User */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cost by User (This Month)</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
