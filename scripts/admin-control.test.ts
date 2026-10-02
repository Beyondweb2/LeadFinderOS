/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN CONTROL CENTRE'S RULES (2026-10-02, src/lib/adminControl.ts, docs/dashboards-redesign.md).
   One client, one home: New sales & handoffs owns pre-delivery + recently sold clients; What needs you
   owns Paul's actions everywhere else and points at the handoff section with ONE line. The server's
   "Start the baseline" / "re-measure overdue" items are replaced by the canonical delivery next step.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { activityStatus, handoffClients, handoffNext, needsYouItems, NEW_SALE_DAYS, HANDOFF_CHASE_DAYS, type HandoffClient } from "../src/lib/adminControl.ts";
import type { AttentionItem } from "../src/lib/adminMetrics.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const NOW = Date.parse("2026-10-10T12:00:00Z");
const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);
const client = (id: string, stage: string, state: string, paidDaysAgo: number | null, action: boolean, label = "Next"): HandoffClient => ({
  id, business_name: id, payment_date: paidDaysAgo === null ? null : day(paidDaysAgo), amount_paid: 99, sold_by_name: "Finn",
  handoff: { stage, stage_label: stage, state, state_label: state, done: 5, total: 9, missing: ["Logo"], next: { label, action, section: "setup" } },
});
const att = (kind: string, group: AttentionItem["group"] = "today"): AttentionItem => ({ key: kind, group, kind, leadId: "x", business: kind, why: "", owner: null, sinceIso: null, state: "", action: "", open: "lead" });

console.log("── where each client lives ──");
const ready = client("ready", "ready", "ready", 1, true, "Run Discovery");
const waitingClient = client("waitClient", "setup", "waiting_client", 3, false);
const lateHandoff = client("lateHandoff", "setup", "waiting_sales", HANDOFF_CHASE_DAYS + 1, false);
const freshHandoff = client("freshHandoff", "setup", "waiting_sales", 0, false);
const newBuild = client("newBuild", "build", "in_delivery", 5, true, "Build website");
const oldBuild = client("oldBuild", "build", "in_delivery", NEW_SALE_DAYS + 10, true, "Optimise their site");
const oldWaiting = client("oldWaiting", "remeasure", "in_delivery", NEW_SALE_DAYS + 30, false);
const refunded = client("refunded", "ended", "ended", 2, false);
const all = [ready, waitingClient, lateHandoff, freshHandoff, newBuild, oldBuild, oldWaiting, refunded];
const h = handoffClients(all, NOW).map((c) => c.id);
ok(["ready", "waitClient", "lateHandoff", "freshHandoff", "newBuild"].every((id) => h.includes(id)), "handoffs: every pre-delivery client, plus anything sold in the last two weeks");
ok(!h.includes("oldBuild") && !h.includes("oldWaiting") && !h.includes("refunded"), "…never an older in-delivery client or an ended one");
ok(h.indexOf("ready") < h.indexOf("waitClient") && h.indexOf("lateHandoff") < h.indexOf("waitClient"), "Paul's own next steps sort first");
ok(handoffNext(lateHandoff, NOW).mine && /Chase Finn/.test(handoffNext(lateHandoff, NOW).label), "a handoff left too long becomes Paul's: chase the seller");
ok(!handoffNext(freshHandoff, NOW).mine, "a handoff paid today is still the seller's to finish");

console.log("\n── what needs you ──");
const items = needsYouItems([att("setup_not_started", "urgent"), att("remeasure_overdue"), att("payment_failed", "urgent"), att("quote_quiet")], all, NOW);
const kinds = items.map((i) => i.kind);
ok(!kinds.includes("setup_not_started") && !kinds.includes("remeasure_overdue"), "the server's 'Start the baseline' / 're-measure overdue' items are replaced by the canonical next step");
ok(kinds.filter((k) => k === "handoffs_ready").length === 1 && /3 new clients need you/.test(items.find((i) => i.kind === "handoffs_ready")!.business), "ONE pointer line for the handoff section (Run Discovery, the late handoff, the new build — never a line per client)");
ok(items.some((i) => i.kind === "client_next" && i.leadId === "oldBuild") && !items.some((i) => i.kind === "client_next" && (i.leadId === "newBuild" || i.leadId === "ready")), "in-delivery steps that are Paul's show — but only for clients NOT already under New sales & handoffs");
ok(!items.some((i) => i.leadId === "oldWaiting"), "a client waiting on someone else is not a task for Paul");
ok(kinds[0] === "payment_failed", "urgent first");
ok(kinds.includes("quote_quiet"), "the server's other items stay (payments, replies, quotes, sign-ups)");
ok(needsYouItems([], [refunded], NOW).length === 0, "an ended client never needs Paul");

console.log("\n── who is active ──");
ok(activityStatus(new Date(NOW - 3_600_000).toISOString(), NOW) === "active", "active within a day");
ok(activityStatus(new Date(NOW - 48 * 3_600_000).toISOString(), NOW) === "quiet", "quiet within three days");
ok(activityStatus(new Date(NOW - 5 * 86_400_000).toISOString(), NOW) === "inactive" && activityStatus(null, NOW) === "inactive", "inactive after that, or with nothing recorded");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
