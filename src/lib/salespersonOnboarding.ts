/* ══ SALESPERSON ONBOARDING — the rules, once (2026-10-05) ═══════════════════════════════════════════
   docs/salesperson-onboarding.md. What Paul must have on file before a salesperson is READY TO SELL,
   taken from the onboarding checklist in "Findable_Paul_Checklist_Risks_and_Actions" (Part 13). Pure and
   edge-safe (no imports): fn admin-users validates every save with it, and the Team page draws the
   checklist with it.

   ⛔ THE GATE ITSELF IS IN THE DATABASE: public.salesperson_onboarding_missing() /
      salesperson_ready_to_sell() (migration 20261010120000). This file mirrors that rule for the screen,
      with the SAME keys (BLOCKING_KEYS, INACTIVE_KEYS); when the server's answer is supplied it is the one
      shown (`serverMissing`). scripts/salesperson-onboarding.test.ts fences the keys on both sides.
   ⛔ READY TO SELL IS DERIVED, NEVER STORED, and it is ENFORCED: a salesperson who is not ready may sign in
      and see their onboarding, but every sales action is refused on the server.
   ⛔ ONLY AN APPROVED DOCUMENT COUNTS. A draft or superseded agreement / privacy notice / team guide may be
      recorded (the record stays honest about what the person actually received) but never completes the
      item. No version number is invented: Paul adds approved versions himself.
   ⛔ TPS/CTPS IS NOT PART OF READY TO SELL (postponed by Paul, 2026-10-05).
   ⛔ NO RAW SENSITIVE DATA. Bank details, passport numbers and copies stay on the signed agreement and in
      Paul's secure folder; `sensitiveTextProblem` refuses text that looks like one.
   ⛔ THE RIGHT-TO-WORK ENTRY IS A RECORD OF WHAT WAS DONE, NOT A LEGAL CONCLUSION. No screen says a method
      gives Findable a statutory defence.
   Commission is NOT decided here (another session owns it): the leaver fields are a record only. */

/* ── Document versions (public.salesperson_document_versions) ──────────────────────────────────────── */

export const DOCUMENT_KINDS = {
  contractor_agreement: 'Contractor agreement',
  privacy_notice: 'Salesperson privacy notice',
  team_guide: 'Team guide',
} as const;
export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export const DOCUMENT_STATUSES = { draft: 'Draft', approved: 'Approved (current)', superseded: 'Superseded' } as const;
export type DocumentStatus = keyof typeof DOCUMENT_STATUSES;

export interface DocumentVersion {
  id: string;
  kind: DocumentKind;
  label: string;
  status: DocumentStatus;
  document_ref: string | null;
  /** Blanks or known problems. An approved version has none (the database refuses otherwise). */
  outstanding: string[];
  note: string | null;
}

/** The versions the migration seeds (pack of 5 Oct 2026). Neither the agreement nor the notice is
 *  approved — the agreement is "draft v2" with a WhatsApp clause to be amended, the notice still has its
 *  brackets. Used by the tests; the live list always comes from the database. */
export const SEED_DOCUMENT_VERSIONS: readonly DocumentVersion[] = [
  { id: 'contractor-agreement-draft-v2', kind: 'contractor_agreement', label: 'Independent Sales Contractor Agreement — draft v2', status: 'draft', document_ref: 'Findable_Sales_Contractor_Agreement_v2.docx (pack of 5 Oct 2026)', outstanding: ['Clause 4.3(c) (WhatsApp first contact) is to be amended before use.'], note: null },
  { id: 'salesperson-privacy-notice-draft-2026-10-05', kind: 'privacy_notice', label: 'Privacy Notice for Salespeople — draft with blanks', status: 'draft', document_ref: 'Findable_Salesperson_Privacy_Notice.docx (pack of 5 Oct 2026)', outstanding: Array(10).fill('…'), note: null },
  { id: 'team-guide-2026-10-02', kind: 'team_guide', label: 'Team guide dated 2 October 2026', status: 'approved', document_ref: 'Team guide, 2 Oct 2026', outstanding: [], note: null },
];

