/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NAME A PROSPECT IS GREETED BY — display only, never stored.

   🔴 THE PROBLEM. Templates greet with `outreach_leads.business_name`, which is the Google Maps
   listing, so a message opens "Hi N Hammond Gas Plumbing & Heating Engineer" when the man calls
   himself N Hammond. It reads automated. Measured over the 3,445 unarchived leads with a name:
   81.2% carry a trade word and 26.4% carry Ltd/Limited/LLP/PLC/Co.

   ⛔ THIS IS A DISPLAY RULE AND NOTHING WRITES IT BACK. `business_name` stays exactly as Google
   gave it, because it is the join key for things that must not move: `nameMatches` self-exclusion
   in the report and the audit scan, the dedupe ladder in `createFreeCheckLead`, `same-business.ts`
   and `place-resolve.ts`. Those all read the ROW. Only the greeting changes.

   ⛔ IT REFUSES FAR MORE OFTEN THAN IT TRIMS, AND EVERY REFUSAL RETURNS THE FULL GOOGLE NAME.
   There is no branch that returns empty, and none that returns a guess.

   🔴 THE FAILURE MODE THAT DECIDED THE DESIGN — IT IS NOT "NOTHING LEFT", IT IS STOPPING
   MID-NAME. A vocabulary rule peels backwards until it meets a word it does not recognise, and
   then it stops THERE: "Drainage Warrington - Blocked Drains" becomes "Drainage Warrington -
   Blocked"; "Carlisle Shoe Repairs" becomes "Carlisle Shoe". The full name reads formal; those
   read BROKEN, which is worse — broken is what actually looks automated. The vocabulary can never
   be complete, so the fragment cannot be prevented; it can only be DETECTED and refused.
   ⛔ SO: IF THE OUTPUT STILL CONTAINS A TRADE WORD OR A LEGAL SUFFIX, THE PEEL HALTED EARLY AND WE
   KEEP THE FULL NAME. That is the fragment refusal below. Paul's call 2026-09-15, on the
   measurement: 1,779 of 3,445 shortened with zero fragments, against 2,004 with 225 broken ones.
   "I will take 51.6% clean over 58.2% with 225 broken ones."

   ⛔ NO RE-CASING, EVER. FLOWPOINT and GENTS SALON go out exactly as they are. "Fixing"
   capitalisation turns RG into Rg, and RG Locksmiths is a paying customer.

   ⚠️ THE HAND-KEPT LISTS BELOW ARE SAFE IN A WAY A HAND-KEPT TLD LIST WOULD NOT HAVE BEEN, and the
   asymmetry is worth stating because it is the same question answered the opposite way. Absence
   from these lists causes a REFUSAL — we keep the full Google name, which is what we send today —
   so an incomplete list costs a missed shortening and can never cause a wrong send.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Legal suffixes. Stripped from the tail only. */
const LEGAL = new Set([
  "ltd", "ltd.", "limited", "llp", "llc", "plc", "l.t.d", "lt", "inc", "incorporated",
  "co", "co.", "company", "cyf", "cyfyngedig",
]);

/* ⛔ DERIVED FROM THE BOOK'S OWN `search_keyword` VALUES AND THEIR GRAMMATICAL VARIANTS, not
   invented: 15 distinct keywords cover all 3,561 leads. Re-derive rather than guess when a new
   trade is worked — a missing word only ever means a name is left long. */
const TRADE = new Set([
  "plumber", "plumbers", "plumbing", "plummer", "heating", "heat", "gas", "boiler", "boilers",
  "bathroom", "bathrooms", "drainage", "drains",
  "locksmith", "locksmiths", "locksmithing", "lock", "locks", "security", "keys", "key",
  "accountant", "accountants", "accountancy", "accounting", "tax", "taxation",
  "bookkeeping", "bookkeepers", "bookkeeper",
  "electrician", "electricians", "electrical", "electrics", "electric",
  "driving", "instructor", "instructors", "tuition", "lessons",
  "barber", "barbers", "barbering", "barbershop",
  "mechanic", "mechanics", "motor", "motors", "autos", "auto", "garage", "tyres",
  "valeting", "detailing", "valet", "valets", "groomer", "groomers", "grooming",
]);

