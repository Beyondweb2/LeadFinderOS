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
  FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, SERVICE_ROUTE_NAME, planTierForRoute, termMonthsFor, totalPaymentsFor,
  type ServiceRoute,
} from './findableOffer.ts';

export type QcDecisionMaker = 'yes' | 'no';
export type QcDomain = 'yes' | 'no' | 'not_sure' | 'no_domain';
export type QcManager = 'owner' | 'employee' | 'agency' | 'third_party' | 'no_website' | 'not_sure';
export type QcAccess = 'yes' | 'no' | 'not_sure' | 'not_applicable';
export type QcAuthority = 'yes' | 'no' | 'not_sure' | 'not_applicable';
export type QcConsents = 'yes' | 'not_yet';

export interface QuickCloseAnswers {
  decision_maker?: QcDecisionMaker | null;
  domain?: QcDomain | null;
  manager?: QcManager | null;
  access?: QcAccess | null;
  authority?: QcAuthority | null;
  /** 🔴 THE WEBSITE ROUTE (Paul, 2026-09-29): Findable Build (12 payments) or Findable Optimise (6).
   *  Required — a Quick Close with no route never reaches a payment link. */
  route?: ServiceRoute | null;
  /** 🔴 BUILD ONLY (Paul, 2026-09-29): the three essential consents, confirmed on the call before a link.
   *  'yes' = all three confirmed; 'not_yet' = not (yet) — the link waits. Never asked on Optimise. */
  build_consents?: QcConsents | null;
}
export type QcKey = keyof QuickCloseAnswers;

/** The three Build consents, in plain words (Paul, 2026-09-29).
 *  ⚠️ DECLARED ABOVE QUICK_CLOSE_QUESTIONS, WHICH READS IT: a const read before its declaration throws
 *  at module load, and this module loads inside fn quick-close. */
export const BUILD_CONSENTS: readonly string[] = [
  'They own or control the domain, or have the authority to make the changes the new website needs.',
  'Findable has their permission to make the necessary domain / DNS changes.',
  'They have the right to provide and use the business content, logos and photos they give Findable.',
];
/** M-012 (2026-10-04): with "No domain" the rep must not be made to confirm they own one. The first
 *  consent becomes the true one; the other two are unchanged. */
export const BUILD_CONSENT_NO_DOMAIN =
  "They will register a domain in the business's own name (Findable can help), and have the authority to make the changes the new website needs.";
export type BuildConsentsWording = 'standard' | 'no_domain';
export function buildConsentsWording(a: QuickCloseAnswers): BuildConsentsWording {
  return a.domain === 'no_domain' ? 'no_domain' : 'standard';
}
/** The three consents exactly as the rep reads them for these answers (and as stored when confirmed). */
export function buildConsentsFor(a: QuickCloseAnswers): readonly string[] {
  return buildConsentsWording(a) === 'no_domain' ? [BUILD_CONSENT_NO_DOMAIN, BUILD_CONSENTS[1], BUILD_CONSENTS[2]] : BUILD_CONSENTS;
}

