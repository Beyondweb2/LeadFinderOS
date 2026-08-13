/* ============================================================
   NO TEMPLATE PARAMETER MAY CARRY WHITESPACE META REJECTS.

   ⛔ WHAT THIS COST. Four audit_reply sends were rejected outright on 2026-08-12:
       (#132018) Param text cannot have new-line/tab characters or more than 4 consecutive spaces
   The whole message dies — nothing is delivered, and in every case the lead had JUST REPLIED and
   heard nothing back. The offending value was one competitor name, "Checkatrade\n    \n    If",
   an extraction fragment carrying two newlines and eight spaces. `.trim()` cannot catch it, because
   the whitespace is INTERNAL.

   ⛔ AND A REPORT COSMETIC MADE IT WORSE. For one day the group label preferred the most-mentioned
   MULTI-WORD spelling, which is exactly the shape a fragment has — so the dirty name started
   beating clean "Checkatrade" for a label that is not only printed but becomes {{2}}. Measured over
   60 audits: 0 rejected before, 8 after. Reverted 2026-08-13. The lesson is in auditReport.ts:
   check who else consumes a list before changing what it contains.

   These drive the REAL exported functions.
   ============================================================ */
import { formatCompetitors } from "../supabase/functions/_shared/audit-reply.ts";
import { templateBodyParams, claimTemplatePayload } from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** Meta's rule, verbatim: no newline, no tab, no run of 4+ spaces. */
const metaRejects = (s: string) => /[\n\r\t]/.test(s) || / {4,}/.test(s);

/* The real value that killed four sends, plus the other shapes of the same fault. */
const OFFENDERS = [
  "Checkatrade\n    \n    If",
  "Locks4less\nLocksmiths",
  "A & A\tSureguard",
  "Spaced     Out Locks",
  "trailing newline\n",
  "\n\nleading newlines",
];

console.log("── ⛔ THE OFFENDERS ARE GENUINELY REJECTABLE (the test would be worthless otherwise) ──");
for (const o of OFFENDERS) ok(metaRejects(o), `raw ${JSON.stringify(o)} would be rejected by Meta`);

console.log("\n── ⛔ formatCompetitors COLLAPSES THEM ──");
for (const o of OFFENDERS) {
  const out = formatCompetitors([o]);
  ok(!metaRejects(out), `${JSON.stringify(o)} -> ${JSON.stringify(out)}`);
}
{
  const out = formatCompetitors(OFFENDERS.slice(0, 3));
  ok(!metaRejects(out), `a whole list collapses: ${JSON.stringify(out)}`);
  /* COLLAPSE, NOT DROP — the competitor is still named. Losing it would lose the finding. */
  ok(out.includes("Checkatrade"), "  and the name is KEPT, not dropped — collapsing preserves the fact");
}

console.log("\n── THE READABLE LIST STILL READS PROPERLY ──");
ok(formatCompetitors(["A"]) === "A", "one name");
ok(formatCompetitors(["A", "B"]) === "A and B", "two names");
ok(formatCompetitors(["A", "B", "C"]) === "A, B and C", "three names");
ok(formatCompetitors(["A", "B", "C", "D"]) === "A, B and C", "capped at three");
ok(formatCompetitors([]) === "", "empty list -> empty string (caller refuses to send)");
ok(formatCompetitors(["   ", "\n"]) === "", "whitespace-only names vanish rather than sending blanks");

console.log("\n── ⛔ AND EVERY OTHER TEMPLATE VARIABLE IS COVERED TOO ──");
/* formatCompetitors guards ONE variable of ONE template. templateBodyParams is where every
   variable of every template is resolved, so the same collapse there is what makes the guarantee
   general rather than specific. */
{
  const comps = templateBodyParams(["name", "url"], "Baddow\nLocksmiths\tLtd", "https://findable.live/report/x   \n y");
  const texts = (comps[0].parameters as Array<{ text: string }>).map((p) => p.text);
  texts.forEach((t, i) => ok(!metaRejects(t), `param {{${i + 1}}} is clean: ${JSON.stringify(t)}`));
}
{
  /* Through the real payload builder, the way a live send does it. */
  const payload = claimTemplatePayload("audit_reply", "en", "Biz\nName", "https://x/y", {
    trade: "Locksmiths\n", competitors: "Checkatrade\n    \n    If", onboardingUrl: "https://x/o",
  }) as { template: { components: Array<{ parameters: Array<{ text: string }> }> } };
  const texts = payload.template.components[0].parameters.map((p) => p.text);
  console.log(`   audit_reply params: ${JSON.stringify(texts)}`);
  ok(texts.every((t) => !metaRejects(t)), "no audit_reply parameter can be rejected by Meta");
  ok(texts.length === 4, "  and it still sends exactly 4 params (a count mismatch is #132000)");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
