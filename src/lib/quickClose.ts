/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QUICK CLOSE (Sales Experience, 2026-09-29, Paul): VERBAL YES → 60-SECOND QUICK CLOSE → THE £99 LINK
   → PAYMENT → HANDOFF TO PAUL. The bare minimum a salesperson asks on the phone before taking payment;
   everything else is gathered after payment.
   ⛔ ONE ONBOARDING RECORD. The answers land on the SAME onboarding_responses row the self-service link
   uses — its canonical columns where one exists (domain_status / domain_owned / website_manager /
   website_platform / authority_confirmed), and in `quick_close` for the rest. Payment is the EXISTING
   findable-checkout: this file prices nothing and no request can change the price or terms.
   ⛔ THE GATE IS POSITIVE. "Not sure" is never a yes; an unanswered question is never safe. A decision-
   maker "No" stops payment. Sales is never asked to read a contract.
   🔴 SALES WORKSPACE V2 (Paul, 2026-10-05): THE QUESTIONS FOLLOW WHAT THEY WANT. Authority first, then the
   WEBSITE APPROACH, then only the questions that approach needs (APPROACH_ROUTE maps it onto Build /
   Optimise; prices and terms never move):
     improve      → Optimise: site / CMS access, who manages it. No domain question (we edit in place).
     new_template → Build: the domain only (the new site has to go live somewhere). Never site access.
     refresh      → Build: rights to reuse content / branding / photos, then the domain.
     recreation   → Build: rights, who owns the current design / code, then the domain.
     unsure       → the plan is picked explicitly, then that plan's questions.
   ⛔ DOMAIN CONTROL IS NOT WEBSITE ACCESS. A new site never needs the old backend. An unresolved domain on
      Build is "Domain handoff to resolve before launch" — a flag for Paul in the handoff, never a stop: the
      site is built and previewed; it goes live once they (or an authorised provider) can make the change,
      or a different domain is agreed.
   ⛔ "PAUL REVIEW REQUIRED" (the payment stop) is now ONLY for Optimise work on a site we cannot get into:
      that route IS work on their site. An exact-copy request without confirmed rights is a non-blocking
      flag and the delivery approach drops to a visual refresh / Findable template — never a promise to
      copy third-party code or design.
   🔴 SALES CLOSE → HANDOFF (Paul, 2026-10-07, docs/pre-sales-certification/sales-close-handoff-australia.md):
      QUICK CLOSE IS QUICK. Step 1 CONFIRM THE OFFER (Optimise | Build, with the recommendation the call's
      answers give — offerFit); step 2 only the commercially necessary details still missing (authority; on
      Optimise: can we get into the site, and who runs it; on Build with an agency: are they still in
      contract); step 3 the sign-up link and its one compliant send; done. Everything the CALL screen asked
      (who runs the site, the agency contract and spend, the jobs, the areas, the decision maker) is saved
      on THIS record as they answer and is never asked again here or in the handoff.
      ⛔ REMOVED FROM THE CLOSE (all still read on old rows): the website-approach sub-type, the rights /
      design-owner / domain questions and the three Build consents. The client signs the Client Service
      Agreement before paying (domain / DNS access 7.1(a), materials 8.1, previous agencies 7.2), and the
      practical details go to the paid client's dynamic onboarding form (clientOnboardingForm.ts).
      ⛔ THE AGENCY-CONTRACT RULE (offerFit): an agency / third party runs the site and they are still in
      contract (or nobody is sure) → Optimise is the offer; Build is not offered to a salesperson, and a Build
      on those answers is a "Paul review required" stop Paul can release (never a hard ban). Contract ended
      → either plan. Never knock the agency.
   🔴 FINAL PASS (Paul, 2026-10-07, docs/pre-sales-certification/sales-to-payment-final-pass.md) — SUPERSEDES the
      "plan first" order and the agency-contract rule above:
      · THE ORDER: authority → who looks after the site → (agency / freelancer only) the contract → who controls the
        domain → (an existing site only) the right to reuse its design and content → THE PLAN, LAST (→ Optimise adds
        only "can we get in?"). closeFlow is the one list; missingQuestions is "closeFlow minus what is answered".
      · BUILD IS THE DEFAULT. Only an agency / developer the client is STILL TIED INTO moves the recommendation to
        Optimise (agencyContractTiedIn). "Not sure" keeps Build, warns "Confirm their agency contract before
        finalising Build.", and the Build still stops for Paul's release (agencyContractBlocksBuild, unchanged: only a
        contract confirmed FREE is ready). A website, a domain held elsewhere, or no right to reuse the design never
        blocks Build.
      · KEEPING THEIR DOMAIN IS NOT KEEPING THEIR WEBSITE. The domain answer is a note for Paul, never a plan.
      · The client sees the same facts back on their own sign-up page and may correct them (clientConfirm.ts,
        client_confirmed / effectiveAnswers) — never the plan, price or seller.
   Pure, no imports beyond the offer constants: read by fn quick-close, the SPA and the tests.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS, SERVICE_ROUTE_NAME, planTierForRoute, termMonthsFor, totalPaymentsFor,
  type ServiceRoute,
} from './findableOffer.ts';
import { afterTermClientWords, afterTermRepLine } from './planTerms.ts';

export type QcDecisionMaker = 'yes' | 'no';
/** 'agency' (v2): an agency / provider controls it — a handoff, not a refusal. */
export type QcDomain = 'yes' | 'agency' | 'no' | 'not_sure' | 'no_domain';
/** 'freelancer' (final pass, 2026-10-07): an individual developer, asked alongside an agency. 'employee' and
 *  'third_party' are LEGACY stored answers — still valid, no longer offered (QcOption.legacy). */
export type QcManager = 'owner' | 'employee' | 'agency' | 'freelancer' | 'third_party' | 'no_website' | 'not_sure';
export type QcAccess = 'yes' | 'no' | 'not_sure' | 'not_applicable';
/** Legacy (asked before v2 only): authority over a third-party-run site. Still read on old rows. */
export type QcAuthority = 'yes' | 'no' | 'not_sure' | 'not_applicable';
export type QcConsents = 'yes' | 'not_yet';
/** What they want for their website (v2). Captured early: it decides which questions make sense. */
export type QcApproach = 'improve' | 'new_template' | 'refresh' | 'recreation' | 'unsure';
export type QcRights = 'yes' | 'no' | 'not_sure';
export type QcDesignOwner = 'business' | 'agency' | 'not_sure';
/** Asked on the CALL after "Agency / someone else" (2026-10-07): are they still tied into that contract? */
export type QcAgencyContract = 'in_contract' | 'free' | 'not_sure';

/** The approach → the commercial route. 'unsure' maps to nothing: the plan is then picked explicitly. */
export const APPROACH_ROUTE: Record<Exclude<QcApproach, 'unsure'>, ServiceRoute> = {
  improve: 'optimise', new_template: 'build', refresh: 'build', recreation: 'build',
};
export const APPROACH_LABEL: Record<QcApproach, string> = {
  improve: 'Improve their current website',
  new_template: 'New site — Findable template',
  refresh: 'Rebuild / visual refresh of their current site',
  recreation: 'Close recreation of their current site',
  unsure: 'Unsure — Findable to recommend',
};

