import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isPaidLead } from '@/lib/leadPayment';
import { REPORT_LINK_TEMPLATES, leadReportOpenedAt, leadSiteVisitedAt } from '@/lib/templateAttribution';

// whatsapp_messages isn't in the generated types yet — RLS still enforces access
// (operators read their own; admin reads all incl. Unassigned).
const sb = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Out-of-window reply templates (mirror the edge allowlist). */
/* 🔴 THE SENDABLE LIST LIVES IN ONE PLACE: `WHATSAPP_TEMPLATES` (src/types/outreach.ts).
   A second copy stood here as `WA_REPLY_TEMPLATES` until 2026-09-15 and it went stale exactly the
   way this codebase has now recorded six times: templates were registered at Meta, wired in the
   server registry, added to the real list — and the Inbox, reading this copy, never saw them.
   ⛔ MEASURED COST, and it is not hypothetical: `competitor_hook` was approved on 2026-09-14 and
   was UNSENDABLE FROM THE INBOX from that day; `audit_followup`, `explain_offer` and
   `contact_followup` were invisible too. Four templates the server would have sent happily.
   ⛔ DO NOT REINTRODUCE A LIST HERE — not a filtered one, not a re-ordered one, not "just the
   warm ones". If the Inbox should hide a template, the rule belongs beside the list it filters,
   and `scripts/sendable-templates.test.ts` fails the build on a second copy appearing.
   ⚠️ NAMING A PAST MESSAGE IS STILL A DIFFERENT QUESTION and still has its own list: Inbox.tsx's
   TEMPLATE_DISPLAY covers every template this product has ever had, including the five retired
   barber ones whose 71 sent messages must keep rendering as sentences rather than raw slugs. */



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
  /** Engagement, from the same source the campaign card attributes by (templateAttribution.ts):
   *  reportOpenedAt = they opened their report link (after we sent it); siteVisitedAt = they clicked
   *  through to findable.live. Null until it happens; both drive an at-a-glance Inbox pill. */
  reportOpenedAt: string | null;
  siteVisitedAt: string | null;
}

export interface LeadLite { id: string; business_name: string; phone: string; country: string | null; campaign_id: string | null; status: string | null; google_maps_url: string | null; website: string | null; email: string | null; place_id: string | null; category: string | null; search_keyword: string | null; search_location: string | null; address: string | null; amount_paid: number | null; contact_name: string | null; hook_followup_queued_at: string | null }

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
  audits: Array<{ id: string; lead_id: string | null; created_at: string | null; open_count: number | null; first_opened_at: string | null; ai_audit_runs: Array<{ status: string | null }> | null }>;
  /** Sign-up page landings (findable-onboarding's prefill hook) → the SITE pill. */
  pageHits: Array<{ lead_id: string | null; created_at: string }>;
}

/* Key includes the user id (the useCoverage pattern): firing before it resolves would cache the
   result under `undefined` and never be read again under the real id — hence `enabled` below. */
export const inboxQueryKey = (userId: string | null | undefined) => ['inbox', userId ?? null] as const;

/* Stable empties so a loading render doesn't mint new arrays every time (memo inputs stay stable). */
const NO_MESSAGES: WaMessage[] = [];
const NO_LEADS: LeadLite[] = [];
const NO_AUDITS: InboxData['audits'] = [];
const NO_PAGE_HITS: InboxData['pageHits'] = [];

