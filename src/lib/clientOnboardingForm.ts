/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID CLIENT'S ONBOARDING FORM — ONLY WHAT WE DON'T KNOW (Paul, 2026-10-07,
   docs/pre-sales-certification/sales-close-handoff-australia.md).

   After a client has PAID, Paul presses "Send onboarding" on their Paid Client page. The client gets a secure
   link (findable.live/details/<token>) to a short form that asks ONLY what is still missing or unconfirmed,
   for THEIR plan. ⛔ It is never the payment / sign-up form and there is no payment step at the end.

   WHAT DECIDES A QUESTION (onboardingQuestionsFor):
     · the consolidated profile (clientIntake.ts — every source, Paul's confirmations winning) and the client's
       own onboarding row (what the setup checklist and the baseline read);
     · the plan: OPTIMISE asks about their existing site (platform, who runs it, access); BUILD asks about the
       domain, permission to connect it, and the material we may use. Never a Build question to an Optimise
       client, or the reverse;
     · a value Paul CONFIRMED is never asked; a value only the salesperson / website / Google gave is asked as a
       CONFIRMATION, pre-filled ("We have these — change anything that's wrong"); a value the client already gave
       is not asked.
   WHAT THE ANSWERS DO (planOnboardingWrite): each answer lands on the client's onboarding row — the same columns
   the post-payment questionnaire writes, provenance "Client onboarding" — but ONLY into a column that is blank
   now. A column that meanwhile holds a different value is NOT overwritten: it is recorded as a conflict for
   Paul. ⛔ Only the questions the link was made with are accepted (the snapshot) — the server never takes an
   arbitrary field from the browser, and every value is validated to its own shape.
   Pure. Edge-reachable (client-onboarding, paid-client-hub): relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { FINDABLE_CONTACT_EMAIL, REPORT_PUBLIC_ORIGIN, type ServiceRoute } from './findableOffer.ts';
import { effectiveQuestionnaireServices } from './questionnaireComplete.ts';

export type OnbKey =
  | 'contact_name' | 'contact_email' | 'confirmed_phone' | 'confirmed_location'
  | 'services_list' | 'top_requests' | 'areas_list'
  | 'business_website' | 'website_platform' | 'website_manager' | 'website_manager_email'
  | 'gbp_status'
  | 'domain_status' | 'domain_owned' | 'domain_access' | 'domain_third_party'
  | 'authority_confirmed' | 'dns_permission' | 'materials_confirmed' | 'site_rights' | 'photos_status'
  | 'must_not_say';

export type OnbKind = 'text' | 'email' | 'tel' | 'list' | 'choice' | 'textarea';
export interface OnbOption { value: string; label: string }
export interface OnbQuestionDef {
  key: OnbKey;
  label: string;
  help?: string;
  kind: OnbKind;
  options?: readonly OnbOption[];
  /** Which plans may ask it. */
  routes: readonly ServiceRoute[];
  /** Shown (and accepted) only when another answer — given here or already on file — is one of these. */
  showIf?: { key: OnbKey; in: readonly string[] };
  /** Must be answered before the form submits (only the few the setup / baseline truly need). */
  required: boolean;
  max: number;
}

const YES_NO: readonly OnbOption[] = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const BOTH: readonly ServiceRoute[] = ['build', 'optimise'];

/** THE CATALOGUE — every question the form can ever ask, in the order it asks them. */
export const ONBOARDING_QUESTIONS: readonly OnbQuestionDef[] = [
  { key: 'contact_name', label: 'Who should we speak to about the work?', kind: 'text', routes: BOTH, required: true, max: 120 },
  { key: 'contact_email', label: 'Best email address for us to reach you', kind: 'email', routes: BOTH, required: true, max: 200 },
  { key: 'confirmed_phone', label: 'Best phone number for us to reach you', kind: 'tel', routes: BOTH, required: false, max: 40 },
  { key: 'confirmed_location', label: 'Which town is your business based in?', help: 'Your main town — we measure how AI answers for customers there.', kind: 'text', routes: BOTH, required: true, max: 120 },
  { key: 'services_list', label: 'Which services do you offer?', help: 'One per line, or separated by commas.', kind: 'list', routes: BOTH, required: true, max: 2000 },
  { key: 'top_requests', label: 'Which jobs would you most like more of?', help: 'The work you most want new customers for.', kind: 'list', routes: BOTH, required: false, max: 1000 },
  { key: 'areas_list', label: 'Which towns or areas do you want more work from?', help: 'One per line, or separated by commas.', kind: 'list', routes: BOTH, required: true, max: 1000 },
  /* Optimise: their own website. */
  { key: 'business_website', label: "What's your website address?", kind: 'text', routes: ['optimise'], required: true, max: 200 },
  { key: 'website_platform', label: 'What is your website built on?', help: "If you're not sure, that's fine — pick Not sure.", kind: 'choice', routes: ['optimise'], required: false, max: 20,
    options: [{ value: 'wordpress', label: 'WordPress' }, { value: 'wix', label: 'Wix' }, { value: 'squarespace', label: 'Squarespace' }, { value: 'godaddy', label: 'GoDaddy' }, { value: 'shopify', label: 'Shopify' }, { value: 'other', label: 'Something else' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'website_manager', label: 'Who looks after your website?', kind: 'choice', routes: ['optimise'], required: false, max: 20,
    options: [{ value: 'direct_access', label: 'I do — I can log in to it' }, { value: 'web_company', label: 'A web company / agency' }, { value: 'owner_only', label: "I do, but I can't give anyone access" }] },
  { key: 'website_manager_email', label: "Your web company's email address (so we can ask them for access)", kind: 'email', routes: ['optimise'], required: false, max: 200, showIf: { key: 'website_manager', in: ['web_company'] } },
  /* Both: Google Business Profile access. */
  { key: 'gbp_status', label: 'Google Business Profile', help: `Please add ${FINDABLE_CONTACT_EMAIL} as a manager on your Google Business Profile, so we can keep it accurate.`, kind: 'choice', routes: BOTH, required: false, max: 20,
    options: [{ value: 'done', label: `Done — I've added ${FINDABLE_CONTACT_EMAIL}` }, { value: 'will_do', label: "I'll do it soon" }, { value: 'no_access', label: "I have one but can't get into it" }, { value: 'none', label: "I don't have one" }] },
  /* Build: the domain and the material for the new site. */
  { key: 'domain_status', label: 'Do you already have a web address (domain name) you want to use?', kind: 'choice', routes: ['build'], required: true, max: 20,
    options: [{ value: 'existing', label: 'Yes — use my current one' }, { value: 'new', label: "No — I'll need a new one" }] },
  { key: 'domain_owned', label: 'Does your business own that domain name?', kind: 'choice', routes: ['build'], required: false, max: 20, showIf: { key: 'domain_status', in: ['existing'] },
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'domain_access', label: 'Can you get into the domain settings (the registrar / DNS)?', kind: 'choice', routes: ['build'], required: false, max: 20, showIf: { key: 'domain_status', in: ['existing'] },
    options: [{ value: 'yes', label: 'Yes' }, { value: 'agency', label: 'My web company can' }, { value: 'no', label: 'No' }] },
  { key: 'domain_third_party', label: 'Does anyone else (an agency or freelancer) own or control the domain?', kind: 'choice', routes: ['build'], required: false, max: 20, showIf: { key: 'domain_status', in: ['existing'] },
    options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'authority_confirmed', label: 'Do you have the authority to replace your current website?', kind: 'choice', routes: ['build'], required: false, max: 5, options: YES_NO },
  { key: 'dns_permission', label: 'May we make the domain / DNS changes needed to put your new website live?', kind: 'choice', routes: ['build'], required: false, max: 5, options: YES_NO },
  { key: 'materials_confirmed', label: 'Do you own (or have the right to use) the logo, photos and wording you give us?', kind: 'choice', routes: ['build'], required: false, max: 5, options: YES_NO },
  { key: 'site_rights', label: 'May we reuse the text, branding and photos on your current website?', kind: 'choice', routes: ['build'], required: false, max: 20,
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }] },
  { key: 'photos_status', label: 'Do you have photos of your work we can use?', kind: 'choice', routes: ['build'], required: false, max: 20,
    options: [{ value: 'phone', label: 'Yes, on my phone' }, { value: 'online', label: 'Yes, online (Facebook, Google…)' }, { value: 'none', label: 'Not really' }] },
  { key: 'must_not_say', label: 'Is there anything we must NOT say about your business?', help: 'Optional — e.g. a service you no longer offer.', kind: 'textarea', routes: BOTH, required: false, max: 1000 },
];
export const ONBOARDING_QUESTION_KEYS: readonly OnbKey[] = ONBOARDING_QUESTIONS.map((q) => q.key);
const DEF = new Map<OnbKey, OnbQuestionDef>(ONBOARDING_QUESTIONS.map((q) => [q.key, q]));
export const onboardingQuestionDef = (k: OnbKey): OnbQuestionDef | undefined => DEF.get(k);

/* ══ WHAT WE KNOW ═════════════════════════════════════════════════════════════════════════════════ */
/** One consolidated field from the intake profile (clientIntake.ProfileField, the parts this rule reads). */
export interface KnownField { value?: string | null; values?: readonly string[] | null; tier: string | null; confirmed: boolean }
export interface OnboardingKnown {
  route: ServiceRoute | null;
  /** The client's own onboarding row (the counted one) — the columns this form writes. */
  row: Record<string, unknown> | null;
  /** From the consolidated profile (clientIntake), keyed by profile field. */
  profile: Partial<Record<'contact_name' | 'email' | 'phone' | 'town' | 'services' | 'service_areas' | 'website', KnownField>>;
  /** The jobs they want more of, from the call (quick_close.call.jobs). */
  callJobs?: string | null;
  /** Who runs the site, as the salesperson recorded it (lead.website_control / Quick Close manager). */
  siteControlKnown?: boolean;
  /** Findable has ticked that the Google invite actually arrived. */
  gbpConfirmedByFindable?: boolean;
  /** Is there a current website at all (Build: the rights / authority questions need one). */
  hasWebsite?: boolean | null;
}

/** A question as it will be shown — with the pre-filled value when we have an unconfirmed one. */
export interface OnbQuestion { key: OnbKey; prefill: string | null; confirm: boolean }

const s = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : s(v) ? s(v).split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : []);
const known = (f: KnownField | undefined) => !!f && (s(f.value) !== '' || (f.values?.length ?? 0) > 0);
/** Tiers that are OURS, not the client's: asked again as a pre-filled confirmation. */
const UNCONFIRMED: ReadonlySet<string> = new Set(['sales', 'record', 'website', 'places', 'inferred']);
const shown = (f: KnownField | undefined): string => (f?.values?.length ? f.values.join(', ') : s(f?.value));

