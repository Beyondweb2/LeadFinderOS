// csvLeadImport — the browser half of the Outreach CSV import (2026-10-05, fix/csv-lead-import;
// docs/pre-sales-certification/csv-import-fix.md).
//
// ⛔ THE SERVER DECIDES. public.import_leads (migration 20261010170000) validates every row, finds duplicates with
// the canonical _lead_identity_rows, stamps the owner (always the caller) and writes. This file only READS the file
// (BOM, quoted commas, line breaks inside quotes, ; or tab separators), MAPS columns to the thirteen fields the
// server accepts, sends them in calls of IMPORT_BATCH_MAX, and turns the server's answers into words. It holds no
// validation or duplicate rule of its own — a second copy of either is the "one rule in N places" trap.
//
// ⛔ ONLY THE THIRTEEN FIELDS ARE EVER SENT (buildImportRows). An owner, status, seller, payment, agreement or client
// column in a CSV is never mapped, and the server ignores anything else that arrives anyway.
//
// Leaf imports only (relative, explicit .ts): scripts/csv-lead-import.test.ts loads it directly. The one import is the
// refusal wording for a salesperson whose onboarding is incomplete (readinessWords.ts, final sales release).
import { onboardingWordsForPausedRefusal } from './readinessWords.ts';

/** The fields a CSV row may set — the same allowlist import_leads reads. Order = the mapping screen's order.
 *  `country` (2026-10-07, migration 20261014100200) is optional: UK or Australia words; left unmapped, the server
 *  derives it per row (a +61 phone, an address ending Australia or naming "NSW 2000" → Australia, else UK). */
export const IMPORT_FIELDS = [
  'business_name', 'contact_name', 'phone', 'email', 'website', 'address', 'postcode', 'town', 'trade', 'notes', 'google_maps_url', 'place_id', 'country',
] as const;
export type ImportField = typeof IMPORT_FIELDS[number];

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  business_name: 'Business name', contact_name: 'Contact person', phone: 'Phone', email: 'Email', website: 'Website',
  address: 'Address', postcode: 'Postcode', town: 'Town', trade: 'Trade / category', notes: 'Notes', google_maps_url: 'Google Maps link', place_id: 'Google Place ID',
  country: 'Country (UK or Australia)',
};

/** import_leads' own ceiling per call (it refuses more: too_many_rows). */
export const IMPORT_BATCH_MAX = 500;
/** Biggest file the dialog accepts — a few calls, never an unbounded loop from a mis-picked export. */
export const IMPORT_FILE_MAX_ROWS = 2000;
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Header names (lower-case, letters and digits only) recognised for each field. `name` alone is the business. */
const ALIASES: Record<ImportField, string[]> = {
  business_name: ['businessname', 'business', 'company', 'companyname', 'name', 'organisation', 'organization', 'tradingname', 'businesstitle'],
  /* Never a bare "owner" / "assigned to" / "rep": those read like the LEAD's owner, which a CSV can never set. */
  contact_name: ['contactname', 'contact', 'contactperson', 'person', 'businessowner', 'fullname', 'firstandlastname', 'decisionmaker'],
  phone: ['phone', 'phonenumber', 'telephone', 'telephonenumber', 'tel', 'mobile', 'mobilenumber', 'mobilephone', 'contactnumber', 'number', 'whatsapp', 'whatsappnumber'],
  email: ['email', 'emailaddress', 'mail', 'contactemail'],
  website: ['website', 'websiteurl', 'web', 'url', 'site', 'domain', 'homepage'],
  address: ['address', 'fulladdress', 'streetaddress', 'address1', 'addressline1', 'street', 'location'],
  postcode: ['postcode', 'postalcode', 'zip', 'zipcode'],
  town: ['town', 'city', 'locality', 'area', 'towncity'],
  trade: ['trade', 'category', 'type', 'industry', 'sector', 'businesstype', 'service', 'niche'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  google_maps_url: ['googlemapsurl', 'googlemaps', 'googlemapslink', 'mapsurl', 'mapslink', 'maplink', 'gmaps'],
  place_id: ['placeid', 'googleplaceid', 'gplaceid'],
  country: ['country', 'countryname', 'nation'],
};

export const normaliseHeader = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ParsedCsv {
  headers: string[];
  /** Data records only (the header is row 1). `row` is the spreadsheet row number; all-blank records are dropped
   *  but still counted, so the numbers match what the person sees in Excel. */
  records: { row: number; cells: string[] }[];
  delimiter: ',' | ';' | '\t';
}

/** RFC 4180 reader: BOM, "quoted, commas", "" escapes, line breaks inside quotes, CRLF / LF / CR, blank lines.
 *  The separator is whichever of , ; tab appears most in the header line outside quotes (comma on a tie). */
export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const firstLine = (() => {
    let q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"') q = !q;
      else if (!q && (ch === '\n' || ch === '\r')) return src.slice(0, i);
    }
    return src;
  })();
  const count = (d: string) => { let n = 0, q = false; for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch === d) n++; } return n; };
  const c = count(','), s = count(';'), t = count('\t');
  const delimiter: ParsedCsv['delimiter'] = t > c && t >= s ? '\t' : s > c ? ';' : ',';

  const all: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); all.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); all.push(row); }

  // The header is the first non-blank record.
  const blank = (r: string[]) => r.every((x) => x.trim() === '');
  const h = all.findIndex((r) => !blank(r));
  if (h < 0) return { headers: [], records: [], delimiter };
  const headers = all[h].map((x) => x.replace(/^﻿/, '').trim());
  const records: ParsedCsv['records'] = [];
  for (let i = h + 1; i < all.length; i++) {
    if (blank(all[i])) continue;
    records.push({ row: i + 1, cells: all[i] });
  }
  return { headers, records, delimiter };
}

