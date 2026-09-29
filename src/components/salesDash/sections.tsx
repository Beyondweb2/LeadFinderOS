import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Award, CalendarCheck, CalendarClock, CheckCircle2, ChevronRight, Clock, Flame,
  HeartPulse, Lock, MessageCircle, MessageCircleReply, PhoneCall, PoundSterling, Send, Snowflake, Sparkles,
  Star, Target, ThermometerSun, TrendingUp, Trophy, UserPlus, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatWaiting } from '@/lib/conversationState';
import type {
  FeedItem, FollowUpGroup, HealthWarning, Milestone, NextAction, PipeLead, SalesWorkspace, StageKey, TargetInput, Warmth,
} from '@/lib/salesWorkspace';
import type { LeadLink } from '@/lib/salesLinks';
import { Empty, Panel, StatTile, TONE, ago, gbp, type Tone } from './ui';

export type Go = (link: LeadLink, leadId: string) => void;

/* ── Today ──────────────────────────────────────────────────────────────────────────────────────── */
export function TodayStrip({ t, unread, earnedToday, onUnread, onFollowUps }: {
  t: SalesWorkspace['today']; unread: number | null; earnedToday: number | null; onUnread: () => void; onFollowUps: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Contacted today" value={t.contacted} icon={Send} tone="grey" />
      <StatTile label="Replies today" value={t.replies} icon={MessageCircleReply} tone="blue" />
      <StatTile label="Interested today" value={t.interested} icon={Star} tone="green" />
      <StatTile label="Earned today" value={earnedToday === null ? '—' : gbp(earnedToday)} icon={PoundSterling} tone="green" title={earnedToday === null ? 'Commission appears here once the earnings ledger is live' : undefined} />
      <StatTile label="Follow-ups due" value={t.followUpsDue} icon={CalendarClock} tone={t.followUpsDue > 0 ? 'amber' : 'grey'} onClick={onFollowUps} />
      <StatTile label="Unread WhatsApp" value={unread === null ? '—' : unread} icon={MessageCircle} tone={unread ? 'blue' : 'grey'} onClick={onUnread} title={unread === null ? 'Your own unread count shows when you view your own dashboard' : 'Open your unread WhatsApp conversations'} />
    </div>
  );
}

/* ── Pipeline ───────────────────────────────────────────────────────────────────────────────────── */
const STAGE_TONE: Record<StageKey, Tone> = { new: 'grey', contacted: 'grey', replied: 'blue', interested: 'green', signup_sent: 'amber', paid: 'green' };

