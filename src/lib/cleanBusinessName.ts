import { SUGGESTED_LOCATIONS } from './locationPicker.ts';
import { ABROAD_TOWNS, resolveCoverageTown } from './coverageCountries.ts';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   cleanBusinessName — a stored business name turned into a short, natural, lowercase name for ONE
   message (Paul, 2026-10-15). It is the name {{1}} carries in `initial_contact_short`
   ("Hey, is this {{1}}?").

   ⛔ DISPLAY ONLY. The stored business_name is never changed; only the text that is sent / drawn.
   ⛔ WHEN UNSURE, KEEP THE WORD. Every rule below removes only what it can name; anything it does
      not recognise stays. If cleaning leaves fewer than 2 characters the original (lowercased,
      spaces collapsed) is used, so the worst case is the full listing in lowercase.
   ⛔ SHARED ON PURPOSE: another template opts in by being named in CLEAN_NAME_TEMPLATES
      (src/lib/displayName.ts). Nothing else calls this by template name.

   What it does, in order:
     1  emoji / ™ ® © / quote marks out; an apostrophe BETWEEN letters stays ("angela's"); "&" stays.
     2  brackets: an acronym "(CLC)" goes; a place "(Sibu)" stays without its brackets; marketing
        words in brackets go; anything else stays, unbracketed.
     3  separators  |  -  –  —  :  — the first part is the name; a later part goes when it carries
        marketing words ("best", "no.1", "since 1998", "plumber in leeds"…), UNLESS it is just a
        place / branch ("kuching", "leeds branch"), which stays.
     4  legal words at the END go: ltd limited llp llc plc inc incorporated corp sdn bhd pte pty
        gmbh. "co" is NEVER removed (it is often the brand).
     5  stray punctuation out, spaces collapsed, everything lowercase.

   The place list is the one Find Leads suggests (SUGGESTED_LOCATIONS, every country) plus Coverage's
   Malaysia / Singapore towns and their other names — imported, never copied.

   Edge-safe: relative imports with explicit .ts, no React.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const LEGAL_END = new Set([
  'ltd', 'limited', 'llp', 'llc', 'plc', 'inc', 'incorporated', 'corp', 'bhd', 'pte', 'pty', 'gmbh',
]);

/* Country words count as places ("… Malaysia", "(UK)"), so a bracketed or trailing country is kept. */
const COUNTRY_WORDS = new Set([
  'uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'malaysia', 'singapore',
  'australia', 'india', 'ireland', 'usa', 'new zealand', 'south africa', 'uae', 'canada',
]);

/* Words that make a PART AFTER A SEPARATOR sales fluff. Applied to that part only, never the name. */
const MARKETING_RE = new RegExp(
  '(?:^|[^a-z0-9])(?:' + [
    'best', 'no\\.?\\s?1', 'number\\s*(?:one|1)', 'leading', 'official', 'premier', 'premium', 'top',
    'since\\s+\\d{4}', 'est\\.?\\s*\\d{4}', 'trusted', 'affordable', 'quality', 'high[- ]quality', 'cheap',
    'cheapest', 'reliable', 'professional', 'experts?', 'specialists?', '24\\s?/\\s?7', '24\\s?hours?',
    'free\\s+(?:quote|estimate|consultation|quotation)s?', 'call\\s+(?:us|now)', 'award[- ]winning',
    'licensed', 'certified', 'guaranteed', 'one[- ]stop', 'lowest\\s+price', 'competitive', 'no\\s+1',
  ].join('|') + ')(?:$|[^a-z0-9])', 'i',
);

const BRANCH_WORD_RE = /\b(?:branch|outlet|hq|headquarters|campus|showroom|store|shop)\b/i;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}™®©℠]/gu;
const QUOTE_RE = /["“”„‟«»‹›`´]/g;

/** Lowercase, accents and punctuation gone, spaces collapsed — the key places are compared by. */
function key(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const PLACE_KEYS: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (const list of Object.values(SUGGESTED_LOCATIONS)) {
    for (const raw of list) {
      const k = key(String(raw).split(',')[0]);
      if (k.length >= 3) s.add(k);
    }
  }
  for (const t of [...ABROAD_TOWNS.Malaysia, ...ABROAD_TOWNS.Singapore]) {
    const k = key(t.name);
    if (k.length >= 3) s.add(k);
  }
  for (const c of COUNTRY_WORDS) s.add(c);
  return s;
})();

/** Is this exact text a place (a listed town, one of its other names, or a country)? */
function isPlace(text: string): boolean {
  const k = key(text);
  if (!k) return false;
  if (PLACE_KEYS.has(k)) return true;
  if (k.length >= 2 && resolveCoverageTown('Malaysia', k)?.listed) return true;   // "kl", "penang", "malacca"…
  return false;
}

/** Does the text contain a place as one of its 1–3 word runs? */
function containsPlace(text: string): boolean {
  const w = key(text).split(' ').filter(Boolean);
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= w.length; i++) if (isPlace(w.slice(i, i + n).join(' '))) return true;
  }
  return false;
}

