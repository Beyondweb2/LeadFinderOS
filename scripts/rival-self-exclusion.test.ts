/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A BUSINESS IS NEVER ITS OWN RIVAL.

   🔴 THIS WAS LIVE ON competitor_hook, NOT A RISK IN THE NEW TEMPLATE. Driving the real selection
   (count -> groupNames -> rank -> top 3) over every audit on file 2026-09-15: 26 of 1,145 audits
   with stored competitors named their OWN business in the three that get sent, and all 26 were
   attached to a lead. The fixtures below are the real ones, verbatim from that run.

   ⛔ THE TEST DRIVES THE REAL nameMatches, injected exactly as the send path injects it. Asserting
   against a reimplementation of the matcher would prove nothing about what actually sends — and
   the whole reason this guard exists is that `cleanNames` was trusted rather than measured.

   Run: npx tsx scripts/rival-self-exclusion.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { excludeSelfRivals, isSelfRival, usableRivals, RIVALS_REQUIRED, rivalHookDecision } from "../src/lib/rivalHook.ts";
import { nameMatches } from "../src/lib/nameMatch.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── 🔴 THE REAL AUDITS THAT WOULD HAVE NAMED THEMSELVES ──");
{
  /* [business, the ranked top three as measured] — the self-match is the one that must vanish. */
  const cases: Array<[string, string[]]> = [
    ["All Access Locksmith Middlesbrough Door & Window Repair",
      ["Gavin The Locksmith", "All Access Locksmith Middlesbrough Door & Window Repair", "Appleyard Locksmiths"]],
    ["Appleyard Locksmiths",
      ["Gavin The Locksmith", "All Access Locksmith Middlesbrough Door & Window Repair", "Appleyard Locksmiths"]],
    ["Moore Secure Locksmiths",
      ["A&Y Locksmiths", "Moore Secure Locksmiths", "ASJ Locksmiths Borehamwood"]],
    ["Strongs Locksmiths Services",
      ["Bradleys Master Locksmiths Ltd", "Strongs Locksmiths Services", "LockRite Locksmiths (Blyth)"]],
    ["Norwich Plumber",
      ["24/7 Emergency Plumbers Norwich", "Loader Plumbing Heating and Gas", "Express Heat - Emergency Plumber - Norwich"]],
    ["MW Plumbing (Norwich) Ltd",
      ["Royal Flush Plumbing", "Norwich Plumber", "TSM Plumbing"]],
  ];
  for (const [biz, top] of cases) {
    const out = excludeSelfRivals(top, biz, nameMatches);
    const leaked = out.filter((n) => nameMatches(n, biz) || nameMatches(biz, n));
    ok(leaked.length === 0, `"${biz}" no longer appears in its own rivals${leaked.length ? ` — LEAKED ${leaked.join(", ")}` : ""}`);
    ok(out.length < top.length, `  and something was actually removed (${top.length} → ${out.length})`);
  }
}

console.log("\n── ⛔ REAL RIVALS ARE NOT TOUCHED ──");
{
  const biz = "Moore Secure Locksmiths";
  const out = excludeSelfRivals(["A&Y Locksmiths", "Moore Secure Locksmiths", "ASJ Locksmiths Borehamwood"], biz, nameMatches);
  ok(out.includes("A&Y Locksmiths") && out.includes("ASJ Locksmiths Borehamwood"),
     `the two genuine competitors survive (${out.join(", ")})`);
  ok(out.length === 2, "exactly one name was dropped, not the trade word it shares with them");
}

console.log("\n── ⛔ IT NEVER TOPS UP, AND THE FALLBACK TAKES OVER ──");
{
  /* Removing a self-match can leave two. The correct answer is video_template, never a fourth
     name reached for from further down a ranked list. */
  const biz = "Appleyard Locksmiths";
  const pool = ["Gavin The Locksmith", "Appleyard Locksmiths", "Keytek Locksmiths"];
  const rivals = usableRivals(excludeSelfRivals(pool, biz, nameMatches));
  ok(rivals.length === 2, `two real names remain, not padded back to three (${rivals.length})`);
  /* ⚠️ THIS BLOCK WENT RED ON 2026-09-16 AND THAT WAS THE TRIPWIRE WORKING. It asserted that
     audit_followup FALLS BACK to video_template on two names. It no longer does: audit_followup is
     a CONTINUATION, video_template is a cold opener, and the phone-history seatbelt runs before the
     substitution — so the old behaviour posted a cold "is this the right number" into a thread the
     prospect had already answered. The rule is now the template's PROPERTY (src/lib/rivalHook.ts),
     so the two cases are asserted separately here rather than one standing in for the other. */
  const held = rivalHookDecision("audit_followup", true, rivals.length);
  ok(held.held && !held.fellBack && held.template === "audit_followup",
     "a CONTINUATION holds on two names — nothing is sent and the template is unchanged");
  ok(/no cold template to send instead/.test(held.reason), "  and the reason says why there is no substitute");
  const cold = rivalHookDecision("competitor_hook", true, rivals.length);
  ok(cold.fellBack && !cold.held && cold.template === "video_template",
     `a COLD hook still falls back to ${cold.template} rather than naming two`);
  const full = rivalHookDecision("audit_followup", true, RIVALS_REQUIRED);
  ok(!full.fellBack && !full.held && full.template === "audit_followup", "with three, audit_followup sends as itself");
}

console.log("\n── ⛔ ABSENCE IS NEVER A LICENCE TO STRIP THE LIST ──");
{
  const pool = ["A&Y Locksmiths", "Keytek", "LockRite"];
  for (const b of [null, undefined, "", "   "]) {
    const out = excludeSelfRivals(pool, b as string | null | undefined, nameMatches);
    ok(out.length === 3, `business name ${JSON.stringify(b)} → nothing filtered (no name, no evidence)`);
  }
  ok(excludeSelfRivals(null, "X", nameMatches).length === 0, "a null pool → empty, no throw");
  ok(excludeSelfRivals([null, undefined, "  ", "Real Ltd"], "X", nameMatches).join("") === "Real Ltd",
     "blanks are dropped from the pool as before");
  ok(!isSelfRival("", "Moore Secure Locksmiths", nameMatches), "an empty candidate is not a self-match");
  ok(!isSelfRival("A&Y Locksmiths", "", nameMatches), "an empty business is not matched by anything");
}

console.log("\n── ⚠️ BOTH DIRECTIONS, because a listing and a mention are not written alike ──");
{
  ok(isSelfRival("Norwich Plumber", "Norwich Plumbing Services", nameMatches)
     || isSelfRival("Norwich Plumbing Services", "Norwich Plumber", nameMatches),
     "the same operator written two ways is caught in whichever direction matches");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