export interface QuickCloseAnswers {
  decision_maker?: QcDecisionMaker | null;
  approach?: QcApproach | null;
  domain?: QcDomain | null;
  manager?: QcManager | null;
  access?: QcAccess | null;
  authority?: QcAuthority | null;
  rights?: QcRights | null;
  design_owner?: QcDesignOwner | null;
  /** 🔴 THE WEBSITE ROUTE (Paul, 2026-09-29): Findable Build (12 payments) or Findable Optimise (6).
   *  Required — a Quick Close with no route never reaches a payment link. */
  route?: ServiceRoute | null;
  /** 🔴 BUILD ONLY (Paul, 2026-09-29): the three essential consents, confirmed on the call before a link.
   *  'yes' = all three confirmed; 'not_yet' = not (yet) — the link waits. Never asked on Optimise. */
  build_consents?: QcConsents | null;
  /** The agency contract (2026-10-07) — asked on the call, read by offerFit. */
  agency_contract?: QcAgencyContract | null;
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
/** v2: the domain is unresolved (an agency / provider controls it, nobody is sure, or they do not control
 *  it). The rep cannot truthfully confirm they control it, so the first consent says what IS true. */
export const BUILD_CONSENT_DOMAIN_PENDING =
  'They understand the new website can be built and previewed now, and goes live on their domain only once they — or whoever controls it — can authorise the change, or a different domain is agreed.';
export type BuildConsentsWording = 'standard' | 'no_domain' | 'domain_pending';
export function buildConsentsWording(a: QuickCloseAnswers): BuildConsentsWording {
  if (a.domain === 'no_domain') return 'no_domain';
  return domainPending(a) ? 'domain_pending' : 'standard';
}
/** The three consents exactly as the rep reads them for these answers (and as stored when confirmed). */
export function buildConsentsFor(a: QuickCloseAnswers): readonly string[] {
  const w = buildConsentsWording(a);
  if (w === 'no_domain') return [BUILD_CONSENT_NO_DOMAIN, BUILD_CONSENTS[1], BUILD_CONSENTS[2]];
  if (w === 'domain_pending') return [BUILD_CONSENT_DOMAIN_PENDING, BUILD_CONSENTS[1], BUILD_CONSENTS[2]];
  return BUILD_CONSENTS;
}
/** The domain is not yet in the business's hands (agency / not sure / no). Never a refusal on its own. */
export function domainPending(a: QuickCloseAnswers): boolean {
  return a.domain === 'agency' || a.domain === 'not_sure' || a.domain === 'no';
}

/** `legacy` = a stored answer that is still valid and still labelled, but no longer offered as a choice. */
export interface QcOption { value: string; label: string; legacy?: boolean }
export const QUICK_CLOSE_QUESTIONS: readonly { key: QcKey; text: string; detail?: readonly string[]; options: readonly QcOption[] }[] = [
  /* FINAL PASS (2026-10-07, docs/pre-sales-certification/sales-to-payment-final-pass.md): the close asks the
     situation first (who looks after the site, the contract, the domain, the right to reuse the design) and
     the PLAN LAST, Build first — Build is the normal recommendation (offerFit). Answers the Call screen
     already saved are never asked again (missingQuestions). */
  { key: 'route', text: 'Which plan are they going with?', options: [{ value: 'build', label: 'Findable Build — a new website built and optimised for AI visibility' }, { value: 'optimise', label: 'Findable Optimise — improve their current website' }] },
  { key: 'decision_maker', text: 'Are they authorised to make this decision for the business?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { key: 'access', text: 'Can Findable get access to their current website (its CMS / admin)?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  { key: 'manager', text: 'Who currently looks after their website?', options: [{ value: 'owner', label: 'They manage it themselves' }, { value: 'freelancer', label: 'Freelancer / individual developer' }, { value: 'agency', label: 'Agency' }, { value: 'no_website', label: 'No website' }, { value: 'not_sure', label: 'Not sure' }, { value: 'employee', label: 'Employee', legacy: true }, { value: 'third_party', label: 'Other third party', legacy: true }] },
  { key: 'agency_contract', text: 'Are they still tied into a contract with them?', options: [{ value: 'in_contract', label: 'Yes — still in contract' }, { value: 'free', label: 'No — free to move' }, { value: 'not_sure', label: 'Not sure' }] },
  /* Legacy / Details tab only since 2026-10-07: never asked by the close. */
  { key: 'approach', text: 'What do they want for their website?', options: (Object.keys(APPROACH_LABEL) as QcApproach[]).map((k) => ({ value: k, label: APPROACH_LABEL[k] })) },
  { key: 'rights', text: 'Do they own, or have permission to reuse, the design and content from their current website?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'design_owner', text: "Who owns the current site's design and code?", options: [{ value: 'business', label: 'The business' }, { value: 'agency', label: 'An agency, platform or template provider' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'domain', text: 'Who has control of their web address (domain)?', detail: ['This is separate from the website itself: they can keep their web address and still get a new Build site.'], options: [{ value: 'yes', label: 'They do' }, { value: 'agency', label: 'Agency / developer' }, { value: 'not_sure', label: 'Not sure' }, { value: 'no_domain', label: 'No domain yet' }, { value: 'no', label: 'They do not control it', legacy: true }] },
  /* Legacy: never asked since v2, still a valid stored answer on rows saved before. */
  { key: 'authority', text: 'If an agency or third party manages the site, do you have the authority to replace, move or materially change the website?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }, { value: 'not_applicable', label: 'Not applicable' }] },
  /* Asked ONLY on Build. The three consents the new site cannot go ahead without, read out as written. */
  { key: 'build_consents', text: 'For the new website, can they confirm all three?', detail: BUILD_CONSENTS,
    options: [{ value: 'yes', label: 'Yes — they confirm all three' }, { value: 'not_yet', label: 'Not yet' }] },
];

/** The commercial consequence of a route, as the rep sees it the moment it is chosen. From the
 *  constants — the rep can change none of it (price, count, cadence, discount).
 *  🔴 M-011 (2026-10-04): the MINIMUM TERM is said before the link, not discovered at checkout.
 *  ⛔ E2E-11 (2026-10-05): the start is the v3 Option B words (MONTHLY_START_V3_WORDS, as the script and
 *  offerSummaryFor) — never "six weeks after sign-up", which contradicted the agreement the client signs. */
export function routeTermsLines(route: ServiceRoute): string[] {
  return [
    `£${FINDABLE_SETUP_PRICE_GBP} today`,
    `Then £${FINDABLE_MONTHLY_GBP} a month, starting ${MONTHLY_START_V3_WORDS}`,
    `${totalPaymentsFor(route)} payments in total, today's included — a ${termMonthsFor(route)}-month minimum term`,
    /* 2026-10-07: what happens after the payments, per plan (planTerms.ts — Optimise ends, Build may continue). */
    afterTermRepLine(route),
  ];
}

/* ══ THE OFFER THAT FITS (2026-10-07) — the ONE rule for the agency contract ═════════════════════════════
   Read by the Call screen's Offer, Quick Close step 1 and the gate's review backstop. */
/** The managers that mean someone OUTSIDE the business runs the site (the contract question applies). */
export const THIRD_PARTY_MANAGERS: readonly string[] = ['agency', 'freelancer', 'third_party'];
export const thirdPartyManaged = (a: QuickCloseAnswers): boolean => !!a.manager && THIRD_PARTY_MANAGERS.includes(a.manager);
/** 🔴 FINAL PASS (Paul, 2026-10-07): BUILD IS THE DEFAULT. The ONLY thing that moves the RECOMMENDATION to
 *  Optimise is a genuine contractual blocker: an agency / developer runs the site AND they are still tied into
 *  the contract (agencyContractTiedIn — a positive match on 'in_contract'). "Not sure" or "not asked" never
 *  recommends Optimise: it keeps Build and warns. A website, a domain held elsewhere, or no right to reuse the
 *  current design never blocks Build. */
export const agencyContractTiedIn = (a: QuickCloseAnswers): boolean => thirdPartyManaged(a) && a.agency_contract === 'in_contract';
/** THE PAYMENT STOP (unchanged since 2026-10-07 morning): a Build on an agency-run site stops for Paul's release unless
 *  the contract is confirmed FREE — still in contract, or not sure. ⛔ Positive match on 'free'. */
export const agencyContractBlocksBuild = (a: QuickCloseAnswers): boolean => thirdPartyManaged(a) && a.agency_contract !== 'free';
/** A third party runs the site and nobody has confirmed the contract is over (not sure, or not asked yet). */
export const agencyContractUnconfirmed = (a: QuickCloseAnswers): boolean => thirdPartyManaged(a) && a.agency_contract !== 'in_contract' && a.agency_contract !== 'free';
export const CONFIRM_CONTRACT_WARNING = 'Confirm their agency contract before finalising Build.';
/** The rep's helper lines (never shown to the client). ⛔ No promise of an identical clone when rights are unclear. */
export const BUILD_TECH_BASE_LINE = 'Build gives us a clean technical base to work from.';
export const DOMAIN_NOT_WEBSITE_LINE = 'Keeping their domain is not the same as keeping their website — they can keep their web address and still get a new Build site.';
export const REUSE_YES_LINE = 'We can keep the new site very close to the look they already like if they want.';
export const REUSE_NO_LINE = "We'll build an original site rather than copy their current one.";
export interface OfferFit {
  /** The plan to put first (null = either fits equally). */
  recommended: ServiceRoute | null;
  /** May a SALESPERSON offer / pick this plan? (Paul — the admin — may still choose Build; it then stops for his release.) */
  offered: Record<ServiceRoute, boolean>;
  /** One line for the rep explaining the recommendation (never shown to the client). */
  reason: string | null;
  /** A caution to show beside the recommendation (the contract is unconfirmed). Null when there is none. */
  warning: string | null;
  /** Short helper lines for the rep: the domain is not the website, what the reuse answer means. */
  notes: string[];
}
export function offerFit(a: QuickCloseAnswers, hasWebsite: boolean): OfferFit {
  if (!hasWebsite || a.manager === 'no_website') {
    return { recommended: 'build', offered: { build: true, optimise: false }, reason: 'No website of their own — Optimise needs one to work on, so the offer is Build.', warning: null, notes: [] };
  }
  /* The ONE positive blocker: an agency / third party runs the site AND the contract is confirmed still on. */
  if (agencyContractTiedIn(a)) {
    return {
      recommended: 'optimise', offered: { build: false, optimise: true },
      reason: "They're still in contract with the agency that runs their site — offer Optimise, so they're not paying for two websites.",
      warning: null, notes: [DOMAIN_NOT_WEBSITE_LINE],
    };
  }
  /* 🔴 BUILD IS THE DEFAULT (Paul, 2026-10-07). Owning, keeping or having access to a website is NEVER a reason for
     Optimise — the preferred outcome is a new Findable website. Optimise is recommended ONLY on the positive blocker
     above (an agency / third party runs the site and the contract is confirmed still on). Unknown contract status
     (not asked, or "not sure") keeps Build, with the rep told to confirm before closing; that Build then still has to
     answer the contract question (closeFlow) and, if the answer is "not sure" / "in contract", stops for Paul. */
  const notes: string[] = [BUILD_TECH_BASE_LINE];
  if (a.rights === 'yes') notes.push(REUSE_YES_LINE);
  else if (a.rights === 'no' || a.rights === 'not_sure') notes.push(REUSE_NO_LINE);
  notes.push(DOMAIN_NOT_WEBSITE_LINE);
  return {
    recommended: 'build', offered: { build: true, optimise: true }, reason: buildDefaultReason(a),
    warning: agencyContractUnconfirmed(a) ? CONFIRM_CONTRACT_WARNING : null, notes,
  };
}
/** The one line for the rep when Build is the recommendation (never shown to the client). */
export const BUILD_DEFAULT_REASON =
  "Build is usually the best route. Use Optimise if they need to keep their current website because they're still tied into an existing agency contract.";
export const AGENCY_CONTRACT_UNCONFIRMED_REASON =
  "An agency runs their site. Build is usually the best route, but confirm whether they're still in contract before you close. If they are, offer Optimise.";
function buildDefaultReason(a: QuickCloseAnswers): string {
  if (thirdPartyManaged(a)) return a.agency_contract === 'free' ? 'Their agency contract has ended, so Build is the route: a new website they own.' : AGENCY_CONTRACT_UNCONFIRMED_REASON;
  return BUILD_DEFAULT_REASON;
}

/** The answers a plan choice saves (step 1). The plan is stated explicitly; a legacy approach that would
 *  contradict it is replaced (Optimise = improve; Build keeps a Build approach, else "Findable recommends"). */
export function routeChoiceAnswers(a: QuickCloseAnswers, route: ServiceRoute): QuickCloseAnswers {
  if (route === 'optimise') return { route, approach: 'improve' };
  const keep = a.approach && a.approach !== 'unsure' && a.approach !== 'improve' ? a.approach : 'unsure';
  return { route, approach: keep };
}

/* ══ WHAT THE CALL SCREEN HEARD (2026-10-07) — free text kept beside the answers, never re-asked ══════════ */
export interface QcCallNotes {
  /** "Which jobs would you most like more of?" */
  jobs?: string | null;
  /** "Which towns or areas matter most to you?" */
  areas?: string | null;
  /** What they pay their agency a month, roughly (£). */
  agency_monthly_gbp?: number | null;
}
export const CALL_NOTE_MAX = 300;
/** Only known keys survive; text is clipped; the spend is a sane positive number or nothing. */
export function cleanCallNotes(raw: unknown): QcCallNotes {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: QcCallNotes = {};
  for (const k of ['jobs', 'areas'] as const) {
    const v = r[k];
    if (typeof v === 'string') { const t = v.replace(/\s+/g, ' ').trim().slice(0, CALL_NOTE_MAX); if (t) out[k] = t; }
  }
  const m = r.agency_monthly_gbp;
  const n = typeof m === 'number' ? m : typeof m === 'string' && m.trim() !== '' ? Number(m.replace(/[£,\s]/g, '')) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 100_000) out.agency_monthly_gbp = Math.round(n * 100) / 100;
  return out;
}
/** "Kitchen fitting and extensions, bathrooms" → ["Kitchen fitting", "extensions", "bathrooms"] — the list the
 *  lead's services / areas fields hold. Deduplicated (case-insensitive), at most 12 items of 80 characters. */
export function splitCallList(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(text ?? '').split(/[,;\n/]+|\s+(?:and|&)\s+/i)) {
    const t = part.replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.]+$/g, '').trim().slice(0, 80);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}
/* ══ THE TWO WAYS TO CLOSE (2026-10-07, fix/quick-close-two-options) ═══════════════════════════════════════
   CLOSE ON THE PHONE — the salesperson asks, then sends the Agreement & Payment link (the client confirms a short
   summary, signs, pays). SEND FULL SETUP — the client answers the same short questions themselves on their own
   link, then agreement, then payment. ONE underlying sign-up either way: the same onboarding row, the same agreement
   link, the same checkout. The route is a DERIVED fact — a row Quick Close holds (answers saved) is assisted, a row
   the client made alone is self-serve — and the phone route also stamps `close_route` when its link is made. */
export type CloseRoute = 'phone' | 'full_setup';
/** What a phone close must know about the business before the link: what they offer and where they want to be
 *  found (the same two call notes the Call screen saves). ⛔ Positive: both present, or it is not complete. */
export function phoneCloseNotesComplete(call: QcCallNotes | null | undefined): boolean {
  const c = cleanCallNotes(call);
  return splitCallList(c.jobs).length > 0 && splitCallList(c.areas).length > 0;
}
/** assisted (a salesperson's answers are on the row) → 'phone'; otherwise the client is doing it themselves. */
export function closeRouteOf(qc: { answers?: unknown } | null | undefined): CloseRoute {
  const a = qc?.answers;
  return a && typeof a === 'object' && Object.keys(a as object).length > 0 ? 'phone' : 'full_setup';
}

/** The call answers as label / answer lines (handoff, intake, Paul's email). Only what was answered. */
export type CallLineKey = 'manager' | 'agency_contract' | 'agency_monthly_gbp' | 'jobs' | 'areas' | 'decision_maker';
export function callNotesLines(a: QuickCloseAnswers, n: QcCallNotes | null | undefined): { key: CallLineKey; label: string; answer: string }[] {
  const c = cleanCallNotes(n);
  const out: { key: CallLineKey; label: string; answer: string }[] = [];
  if (a.manager) out.push({ key: 'manager', label: 'Website run by', answer: answerLabel('manager', a.manager) });
  if (a.agency_contract) out.push({ key: 'agency_contract', label: 'Agency contract', answer: answerLabel('agency_contract', a.agency_contract) });
  if (c.agency_monthly_gbp !== undefined && c.agency_monthly_gbp !== null) out.push({ key: 'agency_monthly_gbp', label: 'Pays the agency', answer: `about £${c.agency_monthly_gbp} a month` });
  if (c.jobs) out.push({ key: 'jobs', label: 'Jobs they want more of', answer: c.jobs });
  if (c.areas) out.push({ key: 'areas', label: 'Areas that matter most', answer: c.areas });
  if (a.decision_maker) out.push({ key: 'decision_maker', label: 'Decision maker on the call', answer: a.decision_maker === 'yes' ? 'Yes' : 'No — someone else decides' });
  return out;
}

/** The short count line used on the route buttons. */
export const routePaymentsShort = (route: ServiceRoute) => `${totalPaymentsFor(route)} payments · ${termMonthsFor(route)}-month minimum`;

/** Who owns the website, per route, in the REP's words (findableOffer.ts's TWO ROUTES note is the source:
 *  a site Findable builds transfers once the term is complete and paid; Optimise never takes a site over). */
export function routeOwnershipLine(route: ServiceRoute): string {
  return route === 'build'
    ? 'Findable builds, hosts and manages a new website for them.'
    : 'They keep their existing website — it stays theirs. Findable works on it with their access.';
}

/** The guarantee, as Paul says it (findable.live's headline), followed by the exact terms it is judged on
 *  (FINDABLE_GUARANTEE, byte-locked — never paraphrased). ⛔ No ranking, recommendation or citation is
 *  promised, and no hedge sits beside it (CLAUDE.md §1). */
export const QUICK_CLOSE_PROMISE = 'We improve AI visibility or you get your money back.';
export const QUICK_CLOSE_GUARANTEE_LINES: readonly string[] = [QUICK_CLOSE_PROMISE, FINDABLE_GUARANTEE];

/** M-011 → v3 (2026-10-05): the client signs the agreement on the sign-up link before payment can open
 *  (findable-checkout refuses a Stripe session without that signature — src/lib/signupGate.ts). */
export const QUICK_CLOSE_AGREEMENT_LINE = 'On the sign-up link they read and sign the Client Service Agreement — payment only opens after they sign.';

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
  /* 2026-10-07: the plan is chosen directly (step 1). A plan sent on its own brings the approach that agrees
     with it, so a stored legacy approach can never silently flip the plan back. */
  if (inc.route && inc.approach === undefined) Object.assign(inc, routeChoiceAnswers(prev, inc.route));
  const merged: QuickCloseAnswers = { ...prev, ...inc };
  /* Consents read with one wording do not carry over to another (No domain / pending / standard). */
  if (prev.build_consents && inc.build_consents === undefined
    && buildConsentsWording(cleanAnswers(merged)) !== buildConsentsWording(prev)) delete merged.build_consents;
  return cleanAnswers(merged);
}