/** A version of the right kind, or null. */
export function documentVersion(docs: readonly DocumentVersion[], id: string | null | undefined, kind: DocumentKind): DocumentVersion | null {
  return docs.find((d) => d.id === id && d.kind === kind) ?? null;
}
/** The one approved version of a kind (null when there is none yet). */
export function currentDocument(docs: readonly DocumentVersion[], kind: DocumentKind): DocumentVersion | null {
  return docs.find((d) => d.kind === kind && d.status === 'approved') ?? null;
}
/** A document version id: lower case, digits and hyphens (the database checks the same). */
export const DOCUMENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,80}$/;

/* ── Right to work — what was done, never a legal conclusion ───────────────────────────────────────── */

export const RTW_CATEGORIES = {
  manual_video: 'Manual / video check recorded',
  certified_provider: 'Certified provider check',
  other_approved: 'Other approved method',
} as const;
export type RtwCategory = keyof typeof RTW_CATEGORIES;

export const RTW_METHODS = {
  manual_video_call: { label: 'Manual check by video call', category: 'manual_video' as RtwCategory,
    caution: 'Recorded as a manual video check. It is not a certified right-to-work check, and this record does not show that Findable has a statutory defence.' },
  manual_in_person: { label: 'Manual check of the original document, in person', category: 'other_approved' as RtwCategory, caution: null },
  certified_provider: { label: 'Certified identity provider (IDSP) check', category: 'certified_provider' as RtwCategory, caution: null },
  home_office_share_code: { label: 'Home Office online check (share code)', category: 'other_approved' as RtwCategory, caution: null },
} as const;
export type RtwMethod = keyof typeof RTW_METHODS;
export const RTW_RESULTS = ['pass', 'fail'] as const;
export type RtwResult = typeof RTW_RESULTS[number];

/* ── Contractor status, VAT, leaving ─────────────────────────────────────────────────────────────── */

export const CONTRACTOR_TYPES = { individual: 'Individual (sole trader)', limited_company: 'Through a limited company' } as const;
export type ContractorType = keyof typeof CONTRACTOR_TYPES;

/** Agreement clause 12: resigned (12.1, their notice), ended by Findable on notice (12.1), misconduct (12.2). */
export const LEAVER_REASONS = {
  resigned: 'Resigned (their notice)',
  ended_on_notice: 'Ended by Findable on notice',
  misconduct: 'Ended for misconduct',
} as const;
export type LeaverReason = keyof typeof LEAVER_REASONS;

export const SCHEDULE2_STATUSES = { received: 'Received', none: 'None listed' } as const;
export type Schedule2Status = keyof typeof SCHEDULE2_STATUSES;
/** Agreement 4.2: "Within 7 days of the Start Date you may list your existing … contacts in Schedule 2." */
export const SCHEDULE2_DAYS = 7;
/** Agreement 13.3: misconduct found "within 6 months after the End Date". */
export const LATE_MISCONDUCT_MONTHS = 6;

/* ── The record (public.salesperson_onboarding) ─────────────────────────────────────────────────────── */

