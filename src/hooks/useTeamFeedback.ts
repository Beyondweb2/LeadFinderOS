import { useCallback, useEffect, useState } from 'react';
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
export function useTeamFeedback() {
  const { user } = useAuth();
  const [items, setItems] = useState<TeamFeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await sb
      .from('team_feedback')
      .select('id, user_id, author_name, author_email, message, created_at')
      .order('created_at', { ascending: false });
    if (!error) setItems((data ?? []) as TeamFeedbackItem[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

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
    await fetchItems();
    return {};
  }, [user, fetchItems]);

  const remove = useCallback(async (id: string): Promise<{ error?: string }> => {
    const { error } = await sb.from('team_feedback').delete().eq('id', id);
    if (error) return { error: error.message };
    setItems((prev) => prev.filter((i) => i.id !== id));
    return {};
  }, []);

  return { items, isLoading, submit, remove, refetch: fetchItems };
}
