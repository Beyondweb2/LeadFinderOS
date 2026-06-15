import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isStripeConfigured } from '@/config/stripe';

type CheckoutResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'no_url' | 'error' };

/**
 * Barber payments checkout for the Barber Pro tier — SCAFFOLD (inactive).
 *
 * `enabled` reflects whether Stripe is configured (VITE_STRIPE_PUBLISHABLE_KEY).
 * While it's false, `startCheckout` no-ops and never hits the backend, so the
 * flow is present in code but not callable/live. Once keys are added (client
 * publishable key here + STRIPE_SECRET_KEY on the create-barber-checkout edge
 * function), this opens a Stripe Checkout session and redirects to it.
 */
export function useBarberCheckout() {
  const [loading, setLoading] = useState(false);
  const enabled = isStripeConfigured();

  const startCheckout = useCallback(
    async (opts?: { generatedSiteId?: string | null }): Promise<CheckoutResult> => {
      if (!enabled) {
        console.warn('[useBarberCheckout] Stripe is not configured — barber payments are inactive.');
        return { ok: false, reason: 'not_configured' };
      }
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('create-barber-checkout', {
          body: { generated_site_id: opts?.generatedSiteId ?? null },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        if (error) throw error;
        if (data?.url) {
          window.location.href = data.url as string;
          return { ok: true };
        }
        return { ok: false, reason: 'no_url' };
      } catch (e) {
        console.error('[useBarberCheckout] checkout failed:', e);
        return { ok: false, reason: 'error' };
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  return { startCheckout, loading, enabled };
}