/** THE ONE RULE: which questions this client gets, in order. Empty = nothing to ask. */
export function onboardingQuestionsFor(k: OnboardingKnown): OnbQuestion[] {
  const route = k.route;
  if (!route) return [];
  const row = k.row ?? {};
  const out: OnbQuestion[] = [];
  const ask = (key: OnbKey, prefill: string | null = null) => {
    const d = DEF.get(key)!;
    if (!d.routes.includes(route)) return;
    out.push({ key, prefill: prefill || null, confirm: !!prefill });
  };
  /** A profile-backed question: not asked when confirmed by Paul or given by the client; a confirmation when only we hold it. */
  const profiled = (key: OnbKey, f: KnownField | undefined, rowHas: boolean) => {
    if (rowHas || f?.confirmed) return;
    if (!known(f)) { ask(key); return; }
    if (f!.tier === 'client') return;
    if (UNCONFIRMED.has(String(f!.tier))) ask(key, shown(f));
  };

  profiled('contact_name', k.profile.contact_name, !!s(row.contact_name));
  profiled('contact_email', k.profile.email, !!s(row.contact_email));
  if (!s(row.confirmed_phone) && !known(k.profile.phone) && !k.profile.phone?.confirmed) ask('confirmed_phone');
  /* The baseline waits for the client's OWN town and services on this row (questionnaireComplete) — so a value only we
     hold is asked as a confirmation, never copied across as if the client had said it. */
  if (!s(row.confirmed_location) && !k.profile.town?.confirmed) ask('confirmed_location', known(k.profile.town) ? shown(k.profile.town) : null);
  if (!effectiveQuestionnaireServices(row as never).length && !k.profile.services?.confirmed) ask('services_list', known(k.profile.services) ? shown(k.profile.services) : null);
  if (!s(row.top_requests) && !s(k.callJobs)) ask('top_requests');
  if (!list(row.areas_list).length && !s(row.areas_wanted) && !k.profile.service_areas?.confirmed) ask('areas_list', known(k.profile.service_areas) ? shown(k.profile.service_areas) : null);

  if (route === 'optimise') {
    if (!s(row.business_website) && !known(k.profile.website)) ask('business_website');
    if (!s(row.website_platform)) ask('website_platform');
    if (!s(row.website_manager) && !k.siteControlKnown) { ask('website_manager'); ask('website_manager_email'); }
  }
  const gbpDone = s(row.gbp_status) === 'done' || s(row.gbp_exists) === 'no' || !!k.gbpConfirmedByFindable;
  if (!gbpDone) ask('gbp_status');

  if (route === 'build') {
    if (!s(row.domain_status)) ask('domain_status');
    const domainExisting = !s(row.domain_status) || s(row.domain_status) === 'existing';
    if (domainExisting) {
      if (!s(row.domain_owned)) ask('domain_owned');
      if (!s(row.domain_access)) ask('domain_access');
      if (!s(row.domain_third_party)) ask('domain_third_party');
    }
    const hasSite = k.hasWebsite === true || !!s(row.business_website);
    if (hasSite && row.authority_confirmed !== true) ask('authority_confirmed');
    if (row.dns_permission !== true) ask('dns_permission');
    if (row.materials_confirmed !== true) ask('materials_confirmed');
    if (hasSite && !s(row.site_rights)) ask('site_rights');
    if (!s(row.photos_status)) ask('photos_status');
  }
  if (!s(row.must_not_say)) ask('must_not_say');
  return out;
}

