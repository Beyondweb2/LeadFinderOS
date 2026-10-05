/* ══ SALESPERSON ONBOARDING — the rules, once (2026-10-05) ═══════════════════════════════════════════
   docs/salesperson-onboarding.md. What Paul must have on file before a salesperson is READY TO SELL,
   taken from the onboarding checklist in "Findable_Paul_Checklist_Risks_and_Actions" (Part 13) and the
   Independent Sales Contractor Agreement (draft v2). Pure and edge-safe (no imports): fn admin-users
   validates every save with it, and the Team page draws the checklist with it.

   ⛔ READY TO SELL IS DERIVED, NEVER STORED. It is recomputed from the record and the member's live
      status every time, so a lapsed right-to-work date or a disabled login turns it off by itself.
   ⛔ READY TO SELL IS A DISPLAY, NOT A LOCK. Nothing a salesperson does (claims, calls, WhatsApp) reads
      it — making it a gate would change sending behaviour, which this work must not touch.
   ⛔ NO RAW SENSITIVE DATA. Bank details, passport numbers and copies stay on the signed agreement and in
      Paul's secure folder; the record holds only that they were received, when, and WHERE the evidence
      is kept. `sensitiveTextProblem` refuses text that looks like an account number, a sort code, a
      passport number or an IBAN.
   ⛔ A TICK HERE IS NOT A LEGAL DEFENCE. The right-to-work entry records what Paul did; whether that
      method gives Findable the statutory excuse is the checklist's reading, quoted per method below.
   Commission is NOT decided here (another session owns it): the leaver fields are a record only. */

/* ── Document versions — the ONLY versions a record may name ─────────────────────────────────────── */

export interface DocumentVersion {
  id: string;
  label: string;
  /** May this version be recorded as the one that counts? A draft with blanks may be recorded as GIVEN
   *  (so the record is honest about what the person actually received) but never completes the item. */
  final: boolean;
  /** Blanks or known problems that stop it being final. Empty when final. */
  outstanding: string[];
  /** A caution shown whenever this version is on a record. */
  note?: string;
}

export const CONTRACTOR_AGREEMENT_VERSIONS: readonly DocumentVersion[] = [
  {
    id: 'contractor-agreement-v2',
    /* The pack calls it "draft v2"; it has no blanks of its own (only the contractor's details to fill
       in), so a signed copy counts. Paul decides whether to sign this or wait for the amended clause. */
    label: 'Independent Sales Contractor Agreement v2 (pack of 5 Oct 2026)',
    final: true,
    outstanding: [],
    note: 'Clause 4.3(c) (WhatsApp first contact) is being amended separately and does not describe how LeadFinderOS works today.',
  },
];

/** Paul's checklist (Part 15): "Give it to each salesperson before the right to work call. Fill in the
 *  bracketed retention periods." The draft below still has every bracket, so it is NOT final. Add the
 *  completed version here (final: true, outstanding: []) once Paul has filled them in. */
export const PRIVACY_NOTICE_VERSIONS: readonly DocumentVersion[] = [
  {
    id: 'salesperson-privacy-notice-draft-2026-10-05',
    label: 'Privacy Notice for Salespeople, draft with blanks (pack of 5 Oct 2026)',
    final: false,
    outstanding: [
      'Section 1: the ICO registration number.',
      'Section 5: name the right to work checking provider, or delete the bracket if none is used.',
      'Section 5: confirm the overseas-transfer safeguard for each provider (Supabase, Cloudflare, Meta, the email provider).',
      'Section 6: confirm 6 years for payment, commission and tax records.',
      'Section 6: confirm 6 years for the agreement and related correspondence.',
      'Section 6: set the retention period for sales and activity records in LeadFinderOS.',
      'Section 6: confirm 12 months for login and access logs.',
      'Section 9: the "Last updated" date.',
      'The opening line "Words in [square brackets] are for Paul to complete before use" must come out.',
      'Sections 2 and 3 describe "WhatsApp permission records" and "the WhatsApp permission process" from the clause being amended; they must match how WhatsApp is actually used before the notice is issued.',
    ],
  },
];

export const TEAM_GUIDE_VERSIONS: readonly DocumentVersion[] = [
  {
    id: 'team-guide-2026-10-02',
    label: 'Team guide dated 2 October 2026',
    final: true,
    outstanding: [],
    note: 'The change notes of 5 Oct 2026 (commission wording, leaver text, data rules) are not in this version yet.',
  },
];

export function documentVersion(list: readonly DocumentVersion[], id: string | null | undefined): DocumentVersion | null {
  return list.find((v) => v.id === id) ?? null;
}

/* ── Right to work ────────────────────────────────────────────────────────────────────────────────── */