/** Only known values survive, and the cross-answer rules hold. Run it on a COMPLETE set (mergeAnswers).
 *  v2: a known approach DECIDES the route (APPROACH_ROUTE); only "unsure" keeps an explicitly picked one. */
export function cleanAnswers(raw: unknown): QuickCloseAnswers {
  const out = pickAnswers(raw);
  if (out.approach && out.approach !== 'unsure') out.route = withRoute(out).route;
  // An Optimise route for a business with no website is not an answer (there is nothing to optimise).
  if (out.route && !routeAvailable(out, out.route)) {
    delete out.route;
    if (out.approach === 'improve') delete out.approach;
  }
  // The Build consents belong to Build: on any other route (or none) they are not an answer.
  if (out.route !== 'build') delete out.build_consents;
  return out;
}

/** THE one derivation of the plan from the approach (cleanAnswers stores it; every rule below reads it through
 *  this, so a raw answer set and a cleaned one can never be judged differently). */
export function withRoute(a: QuickCloseAnswers): QuickCloseAnswers {
  return a.approach && a.approach !== 'unsure' ? { ...a, route: APPROACH_ROUTE[a.approach] } : a;
}

/** Which questions still need an answer (2026-10-07: the offer, then only what money / delivery needs). An
 *  answer the CALL screen already saved is never asked again. ⛔ Legacy answers (approach sub-type, rights,
 *  design owner, domain, Build consents) stay stored and readable, and are no longer required. */