/** The questions that would decide "anything still missing" — the optional extras do not count. */
export const isGapQuestion = (q: OnbQuestion): boolean => q.key !== 'must_not_say' && q.key !== 'website_manager_email';

/* ══ VALIDATE + PLAN THE WRITE ═══════════════════════════════════════════════════════════════════ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export type OnbValue = string | string[] | boolean;
export interface OnbValidation {
  ok: boolean;
  /** key → a sentence for the field. */
  errors: Partial<Record<OnbKey, string>>;
  /** Clean answers, by key — only questions on the link, only shown ones, only valid shapes. */
  answers: Partial<Record<OnbKey, OnbValue>>;
}

const toList = (raw: string, max: number): string[] => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const p of raw.slice(0, max).split(/[\n,;]+/)) {
    const t = p.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length >= 30) break;
  }
  return out;
};

/** The raw form (key → string) against the link's question snapshot. ⛔ Unknown keys are ignored; a question
 *  whose showIf is false is dropped (hiding a field also clears what it would send — CLAUDE.md §4). */
export function validateOnboarding(questions: readonly OnbQuestion[], raw: Record<string, unknown>, row: Record<string, unknown> | null): OnbValidation {
  const asked = new Set(questions.map((q) => q.key));
  const errors: Partial<Record<OnbKey, string>> = {};
  const answers: Partial<Record<OnbKey, OnbValue>> = {};
  const rawStr = (k: OnbKey) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const effective = (k: OnbKey): string => (asked.has(k) ? rawStr(k).trim() : s((row ?? {})[k]));
  for (const q of questions) {
    const d = DEF.get(q.key);
    if (!d) continue;
    if (d.showIf && !d.showIf.in.includes(effective(d.showIf.key))) continue;
    const v = rawStr(q.key).trim().slice(0, d.max);
    if (!v) { if (d.required) errors[q.key] = 'Please answer this one.'; continue; }
    if (d.kind === 'email') { if (!EMAIL_RE.test(v)) { errors[q.key] = "That email address doesn't look right."; continue; } answers[q.key] = v.toLowerCase(); continue; }
    if (d.kind === 'tel') { if (v.replace(/\D/g, '').length < 8) { errors[q.key] = "That phone number doesn't look right."; continue; } answers[q.key] = v; continue; }
    if (d.kind === 'list') { const xs = toList(v, d.max); if (!xs.length) { if (d.required) errors[q.key] = 'Please add at least one.'; continue; } answers[q.key] = xs; continue; }
    if (d.kind === 'choice') {
      if (!d.options!.some((o) => o.value === v)) { errors[q.key] = 'Please pick one of the options.'; continue; }
      answers[q.key] = d.options === YES_NO ? v === 'yes' : v;
      continue;
    }
    answers[q.key] = v;
  }
  return { ok: Object.keys(errors).length === 0, errors, answers };
}