export const QUICK_CLOSE_QUESTIONS: readonly { key: QcKey; text: string; detail?: readonly string[]; options: readonly { value: string; label: string }[] }[] = [
  { key: 'decision_maker', text: 'Are you authorised to make this decision for the business?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { key: 'domain', text: 'Do you own or control the domain name?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'no_domain', label: 'No domain' }] },
  { key: 'manager', text: 'Who currently manages or controls the website?', options: [{ value: 'owner', label: 'Business / owner' }, { value: 'employee', label: 'Employee' }, { value: 'agency', label: 'External agency' }, { value: 'third_party', label: 'Other third party' }, { value: 'no_website', label: 'No website' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'access', text: 'Could you give Findable access to the current website if needed?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  { key: 'authority', text: 'If an agency or third party manages the site, do you have the authority to replace, move or materially change the website?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  { key: 'route', text: 'Website route', options: [{ value: 'build', label: 'Build me a new Findable website' }, { value: 'optimise', label: 'Keep my existing website and optimise it' }] },
  /* Asked ONLY on Build. The three consents the new site cannot go ahead without, read out as written. */
  { key: 'build_consents', text: 'For the new website, can they confirm all three?', detail: BUILD_CONSENTS,
    options: [{ value: 'yes', label: 'Yes — they confirm all three' }, { value: 'not_yet', label: 'Not yet' }] },
];

/** The commercial consequence of a route, as the rep sees it the moment it is chosen. From the
 *  constants — the rep can change none of it (price, count, cadence, discount).
 *  🔴 M-011 (2026-10-04): the MINIMUM TERM is said before the link, not discovered at checkout. */
export function routeTermsLines(route: ServiceRoute): string[] {
  return [
    `£${FINDABLE_SETUP_PRICE_GBP} today`,
    `Then £${FINDABLE_MONTHLY_GBP} a month, starting six weeks after sign-up`,
    `${totalPaymentsFor(route)} payments in total, today's included — a ${termMonthsFor(route)}-month minimum term`,
  ];
}

/** The short count line used on the route buttons. */
export const routePaymentsShort = (route: ServiceRoute) => `${totalPaymentsFor(route)} payments · ${termMonthsFor(route)}-month minimum`;

/** Who owns the website, per route, in the REP's words (findableOffer.ts's TWO ROUTES note is the source:
 *  a site Findable builds transfers once the term is complete and paid; Optimise never takes a site over). */
export function routeOwnershipLine(route: ServiceRoute): string {
  return route === 'build'
    ? `Findable builds, hosts and manages a new website for them. It becomes theirs once all ${totalPaymentsFor(route)} payments are made.`
    : 'They keep their existing website — it stays theirs. Findable works on it with their access.';
}

/** The guarantee, as Paul says it (findable.live's headline), followed by the exact terms it is judged on
 *  (FINDABLE_GUARANTEE, byte-locked — never paraphrased). ⛔ No ranking, recommendation or citation is
 *  promised, and no hedge sits beside it (CLAUDE.md §1). */
export const QUICK_CLOSE_PROMISE = 'We improve AI visibility or you get your money back.';
export const QUICK_CLOSE_GUARANTEE_LINES: readonly string[] = [QUICK_CLOSE_PROMISE, FINDABLE_GUARANTEE];

/** M-011: the payer must tick the client agreement on the Stripe page (findable-checkout, consent_collection). */
export const QUICK_CLOSE_AGREEMENT_LINE = 'On the payment page they tick to accept the client agreement before they pay.';

/** Optimise needs a site to optimise: with no website only Build is offered. */
export function routeAvailable(a: QuickCloseAnswers, route: ServiceRoute): boolean {
  return !(route === 'optimise' && a.manager === 'no_website');
}

const VALID: Record<QcKey, ReadonlySet<string>> = Object.fromEntries(QUICK_CLOSE_QUESTIONS.map((q) => [q.key, new Set<string>(q.options.map((o) => o.value))])) as unknown as Record<QcKey, ReadonlySet<string>>;

/** PER-KEY validation only: known values survive, anything else is "not answered". No cross-answer rule
 *  runs here — that is cleanAnswers' job, and it must only ever run on a COMPLETE answer set. */
export function pickAnswers(raw: unknown): QuickCloseAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: QuickCloseAnswers = {};
  for (const q of QUICK_CLOSE_QUESTIONS) {
    const v = r[q.key];
    if (typeof v === 'string' && VALID[q.key].has(v)) (out as Record<string, string>)[q.key] = v;
  }
  return out;
}

/** 🔴 THE ONE MERGE (M-001, 2026-10-04). The dialog saves ONE answer per call. The server used to run
 *  cleanAnswers on that single answer BEFORE merging it with the saved set — and cleanAnswers drops
 *  build_consents from any set without route:'build', so the Build consent ("Yes — they confirm all
 *  three") was thrown away on every save and no Build sale could reach its link. Now: each incoming
 *  value is validated on its own, laid OVER the saved answers, and only then do the cross-answer rules
 *  run, on the complete result.
 *  ⛔ One extra rule: consents confirmed for one domain situation do not carry over to the other
 *  (No domain ⇄ an existing domain) — they were read with different words, so they are asked again. */
export function mergeAnswers(saved: unknown, incoming: unknown): QuickCloseAnswers {
  const prev = cleanAnswers(saved);
  const inc = pickAnswers(incoming);
  const merged: QuickCloseAnswers = { ...prev, ...inc };
  if (prev.build_consents && inc.domain && inc.build_consents === undefined
    && buildConsentsWording({ domain: inc.domain }) !== buildConsentsWording(prev)) delete merged.build_consents;
  return cleanAnswers(merged);
}

/** Only known values survive, and the cross-answer rules hold. Run it on a COMPLETE set (mergeAnswers). */
export function cleanAnswers(raw: unknown): QuickCloseAnswers {
  const out = pickAnswers(raw);
  // An Optimise route for a business with no website is not an answer (there is nothing to optimise).
  if (out.route && !routeAvailable(out, out.route)) delete out.route;
  // The Build consents belong to Build: on any other route (or none) they are not an answer.
  if (out.route !== 'build') delete out.build_consents;
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
  if (a.route === 'build' && !a.build_consents) miss.push('build_consents');
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
  /** Build chosen and the three consents are not confirmed: no link until they are. */
  consentsNeeded: boolean;
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
  return { complete: missing.length === 0, missing, blocked: a.decision_maker === 'no', review, notes, consentsNeeded: a.route === 'build' && a.build_consents !== 'yes' };
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
  /* The Build consents land in the SAME columns the self-service domain pages write. Authority is never
     turned into a yes over an explicit 'no' / 'not sure' to the authority question. */
  if (a.route === 'build' && a.build_consents === 'yes') {
    out.dns_permission = true; out.materials_confirmed = true;
    if (a.authority !== 'no' && a.authority !== 'not_sure') out.authority_confirmed = true;
  }
  return out;
}

export type QuickCloseState = 'not_started' | 'in_progress' | 'blocked' | 'consents_needed' | 'needs_review' | 'ready' | 'link_generated' | 'link_expired' | 'paid';
/** One record of the link being handed to the prospect (M-015). `channel` says HOW; a copy is recorded as
 *  copied, never as sent — the app cannot know where it was pasted. */
export interface QcLinkShare { channel: 'copy' | 'email' | 'whatsapp'; at: string; by: string | null; to?: string | null; status?: string | null; session?: string | null }
export interface QuickCloseRecord {
  answers?: QuickCloseAnswers | null; review_approved_at?: string | null; link_url?: string | null; link_generated_at?: string | null;
  /** The Stripe Checkout Session behind link_url (so a superseded one can be expired) and when Stripe closes it. */
  link_session_id?: string | null; link_expires_at?: string | null;
  link_shared?: QcLinkShare[] | null;
  /** Optimistic-concurrency counter: every write to quick_close is conditional on it (fn quick-close). */
  rev?: number | null;
}
export const QUICK_CLOSE_STATE_LABEL: Record<QuickCloseState, string> = {
  not_started: 'Not started', in_progress: 'In progress', blocked: 'Decision maker needed', consents_needed: 'Build consents needed', needs_review: 'Paul review required',
  ready: 'Ready for payment', link_generated: 'Payment link ready', link_expired: 'Payment link expired', paid: 'Paid',
};

/** A Stripe Checkout Session is good for 24 hours from creation (findable-checkout sets no other expiry). */
export const STRIPE_SESSION_LIFETIME_MS = 24 * 3_600_000;
/** A link is shown as usable (and reused) only while it has at least this long left — a rep never sends a
 *  link the client cannot open tonight. */
export const LINK_MIN_LEFT_MS = 4 * 3_600_000;

/** The Checkout Session id inside a Stripe-hosted URL (…/c/pay/cs_live_…#…), for rows stored before the
 *  id was kept. Positive match only. */
export function stripeSessionIdFromUrl(url: string | null | undefined): string | null {
  const m = /\/(cs_(?:live|test)_[A-Za-z0-9]+)/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

/** When the stored link stops working: Stripe's own expiry when we have it, else creation + 24 h. */
export function linkExpiresAtMs(qc: QuickCloseRecord | null | undefined): number | null {
  if (!qc?.link_url || !qc.link_generated_at) return null;
  const exp = qc.link_expires_at ? Date.parse(qc.link_expires_at) : NaN;
  if (Number.isFinite(exp)) return exp;
  const gen = Date.parse(qc.link_generated_at);
  return Number.isFinite(gen) ? gen + STRIPE_SESSION_LIFETIME_MS : null;
}

/** Until when the stored link may be handed over (what the rep is shown) — the earlier of the reuse
 *  window and LINK_MIN_LEFT_MS before Stripe closes it. Null when there is no readable link. */
export function linkUsableUntilMs(qc: QuickCloseRecord | null | undefined): number | null {
  const gen = qc?.link_generated_at ? Date.parse(qc.link_generated_at) : NaN;
  const exp = linkExpiresAtMs(qc);
  if (!Number.isFinite(gen) || exp === null) return null;
  return Math.min(gen + LINK_REUSE_MS, exp - LINK_MIN_LEFT_MS);
}

/** 🔴 M-014 (2026-10-04): IS THE STORED LINK SAFE TO HAND OVER RIGHT NOW? A link is never "ready" just
 *  because a URL is stored: it must be younger than LINK_REUSE_MS and have LINK_MIN_LEFT_MS before
 *  Stripe closes it. ⛔ Positive: no link, no time, an unreadable time — all NOT usable. */
export function linkUsable(qc: QuickCloseRecord | null | undefined, nowMs: number = Date.now()): boolean {
  if (!qc?.link_url || !qc.link_generated_at) return false;
  const gen = Date.parse(qc.link_generated_at);
  if (!Number.isFinite(gen) || nowMs - gen >= LINK_REUSE_MS || nowMs < gen - 60_000) return false;
  const exp = linkExpiresAtMs(qc);
  return exp !== null && exp - nowMs >= LINK_MIN_LEFT_MS;
}

/** DERIVED, NEVER STORED: from the row's paid status, the saved Quick Close record and the clock. */
export function quickCloseState(rowStatus: string | null | undefined, qc: QuickCloseRecord | null | undefined, nowMs: number = Date.now()): QuickCloseState {
  if (rowStatus === 'paid') return 'paid';
  if (!qc || !qc.answers || Object.keys(cleanAnswers(qc.answers)).length === 0) return 'not_started';
  if (linkUsable(qc, nowMs)) return 'link_generated';
  const g = quickCloseGate(cleanAnswers(qc.answers));
  if (g.blocked) return 'blocked';
  if (!g.complete) return 'in_progress';
  /* ⛔ NOT RELEASABLE: Paul's review release does not stand in for the client's own Build consents. */
  if (g.consentsNeeded) return 'consents_needed';
  if (g.review.length && !qc.review_approved_at) return 'needs_review';
  /* A link was made and has run out (or is too close to running out): never shown as ready. */
  return qc.link_url ? 'link_expired' : 'ready';
}

/** May a payment link be generated (or reused) right now? (The server re-checks everything before calling checkout.) */
export function mayGenerateLink(rowStatus: string | null | undefined, qc: QuickCloseRecord | null | undefined, nowMs: number = Date.now()): boolean {
  const s = quickCloseState(rowStatus, qc, nowMs);
  return s === 'ready' || s === 'link_generated' || s === 'link_expired';
}

export const answerLabel = (key: QcKey, value: string | null | undefined) =>
  QUICK_CLOSE_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.value === value)?.label ?? '—';
const SHORT_Q: Record<QcKey, string> = { decision_maker: 'Decision maker', domain: 'Owns / controls domain', manager: 'Website managed by', access: 'Can give site access', authority: 'Authority to replace / move site', route: 'Website route', build_consents: 'Build consents (domain, DNS, content)' };

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

/* ══ THE SERVER'S DECISIONS, PURE (2026-10-04). fn quick-close does only the I/O around these — read the
   row, write it conditionally on its `rev`, call Stripe — so the rules below are the ones the tests drive
   (scripts/quick-close-links.test.ts) and the ones that run. ════════════════════════════════════════ */
export type QcRecord = QuickCloseRecord & Record<string, unknown>;
/** A link claim older than this is abandoned (a crashed generation) and may be taken over. */
export const LINK_CLAIM_MS = 45_000;

/** Order-independent identity of an answer set (a link is only ever stored for the answers it was made from). */
export function answersKey(a: unknown): string {
  const c = cleanAnswers(a) as Record<string, unknown>;
  return JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]));
}