export function missingQuestions(raw: QuickCloseAnswers): QcKey[] {
  const a = withRoute(raw);
  return closeFlow(a).filter((k) => !a[k] || (a[k] as string) === 'not_applicable');
}

/** What only the CHOSEN plan adds after the plan question. ⛔ Build never asks for current-site access.
 *  Optimise works on their site, so it asks whether Findable can get in. */
export function routeQuestions(raw: QuickCloseAnswers): QcKey[] {
  return withRoute(raw).route === 'optimise' ? ['access'] : [];
}

/** 🔴 THE CLOSE, IN ORDER (final pass, 2026-10-07; TWO OPTIONS, 2026-10-07): authority → who looks after the site →
 *  (only if an agency or freelancer does) the contract → domain control → [what they offer and where — saved as the
 *  call notes, see phoneCloseNotesComplete] → THE PLAN, LAST → (Optimise only) access. The "may we reuse your
 *  current design" question is no longer asked (Build is the default; it never changed the plan). Fewer when the Call
 *  screen already saved the answers (missingQuestions). No registrar, DNS / CMS / hosting logins, logos, photos or
 *  contract dates: those belong to the paid client's onboarding form. */
export function closeFlow(raw: QuickCloseAnswers): QcKey[] {
  const a = withRoute(raw);
  const flow: QcKey[] = ['decision_maker', 'manager'];
  if (thirdPartyManaged(a)) flow.push('agency_contract');
  flow.push('domain');
  flow.push('route');
  flow.push(...routeQuestions(a));
  return flow;
}

