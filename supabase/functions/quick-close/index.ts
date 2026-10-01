import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor, leadAccess } from "../_shared/access.ts";
import { recordDenial } from "../_shared/protection.ts";
import {
  cleanAnswers, LINK_REUSE_MS, mayGenerateLink, onboardingColumnsFor, quickCloseGate, quickCloseState, QC_REVIEW_TEXT,
  type QuickCloseAnswers, type QuickCloseRecord,
} from "../../../src/lib/quickClose.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import {
  cleanHandoff, handoffChangedKeys, handoffComplete, handoffMissing, handoffPrefill, handoffWithPrefill, HANDOFF_QUESTIONS, SALES_HANDOFF_SINCE,
  type SalesHandoffFields, type SalesHandoffRecord,
} from "../../../src/lib/salesHandoff.ts";
import { serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";
import { loadClientSetup, recordLeadEvent, submitForDelivery } from "../_shared/client-setup.ts";
import { sendOperatorAlert } from "../_shared/operator-alert.ts";

// quick-close — QUICK CLOSE (Sales Experience, 2026-09-29; docs/sales-experience.md §9).
//
// Modes: load · save · approve_review (admin) · generate_link · save_handoff · submit_delivery · my_handoffs.
// ⛔ THE SALES HANDOFF (2026-10-02, src/lib/salesHandoff.ts) is the one thing a salesperson may still
//   write AFTER payment, and only on their OWN sale (sold_by_user_id) — it lands on
//   outreach_leads.sales_handoff through cleanHandoff, never anything else on the lead.
// ⛔ WHO: a salesperson only on a lead they may work (leadAccess: assigned to them, not a client); the
//   admin on the book's leads. After payment the seller may still LOAD the state (read-only).
// ⛔ ONE ONBOARDING ROW per lead (public.quick_close_row, advisory-locked). The answers are also written
//   to the canonical columns the checkout reads, so every existing safeguard applies unchanged.
// ⛔ THE PAYMENT LINK IS THE EXISTING findable-checkout, called server-to-server with this row's id and
//   lead id — nothing here sets a price, a term, a discount or a line item; the request carries none.
//   A link younger than LINK_REUSE_MS is REUSED; a concurrent click waits for the first (claim lock).
// ⛔ Every save / release / link is written to quick_close_events (who, when, what changed).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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

const LEAD_COLS = "id, user_id, business_name, phone, email, website, address, search_location, derived_town, category, search_keyword, contact_name, campaign_id, lead_source, assigned_to_user_id, sold_by_user_id, amount_paid, status, rating, review_count, google_maps_url, place_id, website_control, sales_handoff, delivery_submitted_at";

async function loadAll(service: Service, leadId: string) {
  const [{ data: lead }, { data: rows }] = await Promise.all([
    service.from("outreach_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle(),
    service.from("onboarding_responses")
      .select("id, status, source, created_at, contact_name, contact_email, confirmed_phone, business_website, quick_close, plan_tier, website_addon")
      .eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);
  if (!lead) return null;
  const nonFree = ((rows ?? []) as Obj[]).filter((r) => (r.source ?? "") !== "free_check");
  const row = nonFree.find((r) => r.status === "paid") ?? nonFree[0] ?? null;
  return { lead: lead as Obj, row };
}

async function event(service: Service, leadId: string, onboardingId: string | null, actor: string, kind: string, data: Obj = {}) {
  const { error } = await service.from("quick_close_events").insert({ lead_id: leadId, onboarding_id: onboardingId, actor_user_id: actor, kind, data });
  if (error) console.error("[quick-close] event write failed", kind, error.message);
}

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
       names and states only, never an amount or anything else of the client's. */
    if (mode === "my_handoffs") {
      const { data, error } = await service.from("outreach_leads")
        .select("id, business_name, payment_date, amount_paid, status, sales_handoff, delivery_submitted_at")
        .eq("sold_by_user_id", actor.id).gt("amount_paid", 0).gte("payment_date", SALES_HANDOFF_SINCE)
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
    let row = all.row;
    // After payment the lead becomes a client and leaves a salesperson's working set; the SELLER may
    // still see the outcome (read-only). Nobody else.
    const mayView = access.ok || (actor.role === "sales" && row?.status === "paid" && (lead.sold_by_user_id === actor.id || lead.assigned_to_user_id === actor.id));
    if (!mayView) return json({ ok: false, error: "not_your_lead", detail: "That lead is not assigned to you." }, 403);
    /* The handoff: the admin; a salesperson working the lead (before payment); the SELLER after payment.
       ⛔ Never another rep's client — sold_by_user_id is stamped once at payment and never moves. */
    const paidLead = isPaidLead(lead);
    const mayHandoff = actor.role === "admin" || (!paidLead && access.ok) || (paidLead && actor.role === "sales" && lead.sold_by_user_id === actor.id);

    const qc = (row?.quick_close ?? null) as (QuickCloseRecord & Obj) | null;
    const view = async () => {
      const [{ data: msgs }, camp, seller, events] = await Promise.all([
        service.from("whatsapp_messages").select("direction, created_at").eq("lead_id", leadId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1),
        lead.campaign_id ? service.from("campaigns").select("name").eq("id", lead.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
        (lead.assigned_to_user_id ?? lead.sold_by_user_id) ? service.from("team_members").select("display_name").eq("user_id", lead.assigned_to_user_id ?? lead.sold_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
        service.from("quick_close_events").select("kind, created_at, actor_user_id, data").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(12),
      ]);
      const lastIn = ((msgs ?? []) as Obj[])[0]?.created_at ?? null;
      const cur = (row?.quick_close ?? null) as QuickCloseRecord | null;
      const answers = cleanAnswers(cur?.answers);
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
          if (s) setup = { ready: s.readiness.ready, label: s.readiness.label, done: s.readiness.done, total: s.readiness.total, missing: s.readiness.missing, state_label: s.stage.stateLabel, next: s.stage.next, submitted: !!lead.delivery_submitted_at };
        } catch (e) { console.error("[quick-close] setup read failed (non-blocking):", e instanceof Error ? e.message : e); }
      }
      return {
        ok: true,
        handoff: {
          canEdit: mayHandoff, fields: handoffWithPrefill(saved, pre.fields), prefilled: saved?.saved_at ? [] : pre.prefilled,
          saved_at: saved?.saved_at ?? null, completed_at: saved?.completed_at ?? null,
          complete: handoffComplete(saved), missing: handoffMissing(saved),
        },
        setup,
        canEdit: access.ok && row?.status !== "paid",
        lead: {
          id: lead.id, business_name: lead.business_name, phone: lead.phone, email: lead.email, website: lead.website, address: lead.address,
          town: lead.derived_town || lead.search_location || null, trade: (lead.category || lead.search_keyword || "").trim() || null,
          contact_name: lead.contact_name, rating: lead.rating, review_count: lead.review_count, google_maps_url: lead.google_maps_url,
          campaign: (camp as { data?: { name?: string } | null }).data?.name ?? null, lead_source: lead.lead_source ?? null,
          salesperson: (seller as { data?: { display_name?: string } | null }).data?.display_name ?? null,
        },
        onboarding: row ? { id: row.id, status: row.status, contact_name: row.contact_name, contact_email: row.contact_email, confirmed_phone: row.confirmed_phone, business_website: row.business_website } : null,
        answers, state: quickCloseState(row?.status, cur), gate: quickCloseGate(answers),
        review: { approved_at: cur?.review_approved_at ?? null, reasons: quickCloseGate(answers).review.map((r) => QC_REVIEW_TEXT[r]) },
        link: cur?.link_url ? { url: cur.link_url, generated_at: cur.link_generated_at ?? null } : null,
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
    if (row?.status === "paid") return json({ ok: false, error: "already_paid", detail: "This client has already paid." }, 409);

    if (mode === "save") {
      const incoming = cleanAnswers(body.answers);
      const prev = cleanAnswers(qc?.answers);
      // Re-cleaned as a whole: an answer can invalidate another (Optimise is dropped when "No website" is chosen).
      const answers: QuickCloseAnswers = cleanAnswers({ ...prev, ...incoming });
      const rowId: string = row?.id ?? (await service.rpc("quick_close_row", { _lead_id: leadId, _business_name: lead.business_name ?? null })).data;
      if (!rowId) return json({ ok: false, error: "not_saved" }, 500);
      // Corrections go on the onboarding record (what the client confirmed), never over the lead's own fields.
      const c = (body.corrections && typeof body.corrections === "object" ? body.corrections : {}) as Obj;
      const patch: Obj = { ...onboardingColumnsFor(answers), updated_at: new Date().toISOString() };
      if (typeof c.contact_name === "string") patch.contact_name = c.contact_name.trim().slice(0, 120) || null;
      if (typeof c.contact_email === "string") { const e = c.contact_email.trim(); if (e && !EMAIL_RE.test(e)) return json({ ok: false, error: "bad_email", detail: "That email address does not look right." }, 400); patch.contact_email = e || null; }
      if (typeof c.confirmed_phone === "string") patch.confirmed_phone = c.confirmed_phone.trim().slice(0, 40) || null;
      if (typeof c.business_website === "string") patch.business_website = c.business_website.trim().slice(0, 200) || null;
      // The trade decides what the paid baseline measures (findable-checkout refuses a lead without one).
      // Only a BLANK trade is filled here — an existing one is never overwritten.
      const trade = typeof body.trade === "string" ? body.trade.trim().slice(0, 80) : "";
      if (trade && !((lead.category || lead.search_keyword || "") as string).trim()) {
        const { error: tErr } = await service.from("outreach_leads").update({ search_keyword: trade }).eq("id", leadId).is("category", null);
        if (tErr) return json({ ok: false, error: "not_saved", detail: tErr.message }, 500);
        lead.search_keyword = trade;
      }
      const gate = quickCloseGate(answers);
      const now = new Date().toISOString();
      // Answers that change after a review approval, or after a link, invalidate both (the link was for the old answers).
      const changed = ([...new Set([...Object.keys(answers), ...Object.keys(prev)])] as (keyof QuickCloseAnswers)[]).filter((k) => answers[k] !== prev[k]);
      /* A route dropped by the re-clean clears the row's route too — never left behind as a stale sale. */
      if (prev.route && !answers.route) { patch.plan_tier = null; patch.website_addon = null; }
      /* Build consents withdrawn (Not yet, or the route moved off Build): the consent columns they set go too. */
      if (prev.build_consents === "yes" && answers.build_consents !== "yes") {
        patch.dns_permission = null; patch.materials_confirmed = null;
        patch.authority_confirmed = answers.authority === "yes" ? true : answers.authority === "no" ? false : null;
      }
      const next: Obj = { ...(qc ?? {}), answers, updated_at: now, updated_by: actor.id };
      if (!qc?.started_by) { next.started_by = actor.id; next.started_at = now; }
      if (gate.complete && !qc?.completed_at) { next.completed_at = now; next.completed_by = actor.id; }
      if (changed.length && qc?.review_approved_at) { next.review_approved_at = null; next.review_approved_by = null; }
      if (changed.length && qc?.link_url) { next.link_url = null; next.link_generated_at = null; next.link_generated_by = null; next.link_invalidated_at = now; }
      patch.quick_close = next;
      const { error } = await service.from("onboarding_responses").update(patch).eq("id", rowId);
      if (error) return json({ ok: false, error: "not_saved", detail: error.message }, 500);
      await event(service, leadId, rowId, actor.id, "answers_saved", { changed: Object.fromEntries(changed.map((k) => [k, { from: prev[k] ?? null, to: answers[k] ?? null }])), corrections: Object.keys(c), trade_set: !!trade });
      // A new review need tells Paul once per set of answers (the dedupe key carries the reasons).
      if (gate.complete && gate.review.length && !next.review_approved_at) {
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
      row = { ...(row ?? {}), id: rowId, status: row?.status ?? "answers_saved", quick_close: next };
      return json(await view());
    }

    if (mode === "approve_review") {
      if (actor.role !== "admin") { await recordDenial(service, actor.id, "quick-close:approve_review", leadId); return json({ ok: false, error: "admin_only", detail: "Only Paul can release a flagged Quick Close." }, 403); }
      if (!row) return json({ ok: false, error: "not_started" }, 409);
      const next = { ...(qc ?? {}), review_approved_at: new Date().toISOString(), review_approved_by: actor.id, review_note: typeof body.note === "string" ? body.note.slice(0, 300) : null };
      const { error } = await service.from("onboarding_responses").update({ quick_close: next }).eq("id", row.id);
      if (error) return json({ ok: false, error: "not_saved" }, 500);
      await event(service, leadId, row.id, actor.id, "review_approved", { note: next.review_note });
      row = { ...row, quick_close: next };
      return json(await view());
    }

    if (mode === "generate_link") {
      if (!row) return json({ ok: false, error: "not_started", detail: "Answer the questions first." }, 409);
      if (!mayGenerateLink(row.status, qc)) {
        const s = quickCloseState(row.status, qc);
        await event(service, leadId, row.id, actor.id, "link_refused", { state: s });
        return json({ ok: false, error: s, detail: s === "blocked" ? "The decision maker needs to approve and sign up." : s === "consents_needed" ? "For a new website they need to confirm the three Build consents first (domain, DNS, content)." : s === "needs_review" ? "Domain / agency issue — Paul needs to review this first." : "Finish the questions first." }, 409);
      }
      // A recent link is reused: one Stripe session per close, however many clicks.
      if (qc?.link_url && qc.link_generated_at && Date.now() - Date.parse(qc.link_generated_at) < LINK_REUSE_MS) {
        await event(service, leadId, row.id, actor.id, "link_reused", {});
        return json(await view());
      }
      const { data: claimed } = await service.rpc("quick_close_claim_link", { _onboarding_id: row.id });
      if (!claimed) {
        for (let i = 0; i < 8; i++) {
          await sleep(1500);
          const again = await loadAll(service, leadId);
          const q2 = again?.row?.quick_close as QuickCloseRecord | undefined;
          if (q2?.link_url) { row = again!.row; return json(await view()); }
        }
        return json({ ok: false, error: "busy", detail: "Another click is creating the link — try again in a moment." }, 409);
      }
      // THE CANONICAL CHECKOUT, server to server (no browser origin → the configured site origin).
      const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/findable-checkout`, {
        method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_id: row.id, lead_id: leadId }),
      });
      const out = await res.json().catch(() => ({})) as Obj;
      const fresh = (await loadAll(service, leadId))?.row ?? row;
      const q3 = { ...((fresh?.quick_close ?? qc ?? {}) as Obj), link_claimed_at: null };
      if (!res.ok || !out.ok || typeof out.url !== "string") {
        await service.from("onboarding_responses").update({ quick_close: q3 }).eq("id", row.id);
        await event(service, leadId, row.id, actor.id, "link_refused", { checkout_error: out.error ?? res.status, reason: out.reason ?? out.reasons ?? null });
        return json({ ok: false, error: out.error ?? "checkout_failed", detail: CHECKOUT_REFUSAL_TEXT[out.error] ?? "The payment link could not be created." }, res.status >= 400 && res.status < 500 ? res.status : 502);
      }
      const now = new Date().toISOString();
      const q4 = { ...q3, link_url: out.url, link_generated_at: now, link_generated_by: actor.id };
      await service.from("onboarding_responses").update({ quick_close: q4 }).eq("id", row.id);
      await event(service, leadId, row.id, actor.id, "link_generated", { assigned_to: lead.assigned_to_user_id ?? null });
      row = { ...row, quick_close: q4 };
      return json(await view());
    }
    return json({ ok: false, error: "unknown_mode" }, 400);
  } catch (e) {
    console.error("[quick-close]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Quick Close could not be loaded. Try again in a moment." }, 500);
  }
});
