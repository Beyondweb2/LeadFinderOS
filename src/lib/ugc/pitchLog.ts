/* JESS'S PITCH LOG — import and dedupe, pure (docs/ugc-brand-finder.md).
 *
 * Her workbook (UGC_brand_pitch_list_50.xlsx) is personal data: it is never committed. Its pitched brands are
 * loaded into ugc_pitch_log (owner-only) and every brand found is checked against it: a brand already pitched is
 * a hard no (tiers.ts) until her "Re-pitch OK from" date, if she set one.
 *
 * Accepted input: rows from her sheet tabs (Previously Pitched, Brands & Contacts, Pitch Log, Creator Watchlist),
 * or a pasted CSV with a Brand column (optional: Website/Domain, Instagram, Date, Channel, Outcome, Re-pitch from). */

import { brandKey, brandWebsite, instagramHandle, normaliseName } from './normalize.ts';

export interface PitchLogRow {
  brand_name: string;
  brand_key: string;
  domain: string | null;
  instagram: string | null;
  pitched_on: string | null;
  channel: string | null;
  outcome: string | null;
  repitch_ok_from: string | null;
  source: string;
}

/** dd.mm.yy / dd.mm.yyyy / yyyy-mm-dd / an Excel serial → YYYY-MM-DD, else null. */
export function parseSheetDate(v: unknown): string | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function logRow(a: { brand: string; website?: string | null; instagram?: string | null; date?: unknown; channel?: string | null; outcome?: string | null; repitch?: unknown; source: string }): PitchLogRow | null {
  const brand = a.brand.trim();
  if (!brand || /^(brand|business|#)$/i.test(brand)) return null;
  const site = brandWebsite(a.website ?? null);
  const igRaw = String(a.instagram ?? '').trim();
  const ig = instagramHandle(igRaw) ?? (/^@?[a-z0-9._]{2,30}$/i.test(igRaw) ? igRaw.replace(/^@/, '').toLowerCase() : null);
  return {
    brand_name: brand,
    brand_key: brandKey({ domain: site?.domain ?? null, facebook_page_id: null, instagram_url: ig ? `https://www.instagram.com/${ig}/` : null, name: brand }),
    domain: site?.domain ?? null,
    instagram: ig,
    pitched_on: parseSheetDate(a.date),
    channel: a.channel?.trim() || null,
    outcome: a.outcome?.trim() || null,
    repitch_ok_from: parseSheetDate(a.repitch),
    source: a.source,
  };
}

/** Her workbook's tabs → log rows. `sheets` is tab name → rows (first row = headers). */
export function rowsFromWorkbook(sheets: Record<string, string[][]>): PitchLogRow[] {
  const out: PitchLogRow[] = [];
  const tab = (name: string, fn: (get: (h: string) => string) => PitchLogRow | null) => {
    const rows = sheets[name];
    if (!rows?.length) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    for (const r of rows.slice(1)) {
      const get = (h: string) => { const i = head.indexOf(h.toLowerCase()); return i >= 0 ? String(r[i] ?? '') : ''; };
      const row = fn(get);
      if (row) out.push(row);
    }
  };
  /* Her live record (checked against her real workbook 2026-10-29). "Creator Watchlist" lists CREATORS, not pitched
     brands, and is never read as a pitch log. */
  /* Pitch Log: every brand on it is never pitched again (her rule 1d), whatever its status. */
  tab('Pitch Log', (g) => logRow({ brand: g('Brand'), date: g('Date sent'), channel: g('Channel used'), outcome: g('Outcome') || g('Status'), source: 'pitch_log' }));
  /* Previously Pitched: blocked until its "Re-pitch OK from" date. */
  tab('Previously Pitched', (g) => logRow({ brand: g('Brand'), date: g('First pitched'), channel: g('Contact used'), outcome: g('Outcome / status'), repitch: g('Re-pitch OK from (est.)'), source: 'previously_pitched' }));
  /* Brands & Contacts: only rows she has actually contacted (Pitched / Drafted / Bounced / Declined / Form / Replied). */
  tab('Brands & Contacts', (g) => /^(pitched|drafted|bounced|declined|form submitted|replied)/i.test(g('Status').trim())
    ? logRow({ brand: g('Brand'), instagram: g('Instagram'), channel: g('Best first channel'), outcome: g('Status'), source: 'brands_and_contacts' }) : null);
  /* Chiang Mai Collabs (local track): businesses she has DM'd (Pitched) or that said no. */
  tab('Chiang Mai Collabs', (g) => /^(pitched|no)\b/i.test(g('Status').trim())
    ? logRow({ brand: g('Business'), instagram: g('Instagram'), date: g('Date pitched'), channel: 'Instagram DM', outcome: g('Status'), source: 'chiang_mai_collabs' }) : null);
  /* Agencies & Talent: agencies she has pitched. */
  tab('Agencies & Talent', (g) => (g('Date pitched').trim() || /pitched|sent/i.test(g('Status')))
    ? logRow({ brand: g('Name'), website: g('Website'), date: g('Date pitched'), channel: g('Best route'), outcome: g('Reply / outcome') || g('Status'), source: 'agencies' }) : null);
  return dedupeLog(out);
}

/** A tiny CSV reader (quoted fields, commas, newlines in quotes) for a pasted export. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function rowsFromCsv(text: string): PitchLogRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const b = col('brand', 'business', 'name');
  if (b < 0) return [];
  const w = col('website', 'domain'), ig = col('instagram'), d = col('date'), ch = col('channel'), o = col('outcome', 'status'), rp = col('re-pitch', 'repitch');
  const at = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  return dedupeLog(rows.slice(1).map((r) => logRow({ brand: at(r, b), website: at(r, w), instagram: at(r, ig), date: at(r, d), channel: at(r, ch), outcome: at(r, o), repitch: at(r, rp), source: 'manual' }))
    .filter((x): x is PitchLogRow => !!x));
}

export function dedupeLog(rows: readonly PitchLogRow[]): PitchLogRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => { const k = `${r.brand_key}|${r.pitched_on ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The keys a found brand is matched on: its brand_key AND its normalised name (her log rarely has domains). A
 *  brand whose every log row has a re-pitch date in the past is free again. */
export function pitchedKeySet(log: ReadonlyArray<Pick<PitchLogRow, 'brand_key' | 'brand_name' | 'repitch_ok_from'>>, now: Date = new Date()): Set<string> {
  const today = now.toISOString().slice(0, 10);
  const byName = new Map<string, boolean>();
  const keys = new Set<string>();
  for (const r of log) {
    const blocked = !r.repitch_ok_from || r.repitch_ok_from > today;
    const n = `n:${normaliseName(r.brand_name)}`;
    byName.set(n, (byName.get(n) ?? false) || blocked);
    if (blocked) keys.add(r.brand_key);
  }
  for (const [k, blocked] of byName) if (blocked) keys.add(k);
  return keys;
}
