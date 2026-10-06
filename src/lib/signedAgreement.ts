/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIGNED AGREEMENT, AS ONE RECORD — what Paid Clients and the welcome pack both show
   (client sign-up redesign, 2026-10-07; docs/pre-sales-certification/client-signup-agreement-flow.md).

   ⛔ ONE RULE, TWO READERS. The Paid Client page (paid-client-hub agreement_status) and the welcome pack
      (_shared/welcome-pack-render.ts) both fold the client's acceptance rows and their v3 terms row through
      this function, so the two can never say different things about the same signature.
   ⛔ NOTHING IS TYPED BY HAND. Name, date, version, plan and the linked payment all come from the stored
      evidence: client_agreement_acceptances (write-once) and client_service_terms (written by stripe-webhook
      on the authoritative payment, carrying the agreement_acceptance_id the checkout rested on).
   ⛔ "LINKED TO THE PAYMENT" IS POSITIVE ONLY: the terms row must name THIS acceptance's id. A terms row
      that names another acceptance, or none, is not a link — absence is never read as a yes.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from edge functions.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { SERVICE_ROUTE_NAME, isServiceRoute, type ServiceRoute } from './findableOffer.ts';

export interface AcceptanceLite {
  id?: string | null;
  method: string;
  accepted_at: string;
  typed_name?: string | null;
  typed_role?: string | null;
  email?: string | null;
  agreement_version: string;
  service_route?: string | null;
}
export interface TermsLite {
  agreement_acceptance_id?: string | null;
  initial_paid_at?: string | null;
  service_route?: string | null;
}

export interface SignedAgreementRecord {
  /** signed = an agreement-page signature; checkout = only the older checkout tick; none = nothing. */
  status: 'signed' | 'checkout' | 'none';
  acceptanceId: string | null;
  signedAtIso: string | null;
  signedBy: string | null;
  role: string | null;
  email: string | null;
  version: string | null;
  route: ServiceRoute | null;
  planName: string | null;
  /** The payment this signature was taken on (client_service_terms names this acceptance). */
  linkedToPayment: boolean;
  initialPaidAtIso: string | null;
}

const newestFirst = (a: AcceptanceLite, b: AcceptanceLite) => String(b.accepted_at).localeCompare(String(a.accepted_at));

export function signedAgreementRecord(acceptances: readonly AcceptanceLite[] | null | undefined, terms: TermsLite | null | undefined): SignedAgreementRecord {
  const rows = [...(acceptances ?? [])].filter((r) => r && r.accepted_at).sort(newestFirst);
  /* The signature the payment rested on wins; else the newest agreement-page signature; else a checkout tick. */
  const linked = terms?.agreement_acceptance_id ? rows.find((r) => r.id && r.id === terms.agreement_acceptance_id) ?? null : null;
  const page = rows.find((r) => r.method === 'agree_page') ?? null;
  const chk = rows.find((r) => r.method === 'checkout') ?? null;
  const pick = linked ?? page ?? chk;
  if (!pick) {
    return { status: 'none', acceptanceId: null, signedAtIso: null, signedBy: null, role: null, email: null, version: null, route: null, planName: null, linkedToPayment: false, initialPaidAtIso: null };
  }
  const route = isServiceRoute(pick.service_route) ? pick.service_route : null;
  const isLinked = !!(linked && pick === linked);
  return {
    status: pick.method === 'agree_page' ? 'signed' : 'checkout',
    acceptanceId: pick.id ?? null,
    signedAtIso: pick.accepted_at,
    signedBy: (pick.typed_name ?? '').trim() || null,
    role: (pick.typed_role ?? '').trim() || null,
    email: (pick.email ?? '').trim() || null,
    version: pick.agreement_version || null,
    route,
    planName: route ? SERVICE_ROUTE_NAME[route] : null,
    linkedToPayment: isLinked,
    initialPaidAtIso: isLinked ? (terms?.initial_paid_at ?? null) : null,
  };
}

/** UK calendar day, e.g. "7 October 2026" — a stored timestamp shown as the day it was in the UK. */
export function ukDay(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}
