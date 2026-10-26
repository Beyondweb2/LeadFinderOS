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
import { answeredAfter, autoSendCounts, loadAutoSendState, personActiveAt, sendAsIsAdmin } from "../_shared/ai-auto-send.ts";
import { autoSendVerdict, draftFactsFromRow, theirMessagesSinceUs } from "../../../src/lib/aiAutoSend.ts";
import { senderChosenName } from "../_shared/sender-name.ts";
import { isHookDraft, signHook } from "../../../src/lib/hookSignature.ts";

const BUILD_ID = "2026-10-21d-named-share-no-chatgpt";
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
      /* ⛔ NO Authorization / apikey HEADER (2026-10-22). The door is x-cron-secret + x-internal-job (scheduledSendFor). A
         "Bearer <service key>" here was refused by the platform gateway before the function ran ({"message":"Invalid API key"}),
         so every queued WhatsApp send failed with no reason. send-whatsapp-message is verify_jwt = false. */
      const res = await fetch(`${url}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": SCHEDULED_JOB_HEADER,
        },
        body: JSON.stringify({ scheduled_id: row.id }),
      });
      const body = await res.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.message as { id?: string } | null | undefined;
      return senderOutcome(body, msg?.id, res.status);
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
        const { data, error } = await service.from("inbox_scheduled_sends").select(`${SCHEDULED_COLUMNS}, ai_draft_id, ai_intent`)
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
      /* LEVEL 2 — an automatic AI reply's last check, with the same rule that queued it (src/lib/aiAutoSend.ts). Its draft must
         still be open, unchanged and linked to this row; nobody may have answered, typed or sent since; the switches, the cap,
         the sender and every safety fact are read again NOW. Anything else drops it and the draft waits for a person. */
      async autoRecheck(row) {
        const r = full.get(row.id) as (ScheduledRow & { ai_draft_id?: string | null; ai_intent?: string | null }) | undefined;
        if (!r || !r.ai_draft_id) return "ai_row_unreadable";
        const { data: d, error: dErr } = await service.from("ai_reply_drafts")
          .select("id, kind, status, draft_text, why, inbound_at, inbound_message_id, auto_send_id").eq("id", r.ai_draft_id).maybeSingle();
        if (dErr || !d) return "ai_draft_unreadable";
        if (d.status !== "pending" || d.auto_send_id !== r.id) return "ai_draft_closed";
        /* The words must be the draft's — or, for the hook, exactly the draft signed with the queuing person's own chosen name
           (src/lib/hookSignature.ts, what ai-reply-drafts queued). Nothing looser. */
        if ((d.draft_text ?? "") !== (r.body ?? "")) {
          const signedBy = isHookDraft(d.why as Record<string, string | null> | null) ? await senderChosenName(service, r.queued_by) : null;
          if (!signedBy || signHook(d.draft_text ?? "", signedBy) !== (r.body ?? "")) return "ai_text_changed";
        }
        const facts = draftFactsFromRow(d);
        if (facts.key !== (r.ai_intent ?? "")) return "ai_type_changed";
        const auto = (d.why as { autoSend?: Record<string, unknown> } | null)?.autoSend ?? null;
        if (!auto || !("threadHard" in auto)) return "ai_thread_unreadable";
        if (await answeredAfter(service, r.phone, d.inbound_at)) return "ai_answered";
        const [st, counts, active, inb, lead, recent] = await Promise.all([
          loadAutoSendState(service), autoSendCounts(service), personActiveAt(service, r.phone),
          service.from("whatsapp_messages").select("body").eq("id", d.inbound_message_id).maybeSingle(),
          r.lead_id ? service.from("outreach_leads").select("amount_paid, status, is_archived").eq("id", r.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
          /* Their messages since our last one (the first-reply pitch goes only on a plain "yes" / "how can I help"). */
          service.from("whatsapp_messages").select("direction, body").eq("phone", r.phone).order("created_at", { ascending: false }).limit(20),
        ]);
        if (inb.error || lead.error || recent.error) return "ai_facts_unreadable";
        const thread = ((recent.data ?? []) as Array<{ direction: string; body: string | null }>).slice().reverse()
          .map((m) => ({ from: m.direction === "inbound" ? "them" as const : "us" as const, text: m.body }));
        const verdict = autoSendVerdict({
          masterOn: st.masterOn, intentsOn: st.intents, dailyCap: st.dailyCap, usedToday: counts.sentToday, draft: facts,
          theirMessages: theirMessagesSinceUs(thread),
          latestInbound: (inb.data as { body?: string | null } | null)?.body ?? "", threadHard: (auto.threadHard as string | null) ?? null,
          digits: r.phone, lead: lead.data as { amount_paid?: unknown; status?: unknown; is_archived?: unknown } | null,
          /* The drain has just read the suppression list for this row (drainDecision cancels a suppressed one). */
          suppressed: false,
          personActiveAt: active, senderIsAdmin: st.sendAs === r.queued_by && await sendAsIsAdmin(service, r.queued_by), nowMs: Date.now(),
        });
        return verdict.send ? null : `ai_${verdict.reason}`;
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
