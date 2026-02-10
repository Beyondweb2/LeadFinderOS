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
      .from('user_trials')
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

      // Save to user_trials via edge function since RLS denies direct updates
      // For now, we update via a workaround: use the ensure-trial function pattern
      // Actually user_trials has deny update RLS, so we need an edge function
      // Let's use auth.updateUser metadata instead
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
