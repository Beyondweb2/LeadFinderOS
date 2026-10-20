import { useState } from 'react';
import { LeadAiResultChips } from '@/components/LeadAiResultChips';
import { AlertTriangle, Ban, Check, ChevronDown, FileText, Loader2, RefreshCw, Sparkles, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aiChipFor, rowSendable, STOP_REASONS, type AiChip, type AiReplyRow } from '@/lib/aiReplyDraft';

/* The badge in the conversation list and the thread header. */
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
      title={chip.label === 'Needs you' ? (row?.reason_label ?? 'A person should answer this one') : chip.label === 'Needs approving' ? 'An AI draft is waiting. Nothing is sent until someone approves it.' : chip.label === 'Needs a template' ? 'Outside the 24-hour window: only an approved template can be sent.' : chip.label}>
      {chip.label === 'Needs you' ? <UserRound className="h-3 w-3" /> : chip.label === 'Needs a template' ? <FileText className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {chip.label}
    </span>
  );
}

/** "Auto-reply" / "Only confirmed": the last thing they sent is not a real reply (replyMove.inboundLabel). Never counted as Replied. */
export function InboundLabelChip({ label }: { label: 'Auto-reply' | 'Only confirmed' | null }) {
  if (!label) return null;
  return (
    <span data-testid="inbound-label-chip" className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0 text-[10px] font-semibold text-muted-foreground"
      title={label === 'Auto-reply' ? 'Their business sent an automatic reply. Not counted as Replied.' : 'They only confirmed who they are ("yes it is"). Not counted as Replied.'}>
      {label}
    </span>
  );
}

