// inbox-scheduled-send — sends the Inbox messages that were queued outside the lead's send hours, once the hours open.
// Called every minute by pg_cron (invoke_inbox_scheduled_send → x-cron-secret; it only calls when a row is due). Nobody else.
//
// The tick's order and every decision live in _shared/inbox-scheduled-drain.ts (tested with fakes); the rules in
// src/lib/inboxSendWindow.ts. This file only wires them to the database and the channel senders:
//   · WhatsApp text / template → send-whatsapp-message, by its CRON_SECRET door that names the CLAIMED row (the row is the send);
//   · WhatsApp voice note      → the voice sender's own module, in process, with the stored recording;
//   · text (SMS)               → sendSmsToLead, in process.
// Every one of those runs ALL of its own checks again, as the person who queued it (their role re-read now).
// ⛔ Independent of the WhatsApp drip: it reads no queue state, unpauses nothing and never touches outreach_leads.status = 'queued'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, leadAccess, pickRole, type Actor } from "../_shared/access.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { loadCountrySettings } from "../_shared/country-settings.ts";
import { loadReplyHours, SCHEDULED_COLUMNS, SCHEDULED_JOB_HEADER, type ScheduledRow } from "../_shared/inbox-schedule.ts";
import { drainTick, senderOutcome, type DueRow, type SendOutcome } from "../_shared/inbox-scheduled-drain.ts";
import { sendVoiceNote } from "../_shared/voice-note-send.ts";
import { voiceSendDeps } from "../_shared/voice-note-deps.ts";
import { sendSmsToLead } from "../_shared/twilio-sms.ts";
import { qaSendHold } from "../_shared/qa-guard.ts";
import { guardAction } from "../_shared/protection.ts";

