import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVoiceDuration } from '@/lib/voiceNote';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE COMPACT PLAYER FOR EVERY VOICE NOTE — inbound, outbound, and the preview before sending.
   Play/pause, a seek bar and the time; no raw URL is ever shown.

   ⚠️ `knownDurationMs` EXISTS BECAUSE CHROME'S OWN RECORDINGS HAVE NO DURATION. A WebM straight out
   of MediaRecorder reports `duration === Infinity` to an <audio> element (measured in Chromium 151,
   2026-09-25), so the preview uses the recorder's own timer. The stored copy is Ogg, whose duration
   the element reads correctly.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export function VoiceNotePlayer({ src, knownDurationMs, tone = 'neutral', className }: {
  src: string | null;
  knownDurationMs?: number | null;
  tone?: 'outbound' | 'inbound' | 'neutral';
  className?: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setPlaying(false); setPosition(0); setMediaDuration(null); setFailed(false); }, [src]);

  const durationMs = mediaDuration != null && Number.isFinite(mediaDuration) && mediaDuration > 0
    ? mediaDuration * 1000
    : (knownDurationMs ?? 0);

  const toggle = async () => {
    const el = audio.current;
    if (!el || !src) return;
    if (el.paused) {
      try { await el.play(); } catch { setFailed(true); }
    } else {
      el.pause();
    }
  };

  const outbound = tone === 'outbound';
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!src || failed}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          outbound ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30' : 'bg-primary text-primary-foreground hover:bg-primary/90')}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(durationMs))}
        value={Math.min(Math.round(position * 1000), Math.max(1, Math.round(durationMs)))}
        onChange={(e) => { const el = audio.current; if (el) { el.currentTime = Number(e.target.value) / 1000; setPosition(el.currentTime); } }}
        disabled={!src || failed}
        aria-label="Voice note position"
        className={cn('h-1 min-w-0 flex-1 cursor-pointer', outbound ? 'accent-primary-foreground' : 'accent-primary')}
      />
      <span className={cn('shrink-0 tabular-nums text-[11px]', outbound ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {failed ? 'Unplayable' : playing || position > 0 ? `${formatVoiceDuration(position * 1000)} / ${formatVoiceDuration(durationMs)}` : formatVoiceDuration(durationMs)}
      </span>
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => setMediaDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setMediaDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPosition(0); }}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  );
}