/** The route an answer WOULD give (for the "this changes the payments" confirmation before saving it). */
export function routeAfterAnswer(a: QuickCloseAnswers, key: QcKey, value: string): ServiceRoute | null {
  if (key === 'approach') return value !== 'unsure' && value in APPROACH_ROUTE ? APPROACH_ROUTE[value as Exclude<QcApproach, 'unsure'>] : (a.route ?? null);
  if (key === 'route') return value === 'build' || value === 'optimise' ? value : (a.route ?? null);
  return a.route ?? null;
}

/** The one confirmation for an answer that switches Build ⇄ Optimise (the money changes). */
export function routeSwitchText(from: ServiceRoute, to: ServiceRoute, hasLink: boolean): string {
  const extra = [hasLink ? 'The current sign-up link will be remade for the new route.' : '', from === 'build' ? 'The Build consents will be cleared.' : ''].filter(Boolean).join(' ');
  return `Switch to ${SERVICE_ROUTE_NAME[to]}? That is ${totalPaymentsFor(to)} payments in total instead of ${totalPaymentsFor(from)}. ${extra}`.trim();
}

/** "Paul review required" — the PAYMENT STOP. Since v2 only Optimise work on a site we cannot get into
 *  (that route IS work on their site). The domain / rights reasons of the old gate are gone from here;
 *  the legacy authority answers still stop an Optimise on a site an agency runs. */
export type QcReviewReason = 'third_party_no_authority' | 'third_party_authority_unsure' | 'no_site_access' | 'optimise_access_unsure' | 'agency_contract_build';
export const QC_REVIEW_TEXT: Record<QcReviewReason, string> = {
  agency_contract_build: 'Build chosen, but an agency / developer runs their website and they are still tied into a contract with them (or not sure) — a new website now could mean paying two providers. Optimise is the normal route here',
  third_party_no_authority: 'An agency / third party runs the site and they do not have authority to let Findable change it',
  third_party_authority_unsure: 'An agency / third party runs the site and authority to let Findable change it is unclear',
  no_site_access: 'Optimise works on their current website, and they could not give Findable access to it',
  optimise_access_unsure: 'Optimise chosen, but an agency / third party runs the site and access to it is not confirmed',
};
/** The payment-stop panel's heading (was "DOMAIN / AGENCY ISSUE" — the domain no longer stops a sale). */
export const QC_REVIEW_HEADING = 'WEBSITE ACCESS ISSUE — Paul review required';

/** For Paul, NEVER a payment stop: settled after payment, carried in the handoff and shown on Close. */
export type QcPaulFlag = 'domain_handoff' | 'exact_copy_rights';
export function paulFlagText(f: QcPaulFlag, a: QuickCloseAnswers): string {
  if (f === 'exact_copy_rights') {
    return 'A close recreation was asked for, but the right to reproduce the current site is not confirmed — '
      + `delivery is planned as “${APPROACH_LABEL[deliveryApproach(a)]}” unless Paul confirms the rights. Never promise an exact copy.`;
  }
  if (a.domain === 'no') return 'Domain handoff to resolve before launch — they do not control their domain. The site can be built and previewed; it goes live once they get control, an authorised provider makes the DNS change, or a different domain is agreed.';
  if (a.domain === 'agency') return 'Domain handoff to resolve before launch — an agency / provider controls the domain. The site can be built and previewed; going live needs them (or the business) to authorise the DNS change.';
  return 'Domain handoff to resolve before launch — not sure who controls the domain. The site can be built and previewed meanwhile.';
}

/** The delivery approach Findable will actually use. ⛔ An exact copy only when the business owns what is
 *  being reproduced — the content AND the design / code; otherwise a visual refresh (content theirs) or
 *  the Findable template. Never a promise to copy third-party-owned code or design. */
export function deliveryApproach(a: QuickCloseAnswers): QcApproach {
  if (a.approach !== 'recreation') return a.approach ?? 'unsure';
  if (a.rights !== 'yes') return 'new_template';
  return a.design_owner === 'business' ? 'recreation' : 'refresh';
}

export interface QuickCloseGate {
  complete: boolean;
  missing: QcKey[];
  /** A decision-maker "No": payment is never generated. */
  blocked: boolean;
  /** Optimise on a site we cannot get into: flagged for Paul; payment waits for his release. */
  review: QcReviewReason[];
  /** For Paul after payment — never a stop. */
  flags: QcPaulFlag[];
  /** Things to settle after payment — shown in the handoff, never a stop. */
  notes: string[];
  /** Build chosen and the three consents are not confirmed: no link until they are. */
  consentsNeeded: boolean;
}

export function quickCloseGate(raw: QuickCloseAnswers): QuickCloseGate {
  const a = withRoute(raw);
  const missing = missingQuestions(a);
  const review: QcReviewReason[] = [];
  const flags: QcPaulFlag[] = [];
  const notes: string[] = [];
  if (a.route === 'optimise') {
    /* ⛔ OPTIMISE IS NEVER SILENTLY SAFE ON A SITE WE CANNOT GET INTO (Paul, 2026-09-29): the whole route is
       work on that site. */
    if (a.access === 'no') review.push('no_site_access');
    if (thirdPartyManaged(a)) {
      if (a.authority === 'no') review.push('third_party_no_authority');
      else if (a.authority === 'not_sure') review.push('third_party_authority_unsure');
      if (a.access !== 'yes' && a.access !== 'no') review.push('optimise_access_unsure');
    }
    if (a.access === 'not_sure' && !thirdPartyManaged(a)) notes.push('Website access to be confirmed after payment');
    if (a.manager === 'not_sure') notes.push('Who manages the website is to be confirmed');
    if (thirdPartyManaged(a) && a.access === 'yes') notes.push('An agency / third party runs the site; the client says Findable can get access');
  }
  if (a.route === 'build') {
    /* ⛔ THE AGENCY-CONTRACT RULE's backstop (offerFit): Build on a site an agency runs while they are still
       tied in stops for Paul — he can release it; a salesperson is never shown Build for these answers. */
    if (agencyContractBlocksBuild(a) && a.agency_contract) review.push('agency_contract_build');
    if (domainPending(a)) flags.push('domain_handoff');
    if (a.approach === 'recreation' && (a.rights !== 'yes' || a.design_owner !== 'business')) flags.push('exact_copy_rights');
    if (a.approach === 'refresh' && a.rights && a.rights !== 'yes') notes.push('Reuse only content, branding and photos the business owns — replace anything else');
    if (a.domain === 'no_domain') notes.push('No domain yet — the business registers one in its own name');
  }
  /* 2026-10-07: the three Build consents are no longer asked on the call (the signed agreement covers them;
     the onboarding form collects the practical domain / materials answers) — so they never hold the link. */
  return { complete: missing.length === 0, missing, blocked: a.decision_maker === 'no', review, flags, notes, consentsNeeded: false };
}

