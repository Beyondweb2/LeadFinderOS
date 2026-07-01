import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// whatsapp_messages isn't in the generated types yet — RLS still enforces access
// (operators read their own; admin reads all incl. Unassigned).
const sb = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Out-of-window reply templates (mirror the edge allowlist). */
export const WA_REPLY_TEMPLATES = [
  { name: 'booking_page_intro', label: 'Booking page intro (claim link)' },
  { name: 'free_website_intro', label: 'Free website intro (claim link)' },
];

export interface WaMessage {
  id: string;
  created_at: string;
  direction: 'inbound' | 'outbound';
  user_id: string | null;
  lead_id: string | null;
  phone: string;
  body: string | null;
  message_type: 'text' | 'template';
  template_name: string | null;
  status: string;
  test_mode: boolean;
  error: string | null;
}

export interface WaConversation {
  key: string;
  phone: string;
  userId: string | null;
  leadId: string | null;
  label: string;
  unassigned: boolean;
  lastMessage: WaMessage;
  lastMessageAt: string;
  lastInboundAt: string | null;
}

export interface LeadLite { id: string; business_name: string; phone: string; country: string | null }

const convKey = (userId: string | null, phone: string) => `${userId ?? 'unassigned'}::${phone}`;

/** Client mirror of the edge toWhatsAppNumber, so a conversation started from a lead
 *  uses the SAME E.164 key the server stores (keeps the thread selected after send). */
export function normalizeWaNumber(raw: string, country?: string | null): string | null {
  let s = (raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '') || null;
  const cc = (country || 'UK').toUpperCase();
  if (s.startsWith('0')) {
    if (cc === 'UK' || cc === 'GB') return '44' + s.slice(1);
    return s.replace(/\D/g, '');
  }
  return s.replace(/\D/g, '') || null;
}

export function windowFor(lastInboundAt: string | null): { open: boolean; hoursLeft: number } {
  if (!lastInboundAt) return { open: false, hoursLeft: 0 };
  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  if (elapsed >= WINDOW_MS) return { open: false, hoursLeft: 0 };
  return { open: true, hoursLeft: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / (60 * 60 * 1000))) };
}

export function useInbox() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const [msgRes, leadRes] = await Promise.all([
      sb.from('whatsapp_messages').select('*').order('created_at', { ascending: true }),
      sb.from('outreach_leads').select('id, business_name, phone, country').not('phone', 'is', null),
    ]);
    setMessages(((msgRes.data ?? []) as WaMessage[]));
    setLeads(((leadRes.data ?? []) as LeadLite[]).filter((l) => (l.phone ?? '').trim()));
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const leadNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of leads) m[l.id] = l.business_name;
    return m;
  }, [leads]);

  // Derive conversations from the message log, grouped by (user_id, phone).
  const conversations = useMemo<WaConversation[]>(() => {
    const groups = new Map<string, WaMessage[]>();
    for (const msg of messages) {
      const k = convKey(msg.user_id, msg.phone);
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(msg);
    }
    const out: WaConversation[] = [];
    for (const [key, msgs] of groups) {
      const last = msgs[msgs.length - 1];
      const lastInbound = [...msgs].reverse().find((m) => m.direction === 'inbound');
      const leadId = msgs.find((m) => m.lead_id)?.lead_id ?? null;
      out.push({
        key,
        phone: last.phone,
        userId: last.user_id,
        leadId,
        label: (leadId && leadNameById[leadId]) || `+${last.phone}`,
        unassigned: last.user_id == null,
        lastMessage: last,
        lastMessageAt: last.created_at,
        lastInboundAt: lastInbound?.created_at ?? null,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messages, leadNameById]);

  const messagesForKey = useCallback(
    (key: string) => messages.filter((m) => convKey(m.user_id, m.phone) === key),
    [messages],
  );

  const send = useCallback(async (args: {
    phone: string; leadId: string | null; country?: string | null; body?: string; templateName?: string;
  }): Promise<{ ok: boolean; simulated?: boolean; error?: string }> => {
    const { data, error } = await sb.functions.invoke('send-whatsapp-message', {
      body: {
        phone: args.phone,
        lead_id: args.leadId,
        country: args.country ?? null,
        body: args.body,
        template_name: args.templateName,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'send_failed' };
    await fetchAll();
    return { ok: true, simulated: data.simulated };
  }, [fetchAll]);

  return { user, messages, leads, conversations, messagesForKey, isLoading, refetch: fetchAll, send };
}