export interface OnboardingRecord {
  user_id: string;
  agreement_version: string | null;
  agreement_signed_on: string | null;
  agreement_ref: string | null;
  privacy_notice_version: string | null;
  privacy_notice_given_on: string | null;
  age_18_confirmed_on: string | null;
  rtw_method: RtwMethod | null;
  rtw_checked_on: string | null;
  rtw_checked_by: string | null;
  rtw_result: RtwResult | null;
  rtw_evidence_ref: string | null;
  rtw_provider: string | null;
  rtw_recheck_due: string | null;
  rtw_notes: string | null;
  bank_details_received_on: string | null;
  vat_registered: boolean | null;
  vat_number: string | null;
  contractor_type: ContractorType | null;
  company_name: string | null;
  company_number: string | null;
  company_contract_confirmed_on: string | null;
  start_date: string | null;
  schedule2_status: Schedule2Status | null;
  schedule2_on: string | null;
  team_guide_version: string | null;
  team_guide_acknowledged_on: string | null;
  end_date: string | null;
  end_reason: LeaverReason | null;
  end_note: string | null;
  misconduct_notified_on: string | null;
  data_deletion_confirmed_on: string | null;
  notes: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

type FieldKind = 'date' | 'text' | 'longtext' | 'bool' | { enum: readonly string[] } | { doc: DocumentKind };
/** Every field Paul may edit, and its kind. The ONE list: the server validates against it, the database
 *  has a column for each (scripts/salesperson-onboarding.test.ts checks the migration). */
export const ONBOARDING_FIELDS: Record<Exclude<keyof OnboardingRecord, 'user_id' | 'updated_at' | 'updated_by'>, FieldKind> = {
  agreement_version: { doc: 'contractor_agreement' },
  agreement_signed_on: 'date',
  agreement_ref: 'text',
  privacy_notice_version: { doc: 'privacy_notice' },
  privacy_notice_given_on: 'date',
  age_18_confirmed_on: 'date',
  rtw_method: { enum: Object.keys(RTW_METHODS) },
  rtw_checked_on: 'date',
  rtw_checked_by: 'text',
  rtw_result: { enum: RTW_RESULTS },
  rtw_evidence_ref: 'text',
  rtw_provider: 'text',
  rtw_recheck_due: 'date',
  rtw_notes: 'longtext',
  bank_details_received_on: 'date',
  vat_registered: 'bool',
  vat_number: 'text',
  contractor_type: { enum: Object.keys(CONTRACTOR_TYPES) },
  company_name: 'text',
  company_number: 'text',
  company_contract_confirmed_on: 'date',
  start_date: 'date',
  schedule2_status: { enum: Object.keys(SCHEDULE2_STATUSES) },
  schedule2_on: 'date',
  team_guide_version: { doc: 'team_guide' },
  team_guide_acknowledged_on: 'date',
  end_date: 'date',
  end_reason: { enum: Object.keys(LEAVER_REASONS) },
  end_note: 'longtext',
  misconduct_notified_on: 'date',
  data_deletion_confirmed_on: 'date',
  notes: 'longtext',
};
export type OnboardingField = keyof typeof ONBOARDING_FIELDS;

/** Free-text fields that are checked for sensitive data (identifiers like the VAT or company number are not). */
const SCANNED_FIELDS: OnboardingField[] = ['agreement_ref', 'rtw_checked_by', 'rtw_evidence_ref', 'rtw_provider', 'rtw_notes', 'company_name', 'end_note', 'notes'];

export function emptyOnboardingRecord(userId: string): OnboardingRecord {
  const r: Record<string, unknown> = { user_id: userId };
  for (const k of Object.keys(ONBOARDING_FIELDS)) r[k] = null;
  return r as unknown as OnboardingRecord;
}

/* ── Sensitive text ───────────────────────────────────────────────────────────────────────────────── */

/** Why a piece of free text must not be stored, or null. Deliberately blunt: a false alarm costs Paul a
 *  rewording; a stored passport number is a data-protection problem. */
export function sensitiveTextProblem(text: string | null | undefined): string | null {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  if (/\bGB\d{2}\s?[A-Z]{4}(\s?\d){14}\b/i.test(t)) return 'looks like a bank IBAN';
  if (/sort\s*-?\s*code/i.test(t) || /\b\d{2}-\d{2}-\d{2}\b/.test(t)) return 'looks like a bank sort code';
  if (/\baccount\s*(no|number|#)/i.test(t) || /(?<![\d-])\d{8}(?![\d-])/.test(t)) return 'looks like a bank account number';
  if (/passport\s*(no|number|#)/i.test(t) || /(?<![\d-])\d{9}(?![\d-])/.test(t)) return 'looks like a passport number';
  if (/\b(date of birth|dob)\b/i.test(t)) return 'looks like a date of birth';
  return null;
}

/* ── Validation (fn admin-users runs this on every save) ─────────────────────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "gb 123 4567 89" → "GB123456789"; null when it is not a UK VAT number shape (9 or 12 digits, or GD/HA + 3). */
export function normaliseVatNumber(v: string | null | undefined): string | null {
  const s = String(v ?? '').toUpperCase().replace(/[\s.-]/g, '');
  if (!s) return null;
  const body = s.startsWith('GB') ? s.slice(2) : s;
  if (/^\d{9}$/.test(body) || /^\d{12}$/.test(body) || /^(GD|HA)\d{3}$/.test(body)) return `GB${body}`;
  return null;
}

/** A Companies House number: 8 characters, digits or a two-letter prefix (SC, NI, OC…) + 6 digits. */
export function normaliseCompanyNumber(v: string | null | undefined): string | null {
  const s = String(v ?? '').toUpperCase().replace(/\s/g, '');
  if (!s) return null;
  if (/^\d{1,8}$/.test(s)) return s.padStart(8, '0');
  if (/^[A-Z]{2}\d{6}$/.test(s)) return s;
  return null;
}

export type PatchResult =
  | { ok: true; clean: Partial<OnboardingRecord> }
  | { ok: false; error: string; field?: string };

/** Validate a partial update. Unknown keys are refused (never silently dropped); every value is checked
 *  for its kind; a document version must exist and be of the right kind (drafts may be RECORDED); the
 *  cross-field rules are checked against `current` merged with the patch. */
export function validateOnboardingPatch(patch: unknown, current: OnboardingRecord | null, docs: readonly DocumentVersion[]): PatchResult {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'bad_patch' };
  const clean: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch as Record<string, unknown>)) {
    const kind = (ONBOARDING_FIELDS as Record<string, FieldKind>)[k];
    if (!kind) return { ok: false, error: 'unknown_field', field: k };
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) { clean[k] = null; continue; }
    if (kind === 'date') {
      if (typeof raw !== 'string' || !isRealDate(raw)) return { ok: false, error: 'bad_date', field: k };
      clean[k] = raw;
    } else if (kind === 'bool') {
      if (typeof raw !== 'boolean') return { ok: false, error: 'bad_value', field: k };
      clean[k] = raw;
    } else if (kind === 'text' || kind === 'longtext') {
      if (typeof raw !== 'string') return { ok: false, error: 'bad_value', field: k };
      const t = raw.trim();
      if (t.length > (kind === 'text' ? 200 : 1000)) return { ok: false, error: 'too_long', field: k };
      clean[k] = t;
    } else if ('doc' in kind) {
      if (typeof raw !== 'string' || !documentVersion(docs, raw, kind.doc)) return { ok: false, error: 'unknown_version', field: k };
      clean[k] = raw;
    } else {
      if (typeof raw !== 'string' || !kind.enum.includes(raw)) return { ok: false, error: 'bad_value', field: k };
      clean[k] = raw;
    }
  }
  for (const f of SCANNED_FIELDS) {
    if (typeof clean[f] === 'string' && sensitiveTextProblem(clean[f] as string)) return { ok: false, error: 'sensitive_text', field: f };
  }
  if ('vat_number' in clean && clean.vat_number !== null) {
    const v = normaliseVatNumber(clean.vat_number as string);
    if (!v) return { ok: false, error: 'bad_vat_number', field: 'vat_number' };
    clean.vat_number = v;
  }
  if ('company_number' in clean && clean.company_number !== null) {
    const n = normaliseCompanyNumber(clean.company_number as string);
    if (!n) return { ok: false, error: 'bad_company_number', field: 'company_number' };
    clean.company_number = n;
  }
  const m = { ...(current ?? {}), ...clean } as Partial<OnboardingRecord>;
  if (m.vat_registered === false && m.vat_number) return { ok: false, error: 'vat_number_without_registration', field: 'vat_number' };
  if (m.contractor_type !== 'limited_company' && (m.company_name || m.company_number || m.company_contract_confirmed_on)) {
    return { ok: false, error: 'company_fields_need_limited_company', field: 'contractor_type' };
  }
  if (m.rtw_method !== 'certified_provider' && m.rtw_provider) return { ok: false, error: 'provider_needs_certified_method', field: 'rtw_provider' };
  if (!!m.end_reason !== !!m.end_date) return { ok: false, error: 'end_needs_date_and_reason', field: m.end_reason ? 'end_date' : 'end_reason' };
  if (m.misconduct_notified_on) {
    if (!m.end_date) return { ok: false, error: 'late_misconduct_needs_end', field: 'misconduct_notified_on' };
    if (m.end_reason === 'misconduct') return { ok: false, error: 'already_misconduct', field: 'misconduct_notified_on' };
    if (m.misconduct_notified_on < m.end_date || m.misconduct_notified_on > addMonths(m.end_date, LATE_MISCONDUCT_MONTHS)) {
      return { ok: false, error: 'late_misconduct_outside_window', field: 'misconduct_notified_on' };
    }
  }
  if (m.data_deletion_confirmed_on && !m.end_date) return { ok: false, error: 'deletion_needs_end', field: 'data_deletion_confirmed_on' };
  return { ok: true, clean: clean as Partial<OnboardingRecord> };
}

/** A new document version Paul adds (Team → Documents). Never approved on creation. */
export function validateNewDocument(input: unknown): { ok: true; doc: Omit<DocumentVersion, 'status'> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bad_document' };
  const i = input as Record<string, unknown>;
  const id = String(i.id ?? '').trim();
  const kind = String(i.kind ?? '');
  const label = String(i.label ?? '').trim();
  const ref = String(i.document_ref ?? '').trim();
  const outstanding = Array.isArray(i.outstanding) ? i.outstanding.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  if (!DOCUMENT_ID_RE.test(id)) return { ok: false, error: 'bad_document_id' };
  if (!(kind in DOCUMENT_KINDS)) return { ok: false, error: 'bad_document_kind' };
  if (label.length < 3 || label.length > 200) return { ok: false, error: 'bad_document_label' };
  if (ref.length > 300 || outstanding.some((o) => o.length > 300) || outstanding.length > 30) return { ok: false, error: 'too_long' };
  return { ok: true, doc: { id, kind: kind as DocumentKind, label, document_ref: ref || null, outstanding, note: null } };
}

/* ── Dates (UK calendar days as YYYY-MM-DD; compared as strings) ──────────────────────────────────── */

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}
/** Today in the UK (Europe/London) as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/* ── The checklist ─────────────────────────────────────────────────────────────────────────────────── */

