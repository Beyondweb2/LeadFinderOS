/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QA PAYMENT SIMULATION — the pre-sales certification's "the client paid £99" (2026-10-04,
   docs/pre-sales-certification/README.md §Payment). NOT run by `npm test`.

   It sends stripe-webhook ONE unsigned checkout.session.completed for a QA fixture lead, with the
   CRON_SECRET in x-qa-simulate-payment. The webhook re-checks everything (src/lib/qaSafety.ts) and
   then runs the SAME branch a real payment runs. No money moves, no Stripe call is made (the session has
   no customer), and every message lands on Paul (the lead's phone is absent or 07700 900xxx; its
   emails are internal).

   Usage (PowerShell or bash, from the repo root):
     SUPABASE_MGMT_TOKEN_FILE=<path to a file holding the Management API token> \
       npx tsx scripts/qa-simulate-payment.ts --lead <uuid> [--onboarding <uuid>] [--times 2] [--check]
     --times 2   delivers the IDENTICAL event twice (the idempotency proof)
     --check     sends nothing; prints the pre-checks and the read-back only
   The event ids are derived from the onboarding id, so a later run with the same row replays the same
   event. The CRON_SECRET is read from the vault and never printed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { FINDABLE_SETUP_PRICE_GBP, serviceRouteFromRow, totalPaymentsFor } from "../src/lib/findableOffer.ts";
import { isReservedTestNumber, qaPaymentEventShapeRefusal } from "../src/lib/qaSafety.ts";

const REF = "ruusxpkkmwtljxxulhbq";
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const leadId = arg("--lead");
const times = Math.max(1, Math.min(3, Number(arg("--times") ?? 1)));
const checkOnly = args.includes("--check");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!leadId || !UUID.test(leadId)) { console.error("--lead <uuid> is required"); process.exit(2); }
const tokenFile = process.env.SUPABASE_MGMT_TOKEN_FILE;
if (!tokenFile) { console.error("SUPABASE_MGMT_TOKEN_FILE is required (a file holding the Management API token)"); process.exit(2); }
const token = readFileSync(tokenFile, "utf8").trim();

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t) as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function readBack(id: string) {
  const [lead] = await sql(`select business_name, status, amount_paid, payment_date, sold_by_user_id, assigned_to_user_id, is_archived, contract_total_payments from outreach_leads where id = ${lit(id)}`);
  const ledger = await sql(`select kind, amount_gbp, stripe_object_id, sold_by_user_id, commission_rule, commission_rate from payment_ledger where lead_id = ${lit(id)} order by created_at`);
  const counts = await sql(`select
    (select count(*) from lead_activity where lead_id = ${lit(id)} and kind = 'payment_received') as history_payment_received,
    (select count(*) from quick_close_events where lead_id = ${lit(id)} and kind = 'paid') as quick_close_paid,
    (select count(*) from notifications where lead_id = ${lit(id)}) as notifications,
    (select count(*) from client_agreement_acceptances where lead_id = ${lit(id)}) as agreement_acceptances,
    (select count(*) from whatsapp_messages where lead_id = ${lit(id)} and direction = 'outbound' and test_mode is not true) as real_outbound_whatsapp,
    (select count(*) from whatsapp_messages where lead_id = ${lit(id)} and direction = 'outbound' and test_mode = true) as simulated_outbound_whatsapp`);
  console.log("\nREAD-BACK");
  console.log(" lead     ", JSON.stringify(lead));
  console.log(" ledger   ", JSON.stringify(ledger));
  console.log(" counts   ", JSON.stringify(counts[0]));
}

const [lead] = await sql<{ id: string; business_name: string; phone: string | null; email: string | null; excluded: boolean }>(
  `select id, business_name, phone, email, exists (select 1 from metric_exclusions e where e.kind = 'lead' and e.value = l.id::text) as excluded from outreach_leads l where id = ${lit(leadId)}`);
if (!lead) { console.error("no such lead"); process.exit(1); }
console.log(`lead: ${lead.business_name} (${lead.id})`);
const problems: string[] = [];
if (!lead.excluded) problems.push("the lead has no metric_exclusions row — add it BEFORE the payment (the commission stamp is never redone)");
if (lead.phone && !isReservedTestNumber(lead.phone)) problems.push("the lead's phone is not a 07700 900xxx number");
if (lead.email && !/@move37\.fun$/i.test(lead.email)) problems.push("the lead's email is not paul@move37.fun");

const onbArg = arg("--onboarding");
const onbs = await sql<{ id: string; status: string | null; plan_tier: string | null; website_addon: boolean | null; contact_email: string | null; created_at: string }>(
  `select id, status, plan_tier, website_addon, contact_email, created_at from onboarding_responses where lead_id = ${lit(leadId)} order by created_at desc`);
const onb = onbArg ? onbs.find((o) => o.id === onbArg) : onbs[0];
if (!onb) problems.push("no onboarding row for this lead — run Quick Close to the payment-link step first");
for (const o of onbs) if (o.contact_email && !/@move37\.fun$/i.test(o.contact_email)) problems.push(`onboarding ${o.id} has a non-internal contact email`);
const route = onb ? serviceRouteFromRow(onb) : null;
if (onb && !route) problems.push(`onboarding ${onb.id} has no Build/Optimise route (plan_tier=${onb.plan_tier ?? "null"}) — choose one in Quick Close first`);
if (problems.length) { console.error("REFUSED (local pre-check):\n - " + problems.join("\n - ")); if (onb === undefined || !checkOnly) { await readBack(leadId); process.exit(1); } }

if (checkOnly || !onb || !route) { await readBack(leadId); process.exit(0); }

const tag = onb.id.replace(/-/g, "").slice(0, 16);
const event = {
  id: `evt_qa_${tag}`, object: "event", type: "checkout.session.completed", livemode: false, created: Math.floor(Date.now() / 1000),
  data: { object: {
    id: `cs_qa_${tag}`, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid",
    amount_total: FINDABLE_SETUP_PRICE_GBP * 100, currency: "gbp", customer: null, payment_intent: `pi_qa_${tag}`,
    consent: { terms_of_service: "accepted" },
    customer_details: { email: "paul@move37.fun", name: "QA certification" },
    metadata: { onboarding_id: onb.id, lead_id: leadId, service_route: route, total_payments: String(totalPaymentsFor(route)) },
  } },
};
const shape = qaPaymentEventShapeRefusal(event);
if (shape) { console.error("REFUSED (shape):", shape); process.exit(1); }

const [{ secret }] = await sql<{ secret: string }>(`select decrypted_secret as secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1`);
for (let i = 1; i <= times; i++) {
  const r = await fetch(`https://${REF}.supabase.co/functions/v1/stripe-webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-qa-simulate-payment": secret }, body: JSON.stringify(event),
  });
  console.log(`delivery ${i}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
await readBack(leadId);