/** The canonical onboarding columns these answers set (the same ones the self-service form writes). */
export function onboardingColumnsFor(raw: QuickCloseAnswers): Record<string, unknown> {
  const a = withRoute(raw);
  const out: Record<string, unknown> = {};
  if (a.domain === 'yes' || a.domain === 'no' || a.domain === 'not_sure') { out.domain_status = 'existing'; out.domain_owned = a.domain; }
  if (a.domain === 'agency') { out.domain_status = 'existing'; out.domain_owned = 'not_sure'; out.domain_third_party = 'yes'; }
  if (a.domain === 'no_domain') { out.domain_status = 'new'; out.domain_owned = null; }
  if (a.rights === 'yes' || a.rights === 'no' || a.rights === 'not_sure') out.site_rights = a.rights;
  if (thirdPartyManaged(a)) out.website_manager = 'web_company';
  else if (a.manager === 'owner' || a.manager === 'employee') out.website_manager = a.access === 'yes' ? 'direct_access' : 'owner_only';
  if (a.manager === 'no_website') out.website_platform = 'no_website';
  if (a.authority === 'yes') out.authority_confirmed = true;
  else if (a.authority === 'no') out.authority_confirmed = false;
  /* THE ROUTE, IN THE SAME TWO COLUMNS THE SELF-SERVICE FORM WRITES (plan_tier + website_addon, from
     one decision), so the checkout reads one interpretation whichever path made the sale. An unset
     route writes NOTHING — never a default. */
  if (a.route) { out.plan_tier = planTierForRoute(a.route); out.website_addon = a.route === 'build'; }
  /* The Build consents land in the SAME columns the self-service domain pages write. Authority is never
     turned into a yes over an explicit 'no' / 'not sure' to the authority question, nor while the domain is
     still to be handed over (v2: the pending consent does not say they control it). */
  if (a.route === 'build' && a.build_consents === 'yes') {
    out.dns_permission = true; out.materials_confirmed = true;
    if (a.authority !== 'no' && a.authority !== 'not_sure' && !domainPending(a)) out.authority_confirmed = true;
  }
  return out;
}

/** The four situation facts the client may confirm or correct before paying. ⛔ Never the plan (route / approach),
 *  the authority answer, the consents or anything that sets money — those stay the salesperson's record. */
export const CLIENT_CONFIRMABLE_KEYS = ['manager', 'agency_contract', 'domain', 'rights'] as const;
export type ClientConfirmKey = typeof CLIENT_CONFIRMABLE_KEYS[number];
export interface ClientConfirmed { at: string; answers: QuickCloseAnswers; changed: QcKey[] }

/** The answers the rules judge: the salesperson's, with the client's own confirmation laid over the four
 *  situation facts. ⛔ The plan can never come from the client: only CLIENT_CONFIRMABLE_KEYS are read. */
export function effectiveAnswers(qc: QuickCloseRecord | null | undefined): QuickCloseAnswers {
  const base = cleanAnswers(qc?.answers);
  const c = qc?.client_confirmed?.answers;
  if (!c) return base;
  const over = pickAnswers(c) as Record<string, string | undefined>;
  const merged: Record<string, unknown> = { ...base };
  for (const k of CLIENT_CONFIRMABLE_KEYS) if (over[k] !== undefined) merged[k] = over[k];
  return cleanAnswers(merged);
}

export type QuickCloseState = 'not_started' | 'in_progress' | 'blocked' | 'consents_needed' | 'needs_review' | 'ready' | 'link_generated' | 'link_expired' | 'paid';
/** One record of the link being handed to the prospect (M-015). `channel` says HOW; a copy is recorded as
 *  copied, never as sent — the app cannot know where it was pasted. */
export interface QcLinkShare { channel: 'copy' | 'email' | 'whatsapp'; at: string; by: string | null; to?: string | null; status?: string | null; session?: string | null;
  /** The link this share carried (sign-up links have no Stripe session, so this is what a resend is judged on). */
  link?: string | null;
  /** The WhatsApp template it went as (findable_signup_link), or null for a normal message in an open conversation. */
  template?: string | null }
export interface QuickCloseRecord {
  answers?: QuickCloseAnswers | null; review_approved_at?: string | null; link_url?: string | null; link_generated_at?: string | null;
  /** The Stripe Checkout Session behind link_url (so a superseded one can be expired) and when Stripe closes it. */
  link_session_id?: string | null; link_expires_at?: string | null;
  /** 🔴 v3 (2026-10-05): 'signup' = the client's sign-up link (their agreement page; Stripe is reached only
   *  after they sign). Anything else — a link stored before v3 — is a naked Stripe URL and is NEVER usable. */
  link_kind?: 'signup' | null;
  link_shared?: QcLinkShare[] | null;
  /** What the CALL screen heard (2026-10-07): jobs, areas, agency spend — cleanCallNotes. */
  call?: QcCallNotes | null;
  /** 🔴 FINAL PASS (2026-10-07): what the CLIENT confirmed or corrected on their own sign-up page before payment
   *  (the four situation facts only — never the plan, the price or the seller). Written by fn findable-onboarding
   *  (action sales_confirm) through salesSignup.planClientConfirmation; read through effectiveAnswers. */
  client_confirmed?: ClientConfirmed | null;
  /** Optimistic-concurrency counter: every write to quick_close is conditional on it (fn quick-close). */
  rev?: number | null;
}
export const QUICK_CLOSE_STATE_LABEL: Record<QuickCloseState, string> = {
  not_started: 'Not started', in_progress: 'In progress', blocked: 'Decision maker needed', consents_needed: 'Build consents needed', needs_review: 'Paul review required',
  ready: 'Ready for the link', link_generated: 'Agreement & payment link ready', link_expired: 'Link expired', paid: 'Paid',
};

/** 🔴 THE SIGN-UP LINK (v3 Client Service Agreement, 2026-10-05). What a salesperson sends is ONE link:
 *  findable.live/agree/<token> — the client checks their details, reads and signs the agreement, then pays.
 *  It carries no Stripe session, so it does not run out after a day; findable-checkout stamps it with this
 *  lifetime so a link left unused for a month is remade (re-running every refusal) rather than trusted. */
export const SIGNUP_LINK_LIFETIME_MS = 30 * 24 * 3_600_000;
const isSignupLink = (qc: QuickCloseRecord | null | undefined) => qc?.link_kind === 'signup';

/** A Stripe Checkout Session is good for 24 hours from creation (findable-checkout sets no other expiry). */
export const STRIPE_SESSION_LIFETIME_MS = 24 * 3_600_000;
/** A link is shown as usable (and reused) only while it has at least this long left — a rep never sends a
 *  link the client cannot open tonight. */
export const LINK_MIN_LEFT_MS = 4 * 3_600_000;

/** How long the rep has left to send a link, in human words (final release, 2026-10-05): "about 30 days", never
 *  "about 715 hours". Two days or more → days (rounded); an hour or more → hours; else "within the hour". Pure. */
