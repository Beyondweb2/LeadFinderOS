import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { NOTIFICATIONS_KEY } from '@/hooks/useNotifications';
import { notifyLeadChanged } from '@/lib/leadSync';
import type { BoardItem, TaskStatus, TeamPostKind, TeamPriority } from '@/lib/teamBoard';

/* The Sales Team Board's reads and writes (2026-10-01, docs/sales-team-board.md). Every call is a
   database function that checks the caller itself; the browser never writes a board table.
   Live: the board refetches when a team / assignment notification arrives (useNotifications), plus a
   slow poll and on focus — no second realtime channel. */

// Not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const TEAM_BOARD_KEY = (uid: string | undefined) => ['team-board', 'mine', uid ?? null] as const;
export const TEAM_ADMIN_KEY = ['team-board', 'admin'] as const;

export interface RpcOut { ok?: boolean; error?: string; id?: string; duplicate?: boolean; unchanged?: boolean; recipients?: number; notified?: number | boolean; task?: boolean; task_id?: string; status?: string; cancelled?: number }

async function call(fn: string, args: Record<string, unknown>): Promise<RpcOut> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: String(error.message ?? error) };
  return (data ?? { ok: false, error: 'empty_response' }) as RpcOut;
}

export function useMyTeamBoard(enabled = true) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = TEAM_BOARD_KEY(user?.id);
  const q = useQuery({
    queryKey: key, enabled: enabled && !!user?.id, staleTime: 30_000, refetchInterval: 120_000, refetchOnWindowFocus: true,
    queryFn: async (): Promise<BoardItem[]> => {
      const { data, error } = await sb.rpc('team_board_mine');
      if (error) throw error;
      return (data ?? []) as BoardItem[];
    },
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => { const { error } = await sb.rpc('team_board_mark_read', { _ids: ids }); if (error) throw error; },
    onMutate: (ids) => {
      const now = new Date().toISOString();
      qc.setQueryData<BoardItem[]>(key, (prev) => (prev ?? []).map((i) => (ids.includes(i.id) ? { ...i, read_at: i.read_at ?? now } : i)));
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY(user?.id) }); },
  });
  /* ⛔ The status is shown only once the server said yes (no optimistic "Completed" that did not happen). */
  const setStatus = useMutation({
    mutationFn: async (a: { id: string; status: Exclude<TaskStatus, 'cancelled'> }) => call('team_task_set_status', { _id: a.id, _status: a.status }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }); },
  });
  return { ...q, items: q.data ?? [], markRead, setStatus };
}

export interface AdminPost {
  id: string; kind: TeamPostKind; title: string; body: string | null; details: Record<string, unknown>; link: string | null;
  status: 'draft' | 'published' | 'discarded'; due_date: string | null; priority: TeamPriority | null;
  created_at: string; published_at: string | null; edited_at: string | null; edit_count: number;
  audience: 'selected' | 'everyone'; recipient_ids: string[]; follow_up_of: string | null;
  lead: { id: string; name: string | null; owner: string | null; next_action?: string | null; next_action_date?: string | null } | null;
  recipients: { user_id: string; name: string; read_at: string | null; task_status: TaskStatus | null; status_at: string | null; completed_at: string | null; cancelled_reason: string | null }[];
}

export interface SavePostInput {
  id?: string | null; kind: Exclude<TeamPostKind, 'lead_assignment'>; title: string; body?: string | null;
  details?: Record<string, unknown>; link?: string | null; leadId?: string | null; due?: string | null; priority?: TeamPriority | null;
  audience: 'selected' | 'everyone'; recipients: string[]; publish: boolean; clientKey: string; followUpOf?: string | null;
}