/** Answers → onboarding_responses columns. One mapping. */
export function columnsForAnswers(a: Partial<Record<OnbKey, OnbValue>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a) as [OnbKey, OnbValue][]) {
    if (k === 'top_requests') { out.top_requests = (v as string[]).join(', '); continue; }
    if (k === 'gbp_status') {
      if (v === 'none') out.gbp_exists = 'no';
      else { out.gbp_status = v; out.gbp_exists = 'yes'; }
      continue;
    }
    out[k] = v;
  }
  return out;
}

const blankCol = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const sameVal = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].map(String).map((x) => x.toLowerCase()).sort() : typeof a === 'string' ? a.trim().toLowerCase() : a)
  === JSON.stringify(Array.isArray(b) ? [...b].map(String).map((x) => x.toLowerCase()).sort() : typeof b === 'string' ? b.trim().toLowerCase() : b);

/** ⛔ NEVER OVERWRITE: only blank columns are written; a column that now holds something different is a conflict
 *  for Paul, and an equal one is simply already there. */
export function planOnboardingWrite(rowNow: Record<string, unknown>, cols: Record<string, unknown>): { patch: Record<string, unknown>; conflicts: { column: string; on_file: unknown; answered: unknown }[] } {
  const patch: Record<string, unknown> = {};
  const conflicts: { column: string; on_file: unknown; answered: unknown }[] = [];
  for (const [c, v] of Object.entries(cols)) {
    const cur = rowNow[c];
    if (blankCol(cur)) patch[c] = v;
    else if (!sameVal(cur, v)) conflicts.push({ column: c, on_file: cur, answered: v });
  }
  return { patch, conflicts };
}

