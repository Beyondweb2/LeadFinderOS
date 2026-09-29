/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE (Sales Experience, 2026-09-29, Paul): VERBAL YES → 60-SECOND QUICK CLOSE → THE £99 LINK
   → PAYMENT → HANDOFF TO PAUL. The bare minimum a salesperson asks on the phone before taking payment;
   everything else is gathered after payment.
   ⛔ ONE ONBOARDING RECORD. The answers land on the SAME onboarding_responses row the self-service link
   uses — its canonical columns where one exists (domain_status / domain_owned / website_manager /
   website_platform / authority_confirmed), and in `quick_close` for the rest. Payment is the EXISTING
   findable-checkout: this file prices nothing and no request can change the price or terms.
   ⛔ THE GATE IS POSITIVE. "Not sure" is never a yes; an unanswered question is never safe. A decision-
   maker "No" stops payment; any domain / agency doubt is "DOMAIN / AGENCY ISSUE — Paul review required"
   (the opportunity is kept, flagged, and Paul can release it). Sales is never asked to read a contract.
   Pure, no imports beyond the offer constants: read by fn quick-close, the SPA and the tests.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, SERVICE_ROUTE_NAME, planTierForRoute, totalPaymentsFor, type ServiceRoute,
} from './findableOffer.ts';

export type QcDecisionMaker = 'yes' | 'no';
export type QcDomain = 'yes' | 'no' | 'not_sure' | 'no_domain';
export type QcManager = 'owner' | 'employee' | 'agency' | 'third_party' | 'no_website' | 'not_sure';
export type QcAccess = 'yes' | 'no' | 'not_sure' | 'not_applicable';
export type QcAuthority = 'yes' | 'no' | 'not_sure' | 'not_applicable';

export interface QuickCloseAnswers {
  decision_maker?: QcDecisionMaker | null;
  domain?: QcDomain | null;
  manager?: QcManager | null;
  access?: QcAccess | null;
  authority?: QcAuthority | null;
  /** 🔴 THE WEBSITE ROUTE (Paul, 2026-09-29): Findable Build (12 payments) or Findable Optimise (6).
   *  Required — a Quick Close with no route never reaches a payment link. */
  route?: ServiceRoute | null;
}
export type QcKey = keyof QuickCloseAnswers;

