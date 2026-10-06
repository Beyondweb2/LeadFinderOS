import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, BellRing, CalendarClock, CheckCheck, FileCheck2, Flame, Megaphone, MessageCircleReply, MessageSquareHeart,
  ListChecks, PoundSterling, Sparkles, Trash2, Trophy, Undo2, UserPlus, X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useNotifications, type AppNotification } from '@/hooks/useNotifications';
import { useWhatsAppUnreadCounts } from '@/hooks/useWhatsAppUnread';
import { GROUPED_NOTIFICATION_KINDS, REPLY_CARD_LINK, bellCount, replyCardBody, replyCardTitle, replySummary, type ReplySummary } from '@/lib/notificationGrouping';
import { TONE, ago, type Tone } from '@/components/salesDash/ui';

/* ══ THE NOTIFICATION CENTRE (Sales Experience release 3, 2026-09-28) ═════════════════════════════════
   Desktop: a bell at the bottom-right. Phone: the bell in the top bar. Newest first, unread marked,
   mark read / mark all read / clear, each one deep-linked (a WhatsApp reply opens that exact thread).
   Replies and money are the prominent ones (priority 2). Optional desktop alerts: only when the tab is
   hidden, only for priority items, and only if this person turned them on (a browser permission).
   Where it lives: AppLayout (the shell mounts once). */
const KIND: Record<string, { icon: typeof Bell; tone: Tone }> = {
  whatsapp_reply: { icon: MessageCircleReply, tone: 'blue' },
  whatsapp_failed: { icon: AlertTriangle, tone: 'red' },
  signup_opened: { icon: Flame, tone: 'green' },
  client_paid: { icon: Trophy, tone: 'green' },
  commission_earned: { icon: PoundSterling, tone: 'green' },
  commission_reversed: { icon: Undo2, tone: 'red' },
  audit_finished: { icon: Sparkles, tone: 'purple' },
  template_decided: { icon: FileCheck2, tone: 'grey' },
  follow_up_due: { icon: CalendarClock, tone: 'amber' },
  lead_assigned: { icon: UserPlus, tone: 'grey' },
  transfer_request: { icon: UserPlus, tone: 'amber' },
  feedback_update: { icon: MessageSquareHeart, tone: 'purple' },
  feature_update: { icon: Megaphone, tone: 'purple' },
  quick_close_review: { icon: AlertTriangle, tone: 'amber' },
  quick_close_paid: { icon: Trophy, tone: 'green' },
  team_update: { icon: Megaphone, tone: 'blue' },
  team_task: { icon: ListChecks, tone: 'amber' },
  /* CLIENT INFO NEEDED (2026-10-05): Paul asked the seller for a paid client's missing details (and the reply). */
  client_info_request: { icon: ListChecks, tone: 'amber' },
  /* Paid client auto-intake (2026-10-06): NEW CLIENT HANDOFF (a salesperson pressed Send to Paul) and the
     automatic intake finishing (CLIENT READY / needs attention). */
  client_handoff: { icon: ListChecks, tone: 'blue' },
  client_intake: { icon: Sparkles, tone: 'blue' },
};
const ALERTS_KEY = 'lf-desktop-alerts';
const readAlerts = () => { try { return localStorage.getItem(ALERTS_KEY) === 'on'; } catch { return false; } };