/** field → column index (or null = not imported). */
export type ColumnMapping = Record<ImportField, number | null>;

export interface MappingResult {
  mapping: ColumnMapping;
  /** Plain-English notes for the mapping screen (repeated headers, unused columns). */
  notes: string[];
}

/** Guess the mapping from the header names. A header used twice maps to its FIRST column and says so; a column
 *  is used for at most one field. `name` is the business only when no clearer business column exists. */
export function autoMapColumns(headers: string[]): MappingResult {
  const norm = headers.map(normaliseHeader);
  const used = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as ColumnMapping;
  for (const f of IMPORT_FIELDS) {
    for (const alias of ALIASES[f]) {
      const idx = norm.findIndex((n, i) => n === alias && !used.has(i));
      if (idx >= 0) { mapping[f] = idx; used.add(idx); break; }
    }
  }
  const notes: string[] = [];
  const seen = new Map<string, number[]>();
  norm.forEach((n, i) => { if (n) seen.set(n, [...(seen.get(n) ?? []), i]); });
  for (const [, idxs] of seen) {
    if (idxs.length > 1) {
      const f = IMPORT_FIELDS.find((x) => mapping[x] === idxs[0]);
      notes.push(`"${headers[idxs[0]]}" appears ${idxs.length} times (columns ${idxs.map((i) => i + 1).join(', ')})${f ? ` — using column ${idxs[0] + 1} for ${IMPORT_FIELD_LABEL[f]}` : ''}. Change it below if that is the wrong one.`);
    }
  }
  const unused = headers.map((hd, i) => ({ hd, i })).filter(({ hd, i }) => hd.trim() && !used.has(i));
  if (unused.length) notes.push(`Not imported: ${unused.map(({ hd }) => `"${hd}"`).join(', ')}.`);
  return { mapping, notes };
}

/** A column label for the mapping selects — repeated headers get their column number. */
export function columnLabel(headers: string[], i: number): string {
  const h = headers[i]?.trim() || `(blank header)`;
  const repeated = headers.filter((x) => normaliseHeader(x) === normaliseHeader(headers[i] ?? '')).length > 1;
  return repeated || !headers[i]?.trim() ? `${h} (column ${i + 1})` : h;
}

/** One row as sent to import_leads: the spreadsheet row number plus ONLY the mapped allowlisted fields, each
 *  trimmed, blank = absent. Nothing else can ride along. */
export type ImportRow = { row: number } & Partial<Record<ImportField, string>>;

export function buildImportRows(parsed: ParsedCsv, mapping: ColumnMapping): ImportRow[] {
  return parsed.records.map(({ row, cells }) => {
    const out: ImportRow = { row };
    for (const f of IMPORT_FIELDS) {
      const idx = mapping[f];
      if (idx == null) continue;
      const v = (cells[idx] ?? '').trim();
      if (v) out[f] = v;
    }
    return out;
  });
}

// ── The server's answer ─────────────────────────────────────────────────────────────────────────────────────

/** held = a POSSIBLE MATCH strong enough to wait for the person's say-so (same website, or same name + same
 *  postcode / address); it is imported only when the import is sent with "import these too". */
export type RowOutcome = 'new' | 'update' | 'created' | 'updated' | 'skipped' | 'invalid' | 'duplicate_in_file' | 'held' | 'failed';
/** What import_leads says about a possible match — already cut to what the caller may know: a salesperson gets
 *  only a count of their OWN same-name leads (with towns) and, of anyone else's, only that one exists. */
