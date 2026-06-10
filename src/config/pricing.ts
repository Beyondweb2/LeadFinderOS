/**
 * Single source of truth for the barber paid tier.
 *
 * Change BARBER_PRO_PRICE_GBP in this one spot and every surface that shows the
 * price (claim page today; the booking upsell later) updates. This is DISPLAY
 * COPY ONLY for now — booking, SMS reminders and Stripe are a later phase, so
 * nothing here charges anyone. When real billing is added, this value should
 * drive (or be reconciled with) the Stripe price too.
 *
 * The free website needs no config — it's free. This only describes the paid
 * add-on (online booking + no-show SMS reminders).
 */

/** The ONE value to edit when testing price points with barbers. */
export const BARBER_PRO_PRICE_GBP = 19.99;

/** Billing interval shown next to the price. */
export const BARBER_PRO_INTERVAL = "month";

/** Derived label, e.g. "£19.99/month". Never hardcode this elsewhere. */
export const barberProPriceLabel = `£${BARBER_PRO_PRICE_GBP.toFixed(2)}/${BARBER_PRO_INTERVAL}`;

/** What the paid tier unlocks — display only (not yet built). */
export const BARBER_PRO_FEATURES = ["online booking", "no-show SMS reminders"] as const;
