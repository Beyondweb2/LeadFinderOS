/* ══ ATTRIBUTION REVIEW — what Paul sees before he decides (Team page, admin; 2026-10-05) ════════════════
   docs/pre-sales-certification/attribution-review-admin.md. Pure: the review rows from fn admin-users
   (attribution_reviews_list) in, plain sentences out. Nothing here decides anything — the candidates are the
   database's own list (public.sale_attribution_candidates, from the FROZEN evidence) and the resolver
   (public.resolve_sale_attribution_with_seller) makes every check again. */
import { CHECKLIST_LABELS, type ChecklistKey } from './salespersonOnboarding.ts';
import { CANDIDATE_SOURCE_LABEL, type CandidateSource } from './saleAttribution.ts';

export type ReviewReason = 'no_authorised_creator' | 'creator_not_authorised' | 'claimed_seller_mismatch' | 'conflicting_creators' | 'ambiguous_manual_payment';

export interface AttributionCandidate { user_id: string; name: string | null; sources: CandidateSource[] }
export interface AttributionPerson { user_id: string; name: string; status: string; role: string | null; is_book_owner: boolean }
export interface AttributionEvent {
  kind: 'opened' | 'confirmed' | 'not_credited'; seller_user_id: string | null; basis: 'evidence' | 'admin_override' | null;
  note: string | null; override_reason: string | null; actor_user_id: string | null; created_at: string;
}
interface LinkEvidence { creator?: string | null; role?: string | null; signup?: string | null; ready?: boolean | null; missing?: string[] | null; at?: string | null }
interface OwnerEvent { kind?: string; by?: string | null; data?: { from?: string | null; to?: string | null } | null; at?: string | null }
export interface ReviewEvidence {
  mode?: 'paid_signup' | 'paid_session' | 'manual' | null;
  paid_signup?: string | null;
  signup_creators?: string[] | null;
  creation?: { creator?: string | null; creator_ready?: boolean | null; creator_missing?: string[] | null; at?: string | null } | null;
  creator_evidence_seller?: string | null;
  owner_at_payment?: string | null;
  all_links?: LinkEvidence[] | null;
  owner_history?: OwnerEvent[] | null;
  claimed_seller_readiness?: string[] | null;
  decided_at?: string | null;
}
export interface AttributionReview {
  lead_id: string;
  business_name: string | null;
  claimed_seller_user_id: string | null;
  reason: ReviewReason;
  status: 'open' | 'confirmed' | 'not_credited';
  evidence: ReviewEvidence;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by?: string | null;
  resolved_seller_user_id?: string | null;
  resolution_basis?: 'evidence' | 'admin_override' | null;
  override_reason?: string | null;
  created_at: string;
  lead?: { amount_paid: number | null; payment_date: string | null; status: string | null; owner_now: string | null; sold_by_user_id: string | null; sold_at: string | null } | null;
  first_payment?: { amount_gbp: number; occurred_at: string } | null;
  /** Open reviews only: the database's evidence-backed list. */
  candidates?: AttributionCandidate[] | null;
  history?: AttributionEvent[];
}

/** Why the review opened, in Paul's words. */
export const REVIEW_REASON: Record<ReviewReason, string> = {
  no_authorised_creator: 'No sign-up link from an authorised salesperson is on record for this payment.',
  creator_not_authorised: 'The sign-up link was made by someone who was not Ready to Sell at the time.',
  claimed_seller_mismatch: 'The seller written with the payment does not match who created the sign-up link.',
  conflicting_creators: 'More than one person made the sign-up link this client paid through.',
  ambiguous_manual_payment: 'Marked paid by hand, and more than one sign-up is on record for this client.',
};

/** Errors from the resolver / admin-users, in plain English. */
export const ATTRIBUTION_ERRORS: Record<string, string> = {
  not_admin: 'Only an admin can resolve an attribution review.',
  no_open_review: 'This review has already been decided.',
  no_seller: 'Choose who sold it.',
  not_a_team_member: 'That person is not on the team.',
  override_reason_required: 'Choosing someone the evidence does not name needs a reason (at least 10 characters).',
  seller_not_allowed: 'Not credited cannot name a seller.',
  seller_already_stamped: 'A seller is already recorded on this sale.',
  too_long: 'Keep the note and reason under 500 characters.',
  bad_decision: 'Unknown decision.',
};

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '');
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Ready to Sell, in words: the server's missing keys at that moment. null = not known then. */
export function readinessText(ready: boolean | null | undefined, missing: readonly string[] | null | undefined): string {
  if (ready === true) return 'Ready to Sell';
  if (ready === null || ready === undefined) {
    if (missing && missing.length) return `not Ready to Sell — missing: ${missing.map(missingLabel).join(', ')}`;
    return 'readiness not recorded';
  }
  return missing && missing.length ? `not Ready to Sell — missing: ${missing.map(missingLabel).join(', ')}` : 'not Ready to Sell';
}
const missingLabel = (k: string) => (CHECKLIST_LABELS as Record<string, string>)[k as ChecklistKey]?.toLowerCase() ?? k.replace(/_/g, ' ');

export interface EvidenceView {
  why: string;
  payment: string;
  creators: string[];
  claimed: string;
  ownerAtPayment: string;
  ownerNow: string | null;
  ownerHistory: string[];
  links: string[];
}

