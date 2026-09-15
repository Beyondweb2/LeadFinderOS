/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "NAMED" COMES FROM THE MODEL NOW, AND ABSENCE FALLS BACK RATHER THAN SCORING ZERO.

   🔴 THE FAULT: `named` was nameMatches(answer_text, businessName) — a string test against the raw
   answer — so a business whose name is its own trade and town scored on answers that had never
   heard of it. 147 of 1,099 lead-linked audits (13%) carry such a name, and it broke both ways:
   "Burnley Locksmiths" was told AI names it 6 of 6, "CJ Plumbing Services" that AI never names it.

   ⛔ THE THREE PROPERTIES THIS PINS, each of which would be a silent disaster on its own:
     1. A model verdict WINS over the string match — including a model `false` over a string `true`,
        which is the entire correction.
     2. NO verdict falls back to the string match. Reading absence as "not named" would zero the
        whole book in one deploy, two paying clients' frozen baselines included.
     3. A COMPARISON uses ONE ruler on both sides. A model-read replay against a string-matched
        baseline is not a before-and-after, and that number decides a refund.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  cellNamed, namedEvidence, hasModelNamedEvidence, namedInMode, allCellsModelRead,
} from "../src/lib/namedSignal.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── 1. THE MODEL WINS, IN BOTH DIRECTIONS ─────────────────────────────────────────────────────── */
ok(cellNamed({ named: true, self_named: false }) === false,
   "model FALSE beats string TRUE  (Burnley Locksmiths: 6 of 6 -> what AI actually said)");
ok(cellNamed({ named: false, self_named: true }) === true,
   "model TRUE beats string FALSE  (CJ Plumbing Services: 'never named' -> named)");
ok(cellNamed({ named: true, self_named: true }) === true, "both agree, named");
ok(cellNamed({ named: false, self_named: false }) === false, "both agree, not named");

/* ── 2. ABSENCE FALLS BACK. NEVER ZERO. ────────────────────────────────────────────────────────── */
ok(cellNamed({ named: true }) === true, "no model verdict -> the stored string match still counts");
ok(cellNamed({ named: false }) === false, "no model verdict, string says no");
for (const bad of [null, undefined, "true", 1, {}, { self_named: "true" }, { self_named: null }, { self_named: 1 }]) {
  const expect = false;
  ok(cellNamed(bad as never) === expect, `junk cell ${JSON.stringify(bad)} -> not named, never a throw`);
}
ok(cellNamed({ named: true, self_named: "false" } as never) === true,
   "a NON-BOOLEAN self_named is not a verdict — it falls back, it does not read as false");

/* ── 3. THE EVIDENCE LABEL ─────────────────────────────────────────────────────────────────────── */
ok(namedEvidence({ named: true, self_named: false }) === 'model', "a boolean self_named is model evidence");
ok(namedEvidence({ named: true }) === 'string_match', "no self_named is string evidence");
ok(namedEvidence(null) === 'none', "no cell at all is no evidence");
ok(hasModelNamedEvidence({ self_named: false }) === true,
   "a model FALSE is still EVIDENCE — the presence of the verdict, not its value");

/* ── 4. ONE RULER FOR A COMPARISON ─────────────────────────────────────────────────────────────── */
ok(namedInMode({ named: true, self_named: false }, 'legacy') === true,
   "legacy mode ignores the model verdict entirely");
ok(namedInMode({ named: true, self_named: false }, 'auto') === false, "auto mode uses it");
ok(namedInMode({ named: false, self_named: true }, 'legacy') === false, "legacy mode, string says no");

const modelRead = [{ named: true, self_named: true }, { named: false, self_named: false }];
const mixed = [{ named: true, self_named: true }, { named: true }];
const legacyOnly = [{ named: true }, { named: false }];
ok(allCellsModelRead(modelRead) === true, "a fully model-read side qualifies");
ok(allCellsModelRead(mixed) === false, "ONE unread cell drops the whole side to legacy");
ok(allCellsModelRead(legacyOnly) === false, "a legacy side does not qualify");
ok(allCellsModelRead([]) === false, "an EMPTY side does not qualify — nothing read is not 'all read'");
ok(allCellsModelRead([null, undefined] as never) === false, "absent cells do not qualify either");

/* ⛔ THE PROPERTY THE REFUND TURNS ON, stated as the test rather than left to the call site:
   a model-read AFTER may only be scored with the model if the BEFORE was read too. */
const decide = (before: unknown[], after: unknown[]) =>
  (allCellsModelRead(before as never) && allCellsModelRead(after as never)) ? 'auto' : 'legacy';
ok(decide(legacyOnly, modelRead) === 'legacy',
   "string-matched baseline + model-read replay -> BOTH stay legacy (the ruler cannot change mid-comparison)");
ok(decide(modelRead, legacyOnly) === 'legacy', "and the same the other way round");
ok(decide(modelRead, modelRead) === 'auto', "both read by the model -> the model is used for both");

console.log(f === 0 ? "\nnamed-signal: OK" : `\n${f} FAILURES`);
process.exit(f ? 1 : 0);
