/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE GREETING NAME — three properties that pull against each other, so all three are asserted on
   every shape rather than eyeballed on one:

     1. "N Hammond Gas Plumbing & Heating Engineer" greets as "N Hammond".
     2. ⛔ NOTHING IS EVER EMPTY, A FRAGMENT, OR A GUESS. Every refusal returns the full Google
        name, which is exactly what we send today — so the worst case is the status quo.
     3. ⛔ THE TRANSCRIPT NEVER LIES. A message sent before the rule went live renders with the
        full name for ever, because that is what the prospect actually read.

   ⛔ PROPERTY 2 IS THE ONE THAT MATTERS ON A REAL SEND, and the sharpest case is the FRAGMENT:
   "Drainage Warrington - Blocked Drains" must not go out as "Drainage Warrington - Blocked". That
   is worse than doing nothing, because the full name reads formal while a fragment reads broken.

   Run: npx tsx scripts/display-name.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  displayNameFor, displayBusinessName, transcriptBusinessName, DISPLAY_NAME_LIVE_FROM,
  IDENTIFY_NAME_TEMPLATES,
} from "../src/lib/displayName.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── 🔴 THE CASE THIS EXISTS FOR ──");
{
  const v = displayNameFor("N Hammond Gas Plumbing & Heating Engineer");
  ok(v.shortened && v.display === "N Hammond", `greets as "N Hammond" (got "${v.display}")`);
  ok(v.original === "N Hammond Gas Plumbing & Heating Engineer", "and still carries the real listing");
}

console.log("\n── ⛔ THE FRAGMENT REFUSAL: a halted peel keeps the full name ──");
{
  /* Every one of these halted mid-name before the refusal existed. The tell is a trade word or a
     legal suffix surviving into the output — a clean peel removes all of them. */
  const fragments = [
    "Drainage Warrington - Blocked Drains",
    "Carlisle Shoe Repairs",
    "CDM Electrical & Fire Ltd",
    "Arc Electrical & Lighting Contractors Ltd",
    "Croma Locksmiths Bournemouth & Bournemouth Car Key Company",
    "In House Securities Ltd Halifax Locksmith",
    "Uno Accountancy Services Limited Lincoln Chartered Accountants",
    "Wakefield Lcksmith Services",
    "Pro Plumbing and Heating NE LTD",
    "central locksmith services automotive and domestic",
  ];
  for (const n of fragments) {
    const v = displayNameFor(n);
    ok(!v.shortened && v.display === n, `kept whole: "${n}"${v.shortened ? ` — LEAKED "${v.display}"` : ""}`);
  }
}

console.log("\n── ⛔ NO OUTPUT EVER CONTAINS A TRADE WORD OR A LEGAL SUFFIX (the property, not the list) ──");
{
  /* The invariant behind the refusal, asserted directly: if it shortened, the result is clean. */
  const TRADEY = /\b(plumb\w*|heating|gas|locksmith\w*|electric\w*|accountan\w*|accountancy|accounting|drain\w*|barber\w*|mechanic\w*|valet\w*|groom\w*|ltd|limited|llp|plc)\b/i;
  const names = [
    "N Hammond Gas Plumbing & Heating Engineer", "Prestige Heating Ltd", "Duncan Plumbing & Heating",
    "Robert Sadler and Company Ltd", "Henderson Electrical Solutions Ltd", "Maximus Accountancy Services Limited",
    "Plus Accounting Chartered Accountants", "Timpson Locksmiths and Safe Engineers", "Morlands Locks & Keys",
    "Oscar Ip & Co. Chartered Accountants", "First Choice Tax Solutions Ltd - Certified Public Accountants",
    "Drainage Warrington - Blocked Drains", "Whitings LLP, Chartered Accountants", "Squid Accountants LTD",
  ];
  const leaks = names.map((n) => displayNameFor(n)).filter((v) => v.shortened && TRADEY.test(v.display));
  ok(leaks.length === 0, `no shortened output leaks a trade word or suffix${leaks.length ? " — " + leaks.map((l) => `"${l.display}"`).join(", ") : ""}`);
}

