import { businessCore, normalizeForMatch } from "./enrichment/ai-search.ts";

/* ============================================================
   MARKET-SCOPED NAME MATCHING — extra normalisation layered ON TOP of businessCore, for the market
   view only. ai-search.ts is NOT touched: businessCore/normalizeForMatch/nameMatches decide the
   named-flag on every audit ever run, and that is not worth risking for a display fold.

   ── WHY businessCore ALONE UNDER-MERGES ──────────────────────────────────────────────────────
   Measured on locksmiths / Wisbech, 14 audits, 326 mentions:

     "Anglia Locksmiths"                     -> "anglia locksmiths"
     "Anglia Locksmiths (MLA Approved Company)" -> "anglia locksmiths mla approved"

   Three separate mechanisms, all live in that one market:

   1. THE TRADE WORD IS NOT GENERIC. businessCore truncates at the first GENERIC_NAME_TOKENS hit,
      and that list has "plumbing" and "accountants" but NOT "locksmith"/"locksmiths". With nothing
      to truncate at, the whole string survives — town, qualifier and all. This is why plumbers
      merged fine and locksmiths did not.
   2. PARENTHETICAL QUALIFIERS SURVIVE. normalizeForMatch strips the brackets as punctuation but
      keeps the words, so "(MLA Approved Company)" becomes core text.
   3. THE TOWN SURVIVES. "Wisbech" is not a generic descriptor, so "LockRite Wisbech" and
      "LockRite" never meet.

   ── WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────────────────────
   Adds: split on parentheses (each side is a candidate), drop the town CURRENTLY BEING VIEWED,
   drop the trade being viewed, then match when one candidate's tokens are a prefix of another's.

   Does NOT add: edit distance, similarity scoring, or any fuzzy test. Over-merging two genuinely
   different firms hides a real prospect, which is worse than showing one firm twice — so anything
   uncertain stays separate.

   ── ONE SET OF GROUPS, BOTH SIDES ────────────────────────────────────────────────────────────
   groupNames() is run ONCE over the named list and the lead pool TOGETHER. The named merge and the
   pool subtraction then read the same groups, so they cannot disagree — which is the actual bug
   this fixes: "Anglia Locksmiths" led the named list while "Anglia Locksmiths (MLA Approved
   Company)" sat in the never-named list as a prospect.
   ============================================================ */

/** A core shorter than this is too weak to be a merge key on its own — it would prefix-match half
 *  the market. Such a candidate is dropped, and the name falls back to its full normalised form. */
const MIN_CORE_CHARS = 3;

export interface MarketMatchContext {
  /** Tokens of the town being viewed. ONLY this town — town names in general are left alone, so a
   *  "Keytek Locksmiths Peterborough" seen inside a Wisbech market keeps its town. */
  townTokens: Set<string>;
  /** Tokens of the trade being viewed, plus the obvious singular/plural pair. Dropping these is
   *  what lets "LockRite" meet "LockRite Locksmiths". */
  tradeTokens: Set<string>;
  /** token -> its canonical form, for every town/trade token and its plural. Used ONLY to build the
   *  fallback key of a name with nothing distinctive left, so "Hastings Locksmiths" and "Hastings
   *  Locksmith" produce the SAME key instead of two entries for one firm. Safe by construction:
   *  these are exactly the tokens already known to carry no distinguishing information. */
  canonical: Map<string, string>;
}

/** Both singular and plural, because a market is "locksmiths" while a name says "Locksmith". */
function withPlurals(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    if (!t) continue;
    out.add(t);
    out.add(t.endsWith("s") ? t.slice(0, -1) : `${t}s`);
  }
  return [...out];
}

export function buildMatchContext(trade: string, town: string): MarketMatchContext {
  const townBase = normalizeForMatch(town).split(/\s+/).filter(Boolean);
  const tradeBase = normalizeForMatch(trade).split(/\s+/).filter(Boolean);
  const townTokens = new Set(withPlurals(townBase));
  const tradeTokens = new Set(withPlurals(tradeBase));
  /* Canonical form of every town/trade token: the SINGULAR of the word as given. Both spellings map
     to it, so a fallback key built from these tokens is spelling-independent. */
  const canonical = new Map<string, string>();
  for (const t of [...townBase, ...tradeBase]) {
    const singular = t.endsWith("s") ? t.slice(0, -1) : t;
    canonical.set(t, singular);
    canonical.set(singular, singular);
    canonical.set(`${singular}s`, singular);
  }
  return { townTokens, tradeTokens, canonical };
}

/** Split a name into its outside-brackets text and each inside-brackets text.
 *  Both halves are kept as CANDIDATES rather than the brackets simply being deleted, because the
 *  identifying half is sometimes inside them: "Wisbech Locksmiths (Rapid Locksmiths)" is Rapid, and
 *  deleting the bracket would leave "Wisbech Locksmiths", which identifies nobody. */