/** The human label for an onboarding column (Paul's conflict list). */
export function onboardingColumnLabel(c: string): string {
  if (c === 'gbp_exists') return 'Google Business Profile';
  const d = DEF.get(c as OnbKey);
  return d ? d.label : c;
}

/** What Paul sees before sending: the questions this client would get, as labels (empty = nothing missing). */
export function onboardingPreview(qs: readonly OnbQuestion[]): { key: OnbKey; label: string; confirm: boolean }[] {
  return qs.map((q) => ({ key: q.key, label: DEF.get(q.key)?.label ?? q.key, confirm: q.confirm }));
}

/* ══ THE LINK ═════════════════════════════════════════════════════════════════════════════════════ */
export const ONBOARDING_TOKEN_RE = /^[0-9a-f]{64}$/;
/** findable.live/details/<token> (findable-site functions/details/[token].ts proxies to fn client-onboarding). */
export function onboardingFormUrl(token: string): string {
  return `${REPORT_PUBLIC_ORIGIN}/details/${token}`;
}
/** The message Paul copies / sends (in a conversation the client replied to inside 24 hours). */
export function onboardingMessage(greetName: string | null | undefined, url: string): string {
  const first = String(greetName ?? '').trim().split(/\s+/)[0] ?? '';
  const hi = /^[A-Za-z][A-Za-z'’-]{1,30}$/.test(first) ? `Hi ${first}` : 'Hi';
  return `${hi}, thanks for signing up with Findable. To get started we just need a few details we don't have yet — it only takes a couple of minutes:\n${url}\n\nThere's nothing to pay on this form.`;
}
/** Which state a link is in (derived). */
export type OnbLinkState = 'active' | 'submitted' | 'revoked';
export function onboardingLinkState(l: { revoked_at?: string | null; submitted_at?: string | null }): OnbLinkState {
  if (l.revoked_at) return 'revoked';
  if (l.submitted_at) return 'submitted';
  return 'active';
}