/** What the Team list already knows about the person (admin-users team_list). */
export interface MemberState {
  status: 'active' | 'disabled' | string;
  role: 'admin' | 'sales' | null;
  suspended_at?: string | null;
  has_signed_in?: boolean;
}

/** The ten items that block READY TO SELL — the SAME keys public.salesperson_onboarding_missing() returns. */
export const BLOCKING_KEYS = [
  'agreement', 'privacy_notice', 'age_18', 'right_to_work', 'bank_details', 'vat',
  'contractor_status', 'start_date', 'login', 'team_guide',
] as const;
/** The other keys the server can return: the person is not an active salesperson right now. */
export const INACTIVE_KEYS = ['not_sales', 'suspended', 'ended'] as const;
export type ChecklistKey = typeof BLOCKING_KEYS[number] | 'schedule2';

export const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  agreement: 'Current approved contractor agreement signed',
  privacy_notice: 'Current approved privacy notice given',
  age_18: 'Confirmed 18 or over',
  right_to_work: 'Right to work check recorded',
  bank_details: 'Bank details received',
  vat: 'VAT status',
  contractor_status: 'Individual or limited company',
  start_date: 'Start date',
  login: 'Own LeadFinderOS login',
  team_guide: 'Current team guide acknowledged',
  schedule2: 'Existing contacts (Schedule 2)',
};

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  done: boolean;
  /** Counts toward READY TO SELL. Schedule 2 is optional under the agreement, so it never blocks. */
  blocking: boolean;
  /** What is on file, or what is missing — one plain sentence. */
  detail: string;
}

