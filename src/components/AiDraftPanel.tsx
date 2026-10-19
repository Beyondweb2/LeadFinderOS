import { useState } from 'react';
import { LeadAiResultChips } from '@/components/LeadAiResultChips';
import { AlertTriangle, Check, ChevronDown, FileText, Loader2, RefreshCw, Sparkles, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aiChipFor, type AiChip, type AiReplyRow } from '@/lib/aiReplyDraft';

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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PANEL ABOVE THE REPLY BOX (AI handles replies, 2026-10-11).
   ⛔ IT NEVER SENDS BY ITSELF. The draft is pre-filled in the ordinary reply box, where it can be edited.
      "Approve & send" hands the box's text to `onApprove`, which claims the draft (once only) and sends it
      through the Inbox's existing send path. Discard sends nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export interface AiDraftPanelProps {
  row: AiReplyRow;
  busy: 'approve' | 'regenerate' | 'discard' | null;
  /** True when the reply box no longer holds the AI's text (someone typed their own). */
  boxDiffers: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  onUseDraft: () => void;
}

export function AiDraftPanel({ row, busy, boxDiffers, onApprove, onRegenerate, onDiscard, onUseDraft }: AiDraftPanelProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const chip = aiChipFor(row);
  if (!chip) return null;
  const why = row.why ?? null;

  if (chip.label !== 'Needs approving') {
    return (
      <div data-testid="ai-draft-panel" className={cn('flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ring-1 ring-inset',
        chip.tone === 'red' ? 'bg-red-500/5 ring-red-500/25' : chip.tone === 'amber' ? 'bg-amber-500/5 ring-amber-500/25' : 'bg-muted/40 ring-border/50')}>
        <AiDraftChip row={row} />
        <span className="min-w-0 flex-1 text-muted-foreground">
          {chip.label === 'Needs you' && <>AI did not write a reply: <span className="font-medium text-foreground">{row.reason_label ?? 'a person should answer this one'}</span>.</>}
          {chip.label === 'Needs a template' && <>Their last message is more than 24 hours old, so no free-text draft. Send an approved template.</>}
          {(chip.label === 'Drafting…' || chip.label === 'Sending…') && <>{chip.label}</>}
        </span>
        {(chip.label === 'Needs you' || chip.label === 'Needs a template') && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy !== null} onClick={onDiscard} title="Clear this flag. Nothing is sent.">
            {busy === 'discard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Dismiss
          </Button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="ai-draft-panel" className="space-y-1.5 rounded-lg bg-violet-500/5 px-2.5 py-2 text-xs ring-1 ring-inset ring-violet-500/25">
      <div className="flex flex-wrap items-center gap-1.5">
        <AiDraftChip row={row} />
        <span className="text-muted-foreground">AI wrote a reply. It is in the box below: edit it, then approve.</span>
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
      {why && why.problems.length > 0 && (
        <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span><span className="font-semibold">CHECK THIS DRAFT</span>: {why.problems[0]}</span>
        </p>
      )}
      {why && (
        <button type="button" onClick={() => setWhyOpen((o) => !o)} aria-expanded={whyOpen} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
          Why this reply? <ChevronDown className={cn('h-3 w-3 transition-transform', whyOpen && 'rotate-180')} />
        </button>
      )}
      {why && whyOpen && (
        <div className="space-y-0.5 rounded-md bg-background/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          <p>For you only. Nothing has been sent.</p>
          <LeadAiResultChips leadId={row.lead_id} />
          <p><span className="font-medium text-foreground">Search: </span>{why.search ?? 'No completed AI check on record, so the AI part was left out.'}</p>
          {why.search && <p><span className="font-medium text-foreground">AI named instead: </span>{why.competitors.length ? why.competitors.join(', ') : 'nobody instead (or names not available)'}{why.hookAlreadySent ? ' · the hook has already gone, so names are not repeated' : ''}</p>}
          <p><span className="font-medium text-foreground">Website issues used: </span>{why.findings.length ? why.findings.join(' · ') : (why.findingsNote ?? 'None found, so none mentioned.')}</p>
          <p><span className="font-medium text-foreground">Ends with: </span>{why.askedOwnership ? 'the agency / run it yourself question' : 'a call (they already said who runs the site)'}</p>
          <p><span className="font-medium text-foreground">Tone from: </span>{why.styleSource}</p>
          {why.problems.length > 0 && <p className="text-amber-700 dark:text-amber-300"><span className="font-medium">Checks: </span>{why.problems.join(' ')}</p>}
          <p><span className="font-medium text-foreground">Cost: </span>${why.costUsd.toFixed(4)} · {why.calls} model call{why.calls === 1 ? '' : 's'}{why.usedFallback ? ' · model unavailable, rule-built draft' : ''}</p>
        </div>
      )}
    </div>
  );
}