console.log("\n── ⛔ NEVER EMPTY, NEVER ABSURD ──");
{
  const hard = [
    "The Emergency Electricians", "Emergency Electrician Services Ltd", "Domestic Electrician Ltd",
    "Plumbing & Heating", "Locksmiths Ltd", "Ltd", "&", "The", "Services", "A&P Plumbing & Heating",
    "B & S Locksmiths", "MH Plumbing and Heating", "S.H Plumbing & Heating", "AC Auto Locksmiths",
  ];
  let bad: string[] = [];
  for (const n of hard) {
    const v = displayNameFor(n);
    if (!v.display.trim()) bad.push(`${n} -> EMPTY`);
    if (v.shortened && v.display.replace(/[^A-Za-z0-9]/g, "").length < 3) bad.push(`${n} -> "${v.display}"`);
  }
  ok(bad.length === 0, `no empty or absurd output across ${hard.length} hard names${bad.length ? " — " + bad.join("; ") : ""}`);
  ok(displayNameFor("The Emergency Electricians").display === "The Emergency Electricians",
     "a name that is entirely trade description is kept whole");
  ok(displayNameFor("Domestic Electrician Ltd").display === "Domestic Electrician Ltd",
     "'Domestic Electrician Ltd' does not become 'Domestic'");
}

console.log("\n── ⛔ ABSENT INPUT ──");
{
  for (const v of [null, undefined, "", "   "]) {
    const r = displayNameFor(v as string | null | undefined);
    ok(!r.shortened && r.display === "", `${JSON.stringify(v)} → empty, no throw, never shortened`);
  }
  ok(displayBusinessName(null) === "", "the one-line form is empty-safe too");
}

console.log("\n── ⛔ NO RE-CASING ──");
{
  ok(displayBusinessName("FLOWPOINT PLUMBING & HEATING") === "FLOWPOINT", "FLOWPOINT stays shouting");
  ok(displayBusinessName("GENTS SALON barbers") === "GENTS SALON", "GENTS SALON stays shouting");
  ok(displayBusinessName("lockSHAW Locksmiths") === "lockSHAW", "lockSHAW keeps its odd casing");
  ok(displayBusinessName("RG Locksmiths") === "RG Locksmiths", "RG Locksmiths is too short to trim — and RG never becomes Rg");
}

console.log("\n── ⚠️ THE BARE-TOWN GUARD, AND ITS STATED LIMIT ──");
{
  ok(displayBusinessName("Spalding Plumbers", { town: "Spalding" }) === "Spalding Plumbers",
     "with the town known, 'Spalding Plumbers' is kept whole");
  ok(displayBusinessName("Spalding Plumbers", { town: "spalding" }) === "Spalding Plumbers",
     "the town match is case-insensitive");
  ok(displayBusinessName("Spalding Plumbers") === "Spalding",
     "⚠️ STATED LIMIT: with no town supplied the guard cannot fire — this is the known gap, not a bug");
  ok(displayBusinessName("Puzzle Plumbers", { town: "Spalding" }) === "Puzzle",
     "a real name in the same town is still shortened");
}

console.log("\n── ⛔ THE TRANSCRIPT NEVER LIES ──");
{
  const full = "N Hammond Gas Plumbing & Heating Engineer";
  const before = new Date(Date.parse(DISPLAY_NAME_LIVE_FROM) - 86_400_000).toISOString();
  const after = new Date(Date.parse(DISPLAY_NAME_LIVE_FROM) + 86_400_000).toISOString();
  ok(transcriptBusinessName(full, before) === full, "a message sent BEFORE the rule renders with the full name it was sent with");
  ok(transcriptBusinessName(full, after) === "N Hammond", "a message sent AFTER renders with the name that actually went out");
  /* ⛔ ABSENCE IS NEVER PERMISSION TO REWRITE A TRANSCRIPT. */
  for (const t of [null, undefined, "", "not a date", "0000"]) {
    ok(transcriptBusinessName(full, t as string | null | undefined) === full,
       `an unreadable timestamp (${JSON.stringify(t)}) is treated as OLD and keeps the full name`);
  }
  ok(transcriptBusinessName(full, DISPLAY_NAME_LIVE_FROM) === "N Hammond", "the boundary instant itself is 'after'");
}

