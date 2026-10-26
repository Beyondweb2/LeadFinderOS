/* The signed-in person's own chosen message name (profiles.message_name), for signing the hook in the Inbox
   (src/lib/hookSignature.ts). null = none chosen (never the email fallback). Refreshed when the name box saves. */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { hookSignatureName } from '@/lib/hookSignature';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const MY_MESSAGE_NAME_KEY = ['my-message-name'] as const;

export function useMyMessageName() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: [...MY_MESSAGE_NAME_KEY, uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.from('profiles').select('message_name').eq('user_id', uid).maybeSingle();
      if (error) throw new Error(error.message);
      return hookSignatureName((data?.message_name as string | null) ?? null);
    },
  });
}