export interface MatchInfo { in_file?: boolean; yours?: number; others?: number; towns?: string[]; owners?: string[] }
export interface RowResult {
  i: number; row: number; business_name?: string; outcome: RowOutcome; reasons?: string[];
  first_row?: number; owner_name?: string; fields?: string[]; lead_id?: string; match?: MatchInfo;
}
export interface ImportCounts {
  rows: number; valid: number; invalid: number; duplicate_in_file: number; existing: number;
  possible_match: number; held: number;
  new: number; update: number; skipped: number; created: number; updated: number; failed: number;
}
export const ZERO_COUNTS: ImportCounts = { rows: 0, valid: 0, invalid: 0, duplicate_in_file: 0, existing: 0, possible_match: 0, held: 0, new: 0, update: 0, skipped: 0, created: 0, updated: 0, failed: 0 };

export interface ImportCallResult {
  ok: boolean; error?: string; reason?: string | null; max?: number;
  committed?: boolean; import_id?: string | null; role?: string; counts?: ImportCounts; rows?: RowResult[];
}

export interface ImportReport {
  committed: boolean;
  counts: ImportCounts;
  rows: RowResult[];
  /** Set when a call failed: rows from `fromRow` on were NOT processed (nothing from that call was written). */
  stopped: { fromRow: number; toRow: number; message: string } | null;
  createdIds: string[];
  updatedIds: string[];
}

export type ImportRpc = (args: { _rows: ImportRow[]; _commit: boolean; _file_name: string | null; _import_possible: boolean }) =>
  Promise<{ data: unknown; error: { message?: string } | null }>;

/** Send the rows in calls of IMPORT_BATCH_MAX, one after another. Each call is one transaction on the server, so a
 *  failed call writes nothing and the report says exactly which rows were not reached; the calls before it stand
 *  (a re-run of the same file finds them as "already in your leads" and adds nothing twice). */
export async function runImport(
  rpc: ImportRpc, rows: ImportRow[], commit: boolean, fileName: string | null,
  onProgress?: (done: number, total: number) => void,
  /** Also import the HELD possible matches (the person ticked "import these too"). */
  importPossible = false,
): Promise<ImportReport> {
  const report: ImportReport = { committed: commit, counts: { ...ZERO_COUNTS }, rows: [], stopped: null, createdIds: [], updatedIds: [] };
  for (let at = 0; at < rows.length; at += IMPORT_BATCH_MAX) {
    const chunk = rows.slice(at, at + IMPORT_BATCH_MAX);
    let res: ImportCallResult | null = null;
    let message: string | null = null;
    try {
      const { data, error } = await rpc({ _rows: chunk, _commit: commit, _file_name: fileName, _import_possible: importPossible });
      if (error) message = error.message ?? 'The import could not be reached.';
      else res = (data ?? null) as ImportCallResult | null;
    } catch (e) {
      message = (e as Error)?.message ?? 'The import could not be reached.';
    }
    if (!message && (!res || res.ok !== true)) message = callErrorText(res);
    if (message) {
      report.stopped = { fromRow: chunk[0].row, toRow: rows[rows.length - 1].row, message };
      break;
    }
    const c = res!.counts ?? ZERO_COUNTS;
    for (const k of Object.keys(report.counts) as (keyof ImportCounts)[]) report.counts[k] += Number(c[k] ?? 0);
    for (const r of res!.rows ?? []) {
      report.rows.push(r);
      if (r.lead_id && r.outcome === 'created') report.createdIds.push(r.lead_id);
      if (r.lead_id && r.outcome === 'updated') report.updatedIds.push(r.lead_id);
    }
    onProgress?.(Math.min(at + chunk.length, rows.length), rows.length);
  }
  return report;
}

/** Why a whole call was refused, in words. */
export function callErrorText(res: ImportCallResult | null): string {
  switch (res?.error) {
    case 'usage_paused': return res.reason === 'paused' || res.reason === 'all_stop'
      ? 'Imports are paused by the usage controls. Release them on the API Usage page.'
      : onboardingWordsForPausedRefusal('CSV import') ?? 'Usage temporarily paused — contact Paul';
    case 'too_many_rows': return `Too many rows in one go (the most is ${res.max ?? IMPORT_BATCH_MAX}).`;
    case 'no_rows': return 'There were no rows to import.';
    case 'bad_rows': return 'The rows could not be read.';
    case 'no_book_owner': return 'The lead book has no owner set — contact Paul.';
    default: return res?.error ? `The import was refused (${res.error}).` : 'The import gave no answer. Nothing from this part was saved.';
  }
}

const TOO_LONG = /^too_long:(.+)$/;

