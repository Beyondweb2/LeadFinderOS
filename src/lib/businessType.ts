/* ══ WHAT KIND OF BUSINESS IS THIS? — legal form, from evidence only (2026-10-05) ══════════════════════
   docs/salesperson-onboarding.md §6. Paul's checklist (Part 2, clause 4.3(b)) asks LeadFinderOS to record
   whether a lead is a limited company / LLP, a sole trader, a partnership, or unknown — because UK
   marketing rules treat sole traders and ordinary partnerships like individuals. This file is the ONE
   place that decides it. Pure and edge-safe (no imports).

   ⛔ NEVER A GUESS. "Unknown" is the answer unless there is evidence:
      · a STRONG Companies House match (src/lib/companiesHouse.ts) on an ACTIVE company → limited company
        or LLP, labelled as the machine's match, not a person's confirmation;
      · a person's record (public.lead_business_type_records): what the business said, what its website or
        a Companies House look-up showed — with a note of the evidence.
      A missing Companies House match is never "sole trader": sole traders and partnerships have no record
      to find, and neither do companies trading under another name.
   ⛔ NOTHING READS THIS TO ALLOW OR BLOCK A CHANNEL YET. WhatsApp, email and calling are unchanged; using
      it for channel permissions is a later, separate decision. */

export const BUSINESS_TYPES = {
  limited_company: 'Limited company',
  llp: 'LLP',
  sole_trader: 'Sole trader',
  partnership: 'Partnership',
  unknown: 'Unknown',
} as const;
export type BusinessType = keyof typeof BUSINESS_TYPES;

/** Where a person's record came from. */
export const BUSINESS_TYPE_SOURCES = {
  stated_by_business: 'The business told us',
  website: 'Their website says so',
  companies_house_confirmed: 'Checked on Companies House by a person',
  other_document: 'Another document (invoice, letterhead…)',
} as const;
export type BusinessTypeSource = keyof typeof BUSINESS_TYPE_SOURCES;

/** One person's record (public.lead_business_type_records), newest wins. */
export interface BusinessTypeRecord {
  business_type: BusinessType;
  source: BusinessTypeSource;
  evidence_note: string | null;
  recorded_at: string;
}

/** The fields of a stored Companies House check this needs (companies_house_checks). */
export interface ChEvidence {
  match: 'strong' | 'possible' | 'none' | string;
  company_name: string | null;
  company_number: string | null;
  company_status: string | null;
  company_type: string | null;
}

/** Companies House company_type values (the public API's codes) that are a company limited by shares or
 *  guarantee, or a plc. Anything not listed — unlimited companies, limited partnerships, Scottish
 *  partnerships, overseas entities, charities — is NOT mapped: it reads as unknown. */
const CH_LIMITED = new Set([
  'ltd', 'plc', 'private-limited-guarant-nsc', 'private-limited-guarant-nsc-limited-exemption',
  'private-limited-shares-section-30-exemption', 'old-public-company',
]);
const CH_LLP = new Set(['llp']);

/** What a stored Companies House check says, or null when it says nothing reliable. */
export function businessTypeFromCompaniesHouse(ch: ChEvidence | null | undefined): BusinessType | null {
  if (!ch || ch.match !== 'strong') return null;
  if (String(ch.company_status ?? '').toLowerCase() !== 'active') return null;
  const t = String(ch.company_type ?? '').toLowerCase();
  if (CH_LLP.has(t)) return 'llp';
  if (CH_LIMITED.has(t)) return 'limited_company';
  return null;
}

export interface BusinessTypeVerdict {
  type: BusinessType;
  label: string;
  /** 'person' = someone recorded it with evidence; 'companies_house_match' = the machine's strong match. */
  source: 'person' | 'companies_house_match' | 'none';
  detail: string;
  /** A person's record and the Companies House match disagree. Shown, never resolved silently. */
  conflict: boolean;
}

export function businessTypeOf(input: { ch?: ChEvidence | null; records?: readonly BusinessTypeRecord[] | null }): BusinessTypeVerdict {
  const fromCh = businessTypeFromCompaniesHouse(input.ch);
  const latest = [...(input.records ?? [])]
    .filter((r) => r && r.business_type in BUSINESS_TYPES && r.source in BUSINESS_TYPE_SOURCES)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0] ?? null;
  const chText = input.ch && fromCh ? `${input.ch.company_name ?? 'company'}${input.ch.company_number ? ` (${input.ch.company_number})` : ''}` : '';
  if (latest && latest.business_type !== 'unknown') {
    const conflict = !!fromCh && fromCh !== latest.business_type;
    return {
      type: latest.business_type,
      label: BUSINESS_TYPES[latest.business_type],
      source: 'person',
      detail: `${BUSINESS_TYPE_SOURCES[latest.source]}${latest.evidence_note ? `: ${latest.evidence_note}` : ''}${conflict ? ` — but Companies House matched ${chText} as ${BUSINESS_TYPES[fromCh!]}` : ''}`,
      conflict,
    };
  }
  if (fromCh) {
    return { type: fromCh, label: BUSINESS_TYPES[fromCh], source: 'companies_house_match', detail: `Companies House match (not confirmed by a person): ${chText}`, conflict: false };
  }
  return { type: 'unknown', label: BUSINESS_TYPES.unknown, source: 'none', detail: 'No evidence on file. Do not assume.', conflict: false };
}
