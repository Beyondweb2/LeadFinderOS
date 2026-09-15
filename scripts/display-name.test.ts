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
    /* WAS "Zest Electrical Services" UNTIL 2026-09-15. Paul's call after seeing 20 real
       before/afters: "Services" goes too, when a trade word survives it. "Hi, is this Zest
       Electrical?" is the target; "Hi, is this Zest?" was the wrong number this style exists
       to prevent, and the two-word floor is what keeps them apart. */
    ["Zest Electrical Services", "Zest Electrical"],
    ["London Electrics Ltd", "London Electrics"],
    ["N Hammond Gas Plumbing & Heating Engineer", "N Hammond Gas Plumbing & Heating Engineer"],
    ["Beeson Plumbing & Heating Ltd", "Beeson Plumbing & Heating"],
  ] as Array<[string, string]>) {
    ok(id(input) === want, `identify: ${JSON.stringify(input)} -> ${JSON.stringify(want)}`);
  }
  ok(id("RJW Electrical Ltd (Sutton Coldfield)", "Sutton Coldfield") === "RJW Electrical (Sutton Coldfield)",
     "identify keeps a trailing parenthetical and still drops the Ltd before it");
}

console.log("\n🔴 IDENTIFY: A TRAILING TOWN GOES, A LEADING ONE IS THE NAME");
/* Paul, 2026-09-15: "Hi, is this RJ Burns Electrical Services Harlow?" is too much, and the town is
   the part to lose. ⛔ THE TOWN IS NEVER GUESSED — it is the one the LEAD ROW carries, passed in.
   Measured: 364 of 3,624 unarchived names end in their own town. */
{
  const id = (n: string, town?: string) => displayNameFor(n, { town, style: "identify" }).display;

  // Paul's own case, both halves of it.
  ok(id("RJ Burns Electrical Services Harlow", "Harlow") === "RJ Burns Electrical",
     'identify: "RJ Burns Electrical Services Harlow" + Harlow -> "RJ Burns Electrical"');
  ok(id("RJ Burns Electrical Services", "Harlow") === "RJ Burns Electrical",
     'identify: the same name without the town still sheds "Services"');

  /* ⛔ A LEADING TOWN IS THE WHOLE NAME. Paul named this one: "Bristol Electricians" must survive
     even with Bristol supplied, because POSITION is the test, not membership. */
  ok(id("Bristol Electricians", "Bristol") === "Bristol Electricians",
     "a LEADING town is the name and is never touched");
  ok(id("Bristol Electricians", "bristol") === "Bristol Electricians",
     "and case does not smuggle it through");

  // Real rows from the book, with the town the lead carries.
  for (const [input, town, want] of [
    ["Bracey's Accountants Hitchin", "Hitchin", "Bracey's Accountants"],
    ["SOS Locksmiths Bolton", "Bolton", "SOS Locksmiths"],
    ["PME Heating & Plumbing - Bolton", "Bolton", "PME Heating & Plumbing"],
    ["AquaPlumb - Emergency Plumber - Harlow", "Harlow", "AquaPlumb - Emergency Plumber"],
    ["Sherwin Currid Chichester", "Chichester", "Sherwin Currid"],
    ["City Plumbing Burton upon Trent", "Burton upon Trent", "City Plumbing"],
  ] as Array<[string, string, string]>) {
    ok(id(input, town) === want, `identify: ${JSON.stringify(input)} + ${town} -> ${JSON.stringify(want)}`);
  }

  /* 🔴 THE CONNECTOR REFUSAL — Paul's call, from the ONE case in 364 this got wrong. A two-town
     name is a LIST, and stripping the matched half presents half a list as the whole thing. */
  ok(id("Ollie's Lock & Safe Locksmiths Cheltenham & Gloucester", "Gloucester")
       === "Ollie's Lock & Safe Locksmiths Cheltenham & Gloucester",
     "a town after a connector is one item of a list, not a suffix — kept whole");
  ok(id("Veteran Locksmiths and Chichester", "Chichester") === "Veteran Locksmiths and Chichester",
     "and 'and' counts as a connector too");

  /* ⛔ NO TOWN SUPPLIED = NO TOWN STEP. The gazetteer is a 733-row database table and is
     deliberately not copied into this leaf, so a caller with no town gets exactly today's output. */
  ok(id("Sherwin Currid Chichester") === "Sherwin Currid Chichester",
     "no town on the caller: the strip does not run and the name is kept whole");

  // The town may never BE the name.
  ok(id("Harlow", "Harlow") === "Harlow", "a name that is only the town is kept whole");
  ok(id("Plumbing Harlow", "Harlow") === "Plumbing Harlow",
     "and what remains must still be more than a bare trade word");
}

console.log("\n⛔ IDENTIFY: \"SERVICES\" GOES ONLY WHERE A TRADE WORD SURVIVES AND TWO WORDS REMAIN");
/* Paul's guard, and it is what makes a bare "Shaw" impossible. */
{
  const id = (n: string, town?: string) => displayNameFor(n, { town, style: "identify" }).display;
  for (const [input, want] of [
    ["Shaw Plumbing Services", "Shaw Plumbing"],
    ["Needhams Plumbing Services", "Needhams Plumbing"],
    ["Read Bookkeeping Services Ltd", "Read Bookkeeping"],
    ["MIRO-WIRO Electrical Services", "MIRO-WIRO Electrical"],
    ["James Drains Solutions", "James Drains"],
    ["Seaburn Gas Services Ltd", "Seaburn Gas"],
  ] as Array<[string, string]>) {
    ok(id(input) === want, `identify: ${JSON.stringify(input)} -> ${JSON.stringify(want)}`);
  }
  /* ⛔ THE REFUSALS. Nothing in these says what they do, so the remainder would be a wrong number. */
  for (const n of ["Pyramid Services", "Anderson Solutions", "Hartley Group"]) {
    ok(id(n) === n, `no trade word survives, so it is kept whole: ${JSON.stringify(n)}`);
  }
  ok(id("Plumbing Services") === "Plumbing Services", "two words down to one is refused");
  /* BSCB: already the answer, and nothing more may be cut — the trade word is the only context. */
  ok(id("BSCB ELECTRICAL LIMITED") === "BSCB ELECTRICAL",
     "BSCB ELECTRICAL LIMITED -> BSCB ELECTRICAL, and no further");
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
