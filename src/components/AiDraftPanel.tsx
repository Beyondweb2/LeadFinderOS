import { useState } from 'react';
import { LeadAiResultChips } from '@/components/LeadAiResultChips';
import { AlertTriangle, Ban, Check, ChevronDown, FileText, Loader2, Pencil, RefreshCw, Sparkles, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';
import { aiChipFor, autoSendWaiting, rowSendable, STOP_REASONS, type AiChip, type AiReplyRow } from '@/lib/aiReplyDraft';

/* The AI row's badge. Since 2026-10-22 the list row and the thread header show the ONE attention pill instead
   (src/lib/inboxAttention.ts); this badge is drawn only inside the hand-over note below. */
const CHIP_TONE: Record<AiChip['tone'], string> = {
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  grey: 'bg-muted text-muted-foreground',
};
export function AiDraftChip({ row, compact = false }: { row: AiReplyRow | null | undefined; compact?: boolean }) {
  const chip = aiChipFor(row);
  if (!chip) return null;
  return (
    <span data-testid="ai-draft-chip" className={cn('inline-flex shrink-0 items-center gap-1 rounded-full font-semibold', compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]', CHIP_TONE[chip.tone])}
      title={chip.label === 'Needs you' ? (row?.reason_label ?? 'A person should answer this one') : chip.label === 'Needs a template' ? 'Outside the 24-hour window: only an approved template can be sent.' : chip.label}>
      {chip.label === 'Needs you' ? <UserRound className="h-3 w-3" /> : chip.label === 'Needs a template' ? <FileText className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {chip.label}
    </span>
  );
}

/* "Draft reply" (fn ai-reply-drafts, action 'draft'): always a draft, except a stop. It never sends. */
export function AiDraftButton({ busy, onDraft, hasDraft }: { busy: boolean; onDraft: () => void; hasDraft: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={onDraft} data-testid="ai-draft-reply"
      title="Write a suggested reply into the thread. Nothing is sent until you approve it.">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {hasDraft ? 'Draft again' : 'Draft reply'}
    </Button>
  );
}

export type AiBusy = 'approve' | 'regenerate' | 'discard' | 'optout' | 'stopauto' | null;

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE HAND-OVER NOTE ABOVE THE REPLY BOX (2026-10-11; Needs you + Mark opted out 2026-10-20).
   Only for a row WITHOUT a sendable draft since 2026-10-22: Needs you (no draft), a stop (Mark opted out), Needs a
   template, Drafting… / Sending…. A written draft is the bubble in the thread (AiDraftBubble, below).
   ⛔ IT NEVER SENDS. Dismiss / Mark opted out send nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface AiDraftPanelProps {
  row: AiReplyRow;
  busy: AiBusy;
  onDiscard: () => void;
  onMarkOptedOut: () => void;
}

export function AiDraftPanel({ row, busy, onDiscard, onMarkOptedOut }: AiDraftPanelProps) {
  const chip = aiChipFor(row);
  if (!chip || rowSendable(row)) return null;
  const why = row.why ?? null;
  const stop = STOP_REASONS.has(row.reason ?? '');
  const optedOut = why?.optedOut === 'recorded' || why?.optedOut === 'already' || row.reason === 'do_not_contact';
  return (
    <div data-testid="ai-draft-panel" className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-inset',
      chip.tone === 'red' ? 'bg-red-500/5 ring-red-500/25' : chip.tone === 'amber' ? 'bg-amber-500/5 ring-amber-500/25' : 'bg-muted/40 ring-border/50')}>
      <AiDraftChip row={row} />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {chip.label === 'Needs you' && stop && <>No draft: <span className="font-medium text-foreground">{row.reason_label ?? 'asked to stop'}</span>.{optedOut ? ' Opted out, and any queued follow-ups were cancelled.' : ''}</>}
        {chip.label === 'Needs you' && !stop && <>Why it needs you: <span className="font-medium text-foreground">{row.reason_label ?? 'a person should answer this one'}</span>.{/* The reason label may already say it (reason "no_playbook"): never the same sentence twice (Paul's screenshot, 2026-10-22). */}
          {why?.noDraft ? (/no playbook reply/i.test(row.reason_label ?? '') ? '' : ' No playbook reply fits, so no draft: answer it yourself.') : ' Press Draft reply for a suggestion.'}</>}
        {chip.label === 'Needs a template' && <>Their last message is more than 24 hours old, so no free-text draft. Send an approved template.</>}
        {(chip.label === 'Drafting…' || chip.label === 'Sending…') && <>{chip.label}</>}
      </span>
      {stop && !optedOut && (
        <Button type="button" variant="destructive" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onMarkOptedOut} data-testid="ai-mark-opted-out"
          title="Add this number to the opt-out list and cancel any queued follow-ups. Nothing is sent.">
          {busy === 'optout' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Mark opted out
        </Button>
      )}
      {(chip.label === 'Needs you' || chip.label === 'Needs a template') && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy !== null} onClick={onDiscard} title="Clear this flag. Nothing is sent.">
          {busy === 'discard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Dismiss
        </Button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DRAFT AS A BUBBLE IN THE THREAD (2026-10-22, Paul). Replaces the "Needs approving" bar above the reply box and its
   duplicate buttons. Drawn where the reply would go (after the sent messages and any queued sends), dashed like a queued
   send, with three buttons: Approve & send · Reject · Regenerate, and two small links: Edit in reply box · Why this reply?
   ⛔ IT NEVER SENDS BY ITSELF. Approve & send hands the bubble's text — or, after "Edit in reply box", the box's text — to
      `onApprove`, which claims the draft (once only) and sends through the Inbox's own send path, exactly as before.
   ⛔ Reject = discard: nothing is sent, the outcome log records it (trg_ai_reply_draft_outcome writes 'discarded').
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface AiDraftBubbleProps {
  row: AiReplyRow;
  busy: AiBusy;
  /** The reply box holds this draft, edited by a person: Approve & send sends the box's words. */
  editedInBox: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onEditInBox: () => void;
  /** Level 2: stop the automatic send; the draft stays here for approval. */
  onStopAutoSend?: () => void;
}

export function AiDraftBubble({ row, busy, editedInBox, onApprove, onReject, onRegenerate, onEditInBox, onStopAutoSend }: AiDraftBubbleProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  /* ⛔ Sales never sees a cost (CLAUDE.md §5, abuse/cost protection): the model cost line is the admin's only (2026-10-27). */
  const { role } = useSubscription();
  if (!rowSendable(row)) return null;
  const why = row.why ?? null;
  const needsYou = aiChipFor(row)?.label === 'Needs you';
  const autoAt = autoSendWaiting(row);
  return (
    <div className="flex justify-end" data-testid="ai-draft-bubble">
      <div className={cn('max-w-[78%] space-y-1.5 rounded-2xl border-2 border-dashed px-3 py-2 text-sm',
        needsYou ? 'border-red-500/50 bg-red-500/5' : 'border-violet-500/50 bg-violet-500/5')}>
        <p className={cn('flex flex-wrap items-center gap-1 text-[11px] font-semibold', needsYou ? 'text-red-700 dark:text-red-300' : 'text-violet-700 dark:text-violet-300')}>
          <Sparkles className="h-3 w-3" />
          {needsYou ? <>AI draft · Needs you: <span className="font-medium">{row.reason_label ?? 'check it first'}</span></> : <>AI draft · Needs approval</>}
        </p>
        <p className={cn('whitespace-pre-wrap break-words', editedInBox && 'text-muted-foreground line-through decoration-muted-foreground/40')} data-testid="ai-draft-text">{row.draft_text}</p>
        {editedInBox && (
          <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300" data-testid="ai-draft-edited">
            <Pencil className="h-3 w-3 shrink-0" /> Edited in the reply box: Approve &amp; send sends the box&apos;s words.
          </p>
        )}
        {autoAt && (
          <p className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-violet-700 dark:text-violet-300" data-testid="ai-auto-send-waiting">
            The AI will send this by itself at {new Date(autoAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} UK time unless you act.
            {onStopAutoSend && (
              <button type="button" className="underline" disabled={busy !== null} onClick={onStopAutoSend} data-testid="ai-stop-auto-send">
                {busy === 'stopauto' ? 'Stopping…' : "Don't send automatically"}
              </button>
            )}
          </p>
        )}
        {why?.note && <p className="text-[11px] font-medium text-foreground" data-testid="ai-draft-note">{why.note}</p>}
        {why && why.problems.length > 0 && (
          <div className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300" data-testid="ai-draft-warnings">
            {why.problems.slice(0, 3).map((p) => (
              <p key={p} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span><span className="font-semibold">CHECK</span>: {p}</span></p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onApprove} data-testid="ai-approve-send">
            {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve &amp; send
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onReject} data-testid="ai-reject"
            title="Throw this draft away. Nothing is sent; it is logged as rejected.">
            {busy === 'discard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onRegenerate} data-testid="ai-regenerate"
            title="Write another version">
            {busy === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-muted-foreground">
          {!editedInBox && (
            <button type="button" onClick={onEditInBox} className="inline-flex items-center gap-0.5 hover:text-foreground" data-testid="ai-edit-in-box">
              <Pencil className="h-3 w-3" /> Edit in reply box
            </button>
          )}
          {why && (
            <button type="button" onClick={() => setWhyOpen((o) => !o)} aria-expanded={whyOpen} className="inline-flex items-center gap-0.5 hover:text-foreground" data-testid="ai-why-link">
              Why this reply? <ChevronDown className={cn('h-3 w-3 transition-transform', whyOpen && 'rotate-180')} />
            </button>
          )}
        </div>
        {why && whyOpen && (
          <div className="space-y-0.5 rounded-md bg-background/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            <p>For you only. Nothing has been sent.</p>
            {row.lead_id && <LeadAiResultChips leadId={row.lead_id} />}
            <p><span className="font-medium text-foreground">Next move (picked by code): </span>{(why.intent ?? why.move ?? '').replace(/_/g, ' ')}{why.question ? ` · ends with: "${why.question}"` : ' · no question'}</p>
            {(why.points ?? []).length > 0 && <p><span className="font-medium text-foreground">Says: </span>{(why.points ?? []).join(' · ')}</p>}
            <p><span className="font-medium text-foreground">Search: </span>{why.search ?? 'No completed AI check on record, so the AI part was left out.'}{why.named ? ` · named in ${why.named.named} of ${why.named.valid} answers` : ''}</p>
            {why.missed && <p><span className="font-medium text-foreground">Missed on: </span>{why.missed.engine === 'chatgpt' ? 'ChatGPT' : why.missed.engine === 'gemini' ? 'Gemini' : why.missed.engine === 'ai_overview' ? 'Google AI' : why.missed.engine} · {why.missed.question} <span className="opacity-70">(the draft says "AI")</span></p>}
            {why.search && why.competitors.length > 0 && <p><span className="font-medium text-foreground">AI named: </span>{why.competitors.join(', ')}</p>}
            <p><span className="font-medium text-foreground">Website issues on record: </span>{why.findings.length ? why.findings.join(' · ') : (why.findingsNote ?? 'None, so none mentioned.')}</p>
            <p><span className="font-medium text-foreground">Offer facts from: </span>fact sheet {why.factSheetVersion}</p>
            {why.problems.length > 0 && <p className="text-amber-700 dark:text-amber-300"><span className="font-medium">Checks: </span>{why.problems.join(' ')}</p>}
            {role === 'admin' && <p><span className="font-medium text-foreground">Cost: </span>${(why.costUsd ?? 0).toFixed(4)} · {why.calls} model call{why.calls === 1 ? '' : 's'}{why.usedFallback ? ' · model unavailable, rule-built draft' : ''}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