function segmentsOf(name: string): { text: string; fromParen: boolean }[] {
  const inside = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => ({ text: m[1], fromParen: true }));
  const outside = { text: name.replace(/\([^)]*\)/g, " "), fromParen: false };
  return [outside, ...inside]
    .map((s) => ({ text: s.text.trim(), fromParen: s.fromParen }))
    .filter((s) => s.text.length > 0);
}

/** Strip the viewed town and the viewed trade from an already-normalised token stream. */
function stripContext(tokens: string[], ctx: MarketMatchContext): string[] {
  return tokens.filter((t) => !ctx.townTokens.has(t) && !ctx.tradeTokens.has(t));
}

export interface Candidate {
  core: string;
  /** True when this core may only match EXACTLY, never as a prefix. Set when the core is a residue
   *  of stripping the town/trade, or when it came from inside brackets. Both are shorthand rather
   *  than a name written in full, and neither is strong enough to absorb a longer name. */
  exactOnly: boolean;
}

/**
 * Every distinctive core this name could be identified by, normalised for the market in view.
 * Empty only when the name carries no distinguishing content at all (e.g. "Wisbech Locksmiths"
 * inside a Wisbech locksmiths market, which is a description rather than a name).
 */
export function candidateCores(name: string, ctx: MarketMatchContext): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const seg of segmentsOf(name)) {
    // businessCore first: it gives the Ltd / Services / Company truncation and the accent,
    // ampersand and whitespace canonicalisation for free.
    const base = businessCore(seg.text).trim() || normalizeForMatch(seg.text).trim();
    const tokens = base.split(/\s+/).filter(Boolean);
    const stripped = stripContext(tokens, ctx);
    const core = stripped.join(" ");
    if (core.length < MIN_CORE_CHARS) continue;
    const exactOnly = stripped.length !== tokens.length || seg.fromParen;
    // If the same core arrives both ways, the STRONGER (prefix-eligible) reading wins.
    const prev = out.get(core);
    if (!prev || (prev.exactOnly && !exactOnly)) out.set(core, { core, exactOnly });

    /* THE LEADING SEGMENT BEFORE A CONNECTOR, as an EXACT-ONLY candidate.
       "Timpson Locksmiths and Safe Engineers" in a locksmiths market strips to
       "timpson and safe engineers" — nothing equals that, and prefix-matching it against the
       plain "Timpson" is refused (correctly: see namesMatch). Hastings therefore listed five
       Timpson rows as a chain entry AND the sixth as a separate prospect.
       "timpson" is what the firm is actually called, so it is offered as its own candidate and the
       two names now meet by EQUALITY. exactOnly, because it is a fragment of a reduced name and
       must never absorb a longer one — which is what keeps the Wrexham junk ("Mobile",
       "Industrial") from swallowing real entries. */
    const connectorAt = stripped.indexOf("and");
    if (connectorAt > 0) {
      const lead = stripped.slice(0, connectorAt).join(" ");
      if (lead.length >= MIN_CORE_CHARS && !out.has(lead)) out.set(lead, { core: lead, exactOnly: true });
    }
  }
  if (out.size === 0) {
    /* Nothing distinctive survived ("Hastings Locksmiths" inside a Hastings locksmiths market is a
       description, not a name). Fall back to the full normalised name so the entry keeps an identity
       of its own — never an empty key, which would merge every such name into one.

       CANONICALISED, and this is the fix for a real split: "Hastings Locksmiths" (12 mentions,
       established) and "Hastings Locksmith" (1 mention, barely named) were TWO entries for one firm,
       which inflated the barely-named count and understated the established one. Only town and trade
       tokens are canonicalised — words already known to carry no distinguishing information — so no
       two genuinely different firms can be brought together by this. */
    const full = normalizeForMatch(name).trim();
    if (full) {
      const canonicalFull = full.split(/\s+/).map((t) => ctx.canonical.get(t) ?? t).join(" ");
      out.set(canonicalFull, { core: canonicalFull, exactOnly: false });
    }
  }
  return [...out.values()];
}

