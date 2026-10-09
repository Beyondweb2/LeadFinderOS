import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MessageSquareText, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';
import { IconTile, EmptyState, LoadState, ErrorState } from '@/components/operator/ui';
import { InboxChannelSwitch } from '@/components/InboxChannelSwitch';
import { LeadSmsPanel } from '@/components/LeadSmsPanel';
import { useSmsMessages, useSmsUnread, type SmsRow } from '@/hooks/useSms';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { outreachLeadLink } from '@/lib/salesLinks';
import { smsDeliveryState, SMS_STATE_LABEL } from '@/lib/smsMessages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* THE SMS TAB OF THE ONE INBOX (2026-10-09). Same shape as the WhatsApp tab: a searchable conversation list with
   unread marks and the last message, and the open conversation on the right (a single column on a phone). One
   conversation = one lead. Texts that matched no lead are not shown here (a rep may only see texts from their own
   leads; an unmatched number is the admin's to place — RLS gives a salesperson only their leads' rows anyway). */
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) === d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
};

interface Conv { leadId: string; name: string; last: SmsRow; unread: number; rows: SmsRow[] }

export function SmsInbox() {
  const navigate = useNavigate();
  const { role } = useSubscription();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const msgs = useSmsMessages();
  const unread = useSmsUnread();
  const activeId = params.get('lead');

  const leadIds = useMemo(() => [...new Set((msgs.data ?? []).map((m) => m.lead_id).filter((x): x is string => !!x))].sort(), [msgs.data]);
  const names = useQuery({
    queryKey: ['sms', 'names', leadIds.length, leadIds[0] ?? '', leadIds[leadIds.length - 1] ?? ''],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const src = leadSourceFor(role);
      const out = new Map<string, string>();
      for (let i = 0; i < leadIds.length; i += 150) {
        const { data, error } = await sb.from(src.table).select('id, business_name').in('id', leadIds.slice(i, i + 150));
        if (error) throw error;
        for (const r of (data ?? []) as Array<{ id: string; business_name: string | null }>) out.set(r.id, r.business_name || 'Unnamed lead');
      }
      return out;
    },
  });

  const convs: Conv[] = useMemo(() => {
    const byLead = new Map<string, SmsRow[]>();
    for (const m of msgs.data ?? []) { if (!m.lead_id) continue; const a = byLead.get(m.lead_id) ?? []; a.push(m); byLead.set(m.lead_id, a); }
    const unreadBy = new Map((unread.data ?? []).map((u) => [u.phone, u.unread_messages]));
    const list: Conv[] = [];
    for (const [leadId, rows] of byLead) {
      const last = rows[rows.length - 1];
      list.push({ leadId, name: names.data?.get(leadId) ?? '…', last, unread: unreadBy.get(last.phone) ?? 0, rows });
    }
    return list.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [msgs.data, unread.data, names.data]);

  const term = q.trim().toLowerCase();
  const shown = term ? convs.filter((c) => c.name.toLowerCase().includes(term) || c.last.phone.includes(term.replace(/\D/g, '') || '§')) : convs;
  const active = convs.find((c) => c.leadId === activeId) ?? null;
  const open = (leadId: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (leadId) n.set('lead', leadId); else n.delete('lead'); return n; });

  return (
    <div className="space-y-4 md:flex md:h-[calc(100dvh-6.5rem)] md:min-h-[560px] md:flex-col md:space-y-2 lg:h-[calc(100dvh-7.5rem)]" data-testid="sms-inbox">
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 md:shrink-0', active && 'hidden md:flex')}>
        <h1 className="flex shrink-0 items-center gap-2.5 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl"><IconTile icon={MessageSquareText} tone="blue" />SMS Inbox</h1>
        <InboxChannelSwitch current="sms" />
      </div>

      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:flex-1 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className={cn('flex min-h-0 min-w-0 flex-col rounded-2xl border border-border/70 bg-card', active && 'hidden md:flex')} aria-label="Conversations">
          <div className="relative border-b border-border/60 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="h-9 pl-8 text-sm" aria-label="Search texts" data-testid="sms-search" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {msgs.isLoading ? <LoadState compact label="Loading texts…" />
              : msgs.isError ? <ErrorState className="py-6" title="Could not load texts." onRetry={() => void msgs.refetch()} />
              : shown.length === 0 ? <EmptyState icon={MessageSquareText} title={term ? 'No match' : 'No texts yet'} className="py-8" testId="sms-empty">{term ? 'Try a different name or number.' : 'Texts you send, and replies to them, appear here.'}</EmptyState>
              : (
                <ul>
                  {shown.map((c) => (
                    <li key={c.leadId}>
                      <button type="button" onClick={() => open(c.leadId)} data-testid="sms-conv" data-unread={c.unread > 0 ? 'true' : 'false'}
                        className={cn('flex w-full items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-left transition hover:bg-muted/50', c.leadId === activeId && 'bg-muted/60')}>
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', c.unread > 0 ? 'bg-blue-500' : 'bg-transparent')} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn('truncate text-sm', c.unread > 0 ? 'font-bold' : 'font-semibold')}>{c.name}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{when(c.last.created_at)}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.last.direction === 'outbound' ? 'You: ' : ''}{c.last.body}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground/80">{SMS_STATE_LABEL[smsDeliveryState(c.rows)]}{c.unread > 0 ? ` · ${c.unread} new` : ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>

        <section className={cn('min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-border/70 bg-card p-3', !active && 'hidden md:block')} aria-label="Conversation">
          {active ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-9 w-9 md:hidden" onClick={() => open(null)} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button>
                <h2 className="min-w-0 flex-1 truncate text-base font-bold">{active.name}</h2>
                <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => navigate(outreachLeadLink(active.leadId))} data-testid="sms-open-lead"><ExternalLink className="h-3.5 w-3.5" />Open lead</Button>
              </div>
              <LeadSmsPanel leadId={active.leadId} height="max-h-[48dvh] md:max-h-[44dvh]" />
            </div>
          ) : (
            <EmptyState icon={MessageSquareText} title="Choose a conversation" className="py-16">Pick a lead on the left to read and reply.</EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
