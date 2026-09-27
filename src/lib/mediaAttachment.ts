/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTGOING WHATSAPP ATTACHMENTS — images, videos and documents sent inside the 24-hour window
   (2026-09-27). One leaf, read by the attachment picker (Inbox + the salesperson's lead page) AND by
   the `send-whatsapp-media` edge function, so the two cannot disagree about what may be sent.

   ⛔ WHAT META ACCEPTS (Cloud API "Media" reference, supported media types — not guessed):
     · image:    image/jpeg, image/png                           — 5 MB
     · video:    video/mp4, video/3gpp (H.264 video + AAC audio)  — 16 MB
     · document: text/plain, application/pdf, Word, Excel, PowerPoint (old and new formats) — 100 MB
     · caption:  image, video and document messages take one; up to 1,024 characters;
     · document: also takes a `filename`, which is what the recipient sees.
   Audio is NOT offered here: a recorded voice note has its own path (send-whatsapp-voice) and is
   the only audio this app sends. Stickers and HEIC photos are not offered either.
   ⚠️ DOCUMENTS ARE CAPPED BELOW META'S LIMIT, by OUR storage: the whatsapp-media bucket refuses a
   file over 20 MB (its file_size_limit), and the one stored copy is what the thread plays back.
   ⚠️ A VIDEO CAN STILL BE REFUSED BY META after it passes here: the container is checked, the codec
   is not (H.264 + AAC only). That refusal comes back as a failed send, never as a false "sent".

   ⛔ THE EXTENSION PICKS THE TYPE, THE BYTES MUST AGREE. The browser's own MIME type is not trusted
   (Windows reports whatever the registry says); the server reads the file's first bytes and
   refuses one that is not what its name claims (`bytesMatchType`).

   Pure and edge-reachable (relative imports only, CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type AttachmentKind = 'image' | 'video' | 'document';

interface AttachmentType { kind: AttachmentKind; mime: string; label: string }

/** Every extension that may be sent, and what it is sent as. Positive list: anything else is refused. */
export const ATTACHMENT_TYPES: Record<string, AttachmentType> = {
  jpg: { kind: 'image', mime: 'image/jpeg', label: 'JPEG image' },
  jpeg: { kind: 'image', mime: 'image/jpeg', label: 'JPEG image' },
  png: { kind: 'image', mime: 'image/png', label: 'PNG image' },
  mp4: { kind: 'video', mime: 'video/mp4', label: 'MP4 video' },
  '3gp': { kind: 'video', mime: 'video/3gpp', label: '3GP video' },
  pdf: { kind: 'document', mime: 'application/pdf', label: 'PDF' },
  doc: { kind: 'document', mime: 'application/msword', label: 'Word document' },
  docx: { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word document' },
  xls: { kind: 'document', mime: 'application/vnd.ms-excel', label: 'Excel spreadsheet' },
  xlsx: { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel spreadsheet' },
  ppt: { kind: 'document', mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint' },
  pptx: { kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint' },
  txt: { kind: 'document', mime: 'text/plain', label: 'Text file' },
};

/** The largest file of each kind we send: Meta's cap for images and videos; our bucket's for documents. */
export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 20 * 1024 * 1024,
};
/** What the edge function will read at all — the biggest kind's cap. */
export const ATTACHMENT_MAX_UPLOAD_BYTES = Math.max(...Object.values(ATTACHMENT_MAX_BYTES));
/** Meta's caption limit for image, video and document messages. */
export const ATTACHMENT_CAPTION_MAX = 1024;
/** Meta shows the document's filename to the recipient; kept short and plain. */
export const ATTACHMENT_FILENAME_MAX = 120;

/** The file picker's accept list — the same extensions the server allows, nothing more. */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map((e) => `.${e}`).join(',');

export function attachmentExtension(filename: string | null | undefined): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(filename ?? '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** What a file would be sent as, or why it cannot be. Decided by name and size only (no bytes yet). */
export function classifyAttachment(filename: string | null | undefined, size: number):
  | { ok: true; kind: AttachmentKind; mime: string; label: string; ext: string }
  | { ok: false; error: 'unsupported_type' | 'too_large' | 'empty'; kind?: AttachmentKind } {
  const ext = attachmentExtension(filename);
  const t = ATTACHMENT_TYPES[ext];
  if (!t) return { ok: false, error: 'unsupported_type' };
  if (!(size > 0)) return { ok: false, error: 'empty', kind: t.kind };
  if (size > ATTACHMENT_MAX_BYTES[t.kind]) return { ok: false, error: 'too_large', kind: t.kind };
  return { ok: true, kind: t.kind, mime: t.mime, label: t.label, ext };
}

const starts = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/** Do the file's first bytes agree with the type its name claims? */
export function bytesMatchType(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case 'image/jpeg': return starts(b, [0xff, 0xd8, 0xff]);
    case 'image/png': return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'video/mp4':
    case 'video/3gpp': return starts(b, [0x66, 0x74, 0x79, 0x70], 4); // "ftyp" box
    case 'application/pdf': return starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint': return starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return starts(b, [0x50, 0x4b, 0x03, 0x04]); // zip
    case 'text/plain': return b.length > 0 && !b.subarray(0, 8192).includes(0);
    default: return false;
  }
}

/** The name the recipient sees for a document: the base name, no path, no control characters. */
export function cleanAttachmentFilename(filename: string | null | undefined, ext: string): string {
  const base = String(filename ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const fallback = `file.${ext}`;
  if (!clean) return fallback;
  if (clean.length <= ATTACHMENT_FILENAME_MAX) return clean;
  return clean.slice(0, ATTACHMENT_FILENAME_MAX - ext.length - 1) + '.' + ext;
}

/** The ONE stored copy of a sent attachment, keyed by the send id so a retry cannot send twice.
 *  Under the book owner's folder like every other WhatsApp file. */
export function attachmentObjectPath(operatorId: string, sendId: string, ext: string): string {
  return `${operatorId}/media-out-${sendId.toLowerCase()}.${ext}`;
}

/** What the transcript stores as the message body (and the conversation list previews): the caption
 *  if there is one, else the same "[image]" placeholder an inbound attachment gets. */
export function attachmentBody(kind: AttachmentKind, caption: string | null | undefined): string {
  const c = String(caption ?? '').trim();
  return c || `[${kind}]`;
}

/** The Meta message for an uploaded attachment. A document carries its filename. */
export function attachmentPayload(kind: AttachmentKind, mediaId: string, caption: string | null, filename: string): Record<string, unknown> {
  const media: Record<string, unknown> = { id: mediaId };
  if (caption) media.caption = caption;
  if (kind === 'document') media.filename = filename;
  return { type: kind, [kind]: media };
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The operator-facing words for every refusal the picker or the server can give. */
export function attachmentErrorMessage(error: string | null | undefined, reason?: string | null, kind?: AttachmentKind): string {
  if (reason) return reason;
  switch (error) {
    case 'unsupported_type': return 'That file type cannot be sent on WhatsApp. Use a JPG or PNG image, an MP4 video, or a PDF, Word, Excel, PowerPoint or text file.';
    case 'too_large': return kind
      ? `Too big to send: ${kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'documents'} can be up to ${formatAttachmentSize(ATTACHMENT_MAX_BYTES[kind])}.`
      : 'That file is too big to send.';
    case 'empty': return 'That file is empty.';
    case 'type_mismatch': return 'The file does not match its extension (for example a renamed file), so it was not sent.';
    case 'caption_too_long': return `The caption can be at most ${ATTACHMENT_CAPTION_MAX} characters.`;
    case 'window_closed': return 'The 24-hour window has closed, so a file can no longer be sent. Only an approved template can go now.';
    case 'forbidden': return 'You can only send files on leads assigned to you.';
    case 'lead_archived': return 'This lead is archived, so nothing can be sent.';
    case 'lead_required': return 'Open the lead to send a file.';
    case 'phone_mismatch': return 'The lead’s WhatsApp number does not match this conversation.';
    case 'duplicate_send': return 'This file was already sent.';
    case 'storage_failed': return 'The file could not be saved, so nothing was sent. Try again.';
    case 'meta_upload_failed': return 'WhatsApp did not accept the file upload, so nothing was sent.';
    case 'meta_send_failed': return 'WhatsApp refused the file, so nothing was delivered.';
    case 'meta_send_unknown': return 'WhatsApp did not answer, so it is not known whether the file went. Check the conversation before sending again.';
    case 'upstream_timeout': return 'The server could not check this lead just now. Nothing was sent. Try again.';
    default: return error ? `Not sent (${error}).` : 'Not sent.';
  }
}