export function useTeamBoardAdmin(enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: TEAM_ADMIN_KEY, enabled, staleTime: 30_000, refetchInterval: 120_000, refetchOnWindowFocus: true,
    queryFn: async (): Promise<AdminPost[]> => {
      const { data, error } = await sb.rpc('team_board_admin', { _days: 60 });
      if (error) throw error;
      return (data ?? []) as AdminPost[];
    },
  });
  const done = () => { void qc.invalidateQueries({ queryKey: TEAM_ADMIN_KEY }); };
  const save = useMutation({
    mutationFn: (p: SavePostInput) => call('team_save_post', {
      _id: p.id ?? null, _kind: p.kind, _title: p.title, _body: p.body ?? null, _details: p.details ?? {}, _link: p.link ?? null,
      _lead_id: p.leadId ?? null, _due: p.due ?? null, _priority: p.priority ?? null, _audience: p.audience,
      _recipients: p.recipients, _publish: p.publish, _client_key: p.clientKey, _follow_up_of: p.followUpOf ?? null,
    }),
    onSettled: done,
  });
  const edit = useMutation({
    mutationFn: (p: { id: string; title: string; body: string | null; due: string | null; priority: TeamPriority | null }) =>
      call('team_edit_published', { _id: p.id, _title: p.title, _body: p.body, _due: p.due, _priority: p.priority }),
    onSettled: done,
  });
  const cancel = useMutation({ mutationFn: (p: { id: string; userId?: string | null }) => call('team_cancel_task', { _id: p.id, _user: p.userId ?? null }), onSettled: done });
  const discard = useMutation({ mutationFn: (id: string) => call('team_discard_draft', { _id: id }), onSettled: done });
  return { ...q, posts: q.data ?? [], save, edit, cancel, discard };
}

/** THE single-lead assignment (admin): assign_lead + the brief + one board task. Used by the Admin
 *  dashboard's Assign, the composer's Lead assignment and the Inbox / popup owner picker. */
export function useAssignLeadWithBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { leadId: string; to: string | null; note?: string | null; due?: string | null; reason?: string | null; clientKey?: string | null }) =>
      call('assign_lead_with_brief', { _lead_id: a.leadId, _to_user_id: a.to, _note: a.note ?? null, _due: a.due ?? null, _reason: a.reason ?? null, _client_key: a.clientKey ?? null }),
    onSuccess: (r, a) => {
      if (!r.ok) return;
      notifyLeadChanged(a.leadId);
      void qc.invalidateQueries({ queryKey: ['sales', 'owner', a.leadId] });
      void qc.invalidateQueries({ queryKey: TEAM_ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
}

/** A fresh idempotency key per composer open (a double-click or a retry sends the same key). */
export function newClientKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The admin's lead search for the composer (name contains …, the 10 newest). Admin reads the book. */
export function useLeadSearch(term: string, enabled: boolean) {
  const t = term.trim();
  return useQuery({
    queryKey: ['team-board', 'lead-search', t], enabled: enabled && t.length >= 2, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.from('outreach_leads').select('id, business_name, assigned_to_user_id, next_action, next_action_date, status, is_archived')
        .ilike('business_name', `%${t.replace(/[%_]/g, '')}%`).order('updated_at', { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; business_name: string | null; assigned_to_user_id: string | null; next_action?: string | null; next_action_date?: string | null; status: string | null; is_archived: boolean | null }[];
    },
  });
}

/** One lead's owner + Next Action (admin), for the Assign dialog. */
export function useLeadBrief(leadId: string | null) {
  return useQuery({
    queryKey: ['team-board', 'lead', leadId], enabled: !!leadId, staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await sb.from('outreach_leads').select('id, business_name, assigned_to_user_id, next_action, next_action_date, next_action_note, status, amount_paid')
        .eq('id', leadId).maybeSingle();
      if (error) throw error;
      return data as { id: string; business_name: string | null; assigned_to_user_id: string | null; next_action?: string | null; next_action_date?: string | null; next_action_note: string | null; status: string | null; amount_paid: number | null } | null;
    },
  });
}


/** Every active salesperson, each marked test or not (admin) — the composer's recipient list. */
export function useRecipientsPreview(enabled: boolean) {
  return useQuery({
    queryKey: ['team-board', 'recipients'], enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('team_recipients_preview');
      if (error) throw error;
      return (data ?? []) as { user_id: string; name: string; test: boolean }[];
    },
  });
}
