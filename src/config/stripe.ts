/**
 * Stripe config for barber payments (the Barber Pro tier — see ./pricing.ts).
 *
 * INACTIVE BY DESIGN. All keys are read from environment variables and are
 * intentionally left UNSET, so the payment flow exists in code but cannot run
 * live until real keys are added later. Nothing here is hardcoded.
 *
 *   Client (this file):  VITE_STRIPE_PUBLISHABLE_KEY      (pk_...) — safe to ship
 *   Client (optional):   VITE_STRIPE_BARBER_PRO_PRICE_ID  (price_...)
 *   Server (edge fn):    STRIPE_SECRET_KEY                (sk_...) — NEVER in the
 *                        client; set as a Supabase function secret instead.
 *
 * While VITE_STRIPE_PUBLISHABLE_KEY is empty, `isStripeConfigured()` is false and
 * the checkout hook short-circuits without calling the backend.
 */
import { BARBER_PRO_PRICE_GBP, BARBER_PRO_INTERVAL } from './pricing';

export const STRIPE_PUBLISHABLE_KEY: string = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

/** Optional pre-created Stripe Price ID for the Barber Pro plan (else priced inline server-side). */
export const STRIPE_BARBER_PRO_PRICE_ID: string = import.meta.env.VITE_STRIPE_BARBER_PRO_PRICE_ID ?? '';

/**
 * True only once a real publishable key (pk_...) is present. Until then barber
 * payments are inactive and the UI should not offer a live "pay" action.
 */
export const isStripeConfigured = (): boolean => STRIPE_PUBLISHABLE_KEY.startsWith('pk_');

/** Plan summary, sourced from the single pricing source of truth. */
export const BARBER_PRO_PLAN = {
  priceGbp: BARBER_PRO_PRICE_GBP,
  interval: BARBER_PRO_INTERVAL,
} as const;