export interface OnboardingSummary {
  items: ChecklistItem[];
  missing: ChecklistItem[];
  done: number;
  total: number;
  activeMember: boolean;
  inactiveReason: string | null;
  /** The server's answer when supplied (it is the gate), else this file's. */
  readyToSell: boolean;
  /** The server's missing keys and this file's disagree — shown, never hidden. */
  serverDisagrees: boolean;
  notes: string[];
  leaver: LeaverState;
}

export interface LeaverState {
  recorded: boolean;
  reason: LeaverReason | null;
  endDate: string | null;
  accessStillOn: boolean;
  deletionConfirmed: boolean;
}

const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function leaverStateOf(r: OnboardingRecord | null, member: MemberState, today: string): LeaverState {
  const endDate = r?.end_date ?? null;
  const ended = !!endDate && endDate <= today;
  return {
    recorded: !!endDate,
    reason: r?.end_reason ?? null,
    endDate,
    accessStillOn: ended && member.status === 'active' && member.role === 'sales',
    deletionConfirmed: !!r?.data_deletion_confirmed_on,
  };
}

/** How a recorded document reads, and whether it counts. */
function documentItem(docs: readonly DocumentVersion[], kind: DocumentKind, id: string | null, when: string | null, verb: string): { done: boolean; detail: string } {
  const doc = documentVersion(docs, id, kind);
  const current = currentDocument(docs, kind);
  if (!id) return { done: false, detail: current ? `Not recorded. The current version is "${current.label}".` : `Not recorded. There is no approved ${DOCUMENT_KINDS[kind].toLowerCase()} yet.` };
  if (!doc) return { done: false, detail: 'The version recorded is not known.' };
  if (doc.status !== 'approved') {
    const what = doc.status === 'draft' ? 'a DRAFT' : 'a SUPERSEDED version';
    return { done: false, detail: `${doc.label} (${what}) ${verb}${when ? ` ${fmt(when)}` : ''}. Recorded for history; it does not count${current ? ` — the current version is "${current.label}"` : ` — there is no approved ${DOCUMENT_KINDS[kind].toLowerCase()} yet`}.` };
  }
  if (!when) return { done: false, detail: `${doc.label}: no date recorded.` };
  return { done: true, detail: `${doc.label}, ${verb} ${fmt(when)}` };
}

