import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor, leadAccess } from "../_shared/access.ts";
import { recordDenial } from "../_shared/protection.ts";
import { NOT_READY_BODY, salesReadiness } from "../_shared/sales-ready.ts";
import {
  adoptLink, answersKey, buildConsentsFor, buildConsentsWording, cleanAnswers, linkExpiresAtMs, linkStep, linkUsable, linkUsableUntilMs, planQuickCloseSave,
  quickCloseEmail, quickCloseGate, quickCloseMessage, quickCloseState, QC_REVIEW_TEXT, QC_REVIEW_HEADING, paulFlagText, deliveryApproach, STRIPE_SESSION_LIFETIME_MS,
  stripeSessionIdFromUrl, quickCloseClosedRefusal, cleanCallNotes, splitCallList, offerFit, callNotesLines, closeRouteOf, phoneCloseNotesComplete, quickCloseGreeting, type QcLinkShare, type QcRecord, type QuickCloseRecord,
} from "../../../src/lib/quickClose.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { decideLinkRoute, LINK_ROUTE_SAY, type ConversationFacts } from "../../../src/lib/paymentLinkRoute.ts";
import { SIGNUP_LINK_TEMPLATE_NAME, setupLinkUrl, templateSendState } from "../../../src/lib/whatsappLinkTemplates.ts";
import { templateAvailability } from "../_shared/template-status.ts";
import {
  cleanHandoff, handoffChangedKeys, handoffComplete, handoffMissing, handoffPrefill, handoffWithPrefill, HANDOFF_QUESTIONS, SALES_HANDOFF_SINCE,
  HANDOFF_SEND_REFUSAL_TEXT, handoffSendRefusal, handoffSentBody, handoffSentTitle,
  type SalesHandoffFields, type SalesHandoffRecord,
} from "../../../src/lib/salesHandoff.ts";
import { FINDABLE_CONTACT_EMAIL, SERVICE_ROUTE_NAME, serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";
import { loadClientSetup, recordLeadEvent, submitForDelivery } from "../_shared/client-setup.ts";
import { sendOperatorAlert } from "../_shared/operator-alert.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { qaEmailHold } from "../_shared/qa-guard.ts";
import { answerClientInfoRequest, openRequestFor, CLIENT_INFO_REQUEST_COLUMNS } from "../_shared/client-info-request.ts";
import { cleanSellerClientInfo, MISSING_INFO_LABEL } from "../../../src/lib/clientMissingInfo.ts";

// quick-close — QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9;
// fixes 2026-10-04: docs/pre-sales-certification/fixes-02-quick-close.md).
//
// Modes: load · save · save_call · approve_review (admin) · generate_link · share_link · share_setup · save_handoff · send_to_paul · save_client_info · submit_delivery · my_handoffs.
// ⛔ 2026-10-07 (docs/pre-sales-certification/sales-close-handoff-australia.md): the CALL screen saves its
//   answers here as they are given (enumerated ones through `save`, free text through `save_call`), so Quick
//   Close and the handoff never ask them again. A WhatsApp share of the link follows Paul's rule
//   (paymentLinkRoute.ts): we messaged them AND they replied AND the 24-hour window is open — otherwise an
//   approved template (none approved yet → refused) — otherwise copy / email, never a pretend "sent".
// ⛔ THE SALES HANDOFF (2026-10-02, src/lib/salesHandoff.ts) is what a salesperson may still write AFTER
//   payment, and only on their OWN sale (sold_by_user_id) — it lands on outreach_leads.sales_handoff
//   through cleanHandoff. Since 2026-10-05 (client missing-info actions) the seller may also ADD the client
//   details Sales already records on the lead — services_included / service_areas / website (only where
//   none is on file) / website_control — through cleanSellerClientInfo (an allowlist that never clears),
//   never anything else on the lead. Either save answers Paul's open request (client_info_requests).
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
  checkout_failed: "The sign-up link could not be created. Try again in a moment.",
  agreement_unavailable: "The client agreement page could not be set up. Try again in a moment.",
  payment_held: "They already paid outside the signed sign-up and that payment is held for Paul. Ask Paul before sending anything.",
};

/** What send-whatsapp-message's refusals mean to a rep on the phone. Anything else shows its own reason. */
const WHATSAPP_REFUSAL_TEXT: Record<string, string> = {
  window_closed: "The WhatsApp window is closed (they haven't messaged in the last 24 hours). Email the link or copy it instead.",
  forbidden: "This lead is no longer yours to message — if they have paid, Paul looks after them now.",
  opted_out: "They asked us not to contact them. Nothing was sent.",
  wrong_number: "This number is marked Wrong number. Nothing was sent.",
  lead_archived: "This lead is archived. Nothing was sent.",
  qa_test_account: "Not sent: this is a test account or a lead held by one.",
  not_messaged: LINK_ROUTE_SAY.not_messaged + " Email the link or copy it instead.",
  no_reply: LINK_ROUTE_SAY.no_reply + " Email the link or copy it instead.",
  template_not_approved: "WhatsApp signup template awaiting approval — copy the sign-up link or email it instead.",
  pitch_already_sent: "The sign-up link was already sent to them on WhatsApp. Press Resend if you really mean to send it again.",
  link_unavailable: "There is no usable sign-up link to send — make a fresh one first.",
};

