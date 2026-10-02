/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES HANDOFF (2026-10-02, docs/paid-client-automation.md) — what the salesperson tells Paul when
   a client closes. SHORT on purpose: six answers and an optional note, never a form.

   ⛔ ONE RECORD, ON THE CLIENT: outreach_leads.sales_handoff (jsonb). Written ONLY by fn quick-close
   (`save_handoff`), through cleanHandoff — an allowlist of known keys, enumerated tokens and capped
   lengths, so a browser cannot post an arbitrary object into it. Never a copy of onboarding: what the
   CLIENT says lives on onboarding_responses; this is what the SALESPERSON heard.
   ⛔ PREFILL, NEVER PRETEND: what Quick Close / the lead already says pre-fills an answer, but the
   handoff is complete only once the salesperson has SAVED it (completed_at) — a prefill is a
   suggestion until a person stands behind it.
   ⛔ IT NEVER BLOCKS A PAYMENT. A client who pays before the handoff is done is still a Paid Client;
   the checklist shows "Sales handoff" as the missing item and who must fill it.
   Pure. ⚠️ Edge-reachable (quick-close, paid-client-hub, stripe-webhook): relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type WorkType = 'new_site' | 'rebuild' | 'keep_close' | 'optimise';
export type SiteSituation = 'client' | 'agency' | 'unsure' | 'no_website';

export interface SalesHandoffFields {
  work_type?: WorkType | null;
  site_situation?: SiteSituation | null;
  client_wants?: string | null;
  promised?: string | null;
  why_bought?: string | null;
  decision_maker_name?: string | null;
  decision_maker_role?: string | null;
  notes_for_paul?: string | null;
}
export type HandoffFieldKey = keyof SalesHandoffFields;

export interface SalesHandoffRecord extends SalesHandoffFields {
  saved_at?: string | null;
  saved_by?: string | null;
  /** The first save with every required answer. Set once; a later edit never clears it. */
  completed_at?: string | null;
  completed_by?: string | null;
}

/** Findable Build covers the first three; Optimise is the fourth (src/lib/findableOffer.ts routes). */
export const WORK_TYPE_OPTIONS: readonly { value: WorkType; label: string; route: 'build' | 'optimise' }[] = [
  { value: 'new_site', label: 'Brand new website', route: 'build' },
  { value: 'rebuild', label: 'Rebuild their existing website', route: 'build' },
  { value: 'keep_close', label: 'Rebuild, keeping their current design fairly close', route: 'build' },
  { value: 'optimise', label: 'Optimise their existing website', route: 'optimise' },
];
export const SITE_SITUATION_OPTIONS: readonly { value: SiteSituation; label: string }[] = [
  { value: 'client', label: 'The client controls it' },
  { value: 'agency', label: 'An agency controls it' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'no_website', label: 'No website' },
];

/** The questions, in order, with their lengths. `required` decides completeness. */
export const HANDOFF_QUESTIONS: readonly { key: HandoffFieldKey; label: string; required: boolean; max: number; kind: 'choice' | 'text' | 'short' }[] = [
  { key: 'work_type', label: 'What are we doing?', required: true, max: 20, kind: 'choice' },
  { key: 'site_situation', label: 'Current website situation', required: true, max: 20, kind: 'choice' },
  { key: 'client_wants', label: 'What does the client want?', required: true, max: 500, kind: 'text' },
  { key: 'promised', label: 'Anything specifically promised?', required: true, max: 500, kind: 'text' },
  { key: 'why_bought', label: 'Why did they buy / their main concern?', required: true, max: 500, kind: 'text' },
  { key: 'decision_maker_name', label: 'Decision maker', required: true, max: 120, kind: 'short' },
  { key: 'decision_maker_role', label: 'Their role', required: false, max: 80, kind: 'short' },
  { key: 'notes_for_paul', label: 'Anything Paul needs to know?', required: false, max: 1000, kind: 'text' },
];

/** The one-tap answer to "Anything specifically promised?" when nothing was. */
export const NOTHING_PROMISED = 'Nothing beyond the standard package';

const WORK_TYPES = new Set<string>(WORK_TYPE_OPTIONS.map((o) => o.value));
const SITUATIONS = new Set<string>(SITE_SITUATION_OPTIONS.map((o) => o.value));
const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** Only known keys survive, each to its own shape and length. Anything else is "not answered". */
export function cleanHandoff(raw: unknown): SalesHandoffFields {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: SalesHandoffFields = {};
  for (const q of HANDOFF_QUESTIONS) {
    const v = r[q.key];
    if (q.key === 'work_type') { if (typeof v === 'string' && WORK_TYPES.has(v)) out.work_type = v as WorkType; continue; }
    if (q.key === 'site_situation') { if (typeof v === 'string' && SITUATIONS.has(v)) out.site_situation = v as SiteSituation; continue; }
    const c = clip(v, q.max);
    if (c) (out as Record<string, string>)[q.key] = c;
  }
  return out;
}

