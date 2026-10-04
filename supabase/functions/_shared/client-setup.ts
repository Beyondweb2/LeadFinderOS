// client-setup — THE PAID CLIENT'S SETUP CHECKLIST, STAGE AND NEXT STEP, LOADED ONCE (2026-10-02,
// docs/paid-client-automation.md). Read by paid-client-hub (list + get + submit), stripe-webhook (the
// new-client email) and quick-close (the salesperson's handoff + submit). One loader, so the email, the
// list and the client page can never disagree about the same client.
//
// ⛔ READ ONLY, except recordLeadEvent (History) and submitForDelivery (the one stored act).
// ⛔ The rules are the src/lib leaves: handoffReadiness (the checklist), salesHandoff (the handoff),
//   deliveryStage (stage + ONE next step). Nothing is decided here.
import { handoffReadiness, type HandoffLead, type HandoffOnboarding, type HandoffReadiness } from "../../../src/lib/handoffReadiness.ts";
import { deliveryStage, discoverySummary, type StageResult } from "../../../src/lib/deliveryStage.ts";
import { handoffComplete, handoffMissing, salesHandoffApplies, type HandoffApplies, type SalesHandoffRecord } from "../../../src/lib/salesHandoff.ts";
import { serviceRouteForTotal, serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { isFirstContactChannel, type FirstContactChannel } from "../../../src/lib/firstContact.ts";
import { londonDay } from "../../../src/lib/reportingPeriod.ts";
import { operatorAppUrl } from "../../../src/config/operatorApp.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type Row = Record<string, unknown>;

/** Lead columns the checklist + stage read (outreach_leads; every one read back live 2026-10-02). */
export const SETUP_LEAD_COLUMNS =
  "id,business_name,phone,email,website,amount_paid,payment_date,status,services_included,service_areas,website_control,delivery_checklist," +
  "service_terminated_at,service_termination_reason,sold_by_user_id,sold_at,assigned_to_user_id,baseline_audit_id,remeasure_due_date,remeasure_audit_id," +
  "remeasure_results_sent_at,website_build,sales_handoff,delivery_submitted_at,delivery_submitted_by," +
  /* pre-sales fix 03: the route they PAID on (readiness is route-aware) and Paul's recorded first contact. */
  "contract_total_payments,client_contacted_at,client_contacted_via";

/** Onboarding columns the checklist + stage read. */
export const SETUP_ONBOARDING_COLUMNS =
  "id,lead_id,status,updated_at,source,services,services_list,areas_list,areas_wanted,business_website,confirmed_phone,contact_email," +
  "contact_name,confirmed_location,website_route,website_manager,website_platform,domain_status,gbp_status,gbp_exists,plan_tier,website_addon," +
  "baseline_status,baseline_discovery,quick_close," +
  "domain_owned,domain_access,domain_third_party,site_rights,authority_confirmed,dns_permission,materials_confirmed";

const PROSPECT_AUDIT_OR = "audit_purpose.is.null,audit_purpose.eq.audit,audit_purpose.eq.free_check";
const NONE = "00000000-0000-0000-0000-000000000000";

export interface ClientSetup {
  readiness: HandoffReadiness;
  stage: StageResult;
  onboarding: Row | null;
  handoffApplies: HandoffApplies;
  sellerId: string | null;
  crawlAgeDays: number | null;
}

/** The onboarding row a paid client's answers live on: the newest PAID row, else the newest of any
 *  status, never a free check (as paid-client-hub has always chosen it). */
export function pickOnboarding(rows: Row[]): Row | null {
  const real = rows.filter((r) => (r.source ?? "") !== "free_check");
  const byNewest = [...real].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  return byNewest.find((r) => r.status === "paid") ?? byNewest[0] ?? null;
}

/** Everything the checklist needs for MANY leads, in a handful of reads (the list's shape). */
export async function loadClientSetups(service: Service, leads: Row[], nowMs = Date.now()): Promise<Map<string, ClientSetup>> {
  const out = new Map<string, ClientSetup>();
  if (!leads.length) return out;
  const ids = leads.map((l) => String(l.id));
  const sellerIds = [...new Set(leads.map((l) => (l.sold_by_user_id ?? l.assigned_to_user_id) as string | null).filter((x): x is string => !!x))];
  const auditIds = leads.map((l) => l.baseline_audit_id as string | null).filter((x): x is string => !!x);
  const [ob, crawls, prospect, owners, audits] = await Promise.all([
    service.from("onboarding_responses").select(SETUP_ONBOARDING_COLUMNS).in("lead_id", ids),
    service.from("lead_crawl_checks").select("lead_id,created_at").in("lead_id", ids),
    service.from("ai_audits").select("lead_id").in("lead_id", ids).or(PROSPECT_AUDIT_OR),
    service.from("team_members").select("user_id,is_book_owner").in("user_id", sellerIds.length ? sellerIds : [NONE]),
    service.from("ai_audits").select("id,baseline_completed_at").in("id", auditIds.length ? auditIds : [NONE]),
  ]);
  for (const r of [ob, crawls, prospect, owners, audits]) if (r.error) throw r.error;
  const obByLead = new Map<string, Row[]>();
  for (const r of (ob.data ?? []) as Row[]) { const k = String(r.lead_id); obByLead.set(k, [...(obByLead.get(k) ?? []), r]); }
  const crawlAt = new Map<string, string>(((crawls.data ?? []) as Row[]).map((r) => [String(r.lead_id), String(r.created_at ?? "")]));
  const prospectLeads = new Set(((prospect.data ?? []) as Row[]).map((r) => String(r.lead_id)));
  const bookOwner = new Map<string, boolean>(((owners.data ?? []) as Row[]).map((r) => [String(r.user_id), r.is_book_owner === true]));
  const auditById = new Map<string, Row>(((audits.data ?? []) as Row[]).map((r) => [String(r.id), r]));

  // The Discovery measurement's runs, for every client that started one (one read).
  const onboardingByLead = new Map<string, Row | null>(ids.map((id) => [id, pickOnboarding(obByLead.get(id) ?? [])]));
  const discoveryAudit = new Map<string, string>();
  for (const [id, o] of onboardingByLead) {
    const a = (o?.baseline_discovery as { audit_id?: unknown } | null)?.audit_id;
    if (typeof a === "string" && a) discoveryAudit.set(id, a);
  }
  const runStatus = new Map<string, string[]>();
  if (discoveryAudit.size) {
    const { data, error } = await service.from("ai_audit_runs").select("audit_id,status").in("audit_id", [...discoveryAudit.values()]);
    if (error) throw error;
    for (const r of (data ?? []) as Row[]) { const k = String(r.audit_id); runStatus.set(k, [...(runStatus.get(k) ?? []), String(r.status ?? "")]); }
  }

  const today = londonDay(nowMs);
  for (const l of leads) {
    const id = String(l.id);
    const o = onboardingByLead.get(id) ?? null;
    const at = crawlAt.get(id);
    const crawlAgeDays = at && !Number.isNaN(Date.parse(at)) ? (nowMs - Date.parse(at)) / 86_400_000 : null;
    const sellerId = ((l.sold_by_user_id ?? l.assigned_to_user_id) as string | null) ?? null;
    const applies = salesHandoffApplies({ sellerId, sellerIsBookOwner: sellerId ? bookOwner.get(sellerId) ?? null : null, paidOn: (l.payment_date as string | null) ?? (l.sold_at as string | null) ?? null });
    const handoff = (l.sales_handoff ?? null) as SalesHandoffRecord | null;
    const readiness = handoffReadiness(l as HandoffLead, o as HandoffOnboarding | null, {
      crawl: !!at, crawlAgeDays, hookAudit: prospectLeads.has(id),
      salesHandoff: { applies, complete: handoffComplete(handoff), missing: handoffMissing(handoff).length },
    });
    const dAudit = discoveryAudit.get(id);
    const stage = deliveryStage({
      readiness,
      lead: l as never,
      onboarding: o as { baseline_status?: string | null } | null,
      baselineAudit: l.baseline_audit_id ? (auditById.get(String(l.baseline_audit_id)) as { baseline_completed_at?: string | null } | undefined) ?? null : null,
      discovery: discoverySummary(o?.baseline_discovery, dAudit ? runStatus.get(dAudit) ?? [] : []),
      /* The route they PAID on first (the checkout's stamp), else the onboarding row's — the same order
         the readiness rule uses, so the stage label and the checklist cannot disagree. */
      route: serviceRouteForTotal(l.contract_total_payments) ?? serviceRouteFromRow(o as never),
      today,
    });
    out.set(id, { readiness, stage, onboarding: o, handoffApplies: applies, sellerId, crawlAgeDays });
  }
  return out;
}

/** One client, by id (the lead row is read here). Null when the lead does not exist. */
export async function loadClientSetup(service: Service, leadId: string): Promise<{ lead: Row; setup: ClientSetup } | null> {
  const { data: lead, error } = await service.from("outreach_leads").select(SETUP_LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw error;
  if (!lead) return null;
  const setup = (await loadClientSetups(service, [lead as Row])).get(leadId)!;
  return { lead: lead as Row, setup };
}

/* ══ HISTORY ═════════════════════════════════════════════════════════════════════════════════════════
   The delivery workflow's MEANINGFUL events only — never a field-level change. `source` says who acted:
   system / client / sales / admin; actor_user_id is the person when there is one. A one-per-lead event
   (payment_received, launched) is guarded by a partial unique index: a retry's 23505 is "already there". */
export type LeadEventKind =
  | "payment_received" | "handoff_saved" | "onboarding_submitted" | "delivery_submitted" | "contact_logged"
  | "discovery_run" | "baseline_approved" | "baseline_run" | "build_started" | "launched";
export async function recordLeadEvent(
  service: Service, leadId: string, kind: LeadEventKind,
  opts: { actor?: string | null; source: "system" | "client" | "sales" | "admin"; body?: string | null; data?: Row },
): Promise<"recorded" | "exists" | "failed"> {
  try {
    const { error } = await service.from("lead_activity").insert({
      lead_id: leadId, actor_user_id: opts.actor ?? null, kind, body: opts.body ?? null, data: { source: opts.source, ...(opts.data ?? {}) },
    });
    if (!error) return "recorded";
    if ((error as { code?: string }).code === "23505") return "exists";
    console.error(`[client-setup] history ${kind} not recorded for ${leadId}: ${(error as { message?: string }).message}`);
    return "failed";
  } catch (e) {
    console.error(`[client-setup] history ${kind} threw for ${leadId}:`, e instanceof Error ? e.message : e);
    return "failed";
  }
}

/* ══ SUBMIT FOR DELIVERY ═════════════════════════════════════════════════════════════════════════════
   The one stored act of setup. Re-derives the checklist on the SERVER (never trusts a screen), refuses
   unless every required item is in, stamps delivery_submitted_at ONCE (a conditional write only one
   caller can win), records the snapshot in History, and tells Paul when someone other than Paul did it.
   Editability is kept: later changes are History events, the stamp stays. */
export type SubmitOutcome =
  | { ok: true; already: boolean; setup: ClientSetup }
  | { ok: false; error: "not_found" | "not_ready" | "not_saved"; missing?: string[] };
export async function submitForDelivery(
  service: Service, leadId: string, actor: { id: string; source: "sales" | "admin"; name?: string | null },
  notify: (subject: string, lines: string[]) => Promise<unknown>,
): Promise<SubmitOutcome> {
  const loaded = await loadClientSetup(service, leadId);
  if (!loaded) return { ok: false, error: "not_found" };
  const { lead, setup } = loaded;
  if (lead.delivery_submitted_at) return { ok: true, already: true, setup };
  if (!setup.readiness.ready) return { ok: false, error: "not_ready", missing: setup.readiness.missing };
  const now = new Date().toISOString();
  const { data: won, error } = await service.from("outreach_leads")
    .update({ delivery_submitted_at: now, delivery_submitted_by: actor.id })
    .eq("id", leadId).is("delivery_submitted_at", null).select("id");
  if (error) return { ok: false, error: "not_saved" };
  if (!Array.isArray(won) || !won.length) return { ok: true, already: true, setup };
  await recordLeadEvent(service, leadId, "delivery_submitted", {
    actor: actor.id, source: actor.source, body: "Submitted for delivery",
    data: {
      snapshot: {
        items: setup.readiness.items.map((i) => ({ key: i.key, ok: i.ok, required: i.required, not_needed: !!i.notNeeded, source: i.source, detail: i.detail })),
        sales_handoff: lead.sales_handoff ?? null,
      },
    },
  });
  if (actor.source !== "admin") {
    try {
      await notify(`Ready for delivery: ${String(lead.business_name ?? "A client")}`, [
        `${String(lead.business_name ?? "A client")} is ready for delivery.`,
        `Submitted by ${actor.name ?? "the salesperson"}.`,
        "",
        `Next step: Run Discovery`,
        "Open the client: " + operatorAppUrl("/paid-clients/" + leadId),
      ]);
    } catch (e) { console.error("[client-setup] ready-for-delivery email failed (non-blocking):", e instanceof Error ? e.message : e); }
  }
  const after = await loadClientSetup(service, leadId);
  return { ok: true, already: false, setup: after?.setup ?? setup };
}

/* ══ FIRST CONTACT (pre-sales fix 03, M-018; src/lib/firstContact.ts) ═════════════════════════════════
   Paul records that he introduced himself and sent the setup link. Written ONCE (a conditional write
   only one caller can win), never for a client that is ended or refunded, and recorded in History as a
   contact_logged event (an existing lead_activity kind, so no constraint change). */
export type FirstContactOutcome =
  | { ok: true; already: boolean; at: string }
  | { ok: false; error: "bad_channel" | "not_found" | "closed" | "not_saved"; detail: string };
export async function recordFirstContact(
  service: Service, leadId: string, actorId: string, via: unknown, note: string | null, nowIso = new Date().toISOString(),
): Promise<FirstContactOutcome> {
  if (!isFirstContactChannel(via)) return { ok: false, error: "bad_channel", detail: "Say how you contacted them: phone, email, WhatsApp or other." };
  const channel: FirstContactChannel = via;
  const { data: lead, error } = await service.from("outreach_leads")
    .select("id,client_contacted_at,service_terminated_at,status").eq("id", leadId).maybeSingle();
  if (error || !lead) return { ok: false, error: "not_found", detail: "This client could not be found." };
  const L = lead as { client_contacted_at?: string | null; service_terminated_at?: string | null; status?: string | null };
  if (L.client_contacted_at) return { ok: true, already: true, at: L.client_contacted_at };
  if (L.service_terminated_at || L.status === "refunded") return { ok: false, error: "closed", detail: "This client’s engagement has ended — there is no first contact to record." };
  const { data: won, error: upErr } = await service.from("outreach_leads")
    .update({ client_contacted_at: nowIso, client_contacted_by: actorId, client_contacted_via: channel })
    .eq("id", leadId).is("client_contacted_at", null).select("id");
  if (upErr) return { ok: false, error: "not_saved", detail: "Not saved — try again." };
  if (!Array.isArray(won) || !won.length) return { ok: true, already: true, at: nowIso };
  await recordLeadEvent(service, leadId, "contact_logged", {
    actor: actorId, source: "admin",
    body: `First contact made (${channel === "whatsapp" ? "WhatsApp" : channel}) — introduced and sent the setup link${note ? ` · ${note.slice(0, 300)}` : ""}`,
    data: { first_contact: true, via: channel },
  });
  return { ok: true, already: false, at: nowIso };
}