export const QUICK_CLOSE_QUESTIONS: readonly { key: QcKey; text: string; options: readonly { value: string; label: string }[] }[] = [
  { key: 'decision_maker', text: 'Are you authorised to make this decision for the business?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { key: 'domain', text: 'Do you own or control the domain name?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'no_domain', label: 'No domain' }] },
  { key: 'manager', text: 'Who currently manages or controls the website?', options: [{ value: 'owner', label: 'Business / owner' }, { value: 'employee', label: 'Employee' }, { value: 'agency', label: 'External agency' }, { value: 'third_party', label: 'Other third party' }, { value: 'no_website', label: 'No website' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'access', text: 'Could you give Findable access to the current website if needed?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  { key: 'authority', text: 'If an agency or third party manages the site, do you have the authority to replace, move or materially change the website?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  { key: 'route', text: 'Website route', options: [{ value: 'build', label: 'Build me a new Findable website' }, { value: 'optimise', label: 'Keep my existing website and optimise it' }] },
];

/** The commercial consequence of a route, as the rep sees it the moment it is chosen. From the
 *  constants — the rep can change none of it (price, count, cadence, discount). */
export function routeTermsLines(route: ServiceRoute): string[] {
  return [`£${FINDABLE_SETUP_PRICE_GBP} today`, `Then £${FINDABLE_MONTHLY_GBP}/month from week six`, `${totalPaymentsFor(route)} payments total`];
}

/** Optimise needs a site to optimise: with no website only Build is offered. */
export function routeAvailable(a: QuickCloseAnswers, route: ServiceRoute): boolean {
  return !(route === 'optimise' && a.manager === 'no_website');
}

const VALID: Record<QcKey, ReadonlySet<string>> = Object.fromEntries(QUICK_CLOSE_QUESTIONS.map((q) => [q.key, new Set<string>(q.options.map((o) => o.value))])) as unknown as Record<QcKey, ReadonlySet<string>>;

/** Only known values survive; anything else is "not answered". */
export function cleanAnswers(raw: unknown): QuickCloseAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: QuickCloseAnswers = {};
  for (const q of QUICK_CLOSE_QUESTIONS) {
    const v = r[q.key];
    if (typeof v === 'string' && VALID[q.key].has(v)) (out as Record<string, string>)[q.key] = v;
  }
  // An Optimise route for a business with no website is not an answer (there is nothing to optimise).
  if (out.route && !routeAvailable(out, out.route)) delete out.route;
  return out;
}

const thirdPartyManaged = (a: QuickCloseAnswers) => a.manager === 'agency' || a.manager === 'third_party';
const noSite = (a: QuickCloseAnswers) => a.manager === 'no_website';

/** Which questions still need an answer. Access / authority are "not applicable" for some answers. */
export function missingQuestions(a: QuickCloseAnswers): QcKey[] {
  const miss: QcKey[] = [];
  if (!a.decision_maker) miss.push('decision_maker');
  if (!a.domain) miss.push('domain');
  if (!a.manager) miss.push('manager');
  if (!a.access && !noSite(a)) miss.push('access');
  // Authority is asked only where a third party runs the site; "not applicable" does not answer it there.
  if (thirdPartyManaged(a) ? !(a.authority && a.authority !== 'not_applicable') : !a.authority && !noSite(a) && a.manager !== 'owner' && a.manager !== 'employee') miss.push('authority');
  if (!a.route) miss.push('route');
  return miss;
}

export type QcReviewReason = 'domain_not_owned' | 'domain_unsure' | 'third_party_no_authority' | 'third_party_authority_unsure' | 'manager_unsure' | 'no_site_access' | 'optimise_access_unsure';
export const QC_REVIEW_TEXT: Record<QcReviewReason, string> = {
  domain_not_owned: 'The business says it does not own or control the domain',
  domain_unsure: 'Not sure who owns or controls the domain',
  third_party_no_authority: 'An agency / third party runs the site and they do not have authority to replace or move it',
  third_party_authority_unsure: 'An agency / third party runs the site and authority to replace or move it is unclear',
  manager_unsure: 'Not sure who manages the website',
  no_site_access: 'They could not give Findable access to the current website',
  optimise_access_unsure: 'Optimise chosen, but an agency / third party runs the site and access to it is not confirmed',
};

export interface QuickCloseGate {
  complete: boolean;
  missing: QcKey[];
  /** A decision-maker "No": payment is never generated. */
  blocked: boolean;
  /** Domain / agency doubt: flagged for Paul; payment waits for his release. */
  review: QcReviewReason[];
  /** Things to settle after payment — shown in the handoff, never a stop. */
  notes: string[];
}

export function quickCloseGate(a: QuickCloseAnswers): QuickCloseGate {
  const missing = missingQuestions(a);
  const review: QcReviewReason[] = [];
  if (a.domain === 'no') review.push('domain_not_owned');
  if (a.domain === 'not_sure') review.push('domain_unsure');
  if (thirdPartyManaged(a)) {
    if (a.authority === 'no') review.push('third_party_no_authority');
    else if (a.authority === 'not_sure') review.push('third_party_authority_unsure');
  }
  if (a.manager === 'not_sure') review.push('manager_unsure');
  if (a.access === 'no' && !noSite(a)) review.push('no_site_access');
  /* ⛔ OPTIMISE IS NEVER SILENTLY SAFE ON A SITE SOMEONE ELSE RUNS (Paul, 2026-09-29): the whole route is
     work on that site, so an agency / third party site with access not confirmed goes to Paul. */
  if (a.route === 'optimise' && thirdPartyManaged(a) && a.access !== 'yes' && a.access !== 'no') review.push('optimise_access_unsure');
  const notes: string[] = [];
  if (a.access === 'not_sure') notes.push('Website access to be confirmed after payment');
  if (a.domain === 'no_domain') notes.push('No domain yet — the business registers one in its own name');
  if (thirdPartyManaged(a) && a.authority === 'yes') notes.push('An agency / third party runs the site; the client says they may replace or move it');
  return { complete: missing.length === 0, missing, blocked: a.decision_maker === 'no', review, notes };
}

/** The canonical onboarding columns these answers set (the same ones the self-service form writes). */
export function onboardingColumnsFor(a: QuickCloseAnswers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.domain === 'yes' || a.domain === 'no' || a.domain === 'not_sure') { out.domain_status = 'existing'; out.domain_owned = a.domain; }
  if (a.domain === 'no_domain') { out.domain_status = 'new'; out.domain_owned = null; }
  if (a.manager === 'agency' || a.manager === 'third_party') out.website_manager = 'web_company';
  else if (a.manager === 'owner' || a.manager === 'employee') out.website_manager = a.access === 'yes' ? 'direct_access' : 'owner_only';
  if (a.manager === 'no_website') out.website_platform = 'no_website';
  if (a.authority === 'yes') out.authority_confirmed = true;
  else if (a.authority === 'no') out.authority_confirmed = false;
  /* THE ROUTE, IN THE SAME TWO COLUMNS THE SELF-SERVICE FORM WRITES (plan_tier + website_addon, from
     one decision), so the checkout reads one interpretation whichever path made the sale. An unset
     route writes NOTHING — never a default. */
  if (a.route) { out.plan_tier = planTierForRoute(a.route); out.website_addon = a.route === 'build'; }
  return out;
}

