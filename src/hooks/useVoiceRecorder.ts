import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { voiceReducer, VOICE_IDLE, type VoiceClip } from '@/lib/voiceRecorderState';
import {
  pickRecorderMimeType, micErrorNotice, VOICE_UNSUPPORTED_NOTICE, VOICE_NOTE_BITS_PER_SECOND,
  VOICE_NOTE_MAX_SECONDS, VOICE_NOTE_MAX_RECORDING_BYTES, VOICE_NOTE_MIN_MS, formatVoiceDuration,
} from '@/lib/voiceNote';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MICROPHONE — one recording at a time, owned by the component that mounts this hook.

   ⛔ MONO BY CONSTRUCTION. Meta renders a voice note only from MONO Opus. The mic is requested with
   channelCount 1 and then routed through a Web Audio node fixed at one channel (a real downmix), so
   a stereo headset cannot produce a stereo file. Without Web Audio the raw track is recorded and
   the server's mono check is the backstop.
   ⚠️ The AudioContext is created SYNCHRONOUSLY in the click, before the permission prompt is
   awaited: a context created after the prompt can start suspended (autoplay policy) and would
   record silence.
   ⛔ UNMOUNT CANCELS. The Inbox keys this component by conversation, so switching thread unmounts
   it: the recording is discarded, the mic released and the preview URL revoked. A recording can
   therefore never follow you into another conversation.
   ⛔ BOUNDED. It stops itself at VOICE_NOTE_MAX_SECONDS or VOICE_NOTE_MAX_RECORDING_BYTES.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type StopWhy = 'user' | 'limit' | 'size' | 'interrupted' | 'discard';