function List({ n, onGo, onClose, replies, onReplies, count }: { n: ReturnType<typeof useNotifications>; onGo: (x: AppNotification) => void; onClose?: () => void; replies: ReplySummary; onReplies: () => void; count: number }) {
  /* Replies are ONE card (notificationGrouping.ts); their stored rows are never drawn one by one. */
  const shown = n.rows.filter((r) => !GROUPED_NOTIFICATION_KINDS.has(r.kind));
  const [alerts, setAlerts] = useState(readAlerts);
  const canAlert = typeof window !== 'undefined' && 'Notification' in window;
  const toggleAlerts = async (on: boolean) => {
    if (on && canAlert && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { setAlerts(false); return; }
    }
    setAlerts(on);
    try { localStorage.setItem(ALERTS_KEY, on ? 'on' : 'off'); } catch { /* per-viewer convenience only */ }
  };
  return (
    <div className="flex max-h-[min(34rem,80vh)] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <p className="text-sm font-semibold">Notifications{count ? <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">{count}</span> : null}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void n.markRead(null)} disabled={!n.unread} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button>
          {onClose && <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {replies.messages > 0 && (
          <li>
            <button type="button" onClick={onReplies} data-testid="grouped-replies" className="flex w-full items-start gap-2.5 rounded-lg bg-blue-500/[0.06] px-2.5 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE.blue.icon)}><MessageCircleReply className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{replyCardTitle(replies)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{replyCardBody(replies)}</span>
                <span className="mt-1 inline-block text-xs font-medium text-primary">Open Inbox</span>
              </span>
            </button>
          </li>
        )}
        {shown.length === 0 && replies.messages === 0 && <li className="px-3 py-8 text-center text-xs text-muted-foreground">You're all caught up. New replies, payments and follow-ups will appear here.</li>}
        {shown.map((x) => {
          const k = KIND[x.kind] ?? { icon: Bell, tone: 'grey' as Tone };
          return (
            <li key={x.id} className="group relative">
              <button type="button" onClick={() => onGo(x)} className={cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', !x.read_at && 'bg-blue-500/[0.06]')}>
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE[k.tone].icon)}><k.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 pr-6">
                  <span className={cn('block text-sm leading-snug', !x.read_at ? 'font-semibold' : 'font-medium text-foreground/85')}>{x.title}</span>
                  {x.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{x.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{ago(x.created_at)}</span>
                </span>
                {!x.read_at && <span className="absolute right-3 top-3.5 h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />}
              </button>
              <button type="button" onClick={() => void n.clear([x.id])} className="absolute bottom-2 right-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100" aria-label={`Clear: ${x.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        {canAlert ? <label className="flex items-center gap-2"><Switch checked={alerts} onCheckedChange={(v) => void toggleAlerts(v)} aria-label="Desktop alerts" />Desktop alerts for replies and payments</label> : <span />}
        {n.rows.some((r) => r.read_at) && <button type="button" onClick={() => void n.clear(n.rows.filter((r) => r.read_at).map((r) => r.id))} className="shrink-0 hover:text-foreground hover:underline">Clear read</button>}
      </div>
    </div>
  );
}

export function NotificationCenter({ variant }: { variant: 'desktop' | 'mobile' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Desktop alerts and the tab-title count belong to ONE instance (the desktop bell), never twice.
  const n = useNotifications(variant === 'mobile' ? undefined : (x) => {
    if (x.priority < 2 || !readAlerts() || typeof document === 'undefined' || !document.hidden) return;
    try { if (Notification.permission === 'granted') { const w = new Notification(x.title, { body: x.body ?? undefined, tag: x.id }); w.onclick = () => { window.focus(); if (x.link) navigate(x.link); }; } } catch { /* not supported */ }
  });
  const go = (x: AppNotification) => { if (!x.read_at) void n.markRead([x.id]); setOpen(false); if (x.link) navigate(x.link); };
  /* The grouped reply card, from the Inbox's own unread state — it falls as conversations are opened. */
  const wa = useWhatsAppUnreadCounts();
  const replies = replySummary(wa.rows);
  const count = bellCount(wa.rows.length, n.rows);
  const openReplies = () => {
    const ids = n.rows.filter((r) => GROUPED_NOTIFICATION_KINDS.has(r.kind) && !r.read_at).map((r) => r.id);
    if (ids.length) void n.markRead(ids);
    setOpen(false); navigate(REPLY_CARD_LINK);
  };
  // The bell's tab title count: a glance from another tab.
  useEffect(() => {
    if (variant === 'mobile') return;
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = count ? `(${count}) ${base}` : base;
  }, [count, variant]);
  const Icon = count ? BellRing : Bell;
  const badge = count > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-blue-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white tabular-nums">{count > 99 ? '99+' : count}</span>;

  if (variant === 'mobile') {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-muted" aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
          <Icon className="h-5 w-5" />{badge}
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="top" className="p-0 [&>button]:hidden">
            <SheetHeader className="sr-only"><SheetTitle>Notifications</SheetTitle></SheetHeader>
            <List n={n} onGo={go} onClose={() => setOpen(false)} replies={replies} onReplies={openReplies} count={count} />
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="fixed bottom-4 right-4 z-40 hidden h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-lg transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:inline-flex" aria-label={`Notifications${count ? `, ${count} unread` : ''}`}>
          <Icon className={cn('h-5 w-5', count > 0 && 'text-blue-500')} />{badge}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="w-[380px] p-0">
        <List n={n} onGo={go} replies={replies} onReplies={openReplies} count={count} />
      </PopoverContent>
    </Popover>
  );
}
