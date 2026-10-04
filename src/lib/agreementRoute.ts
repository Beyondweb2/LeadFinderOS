/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHICH ROUTE AN AGREEMENT IS ON, AND WHEN IT MAY NO LONGER CHANGE (pre-sales fix 03, 2026-10-04;
   M-021 / B-11).

   🔴 WHY. Paul's Build / Optimise toggle on the client page could flip a client's agreement link to the
   other route AFTER they had paid and ticked the agreement at checkout — proved live: a Build client
   (12 payments, checkout acceptance on Build) was switched to Optimise with a 200, and the public agree
   page then asked them to sign a 6-payment agreement against a 12-payment card schedule. Only an
   agree-page signature locked it.
   ⛔ WHAT THE CLIENT PAID ON OUTRANKS A LINK. Three records can name a route: the checkout's stamp
   (outreach_leads.contract_total_payments, immutable by trigger), any agreement acceptance (write-once,
   checkout or agree page), and the link Paul sets. The agreement shown is the CONTRACT's route when one
   is stamped; the link's route only fills in for a client paid before routes existed.
   ⛔ THE ROUTE LOCKS AT THE FIRST BINDING FACT: a stamped contract OR any acceptance. After that the
   only route the link may be set to is that same route. Correcting a genuinely wrong route is not a
   button: Stripe's schedule and the immutable contract stamp must be corrected first, by Paul with a
   session, then the link — so the refusal names that step.
   Pure, no imports beyond the offer constants. ⚠️ Edge-reachable (paid-client-hub, client-agreement).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { serviceRouteForTotal, type ServiceRoute } from './findableOffer.ts';

const asRoute = (v: unknown): ServiceRoute | null => (v === 'build' || v === 'optimise' ? v : null);
const NAME: Record<ServiceRoute, string> = { build: 'Build', optimise: 'Optimise' };

/** The route the agreement page shows: the contract's when stamped, else the link's, else none. */
export function resolveAgreementRoute(linkRoute: unknown, contractTotalPayments: unknown): ServiceRoute | null {
  return serviceRouteForTotal(contractTotalPayments) ?? asRoute(linkRoute);
}

export interface RouteLock {
  locked: boolean;
  /** The route it is locked to (null when not locked, or when the binding records disagree). */
  route: ServiceRoute | null;
  /** Plain words for Paul: why it cannot change, and what correcting it would take. */
  reason: string | null;
}

/** Is the agreement route locked, and to what? */
export function agreementRouteLock(input: {
  contractTotalPayments: unknown;
  acceptances: ReadonlyArray<{ method?: string | null; service_route?: string | null }>;
}): RouteLock {
  const contract = serviceRouteForTotal(input.contractTotalPayments);
  const accepted = input.acceptances.map((a) => asRoute(a.service_route)).filter((r): r is ServiceRoute => !!r);
  if (!contract && accepted.length === 0) return { locked: false, route: null, reason: null };
  const all = new Set<ServiceRoute>([...(contract ? [contract] : []), ...accepted]);
  const route = all.size === 1 ? [...all][0] : null;
  const what = contract && accepted.length ? 'paid and accepted the agreement' : contract ? 'paid at checkout' : 'accepted the agreement';
  return {
    locked: true,
    route,
    reason: route
      ? `They ${what} on ${NAME[route]}, so the route is fixed. Correcting it means changing the Stripe payment schedule and the recorded contract first — ask for a route correction rather than switching it here.`
      : 'The payment and the signed agreement name different routes. Nothing can be switched here — the Stripe schedule, the contract and the agreement need correcting together.',
  };
}

/** May the link be set to `requested`? Refused once locked, unless it is the locked route itself. */
export function maySetAgreementRoute(lock: RouteLock, requested: unknown): { ok: true } | { ok: false; reason: string } {
  const r = asRoute(requested);
  if (!r) return { ok: false, reason: 'Choose Build or Optimise.' };
  if (!lock.locked) return { ok: true };
  if (lock.route === r) return { ok: true };
  return { ok: false, reason: lock.reason ?? 'The route is fixed.' };
}
