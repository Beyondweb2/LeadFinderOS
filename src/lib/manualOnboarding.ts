/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MANUAL ONBOARDING — the customer's onboarding questions, answered by the OPERATOR on the client's
   behalf, saved into the SAME onboarding_responses columns (Paul, 2026-09-23).

   ⛔ THE SAME QUESTIONS, NOT A SECOND QUESTIONNAIRE. Every question text, helper line and option
   label below is copied VERBATIM from findable-site's customer flow (src/components/OnboardingFlow.tsx
   and src/lib/siteAccess.ts). scripts/manual-onboarding.test.ts fails the build if any of them stops
   appearing there. The conditional website questions keep the customer's conditions exactly
   (siteAccessFromBranch, websiteManagerFromBranch — ported below, verbatim in behaviour).
   ⛔ THE SAME COLUMNS. buildOnboardingPatch writes the columns findable-onboarding writes for the
   same answers (contact_name, contact_email, confirmed_phone, business_website, business_name,
   confirmed_location, domain_status, website_manager, website_manager_email, gbp_consent, services,
   services_list, areas_list). Everything downstream — Paid Clients, Website Build, client facts,
   baseline readiness and generation, the 4/8-week re-measure rule — reads those columns and cannot
   tell who typed them apart from the provenance columns.
   ⛔ PROVENANCE, NEVER A FAKE SUBMISSION. operator_edited_at / operator_edited_by record that the
   operator entered or changed the answers; a row the operator creates carries client_source =
   'manual'. Nothing here claims the customer submitted anything.
   ⛔ MONEY IS NOT DECIDED HERE. plan_tier and website_addon (what Stripe bills) are never written by
   this path — the browser never decides money, and neither does an operator form for a client who
   has already paid. The build route goes in website_route, the operator-path column findableSiteKind
   already reads, so the website answer still drives the 4/8-week rule.

   IMPORTED BY AN EDGE FUNCTION (paid-client-hub): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { effectiveQuestionnaireServices, missingQuestionnaireFields } from './questionnaireComplete.ts';
import { FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_OPTIMISE_TOTAL_PAYMENTS } from './findableOffer.ts';
import type { DomainAccessAnswer, YesNoNotSure } from './domainAuthority.ts';

/* ── the questions, verbatim ──────────────────────────────────────────────────────────────────── */

export const ONBOARDING_COPY = {
  you: { headline: 'First, who are you?', sub: 'So we know where to send your report.' },
  contactName: { label: 'Your name' },
  contactEmail: { label: 'Your email', helper: 'Where your report goes.', error: "That doesn't look like an email address." },
  phone: { label: 'Your mobile', helper: 'So we can reach you on WhatsApp about your results.', placeholder: '07700 900123', error: 'Start with 0 or +44 so we can dial it.' },
  website: { label: 'Your website', optional: '(if you have one)', helper: "So we check the right site. Leave it empty if you haven't got one.", placeholder: 'yourbusiness.co.uk', error: "That doesn't look like a web address." },
  business: { headline: "What's the business called?", sub: 'This is the name we look for on Google.' },
  businessName: { label: 'Your business name', helper: 'As it appears on Google, so we measure the right one.', placeholder: 'e.g. Halstead Locks' },
  tradeTown: { headline: 'What you do, and where', sub: "This is what we ask ChatGPT and Google's AI." },
  trade: { label: 'What you do', helper: 'One word is plenty.', placeholder: 'e.g. locksmith' },
  town: { label: 'Your town', placeholder: 'e.g. Huntingdon' },
  websiteStep: { headline: 'Your website', sub: 'Where the work gets published, and who can let us in.' },
  domain: { question: 'Are we using an existing domain?' },
  agency: { question: 'Does an agency or web company look after your website?' },
  access: { question: 'Will you be able to get us access to edit it?', helper: 'Your pages have to go on your own site, so we need editing access to it. Never send us a password here.' },
  managerEmail: { label: 'Who should we ask?', optional: '(optional)', placeholder: 'name@theirwebcompany.co.uk', helper: 'Their email, so we can send them exactly what we need. Your agreement with them stays yours to manage.' },
  selfSite: { question: 'Can you give us access to edit it?' },
  permission: { headline: 'Permission to do the work', sub: "One thing to agree, then we're moving.", discuss: "I'd rather talk it through first" },
  /* ⛔ NOT "one page per town" (2026-10-04, fix/04 — Session C C-07): that promised the cloned town pages
     the method rejects. Verbatim from findable-site's OnboardingFlow (same commit pair). */
  q2: { headline: 'What you do, and where', sub: "Each main service gets its own clear page. The towns you list tell us where to measure you and where real local pages make sense. That's the last thing we need." },
  services: { label: 'Services you offer', chipsHint: 'Tap the ones you do. Add anything missing below.', noChips: 'One service per line, in the words a customer would use.', add: 'Add another service' },
  areas: { label: 'Towns you want work from', optional: 'Optional', placeholder: 'e.g. March', helper: 'We judge the refund on the same questions before and after — asked about your home town and the towns you list here.' },
} as const;

