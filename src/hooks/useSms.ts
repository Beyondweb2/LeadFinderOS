/* SMS data for the screens (2026-10-09): one lead's thread, the Inbox's conversation list, unread counts, and the
   facts "Best way to contact" is decided from. Read-only: every write is the server's (twilio-sms-send / webhook).
   RLS scopes every read — a salesperson only ever receives texts for their assigned, non-client leads; admin all.
   Live: a Realtime channel on sms_messages invalidates these queries (the useInbox pattern), plus a slow poll as
   the safety net (Realtime does not reach every session — the same caveat the WhatsApp inbox records). */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppUnread } from '@/hooks/useWhatsAppUnread';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeadCrmRow, useWrongNumber } from '@/components/LeadCrmPanel';
import { useLeadActivity } from '@/hooks/useSalesCrm';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { fetchCommsStatus } from '@/lib/smsClient';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { reachedInConversation } from '@/lib/leadState';
import { serviceWindowState } from '@/lib/serviceWindow';
import { decideContactRoute, type RouteChannel, type RouteDecision, type RoutePurpose } from '@/lib/contactRouting';
import { smsDeliveryState } from '@/lib/smsMessages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface SmsRow {
  id: string; created_at: string; direction: 'inbound' | 'outbound'; lead_id: string | null; phone: string; body: string;
  status: string; error_code: string | null; segments: number | null; template_key: string | null; link_kind: string | null;
  sent_by_user_id: string | null; test_mode: boolean;
}
const SMS_COLUMNS = 'id, created_at, direction, lead_id, phone, body, status, error_code, segments, template_key, link_kind, sent_by_user_id, test_mode';

export const smsKeys = {
  all: ['sms'] as const,
  thread: (leadId: string) => ['sms', 'thread', leadId] as const,
  list: ['sms', 'list'] as const,
  unread: ['sms', 'unread'] as const,
  status: ['sms', 'comms-status'] as const,
  facts: (leadId: string) => ['sms', 'facts', leadId] as const,
};