console.log("\n── ⛔ IDEMPOTENT: shortening a shortened name changes nothing ──");
{
  const names = ["N Hammond Gas Plumbing & Heating Engineer", "Prestige Heating Ltd", "Morlands Locks & Keys", "Maximus Accountancy Services Limited"];
  const bad = names.filter((n) => {
    const once = displayBusinessName(n);
    return displayBusinessName(once) !== once;
  });
  ok(bad.length === 0, `re-applying the rule is a no-op${bad.length ? " — " + bad.join(", ") : ""}`);
}

console.log("\n── 🔴 IDENTIFY STYLE — \"Hi, is this X?\" NEEDS CONTEXT, NOT A FIRST WORD ──");
/* Paul, 2026-09-15: "Hi, is this Zest?" and "Hi, is this Park?" read like a wrong number. The greet
   rule is right for "Hi X," and wrong for an identification question, so the FRAME picks the rule. */
{
  const id = (n: string, town?: string) => displayNameFor(n, { town, style: "identify" }).display;
  for (const [input, want] of [
    ["Zest Electrical Services", "Zest Electrical Services"],
    ["London Electrics Ltd", "London Electrics"],
    ["N Hammond Gas Plumbing & Heating Engineer", "N Hammond Gas Plumbing & Heating Engineer"],
    ["Beeson Plumbing & Heating Ltd", "Beeson Plumbing & Heating"],
  ] as Array<[string, string]>) {
    ok(id(input) === want, `identify: ${JSON.stringify(input)} -> ${JSON.stringify(want)}`);
  }
  ok(id("RJW Electrical Ltd (Sutton Coldfield)", "Sutton Coldfield") === "RJW Electrical (Sutton Coldfield)",
     "identify keeps a trailing parenthetical and still drops the Ltd before it");
}

console.log("\n⛔ IDENTIFY MUST NOT CUT A LEGAL WORD OUT OF THE MIDDLE OF A NAME");
/* Measured over the book: 75 of the 980 names carrying a legal token carry it mid-name. Stripping
   in place gives "Asmat & Accountants" — a fragment, the one output this module exists to refuse. */
{
  for (const n of ["Asmat & Co. Accountants", "JM Price & Co Accountants",
                   "Whitings LLP, Chartered Accountants", "Fisher & Co Chartered Accountants"]) {
    const r = displayNameFor(n, { style: "identify" });
    ok(!r.shortened && r.display === n, `mid-name legal word is kept whole: ${JSON.stringify(n)}`);
  }
}

console.log("\n⚠️ THE TWO STYLES ARE GENUINELY DIFFERENT, AND greet IS UNCHANGED");
{
  ok(displayNameFor("Beeson Plumbing & Heating Ltd").display === "Beeson",
     "greet still peels the trade tail — the default is untouched");
  ok(displayNameFor("Beeson Plumbing & Heating Ltd", { style: "greet" }).display
     === displayNameFor("Beeson Plumbing & Heating Ltd").display,
     "an absent style renders byte-identically to an explicit greet");
  ok(IDENTIFY_NAME_TEMPLATES.has("initial_contact"), "initial_contact is the identify frame");
  for (const t of ["video_template", "competitor_hook", "free_check_result", "re_engage_49", "payment_recieved"]) {
    ok(!IDENTIFY_NAME_TEMPLATES.has(t), `${t} stays on greet — its body opens "Hi X,"`);
  }
}

console.log("\n⛔ IDENTIFY KEEPS EVERY GUARANTEE THE GREET RULE MAKES");
{
  ok(displayNameFor("Ltd", { style: "identify" }).display === "Ltd", "a name that is only a legal word is kept whole");
  ok(displayNameFor("", { style: "identify" }).display === "", "empty in, empty out");
  const once = displayNameFor("London Electrics Ltd", { style: "identify" }).display;
  ok(displayNameFor(once, { style: "identify" }).display === once, "re-applying identify is a no-op");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
