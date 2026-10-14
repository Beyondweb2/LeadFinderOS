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
  country: 'Country (UK, Malaysia, Singapore or Australia)',
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
  /* "Why this lead" (2026-10-14, test day): the reason a person picked the business — kept as the lead's note. */
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'whythislead', 'whylead', 'why', 'reason', 'reasonforlead'],
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
export type ImportRow = { row: number } & Partial<Record<ImportField, string>> & {
  /** A research file's other columns, kept on the lead (outreach_leads.import_extra) and never shown (2026-10-14). */
  extra?: Record<string, string>;
};

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

/* ══ A RESEARCH FILE (2026-10-14, Ethan's language-school list) ══════════════════════════════════════════════════
   One shape of file is recognised by its columns: a researched lead list with name, country, city, website,
   whatsapp_number, owner_name / owner_role and the research columns (hypothesis_1, proposed_offer, the website
   evidence …). For that file the rows are built HERE instead of from the column mapping:
     · name → business, country → country, city → town, website → website, whatsapp_number → phone;
     · owner_name (+ owner_role, its bracketed note dropped) → contact person — only a real name;
     · "Not established" is empty everywhere;
     · the note ("Why this lead") is built from hypothesis_1, the website evidence (english_evidence) — or
       website_absence_evidence when there is no website — and proposed_offer, each cut to its first sentence;
     · every OTHER non-empty column is kept as the row's extra data (outreach_leads.import_extra, never shown).
   Every other file is read exactly as before. */
export const RESEARCH_FILE_DEFAULT_TRADE = 'Language schools';
const RESEARCH_MARK = ['name', 'country', 'whatsapp_number', 'hypothesis_1', 'proposed_offer'];
const RESEARCH_USED = new Set(['name', 'country', 'city', 'website', 'whatsapp_number', 'owner_name', 'owner_role']);
const NOT_ESTABLISHED = /^not established\.?$/i;
/** The longest note a research row produces (the server refuses notes over 2000). */
export const RESEARCH_NOTE_MAX = 900;
const EXTRA_VALUE_MAX = 1500;

export function isResearchFile(headers: readonly string[]): boolean {
  const h = new Set(headers.map((x) => x.replace(/^﻿/, '').trim().toLowerCase()));
  return RESEARCH_MARK.every((k) => h.has(k));
}

const clean = (v: string | undefined | null): string => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return NOT_ESTABLISHED.test(s) ? '' : s;
};
/** The first sentence, at most max characters, never cut mid-word without an ellipsis. */
export function firstSentence(v: string, max = 220): string {
  const s = clean(v);
  if (!s) return '';
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  let out = (m ? m[1] : s).trim();
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}

export function researchNote(r: Record<string, string>): string {
  const hyp = firstSentence(r.hypothesis_1).replace(/^hypothesis:\s*/i, '');
  const site = clean(r.website);
  const evidence = site ? firstSentence(r.english_evidence) : firstSentence(r.website_absence_evidence);
  const offer = firstSentence(r.proposed_offer);
  const lines = [
    hyp && 'Why this lead: ' + hyp.charAt(0).toUpperCase() + hyp.slice(1),
    evidence && (site ? 'Website: ' : 'No website: ') + evidence,
    offer && 'Offer: ' + offer,
  ].filter(Boolean) as string[];
  return lines.join('\n').slice(0, RESEARCH_NOTE_MAX);
}

