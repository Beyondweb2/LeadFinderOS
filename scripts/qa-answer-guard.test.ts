/* ============================================================
   THE Q&A ANSWER GUARD'S REGRESSION SUITE — Paul's spec, 2026-08-29.

   This guard narrows a SAFETY mechanism, so the suite is written the way the incident notes ask
   for: the absent cases are driven explicitly, the substring traps are driven explicitly, and the
   assertions are on the property (a figure can never publish unconfirmed) rather than on wording.

   ⛔ THE TWO PROPERTIES THAT MUST NEVER BREAK:
     1. An unknown / blank trade gets `structured` — the all-blanks mode. Absence is never
        permission to free-write.
     2. No sentence carrying a digit, currency or percentage is ever published as drafted.
   ============================================================ */
import {
  qaModeFor, confirmReason, guardProse, renderGuarded, confirmCount, confirmMark,
  splitSentences, REGULATED_TRADE_PATTERNS,
} from "../src/lib/qaAnswerGuard.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ Absent / unknown trade falls to the STRICT mode ──");
for (const t of [null, undefined, "", "   ", "\n"]) {
  ok(qaModeFor(t as string | null) === "structured", `trade ${JSON.stringify(t)} → structured`);
}
ok(qaModeFor("Something We Have Never Seen Ltd") === "advice",
  "an unrecognised BUT PRESENT trade → advice (only blank or regulated is strict)");

console.log("\n── Health + regulated trades keep the strict mode ──");
for (const t of [
  "Menopause clinic", "Private GP", "Dental practice", "Physiotherapy", "Veterinary surgery",
  "Health and wellbeing", "Counselling service", "Pharmacy", "Care home", "Aesthetics clinic",
  "Solicitors", "Legal services", "Mortgage broker", "Insurance broker", "Financial adviser",
]) ok(qaModeFor(t) === "structured", `"${t}" → structured`);

console.log("\n── The trades this change exists for get advice mode ──");
for (const t of [
  "Accountants", "Accountant", "Chartered accountants", "Bookkeeping", "Payroll bureau",
  "Locksmiths", "Plumber", "Electrician", "Mobile valeting", "Driving school",
]) ok(qaModeFor(t) === "advice", `"${t}" → advice`);

console.log("\n── ⛔ THE SUBSTRING TRAPS (CLAUDE.md §4) — every pattern is word-anchored ──");
{
  /* Unanchored, 'vet' matches "private", 'gp' matches "gps", 'care' matches "careful",
     'legal' would be fine but 'law firm' inside "outlaw firms" would not. */
  const traps: [string, string][] = [
    ["Private hire vehicle service", "'vet' must not match inside 'private'"],
    ["Careful Movers Ltd", "'care home' must not match inside 'careful'"],
    ["Healthy Eating Cafe", "'health' DOES match here — a food-health business is a fair catch"],
  ];
  ok(qaModeFor(traps[0][0]) === "advice", traps[0][1]);
  ok(qaModeFor(traps[1][0]) === "advice", traps[1][1]);
  ok(qaModeFor(traps[2][0]) === "structured", traps[2][1]);
  // The one that matters most: an accountancy trade must not be caught by any clinical pattern.
  ok(qaModeFor("Accountants and tax advisers") === "advice",
    "'tax advisers' must not trip /financial advi/ — it is a different phrase");
}

console.log("\n── ⛔ NO FIGURE EVER PUBLISHES UNCONFIRMED ──");
for (const s of [
  "The current filing deadline is 31 January.",
  "You can expect to pay around £250 for a straightforward return.",
  "Late filing carries a £100 penalty.",
  "Around 40% of sole traders file in the final week.",
  "We usually turn a set of accounts around in five working days.",
  "The VAT threshold changed in 2024.",
]) ok(confirmReason(s) === "figure", `figure caught: "${s.slice(0, 48)}…"`);

console.log("\n── Price vocabulary with no number is still a price claim ──");
for (const s of [
  "Our fees are competitive for a firm of this size.",
  "Most accountants charge by the hour.",
  "We offer a free initial consultation.",
  "Ask for a fixed fee before work begins.",
]) ok(confirmReason(s) !== null, `price-ish caught: "${s.slice(0, 44)}…"`);

console.log("\n── Credentials and guarantees are held back ──");
for (const s of [
  "We are ACCA registered.",
  "The firm is a member of the ICAEW.",
  "All our work is guaranteed.",
  "We carry professional indemnity insurance.",
]) ok(confirmReason(s) !== null, `credential caught: "${s}"`);

console.log("\n── ⛔ GENERAL PROFESSIONAL PROSE PUBLISHES AS DRAFTED (the point of the change) ──");
for (const s of [
  "An accountant prepares your annual accounts and files them with Companies House.",
  "Choosing an accountant is mostly about whether they understand your kind of business.",
  "It is worth asking how they prefer to communicate, and who you will actually deal with.",
  "Many people hire an accountant when bookkeeping starts taking time away from the work itself.",
  "Self assessment applies if you are self-employed or have income outside PAYE.",
  "Ask whether they have worked with businesses like yours before.",
]) ok(confirmReason(s) === null, `publishes: "${s.slice(0, 52)}…"`);

console.log("\n── The PRONOUN is the commitment boundary ──");
ok(confirmReason("An accountant will handle your VAT returns.") === null,
  "third-person description of the profession → publishes");
ok(confirmReason("We will handle your VAT returns.") !== null,
  "first-person promise about THIS business → confirm");

console.log("\n── Sentence-level, not paragraph-level (else it is the all-blanks page again) ──");
{
  const para = "An accountant prepares your annual accounts. Our fee for that is £600. "
    + "They also deal with Companies House on your behalf.";
  const g = guardProse(para);
  ok(g.length === 3, "three sentences");
  ok(g[0].confirm === null && g[2].confirm === null, "the two general sentences publish untouched");
  ok(g[1].confirm === "figure", "only the priced sentence is held");
  ok(confirmCount(para) === 1, "confirmCount reports exactly one");
  const out = renderGuarded(para);
  ok(out.includes("An accountant prepares your annual accounts.") && !out.includes("[CLIENT CONFIRM — figure: An accountant"),
    "clean prose is NOT wrapped");
  ok(out.includes("[CLIENT CONFIRM — figure: Our fee for that is £600.]"),
    "⛔ the DRAFT VALUE survives inside the marker — a human approves a number, not an empty blank");
}

console.log("\n── Empty / degenerate input never throws and never invents a confirmation ──");
for (const s of ["", "   ", null, undefined]) {
  ok(confirmReason(s as string) === null, `confirmReason(${JSON.stringify(s)}) → null`);
  ok(splitSentences(s as string).length === 0, `splitSentences(${JSON.stringify(s)}) → []`);
  ok(renderGuarded(s as string) === "", `renderGuarded(${JSON.stringify(s)}) → ""`);
}

console.log("\n── The marker names its rule, so the page says why a human is needed ──");
ok(confirmMark("Our fee is £600.", "figure") === "[CLIENT CONFIRM — figure: Our fee is £600.]",
  "marker shape is stable — the SPA banner and the operator both look for [CLIENT CONFIRM");
ok(REGULATED_TRADE_PATTERNS.every((re) => re.source.includes("\\b")),
  "⛔ EVERY regulated pattern is word-anchored — an unanchored one is a substring trap waiting");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURE(S)`);
if (f) process.exit(1);
