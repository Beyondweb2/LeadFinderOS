import { useCallback, useEffect, useMemo } from 'react';
import { groupInboxMessages, mergeInboxMessages, optionalInboxRows, patchInboxLead } from '@/lib/inboxCache';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isPaidLead } from '@/lib/leadPayment';
import { REPORT_LINK_TEMPLATES, leadReportOpenedAt, leadSiteVisitedAt } from '@/lib/templateAttribution';
import { resolveSiteFault } from '@/lib/crawlCheck';
import type { CrawlStoredResult } from '@/lib/crawlResult';

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
  message_type: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'sticker';
  media_path?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
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
  /** ⛔ JUDGED ON GEMINI ALONE — the engine pages move (Paul, 2026-09-16). named/answers on the
   *  lead's newest audit that returned Gemini answers. Null when Gemini never ran. A lead strong on
   *  ChatGPT but absent on Gemini reads 0 here and does NOT flag — it is still worth contacting.
   *  The pill fires at >= 2/3 (Inbox), a look-before-you-send signal, never an automatic skip. */
  geminiNamed: number | null;
  geminiAnswers: number | null;
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
  audits: Array<{ id: string; short_code: string | null; lead_id: string | null; created_at: string | null; open_count: number | null; first_opened_at: string | null; ai_audit_runs: Array<{ status: string | null; run_number: number | null; created_at: string | null; crawl_check: (CrawlStoredResult & { status?: string }) | null }> | null }>;
  /** Sign-up page landings (findable-onboarding's prefill hook) → the SITE pill. */
  pageHits: Array<{ lead_id: string | null; created_at: string }>;
  /** Per-audit Gemini named/answers, from the audit_gemini_signal view (aggregated server-side so the
   *  Inbox never ships 6k+ result blobs). Drives the "Gemini X/Y" flag — judged on Gemini alone,
   *  the engine pages move, per Paul 2026-09-16. */
  geminiSignals: Array<{ audit_id: string; lead_id: string | null; gemini_answers: number; gemini_named: number }>;
  /** Per-lead stored crawl checks (result blob + when) → whether the site has a nameable fault (which
   *  gates the audit_followup_fault template) AND the stored result the Crawl-site popup shows.
   *  Newest per lead wins in the hook. */
  crawlChecks: Array<{ lead_id: string | null; result: CrawlStoredResult | null; created_at: string }>;
}

/* Key includes the user id (the useCoverage pattern): firing before it resolves would cache the
   result under `undefined` and never be read again under the real id — hence `enabled` below. */
export const inboxQueryKey = (userId: string | null | undefined) => ['inbox', userId ?? null] as const;

/* Stable empties so a loading render doesn't mint new arrays every time (memo inputs stay stable). */
const NO_MESSAGES: WaMessage[] = [];
const NO_LEADS: LeadLite[] = [];
const NO_AUDITS: InboxData['audits'] = [];
const NO_PAGE_HITS: InboxData['pageHits'] = [];
const NO_GEMINI: InboxData['geminiSignals'] = [];
const NO_CRAWL: InboxData['crawlChecks'] = [];

async function fetchInboxData(previous?: InboxData, essentialOnly = false): Promise<InboxData> {
  const [msgRes, leadRes, reportRes, hitRes, gemRes, crawlRes] = await Promise.all([
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
    essentialOnly ? { rows: previous?.audits ?? NO_AUDITS } : optionalInboxRows<InboxData['audits'][number]>(fetchAllRows<InboxData['audits'][number]>('Inbox (audits)', (from, to) =>
      sb.from('ai_audits').select('id, short_code, lead_id, created_at, open_count, first_opened_at, ai_audit_runs(status, run_number, created_at, crawl_check:results->crawl_check)')
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to))),
    /* Sign-up page hits → the SITE pill. The SAME table and the SAME paginated read the campaign
       card uses (id tiebreaker); the SITE_TRACKING_START cutoff is applied in leadSiteVisitedAt. A
       failed read degrades to no pill, never to a wrong one. */
    essentialOnly ? { rows: previous?.pageHits ?? NO_PAGE_HITS } : optionalInboxRows<InboxData['pageHits'][number]>(fetchAllRows<InboxData['pageHits'][number]>('Inbox (page hits)', (from, to) =>
      sb.from('lead_page_hits').select('lead_id, created_at')
        .order('id', { ascending: true }).range(from, to))),
    /* Per-audit Gemini named/answers → the "Gemini X/Y" flag. Reads the audit_gemini_signal VIEW
       (security_invoker, so the operator's own-row RLS on ai_audit_queue still applies) rather than
       the 6.7k result blobs behind it: the DB does the count, the Inbox gets two ints per audit.
       audit_id is unique → the pagination tiebreaker. A failed read degrades to no pill. */
    essentialOnly ? { rows: previous?.geminiSignals ?? NO_GEMINI } : optionalInboxRows<InboxData['geminiSignals'][number]>(fetchAllRows<InboxData['geminiSignals'][number]>('Inbox (gemini signal)', (from, to) =>
      sb.from('audit_gemini_signal').select('audit_id, lead_id, gemini_answers, gemini_named')
        .order('audit_id', { ascending: true }).range(from, to))),
    /* Stored crawl checks → whether a lead's site has a nameable fault, which gates the
       audit_followup_fault template in the picker (its {{6}} names one and Meta rejects an empty
       parameter). Paginated with the id tiebreaker; newest-per-lead is chosen in the hook. A failed
       read degrades to "no fault known", which simply keeps that template gated off — the safe way. */
    essentialOnly ? { rows: previous?.crawlChecks ?? NO_CRAWL } : optionalInboxRows<InboxData['crawlChecks'][number]>(fetchAllRows<InboxData['crawlChecks'][number]>('Inbox (crawl checks)', (from, to) =>
      sb.from('lead_crawl_checks').select('lead_id, result, created_at')
        .order('id', { ascending: true }).range(from, to))),
  ]);
  return {
    messages: msgRes.rows,
    leads: leadRes.rows.filter((l) => (l.phone ?? '').trim()),
    audits: reportRes?.rows ?? previous?.audits ?? NO_AUDITS,
    pageHits: hitRes?.rows ?? previous?.pageHits ?? NO_PAGE_HITS,
    geminiSignals: gemRes?.rows ?? previous?.geminiSignals ?? NO_GEMINI,
    crawlChecks: crawlRes?.rows ?? previous?.crawlChecks ?? NO_CRAWL,
  };
}

