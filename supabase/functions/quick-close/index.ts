import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor, leadAccess } from "../_shared/access.ts";
import { recordDenial } from "../_shared/protection.ts";
import {
  adoptLink, answersKey, buildConsentsFor, buildConsentsWording, cleanAnswers, linkExpiresAtMs, linkStep, linkUsable, linkUsableUntilMs, planQuickCloseSave,
  quickCloseEmail, quickCloseGate, quickCloseMessage, quickCloseState, QC_REVIEW_TEXT, STRIPE_SESSION_LIFETIME_MS,
  stripeSessionIdFromUrl, quickCloseClosedRefusal, type QcLinkShare, type QcRecord, type QuickCloseRecord,
} from "../../../src/lib/quickClose.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import {
  cleanHandoff, handoffChangedKeys, handoffComplete, handoffMissing, handoffPrefill, handoffWithPrefill, HANDOFF_QUESTIONS, SALES_HANDOFF_SINCE,
  type SalesHandoffFields, type SalesHandoffRecord,
} from "../../../src/lib/salesHandoff.ts";
import { FINDABLE_CONTACT_EMAIL, SERVICE_ROUTE_NAME, serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";
import { loadClientSetup, recordLeadEvent, submitForDelivery } from "../_shared/client-setup.ts";
import { sendOperatorAlert } from "../_shared/operator-alert.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { qaEmailHold } from "../_shared/qa-guard.ts";

// quick-close — QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9;
// fixes 2026-10-04: docs/pre-sales-certification/fixes-02-quick-close.md).
//
// Modes: load · save · approve_review (admin) · generate_link · share_link · save_handoff · submit_delivery · my_handoffs.
// ⛔ THE SALES HANDOFF (2026-10-02, src/lib/salesHandoff.ts) is the one thing a salesperson may still
//   write AFTER payment, and only on their OWN sale (sold_by_user_id) — it lands on
//   outreach_leads.sales_handoff through cleanHandoff, never anything else on the lead.
// ⛔ WHO: a salesperson only on a lead they may work (leadAccess: assigned to them, not a client); the
//   admin on the book's leads. After payment the seller may still LOAD the state (read-only).
// ⛔ ONE ONBOARDING ROW per lead (public.quick_close_row, advisory-locked). The answers are also written
//   to the canonical columns the checkout reads, so every existing safeguard applies unchanged.
// ⛔ EVERY WRITE TO quick_close IS CONDITIONAL ON ITS `rev` (2026-10-04, writeQc). Two tabs, a double tap,
//   or a save racing a link can never overwrite each other: the loser re-reads and re-applies, or is told.
//   Answers are merged on the SERVER over the saved set (mergeAnswers) — never cleaned on their own first.
// ⛔ THE PAYMENT LINK IS THE EXISTING findable-checkout, called server-to-server with this row's id and
//   lead id — nothing here sets a price, a term, a discount or a line item; the request carries none.
//   A link is REUSED only while linkUsable (young enough, enough time left before Stripe closes it). An
//   expired or replaced link is never shown as ready, and a replaced session is expired at Stripe so
//   there is only ever ONE payable link per close.
// ⛔ SHARING (share_link): copy / email / WhatsApp, each recorded (quick_close_events + History). A copy is
//   recorded as COPIED, never as sent. WhatsApp goes through send-whatsapp-message AS THE CALLER, so its
//   window, QA and suppression rules apply unchanged; it is recorded only when that sender says ok.
// ⛔ Every save / release / link / share is written to quick_close_events (who, when, what changed).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** How many share records a row keeps (the newest win). */
const MAX_SHARES = 20;
// deno-lint-ignore no-explicit-any
type Service = any;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

const CHECKOUT_REFUSAL_TEXT: Record<string, string> = {
  already_client: "This business has already paid.",
  cannot_serve: "The website answers mean Findable cannot deliver on this site as it stands — Paul needs to look at it.",
  domain_unresolved: "The domain answers need Paul's review before payment.",
  route_undecided: "Choose the website route (Build or Optimise) first.",
  needs_trade: "Add the business's trade first (it decides what the baseline measures).",
  no_lead_attribution: "This payment could not be tied to the lead.",
  unknown_onboarding: "The onboarding record was not found.",
  payments_not_configured: "Payments are not configured.",
  checkout_failed: "Stripe did not create the payment page. Try again in a moment.",
};

/** What send-whatsapp-message's refusals mean to a rep on the phone. Anything else shows its own reason. */
const WHATSAPP_REFUSAL_TEXT: Record<string, string> = {
  window_closed: "The WhatsApp window is closed (they haven't messaged in the last 24 hours). Email the link or copy it instead.",
  forbidden: "This lead is no longer yours to message — if they have paid, Paul looks after them now.",
  opted_out: "They asked us not to contact them. Nothing was sent.",
  wrong_number: "This number is marked Wrong number. Nothing was sent.",
  lead_archived: "This lead is archived. Nothing was sent.",
  qa_test_account: "Not sent: this is a test account or a lead held by one.",
};

const LEAD_COLS = "id, user_id, business_name, phone, email, website, address, search_location, derived_town, category, search_keyword, contact_name, campaign_id, lead_source, assigned_to_user_id, sold_by_user_id, amount_paid, status, rating, review_count, google_maps_url, place_id, website_control, sales_handoff, delivery_submitted_at, contract_total_payments, service_terminated_at";
const ROW_COLS = "id, status, source, created_at, contact_name, contact_email, confirmed_phone, business_website, quick_close, plan_tier, website_addon";

async function loadAll(service: Service, leadId: string) {
  const [{ data: lead }, { data: rows }] = await Promise.all([
    service.from("outreach_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle(),
    service.from("onboarding_responses").select(ROW_COLS).eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  if (!lead) return null;
  const nonFree = ((rows ?? []) as Obj[]).filter((r) => (r.source ?? "") !== "free_check");
  const row = nonFree.find((r) => r.status === "paid") ?? nonFree[0] ?? null;
  return { lead: lead as Obj, row };
}

async function loadRow(service: Service, rowId: string): Promise<Obj | null> {
  const { data, error } = await service.from("onboarding_responses").select(ROW_COLS).eq("id", rowId).maybeSingle();
  if (error) throw new Error(`quick-close row read failed: ${error.message}`);
  return (data ?? null) as Obj | null;
}

async function event(service: Service, leadId: string, onboardingId: string | null, actor: string, kind: string, data: Obj = {}) {
  const { error } = await service.from("quick_close_events").insert({ lead_id: leadId, onboarding_id: onboardingId, actor_user_id: actor, kind, data });
  if (error) console.error("[quick-close] event write failed", kind, error.message);
}

const revOf = (q: Obj | null | undefined): number | null => (q && Number.isInteger(q.rev) ? q.rev as number : null);

/** 🔴 THE ONE WAY quick_close IS WRITTEN: conditional on the rev it was read at. Returns the stored record
 *  (rev + 1), or null when someone else wrote first — the caller re-reads and decides again. */
async function writeQc(service: Service, rowId: string, expect: number | null, next: Obj, cols: Obj = {}): Promise<Obj | null> {
  const stored = { ...next, rev: (expect ?? 0) + 1 };
  let q = service.from("onboarding_responses").update({ ...cols, quick_close: stored }).eq("id", rowId);
  q = expect === null ? q.is("quick_close->>rev", null) : q.eq("quick_close->>rev", String(expect));
  const { data, error } = await q.select("id");
  if (error) throw new Error(`quick_close write failed: ${error.message}`);
  return Array.isArray(data) && data.length === 1 ? stored : null;
}

/** Close a superseded Checkout Session at Stripe so it can no longer be paid. Best effort: an already
 *  expired or completed session answers 400, which is fine — the result is recorded, never thrown. */
async function expireSession(sessionId: string | null | undefined): Promise<"expired" | "not_open" | "skipped" | "failed"> {
  if (!sessionId) return "skipped";
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) return "skipped";
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) return "expired";
    return r.status === 400 ? "not_open" : "failed";
  } catch (e) {
    console.error("[quick-close] session expire failed", e instanceof Error ? e.message : e);
    return "failed";
  }
}

const isRoute = (v: unknown): v is "build" | "optimise" => v === "build" || v === "optimise";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({}));
    const mode = typeof body.mode === "string" ? body.mode : "load";
    /* MY SALES THAT STILL OWE A HANDOFF (2026-10-02): the caller's OWN paid sales since handoffs existed —
       names and states only, never an amount or anything else of the client's.
       ⛔ An ARCHIVED sale is not listed (M-008, 2026-10-04): a rep is never told to finish a lead they binned. */
    if (mode === "my_handoffs") {
      const { data, error } = await service.from("outreach_leads")
        .select("id, business_name, payment_date, amount_paid, status, sales_handoff, delivery_submitted_at")
        .eq("sold_by_user_id", actor.id).gt("amount_paid", 0).gte("payment_date", SALES_HANDOFF_SINCE)
        .or("is_archived.is.null,is_archived.eq.false")
        .order("payment_date", { ascending: false }).limit(50);
      if (error) return json({ ok: false, error: "not_loaded" }, 500);
      const sales = ((data ?? []) as Obj[]).filter((l) => isPaidLead(l)).map((l) => ({
        id: l.id, business_name: l.business_name, paid_on: (l.payment_date ?? "").slice(0, 10),
        handoff_complete: handoffComplete(l.sales_handoff as SalesHandoffRecord | null),
        missing: handoffMissing(l.sales_handoff as SalesHandoffRecord | null).length,
        submitted: !!l.delivery_submitted_at,
      }));
      return json({ ok: true, sales });
    }
    const leadId = typeof body.lead_id === "string" && UUID_RE.test(body.lead_id) ? body.lead_id : null;
    if (!leadId) return json({ ok: false, error: "bad_request" }, 400);

    const [access, all] = await Promise.all([leadAccess(service, actor, leadId), loadAll(service, leadId)]);
    if (!all) return json({ ok: false, error: "lead_not_found" }, 404);
    const { lead } = all;
    let row: Obj | null = all.row;
    // After payment the lead becomes a client and leaves a salesperson's working set; the SELLER may
    // still see the outcome (read-only). Nobody else.
    const mayView = access.ok || (actor.role === "sales" && row?.status === "paid" && (lead.sold_by_user_id === actor.id || lead.assigned_to_user_id === actor.id));
    if (!mayView) return json({ ok: false, error: "not_your_lead", detail: "That lead is not assigned to you." }, 403);
    /* The handoff: the admin; a salesperson working the lead (before payment); the SELLER after payment.
       ⛔ Never another rep's client — sold_by_user_id is stamped once at payment and never moves. */
    const paidLead = isPaidLead(lead);
    const mayHandoff = actor.role === "admin" || (!paidLead && access.ok) || (paidLead && actor.role === "sales" && lead.sold_by_user_id === actor.id);

    const lastInboundAt = async (): Promise<string | null> => {
      const { data } = await service.from("whatsapp_messages").select("created_at").eq("lead_id", leadId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1);
      return ((data ?? []) as Obj[])[0]?.created_at ?? null;
    };
    const shareEmailOf = (r: Obj | null): string | null => {
      const e = String(r?.contact_email || lead.email || "").trim().toLowerCase();
      return EMAIL_RE.test(e) ? e : null;
    };

    const view = async () => {
      const [lastIn, camp, seller, events] = await Promise.all([
        lastInboundAt(),
        /* ⛔ Campaigns are private to their owner (2026-10-03): a salesperson is told the name only of a campaign they own. */
        lead.campaign_id ? (actor.role === "sales" ? service.from("campaigns").select("name").eq("id", lead.campaign_id).eq("created_by", actor.id).maybeSingle() : service.from("campaigns").select("name").eq("id", lead.campaign_id).maybeSingle()) : Promise.resolve({ data: null }),
        (lead.assigned_to_user_id ?? lead.sold_by_user_id) ? service.from("team_members").select("display_name").eq("user_id", lead.assigned_to_user_id ?? lead.sold_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
        service.from("quick_close_events").select("kind, created_at, actor_user_id, data").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(12),
      ]);
      const cur = (row?.quick_close ?? null) as (QuickCloseRecord & Obj) | null;
      const answers = cleanAnswers(cur?.answers);
      const nowMs = Date.now();
      /* THE HANDOFF, with what we already know pre-filled (saved answers win). After payment, the
         client's setup checklist too — the same loader Paid Clients uses — so the seller sees what is
         still missing and may submit for delivery when everything required is in. */
      const saved = (lead.sales_handoff ?? null) as SalesHandoffRecord | null;
      const pre = handoffPrefill({
        quickClose: answers, route: serviceRouteFromRow(row as never), websiteControl: lead.website_control ?? null,
        hasWebsite: lead.website ? true : null, contactName: row?.contact_name ?? lead.contact_name ?? null,
      });
      let setup: Obj | null = null;
      if (paidLead) {
        try {
          const s = (await loadClientSetup(service, leadId))?.setup;
          if (s) setup = { ready: s.readiness.ready, label: s.readiness.label, done: s.readiness.done, total: s.readiness.total, missing: s.readiness.missing, state_label: s.stage.stateLabel, next: s.stage.next, submitted: !!lead.delivery_submitted_at,
            /* The seller sees the SAME first-contact due day Paul's screen and email use (firstContact.ts). */
            first_contact: { state: s.stage.firstContact.state, due: s.stage.firstContact.due } };
        } catch (e) { console.error("[quick-close] setup read failed (non-blocking):", e instanceof Error ? e.message : e); }
      }
      /* THE LINK, AS IT REALLY IS (M-014): the URL is returned only while it is safe to hand over. An
         expired link reports when it was made, and nothing that could be copied. */
      /* ⛔ A paid / refunded / ended client is never handed a link, even one still inside its window. */
      const closedNow = quickCloseClosedRefusal(lead as never, row as never);
      const usable = linkUsable(cur, nowMs) && !closedNow;
      const session = cur?.link_session_id ?? stripeSessionIdFromUrl(cur?.link_url);
      const exp = linkExpiresAtMs(cur);
      const until = linkUsableUntilMs(cur);
      const shared = ((cur?.link_shared ?? []) as QcLinkShare[]).filter((s) => !session || !s.session || s.session === session);
      return {
        ok: true,
        handoff: {
          canEdit: mayHandoff, fields: handoffWithPrefill(saved, pre.fields), prefilled: saved?.saved_at ? [] : pre.prefilled,
          saved_at: saved?.saved_at ?? null, completed_at: saved?.completed_at ?? null,
          complete: handoffComplete(saved), missing: handoffMissing(saved),
        },
        setup,
        canEdit: access.ok && row?.status !== "paid" && !closedNow,
        closed: closedNow?.error ?? null,
        lead: {
          id: lead.id, business_name: lead.business_name, phone: lead.phone, email: lead.email, website: lead.website, address: lead.address,
          town: lead.derived_town || lead.search_location || null, trade: (lead.category || lead.search_keyword || "").trim() || null,
          contact_name: lead.contact_name, rating: lead.rating, review_count: lead.review_count, google_maps_url: lead.google_maps_url,
          campaign: (camp as { data?: { name?: string } | null }).data?.name ?? null, lead_source: lead.lead_source ?? null,
          salesperson: (seller as { data?: { display_name?: string } | null }).data?.display_name ?? null,
        },
        onboarding: row ? { id: row.id, status: row.status, contact_name: row.contact_name, contact_email: row.contact_email, confirmed_phone: row.confirmed_phone, business_website: row.business_website } : null,
        answers, state: closedNow ? "paid" : quickCloseState(row?.status, cur, nowMs), gate: quickCloseGate(answers),
        consents: { lines: buildConsentsFor(answers), wording: buildConsentsWording(answers), confirmed: cur?.build_consents_confirmed ?? null },
        review: { approved_at: cur?.review_approved_at ?? null, reasons: quickCloseGate(answers).review.map((r) => QC_REVIEW_TEXT[r]) },
        link: cur?.link_url && cur.link_generated_at ? {
          url: usable ? cur.link_url : null, usable, generated_at: cur.link_generated_at,
          expires_at: exp ? new Date(exp).toISOString() : null, usable_until: until ? new Date(until).toISOString() : null, shared: shared.slice(-MAX_SHARES),
        } : null,
        share: { email: shareEmailOf(row), hasPhone: !!lead.phone },
        windowOpen: serviceWindowState(lastIn).open,
        events: ((events as { data?: Obj[] }).data ?? []).map((e) => ({ kind: e.kind, at: e.created_at, by_me: e.actor_user_id === actor.id })),
      };
    };

    if (mode === "load") return json(await view());

    /* ══ SAVE THE SALES HANDOFF (before or after payment) ═════════════════════════════════════════════
       A key sent blank CLEARS that answer; a key not sent is left alone. Complete is stamped once, on the
       first save with every required answer. History: "completed" once, then each material change. */
    if (mode === "save_handoff") {
      if (!mayHandoff) {
        await recordDenial(service, actor.id, "quick-close:save_handoff", leadId);
        return json({ ok: false, error: "not_your_sale", detail: paidLead ? "Only the salesperson who made this sale can change its handoff." : "That lead is not assigned to you." }, 403);
      }
      const raw = (body.handoff && typeof body.handoff === "object" ? body.handoff : {}) as Obj;
      const prev = (lead.sales_handoff ?? null) as SalesHandoffRecord | null;
      const incoming = cleanHandoff(raw);
      const merged: Obj = { ...cleanHandoff(prev) };
      for (const q of HANDOFF_QUESTIONS) {
        if (!(q.key in raw)) continue;
        const v = (incoming as Obj)[q.key];
        if (v) merged[q.key] = v; else delete merged[q.key];
      }
      const fields = cleanHandoff(merged) as SalesHandoffFields;
      const changed = handoffChangedKeys(prev, fields);
      const now = new Date().toISOString();
      const firstComplete = handoffMissing(fields).length === 0 && !prev?.completed_at;
      const next: SalesHandoffRecord = {
        ...fields, saved_at: now, saved_by: actor.id,
        completed_at: prev?.completed_at ?? (firstComplete ? now : null), completed_by: prev?.completed_by ?? (firstComplete ? actor.id : null),
      };
      const { error } = await service.from("outreach_leads").update({ sales_handoff: next }).eq("id", leadId);
      if (error) return json({ ok: false, error: "not_saved", detail: error.message }, 500);
      if (firstComplete || (changed.length && prev?.completed_at)) {
        await recordLeadEvent(service, leadId, "handoff_saved", {
          actor: actor.id, source: actor.role === "admin" ? "admin" : "sales",
          body: firstComplete ? "Sales handoff completed" : "Sales handoff updated",
          data: { changed, after_submission: !!lead.delivery_submitted_at },
        });
      }
      lead.sales_handoff = next;
      return json(await view());
    }

    /* ══ SUBMIT FOR DELIVERY (the seller, once everything required is in) ═════════════════════════════ */
    if (mode === "submit_delivery") {
      if (!paidLead) return json({ ok: false, error: "not_paid", detail: "The client has not paid yet." }, 409);
      if (!mayHandoff) return json({ ok: false, error: "not_your_sale", detail: "Only the salesperson who made this sale can submit it." }, 403);
      const { data: me } = await service.from("team_members").select("display_name").eq("user_id", actor.id).maybeSingle();
      const out = await submitForDelivery(service, leadId, { id: actor.id, source: actor.role === "admin" ? "admin" : "sales", name: (me?.display_name as string | undefined) ?? null }, sendOperatorAlert);
      if (!out.ok) return json({ ok: false, error: out.error, detail: out.error === "not_ready" ? `Still missing: ${(out.missing ?? []).join(", ")}` : "Not submitted — try again." }, out.error === "not_ready" ? 409 : 500);
      lead.delivery_submitted_at = lead.delivery_submitted_at ?? new Date().toISOString();
      return json(await view());
    }

    if (!access.ok) return json({ ok: false, error: "not_your_lead", detail: "That lead is not assigned to you." }, 403);
    /* ⛔ PRE-PAYMENT ONLY, JUDGED ON THE LEAD (wave 1 integration): money on it, a paid-or-beyond status,
       refunded or ENDED refuses every mode below — save, review, link, share — not only a row that still
       reads 'paid' (quickCloseClosedRefusal). */
    const closedRefusal = quickCloseClosedRefusal(lead as never, row as never);
    if (closedRefusal) return json({ ok: false, error: closedRefusal.error, detail: closedRefusal.detail }, 409);

    /* ══ SAVE ONE OR MORE ANSWERS ═════════════════════════════════════════════════════════════════════
       🔴 M-001 (2026-10-04): the incoming answer is merged OVER the saved set and only then cleaned
       (mergeAnswers) — the Build consent used to be cleaned away on its own, before the merge, so Build
       never reached its link. An answer that still does not survive is REFUSED out loud, never dropped.
       ⛔ ROUTE INTEGRITY: a route change must say so (route_change: true) — a stale tab or a stray tap
       cannot flip Build ⇄ Optimise; `expect_route` (the route the screen showed) must match the saved
       one; and once an agreement acceptance or a contract exists the route cannot change here at all. */
    if (mode === "save") {
      const rawIncoming = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Obj;
      // Corrections go on the onboarding record (what the client confirmed), never over the lead's own fields.
      const c = (body.corrections && typeof body.corrections === "object" ? body.corrections : {}) as Obj;
      const cols: Obj = {};
      if (typeof c.contact_name === "string") cols.contact_name = c.contact_name.trim().slice(0, 120) || null;
      if (typeof c.contact_email === "string") { const e = c.contact_email.trim(); if (e && !EMAIL_RE.test(e)) return json({ ok: false, error: "bad_email", detail: "That email address does not look right." }, 400); cols.contact_email = e || null; }
      if (typeof c.confirmed_phone === "string") cols.confirmed_phone = c.confirmed_phone.trim().slice(0, 40) || null;
      if (typeof c.business_website === "string") cols.business_website = c.business_website.trim().slice(0, 200) || null;
      // The trade decides what the paid baseline measures (findable-checkout refuses a lead without one).
      // Only a BLANK trade is filled here — an existing one is never overwritten.
      const trade = typeof body.trade === "string" ? body.trade.trim().slice(0, 80) : "";
      if (trade && !((lead.category || lead.search_keyword || "") as string).trim()) {
        const { error: tErr } = await service.from("outreach_leads").update({ search_keyword: trade }).eq("id", leadId).is("category", null);
        if (tErr) return json({ ok: false, error: "not_saved", detail: tErr.message }, 500);
        lead.search_keyword = trade;
      }
      const rowId: string = row?.id ?? (await service.rpc("quick_close_row", { _lead_id: leadId, _business_name: lead.business_name ?? null })).data;
      if (!rowId) return json({ ok: false, error: "not_saved" }, 500);
      let routeLockChecked = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0 || !row || row.id !== rowId) row = await loadRow(service, rowId);
        if (!row) return json({ ok: false, error: "not_saved" }, 500);
        if (row.status === "paid") return json({ ok: false, error: "already_paid", detail: "This client has already paid — Paul looks after them from here." }, 409);
        const qcNow = (row.quick_close ?? null) as QcRecord | null;
        const now = new Date().toISOString();
        const plan = planQuickCloseSave(qcNow, rawIncoming, {
          ...("expect_route" in body ? { expectRoute: body.expect_route } : {}), routeChangeConfirmed: body.route_change === true, actorId: actor.id, nowIso: now,
        });
        if (!plan.ok) return json({ ok: false, error: plan.error, detail: plan.detail }, 409);
        const { prev, answers, changed, next, superseded } = plan;
        /* ⛔ THE DOWNSTREAM ROUTE LOCK: once a contract or an agreement acceptance exists, the route cannot
           change here (the agreement's own lock is paid-client-hub's — WS-3). Fails closed. */
        if (plan.routeChange) {
          if (!routeLockChecked) {
            if (lead.contract_total_payments != null) return json({ ok: false, error: "route_locked", detail: "This client's contract is already set — the route cannot change here. Ask Paul." }, 409);
            const { data: acc, error: accErr } = await service.from("client_agreement_acceptances").select("service_route, method").eq("lead_id", leadId).limit(5);
            if (accErr) return json({ ok: false, error: "route_lock_unreadable", detail: "Could not check the agreement record — the route was not changed. Try again in a moment." }, 503);
            if ((acc ?? []).length) {
              const r0 = ((acc ?? []) as Obj[])[0]?.service_route;
              return json({ ok: false, error: "route_locked", detail: `They have already accepted the client agreement${isRoute(r0) ? ` for ${SERVICE_ROUTE_NAME[r0]}` : ""}. The route cannot change here — ask Paul.` }, 409);
            }
            routeLockChecked = true;
          }
        }
        const gate = quickCloseGate(answers);
        const patch: Obj = { ...plan.cols, ...cols, updated_at: now };
        const stored = await writeQc(service, rowId, revOf(qcNow), next, patch);
        if (!stored) continue; // someone else wrote first: re-read and decide again
        /* The old link was for the old answers (B-16): it is closed at Stripe, so only one link can ever be paid. */
        if (superseded) {
          const result = await expireSession(superseded);
          await event(service, leadId, rowId, actor.id, "link_superseded", { reason: "answers_changed", session: superseded, result });
        }
        await event(service, leadId, rowId, actor.id, "answers_saved", { changed: Object.fromEntries(changed.map((k) => [k, { from: prev[k] ?? null, to: answers[k] ?? null }])), corrections: Object.keys(c), trade_set: !!trade });
        // A new review need tells Paul once per set of answers (the dedupe key carries the reasons).
        if (gate.complete && gate.review.length && !stored.review_approved_at) {
          const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
          const key = `qc_review:${rowId}:${gate.review.join(",")}`;
          if (owner?.user_id) {
            await service.from("notifications").upsert({
              user_id: owner.user_id, kind: "quick_close_review", title: "DOMAIN / AGENCY ISSUE — Paul review required",
              body: `${lead.business_name ?? "A lead"}: ${gate.review.map((r) => QC_REVIEW_TEXT[r]).join("; ")}.`,
              link: `/inbox?lead=${leadId}`, lead_id: leadId, priority: 2, dedupe_key: key,
            }, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
            await event(service, leadId, rowId, actor.id, "review_requested", { reasons: gate.review });
          }
        }
        row = { ...row, ...patch, id: rowId, quick_close: stored };
        return json(await view());
      }
      return json({ ok: false, error: "busy", detail: "Someone else is saving this Quick Close at the same moment — try again." }, 409);
    }

    if (mode === "approve_review") {
      if (actor.role !== "admin") { await recordDenial(service, actor.id, "quick-close:approve_review", leadId); return json({ ok: false, error: "admin_only", detail: "Only Paul can release a flagged Quick Close." }, 403); }
      if (!row) return json({ ok: false, error: "not_started" }, 409);
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) row = (await loadRow(service, row!.id)) ?? row;
        const qcNow = (row!.quick_close ?? null) as Obj | null;
        const next = { ...(qcNow ?? {}), review_approved_at: new Date().toISOString(), review_approved_by: actor.id, review_note: typeof body.note === "string" ? body.note.slice(0, 300) : null };
        const stored = await writeQc(service, row!.id, revOf(qcNow), next);
        if (!stored) continue;
        await event(service, leadId, row!.id, actor.id, "review_approved", { note: next.review_note });
        row = { ...row, quick_close: stored };
        return json(await view());
      }
      return json({ ok: false, error: "busy", detail: "Try again in a moment." }, 409);
    }

    /* ══ THE PAYMENT LINK ════════════════════════════════════════════════════════════════════════════
       🔴 M-014 (2026-10-04). ONE usable link per close, however many clicks or tabs:
         · a usable link (linkUsable) is reused;
         · otherwise ONE caller claims the row (a rev-conditional write) and creates the session; anyone
           else waits for that link;
         · after Stripe answers, the row is re-read: if an answer changed meanwhile, the new session is
           expired and the rep is told; if another tab's usable link is already there, ours is expired
           and theirs is shown; otherwise ours is stored (rev-conditional) and the link it REPLACES — an
           expired one, or one about to expire — is expired at Stripe. */
    if (mode === "generate_link") {
      if (!row) return json({ ok: false, error: "not_started", detail: "Answer the questions first." }, 409);
      const rowId = row.id as string;
      let claimedKey: string | null = null;
      for (let attempt = 0; attempt < 4 && claimedKey === null; attempt++) {
        if (attempt > 0) row = (await loadRow(service, rowId)) ?? row;
        if (row!.status === "paid") return json({ ok: false, error: "already_paid", detail: "This client has already paid." }, 409);
        const qc = (row!.quick_close ?? null) as QcRecord | null;
        const step = linkStep(row!.status, qc); // the gate, re-checked before any Stripe call
        if (step.kind === "refuse") {
          const s = step.state;
          await event(service, leadId, rowId, actor.id, "link_refused", { state: s });
          return json({ ok: false, error: s, detail: s === "blocked" ? "The decision maker needs to approve and sign up." : s === "consents_needed" ? "For a new website they need to confirm the three Build consents first (domain, DNS, content)." : s === "needs_review" ? "Domain / agency issue — Paul needs to review this first." : "Finish the questions first." }, 409);
        }
        if (step.kind === "reuse") {
          await event(service, leadId, rowId, actor.id, "link_reused", {});
          return json(await view());
        }
        if (step.kind === "wait") {
          // Another click / tab is making the link: wait for it, never make a second.
          for (let i = 0; i < 8; i++) {
            await sleep(1500);
            const again = await loadRow(service, rowId);
            const q2 = (again?.quick_close ?? null) as QcRecord | null;
            if (again && linkUsable(q2)) { row = again; return json(await view()); }
            if (!q2?.link_claimed_at) break;
          }
          continue;
        }
        const stored = await writeQc(service, rowId, revOf(qc), { ...(qc ?? {}), link_claimed_at: new Date().toISOString(), link_claimed_by: actor.id });
        if (stored) claimedKey = answersKey(stored.answers);
      }
      if (claimedKey === null) return json({ ok: false, error: "busy", detail: "Another click is creating the link — try again in a moment." }, 409);

      /** Give the claim back (only if it is still ours). */
      const release = async () => {
        for (let i = 0; i < 4; i++) {
          const r = await loadRow(service, rowId);
          const q = (r?.quick_close ?? null) as Obj | null;
          if (!q || q.link_claimed_by !== actor.id || !q.link_claimed_at) return;
          if (await writeQc(service, rowId, revOf(q), { ...q, link_claimed_at: null, link_claimed_by: null })) return;
        }
      };
      // THE CANONICAL CHECKOUT, server to server (no browser origin → the configured site origin).
      const startedMs = Date.now();
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/findable-checkout`, {
        method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_id: rowId, lead_id: leadId }),
      });
      const out = await res.json().catch(() => ({})) as Obj;
      if (!res.ok || !out.ok || typeof out.url !== "string") {
        await release();
        await event(service, leadId, rowId, actor.id, "link_refused", { checkout_error: out.error ?? res.status, reason: out.reason ?? out.reasons ?? null });
        return json({ ok: false, error: out.error ?? "checkout_failed", detail: CHECKOUT_REFUSAL_TEXT[out.error] ?? "The payment link could not be created." }, res.status >= 400 && res.status < 500 ? res.status : 502);
      }
      const ours = { url: out.url as string, session: (typeof out.session_id === "string" ? out.session_id : null) ?? stripeSessionIdFromUrl(out.url) };
      const expiresMs = typeof out.expires_at === "number" ? out.expires_at * 1000 : startedMs + STRIPE_SESSION_LIFETIME_MS;
      for (let attempt = 0; attempt < 4; attempt++) {
        const fresh = await loadRow(service, rowId);
        const fq = (fresh?.quick_close ?? null) as QcRecord | null;
        const now = new Date().toISOString();
        const adopt = adoptLink(fresh?.status ?? "paid", fq, claimedKey, { url: ours.url, session: ours.session, expiresIso: new Date(expiresMs).toISOString() }, actor.id, now);
        if (adopt.kind === "paid") {
          await expireSession(ours.session);
          return json({ ok: false, error: "already_paid", detail: "This client has already paid." }, 409);
        }
        if (adopt.kind === "answers_changed") {
          const result = await expireSession(ours.session);
          await release();
          await event(service, leadId, rowId, actor.id, "link_refused", { reason: "answers_changed_during_generation", session: ours.session, result });
          row = fresh;
          return json({ ok: false, error: "answers_changed", detail: "An answer changed while the link was being made, so that link was cancelled. Check the answers, then make the link again." }, 409);
        }
        if (adopt.kind === "other_won") {
          // Another tab's link landed first: it is the one link. Ours is closed at Stripe.
          const result = await expireSession(ours.session);
          await event(service, leadId, rowId, actor.id, "link_superseded", { reason: "duplicate_generation", session: ours.session, result });
          row = fresh;
          return json(await view());
        }
        const stored = await writeQc(service, rowId, revOf(fq), adopt.next);
        if (!stored) continue;
        if (adopt.replaced) {
          const result = await expireSession(adopt.replaced);
          await event(service, leadId, rowId, actor.id, "link_superseded", { reason: "fresh_link", session: adopt.replaced, result });
        }
        await event(service, leadId, rowId, actor.id, "link_generated", { assigned_to: lead.assigned_to_user_id ?? null, session: ours.session, replaced: adopt.replaced });
        row = { ...fresh, quick_close: stored };
        return json(await view());
      }
      await expireSession(ours.session);
      await release();
      return json({ ok: false, error: "busy", detail: "The link could not be saved because the Quick Close kept changing — try again." }, 409);
    }

    /* ══ SHARE THE LINK (M-015, 2026-10-04) ═══════════════════════════════════════════════════════════
       After a phone call the WhatsApp window is usually shut, so the rep needs more than "copy". Each
       share is recorded on the row (link_shared), in quick_close_events and in the lead's History.
       ⛔ HONEST: a copy is "copied", never "sent"; a WhatsApp is recorded only when the canonical sender
       answered ok (and says when it was a test-mode simulation); an email only when Resend accepted it. */
    if (mode === "share_link") {
      const channel = body.channel;
      if (channel !== "copy" && channel !== "email" && channel !== "whatsapp") return json({ ok: false, error: "bad_request" }, 400);
      if (!row) return json({ ok: false, error: "not_started", detail: "Answer the questions first." }, 409);
      const qc = (row.quick_close ?? null) as (QuickCloseRecord & Obj) | null;
      if (!linkUsable(qc)) return json({ ok: false, error: "link_expired", detail: "This payment link has expired. Make a fresh link first." }, 409);
      const route = cleanAnswers(qc!.answers).route;
      if (!route) return json({ ok: false, error: "route_undecided", detail: CHECKOUT_REFUSAL_TEXT.route_undecided }, 409);
      const url = qc!.link_url as string;
      const session = (qc!.link_session_id as string | null) ?? stripeSessionIdFromUrl(url);
      const greetName = row.contact_name ?? lead.contact_name ?? null;
      const share: QcLinkShare = { channel, at: new Date().toISOString(), by: actor.id, session };

      if (channel === "copy") {
        // A second copy by the same person inside two minutes is the same act — not a second History row.
        const last = ((qc!.link_shared ?? []) as QcLinkShare[]).slice(-1)[0];
        if (last && last.channel === "copy" && last.by === actor.id && last.session === session && Date.now() - Date.parse(last.at) < 120_000) return json(await view());
      }
      if (channel === "email") {
        const to = (typeof body.to === "string" && body.to.trim() ? body.to.trim() : (shareEmailOf(row) ?? "")).toLowerCase();
        if (!EMAIL_RE.test(to)) return json({ ok: false, error: "no_email", detail: "There is no usable email address for them. Add one under \"Correct a detail\", or copy the link." }, 409);
        const sup = await checkSuppressed(service, { email: to, leadId });
        if (sup.suppressed) {
          return json({ ok: false, error: sup.matchedOn === "lookup_failed" ? "suppression_unreadable" : "suppressed", detail: sup.matchedOn === "lookup_failed" ? "Could not check the do-not-contact list, so nothing was sent. Try again in a moment." : "They are on the do-not-contact list, so nothing was sent. Ask Paul." }, sup.matchedOn === "lookup_failed" ? 503 : 409);
        }
        /* ⛔ QA (src/lib/qaSafety.ts): a test lead's email goes ONLY to the QA sink. Fails closed. */
        let qaRefusal: string | null;
        try { qaRefusal = await qaEmailHold(service, leadId, to); } catch { return json({ ok: false, error: "qa_guard_unavailable", detail: "Could not run the safety check, so nothing was sent. Try again in a moment." }, 503); }
        if (qaRefusal) return json({ ok: false, error: "qa_email_sink_only", detail: qaRefusal }, 409);
        const key = Deno.env.get("RESEND_API_KEY");
        if (!key) return json({ ok: false, error: "email_unconfigured", detail: "Email is not configured." }, 500);
        const { data: me } = await service.from("team_members").select("display_name").eq("user_id", actor.id).maybeSingle();
        const mail = quickCloseEmail({ greetName, businessName: lead.business_name, url, route, senderName: (me?.display_name as string | undefined) ?? null });
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Findable <alerts@findable.live>", to: [to], reply_to: FINDABLE_CONTACT_EMAIL, subject: mail.subject, text: mail.text }),
        });
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          await service.from("client_error_reports").insert({ error_id: "quick_close_link_email_failed", context: { lead_id: leadId, status: res.status, detail } });
          await event(service, leadId, row.id, actor.id, "link_share_failed", { channel, status: res.status });
          return json({ ok: false, error: "email_failed", detail: "The email did not send. Try again in a moment, or copy the link." }, 502);
        }
        share.to = to; share.status = "sent";
      }
      if (channel === "whatsapp") {
        if (!lead.phone) return json({ ok: false, error: "no_phone", detail: "There is no phone number for them." }, 409);
        if (!serviceWindowState(await lastInboundAt()).open) return json({ ok: false, error: "window_closed", detail: WHATSAPP_REFUSAL_TEXT.window_closed }, 409);
        /* THE CANONICAL SENDER, AS THE CALLER: its window, QA, suppression and ownership rules decide. */
        const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
          method: "POST", headers: { apikey: anon, Authorization: req.headers.get("authorization") ?? "", "Content-Type": "application/json" },
          body: JSON.stringify({ phone: lead.phone, lead_id: leadId, body: quickCloseMessage(greetName, url, route) }),
        });
        const out = await res.json().catch(() => ({})) as Obj;
        if (!res.ok || !out.ok) {
          const code = String(out.error ?? (res.ok ? "send_failed" : `http_${res.status}`));
          await event(service, leadId, row.id, actor.id, "link_share_failed", { channel, error: code });
          return json({ ok: false, error: code, detail: WHATSAPP_REFUSAL_TEXT[code] ?? String(out.reason ?? out.detail ?? "WhatsApp did not send it. Email the link or copy it instead.") }, 409);
        }
        share.status = out.simulated ? "simulated" : String(out.status ?? "sent");
      }

      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) row = (await loadRow(service, row!.id)) ?? row;
        const q = (row!.quick_close ?? null) as Obj | null;
        const stored = await writeQc(service, row!.id, revOf(q), { ...(q ?? {}), link_shared: [...((q?.link_shared ?? []) as QcLinkShare[]), share].slice(-MAX_SHARES) });
        if (!stored) continue;
        row = { ...row, quick_close: stored };
        break;
      }
      await event(service, leadId, row!.id, actor.id, "link_shared", { channel, to: share.to ?? null, status: share.status ?? null, session });
      const bodyText = channel === "copy" ? "Payment link copied (to send by hand — not confirmed as sent)"
        : channel === "email" ? `Payment link emailed to ${share.to}`
        : share.status === "simulated" ? "Payment link sent on WhatsApp (test mode — not delivered)" : "Payment link sent on WhatsApp";
      const { error: hErr } = await service.from("lead_activity").insert({
        lead_id: leadId, actor_user_id: actor.id, kind: "payment_link_shared", body: bodyText,
        data: { source: actor.role === "admin" ? "admin" : "sales", channel, status: share.status ?? null, session, route },
      });
      if (hErr) console.error("[quick-close] history write failed (non-blocking):", hErr.message);
      return json(await view());
    }
    return json({ ok: false, error: "unknown_mode" }, 400);
  } catch (e) {
    console.error("[quick-close]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Quick Close could not be loaded. Try again in a moment." }, 500);
  }
});
