/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTGOING WHATSAPP VOICE NOTES — the limits, the recorder format and the operator-facing words.
   One leaf, read by the Inbox recorder AND by the `send-whatsapp-voice` edge function, so the two
   cannot disagree about how long or how big a note may be.

   ⛔ WHAT META ACCEPTS AS A *VOICE NOTE* (checked 2026-09-25 against Meta's Cloud API docs,
   "Audio messages" + "Media" reference, not guessed):
     · message: { type: "audio", audio: { id: <media id>, voice: true } } — `voice: true` is what
       makes it render as a voice note (mic icon, waveform, transcription) instead of an audio file;
     · file: an .ogg container, OPUS codec ONLY, MONO ONLY ("base audio/ogg not supported");
     · upload type: audio/ogg; every audio type is capped at 16 MB (WHATSAPP_AUDIO_MAX_BYTES).
   Chrome/Edge record WebM/Opus, which is the right CODEC in the wrong CONTAINER, so the server
   re-wraps it (src/lib/oggOpus.ts — a real remux, the Opus audio is copied untouched). Firefox
   records Ogg/Opus natively. A browser that can only record AAC/MP4 is refused up front: sending
   that would arrive as a generic audio attachment, not a voice note.

   Pure and edge-reachable (relative imports only, CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Meta's cap for any audio upload (Cloud API media reference). Never sent near this. */
export const WHATSAPP_AUDIO_MAX_BYTES = 16 * 1024 * 1024;

/** A sales reply, not a podcast. The recorder stops itself here. */
export const VOICE_NOTE_MAX_SECONDS = 5 * 60;
/** The recorder warns when this many seconds remain. */
export const VOICE_NOTE_WARN_SECONDS_LEFT = 30;
/** Shorter than this is a mis-tap, not a message — refused on both sides. */
export const VOICE_NOTE_MIN_MS = 500;
/** Slack the server allows over the maximum, for timer vs encoder rounding. */
export const VOICE_NOTE_DURATION_SLACK_MS = 3_000;

/** Speech-quality Opus. At this rate the maximum note is about 1.2 MB. */
export const VOICE_NOTE_BITS_PER_SECOND = 32_000;
/** The recorder stops if the recording grows past this — a guard against a runaway encoder
 *  consuming memory, far above what the bitrate should ever produce. */
export const VOICE_NOTE_MAX_RECORDING_BYTES = 8 * 1024 * 1024;
/** What the edge function will accept. Above the recorder's own cap, well below Meta's. */
export const VOICE_NOTE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Recorder formats in order of preference. Only Opus is listed: it is the one codec Meta will
 *  render as a voice note. Ogg first because it needs no conversion at all. */
export const VOICE_NOTE_RECORDER_MIME_TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'] as const;

/** The first recorder format this browser supports, or null when it can record none of them. */
export function pickRecorderMimeType(isTypeSupported: ((mime: string) => boolean) | null | undefined): string | null {
  if (typeof isTypeSupported !== 'function') return null;
  for (const mime of VOICE_NOTE_RECORDER_MIME_TYPES) {
    try { if (isTypeSupported(mime)) return mime; } catch { /* a throwing probe is a no */ }
  }
  return null;
}

/** m:ss for a recording length. */
export function formatVoiceDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The per-recording idempotency key's shape. The server refuses anything else. */
export function isVoiceSendId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** The private-bucket path of the ONE stored copy of an outgoing note. Under the operator's own
 *  folder, which is what the bucket's read policy keys on, so the Inbox can sign it like any other
 *  attachment. Also the send's claim: storage refuses a second upload to the same path. */
export function voiceNoteObjectPath(operatorId: string, sendId: string): string {
  return `${operatorId}/voice-out-${sendId.toLowerCase()}.ogg`;
}

/** What the transcript stores as the message body — what the conversation list previews. */
export function voiceNoteBody(durationMs: number): string {
  return `Voice note (${formatVoiceDuration(durationMs)})`;
}

/** Why the microphone could not start, in the operator's words. */
export function micErrorNotice(error: unknown): string {
  const name = String((error as { name?: unknown })?.name ?? '');
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'Microphone access is blocked. Allow microphone access for LeadFinder and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Plug one in or check your sound settings, then try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The microphone could not be started — another app may be using it. Close it and try again.';
  }
  return 'The microphone could not be started. Try again.';
}

export const VOICE_UNSUPPORTED_NOTICE =
  'This browser cannot record WhatsApp voice notes. Use Chrome, Edge or Firefox.';

/** A voice-send refusal or failure, in the operator's words. `reason` (a server sentence) wins. */
export function voiceSendErrorMessage(error: string | undefined, reason?: string): string {
  if (reason) return reason;
  const map: Record<string, string> = {
    window_closed: 'The 24-hour reply window is closed — voice notes can only go inside it. Send an approved template instead.',
    forbidden: 'You can only send voice notes in your own conversations.',
    lead_archived: 'This lead is archived, so nothing can be sent to it.',
    lead_required: 'A voice note needs a conversation linked to a lead.',
    phone_mismatch: 'This conversation’s number does not match the lead’s number, so nothing was sent.',
    duplicate_send: 'This recording was already sent (or its last attempt may have gone through). Check the thread before re-recording.',
    too_large: 'That recording is too large to send.',
    too_short: 'That recording is too short to send.',
    too_long: `Voice notes are limited to ${formatVoiceDuration(VOICE_NOTE_MAX_SECONDS * 1000)}.`,
    not_voice_format: 'That recording is not in a format WhatsApp accepts as a voice note.',
    meta_upload_failed: 'WhatsApp did not accept the audio upload. Nothing was sent — try again.',
    meta_send_failed: 'WhatsApp refused the voice note. Nothing was delivered — try again.',
    auth_unavailable: 'The sign-in service did not answer in time. Try again in a moment.',
    unauthorized: 'Your session has expired. Sign in again.',
  };
  return map[error ?? ''] ?? (error ? `Not sent — ${error}` : 'Not sent.');
}
