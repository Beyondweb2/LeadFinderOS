import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Site-ownership, computed ONCE per session and shared.
 *
 * A "barber" is simply a user who owns at least one generated_sites row
 * (owner_id = their uid). Both OwnerRedirect and SubscriptionGate need this to
 * divert barbers to /barber before any LeadFinder customer chrome / subscribe
 * wall — putting it in one provider avoids re-querying on every customer page.
 *
 * Defensive: if owner_id doesn't exist yet (migration not applied) the query
 * errors and we report "not an owner", so this can never break login for
 * existing customers.
 */
type OwnerState = { loading: boolean; isOwner: boolean; siteId: string | null };

const OwnerContext = createContext<OwnerState>({ loading: true, isOwner: false, siteId: null });

export function OwnerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<OwnerState>({ loading: true, isOwner: false, siteId: null });

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
        setState({
          loading: false,
          isOwner: !!data,
          siteId: (data as { id?: string } | null)?.id ?? null,
        });
      } catch {
        if (!cancelled) setState({ loading: false, isOwner: false, siteId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return <OwnerContext.Provider value={state}>{children}</OwnerContext.Provider>;
}

export function useOwner() {
  return useContext(OwnerContext);
}
