// commission-stripe-check — the daily check of Stripe against the commission ledger (Paul, 2026-11-03, docs/commission-owed.md).
//
// Internal only: CRON_SECRET + x-internal-job (invoke_commission_stripe_check(), daily, cron job commission-stripe-check-daily).
// Modes (body.mode):
//   · "dry_run" — reads only: what it would change, and what it could not.
//   · "run"     — applies the changes through recordLedger, the one ledger writer, and logs the run (commission_stripe_checks).
// The rules: src/lib/commissionReconcile.ts.
// ⛔ Stripe is only READ here. Nothing is charged, refunded or changed in Stripe.
// ⛔ Writes only the ledger. A payment with no paid lead is reported: only establishLeadPayment writes paid state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall } from "../_shared/access.ts";
import { recordLedger, stripeIdOf } from "../_shared/payment-ledger.ts";
import { paymentPlanFromMeta } from "../../../src/lib/paymentPlans.ts";
import {
  STRIPE_CHECK_WINDOW_DAYS, planReconcile, webhookProblems,
  type ChargePlacement, type LedgerFact, type NeedsYou, type StripeChargeFact, type StripeDisputeFact,
} from "../../../src/lib/commissionReconcile.ts";

/** Bumped with every change, so a deploy is proved by the live answer. */
const BUILD_ID = "commission-stripe-check-2026-11-03a";
const json = (body: unknown, status = 200) => new Response(JSON.stringify({ build: BUILD_ID, ...(body as object) }), { status, headers: { "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Service = any;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

async function stripeGet(path: string, params: Record<string, string | string[]> = {}): Promise<Obj> {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("stripe_not_configured");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x);
  /* The version is pinned: charge.invoice and invoice.subscription are read as they are in this version. */
  const r = await fetch(`https://api.stripe.com/v1/${path}?${qs}`, { headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" } });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${j?.error?.message ?? r.status}`);
  return j;
}
async function stripeList(path: string, params: Record<string, string | string[]>): Promise<Obj[]> {
  const out: Obj[] = [];
  let after: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await stripeGet(path, { limit: "100", ...params, ...(after ? { starting_after: after } : {}) });
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) return out;
    after = page.data[page.data.length - 1].id;
  }
  /* ⛔ A list cut short would read as "missed" rows and hide real ones: fail rather than check half of it. */
  throw new Error(`stripe ${path}: more than 5000 rows in the window`);
}
const isoOf = (sec: unknown) => new Date(Number(sec) * 1000).toISOString();
const moneyOf = (minor: unknown) => Number(minor ?? 0) / 100;

/** Every row of a table, in pages: PostgREST stops at 1,000 without saying so. */
async function allRows(service: Service, table: string, cols: string, build: (q: Obj) => Obj = (q) => q): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(service.from(table).select(cols)).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

async function buildPlan(service: Service) {
  const sinceSec = Math.floor(Date.now() / 1000) - STRIPE_CHECK_WINDOW_DAYS * 86_400;
  const sinceIso = isoOf(sinceSec);
  const since = String(sinceSec);
  const [charges, disputes, endpoints] = await Promise.all([
    stripeList("charges", { "created[gte]": since, "expand[]": ["data.refunds"] }),
    stripeList("disputes", { "created[gte]": since }),
    stripeList("webhook_endpoints", {}),
  ]);
  const [ledgerRows, paidLeads, holds, linePayments] = await Promise.all([
    allRows(service, "payment_ledger", "id, kind, status, amount_gbp, lead_id, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id, stripe_customer_id, payout_rule, sale_plan, sale_plan_flag, commission_rule"),
    allRows(service, "outreach_leads", "id, stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id", (q) => q.gt("amount_paid", 0)),
    allRows(service, "client_payment_holds", "id, payment_intent_id", (q) => q.is("resolved_at", null)),
    allRows(service, "commission_line_payments", "id, line_key", (q) => q.is("undone_at", null)),
  ]);
  const ledger = ledgerRows.map((r) => ({ ...r, amount_gbp: Number(r.amount_gbp) })) as LedgerFact[];
  const paidIds = new Set(paidLeads.map((l) => String(l.id)));
  const heldIntents = new Set(holds.map((h) => String(h.payment_intent_id ?? "")).filter(Boolean));
  const paidLedgerIds = new Set(linePayments.map((p) => String(p.line_key)).filter((k) => k.startsWith("pay:")).map((k) => k.slice(4)));
  const onlyOne = (hit: Obj[]) => (hit.length === 1 ? String(hit[0].id) : null);

  /* What Stripe's own objects say about each charge. Looked up in order, strongest first; an email is never used. */
  const placements = new Map<string, ChargePlacement>();
  const pickedPlan = new Map<string, string | null>();
  const charged: StripeChargeFact[] = [];
  for (const ch of charges) {
    if (ch.status !== "succeeded" || !ch.paid) continue;
    const pi = stripeIdOf(ch.payment_intent);
    const inv = stripeIdOf(ch.invoice);
    const cust = stripeIdOf(ch.customer);
    let leadId: string | null = pi ? onlyOne(paidLeads.filter((l) => l.stripe_payment_intent_id === pi)) : null;
    let findable = !!leadId;
    let plan = null as ChargePlacement["plan"];
    if (!inv && pi) {
      const s = (await stripeGet("checkout/sessions", { payment_intent: pi })).data?.[0] as Obj | undefined;
      if (s) {
        plan = paymentPlanFromMeta(s.metadata ?? null);
        const metaLead = String(s.metadata?.lead_id ?? "");
        const metaOb = String(s.metadata?.onboarding_id ?? "");
        if (metaLead || metaOb) findable = true;
        if (!leadId && metaLead && paidIds.has(metaLead)) leadId = metaLead;
        if (!leadId && metaOb) {
          const { data } = await service.from("onboarding_responses").select("lead_id").eq("id", metaOb).maybeSingle();
          const obLead = String((data as Obj | null)?.lead_id ?? "");
          if (paidIds.has(obLead)) leadId = obLead;
        }
      }
    }
    if (!leadId && ch.metadata?.lead_id) { findable = true; if (paidIds.has(String(ch.metadata.lead_id))) leadId = String(ch.metadata.lead_id); }
    if (!leadId && inv) {
      const sub = stripeIdOf((await stripeGet(`invoices/${inv}`)).subscription);
      if (sub) leadId = onlyOne(paidLeads.filter((l) => l.stripe_subscription_id === sub));
      if (leadId) findable = true;
    }
    if (!leadId && cust) { leadId = onlyOne(paidLeads.filter((l) => l.stripe_customer_id === cust)); if (leadId) findable = true; }
    if (leadId && !inv && !pickedPlan.has(leadId)) {
      const { data } = await service.from("onboarding_responses").select("payment_plan").eq("lead_id", leadId).not("payment_plan", "is", null).order("updated_at", { ascending: false }).limit(1);
      pickedPlan.set(leadId, ((data ?? [])[0] as Obj | undefined)?.payment_plan ?? null);
    }
    placements.set(ch.id, { leadId, findable, plan, picked: leadId ? pickedPlan.get(leadId) ?? null : null, held: !!pi && heldIntents.has(pi) });
    const refundTimes = ((ch.refunds?.data ?? []) as Obj[]).map((r) => Number(r.created ?? 0));
    charged.push({
      id: ch.id, paymentIntent: pi, invoice: inv, customer: cust, amountGbp: moneyOf(ch.amount), refundedGbp: moneyOf(ch.amount_refunded),
      refundedAt: refundTimes.length ? isoOf(Math.max(...refundTimes)) : null, createdAt: isoOf(ch.created), currency: String(ch.currency ?? "gbp"),
    });
  }
  const disputeFacts: StripeDisputeFact[] = disputes.map((d) => ({
    id: d.id, charge: stripeIdOf(d.charge), paymentIntent: stripeIdOf(d.payment_intent), status: String(d.status ?? "open"), amountGbp: moneyOf(d.amount), createdAt: isoOf(d.created), currency: String(d.currency ?? "gbp"),
  }));
  const plan = planReconcile({
    charges: charged, disputes: disputeFacts, ledger, paidLedgerIds, sinceIso,
    placeOf: (c) => placements.get(c.id) ?? { leadId: null, findable: false, plan: null, picked: null, held: false },
  });
  const webhook = endpoints.filter((e) => String(e.url ?? "").includes("/stripe-webhook")).map((e) => ({ status: e.status, api_version: e.api_version ?? null, events: e.enabled_events ?? [] }));
  plan.needsYou.push(...webhookProblems(endpoints as never));
  return { plan, webhook, chargesSeen: charged.length, disputesSeen: disputeFacts.length };
}

async function apply(service: Service, built: Awaited<ReturnType<typeof buildPlan>>) {
  const changes: Obj[] = [];
  const needsYou: NeedsYou[] = [...built.plan.needsYou];
  for (const w of built.plan.writes) {
    const { why, ...write } = w;
    const outcome = await recordLedger(service, { ...write, source: "reconcile" });
    if (outcome === "failed") needsYou.push({ kind: "amount_differs", object: w.stripe_object_id, leadId: w.lead_id, detail: `Could not write: ${why}.` });
    else if (outcome !== "exists") changes.push({ what: why, kind: w.kind, object: w.stripe_object_id, lead_id: w.lead_id, outcome });
  }
  for (const p of built.plan.planFixes) {
    /* Conditional on what was read: a change made since then wins. The rate follows the plan by trigger. */
    let q = service.from("payment_ledger").update({ sale_plan: p.to, sale_plan_flag: p.flag }).eq("id", p.ledgerId);
    q = p.from === null ? q.is("sale_plan", null) : q.eq("sale_plan", p.from);
    const { error } = await q;
    if (error) needsYou.push({ kind: "plan_paid_differs", object: p.ledgerId, leadId: p.leadId, detail: `Could not correct the plan to ${p.to}: ${error.message}` });
    else changes.push({ what: `Plan set to ${p.to} from Stripe, was ${p.from ?? "none"}`, kind: "plan", object: p.ledgerId, lead_id: p.leadId, outcome: "updated" });
  }
  return { changes, needsYou };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (req.headers.get("x-internal-job") !== "1" || !isInternalCall(req)) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Obj = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode = String(body.mode ?? "");
  if (mode !== "dry_run" && mode !== "run") return json({ ok: false, error: "bad_mode", detail: "mode must be dry_run or run." }, 400);
  const started = new Date().toISOString();
  try {
    const built = await buildPlan(service);
    if (mode === "dry_run") {
      return json({ ok: true, mode, charges_seen: built.chargesSeen, disputes_seen: built.disputesSeen, not_ours: built.plan.notOurs, writes: built.plan.writes, plan_fixes: built.plan.planFixes, needs_you: built.plan.needsYou, webhook: built.webhook });
    }
    const { changes, needsYou } = await apply(service, built);
    const { error } = await service.from("commission_stripe_checks").insert({
      started_at: started, finished_at: new Date().toISOString(), ok: true, applied: true, window_days: STRIPE_CHECK_WINDOW_DAYS,
      charges_seen: built.chargesSeen, disputes_seen: built.disputesSeen, fixed_count: changes.length, needs_you_count: needsYou.length,
      changes, needs_you: needsYou, webhook: built.webhook,
    });
    if (error) throw new Error(`log not written: ${error.message}`);
    return json({ ok: true, mode, charges_seen: built.chargesSeen, disputes_seen: built.disputesSeen, not_ours: built.plan.notOurs, changes, needs_you: needsYou });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)).split("\n")[0].slice(0, 300);
    console.error("[commission-stripe-check]", msg);
    if (mode === "run") {
      const { error } = await service.from("commission_stripe_checks").insert({ started_at: started, finished_at: new Date().toISOString(), ok: false, applied: false, window_days: STRIPE_CHECK_WINDOW_DAYS, error: msg });
      if (error) console.error("[commission-stripe-check] log not written:", error.message);
    }
    return json({ ok: false, error: "failed", detail: msg }, 500);
  }
});