export type QuickCloseState = 'not_started' | 'in_progress' | 'blocked' | 'needs_review' | 'ready' | 'link_generated' | 'paid';
export interface QuickCloseRecord { answers?: QuickCloseAnswers | null; review_approved_at?: string | null; link_url?: string | null; link_generated_at?: string | null }
export const QUICK_CLOSE_STATE_LABEL: Record<QuickCloseState, string> = {
  not_started: 'Not started', in_progress: 'In progress', blocked: 'Decision maker needed', needs_review: 'Paul review required',
  ready: 'Ready for payment', link_generated: 'Payment link generated', paid: 'Paid',
};

/** DERIVED, NEVER STORED: from the row's paid status and the saved Quick Close record. */
export function quickCloseState(rowStatus: string | null | undefined, qc: QuickCloseRecord | null | undefined): QuickCloseState {
  if (rowStatus === 'paid') return 'paid';
  if (!qc || !qc.answers || Object.keys(cleanAnswers(qc.answers)).length === 0) return 'not_started';
  if (qc.link_url && qc.link_generated_at) return 'link_generated';
  const g = quickCloseGate(cleanAnswers(qc.answers));
  if (g.blocked) return 'blocked';
  if (!g.complete) return 'in_progress';
  if (g.review.length && !qc.review_approved_at) return 'needs_review';
  return 'ready';
}

/** May a payment link be generated right now? (The server re-checks everything before calling checkout.) */
export function mayGenerateLink(rowStatus: string | null | undefined, qc: QuickCloseRecord | null | undefined): boolean {
  const s = quickCloseState(rowStatus, qc);
  return s === 'ready' || s === 'link_generated';
}

export const answerLabel = (key: QcKey, value: string | null | undefined) =>
  QUICK_CLOSE_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value)?.label ?? '—';
const SHORT_Q: Record<QcKey, string> = { decision_maker: 'Decision maker', domain: 'Owns / controls domain', manager: 'Website managed by', access: 'Can give site access', authority: 'Authority to replace / move site', route: 'Website route' };