export const DOMAIN_OPTIONS = [
  { value: 'existing', label: 'Yes, I already have a domain/site' },
  { value: 'new', label: 'No, this will be a new domain' },
] as const;
export const AGENCY_OPTIONS = [
  { value: 'yes', label: 'Yes, someone else manages it' },
  { value: 'no', label: 'No, I look after it myself' },
] as const;
export const ACCESS_OPTIONS = [
  { value: 'yes', label: 'Yes, I can get us access' },
  { value: 'no', label: "No, or I'd rather not ask them" },
] as const;
export const SELF_SITE_OPTIONS = [
  { value: 'access', label: 'Yes, I can give you access' },
  { value: 'rebuild', label: "I'd rather you built me a new one" },
  { value: 'none', label: "I haven't got a website" },
] as const;

export type DomainStatus = (typeof DOMAIN_OPTIONS)[number]['value'];
export type AgencyManages = (typeof AGENCY_OPTIONS)[number]['value'];
export type CanGetAccess = (typeof ACCESS_OPTIONS)[number]['value'];
export type SelfSiteChoice = (typeof SELF_SITE_OPTIONS)[number]['value'];
export type SiteAccessAnswer = 'yes_access' | 'no_access' | 'want_new' | 'no_website';

/** findable-site siteAccess.ts siteAccessFromBranch — same folding, same nulls. */
export function siteAccessFromBranch(agency: AgencyManages | null, access: CanGetAccess | null, self: SelfSiteChoice | null): SiteAccessAnswer | null {
  if (agency === 'yes') return access === 'yes' ? 'yes_access' : access === 'no' ? 'no_access' : null;
  if (agency === 'no') return self === 'access' ? 'yes_access' : self === 'rebuild' ? 'want_new' : self === 'none' ? 'no_website' : null;
  return null;
}
/** findable-site siteAccess.ts websiteManagerFromBranch. */
export function websiteManagerFromBranch(agency: AgencyManages | null): 'web_company' | 'direct_access' | null {
  return agency === 'yes' ? 'web_company' : agency === 'no' ? 'direct_access' : null;
}
/** findable-site siteAccess.ts accessConsequenceText — positive match on the one answer that keeps the site. */
export function accessConsequenceText(answer: SiteAccessAnswer | null): string {
  return answer !== 'yes_access'
    ? `No problem, we'll build and manage a new website for you as part of the service: ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments in total. It transfers to you once all ${FINDABLE_BUILD_TOTAL_PAYMENTS} payments are complete.`
    : `We'll work on your existing website as part of the service: ${FINDABLE_OPTIMISE_TOTAL_PAYMENTS} payments in total. Your website stays yours.`;
}
/** findable-site siteAccess.ts permissionAckText — three states, the unanswered one names no site. */
export function permissionAckText(answer: SiteAccessAnswer | null): string {
  if (!answer) return 'Yes — complete my Google Business Profile and publish the pages you write for me.';
  return answer !== 'yes_access'
    ? 'Yes — complete my Google Business Profile and publish the pages you write onto the new site you build me.'
    : 'Yes — complete my Google Business Profile and publish the pages you write onto my site.';
}

