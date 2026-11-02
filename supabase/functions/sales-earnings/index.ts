import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { recordDenial } from "../_shared/protection.ts";
import { loadEarnings, owedFrom } from "../_shared/earnings.ts";
import { recordLedger, stripeIdOf, type LedgerWrite } from "../_shared/payment-ledger.ts";
import { londonDayOf } from "../../../src/lib/commission.ts";
import { MARK_PAID_REFUSAL_WORDS, paidHistory, planMarkPaid } from "../../../src/lib/commissionOwed.ts";
import { MARK_PAID_UNDO_HOURS } from "../../../src/lib/commissionConfig.ts";
import { closeInfoMissing, cleanHandoff } from "../../../src/lib/salesHandoff.ts";
import { monthlyDiffers, salePlanParts } from "../../../src/lib/salePlan.ts";

// sales-earnings — commission from the payment ledger (Sales Experience, 2026-09-28; docs/sales-experience.md §4).
//
// Modes:
//   summary (default, both roles) — a salesperson ALWAYS gets their own earnings (`person` ignored);
//     the admin may ask for one person or everyone.
//   owed (both roles; docs/commission-owed.md) — what is owed, by person, with countdowns and the paid history. A salesperson
//     ALWAYS gets only their own, whatever they send. The admin also gets the names and New paid clients.
//   mark_paid (admin) — record a bank transfer Paul made: { person } (everything due now) or { item_key }, with { expected_total }.
//     The server works the money out again from the ledger; the browser's figure only has to agree. Nothing moves money here.
//   undo_paid (admin) — { batch_id }, for a payment this admin just recorded.
//   record_payout (admin) — record a payout actually made: { user_id, period_month: "YYYY-MM", amount_gbp, paid_at, note }.
//   backfill (admin) — rebuild ledger rows from Stripe's own history. { apply: false } (the default) only
//     REPORTS what it would write; { apply: true } writes (idempotent — unique by the Stripe object).
//     ⛔ Never invents a transaction: a charge it cannot tie to exactly one lead is reported, not written.
//   webhook_config (admin) — which events the Stripe webhook endpoint sends (read-only).
//   webhook_enable_disputes (admin; Paul approved 2026-09-29) — ADDS the three dispute events to the
//     endpoint that points at our stripe-webhook, keeping every event it already sends. The one Stripe
//     write in this file; it changes which events Stripe sends, never money.
// ⛔ Stripe is only READ here. Nothing is charged, refunded or changed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Service = any;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

