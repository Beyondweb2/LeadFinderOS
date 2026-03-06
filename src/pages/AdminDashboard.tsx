import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  Timer,
  CheckCircle,
  XCircle,
  TrendingUp,
  PoundSterling,
  Info,
  Percent,
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
  walkthrough_started_at: string | null;
  walkthrough_completed_at: string | null;
  walkthrough_skipped_at: string | null;
  stripe_subscription_id: string | null;
  search_count: number;
  businesses_added_count: number;
  messages_sent_count: number;
  replies_count: number;
  last_active_at: string | null;
  last_search_at: string | null;
}

function getWalkthroughStatus(u: AdminUser): 'completed' | 'skipped' | 'in_progress' | 'not_started' {
  if (u.walkthrough_completed_at || u.walkthrough_completed) return 'completed';
  if (u.walkthrough_skipped_at) return 'skipped';
  if (u.walkthrough_started_at || u.walkthrough_max_step > 0) return 'in_progress';
  return 'not_started';
}

function walkthroughStatusLabel(status: 'completed' | 'skipped' | 'in_progress' | 'not_started'): string {
  switch (status) {
    case 'completed': return 'Completed';
    case 'skipped': return 'Skipped';
    case 'in_progress': return 'In Progress';
    case 'not_started': return 'Not Started';
  }
}

function walkthroughStatusColor(status: 'completed' | 'skipped' | 'in_progress' | 'not_started'): string {
  switch (status) {
    case 'completed': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'in_progress': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'skipped': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'not_started': return 'bg-muted text-muted-foreground border-border';
  }
}

function walkthroughStepLabel(u: AdminUser): string {
  const status = getWalkthroughStatus(u);
  if (status === 'completed') return 'Completed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'in_progress') return `Step ${u.walkthrough_max_step}/8`;
  return 'Not Started';
}