/** The build route the website answer implies — the operator-path column (website_route) that
 *  findableSiteKind, and so the 4/8-week re-measure rule, already reads. Unanswered → null, which
 *  leaves the stored value untouched rather than guessing. */
export function websiteRouteFor(answer: SiteAccessAnswer | null): 'optimise_existing' | 'rebuild_existing' | 'new_site' | null {
  if (answer === 'yes_access') return 'optimise_existing';
  if (answer === 'no_access' || answer === 'want_new') return 'rebuild_existing';
  if (answer === 'no_website') return 'new_site';
  return null;
}

/* ── the same entry rules the customer form applies ───────────────────────────────────────────── */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phoneOk = (raw: string) => /^\s*(\+|00|0)/.test(raw) && (raw.match(/\d/g) ?? []).length >= 7;
const NON_ANSWER_SITE = new Set(['n/a', 'na', 'none', 'no', 'nope', 'nil', '-', '--', 'no website', 'not yet', 'tbc']);
export const websiteOk = (raw: string) => {
  const t = raw.trim();
  if (!t || NON_ANSWER_SITE.has(t.toLowerCase())) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) || /\s/.test(t)) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h.includes('.') && !h.startsWith('.') && !h.endsWith('.') && /\.[a-z]{2,}$/i.test(h) && h !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(h);
  } catch { return false; }
};
const normaliseWebsite = (raw: string): string | null => {
  const t = raw.trim();
  if (!t || NON_ANSWER_SITE.has(t.toLowerCase())) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/* ── the answers ──────────────────────────────────────────────────────────────────────────────── */

export interface OnboardingAnswers {
  contact_name: string;
  contact_email: string;
  confirmed_phone: string;
  business_website: string;
  business_name: string;
  trade: string;
  confirmed_location: string;
  domain_status: DomainStatus | null;
  agency_manages: AgencyManages | null;
  can_get_access: CanGetAccess | null;
  self_site: SelfSiteChoice | null;
  website_manager_email: string;
  /** The permission tickbox: 'yes_all' when ticked. 'discuss' is the customer's "I'd rather talk it
   *  through first". Null = not recorded. */
  gbp_consent: 'yes_all' | 'discuss' | null;
  services: string[];
  areas: string[];
  /* The domain rule (2026-09-28, src/lib/domainAuthority.ts) — the customer flow's questions verbatim. */
  domain_owned: YesNoNotSure | null;
  domain_access: DomainAccessAnswer | null;
  domain_third_party: YesNoNotSure | null;
  site_rights: YesNoNotSure | null;
  authority_confirmed: boolean;
  dns_permission: boolean;
  materials_confirmed: boolean;
}

type Row = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const t = typeof x === 'string' ? x.trim() : '';
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t.slice(0, 120));
  }
  return out;
};

/** What the form opens with: the stored answers first, then the client record for anything the row
 *  has not got. The branch answers are recovered from what the row stores (website_manager,
 *  website_route, website_addon) — the customer flow never stores the raw branch answers. */
