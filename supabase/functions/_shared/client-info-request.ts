// client-info-request — ASK THE SALESPERSON FOR A PAID CLIENT'S MISSING INFORMATION (2026-10-05,
// docs/pre-sales-certification/client-missing-info-actions.md). Read by paid-client-hub (Paul asks /
// reminds / sees the status) and quick-close (the seller sees their request; their save answers it).
//
// ⛔ THE RULES ARE src/lib/clientMissingInfo.ts — who may be asked (sellerAskState), what (sellerItems),
//   when a reminder is allowed (planClientInfoRequest). Nothing is decided here; this only writes.
// ⛔ ONE OPEN REQUEST PER CLIENT is the database's unique index (client_info_requests_one_open): a losing
//   insert (23505) reads the winner back and answers "already requested" — never a second notification.
// ⛔ The request stores NO client information. The answer lands on the lead / handoff fields the
//   checklist already reads, so setup updates from the real fields, never from a "resolved" tick.
import {
  planClientInfoRequest, remindAvailableAt, sellerRequestBody, sellerRequestTitle, type ClientInfoRequestRow,
} from "../../../src/lib/clientMissingInfo.ts";
import { recordLeadEvent } from "./client-setup.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const CLIENT_INFO_REQUEST_COLUMNS =
  "id,lead_id,seller_user_id,requested_by,requested_at,items,reminded_at,remind_count,answered_at,answered_by,closed_at,closed_reason";

/** Where the seller's notification opens: their Sales page, straight into that client's handoff. */
export const sellerHandoffLink = (leadId: string) => `/sales-dashboard?handoff=${encodeURIComponent(leadId)}`;
/** Where Paul's "answered" notification opens. */
export const paidClientLink = (leadId: string) => `/paid-clients/${encodeURIComponent(leadId)}`;

export async function openRequestFor(service: Service, leadId: string): Promise<ClientInfoRequestRow | null> {
  const { data, error } = await service.from("client_info_requests").select(CLIENT_INFO_REQUEST_COLUMNS)
    .eq("lead_id", leadId).is("closed_at", null).maybeSingle();
  if (error) throw error;
  return (data ?? null) as ClientInfoRequestRow | null;
}

