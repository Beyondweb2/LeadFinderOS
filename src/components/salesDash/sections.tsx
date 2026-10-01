import { AlertTriangle, ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, Clock, Flame, MessageCircle, MessageCircleReply, PoundSterling, Send, Snowflake, Sparkles, Star, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FollowUpGroup, NextAction, SalesWorkspace } from '@/lib/salesWorkspace';
import type { LeadLink } from '@/lib/salesLinks';
import { Empty, Panel, TONE, ago, type Tone } from './ui';

/* ══ WHAT TO DO NEXT (the Sales page, 2026-10-01) ═════════════════════════════════════════════════
   The ranked list and the follow-up lists. The rest of the old dashboard's panels (Today, pipeline,
   waiting, warmth, health, feed, recap, targets, milestones, trends) were removed in the merge: each
   repeated another card or helped no decision. The server still works them out (salesWorkspace). */

export type Go = (link: LeadLink, leadId: string) => void;

const ACTION_ICON: Record<string, typeof Clock> = {
  reply_waiting: MessageCircleReply, follow_up_overdue: AlertTriangle, follow_up_due: CalendarClock, signup_opened: Flame,
  interested_untouched: Star, signup_unopened: Send, audit_ready: Sparkles, going_cold: Snowflake,
  quick_close_finish: PoundSterling, quick_close_link: PoundSterling, quick_close_review: AlertTriangle,
};
export function NextActions({ items, go, title = "Your next best actions", hint = "The most useful thing to do for each lead, most urgent first. Tap to open it." , collapseKey = 'sales.next-actions' }: { items: NextAction[]; go: Go; title?: string; hint?: string; collapseKey?: string }) {
  return (
    <Panel collapseKey={collapseKey} title={title} icon={Target} tone="blue" hint={hint}>
      {items.length === 0 ? <Empty icon={CheckCircle2}>Nothing waiting on you right now. New replies, due follow-ups and warm leads will show here.</Empty> : (
        <ul className="space-y-1.5">
          {items.map((a) => {
            const I = ACTION_ICON[a.kind] ?? ArrowRight;
            return (
              <li key={`${a.kind}:${a.leadId}`}>
                <button type="button" onClick={() => go(a.link, a.leadId)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-left transition hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE[a.tone].icon)}><I className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{a.name}</span></span>
                    <span className="block truncate text-xs text-muted-foreground"><span className={cn('font-medium', TONE[a.tone].text)}>{a.title}</span> · {a.detail}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground sm:flex">
                    {a.link === 'whatsapp' ? <><MessageCircle className="h-3.5 w-3.5" />WhatsApp</> : <>Open<ArrowRight className="h-3.5 w-3.5" /></>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── Follow-up queue ────────────────────────────────────────────────────────────────────────────── */
export const FOLLOW_UP_GROUPS: { key: FollowUpGroup; label: string; tone: Tone; link: LeadLink }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'red', link: 'lead' },
  { key: 'dueToday', label: 'Due today', tone: 'amber', link: 'lead' },
  { key: 'repliedUnanswered', label: 'Replied, unanswered', tone: 'blue', link: 'whatsapp' },
  { key: 'interestedUntouched', label: 'Interested, untouched', tone: 'green', link: 'whatsapp' },
  { key: 'signupSent', label: 'Sign-up link sent', tone: 'amber', link: 'whatsapp' },
  { key: 'goingCold', label: 'Going cold', tone: 'grey', link: 'whatsapp' },
  /* Focus Mode's two other lists (moved here 2026-10-01): booked meetings, and warm leads. */
  { key: 'meetings', label: 'Meetings', tone: 'blue', link: 'lead' },
  { key: 'warm', label: 'Warm', tone: 'green', link: 'whatsapp' },
];
export function FollowUpQueue({ fu, go, group, setGroup, hint = "Your own Next Actions are shown as you set them — never changed for you." , collapseKey = 'sales.follow-ups' }: { fu: SalesWorkspace['followUps']; go: Go; group: FollowUpGroup; setGroup: (g: FollowUpGroup) => void; hint?: string; collapseKey?: string }) {
  const g = FOLLOW_UP_GROUPS.find((x) => x.key === group) ?? FOLLOW_UP_GROUPS[0];
  const rows = fu[g.key];
  return (
    <Panel collapseKey={collapseKey} id="follow-ups" title="Follow-ups" icon={CalendarCheck} tone="amber" hint={hint}>
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {FOLLOW_UP_GROUPS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={x.key === g.key} onClick={() => setGroup(x.key)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              x.key === g.key ? cn(TONE[x.tone].soft, TONE[x.tone].text, 'ring-1', TONE[x.tone].ring) : 'text-muted-foreground hover:bg-muted/60')}>
            {x.label}<span className="tabular-nums opacity-80">{fu[x.key].length}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <Empty>Nothing in “{g.label}”.</Empty> : (
        <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {rows.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => go(l.link ?? g.link, l.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE[g.tone].dot)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{l.name}</span>{l.detail && <span className="block truncate text-[11px] text-muted-foreground">{l.detail}</span>}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(l.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