/** Words that describe a business without naming one. Removable from the tail, never the remainder. */
const GENERIC = new Set([
  "services", "service", "solutions", "solution", "group", "the", "and", "of", "&",
  "specialists", "specialist", "contractors", "contractor", "engineers", "engineer", "engineering",
  "maintenance", "repairs", "repair", "installations", "installation", "supplies",
  "centre", "center", "company", "co", "uk", "u.k", "local", "mobile", "emergency",
  "247", "24/7", "professional", "professionals", "experts", "expert", "care", "works", "direct",
]);

/* ⚠️ MODIFIERS ARE IN-VOCABULARY FOR THE TAIL BUT MAY NOT BE THE REMAINDER, and that asymmetry is
   load-bearing. Without it the peel halted on "Chartered" and "Safe" and produced exactly the
   fragments this file exists to prevent — "Plus Accounting Chartered", "Timpson Locksmiths and
   Safe", "First Choice Tax Solutions Ltd - Certified Public". */
const MODIFIERS = new Set([
  "domestic", "commercial", "industrial", "national", "local", "city", "county", "town", "premier",
  "quality", "reliable", "affordable", "express", "rapid", "fast", "cheap", "best", "top", "first",
  "prime", "elite", "pro", "advanced", "modern", "complete", "total", "perfect", "superior",
  "supreme", "ultimate", "master", "certified", "chartered", "public", "approved", "registered",
  "trusted", "independent", "family", "general", "all", "new", "old", "north", "south", "east",
  "west", "central", "greater", "home", "house", "property", "safe", "secure",
]);

const STOP: ReadonlySet<string> = new Set<string>([...LEGAL, ...TRADE, ...GENERIC]);
const CONNECTORS = new Set(["&", "and", "-", "+", ",", "|", "/"]);

/* Strip the punctuation a listing carries around a word, so "Co." and "Ip" compare as words.
   ⚠️ Apostrophes are stripped in BOTH forms — Google stores the curly one, operators type the
   straight one, and "Kev's" must normalise identically either way. */
