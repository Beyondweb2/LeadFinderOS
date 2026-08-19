/* ════════════════════════════════════════════════════════════════════════════════════════════
   KNOWN ENTITIES + JUNK WORDS — the static, hand-curated half of competitor classification.

   Built 2026-08-19 (Paul's spec) after two measured findings:
     · ~half of the real firms AI names are NOT in the local lead pool — some are NATIONAL operators
       (Able Group was the single most-named entity in electrician/Portsmouth) and some are
       DIRECTORIES (Checkatrade passed every report filter and could print as a "rival firm").
     · the LLM cleaner (extract-competitors) is a paid dependency that fails silently when the
       OpenAI account runs dry — single junk words ("always", "ask") then flood every fold.

   ⛔ THIS LIST CLASSIFIES AND FILTERS. IT NEVER ADDS. A name matching nothing here is simply
   unclassified — treated exactly as before. Same law as directoryFacts (§6): the static file may
   subtract or label, evidence decides everything else. The pool/nameMatches targeting architecture
   is untouched by this module.

   ⛔ ZERO DEPENDENCIES, RELATIVE-IMPORT-SAFE. Imported by the market-view edge function,
   auditReport.ts (which seven edge functions bundle) and marketView.ts — keep it a leaf.

   ✏️ PAUL: TO ADD A NAME, append a string to KNOWN_NATIONALS or KNOWN_DIRECTORIES below.
   Matching is by WHOLE WORD-TOKENS, case/punctuation-insensitive:
     · a multi-word entry ("Able Group") matches any name containing those words in order
       ("The Able Group Ltd" ✓).
     · a single-word entry ("Timpson") only matches names of at most TWO words ("Timpson",
       "Timpson Ltd") — never a longer real firm that happens to contain the word
       ("Bark & Birch Locksmiths" is NOT the directory Bark). scripts/known-entities.test.ts
       pins these rules, including the substring traps ("bing" can never match "plumbing").
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type KnownEntityKind = 'national' | 'directory';

/** National trade operators — REAL rivals a customer can hire, but never local firms. They stay in
 *  competitor lists (labelled), and the national-led verdict counts them as national even when the
 *  cross-town citation scan missed them. */
export const KNOWN_NATIONALS: readonly string[] = [
  '24 7 Home Rescue',
  'Able Group',
  'Anytime Locksmiths',
  'Aspect',
  'British Gas',
  'Crunch',
  'Dyno Rod',
  'Dyno-Rod',
  'Go Assist',
  'HomeServe',
  'Keytek',
  'Local Heroes',
  'LockFit',
  'Lockforce',
  'LockRite',
  'Mazuma',
  'Mr Electric',
  'Pimlico Plumbers',
  'TaxAssist',
  'TaxAssist Accountants',
  'Timpson',
];

/** Directories, platforms and review sites — sources, not hireable firms. Excluded from rival
 *  lists and from the top-named input the national-led verdict reads (being cited is not being
 *  named — §5 — and a directory in a NAMED list is the engine recommending a middleman, not a
 *  competing business). */
export const KNOWN_DIRECTORIES: readonly string[] = [
  '192.com',
  'Bark',
  'Checkatrade',
  'Facebook',
  'FreeIndex',
  'Google',
  'Google Maps',
  'Gumtree',
  'Instagram',
  'MyBuilder',
  'Nextdoor',
  'Rated People',
  'Three Best Rated',
  'Thomson Local',
  'Tripadvisor',
  'TrustATrader',
  'Trustpilot',
  'Yell',
  'Yell.com',
  'Yelp',
];

const tokensOf = (s: string): string[] =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

interface CompiledEntity { canonical: string; kind: KnownEntityKind; tokens: string[] }
const COMPILED: CompiledEntity[] = [
  ...KNOWN_NATIONALS.map((canonical) => ({ canonical, kind: 'national' as const, tokens: tokensOf(canonical) })),
  ...KNOWN_DIRECTORIES.map((canonical) => ({ canonical, kind: 'directory' as const, tokens: tokensOf(canonical) })),
]
  /* Longest first, so "TaxAssist Accountants" wins over "TaxAssist" and the canonical label is the
     most specific match. */
  .sort((a, b) => b.tokens.length - a.tokens.length);