export function PipelineStrip({ pipeline, notInterested, onOpen }: { pipeline: SalesWorkspace['pipeline']; notInterested: number; onOpen: (k: StageKey) => void }) {
  const max = Math.max(1, ...pipeline.map((p) => p.count));
  return (
    <Panel title="Pipeline" icon={TrendingUp} tone="blue" hint={`Where each of your leads is now. Tap a stage to see its leads.${notInterested ? ` ${notInterested} not interested are left out.` : ''}`}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {pipeline.map((p, i) => (
          <li key={p.key} className="relative">
            <button type="button" onClick={() => onOpen(p.key)} disabled={p.count === 0}
              className={cn('flex w-full flex-col gap-1.5 rounded-xl border border-border/60 p-3 text-left transition',
                p.count > 0 ? 'hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : 'opacity-60')}>
              <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {p.label}{i < pipeline.length - 1 && <ChevronRight className="hidden h-3.5 w-3.5 lg:block" />}
              </span>
              <span className={cn('text-2xl font-bold tabular-nums', TONE[STAGE_TONE[p.key]].text)}>{p.count}</span>
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', TONE[STAGE_TONE[p.key]].bar)} style={{ width: `${Math.max(p.count ? 6 : 0, (p.count / max) * 100)}%` }} /></span>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function LeadListSheet({ open, onOpenChange, title, description, leads, go, defaultLink = 'lead' }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; leads: PipeLead[]; go: Go; defaultLink?: LeadLink;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{title}</SheetTitle>{description && <SheetDescription>{description}</SheetDescription>}</SheetHeader>
        <ul className="mt-4 space-y-1.5">
          {leads.length === 0 && <li><Empty>No leads here.</Empty></li>}
          {leads.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go(defaultLink, l.id)}>
                <span className="block truncate text-sm font-medium">{l.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{[l.detail, l.at ? ago(l.at) : null, l.warmth ? WARMTH[l.warmth].label : null].filter(Boolean).join(' · ') || '—'}</span>
              </button>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-blue-600" aria-label={`Open ${l.name} on WhatsApp`} onClick={() => go('whatsapp', l.id)}><MessageCircle className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Open ${l.name}`} onClick={() => go('lead', l.id)}><ArrowRight className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/* ── Next best actions ──────────────────────────────────────────────────────────────────────────── */
const ACTION_ICON: Record<string, typeof Clock> = {
  reply_waiting: MessageCircleReply, follow_up_overdue: AlertTriangle, follow_up_due: CalendarClock, signup_opened: Flame,
  interested_untouched: Star, signup_unopened: Send, audit_ready: Sparkles, going_cold: Snowflake,
  quick_close_finish: PoundSterling, quick_close_link: PoundSterling, quick_close_review: AlertTriangle,
};
export function NextActions({ items, go, onFocus }: { items: NextAction[]; go: Go; onFocus?: () => void }) {
  return (
    <Panel title="Your next best actions" icon={Target} tone="blue" hint="The most useful thing to do for each lead, most urgent first. Tap to open it."
      action={onFocus && items.length > 0 ? <Button size="sm" className="h-8 gap-1 text-xs" onClick={onFocus}><Target className="h-3.5 w-3.5" />Focus Mode</Button> : undefined}>
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
  { key: 'signupSent', label: 'Signup sent', tone: 'amber', link: 'whatsapp' },
  { key: 'goingCold', label: 'Going cold', tone: 'grey', link: 'whatsapp' },
];
export function FollowUpQueue({ fu, go, group, setGroup }: { fu: SalesWorkspace['followUps']; go: Go; group: FollowUpGroup; setGroup: (g: FollowUpGroup) => void }) {
  const g = FOLLOW_UP_GROUPS.find((x) => x.key === group) ?? FOLLOW_UP_GROUPS[0];
  const rows = fu[g.key];
  return (
    <Panel id="follow-ups" title="Follow-up queue" icon={CalendarCheck} tone="amber" hint="Your own Next Actions are shown as you set them — never changed for you.">
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
              <button type="button" onClick={() => go(g.link, l.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
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

/* ── Response timers ────────────────────────────────────────────────────────────────────────────── */
export function WaitingPanel({ waiting, go }: { waiting: SalesWorkspace['waiting']; go: Go }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(id); }, []);
  return (
    <Panel title="Waiting on you" icon={Clock} tone="blue" hint="Replies in the last 14 days that nothing has answered yet, longest wait first.">
      {waiting.length === 0 ? <Empty icon={CheckCircle2}>Every reply has an answer.</Empty> : (
        <ul className="space-y-1">
          {waiting.map((w) => {
            const d = Date.now() - Date.parse(w.since);
            const tone: Tone = d > 24 * 3_600_000 ? 'red' : d > 2 * 3_600_000 ? 'amber' : 'blue';
            return (
              <li key={w.leadId}>
                <button type="button" onClick={() => go('whatsapp', w.leadId)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <MessageCircle className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', TONE[tone].soft, TONE[tone].text)}>Waiting {formatWaiting(d)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ── Warm / needs follow-up / going cold ────────────────────────────────────────────────────────── */
export const WARMTH: Record<Warmth, { label: string; tone: Tone; icon: typeof Flame; rule: string }> = {
  warm: { label: 'Warm', tone: 'green', icon: ThermometerSun, rule: 'Replied in the last 7 days' },
  needs_follow_up: { label: 'Needs follow-up', tone: 'amber', icon: CalendarClock, rule: 'A reply waiting on you, a due Next Action, or you messaged last 3+ days ago' },
  going_cold: { label: 'Going cold', tone: 'grey', icon: Snowflake, rule: 'Engaged before, no contact either way for 14+ days' },
};
export function WarmthPanel({ warmth, onOpen }: { warmth: SalesWorkspace['warmth']; onOpen: (w: Warmth) => void }) {
  return (
    <Panel title="Lead temperature" icon={ThermometerSun} tone="green" hint="Leads that have engaged, by plain rules — no scores.">
      <ul className="space-y-1.5">
        {(Object.keys(WARMTH) as Warmth[]).map((k) => {
          const W = WARMTH[k];
          return (
            <li key={k}>
              <button type="button" onClick={() => onOpen(k)} disabled={warmth[k] === 0} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', TONE[W.tone].soft, warmth[k] > 0 ? 'hover:ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : 'opacity-70', TONE[W.tone].ring)}>
                <W.icon className={cn('h-4 w-4 shrink-0', TONE[W.tone].text)} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{W.label}</span><span className="block truncate text-[11px] text-muted-foreground">{W.rule}</span></span>
                <span className={cn('text-xl font-bold tabular-nums', TONE[W.tone].text)}>{warmth[k]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── Pipeline health ────────────────────────────────────────────────────────────────────────────── */
export function HealthPanel({ health, onGroup }: { health: HealthWarning[]; onGroup: (g: FollowUpGroup) => void }) {
  return (
    <Panel title="Pipeline health" icon={HeartPulse} tone={health.some((h) => h.tone === 'red') ? 'red' : health.length ? 'amber' : 'green'} hint="Plain observations from your own numbers.">
      {health.length === 0 ? <Empty icon={CheckCircle2}>Nothing stands out. Keep going.</Empty> : (
        <ul className="space-y-1.5">
          {health.map((h) => (
            <li key={h.key} className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', TONE[h.tone].soft)}>
              <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[h.tone].text)} />
              <span className="min-w-0 flex-1">{h.text}</span>
              {h.group && <button type="button" onClick={() => onGroup(h.group!)} className={cn('shrink-0 text-xs font-semibold hover:underline', TONE[h.tone].text)}>Show</button>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Activity feed ──────────────────────────────────────────────────────────────────────────────── */
const FEED_ICON: Record<string, typeof Clock> = {
  reply: MessageCircleReply, interested: Star, signup_sent: Send, signup_opened: Flame, payment: Trophy, audit: Sparkles,
  follow_up: CalendarClock, assigned: UserPlus, contact: PhoneCall, commission: PoundSterling,
};
export function ActivityFeed({ items, go }: { items: FeedItem[]; go: Go }) {
  return (
    <Panel title="Activity" icon={Users} tone="blue" hint="What happened on your leads in the last 14 days.">
      {items.length === 0 ? <Empty>No activity in the last 14 days yet.</Empty> : (
        <ol className="relative max-h-96 space-y-0.5 overflow-y-auto pr-1">
          {items.map((it, i) => {
            const I = FEED_ICON[it.kind] ?? ArrowRight;
            return (
              <li key={`${it.kind}:${it.leadId}:${it.at}:${i}`}>
                <button type="button" onClick={() => go(it.link, it.leadId)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', TONE[it.tone].icon)}><I className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1 text-sm leading-snug">{it.text}</span>
                  <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{ago(it.at)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

/* ── Daily recap ────────────────────────────────────────────────────────────────────────────────── */
export function RecapPanel({ r, earnedToday }: { r: SalesWorkspace['recap']; earnedToday: number | null }) {
  const rows: [string, React.ReactNode, Tone][] = [
    ['Contacted', r.contacted, 'grey'], ['Replies', r.replies, 'blue'], ['Interested', r.interested, 'green'],
    ['Clients won', r.won, 'green'], ['Earned', earnedToday === null ? '—' : gbp(earnedToday), 'green'],
    ['Follow-ups done', r.followUpsCompleted, 'amber'], ['Follow-ups left', r.followUpsRemaining, r.followUpsRemaining ? 'amber' : 'grey'],
  ];
  const nothing = !r.contacted && !r.replies && !r.interested && !r.won && !r.followUpsCompleted && !r.followUpsRemaining;
  return (
    <Panel title="Today’s recap" icon={CalendarCheck} tone="grey" hint={new Date(`${r.day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}>
      {nothing && <p className="mb-2 text-xs text-muted-foreground">A quiet day so far — everything below is zero.</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
            <dt className="text-muted-foreground">{k}</dt><dd className={cn('font-semibold tabular-nums', TONE[tone].text === 'text-muted-foreground' ? '' : TONE[tone].text)}>{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ── Personal targets ───────────────────────────────────────────────────────────────────────────── */
export function TargetsPanel({ targets, canEdit, onEdit }: { targets: SalesWorkspace['targets']; canEdit: boolean; onEdit: () => void }) {
  return (
    <Panel title="Your targets" icon={Target} tone="green" hint={targets ? `This ${targets.period}, since ${new Date(`${targets.since}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Private to you.` : 'Optional, private to you.'}
      action={canEdit ? <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEdit}>{targets ? 'Edit' : 'Set targets'}</Button> : undefined}>
      {!targets || targets.rows.length === 0 ? <Empty>No targets set. {canEdit ? 'Set one if it helps — it is only for you.' : ''}</Empty> : (
        <ul className="space-y-2.5">
          {targets.rows.map((t) => {
            const pctV = t.actual === null ? 0 : Math.min(100, Math.round((t.actual / t.target) * 100));
            const done = t.actual !== null && t.actual >= t.target;
            return (
              <li key={t.key}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{t.label}</span>
                  <span className={cn('tabular-nums', done ? 'font-semibold text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')}>{t.actual === null ? '—' : t.key === 'commission' ? gbp(t.actual) : t.actual} / {t.key === 'commission' ? gbp(t.target) : t.target}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none', done ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: `${pctV}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function TargetsDialog({ open, onOpenChange, initial, onSave, saving }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: TargetInput | null; onSave: (t: TargetInput | null) => void; saving: boolean;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  useEffect(() => {
    if (!open) return;
    setPeriod(initial?.period === 'month' ? 'month' : 'week');
    setV({ contacts: String(initial?.contacts ?? ''), replies: String(initial?.replies ?? ''), interested: String(initial?.interested ?? ''), wins: String(initial?.wins ?? ''), commission: String(initial?.commission ?? '') });
  }, [open, initial]);
  const fields: [keyof TargetInput, string][] = [['contacts', 'Leads contacted'], ['replies', 'Replies'], ['interested', 'Interested'], ['wins', 'Clients won'], ['commission', 'Commission (£)']];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Your targets</DialogTitle><DialogDescription>Optional and private. Leave a box empty to skip it.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Period</Label>
            <Select value={period} onValueChange={(x) => setPeriod(x as 'week' | 'month')}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="week">Each week (from Monday)</SelectItem><SelectItem value="month">Each month</SelectItem></SelectContent></Select>
          </div>
          {fields.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <Label htmlFor={`tg-${k}`} className="text-sm">{label}</Label>
              <Input id={`tg-${k}`} inputMode="numeric" className="h-9 w-24 text-right" value={v[k] ?? ''} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, '') }))} />
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onSave(null)} disabled={saving}>Clear all</Button>
          <Button onClick={() => { const out: TargetInput = { period }; for (const [k] of fields) { const n = Number(v[k]); if (n > 0) (out as Record<string, unknown>)[k] = n; } onSave(out); }} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Milestones ─────────────────────────────────────────────────────────────────────────────────── */
export function MilestonesPanel({ items }: { items: Milestone[] }) {
  const done = items.filter((m) => m.achieved).length;
  return (
    <Panel title="Milestones" icon={Award} tone="purple" hint={`${done} of ${items.length} reached. Private to you.`}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {items.map((m) => (
          <li key={m.key} className={cn('flex flex-col items-start gap-1 rounded-xl border p-3', m.achieved ? 'border-violet-500/30 bg-violet-500/10' : 'border-border/60')}>
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', m.achieved ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground')}>{m.achieved ? <Award className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}</span>
            <span className={cn('text-xs font-semibold leading-tight', !m.achieved && 'text-muted-foreground')}>{m.label}</span>
            <span className="text-[11px] text-muted-foreground">
              {m.achieved ? (m.achievedAt ? new Date(m.achievedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Reached')
                : m.progress === null ? (m.note ?? 'Locked') : `${m.key === 'earned_100' ? gbp(m.progress) : m.progress} / ${m.key === 'earned_100' ? gbp(m.target) : m.target}`}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Trends ─────────────────────────────────────────────────────────────────────────────────────── */
export function TrendsPanel({ trends }: { trends: SalesWorkspace['trends'] }) {
  const series: { key: 'contacted' | 'replies' | 'interested' | 'won'; label: string; tone: Tone }[] = [
    { key: 'contacted', label: 'Contacted', tone: 'grey' }, { key: 'replies', label: 'Replied', tone: 'blue' },
    { key: 'interested', label: 'Interested', tone: 'green' }, { key: 'won', label: 'Won', tone: 'green' },
  ];
  return (
    <Panel title="Trends" icon={TrendingUp} tone="blue" hint="Leads per week, last 8 weeks.">
      {!trends.enough ? <Empty icon={TrendingUp}>{trends.reason}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {series.map((s) => {
            const vals = trends.weeks.map((w) => w[s.key]);
            const max = Math.max(1, ...vals);
            const none = vals.every((v) => v === 0);
            return (
              <figure key={s.key} className="rounded-xl border border-border/60 p-3">
                <figcaption className="mb-2 flex items-baseline justify-between text-xs"><span className="font-semibold">{s.label}</span><span className="tabular-nums text-muted-foreground">this week {vals[vals.length - 1]}</span></figcaption>
                {none ? (
                  <p className="flex h-16 items-center text-[11px] text-muted-foreground">{s.key === 'interested' ? 'Nothing recorded in these weeks. The moment a lead becomes interested is recorded from 27 Sept.' : 'Nothing in these weeks.'}</p>
                ) : (
                  <div className="flex h-16 items-end gap-1" role="img" aria-label={`${s.label} per week: ${vals.join(', ')}`}>
                    {vals.map((v, i) => <span key={i} className={cn('flex-1 rounded-t', TONE[s.tone].bar, i === vals.length - 1 ? 'opacity-100' : 'opacity-60')} style={{ height: `${v ? Math.max(6, (v / max) * 100) : 2}%` }} title={`${trends.weeks[i].weekStart}: ${v}`} />)}
                  </div>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
