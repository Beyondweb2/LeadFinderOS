import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { barberSitePreviewUrl } from '@/config/publicSite';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Loader2, RefreshCw, ExternalLink, Users } from 'lucide-react';

interface Client {
  user_id: string;
  email: string;
  business_name: string;
  site_name: string | null;
  share_token: string | null;
  claimed_at: string | null;
  is_paid: boolean;
  addon_interest_at: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Admin "Clients" page — the customers who CLAIMED a generated site (an auth account
 * that owns a generated_sites row and has no CRM footprint). Distinct from the team
 * (operators) shown in the dashboard AdminZone user list. Data comes from the
 * admin-users edge function (action 'list_clients'), which keeps its own server-side
 * admin gate; the route also wraps this page in RequireAdmin.
 */
export default function AdminClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); return; }

      const { data: result, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list_clients' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setClients((result?.clients || []) as Client[]);
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Clients
          </h1>
          <span className="text-sm text-muted-foreground">{clients.length} claimed</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Customers who claimed a generated site (excludes team members / operators).
      </p>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No clients yet — no sites have been claimed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Claimed</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead>Add-on requested</TableHead>
                    <TableHead className="text-right">Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.user_id}>
                      <TableCell className="font-medium max-w-[220px] truncate">{c.business_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{c.email}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(c.claimed_at)}</TableCell>
                      <TableCell className="text-center">
                        {c.is_paid
                          ? <Badge className="bg-green-500/20 text-green-500 border-transparent">Paid</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">No</Badge>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {c.addon_interest_at
                          ? <span className="text-amber-500 font-medium">{formatDate(c.addon_interest_at)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.share_token ? (
                          <a
                            href={barberSitePreviewUrl(c.share_token)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            title="View their site (preview — doesn't count as opened)"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> View
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
