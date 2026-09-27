// media-attachment-send — the decision and the order of operations for ONE outgoing WhatsApp
// attachment (image, video or document) inside the 24-hour window (2026-09-27).
//
// ⛔ THE SAME SHAPE AS voice-note-send.ts, ON PURPOSE, AND SEPARATE FROM IT: the voice-note path is
// left exactly as it was. Everything with a side effect is injected (`MediaSendDeps`); the edge
// function wires Supabase and Graph, scripts/whatsapp-media-send.test.ts wires fakes and drives
// every refusal and failure without sending anything to anyone.
//
// THE ORDER IS THE SAFETY; EACH STEP RUNS ONLY IF EVERY ONE ABOVE IT PASSED:
//   1. shape   — a well-formed send id, a lead id, an allowed extension, a size under that kind's
//                cap, a caption under Meta's limit (src/lib/mediaAttachment.ts);
//   2. lead    — the operator's own book lead, not archived, and the RECIPIENT IS THE LEAD'S NUMBER
//                (the browser's phone is only a confirmation that must match). The edge function has
//                already refused a salesperson whose lead is not assigned to them or is a client;
//   3. window  — the shared 24-hour leaf on the newest inbound row, AT SEND TIME, before any storage
//                or Meta call (so a window that closed while the file was being chosen is refused);
//   4. bytes   — the real length under the cap, and the first bytes match the claimed type;
//   —  dry run — stops here: every check above ran, nothing was stored or sent;
//   5. claim   — the ONE stored copy, at a path derived from the send id, upsert:false, so a
//                double-click or a retried request cannot send twice;
//   6. Meta    — upload, then send { type, [type]: { id, caption?, filename? } };
//   7. record  — the outbound whatsapp_messages row (media_path = the stored copy) + whatsapp_sends.
//
// ⛔ A FAILURE NEVER CLAIMS A SEND — the voice-note rules exactly: upload refused → claim released;
// send refused BY META → claim released and a `failed` row with NO media is logged; send result
// UNKNOWN (the request threw) → the claim is KEPT, so a retry is refused as duplicate_send rather
// than risking a second delivery.
// ⚠️ NO TEST MODE BYPASS OF THE WINDOW. In test mode the file is stored and logged `simulated`.

import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { isVoiceSendId } from "../../../src/lib/voiceNote.ts";
import {
  ATTACHMENT_CAPTION_MAX, ATTACHMENT_MAX_UPLOAD_BYTES, attachmentBody, attachmentObjectPath, attachmentPayload,
  bytesMatchType, classifyAttachment, cleanAttachmentFilename, type AttachmentKind,
} from "../../../src/lib/mediaAttachment.ts";

export interface MediaSendInput {
  operatorId: string;
  leadId: string | null;
  /** The number the thread thinks it is talking to. Confirmation only — never the destination. */
  phone: string;
  sendId: string;
  filename: string;
  caption: string;
  bytes: Uint8Array | null;
  /** Declared size (File.size), checked before the bytes are trusted. */
  declaredBytes: number;
  dryRun: boolean;
}

export interface MediaLead { id: string; user_id: string; phone: string | null; country: string | null; is_archived: boolean | null }

export interface MediaSendDeps {
  now(): number;
  live: boolean;
  testMode: boolean;
  normalise(raw: string, country?: string | null): string | null;
  getLead(leadId: string): Promise<MediaLead | null>;
  lastInboundAt(operatorId: string, to: string): Promise<string | null>;
  claimStorage(path: string, bytes: Uint8Array, mime: string): Promise<{ ok: true } | { ok: false; exists: boolean; error: string }>;
  releaseStorage(path: string): Promise<void>;
  uploadMedia(bytes: Uint8Array, mime: string, filename: string): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }>;
  sendMedia(to: string, payload: Record<string, unknown>): Promise<{ ok: true; messageId: string } | { ok: false; definitive: boolean; error: string }>;
  insertMessage(row: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  insertSendLog(row: Record<string, unknown>): Promise<void>;
  markAnswered(leadId: string): Promise<void>;
}

export type MediaSendResult =
  | { status: 200; body: { ok: true; status: "sent" | "simulated" | "dry_run"; simulated: boolean; dryRun: boolean; kind: AttachmentKind; messageId: string | null; message: Record<string, unknown> | null; payload?: Record<string, unknown> } }
  | { status: number; body: { ok: false; error: string; reason?: string; retryable?: boolean; kind?: AttachmentKind } };

const no = (status: number, error: string, extra: { reason?: string; retryable?: boolean; kind?: AttachmentKind } = {}): MediaSendResult =>
  ({ status, body: { ok: false, error, ...extra } });

