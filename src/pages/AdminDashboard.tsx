import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, Loader2, Users, Search, Activity, MessageSquare, Building2, RefreshCw, Trash2 } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  subscription_status: string;
  access_mode: string;
  billing_status: string;
  current_period_end: string | null;
  paid_at: string | null;
  search_count: number;
  free_search_count: number;
  businesses_added_count: number;
  messages_sent_count: number;
  replies_count: number;
  last_active_at: string | null;
  last_search_at: string | null;
}

interface UsageEvent {
  id: string;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

function accessModeColor(mode: string): string {
  switch (mode) {
    case 'paid': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'free': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function accessModeLabel(mode: string): string {
  switch (mode) {
    case 'paid': return 'Paid (Unlimited)';
    case 'free': return 'Free Access';
    default: return mode;
  }
}

function billingStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'past_due': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'canceled': return 'bg-red-500/15 text-red-400 border-red-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: isSubLoading } = useSubscription();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userEvents, setUserEvents] = useState<UsageEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const fetchUsers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list_users', per_page: 200, email: searchQuery || undefined, status: statusFilter !== 'all' ? statusFilter : undefined },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!error && data?.users) {
        setUsers(data.users);
      } else {
        toast.error('Failed to fetch users');
      }
    } catch {
      toast.error('Network error');
    }
    setIsLoading(false);
  }, [searchQuery, statusFilter]);

  const deleteUser = useCallback(async (userId: string, email: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setIsDeletingUser(true);
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete_user', user_id: userId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!error && !data?.error) {
      toast.success(`Deleted ${email}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
    } else {
      toast.error('Failed to delete user');
    }
    setIsDeletingUser(false);
  }, [selectedUser]);

  useEffect(() => {
    if (!isSubLoading && !isAdmin) navigate('/', { replace: true });
    else if (!isSubLoading && isAdmin) fetchUsers();
  }, [isSubLoading, isAdmin, navigate, fetchUsers]);

  if (isSubLoading || !isAdmin) return <div className="flex items-center justify-center min-h-screen bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-xl font-bold">Admin Dashboard ({users.length} users)</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Paid</SelectItem>
              <SelectItem value="trialing">Free</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Free Used</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedUser(u)}>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{u.email}</TableCell>
                        <TableCell><Badge variant="outline" className={accessModeColor(u.access_mode)}>{accessModeLabel(u.access_mode)}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={billingStatusColor(u.billing_status)}>{u.billing_status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.search_count}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{u.free_search_count}/5</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{timeAgo(u.last_active_at)}</TableCell>
                        <TableCell>
                          {u.id !== isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                <AlertDialogHeader><AlertDialogTitle>Delete user?</AlertDialogTitle><AlertDialogDescription>Permanently delete {u.email}.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => deleteUser(u.id, u.email)}>Delete</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
    </div>
  );
}
