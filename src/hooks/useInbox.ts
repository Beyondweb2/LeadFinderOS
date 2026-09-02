import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isPaidLead } from '@/lib/leadPayment';

// whatsapp_messages isn't in the generated types yet — RLS still enforces access
// (operators read their own; admin reads all incl. Unassigned).
const sb = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Out-of-window reply templates (mirror the edge allowlist). */
export const WA_REPLY_TEMPLATES = [
  { name: 'booking_page_intro', label: 'Booking page intro (claim link)' },
  { name: 'no_website_barbers', label: 'Free website intro (claim link)' },
  { name: 'barber_poor_website', label: 'Updated website intro (claim link)' },
  { name: 'booking_switch_barbers', label: 'Booking switch (no commission) (claim link)' },
  { name: 'barber_fresha_booksy', label: 'Fresha/Booksy switch (claim link)' },
  { name: 'initial_contact', label: 'Initial contact (opener)' },
  { name: 'audit_reply', label: 'Audit reply (report + competitors)' },
  { name: 'audit_result_hook', label: 'Audit result hook (outreach)' },
  { name: 'onboarding_followup', label: 'Onboarding follow-up (sign-up link)' },
  { name: 'book_call', label: 'Arrange a call' },
  { name: 're_engage', label: 'Re-engage (gone quiet)' },
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
  /** Campaign of the matched lead (null = no lead / lead in no campaign). */
  campaignId: string | null;
  /** Current outreach status of the matched lead (null = no lead). Drives the
   *  editable status pill + the hide-not_interested behaviour. */
  leadStatus: string | null;
  /** ⛔ A PAYING CUSTOMER, FROM `amount_paid > 0` — NEVER FROM `leadStatus`. The two diverge
   *  (CLAUDE.md §6): a customer moved on to `in_delivery` is still paid. The status filter exempts
   *  a paid conversation so a customer can never be filtered out of the Inbox. */
  isPaid: boolean;
  label: string;
  unassigned: boolean;
  lastMessage: WaMessage;
  lastMessageAt: string;
  lastInboundAt: string | null;
}

export interface LeadLite { id: string; business_name: string; phone: string; country: string | null; campaign_id: string | null; status: string | null; google_maps_url: string | null; website: string | null; email: string | null; place_id: string | null; category: string | null; search_keyword: string | null; search_location: string | null; address: string | null; amount_paid: number | null; contact_name: string | null; hook_followup_queued_at: string | null }

/** Most-recent generated site for a lead — powers the thread's "View site" link and
 *  the engagement pill (opened/claimed/upsell milestones from generated_sites). */
export interface SiteLite { id: string; siteName: string; shareToken: string | null; bookingOnly: boolean; firstOpenedAt: string | null; claimedAt: string | null; addonInterestAt: string | null }

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

/** Everything the Inbox reads, in one fetch — one cache entry, one invalidation target. */
interface InboxData {
  messages: WaMessage[];
  leads: LeadLite[];
  sites: Array<{ id: string; site_name: string; lead_id: string | null; share_token: string | null; booking_only: boolean | null; first_opened_at: string | null; claimed_at: string | null; addon_interest_at: string | null }>;
  audits: Array<{ id: string; lead_id: string | null; ai_audit_runs: Array<{ status: string | null }> | null }>;
}

/* Key includes the user id (the useCoverage pattern): firing before it resolves would cache the
   result under `undefined` and never be read again under the real id — hence `enabled` below. */
export const inboxQueryKey = (userId: string | null | undefined) => ['inbox', userId ?? null] as const;

/* Stable empties so a loading render doesn't mint new arrays every time (memo inputs stay stable). */
const NO_MESSAGES: WaMessage[] = [];
const NO_LEADS: LeadLite[] = [];
const NO_SITES: InboxData['sites'] = [];
const NO_AUDITS: InboxData['audits'] = [];