async function stripeGet(path: string, params: Record<string, string | string[]> = {}): Promise<Obj> {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("stripe_not_configured");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x);
  const r = await fetch(`https://api.stripe.com/v1/${path}?${qs}`, { headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" } });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe ${path}: ${j?.error?.message ?? r.status}`);
  return j;
}
/** DISPUTE_EVENTS: what stripe-webhook records as chargebacks (the payment ledger). */
export const DISPUTE_EVENTS = ["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"] as const;
async function stripeAddEvents(endpointId: string, events: string[]): Promise<Obj> {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("stripe_not_configured");
  const form = new URLSearchParams();
  for (const e of events) form.append("enabled_events[]", e);
  const r = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${endpointId}`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20", "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`stripe webhook_endpoints: ${j?.error?.message ?? r.status}`);
  return j;
}
async function stripeList(path: string, params: Record<string, string | string[]>): Promise<Obj[]> {
  const out: Obj[] = [];
  let after: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await stripeGet(path, { limit: "100", ...params, ...(after ? { starting_after: after } : {}) });
    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

async function backfill(service: Service, apply: boolean, sinceIso: string) {
  const since = String(Math.floor(Date.parse(sinceIso) / 1000));
  const [charges, disputes] = await Promise.all([
    stripeList("charges", { "created[gte]": since, "expand[]": ["data.refunds"] }),
    stripeList("disputes", { "created[gte]": since }),
  ]);
  const { data: paidLeads } = await service.from("outreach_leads").select("id, business_name, email, amount_paid, status, stripe_payment_intent_id, stripe_customer_id, stripe_subscription_id").or("amount_paid.gt.0,status.eq.refunded");
  const leads = (paidLeads ?? []) as Obj[];
  const { data: obs } = await service.from("onboarding_responses").select("id, lead_id, contact_email").not("lead_id", "is", null);
  const byEmail = new Map<string, Set<string>>();
  const paidIds = new Set(leads.map((l) => l.id));
  const addEmail = (e: unknown, id: string) => { const k = String(e ?? "").trim().toLowerCase(); if (!k || !paidIds.has(id)) return; (byEmail.get(k) ?? byEmail.set(k, new Set()).get(k)!).add(id); };
  for (const l of leads) addEmail(l.email, l.id);
  for (const o of (obs ?? []) as Obj[]) addEmail(o.contact_email, o.lead_id);

  const matched: Obj[] = []; const unmatched: Obj[] = []; const writes: LedgerWrite[] = [];
  const sessionCache = new Map<string, Obj | null>();
  for (const ch of charges) {
    if (ch.status !== "succeeded" || !ch.paid) continue;
    const pi = stripeIdOf(ch.payment_intent); const inv = stripeIdOf(ch.invoice); const cust = stripeIdOf(ch.customer);
    let leadId: string | null = null; let how = "";
    const byPi = pi ? leads.filter((l) => l.stripe_payment_intent_id === pi) : [];
    if (byPi.length === 1) { leadId = byPi[0].id; how = "payment_intent on the lead"; }
    if (!leadId && pi) {
      if (!sessionCache.has(pi)) { try { const s = await stripeGet("checkout/sessions", { payment_intent: pi }); sessionCache.set(pi, s.data?.[0] ?? null); } catch { sessionCache.set(pi, null); } }
      const s = sessionCache.get(pi);
      const metaLead = String(s?.metadata?.lead_id ?? "");
      const metaOb = String(s?.metadata?.onboarding_id ?? "");
      if (metaLead && paidIds.has(metaLead)) { leadId = metaLead; how = "checkout session metadata.lead_id"; }
      else if (metaOb) { const o = ((obs ?? []) as Obj[]).find((x) => x.id === metaOb); if (o && paidIds.has(o.lead_id)) { leadId = o.lead_id; how = "checkout session metadata.onboarding_id"; } }
    }
    if (!leadId && ch.metadata?.lead_id && paidIds.has(String(ch.metadata.lead_id))) { leadId = String(ch.metadata.lead_id); how = "charge metadata.lead_id"; }
    if (!leadId && inv) {
      try { const iv = await stripeGet(`invoices/${inv}`); const sub = stripeIdOf(iv.subscription); const hit = leads.filter((l) => sub && l.stripe_subscription_id === sub); if (hit.length === 1) { leadId = hit[0].id; how = "invoice subscription on the lead"; } } catch { /* reported below */ }
    }
    if (!leadId && cust) { const hit = leads.filter((l) => l.stripe_customer_id === cust); if (hit.length === 1) { leadId = hit[0].id; how = "customer on the lead"; } }
    if (!leadId) {
      const email = String(ch.billing_details?.email ?? ch.receipt_email ?? "").trim().toLowerCase();
      const hit = email ? [...(byEmail.get(email) ?? [])] : [];
      if (hit.length === 1) { leadId = hit[0]; how = "billing email = the paid lead's email"; }
    }
    const summary = { charge: ch.id, amount_gbp: ch.amount / 100, currency: ch.currency, at: new Date(ch.created * 1000).toISOString(), description: ch.description ?? null, refunded_gbp: (ch.amount_refunded ?? 0) / 100 };
    if (!leadId) { unmatched.push({ ...summary, email_domain: String(ch.billing_details?.email ?? ch.receipt_email ?? "").split("@")[1] ?? null }); continue; }
    const lead = leads.find((l) => l.id === leadId)!;
    matched.push({ ...summary, lead_id: leadId, business: lead.business_name, how, lead_amount_paid: Number(lead.amount_paid ?? 0) });
    writes.push({
      lead_id: leadId, kind: inv ? "recurring" : "initial", amount_gbp: ch.amount / 100, currency: ch.currency,
      occurred_at: new Date(ch.created * 1000).toISOString(), stripe_object_id: inv ?? pi ?? ch.id,
      stripe_payment_intent_id: pi, stripe_charge_id: ch.id, stripe_invoice_id: inv, stripe_customer_id: cust, source: "backfill", note: `backfill: ${how}`,
    });
    if ((ch.amount_refunded ?? 0) > 0) {
      const refunds = (ch.refunds?.data ?? []) as Obj[];
      const lastAt = refunds.reduce((m, r) => Math.max(m, Number(r.created ?? 0)), 0) || ch.created;
      writes.push({
        lead_id: leadId, kind: "refund", amount_gbp: ch.amount_refunded / 100, currency: ch.currency,
        occurred_at: new Date(lastAt * 1000).toISOString(), stripe_object_id: ch.id, stripe_charge_id: ch.id,
        stripe_payment_intent_id: pi, stripe_invoice_id: inv, stripe_customer_id: cust, source: "backfill", note: "backfill: refunded amount on the charge",
      });
    }
  }
  for (const d of disputes) {
    const chId = stripeIdOf(d.charge);
    const w = writes.find((x) => x.stripe_charge_id === chId && x.kind !== "refund");
    if (!w) { unmatched.push({ dispute: d.id, charge: chId, amount_gbp: d.amount / 100, status: d.status }); continue; }
    writes.push({ lead_id: w.lead_id, kind: "chargeback", status: String(d.status), amount_gbp: d.amount / 100, currency: d.currency, occurred_at: new Date(d.created * 1000).toISOString(), stripe_object_id: d.id, stripe_charge_id: chId, stripe_payment_intent_id: stripeIdOf(d.payment_intent), source: "backfill" });
  }
  const results: Obj[] = [];
  if (apply) for (const w of writes) results.push({ kind: w.kind, object: w.stripe_object_id, outcome: await recordLedger(service, w) });
  return {
    since: sinceIso, charges_seen: charges.length, disputes_seen: disputes.length,
    matched, unmatched, planned: writes.map((w) => ({ kind: w.kind, lead_id: w.lead_id, amount_gbp: w.amount_gbp, occurred_at: w.occurred_at, object: w.stripe_object_id })),
    applied: apply, results,
    paid_leads_without_a_stripe_payment: leads.filter((l) => !matched.some((m) => m.lead_id === l.id)).map((l) => ({ lead_id: l.id, business: l.business_name, amount_paid: l.amount_paid, status: l.status })),
  };
}

async function teamNames(service: Service): Promise<Record<string, string>> {
  const { data, error } = await service.from("team_members").select("user_id, display_name");
  if (error) throw new Error(error.message);
  return Object.fromEntries(((data ?? []) as { user_id: string; display_name: string | null }[]).filter((t) => t.display_name).map((t) => [t.user_id, t.display_name as string]));
}

/** NEW PAID CLIENTS, newest first, for the admin home. Money from the ledger where it holds the sale, and Stripe's plan over the pick. */
async function newPaidClients(service: Service) {
  const { data: leads, error } = await service.from("outreach_leads")
    .select("id, business_name, amount_paid, payment_date, status, sold_by_user_id, payment_plan, sales_handoff")
    .gt("amount_paid", 0).order("payment_date", { ascending: false, nullsFirst: false }).limit(50);
  if (error) throw new Error(error.message);
  const rows = (leads ?? []) as Obj[];
  const ids = rows.map((l) => l.id as string);
  const [ledger, onboarding, exclusions] = await Promise.all([
    service.from("payment_ledger").select("lead_id, kind, status, amount_gbp, occurred_at, sold_by_user_id, sale_plan, sale_plan_flag").in("lead_id", ids).in("kind", ["initial", "recurring"]).limit(5000),
    service.from("onboarding_responses").select("lead_id, website_manager, payment_plan, quick_close").in("lead_id", ids).order("updated_at", { ascending: false }).limit(1000),
    service.from("metric_exclusions").select("value").eq("kind", "lead").in("value", ids).limit(1000),
  ]);
  for (const r of [ledger, onboarding, exclusions]) if (r.error) throw new Error(r.error.message);
  const firstOb = new Map<string, Obj>();
  for (const o of (onboarding.data ?? []) as Obj[]) if (!firstOb.has(o.lead_id)) firstOb.set(o.lead_id, o);
  const tests = new Set(((exclusions.data ?? []) as { value: string }[]).map((e) => e.value));
  return rows.map((l) => {
    const pays = ((ledger.data ?? []) as Obj[]).filter((r) => r.lead_id === l.id && r.status === "succeeded");
    const sale = pays.filter((r) => r.kind === "initial").sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))[0] ?? null;
    const plan = (sale?.sale_plan ?? l.payment_plan ?? null) as string | null;
    const recurring = pays.filter((r) => r.kind === "recurring").sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at))).map((r) => Number(r.amount_gbp));
    const ob = firstOb.get(l.id) ?? null;
    const answers = ((ob?.quick_close as Obj | null)?.answers ?? {}) as Obj;
    const missing = closeInfoMissing({ handoff: cleanHandoff(l.sales_handoff), manager: (answers.manager ?? ob?.website_manager ?? null) as string | null, agencyContract: (answers.agency_contract ?? null) as string | null, plan });
    return {
      lead_id: l.id, business: l.business_name ?? "Client", plan, plan_words: salePlanParts(plan).words,
      amount_paid: sale ? Number(sale.amount_gbp) : Number(l.amount_paid ?? 0),
      seller_id: (sale?.sold_by_user_id ?? l.sold_by_user_id ?? null) as string | null,
      paid_at: (sale?.occurred_at ?? l.payment_date ?? null) as string | null,
      missing, flag: (sale?.sale_plan_flag ?? (monthlyDiffers(plan, recurring) ? "monthly_differs" : null)) as string | null,
      test: tests.has(l.id), refunded: l.status === "refunded",
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({}));
    const mode = typeof body.mode === "string" ? body.mode : "summary";
    const adminOnly = async () => { await recordDenial(service, actor.id, `sales-earnings:${mode}`); return json({ ok: false, error: "admin_only", detail: "This action is for the admin account only." }, 403); };

    if (mode === "summary") {
      let personId: string | null;
      if (actor.role === "sales") personId = actor.id;
      else if (body.person === "me") personId = actor.id;
      else if (typeof body.person === "string" && UUID_RE.test(body.person)) personId = body.person;
      else personId = null;
      const earnings = await loadEarnings(service, personId, londonDayOf(new Date().toISOString()));
      // A salesperson sees only their own lines — the loader scoped them; this is the belt.
      if (actor.role === "sales" && earnings.lines.some((l) => l.sellerId !== actor.id)) return json({ ok: false, error: "scope_error" }, 500);
      return json({ ok: true, scope: { person: personId, self: personId === actor.id, role: actor.role }, ...earnings, ms: Date.now() - started });
    }
    if (mode === "owed") {
      const personId = actor.role === "sales" ? actor.id : null;
      const today = londonDayOf(new Date().toISOString());
      const earnings = await loadEarnings(service, personId, today);
      const owed = owedFrom(earnings, today);
      /* The belt: a salesperson's answer holds nobody else's money. */
      if (actor.role === "sales" && [...owed.next, ...owed.quiet].some((i) => i.sellerId !== actor.id)) return json({ ok: false, error: "scope_error" }, 500);
      const history = paidHistory(earnings.linePayments);
      if (actor.role === "sales") return json({ ok: true, ...owed, history, names: {}, new_paid_clients: [], ms: Date.now() - started });
      return json({ ok: true, ...owed, history, names: await teamNames(service), new_paid_clients: await newPaidClients(service), ms: Date.now() - started });
    }
    if (actor.role !== "admin") return await adminOnly();

    if (mode === "mark_paid") {
      const person = typeof body.person === "string" && UUID_RE.test(body.person) ? body.person : null;
      const itemKey = typeof body.item_key === "string" && /^(pay|rev):[0-9a-f-]{36}$/i.test(body.item_key) ? body.item_key : null;
      const expected = Number(body.expected_total);
      if ((!person && !itemKey) || !Number.isFinite(expected)) return json({ ok: false, error: "bad_request" }, 400);
      const today = londonDayOf(new Date().toISOString());
      const owed = owedFrom(await loadEarnings(service, null, today), today);
      const planned = planMarkPaid(owed, { person, itemKey, expectedTotal: expected });
      if (!planned.ok) return json({ ok: false, error: planned.error, detail: MARK_PAID_REFUSAL_WORDS[planned.error] }, 409);
      const rows = planned.items.flatMap((i) => i.parts.map((p) => ({
        line_key: p.lineId, part: p.part, user_id: i.sellerId, lead_id: i.leadId, amount_gbp: p.amount, business_name: i.business, plan: i.plan,
        label: i.label, rate: i.rate, client_amount_gbp: i.clientAmount, collected_at: i.collectedAt, payable_on: i.payableOn,
      })));
      const batchId = crypto.randomUUID();
      const { error } = await service.rpc("commission_record_line_payments", { _batch: batchId, _by: actor.id, _rows: rows });
      if (error) {
        /* One line can only be paid once (a partial unique index): the other tab won. */
        if (String((error as { code?: string }).code) === "23505") return json({ ok: false, error: "already_paid", detail: "Part of this was already marked as paid. The screen has been refreshed." }, 409);
        return json({ ok: false, error: "write_failed", detail: "Not recorded. Try again." }, 500);
      }
      return json({ ok: true, batch_id: batchId, total: planned.total, count: rows.length });
    }
    if (mode === "undo_paid") {
      const batchId = String(body.batch_id ?? "");
      if (!UUID_RE.test(batchId)) return json({ ok: false, error: "bad_request" }, 400);
      const since = new Date(Date.now() - MARK_PAID_UNDO_HOURS * 3_600_000).toISOString();
      const { data, error } = await service.from("commission_line_payments").update({ undone_at: new Date().toISOString(), undone_by: actor.id })
        .eq("batch_id", batchId).eq("paid_by", actor.id).is("undone_at", null).gte("paid_at", since).select("id");
      if (error) return json({ ok: false, error: "write_failed", detail: "Not undone. Try again." }, 500);
      if (!data?.length) return json({ ok: false, error: "too_late", detail: "This payment can no longer be undone here." }, 409);
      return json({ ok: true, count: data.length });
    }
    if (mode === "record_payout") {
      const month = String(body.period_month ?? "");
      const amount = Number(body.amount_gbp);
      const paidAt = String(body.paid_at ?? new Date().toISOString().slice(0, 10));
      if (!UUID_RE.test(String(body.user_id ?? "")) || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
        return json({ ok: false, error: "bad_request", detail: "user_id, period_month (YYYY-MM), amount_gbp and paid_at (YYYY-MM-DD) are required." }, 400);
      }
      const { error } = await service.from("commission_payouts").upsert({
        user_id: body.user_id, period_month: `${month}-01`, amount_gbp: Math.round(amount * 100) / 100, paid_at: paidAt,
        recorded_by: actor.id, note: typeof body.note === "string" ? body.note.slice(0, 300) : null,
      }, { onConflict: "user_id,period_month" });
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 500);
      return json({ ok: true });
    }
    if (mode === "backfill") {
      const since = typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : "2026-06-01";
      return json({ ok: true, ...(await backfill(service, body.apply === true, since)), ms: Date.now() - started });
    }
    if (mode === "webhook_enable_disputes") {
      const eps = (await stripeList("webhook_endpoints", {})).filter((e) => String(e.url ?? "").includes("/functions/v1/stripe-webhook"));
      if (eps.length !== 1) return json({ ok: false, error: "endpoint_not_unique", detail: `Expected exactly one endpoint pointing at stripe-webhook, found ${eps.length}.` }, 409);
      const ep = eps[0];
      const before: string[] = ep.enabled_events ?? [];
      if (before.includes("*")) return json({ ok: true, changed: false, detail: "The endpoint already sends every event.", enabled_events: before });
      const after = [...new Set([...before, ...DISPUTE_EVENTS])];
      if (after.length === before.length) return json({ ok: true, changed: false, enabled_events: before });
      const updated = await stripeAddEvents(ep.id, after);
      return json({ ok: true, changed: true, before, enabled_events: updated.enabled_events });
    }
    if (mode === "webhook_config") {
      const eps = await stripeList("webhook_endpoints", {});
      return json({ ok: true, endpoints: eps.map((e) => ({ id: e.id, url: e.url, status: e.status, enabled_events: e.enabled_events })) });
    }
    return json({ ok: false, error: "unknown_mode" }, 400);
  } catch (e) {
    console.error("[sales-earnings]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: e instanceof Error && e.message === "stripe_not_configured" ? "Stripe is not configured." : "Could not load earnings. Try again in a moment." }, 500);
  }
});
