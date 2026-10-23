/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VOICE-NOTE SCRIPT — the Inbox button and the call screen's Voice note tab (Paul, 2026-09-26; rebuilt 2026-10-19).

   🔴 THE INBOX PANEL GENERATES AGAIN (Paul, 2026-10-23): GeneratedVoiceNote below, fn voice-note-script v7, the next thing
      to say from the whole conversation. The CALL SCREEN's Voice note tab (VoiceNoteScriptBody with a playbook) keeps:
   🔴 NO GENERATING (Paul, 2026-10-19): the note is built from the SAME playbook as the call script
      (src/lib/voiceNoteFromCall.ts) — the AI result, who was named instead, the website-issues line — in a
      spoken tone, and shown at once. No model call, no cost, nothing stored, nothing to regenerate. It changes
      when the evidence changes, so it can never be out of date.
   ⛔ NOTHING SENDS FROM HERE. Only Copy (to the clipboard). Paul records the note himself.
   ⛔ Same gate as the call script (callScriptGate.ts): no valid completed AI check → no note.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Lock, Mic, Save } from 'lucide-react';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { spokenLength } from '@/lib/spokenLength';
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

/* ── THE INBOX'S NEXT-THING-TO-SAY SCRIPT (Paul, 2026-10-23; fn voice-note-script v7) ───────────────────────────────
   ⛔ This REVERSES the 2026-10-19 "no generating" rule for the Inbox only, at Paul's request: the script reads the whole
      conversation (their question answered first), the lead's real audit and website check, and Paul's own messages
      and edits, so it needs the writing model (~1–2p, behind the usage guard). The call screen keeps the instant note.
   ⛔ NOTHING SENDS FROM HERE. Copy, and "Save my version" (kept beside the generated one, learnt from next time). */
type SavedScript = { id: string; script: string; final_script: string | null; problems: string[] | null; warnings: string[] | null; generated_at: string };
type LatestResponse = { ok: boolean; script: SavedScript | null; stale?: boolean; staleReason?: 'new_message' | 'audit' | null; error?: string; detail?: string };
type GenerateResponse = { ok: boolean; script?: SavedScript; error?: string; detail?: string };

export function GeneratedVoiceNote({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedScript | null>(null);
  const [stale, setStale] = useState<LatestResponse['staleReason']>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const show = useCallback((s: SavedScript | null) => { setSaved(s); setText(s ? (s.final_script ?? s.script) : ''); }, []);
  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const r = await invokeEdge<LatestResponse>('voice-note-script', { action: 'latest', lead_id: leadId });
      if (!r.ok) throw new Error(r.detail ?? 'Could not load the script.');
      show(r.script); setStale(r.stale ? (r.staleReason ?? 'audit') : null);
    } catch (e) { setLoadError(edgeErrorMessage(e, 'Could not load the script.')); }
    setLoading(false);
  }, [leadId, show]);
  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (busy) return;
    if (saved && text.trim() !== (saved.final_script ?? saved.script).trim() && !window.confirm('Replace your unsaved edits with a new script?')) return;
    setBusy('generate'); setRefusal(null); setSavedNote(null);
    try {
      const r = await invokeEdge<GenerateResponse>('voice-note-script', { action: 'generate', lead_id: leadId, regenerate_of: saved?.id ?? null });
      if (!r.ok || !r.script) setRefusal(r.detail ?? 'Could not write a script.');
      else { show(r.script); setStale(null); }
    } catch (e) { setRefusal(edgeErrorMessage(e, 'Could not write a script.')); }
    setBusy(null);
  };
  const saveMine = async () => {
    if (!saved || busy || !text.trim()) return;
    setBusy('save'); setSavedNote(null);
    try {
      const r = await invokeEdge<GenerateResponse>('voice-note-script', { action: 'save_edit', lead_id: leadId, script_id: saved.id, text });
      if (!r.ok || !r.script) setSavedNote(r.detail ?? 'Could not save your version.');
      else { show(r.script); setSavedNote('Saved. The next script learns from it.'); }
    } catch (e) { setSavedNote(edgeErrorMessage(e, 'Could not save your version.')); }
    setBusy(null);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* select and copy by hand */ }
  };

  if (loading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  if (loadError) {
    return (
      <div className="space-y-2" data-testid="voice-note-load-error">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }
  const len = spokenLength(text);
  const edited = !!saved && text.trim() !== saved.script.trim();
  const unsaved = !!saved && text.trim() !== (saved.final_script ?? saved.script).trim();
  const checks = [...(saved?.problems ?? [])];
  return (
    <div className="space-y-3" data-testid="voice-note-generated">
      <LeadAiResultChips leadId={leadId} />
      {stale && saved && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300" data-testid="voice-note-stale">
          {stale === 'new_message' ? 'They have messaged since this script was written. Write a new one so it answers them.' : 'This script quotes an older AI check. Write a new one.'}
        </p>
      )}
      {saved ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full resize-y rounded-xl bg-muted/40 p-3 text-sm leading-relaxed ring-1 ring-inset ring-border/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          data-testid="voice-note-text"
          aria-label="Voice-note script"
        />
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          No script yet. It reads the conversation, the AI check and the website check, and writes the next thing to say.
        </p>
      )}
      {refusal && <p className="text-xs text-destructive" data-testid="voice-note-refusal">{refusal}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {saved && <span className="text-xs text-muted-foreground" data-testid="voice-note-length">{len.label}</span>}
        {saved && len.seconds > 120 && <span className="text-xs text-amber-600">over 2 minutes</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!!busy} onClick={() => void generate()} data-testid="voice-note-generate">
            {busy === 'generate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />} {saved ? 'Write a new one' : 'Write script'}
          </Button>
          {saved && (
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={!!busy || !unsaved} onClick={() => void saveMine()} data-testid="voice-note-save">
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save my version
            </Button>
          )}
          {saved && (
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void copy()} data-testid="voice-note-copy">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
      </div>
      {savedNote && <p className="text-[11px] text-muted-foreground">{savedNote}</p>}
      {saved && checks.length > 0 && !edited && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300" data-testid="voice-note-checks">
          <p className="font-semibold">Check this script</p>
          {checks.map((c) => <p key={c}>{c}</p>)}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Written from the conversation, the AI check and the website check. Nothing is sent from here.</p>
    </div>
  );
}

function VoiceNoteScriptPanel({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
        <DialogHero icon={Mic} tone="purple" title={VOICE_NOTE_SCRIPT_LABEL} subtitle="The next thing to say, for you to read out and record. Nothing is sent from here." />
        <GeneratedVoiceNote leadId={leadId} />
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
