/* The admin home's own data (Concept A, 2026-10-26): the facts behind "What needs you" (rpc admin_home_needs), the key
   numbers (rpc admin_home_numbers), and the marks / outcomes / template approvals Paul records. Admin only (the RPCs and
   RLS refuse anyone else). Nothing here sends a message. ⛔ A failed load is an error with retry, never an empty list. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MarkAction, NeedsFacts } from '@/lib/needsMe';
import { DASHBOARD_TEMPLATE_NAMES, type TemplateSend } from '@/lib/dashboardTemplates';

/* The generated types do not know the new RPCs / tables yet (migration 20261127090000). */
const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export interface HomeNumbers {
  days: number;
  funnel: { sent: number; delivered: number; real_replies: number; interested: number; questionnaire: number; reached_payment: number; paid: number };
  health: { rating: string | null; tier: string | null; checked_at: string | null; ok_at: string | null; daily_cap: number | null; min_gap_minutes: number | null; person_daily_limit_default: number | null; paused: boolean | null; sent_today: number; failed_today: number } | null;
  team: { user_id: string; name: string; messages: number }[];
}

export const ADMIN_HOME_NEEDS_KEY = ['admin-home-needs'] as const;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function useAdminHomeNeeds() {
  return useQuery({ queryKey: ADMIN_HOME_NEEDS_KEY, queryFn: () => rpc<NeedsFacts>('admin_home_needs'), staleTime: 60_000 });
}

export function useAdminHomeNumbers(days: number) {
  return useQuery({ queryKey: ['admin-home-numbers', days], queryFn: () => rpc<HomeNumbers>('admin_home_numbers', { p_days: days }), staleTime: 5 * 60_000 });
}

export const DASHBOARD_TEMPLATE_SENDS_KEY = ['dashboard-template-sends'] as const;

/** Each dashboard template's LAST real send (Meta's last answer about it) — what turns its button on or off
 *  (dashboardTemplates.ts dashboardTemplateState). Named columns only; newest first. */
export function useDashboardTemplateSends() {
  return useQuery({
    queryKey: DASHBOARD_TEMPLATE_SENDS_KEY,
    queryFn: async (): Promise<Record<string, TemplateSend>> => {
      const { data, error } = await sb.from('whatsapp_messages')
        .select('template_name, status, error_code, error_title, created_at')
        .eq('direction', 'outbound').in('template_name', DASHBOARD_TEMPLATE_NAMES)
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      const last: Record<string, TemplateSend> = {};
      for (const r of (data ?? []) as (TemplateSend & { template_name: string })[]) if (!last[r.template_name]) last[r.template_name] = r;
      return last;
    },
    staleTime: 60_000,
  });
}

/** Phone / country / contact name for the few paid clients on the list (the handoff list carries none; a send needs the
 *  number). Three columns for a handful of ids — never the lead list. */
export function useClientContacts(ids: readonly string[]) {
  const key = [...ids].sort();
  return useQuery({
    queryKey: ['admin-home-client-contacts', key],
    enabled: key.length > 0,
    queryFn: async (): Promise<Record<string, { phone: string | null; country: string | null; contact_name: string | null }>> => {
      const { data, error } = await sb.from('outreach_leads').select('id, phone, country, contact_name').in('id', key);
      if (error) throw new Error(error.message);
      return Object.fromEntries(((data ?? []) as { id: string; phone: string | null; country: string | null; contact_name: string | null }[]).map((r) => [r.id, r]));
    },
    staleTime: 5 * 60_000,
  });
}

/** Snooze / dismiss / archive, undo, outcomes and template approvals. Each refreshes the list in place. */
export function useAdminHomeActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ADMIN_HOME_NEEDS_KEY });
  const check = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };
  const mark = useMutation({
    mutationFn: async (m: { itemKey: string; action: MarkAction; until?: string | null }) =>
      check(await sb.from('admin_home_marks').insert({ item_key: m.itemKey, action: m.action, until: m.until ?? null })),
    onSuccess: refresh,
  });
  /* Undo never deletes the mark: it is stamped undone, so the history stays. */
  const undo = useMutation({
    mutationFn: async (markId: string) => check(await sb.from('admin_home_marks').update({ undone_at: new Date().toISOString() }).eq('id', markId)),
    onSuccess: refresh,
  });
  const outcome = useMutation({
    mutationFn: async (o: { onboardingId: string; lostReason: string; note?: string }) =>
      check(await sb.from('onboarding_outcomes').upsert({ onboarding_id: o.onboardingId, outcome: 'lost', lost_reason: o.lostReason, note: o.note?.trim() || null }, { onConflict: 'onboarding_id' })),
    onSuccess: refresh,
  });
  const approval = useMutation({
    mutationFn: async (a: { key: string; approved: boolean }) =>
      check(a.approved
        ? await sb.from('dashboard_template_approvals').insert({ template_key: a.key })
        : await sb.from('dashboard_template_approvals').delete().eq('template_key', a.key)),
    onSuccess: refresh,
  });
  return { mark, undo, outcome, approval };
}

/** Snooze choices: three hours, tomorrow 08:00 UK, three days. */
export function snoozeUntil(choice: '3h' | 'tomorrow' | '3d', now = new Date()): string {
  if (choice === '3h') return new Date(now.getTime() + 3 * 3_600_000).toISOString();
  if (choice === '3d') return new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const t = new Date(now.getTime() + 86_400_000);
  return new Date(`${t.toISOString().slice(0, 10)}T08:00:00Z`).toISOString();
}
