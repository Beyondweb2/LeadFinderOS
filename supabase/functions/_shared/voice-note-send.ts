// voice-note-send — the decision and the order of operations for ONE outgoing WhatsApp voice note.
//
// ⛔ EVERYTHING WITH A SIDE EFFECT IS INJECTED (`VoiceSendDeps`). The edge function wires the real
// Supabase and Graph calls; scripts/whatsapp-voice-note.test.ts wires fakes and drives every
// refusal and failure. A handler that could only be tested by sending a voice note to a person is
// the gap this codebase has paid for before (send-whatsapp-message's dry_run exists because of it).
//
// THE ORDER IS THE SAFETY, AND EACH STEP ONLY RUNS IF EVERY ONE ABOVE IT PASSED:
//   1. shape      — a well-formed send id, a size under the cap, a lead id;
//   2. lead       — the operator's own lead, not archived, and the RECIPIENT IS THE LEAD'S NUMBER
//                   (read from the lead row — the browser's phone is only a confirmation that must
//                   match, never the destination);
//   3. window     — the shared 24-hour leaf (src/lib/serviceWindow.ts) on the newest inbound row,
//                   checked AT SEND TIME and BEFORE any conversion, storage or Meta call;
//   4. audio      — converted/validated to Ogg/Opus mono (src/lib/oggOpus.ts); duration in range;
//   5. claim      — the ONE stored copy is written to a path derived from the send id, with
//                   upsert:false, so a double-click or a retried request cannot send twice;
//   6. Meta       — upload the media, then send { type:"audio", audio:{ id, voice:true } };
//   7. record     — the outbound whatsapp_messages row (message_type 'audio', media_path) and the
//                   whatsapp_sends row, as every other send does.
//
// ⛔ A FAILURE NEVER CLAIMS A SEND. Upload refused → the claim is released (nothing was sent, the
// recording can be retried under the same id). Send refused BY META (it answered with an error) →
// the claim and stored copy are released and a `failed` row is logged, exactly as a failed text is.
// Send result UNKNOWN (the request threw — Meta may or may not have delivered) → the claim is KEPT,
// so a retry under the same id is refused as duplicate_send rather than risking a second delivery.
//
// ⚠️ NO TEST MODE BYPASS OF THE WINDOW. The text path lets free text through outside the window in
// test mode ("simulated"); this path does not. Paul's brief: outside the window it is refused,
// whatever the mode. In test mode the note is stored and logged as `simulated` and never reaches Meta.

import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { toVoiceNoteOgg } from "../../../src/lib/oggOpus.ts";
import {
  VOICE_NOTE_MAX_UPLOAD_BYTES, VOICE_NOTE_MAX_SECONDS, VOICE_NOTE_MIN_MS, VOICE_NOTE_DURATION_SLACK_MS,
  WHATSAPP_AUDIO_MAX_BYTES, isVoiceSendId, voiceNoteObjectPath, voiceNoteBody,
} from "../../../src/lib/voiceNote.ts";

export interface VoiceSendInput {
  operatorId: string;
  leadId: string | null;
  /** The number the Inbox thinks it is talking to. Confirmation only — never the destination. */
  phone: string;
  sendId: string;
  audio: Uint8Array | null;
  /** Declared size (Content-Length / File.size), checked before the bytes are trusted. */
  declaredBytes: number;
}

export interface VoiceLead { id: string; user_id: string; phone: string | null; country: string | null; is_archived: boolean | null }

export interface VoiceSendDeps {
  now(): number;
  live: boolean;
  testMode: boolean;
  normalise(raw: string, country?: string | null): string | null;
  getLead(leadId: string): Promise<VoiceLead | null>;
  /** created_at of the newest INBOUND row from this number in this operator's conversation. */
  lastInboundAt(operatorId: string, to: string): Promise<string | null>;
  /** Write the stored copy. `exists` = the path was already taken (the claim is held). */
  claimStorage(path: string, ogg: Uint8Array): Promise<{ ok: true } | { ok: false; exists: boolean; error: string }>;
  releaseStorage(path: string): Promise<void>;
  uploadMedia(ogg: Uint8Array): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }>;
  /** Graph POST /messages. `definitive` = Meta answered (so we KNOW it was not sent). */
  sendAudio(to: string, payload: Record<string, unknown>): Promise<{ ok: true; messageId: string } | { ok: false; definitive: boolean; error: string }>;
  insertMessage(row: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  insertSendLog(row: Record<string, unknown>): Promise<void>;
  /** Replied → awaiting_reply, as any other in-window reply does. Best-effort. */
  markAnswered(leadId: string): Promise<void>;
}

export type VoiceSendResult =
  | { status: 200; body: { ok: true; status: "sent" | "simulated"; simulated: boolean; messageId: string | null; message: Record<string, unknown> | null; durationMs: number } }
  | { status: number; body: { ok: false; error: string; reason?: string; retryable?: boolean } };

/** The Meta payload for a voice note. `voice: true` is what makes WhatsApp render it as one. */
export function voiceNotePayload(mediaId: string): Record<string, unknown> {
  return { type: "audio", audio: { id: mediaId, voice: true } };
}