interface UsageEvent {
  id: string;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface CheckoutAttempt {
  id: string;
  email: string;
  user_id: string | null;
  converted: boolean;
  checkout_completed: boolean;
  created_at: string;
}

function accessModeColor(mode: string): string {
  switch (mode) {
    case 'paid': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'trial': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'payment_required': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'no_access': return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'free_user': return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'checkout_only': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'signed_up': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function accessModeLabel(mode: string): string {
  switch (mode) {
    case 'paid': return 'Paid (Unlimited)';
    case 'trial': return 'Trial';
    case 'payment_required': return 'Payment Required';
    case 'no_access': return 'No Access';
    case 'free_user': return 'Free Access';
    case 'checkout_only': return 'Checkout Only';
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
    case 'checkout_completed': return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    case 'no_stripe': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function billingStatusLabel(status: string): string {
  switch (status) {
    case 'no_stripe': return 'No Stripe';
    case 'checkout_started': return 'Checkout Started';
    case 'checkout_completed': return 'Paid – No Account';
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
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [checkoutAttempts24h, setCheckoutAttempts24h] = useState(0);
  const [recentCheckoutAttempts, setRecentCheckoutAttempts] = useState<CheckoutAttempt[]>([]);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const hasFetchedRef = useRef(false);

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
        const rawAttempts = (data?.recent_checkout_attempts || []) as CheckoutAttempt[];
        
        // Merge anonymous checkout attempts (no user_id) into the users list as pseudo-users
        const existingEmails = new Set(userList.map((u: AdminUser) => u.email.toLowerCase()));
        const anonymousAttempts: AdminUser[] = rawAttempts
          .filter((a: CheckoutAttempt) => !a.user_id && !existingEmails.has(a.email.toLowerCase()))
          // Apply search filter to checkout-only entries too
          .filter((a: CheckoutAttempt) => !searchQuery || a.email.toLowerCase().includes(searchQuery.toLowerCase()))
          // Dedupe by email (keep latest)
          .filter((a: CheckoutAttempt, i: number, arr: CheckoutAttempt[]) => 
            arr.findIndex((b: CheckoutAttempt) => b.email.toLowerCase() === a.email.toLowerCase()) === i
          )
          .map((a: CheckoutAttempt) => ({
            id: `checkout-${a.id}`,
            email: a.email,
            created_at: a.created_at,
            subscription_status: 'none',
            access_mode: 'checkout_only',
            billing_status: a.converted ? 'converted' : (a.checkout_completed ? 'checkout_completed' : 'checkout_started'),
            current_period_end: null,
            demo_started_at: null,
            trial_started_at: null,
            paid_at: null,
            free_search_count: 0,
            walkthrough_completed: false,
            walkthrough_max_step: 0,
            walkthrough_last_seen_at: null,
            walkthrough_started_at: null,
            walkthrough_completed_at: null,
            walkthrough_skipped_at: null,
            stripe_subscription_id: null,
            search_count: 0,
            businesses_added_count: 0,
            messages_sent_count: 0,
            replies_count: 0,
            last_active_at: null,
            last_search_at: null,
          }));

        const merged = [...userList, ...anonymousAttempts]
          .filter((u: AdminUser) => !deletedIdsRef.current.has(u.id))
          .sort(
            (a: AdminUser, b: AdminUser) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        
        console.log('[AdminDashboard] Users received:', userList.length, '+ anonymous attempts:', anonymousAttempts.length);
        setUsers(merged);
        setCheckoutAttempts24h(data?.checkout_attempts_24h || 0);
        setRecentCheckoutAttempts(rawAttempts);
        if (merged.length === 0 && !searchQuery && statusFilter === 'all') {
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
    // Checkout-only pseudo-users aren't real auth users — just remove from UI
    if (userId.startsWith('checkout-')) {
      deletedIdsRef.current.add(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
      toast.success(`Removed ${email} from list`);
      return;
    }
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
      deletedIdsRef.current.add(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
    }

    setIsDeletingUser(false);
  }, [getAccessToken, selectedUser]);


  const bulkDeleteUsers = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    const allIds = Array.from(selectedIds);
    // Separate checkout-only pseudo-users from real auth users
    const checkoutIds = allIds.filter(id => id.startsWith('checkout-'));
    const ids = allIds.filter(id => !id.startsWith('checkout-'));

    // Remove checkout-only entries from UI immediately
    if (checkoutIds.length > 0) {
      checkoutIds.forEach(id => deletedIdsRef.current.add(id));
      setUsers(prev => prev.filter(u => !checkoutIds.includes(u.id)));
    }

    if (ids.length === 0) {
      setSelectedIds(new Set());
      toast.success(`Removed ${checkoutIds.length} checkout entries from list`);
      return;
    }

    setIsBulkDeleting(true);

    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'bulk_delete_users', user_ids: ids },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      toast.error(`Bulk delete failed: ${error.message}`);
    } else if (data?.error) {
      toast.error(`Bulk delete failed: ${data.error}`);
    } else {
      const successIds = new Set<string>((data?.results || []).filter((r: any) => r.success).map((r: any) => r.id));
      successIds.forEach(id => deletedIdsRef.current.add(id));
      setUsers(prev => prev.filter(u => !successIds.has(u.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${data?.deleted || 0} users${data?.failed ? `, ${data.failed} failed` : ''}`);
      if (selectedUser && successIds.has(selectedUser.id)) setSelectedUser(null);
    }

    setIsBulkDeleting(false);
  }, [getAccessToken, selectedIds, selectedUser]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = filtered.filter(u => u.id !== user?.id).map(u => u.id);
    if (selectedIds.size >= selectableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  useEffect(() => {
    if (!isSubLoading && !isAdmin) {
      navigate('/', { replace: true });
      return;
    }
    if (!isSubLoading && isAdmin && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubLoading, isAdmin, navigate]);

  const handleRowClick = (user: AdminUser) => {
    setSelectedUser(user);
    fetchUserEvents(user.id);
  };

  const filtered = users;

  // --- Trial-model metrics ---
  // Trials Started = anyone who has a stripe subscription (started a trial)
  const trialsStarted = users.filter(u => u.stripe_subscription_id).length;
  // Trialing Active = currently trialing in Stripe
  const trialingActive = users.filter(u => u.billing_status === 'trialing').length;
  // Paid Subscribers = active after first invoice
  const paidSubscribers = users.filter(u => u.billing_status === 'active').length;
  // Trial Cancellations = canceled before ever paying
  const trialChurn = users.filter(u => u.billing_status === 'canceled' && !u.paid_at).length;
  // Paid Churn = canceled after paying
  const paidChurn = users.filter(u => u.billing_status === 'canceled' && !!u.paid_at).length;
  // Trial → Paid conversion rate
  const trialToPaidRate = trialsStarted > 0 ? ((paidSubscribers / trialsStarted) * 100).toFixed(1) : '0.0';
  // MRR
  const mrr = paidSubscribers * 19.99;

  const totalSearches = users.reduce((s, u) => s + u.search_count, 0);
  const totalMessages = users.reduce((s, u) => s + u.messages_sent_count, 0);

  // Walkthrough summary counts (computed from user data)
  const wtStarted = users.filter(u => getWalkthroughStatus(u) !== 'not_started').length;
  const wtCompleted = users.filter(u => getWalkthroughStatus(u) === 'completed').length;
  const wtSkipped = users.filter(u => getWalkthroughStatus(u) === 'skipped').length;
  const wtNotStarted = users.filter(u => getWalkthroughStatus(u) === 'not_started').length;
  const stepDropoffs = Array.from({ length: 8 }, (_, i) => {
    const atStep = users.filter(u => {
      const s = getWalkthroughStatus(u);
      return (s === 'in_progress') && u.walkthrough_max_step === i + 1;
    }).length;
    return atStep;
  });
  const topDropoffIdx = stepDropoffs.indexOf(Math.max(...stepDropoffs));
  const topDropoffStep = stepDropoffs[topDropoffIdx] > 0 ? topDropoffIdx + 1 : null;

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
          <Button variant="outline" size="sm" onClick={() => { deletedIdsRef.current.clear(); fetchUsers(); }} disabled={isLoading}>
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

        {/* Summary Cards - Acquisition Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Trials Started
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{trialsStarted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Checkout Attempts (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{checkoutAttempts24h}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-amber-500" /> Trialing
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{trialingActive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" /> Paid Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{paidSubscribers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" /> Trial→Paid
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{trialToPaidRate}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <PoundSterling className="h-3.5 w-3.5 text-emerald-500" /> MRR
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">£{mrr.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-500" /> Churn
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">{trialChurn + paidChurn}</p>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                <span>Trial: {trialChurn}</span>
                <span>Paid: {paidChurn}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue helper text */}
        <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Revenue only reflects successful payments after the 5-day trial period.
        </p>



        {/* Activity Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
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

        {/* Walkthrough Summary Row */}
        {users.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-card/50 px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <Footprints className="h-3.5 w-3.5 text-primary" /> Walkthrough:
            </span>
            <span>Started: <strong className="text-foreground">{wtStarted}</strong></span>
            <span>Completed: <strong className="text-foreground">{wtCompleted}</strong></span>
            <span>Skipped: <strong className="text-foreground">{wtSkipped}</strong></span>
            <span>Not Started: <strong className="text-foreground">{wtNotStarted}</strong></span>
            {topDropoffStep && (
              <span>Top Drop-off: <strong className="text-foreground">Step {topDropoffStep}</strong></span>
            )}
          </div>
        )}

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

        {/* Bulk Delete Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                  {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Delete Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} users?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{selectedIds.size}</strong> users and all their data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={bulkDeleteUsers}
                    disabled={isBulkDeleting}
                  >
                    {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        )}

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
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filtered.filter(u => u.id !== user?.id).length > 0 && selectedIds.size >= filtered.filter(u => u.id !== user?.id).length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Signed Up</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>WT Status</TableHead>
                      <TableHead>Current Step</TableHead>
                      <TableHead>Last WT Activity</TableHead>
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
                        <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((u) => (
                        <TableRow
                          key={u.id}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(u.id) ? 'bg-muted/30' : ''}`}
                          onClick={() => handleRowClick(u)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {u.id !== user?.id && (
                              <Checkbox
                                checked={selectedIds.has(u.id)}
                                onCheckedChange={() => toggleSelect(u.id)}
                              />
                            )}
                          </TableCell>
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
                          <TableCell>
                            <Badge variant="outline" className={walkthroughStatusColor(getWalkthroughStatus(u))}>
                              {walkthroughStatusLabel(getWalkthroughStatus(u))}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {walkthroughStepLabel(u)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {timeAgo(u.walkthrough_last_seen_at)}
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                onClick={(e) => { e.stopPropagation(); setUserToDelete(u); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

      {/* Single User Delete Dialog (state-driven, outside table loop) */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{userToDelete?.email}</strong> and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (userToDelete) {
                  deleteUser(userToDelete.id, userToDelete.email);
                  setUserToDelete(null);
                }
              }}
              disabled={isDeletingUser}
            >
              {isDeletingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                      <Badge variant="outline" className={`mt-1 ${walkthroughStatusColor(getWalkthroughStatus(selectedUser))}`}>
                        {walkthroughStatusLabel(getWalkthroughStatus(selectedUser))}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{walkthroughStepLabel(selectedUser)}</p>
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