export function answersFromRecords(row: Row, lead: Row): OnboardingAnswers {
  const r = row ?? {}, l = lead ?? {};
  const manager = str(r.website_manager);
  const route = str(r.website_route);
  const addon = typeof r.website_addon === 'boolean' ? r.website_addon : null;
  /* ⛔ QUICK CLOSE'S TWO ANSWERS ARE READ BACK TOO (pre-sales fix 03, B-06). Quick Close writes
     website_manager 'owner_only' (they run it themselves but cannot hand over access) and, for "no
     website", website_platform 'no_website' with no manager. Neither used to map to a branch, so the
     form opened with the site questions blank — and its save then nulled the Build consents taken on
     the call. Both are the customer flow's "No, I look after it myself"; no website is "I haven't got
     a website". */
  const noWebsite = !manager && str(r.website_platform) === 'no_website';
  const agency: AgencyManages | null = manager === 'web_company' ? 'yes'
    : manager === 'direct_access' || manager === 'owner_only' || noWebsite ? 'no' : null;
  const keeps = route === 'optimise_existing' ? true : route ? false : addon === false ? true : addon === true ? false : null;
  const access: CanGetAccess | null = agency === 'yes' && keeps !== null ? (keeps ? 'yes' : 'no') : null;
  const self: SelfSiteChoice | null = agency !== 'no' ? null
    : noWebsite && !route ? 'none'
    /* owner_only cannot give access, so it is never read as "Yes, I can give you access" by default. */
    : manager === 'owner_only' && !route && addon !== true ? null
    : route === 'optimise_existing' || (!route && addon === false) ? 'access'
    : route === 'rebuild_existing' ? 'rebuild'
    : route === 'new_site' ? 'none'
    : addon === true ? (str(r.business_website) || str(l.website) ? 'rebuild' : 'none') : null;
  const consent = str(r.gbp_consent);
  const domain = str(r.domain_status);
  return {
    contact_name: str(r.contact_name) || str(l.contact_name),
    contact_email: str(r.contact_email) || str(l.email),
    confirmed_phone: str(r.confirmed_phone) || str(l.phone),
    business_website: str(r.business_website) || str(l.website),
    business_name: str(r.business_name) || str(l.business_name),
    trade: str(l.category) || str(l.search_keyword),
    confirmed_location: str(r.confirmed_location) || str(l.derived_town) || str(l.search_location),
    domain_status: domain === 'existing' || domain === 'new' ? domain : null,
    agency_manages: agency, can_get_access: access, self_site: self,
    website_manager_email: agency === 'yes' ? str(r.website_manager_email) : '',
    gbp_consent: consent === 'yes_all' || consent === 'discuss' ? consent : null,
    services: effectiveQuestionnaireServices(r as never),
    areas: list(r.areas_list).length ? list(r.areas_list) : list(r.areas_wanted),
    domain_owned: yns(r.domain_owned), domain_access: dacc(r.domain_access), domain_third_party: yns(r.domain_third_party),
    site_rights: yns(r.site_rights),
    authority_confirmed: r.authority_confirmed === true, dns_permission: r.dns_permission === true, materials_confirmed: r.materials_confirmed === true,
  };
}
function yns(v: unknown): YesNoNotSure | null { return v === 'yes' || v === 'no' || v === 'not_sure' ? v : null; }
function dacc(v: unknown): DomainAccessAnswer | null { return v === 'yes' || v === 'no' || v === 'agency' ? v : null; }

export interface AnswerProblem { field: keyof OnboardingAnswers; message: string }

/** The customer form's entry rules, applied to what was TYPED. A blank is never a problem here —
 *  the operator may save a partial record and come back; completeness is reported separately. */
export function answerProblems(a: OnboardingAnswers): AnswerProblem[] {
  const out: AnswerProblem[] = [];
  if (a.contact_email.trim() && !EMAIL_RE.test(a.contact_email.trim())) out.push({ field: 'contact_email', message: ONBOARDING_COPY.contactEmail.error });
  if (a.confirmed_phone.trim() && !phoneOk(a.confirmed_phone)) out.push({ field: 'confirmed_phone', message: ONBOARDING_COPY.phone.error });
  if (!websiteOk(a.business_website)) out.push({ field: 'business_website', message: ONBOARDING_COPY.website.error });
  if (a.website_manager_email.trim() && !EMAIL_RE.test(a.website_manager_email.trim())) out.push({ field: 'website_manager_email', message: ONBOARDING_COPY.contactEmail.error });
  return out;
}

/** Normalise whatever was posted into the answer shape: known keys, enumerated tokens, capped text.
 *  The server runs this before building the patch, so a client cannot post arbitrary columns. */