/** Every fact the review froze, as sentences — nothing invented, an absent fact said as absent. */
export function evidenceView(r: AttributionReview, nameOf: (id: string | null | undefined) => string): EvidenceView {
  const e = r.evidence ?? {};
  const links = Array.isArray(e.all_links) ? e.all_links : [];
  const pay = r.first_payment ?? (r.lead?.amount_paid ? { amount_gbp: Number(r.lead.amount_paid), occurred_at: r.lead.payment_date ?? '' } : null);
  const how = e.mode === 'paid_signup' ? 'through the sign-up link the client signed'
    : e.mode === 'paid_session' ? 'through a checkout link made before the v3 sign-up'
    : e.mode === 'manual' ? 'marked paid by hand (no checkout on record)' : 'how it was paid is not recorded';
  const creatorIds = [...new Set([...(Array.isArray(e.signup_creators) ? e.signup_creators : []), ...(e.creator_evidence_seller ? [e.creator_evidence_seller] : [])])];
  const creators = creatorIds.map((id) => {
    const made = links.filter((l) => l.creator === id && (!e.paid_signup || l.signup === e.paid_signup));
    const ready = made.some((l) => l.ready === true || l.role === 'admin') ? true : made.some((l) => l.ready === false) ? false : null;
    const missing = made.find((l) => Array.isArray(l.missing) && l.missing.length)?.missing ?? null;
    const first = made.map((l) => l.at).filter(Boolean).sort()[0];
    return `${nameOf(id)}${first ? ` (made it ${day(first)})` : ''} — ${ready === true ? 'Ready to Sell at the time' : readinessText(ready, missing) + ' at the time'}`;
  });
  const claimedNow = Array.isArray(e.claimed_seller_readiness) ? (e.claimed_seller_readiness.length ? readinessText(false, e.claimed_seller_readiness) : 'Ready to Sell') : null;
  return {
    why: REVIEW_REASON[r.reason] ?? r.reason,
    payment: pay ? `${gbp(pay.amount_gbp)}${pay.occurred_at ? ` on ${day(pay.occurred_at)}` : ''}, ${how}. Real business revenue — no one's sales or commission until you decide.`
      : `No payment amount on record; ${how}.`,
    creators: creators.length ? creators
      : e.mode === 'manual' && links.length ? ['None tied to the payment — it was marked paid by hand. Every sign-up link made for this client is listed below.']
      : ['Nobody created the paid sign-up through Quick Close.'],
    claimed: r.claimed_seller_user_id ? `${nameOf(r.claimed_seller_user_id)}${claimedNow ? ` — ${claimedNow} when the review opened` : ''}` : 'Nobody',
    ownerAtPayment: e.owner_at_payment ? nameOf(e.owner_at_payment) : 'Nobody (unassigned)',
    ownerNow: r.lead ? (r.lead.owner_now ? nameOf(r.lead.owner_now) : 'Nobody (unassigned)') : null,
    ownerHistory: (Array.isArray(e.owner_history) ? e.owner_history : []).map((h) => {
      const when = h.at ? `${day(h.at)}: ` : '';
      if (h.kind === 'lead_assigned') return `${when}moved ${h.data?.from ? `from ${nameOf(h.data.from)} ` : ''}to ${h.data?.to ? nameOf(h.data.to) : 'nobody'}${h.by ? ` by ${nameOf(h.by)}` : ''}`;
      if (h.kind === 'lead_unassigned') return `${when}unassigned${h.by ? ` by ${nameOf(h.by)}` : ''}`;
      if (h.kind === 'lead_claimed') return `${when}claimed by ${nameOf(h.by)}`;
      if (h.kind === 'lead_added') return `${when}added by ${nameOf(h.by)}`;
      return `${when}${String(h.kind ?? 'change').replace(/_/g, ' ')}`;
    }),
    links: links.map((l) => `${day(l.at)} · ${nameOf(l.creator)}${l.role === 'admin' ? ' (admin)' : ''} · ${l.role === 'admin' ? 'admin' : readinessText(l.ready, l.missing)}${e.paid_signup && l.signup === e.paid_signup ? ' · the sign-up that was paid' : ''}`),
  };
}

/** The candidate's reasons, in words. */
export const candidateWhy = (c: AttributionCandidate) => c.sources.map((s) => CANDIDATE_SOURCE_LABEL[s] ?? s).join(' · ');

/** People Paul may pick as an explicit override: the team, minus the evidence-backed candidates. Active first. */
export function overrideChoices(people: readonly AttributionPerson[], candidates: readonly AttributionCandidate[]): AttributionPerson[] {
  const named = new Set(candidates.map((c) => c.user_id));
  return people.filter((p) => !named.has(p.user_id))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name));
}

/** A resolved review in one line, keeping the original claim beside the decision. */
export function resolutionText(r: AttributionReview, nameOf: (id: string | null | undefined) => string): string {
  const by = r.resolved_by ? ` by ${nameOf(r.resolved_by)}` : '';
  const when = r.resolved_at ? ` on ${day(r.resolved_at)}` : '';
  if (r.status === 'not_credited') return `Not credited to a salesperson${by}${when}. Business revenue only; no commission.`;
  if (r.status === 'confirmed') {
    const seller = r.resolved_seller_user_id ?? r.claimed_seller_user_id;
    const basis = r.resolution_basis === 'admin_override' ? 'admin override' : r.resolution_basis === 'evidence' ? 'from the evidence' : 'the claimed seller';
    return `Seller confirmed: ${nameOf(seller)} (${basis})${by}${when}.`;
  }
  return 'Open';
}
