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
  Loader2,
  Search,
  Activity,
  Image as ImageIcon,
  Globe,
  MessageSquare,
  Building2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  search_count: number;
  businesses_added_count: number;
  messages_sent_count: number;
  replies_count: number;
  sites_sent_count?: number;
  sites_claimed_count?: number;
  sites_upsell_count?: number;
  last_active_at: string | null;
  last_search_at: string | null;
}

interface UsageEvent {
  id: string;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
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

/**
 * Dashboard ADMIN zone — rendered ONLY for admins (role-based
 * useSubscription().isAdmin). This is the former standalone AdminDashboard's
 * genuinely-admin content (user-management table, delete / bulk-delete,
 * usage_events drawer) folded into the dashboard page, minus the full-page
 * chrome. It still calls the `admin-users` edge function, which keeps its own
 * server-side admin gate — the client-side gate is convenience only. The
 * separate API Usage / Sites / Site Images pages stay as their own routes and
 * are linked out from here.
 */
export function AdminZone() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isLoading: isSubLoading } = useSubscription();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userEvents, setUserEvents] = useState<UsageEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const hasFetchedRef = useRef(false);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
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
    if (activityFilter === '7d') filterBody.active_days = 7;
    else if (activityFilter === '30d') filterBody.active_days = 30;

    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: filterBody,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        const errMsg = error.message || 'Unknown error';
        console.error('[AdminZone] Invoke error:', errMsg);
        setFetchError(errMsg);
        toast.error(`Admin fetch failed: ${errMsg}`);
      } else if (data?.error) {
        console.error('[AdminZone] Server error:', data.error, data.details);
        setFetchError(`${data.error}${data.details ? ': ' + data.details : ''}`);
        toast.error(`Server error: ${data.error}`);
      } else {
        const userList = (data?.users || []) as AdminUser[];
        const merged = userList
          .filter((u: AdminUser) => !deletedIdsRef.current.has(u.id))
          .sort(
            (a: AdminUser, b: AdminUser) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        setUsers(merged);
        if (merged.length === 0 && !searchQuery) {
          toast.info('No users returned. Check edge function logs for details.');
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      console.error('[AdminZone] Exception:', errMsg);
      setFetchError(errMsg);
      toast.error(`Unexpected error: ${errMsg}`);
    }

    setIsLoading(false);
  }, [getAccessToken, searchQuery, activityFilter]);

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
      deletedIdsRef.current.add(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      if (selectedUser?.id === userId) setSelectedUser(null);
    }

    setIsDeletingUser(false);
  }, [getAccessToken, selectedUser]);

  const bulkDeleteUsers = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setSelectedIds(new Set());
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

  // Only fetch once, and only for admins (this zone isn't even rendered otherwise).
  useEffect(() => {
    if (!isSubLoading && isAdmin && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubLoading, isAdmin]);

  const handleRowClick = (u: AdminUser) => {
    setSelectedUser(u);
    fetchUserEvents(u.id);
  };

  const filtered = users;

  const totalSearches = users.reduce((s, u) => s + u.search_count, 0);
  const totalMessages = users.reduce((s, u) => s + u.messages_sent_count, 0);

  // Defensive client gate — server-side gate on admin-users is the real one.
  if (isSubLoading || !isAdmin) return null;

  return (
    <div className="space-y-4">
      {/* Controls row: user count + links out to the still-separate admin pages */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">{users.length} users total</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/api-usage')}>
            <Activity className="h-4 w-4 mr-2" />
            API Usage
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/sites')}>
            <Globe className="h-4 w-4 mr-2" />
            Sites
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/site-images')}>
            <ImageIcon className="h-4 w-4 mr-2" />
            Site Images
          </Button>
          <Button variant="outline" size="sm" onClick={() => { deletedIdsRef.current.clear(); fetchUsers(); }} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400 font-medium">Error loading users</p>
          <p className="text-xs text-red-400/80 mt-1">{fetchError}</p>
        </div>
      )}

      {/* Activity Cards */}
      <div className="grid grid-cols-2 gap-4">
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
                    <TableHead className="text-right">Searches</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Sites Sent</TableHead>
                    <TableHead className="text-right">Claimed</TableHead>
                    <TableHead className="text-right">Upsell</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Last Search</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
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
                        <TableCell className="text-right tabular-nums">{u.search_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.businesses_added_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.messages_sent_count ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.replies_count ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.sites_sent_count ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.sites_claimed_count ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.sites_upsell_count ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {timeAgo(u.last_active_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {timeAgo(u.last_search_at)}
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
                {/* Status */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Status</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="text-sm font-medium mt-1">{formatDate(selectedUser.created_at)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Last Active</p>
                      <p className="text-sm font-medium mt-1">{timeAgo(selectedUser.last_active_at)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3 col-span-2">
                      <p className="text-xs text-muted-foreground">Last Search</p>
                      <p className="text-sm font-medium mt-1">{timeAgo(selectedUser.last_search_at)}</p>
                    </div>
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
