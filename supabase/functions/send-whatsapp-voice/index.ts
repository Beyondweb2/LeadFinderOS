// send-whatsapp-voice — ONE recorded voice note from the Inbox to ONE lead, inside the 24-hour
// customer-service window only.
//
// The rules and their order live in _shared/voice-note-send.ts (tested with fakes in
// scripts/whatsapp-voice-note.test.ts); this file only wires them to Supabase and Meta.
//
// ⛔ SEPARATE FROM send-whatsapp-message ON PURPOSE. That function's template and text protections
// were deliberately left untouched (Paul, 2026-09-25), and a multipart upload does not fit its JSON
// body. Nothing here sends a template or free text; nothing there sends audio.
// ⛔ META CREDENTIALS NEVER LEAVE THE SERVER. The browser posts the recording here; this function
// uploads it to Meta and sends it.
// Auth: the operator's own JWT (resolveOperator), then the lead must be theirs — see the module.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOperator } from "../_shared/operator-auth.ts";
import { resolveWhatsAppEnv, toWhatsAppNumber, sendViaGraph } from "../_shared/whatsapp-send.ts";
import { uploadMediaToGraph } from "../_shared/whatsapp-media-upload.ts";
import { sendVoiceNote } from "../_shared/voice-note-send.ts";
import { VOICE_NOTE_MAX_UPLOAD_BYTES } from "../../../src/lib/voiceNote.ts";

/* The deploy marker, on the OPTIONS preflight like send-whatsapp-message's x-swm-build: readable
   with no credential, carries no secret. Bump it with any change worth proving live. */
const BUILD_ID = "2026-09-25a-voice";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-swv-build",
  "x-swv-build": BUILD_ID,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* Multipart overhead allowance above the audio cap, for the boundary and the three small fields. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const who = await resolveOperator(req);
    if (!who.ok) return json({ ok: false, error: who.error, reason: who.detail }, who.status);

    /* Refuse an oversized body BEFORE reading it into memory. */
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > VOICE_NOTE_MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES) {
      return json({ ok: false, error: "too_large" }, 413);
    }
    const form = await req.formData().catch(() => null);
    if (!form) return json({ ok: false, error: "bad_request" }, 400);
    const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };
    const file = form.get("audio");
    const audioFile = file && typeof file !== "string" ? file : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const env = resolveWhatsAppEnv();
    const operatorId = who.user.id;

    const result = await sendVoiceNote({
      operatorId,
      leadId: str("lead_id") || null,
      phone: str("phone"),
      sendId: str("send_id"),
      declaredBytes: audioFile?.size ?? 0,
      /* Read only if the declared size is under the cap; the module re-checks the real length. */
      audio: audioFile && audioFile.size <= VOICE_NOTE_MAX_UPLOAD_BYTES ? new Uint8Array(await audioFile.arrayBuffer()) : null,
    }, {
      now: () => Date.now(),
      live: env.live,
      testMode: env.testMode,
      normalise: toWhatsAppNumber,
      async getLead(id) {
        const { data } = await service.from("outreach_leads").select("id, user_id, phone, country, is_archived").eq("id", id).maybeSingle();
        return (data as { id: string; user_id: string; phone: string | null; country: string | null; is_archived: boolean | null } | null) ?? null;
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
        const { data, error } = await service.from("whatsapp_messages").insert(row).select("*").maybeSingle();
        if (error) console.error("[send-whatsapp-voice] message insert failed:", error.message);
        return (data as Record<string, unknown> | null) ?? null;
      },
      async insertSendLog(row) {
        const { error } = await service.from("whatsapp_sends").insert(row);
        if (error) console.error("[send-whatsapp-voice] send-audit insert failed (non-blocking):", error.message);
      },
      async markAnswered(leadId) {
        /* The same scoped move send-whatsapp-message makes for a free-form reply: only a lead that is
           currently on Replied, so no later pipeline status can be overwritten. */
        await service.from("outreach_leads")
          .update({ status: "awaiting_reply", whatsapp_template: null, whatsapp_sent_at: new Date().toISOString() })
          .eq("id", leadId).eq("status", "replied");
      },
    });
    return json(result.body, result.status);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[send-whatsapp-voice] error:", msg);
    try {
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (url && key) {
        /* error_id + context only: client_error_reports has no `message` column (CLAUDE.md §8). */
        await createClient(url, key, { auth: { persistSession: false } }).from("client_error_reports")
          .insert({ error_id: "send_whatsapp_voice_threw", context: { message: msg.slice(0, 2000), at: new Date().toISOString(), build: BUILD_ID } });
      }
    } catch { /* recording is never allowed to matter */ }
    return json({ ok: false, error: "internal", reason: "The voice note could not be processed. Nothing was confirmed as sent — check the thread before trying again." }, 500);
  }
});