function notKeptText(k: QcKey, a: QuickCloseAnswers): string {
  if (k === 'route') return 'Optimise needs a website to work on — with no website only Findable Build is possible.';
  if (k === 'build_consents') return `The Build consents only apply to Findable Build${a.route ? ` — the route is ${SERVICE_ROUTE_NAME[a.route]}` : ' — choose the route first'}.`;
  return 'That answer could not be saved. Refresh and try again.';
}

export type SaveRefusalCode = 'stale_route' | 'route_change_unconfirmed' | 'answer_not_kept';
export type SavePlan =
  | { ok: false; error: SaveRefusalCode; detail: string }
  | { ok: true; prev: QuickCloseAnswers; answers: QuickCloseAnswers; changed: QcKey[]; routeChange: boolean; cols: Record<string, unknown>; next: QcRecord; superseded: string | null };

/** 🔴 ONE SAVE, DECIDED (M-001 + route integrity). From the record as it is stored NOW and the raw answers
 *  the screen sent:
 *  · `expectRoute` (when sent) must equal the stored route — a stale tab is refused, never merged;
 *  · a route CHANGE must be confirmed (`routeChangeConfirmed`) — Build ⇄ Optimise is never a stray tap;
 *  · the answers are merged over the stored set (mergeAnswers), and any sent answer that does not survive
 *    is refused out loud — the silent loss that hid M-001 cannot recur;
 *  · a change of any answer clears a review release and the link (whose session is returned to expire);
 *  · the consent columns follow the consents; the wording the rep read is kept with a yes (M-012).
 *  The caller adds corrections + updated_at to `cols`, checks the downstream route lock when routeChange,
 *  and writes `next` conditionally on the rev it read. */