/** Is `a` a token-wise prefix of `b`? Word-level, so "lock" never matches "lockrite". */
function tokenPrefix(a: string, b: string): boolean {
  const x = a.split(" ");
  const y = b.split(" ");
  if (x.length > y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * Two names are the same firm when any candidate of one matches any candidate of the other.
 *
 * EQUALITY always counts. PREFIX counts only when NEITHER core is a stripping residue, and that
 * restriction is the difference between a useful merge and a dangerous one — measured on real data:
 *
 *   WANTED   "Timpson" + "Timpson Key Machine"  — both written in full, neither reduced, so the
 *            prefix is a real claim about the names as typed.
 *   REFUSED  "Rapid Locksmiths" + "Rapid Secure UK" — the first only becomes the single token
 *            "rapid" because this is a locksmiths market and the trade word was stripped. That
 *            residue is an artefact of the view, not a name, and letting it prefix-match swallowed
 *            a separate firm into a 38-mention group AND took over its display name.
 *
 * Every town variant ("LockRite Wisbech", "LockRite Locksmiths Wisbech", "LockRite") still merges,
 * because after stripping they are EQUAL, not merely prefixes. Prefix is only doing work for the
 * genuinely-extended names, which is where it belongs.
 *
 * ⚠️ THIS RULE WAS DELIBERATELY NOT LOOSENED to fix the Hastings Timpson duplicate. Allowing a
 * real name to prefix-match a longer RESIDUE would have merged it, but measured over four real
 * markets it also merged junk fragments in Wrexham ("Mobile" absorbing "Mobile Auto Electricians",
 * "Industrial" + "Wrexham Industrial Estate") — and the same mechanism could absorb a genuine pool
 * business into a named entry, hiding a prospect. The connector split in candidateCores fixes
 * Timpson by EQUALITY instead, which needs no loosening here.
 */
/** Is `t` a variant of the trade being viewed — a stem match rather than an exact one?
 *  "locks" against a "locksmiths" market shares the 5-char prefix "locks", so a firm called
 *  "Little's Locks" is describing the same trade as "Little's Locksmiths". Requires 4+ shared
 *  leading characters, so "secure" never matches "locksmith". */
const TRADE_STEM_MIN = 4;
function isTradeAdjacent(t: string, ctx: MarketMatchContext): boolean {
  if (ctx.tradeTokens.has(t)) return true;
  for (const trade of ctx.tradeTokens) {
    const n = Math.min(t.length, trade.length);
    if (n < TRADE_STEM_MIN) continue;
    let shared = 0;
    while (shared < n && t[shared] === trade[shared]) shared++;
    if (shared >= TRADE_STEM_MIN) return true;
  }
  return false;
}

/** Country/region words, which qualify a name without identifying a different firm. */
const COUNTRY_TOKENS = new Set(["uk", "gb", "england", "scotland", "wales", "britain", "ltd", "limited"]);

export function namesMatch(a: Candidate[], b: Candidate[], ctx?: MarketMatchContext): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x.core === y.core) return true;
      if (!x.exactOnly && !y.exactOnly) {
        if (tokenPrefix(x.core, y.core) || tokenPrefix(y.core, x.core)) return true;
        continue;
      }
      /* ── A RESIDUE MAY PREFIX-MATCH, BUT ONLY WHEN THE EXTRA WORDS SAY NOTHING NEW ────────────
         The blanket refusal split one firm in two: "Little's Locksmiths" reduces to the residue
         "little s" while "Little's Locks" keeps "little s locks", so they never met — 8 mentions
         established and 2 barely-named, for one business.
         The Rapid trap is still refused, and the difference is the EXTRA tokens:
           ALLOWED  "little s" + "little s locks"      — "locks" is the trade, said differently.
           REFUSED  "rapid"    + "rapid secure uk"     — "secure" is a different firm's name.
         So every extra token must be trade-adjacent (4+ shared leading characters with a trade
         token) or a country/company suffix. Anything else and the longer name is its own firm. */
      if (!ctx) continue;
      const [shorter, longer] = x.core.split(" ").length <= y.core.split(" ").length ? [x, y] : [y, x];
      if (!tokenPrefix(shorter.core, longer.core)) continue;
      const extra = longer.core.split(" ").slice(shorter.core.split(" ").length);
      if (extra.length === 0) continue;
      if (extra.every((t) => isTradeAdjacent(t, ctx) || COUNTRY_TOKENS.has(t))) return true;
    }
  }
  return false;
}

export interface NameGroup {
  /** Stable key: the shortest candidate core in the group, ties broken alphabetically. */
  key: string;
  /** Every original spelling in this group, so a wrong merge is visible on screen. */
  names: string[];
}

/**
 * Group every name that refers to the same firm.
 *
 * Union-find, so grouping does not depend on input order: "LockRite Wisbech" and "LockRite
 * Locksmith Services" are joined through "LockRite" whichever order they arrive in. Run this ONCE
 * over the named list and the pool together — that shared pass is what makes the two sides
 * incapable of disagreeing.
 */
export function groupNames(names: string[], ctx: MarketMatchContext): Map<string, NameGroup> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const cores = unique.map((n) => candidateCores(n, ctx));

  const parent = unique.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      if (namesMatch(cores[i], cores[j], ctx)) union(i, j);
    }
  }

  const byRoot = new Map<number, string[]>();
  for (let i = 0; i < unique.length; i++) {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(unique[i]);
    byRoot.set(r, list);
  }

  const out = new Map<string, NameGroup>();
  for (const [root, list] of byRoot) {
    const all = list.flatMap((n) => candidateCores(n, ctx)).map((c) => c.core);
    const key = [...all].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? unique[root];
    out.set(key, { key, names: list.sort() });
  }
  return out;
}

/** name -> group key, for both sides to look up the same answer. */
export function keyIndex(groups: Map<string, NameGroup>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const g of groups.values()) for (const n of g.names) idx.set(n, g.key);
  return idx;
}
