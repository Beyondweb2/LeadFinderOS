// voice-note-deps — the real Supabase + Meta wiring for sendVoiceNote (_shared/voice-note-send.ts).
// ONE copy, used by send-whatsapp-voice (the Inbox's Send) and by inbox-scheduled-send (a voice note queued outside the lead's
// send hours, sent when they open). Moved here unchanged from send-whatsapp-voice on 2026-10-21.
import { resolveWhatsAppEnv, sendViaGraph, toWhatsAppNumber } from "./whatsapp-send.ts";
import type { qaSendHold } from "./qa-guard.ts";
import { uploadMediaToGraph } from "./whatsapp-media-upload.ts";
import type { VoiceLead, VoiceSendDeps } from "./voice-note-send.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

type QaHold = Awaited<ReturnType<typeof qaSendHold>>;

/** `senderId` = the person who pressed Send (sent_by_user_id and whatsapp_sends.user_id).
 *  ⛔ `qa` is the caller's qaSendHold verdict, REQUIRED: a QA fixture gets the test-mode env (simulated, nothing reaches Meta) and a
 *  refused one gets no deps at all (null) — the caller answers qa_test_account. The env is decided here, from that verdict, once. */
export function voiceSendDeps(service: Service, qa: QaHold, senderId: string): VoiceSendDeps | null {
  if (qa.kind === "refuse") return null;
  const liveEnv = resolveWhatsAppEnv();
  const env = qa.kind === "simulate" ? { ...liveEnv, live: false, testMode: true } : liveEnv;
  return {
    now: () => Date.now(),
    live: env.live,
    testMode: env.testMode,
    normalise: toWhatsAppNumber,
    async getLead(id) {
      const { data } = await service.from("outreach_leads").select("id, user_id, phone, country, is_archived").eq("id", id).maybeSingle();
      return (data as VoiceLead | null) ?? null;
    },
    async lastInboundAt(uid, to) {
      /* Same read as send-whatsapp-message's window: the operator's own inbound rows for this number. */
      const { data } = await service.from("whatsapp_messages").select("created_at")
        .eq("user_id", uid).eq("phone", to).eq("direction", "inbound")
        .order("created_at", { ascending: false }).limit(1);
      return (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
    },
    async claimStorage(path, ogg) {
      const { error } = await service.storage.from("whatsapp-media").upload(path, ogg, { contentType: "audio/ogg", upsert: false });
      if (!error) return { ok: true };
      const msg = String((error as { message?: string }).message ?? "");
      const code = String((error as { statusCode?: string | number }).statusCode ?? "");
      return { ok: false, exists: /exist|duplicate/i.test(msg) || code === "409", error: msg };
    },
    async releaseStorage(path) {
      await service.storage.from("whatsapp-media").remove([path]);
    },
    uploadMedia: (ogg) => uploadMediaToGraph(env.accessToken, env.phoneNumberId, ogg, "audio/ogg", "voice-note.ogg"),
    async sendAudio(to, payload) {
      const r = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);
      if (r.ok && r.messageId) return { ok: true, messageId: r.messageId };
      /* Meta answered with an error code → definitely not sent. Anything else (a throw, a non-JSON
         5xx) → unknown, and the module keeps the claim so a retry cannot double-send. */
      return { ok: false, definitive: typeof r.failCode === "number", error: r.error ?? "send failed" };
    },
    async insertMessage(row) {
      const { data, error } = await service.from("whatsapp_messages").insert({ ...row, sent_by_user_id: senderId }).select("*").maybeSingle();
      if (error) console.error("[voice-note] message insert failed:", error.message);
      return (data as Record<string, unknown> | null) ?? null;
    },
    async insertSendLog(row) {
      const { error } = await service.from("whatsapp_sends").insert({ ...row, user_id: senderId });
      if (error) console.error("[voice-note] send-audit insert failed (non-blocking):", error.message);
    },
    async markAnswered(leadId) {
      /* The same scoped move send-whatsapp-message makes for a free-form reply: only a lead that is
         currently on Replied, so no later pipeline status can be overwritten. */
      await service.from("outreach_leads")
        .update({ status: "awaiting_reply", whatsapp_template: null, whatsapp_sent_at: new Date().toISOString() })
        .eq("id", leadId).eq("status", "replied");
    },
  };
}
