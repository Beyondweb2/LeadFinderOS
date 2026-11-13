/* NEVER A COMMON WORD — the V2 name rule ported into V1's one ruler (cellNamed).
   A name made only of everyday words and the trade counts only when the answer writes the whole
   name as a name; a distinctive word of the name counts on its own. Cases from V2's
   auditNamesCommon.test.ts (Moments Wedding Content, Mayo). */
import { notJustCommonWords, writtenAsName, nameWords } from "../src/lib/commonWordName.ts";
import { cellNamed } from "../src/lib/namedSignal.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const ctx = { trade: "Wedding content creator", town: "Mayo" };
const M = "Moments Wedding Content";
ok(notJustCommonWords("* Moments Wedding Content – Mayo-based, specialising in candid footage.", M, ctx), "whole capitalised name counts");
ok(notJustCommonWords("* Moments. Wedding Content – Mayo-based.", M, ctx), "punctuated whole name counts");
ok(notJustCommonWords("Find out more via Moments ~ Wedding Content Ireland.", M, ctx), "up to 4 marks between words");
ok(notJustCommonWords("MOMENTS WEDDING CONTENT films the whole day.", M, ctx), "upper-case whole name counts");
ok(!notJustCommonWords("These creators capture candid moments on the day.", M, ctx), "lower-case 'moments' is never the name");
ok(!notJustCommonWords("We love capturing the moments wedding guests remember.", M, ctx), "everyday words in a row, lower case: not the name");
ok(!notJustCommonWords("Great moments, wedding content and reels from local creators.", M, ctx), "everyday words lower case with commas: not the name");
ok(!notJustCommonWords("Moments are what matter.", "Moments", ctx), "a one-word everyday name never counts from the text");
ok(notJustCommonWords("Try kavanagh weddings in Mayo.", "Moments Kavanagh Weddings", ctx), "a distinctive word counts in any case");
ok(notJustCommonWords("OakLane Joinery is good.", "Oak Lane Joinery", { trade: "joiner", town: "Leeds" }), "joined form of a distinctive word counts");
ok(notJustCommonWords("* **MC Locksmiths** - covers all of Herne Bay", "MCLocksmiths centre", { trade: "Locksmiths", town: "Canterbury" }), "a joined name written split in the answer still counts (MCLocksmiths)");
ok(notJustCommonWords("Smith & Sons Plumbing came out.", "Smith and Sons Plumbing", { trade: "plumber", town: "Leeds" }), "& for and");
ok(writtenAsName("call Golden Hour Films today", nameWords("Golden Hour Films")), "writtenAsName finds capitalised run");
ok(!writtenAsName("call golden hour films today", nameWords("Golden Hour Films")), "writtenAsName refuses lower case");

// Through the one ruler: a trade+town-free everyday name, judged by the text.
const cctx = { businessName: "Golden Moments Films", trade: "Wedding videographer", town: "Leeds" };
ok(cellNamed({ answer_text: "Golden Moments Films is a popular choice in Leeds.", named: false }, cctx) === true, "cellNamed: whole name written as a name = named");
ok(cellNamed({ answer_text: "Book early for golden moments films of your day.", named: true, self_named: true }, cctx) === false, "cellNamed: lower-case everyday phrase is not named, even over a model yes");
ok(cellNamed({ answer_text: "Kavanagh Locksmiths are quick.", named: false }, { businessName: "Kavanagh Locksmiths", trade: "locksmith", town: "Leeds" }) === true, "cellNamed: distinctive name unchanged");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
