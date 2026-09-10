import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE OPERATOR'S AVATAR — on React Query since 2026-09-10.

   Small, but it rendered in the sidebar, so it re-read the profiles row on EVERY page the
   operator opened. Now it is fetched once and held for the app-wide five minutes.

   ⛔ THE UPLOAD IS THE MUTATION, AND ITS CACHE WRITE IS THE POINT (CLAUDE.md §6c: the mutation
   risk is the work, so every mutation must prove it refreshes what it changed). It writes the
   new URL into the cache directly rather than invalidating: the public URL is already known at
   that moment, so re-reading the row to learn what we just wrote would put a network round trip
   between the operator and their own new picture.
   ⚠️ IT ALSO INVALIDATES AFTER THE DIRECT WRITE. The direct write is for the instant swap; the
   invalidate is what makes the next read authoritative if the update failed server-side. Doing
   only the optimistic half is how a UI ends up showing something the database never accepted.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function useAvatar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  const queryKey = useMemo(() => ['avatar', user?.id ?? null] as const, [user?.id]);

  /* ⚠️ THE AUTH-METADATA FALLBACK MOVED INSIDE THE QUERY. It used to be a second effect that
     wrote metadata into state whenever the profiles row had not answered yet, which raced the
     fetch: whichever finished last won, and on a slow read the stale metadata URL could land
     after the fresh row. Here the row wins by construction, and metadata is only consulted when
     the row genuinely has nothing. */
  const metaUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null;

  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data?.avatar_url ?? null;
    },
  });

  const avatarUrl = query.data ?? metaUrl;

  const uploadAvatar = useCallback(async (file: File) => {
    if (!user?.id) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;

      // Upload file (upsert to replace existing)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      /* ⚠️ The cache-buster is load-bearing: the storage path is stable (avatar.<ext>, upserted),
         so without it the browser keeps showing the previous image from cache and the upload
         looks like it silently failed. */
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Persist to the team-readable profiles row (own-row RLS allows this) so
      // teammates see the avatar, and mirror into auth metadata for the session.
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);
      await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      /* THE MUTATION'S CACHE WRITE — the new picture appears with no round trip… */
      queryClient.setQueryData<string | null>(queryKey, publicUrl);
      /* …and then the authoritative re-read, so a server-side rejection cannot leave the screen
         showing an avatar the database does not have. */
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      console.error('Avatar upload failed:', err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, queryClient, queryKey]);

  return { avatarUrl, uploadAvatar, isUploading };
}
