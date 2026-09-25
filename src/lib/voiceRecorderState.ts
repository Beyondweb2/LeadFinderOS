/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE VOICE-NOTE RECORDER'S STATES — a pure reducer, so the rules that matter are tested without a
   browser (scripts/whatsapp-voice-note.test.ts):

     idle ──mic──▶ requesting ──granted──▶ recording ──stop──▶ recorded ──send──▶ sending
       ▲               │ denied                 │ cancel          │ delete          │ ok → idle
       └───────────────┴────────────────────────┴─────────────────┘                 │ fail → recorded
                                                                                    ▼   (clip KEPT)
   ⛔ NOTHING HERE SENDS. Stopping a recording lands on `recorded` — a preview — and only an explicit
   SEND moves on. A SEND while already `sending` is ignored, which is the double-click guard (the
   component also holds a ref for two taps inside one tick; the server holds the real claim).
   ⛔ A FAILED SEND KEEPS THE CLIP, with its error, so it can be retried under the same send id.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface VoiceClip {
  blob: Blob;
  /** Object URL for the local preview. The owner revokes it when the clip is discarded. */
  url: string;
  mime: string;
  durationMs: number;
  /** One per RECORDING, reused on retry — the server's idempotency key. */
  sendId: string;
}

export type VoiceState =
  | { kind: 'idle'; notice?: string }
  | { kind: 'requesting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'recorded'; clip: VoiceClip; notice?: string; error?: string; retryable?: boolean }
  | { kind: 'sending'; clip: VoiceClip };

export type VoiceEvent =
  | { type: 'REQUEST' }
  | { type: 'GRANTED'; at: number }
  | { type: 'FAILED'; notice: string }
  | { type: 'RECORDED'; clip: VoiceClip; notice?: string }
  | { type: 'CANCEL' }
  | { type: 'DELETE' }
  | { type: 'SEND' }
  | { type: 'SENT' }
  | { type: 'SEND_FAILED'; error: string; retryable: boolean };

export const VOICE_IDLE: VoiceState = { kind: 'idle' };

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'REQUEST':
      return state.kind === 'idle' ? { kind: 'requesting' } : state;
    case 'GRANTED':
      return state.kind === 'requesting' ? { kind: 'recording', startedAt: event.at } : state;
    case 'FAILED':
      return state.kind === 'requesting' || state.kind === 'recording' ? { kind: 'idle', notice: event.notice } : state;
    case 'RECORDED':
      return state.kind === 'recording' ? { kind: 'recorded', clip: event.clip, ...(event.notice ? { notice: event.notice } : {}) } : state;
    case 'CANCEL':
      return state.kind === 'requesting' || state.kind === 'recording' ? VOICE_IDLE : state;
    case 'DELETE':
      return state.kind === 'recorded' ? VOICE_IDLE : state;
    case 'SEND':
      /* Only from a preview, and never when the server said a retry is unsafe. */
      return state.kind === 'recorded' && state.retryable !== false ? { kind: 'sending', clip: state.clip } : state;
    case 'SENT':
      return state.kind === 'sending' ? VOICE_IDLE : state;
    case 'SEND_FAILED':
      return state.kind === 'sending' ? { kind: 'recorded', clip: state.clip, error: event.error, retryable: event.retryable } : state;
  }
}

/** The composer's text box is hidden (still mounted, so its draft survives) while this is true. */
export function voiceTakesComposer(state: VoiceState): boolean {
  return state.kind === 'recording' || state.kind === 'recorded' || state.kind === 'sending';
}
