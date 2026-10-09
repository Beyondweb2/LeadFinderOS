import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, pickRole, resolveActor, type Actor } from "../_shared/access.ts";
import { sendSmsToLead } from "../_shared/twilio-sms.ts";
import { loadQaExclusions } from "../_shared/qa-guard.ts";
import { qaSendVerdict } from "../../../src/lib/qaSafety.ts";
import { isColdSmsTemplate, SMS_QUEUE_DAILY_CAP, SMS_QUEUE_GAP_SECONDS, SMS_QUEUE_MAX_ATTEMPTS, londonDayStartUtc, smsWindowOpen } from "../../../src/lib/smsMessages.ts";

// process-sms-queue — the SMS drip (2026-10-09). The twin of process-whatsapp-queue, deliberately smaller.
//
// Called every minute by pg_cron (invoke_sms_queue → x-cron-secret). It sends AT MOST ONE text per tick:
//   · paused (sms_queue_state)  → nothing           · outside the window (London) → nothing
//   · daily cap reached         → nothing           · pacing clock not due       → nothing
// then takes the OLDEST waiting lead (outreach_leads.sms_queued_at) and sends the approved opener through the ONE guarded
// sender (_shared/twilio-sms.ts) AS THE PERSON WHO QUEUED IT — so ownership, opt-outs, the cold rules, QA safety and the
// rep's own abuse limits are exactly the ones a manual send meets. Nothing here can send a different text.
//
// ⛔ A lead leaves the queue only when it is DONE: sent, or definitively refused (its reason is stored on the lead in
//    sms_delivery_status and shown in the panel). A transient failure retries up to SMS_QUEUE_MAX_ATTEMPTS, then leaves with
//    its reason. A lead held by a test account is never chosen and never dropped (it stays waiting, visible in the panel).
// ⛔ Test mode (TWILIO_TEST_MODE, the default) makes every send a simulation: the lead still leaves the queue so the whole
//    workflow can be exercised, but nothing real is sent and no send stamp is written.
// ⛔ Idempotent: the send key is per lead per queueing, so a retried tick can never text twice.

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  /* Two callers only: the cron (x-cron-secret), or an ADMIN's own session asking for { send_now: true } — the Inbox's "Send now", the twin of
     WhatsApp's. Send now skips ONLY the pacing wait; pause, the window, the daily cap and every send guard still apply. Anyone else: refused. */
  let sendNow = false;
  if (!isInternalCall(req)) {
    const body = await req.json().catch(() => ({})) as { send_now?: unknown };
    if (body?.send_now !== true) return json({ ok: false, error: "forbidden" }, 403);
    const who = await resolveActor(req, service);
    if (!who.ok || who.actor.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);
    sendNow = true;
  }
  try {
    const { data: st, error: stErr } = await service.from("sms_queue_state").select("paused, next_send_at").eq("id", 1).maybeSingle();
    if (stErr || !st) return json({ ok: true, skipped: "state_unreadable" });
    if (st.paused === true) return json({ ok: true, skipped: "paused" });
    if (!smsWindowOpen()) return json({ ok: true, skipped: "outside_window" });
    if (!sendNow && st.next_send_at && new Date(st.next_send_at) > new Date()) return json({ ok: true, skipped: "not_due" });

    const { count: sentToday } = await service.from("sms_messages").select("id", { count: "exact", head: true })
      .eq("direction", "outbound").eq("test_mode", false).not("status", "in", "(failed,undelivered)").gte("created_at", londonDayStartUtc().toISOString());
    if ((sentToday ?? 0) >= SMS_QUEUE_DAILY_CAP) return json({ ok: true, skipped: "cap_reached", sentToday });

    // Oldest waiting lead that may be sent. Held (test-account) and suspended-rep leads are skipped, never dropped.
    const { data: rows } = await service.from("outreach_leads")
      .select("id, business_name, phone, assigned_to_user_id, sms_queued_at, sms_queued_by_user_id, sms_attempts, sms_queued_template")
      .not("sms_queued_at", "is", null).eq("is_archived", false).not("sms_queued_by_user_id", "is", null)
      .order("sms_queued_at", { ascending: true }).limit(25);
    const { data: susp, error: suspErr } = await service.from("team_members").select("user_id").not("suspended_at", "is", null);
    if (suspErr) return json({ ok: true, skipped: "team_read_failed" });
    const suspended = new Set(((susp ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    let qa;
    try { qa = await loadQaExclusions(service); } catch { return json({ ok: true, skipped: "qa_guard_read_failed" }); }
    const lead = ((rows ?? []) as Array<Record<string, unknown>>).find((l) =>
      !suspended.has(String(l.sms_queued_by_user_id))
      && qaSendVerdict(qa, { leadId: String(l.id), phones: [l.phone as string | null], holderUserId: (l.assigned_to_user_id as string | null) ?? null }).kind !== "refuse");
    if (!lead) return json({ ok: true, skipped: (rows ?? []).length ? "all_held" : "empty_queue" });

    // Who it is sent AS: the person who queued it (their role is read fresh — a removed role means nothing is sent).
    const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", lead.sms_queued_by_user_id);
    const role = pickRole(roleRows);
    const finish = async (patch: Record<string, unknown>) => { await service.from("outreach_leads").update(patch).eq("id", lead.id); };
    const pace = async () => {
      const gap = SMS_QUEUE_GAP_SECONDS.min + Math.random() * (SMS_QUEUE_GAP_SECONDS.max - SMS_QUEUE_GAP_SECONDS.min);
      await service.from("sms_queue_state").update({ next_send_at: new Date(Date.now() + gap * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", 1);
    };
    if (!role) {
      await finish({ sms_queued_at: null, sms_queued_by_user_id: null, sms_delivery_status: "queuer_no_access", contact_method: null });
      await pace();
      return json({ ok: true, skipped: "queuer_no_access", lead_id: lead.id });
    }
    // ⛔ ONLY A COLD OPENER (the two approved WhatsApp openers) is ever sent from the queue; anything else on a row is dropped, not sent.
    if (!isColdSmsTemplate(lead.sms_queued_template)) {
      await finish({ sms_queued_at: null, sms_queued_by_user_id: null, sms_delivery_status: "bad_template", contact_method: null });
      await pace();
      return json({ ok: true, skipped: "bad_template", lead_id: lead.id });
    }
    const actor: Actor = { id: String(lead.sms_queued_by_user_id), email: null, role } as Actor;
    const r = await sendSmsToLead(service, {
      actor, leadId: String(lead.id), template: lead.sms_queued_template as never,
      idempotencyKey: `smsq:${lead.id}:${String(lead.sms_queued_at)}`, source: "queue",
    });
    await pace();
    if (r.ok) {
      await finish({ sms_queued_at: null, sms_queued_by_user_id: null, sms_attempts: Number(lead.sms_attempts ?? 0) + 1, ...(r.simulated ? { sms_delivery_status: "simulated" } : {}) });
      return json({ ok: true, sent: true, simulated: r.simulated, duplicate: r.duplicate, lead_id: lead.id, status: r.message.status });
    }
    // A refusal that will not change (opted out, not a UK mobile, already texted, …) ends the wait; a transient one retries.
    const transient = ["send_failed", "lookup_failed", "log_failed", "suppression_unreadable", "usage_paused", "not_configured"].includes(r.error);
    const attempts = Number(lead.sms_attempts ?? 0) + 1;
    if (transient && attempts < SMS_QUEUE_MAX_ATTEMPTS) {
      await finish({ sms_attempts: attempts, sms_delivery_status: r.error });
      return json({ ok: true, sent: false, retry: true, error: r.error, lead_id: lead.id });
    }
    // The lead's SMS state: a number that can never be a UK mobile is No SMS; a Twilio send failure was already classified by the sender
    // (markLeadSmsRefused: No SMS / opt-out / SMS failed by code) so it is not overwritten; any other rule refusal is stored as its reason.
    const stateFields: Record<string, unknown> = r.error === "not_uk_mobile" ? { sms_delivery_status: "no_sms" } : r.error === "send_failed" ? {} : { sms_delivery_status: r.error };
    await finish({ sms_queued_at: null, sms_queued_by_user_id: null, sms_attempts: attempts, ...stateFields, contact_method: null });
    return json({ ok: true, sent: false, dropped: true, error: r.error, lead_id: lead.id });
  } catch (e) {
    console.error("[process-sms-queue] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
