/* ============================================================
   A LEAD PAUL MARKS PAID BY HAND IS A PAID CLIENT.

   ⛔ THE BUG (2026-09-23). The Paid Clients list was `amount_paid > 0` only. Setting a lead's
   status to "Paid" (`payment_received`) writes the status and nothing else, so a client who paid
   outside Stripe never reached the list, the hub, or Website Build (BS4 Electrical Services Ltd).

   ⚠️ AND REVENUE MUST NOT MOVE. isPaidLead (revenue) is still `amount_paid > 0`; membership of the
   fulfilment list is a different rule (src/lib/paidClient.ts). A hand-marked client is shown as
   'marked_paid', never given an amount, a date or a Stripe id.
   ============================================================ */
import { readFileSync } from "node:fs";
import { isPaidClient, paidClientSource, PAID_CLIENT_STATUSES, PAID_CLIENT_OR_FILTER } from "../src/lib/paidClient.ts";
import { isPaidLead } from "../src/lib/leadPayment.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── 1. MANUAL STATUS → PAID IS A PAID CLIENT ──");
for (const status of ["payment_received", "in_delivery", "completed"]) {
  const lead = { amount_paid: null, status };
  ok(isPaidClient(lead), `${status}, no amount -> on the list`);
  ok(paidClientSource(lead) === "marked_paid", `${status}, no amount -> source marked_paid`);
  ok(!isPaidLead(lead), `${status}, no amount -> still NOT revenue (isPaidLead false)`);
}

console.log("\n── 2. STRIPE / RECORDED-AMOUNT CLIENTS STILL APPEAR ──");
ok(isPaidClient({ amount_paid: 99, status: "payment_received" }), "£99 + payment_received");
ok(isPaidClient({ amount_paid: "49.99", status: "in_delivery" }), "numeric-string amount (PostgREST numeric)");
ok(isPaidClient({ amount_paid: 19.99, status: "replied" }), "amount with an unrelated status keeps its membership");
ok(paidClientSource({ amount_paid: 99, status: "payment_received" }) === "recorded", "recorded amount -> source recorded");
ok(isPaidClient({ amount_paid: 49.99, status: "refunded" }), "refunded WITH amount keeps the membership it always had");

console.log("\n── 6. NON-PAID STATUSES DO NOT ADD ANYONE ──");
for (const status of ["new", "initial_contact", "replied", "interested", "not_interested", "price_given", "paid", "refunded", "closed_lost", "", null, undefined]) {
  ok(!isPaidClient({ amount_paid: null, status: status as string | null }), `${JSON.stringify(status)}, no amount -> not on the list`);
}
ok(!isPaidClient({ amount_paid: 0, status: "replied" }), "explicit £0 + replied -> not on the list");
ok(!isPaidClient(null) && !isPaidClient(undefined), "absent row -> not on the list");
ok(paidClientSource({ amount_paid: null, status: "replied" }) === null, "non-member -> source null");

console.log("\n── THE DB PRE-FILTER NEVER DROPS A MEMBER ──");
/* Simulate the PostgREST .or() the hub sends; every row isPaidClient accepts must pass it. */
const m = PAID_CLIENT_OR_FILTER.match(/^amount_paid\.gt\.0,status\.in\.\(([^)]*)\)$/);
ok(!!m, `filter has the expected shape: ${PAID_CLIENT_OR_FILTER}`);
const inList = new Set((m?.[1] ?? "").split(","));
ok(PAID_CLIENT_STATUSES.every((s) => inList.has(s)) && inList.size === PAID_CLIENT_STATUSES.length, "filter statuses == PAID_CLIENT_STATUSES");
const passesDb = (r: { amount_paid: number | null; status: string | null }) => (r.amount_paid ?? 0) > 0 || (r.status != null && inList.has(r.status));
const sample = [null, 0, 19.99].flatMap((amount_paid) => ["payment_received", "in_delivery", "completed", "refunded", "replied", null].map((status) => ({ amount_paid, status })));
ok(sample.every((r) => !isPaidClient(r) || passesDb(r)), "every isPaidClient row passes the DB filter");

console.log("\n── 3/4/5. THE HUB LIST: ONE ROW PER LEAD, NO WRITES, FIELDS KEPT ──");
const hub = readFileSync("supabase/functions/paid-client-hub/index.ts", "utf8").replace(/\r\n/g, "\n");
const list = hub.slice(hub.indexOf('if (action === "list")'), hub.indexOf('if (action === "matches")'));
ok(list.length > 0, "found the list action");
ok(!/\.gt\("amount_paid"/.test(list), "list no longer filters on amount_paid alone");
ok(/\.or\(PAID_CLIENT_OR_FILTER\)/.test(list) && /\.filter\(isPaidClient\)/.test(list), "list uses PAID_CLIENT_OR_FILTER + isPaidClient");
ok((list.match(/service\.from\(/g) ?? []).length === 1 && /from\("outreach_leads"\)/.test(list), "reads outreach_leads only — one row per lead, no second client table to duplicate");
ok(!/\.(insert|update|upsert|delete)\(/.test(list), "list performs no writes (no fabricated payment data)");
ok(/\.\.\.l, payment_source/.test(list), "every lead field is passed through unchanged, payment_source added");
ok(/\.from\("\.\.\/\.\.\/\.\.\/src\/lib\/paidClient\.ts"\)|from "\.\.\/\.\.\/\.\.\/src\/lib\/paidClient\.ts"/.test(hub), "edge import is relative with .ts");
const leaf = readFileSync("src/lib/paidClient.ts", "utf8");
ok(!/from ['"]@\//.test(leaf) && /from '\.\/leadPayment\.ts'/.test(leaf), "paidClient.ts imports relatively with an explicit .ts (edge-safe)");

console.log("\n── 7. THE PAGE RE-READS ON OPEN ──");
const page = readFileSync("src/pages/PaidClients.tsx", "utf8").replace(/\r\n/g, "\n");
ok(/useEffect\(\(\) => \{ if \(!authLoading && user\?\.id\) void load\(\); \}/.test(page), "Paid Clients fetches fresh on every mount (no cross-page cache to go stale)");
ok(/payment_source === 'marked_paid' \? 'Marked paid · no amount recorded'/.test(page), "a hand-marked client is labelled as such, not as Stripe-paid");

console.log(f ? `\n${f} FAILURE(S)` : "\nALL PASS");
if (f) process.exit(1);
