/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NEVER A COMMON WORD (behaviour ported from V2 reports v2, Paul 2026-11-12; V2 analyse.ts).

   A name match in an AI answer counts only when the answer holds a DISTINCTIVE word of the name
   (not an everyday word, not the trade, not the town, not a legal or filler word): "Kavanagh" in
   "Moments Kavanagh Weddings". A name made ONLY of everyday words and the trade ("Moments Wedding
   Content" for a wedding content creator) counts only when the answer writes the WHOLE name as a
   name, each word capitalised ("Moments Wedding Content", "Moments. Wedding Content"), never
   "captures the moments wedding guests love". A one-word everyday name never counts from the text.

   This is an extra condition ON TOP of nameMatches (nameMatch.ts), applied by cellNamed — the one
   ruler — so both sides of a before/after comparison move together.

   ⚠️ IMPORTED BY EDGE FUNCTIONS: dependency-free leaf, no imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type CommonWordContext = { trade?: string | null; town?: string | null };

const LEGAL_WORDS = new Set(['ltd', 'limited', 'llp', 'plc', 'inc', 'co', 'company', 'uk']);
const NAME_FILLER = new Set(['and', 'n', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'at', 'by', 'to', 'with']);

/** Everyday English words that often open a business name: on their own they do not say which
 *  business (with the trade and the town as well). */
export const COMMON_NAME_WORDS: ReadonlySet<string> = new Set((
  'moment moments memory memories story stories life love heart home house family friend friends people together forever always everyday day days time times ' +
  'light sun sunshine moon star stars sky ocean sea river field fields garden gardens park bridge castle crown key keys point edge line peak summit wave spark sparks ' +
  'bloom blossom flower flowers tree trees oak pine maple rose lily ivy capture captured focus frame frames lens picture pictures image images vision view views ' +
  'art arts craft crafts work works made care help hand hands touch way path journey step steps start next now today plus one two three first second prime ' +
  'central north south east west global national united direct digital media design designs creative pro best top good great new old high big little small ' +
  'bright perfect golden happy smart simple simply pure true fresh clean clear premier elite royal ace total express quick swift rapid fast modern classic urban ' +
  'city town village country local green blue red black white silver gold sweet lovely beautiful brilliant amazing magic dream dreams wonder wild free open ' +
  'better bespoke quality value trust trusted reliable honest friendly expert experts master masters bliss joy glow shine smile smiles style styles studio ' +
  'pixel pixels click snap shot shots reel reels film films tale tales video videos photo photos content creator creators wedding weddings event events ' +
  'party parties social signature essential essentials complete everything instant nice fine kind special unique original authentic natural ' +
  'evergreen harmony serenity balance spirit soul inspire inspired inspiration bold brave lucky noble proud rich safe secure solid sound steady ' +
  'right ready well wise young age era future past present world earth planet nation land lands hill hills valley vale stone rock rocks wood woods water fire air'
).split(/\s+/).filter(Boolean));

export function nameWords(s: string): string[] {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w && !LEGAL_WORDS.has(w));
}

/** The name's words in a row in the answer, each written with a capital (filler words like "and"
 *  or "of" in any case, "&" for "and"), up to 4 marks between. */
export function writtenAsName(prose: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const word = (w: string) => NAME_FILLER.has(w)
    ? (w === 'and' ? '(?:and|And|AND|&|n|N)' : `(?:${w}|${w[0].toUpperCase()}${w.slice(1)}|${w.toUpperCase()})`)
    : w.split('').map((c, i) => (/[a-z]/.test(c) ? (i === 0 ? c.toUpperCase() : `[${c}${c.toUpperCase()}]`) : c)).join('');
  const re = new RegExp(`(?:^|[^A-Za-z0-9])${tokens.map(word).join('[^A-Za-z0-9]{0,4}')}(?![A-Za-z0-9])`);
  return re.test(prose);
}

/** The words of the name that say WHICH business (not everyday, trade, town or filler). */
export function distinctiveNameWords(name: string, ctx: CommonWordContext): string[] {
  const noise = new Set([...nameWords(ctx.trade ?? ''), ...nameWords(ctx.town ?? '')].flatMap((w) => [w, w.replace(/s$/, ''), `${w}s`]));
  const everyday = (w: string) => COMMON_NAME_WORDS.has(w) || COMMON_NAME_WORDS.has(w.replace(/s$/, '')) || noise.has(w) || NAME_FILLER.has(w);
  return nameWords(name).filter((w) => w.length >= 3 && !everyday(w));
}

/** True when a text match of `name` in `prose` is not just everyday words that happen to appear. */
export function notJustCommonWords(prose: string, name: string, ctx: CommonWordContext): boolean {
  const tokens = nameWords(name);
  if (!tokens.length) return false;
  const distinctive = distinctiveNameWords(name, ctx);
  const hay = nameWords(prose);
  // the word itself, or joined with another word of the name ("OakLane" for "Oak Lane"), or a joined name word written
  // split in the answer ("MC Locksmiths" for "MCLocksmiths" — V1 addition: a paying client is named exactly so)
  const split = (w: string) => hay.some((_, i) => [2, 3].some((n) => i + n <= hay.length && hay.slice(i, i + n).join('') === w));
  const inHay = (w: string) => hay.some((t) => t === w || (t.length > w.length && t.includes(w) && tokens.some((o) => o !== w && o.length >= 2 && t.includes(o)))) || split(w);
  if (distinctive.length) return distinctive.some(inHay) || writtenAsName(prose, tokens);
  // only everyday words: the whole name, written as a name; a single everyday word: never
  return tokens.filter((w) => !NAME_FILLER.has(w)).length >= 2 && writtenAsName(prose, tokens);
}
