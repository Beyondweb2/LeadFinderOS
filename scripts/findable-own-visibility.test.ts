/* FINDABLE'S OWN AI VISIBILITY SET — frozen v1 stays frozen, and branded questions are never scored.
   The fingerprint below is of the exact approved wording (2026-10-02). If this fails because a
   question was edited, that edit is a NEW VERSION with its own baseline, not a fix to v1. */
import { createHash } from 'node:crypto';
import {
  OWN_VISIBILITY_SET_VERSION, OWN_VISIBILITY_SCORED_QUESTIONS, OWN_VISIBILITY_BRANDED_DIAGNOSTICS,
  OWN_VISIBILITY_ENGINES, OWN_VISIBILITY_RUNS, ownVisibilityRunCostUsd,
} from '../src/lib/findableOwnVisibility.ts';
import { RE_AUDIT_EST_USD_PER_QUESTION } from '../src/lib/reAudit.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const V1_FINGERPRINT = 'a639d19eb463c0ed';
const fp = createHash('sha256').update(OWN_VISIBILITY_SCORED_QUESTIONS.join('\n')).digest('hex').slice(0, 16);

ok(OWN_VISIBILITY_SET_VERSION === 'v1', 'the set is v1');
ok(OWN_VISIBILITY_SCORED_QUESTIONS.length === 12, 'exactly 12 neutral questions');
ok(OWN_VISIBILITY_BRANDED_DIAGNOSTICS.length === 2, 'exactly 2 branded diagnostics');
ok(fp === V1_FINGERPRINT, `the 12 neutral questions are byte-identical to the approved v1 (fingerprint ${fp})`);
ok(OWN_VISIBILITY_SCORED_QUESTIONS.every((q) => !/findable/i.test(q)), 'no neutral question mentions Findable');
ok(OWN_VISIBILITY_BRANDED_DIAGNOSTICS.every((q) => /findable\.live/i.test(q)), 'every branded diagnostic names findable.live (disambiguated)');
ok(OWN_VISIBILITY_BRANDED_DIAGNOSTICS.every((q) => !(OWN_VISIBILITY_SCORED_QUESTIONS as readonly string[]).includes(q)), 'branded diagnostics are NOT in the scored list');
ok(new Set(OWN_VISIBILITY_SCORED_QUESTIONS.map((q) => q.toLowerCase())).size === 12, 'no duplicate neutral question');
ok(JSON.stringify(OWN_VISIBILITY_ENGINES) === '["chatgpt","gemini"]', 'scored engines are ChatGPT and Gemini');
ok(OWN_VISIBILITY_RUNS === 3, 'three runs per question');
const cost = ownVisibilityRunCostUsd(RE_AUDIT_EST_USD_PER_QUESTION);
ok(cost === Math.round(36 * RE_AUDIT_EST_USD_PER_QUESTION * 10_000) / 10_000, `one scored measurement = 12 × 3 asks = $${cost.toFixed(3)} at the forecast rate`);

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