export function planQuickCloseSave(
  cur: QcRecord | null | undefined, rawIncoming: unknown,
  o: { expectRoute?: unknown; routeChangeConfirmed?: boolean; actorId: string; nowIso: string },
): SavePlan {
  const prev = cleanAnswers(cur?.answers);
  const inc = pickAnswers(rawIncoming);
  if ('expectRoute' in o) {
    const expected = o.expectRoute === 'build' || o.expectRoute === 'optimise' ? o.expectRoute : null;
    if ((prev.route ?? null) !== expected) {
      return { ok: false, error: 'stale_route', detail: `The route was changed to ${prev.route ? SERVICE_ROUTE_NAME[prev.route] : 'not chosen'} in another window. The screen has been refreshed — check it before carrying on.` };
    }
  }
  const routeChange = !!(inc.route && prev.route && inc.route !== prev.route);
  if (routeChange && o.routeChangeConfirmed !== true) {
    return { ok: false, error: 'route_change_unconfirmed', detail: 'Changing the route changes the number of payments. Confirm the change to switch.' };
  }
  const answers = mergeAnswers(prev, rawIncoming);
  const lost = (Object.keys(inc) as QcKey[]).find((k) => answers[k] !== inc[k]);
  if (lost) return { ok: false, error: 'answer_not_kept', detail: notKeptText(lost, answers) };
  const gate = quickCloseGate(answers);
  const changed = ([...new Set([...Object.keys(answers), ...Object.keys(prev)])] as QcKey[]).filter((k) => answers[k] !== prev[k]);
  const cols: Record<string, unknown> = { ...onboardingColumnsFor(answers) };
  /* A route dropped by the re-clean clears the row's route too — never left behind as a stale sale. */
  if (prev.route && !answers.route) { cols.plan_tier = null; cols.website_addon = null; }
  /* Build consents withdrawn (Not yet, or the route moved off Build): the consent columns they set go too. */
  if (prev.build_consents === 'yes' && answers.build_consents !== 'yes') {
    cols.dns_permission = null; cols.materials_confirmed = null;
    cols.authority_confirmed = answers.authority === 'yes' ? true : answers.authority === 'no' ? false : null;
  }
  const next: QcRecord = { ...(cur ?? {}), answers, updated_at: o.nowIso, updated_by: o.actorId };
  if (!cur?.started_by) { next.started_by = o.actorId; next.started_at = o.nowIso; }
  if (gate.complete && !cur?.completed_at) { next.completed_at = o.nowIso; next.completed_by = o.actorId; }
  if (answers.build_consents === 'yes' && prev.build_consents !== 'yes') {
    next.build_consents_confirmed = { wording: buildConsentsWording(answers), lines: buildConsentsFor(answers), at: o.nowIso, by: o.actorId };
  }
  if (answers.build_consents !== 'yes' && cur?.build_consents_confirmed) next.build_consents_confirmed = null;
  // Answers that change after a review approval, or after a link, invalidate both (the link was for the old answers).
  if (changed.length && cur?.review_approved_at) { next.review_approved_at = null; next.review_approved_by = null; }
  let superseded: string | null = null;
  if (changed.length && cur?.link_url) {
    superseded = (cur.link_session_id as string | null | undefined) ?? stripeSessionIdFromUrl(cur.link_url);
    Object.assign(next, { link_url: null, link_generated_at: null, link_generated_by: null, link_session_id: null, link_expires_at: null, link_invalidated_at: o.nowIso });
  }
  return { ok: true, prev, answers, changed, routeChange, cols, next, superseded };
}

