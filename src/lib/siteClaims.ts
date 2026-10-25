/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A SITE SAYS vs WHAT WE MAY TELL A PROSPECT IT DOESN'T (Paul, 2026-10-25, fix/finding-accuracy).
   Record: docs/finding-accuracy.md.

   ⛔ A "your site doesn't say X" line reaches a prospect only when it was checked against the FULL text of the
      pages read, not their title / headings / opening paragraph. The checks stamp their `saw` with FULL_TEXT_MARK
      when they did that; pitchIssueWords.ts quotes an absence only when the mark is there. A stored finding from
      before this change has no mark, so it is left out, never re-said. Fewer true findings beat more doubtful ones.
   ⛔ A place the site names as covered ("anyone in Albury/Wodonga and surrounds") is a coverage statement. When the
      site states coverage of any place, "your site doesn't mention <town>" is NOT said: the town may sit inside the
      area named (a suburb, a parent city), and we hold no map to prove it does not.
   Pure and edge-reachable: no imports, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Words an absence finding's `saw` carries when it was judged on the full text of every page read. */
export const FULL_TEXT_MARK = 'read in full';

/** The readable text the crawl keeps per page (fullCrawl.ts keeps this many characters; a page at the cap was cut). */
export const KEPT_TEXT_CHARS = 5_000;

/** True when the kept text is unknown or was cut at the cap: an absence cannot be proved from it. */
export function pageTextWasCut(t: string | null | undefined): boolean {
  return typeof t !== 'string' || t.length >= KEPT_TEXT_CHARS;
}

