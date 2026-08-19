/* ============================================================
   KNOWN ENTITIES — the static nationals/directories list and its matcher (2026-08-19).

   ⛔ THE LIST CLASSIFIES AND FILTERS, NEVER ADDS. These tests pin the two matching rules:
     * whole word-tokens only — the substring traps CLAUDE.md records twice each ("bing" in
       plumBING, "acca" in MACCA-Gas) must be impossible by construction;
     * a single-word entity only matches names of <= 2 tokens — "Bark & Birch Locksmiths" is a
       real firm, not the directory Bark.
   Plus the two consumers: the report filter (directories are not rivals, marker words are not
   firms) and the national-led verdict (a known national is national even when the cross-town
   scan missed it; a directory never occupies a top-N slot).
   ============================================================ */
import { classifyKnownEntity, isUncleanedName, uncleanedNames } from "../src/lib/knownEntities.ts";
import {
  marketShape, NATIONAL_MIN_OTHER_TOWNS,
  UNCLEANED_MARKER_WORDS as REEXPORTED_MARKERS, isUncleanedName as reexportedIsUncleaned,
  type MarketShapeInput, type MarketNamedRow, type MarketCitationHost,
} from "../src/lib/marketView.ts";
import { isRealCompetitor } from "../src/lib/auditReport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── CLASSIFICATION: the measured cases ──");
ok(classifyKnownEntity("Able Group")?.kind === "national", "Able Group -> national (top-named in electrician/Portsmouth)");
ok(classifyKnownEntity("The Able Group Ltd")?.kind === "national", "  wrapped in The/Ltd still matches");
ok(classifyKnownEntity("Go Assist")?.kind === "national", "Go Assist -> national");
ok(classifyKnownEntity("LockRite Locksmiths")?.kind === "national", "LockRite Locksmiths -> national (Colchester top-3)");
ok(classifyKnownEntity("Lockforce Huntingdon")?.kind === "national", "Lockforce <town> -> national (a branch IS the brand)");
ok(classifyKnownEntity("Timpson")?.kind === "national", "Timpson -> national");
ok(classifyKnownEntity("Checkatrade")?.kind === "directory", "Checkatrade -> directory");
ok(classifyKnownEntity("checkatrade.com")?.kind === "directory", "checkatrade.com -> directory (punctuation-insensitive)");
ok(classifyKnownEntity("Yell")?.kind === "directory", "Yell -> directory");
ok(classifyKnownEntity("Rated People")?.kind === "directory", "Rated People -> directory");
ok(classifyKnownEntity("TaxAssist Accountants")?.canonical === "TaxAssist Accountants",
  "longest entity wins: TaxAssist Accountants, not bare TaxAssist");

console.log("\n── ⛔ THE SUBSTRING TRAPS, DESIGNED OUT ──");
ok(classifyKnownEntity("Eastbourne Plumbing Services") === null, "'bing' inside plumBING can never match");
ok(classifyKnownEntity("Macca-Gas") === null, "'acca' inside Macca-Gas can never match");
ok(classifyKnownEntity("Yellow Van Plumbers") === null, "Yell does not match YELLow (whole tokens only)");
ok(classifyKnownEntity("Timpsons Heating") === null, "Timpson does not match TimpsonS (different token)");
ok(classifyKnownEntity("Lock Around The Clock") === null, "no entity is bare 'Lock' — union-find bridge word stays unclassified");

console.log("\n── ⛔ SINGLE-WORD ENTITIES ONLY MATCH SHORT NAMES ──");
ok(classifyKnownEntity("Bark")?.kind === "directory", "bare Bark -> directory");
ok(classifyKnownEntity("Bark.com")?.kind === "directory", "Bark.com -> directory");
ok(classifyKnownEntity("Bark & Birch Locksmiths") === null, "Bark & Birch Locksmiths is a REAL FIRM, never the directory");
ok(classifyKnownEntity("Crunch")?.kind === "national", "bare Crunch -> national accountancy");
ok(classifyKnownEntity("Crunch Time Plumbing & Heating") === null, "  but a long name containing 'crunch' stays a real firm");

console.log("\n── ⛔ ABSENT VALUES CLASSIFY AS NOTHING ──");
ok(classifyKnownEntity("") === null, "empty -> null");
ok(classifyKnownEntity("   ") === null, "whitespace -> null");
ok(classifyKnownEntity("!!!") === null, "punctuation-only -> null");