export function cleanAnswers(raw: unknown): OnboardingAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed as readonly string[]).includes(String(v)) ? (v as T) : null;
  const text = (v: unknown, n: number) => str(v).slice(0, n);
  return {
    contact_name: text(r.contact_name, 120), contact_email: text(r.contact_email, 200), confirmed_phone: text(r.confirmed_phone, 40),
    business_website: text(r.business_website, 300), business_name: text(r.business_name, 200), trade: text(r.trade, 80),
    confirmed_location: text(r.confirmed_location, 120),
    domain_status: pick(r.domain_status, ['existing', 'new'] as const),
    agency_manages: pick(r.agency_manages, ['yes', 'no'] as const),
    can_get_access: pick(r.can_get_access, ['yes', 'no'] as const),
    self_site: pick(r.self_site, ['access', 'rebuild', 'none'] as const),
    website_manager_email: text(r.website_manager_email, 200),
    gbp_consent: pick(r.gbp_consent, ['yes_all', 'discuss'] as const),
    services: list(r.services).slice(0, 40), areas: list(r.areas).slice(0, 30),
    domain_owned: yns(r.domain_owned), domain_access: dacc(r.domain_access), domain_third_party: yns(r.domain_third_party),
    site_rights: yns(r.site_rights),
    authority_confirmed: r.authority_confirmed === true, dns_permission: r.dns_permission === true, materials_confirmed: r.materials_confirmed === true,
  };
}

/** The onboarding_responses columns these answers set — the SAME columns findable-onboarding writes
 *  for the same answers, plus website_route and provenance. A blank answer writes null (the column
 *  is cleared, as the customer form clears it); a hidden answer is NOT SENT (the conditional
 *  question owns its answer's lifetime: the manager email only exists when an agency manages it). */
export function buildOnboardingPatch(a: OnboardingAnswers, operatorId: string, nowIso: string): Record<string, unknown> {
  const siteAccess = siteAccessFromBranch(a.agency_manages, a.agency_manages === 'yes' ? a.can_get_access : null, a.agency_manages === 'no' ? a.self_site : null);
  const manager = websiteManagerFromBranch(a.agency_manages);
  const route = websiteRouteFor(siteAccess);
  const services = a.services;
  const location = a.confirmed_location.trim();
  const complete = missingQuestionnaireFields({ confirmed_location: location, services: services.join(', '), services_list: services }).length === 0;
  return {
    contact_name: a.contact_name.trim() || null,
    contact_email: a.contact_email.trim() || null,
    confirmed_phone: a.confirmed_phone.trim() || null,
    business_website: normaliseWebsite(a.business_website),
    business_name: a.business_name.trim() || null,
    confirmed_location: location || null,
    domain_status: a.domain_status,
    website_manager: manager,
    website_manager_email: manager === 'web_company' ? (a.website_manager_email.trim() || null) : null,
    gbp_consent: a.gbp_consent,
    services: services.length ? services.join(', ') : null,
    services_list: services.length ? services : null,
    areas_list: a.areas.length ? a.areas : null,
    ...(route ? { website_route: route } : {}),
    /* ⛔ THE DOMAIN ANSWERS OWN THEIR LIFETIME: asked only on the new-site path (the same condition the
       customer form uses), so on the optimise path they are written null rather than left behind. The
       operator records what the CLIENT said; ticking a confirmation here asserts the client gave it. */
    ...domainPatch(a, siteAccess),
    incomplete: !complete,
    operator_edited_at: nowIso,
    operator_edited_by: operatorId,
    updated_at: nowIso,
  };
}

/* ══ PARTIAL UPDATES: AN EDIT CHANGES ONLY WHAT THE OPERATOR CHANGED (pre-sales fix 03, M-020 / B-06) ══
   🔴 Paul's routine "Fix in onboarding" (add a service, a town) rewrote EVERY column from the form, so any
   stored value the form could not show came back null — the Build consents taken on the call, a
   website_manager of owner_only, a domain answer. Proved live: authority_confirmed, dns_permission and
   materials_confirmed went true → null and the client flipped to DOMAIN / AGENCY ISSUE.
   ⛔ So a save of an EXISTING row writes only the column groups whose answers differ from what the row
   already says (answersFromRecords(row, null) — the row alone, so a value the form pre-filled from the
   lead still counts as new and is written, as before). Provenance is always stamped; 'incomplete' is
   recomputed from the merged row. A new row gets the full patch. */