/** Subscribes once per mounted screen; any change to an SMS row refreshes the SMS queries. */
export function useSmsRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`sms:${user.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, () => { void qc.invalidateQueries({ queryKey: smsKeys.all }); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, qc]);
}

/** Is SMS / calling set up on the server? (booleans only) */
export function useCommsStatus() {
  return useQuery({ queryKey: smsKeys.status, queryFn: fetchCommsStatus, staleTime: 5 * 60_000, retry: 1 });
}

export function useSmsThread(leadId: string | undefined) {
  useSmsRealtime();
  return useQuery({
    queryKey: smsKeys.thread(leadId ?? ''),
    enabled: !!leadId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await sb.from('sms_messages').select(SMS_COLUMNS).eq('lead_id', leadId).order('created_at', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SmsRow[];
    },
  });
}

/** Every SMS the caller may see, newest last (paginated with the id tiebreaker). */
export function useSmsMessages() {
  useSmsRealtime();
  return useQuery({
    queryKey: smsKeys.list,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { rows } = await fetchAllRows<SmsRow>('SMS inbox', (from, to) =>
        sb.from('sms_messages').select(SMS_COLUMNS).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to));
      return rows;
    },
  });
}

export interface SmsUnread { phone: string; lead_id: string | null; last_inbound_at: string; unread_messages: number }
export function useSmsUnread() {
  return useQuery({
    queryKey: smsKeys.unread,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await sb.rpc('my_sms_unread_counts');
      if (error) throw error;
      return (data ?? []) as SmsUnread[];
    },
  });
}

/** A lead's Contact Method (the route used for it): the Inbox opens the matching channel. null while unknown or when not asked. */
export function useLeadContactMethod(leadId: string | null): string | null {
  const { role } = useSubscription();
  const src = leadSourceFor(role);
  const q = useQuery({
    queryKey: ['sms', 'contact-method', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.from(src.table).select('contact_method').eq('id', leadId).maybeSingle();
      if (error) throw error;
      return ((data as { contact_method?: string | null } | null)?.contact_method ?? null);
    },
  });
  return q.data ?? null;
}

/** One unread number for the whole Inbox: WhatsApp conversations plus SMS conversations (the nav badge reads this). */
export function useAllInboxUnread() {
  const wa = useWhatsAppUnread();
  const sms = useSmsUnread();
  return { ...wa, count: wa.count + (sms.data ?? []).length };
}

export async function markSmsRead(phone: string): Promise<void> {
  await sb.rpc('mark_sms_read', { _phone: phone }).then(() => undefined, () => undefined);
}

/* ── the facts "Best way to contact" is decided from ────────────────────────────────────────────── */
interface LeadContactRow {
  id: string; phone: string | null; country: string | null; email: string | null; status: string | null; line_type: string | null;
  whatsapp_delivery_status: string | null; whatsapp_ever_delivered: boolean | null; business_name: string | null; derived_town: string | null;
}
const FACT_COLUMNS = 'id, phone, country, email, status, line_type, whatsapp_delivery_status, whatsapp_ever_delivered, business_name, derived_town';
const FACT_COLUMNS_SALES = 'id, phone, country, email, status, line_type, whatsapp_delivery_status, business_name, derived_town';

export function useContactDecision(leadId: string, purpose: RoutePurpose, extra?: { failed?: RouteChannel[]; alreadySent?: RouteChannel[] }) {
  const { role } = useSubscription();
  const src = leadSourceFor(role);
  const crm = useLeadCrmRow(leadId);
  const activity = useLeadActivity(leadId);
  const wrong = useWrongNumber(leadId);
  const comms = useCommsStatus();
  const sms = useSmsThread(leadId);
  const row = useQuery({
    queryKey: smsKeys.facts(leadId),
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb.from(src.table).select(role === 'sales' ? FACT_COLUMNS_SALES : FACT_COLUMNS).eq('id', leadId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as LeadContactRow | null;
    },
  });
  const wa = useQuery({
    queryKey: ['sms', 'wa-window', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await sb.from('whatsapp_messages').select('direction, created_at, status').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      return (data ?? []) as Array<{ direction: string; created_at: string; status: string | null }>;
    },
  });
  const decision: RouteDecision | null = useMemo(() => {
    const r = row.data;
    if (!r) return null;
    const lastIn = (wa.data ?? []).find((m) => m.direction === 'inbound')?.created_at ?? null;
    const inboundSms = (sms.data ?? []).some((m) => m.direction === 'inbound');
    const reached = reachedInConversation(activity.data ?? []) !== null;
    const smsState = smsDeliveryState(sms.data ?? []);
    const failed: RouteChannel[] = [...(extra?.failed ?? []), ...(smsState === 'failed' ? ['sms' as const] : [])];
    /* The cold intro text may go only to a lead we have never texted (a real one), never WhatsApped, and never spoken to. */
    const everTexted = (sms.data ?? []).some((m) => m.direction === 'outbound' && !['failed', 'undelivered', 'simulated'].includes(m.status));
    const everWhatsApped = (wa.data ?? []).some((m) => !m.status || !['failed', 'failed_temporary', 'simulated'].includes(m.status));
    const coldTextOpen = !everTexted && !everWhatsApped && !reached && !inboundSms;
    return decideContactRoute({
      phone: r.phone, country: r.country, email: r.email, status: r.status, line_type: r.line_type,
      whatsapp_delivery_status: r.whatsapp_delivery_status, whatsapp_ever_delivered: r.whatsapp_ever_delivered,
      optedOut: r.status === 'opted_out', wrongNumber: wrong.data?.wrong === true,
      whatsappWindowOpen: serviceWindowState(lastIn).open && !!lastIn,
      smsAllowed: reached || inboundSms || !!lastIn || role === 'admin',
      coldTextOpen,
      smsConfigured: comms.data ? comms.data.smsConfigured || comms.data.testMode : undefined,
      voiceConfigured: comms.data ? comms.data.voiceConfigured || comms.data.testMode : undefined,
      failed, alreadySent: extra?.alreadySent,
    }, purpose);
  }, [row.data, wa.data, sms.data, activity.data, wrong.data, comms.data, role, purpose, extra?.failed, extra?.alreadySent]);
  const rowsNow = sms.data ?? [];
  /* What the composer may do: free text needs the conversation gate; the intro text needs the cold rules. */
  const freeTextOpen = (decision?.options.find((o) => o.channel === 'sms')?.available ?? false) && !(decision?.options.find((o) => o.channel === 'sms')?.reason ?? '').startsWith('A UK mobile you have not texted');
  const introOpen = (decision?.options.find((o) => o.channel === 'sms')?.available ?? false) && rowsNow.every((m) => m.direction !== 'outbound' || ['failed', 'undelivered', 'simulated'].includes(m.status));
  return { decision, crm: crm.data, isLoading: row.isLoading, lead: row.data, comms: comms.data, freeTextOpen, introOpen };
}