/* "Draft reply" (fn ai-reply-drafts, action 'draft'): always a draft, except a stop. It never sends. */
export function AiDraftButton({ busy, onDraft, hasDraft }: { busy: boolean; onDraft: () => void; hasDraft: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={onDraft} data-testid="ai-draft-reply"
      title="Write a suggested reply into the box. Nothing is sent until you approve it.">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {hasDraft ? 'Draft again' : 'Draft reply'}
    </Button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PANEL ABOVE THE REPLY BOX (2026-10-11; Needs you + Mark opted out 2026-10-20).
   ⛔ IT NEVER SENDS BY ITSELF. The draft is pre-filled in the ordinary reply box, where it can be edited.
      "Approve & send" hands the box's text to `onApprove`, which claims the draft (once only) and sends it
      through the Inbox's existing send path. Discard / Dismiss / Mark opted out send nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface AiDraftPanelProps {
  row: AiReplyRow;
  busy: 'approve' | 'regenerate' | 'discard' | 'optout' | null;
  /** True when the reply box no longer holds the AI's text (someone typed their own). */
  boxDiffers: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onUseDraft: () => void;
  onMarkOptedOut: () => void;
}

export function AiDraftPanel({ row, busy, boxDiffers, onApprove, onRegenerate, onDiscard, onUseDraft, onMarkOptedOut }: AiDraftPanelProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const chip = aiChipFor(row);
  if (!chip) return null;
  const why = row.why ?? null;
  const stop = STOP_REASONS.has(row.reason ?? '');
  const optedOut = why?.optedOut === 'recorded' || why?.optedOut === 'already' || row.reason === 'do_not_contact';
  const sendable = rowSendable(row);

  if (!sendable) {
    return (
      <div data-testid="ai-draft-panel" className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-inset',
        chip.tone === 'red' ? 'bg-red-500/5 ring-red-500/25' : chip.tone === 'amber' ? 'bg-amber-500/5 ring-amber-500/25' : 'bg-muted/40 ring-border/50')}>
        <AiDraftChip row={row} />
        <span className="min-w-0 flex-1 text-muted-foreground">
          {chip.label === 'Needs you' && stop && <>No draft: <span className="font-medium text-foreground">{row.reason_label ?? 'asked to stop'}</span>.{optedOut ? ' Opted out, and any queued follow-ups were cancelled.' : ''}</>}
          {chip.label === 'Needs you' && !stop && <>Why it needs you: <span className="font-medium text-foreground">{row.reason_label ?? 'a person should answer this one'}</span>.{why?.noDraft ? ' No playbook reply fits, so no draft: answer it yourself.' : ' Press Draft reply for a suggestion.'}</>}
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

  return (
    <div data-testid="ai-draft-panel" className={cn('space-y-1.5 rounded-lg px-2.5 py-2 text-xs ring-1 ring-inset', chip.label === 'Needs you' ? 'bg-red-500/5 ring-red-500/25' : 'bg-violet-500/5 ring-violet-500/25')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <AiDraftChip row={row} />
        <span className="text-muted-foreground">
          {chip.label === 'Needs you'
            ? <>Why it needs you: <span className="font-medium text-foreground">{row.reason_label}</span>. A draft is in the box below: check it first.</>
            : <>A draft is in the box below: edit it, then approve.</>}
        </span>
        <span className="flex-1" />
        <Button type="button" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onApprove} data-testid="ai-approve-send">
          {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve &amp; send
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={onRegenerate} title="Write another version (replaces the box)">
          {busy === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy !== null} onClick={onDiscard} title="Throw this draft away. Nothing is sent.">
          {busy === 'discard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Discard
        </Button>
      </div>
      {boxDiffers && (
        <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          The box holds your own text. Approve &amp; send sends what is in the box.
          <button type="button" className="font-medium underline" onClick={onUseDraft}>Put the AI draft back</button>
        </p>
      )}
      {why?.note && (
        <p className="text-[11px] font-medium text-foreground" data-testid="ai-draft-note">{why.note}</p>
      )}
      {why && why.problems.length > 0 && (
        <div className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300" data-testid="ai-draft-warnings">
          {why.problems.slice(0, 3).map((p) => (
            <p key={p} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span><span className="font-semibold">CHECK</span>: {p}</span></p>
          ))}
        </div>
      )}
      {why && (
        <button type="button" onClick={() => setWhyOpen((o) => !o)} aria-expanded={whyOpen} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
          Why this reply? <ChevronDown className={cn('h-3 w-3 transition-transform', whyOpen && 'rotate-180')} />
        </button>
      )}
      {why && whyOpen && (
        <div className="space-y-0.5 rounded-md bg-background/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <p>For you only. Nothing has been sent.</p>
          {row.lead_id && <LeadAiResultChips leadId={row.lead_id} />}
          <p><span className="font-medium text-foreground">Next move (picked by code): </span>{(why.intent ?? why.move ?? '').replace(/_/g, ' ')}{why.question ? ` · ends with: "${why.question}"` : ' · no question'}</p>
          {(why.points ?? []).length > 0 && <p><span className="font-medium text-foreground">Says: </span>{(why.points ?? []).join(' · ')}</p>}
          <p><span className="font-medium text-foreground">Search: </span>{why.search ?? 'No completed AI check on record, so the AI part was left out.'}{why.named ? ` · named in ${why.named.named} of ${why.named.valid} answers` : ''}</p>
          {why.search && why.competitors.length > 0 && <p><span className="font-medium text-foreground">AI named: </span>{why.competitors.join(', ')}</p>}
          <p><span className="font-medium text-foreground">Website issues on record: </span>{why.findings.length ? why.findings.join(' · ') : (why.findingsNote ?? 'None, so none mentioned.')}</p>
          <p><span className="font-medium text-foreground">Offer facts from: </span>fact sheet {why.factSheetVersion}</p>
          {why.problems.length > 0 && <p className="text-amber-700 dark:text-amber-300"><span className="font-medium">Checks: </span>{why.problems.join(' ')}</p>}
          <p><span className="font-medium text-foreground">Cost: </span>${(why.costUsd ?? 0).toFixed(4)} · {why.calls} model call{why.calls === 1 ? '' : 's'}{why.usedFallback ? ' · model unavailable, rule-built draft' : ''}</p>
        </div>
      )}
    </div>
  );
}