const BUILD_ID = "2026-10-21a-inbox-send-window";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-iss-build",
  "x-iss-build": BUILD_ID,
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!isInternalCall(req)) return json({ ok: false, error: "forbidden" }, 403);
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  try {
    const [replyHours, countrySettings] = await Promise.all([loadReplyHours(service), loadCountrySettings(service)]);
    const full = new Map<string, ScheduledRow>();
    const stamp = () => new Date().toISOString();

    async function actorFor(userId: string): Promise<Actor | null> {
      const { data, error } = await service.from("user_roles").select("role").eq("user_id", userId);
      if (error) return null;
      const role = pickRole(data);
      return role ? { id: userId, role } : null;
    }

    async function sendWhatsAppText(row: DueRow): Promise<SendOutcome> {
      const res = await fetch(`${url}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": SCHEDULED_JOB_HEADER,
        },
        body: JSON.stringify({ scheduled_id: row.id }),
      });
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.message as { id?: string } | null | undefined;
      return senderOutcome(body, msg?.id);
    }

    async function sendVoice(row: ScheduledRow): Promise<SendOutcome> {
      const actor = await actorFor(row.queued_by);
      if (!actor) return { ok: false, error: "The person who queued it no longer has access, so it was not sent." };
      if (!row.lead_id || !row.media_path) return { ok: false, error: "The queued voice note is incomplete." };
      if (actor.role !== "admin") {
        const access = await leadAccess(service, actor, row.lead_id);
        if (!access.ok) return { ok: false, error: "The lead is no longer theirs, so it was not sent." };
        const guard = await guardAction(service, actor.id, "whatsapp_send", { fn: "inbox-scheduled-send", leadId: row.lead_id, role: actor.role });
        if (!guard.ok) return { ok: false, error: String((guard.body as { detail?: string; error?: string }).detail ?? guard.body.error ?? "usage_paused") };
      }
      const qa = await qaSendHold(service, { leadId: row.lead_id, to: row.phone, actorUserId: actor.id });
      if (qa.kind === "refuse") return { ok: false, error: "This is a real business held by a test account, so nothing was sent." };
      const { data: blob, error } = await service.storage.from("whatsapp-media").download(row.media_path);
      if (error || !blob) return { ok: false, error: "The queued recording could not be read, so nothing was sent." };
      const audio = new Uint8Array(await blob.arrayBuffer());
      /* The row id is the send id: a second attempt at the same row is refused as duplicate_send by the voice module's claim. */
      const deps = voiceSendDeps(service, qa, actor.id);
      if (!deps) return { ok: false, error: "This is a real business held by a test account, so nothing was sent." };
      const r = await sendVoiceNote({ operatorId: row.user_id, leadId: row.lead_id, phone: row.phone, sendId: row.id, audio, declaredBytes: audio.length }, deps);
      const body = r.body as Record<string, unknown>;
      const out = senderOutcome(body, (body.message as { id?: string } | null | undefined)?.id);
      if (out.ok) await service.storage.from("whatsapp-media").remove([row.media_path]).catch(() => undefined);
      return out;
    }

    async function sendText(row: ScheduledRow): Promise<SendOutcome> {
      const actor = await actorFor(row.queued_by);
      if (!actor) return { ok: false, error: "The person who queued it no longer has access, so it was not sent." };
      if (!row.lead_id) return { ok: false, error: "A text needs its lead." };
      const r = await sendSmsToLead(service, {
        actor, leadId: row.lead_id, idempotencyKey: `inbox-sched:${row.id}`, allowResend: row.allow_resend === true, source: "queue",
        ...(row.kind === "text" ? { text: row.body } : row.sms_extended ? { extended: row.sms_extended } : { template: row.template_name as never }),
      });
      const body = r as unknown as Record<string, unknown>;
      return senderOutcome(body, (body.message as { id?: string } | undefined)?.id);
    }

    const report = await drainTick({
      now: () => new Date(),
      replyHours, countrySettings,
      async closeStuckSending(olderThan) {
        const { data } = await service.from("inbox_scheduled_sends")
          .update({ status: "failed", error: "The send did not finish and it is not known whether it went. Check the conversation before sending again.", updated_at: stamp() })
          .eq("status", "sending").lt("claimed_at", olderThan).select("id");
        return (data ?? []).length;
      },
      async dueRows(nowIso, limit) {
        const { data, error } = await service.from("inbox_scheduled_sends").select(SCHEDULED_COLUMNS)
          .eq("status", "scheduled").lte("send_at", nowIso).order("send_at", { ascending: true }).order("created_at", { ascending: true }).limit(limit);
        if (error) throw new Error(`due read failed: ${error.message}`);
        for (const r of (data ?? []) as ScheduledRow[]) full.set(r.id, r);
        return (data ?? []) as DueRow[];
      },
      async suppression(row) {
        const s = await checkSuppressed(service, { phone: `+${row.phone}`, leadId: row.lead_id });
        if (!s.suppressed) return "none";
        if (s.matchedOn === "lookup_failed") return "unknown";
        if (s.wrongNumber) return "wrong_number";
        return s.reason === "opted_out" ? "opted_out" : "other";
      },
      async lead(id) {
        const { data } = await service.from("outreach_leads").select("is_archived, status").eq("id", id).maybeSingle();
        return (data as { is_archived: boolean | null; status: string | null } | null) ?? null;
      },
      async newestInbound(row) {
        const [{ data: wa }, { data: sms }] = await Promise.all([
          service.from("whatsapp_messages").select("created_at").eq("user_id", row.user_id).eq("phone", row.phone).eq("direction", "inbound")
            .order("created_at", { ascending: false }).limit(1),
          service.from("sms_messages").select("created_at").eq("phone", row.phone).eq("direction", "inbound")
            .order("created_at", { ascending: false }).limit(1),
        ]);
        const w = (wa?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        const s = (sms?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
        const any = [w, s].filter(Boolean).sort().pop() ?? null;
        return { any, whatsapp: w };
      },
      async earlierPending(row) {
        const { data } = await service.from("inbox_scheduled_sends").select("id").eq("phone", row.phone).eq("channel", row.channel)
          .in("status", ["scheduled", "sending", "held"]).lt("created_at", row.created_at).limit(1);
        /* An unreadable answer keeps the order (waits) rather than risk sending out of turn. */
        return data == null ? true : data.length > 0;
      },
      async reschedule(id, sendAt) {
        await service.from("inbox_scheduled_sends").update({ send_at: sendAt, updated_at: stamp() }).eq("id", id).eq("status", "scheduled");
      },
      async hold(id, reason) {
        await service.from("inbox_scheduled_sends").update({ status: "held", hold_reason: reason, updated_at: stamp() }).eq("id", id).eq("status", "scheduled");
      },
      async cancel(id, reason) {
        await service.from("inbox_scheduled_sends").update({ status: "cancelled", cancel_reason: reason, updated_at: stamp() }).eq("id", id).eq("status", "scheduled");
      },
      async claim(id) {
        const { data } = await service.from("inbox_scheduled_sends").update({ status: "sending", claimed_at: stamp(), updated_at: stamp() })
          .eq("id", id).eq("status", "scheduled").select("id").maybeSingle();
        return !!data;
      },
      async send(row) {
        const r = full.get(row.id);
        if (!r) return { ok: false, error: "The queued row could not be read." };
        if (r.channel === "sms") return sendText(r);
        if (r.kind === "voice") return sendVoice(r);
        return sendWhatsAppText(row);
      },
      async finish(id, outcome) {
        await service.from("inbox_scheduled_sends").update(outcome.ok
          ? { status: "sent", sent_message_id: outcome.messageId, error: null, updated_at: stamp() }
          : { status: "failed", error: outcome.error, updated_at: stamp() }).eq("id", id).eq("status", "sending");
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
    return json({ ok: true, ...report });
  } catch (e) {
    console.error("[inbox-scheduled-send] error:", (e as Error)?.message ?? String(e));
    return json({ ok: false, error: "internal" }, 500);
  }
});