export function useVoiceRecorder() {
  const [state, dispatch] = useReducer(voiceReducer, VOICE_IDLE);
  const [elapsedMs, setElapsedMs] = useState(0);

  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const startedAt = useRef(0);
  const stopWhy = useRef<StopWhy>('user');
  const ticker = useRef<number | null>(null);
  const limitTimer = useRef<number | null>(null);
  const clipUrl = useRef<string | null>(null);
  /** Set when the user cancels while the permission prompt is still open. */
  const abandoned = useRef(false);

  const releaseMic = useCallback(() => {
    if (ticker.current) { window.clearInterval(ticker.current); ticker.current = null; }
    if (limitTimer.current) { window.clearTimeout(limitTimer.current); limitTimer.current = null; }
    stream.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    stream.current = null;
    const ctx = audioCtx.current;
    audioCtx.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }, []);

  const revokeClip = useCallback(() => {
    if (clipUrl.current) { URL.revokeObjectURL(clipUrl.current); clipUrl.current = null; }
  }, []);

  const stopWith = useCallback((why: StopWhy) => {
    const rec = recorder.current;
    stopWhy.current = why;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { releaseMic(); }
    } else {
      releaseMic();
    }
  }, [releaseMic]);

  /* Read at call time: a click handler's closure can hold the state from before a DELETE. */
  const kind = useRef(state.kind);
  kind.current = state.kind;
  const starting = useRef(false);

  /** `fromPreview` = Re-record: the DELETE dispatched just before has not rendered yet. */
  const start = useCallback(async (fromPreview = false) => {
    if (starting.current || recorder.current) return;
    if (!fromPreview && kind.current !== 'idle') return;
    starting.current = true;
    try { await begin(); } finally { starting.current = false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = async () => {
    const mime = typeof MediaRecorder !== 'undefined' ? pickRecorderMimeType((m) => MediaRecorder.isTypeSupported(m)) : null;
    if (!navigator.mediaDevices?.getUserMedia || !mime) {
      dispatch({ type: 'REQUEST' });
      dispatch({ type: 'FAILED', notice: VOICE_UNSUPPORTED_NOTICE });
      return;
    }
    abandoned.current = false;
    dispatch({ type: 'REQUEST' });
    let ctx: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = Ctx ? new Ctx() : null;
    } catch { ctx = null; }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      if (ctx) void ctx.close().catch(() => undefined);
      if (alive.current) dispatch({ type: 'FAILED', notice: micErrorNotice(e) });
      return;
    }
    /* Unmounted, or cancelled, while the permission prompt was open: release and stop here. */
    if (!alive.current || abandoned.current) {
      media.getTracks().forEach((t) => t.stop());
      if (ctx) void ctx.close().catch(() => undefined);
      return;
    }
    stream.current = media;
    audioCtx.current = ctx;
    let recordStream: MediaStream = media;
    if (ctx) {
      try {
        await ctx.resume();
        const src = ctx.createMediaStreamSource(media);
        const dest = ctx.createMediaStreamDestination();
        dest.channelCount = 1;
        dest.channelCountMode = 'explicit';
        dest.channelInterpretation = 'speakers';
        src.connect(dest);
        recordStream = dest.stream;
      } catch { recordStream = media; }
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(recordStream, { mimeType: mime, audioBitsPerSecond: VOICE_NOTE_BITS_PER_SECOND });
    } catch (e) {
      releaseMic();
      dispatch({ type: 'FAILED', notice: micErrorNotice(e) });
      return;
    }
    recorder.current = rec;
    chunks.current = [];
    bytes.current = 0;
    stopWhy.current = 'user';
    rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      chunks.current.push(e.data);
      bytes.current += e.data.size;
      if (bytes.current > VOICE_NOTE_MAX_RECORDING_BYTES && rec.state === 'recording') stopWith('size');
    };
    rec.onerror = () => stopWith('interrupted');
    rec.onstop = () => {
      const why = stopWhy.current;
      const durationMs = Math.min(Date.now() - startedAt.current, VOICE_NOTE_MAX_SECONDS * 1000);
      const parts = chunks.current;
      chunks.current = [];
      recorder.current = null;
      releaseMic();
      if (!alive.current) return;
      if (why === 'discard') { dispatch({ type: 'CANCEL' }); return; }
      const blob = new Blob(parts, { type: rec.mimeType || mime });
      if (!blob.size || durationMs < VOICE_NOTE_MIN_MS) {
        dispatch({ type: 'FAILED', notice: why === 'interrupted' ? 'Recording stopped — the microphone was disconnected.' : 'That was too short to send. Hold on a moment longer before pressing Stop.' });
        return;
      }
      revokeClip();
      const url = URL.createObjectURL(blob);
      clipUrl.current = url;
      const clip: VoiceClip = { blob, url, mime: (rec.mimeType || mime).split(';')[0], durationMs, sendId: crypto.randomUUID() };
      const notice = why === 'limit' ? `Stopped at the ${formatVoiceDuration(VOICE_NOTE_MAX_SECONDS * 1000)} limit.`
        : why === 'size' ? 'Stopped — the recording reached its size limit.'
        : why === 'interrupted' ? 'Recording stopped — the microphone was disconnected. You can still send what was recorded.'
        : undefined;
      dispatch({ type: 'RECORDED', clip, notice });
    };
    media.getAudioTracks().forEach((t) => { t.onended = () => stopWith('interrupted'); });
    try {
      rec.start(1000);
    } catch (e) {
      recorder.current = null;
      releaseMic();
      dispatch({ type: 'FAILED', notice: micErrorNotice(e) });
      return;
    }
    startedAt.current = Date.now();
    setElapsedMs(0);
    ticker.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    limitTimer.current = window.setTimeout(() => stopWith('limit'), VOICE_NOTE_MAX_SECONDS * 1000);
    dispatch({ type: 'GRANTED', at: startedAt.current });
  };

  const stop = useCallback(() => stopWith('user'), [stopWith]);

  const cancel = useCallback(() => {
    abandoned.current = true;
    if (recorder.current) stopWith('discard');
    else { releaseMic(); dispatch({ type: 'CANCEL' }); }
  }, [stopWith, releaseMic]);

  const remove = useCallback(() => {
    revokeClip();
    dispatch({ type: 'DELETE' });
  }, [revokeClip]);

  const reRecord = useCallback(() => {
    revokeClip();
    dispatch({ type: 'DELETE' });
    void start(true);
  }, [revokeClip, start]);

  /** Send the previewed clip through `fn`. Returns false (and keeps the clip) on failure. */
  const inFlight = useRef(false);
  const send = useCallback(async (clip: VoiceClip, fn: (clip: VoiceClip) => Promise<{ ok: boolean; error?: string; retryable?: boolean }>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    dispatch({ type: 'SEND' });
    try {
      const r = await fn(clip);
      if (!alive.current) return r.ok;
      if (r.ok) { revokeClip(); dispatch({ type: 'SENT' }); return true; }
      dispatch({ type: 'SEND_FAILED', error: r.error ?? 'Not sent.', retryable: r.retryable !== false });
      return false;
    } catch (e) {
      if (alive.current) dispatch({ type: 'SEND_FAILED', error: (e as Error)?.message ?? 'Not sent.', retryable: false });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [revokeClip]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abandoned.current = true;
      stopWhy.current = 'discard';
      const rec = recorder.current;
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch { /* released below */ } }
      recorder.current = null;
      releaseMic();
      revokeClip();
    };
  }, [releaseMic, revokeClip]);

  return { state, elapsedMs, start: () => start(false), stop, cancel, remove, reRecord, send };
}