export async function sendMediaAttachment(input: MediaSendInput, deps: MediaSendDeps): Promise<MediaSendResult> {
  // 1 — shape
  if (!isVoiceSendId(input.sendId)) return no(400, "bad_send_id");
  if (!input.leadId) return no(400, "lead_required");
  const cls = classifyAttachment(input.filename, input.declaredBytes);
  if (!cls.ok) return no(cls.error === "too_large" ? 413 : 415, cls.error, { kind: cls.kind });
  const caption = String(input.caption ?? "").trim();
  if (caption.length > ATTACHMENT_CAPTION_MAX) return no(400, "caption_too_long");

  // 2 — the lead, and the recipient derived from it
  const lead = await deps.getLead(input.leadId);
  if (!lead || lead.user_id !== input.operatorId) return no(403, "forbidden");
  if (lead.is_archived === true) return no(409, "lead_archived");
  const to = deps.normalise(lead.phone ?? "", lead.country);
  if (!to) return no(409, "phone_mismatch", { reason: "The lead has no WhatsApp number on file." });
  if (deps.normalise(input.phone, lead.country) !== to) return no(409, "phone_mismatch");

  // 3 — the 24-hour window, at send time, before anything is stored or sent
  const w = serviceWindowState(await deps.lastInboundAt(input.operatorId, to), deps.now());
  if (!w.open) return { status: 200, body: { ok: false, error: "window_closed" } };

  // 4 — the bytes themselves
  const bytes = input.bytes;
  if (!bytes || !bytes.length) return no(400, "empty", { kind: cls.kind });
  const real = classifyAttachment(input.filename, bytes.length);
  if (!real.ok || bytes.length > ATTACHMENT_MAX_UPLOAD_BYTES) return no(413, "too_large", { kind: cls.kind });
  if (!bytesMatchType(cls.mime, bytes)) return no(415, "type_mismatch", { kind: cls.kind });
  const filename = cleanAttachmentFilename(input.filename, cls.ext);

  if (input.dryRun) {
    return { status: 200, body: { ok: true, status: "dry_run", simulated: false, dryRun: true, kind: cls.kind, messageId: null, message: null, payload: attachmentPayload(cls.kind, "<media id>", caption || null, filename) } };
  }

  // 5 — the claim (and the one stored copy the thread shows)
  const path = attachmentObjectPath(input.operatorId, input.sendId, cls.ext);
  const claim = await deps.claimStorage(path, bytes, cls.mime);
  if (!claim.ok) {
    if (claim.exists) return { status: 200, body: { ok: false, error: "duplicate_send" } };
    return no(500, "storage_failed", { retryable: true });
  }

  const baseRow = {
    direction: "outbound",
    user_id: input.operatorId,
    lead_id: lead.id,
    phone: to,
    body: attachmentBody(cls.kind, caption),
    message_type: cls.kind,
    template_name: null,
    media_mime_type: cls.mime,
    media_filename: filename,
    test_mode: deps.testMode,
  };
  const failLog = (error: string) => deps.insertSendLog({ lead_id: lead.id, user_id: input.operatorId, template: null, phone: to, business_name: null, claim_url: "", test_mode: deps.testMode, message_id: null, delivery_status: "failed", error }).catch(() => undefined);

  // 6 — Meta (or the simulation)
  let status: "sent" | "simulated" = "simulated";
  let messageId: string | null = null;
  if (deps.live) {
    const up = await deps.uploadMedia(bytes, cls.mime, filename);
    if (!up.ok) {
      await deps.releaseStorage(path).catch(() => undefined);
      return { status: 200, body: { ok: false, error: "meta_upload_failed", reason: `WhatsApp did not accept the file upload, so nothing was sent. ${up.error}`.trim(), retryable: true } };
    }
    const sent = await deps.sendMedia(to, attachmentPayload(cls.kind, up.mediaId, caption || null, filename));
    if (!sent.ok) {
      if (sent.definitive) await deps.releaseStorage(path).catch(() => undefined);
      await deps.insertMessage({ ...baseRow, media_path: null, wa_message_id: null, status: "failed", error: sent.error }).catch(() => null);
      await failLog(sent.error);
      return sent.definitive
        ? { status: 200, body: { ok: false, error: "meta_send_failed", reason: `WhatsApp refused the file, so nothing was delivered. ${sent.error}`.trim(), retryable: true } }
        : { status: 200, body: { ok: false, error: "meta_send_unknown", retryable: false } };
    }
    status = "sent";
    messageId = sent.messageId;
  }

  // 7 — record it. The file is gone by now, so a failed write must never turn into a failure.
  const message = await deps.insertMessage({ ...baseRow, media_path: path, wa_message_id: messageId, status, error: null }).catch(() => null);
  await deps.insertSendLog({ lead_id: lead.id, user_id: input.operatorId, template: null, phone: to, business_name: null, claim_url: "", test_mode: deps.testMode, message_id: messageId, delivery_status: status, error: null }).catch(() => undefined);
  if (deps.live) await deps.markAnswered(lead.id).catch(() => undefined);

  return { status: 200, body: { ok: true, status, simulated: !deps.live, dryRun: false, kind: cls.kind, messageId, message } };
}
