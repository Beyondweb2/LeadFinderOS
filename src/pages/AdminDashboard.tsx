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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  ArrowLeft,
  Loader2,
  Users,
  Search,
  Activity,
  MessageSquare,
  Building2,
  RefreshCw,
  Trash2,
  Footprints,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  subscription_status: string;
  access_mode: string;
  billing_status: string;
  current_period_end: string | null;
  demo_started_at: string | null;
  trial_started_at: string | null;
  paid_at: string | null;
  free_search_count: number;
  walkthrough_completed: boolean;
  walkthrough_max_step: number;
  walkthrough_last_seen_at: string | null;
  stripe_subscription_id: string | null;
  search_count: number;
  businesses_added_count: number;
  messages_sent_count: number;
  replies_count: number;
  last_active_at: string | null;
  last_search_at: string | null;
}

interface WalkthroughStats {
  totalStarted: number;
  totalCompleted: number;
  completionRate: number;
  stepCounts: number[];
  topDropoffStep: number;
  maxDrop: number;
  userTable: Array<{
    user_id: string;
    email: string;
    max_step: number;
    completed: boolean;
    last_seen_at: string | null;
  }>;
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
    case 'free_user': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'signed_up': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function accessModeLabel(mode: string): string {
  switch (mode) {
    case 'paid': return 'Paid (Unlimited)';
    case 'free_user': return 'Free Access';
    case 'signed_up': return 'Signed Up';
    default: return mode;
  }
}

function billingStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'trialing': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'past_due': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'canceled': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'checkout_started': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'no_stripe': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function billingStatusLabel(status: string): string {
  switch (status) {
    case 'no_stripe': return 'No Stripe';
    case 'checkout_started': return 'Checkout Started';
    case 'trialing': return 'Stripe Trialing';
    case 'active': return 'Active';
    case 'past_due': return 'Past Due';
    case 'canceled': return 'Canceled';
    default: return status;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
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
  const { user, session } = useAuth();
  const { isAdmin, isLoading: isSubLoading } = useSubscription();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userEvents, setUserEvents] = useState<UsageEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [walkthroughStats, setWalkthroughStats] = useState<WalkthroughStats | null>(null);
  const [isLoadingWtStats, setIsLoadingWtStats] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // Always get a fresh session
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (!freshSession?.access_token) {
      toast.error('No session token found. Please log in again.');
      return null;
    }
    return freshSession.access_token;
  }, []);

  const fetchUsers = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setIsLoading(true);
    setFetchError(null);

    const filterBody: Record<string, unknown> = { action: 'list_users', per_page: 200 };
    if (searchQuery) filterBody.email = searchQuery;
    if (statusFilter !== 'all') filterBody.status = statusFilter;
    if (activityFilter === '7d') filterBody.active_days = 7;
    else if (activityFilter === '30d') filterBody.active_days = 30;

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: filterBody,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      console.log('[AdminDashboard] Response:', { data, error });

      if (error) {
        const errMsg = error.message || 'Unknown error';
        console.error('[AdminDashboard] Invoke error:', errMsg);
        setFetchError(errMsg);
        toast.error(`Admin fetch failed: ${errMsg}`);
      } else if (data?.error) {
        console.error('[AdminDashboard] Server error:', data.error, data.details);
        setFetchError(`${data.error}${data.details ? ': ' + data.details : ''}`);
        toast.error(`Server error: ${data.error}`);
      } else {
        const userList = data?.users || [];
        console.log('[AdminDashboard] Users received:', userList.length, 'total:', data?.total);
        setUsers(userList);
        if (userList.length === 0 && !searchQuery && statusFilter === 'all') {
          toast.info('No users returned. Check edge function logs for details.');
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[AdminDashboard] Exception:', errMsg);
      setFetchError(errMsg);
      toast.error(`Unexpected error: ${errMsg}`);
    }

    setIsLoading(false);
  }, [getAccessToken, searchQuery, statusFilter, activityFilter]);

  const fetchUserEvents = useCallback(async (userId: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setIsLoadingEvents(true);

    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'user_events', user_id: userId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      console.error('Failed to fetch events:', error);
    } else {
      setUserEvents(data?.events || []);
    }
    setIsLoadingEvents(false);
  }, [getAccessToken]);

  const deleteUser = useCallback(async (userId: string, email: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setIsDeletingUser(true);

    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete_user', user_id: userId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
    } else if (data?.error) {
      toast.error(`Delete failed: ${data.error}`);
    } else {
      toast.success(`Deleted ${email}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
    }

    setIsDeletingUser(false);
  }, [getAccessToken, selectedUser]);

  const fetchWalkthroughStats = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setIsLoadingWtStats(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-funnel', {
        body: { action: 'walkthrough_stats' },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!error && data && !data.error) {
        setWalkthroughStats(data as WalkthroughStats);
      }
    } catch (e) {
      console.error('[AdminDashboard] walkthrough stats error:', e);
    }
    setIsLoadingWtStats(false);
  }, [getAccessToken]);

  useEffect(() => {
    if (!isSubLoading && !isAdmin) {
      navigate('/', { replace: true });
      return;
    }
    if (!isSubLoading && isAdmin) {
      fetchUsers();
      fetchWalkthroughStats();
    }
  }, [isSubLoading, isAdmin, navigate, fetchUsers, fetchWalkthroughStats]);

  const handleRowClick = (user: AdminUser) => {
    setSelectedUser(user);
    fetchUserEvents(user.id);
  };

  const filtered = users;

  const totalActive = users.filter(u => u.access_mode === 'paid').length;
  const totalFreeUsers = users.filter(u => u.access_mode === 'free_user').length;
  const totalSearches = users.reduce((s, u) => s + u.search_count, 0);
  const totalMessages = users.reduce((s, u) => s + u.messages_sent_count, 0);

  if (isSubLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">{users.length} users total</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error Banner */}
        {fetchError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400 font-medium">Error loading users</p>
            <p className="text-xs text-red-400/80 mt-1">{fetchError}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Active Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalActive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Free Users
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalFreeUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" /> Total Searches
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalSearches}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Messages Sent
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{totalMessages}</p>
            </CardContent>
          </Card>
        </div>

        {/* Walkthrough Progress Card */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Footprints className="h-4 w-4 text-primary" /> Walkthrough Progress
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fetchWalkthroughStats} disabled={isLoadingWtStats}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingWtStats ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoadingWtStats && !walkthroughStats ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : walkthroughStats ? (
              <div className="space-y-4">
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold">{walkthroughStats.totalStarted}</p>
                    <p className="text-[10px] text-muted-foreground">Started</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <p className="text-2xl font-bold">{walkthroughStats.totalCompleted}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Completed ({walkthroughStats.completionRate}%)</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      <p className="text-2xl font-bold">Step {walkthroughStats.topDropoffStep}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Top Dropoff ({walkthroughStats.maxDrop} users)</p>
                  </div>
                </div>

                {/* Step funnel */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Step-by-Step Funnel</p>
                  <div className="space-y-1.5">
                    {walkthroughStats.stepCounts.map((count, i) => {
                      const maxCount = walkthroughStats.stepCounts[0] || 1;
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-12 text-muted-foreground shrink-0">Step {i + 1}</span>
                          <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden">
                            <div
                              className="h-full rounded bg-primary/60 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right tabular-nums font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* User table */}
                {walkthroughStats.userTable.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Recent Walkthrough Users (top 100)</p>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Email</TableHead>
                            <TableHead className="text-xs text-center">Max Step</TableHead>
                            <TableHead className="text-xs text-center">Completed</TableHead>
                            <TableHead className="text-xs">Last Seen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {walkthroughStats.userTable.map((row) => (
                            <TableRow key={row.user_id}>
                              <TableCell className="text-xs max-w-[180px] truncate">{row.email}</TableCell>
                              <TableCell className="text-xs text-center tabular-nums">{row.max_step}/8</TableCell>
                              <TableCell className="text-xs text-center">{row.completed ? '✅' : '—'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{timeAgo(row.last_seen_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No walkthrough data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trialing">Trialing</SelectItem>
              <SelectItem value="canceled">Canceled/Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Signed Up</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Walkthrough</TableHead>
                      <TableHead>Paid At</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Added</TableHead>
                      <TableHead>Last Active</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((u) => (
                        <TableRow
                          key={u.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleRowClick(u)}
                        >
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">
                            {u.email}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(u.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={accessModeColor(u.access_mode)}>
                              {accessModeLabel(u.access_mode)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={billingStatusColor(u.billing_status)}>
                              {billingStatusLabel(u.billing_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {u.messages_sent_count ?? 0}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {u.walkthrough_completed ? '✅' : u.walkthrough_max_step > 0 ? `Step ${u.walkthrough_max_step}/8` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(u.paid_at)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{u.search_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.businesses_added_count}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {timeAgo(u.last_active_at)}
                          </TableCell>
                          <TableCell>
                            {u.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete user?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete <strong>{u.email}</strong> and all their data. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700"
                                      onClick={() => deleteUser(u.id, u.email)}
                                      disabled={isDeletingUser}
                                    >
                                      {isDeletingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {users.length} users
        </p>
      </div>

      {/* User Detail Drawer */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selectedUser.email}</SheetTitle>
                <SheetDescription className="text-left">
                  User ID: <span className="font-mono text-xs">{selectedUser.id}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Subscription Info */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Status</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Access Mode</p>
                      <Badge variant="outline" className={`mt-1 ${accessModeColor(selectedUser.access_mode)}`}>
                        {accessModeLabel(selectedUser.access_mode)}
                      </Badge>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Billing (Stripe)</p>
                      <Badge variant="outline" className={`mt-1 ${billingStatusColor(selectedUser.billing_status)}`}>
                        {billingStatusLabel(selectedUser.billing_status)}
                      </Badge>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Period End</p>
                      <p className="text-sm font-medium mt-1">{formatDate(selectedUser.current_period_end)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="text-sm font-medium mt-1">{formatDate(selectedUser.created_at)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Last Active</p>
                      <p className="text-sm font-medium mt-1">{timeAgo(selectedUser.last_active_at)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Messages Sent</p>
                      <p className="text-sm font-medium mt-1">{selectedUser.messages_sent_count ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Walkthrough</p>
                      <p className="text-sm font-medium mt-1">{selectedUser.walkthrough_completed ? 'Completed' : 'Not completed'}</p>
                    </div>
                    {selectedUser.stripe_subscription_id && (
                      <div className="rounded-lg border border-border p-3 col-span-2">
                        <p className="text-xs text-muted-foreground">Stripe Subscription</p>
                        <p className="text-sm font-mono font-medium mt-1 truncate">{selectedUser.stripe_subscription_id}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete User */}
                {selectedUser.id !== user?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="w-full">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete this user
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{selectedUser.email}</strong> and all their data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => deleteUser(selectedUser.id, selectedUser.email)}
                          disabled={isDeletingUser}
                        >
                          {isDeletingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Metrics Summary */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Usage Metrics</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                      <Search className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-lg font-bold">{selectedUser.search_count}</p>
                        <p className="text-xs text-muted-foreground">Searches</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-lg font-bold">{selectedUser.businesses_added_count}</p>
                        <p className="text-xs text-muted-foreground">Businesses Added</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-lg font-bold">{selectedUser.messages_sent_count}</p>
                        <p className="text-xs text-muted-foreground">Messages Sent</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-3 flex items-center gap-3">
                      <Activity className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-lg font-bold">{selectedUser.replies_count}</p>
                        <p className="text-xs text-muted-foreground">Replies</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Events */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Recent Events</h3>
                  {isLoadingEvents ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : userEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No events recorded yet</p>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2 pr-3">
                        {userEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">
                                {event.event_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(event.created_at)}
                              </span>
                            </div>
                            {event.meta && (
                              <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto">
                                {JSON.stringify(event.meta, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
