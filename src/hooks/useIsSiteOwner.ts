import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Is the current user a barber/site owner (owns at least one generated_sites row)?
 *
 * Defensive: if owner_id doesn't exist yet (migration not applied) the query
 * errors and we report "not an owner" — so deploying the routing before the
 * migration can never break login for existing customers.
 */
export function useIsSiteOwner() {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; isOwner: boolean; siteId: string | null }>({
    loading: true,
    isOwner: false,
    siteId: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setState({ loading: false, isOwner: false, siteId: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const { data, error } = await supabase
          .from("generated_sites")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setState({ loading: false, isOwner: false, siteId: null });
          return;
        }
        setState({ loading: false, isOwner: !!data, siteId: (data as { id?: string } | null)?.id ?? null });
      } catch {
        if (!cancelled) setState({ loading: false, isOwner: false, siteId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}
