/**
 * Permanent TEST barber fixture — a single, clearly-fake barber used to safely
 * exercise the /s/ share → colour/photo edit → claim flow WITHOUT touching any
 * real lead. These IDs are HARDCODED and shared by:
 *   - the seed SQL (supabase/manual-sql/test-barber-seed.sql)
 *   - the reset edge function (supabase/functions/reset-test-barber) — which is
 *     hard-locked to these exact IDs and refuses anything else
 *   - the Outreach row, which shows the one-click Reset button ONLY on this lead
 *
 * Never reuse these IDs for anything real. The share token is stable forever so
 * the /s/ link never changes across resets.
 */
export const TEST_BARBER_LEAD_ID = "7e57ba12-0000-4000-8000-000000000001";
export const TEST_BARBER_SITE_ID = "7e57ba12-0000-4000-8000-000000000002";
export const TEST_BARBER_SHARE_TOKEN = "test-barber-fixture";

/** True only for the one permanent test-barber lead (gates the Reset button). */
export function isTestBarberLead(id: string): boolean {
  return id === TEST_BARBER_LEAD_ID;
}