export function onboardingSummary(
  record: OnboardingRecord | null, member: MemberState, docs: readonly DocumentVersion[],
  today: string = ukToday(), serverMissing?: readonly string[] | null,
): OnboardingSummary {
  const r = record ?? emptyOnboardingRecord('');
  const notes: string[] = [];
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, done: boolean, detail: string, blocking = true) => items.push({ key, label: CHECKLIST_LABELS[key], done, blocking, detail });

  /* 1. Contractor agreement — the CURRENT APPROVED version, a date, and where the signed copy is kept. */
  const ag = documentItem(docs, 'contractor_agreement', r.agreement_version, r.agreement_signed_on, 'signed');
  const agDone = ag.done && !!r.agreement_ref?.trim();
  add('agreement', agDone, ag.done && !agDone ? `${ag.detail} — record where the signed copy is kept.` : agDone ? `${ag.detail} (copy: ${r.agreement_ref})` : ag.detail);

  /* 2. Privacy notice — the CURRENT APPROVED version given. */
  const pn = documentItem(docs, 'privacy_notice', r.privacy_notice_version, r.privacy_notice_given_on, 'given');
  add('privacy_notice', pn.done, pn.detail);

  /* 3. Age. */
  add('age_18', !!r.age_18_confirmed_on, r.age_18_confirmed_on ? `Confirmed ${fmt(r.age_18_confirmed_on)}` : 'Not confirmed.');

  /* 4. Right to work — a passed check with method, date, checker and where the evidence is kept. */
  const method = r.rtw_method ? RTW_METHODS[r.rtw_method] : null;
  const rtwMissing: string[] = [];
  if (!r.rtw_method) rtwMissing.push('method');
  if (!r.rtw_checked_on) rtwMissing.push('date');
  if (!r.rtw_checked_by) rtwMissing.push('who checked');
  if (!r.rtw_evidence_ref) rtwMissing.push('where the evidence is kept');
  if (r.rtw_method === 'certified_provider' && !r.rtw_provider) rtwMissing.push('provider name');
  const rtwLapsed = !!r.rtw_recheck_due && r.rtw_recheck_due <= today;
  const rtwDone = r.rtw_result === 'pass' && rtwMissing.length === 0 && !rtwLapsed;
  add('right_to_work', rtwDone,
    r.rtw_result === 'fail' ? 'The check FAILED. They cannot start.'
      : rtwLapsed ? `A follow-up check was due ${fmt(r.rtw_recheck_due!)}.`
      : rtwDone ? `${RTW_CATEGORIES[method!.category]}: ${method!.label}, ${fmt(r.rtw_checked_on!)}, by ${r.rtw_checked_by}`
      : !r.rtw_result && rtwMissing.length >= 4 ? 'No check recorded.'
      : `Missing: ${[...(r.rtw_result ? [] : ['result']), ...rtwMissing].join(', ')}.`);
  if (method?.caution && r.rtw_result === 'pass') notes.push(`Right to work: ${method.caution}`);
  if (r.rtw_checked_on && r.start_date && r.rtw_checked_on > r.start_date) notes.push('Right to work: the check is dated after the start date. The checklist says check before their first day.');

  /* 5. Bank details — received, nothing more. */
  add('bank_details', !!r.bank_details_received_on, r.bank_details_received_on ? `Received ${fmt(r.bank_details_received_on)} (kept on the agreement, not here)` : 'Not received.');

  /* 6. VAT — answered: no, or yes with a number. */
  const vatDone = r.vat_registered === false || (r.vat_registered === true && !!normaliseVatNumber(r.vat_number));
  add('vat', vatDone, r.vat_registered === false ? 'Not VAT registered' : r.vat_registered === true ? (vatDone ? `VAT registered: ${r.vat_number}` : 'VAT registered, but no VAT number.') : 'Not asked yet.');
  if (r.vat_registered === true) notes.push('VAT: they must send a valid VAT invoice for each commission payment (agreement 2.3).');

  /* 7. Individual or limited company — a company needs the contract in its own name (checklist Part 13). */
  const companyDone = r.contractor_type === 'limited_company' && !!r.company_name && !!r.company_number && !!r.company_contract_confirmed_on;
  add('contractor_status', r.contractor_type === 'individual' || companyDone,
    r.contractor_type === 'individual' ? 'Individual (sole trader)'
      : r.contractor_type === 'limited_company' ? (companyDone ? `Limited company: ${r.company_name} (${r.company_number}); contract with the company confirmed ${fmt(r.company_contract_confirmed_on!)}`
        : 'Limited company: the contract has to be with their company. Record the company name, number and the date that was confirmed.')
      : 'Not asked yet.');
  if (r.contractor_type === 'limited_company') notes.push('Limited company: the checklist says speak to an adviser before they start, because the contract must be with their company.');

  /* 8. Start date. */
  add('start_date', !!r.start_date, r.start_date ? fmt(r.start_date) : 'Not set.');

  /* 9. Their own LeadFinderOS login — from the live account, never stored. */
  const loginLive = member.role === 'sales' && member.status === 'active';
  add('login', loginLive, loginLive ? (member.has_signed_in ? 'Login created and used' : 'Login created (not signed in yet)') : member.status !== 'active' ? 'Login disabled.' : 'No sales login.');

  /* 10. Team guide — the current approved guide acknowledged (the salesperson can do this themselves). */
  const tg = documentItem(docs, 'team_guide', r.team_guide_version, r.team_guide_acknowledged_on, 'acknowledged');
  add('team_guide', tg.done, tg.detail);

  /* 11. Schedule 2 — optional, so it never blocks; it shows the deadline. */
  const s2Due = r.start_date ? addDays(r.start_date, SCHEDULE2_DAYS) : null;
  add('schedule2', !!r.schedule2_status,
    r.schedule2_status === 'received' ? `Received${r.schedule2_on ? ` ${fmt(r.schedule2_on)}` : ''}`
      : r.schedule2_status === 'none' ? 'None listed'
      : s2Due ? (s2Due < today ? `Not received; the 7 days ended ${fmt(s2Due)}, so no existing contacts are listed.` : `Optional; due by ${fmt(s2Due)}.`)
      : 'Optional; due within 7 days of the start date.', false);

  for (const kind of ['contractor_agreement', 'privacy_notice'] as const) {
    if (!currentDocument(docs, kind)) notes.push(`There is no approved ${DOCUMENT_KINDS[kind].toLowerCase()} yet, so nobody can be Ready to Sell. Add the final version under Documents and approve it.`);
  }

  const blockingItems = items.filter((i) => i.blocking);
  const missing = blockingItems.filter((i) => !i.done);
  const leaver = leaverStateOf(record, member, today);
  const ended = !!leaver.endDate && leaver.endDate <= today;
  const inactiveReason = member.role !== 'sales' && member.role !== null ? 'Not a salesperson'
    : member.status !== 'active' ? 'Login disabled'
    : member.role !== 'sales' ? 'No sales login'
    : member.suspended_at ? 'Sales access suspended'
    : ended ? `Ended ${fmt(leaver.endDate!)}`
    : null;
  if (leaver.recorded && !ended) notes.push(`Leaving: end date ${fmt(leaver.endDate!)} (${LEAVER_REASONS[leaver.reason!]}).`);
  if (leaver.accessStillOn) notes.push('Leaving: their end date has passed but their login is still on. Press Disable to remove access.');
  if (leaver.recorded && ended && !leaver.deletionConfirmed) notes.push(`Leaving: they have not confirmed deleting Findable data (due ${fmt(addDays(leaver.endDate!, 7))}, clause 12.3).`);

  const localReady = missing.length === 0 && inactiveReason === null;
  const serverReady = serverMissing ? serverMissing.length === 0 : null;
  const serverDisagrees = serverReady !== null && serverReady !== localReady;
  if (serverDisagrees) notes.push(`The server's check says ${serverReady ? 'ready' : `not ready (${serverMissing!.join(', ')})`}; the server's answer is the one that applies.`);
  return {
    items, missing,
    done: blockingItems.length - missing.length,
    total: blockingItems.length,
    activeMember: inactiveReason === null,
    inactiveReason,
    readyToSell: serverReady ?? localReady,
    serverDisagrees,
    notes,
    leaver,
  };
}