/** The handoff lines for the PAID email when a salesperson Quick-Closed the client. Pure. */
export function quickCloseHandoffLines(i: {
  qc: (QuickCloseRecord & { completed_at?: string | null; review_approved_at?: string | null; review_note?: string | null }) | null;
  closedBy: string | null; campaign: string | null; leadSource: string | null;
  contact: { name?: string | null; email?: string | null; phone?: string | null; website?: string | null };
  latestNote: string | null; latestMessages: { direction: string; body: string | null }[];
}): string[] | null {
  if (!i.qc || !i.qc.answers) return null;
  const a = cleanAnswers(i.qc.answers);
  const g = quickCloseGate(a);
  const out: string[] = [];
  out.push(`QUICK CLOSE by ${i.closedBy ?? 'a teammate'}${i.qc.completed_at ? ` on ${i.qc.completed_at.slice(0, 10)}` : ''} — the client did the minimum on the phone; everything else is yours to collect.`);
  for (const q of QUICK_CLOSE_QUESTIONS) out.push(`  ${SHORT_Q[q.key]}: ${answerLabel(q.key, a[q.key])}`);
  if (a.route) out.push(`  Sold as: ${SERVICE_ROUTE_NAME[a.route]} — ${totalPaymentsFor(a.route)} payments in total`);
  if (g.review.length) out.push(`  DOMAIN / AGENCY ISSUE: ${g.review.map((r) => QC_REVIEW_TEXT[r]).join('; ')}${i.qc.review_approved_at ? ` (you released it${i.qc.review_note ? `: ${i.qc.review_note}` : ''})` : ''}`);
  for (const n of g.notes) out.push(`  Note: ${n}`);
  const c = i.contact;
  const contact = [c.name, c.email, c.phone, c.website].filter((x) => x && String(x).trim()).join(' · ');
  if (contact) out.push(`  Contact: ${contact}`);
  if (i.campaign || i.leadSource) out.push(`  Campaign / source: ${[i.campaign, i.leadSource].filter(Boolean).join(' · ')}`);
  if (i.latestNote) out.push(`  Sales note: ${i.latestNote.slice(0, 300)}`);
  if (i.latestMessages.length) out.push(`  Latest WhatsApp: ${i.latestMessages.map((m) => `${m.direction === 'inbound' ? 'Them' : 'Us'}: ${(m.body ?? '[media]').replace(/\s+/g, ' ').slice(0, 140)}`).join(' | ')}`);
  out.push('  Still to collect after payment: services, service areas, Google Business Profile access, website / domain details.');
  return out;
}

/** A Stripe Checkout session is good for 24 hours; a link younger than this is reused, never re-created. */
export const LINK_REUSE_MS = 20 * 3_600_000;

/* ── The words (editable by the rep; never a script to read word for word) ────────────────────────── */
/* 🔴 PER ROUTE (2026-09-29): the words name the route's own count, never both — the client has chosen. */
const priceLine = (route: ServiceRoute) =>
  `£${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month from week six (${totalPaymentsFor(route)} payments in total)`;
const routeWords: Record<ServiceRoute, string> = {
  build: 'we build and manage a new website for you as part of the service',
  optimise: 'we work on your existing website, which stays yours',
};

export function quickCloseScript(route: ServiceRoute | null | undefined): string {
  const what = route ? `it's ${SERVICE_ROUTE_NAME[route]} — ${routeWords[route]} — at ${priceLine(route)}` : `it's £${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month from week six`;
  return `That's everything I need from you for now. I'll send you the sign-up link: ${what}. ` +
    `Once that's paid, we'll run your full baseline AI visibility measurement. Paul will then introduce himself and take over the setup, ` +
    `including website and domain access and anything else we need — you don't need to sort any of that out today.`;
}

export function quickCloseMessage(businessName: string | null | undefined, url: string, route: ServiceRoute): string {
  const hi = businessName && businessName.trim() ? `Hi ${businessName.trim()}` : 'Hi';
  return `${hi}, here's your ${SERVICE_ROUTE_NAME[route]} sign-up link (${priceLine(route)}):\n${url}\n\nOnce it's paid we'll run your full baseline AI visibility measurement, and Paul will be in touch to take over the setup.`;
}

export const QUICK_CLOSE_AFTER_PAYMENT: readonly string[] = [
  'They get a full baseline AI visibility measurement first.',
  'Paul introduces himself after payment and takes over from here.',
  'Paul handles the website, domain and access questions.',
  'Paul may ask them for a few more details later — they do not need everything today.',
];
