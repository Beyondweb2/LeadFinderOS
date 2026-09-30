/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES STYLE — the one set of rules for every word LeadFinderOS writes to a prospect (2026-09-30).

   Paul's standard: REAL PERSON, REAL RESEARCH, PLAIN ENGLISH, SHORT, DIRECT, SPECIFIC, NO AI SLOP.
   Somebody who genuinely asked AI for the trade in the town, genuinely saw the competitors it named,
   genuinely looked at the prospect's site and is now just saying so.

   TWO HALVES, ONE FILE:
     · SALES_STYLE_RULES — the short block every model that writes sales words is given (the voice
       note, the warm reply, the site research's questions). One copy, so the prompts cannot drift.
     · salesStyleProblems — the check the same words are held to afterwards, and the one the
       deterministic copy (the call script, the objections, the fallbacks) is tested against.

   ⛔ THE CHECK IS A FLOOR, NOT THE STANDARD. A banned-phrase list catches the worst of it; it cannot
      tell a natural sentence from a stilted one. The per-generator checks (the competitors named, the
      engine, the finding actually used, no causation, the length) stay where they are. This adds the
      style floor they share.
   ⛔ COMPETITOR NAMES ARE NOT OUR WORDS. "Premier Plumbing" is a real firm, not filler — the caller
      passes the names it inserted and they are removed before anything is checked.

   Pure and edge-reachable: no imports, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The line Paul says is working best (2026-09-30). A QUALITY STANDARD — never pasted in as the
 *  message. The placeholders are filled only with real data. */
export const HOUSE_STYLE_EXAMPLE =
  "Hi mate, I asked Google AI for a plumber in [town] and it named [competitor 1], [competitor 2] and [competitor 3]. " +
  "I had a look at why this was happening and found a few issues with your website. " +
  "We specialise in AI visibility and I'm happy to explain what I'd do to make your business more likely to be the one AI recommends.";

/** The shared prompt block. Short on purpose: each generator's own prompt still owns its SHAPE. */
export const SALES_STYLE_RULES = `HOW IT MUST SOUND (Findable's house style; it applies to every word you write):
- A real person who genuinely asked AI, genuinely saw who it named and genuinely looked at their website. Plain English. Short sentences. Direct and specific.
- Say the search the way a person says it: "i asked Google AI for a plumber in Rugby". No adjectives on the search ("reliable", "trusted", "reputable", "professional", "highly rated", "top rated") unless that word is the whole point of it (an "emergency" locksmith). Nobody needs a reason for searching.
- Say what was actually found on their site and why it matters, in normal words a tradesperson uses. No jargon ("entity", "signals", "schema", "structured data", "indexing", "optimised", "crawl budget"); if a technical word is unavoidable, explain it in the same breath.
- Use ONLY the facts you are given. If a detail is missing, write naturally around it. Never invent a name, a number, a service, a result, a reason or a compliment.
- Never: "i came across your business", "hope this message finds you well", "trusted local business", "reputable", "leading", "premier", "high-quality", "unlock", "leverage", "revolutionise", "enhance your digital presence", "boost your online presence", "stand out in today's competitive landscape", "AI-powered", "game-changer", "cutting-edge", "seamless", "elevate", "don't hesitate", "great question".
- No fake rapport ("how are you today?", "have i caught you at a bad time?"), no hype, no exclamation marks.
- Vary it the way a person would: from what THIS search, THESE competitors and THIS site actually show, never by swapping in synonyms.
THE STANDARD TO MATCH (its quality, not its words; do not copy it): "${HOUSE_STYLE_EXAMPLE}"
Where this message's own SHAPE or rules differ from that example (how it ends, what it may offer, what it may claim), the SHAPE and rules win.`;

/* ── The check ─────────────────────────────────────────────────────────────────────────────────── */

/** Lower case, curly quotes straightened, apostrophes dropped ("don't" → "dont"), spaces collapsed. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[’‘`]/g, "'").replace(/'/g, '').replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

/** Adjectives nobody puts on a real search. Said in front of the trade after "asked … for", "looking
 *  for", "searched for" they are the tell of a machine-worded query (Paul, 2026-09-30). "emergency",
 *  "24 hour", "commercial" are real intents and are NOT here. */
export const SEARCH_FILLER_WORDS: readonly string[] = ['reliable', 'trusted', 'reputable', 'trustworthy', 'highly rated', 'top rated', 'top-rated', 'dependable'];
const SEARCH_FILLER = SEARCH_FILLER_WORDS.map((w) => w.replace(/[- ]/g, '[- ]')).join('|');
const SEARCH_WITH_FILLER = new RegExp(`\\b(?:asked|asking|searched|searching|looked|looking|find|finding|checked|checking|typed)\\b[^.?!\\n]{0,40}?\\b(?:${SEARCH_FILLER})\\b`);

/** How many filler adjectives a search question carries. Ranking only: a question is never rewritten,
 *  because the words are what was actually asked. */
export function searchFillerCount(question: string): number {
  const q = normalise(question);
  return SEARCH_FILLER_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[- ]/g, '[- ]')}\\b`).test(q)).length;
}

const FILLER: ReadonlyArray<[RegExp, string]> = [
  [/\bi (?:came|stumbled) across\b/, '"I came across"'],
  [/\bhope (?:this|the|my) (?:message |email |note )?finds you\b/, '"hope this message finds you well"'],
  [/\bhope (?:you are|youre) (?:well|keeping well|doing well)\b/, '"hope you\'re well"'],
  [/\bhow are you (?:doing )?today\b/, '"how are you today?"'],
  [/\bcaught you at a bad time\b/, '"have I caught you at a bad time?"'],
  [/\bunlock\w*/, '"unlock"'],
  [/\bleverag\w*/, '"leverage"'],
  [/\brevolutioni[sz]\w*/, '"revolutionise"'],
  [/\b(?:digital|online) (?:presence|footprint)\b/, '"digital / online presence"'],
  [/\btodays (?:competitive|digital|busy) (?:landscape|world|market(?:place)?)\b/, '"today\'s competitive landscape"'],
  [/\bstand out from the crowd\b/, '"stand out from the crowd"'],
  [/\bai[- ]powered\b/, '"AI-powered"'],
  [/\bgame[- ]?changer\b/, '"game-changer"'],
  [/\bcutting[- ]edge\b/, '"cutting-edge"'],
  [/\bseamless\w*/, '"seamless"'],
  [/\belevate\b/, '"elevate"'],
  [/\bdont hesitate\b/, '"don\'t hesitate"'],
  [/\bgreat question\b/, '"great question"'],
  [/\bid love to\b/, '"I\'d love to"'],
  [/\b(?:premier|reputable|trustworthy)\b/, '"premier / reputable"'],
  [/\bleading (?:local |uk |national )?(?:provider|company|business|firm|expert|specialist)s?\b/, '"leading provider"'],
  [/\bhigh[- ]quality (?:service|provider|work|solution)s?\b/, '"high-quality service"'],
  [/\btrusted (?:local )?(?:business|provider|company|firm|expert|partner)s?\b/, '"trusted local business"'],
  [/\bsolutions? provider\b|\bbespoke solutions?\b|\btailored solutions?\b/, '"solutions"'],
];

/**
 * The house-style floor. Returns one line per problem ("Uses …"), empty when clean.
 * @param ignore names inserted into the text (competitors, the business) — removed first.
 */
export function salesStyleProblems(text: string, ignore: readonly string[] = []): string[] {
  let bare = String(text ?? '');
  for (const n of ignore) if (n && n.trim().length >= 3) bare = bare.split(n).join(' ');
  const t = normalise(bare);
  const out: string[] = [];
  const search = t.match(SEARCH_WITH_FILLER);
  if (search) out.push(`Puts a filler adjective on the search ("${search[0].slice(-40).trim()}"). Say the trade and the town plainly.`);
  for (const [re, label] of FILLER) if (re.test(t)) out.push(`Uses ${label}.`);
  if (/!/.test(bare)) out.push('Uses an exclamation mark.');
  return out;
}