async function fetchInboxData(): Promise<InboxData> {
  const [msgRes, leadRes, reportRes, hitRes] = await Promise.all([
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
    // Per-lead audits + run statuses → the report-ready pill (/a/<auditId>, served live) + the
    // audit_reply guard + the running-audit spinner. Newest-first; RLS scopes to own audits.
    /* ⛔ PAGINATED — truncation here would silently drop the report-ready pill and the audit_reply
       guard for whichever leads fell outside the window. Same id tiebreaker. */
    fetchAllRows<InboxData['audits'][number]>('Inbox (audits)', (from, to) =>
      sb.from('ai_audits').select('id, lead_id, created_at, open_count, first_opened_at, ai_audit_runs(status)')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    /* Sign-up page hits → the SITE pill. The SAME table and the SAME paginated read the campaign
       card uses (id tiebreaker); the SITE_TRACKING_START cutoff is applied in leadSiteVisitedAt. A
       failed read degrades to no pill, never to a wrong one. */
    fetchAllRows<InboxData['pageHits'][number]>('Inbox (page hits)', (from, to) =>
      sb.from('lead_page_hits').select('lead_id, created_at')
        .order('id', { ascending: true }).range(from, to)),
  ]);
  return {
    messages: msgRes.rows,
    leads: leadRes.rows.filter((l) => (l.phone ?? '').trim()),
    audits: reportRes.rows,
    pageHits: hitRes.rows,
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
  const audits = query.data?.audits ?? NO_AUDITS;
  const pageHits = query.data?.pageHits ?? NO_PAGE_HITS;
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

  /* ⛔ ENGAGEMENT, FROM THE SAME SOURCE THE CAMPAIGN CARD USES (templateAttribution.ts) — not a
     second tracking mechanism. AUDIT: the earliest report-link send per lead gates ai_audits'
     first_opened_at, so an operator preview (same URL, same counter) does not light the pill. SITE:
     the earliest lead_page_hit since tracking began. Both keyed by lead, both null until they
     happen; the rules live in the shared leaf so the Inbox and the campaign card cannot diverge. */
  const earliestReportLinkSentByLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const msg of messages) {
      if (msg.direction !== 'outbound' || !msg.lead_id || !msg.template_name || msg.status === 'failed') continue;
      if (!REPORT_LINK_TEMPLATES.has(msg.template_name)) continue;
      const t = new Date(msg.created_at).getTime();
      if (Number.isNaN(t)) continue;
      const cur = m.get(msg.lead_id);
      if (cur == null || t < cur) m.set(msg.lead_id, t);
    }
    return m;
  }, [messages]);

  const reportOpenedAtByLead = useMemo(() => {
    const byLead = new Map<string, Array<{ open_count: number | null; first_opened_at: string | null }>>();
    for (const a of audits) {
      if (!a.lead_id) continue;
      (byLead.get(a.lead_id) ?? byLead.set(a.lead_id, []).get(a.lead_id)!)
        .push({ open_count: a.open_count, first_opened_at: a.first_opened_at });
    }
    const m = new Map<string, string>();
    for (const [leadId, la] of byLead) {
      const opened = leadReportOpenedAt(la, earliestReportLinkSentByLead.get(leadId) ?? null);
      if (opened) m.set(leadId, opened);
    }
    return m;
  }, [audits, earliestReportLinkSentByLead]);

  const siteVisitedAtByLead = useMemo(() => {
    const byLead = new Map<string, string[]>();
    for (const h of pageHits) {
      if (!h.lead_id) continue;
      (byLead.get(h.lead_id) ?? byLead.set(h.lead_id, []).get(h.lead_id)!).push(h.created_at);
    }
    const m = new Map<string, string>();
    for (const [leadId, isos] of byLead) {
      const visited = leadSiteVisitedAt(isos);
      if (visited) m.set(leadId, visited);
    }
    return m;
  }, [pageHits]);

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
        reportOpenedAt: reportOpenedAtByLead.get(leadId) ?? null,
        siteVisitedAt: siteVisitedAtByLead.get(leadId) ?? null,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messages, leadNameById, campaignByLeadId, statusByLeadId, paidLeadIds, ownLeadIds, reportOpenedAtByLead, siteVisitedAtByLead]);

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

  /* ⛔ PREVIEW WHAT WOULD BE SENT — the SAME endpoint, the same guards, nothing sent.
     `mode: "dry_run"` returns the built Meta payload and the transcript body immediately before the
     Graph POST, or the refusal it would have given. It exists because `audit_followup` failed twice
     in front of live prospects with nothing but "Edge Function returned a non-2xx status code"
     (CLAUDE.md §30b), and there was no way to ask the question without spending a message.
     ⚠️ Deliberately does NOT refetch: it changes nothing, so a refetch would only make a read look
     like a write. */
  const preview = useCallback(async (args: {
    phone: string; leadId: string | null; country?: string | null; templateName: string; allowResend?: boolean;
  }): Promise<{ ok: boolean; body?: string; template?: string; fellBack?: string; error?: string; reason?: string }> => {
    const { data, error } = await sb.functions.invoke('send-whatsapp-message', {
      body: {
        mode: 'dry_run',
        phone: args.phone,
        lead_id: args.leadId,
        country: args.country ?? null,
        template_name: args.templateName,
        allow_resend: args.allowResend === true,
      },
    });
    /* ⚠️ A NON-2XX IS THE ANSWER TOO, and saying so is the whole point of this control: before
       today that was all the operator ever saw, with no way to tell a refusal from a crash. */
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'preview_failed', reason: data?.reason };
    /* An old deploy has no dry_run mode and would SEND. It cannot echo this field, so its absence is
       the tell — §4's rule that you assert on something only the target version can produce. */
    if (data?.mode !== 'dry_run') {
      return { ok: false, error: 'preview_unsupported', reason: 'The live function does not have the preview yet — deploy send-whatsapp-message.' };
    }
    return { ok: true, body: data.body ?? '', template: data.template ?? args.templateName, fellBack: data.fell_back };
  }, []);

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

  return { user, messages, leads, conversations, messagesForKey, auditByLeadId, auditRunningLeadIds, isLoading, refetch: fetchAll, send, preview, patchLeadStatus };
}