/** What a "Generate / Create fresh payment link" press does, from the stored record now. */
export type LinkStep = { kind: 'refuse'; state: QuickCloseState } | { kind: 'reuse' } | { kind: 'wait' } | { kind: 'claim' };
export function linkStep(rowStatus: string | null | undefined, cur: QcRecord | null | undefined, nowMs: number = Date.now()): LinkStep {
  if (!mayGenerateLink(rowStatus, cur, nowMs)) return { kind: 'refuse', state: quickCloseState(rowStatus, cur, nowMs) };
  if (linkUsable(cur, nowMs)) return { kind: 'reuse' };
  const claimAt = Date.parse(String(cur?.link_claimed_at ?? ''));
  if (Number.isFinite(claimAt) && nowMs - claimAt < LINK_CLAIM_MS) return { kind: 'wait' };
  return { kind: 'claim' };
}

/** After Stripe made OUR session: may it become THE link? Re-decided on the record as stored after the call.
 *  · paid meanwhile → no (ours is expired);
 *  · an answer changed meanwhile → no (the session was made for the old answers; ours is expired);
 *  · another usable link landed first (another tab) → that one stays THE link (ours is expired);
 *  · else store ours, and return the session it replaces (expired by the caller). */
export type AdoptStep =
  | { kind: 'paid' } | { kind: 'answers_changed' } | { kind: 'other_won' }
  | { kind: 'store'; next: QcRecord; replaced: string | null };
