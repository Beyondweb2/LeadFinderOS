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
import { UNCLEANED_MARKER_WORDS } from "../src/lib/knownEntities.ts";
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

/* ⚠️ THIS USED TO ASSERT A RE-EXPORT FROM marketView.ts, AND THE RE-EXPORT HAD NO OTHER READER.
   The marker set moved here in 2026-08-19 and marketView re-exported it "so every existing importer
   is unchanged"; by 2026-09-09 there were no importers left, so the only thing keeping the
   re-export alive was this assertion that it existed. Both are gone — knownEntities.ts is the one
   home, and the report path (isRealCompetitor, below) is what actually reads it. */
console.log("\n── THE MARKER FUNCTIONS, AT THEIR ONE HOME ──");
ok(UNCLEANED_MARKER_WORDS.has("always"), "the marker set is exported from knownEntities.ts");
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

/* ⛔ THE `national_led` MARKET VERDICT WAS DELETED 2026-09-09 WITH THE MARKET VIEW, and its
   assertions went with it — they drove marketShape(), which no longer exists. What they were
   really protecting survives above and is still tested: the curated national/directory
   classification, and the rule that it may only ever CLASSIFY or SUBTRACT, never add
   (CLAUDE.md §6). isRealCompetitor is the live consumer — a directory must never print as a
   client's rival — and those cases are in the block above this one. */

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
