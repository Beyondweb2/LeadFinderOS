import { memo } from 'react';
import { AlertTriangle, CheckCheck, Clock, Loader2, MessageCircleReply, Timer, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pipelineStatusClass } from '@/components/PipelineStatusBadge';
import type { AttentionKind } from '@/lib/inboxAttention';
import type { StatusPillKey, StatusPillTone } from '@/lib/inboxStatusPill';
import type { LeadAuditScore } from '@/lib/auditScore';
import { VISIBLE_LABEL, VISIBLE_TITLE } from '@/lib/visibleFlag';

/* The Inbox's ONE attention pill (src/lib/inboxAttention.ts decides which) and the ONE compact score line
   (src/lib/auditScore.ts — the card's own numbers, stored per run). Both used by the list row and the thread header. */

const PILL_TONE: Record<AttentionKind, string> = {
  needs_approval: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  needs_you: 'bg-red-500/15 text-red-700 dark:text-red-300',
  send_failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  auditing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  waiting: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  queued: 'bg-muted text-muted-foreground',
};
const PILL_ICON: Record<AttentionKind, typeof Clock> = {
  needs_approval: CheckCheck, needs_you: UserRound, send_failed: AlertTriangle, auditing: Loader2, waiting: MessageCircleReply, queued: Timer,
};

export const AttentionPill = memo(function AttentionPill({ kind, label, title, compact = false }: { kind: AttentionKind | null; label: string | null; title: string | null; compact?: boolean }) {
  if (!kind || !label) return null;
  const Icon = PILL_ICON[kind];
  return (
    <span data-testid="attention-pill" data-kind={kind} title={title ?? undefined}
      className={cn('inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full font-semibold', compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]', PILL_TONE[kind])}>
      <Icon className={cn('h-3 w-3 shrink-0', kind === 'auditing' && 'animate-spin')} />
      <span className="truncate">{label}</span>
    </span>
  );
});

/* ⛔ THE ONE STATUS PILL (src/lib/inboxStatusPill.ts decides the words). The SOLID pipeline-pill style again (Paul, 2026-11-03: the
   see-through tint of 2026-10-31, commit 5d7f6fbe, is gone): bright fill, dark text, rounded, ONE small size for every status.
   A plain stage and the closed / money stages wear the colour the stored status always had (pipelineStatusClass, the Outreach
   table's own); the derived "needs you" states get one solid colour each. Fixed height, one line, never wraps or grows. */
const DERIVED_CLASS: Partial<Record<StatusPillKey, string>> = {
  reply_needed: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))]',
  approve_draft: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))]',
  follow_up_due: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))]',
  send_failed: 'bg-red-700 text-white',
  call_booked: 'bg-emerald-600 text-white',
  auditing: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))]',
  queued: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))]',
  waiting_on_them: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]',
};
/** The stored status each closed / money pill key stands for (its colour is that status's own). */
const KEY_STATUS: Partial<Record<StatusPillKey, string>> = {
  won: 'won_pending_onboarding', paid: 'payment_received', in_delivery: 'in_delivery', completed: 'completed',
  refunded: 'refunded', not_interested: 'not_interested', opted_out: 'opted_out',
};
/** Statuses the pipeline pill draws as a faint tint: in the Inbox they are solid too (one bright colour per status). */
const SOLID_STATUS: Record<string, string> = {
  payment_received: 'bg-green-600 text-white', in_delivery: 'bg-green-600 text-white', refunded: 'bg-rose-700 text-white', opted_out: 'bg-red-900 text-white',
  second_attempt: 'bg-amber-500 text-black', awaiting_reply: 'bg-violet-500 text-white', site_sent: 'bg-emerald-500 text-black',
  report_sent: 'bg-sky-500 text-black', already_visible: 'bg-teal-500 text-black', price_given: 'bg-indigo-500 text-white',
};
export const StatusPill = memo(function StatusPill({ pillKey, label, tone, title, stage, compact: _compact = false }: { pillKey: StatusPillKey; label: string; tone: StatusPillTone; title: string; stage?: string | null; compact?: boolean }) {
  const status = KEY_STATUS[pillKey] ?? stage;
  const colour = DERIVED_CLASS[pillKey] ?? (status ? SOLID_STATUS[status] : undefined) ?? pipelineStatusClass(status);
  return (
    <span data-testid="status-pill" data-kind={pillKey} data-tone={tone} title={title}
      className={cn('inline-flex h-[18px] max-w-[11rem] shrink-0 items-center whitespace-nowrap rounded-md border border-transparent px-1.5 text-[10px] font-semibold leading-none', colour)}>
      <span className="truncate">{label}</span>
    </span>
  );
});

const tone = (named: number, of: number) => (of <= 0 ? 'text-muted-foreground/70' : named > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400');

/** "ChatGPT 1/3 · Gemini 0/3 · Google AI 0/1": green = named at least once, red = answered and never named, grey = no answer.
 *  While the stored score is out of date the line is greyed and says so in the hover — never shown as final. */
export const ScoreLine = memo(function ScoreLine({ score, visible, className }: { score: LeadAuditScore | null | undefined; visible?: boolean; className?: string }) {
  const s = score?.score ?? null;
  if (!score) {
    return visible ? <span className={className}><VisibleTag /></span> : null;
  }
  const parts: Array<{ k: string; label: string; named: number; of: number }> = s ? [
    { k: 'chatgpt', label: 'ChatGPT', named: s.chatgpt?.named ?? 0, of: s.chatgpt?.valid ?? 0 },
    { k: 'gemini', label: 'Gemini', named: s.gemini?.named ?? 0, of: s.gemini?.valid ?? 0 },
    { k: 'google', label: 'Google AI', named: s.googleAi.named, of: s.googleAi.shown },
  ] : [];
  const title = !s
    ? 'Audit score: being worked out (the audit just changed). It updates within a minute.'
    : `${parts.map((p) => (p.of > 0 ? `${p.label}: named in ${p.named} of ${p.of}` : p.k === 'google' ? 'Google AI: no AI answer shown' : `${p.label}: no answer yet`)).join(' · ')}`
      + `${s.complete ? '' : ' · audit not complete yet'}${score.updating ? ' · updating: the audit changed since this was worked out' : ''}`;
  return (
    <span data-testid="score-line" data-updating={score.updating ? 'true' : undefined} title={title}
      className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] font-medium tabular-nums', score.updating && 'opacity-60', className)}>
      {!s ? <span className="text-muted-foreground">Audit score updating…</span> : parts.map((p, i) => (
        <span key={p.k} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">·</span>}
          <span className={tone(p.named, p.of)}>{p.label} {p.of > 0 ? `${p.named}/${p.of}` : '–'}</span>
        </span>
      ))}
      {visible && <VisibleTag />}
    </span>
  );
});

export function VisibleTag() {
  return (
    <span title={VISIBLE_TITLE} data-testid="visible-chip"
      className="inline-flex items-center rounded bg-sky-500/15 px-1 text-[9px] font-semibold leading-tight text-sky-700 dark:text-sky-300">
      {VISIBLE_LABEL}
    </span>
  );
}