/** Plain words for the server's missing keys (what a salesperson sees about themselves). */
export const MISSING_KEY_WORDS: Record<string, string> = {
  ...CHECKLIST_LABELS,
  not_sales: 'A salesperson login',
  suspended: 'Sales access is suspended',
  ended: 'Your engagement has ended',
};

/** The error codes fn admin-users can return, in plain words. */
export const ONBOARDING_SAVE_ERRORS: Record<string, string> = {
  bad_patch: 'Nothing to save.',
  unknown_field: 'That field is not part of the onboarding record.',
  unknown_version: 'Pick one of the listed document versions.',
  bad_date: 'Use a real date.',
  bad_value: 'Pick one of the options.',
  too_long: 'That is too long.',
  sensitive_text: 'That looks like a bank, passport or birth-date detail. Keep those on the agreement or in your secure folder, not here.',
  bad_vat_number: 'That is not a UK VAT number (GB + 9 digits).',
  bad_company_number: 'That is not a Companies House number (8 characters).',
  vat_number_without_registration: 'Remove the VAT number, or mark them VAT registered.',
  company_fields_need_limited_company: 'Company details only apply to a limited company.',
  provider_needs_certified_method: 'A provider name only applies to a certified provider check.',
  end_needs_date_and_reason: 'A leaver needs both an end date and a reason.',
  late_misconduct_needs_end: 'Record the end date first.',
  already_misconduct: 'They were already ended for misconduct.',
  late_misconduct_outside_window: 'Later misconduct can only be recorded within 6 months after the end date.',
  deletion_needs_end: 'Record the end date first.',
  not_a_salesperson: 'Onboarding is for salespeople only.',
  not_a_member: 'That person is not on the team.',
  not_ready_to_sell: 'That salesperson is not Ready to Sell, so leads cannot be moved to them.',
  bad_document: 'Fill in the document details.',
  bad_document_id: 'Version id: lower-case letters, digits and hyphens (e.g. contractor-agreement-v3).',
  bad_document_kind: 'Pick which document this is.',
  bad_document_label: 'Give the version a name.',
  document_exists: 'A version with that id already exists.',
  not_found: 'That version no longer exists.',
  has_outstanding: 'Resolve every outstanding item before approving.',
  not_draft: 'Only a draft can be approved.',
  bad_decision: 'Pick Confirm or Not credited.',
  no_open_review: 'That review has already been resolved.',
  no_claimed_seller: 'There is no claimed seller to confirm — choose Not credited.',
  draft_named_version: 'A version named as a draft can never be approved. Add the final document as a new version, then approve that.',
};
