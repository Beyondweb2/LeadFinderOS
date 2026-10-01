import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_CHANGED_EVENT } from '@/lib/leadSync';
import { whatsAppLinkForLead } from '@/lib/conversationState';
import { cn } from '@/lib/utils';

/* ══ THE LATEST WHATSAPP MESSAGES, IN THE LEAD POPUP (moved from Focus Mode, 2026-10-01) ═══════════
   The last few messages with this lead, read-only, so a call can be made knowing what was said. The
   full thread (and replying) stays in the Inbox. RLS decides what a salesperson may read. Nothing is
   drawn for a lead with no messages. */
// whatsapp_messages columns used here are stable; the generated types are not relied on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
export const RECENT_WHATSAPP_COUNT = 6;
interface Msg { id: string; direction: 'inbound' | 'outbound'; body: string | null; message_type: string; created_at: string; status: string | null }

export function RecentWhatsApp({ leadId }: { leadId: string }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['lead-recent-whatsapp', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async (): Promise<Msg[]> => {
      const { data, error } = await sb.from('whatsapp_messages').select('id, direction, body, message_type, created_at, status')
        .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(RECENT_WHATSAPP_COUNT);
      if (error) throw error;
      return ((data ?? []) as Msg[]).reverse();
    },
  });
  useEffect(() => {
    const re = (e: Event) => { if ((e as CustomEvent<{ leadId?: string }>).detail?.leadId === leadId) void q.refetch(); };
    window.addEventListener(LEAD_CHANGED_EVENT, re);
    return () => window.removeEventListener(LEAD_CHANGED_EVENT, re);
  }, [leadId, q]);
  const msgs = q.data ?? [];
  if (q.isLoading || msgs.length === 0) return null;
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm" data-testid="recent-whatsapp">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/70"><MessageCircle className="h-3.5 w-3.5 text-blue-500" />Latest WhatsApp</span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(whatsAppLinkForLead(leadId))}>Open thread<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </div>
      <ul className="space-y-1.5">
        {msgs.map((m) => (
          <li key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
            <span className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm', m.direction === 'outbound' ? 'bg-blue-500/15' : 'bg-muted')}>
              {m.body ? (m.body.length > 280 ? `${m.body.slice(0, 280)}…` : m.body) : `[${m.message_type}]`}
              <span className="mt-0.5 block text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}{m.status === 'failed' ? ' · failed' : ''}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