const DOMAIN_ANSWER_KEYS: (keyof OnboardingAnswers)[] = ['domain_owned', 'domain_access', 'domain_third_party', 'site_rights', 'authority_confirmed', 'dns_permission', 'materials_confirmed'];
const BRANCH_ANSWER_KEYS: (keyof OnboardingAnswers)[] = ['agency_manages', 'can_get_access', 'self_site', 'website_manager_email'];
export const ONBOARDING_COLUMN_GROUPS: ReadonlyArray<{ answers: readonly (keyof OnboardingAnswers)[]; columns: readonly string[] }> = [
  { answers: ['contact_name'], columns: ['contact_name'] },
  { answers: ['contact_email'], columns: ['contact_email'] },
  { answers: ['confirmed_phone'], columns: ['confirmed_phone'] },
  { answers: ['business_website'], columns: ['business_website'] },
  { answers: ['business_name'], columns: ['business_name'] },
  { answers: ['confirmed_location'], columns: ['confirmed_location'] },
  { answers: ['domain_status'], columns: ['domain_status'] },
  { answers: BRANCH_ANSWER_KEYS, columns: ['website_manager', 'website_manager_email', 'website_route'] },
  { answers: ['gbp_consent'], columns: ['gbp_consent'] },
  { answers: ['services'], columns: ['services', 'services_list'] },
  { answers: ['areas'], columns: ['areas_list'] },
  /* The domain answers live on the new-site branch, so a change to the branch or the domain question
     re-decides them; nothing else touches them. */
  { answers: [...BRANCH_ANSWER_KEYS, 'domain_status', ...DOMAIN_ANSWER_KEYS], columns: ['domain_owned', 'domain_access', 'domain_third_party', 'site_rights', 'authority_confirmed', 'dns_permission', 'materials_confirmed'] },
];

/** The patch for an operator save: the full patch for a new row; for an existing row, only the column
 *  groups whose answers changed (see above), plus provenance and the recomputed 'incomplete'. */
export function changedOnboardingPatch(a: OnboardingAnswers, existingRow: Row, operatorId: string, nowIso: string): Record<string, unknown> {
  const full = buildOnboardingPatch(a, operatorId, nowIso);
  if (!existingRow) return full;
  /* Both sides compared as the form SENDS them: an answer hidden by the branch is cleared on the way out
     (ManualOnboardingDialog), so the stored side is cleared the same way before comparing. */
  const before = visibleAnswers(answersFromRecords(existingRow, null));
  a = visibleAnswers(a);
  const same = (k: keyof OnboardingAnswers) => JSON.stringify(a[k]) === JSON.stringify(before[k]);
  const out: Record<string, unknown> = {};
  for (const g of ONBOARDING_COLUMN_GROUPS) {
    if (g.answers.every(same)) continue;
    for (const c of g.columns) if (c in full) out[c] = full[c];
  }
  const merged = { ...(existingRow as Record<string, unknown>), ...out };
  out.incomplete = missingQuestionnaireFields(merged as never).length > 0;
  out.operator_edited_at = nowIso;
  out.operator_edited_by = operatorId;
  out.updated_at = nowIso;
  return out;
}

/** The answers as the form sends them: the branch that is not showing is cleared (the dialog's rule). */
export function visibleAnswers(a: OnboardingAnswers): OnboardingAnswers {
  return {
    ...a,
    can_get_access: a.agency_manages === 'yes' ? a.can_get_access : null,
    self_site: a.agency_manages === 'no' ? a.self_site : null,
    website_manager_email: a.agency_manages === 'yes' && a.can_get_access === 'yes' ? a.website_manager_email : '',
  };
}

/** The handoff confirmations a patch would take away (stored true → written as anything else). The
 *  server refuses such a save unless the operator explicitly confirms it. */
export const CONSENT_COLUMNS: Readonly<Record<string, string>> = {
  authority_confirmed: 'authority to have the website replaced or moved',
  dns_permission: 'permission to connect the domain',
  materials_confirmed: 'rights to the material they supply',
};
export function consentsCleared(existingRow: Row, patch: Record<string, unknown>): string[] {
  const r = existingRow ?? {};
  return Object.keys(CONSENT_COLUMNS).filter((c) => r[c] === true && c in patch && patch[c] !== true).map((c) => CONSENT_COLUMNS[c]);
}

