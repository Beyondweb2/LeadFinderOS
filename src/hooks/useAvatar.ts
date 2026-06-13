import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAvatar() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchAvatar = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.avatar_url) setAvatarUrl(data.avatar_url);
  }, [user?.id]);

  useEffect(() => {
    fetchAvatar();
  }, [fetchAvatar]);

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

      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [user?.id]);

  // Also check user metadata for avatar
  useEffect(() => {
    if (user?.user_metadata?.avatar_url && !avatarUrl) {
      setAvatarUrl(user.user_metadata.avatar_url);
    }
  }, [user?.user_metadata?.avatar_url, avatarUrl]);

  return { avatarUrl, uploadAvatar, isUploading };
}