export function linkTimeLeftWords(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return 'expired';
  const DAY = 86_400_000;
  if (msLeft >= 2 * DAY) return `send it within about ${Math.round(msLeft / DAY)} days`;
  const h = Math.floor(msLeft / 3_600_000);
  return h >= 1 ? `send it within about ${h} hour${h === 1 ? '' : 's'}` : 'send it within the hour';
}

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
  if (!Number.isFinite(gen) || exp === null || !isSignupLink(qc)) return null;
  return Math.min(gen + SIGNUP_LINK_LIFETIME_MS, exp - LINK_MIN_LEFT_MS);
}

/** 🔴 M-014 (2026-10-04): IS THE STORED LINK SAFE TO HAND OVER RIGHT NOW? A link is never "ready" just
 *  because a URL is stored: it must be younger than LINK_REUSE_MS and have LINK_MIN_LEFT_MS before
 *  Stripe closes it. ⛔ Positive: no link, no time, an unreadable time — all NOT usable. */
export function linkUsable(qc: QuickCloseRecord | null | undefined, nowMs: number = Date.now()): boolean {
  if (!qc?.link_url || !qc.link_generated_at) return false;
  /* ⛔ v3: a stored Stripe URL (made before the agreement-first flow) is never handed over again — the
     next press makes the sign-up link and closes that Stripe session (adoptLink → replaced). */
  if (!isSignupLink(qc)) return false;
  const gen = Date.parse(qc.link_generated_at);
  if (!Number.isFinite(gen) || nowMs - gen >= SIGNUP_LINK_LIFETIME_MS || nowMs < gen - 60_000) return false;
  const exp = linkExpiresAtMs(qc);
  return exp !== null && exp - nowMs >= LINK_MIN_LEFT_MS;
}

/** DERIVED, NEVER STORED: from the row's paid status, the saved Quick Close record and the clock. */
export function quickCloseState(rowStatus: string | null | undefined, qc: QuickCloseRecord | null | undefined, nowMs: number = Date.now()): QuickCloseState {
  if (rowStatus === 'paid') return 'paid';
  if (!qc || !qc.answers || Object.keys(cleanAnswers(qc.answers)).length === 0) return 'not_started';
  const eff = effectiveAnswers(qc);
  /* ⛔ A CLIENT'S OWN CORRECTION IS JUDGED EVEN WHILE THE LINK STANDS (final pass, 2026-10-07): if what they
     confirmed makes the sale unsafe (Build while still tied into an agency contract, a decision-maker that is
     not them, an answer now missing), the sign-up holds for Paul — the link they already hold does not
     override it. Without a client confirmation the original order below is unchanged. */
  if (qc.client_confirmed) {
    const gc = quickCloseGate(eff);
    if (gc.blocked) return 'blocked';
    if (!gc.complete) return 'in_progress';
    if (gc.review.length && !qc.review_approved_at) return 'needs_review';
  }
  if (linkUsable(qc, nowMs)) return 'link_generated';
  const g = quickCloseGate(eff);
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
const SHORT_Q: Record<QcKey, string> = {
  decision_maker: 'Decision maker', approach: 'Website approach', domain: 'Domain controlled by', manager: 'Website managed by',
  access: 'Can give site access', authority: 'Authority to replace / move site', rights: 'Rights to reuse content / branding / photos',
  design_owner: 'Current design / code owned by', route: 'Website route', build_consents: 'Build consents (domain, DNS, content)',
  agency_contract: 'Agency contract',
};

/** The answered Quick Close questions as label / answer pairs (the Paid Client intake shows them). Pure. */
export function quickCloseAnswerPairs(a: QuickCloseAnswers): { key: QcKey; label: string; answer: string }[] {
  return QUICK_CLOSE_QUESTIONS.filter((q) => !!a[q.key]).map((q) => ({ key: q.key, label: SHORT_Q[q.key], answer: answerLabel(q.key, a[q.key]) }));
}

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
  /* Only the questions that were part of this sale (an unanswered legacy key is noise in Paul's email). */
  for (const q of QUICK_CLOSE_QUESTIONS) if (a[q.key] || q.key === 'decision_maker' || q.key === 'approach') out.push(`  ${SHORT_Q[q.key]}: ${answerLabel(q.key, a[q.key])}`);
  if (a.route) out.push(`  Sold as: ${SERVICE_ROUTE_NAME[a.route]} — ${totalPaymentsFor(a.route)} payments in total`);
  if (a.approach === 'recreation') out.push(`  Delivery approach: ${APPROACH_LABEL[deliveryApproach(a)]}`);
  if (g.review.length) out.push(`  WEBSITE ACCESS ISSUE: ${g.review.map((r) => QC_REVIEW_TEXT[r]).join('; ')}${i.qc.review_approved_at ? ` (you released it${i.qc.review_note ? `: ${i.qc.review_note}` : ''})` : ''}`);
  for (const f of g.flags) out.push(`  FOR PAUL: ${paulFlagText(f, a)}`);
  for (const n of g.notes) out.push(`  Note: ${n}`);
  const c = i.contact;
  const contact = [c.name, c.email, c.phone, c.website].filter((x) => x && String(x).trim()).join(' · ');
  if (contact) out.push(`  Contact: ${contact}`);
  if (i.campaign || i.leadSource) out.push(`  Campaign / source: ${[i.campaign, i.leadSource].filter(Boolean).join(' · ')}`);
  if (i.latestNote) out.push(`  Sales note: ${i.latestNote.slice(0, 300)}`);
  if (i.latestMessages.length) out.push(`  Latest WhatsApp: ${i.latestMessages.map((m) => `${m.direction === 'inbound' ? 'Them' : 'Us'}: ${(m.body ?? '[media]').replace(/\s+/g, ' ').slice(0, 140)}`).join(' | ')}`);
  /* The call's free-text answers (the enumerated ones are already in the question lines above). */
  for (const l of callNotesLines(a, (i.qc as QuickCloseRecord).call)) if (l.key === 'jobs' || l.key === 'areas' || l.key === 'agency_monthly_gbp') out.push(`  ${l.label}: ${l.answer}`);
  out.push('  Still to collect after payment: anything the onboarding form shows as missing (Paid Clients → Send onboarding).');
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
  if (k === 'route' && a.approach && a.approach !== 'unsure') return `The plan follows the website approach (${APPROACH_LABEL[a.approach]}) — change the approach to change the plan.`;
  if (k === 'route' || k === 'approach') return 'Optimise needs a website to work on — with no website only Findable Build is possible.';
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
  const answers = mergeAnswers(prev, rawIncoming);
  /* v2: the approach can move the route (improve → Optimise, a new site → Build), so the change is judged on
     the MERGED answers, not only on a route the screen sent. Build ⇄ Optimise is never a stray tap. */
  const routeChange = !!(prev.route && answers.route && answers.route !== prev.route);
  if (routeChange && o.routeChangeConfirmed !== true) {
    return { ok: false, error: 'route_change_unconfirmed', detail: 'Changing the route changes the number of payments. Confirm the change to switch.' };
  }
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
  ours: { url: string; session: string | null; expiresIso: string; kind?: 'signup' | null }, actorId: string, nowIso: string, nowMs: number = Date.now(),
): AdoptStep {
  if (rowStatus === 'paid') return { kind: 'paid' };
  if (answersKey(fresh?.answers) !== claimedAnswersKey) return { kind: 'answers_changed' };
  if (linkUsable(fresh, nowMs) && fresh!.link_url !== ours.url) return { kind: 'other_won' };
  const replaced = fresh?.link_url ? ((fresh.link_session_id as string | null | undefined) ?? stripeSessionIdFromUrl(fresh.link_url)) : null;
  return {
    kind: 'store', replaced: replaced && replaced !== ours.session ? replaced : null,
    next: { ...(fresh ?? {}), link_url: ours.url, link_session_id: ours.session, link_kind: ours.kind ?? null, link_generated_at: nowIso, link_generated_by: actorId, link_expires_at: ours.expiresIso, link_claimed_at: null, link_claimed_by: null },
  };
}