/** The required answers still missing (by key, in question order). */
export function handoffMissing(h: SalesHandoffFields | null | undefined): HandoffFieldKey[] {
  const c = cleanHandoff(h);
  return HANDOFF_QUESTIONS.filter((q) => q.required && !c[q.key]).map((q) => q.key);
}

/** Complete = a person saved it AND every required answer is there. A prefill alone never is. */
export function handoffComplete(h: SalesHandoffRecord | null | undefined): boolean {
  return !!h?.saved_at && handoffMissing(h).length === 0;
}

/** Did any answer change? (History records a material change, never a no-op save.) */
export function handoffChangedKeys(prev: SalesHandoffFields | null | undefined, next: SalesHandoffFields | null | undefined): HandoffFieldKey[] {
  const a = cleanHandoff(prev); const b = cleanHandoff(next);
  return HANDOFF_QUESTIONS.map((q) => q.key).filter((k) => (a[k] ?? null) !== (b[k] ?? null));
}

/* ══ PREFILL — from what the system already knows ══════════════════════════════════════════════════ */
export interface HandoffPrefillInput {
  /** Quick Close answers (onboarding_responses.quick_close.answers), cleaned by quickClose.ts. */
  quickClose?: { route?: 'build' | 'optimise' | null; manager?: string | null } | null;
  /** onboarding_responses.plan_tier route, when the client chose it themselves. */
  route?: 'build' | 'optimise' | null;
  /** outreach_leads.website_control — what the salesperson recorded about who runs the site. */
  websiteControl?: string | null;
  /** Has a website on file at all. */
  hasWebsite?: boolean | null;
  contactName?: string | null;
}

/** Suggested answers + which keys were suggested. Saved answers always win over these. */
export function handoffPrefill(i: HandoffPrefillInput): { fields: SalesHandoffFields; prefilled: HandoffFieldKey[] } {
  const f: SalesHandoffFields = {};
  const qc = i.quickClose ?? null;
  const route = qc?.route ?? i.route ?? null;
  const control = (i.websiteControl ?? '').trim();
  const manager = (qc?.manager ?? '').trim();
  const noSite = control === 'no_website' || manager === 'no_website' || i.hasWebsite === false;
  if (route === 'optimise') f.work_type = 'optimise';
  else if (route === 'build' && noSite) f.work_type = 'new_site';
  // Build on an existing site: rebuild vs keep-close is the salesperson's call — never guessed.
  if (control === 'client_controls' || manager === 'owner' || manager === 'employee') f.site_situation = 'client';
  else if (control === 'agency_controls' || manager === 'agency' || manager === 'third_party') f.site_situation = 'agency';
  else if (noSite) f.site_situation = 'no_website';
  else if (manager === 'not_sure') f.site_situation = 'unsure';
  const name = clip(i.contactName, 120);
  if (name) f.decision_maker_name = name;
  return { fields: f, prefilled: Object.keys(f) as HandoffFieldKey[] };
}

/** Saved answers over the prefill, key by key. */
export function handoffWithPrefill(saved: SalesHandoffFields | null | undefined, prefill: SalesHandoffFields): SalesHandoffFields {
  return cleanHandoff({ ...prefill, ...cleanHandoff(saved) });
}

/* ══ WHO MUST GIVE ONE ═════════════════════════════════════════════════════════════════════════════ */
/** The handoff is owed only for a sale a SALESPERSON made after this existed. Paul's own sale has no
 *  one to hand off from; a client paid before handoffs existed is "not recorded" — never fabricated,
 *  never a permanent block (Paul, 2026-10-02: unknown stays unknown). */
export const SALES_HANDOFF_SINCE = '2026-10-02';
export type HandoffApplies = 'required' | 'not_needed_own_sale' | 'not_recorded_before' | 'no_seller';
export function salesHandoffApplies(i: { sellerId: string | null | undefined; sellerIsBookOwner: boolean | null | undefined; paidOn: string | null | undefined }): HandoffApplies {
  if (!i.sellerId) return 'no_seller';
  if (i.sellerIsBookOwner === true) return 'not_needed_own_sale';
  const day = (i.paidOn ?? '').slice(0, 10);
  if (day && day < SALES_HANDOFF_SINCE) return 'not_recorded_before';
  return 'required';
}

export const workTypeLabel = (v: string | null | undefined) => WORK_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? null;
export const siteSituationLabel = (v: string | null | undefined) => SITE_SITUATION_OPTIONS.find((o) => o.value === v)?.label ?? null;

/** Plain lines for an email or a snapshot (only what was answered). */
export function handoffSummaryLines(h: SalesHandoffFields | null | undefined): string[] {
  const c = cleanHandoff(h);
  const out: string[] = [];
  for (const q of HANDOFF_QUESTIONS) {
    const v = c[q.key];
    if (!v) continue;
    const shown = q.key === 'work_type' ? workTypeLabel(v) : q.key === 'site_situation' ? siteSituationLabel(v) : v;
    out.push(`${q.label} ${shown}`);
  }
  return out;
}