export function adoptLink(
  rowStatus: string | null | undefined, fresh: QcRecord | null | undefined, claimedAnswersKey: string,
  ours: { url: string; session: string | null; expiresIso: string }, actorId: string, nowIso: string, nowMs: number = Date.now(),
): AdoptStep {
  if (rowStatus === 'paid') return { kind: 'paid' };
  if (answersKey(fresh?.answers) !== claimedAnswersKey) return { kind: 'answers_changed' };
  if (linkUsable(fresh, nowMs) && fresh!.link_url !== ours.url) return { kind: 'other_won' };
  const replaced = fresh?.link_url ? ((fresh.link_session_id as string | null | undefined) ?? stripeSessionIdFromUrl(fresh.link_url)) : null;
  return {
    kind: 'store', replaced: replaced && replaced !== ours.session ? replaced : null,
    next: { ...(fresh ?? {}), link_url: ours.url, link_session_id: ours.session, link_generated_at: nowIso, link_generated_by: actorId, link_expires_at: ours.expiresIso, link_claimed_at: null, link_claimed_by: null },
  };
}

/* ── The words (editable by the rep; never a script to read word for word) ────────────────────────── */
/* 🔴 PER ROUTE (2026-09-29): the words name the route's own count, never both — the client has chosen.
   🔴 M-011 (2026-10-04): every version — the rep's card, the spoken words, the WhatsApp / copied message
   and the email — carries the price, the payment count, the MINIMUM TERM, who owns the website, the
   guarantee (QUICK_CLOSE_GUARANTEE_LINES) and the agreement tick, BEFORE the link is sent. One phrase for
   the timing ("six weeks after sign-up", as offerSummaryFor), no nested brackets (A-29). */