const no = (status: number, error: string, reason?: string, retryable?: boolean): VoiceSendResult =>
  ({ status, body: { ok: false, error, ...(reason ? { reason } : {}), ...(retryable !== undefined ? { retryable } : {}) } });

export async function sendVoiceNote(input: VoiceSendInput, deps: VoiceSendDeps): Promise<VoiceSendResult> {
  // 1 — shape
  if (!isVoiceSendId(input.sendId)) return no(400, "bad_send_id");
  if (!input.leadId) return no(400, "lead_required");
  if (input.declaredBytes > VOICE_NOTE_MAX_UPLOAD_BYTES) return no(413, "too_large");

  // 2 — the lead, and the recipient derived from it
  const lead = await deps.getLead(input.leadId);
  if (!lead || lead.user_id !== input.operatorId) return no(403, "forbidden");
  if (lead.is_archived === true) return no(409, "lead_archived");
  const to = deps.normalise(lead.phone ?? "", lead.country);
  if (!to) return no(409, "phone_mismatch", "The lead has no WhatsApp number on file.");
  const claimed = deps.normalise(input.phone, lead.country);
  if (claimed !== to) return no(409, "phone_mismatch");

  // 3 — the 24-hour window, at send time, before anything is converted, stored or sent
  const w = serviceWindowState(await deps.lastInboundAt(input.operatorId, to), deps.now());
  if (!w.open) return { status: 200, body: { ok: false, error: "window_closed" } };

  // 4 — the audio itself
  const audio = input.audio;
  if (!audio || !audio.length) return no(400, "too_short", "The recording is empty.");
  if (audio.length > VOICE_NOTE_MAX_UPLOAD_BYTES) return no(413, "too_large");
  const converted = toVoiceNoteOgg(audio);
  if (!converted.ok) return no(422, "not_voice_format", converted.detail);
  if (converted.durationMs < VOICE_NOTE_MIN_MS) return no(422, "too_short");
  if (converted.durationMs > VOICE_NOTE_MAX_SECONDS * 1000 + VOICE_NOTE_DURATION_SLACK_MS) return no(422, "too_long");
  if (converted.ogg.length > WHATSAPP_AUDIO_MAX_BYTES) return no(413, "too_large");

  // 5 — the claim (and the one stored copy the Inbox plays back)
  const path = voiceNoteObjectPath(input.operatorId, input.sendId);
  const claim = await deps.claimStorage(path, converted.ogg);
  if (!claim.ok) {
    if (claim.exists) return { status: 200, body: { ok: false, error: "duplicate_send" } };
    return no(500, "storage_failed", "The voice note could not be saved, so nothing was sent. Try again.", true);
  }

  const baseRow = {
    direction: "outbound",
    user_id: input.operatorId,
    lead_id: lead.id,
    phone: to,
    body: voiceNoteBody(converted.durationMs),
    message_type: "audio",
    template_name: null,
    media_mime_type: "audio/ogg",
    media_filename: "voice-note.ogg",
    test_mode: deps.testMode,
  };

  // 6 — Meta (or the simulation)
  let status: "sent" | "simulated" = "simulated";
  let messageId: string | null = null;
  if (deps.live) {
    const up = await deps.uploadMedia(converted.ogg);
    if (!up.ok) {
      await deps.releaseStorage(path).catch(() => undefined);
      return { status: 200, body: { ok: false, error: "meta_upload_failed", reason: `WhatsApp did not accept the audio upload, so nothing was sent. ${up.error}`.trim(), retryable: true } };
    }
    const sent = await deps.sendAudio(to, voiceNotePayload(up.mediaId));
    if (!sent.ok) {
      if (sent.definitive) await deps.releaseStorage(path).catch(() => undefined);
      /* Logged as a failed row with NO media, like a failed text: the thread shows the attempt,
         never a playable note that did not go. */
      await deps.insertMessage({ ...baseRow, media_path: null, wa_message_id: null, status: "failed", error: sent.error }).catch(() => null);
      await deps.insertSendLog({ lead_id: lead.id, user_id: input.operatorId, template: null, phone: to, business_name: null, claim_url: "", test_mode: deps.testMode, message_id: null, delivery_status: "failed", error: sent.error }).catch(() => undefined);
      return sent.definitive
        ? { status: 200, body: { ok: false, error: "meta_send_failed", reason: `WhatsApp refused the voice note, so nothing was delivered. ${sent.error}`.trim(), retryable: true } }
        : { status: 200, body: { ok: false, error: "meta_send_unknown", reason: "WhatsApp did not answer, so it is not known whether the voice note went. Check the conversation in WhatsApp before sending again.", retryable: false } };
    }
    status = "sent";
    messageId = sent.messageId;
  }

  // 7 — record it. The message is gone by now, so a failed write must never turn into a failure.
  const message = await deps.insertMessage({ ...baseRow, media_path: path, wa_message_id: messageId, status, error: null }).catch(() => null);
  await deps.insertSendLog({ lead_id: lead.id, user_id: input.operatorId, template: null, phone: to, business_name: null, claim_url: "", test_mode: deps.testMode, message_id: messageId, delivery_status: status, error: null }).catch(() => undefined);
  if (deps.live) await deps.markAnswered(lead.id).catch(() => undefined);

  return { status: 200, body: { ok: true, status, simulated: !deps.live, messageId, message, durationMs: converted.durationMs } };
}
