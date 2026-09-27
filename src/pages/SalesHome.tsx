import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Search, Send, MessageCircle, CalendarClock, PhoneCall, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useMyLeads, useRecentActivity, useSalesActions, useSalesPool } from '@/hooks/useSalesCrm';
import {
  ACTIVITY_LABEL, MY_LEADS_FILTER_LABEL, QUEUE_SKIP_LABEL, SALES_STAGE_LABEL, followUpBucket, londonToday,
  matchesFilter, needsAttention, refusalText, salesStageOf, type MyLeadsFilter,
} from '@/lib/salesCrm';
import { cn } from '@/lib/utils';

/* THE SALESPERSON'S HOME (multi-user, 2026-09-27). Everything here reads sales_leads / sales_pool /
 * lead_activity, which the server scopes to the caller. No delivery, client, money or system data
 * is fetched by this page. */

const FILTERS: MyLeadsFilter[] = ['attention', 'replies', 'followups', 'calls', 'interested', 'new', 'all'];

function fmtDay(d: string | null | undefined) {
  if (!d) return '';
  return new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

export default function SalesHome() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: leads, isLoading } = useMyLeads();
  const recent = useRecentActivity();
  const actions = useSalesActions();
  const [filter, setFilter] = useState<MyLeadsFilter>('attention');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poolQ, setPoolQ] = useState('');
  const [poolQuery, setPoolQuery] = useState('');
  const [poolPage, setPoolPage] = useState(0);
  const pool = useSalesPool(poolQuery, poolPage);

  const today = londonToday();
  const nowMs = Date.now();
  const all = leads ?? [];

  const counts = useMemo(() => {
    const c = { reply: 0, followUp: 0, overdue: 0, call: 0, contacted: 0, replied: 0, interested: 0, awaiting: 0, won: 0 };
    for (const l of all) {
      if (l.is_archived) continue;
      const a = needsAttention(l, today, nowMs);
      if (a.reply) c.reply++;
      if (a.followUp) c.followUp++;
      if (followUpBucket(l.next_action_date, today) === 'overdue') c.overdue++;
      if (a.call) c.call++;
      const s = salesStageOf(l.status);
      if (s === 'contacted' || s === 'queued') c.contacted++;
      if (s === 'replied') c.replied++;
      if (s === 'interested') c.interested++;
      if (s === 'awaiting_decision') c.awaiting++;
      if (s === 'won') c.won++;
    }
    return c;
  }, [all, today, nowMs]);

  const shown = useMemo(() => all.filter((l) => matchesFilter(l, filter, today, nowMs)), [all, filter, today, nowMs]);
  const selectable = (id: string) => salesStageOf(all.find((l) => l.id === id)?.status) === 'new';
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const sendOpener = async () => {
    const ids = [...selected].filter(selectable);
    if (!ids.length) return;
    const r = await actions.queueOpener.mutateAsync({ leadIds: ids });
    if (!r.ok) { toast({ title: 'Nothing queued', description: refusalText(r.error), variant: 'destructive' }); return; }
    const skipped = Object.entries((r.skipped ?? {}) as Record<string, number>)
      .map(([k, n]) => `${n} ${QUEUE_SKIP_LABEL[k] ?? k}`).join(' · ');
    toast({
      title: `Queued ${r.queued ?? 0} for WhatsApp`,
      description: `${skipped ? `Skipped: ${skipped}. ` : ''}The approved opener sends within the daily 7am–9:30pm UK window. The queue re-checks every one before it sends.`,
    });
    setSelected(new Set());
  };

  const claim = async (id: string) => {
    const r = await actions.claim.mutateAsync({ leadId: id });
    if (!r.ok) { toast({ title: 'Not claimed', description: refusalText(r.error, r.owner_name as string | undefined), variant: 'destructive' }); return; }
    toast({ title: 'Claimed', description: 'It is now in My leads.' });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">My leads</h1>
        {/* Absent is not zero: while the list loads, say so rather than show "0 leads". */}
        <p className="text-sm text-muted-foreground">{isLoading ? 'Loading your leads…' : `${all.filter((l) => !l.is_archived).length} leads assigned to you.`}</p>
      </div>

      {/* NEEDS ATTENTION */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { key: 'replies' as const, icon: MessageCircle, label: 'Replies', n: counts.reply, sub: 'waiting on you' },
          { key: 'followups' as const, icon: CalendarClock, label: 'Follow-ups due', n: counts.followUp, sub: counts.overdue ? `${counts.overdue} overdue` : 'today' },
          { key: 'calls' as const, icon: PhoneCall, label: 'Calls booked', n: counts.call, sub: 'today / tomorrow' },
        ].map((c) => (
          <button key={c.key} type="button" onClick={() => setFilter(c.key)}
            className={cn('text-left rounded-lg border p-4 transition-colors hover:bg-muted/40', filter === c.key && 'border-primary')}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><c.icon className="h-4 w-4" />{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.n}</div>
            <div className={cn('text-xs text-muted-foreground', c.key === 'followups' && counts.overdue > 0 && 'text-destructive')}>{c.sub}</div>
          </button>
        ))}
      </section>

      {/* MY PIPELINE */}
      <section className="flex flex-wrap gap-2 text-sm">
        {[
          ['Contacted', counts.contacted], ['Replied', counts.replied], ['Interested', counts.interested],
          ['Awaiting decision', counts.awaiting], ['Won · awaiting admin', counts.won],
        ].map(([label, n]) => (
          <span key={label as string} className="rounded-md border px-3 py-1.5"><span className="text-muted-foreground">{label}</span> <span className="font-semibold">{n as number}</span></span>
        ))}
      </section>

      {/* THE LIST */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b p-3">
          {FILTERS.map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)}>{MY_LEADS_FILTER_LABEL[f]}</Button>
          ))}
          <div className="ml-auto">
            <Button size="sm" disabled={![...selected].some(selectable) || actions.queueOpener.isPending} onClick={() => void sendOpener()}>
              {actions.queueOpener.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send opener to {[...selected].filter(selectable).length}
            </Button>
          </div>
        </div>
        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y">
            {shown.map((l) => {
              const stage = salesStageOf(l.status);
              const fu = followUpBucket(l.next_action_date, today);
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                  <Checkbox checked={selected.has(l.id)} disabled={stage !== 'new'} onCheckedChange={() => toggle(l.id)}
                    aria-label={stage === 'new' ? 'Select for the opener' : 'Already contacted'} />
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => navigate(`/sales/lead/${l.id}`)}>
                    <div className="font-medium truncate">{l.business_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[l.search_keyword ?? l.category, l.derived_town ?? l.search_location].filter(Boolean).join(' · ')}
                      {l.next_action_note ? ` · ${l.next_action_note}` : ''}
                    </div>
                  </button>
                  {fu !== 'none' && (
                    <span className={cn('text-xs whitespace-nowrap', fu === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                      {fu === 'overdue' ? 'Overdue' : fu === 'today' ? 'Today' : fmtDay(l.next_action_date)}
                    </span>
                  )}
                  <Badge variant="secondary" className="whitespace-nowrap">{stage === 'other' ? (l.status ?? '—') : SALES_STAGE_LABEL[stage]}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* AVAILABLE LEADS */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold mr-auto">Available leads</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPoolPage(0); setPoolQuery(poolQ.trim()); }}>
            <Input value={poolQ} onChange={(e) => setPoolQ(e.target.value)} placeholder="Business, trade or town" className="h-8 w-56" />
            <Button size="sm" variant="outline" type="submit"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">Never contacted and not assigned to anyone. Claiming one makes it yours — nobody else can then take it.</p>
        {pool.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <ul className="divide-y">
            {(pool.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.business_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.trade, p.town, p.rating ? `${p.rating}★ (${p.review_count ?? 0})` : null, p.website ? 'has website' : 'no website', p.has_phone ? null : 'no phone'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={actions.claim.isPending} onClick={() => void claim(p.id)}>Claim</Button>
              </li>
            ))}
            {(pool.data ?? []).length === 0 && <li className="py-3 text-sm text-muted-foreground">No available leads match.</li>}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={poolPage === 0} onClick={() => setPoolPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" disabled={(pool.data ?? []).length < 50} onClick={() => setPoolPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </Card>

      {/* RECENT ACTIVITY */}
      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Recent activity</h2>
        {(recent.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
          <ul className="space-y-1 text-sm">
            {(recent.data ?? []).map((a) => {
              const lead = all.find((l) => l.id === a.lead_id);
              return (
                <li key={a.id} className="flex gap-2">
                  <span className="text-muted-foreground w-14 shrink-0">{fmtDay(a.created_at)}</span>
                  <span>{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                  {lead && <Link className="text-primary hover:underline truncate" to={`/sales/lead/${lead.id}`}>{lead.business_name}</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