/** A part after a separator that is only a place, optionally with a branch word ("leeds branch"). */
function isBranchOrPlace(part: string): boolean {
  if (isPlace(part)) return true;
  const rest = part.replace(BRANCH_WORD_RE, ' ').replace(/\s+/g, ' ').trim();
  return rest !== part.trim() && (rest === '' || containsPlace(rest) || /^\d+$/.test(rest));
}

/** "plumber in leeds" / "in kuching" — an SEO phrase: "in|near|around" followed by a known place. */
function isSeoPlacePhrase(part: string): boolean {
  const m = part.toLowerCase().match(/(?:^|\s)(?:in|near|around|across|serving)\s+(?:the\s+)?(.+)$/);
  return !!m && containsPlace(m[1]);
}

function isMarketing(part: string): boolean {
  const p = part.toLowerCase();
  return MARKETING_RE.test(p) || /(?:^|\s)#\s?1(?:$|\s)/.test(p) || isSeoPlacePhrase(p);
}

/** Brackets: acronym out, place kept bare, marketing out, anything else kept bare. */
function resolveBrackets(s: string): string {
  return s.replace(/[(\[{]([^()[\]{}]*)[)\]}]/g, (_m, inner: string) => {
    const c = inner.trim();
    if (!c) return ' ';
    if (isPlace(c)) return ` ${c} `;
    if (/^[A-Z][A-Z0-9.&]{0,5}$/.test(c)) return ' ';           // (CLC) (IEC) (M)
    if (isMarketing(c)) return ' ';
    return ` ${c} `;
  });
}

/** Drop the legal words at the END of one part ("… sdn bhd", "… pte ltd", "… ltd."). */
function stripLegalEnd(words: string[]): string[] {
  const w = [...words];
  const bare = (t: string) => t.toLowerCase().replace(/[.,;:]+/g, '');
  let removedBhd = false;
  while (w.length > 1 && LEGAL_END.has(bare(w[w.length - 1]))) {
    if (bare(w[w.length - 1]) === 'bhd') removedBhd = true;
    w.pop();
  }
  if (removedBhd && w.length > 1 && bare(w[w.length - 1]) === 'sdn') w.pop();
  return w;
}

/** Stray punctuation off the edges of each word; standalone dashes gone; "&" kept. */
function tidyPart(part: string): string[] {
  const out: string[] = [];
  for (const raw of part.split(/\s+/)) {
    if (!raw) continue;
    if (raw === '&') { out.push('&'); continue; }
    const cleaned = raw
      .replace(/[^\p{L}\p{N}\p{M}'’&.+/-]/gu, '')                 // anything that is not a name character
      .replace(/^[^\p{L}\p{N}&+]+/u, '')
      .replace(/[^\p{L}\p{N}&+]+$/u, '');
    if (cleaned) out.push(cleaned.replace(/’/g, "'"));
  }
  return out;
}

export interface CleanNameOpts {
  /** Reserved for a caller that knows the lead's town; the place list already covers the common case. */
  town?: string | null;
}

/**
 * The short, lowercase name for a message. Never empty for a non-empty input; never longer than the
 * original. See the file header for the rules.
 */
export function cleanBusinessName(name: string | null | undefined, _opts: CleanNameOpts = {}): string {
  const original = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!original) return '';
  const fallback = original.toLowerCase();

  // 1 — emoji, trademark marks, quotes. An apostrophe survives only between two letters/digits.
  let s = original
    .replace(EMOJI_RE, ' ')
    .replace(QUOTE_RE, ' ')
    .replace(/(^|[^\p{L}\p{N}])['‘’]+/gu, '$1 ')
    .replace(/['‘’]+(?=$|[^\p{L}\p{N}])/gu, ' ')
    .replace(/[‘’]/g, "'");

  // 2 — brackets
  s = resolveBrackets(s).replace(/\s+/g, ' ').trim();

  // 3 — separators: | – — : and a spaced hyphen. The first part is the name.
  const parts = s
    .split(/\s*\|\s*|\s+[-–—]+\s+|\s*[–—]\s*|\s+\/\s+|:\s+|\s+:\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  /* A FIRST part that is itself an SEO phrase ("Best Plumber in Leeds | Smith Plumbing") is a
     tagline in front of the name: it goes when a later part is plainly a name. Marketing words
     alone never drop a first part ("Premier Tuition | Learning Centre" is a name). */
  const laterIsName = (p: string) => !isMarketing(p) && !isBranchOrPlace(p);
  const dropHead = parts.length > 1 && isSeoPlacePhrase(parts[0]) && parts.slice(1).some(laterIsName);
  const kept: string[] = [];
  parts.forEach((p, i) => {
    if (i === 0) { if (!dropHead) kept.push(p); return; }
    if (isBranchOrPlace(p)) { kept.push(p); return; }
    if (isMarketing(p)) return;                                  // a tagline
    kept.push(p);                                                // unsure → keep
  });

  // 4 + 5 — legal words at each part's end, stray punctuation, lowercase
  const words: string[] = [];
  for (const p of kept) words.push(...stripLegalEnd(tidyPart(p)));
  let out = stripLegalEnd(words).join(' ');
  out = out.replace(/\s+/g, ' ').replace(/^[\s&+/.-]+|[\s&+/.-]+$/g, '').toLowerCase();

  if (out.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return fallback;
  return out;
}