const LEAD_COLS = "id, user_id, business_name, phone, country, email, website, address, search_location, derived_town, category, search_keyword, contact_name, campaign_id, lead_source, assigned_to_user_id, sold_by_user_id, amount_paid, status, rating, review_count, google_maps_url, place_id, website_control, sales_handoff, delivery_submitted_at, contract_total_payments, service_terminated_at, services_included, service_areas";
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

/** The Full Setup link's send history, oldest first: payment_link_shared rows marked variant 'setup'. */
async function setupShareHistory(service: Service, leadId: string): Promise<{ channel: string; at: string; status: string | null; template: string | null }[]> {
  const { data, error } = await service.from("lead_activity").select("created_at, data").eq("lead_id", leadId).eq("kind", "payment_link_shared").order("created_at", { ascending: false }).limit(40);
  if (error) { console.error("[quick-close] setup share history read failed (non-blocking):", error.message); return []; }
  return ((data ?? []) as Obj[]).filter((r) => r.data?.variant === "setup")
    .map((r) => ({ channel: String(r.data?.channel ?? ""), at: String(r.created_at), status: (r.data?.status as string | null) ?? null, template: (r.data?.template as string | null) ?? null }))
    .reverse().slice(-10);
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
    /* ⛔ READY TO SELL (2026-10-05, docs/salesperson-onboarding.md): a salesperson who has not finished
       onboarding cannot start or advance a sale — no Quick Close answers, no payment link, no sharing it.
       Reading, and finishing the handoff for a sale ALREADY made, stay open. The admin is never gated. */
    if (actor.role === "sales" && (mode === "save" || mode === "save_call" || mode === "generate_link" || mode === "share_link" || mode === "share_setup")) {
      const readiness = await salesReadiness(service, actor.id);
      if (!readiness.ready) {
        await recordDenial(service, actor.id, `quick-close:${mode}:not_ready`, typeof body.lead_id === "string" ? body.lead_id : null, { missing: readiness.missing });
        return json(NOT_READY_BODY, 403);
      }
    }
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
      /* Paul's open requests to THIS salesperson (client missing-info actions, 2026-10-05). Only their own
         (seller_user_id = the caller); a failed read shows the list without them rather than nothing. */
      const asked = new Map<string, Obj>();
      {
        const r = await service.from("client_info_requests").select(CLIENT_INFO_REQUEST_COLUMNS).eq("seller_user_id", actor.id).is("closed_at", null);
        if (r.error) console.error("[quick-close] my requests read failed (non-blocking):", r.error.message);
        for (const q of (r.data ?? []) as Obj[]) asked.set(String(q.lead_id), q);
      }
      /* Send to Paul (2026-10-06): which of these sales the caller has already sent. */
      const sentIds = new Set<string>();
      {
        const ids = ((data ?? []) as Obj[]).map((l) => String(l.id));
        if (ids.length) {
          const r = await service.from("client_handoff_sends").select("lead_id").in("lead_id", ids);
          if (r.error) console.error("[quick-close] my sends read failed (non-blocking):", r.error.message);
          for (const s of (r.data ?? []) as Obj[]) sentIds.add(String(s.lead_id));
        }
      }
      const sales = ((data ?? []) as Obj[]).filter((l) => isPaidLead(l)).map((l) => ({
        sent_to_paul: sentIds.has(String(l.id)),
        id: l.id, business_name: l.business_name, paid_on: (l.payment_date ?? "").slice(0, 10),
        handoff_complete: handoffComplete(l.sales_handoff as SalesHandoffRecord | null),
        missing: handoffMissing(l.sales_handoff as SalesHandoffRecord | null).length,
        submitted: !!l.delivery_submitted_at,
        info_request: asked.has(String(l.id)) ? {
          requested_at: asked.get(String(l.id))!.requested_at,
          items: ((asked.get(String(l.id))!.items ?? []) as string[]).map((k) => MISSING_INFO_LABEL[k] ?? k),
        } : null,
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
    /* SEND TO PAUL (2026-10-06): the one send row for this client, if any (client_handoff_sends, unique per lead). */
    const handoffSendFor = async (id: string): Promise<Obj | null> => {
      const { data, error } = await service.from("client_handoff_sends").select("sent_at,sent_by_user_id,sent_by_name,sent_by_role,paid_when_sent,onboarding_id").eq("lead_id", id).maybeSingle();
      if (error) { console.error("[quick-close] handoff send read failed (non-blocking):", error.message); return null; }
      return (data ?? null) as Obj | null;
    };
    /* THE HANDOFF SAVE — one path for save_handoff and send_to_paul. A key sent blank CLEARS that answer; a
       key not sent is left alone. Complete is stamped once, on the first save with every required answer.
       History: "completed" once, then each material change. */
    const saveHandoffFrom = async (raw: Obj): Promise<{ ok: true } | { ok: false; detail: string }> => {
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
      if (prev?.saved_at && !changed.length) return { ok: true };
      const now = new Date().toISOString();
      const firstComplete = handoffMissing(fields).length === 0 && !prev?.completed_at;
      const next: SalesHandoffRecord = {
        ...fields, saved_at: now, saved_by: actor.id,
        completed_at: prev?.completed_at ?? (firstComplete ? now : null), completed_by: prev?.completed_by ?? (firstComplete ? actor.id : null),
      };
      const { error } = await service.from("outreach_leads").update({ sales_handoff: next }).eq("id", leadId);
      if (error) return { ok: false, detail: error.message };
      if (firstComplete || (changed.length && prev?.completed_at)) {
        await recordLeadEvent(service, leadId, "handoff_saved", {
          actor: actor.id, source: actor.role === "admin" ? "admin" : "sales",
          body: firstComplete ? "Sales handoff completed" : "Sales handoff updated",
          data: { changed, after_submission: !!lead.delivery_submitted_at },
        });
      }
      lead.sales_handoff = next;
      return { ok: true };
    };

    const lastInboundAt = async (): Promise<string | null> => {
      const { data } = await service.from("whatsapp_messages").select("created_at").eq("lead_id", leadId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1);
      return ((data ?? []) as Obj[])[0]?.created_at ?? null;
    };
    /** Paul's link rule needs the whole shape of the conversation: our first real message and their latest. */
    const conversation = async (): Promise<ConversationFacts> => {
      const [lastIn, firstOut] = await Promise.all([
        lastInboundAt(),
        service.from("whatsapp_messages").select("created_at").eq("lead_id", leadId).eq("direction", "outbound").or("status.is.null,status.neq.failed").order("created_at", { ascending: true }).limit(1),
      ]);
      return { hasPhone: !!lead.phone, firstOutboundAt: (((firstOut as { data?: Obj[] }).data ?? [])[0]?.created_at as string | undefined) ?? null, lastInboundAt: lastIn };
    };
    const shareEmailOf = (r: Obj | null): string | null => {
      const e = String(r?.contact_email || lead.email || "").trim().toLowerCase();
      return EMAIL_RE.test(e) ? e : null;
    };

    const view = async () => {
      const [convo, camp, seller, events, infoRequest] = await Promise.all([
        conversation(),
        /* ⛔ Campaigns are private to their owner (2026-10-03): a salesperson is told the name only of a campaign they own. */
        lead.campaign_id ? (actor.role === "sales" ? service.from("campaigns").select("name").eq("id", lead.campaign_id).eq("created_by", actor.id).maybeSingle() : service.from("campaigns").select("name").eq("id", lead.campaign_id).maybeSingle()) : Promise.resolve({ data: null }),
        (lead.assigned_to_user_id ?? lead.sold_by_user_id) ? service.from("team_members").select("display_name").eq("user_id", lead.assigned_to_user_id ?? lead.sold_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
        service.from("quick_close_events").select("kind, created_at, actor_user_id, data").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(12),
        /* Paul's open request for missing information — shown to the SELLER it is addressed to (and the admin). */
        paidLead && (actor.role === "admin" || lead.sold_by_user_id === actor.id)
          ? openRequestFor(service, leadId).catch((e: unknown) => { console.error("[quick-close] request read failed (non-blocking):", e instanceof Error ? e.message : e); return null; })
          : Promise.resolve(null),
      ]);
      const sent = await handoffSendFor(leadId);
      /* FULL SETUP (2026-10-07): how the client's own set-up link has gone out — read from the lead's History, never assumed. */
      const setupShares = await setupShareHistory(service, leadId);
      const cur = (row?.quick_close ?? null) as (QuickCloseRecord & Obj) | null;
      const answers = cleanAnswers(cur?.answers);
      const nowMs = Date.now();
      /* THE HANDOFF, with what we already know pre-filled (saved answers win). After payment, the
         client's setup checklist too — the same loader Paid Clients uses — so the seller sees what is
         still missing and may submit for delivery when everything required is in. */
      const saved = (lead.sales_handoff ?? null) as SalesHandoffRecord | null;
      const callNotes = cleanCallNotes(cur?.call);
      const pre = handoffPrefill({
        quickClose: answers, route: serviceRouteFromRow(row as never), websiteControl: lead.website_control ?? null,
        hasWebsite: lead.website ? true : null, contactName: row?.contact_name ?? lead.contact_name ?? null, call: callNotes,
      });
      const hasWebsite = !!(String(row?.business_website ?? "").trim() || String(lead.website ?? "").trim());
      /* Meta's LIVE status of findable_signup_link (cached; never hard-coded) and Paul's link rule. */
      const signupTemplate = await templateAvailability(service, SIGNUP_LINK_TEMPLATE_NAME);
      const signupTemplateState = templateSendState(signupTemplate, "signup");
      const linkRoute = decideLinkRoute(convo, { template: signupTemplateState });
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
          /* SEND TO PAUL (2026-10-06): the one authoritative send, if made. Changed after = a later save. */
          sent: sent ? {
            at: sent.sent_at, by: sent.sent_by_name ?? null, by_me: sent.sent_by_user_id === actor.id, paid_when_sent: sent.paid_when_sent === true,
            changed_since: !!saved?.saved_at && Date.parse(String(saved.saved_at)) > Date.parse(String(sent.sent_at)) + 1000,
          } : null,
        },
        setup,
        /* CLIENT INFO NEEDED (2026-10-05): what Paul asked for, and the client details the seller may add. */
        info_request: infoRequest && (actor.role === "admin" || (infoRequest as Obj).seller_user_id === actor.id) ? {
          requested_at: (infoRequest as Obj).requested_at, reminded_at: (infoRequest as Obj).reminded_at ?? null,
          items: (((infoRequest as Obj).items ?? []) as string[]).map((k) => ({ key: k, label: MISSING_INFO_LABEL[k] ?? k })),
        } : null,
        client_info: paidLead ? {
          /* already_paid is every paid client — only an ENDED / refunded one stops the seller adding details. */
          canEdit: mayHandoff && closedNow?.error !== "client_closed",
          services: (lead.services_included ?? []) as string[], service_areas: (lead.service_areas ?? []) as string[],
          website: lead.website ?? null, website_control: lead.website_control ?? null,
        } : null,
        canEdit: access.ok && row?.status !== "paid" && !closedNow,
        closed: closedNow?.error ?? null,
        /* THE TWO WAYS TO CLOSE: which one this sign-up is on (a salesperson's answers on the row = phone), and the
           Full Setup link with how it has been sent. Neither is a Stripe URL. */
        close_route: closeRouteOf(cur),
        full_setup: { url: setupLinkUrl(leadId), shared: setupShares },
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
        review: { approved_at: cur?.review_approved_at ?? null, reasons: quickCloseGate(answers).review.map((r) => QC_REVIEW_TEXT[r]),
          /* v2: for Paul after payment, never a stop (domain handoff, an exact copy without confirmed rights). */
          flags: quickCloseGate(answers).flags.map((f) => paulFlagText(f, answers)), delivery_approach: deliveryApproach(answers) },
        link: cur?.link_url && cur.link_generated_at ? {
          url: usable ? cur.link_url : null, usable, generated_at: cur.link_generated_at,
          expires_at: exp ? new Date(exp).toISOString() : null, usable_until: until ? new Date(until).toISOString() : null, shared: shared.slice(-MAX_SHARES),
        } : null,
        share: { email: shareEmailOf(row), hasPhone: !!lead.phone },
        windowOpen: serviceWindowState(convo.lastInboundAt).open,
        /* 2026-10-07: Paul's WhatsApp link rule, decided here once (paymentLinkRoute.ts). */
        link_route: { ...linkRoute, template: { name: SIGNUP_LINK_TEMPLATE_NAME, status: signupTemplate.status, category: signupTemplate.category, checked_at: signupTemplate.checked_at, label: signupTemplateState.label, sendable: signupTemplateState.sendable, say: signupTemplateState.say } },
        /* What the call screen heard, and the offer it points to (the agency-contract rule). */
        call: callNotes,
        call_lines: callNotesLines(answers, callNotes),
        offer: offerFit(answers, hasWebsite),
        has_website: hasWebsite,
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
      const saved = await saveHandoffFrom(raw);
      if (!saved.ok) return json({ ok: false, error: "not_saved", detail: saved.detail }, 500);
      /* The SELLER answered (any save counts as their response); the admin's own edit never closes it. */
      if (actor.role === "sales" && lead.sold_by_user_id === actor.id && paidLead) {
        const { data: me } = await service.from("team_members").select("display_name").eq("user_id", actor.id).maybeSingle();
        await answerClientInfoRequest(service, { leadId, actorId: actor.id, actorName: (me?.display_name as string | undefined) ?? null, businessName: lead.business_name ?? null, what: "Sales handoff updated" });
      }
      return json(await view());
    }

    /* ══ SEND TO PAUL (2026-10-06, src/lib/salesHandoff.ts handoffSendRefusal) ═══════════════════════════
       The salesperson's last act, before or after payment: saves what the screen holds (the same save path),
       re-checks every required answer ON THE SERVER, then writes the ONE send row (client_handoff_sends,
       unique per lead) — who sent it (name kept), when, the sign-up it belongs to, the answers as sent.
       Only the WINNING insert records History and tells Paul (the bell, "NEW CLIENT HANDOFF"); a double press,
       a retry or a second tab reads the first send back. ⛔ It never messages the client and never touches
       the route, the price, the agreement or the seller stamp. */
    if (mode === "send_to_paul") {
      if (!mayHandoff) {
        await recordDenial(service, actor.id, "quick-close:send_to_paul", leadId);
        return json({ ok: false, error: "not_your_sale", detail: paidLead ? "Only the salesperson who made this sale can send its handoff." : "That lead is not assigned to you." }, 403);
      }
      const closed = quickCloseClosedRefusal(lead as never, row as never)?.error === "client_closed";
      if (body.handoff && typeof body.handoff === "object" && !closed) {
        const saved = await saveHandoffFrom(body.handoff as Obj);
        if (!saved.ok) return json({ ok: false, error: "not_saved", detail: saved.detail }, 500);
      }
      const fields = cleanHandoff(lead.sales_handoff);
      const refusal = handoffSendRefusal({ fields, closed });
      if (refusal) return json({ ok: false, error: refusal, detail: HANDOFF_SEND_REFUSAL_TEXT[refusal], missing: handoffMissing(fields) }, 409);
      if (await handoffSendFor(leadId)) return json(await view());
      const { data: me } = await service.from("team_members").select("display_name").eq("user_id", actor.id).maybeSingle();
      const sellerName = (me?.display_name as string | undefined) ?? null;
      const answers = cleanAnswers((row?.quick_close as { answers?: unknown } | null)?.answers);
      const { error: insErr } = await service.from("client_handoff_sends").insert({
        lead_id: leadId, onboarding_id: (row?.id as string | undefined) ?? null, sent_by_user_id: actor.id, sent_by_name: sellerName,
        sent_by_role: actor.role === "admin" ? "admin" : "sales", paid_when_sent: paidLead, handoff: fields,
        close_summary: { answers, route: serviceRouteFromRow(row as never) ?? null },
      });
      if (insErr) {
        /* 23505 = another press won the same instant — that send stands, nothing more to do. */
        if ((insErr as { code?: string }).code === "23505") return json(await view());
        return json({ ok: false, error: "not_sent", detail: "Not sent — try again." }, 500);
      }
      await recordLeadEvent(service, leadId, "handoff_sent", {
        actor: actor.id, source: actor.role === "admin" ? "admin" : "sales",
        body: `Handoff sent to Paul by ${sellerName ?? "the salesperson"}${paidLead ? "" : " · awaiting payment"}`,
        data: { onboarding_id: (row?.id as string | undefined) ?? null, paid_when_sent: paidLead, snapshot: fields },
      });
      /* Paul's own send needs no notice to himself. Everyone else's lands in his bell, once (the dedupe key). */
      if (actor.role !== "admin") {
        try {
          const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
          if (owner?.user_id) {
            await service.rpc("notify_person", {
              _user: owner.user_id, _kind: "client_handoff", _title: handoffSentTitle(lead.business_name),
              _body: handoffSentBody({ sellerName, paid: paidLead }),
              _link: paidLead ? `/paid-clients/${leadId}` : `/paid-clients?handoff=${leadId}`, _lead: leadId,
              _dedupe: `handoff_sent:${leadId}`, _priority: 2,
            });
          }
        } catch (e) { console.error("[quick-close] handoff notice failed (non-blocking):", e instanceof Error ? e.message : e); }
      }
      /* The seller sending after payment answers Paul's open request too (as a save does). */
      if (actor.role === "sales" && lead.sold_by_user_id === actor.id && paidLead) {
        await answerClientInfoRequest(service, { leadId, actorId: actor.id, actorName: sellerName, businessName: lead.business_name ?? null, what: "Sales handoff sent" });
      }
      return json(await view());
    }

    /* ══ SAVE THE CLIENT DETAILS THE SELLER COLLECTED (after payment; client missing-info actions) ═══════
       Only the seller of THIS client (or the admin). An allowlist that only ADDS (cleanSellerClientInfo):
       services / areas / a website where none is on file / who controls the site. Recorded as details_set
       (the same History kind as lead_set_profile); the seller's save answers Paul's open request. */
    if (mode === "save_client_info") {
      if (!paidLead) return json({ ok: false, error: "not_paid", detail: "Before payment, record services and areas on the lead's Details." }, 409);
      if (!mayHandoff) {
        await recordDenial(service, actor.id, "quick-close:save_client_info", leadId);
        return json({ ok: false, error: "not_your_sale", detail: "Only the salesperson who made this sale can add its details." }, 403);
      }
      if (quickCloseClosedRefusal(lead as never, row as never)?.error === "client_closed") return json({ ok: false, error: "client_closed", detail: "This client's engagement has ended." }, 409);
      const { patch, changed, refused } = cleanSellerClientInfo(body.client_info, { website: lead.website ?? null });
      if (!changed.length) return json({ ok: false, error: "nothing_to_save", detail: refused[0] ?? "Add at least one detail first." }, 400);
      const { error } = await service.from("outreach_leads").update(patch).eq("id", leadId);
      if (error) return json({ ok: false, error: "not_saved", detail: "Not saved — try again." }, 500);
      Object.assign(lead, patch);
      const shown: Obj = {};
      if (patch.services_included) shown.services = patch.services_included;
      if (patch.service_areas) shown.service_areas = patch.service_areas;
      if (patch.website) shown.website = patch.website;
      if (patch.website_control) shown.website_control = patch.website_control;
      const { error: actErr } = await service.from("lead_activity").insert({ lead_id: leadId, actor_user_id: actor.id, kind: "details_set", data: { ...shown, source: actor.role === "admin" ? "admin" : "sales", after_payment: true } });
      if (actErr) console.error("[quick-close] details_set not recorded:", actErr.message);
      if (actor.role === "sales" && lead.sold_by_user_id === actor.id) {
        const { data: me } = await service.from("team_members").select("display_name").eq("user_id", actor.id).maybeSingle();
        const what = ["Client details added:", [patch.services_included && "services", patch.service_areas && "service areas", patch.website && "website", patch.website_control && "who controls the website"].filter(Boolean).join(", ")].join(" ");
        await answerClientInfoRequest(service, { leadId, actorId: actor.id, actorName: (me?.display_name as string | undefined) ?? null, businessName: lead.business_name ?? null, what });
      }
      return json({ ...(await view()), refused });
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

    /* ══ SAVE WHAT THE CALL HEARD (2026-10-07) ═══════════════════════════════════════════════════════════
       The Call screen's free-text answers — the jobs they want more of, the areas that matter, roughly what they
       pay their agency — kept on THIS close (quick_close.call, cleanCallNotes), rev-conditional like every write.
       A key sent blank clears it; a key not sent is left alone. The jobs / areas also fill the lead's services /
       service areas when those are blank (or still hold exactly what the call put there) — the same lead fields
       the Details tab, the setup checklist and the paid-client intake read, so nobody asks again. */
    if (mode === "save_call") {
      const raw = (body.call && typeof body.call === "object" ? body.call : {}) as Obj;
      const sentKeys = (["jobs", "areas", "agency_monthly_gbp"] as const).filter((k) => k in raw);
      if (!sentKeys.length) return json({ ok: false, error: "bad_request" }, 400);
      const incoming = cleanCallNotes(raw);
      const rowId: string = row?.id ?? (await service.rpc("quick_close_row", { _lead_id: leadId, _business_name: lead.business_name ?? null })).data;
      if (!rowId) return json({ ok: false, error: "not_saved" }, 500);
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0 || !row || row.id !== rowId) row = await loadRow(service, rowId);
        if (!row) return json({ ok: false, error: "not_saved" }, 500);
        if (row.status === "paid") return json({ ok: false, error: "already_paid", detail: "This client has already paid — Paul looks after them from here." }, 409);
        const qcNow = (row.quick_close ?? null) as QcRecord | null;
        const prevNotes = cleanCallNotes(qcNow?.call);
        const nextNotes: Obj = { ...prevNotes };
        for (const k of sentKeys) { if ((incoming as Obj)[k] !== undefined) nextNotes[k] = (incoming as Obj)[k]; else delete nextNotes[k]; }
        const now = new Date().toISOString();
        const stored = await writeQc(service, rowId, revOf(qcNow), { ...(qcNow ?? {}), call: { ...nextNotes, saved_at: now, saved_by: actor.id } }, { updated_at: now });
        if (!stored) continue;
        row = { ...row, quick_close: stored };
        /* Fill the lead's lists only where they are blank, or still exactly what the call wrote before. */
        const patch: Obj = {};
        const sameList = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => String(x) === b[i]);
        for (const [key, col] of [["jobs", "services_included"], ["areas", "service_areas"]] as const) {
          if (!sentKeys.includes(key)) continue;
          const cur = lead[col] as unknown;
          const blank = !Array.isArray(cur) || cur.length === 0;
          const fromCall = sameList(cur, splitCallList(prevNotes[key]));
          const next = splitCallList(nextNotes[key]);
          if ((blank || fromCall) && next.length && !sameList(cur, next)) patch[col] = next;
        }
        if (Object.keys(patch).length) {
          const { error } = await service.from("outreach_leads").update(patch).eq("id", leadId);
          if (error) console.error("[quick-close] call lists not written to the lead (non-blocking):", error.message);
          else {
            Object.assign(lead, patch);
            const { error: actErr } = await service.from("lead_activity").insert({ lead_id: leadId, actor_user_id: actor.id, kind: "details_set", data: { ...(patch.services_included ? { services: patch.services_included } : {}), ...(patch.service_areas ? { service_areas: patch.service_areas } : {}), source: "call" } });
            if (actErr) console.error("[quick-close] details_set not recorded:", actErr.message);
          }
        }
        await event(service, leadId, rowId, actor.id, "call_answers_saved", { keys: sentKeys });
        return json(await view());
      }
      return json({ ok: false, error: "busy", detail: "Someone else is saving this at the same moment — try again." }, 409);
    }

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
              user_id: owner.user_id, kind: "quick_close_review", title: QC_REVIEW_HEADING,
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
        /* TWO OPTIONS (2026-10-07): a NEW phone-close link needs what they offer and where they want to be found. A link
           that already stands is reused without this (nothing in flight is withdrawn). */
        if (step.kind === "claim" && !phoneCloseNotesComplete(qc?.call)) {
          return json({ ok: false, error: "call_notes_missing", detail: "Add what they offer and where they want to be found first — the two short questions before the plan." }, 409);
        }
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
        const stored = await writeQc(service, rowId, revOf(qc), { ...(qc ?? {}), link_claimed_at: new Date().toISOString(), link_claimed_by: actor.id, close_route: "phone" });
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
      /* 🔴 v3 (2026-10-05): Quick Close asks for the client's SIGN-UP LINK (purpose "signup_link") — every
         checkout refusal runs, and the answer is their agreement page, never a Stripe URL. The client signs
         the Client Service Agreement there and only then can pay (findable-checkout refuses otherwise). */
      const startedMs = Date.now();
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/findable-checkout`, {
        method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_id: rowId, lead_id: leadId, purpose: "signup_link" }),
      });
      const out = await res.json().catch(() => ({})) as Obj;
      if (!res.ok || !out.ok || typeof out.url !== "string" || out.kind !== "signup_link") {
        await release();
        await event(service, leadId, rowId, actor.id, "link_refused", { checkout_error: out.error ?? res.status, reason: out.reason ?? out.reasons ?? null });
        return json({ ok: false, error: out.error ?? "checkout_failed", detail: CHECKOUT_REFUSAL_TEXT[out.error] ?? "The sign-up link could not be created." }, res.status >= 400 && res.status < 500 ? res.status : 502);
      }
      const ours = { url: out.url as string, session: null as string | null, kind: "signup" as const };
      const expiresMs = typeof out.expires_at === "number" ? out.expires_at * 1000 : startedMs + STRIPE_SESSION_LIFETIME_MS;
      for (let attempt = 0; attempt < 4; attempt++) {
        const fresh = await loadRow(service, rowId);
        const fq = (fresh?.quick_close ?? null) as QcRecord | null;
        const now = new Date().toISOString();
        const adopt = adoptLink(fresh?.status ?? "paid", fq, claimedKey, { url: ours.url, session: ours.session, expiresIso: new Date(expiresMs).toISOString(), kind: ours.kind }, actor.id, now);
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
      /* 'whatsapp_template' is accepted as the same thing as 'whatsapp': the SERVER picks the route (paymentLinkRoute). */
      if (channel !== "copy" && channel !== "email" && channel !== "whatsapp" && channel !== "whatsapp_template") return json({ ok: false, error: "bad_request" }, 400);
      if (!row) return json({ ok: false, error: "not_started", detail: "Answer the questions first." }, 409);
      const qc = (row.quick_close ?? null) as (QuickCloseRecord & Obj) | null;
      if (!linkUsable(qc)) return json({ ok: false, error: "link_expired", detail: "Make the sign-up link first." }, 409);
      const route = cleanAnswers(qc!.answers).route;
      if (!route) return json({ ok: false, error: "route_undecided", detail: CHECKOUT_REFUSAL_TEXT.route_undecided }, 409);
      const url = qc!.link_url as string;
      const session = (qc!.link_session_id as string | null) ?? stripeSessionIdFromUrl(url);
      const greetName = row.contact_name ?? lead.contact_name ?? null;
      const share: QcLinkShare = { channel: channel === "whatsapp_template" ? "whatsapp" : channel, at: new Date().toISOString(), by: actor.id, session, link: url };

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
      if (channel === "whatsapp" || channel === "whatsapp_template") {
        if (!lead.phone) return json({ ok: false, error: "no_phone", detail: "There is no phone number for them." }, 409);
        /* ⛔ ONE SEND OF THIS LINK unless the rep presses Resend (a double tap or a retry never messages them twice). */
        const prior = ((qc!.link_shared ?? []) as QcLinkShare[]).filter((s) => s.channel === "whatsapp" && (s.link ? s.link === url : s.session === session) && s.status !== "failed");
        if (prior.length && body.resend !== true) {
          return json({ ok: false, error: "already_sent", detail: `Already sent on WhatsApp (${new Date(prior[prior.length - 1].at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}). Press Resend if you really mean to send it again.` }, 409);
        }
        /* ⛔ THE ROUTE (paymentLinkRoute.ts): the APPROVED findable_signup_link template (Meta's live status), else a
           normal message only when we messaged them, they replied and the 24-hour window is open, else nothing. */
        const tplState = templateSendState(await templateAvailability(service, SIGNUP_LINK_TEMPLATE_NAME), "signup");
        const lr = decideLinkRoute(await conversation(), { template: tplState });
        if (lr.route === "none") return json({ ok: false, error: lr.reason, detail: lr.say }, 409);
        /* THE CANONICAL SENDER, AS THE CALLER: its ownership, QA, suppression, phone (UK / AU / IN) and template rules
           decide. The template's link and greeting are resolved THERE from the lead's records — never sent from here. */
        const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
          method: "POST", headers: { apikey: anon, Authorization: req.headers.get("authorization") ?? "", "Content-Type": "application/json" },
          body: JSON.stringify(lr.route === "whatsapp_template"
            ? { phone: lead.phone, country: lead.country ?? null, lead_id: leadId, template_name: SIGNUP_LINK_TEMPLATE_NAME, ...(body.resend === true ? { allow_resend: true } : {}) }
            : { phone: lead.phone, country: lead.country ?? null, lead_id: leadId, body: quickCloseMessage(greetName, url, route) }),
        });
        const out = await res.json().catch(() => ({})) as Obj;
        if (!res.ok || !out.ok) {
          const code = String(out.error ?? (res.ok ? "send_failed" : `http_${res.status}`));
          await event(service, leadId, row.id, actor.id, "link_share_failed", { channel: "whatsapp", route: lr.route, error: code, fail_code: out.failCode ?? null });
          return json({ ok: false, error: code, detail: String(out.reason ?? "") || WHATSAPP_REFUSAL_TEXT[code] || "WhatsApp did not send it. Copy the sign-up link or email it instead." }, 409);
        }
        share.status = out.simulated ? "simulated" : String(out.status ?? "sent");
        share.template = lr.route === "whatsapp_template" ? SIGNUP_LINK_TEMPLATE_NAME : null;
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
      const bodyText = channel === "copy" ? "Sign-up link copied (to send by hand — not confirmed as sent)"
        : channel === "email" ? `Sign-up link emailed to ${share.to}`
        : share.status === "simulated" ? "Sign-up link sent on WhatsApp (test mode — not delivered)" : share.template ? "Sign-up link sent on WhatsApp (template findable_signup_link)" : "Sign-up link sent on WhatsApp";
      const { error: hErr } = await service.from("lead_activity").insert({
        lead_id: leadId, actor_user_id: actor.id, kind: "payment_link_shared", body: bodyText,
        data: { source: actor.role === "admin" ? "admin" : "sales", channel: share.channel, template: share.template ?? null, resend: body.resend === true, status: share.status ?? null, session, route },
      });
      if (hErr) console.error("[quick-close] history write failed (non-blocking):", hErr.message);
      return json(await view());
    }
    /* ══ FULL SETUP (2026-10-07): SEND THE CLIENT THEIR OWN SET-UP LINK ═════════════════════════════════════════
       The OTHER way to close: the client answers the short questions themselves (findable.live/onboarding/?lead=<id>),
       then the agreement, then payment. Nothing is created here — the link is made from the lead id alone, and the page
       itself resumes whatever sign-up exists (a sales-held one is continued, never replaced), so a resend or a second
       press can never make a second sign-up.
       ⛔ NEVER A STRIPE URL, and never anything but findable.live. WhatsApp follows Paul's one link rule
       (paymentLinkRoute.ts) through the SAME canonical sender and the SAME approved findable_signup_link template, the
       variable resolved there (link_variant "setup"). Copy is recorded as copied, never as sent. */
    if (mode === "share_setup") {
      const channel = body.channel;
      if (channel !== "copy" && channel !== "whatsapp") return json({ ok: false, error: "bad_request" }, 400);
      if (!access.ok || isPaidLead(lead) || row?.status === "paid") return json({ ok: false, error: "not_open", detail: "This lead can't be sent a set-up link (it is a client, or no longer yours)." }, 409);
      const closedNow = quickCloseClosedRefusal(lead as never, row as never);
      if (closedNow) return json({ ok: false, error: closedNow.error, detail: closedNow.detail }, 409);
      const url = setupLinkUrl(leadId);
      let status: string | null = null; let template: string | null = null;
      if (channel === "whatsapp") {
        if (!lead.phone) return json({ ok: false, error: "no_phone", detail: "There is no phone number for them." }, 409);
        const history = await setupShareHistory(service, leadId);
        if (history.some((s) => s.channel === "whatsapp" && s.status !== "failed") && body.resend !== true) {
          return json({ ok: false, error: "already_sent", detail: "The full setup link was already sent to them on WhatsApp. Press Resend if you really mean to send it again." }, 409);
        }
        const tplState = templateSendState(await templateAvailability(service, SIGNUP_LINK_TEMPLATE_NAME), "signup");
        const lr = decideLinkRoute(await conversation(), { template: tplState });
        if (lr.route === "none") return json({ ok: false, error: lr.reason, detail: lr.say }, 409);
        const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const greetName = row?.contact_name ?? lead.contact_name ?? null;
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
          method: "POST", headers: { apikey: anon, Authorization: req.headers.get("authorization") ?? "", "Content-Type": "application/json" },
          /* allow_resend: the sender's "once per template" guard also counts the Agreement & Payment link; this is a deliberate,
             different link, and its own repeat is guarded just above. */
          body: JSON.stringify(lr.route === "whatsapp_template"
            ? { phone: lead.phone, country: lead.country ?? null, lead_id: leadId, template_name: SIGNUP_LINK_TEMPLATE_NAME, link_variant: "setup", allow_resend: true }
            : { phone: lead.phone, country: lead.country ?? null, lead_id: leadId, body: `${quickCloseGreeting(greetName)}\n\nHere's your set-up link — a few short questions, then your agreement and payment, all in one place:\n${url}\n\nAny questions, just reply here.` }),
        });
        const out = await res.json().catch(() => ({})) as Obj;
        if (!res.ok || !out.ok) {
          const code = String(out.error ?? (res.ok ? "send_failed" : `http_${res.status}`));
          await event(service, leadId, row?.id ?? null, actor.id, "link_share_failed", { channel: "whatsapp", variant: "setup", route: lr.route, error: code, fail_code: out.failCode ?? null });
          return json({ ok: false, error: code, detail: String(out.reason ?? "") || WHATSAPP_REFUSAL_TEXT[code] || "WhatsApp did not send it. Copy the link instead." }, 409);
        }
        status = out.simulated ? "simulated" : String(out.status ?? "sent");
        template = lr.route === "whatsapp_template" ? SIGNUP_LINK_TEMPLATE_NAME : null;
      }
      await event(service, leadId, row?.id ?? null, actor.id, "link_shared", { channel, variant: "setup", status });
      const { error: hErr } = await service.from("lead_activity").insert({
        lead_id: leadId, actor_user_id: actor.id, kind: "payment_link_shared",
        body: channel === "copy" ? "Full setup link copied (to send by hand — not confirmed as sent)" : status === "simulated" ? "Full setup link sent on WhatsApp (test mode — not delivered)" : "Full setup link sent on WhatsApp",
        data: { source: actor.role === "admin" ? "admin" : "sales", variant: "setup", close_route: "full_setup", channel, template, resend: body.resend === true, status },
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