export function buildResearchRows(parsed: ParsedCsv): ImportRow[] {
  const keys = parsed.headers.map((x) => x.replace(/^﻿/, '').trim().toLowerCase());
  return parsed.records.map(({ row, cells }) => {
    const r: Record<string, string> = {};
    keys.forEach((k, i) => { if (k && !(k in r)) r[k] = (cells[i] ?? '').trim(); });
    const out: ImportRow = { row };
    const set = (f: ImportField, v: string) => { const c = clean(v); if (c) out[f] = c; };
    set('business_name', r.name);
    set('country', r.country);
    set('town', r.city);
    set('website', r.website);
    set('phone', r.whatsapp_number);
    const owner = clean(r.owner_name);
    const role = clean(r.owner_role).replace(/\s*\(.*$/, '').trim();
    if (owner) out.contact_name = (role ? owner + ' (' + role + ')' : owner).slice(0, 120);
    const note = researchNote(r);
    if (note) out.notes = note;
    const extra: Record<string, string> = {};
    keys.forEach((k) => {
      if (!k || RESEARCH_USED.has(k)) return;
      const v = clean(r[k]);
      if (v) extra[k] = v.slice(0, EXTRA_VALUE_MAX);
    });
    if (Object.keys(extra).length) out.extra = extra;
    return out;
  });
}

/** A file name as a batch name: "ethan-language-schools.csv" → "Ethan - language schools". */
export function batchFromFileName(name: string): string {
  const words = name.replace(/\.[a-z0-9]+$/i, '').split(/[-_\s]+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  const rest = words.slice(1).join(' ').toLowerCase();
  return (rest ? first + ' - ' + rest : first).slice(0, IMPORT_BATCH_NAME_MAX);
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
  /** The country the server decided for the row (20261025090200; absent from an older server). */
  country?: string | null;
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
  /** import_leads_v3: how many created leads joined the chosen campaign in this call. */
  joined_campaign?: number;
}

export interface ImportReport {
  committed: boolean;
  counts: ImportCounts;
  rows: RowResult[];
  /** Set when a call failed: rows from `fromRow` on were NOT processed (nothing from that call was written). */
  stopped: { fromRow: number; toRow: number; message: string } | null;
  createdIds: string[];
  updatedIds: string[];
  /** New leads that joined the chosen campaign (import_leads_v3), summed across calls. */
  joinedCampaign: number;
}

/** What the import is tagged with (2026-10-14, import_leads_v2): the owner of the NEW leads (null = the person importing;
 *  only the admin may name a teammate — the server refuses anything else) and a batch name ("Ethan batch 14 Oct"). */
export interface ImportTags { assignTo?: string | null; batch?: string | null;
  /** 2026-10-14 (import_leads_v3): the campaign every NEW lead joins. Required by the server; null is refused (campaign_required). */
  campaignId?: string | null }

/** The longest batch name the server keeps (import_leads_v2 cuts nothing silently in the rows, but trims the batch to this). */
export const IMPORT_BATCH_NAME_MAX = 80;

/** A trade typed once for the whole file fills ONLY the rows whose own trade cell is blank — a row's own trade always wins. */
/* ══ THE IMPORT'S COUNTRY (2026-10-14, Malaysia / Singapore) ════════════════════════════════════════════════════
   The person picks the country for the whole file (UK, Malaysia or Singapore) — or leaves it to be worked out per row,
   exactly as before. A row's OWN Country column always wins; the file's country only fills a blank one. The server then
   reads the phone in that country (a Malaysian "012-345 6789" → +60123456789) and refuses one it cannot read. */
export const IMPORT_COUNTRIES = ['UK', 'Malaysia', 'Singapore'] as const;
export type ImportCountry = typeof IMPORT_COUNTRIES[number];
export function withImportCountry(rows: ImportRow[], country: ImportCountry | null | undefined): ImportRow[] {
  if (!country) return rows;
  return rows.map((r) => (r.country && String(r.country).trim() ? r : { ...r, country }));
}

/** The preview's counts by country: every row the server placed, how many will be added / filled in, and how many
 *  numbers could not be read there. Rows the server gave no country (an older server, an unreadable Country) are
 *  counted under "Unknown". */
export interface CountryCount { country: string; rows: number; adding: number; unreadablePhones: number }
export function countsByCountry(rows: readonly RowResult[]): CountryCount[] {
  const by = new Map<string, CountryCount>();
  for (const r of rows) {
    const c = r.country || 'Unknown';
    const e = by.get(c) ?? { country: c, rows: 0, adding: 0, unreadablePhones: 0 };
    e.rows++;
    if (['new', 'update', 'created', 'updated', 'possible_match'].includes(r.outcome)) e.adding++;
    if ((r.reasons ?? []).includes('invalid_phone')) e.unreadablePhones++;
    by.set(c, e);
  }
  const order = ['UK', 'Malaysia', 'Singapore', 'Australia'];
  return [...by.values()].sort((a, b) => (order.indexOf(a.country) + 1 || 99) - (order.indexOf(b.country) + 1 || 99));
}

export function withDefaultTrade(rows: ImportRow[], trade: string | null | undefined): ImportRow[] {
  const t = (trade ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return rows;
  return rows.map((r) => (r.trade ? r : { ...r, trade: t }));
}

export type ImportRpc = (args: { _rows: ImportRow[]; _commit: boolean; _file_name: string | null; _import_possible: boolean; _assign_to: string | null; _batch: string | null; _campaign_id: string | null }) =>
  Promise<{ data: unknown; error: { message?: string } | null }>;

/** Send the rows in calls of IMPORT_BATCH_MAX, one after another. Each call is one transaction on the server, so a
 *  failed call writes nothing and the report says exactly which rows were not reached; the calls before it stand
 *  (a re-run of the same file finds them as "already in your leads" and adds nothing twice). */
export async function runImport(
  rpc: ImportRpc, rows: ImportRow[], commit: boolean, fileName: string | null,
  onProgress?: (done: number, total: number) => void,
  /** Also import the HELD possible matches (the person ticked "import these too"). */
  importPossible = false,
  tags: ImportTags = {},
): Promise<ImportReport> {
  const report: ImportReport = { committed: commit, counts: { ...ZERO_COUNTS }, rows: [], stopped: null, createdIds: [], updatedIds: [], joinedCampaign: 0 };
  for (let at = 0; at < rows.length; at += IMPORT_BATCH_MAX) {
    const chunk = rows.slice(at, at + IMPORT_BATCH_MAX);
    let res: ImportCallResult | null = null;
    let message: string | null = null;
    try {
      const { data, error } = await rpc({ _rows: chunk, _commit: commit, _file_name: fileName, _import_possible: importPossible,
        _assign_to: tags.assignTo ?? null, _batch: (tags.batch ?? '').trim().slice(0, IMPORT_BATCH_NAME_MAX) || null, _campaign_id: tags.campaignId ?? null });
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
    report.joinedCampaign += Number(res!.joined_campaign ?? 0);
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
    case 'owner_not_yours': return 'Only the admin can import leads for someone else.';
    case 'campaign_required': return 'Choose the campaign these leads go into.';
    case 'unknown_campaign': return 'That campaign is not available — it may have been deleted. Choose another one.';
    case 'not_an_active_member': return 'That person is not an active member of the team, so nothing was imported for them.';
    default: return res?.error ? `The import was refused (${res.error}).` : 'The import gave no answer. Nothing from this part was saved.';
  }
}

const TOO_LONG = /^too_long:(.+)$/;

/** One reason in words. A salesperson is never told whose lead it is (the server sends no name to them). */
export function reasonText(reason: string, r: Pick<RowResult, 'first_row' | 'owner_name'> & { country?: string | null }, isAdmin: boolean): string {
  const tl = TOO_LONG.exec(reason);
  if (tl) return `${IMPORT_FIELD_LABEL[tl[1] as ImportField] ?? tl[1]} is too long`;
  switch (reason) {
    case 'missing_business_name': return 'No business name';
    case 'invalid_phone': return r.country && r.country !== 'UK' ? `Phone number could not be read as a ${r.country} number` : 'Phone number not recognised';
    case 'invalid_email': return 'Email address is not valid';
    case 'invalid_website': return 'Website is not valid';
    case 'invalid_maps_link': return 'Google Maps link is not valid';
    case 'invalid_place_id': return 'Google Place ID is not valid';
    case 'invalid_country': return 'Country must be UK, Malaysia, Singapore or Australia (or leave it blank)';
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
