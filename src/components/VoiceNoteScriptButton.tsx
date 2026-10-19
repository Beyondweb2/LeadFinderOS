/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VOICE-NOTE SCRIPT — the Inbox button and the call screen's Voice note tab (Paul, 2026-09-26; rebuilt 2026-10-19).

   🔴 NO GENERATING (Paul, 2026-10-19): the note is built from the SAME playbook as the call script
      (src/lib/voiceNoteFromCall.ts) — the AI result, who was named instead, the website-issues line — in a
      spoken tone, and shown at once. No model call, no cost, nothing stored, nothing to regenerate. It changes
      when the evidence changes, so it can never be out of date.
   ⛔ NOTHING SENDS FROM HERE. Only Copy (to the clipboard). Paul records the note himself.
   ⛔ Same gate as the call script (callScriptGate.ts): no valid completed AI check → no note.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useState } from 'react';
import { Check, Copy, Loader2, Lock, Mic } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { LeadAiResultChips } from '@/components/LeadAiResultChips';
import { cn } from '@/lib/utils';
import { useColdCallPlaybook } from '@/hooks/useColdCallPlaybook';
import { callScriptGate } from '@/lib/callScriptGate';
import { voiceNoteFromCall } from '@/lib/voiceNoteFromCall';
import type { ColdCallPlaybook } from '@/lib/coldCallPlaybook';

export const VOICE_NOTE_SCRIPT_LABEL = 'Voice-note script';

/** The note itself, from a built playbook. */
export function VoiceNoteFromCall({ p, leadId }: { p: ColdCallPlaybook; leadId: string }) {
  const note = voiceNoteFromCall(p);
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(note.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select and copy by hand */ }
  }, [note.text]);
  return (
    <div className="space-y-3" data-testid="voice-note-script-body">
      <LeadAiResultChips leadId={leadId} />
      <div className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm leading-relaxed ring-1 ring-inset ring-border/50" data-testid="voice-note-text">
        {note.lines.map((l) => <p key={l} className="break-words">{l}</p>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{note.words} words · about {note.seconds}s</span>
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1" onClick={() => void copy()} data-testid="voice-note-copy">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {note.note && <p className="text-[11px] text-muted-foreground" data-testid="voice-note-in-touch">{note.note}</p>}
      <p className="text-[11px] text-muted-foreground">Built from the same AI result and website check as the call script. Nothing is sent from here.</p>
    </div>
  );
}

/** The panel's content for a lead: loads the playbook (reads only) and shows the note, or why there is none yet. */
export function VoiceNoteScriptBody({ leadId, playbook }: { leadId: string; playbook?: ColdCallPlaybook | null }) {
  const q = useColdCallPlaybook(leadId, !playbook);
  const p = playbook ?? q.data ?? null;
  if (!p && q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  if (!p) return <p className="text-sm text-muted-foreground">{q.isError ? 'Could not load this lead.' : 'Lead not found.'}</p>;
  const gate = callScriptGate(leadId, p);
  if (!gate.show) {
    return (
      <div className="space-y-1 rounded-xl border border-dashed border-border bg-muted/30 p-3" data-testid="voice-note-locked">
        <p className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4 text-muted-foreground" />{gate.title}</p>
        <p className="text-xs text-muted-foreground">{gate.detail}</p>
      </div>
    );
  }
  return <VoiceNoteFromCall p={p} leadId={leadId} />;
}

function VoiceNoteScriptPanel({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
        <DialogHero icon={Mic} tone="purple" title={VOICE_NOTE_SCRIPT_LABEL} subtitle="For you to read out and record. Nothing is sent from here." />
        <VoiceNoteScriptBody leadId={leadId} />
      </DialogContent>
    </Dialog>
  );
}

export function VoiceNoteScriptButton({ leadId, compact, prominent, className }: { leadId: string; compact?: boolean; prominent?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  /* PROMINENT: the Inbox's open 24h window, beside the voice-note recorder (Paul, 2026-09-26). */
  if (prominent) {
    return (
      <>
        <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className={cn('h-8 gap-1.5 border-violet-500/50 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300', className)}>
          <Mic className="h-4 w-4" /> {VOICE_NOTE_SCRIPT_LABEL}
        </Button>
        {open && <VoiceNoteScriptPanel leadId={leadId} open={open} onOpenChange={setOpen} />}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={VOICE_NOTE_SCRIPT_LABEL}
        aria-label={VOICE_NOTE_SCRIPT_LABEL}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300',
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
          className,
        )}
      >
        <Mic className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {VOICE_NOTE_SCRIPT_LABEL}
      </button>
      {open && <VoiceNoteScriptPanel leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