/** entity tokens appear as a CONTIGUOUS whole-token run inside the candidate's tokens. */
function tokenRunMatch(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Classify a competitor name against the curated lists. null = unknown (treated as before).
 *
 * ⛔ SINGLE-TOKEN ENTITIES ONLY MATCH SHORT NAMES (≤ 2 tokens) — "Bark & Birch Locksmiths" is a
 * real firm, not the directory Bark. Multi-token entities match anywhere in the name, because a
 * multi-word brand appearing whole inside a name ("Able Group Emergency Locksmiths") IS that brand.
 */
export function classifyKnownEntity(name: string): { kind: KnownEntityKind; canonical: string } | null {
  const hay = tokensOf(name);
  if (hay.length === 0) return null;
  for (const e of COMPILED) {
    if (e.tokens.length === 1) {
      if (hay.length <= 2 && hay.includes(e.tokens[0])) return { kind: e.kind, canonical: e.canonical };
    } else if (tokenRunMatch(hay, e.tokens)) {
      return { kind: e.kind, canonical: e.canonical };
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   UNCLEANED-FOLD MARKERS — moved here from marketView.ts 2026-08-19 so the report path can use
   them without bundling the whole market module. marketView.ts re-exports them, so every existing
   importer and test is unchanged.

   THE GATE IS A FACT, NOT A RATIO: a SINGLE-TOKEN English function word cannot be a firm's name,
   and the LLM cleaner would never return one. Measured 2026-08-10: it separated all 20 markets
   with nothing in between — 39/39/33/24/18 markers on the five dirty ones and EXACTLY ZERO across
   793 distinct names in the fifteen clean ones.

   ⚠️ SINGLE TOKEN ONLY, so "One Call Locksmiths", "Always Secure Ltd" and "First Pick Locksmiths"
   are untouched — every real multi-word firm passes by construction. The measured zeros belong to
   the list AS IT STANDS; grow it and re-run the sweep before quoting them.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export const UNCLEANED_MARKER_WORDS: ReadonlySet<string> = new Set([
  "a", "about", "above", "after", "again", "all", "already", "also", "although", "always", "am", "an",
  "and", "another", "any", "anyone", "are", "as", "ask", "asked", "at", "available", "back", "based",
  "be", "because", "been", "before", "being", "below", "best", "better", "between", "both", "but",
  "by", "call", "called", "can", "cannot", "check", "come", "could", "did", "do", "does", "doing",
  "done", "down", "during", "each", "either", "else", "enough", "even", "ever", "every", "few",
  "find", "first", "for", "found", "from", "fully", "further", "get", "getting", "give", "given",
  "go", "going", "good", "got", "had", "has", "have", "having", "he", "help", "her", "here", "hers",
  "him", "his", "how", "however", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it",
  "it's", "its", "just", "keep", "know", "known", "last", "less", "let", "like", "likely", "look",
  "looking", "made", "make", "many", "may", "maybe", "me", "might", "mine", "more", "most", "much",
  "must", "my", "need", "needed", "needs", "never", "new", "next", "no", "none", "nor", "not",
  "note", "now", "of", "off", "often", "on", "once", "one", "only", "or", "other", "others", "our",
  "ours", "out", "over", "own", "particularly", "per", "perhaps", "please", "prices", "provide",
  "quite", "rather", "really", "right", "said", "same", "say", "see", "seen", "several", "shall",
  "she", "should", "since", "so", "some", "someone", "something", "still", "such", "sure", "take",
  "than", "that", "the", "their", "theirs", "them", "then", "there", "these", "they", "this",
  "those", "though", "through", "thus", "to", "too", "typically", "under", "until", "up", "upon",
  "us", "use", "used", "usually", "very", "via", "want", "was", "we", "well", "were", "what",
  "when", "where", "whether", "which", "while", "who", "whom", "why", "will", "with", "within",
  "without", "work", "worth", "would", "yes", "yet", "you", "your", "yours",
]);

/** One extracted "competitor" that proves the fold was never cleaned. */
export function isUncleanedName(name: string): boolean {
  const t = String(name ?? "").trim().toLowerCase().replace(/[.,;:!?]+$/, "");
  if (!t || t.includes(" ")) return false;
  return UNCLEANED_MARKER_WORDS.has(t);
}

/** Every distinct marker in a fold, sorted — so the flag can show its working rather than assert. */
export function uncleanedNames(names: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const n of names) {
    const t = String(n ?? "").trim().toLowerCase().replace(/[.,;:!?]+$/, "");
    if (isUncleanedName(t)) found.add(t);
  }
  return [...found].sort();
}
