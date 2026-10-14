import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parsePriceModel, type PriceModel } from '@/lib/priceModel';

/* THE SIGNED-IN PERSON'S PRICE MODEL (2026-10-14; src/lib/priceModel.ts is the rule). Read from the server
   (my_price_model: own choice → team default → standard) and switched with one click (set_my_price_model; the admin's
   team default through set_default_price_model). Unreadable → 'standard', today's offer. */

export const PRICE_MODEL_KEY = ['price-model'] as const;

export interface PriceModelState { model: PriceModel; own: PriceModel | null; teamDefault: PriceModel; isAdmin: boolean }

const rpc = supabase.rpc as unknown as (n: string, a?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;

export function usePriceModel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: PRICE_MODEL_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<PriceModelState> => {
      const { data, error } = await rpc('my_price_model');
      if (error) throw new Error(error.message ?? 'not_loaded');
      const d = (data ?? {}) as Record<string, unknown>;
      return {
        model: parsePriceModel(d.model),
        own: d.own === 'standard' || d.own === 'upfront_499' ? d.own : null,
        teamDefault: parsePriceModel(d.team_default),
        isAdmin: d.is_admin === true,
      };
    },
  });
  const setMine = useMutation({
    mutationFn: async (model: PriceModel | null) => {
      const { data, error } = await rpc('set_my_price_model', { _model: model });
      if (error) throw new Error(error.message ?? 'failed');
      if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error(String((data as { error?: string } | null)?.error ?? 'refused'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICE_MODEL_KEY }),
  });
  const setDefault = useMutation({
    mutationFn: async (model: PriceModel) => {
      const { data, error } = await rpc('set_default_price_model', { _model: model });
      if (error) throw new Error(error.message ?? 'failed');
      if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error(String((data as { error?: string } | null)?.error ?? 'refused'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRICE_MODEL_KEY }),
  });
  return { ...q, model: q.data?.model ?? 'standard' as PriceModel, setMine, setDefault };
}
