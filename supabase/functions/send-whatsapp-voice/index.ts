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
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { sendVoiceNote } from "../_shared/voice-note-send.ts";
import { voiceSendDeps } from "../_shared/voice-note-deps.ts";
import { queueGate } from "../_shared/inbox-schedule.ts";
import { VOICE_NOTE_MAX_UPLOAD_BYTES, voiceNoteBody } from "../../../src/lib/voiceNote.ts";
import { QA_REFUSAL_REASON } from "../../../src/lib/qaSafety.ts";
import { qaSendHold } from "../_shared/qa-guard.ts";

/* The deploy marker, on the OPTIONS preflight like send-whatsapp-message's x-swm-build: readable
   with no credential, carries no secret. Bump it with any change worth proving live. */
const BUILD_ID = "2026-10-21a-voice-send-window";

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
    const gateService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, gateService);
    if (!who.ok) return json({ ...refusalBody(who), reason: who.detail }, who.status);
    const actor = who.actor;

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
    /* ⛔ QA SAFETY (2026-10-04, src/lib/qaSafety.ts): a QA fixture gets the test-mode env for this one
       request (simulated, nothing reaches Meta); a real lead held by a test account, or a send pressed by
       one, is refused. A failed read throws — fail closed. */
    const qa = await qaSendHold(service, { leadId: str("lead_id") || null, to: str("phone") || null, actorUserId: actor.id });
    if (qa.kind === "refuse") return json({ ok: false, error: "qa_test_account", reason: QA_REFUSAL_REASON }, 200);
    /* ⛔ WHOSE BOOK, WHO PRESSED SEND (2026-09-27, multi-user). admin: unchanged. sales: must name a
       lead assigned to them; the thread is the lead's book, the person goes in sent_by_user_id and
       in whatsapp_sends.user_id (the sender diagnostic). */
    let operatorId = actor.id;
    if (actor.role !== "admin") {
      const salesLeadId = str("lead_id");
      if (!salesLeadId) return json({ ok: false, error: "lead_required", reason: "Open the lead to send a voice note." }, 400);
      const access = await leadAccess(service, actor, salesLeadId);
      if (!access.ok) return json({ ok: false, error: access.error === "lookup_failed" ? "upstream_timeout" : "forbidden" }, access.error === "lookup_failed" ? 503 : 403);
      operatorId = access.bookUserId;
      /* ⛔ A SUSPENDED SALESPERSON SENDS NOTHING (2026-09-29, docs/abuse-cost-protection.md). */
      const guard = await guardAction(service, actor.id, "whatsapp_send", { fn: "send-whatsapp-voice", leadId: salesLeadId, role: actor.role });
      if (!guard.ok) return json(guard.body, guard.status);
    }

    const deps = voiceSendDeps(service, qa, actor.id);
    if (!deps) return json({ ok: false, error: "qa_test_account", reason: QA_REFUSAL_REASON }, 200);
    const result = await sendVoiceNote({
      operatorId,
      leadId: str("lead_id") || null,
      phone: str("phone"),
      sendId: str("send_id"),
      declaredBytes: audioFile?.size ?? 0,
      /* Read only if the declared size is under the cap; the module re-checks the real length. */
      audio: audioFile && audioFile.size <= VOICE_NOTE_MAX_UPLOAD_BYTES ? new Uint8Array(await audioFile.arrayBuffer()) : null,
    }, {
      ...deps,
      /* ⛔ THE INBOX SEND WINDOW (2026-10-21, src/lib/inboxSendWindow.ts): outside the lead's send hours the checked recording is
         stored once (whatsapp-media, its own path) and queued; inbox-scheduled-send sends it when the hours open, re-checking first. */
      async queueOutsideWindow({ to, leadId, ogg, durationMs, lastInboundAt }) {
        const sendId = str("send_id").toLowerCase();
        const mediaPath = `${operatorId}/scheduled-voice-${sendId}.ogg`;
        const gate = await queueGate(service, {
          bookUserId: operatorId, leadId, phone: to, channel: "whatsapp", kind: "voice", body: voiceNoteBody(durationMs),
          mediaPath, durationMs, queuedBy: actor.id,
        }, lastInboundAt, async () => {
          const { error } = await service.storage.from("whatsapp-media").upload(mediaPath, ogg, { contentType: "audio/ogg", upsert: false });
          if (!error) return { ok: true as const };
          const msg = String((error as { message?: string }).message ?? "");
          if (/exist|duplicate/i.test(msg)) return { ok: false as const, error: "duplicate_send", reason: "This voice note is already queued." };
          return { ok: false as const, error: "storage_failed", reason: "The voice note could not be saved, so nothing was queued. Try again." };
        });
        return gate ? { status: 200, body: gate } as never : null;
      },
    });
    /* ⛔ QA: a SIMULATED fixture send moves the lead exactly as a live one would — the module above only
       does it when live. Same scoped update as markAnswered (Replied only). */
    const qaLeadId = str("lead_id");
    if (qa.kind === "simulate" && (result.body as { ok?: boolean }).ok === true && (result.body as { status?: string }).status !== "scheduled" && qaLeadId) {
      await service.from("outreach_leads")
        .update({ status: "awaiting_reply", whatsapp_template: null, whatsapp_sent_at: new Date().toISOString() })
        .eq("id", qaLeadId).eq("status", "replied");
    }
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