const priceSentence = (route: ServiceRoute) =>
  `£${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month starting six weeks after sign-up — ${totalPaymentsFor(route)} payments in total, so a ${termMonthsFor(route)}-month minimum term.`;
/** The ownership sentence in the CLIENT's words ("you"). Same facts as routeOwnershipLine. */
const ownershipToClient = (route: ServiceRoute) => route === 'build'
  ? `We build, host and manage a new website for you, and it becomes yours once all ${totalPaymentsFor(route)} payments are made.`
  : 'You keep your own website — it stays yours, and we work on it.';
const AFTER_PAYMENT_SENTENCE = "Once it's paid we run your full baseline AI visibility measurement, and Paul will be in touch within two working days to take over the setup — website, domain and access.";

/** What the rep says once the route is chosen. ⛔ Not shown before a route exists (it would name no terms). */
export function quickCloseScript(route: ServiceRoute | null | undefined): string {
  if (!route) return '';
  return `I'll send you the payment link now. It's ${SERVICE_ROUTE_NAME[route]}: ${ownershipToClient(route)} ` +
    `It's ${priceSentence(route)} ${QUICK_CLOSE_PROMISE} ${FINDABLE_GUARANTEE} ` +
    `On the payment page you'll tick to accept the client agreement. ${AFTER_PAYMENT_SENTENCE} You don't need to sort any of that out today.`;
}

/** The greeting: the contact's first name when we have one, never the business's legal name (A-29). */
export function quickCloseGreeting(contactName: string | null | undefined): string {
  const first = String(contactName ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-z][A-Za-z'’-]{1,30}$/.test(first) ? `Hi ${first}` : 'Hi';
}

/** The message that carries the link (WhatsApp, copy, email body). `greetName` is the contact's name. */
export function quickCloseMessage(greetName: string | null | undefined, url: string, route: ServiceRoute): string {
  return [
    `${quickCloseGreeting(greetName)}, here's your ${SERVICE_ROUTE_NAME[route]} payment link:`,
    url,
    '',
    `What you're signing up to: ${priceSentence(route)} ${ownershipToClient(route)}`,
    '',
    `${QUICK_CLOSE_PROMISE} ${FINDABLE_GUARANTEE}`,
    '',
    `On the payment page you'll tick to accept the client agreement. ${AFTER_PAYMENT_SENTENCE}`,
    '',
    'The link stays open for up to 24 hours. If it runs out, just reply and we will send a fresh one.',
  ].join('\n');
}

/** The email that carries the link (fn quick-close mode share_link, channel email). Plain text. */
export function quickCloseEmail(i: { greetName: string | null | undefined; businessName: string | null | undefined; url: string; route: ServiceRoute; senderName: string | null | undefined }): { subject: string; text: string } {
  const biz = String(i.businessName ?? '').trim();
  const sender = String(i.senderName ?? '').trim();
  return {
    subject: `Your ${SERVICE_ROUTE_NAME[i.route]} payment link${biz ? ` - ${biz}` : ''}`,
    text: `${quickCloseMessage(i.greetName, i.url, i.route)}\n\nAny questions, just reply to this email.\n\n${sender ? `${sender}\n` : ''}Findable`,
  };
}

export const QUICK_CLOSE_AFTER_PAYMENT: readonly string[] = [
  'They get a full baseline AI visibility measurement first.',
  'Paul introduces himself within two working days and takes over from here.',
  'Paul handles the website, domain and access questions.',
  'Paul may ask them for a few more details later — they do not need everything today.',
];