const norm = (t: string) => t.toLowerCase().replace(/[.,'’()[\]{}]/g, "").trim();
const tok = (n: string) => n.trim().split(/\s+/).filter(Boolean);

/** A word the tail may run through: trade, generic, legal, a modifier, or bare punctuation. */
const tailOk = (w: string) => {
  const n = norm(w);
  return !n || STOP.has(n) || MODIFIERS.has(n) || /^[-&+,./|]+$/.test(n);
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 TWO STYLES, BECAUSE THERE ARE TWO GRAMMARS AND ONE RULE CANNOT SERVE BOTH (Paul, 2026-09-15).

     "Hi ${b}," / "Hi ${b} 👋"   — a GREETING. Addressing someone. Short is natural: "Hi Zest,"
                                    reads like a person; "Hi Zest Electrical Services," reads like
                                    a mail merge. Every template but one is this shape.
     "Hi, is this ${b}?"         — an IDENTIFICATION. Asking whether they are who we think. Short
                                    is a WRONG NUMBER: "is this Zest?" and "is this Park?" carry no
                                    context at all, which is exactly what Paul reported.

   ⛔ THE SPLIT IS THE FRAME, NOT THE TEMPLATE. If a future body asks "is this X?" it wants
   `identify`; if it opens "Hi X," it wants `greet`. Do not add a template to the identify set
   because it feels formal — read the sentence the name lands in.
   ⚠️ `greet` IS THE DEFAULT so every existing caller is byte-identical to before this existed. */
export type NameStyle = "greet" | "identify";

/* ⛔ THE ONE PLACE THE SPLIT IS DECIDED. Three renderers read it — the Meta parameter, the stored
   body, and the Inbox mirror — so a template added here changes all three together. Written out at
   any of them instead, it would be the one-rule-in-N-places failure this codebase has recorded five
   times, and the transcript would drift from the message on the very next template.
   ⚠️ MEMBERSHIP IS DECIDED BY THE SENTENCE, NOT THE TONE: `initial_contact` is here because its
   body is "Hi, is this ${b}?". Every other live body opens "Hi ${b}," and wants the short form. */
export const IDENTIFY_NAME_TEMPLATES: ReadonlySet<string> = new Set(["initial_contact"]);

export interface DisplayNameOpts {
  /** The lead's town, when the caller knows it. Stops "Spalding Plumbers" greeting someone as
   *  "Spalding". Optional by design — see the stated limit on the bare-town guard below. */
  town?: string | null;
  /** How the name is being used. Default "greet" — the full peel, unchanged. */
  style?: NameStyle;
}

/* A trailing "(…)" or "[…]" is a Google Maps qualifier, not part of the legal suffix — and Paul's
   own worked example keeps it: "RJW Electrical Ltd (Sutton Coldfield)" -> "RJW Electrical (Sutton
   Coldfield)". Measured over the book: 8 names put the legal word immediately before one. */
const PAREN_TAIL = /\s*([([][^()[\]]*[)\]])\s*$/;
/** A word the LEGAL-only tail may run through: a legal suffix, or bare punctuation. */
const legalTailOk = (w: string) => {
  const n = norm(w);
  return !n || LEGAL.has(n) || /^[-&+,./|~]+$/.test(n);
};

/**
 * IDENTIFY style: strip the legal suffix and nothing else.
 *
 * ⛔ TRAILING ONLY, AND THAT IS MEASURED RATHER THAN CAUTIOUS. Of the 980 names carrying a legal
 * token, 897 end in one and **75 carry it mid-name** — "Asmat & Co. Accountants", "JM Price & Co
 * Accountants", "Whitings LLP, Chartered Accountants". Removing those in place produces "Asmat &
 * Accountants": a fragment, which is the one output this whole module exists to refuse.
 */
function identifyName(original: string, keep: (why: string) => DisplayNameResult): DisplayNameResult {
  const m = original.match(PAREN_TAIL);
  const paren = m ? m[1] : "";
  const main = (m ? original.slice(0, m.index) : original).trim();

  const t = tok(main);
  let cut = t.length;
  while (cut > 0 && legalTailOk(t[cut - 1])) cut--;
  if (cut === t.length) return keep("no legal suffix to remove");
  if (!t.slice(cut).some((w) => LEGAL.has(norm(w)))) return keep("nothing but punctuation to remove");

  let head = t.slice(0, cut);
  while (head.length && CONNECTORS.has(norm(head[head.length - 1]))) head = head.slice(0, -1);
  let out = head.join(" ").replace(/[\s,\-&+|/~]+$/, "").trim();

  if (!out) return keep("the whole name is a legal suffix");
  if (out.replace(/[^A-Za-z0-9]/g, "").length < 3) return keep("what remains is too short to be a name");
  if (paren) out = `${out} ${paren}`;
  if (out.toLowerCase() === original.toLowerCase()) return keep("nothing to trim");
  return { display: out, original, shortened: true, why: "" };
}

export interface DisplayNameResult {
  /** What to greet them by. Always non-empty when the input was non-empty. */
  display: string;
  /** The untouched input, for anything that needs the real listing. */
  original: string;
  shortened: boolean;
  /** Why it was kept whole. '' when it was shortened. */
  why: string;
}

/**
 * Shorten a Google Maps business name to something a person would answer to.
 *
 * ⛔ NEVER RETURNS EMPTY AND NEVER RETURNS A FRAGMENT. Every refusal path returns the full
 * original, which is what every message says today — so the worst case of this function is the
 * status quo.
 */
export function displayNameFor(name: string | null | undefined, opts: DisplayNameOpts = {}): DisplayNameResult {
  const original = (name ?? "").trim().replace(/\s+/g, " ");
  const keep = (why: string): DisplayNameResult => ({ display: original, original, shortened: false, why });
  if (!original) return { display: "", original: "", shortened: false, why: "no name" };

  if (opts.style === "identify") return identifyName(original, keep);

  const t = tok(original);

  /* Peel the in-vocabulary tail. The run must reach the END of the name — that is what makes a
     halt detectable rather than silent. */
  let cut = t.length;
  while (cut > 0 && tailOk(t[cut - 1])) cut--;
  if (cut === t.length) return keep("no trade or legal tail");

  /* ⛔ A GENERIC-ONLY TAIL IS NOT EVIDENCE OF A TRADE SUFFIX, so it is not cut. The removed run
     must contain at least one TRADE or LEGAL word to prove the name really does end in "what they
     do" or "how they are incorporated". Without this, "Carlisle Shoe Repairs" became "Carlisle
     Shoe" and "Wakefield Lcksmith Services" became "Wakefield Lcksmith" — a cobbler is outside our
     fifteen trades and `Lcksmith` is the owner's own typo, so in both cases the only thing we
     recognised was the word "Repairs"/"Services", which tells us nothing about where the NAME ends.
     ⚠️ It also correctly stops "Able Group" becoming "Able". */
  const tail = t.slice(cut);
  if (!tail.some((w) => TRADE.has(norm(w)) || LEGAL.has(norm(w)))) return keep("nothing but generic words to remove");

  let head = t.slice(0, cut);
  while (head.length && CONNECTORS.has(norm(head[head.length - 1]))) head = head.slice(0, -1);
  const out = head.join(" ").replace(/[\s,\-&+|/]+$/, "").trim();

  // ── the guards, every one of which returns the full Google name ──────────────────────────────
  if (!out) return keep("the whole name is trade words");
  if (out.replace(/[^A-Za-z0-9]/g, "").length < 3) return keep("what remains is too short to be a name");

  /* ⛔ THE FRAGMENT REFUSAL — Paul's call, and the reason this rule is shippable at all. A trade
     word or a legal suffix SURVIVING into the output is proof the peel halted before a clean
     boundary, because a clean peel removes every one of them. Those are the "Drainage Warrington -
     Blocked" outputs: 225 of 2,004, each reading broken rather than merely formal. */
  if (head.some((w) => TRADE.has(norm(w)) || LEGAL.has(norm(w)))) return keep("the peel halted mid-name");

  if (head.every((w) => MODIFIERS.has(norm(w)) || STOP.has(norm(w)))) {
    return keep("what remains describes, it does not name");
  }

  /* ⚠️ BARE TOWN — "Spalding Plumbers" must not greet anyone as "Spalding".
     ⛔ STATED LIMIT: this fires ONLY when the caller supplies the town. The gazetteer is a 733-row
     database table (`uk_towns`) and copying it into a leaf would be a second copy that drifts —
     the failure this codebase has recorded five times. So the guard takes the town the lead
     already carries, and where a caller has none the guard simply does not run. */
  const town = (opts.town ?? "").trim().toLowerCase();
  if (town && out.toLowerCase() === town) return keep("what remains is just the town");

  if (out.toLowerCase() === original.toLowerCase()) return keep("nothing to trim");
  return { display: out, original, shortened: true, why: "" };
}

/** The greeting name, or the full listing if the rule declined. The one-line form for callers. */
export function displayBusinessName(name: string | null | undefined, opts: DisplayNameOpts = {}): string {
  return displayNameFor(name, opts).display;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ⛔ THE TRANSCRIPT MUST SHOW WHAT WAS ACTUALLY SENT — including for messages sent BEFORE this
   rule existed. The Inbox re-renders a placeholder-bodied row from the lead's CURRENT name, so
   applying the rule blindly would rewrite August's messages to say something the prospect never
   read. That is the same fault as editing `re_engage`'s historical body to match the registry
   (CLAUDE.md §19) — it falsifies the only record of what went out, in the other direction.

   ⚠️ THE CONSTANT MUST MATCH THE DEPLOY. It is the moment the shortened name first reached Meta;
   a row older than it was sent with the full listing and renders with the full listing for ever.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export const DISPLAY_NAME_LIVE_FROM = "2026-09-15T00:00:00.000Z";

/**
 * The name to render a stored message with: shortened only if it was SENT after the rule went
 * live. An unreadable or missing timestamp is treated as OLD — absence is never permission to
 * rewrite a transcript.
 */
export function transcriptBusinessName(
  name: string | null | undefined,
  sentAt: string | null | undefined,
  opts: DisplayNameOpts = {},
): string {
  const full = (name ?? "").trim();
  const t = sentAt ? Date.parse(sentAt) : NaN;
  if (!Number.isFinite(t) || t < Date.parse(DISPLAY_NAME_LIVE_FROM)) return full;
  return displayBusinessName(full, opts);
}
