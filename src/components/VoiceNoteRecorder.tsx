import { memo, useEffect, useRef } from 'react';
import { Loader2, Mic, RotateCcw, Send, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { voiceTakesComposer, type VoiceClip } from '@/lib/voiceRecorderState';
import { VoiceNotePlayer } from '@/components/VoiceNotePlayer';
import { formatVoiceDuration, VOICE_NOTE_MAX_SECONDS, VOICE_NOTE_WARN_SECONDS_LEFT } from '@/lib/voiceNote';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MIC BESIDE THE REPLY BOX. Tap to record → Stop → listen back → Send, Delete or Re-record.

   ⛔ ONLY MOUNTED WHILE THE 24-HOUR WINDOW IS OPEN (the Inbox renders it in the open-window branch
   only), and the server re-checks the window at send time.
   ⛔ THE PARENT KEYS THIS BY CONVERSATION, so switching thread unmounts it and the hook discards any
   recording in progress — a note can never be sent into a different conversation from the one it
   was recorded in.
   ⛔ THE TEXT DRAFT IS NOT TOUCHED. While this is active the parent HIDES the text box (it stays
   mounted, so what was typed is still there when the recording is deleted or sent).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface VoiceNoteRecorderProps {
  /** A text send is in flight — do not start a recording over it. */
  disabled?: boolean;
  /** True while the recorder needs the composer's row (recording / preview / sending). */
  onActiveChange: (active: boolean) => void;
  /** Send this clip to THIS conversation. Resolves ok only when Meta confirmed the send. */
  onSend: (clip: VoiceClip) => Promise<{ ok: boolean; error?: string; retryable?: boolean }>;
}

export const VoiceNoteRecorder = memo(function VoiceNoteRecorder({ disabled, onActiveChange, onSend }: VoiceNoteRecorderProps) {
  const { state, elapsedMs, start, stop, cancel, remove, reRecord, send } = useVoiceRecorder();
  const { toast } = useToast();
  const active = voiceTakesComposer(state);

  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  useEffect(() => { onActiveRef.current(active); }, [active]);
  useEffect(() => () => onActiveRef.current(false), []);

  const lastNotice = useRef<string | undefined>();
  useEffect(() => {
    const notice = state.kind === 'idle' || state.kind === 'recorded' ? state.notice : undefined;
    if (notice && notice !== lastNotice.current) {
      toast({ title: state.kind === 'idle' ? 'Voice note' : 'Recording stopped', description: notice, variant: state.kind === 'idle' ? 'destructive' : undefined });
    }
    lastNotice.current = notice;
  }, [state, toast]);

  if (state.kind === 'idle' || state.kind === 'requesting') {
    const waiting = state.kind === 'requesting';
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 shrink-0"
        onClick={() => void start()}
        disabled={disabled || waiting}
        aria-label={waiting ? 'Waiting for microphone permission' : 'Record voice note'}
        title="Record a voice note"
      >
        {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      </Button>
    );
  }

  if (state.kind === 'recording') {
    const left = VOICE_NOTE_MAX_SECONDS * 1000 - elapsedMs;
    const warn = left <= VOICE_NOTE_WARN_SECONDS_LEFT * 1000;
    return (
      <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2" role="group" aria-label="Recording a voice note">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
        </span>
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium">Recording</span>{' '}
          <span className="tabular-nums" aria-live="off">{formatVoiceDuration(elapsedMs)}</span>
          {warn && <span className="ml-1 text-xs font-medium text-destructive" role="status">· {formatVoiceDuration(Math.max(0, left))} left</span>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={cancel} aria-label="Cancel recording">
            <X className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Cancel</span>
          </Button>
          <Button type="button" size="sm" className="h-9 px-3" onClick={stop} aria-label="Stop recording">
            <Square className="mr-1 h-3.5 w-3.5 fill-current" />Stop
          </Button>
        </div>
      </div>
    );
  }

  const clip = state.clip;
  const sending = state.kind === 'sending';
  const error = state.kind === 'recorded' ? state.error : undefined;
  const retryable = state.kind === 'recorded' ? state.retryable !== false : true;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2" role="group" aria-label="Voice note ready to send">
        <VoiceNotePlayer src={clip.url} knownDurationMs={clip.durationMs} className="flex-1" />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={remove} disabled={sending} aria-label="Delete recording" title="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={reRecord} disabled={sending} aria-label="Re-record voice note" title="Re-record">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 px-3"
          onClick={() => void send(clip, onSend)}
          disabled={sending || !retryable}
          aria-label="Send voice note"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Send className="h-4 w-4 sm:mr-1" />}
          <span className="hidden sm:inline">{sending ? 'Sending…' : error ? 'Retry' : 'Send'}</span>
        </Button>
      </div>
      {sending && <p className="text-[11px] text-muted-foreground" role="status">Sending voice note…</p>}
      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
    </div>
  );
});