console.log("\n── THE MARKER FUNCTIONS MOVED, THE RE-EXPORT HOLDS ──");
ok(REEXPORTED_MARKERS.has("always") && reexportedIsUncleaned("always"),
  "marketView.ts still exports the marker set + isUncleanedName (every old importer unchanged)");
ok(isUncleanedName("ask") && isUncleanedName("Always") && isUncleanedName("they,"),
  "single function words are markers, case/punctuation-insensitive");
ok(!isUncleanedName("Always Secure Ltd") && !isUncleanedName("One Call Locksmiths"),
  "multi-word real firms are NEVER markers");
ok(uncleanedNames(["always", "ask", "Cordner Heating", "always"]).join(",") === "always,ask",
  "uncleanedNames dedupes and keeps only markers");

console.log("\n── THE REPORT FILTER: directories and junk are not rivals, nationals are ──");
ok(!isRealCompetitor("Checkatrade", "Eastbourne"), "Checkatrade never prints as a rival firm");
ok(!isRealCompetitor("Trustpilot", "Eastbourne"), "Trustpilot never prints as a rival firm");
ok(!isRealCompetitor("always", "Eastbourne"), "a marker word never prints as a rival");
ok(isRealCompetitor("Able Group", "Portsmouth"), "Able Group IS a rival (national, but hireable)");
ok(isRealCompetitor("Harrlie Plumbing LTD", "Eastbourne"), "an unknown real firm still passes (the list never subtracts real locals)");
ok(isRealCompetitor("Safe And Secure Locksmiths", "Huntingdon"), "the pinned real-firm case from RG's report still passes");

console.log("\n── THE NATIONAL-LED VERDICT: both signals, directories excluded ──");
{
  const firm = (name: string, mentions: number, otherTowns: number, known?: "national" | "directory"): MarketNamedRow => ({
    key: name.toLowerCase(), name, variants: [name], mentions, audits: 2,
    tier: "established", auditShare: 1, mentionShare: 1, otherTowns, ...(known ? { known } : {}),
  });
  const HOST: MarketCitationHost = { host: "checkatrade.com", citations: 39, isAggregator: true };
  const market = (named: MarketNamedRow[]): MarketShapeInput => ({
    audits: 2, completeRuns: 2,
    leader: named[0] ? { name: named[0].name, mentions: named[0].mentions } : null,
    leaderRow: named[0] ?? null,
    topNamed: named,
    citationHosts: [HOST], citationTotal: 284,
    distinctBusinesses: Math.max(named.length, 20),
    marketAuditsComplete: 2, businessAuditsComplete: 0,
  });

  /* The Portsmouth blind spot: known nationals with ZERO cross-town evidence (first measured town
     of the trade) hold the whole top. The evidence-only test called this local. */
  const blindSpot = market([
    firm("Able Group", 40, 0, "national"),
    firm("Go Assist", 30, 0, "national"),
    firm("HomeServe", 20, 0, "national"),
  ]);
  ok(marketShape(blindSpot).kind === "national_led",
    "known nationals with otherTowns=0 -> national_led (the curated signal covers the scan's blind spot)");

  /* A directory in the top three must not shield a national pattern: filtered from the slice, the
     test reads the three real firms behind it. */
  const shielded = market([
    firm("Checkatrade", 50, 0, "directory"),
    firm("LockRite", 40, NATIONAL_MIN_OTHER_TOWNS, "national"),
    firm("Lockforce", 30, NATIONAL_MIN_OTHER_TOWNS),
    firm("LockFit", 20, NATIONAL_MIN_OTHER_TOWNS),
  ]);
  ok(marketShape(shielded).kind === "national_led",
    "a directory occupying #1 is excluded, so Colchester-style national domination is still caught");

  /* And one real local at the top keeps the market workable — the curated list must never flip a
     genuinely local market. */
  const local = market([
    firm("J&J Locksmiths", 32, 0),
    firm("LockRite", 15, NATIONAL_MIN_OTHER_TOWNS, "national"),
    firm("Checkatrade", 13, 0, "directory"),
    firm("Eastbourne Locksmiths", 12, 0),
  ]);
  const shape = marketShape(local);
  ok(shape.kind !== "national_led", `a local leader keeps the market workable (got ${shape.kind})`);

  /* Absent `known` behaves exactly as before — old cached payloads lose nothing. */
  const legacy = market([firm("J&J Locksmiths", 32, 0), firm("Someone Else", 20, 0)]);
  ok(marketShape(legacy).kind !== "national_led", "rows with no known field grade exactly as before");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