function domainPatch(a: OnboardingAnswers, siteAccess: string | null): Record<string, unknown> {
  const newSite = !!siteAccess && siteAccess !== 'yes_access';   // findable-site needsNewWebsite, for an answered branch
  const existing = newSite && a.domain_status === 'existing';
  const hasSite = newSite && siteAccess !== 'no_website';
  return {
    domain_owned: existing ? a.domain_owned : null,
    domain_access: existing ? a.domain_access : null,
    domain_third_party: existing ? a.domain_third_party : null,
    site_rights: hasSite ? a.site_rights : null,
    authority_confirmed: hasSite ? a.authority_confirmed : null,
    dns_permission: newSite ? a.dns_permission : null,
    materials_confirmed: newSite ? a.materials_confirmed : null,
  };
}

/** What the operator's answers change on the LEAD — the same fields the customer's submit updates
 *  in lead mode (search_location, category via the trade correction, email / contact name / phone
 *  filled when empty, website replaced when different, with a note). Never clears a lead field. */
export function leadPatchFromAnswers(a: OnboardingAnswers, lead: Row, nowIso: string): { patch: Record<string, unknown>; notes: string[] } {
  const l = lead ?? {};
  const patch: Record<string, unknown> = {};
  const notes: string[] = [];
  const day = nowIso.slice(0, 10);
  if (a.confirmed_location.trim()) patch.search_location = a.confirmed_location.trim();
  if (a.trade.trim() && a.trade.trim() !== str(l.category)) patch.category = a.trade.trim();
  if (a.business_name.trim() && !str(l.business_name)) patch.business_name = a.business_name.trim();
  if (a.contact_email.trim() && !str(l.email)) patch.email = a.contact_email.trim();
  if (a.contact_name.trim() && !str(l.contact_name)) patch.contact_name = a.contact_name.trim();
  if (a.confirmed_phone.trim() && !str(l.phone)) patch.phone = a.confirmed_phone.trim();
  const site = normaliseWebsite(a.business_website);
  if (site && site.replace(/\/+$/, '').toLowerCase() !== str(l.website).replace(/\/+$/, '').toLowerCase()) {
    patch.website = site;
    if (str(l.website)) notes.push(`[${day}] Website changed from ${str(l.website)} to ${site} (onboarding entered by operator).`);
  }
  return { patch, notes };
}

/* ── status ───────────────────────────────────────────────────────────────────────────────────── */

export type OnboardingState = 'not_started' | 'incomplete' | 'complete' | 'completed_manually';

export interface OnboardingStatus {
  state: OnboardingState;
  label: string;
  /** Which required answers are missing (plain words). */
  missing: string[];
  /** Who supplied the answers. */
  source: 'customer' | 'operator' | 'customer_edited_by_operator' | null;
}

const MISSING_WORDS: Record<string, string> = { confirmed_location: 'primary town', services: 'services' };

export function onboardingStatus(row: Row): OnboardingStatus {
  if (!row) return { state: 'not_started', label: 'Not started — the client has not filled in onboarding', missing: ['primary town', 'services'], source: null };
  const missing = missingQuestionnaireFields(row as never).map((f) => MISSING_WORDS[f] ?? f);
  const operatorCreated = str(row.client_source) === 'manual';
  const operatorEdited = !!str(row.operator_edited_at);
  const source = operatorCreated ? 'operator' : operatorEdited ? 'customer_edited_by_operator' : 'customer';
  if (missing.length) return { state: 'incomplete', label: `Incomplete — missing ${missing.join(' and ')}`, missing, source };
  if (source === 'customer') return { state: 'complete', label: 'Complete — submitted by the client', missing, source };
  return { state: 'completed_manually', label: source === 'operator' ? 'Completed manually — entered by operator' : 'Complete — client answers, edited by operator', missing, source };
}
