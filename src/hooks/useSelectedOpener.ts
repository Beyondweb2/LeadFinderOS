import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveSelectedOpener } from '@/lib/openerVariant';

/* THE SELECTED INITIAL OPENER, as the server stores it (whatsapp_outreach_state.initial_opener_template,
   through process-whatsapp-queue's admin-gated 'status' / 'set_initial_opener_template').

   `selected` is:
     · the stored value (null = never stored → the default) once read;
     · UNDEFINED while loading, on a failed read, or for a non-admin — and getTemplateSendability /
       openerSendability refuse every opener on undefined. Fail closed: a picker never guesses.
   Reading it or changing it sends nothing ('status' and the setter both return before the drip). */
export const SELECTED_OPENER_KEY = ['selected-initial-opener'] as const;

export function useSelectedOpener() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: SELECTED_OPENER_KEY,
    queryFn: async (): Promise<string | null | undefined> => {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'status' } });
      if (error || !data?.ok || !('initialOpenerTemplate' in data)) return undefined;
      return (data.initialOpenerTemplate as string | null) ?? null;
    },
    staleTime: 60_000,
  });
  const set = useMutation({
    mutationFn: async (template: string) => {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'set_initial_opener_template', template } });
      if (error || !data?.ok) throw new Error(data?.detail ?? data?.error ?? error?.message ?? 'Could not change the initial outreach template');
      return data.initialOpenerTemplate as string;
    },
    onSuccess: (v) => qc.setQueryData(SELECTED_OPENER_KEY, v),
  });
  const selected = q.data;
  const resolved = selected === undefined ? null : resolveSelectedOpener(selected);
  return {
    /** Raw stored selection, or undefined when unknown — pass THIS to getTemplateSendability. */
    selected,
    /** The selected template when it is valid; null while unknown or unavailable. */
    template: resolved?.ok ? resolved.template : null,
    /** Why nothing is sendable as an opener right now, if so. */
    problem: q.isLoading ? null : selected === undefined ? 'Could not read the selected initial outreach template.' : resolved && !resolved.ok ? resolved.reason : null,
    loading: q.isLoading,
    setSelected: (t: string) => set.mutateAsync(t),
    saving: set.isPending,
  };
}
