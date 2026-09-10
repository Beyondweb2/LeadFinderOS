/* ============================================================
   A BACK BUTTON MUST NOT BE ABLE TO LOOP.

   🔴 THE INCIDENT, 2026-09-10. Paul: "back to ai audit page doesn't take back to ai audit page",
   then after the first fix, "each back button just loops around." Two faults, one after the other:

   1. BackLink rendered "Back to {label}" from router state, then ran
      `window.history.length > 1 ? navigate(-1) : navigate(target)` — so it ignored the
      destination and did a plain browser Back. The label was a promise the code never read.
   2. With that fixed, the fallback was still `navigate(-1)`, and THIS APP CONTAINS A CYCLE:
      /baseline has "Before and after" → /compare, and /compare has "← Baseline" → /baseline.
      Neither link passed router state, so the trail from AI Audit died at the first hop and
      Baseline's back link fell through to history — straight back to Compare. Forever.

   ⛔ THE TWO PROPERTIES THIS PINS, because nothing else can see either of them: a typecheck is
   perfectly happy with a <Link> that omits `state`, and a build cannot tell that two pages point
   at each other.

   ⚠️ It reads the SOURCE rather than importing, because what went wrong was a missing prop on a
   JSX element, which is not reachable from any exported value.
   ============================================================ */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ BackLink NEVER navigates backwards through history ──");
{
  const src = read("src/components/BackLink.tsx");
  /* `navigate(-1)` is the whole bug. With no state it returns you to the page you just came
     from, which is exactly the other half of a cycle. A fallback path cannot cycle. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!code.includes("navigate(-1)"), "no navigate(-1) outside comments");
  ok(!code.includes("window.history"), "does not branch on window.history (it counts the whole tab, including the sign-in redirect)");
  ok(/navigate\(\s*state\.from\s*\?\?\s*fallback\s*\)/.test(code), "navigates to state.from, else the fallback");
}

console.log("\n── ⛔ EVERY LINK INTO A BackLink PAGE CARRIES `state` ──");
/* /playbook/:id and /baseline/:auditId both render BackLink, so a link that arrives without
   state leaves the operator on a page whose back button can only guess. */
{
  const FILES = [
    "src/components/audit/AuditBookList.tsx",
    "src/components/audit/AuditPills.tsx",
    "src/components/LeadDeliveryCockpit.tsx",
    "src/components/LeadDetailDialog.tsx",
    "src/pages/AiAudit.tsx",
    "src/pages/CompareMeasurements.tsx",
    "src/pages/Baseline.tsx",
  ];
  /* Matches a <Link …> opening tag whose `to` targets one of the back-link pages. */
  const LINK = /<Link\b[^>]*?to=\{`\/(playbook|baseline)\/\$\{[^}]*\}`\}[^>]*?>/gs;
  let checked = 0;
  for (const file of FILES) {
    const src = read(file);
    for (const m of src.matchAll(LINK)) {
      checked++;
      const tag = m[0];
      ok(/\bstate=/.test(tag), `${file}: <Link to=/${m[1]}/…> carries state`);
    }
  }
  ok(checked >= 5, `found ${checked} links into a BackLink page (expected at least 5)`);
}

console.log("\n── 🔴 THE CYCLE ITSELF: Baseline ↔ Compare must both pass state through ──");
/* These two link at each other. If either drops the state the pair becomes a trap, which is
   precisely what happened. Asserted by name because the cycle is a property of THIS pair. */
{
  const baseline = read("src/pages/Baseline.tsx");
  const compare = read("src/pages/CompareMeasurements.tsx");

  const bToC = baseline.match(/<Link\b[^>]*?to=\{`\/compare\/\$\{[^}]*\}`\}[^>]*?>/s);
  ok(!!bToC, "Baseline links to Compare");
  ok(!!bToC && /\bstate=/.test(bToC[0]), "Baseline → Compare passes state");

  const cToB = compare.match(/<Link\b[^>]*?to=\{`\/baseline\/\$\{[^}]*\}`\}[^>]*?>/s);
  ok(!!cToB, "Compare links to Baseline");
  ok(!!cToB && /\bstate=/.test(cToB[0]), "Compare → Baseline passes state");

  /* Both must actually READ the state they forward, or they would pass undefined and the
     assertions above would pass while the trail still died. */
  for (const [name, src] of [["Baseline", baseline], ["Compare", compare]] as const) {
    ok(/useLocation\(\)\.state/.test(src), `${name} reads useLocation().state to forward it`);
  }
}

console.log("\n── ⚠️ LINKS OUT OF AN AUDIT CARRY THE RUN, so Back reopens it ──");
/* The results view is not its own URL — it is `step === 'results'` on /ai-audit — so a bare
   '/ai-audit' asks for the LIST and drops the operator at the top of 901 rows. */
{
  for (const file of ["src/components/audit/AuditBookList.tsx", "src/components/audit/AuditPills.tsx", "src/pages/AiAudit.tsx"]) {
    const src = read(file);
    const hasRunId = /from:\s*[^,\n]*\?runId=/.test(src);
    ok(hasRunId, `${file}: back state carries ?runId=`);
  }
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
