/* QA safety (2026-10-04, pre-sales certification — docs/pre-sales-certification/README.md).
 *
 * What this file holds:
 *   · the reserved test number is ONLY Ofcom's UK drama range, never a bare ten digits (+91 77009 00xxx
 *     is a real Indian mobile range);
 *   · the three outcomes: a QA fixture SIMULATES, a real lead held/pressed by a test account REFUSES,
 *     everything else is LIVE — and a fixture held by a test account still simulates;
 *   · the payment simulation refuses every shape that could touch money or a real person;
 *   · THE SWEEP: every edge file that can reach Meta's /messages asks the QA guard, so a new sender
 *     cannot forget it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { buildExclusions } from "../src/lib/metricExclusions.ts";
import {
  isReservedTestNumber, qaSendVerdict, qaPaymentEventShapeRefusal, qaPaymentFactsRefusal, type QaPaymentFacts,
} from "../src/lib/qaSafety.ts";

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  PASS ${m}`); else { f++; console.log(`  FAIL ${m}`); } };

console.log("── reserved test numbers ──");
for (const n of ["07700 900123", "+44 7700 900123", "447700900123", "00447700900999", "07700900000", "+44 (0)7700 900 555".replace("(0)", "")]) ok(isReservedTestNumber(n), `reserved: ${n}`);
for (const n of ["07700 901000", "+91 77009 00123", "917700900123", "7700900123", "07700 9001234", "07911 123456", "", null, undefined]) ok(!isReservedTestNumber(n as string), `not reserved: ${String(n)}`);

console.log("── send verdicts ──");
const TEST_USER = "262c1d64-05ad-42e8-a81b-7d25553aeff3";
const FIXTURE = "10900000-0000-4000-8000-0000000009a1";
const ex = buildExclusions([
  { kind: "user", value: TEST_USER, reason: "Test" },
  { kind: "lead", value: FIXTURE, reason: "QA fixture" },
  { kind: "phone", value: "+44 7400 123456", reason: "QA phone" },
]);
ok(qaSendVerdict(ex, { leadId: "real", phones: ["07911 123456"] }).kind === "live", "a real lead on a real number is live");
ok(qaSendVerdict(ex, { leadId: "real", phones: ["07911 123456", "447700900123"] }).kind === "simulate", "any reserved number simulates");
ok(qaSendVerdict(ex, { leadId: FIXTURE, phones: [null] }).kind === "simulate", "a fixture lead simulates");
ok(qaSendVerdict(ex, { leadId: "real", phones: ["07400 123456"] }).kind === "simulate", "an excluded phone simulates");
const held = qaSendVerdict(ex, { leadId: "real", phones: ["07911 123456"], holderUserId: TEST_USER });
ok(held.kind === "refuse" && held.reason === "test_account_lead", "a REAL lead held by a test account is REFUSED, not simulated");
const pressed = qaSendVerdict(ex, { leadId: "real", phones: ["07911 123456"], actorUserId: TEST_USER });
ok(pressed.kind === "refuse" && pressed.reason === "test_account_actor", "a send pressed by a test account on a real lead is refused");
ok(qaSendVerdict(ex, { leadId: FIXTURE, phones: ["07700 900111"], holderUserId: TEST_USER, actorUserId: TEST_USER }).kind === "simulate", "a fixture held and pressed by the Test account simulates (the QA journey)");
ok(qaSendVerdict(ex, { leadId: "real", phones: ["07911 123456"], holderUserId: null, actorUserId: null }).kind === "live", "automation on an unassigned real lead is live");
ok(qaSendVerdict(buildExclusions([]), { leadId: "x", phones: ["07911 123456"], holderUserId: TEST_USER }).kind === "live", "no exclusion rows → nothing is guessed from an id");

console.log("── payment simulation: event shape ──");
const good = () => ({
  id: "evt_qa_1", type: "checkout.session.completed", livemode: false,
  data: { object: { id: "cs_live_x", status: "complete", customer: null, payment_intent: "pi_qa_1", amount_total: 9900,
    customer_details: { email: "paul@move37.fun" }, metadata: { lead_id: FIXTURE, onboarding_id: "o1" } } },
});
ok(qaPaymentEventShapeRefusal(good()) === null, "a well-formed QA event passes the shape check");
const bad: Array<[string, (e: ReturnType<typeof good>) => unknown]> = [
  ["livemode true", (e) => { (e as { livemode: boolean }).livemode = true; return e; }],
  ["a non-QA event id", (e) => { e.id = "evt_1"; return e; }],
  ["another event type", (e) => { e.type = "invoice.paid"; return e; }],
  ["a customer (would create a real subscription)", (e) => { (e.data.object as { customer: unknown }).customer = "cus_123"; return e; }],
  ["a real payment intent id", (e) => { e.data.object.payment_intent = "pi_123"; return e; }],
  ["an incomplete session", (e) => { e.data.object.status = "open"; return e; }],
  ["no lead id", (e) => { (e.data.object.metadata as { lead_id?: string }).lead_id = ""; return e; }],
  ["not an object", () => "nope"],
];
for (const [what, mut] of bad) ok(qaPaymentEventShapeRefusal(mut(good())) !== null, `refused: ${what}`);

console.log("── payment simulation: facts ──");
const facts = (o: Partial<QaPaymentFacts> = {}): QaPaymentFacts => ({
  leadFound: true, leadExcluded: true, leadPhone: null, leadEmail: "paul@move37.fun", leadEmailInternal: true,
  payerEmailInternal: true, onboardingLeadId: FIXTURE, onboardingEmailsInternal: true, ...o,
});
ok(qaPaymentFactsRefusal(FIXTURE, facts()) === null, "a QA fixture with internal emails passes");
ok(qaPaymentFactsRefusal(FIXTURE, facts({ leadPhone: "07700 900123" })) === null, "a reserved phone passes");
for (const [what, o] of [
  ["a lead that is not a fixture", { leadExcluded: false }],
  ["a missing lead", { leadFound: false }],
  ["a real phone", { leadPhone: "07911 123456" }],
  ["a real lead email", { leadEmail: "owner@realbusiness.co.uk", leadEmailInternal: false }],
  ["a real payer email", { payerEmailInternal: false }],
  ["a real onboarding contact email", { onboardingEmailsInternal: false }],
  ["an onboarding row from another lead", { onboardingLeadId: "other" }],
] as Array<[string, Partial<QaPaymentFacts>]>) ok(qaPaymentFactsRefusal(FIXTURE, facts(o)) !== null, `refused: ${what}`);

console.log("── the sweep: every Meta /messages sender asks the QA guard ──");
const FN = path.resolve(import.meta.dirname, "../supabase/functions");
const files: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
walk(FN);
const senders = files.filter((p) => { const t = readFileSync(p, "utf8"); return /sendViaGraph\(/.test(t) || /graph\.facebook\.com\/\$\{[^}]+\}\/\$\{[^}]+\}\/messages/.test(t); })
  .filter((p) => !p.endsWith(path.join("_shared", "whatsapp-send.ts")));   // the definition itself
ok(senders.length >= 6, `found the senders (${senders.length})`);
for (const p of senders) {
  const t = readFileSync(p, "utf8");
  ok(/qaSendHold|qaSendVerdict/.test(t), `${path.relative(FN, p)} asks the QA guard`);
}
const queue = readFileSync(path.join(FN, "process-whatsapp-queue/index.ts"), "utf8");
ok(!/\n\s*if \(live\) \{/.test(queue), "the queue has no bare `if (live)` send branch left");
const webhook = readFileSync(path.join(FN, "stripe-webhook/index.ts"), "utf8");
ok(/if \(qaHeader\) \{[\s\S]{0,400}sameSecret\(qaHeader, cronSecret\)/.test(webhook), "the payment simulation requires the CRON_SECRET header first");
ok(/qaPaymentEventShapeRefusal\(parsed\)[\s\S]{0,1200}qaPaymentFactsRefusal\(/.test(webhook), "and checks shape then facts before running the branch");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