export async function newestRequestFor(service: Service, leadId: string): Promise<ClientInfoRequestRow | null> {
  const { data, error } = await service.from("client_info_requests").select(CLIENT_INFO_REQUEST_COLUMNS)
    .eq("lead_id", leadId).order("requested_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data ?? null) as ClientInfoRequestRow | null;
}

async function notify(service: Service, user: string, title: string, body: string, link: string, leadId: string, dedupe: string, priority = 2) {
  const { error } = await service.rpc("notify_person", {
    _user: user, _kind: "client_info_request", _title: title.slice(0, 200), _body: body, _link: link, _lead: leadId, _dedupe: dedupe, _priority: priority,
  });
  if (error) console.error("[client-info-request] notification not written:", error.message);
  return !error;
}

export type RequestOutcome =
  | { ok: true; outcome: "created" | "reminded"; request: ClientInfoRequestRow; notified: boolean }
  | { ok: true; outcome: "already_pending" | "too_soon"; request: ClientInfoRequestRow; remindAt: string }
  | { ok: false; error: "not_saved"; detail: string };

/** Ask (or, with remind, remind) the seller. The caller has already decided sellerAskState === 'ask'. */
export async function requestClientInfo(service: Service, i: {
  leadId: string; businessName: string | null; sellerId: string; actorId: string; actorName: string | null;
  keys: string[]; remind: boolean; nowMs?: number;
}): Promise<RequestOutcome> {
  const nowMs = i.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let open = await openRequestFor(service, i.leadId);
  let plan = planClientInfoRequest(open, i.remind, nowMs);

  if (plan.do === "create") {
    const { data, error } = await service.from("client_info_requests")
      .insert({ lead_id: i.leadId, seller_user_id: i.sellerId, requested_by: i.actorId, requested_at: nowIso, items: i.keys })
      .select(CLIENT_INFO_REQUEST_COLUMNS).maybeSingle();
    if (error && (error as { code?: string }).code === "23505") {
      // Someone else's press won: theirs is the request. Nothing is notified twice.
      open = await openRequestFor(service, i.leadId);
      if (!open) return { ok: false, error: "not_saved", detail: "Not saved — try again." };
      plan = planClientInfoRequest(open, false, nowMs);
      return { ok: true, outcome: "already_pending", request: open, remindAt: (plan as { remindAt: string }).remindAt };
    }
    if (error || !data) return { ok: false, error: "not_saved", detail: "Not saved — try again." };
    const row = data as ClientInfoRequestRow;
    const notified = await notify(service, i.sellerId, sellerRequestTitle(i.businessName), sellerRequestBody(i.businessName, i.keys),
      sellerHandoffLink(i.leadId), i.leadId, `client_info:${row.id}`);
    await recordLeadEvent(service, i.leadId, "client_info_requested", {
      actor: i.actorId, source: "admin", body: `Missing information requested from the salesperson: ${i.keys.length} item${i.keys.length === 1 ? "" : "s"}`,
      data: { request_id: row.id, items: i.keys, seller: i.sellerId },
    });
    return { ok: true, outcome: "created", request: row, notified };
  }

  if (plan.do === "already_pending" || plan.do === "too_soon") return { ok: true, outcome: plan.do, request: open!, remindAt: plan.remindAt };

  /* REMIND — a conditional write on the reminder stamp it was read at, so two presses remind once. */
  const cur = open!;
  let q = service.from("client_info_requests")
    .update({ reminded_at: nowIso, remind_count: (cur.remind_count ?? 0) + 1, items: i.keys })
    .eq("id", cur.id).is("closed_at", null);
  q = cur.reminded_at ? q.eq("reminded_at", cur.reminded_at) : q.is("reminded_at", null);
  const { data: won, error } = await q.select(CLIENT_INFO_REQUEST_COLUMNS);
  if (error) return { ok: false, error: "not_saved", detail: "Not saved — try again." };
  if (!Array.isArray(won) || !won.length) {
    const again = (await openRequestFor(service, i.leadId)) ?? cur;
    return { ok: true, outcome: "too_soon", request: again, remindAt: remindAvailableAt(again) };
  }
  const row = won[0] as ClientInfoRequestRow;
  const notified = await notify(service, i.sellerId, `Reminder · ${sellerRequestTitle(i.businessName)}`, sellerRequestBody(i.businessName, i.keys),
    sellerHandoffLink(i.leadId), i.leadId, `client_info:${row.id}:remind:${row.remind_count ?? 1}`);
  await recordLeadEvent(service, i.leadId, "client_info_requested", {
    actor: i.actorId, source: "admin", body: "Reminded the salesperson about the missing information",
    data: { request_id: row.id, items: i.keys, reminder: row.remind_count ?? 1 },
  });
  return { ok: true, outcome: "reminded", request: row, notified };
}

/** The SELLER saved their handoff or the client details: their open request on this client is answered.
 *  Only the seller it was addressed to can answer it (seller_user_id = actor) — the admin editing the
 *  handoff never closes the seller's request. Returns whether a request was answered. */
export async function answerClientInfoRequest(service: Service, i: { leadId: string; actorId: string; actorName: string | null; businessName: string | null; what: string }): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await service.from("client_info_requests")
      .update({ answered_at: nowIso, answered_by: i.actorId, closed_at: nowIso, closed_reason: "answered" })
      .eq("lead_id", i.leadId).eq("seller_user_id", i.actorId).is("closed_at", null)
      .select(CLIENT_INFO_REQUEST_COLUMNS);
    if (error) { console.error("[client-info-request] answer not recorded:", error.message); return false; }
    const row = (Array.isArray(data) ? data[0] : null) as ClientInfoRequestRow | null;
    if (!row) return false;
    const who = i.actorName ?? "The salesperson";
    await recordLeadEvent(service, i.leadId, "client_info_answered", {
      actor: i.actorId, source: "sales", body: `${who} answered the request for missing information (${i.what})`,
      data: { request_id: row.id },
    });
    if (row.requested_by) {
      await notify(service, row.requested_by, `${who} updated ${(i.businessName ?? "").trim() || "a client"}`,
        `${i.what}. The setup checklist has been re-checked.`, paidClientLink(i.leadId), i.leadId, `client_info:${row.id}:answered`, 1);
    }
    return true;
  } catch (e) {
    console.error("[client-info-request] answer threw:", e instanceof Error ? e.message : e);
    return false;
  }
}