/** One reason in words. A salesperson is never told whose lead it is (the server sends no name to them). */
export function reasonText(reason: string, r: Pick<RowResult, 'first_row' | 'owner_name'>, isAdmin: boolean): string {
  const tl = TOO_LONG.exec(reason);
  if (tl) return `${IMPORT_FIELD_LABEL[tl[1] as ImportField] ?? tl[1]} is too long`;
  switch (reason) {
    case 'missing_business_name': return 'No business name';
    case 'invalid_phone': return 'Phone number not recognised';
    case 'invalid_email': return 'Email address is not valid';
    case 'invalid_website': return 'Website is not valid';
    case 'invalid_maps_link': return 'Google Maps link is not valid';
    case 'invalid_place_id': return 'Google Place ID is not valid';
    case 'invalid_country': return 'Country must be UK or Australia (or leave it blank)';
    case 'no_phone_or_email': return 'Needs a phone number or an email';
    case 'bad_row': return 'Row could not be read';
    case 'duplicate_in_file': return r.first_row ? `Repeats row ${r.first_row} of this file` : 'Repeats an earlier row of this file';
    case 'already_yours': return 'Already in your leads';
    case 'owned_by_other': return isAdmin && r.owner_name ? `Already owned by ${r.owner_name} — not changed` : 'Already belongs to another team member — not changed';
    case 'exists_unassigned': return isAdmin ? 'Already in Unassigned — claim it there instead' : 'Already in the system, not yours — not changed';
    case 'possible_match_name': return 'Same business name as another lead';
    case 'possible_match_website': return 'Same website as another lead';
    case 'possible_match_name_location': return 'Same business name and the same postcode or address as another lead';
    case 'duplicate_race': return 'Someone added this business a moment ago';
    case 'refused': return 'Not allowed';
    case 'write_failed': return 'Could not be saved';
    default: return reason.replace(/_/g, ' ');
  }
}

const FIELD_WORD: Record<string, string> = { contact_name: 'contact', email: 'email', website: 'website', address: 'address', search_keyword: 'trade' };
export const fieldsText = (fields?: string[]) => (fields ?? []).map((f) => FIELD_WORD[f] ?? f.replace(/_/g, ' ')).join(', ');

/** The row's line on the screen. */
/** Who / where the possible match is, as far as this person may know. */
export function matchText(m: MatchInfo | undefined, isAdmin: boolean): string {
  if (!m) return '';
  const bits: string[] = [];
  if (m.in_file) bits.push('an earlier row of this file');
  if (m.yours) bits.push(m.yours === 1 ? 'one of your leads' : `${m.yours} of your leads`);
  if (m.others) {
    const count = m.others === 1 ? 'a lead' : String(m.others) + ' leads';
    const owners = m.owners?.length ? ' owned by ' + m.owners.join(', ') : '';
    bits.push(isAdmin ? count + owners : 'a lead elsewhere in the system');
  }
  const where = m.towns?.length ? ` (${m.towns.join(', ')})` : '';
  return bits.length ? `Matches ${bits.join(' and ')}${where}` : '';
}

const POSSIBLE_REASONS = ['possible_match_name', 'possible_match_website', 'possible_match_name_location'];
const possibleReason = (r: RowResult) => (r.reasons ?? []).find((x) => POSSIBLE_REASONS.includes(x));

export function outcomeText(r: RowResult, isAdmin: boolean): string {
  const pm = possibleReason(r);
  const why = pm ? `${reasonText(pm, r, isAdmin)}. ${matchText(r.match, isAdmin)}`.replace(/\. $/, '') : '';
  switch (r.outcome) {
    case 'new': return pm ? `Will be added — possible match: ${why}` : 'Will be added';
    case 'created': return pm ? `Added — possible match: ${why}` : 'Added';
    case 'held': return `Held — possible match: ${why}. Not added unless you tick "import these too".`;
    case 'update': return `Yours already — will fill in the blank ${fieldsText(r.fields)}`;
    case 'updated': return `Yours already — filled in the blank ${fieldsText(r.fields)}`;
    default: return (r.reasons ?? []).map((x) => reasonText(x, r, isAdmin)).join('; ') || r.outcome;
  }
}

/** DUPLICATES and other rows that will not become a new lead (invalid, repeated, already in the system, failed). */
export const problemRows = (rows: RowResult[]) => rows.filter((r) => ['skipped', 'invalid', 'duplicate_in_file', 'failed'].includes(r.outcome));
/** POSSIBLE MATCHES: weak evidence only — imported (same name) or held for the person's say-so. Never a duplicate. */
export const possibleMatchRows = (rows: RowResult[]) => rows.filter((r) => r.outcome === 'held' || !!possibleReason(r));