export function useInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => inboxQueryKey(user?.id), [user?.id]);

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
    queryFn: () => fetchInboxData(queryClient.getQueryData<InboxData>(queryKey)),
    enabled: !!user?.id,
  });

  const reconcile = useCallback(async () => {
    const fresh = await fetchInboxData(queryClient.getQueryData<InboxData>(queryKey), true);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? { ...current, messages: mergeInboxMessages(current.messages, fresh.messages), leads: fresh.leads }
      : fresh);
  }, [queryClient, queryKey]);

  /* Subscription only patches cache. It never calls the six-read loader on connect. */
  useEffect(() => {
    if (!user?.id) return;
    const channel = (supabase as any).channel(`inbox:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, (payload: any) => {
        const row = (payload.new ?? payload.old) as WaMessage | undefined;
        if (!row?.id) return;
        queryClient.setQueryData<InboxData>(queryKey, (current) => {
          if (!current) return current;
          return { ...current, messages: mergeInboxMessages(current.messages, [row]) };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'outreach_leads' }, (payload: any) => {
        const row = payload.new as LeadLite & { is_archived?: boolean } | undefined;
        if (!row?.id) return;
        queryClient.setQueryData<InboxData>(queryKey, (current) => current
          ? { ...current, leads: patchInboxLead(current.leads, row) } : current);
      })
      // Crawl completion is written by the background audit queue, not by either of the rows
      // above. Invalidate the complete Inbox snapshot so the fault-template gate and crawl icon
      // update as soon as the persisted crawl/run result arrives.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_crawl_checks' }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_audit_runs' }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') void reconcile();
      });
    const onFocus = () => { if (document.visibilityState === 'visible') void reconcile(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void (supabase as any).removeChannel(channel);
    };
  }, [user?.id, queryClient, queryKey, reconcile]);

  const messages = query.data?.messages ?? NO_MESSAGES;
  const leads = query.data?.leads ?? NO_LEADS;
  const audits = query.data?.audits ?? NO_AUDITS;
  const pageHits = query.data?.pageHits ?? NO_PAGE_HITS;
  const geminiSignals = query.data?.geminiSignals ?? NO_GEMINI;
  const crawlChecks = query.data?.crawlChecks ?? NO_CRAWL;
  const isLoading = query.isLoading;
  const isError = query.isError;

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
    const m: Record<string, { auditId: string; shortCode: string | null }> = {};
    for (const a of audits) {
      if (!a.lead_id || m[a.lead_id]) continue;
      const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : [];
      if (runs.some((r) => r.status === 'complete' || r.status === 'capped')) m[a.lead_id] = { auditId: a.id, shortCode: a.short_code ?? null };
    }
    return m;
  }, [audits]);

  /* Lead ids whose site has a NAMEABLE fault — the picker gate for audit_followup_fault (its {{6}}
     names one; Meta rejects an empty parameter). Newest crawl check per lead, and the SAME freshness
     + version rule render-audit-report and the sender apply (30 days, v2+): a stale or pre-v2 check
     can carry a false finding. Absent / clean / unreachable → not in the set → the template stays
     gated off, which is the safe direction. */
  /* Newest crawl row per lead → the Crawl-site button's whole state (run/not-run, and the popup's
     stored result), keyed by lead. The button and the audit_followup_fault gate below read the SAME
     rows, so what the button shows and what the template offers can never disagree. */
  const crawlByLeadId = useMemo(() => {
    const m = new Map<string, InboxData['crawlChecks'][number]>();
    for (const c of crawlChecks) {
      if (!c.lead_id) continue;
      const prev = m.get(c.lead_id);
      if (!prev || new Date(c.created_at).getTime() > new Date(prev.created_at).getTime()) m.set(c.lead_id, c);
    }
    // A lead-level cache write is best-effort. When an audit has its own completed crawl but that
    // cache row is absent, surface the exact run result in the same icon/modal instead of showing
    // a false “not checked” state.
    for (const audit of audits) {
      if (!audit.lead_id || m.has(audit.lead_id)) continue;
      const run = (audit.ai_audit_runs ?? [])
        .filter((r) => (r.status === 'complete' || r.status === 'capped') && r.crawl_check?.status === 'complete')
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))[0];
      if (run?.crawl_check?.signals) {
        m.set(audit.lead_id, {
          lead_id: audit.lead_id,
          result: run.crawl_check,
          created_at: run.crawl_check.checked_at ?? run.created_at ?? audit.created_at ?? new Date(0).toISOString(),
        });
      }
    }
    return m;
  }, [crawlChecks, audits]);

  /* Lead ids audit_followup_fault's {{6}} has a line for — the picker gate. siteFaultLine is the SAME
     rule the sender (audit-reply.ts) applies, so what the picker offers and what the send builds
     agree: a lead with NO WEBSITE gets the no-website line; a lead with a website gets its crawl fault
     (fresh + v2); a lead with a website and no fault is left out. Iterates LEADS (not just crawl rows)
     so a no-website lead with no crawl still qualifies. */
  const hasSiteFaultLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      const hasWebsite = !!(l.website ?? '').trim();
      const c = crawlByLeadId.get(l.id);
      const audit = audits.find((a) => a.lead_id === l.id && (a.ai_audit_runs ?? []).some((r) => r.status === 'complete' || r.status === 'capped'));
      const runSources = (audit?.ai_audit_runs ?? [])
        .filter((r) => r.status === 'complete' || r.status === 'capped')
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
        .map((r) => ({ result: r.crawl_check, createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0, complete: r.crawl_check?.status === 'complete' }));
      if (resolveSiteFault(hasWebsite, runSources, c ? { result: c.result, createdAtMs: new Date(c.created_at).getTime() } : null) !== null) s.add(l.id);
    }
    return s;
  }, [leads, audits, crawlByLeadId]);

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

  /* Per-lead Gemini named/answers, from the lead's NEWEST audit that returned Gemini answers.
     `audits` is already sorted newest-first, so the first audit per lead with a Gemini signal wins —
     the same "newest audit" the report and the pitch resolve to. Keyed by lead_id, own audits only. */
  const geminiByLead = useMemo(() => {
    const byAudit = new Map<string, { named: number; answers: number }>();
    for (const s of geminiSignals) {
      byAudit.set(s.audit_id, { named: Number(s.gemini_named ?? 0), answers: Number(s.gemini_answers ?? 0) });
    }
    const m = new Map<string, { named: number; answers: number }>();
    for (const a of audits) {
      if (!a.lead_id || m.has(a.lead_id)) continue;
      const sig = byAudit.get(a.id);
      if (sig && sig.answers > 0) m.set(a.lead_id, sig);
    }
    return m;
  }, [audits, geminiSignals]);

  // Derive conversations from the message log, grouped by (user_id, phone).
  const messagesByConversation = useMemo(() => groupInboxMessages<WaMessage>(messages), [messages]);

  const conversations = useMemo<WaConversation[]>(() => {
    const groups = messagesByConversation;
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
        geminiNamed: geminiByLead.get(leadId)?.named ?? null,
        geminiAnswers: geminiByLead.get(leadId)?.answers ?? null,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messagesByConversation, leadNameById, campaignByLeadId, statusByLeadId, paidLeadIds, ownLeadIds, reportOpenedAtByLead, siteVisitedAtByLead, geminiByLead]);

  const messagesForKey = useCallback(
    (key: string) => messagesByConversation.get(key) ?? NO_MESSAGES,
    [messagesByConversation],
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
    if (data.message?.id) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, messages: mergeInboxMessages(current.messages, [data.message as WaMessage]) } : current);
    }
    return { ok: true, simulated: data.simulated };
  }, [queryClient, queryKey]);

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

  return { user, messages, leads, conversations, messagesForKey, auditByLeadId, auditRunningLeadIds, hasSiteFaultLeadIds, crawlByLeadId, isLoading, isError, refetch: fetchAll, send, preview, patchLeadStatus };
}
