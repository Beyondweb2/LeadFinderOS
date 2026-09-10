import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TeamFeedbackItem {
  id: string;
  user_id: string;
  author_name: string | null;
  author_email: string | null;
  message: string;
  created_at: string;
}

// team_feedback isn't in the generated types yet — RLS still enforces access
// (operators insert/select, admin delete).
const sb = supabase as unknown as {
  from: (t: string) => any;
};

/**
 * Internal team feedback board. Any operator can post + read the whole team's
 * feedback (RLS excludes barbers); only admin can delete. author_name/email are
 * denormalised from the logged-in user's profile at insert time.
 */
/** Stable empty — a fresh array per render re-runs every consumer's memo. */
const EMPTY: TeamFeedbackItem[] = [];

export function useTeamFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  /* ⛔ NOT KEYED BY USER, and that is correct here rather than an oversight: this is a TEAM
     board — every operator reads the whole team's posts, and RLS is what scopes it. Keying by
     user id would give each account its own cache of the same shared list. */
  const queryKey = useMemo(() => ['team-feedback'] as const, []);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<TeamFeedbackItem[]> => {
      const { data, error } = await sb
        .from('team_feedback')
        .select('id, user_id, author_name, author_email, message, created_at')
        .order('created_at', { ascending: false });
      /* ⛔ THROWS INSTEAD OF SWALLOWING. The old version did `if (!error) setItems(...)` — on a
         failed read it kept whatever was there and reported nothing, so an empty board and a
         broken board looked identical. React Query keeps the last good list AND surfaces the
         error, which are different states and should read differently. */
      if (error) throw new Error(error.message);
      return (data ?? []) as TeamFeedbackItem[];
    },
  });

  const items = query.data ?? EMPTY;
  const isLoading = query.isPending;

  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  const submit = useCallback(async (message: string): Promise<{ error?: string }> => {
    const trimmed = message.trim();
    if (!trimmed) return { error: 'empty' };
    if (!user) return { error: 'Not signed in.' };
    // Denormalise the author from the logged-in user's profile/metadata (mirrors the
    // handle_new_user trigger's precedence), falling back to the email local-part.
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const author_name =
      meta.display_name || meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : null);
    const { error } = await sb.from('team_feedback').insert({
      user_id: user.id,
      author_name,
      author_email: user.email ?? null,
      message: trimmed,
    });
    if (error) return { error: error.message };
    /* ⛔ AWAITED. The caller clears the textarea when this resolves, so an un-awaited refresh
       would blank the box while the board still showed the previous posts — it reads as the
       message having been lost. The insert is not echoed into the cache optimistically because
       the row's id and created_at are assigned by the database, and the board is ordered by
       created_at: a guessed row would sort wrong and then jump. */
    await queryClient.invalidateQueries({ queryKey });
    return {};
  }, [user, queryClient, queryKey]);

  const remove = useCallback(async (id: string): Promise<{ error?: string }> => {
    const { error } = await sb.from('team_feedback').delete().eq('id', id);
    if (error) return { error: error.message };
    /* Removal IS echoed directly: the row is identified by an id we already hold, so there is
       nothing to guess, and the post disappearing instantly is what a delete should feel like.
       The invalidate behind it keeps the next read authoritative. */
    queryClient.setQueryData<TeamFeedbackItem[]>(queryKey, (prev) => (prev ?? EMPTY).filter((i) => i.id !== id));
    await queryClient.invalidateQueries({ queryKey });
    return {};
  }, [queryClient, queryKey]);

  return { items, isLoading, submit, remove, refetch };
}
