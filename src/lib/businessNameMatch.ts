/* IS THE BUSINESS NAMED IN THIS TEXT? One rule, a leaf: siteAudit, salesInsights and contentTrust all ask it (2026-11-03).
   Pure, no imports. IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only. */

/** Significant words of a business name or town, for a loose "is it stated" match. */
const STOP = new Set(['the', 'and', 'ltd', 'limited', 'llp', 'plc', 'co', 'company', 'services', 'service', 'uk', 'of', 'in', 'group', 'solutions', 'mr', 'mrs', 'amp']);
export function significantWords(s: string | null | undefined): string[] {
  return String(s ?? '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length >= 3 && !STOP.has(w));
}
/** Every significant word of `needle` appears in `hay` (whole words). */
export function statesAll(hay: string, needle: string | null | undefined): boolean {
  const words = significantWords(needle);
  if (!words.length) return false;
  const h = ` ${String(hay ?? '').toLowerCase().replace(/[^a-z0-9']+/g, ' ')} `;
  return words.every((w) => h.includes(` ${w} `) || h.includes(` ${w}s `) || h.includes(` ${w.replace(/s$/, '')} `));
}

/** Is the business named on the page? Google's listing name is often longer than the name on the site, so this asks about the
 *  brand, the same way a person would: "RT Electrical" names "RT Electrical & Property Maintenance Limited", "Smart wire
 *  installations" names "Smartwire Installations LTD", "POES UK" names "Power On Electrical Services UK". */
export function nameOnPage(hay: string, name: string | null | undefined): boolean {
  if (statesAll(hay, name)) return true;
  const full = String(name ?? '').trim();
  const brand = full.split(/\s+(?:&|and|\||–|—|-)\s+|,/i)[0].trim();
  if (brand !== full && statesAll(hay, brand)) return true;
  return nameInShortForm(hay, name);
}

/** The same name with its spacing changed or cut to initials. Every word of the brand counts, however short: "RG Locksmiths" is
 *  not named by a page that only says "Locksmith Services". */
export function nameInShortForm(hay: string, name: string | null | undefined): boolean {
  const full = String(name ?? '').trim();
  const brand = full.split(/\s+(?:&|and|\||–|—|-)\s+|,/i)[0].trim();
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const brandWords = brand.toLowerCase().split(/\s+/).filter((w) => w && !STOP.has(squash(w)));
  if (brandWords.length && squash(hay).includes(brandWords.map(squash).join(''))) return true;
  const initials = full.replace(/&/g, ' ').split(/\s+/).filter((w) => /^[a-z]/i.test(w) && !/^(?:ltd|limited|llp|plc|uk)$/i.test(w)).map((w) => w[0]).join('');
  const shortened = brand.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  const heads = [initials, shortened.slice(0, 2).map((w) => w[0]).join('')].filter((x) => x.length >= 2).map((x) => x.toLowerCase());
  const hayWords = new Set(String(hay ?? '').toLowerCase().split(/[^a-z0-9]+/));
  return heads.some((h) => hayWords.has(h));
}