export const RTW_METHODS = {
  video_call_original_not_held: {
    label: 'Video call (original passport shown on camera)',
    /** The checklist, Part 11 risk 1: "a video check only counts as a legal defence if Paul has the
     *  original passport physically in his hands during the call." */
    checklistDefence: false,
    caution: 'The checklist says a video check gives no legal defence unless Paul physically holds the original passport. It lowers the risk; it does not protect Findable from a fine. Switch to a certified provider when practical.',
  },
  in_person_original: {
    label: 'Original document checked in person',
    checklistDefence: true,
    caution: null,
  },
  certified_provider: {
    label: 'Certified digital identity provider (IDSP / "RtW DVSP")',
    checklistDefence: true,
    caution: null,
  },
  home_office_online: {
    label: 'Home Office online check (share code)',
    checklistDefence: true,
    caution: null,
  },
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
  misconduct: 'Ended for misconduct (clause 12.2)',
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

type FieldKind = 'date' | 'text' | 'longtext' | 'bool' | { enum: readonly string[] };
/** Every field Paul may edit, and its kind. The ONE list: the server validates against it, the database
 *  has a column for each (scripts/salesperson-onboarding.test.ts checks the migration). */
export const ONBOARDING_FIELDS: Record<Exclude<keyof OnboardingRecord, 'user_id' | 'updated_at' | 'updated_by'>, FieldKind> = {
  agreement_version: { enum: CONTRACTOR_AGREEMENT_VERSIONS.map((v) => v.id) },
  agreement_signed_on: 'date',
  privacy_notice_version: { enum: PRIVACY_NOTICE_VERSIONS.map((v) => v.id) },
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
  team_guide_version: { enum: TEAM_GUIDE_VERSIONS.map((v) => v.id) },
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
const SCANNED_FIELDS: OnboardingField[] = ['rtw_checked_by', 'rtw_evidence_ref', 'rtw_provider', 'rtw_notes', 'company_name', 'end_note', 'notes'];

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
 *  for its kind; the cross-field rules are checked against `current` merged with the patch. */
export function validateOnboardingPatch(patch: unknown, current: OnboardingRecord | null): PatchResult {
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

export type ChecklistKey =
  | 'agreement' | 'privacy_notice' | 'age_18' | 'right_to_work' | 'bank_details' | 'vat'
  | 'contractor_status' | 'start_date' | 'login' | 'team_guide' | 'schedule2';

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
  /** Blocking items not yet done — what to show first. */
  missing: ChecklistItem[];
  done: number;
  total: number;
  /** Is the login itself live for sales right now? */
  activeMember: boolean;
  inactiveReason: string | null;
  /** Every blocking item done AND an active sales login AND not past an end date. */
  readyToSell: boolean;
  /** Cautions that do not block (a draft document, a method with no legal defence, Schedule 2 due…). */
  notes: string[];
  leaver: LeaverState;
}

export interface LeaverState {
  recorded: boolean;
  reason: LeaverReason | null;
  endDate: string | null;
  /** Ended (end date today or earlier) but the login is still live — Disable on the Team page removes it. */
  accessStillOn: boolean;
  /** Clause 12.3: they must confirm deletion of Findable data within 7 days of the end. */
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

export function onboardingSummary(record: OnboardingRecord | null, member: MemberState, today: string = ukToday()): OnboardingSummary {
  const r = record ?? emptyOnboardingRecord('');
  const notes: string[] = [];
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, label: string, done: boolean, detail: string, blocking = true) => items.push({ key, label, done, blocking, detail });

  /* 1. The signed contractor agreement — a known version and a date. */
  const agreement = documentVersion(CONTRACTOR_AGREEMENT_VERSIONS, r.agreement_version);
  const agreementDone = !!agreement && agreement.final && !!r.agreement_signed_on;
  add('agreement', 'Contractor agreement signed', agreementDone,
    agreementDone ? `${agreement!.label}, signed ${fmt(r.agreement_signed_on!)}` : !r.agreement_version ? 'No signed agreement recorded.' : !r.agreement_signed_on ? 'Version recorded but no signing date.' : 'This version is not a final agreement.');
  if (agreement?.note) notes.push(`Agreement: ${agreement.note}`);

  /* 2. The privacy notice — given, and a FINAL version. A draft is recorded honestly but never completes it. */
  const notice = documentVersion(PRIVACY_NOTICE_VERSIONS, r.privacy_notice_version);
  const noticeDone = !!notice && notice.final && !!r.privacy_notice_given_on;
  add('privacy_notice', 'Privacy notice given', noticeDone,
    noticeDone ? `${notice!.label}, given ${fmt(r.privacy_notice_given_on!)}`
      : notice && !notice.final && r.privacy_notice_given_on ? `Only the draft was given (${fmt(r.privacy_notice_given_on)}). It still has blanks, so it does not count until the final notice is given.`
      : !r.privacy_notice_version ? 'No privacy notice recorded.' : 'Version recorded but no date given.');
  if (notice && !notice.final) notes.push(`Privacy notice: the version recorded is a draft with ${notice.outstanding.length} items outstanding.`);

  /* 3. Age. */
  add('age_18', 'Confirmed 18 or over', !!r.age_18_confirmed_on, r.age_18_confirmed_on ? `Confirmed ${fmt(r.age_18_confirmed_on)}` : 'Not confirmed.');

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
  add('right_to_work', 'Right to work checked', rtwDone,
    r.rtw_result === 'fail' ? 'The check FAILED. They cannot start.'
      : rtwLapsed ? `A follow-up check was due ${fmt(r.rtw_recheck_due!)}.`
      : rtwDone ? `${method!.label}, ${fmt(r.rtw_checked_on!)}, by ${r.rtw_checked_by}`
      : !r.rtw_result && rtwMissing.length === 5 ? 'No check recorded.'
      : `Missing: ${[...(r.rtw_result ? [] : ['result']), ...rtwMissing].join(', ')}.`);
  if (method?.caution && r.rtw_result === 'pass') notes.push(`Right to work: ${method.caution}`);
  if (r.rtw_checked_on && r.start_date && r.rtw_checked_on > r.start_date) notes.push('Right to work: the check is dated after the start date. The checklist says check before their first day.');

  /* 5. Bank details — received, nothing more. */
  add('bank_details', 'Bank details received', !!r.bank_details_received_on, r.bank_details_received_on ? `Received ${fmt(r.bank_details_received_on)} (kept on the agreement, not here)` : 'Not received.');

  /* 6. VAT — answered: no, or yes with a number. */
  const vatDone = r.vat_registered === false || (r.vat_registered === true && !!normaliseVatNumber(r.vat_number));
  add('vat', 'VAT status', vatDone,
    r.vat_registered === false ? 'Not VAT registered' : r.vat_registered === true ? (vatDone ? `VAT registered: ${r.vat_number}` : 'VAT registered, but no VAT number.') : 'Not asked yet.');
  if (r.vat_registered === true) notes.push('VAT: they must send a valid VAT invoice for each commission payment (agreement 2.3).');

  /* 7. Individual or limited company — a company needs the contract in its own name (checklist Part 13). */
  const companyDone = r.contractor_type === 'limited_company' && !!r.company_name && !!r.company_number && !!r.company_contract_confirmed_on;
  add('contractor_status', 'Individual or limited company', r.contractor_type === 'individual' || companyDone,
    r.contractor_type === 'individual' ? 'Individual (sole trader)'
      : r.contractor_type === 'limited_company' ? (companyDone ? `Limited company: ${r.company_name} (${r.company_number}); contract with the company confirmed ${fmt(r.company_contract_confirmed_on!)}`
        : 'Limited company: the contract has to be with their company. Record the company name, number and the date that was confirmed.')
      : 'Not asked yet.');
  if (r.contractor_type === 'limited_company') notes.push('Limited company: the checklist says speak to an adviser before they start, because the contract must be with their company.');

  /* 8. Start date. */
  add('start_date', 'Start date', !!r.start_date, r.start_date ? fmt(r.start_date) : 'Not set.');

  /* 9. Their own LeadFinderOS login — from the live account, never stored. */
  const loginLive = member.role === 'sales' && member.status === 'active';
  add('login', 'Own LeadFinderOS login', loginLive,
    loginLive ? (member.has_signed_in ? 'Login created and used' : 'Login created (not signed in yet)') : member.status !== 'active' ? 'Login disabled.' : 'No sales login.');

  /* 10. Team guide read (the "before you start" checklist). */
  const guide = documentVersion(TEAM_GUIDE_VERSIONS, r.team_guide_version);
  const guideDone = !!guide && guide.final && !!r.team_guide_acknowledged_on;
  add('team_guide', 'Team guide acknowledged', guideDone,
    guideDone ? `${guide!.label}, acknowledged ${fmt(r.team_guide_acknowledged_on!)}` : !r.team_guide_version ? 'Not acknowledged.' : 'Version recorded but no date.');
  if (guide?.note) notes.push(`Team guide: ${guide.note}`);

  /* 11. Schedule 2 — optional, so it never blocks; it shows the deadline. */
  const s2Due = r.start_date ? addDays(r.start_date, SCHEDULE2_DAYS) : null;
  add('schedule2', 'Existing contacts (Schedule 2)', !!r.schedule2_status,
    r.schedule2_status === 'received' ? `Received${r.schedule2_on ? ` ${fmt(r.schedule2_on)}` : ''}`
      : r.schedule2_status === 'none' ? 'None listed'
      : s2Due ? (s2Due < today ? `Not received; the 7 days ended ${fmt(s2Due)}, so no existing contacts are listed.` : `Optional; due by ${fmt(s2Due)}.`)
      : 'Optional; due within 7 days of the start date.', false);

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
  return {
    items,
    missing,
    done: blockingItems.length - missing.length,
    total: blockingItems.length,
    activeMember: inactiveReason === null,
    inactiveReason,
    readyToSell: missing.length === 0 && inactiveReason === null,
    notes,
    leaver,
  };
}

/** The error codes fn admin-users can return for a save, in plain words. */
export const ONBOARDING_SAVE_ERRORS: Record<string, string> = {
  bad_patch: 'Nothing to save.',
  unknown_field: 'That field is not part of the onboarding record.',
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
};