async function fetchInboxData(): Promise<InboxData> {
  const [msgRes, leadRes, siteRes, reportRes] = await Promise.all([
    /* Paginated, and with the id tiebreaker it never had: 3 groups of rows share a created_at, and
       on a non-unique sort a tied row can be fetched twice and another missed at a page boundary.
       This is the fastest-growing table in the system — every send and every reply. */
    fetchAllRows<WaMessage>('Inbox (messages)', (from, to) =>
      sb.from('whatsapp_messages').select('*')
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    // is_archived = false: an archived lead is one the operator has stopped working, so its thread
    // leaves the Inbox and it also leaves the start-a-conversation picker below. Un-archiving
    // brings the whole thread back — nothing is deleted, and the messages are untouched.
    /* ⛔ PAGINATED, AND THIS ONE LOST A PAYING CUSTOMER. It asked for 1,031 rows (not archived +
       has a phone) and PostgREST silently returned 1,000 — so 31 leads were absent from
       `ownLeadIds`, and the conversation build below drops any thread whose lead is not in it
       (`if (!leadId || !ownLeadIds.has(leadId)) continue`). RG Locksmiths, a paid client with 17
       messages, therefore never became a conversation AT ALL: no filter, no reload and no search
       could bring him back, because he was gone before the list existed.
       ⚠️ AND IT WAS INTERMITTENT, WHICH IS WHY IT LOOKED LIKE A DISPLAY BUG. There was no
       `.order()` either, so WHICH 1,000 came back was arbitrary and shifted as rows were written —
       he was visible one day and gone the next, with nothing having changed about him.
       `.order('id')` is the unique tiebreaker fetchAllRows needs: on a non-unique sort a tied row
       can be fetched twice and another missed at a page boundary — the same reasoning already
       written above the messages read. */
    fetchAllRows<LeadLite>('Inbox (leads)', (from, to) =>
      sb.from('outreach_leads').select('id, business_name, phone, country, campaign_id, status, google_maps_url, website, email, place_id, category, search_keyword, search_location, address, amount_paid, contact_name, hook_followup_queued_at')
        .eq('is_archived', false).not('phone', 'is', null)
        .order('id', { ascending: true }).range(from, to)),
    // share_token / booking_only are not in the generated types yet — untyped sb. RLS
    // scopes rows to the operator. Ordered newest-first so the per-lead pick takes the latest.
    /* ⛔ PAGINATED FOR THE SAME REASON, BEFORE IT BITES. `created_at` is NOT unique here, so `id`
       is the tiebreaker; the newest-first order the per-lead pick relies on stays primary. */
    fetchAllRows<InboxData['sites'][number]>('Inbox (sites)', (from, to) =>
      sb.from('generated_sites').select('id, site_name, lead_id, share_token, booking_only, first_opened_at, claimed_at, addon_interest_at')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    // Per-lead audits + run statuses → the report-ready pill (/a/<auditId>, served live) + the
    // audit_reply guard + the running-audit spinner. Newest-first; RLS scopes to own audits.
    /* ⛔ PAGINATED — truncation here would silently drop the report-ready pill and the audit_reply
       guard for whichever leads fell outside the window. Same id tiebreaker. */
    fetchAllRows<InboxData['audits'][number]>('Inbox (audits)', (from, to) =>
      sb.from('ai_audits').select('id, lead_id, created_at, ai_audit_runs(status)')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
  ]);
  return {
    messages: msgRes.rows,
    leads: leadRes.rows.filter((l) => (l.phone ?? '').trim()),
    sites: siteRes.rows,
    audits: reportRes.rows,
  };
}

export function useInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = inboxQueryKey(user?.id);

  /* ⛔ REACT QUERY, THE SAME WAY useOutreach/useCoverage USE IT (App.tsx defaults:
     refetchOnWindowFocus:false, staleTime 5min). The old shape — useEffect→fetchAll with
     isLoading starting true — refetched EVERYTHING with a full-screen spinner on every visit;
     now a return inside the stale window renders instantly from cache, and a stale return
     renders the cache while refreshing in the background.
     ⚠️ THE STALENESS RISK IS HANDLED BY INVALIDATION, NOT BY SHORT TTLs: send() below and every
     mutating caller in Inbox.tsx (remove-from-inbox, the follow-up sends, starting an audit)
     await refetch/fetchAll, which BYPASSES staleTime — so an action is never followed by a stale
     list. patchLeadStatus keeps its optimistic no-spinner behaviour by patching the CACHE. */
  const query = useQuery({
    queryKey,
    queryFn: fetchInboxData,
    enabled: !!user?.id,
  });

  const messages = query.data?.messages ?? NO_MESSAGES;
  const leads = query.data?.leads ?? NO_LEADS;
  const sites = query.data?.sites ?? NO_SITES;
  const audits = query.data?.audits ?? NO_AUDITS;
  const isLoading = query.isLoading;

  /* Force-refresh: query.refetch always hits the network (staleTime does not apply to an explicit
     refetch). Same contract the old fetchAll gave its callers — awaiting it means the new rows
     are on screen. */
  const { refetch: queryRefetch } = query;
  const fetchAll = useCallback(async () => { await queryRefetch(); }, [queryRefetch]);


  const leadNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of leads) m[l.id] = l.business_name;
    return m;
  }, [leads]);

  const campaignByLeadId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const l of leads) m[l.id] = l.campaign_id ?? null;
    return m;
  }, [leads]);

  const statusByLeadId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const l of leads) m[l.id] = l.status ?? null;
    return m;
  }, [leads]);

  // Per-lead latest COMPLETED audit → its /a/<auditId> report (built live by render-audit-report;
  // no stored report row). Keyed STRICTLY by lead_id (the lead's own audit) — never cross-leaks.
  // Newest-first, so the first audit per lead that has a complete/capped run wins.
  const auditByLeadId = useMemo(() => {
    const m: Record<string, { auditId: string }> = {};
    for (const a of audits) {
      if (!a.lead_id || m[a.lead_id]) continue;
      const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : [];
      if (runs.some((r) => r.status === 'complete' || r.status === 'capped')) m[a.lead_id] = { auditId: a.id };
    }
    return m;
  }, [audits]);

  // Lead ids with an audit run currently IN FLIGHT (pending/running) — drives the Inbox audit
  // button's spinner. Same audits fetch as above; refreshed by refetch() after firing one.
  const auditRunningLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of audits) {
      if (!a.lead_id) continue;
      const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : [];
      if (runs.some((r) => r.status === 'pending' || r.status === 'running')) s.add(a.lead_id);
    }
    return s;
  }, [audits]);

  // Own, UNARCHIVED lead ids. `leads` is fetched with the user-session client, so RLS ("Users
  // can view their own leads") already scopes it to the current user's leads, and the query above
  // excludes archived ones — so the `continue` in `conversations` drops an archived lead's thread
  // through the same path it drops another rep's.
  const ownLeadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);

  /* ⛔ WHO HAS ACTUALLY PAID — built alongside ownLeadIds, off the SAME paginated leads read, which
     already selects amount_paid. Keyed on `amount_paid > 0` and never on the status: `paid` means
     that everywhere (CLAUDE.md §6), and reading `payment_received` instead would drop a customer the
     moment they moved on to `in_delivery` — i.e. the moment work started.
     ⛔ THE ONE STATUS THAT DOES SUBTRACT IS `refunded`, and it is applied by isPaidLead rather than
     tested here, so the Inbox exemption, the funnel and the campaign card drop a refunded customer
     together. A refunded thread stops being exempt from the status filter, which is right: they are
     no longer a paying customer.
     ⚠️ A lead absent from this set is NOT "not paid" by inference — it is simply not in the read.
     That is fine here because the set is derived from the same rows the conversations are, so a lead
     that is missing has no conversation either. */
  const paidLeadIds = useMemo(
    () => new Set(leads.filter((l) => isPaidLead(l)).map((l) => l.id)),
    [leads],
  );

  // Most-recent generated site per lead (sites are ordered newest-first, so the
  // first row seen for a lead_id wins). Drives the thread's "View site" preview link.
  const sitesByLeadId = useMemo(() => {
    const m: Record<string, SiteLite> = {};
    for (const s of sites) {
      if (s.lead_id && !m[s.lead_id]) {
        m[s.lead_id] = { id: s.id, siteName: s.site_name, shareToken: s.share_token ?? null, bookingOnly: !!s.booking_only, firstOpenedAt: s.first_opened_at ?? null, claimedAt: s.claimed_at ?? null, addonInterestAt: s.addon_interest_at ?? null };
      }
    }
    return m;
  }, [sites]);

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
      // Scope to the current user's OWN leads only: skip a thread with no linked
      // lead (Unassigned) or one whose lead this user doesn't own. This keeps the
      // Inbox to leads you own and stops no-op status writes on other reps' leads.
      if (!leadId || !ownLeadIds.has(leadId)) continue;
      out.push({
        key,
        phone: last.phone,
        userId: last.user_id,
        leadId,
        campaignId: leadId ? (campaignByLeadId[leadId] ?? null) : null,
        leadStatus: leadId ? (statusByLeadId[leadId] ?? null) : null,
        isPaid: leadId ? paidLeadIds.has(leadId) : false,
        label: (leadId && leadNameById[leadId]) || `+${last.phone}`,
        unassigned: last.user_id == null,
        lastMessage: last,
        lastMessageAt: last.created_at,
        lastInboundAt: lastInbound?.created_at ?? null,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messages, leadNameById, campaignByLeadId, statusByLeadId, paidLeadIds, ownLeadIds]);

  const messagesForKey = useCallback(
    (key: string) => messages.filter((m) => convKey(m.user_id, m.phone) === key),
    [messages],
  );

  const send = useCallback(async (args: {
    phone: string; leadId: string | null; country?: string | null; body?: string; templateName?: string;
    /** Only true when the operator confirmed a repeat of a pitch this lead already had. The edge
     *  refuses a duplicate pitch by default; this is the deliberate override, never a default. */
    allowResend?: boolean;
  }): Promise<{ ok: boolean; simulated?: boolean; error?: string; reason?: string }> => {
    const { data, error } = await sb.functions.invoke('send-whatsapp-message', {
      body: {
        phone: args.phone,
        lead_id: args.leadId,
        country: args.country ?? null,
        body: args.body,
        template_name: args.templateName,
        allow_resend: args.allowResend === true,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'send_failed', reason: data?.reason };
    await fetchAll();
    return { ok: true, simulated: data.simulated };
  }, [fetchAll]);

  // Optimistic single-lead status patch — updates local `leads` state so the derived
  // `conversations`/`list` recompute (leadStatus + hide filters) WITHOUT a full
  // re-query. Mirrors Outreach's single-row setLeads; avoids the isLoading spinner.
  /* Optimistic, no spinner — patches the QUERY CACHE (the only source of `leads` now), so the
     derived conversations/list recompute exactly as when this patched useState. The DB write
     happens at the call site; the next real refetch reconciles against the DB truth. */
  const patchLeadStatus = useCallback((leadId: string, status: string) =>
    queryClient.setQueryData<InboxData>(queryKey, (prev) =>
      prev ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, status } : l)) } : prev),
    [queryClient, queryKey]);

  return { user, messages, leads, conversations, messagesForKey, sitesByLeadId, auditByLeadId, auditRunningLeadIds, isLoading, refetch: fetchAll, send, patchLeadStatus };
}