/* ── The words (editable by the rep; never a script to read word for word) ────────────────────────── */
/* 🔴 PER ROUTE (2026-09-29): the words name the route's own count, never both — the client has chosen.
   🔴 M-011 (2026-10-04): every version — the rep's card, the spoken words, the WhatsApp / copied message
   and the email — carries the price, the payment count, the MINIMUM TERM, who owns the website, the
   guarantee (QUICK_CLOSE_GUARANTEE_LINES) and the agreement tick, BEFORE the link is sent. One phrase for
   the timing (MONTHLY_START_V3_WORDS, as offerSummaryFor), no nested brackets (A-29).
   🔴 v3 (2026-10-05): the link is the SIGN-UP link — the client reads and signs the Client Service Agreement
   on it BEFORE paying (clause 1.2); the timing is the day after the refund window (5.6).
   🔴 2026-10-07 (Paul): what follows the payments is PER PLAN (planTerms.ts) — Optimise ends after its sixth
   payment; Build's £29.99 applies only if they want hosting / maintenance to continue. */
const priceSentence = (route: ServiceRoute) =>
  `£${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month starting ${MONTHLY_START_V3_WORDS} — ${totalPaymentsFor(route)} payments in total, so a ${termMonthsFor(route)}-month minimum term. ${afterTermClientWords(route)}`;
/** What happens on the link, in the client's words. */
export const SIGNUP_LINK_SENTENCE = "On the link you'll check your details, read and sign the Client Service Agreement, and then pay securely.";
/** The ownership sentence in the CLIENT's words ("you"). Same facts as routeOwnershipLine. */
const ownershipToClient = (route: ServiceRoute) => route === 'build'
  ? 'We build, host and manage a new website for you.'
  : 'You keep your own website — it stays yours, and we work on it.';
const AFTER_PAYMENT_SENTENCE = "Once it's paid, Paul will be in touch within two working days to take over the setup — website, domain and access — and we take your baseline AI visibility measurement once we have the access we need.";

/** What the rep says once the route is chosen. ⛔ Not shown before a route exists (it would name no terms). */
export function quickCloseScript(route: ServiceRoute | null | undefined): string {
  if (!route) return '';
  return `I'll send you your sign-up link now. It's ${SERVICE_ROUTE_NAME[route]}: ${ownershipToClient(route)} ` +
    `It's ${priceSentence(route)} ${QUICK_CLOSE_PROMISE} ${FINDABLE_GUARANTEE} ` +
    `${SIGNUP_LINK_SENTENCE} ${AFTER_PAYMENT_SENTENCE} You don't need to sort any of that out today.`;
}

/** The greeting: the contact's first name when we have one, never the business's legal name (A-29). */
export function quickCloseGreeting(contactName: string | null | undefined): string {
  const first = String(contactName ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-z][A-Za-z'’-]{1,30}$/.test(first) ? `Hi ${first}` : 'Hi';
}

/** The message that carries the link (WhatsApp, copy, email body). `greetName` is the contact's name. */
export function quickCloseMessage(greetName: string | null | undefined, url: string, route: ServiceRoute): string {
  return [
    `${quickCloseGreeting(greetName)}, here's your ${SERVICE_ROUTE_NAME[route]} sign-up link:`,
    url,
    '',
    `What you're signing up to: ${priceSentence(route)} ${ownershipToClient(route)}`,
    '',
    `${QUICK_CLOSE_PROMISE} ${FINDABLE_GUARANTEE}`,
    '',
    `${SIGNUP_LINK_SENTENCE} ${AFTER_PAYMENT_SENTENCE}`,
    '',
    'If anything on the link looks wrong, just reply before you sign.',
  ].join('\n');
}

/** The email that carries the link (fn quick-close mode share_link, channel email). Plain text. */
export function quickCloseEmail(i: { greetName: string | null | undefined; businessName: string | null | undefined; url: string; route: ServiceRoute; senderName: string | null | undefined }): { subject: string; text: string } {
  const biz = String(i.businessName ?? '').trim();
  const sender = String(i.senderName ?? '').trim();
  return {
    subject: `Your ${SERVICE_ROUTE_NAME[i.route]} sign-up link${biz ? ` - ${biz}` : ''}`,
    text: `${quickCloseMessage(i.greetName, i.url, i.route)}\n\nAny questions, just reply to this email.\n\n${sender ? `${sender}\n` : ''}Findable`,
  };
}

export const QUICK_CLOSE_AFTER_PAYMENT: readonly string[] = [
  'They get a full baseline AI visibility measurement first.',
  'Paul introduces himself within two working days and takes over from here.',
  'Paul handles the website, domain and access questions.',
  'Paul may ask them for a few more details later — they do not need everything today.',
];

/* ══ QUICK CLOSE IS PRE-PAYMENT ONLY — JUDGED ON THE LEAD, NOT THE ROW (wave 1 integration, 2026-10-04) ══
   🔴 The save / link / share modes refused only an onboarding row whose status was exactly 'paid'. A
   client moves on — 'in_delivery', 'completed' — and an ended client's row may read any of those, so a
   paying client in delivery, or an ENDED one, could have answers changed, or an unexpired payment link
   e-mailed or WhatsApped to them (findable-checkout refuses a NEW session for a paid lead, but a link
   made before payment can still be paid twice). ⛔ The lead's own facts decide: money on it (and not
   refunded), a paid-or-beyond status, refunded, or an ended engagement. Any one → refused. Positive
   matches on the closing facts; the row's status is still read as a second signal. */
const QC_PAID_OR_BEYOND: ReadonlySet<string> = new Set(['paid', 'payment_received', 'in_delivery', 'completed']);
export function quickCloseClosedRefusal(
  lead: { amount_paid?: number | null; status?: string | null; service_terminated_at?: string | null } | null | undefined,
  row?: { status?: string | null } | null,
): { error: 'already_paid' | 'client_closed'; detail: string } | null {
  if (String(lead?.service_terminated_at ?? '').trim()) return { error: 'client_closed', detail: 'This client’s engagement has ended — no payment link can be made or sent.' };
  if (lead?.status === 'refunded') return { error: 'client_closed', detail: 'This client was refunded — no payment link can be made or sent. Ask Paul.' };
  if (Number(lead?.amount_paid ?? 0) > 0 || QC_PAID_OR_BEYOND.has(String(lead?.status ?? '')) || QC_PAID_OR_BEYOND.has(String(row?.status ?? ''))) {
    return { error: 'already_paid', detail: 'This client has already paid — Paul looks after them from here.' };
  }
  return null;
}