const REGION_TAIL = /\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT|UK|GB|England|Scotland|Wales|Australia)$/i;
/** "Lavington NSW" → "Lavington". The state or country label is how WE store a town, never how a site writes it. */
export function townCore(town: string | null | undefined): string {
  let t = String(town ?? '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) t = t.replace(REGION_TAIL, '').trim();
  return t;
}

const TOWN_STOP = new Set(['the', 'and', 'of', 'in', 'on', 'upon', 'le', 'la']);
const wordsOf = (s: string) => String(s ?? '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9'\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);

/** Every word of the town (state or country label dropped) appears in `hay` as whole words, next to each other. */
export function textStatesTown(hay: string, town: string | null | undefined): boolean {
  const need = wordsOf(townCore(town)).filter((w) => !TOWN_STOP.has(w));
  if (!need.length) return false;
  const h = ` ${wordsOf(hay).join(' ')} `;
  return h.includes(` ${need.join(' ')} `) || h.includes(` ${need.join(' ')}s `);
}

/* ── Where the site says it works ───────────────────────────────────────────────────────────────── */

const PLACE = String.raw`(?:the\s+)?[A-Z][a-z]{2,}`;
/** Phrasings of "we work in / serve <place>" beyond "we cover X": the shapes sites really use. */
export const COVERAGE_PHRASES: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:available|offered|provided|open|on offer)\s+(?:to|for)\s+(?:anyone|everyone|all|customers|clients|students|learners|people|businesses|drivers|residents)\s+(?:living\s+|based\s+|located\s+)?(?:in|around|across|throughout|within|near)\s+${PLACE}`, 'g'),
  new RegExp(String.raw`\b(?:anyone|everyone|customers|clients|students|learners|residents)\s+(?:living\s+|based\s+|located\s+)?(?:in|around|across|throughout|within)\s+${PLACE}`, 'g'),
  new RegExp(String.raw`\b[A-Z][a-z]{2,}(?:[\s/-]+[A-Z][a-z]{2,}){0,3},?\s+(?:and|&)\s+(?:its\s+|the\s+)?(?:surrounds|surrounding|nearby|neighbouring|outlying|wider|local)\b`, 'g'),
  new RegExp(String.raw`\b(?:all|every)\s+(?:areas|parts|suburbs|towns|villages|regions)\s+of\s+${PLACE}`, 'g'),
  new RegExp(String.raw`\bincluding\s+(?:all\s+)?(?:areas|parts|suburbs|towns|villages)\s+of\s+${PLACE}`, 'g'),
  new RegExp(String.raw`\bwithin\s+(?:a\s+)?\d+[\s-]*(?:miles?|km|kilometres?|kilometers?)\s+(?:radius\s+)?(?:of|around|from)\s+${PLACE}`, 'g'),
  new RegExp(String.raw`\b(?:based in|located in)\s+${PLACE}[^.]{0,60}\b(?:we|serv\w+|cover\w*|travel\w*|work\w*)\b[^.]{0,40}\b(?:surrounding|nearby|neighbouring|villages|towns|areas)\b`, 'g'),
];

/** The coverage statements in a page's text, as short quotes. */
export function coverageStatementsIn(text: string, max = 4): string[] {
  const out: string[] = [];
  for (const re of COVERAGE_PHRASES) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      const i = m.index ?? 0;
      out.push(text.slice(Math.max(0, i - 15), Math.min(text.length, i + m[0].length + 25)).replace(/\s+/g, ' ').trim());
      if (out.length >= max) return out;
    }
  }
  return out;
}

/* ── What the site says it does (question 1) ───────────────────────────────────────────────────── */

const DRIVING_CATEGORY = /\bdriving\s+(?:instructor|school|tuition|lessons?|trainer)s?\b|\bdriver\s+(?:training|trainer|instructor)s?\b/i;
const CAR_LESSON_SIGNS = /\b(?:learner|l[- ]plates?|manual|automatic|car lessons?|driving lessons?|pass (?:your )?(?:driving )?test|driving test|intensive course|dual[- ]control)\b/i;
const SPECIALISMS: ReadonlyArray<{ re: RegExp; trade: string }> = [
  { re: /\b(?:truck|trucks|heavy vehicles?|heavy rigid|heavy combination|multi[- ]combination|hgv|lgv|lorry|lorries|hr licen[cs]e|mc licen[cs]e)\b/i, trade: 'truck driver trainer' },
  { re: /\b(?:bus|buses|coach|pcv)\b/i, trade: 'bus driver trainer' },
  { re: /\b(?:forklift|fork lift)\b/i, trade: 'forklift trainer' },
  { re: /\b(?:motorcycles?|motorbikes?|motor bikes?|cbt)\b/i, trade: 'motorcycle trainer' },
];

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&hellip;/g, ' ').replace(/\s+/g, ' ').trim();
/** A homepage's own words, for siteTradeFor: title, meta description, H1/H2 headings, and the first 700 characters of text. */
export function homepageWords(html: string): string[] {
  const h = String(html ?? '').slice(0, 200_000);
  const title = stripTags(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] ?? '');
  const desc = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(h)?.[1] ?? '';
  const heads = [...h.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => stripTags(m[1])).slice(0, 8);
  const body = stripTags(h.replace(/<(?:script|style|noscript)\b[\s\S]*?<\/(?:script|style|noscript)>/gi, ' ')).slice(0, 700);
  return [title, desc, ...heads, body];
}

/** True for a category whose site may name a narrower trade (so the homepage is worth reading). */
export const categoryMayBeNarrower = (category: string | null | undefined): boolean => DRIVING_CATEGORY.test(String(category ?? ''));

/**
 * The trade question 1 asks about. `category` is the lead's own category ("Driving instructors"); `headTexts` are the
 * site's title, main headings, description and opening text. When the category is a driving one and the site's own
 * words name a specialism (trucks, buses, forklifts, motorcycles) with no car-lesson wording beside it, that is what the
 * business does; otherwise null, and the caller keeps the category. Never a guess: both conditions must hold.
 */
export function siteTradeFor(category: string | null | undefined, headTexts: readonly string[]): string | null {
  if (!DRIVING_CATEGORY.test(String(category ?? ''))) return null;
  const hay = headTexts.map((x) => String(x ?? '')).join(' ');
  if (!hay.trim() || CAR_LESSON_SIGNS.test(hay)) return null;
  const hits = SPECIALISMS.filter((s) => s.re.test(hay));
  return hits.length === 1 ? hits[0].trade : null;
}
