/* EXPORT READY LEADS — one row per researched brand, in the exact column layout of the "Brands & Contacts" tab of
 * Jess's workbook (headers read from her imported workbook 2026-10-29; contents never copied here). Pure.
 *
 * The UGC page is a LEAD SOURCE: Jess pitches from her own spreadsheet and Claude Project. Every cell that holds a
 * fact has its source URL beside it where her layout has a place for one; unknown = blank. Her judgement columns
 * (Fit to Jess, Likely model, Concept idea, Concept version) are left blank for her.
 * Product, "pushing now" and reviews have no column in her layout: they travel in "Copy for Claude" (researchPack.ts). */

import type { ContactChoice } from './contactOrder.ts';
import { researchGaps, type ResearchResult } from './research.ts';
import { packChannel, marketLabel } from './researchPack.ts';
import type { TierResult } from './tiers.ts';
import type { WaNumber } from './normalize.ts';

/** Her "Brands & Contacts" headers, in her order. The 22nd is a note she keeps in the header cell; kept as written so
 *  every column lands where her sheet expects it (its cells stay blank). */
export const EXPORT_HEADERS = [
  '#', 'Brand', 'Category / Niche', 'Based', 'Priority', 'Fit to Jess', 'Best contact / route', 'Contact quality', 'Best first channel', 'Instagram',
  'Likely model', 'Flags', 'Status', 'Research date', 'Verified product detail', 'Detail source URL', 'Pays-for-UGC evidence', 'Concept idea',
  'Jess experience fit (from profile only)', 'Contact source URL', 'Ships to TH (priority signal, not a gate)',
  'Last keywords: gut health, collagen (GB, 23.09.26). Keyword choice now per Standing Instructions v4.1 (6 x 50 ads, Scrape Log tab).', 'Concept version',
] as const;
export const EXPORT_SHEET_NAME = 'Brands & Contacts';

export interface ExportBrand {
  id: string;
  name: string;
  website: string | null;
  instagram_url: string | null;
  niche: string | null;
  country: string | null;
  company_country?: string | null;
  facebook_page_id?: string | null;
  ad_start_dates?: readonly string[] | null;
  ships_thailand?: boolean | null;
  experience_fit?: string | null;
  researched_at?: string | null;
  exported_at?: string | null;
  track?: string | null;
  research?: { verified?: ResearchResult | null } | null;
}
export interface ExportContext { tier: TierResult; contact: ContactChoice; wa?: readonly Pick<WaNumber, 'number' | 'source'>[] }
export interface ExportItem { brand: ExportBrand; ctx: ExportContext }

const QUALITY: Record<ContactChoice['kind'], string> = {
  named: 'Named person', partnerships: 'Partnerships inbox', marketing: 'Marketing inbox', generic: 'Generic inbox', instagram: 'DM', form: 'Form', none: '',
};

/** dd.mm.yy, the way her sheet writes dates. */
export function sheetDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${String(d.getUTCFullYear()).slice(2)}`;
}

/** A brand is exportable once it has been researched (research done, verified block present) and is not a hard no or the local track. */
export function isExportable(b: ExportBrand, tier: TierResult): boolean {
  return b.track !== 'local' && tier.tier !== 'skip' && !!b.researched_at && !!b.research?.verified;
}

export function exportRow(n: number, b: ExportBrand, ctx: ExportContext): string[] {
  const v = b.research?.verified ?? null;
  const c = ctx.contact;
  const gaps = researchGaps(v);
  const channel = packChannel(c, ctx.wa ?? []);
  const wa = ctx.wa?.[0];
  const route = c.kind === 'named' && c.person ? `${c.person.name}, ${c.person.title}${c.email ? ` <${c.email}>` : ''}`
    : c.channel === 'email' ? (c.email ?? '') : c.channel === 'instagram' ? 'Instagram DM' : c.kind === 'form' ? 'Contact form' : wa ? `WhatsApp +${wa.number}` : '';
  const contactSource = c.kind === 'none' ? (wa && b.website ? b.website : '') : c.channel === 'instagram' ? (b.instagram_url ?? '') : (b.website ?? '');
  const adsUrl = b.facebook_page_id && (b.ad_start_dates?.length ?? 0) > 0 ? `https://www.facebook.com/ads/library/?view_all_page_id=${b.facebook_page_id}` : '';
  const letter = ['A', 'B', 'C', 'D'].includes(ctx.tier.tier) ? ctx.tier.tier : '';
  const tierWhy = ctx.tier.tier === 'unrated' ? '' : ctx.tier.why;
  const ships = v?.ships_to_thailand ? (v.ships_to_thailand.ships ? 'Yes' : 'No') : b.ships_thailand == null ? '' : b.ships_thailand ? 'Yes' : 'No';
  const flags = [ctx.tier.tier === 'unrated' ? 'Tier not set' : '', c.kind === 'generic' ? 'Generic inbox' : ''].filter(Boolean).join('; ');
  return [
    String(n), b.name, b.niche ?? '', b.company_country ? marketLabel(b.company_country) : (b.country ? marketLabel(b.country) : ''), letter, '',
    route, QUALITY[c.kind] || (wa ? 'DM' : ''), channel ? (channel === 'Instagram DM' ? 'Instagram DM' : channel === 'email' ? 'Email' : 'WhatsApp') : '',
    v?.instagram ? `@${v.instagram.handle}` : b.instagram_url ?? '',
    '', flags, gaps.length ? `Needs: ${gaps.join(', ')}` : 'Ready', sheetDate(b.researched_at),
    v?.product_detail?.value ?? '', v?.product_detail?.url ?? '', [tierWhy, adsUrl].filter(Boolean).join(' ') , '',
    b.experience_fit?.trim() ?? '', contactSource, ships, '', '',
  ];
}

export function exportRows(items: readonly ExportItem[]): string[][] {
  return [[...EXPORT_HEADERS], ...items.map((it, i) => exportRow(i + 1, it.brand, it.ctx))];
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** CSV with a BOM so Excel reads the UTF-8 (£, accents) correctly. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function exportFileName(now: Date = new Date(), ext: 'xlsx' | 'csv' = 'xlsx'): string {
  return `ugc-ready-leads-${now.toISOString().slice(0, 10)}.${ext}`;
}

/** Split the researched brands into what to export now and what was exported before (so nothing goes out twice). */
export function splitExport<T extends { brand: ExportBrand }>(items: readonly T[], includeExported = false): { fresh: T[]; already: T[]; export: T[] } {
  const fresh = items.filter((i) => !i.brand.exported_at);
  const already = items.filter((i) => !!i.brand.exported_at);
  return { fresh, already, export: includeExported ? [...fresh, ...already] : fresh };
}
