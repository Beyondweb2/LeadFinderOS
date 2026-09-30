import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Gift, Loader2, MessageSquarePlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { FEEDBACK_KINDS, FEEDBACK_MAX, feedbackKindLabel, feedbackStatusLabel, type FeedbackKind } from '@/lib/feedback';
import { whatsNewFor, type WhatsNewEntry } from '@/lib/whatsNew';
import { cn } from '@/lib/utils';

/* ══ FEEDBACK + WHAT'S NEW — the always-there entry points (Sales Experience release 5) ═════════════
   Both open from the sidebar footer, the phone's More menu and the command palette (window events), so
   a person never has to hunt for them. Feedback is saved server-side first (fn feedback-submit); the
   person sees their own items and where each stands. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
export const OPEN_FEEDBACK_EVENT = 'open-feedback';
export const OPEN_WHATS_NEW_EVENT = 'open-whats-new';
const SEEN_KEY = 'lf-whats-new-seen';
const seenId = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };


export function FeedbackAndNews() {
  const { user } = useAuth();
  const { role } = useSubscription();
  const { toast } = useToast();
  const location = useLocation();
  const qc = useQueryClient();
  const [fbOpen, setFbOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const news = whatsNewFor(role);
  const [seen, setSeen] = useState(seenId);
  useEffect(() => {
    const f = () => setFbOpen(true); const n = () => setNewsOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, f); window.addEventListener(OPEN_WHATS_NEW_EVENT, n);
    return () => { window.removeEventListener(OPEN_FEEDBACK_EVENT, f); window.removeEventListener(OPEN_WHATS_NEW_EVENT, n); };
  }, []);
  useEffect(() => {
    if (!newsOpen || !news[0]) return;
    try { localStorage.setItem(SEEN_KEY, news[0].id); } catch { /* convenience only */ }
    setSeen(news[0].id);
    window.dispatchEvent(new Event('whats-new-seen'));
  }, [newsOpen, news]);
  const mine = useQuery({
    queryKey: ['my-feedback', user?.id],
    enabled: fbOpen && !!user?.id,
    queryFn: async () => ((await sb.from('feedback_items').select('id, created_at, kind, message, status, admin_note').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10)).data ?? []) as { id: string; created_at: string; kind: string; message: string; status: string; admin_note: string | null }[],
  });
  const send = async () => {
    setSending(true);
    try {
      const r = await invokeEdge<{ ok: true; emailed: boolean }>('feedback-submit', {
        kind, message,
        context: { path: location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent, build: String(import.meta.env.VITE_APP_BUILD ?? 'web'), online: String(navigator.onLine), language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      toast({ title: 'Thanks — feedback sent', description: r.emailed ? 'It is saved and Paul has been emailed.' : 'It is saved. (The email did not go, but it is in the Feedback inbox.)' });
      setMessage(''); void qc.invalidateQueries({ queryKey: ['my-feedback'] });
    } catch (e) {
      toast({ title: 'Not sent', description: edgeErrorMessage(e), variant: 'destructive' });
    } finally { setSending(false); }
  };
  void seen;

  return (
    <>
      <Dialog open={fbOpen} onOpenChange={setFbOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5 text-violet-500" />Send feedback</DialogTitle><DialogDescription>It goes straight to Paul. The page you are on is attached automatically.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of feedback">
            {FEEDBACK_KINDS.map((k) => (
              <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(k.value)}
                className={cn('rounded-lg border px-3 py-2 text-left text-sm font-medium transition', kind === k.value ? 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-border/60 hover:bg-muted/50')}>{k.label}</button>
            ))}
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX))} rows={5} placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : kind === 'feature' ? 'What would help you sell?' : 'Tell us…'} aria-label="Your feedback" />
          <DialogFooter><Button onClick={() => void send()} disabled={sending || message.trim().length < 3}>{sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Send feedback</Button></DialogFooter>
          {(mine.data ?? []).length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Your feedback</p>
              <ul className="space-y-1.5">
                {(mine.data ?? []).map((m) => (
                  <li key={m.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{feedbackKindLabel(m.kind)}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', m.status === 'fixed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : m.status === 'planned' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'bg-muted text-muted-foreground')}>{feedbackStatusLabel(m.status)}</span></div>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">{m.message}</p>
                    {m.admin_note && <p className="mt-0.5 text-foreground">Paul: {m.admin_note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Sheet open={newsOpen} onOpenChange={setNewsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-violet-500" />What's new</SheetTitle><SheetDescription>Recent changes to LeadFinderOS.</SheetDescription></SheetHeader>
          <ol className="mt-4 space-y-3">
            {news.map((e) => <NewsCard key={e.id} e={e} />)}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* One update. With a report (every entry from 2026-10-01) the card is a button: it opens to what was
   added, changed and removed, and what that means — Paul: "make it clickable and it opens and gives full
   report … keep it simple no fluff". Empty sections are not drawn. */
const REPORT_SECTIONS = [
  { key: 'added', label: 'Added' }, { key: 'changed', label: 'Changed' }, { key: 'removed', label: 'Removed' },
] as const;
function NewsCard({ e }: { e: WhatsNewEntry }) {
  const [open, setOpen] = useState(false);
  const r = e.report;
  const head = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">{new Date(`${e.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>
      <p className="mt-0.5 flex items-start justify-between gap-2 font-semibold">
        <span>{e.title}</span>
        {r && <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
    </>
  );
  return (
    <li className="rounded-xl border border-border/60">
      {r ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full rounded-xl p-3.5 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {head}
          {!open && <span className="mt-1.5 block text-xs font-medium text-primary">See what changed</span>}
        </button>
      ) : <div className="p-3.5">{head}</div>}
      {r && open && (
        <div className="space-y-3 border-t border-border/60 px-3.5 pb-3.5 pt-3 text-sm" data-testid="whats-new-report">
          {REPORT_SECTIONS.filter((s) => r[s.key].length > 0).map((s) => (
            <div key={s.key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">{r[s.key].map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
          <div className="rounded-lg bg-violet-500/10 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">What it means for you</p>
            <p className="mt-0.5">{r.effect}</p>
          </div>
        </div>
      )}
    </li>
  );
}

/** The two menu entries (sidebar footer). The dot shows until the newest What's New entry is seen. */
export function FeedbackNewsButtons({ className }: { className?: string }) {
  const { role } = useSubscription();
  const [seen, setSeen] = useState(seenId);
  useEffect(() => { const f = () => setSeen(seenId()); window.addEventListener('whats-new-seen', f); return () => window.removeEventListener('whats-new-seen', f); }, []);
  const newest = whatsNewFor(role)[0]?.id;
  return (
    <div className={cn('grid grid-cols-2 gap-1.5', className)}>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))} className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60"><MessageSquarePlus className="h-3.5 w-3.5" />Feedback</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT))} className="relative flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60">
        <Sparkles className="h-3.5 w-3.5" />What's new{newest && seen !== newest && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-violet-500" aria-label="New" />}
      </button>
    </div>
  );
}
