import { useCallback, useEffect, useMemo, useRef } from 'react';
import { conversationLeadId, groupInboxMessages, mergeInboxMessages, mergeReconciledLeads, optionalInboxRows, patchInboxLead, upsertAuditById } from '@/lib/inboxCache';
import { newestUsableAudit, resolveReportsByLead } from '@/lib/auditReportResolver';
import { RUN_USABLE } from '@/lib/queueAuditStatus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isPaidLead } from '@/lib/leadPayment';
import { REPORT_LINK_TEMPLATES, leadReportOpenedAt, leadSiteVisitedAt } from '@/lib/templateAttribution';
import { auditShowsVisibilityGap, resolveSiteFault } from '@/lib/crawlCheck';
import { hasSiteFindings } from '@/lib/siteFindings';
import type { CrawlStoredResult } from '@/lib/crawlResult';
import type { WhatsAppTemplateSnapshot } from '@/lib/whatsappTemplateSnapshot';
import { serviceWindowState } from '@/lib/serviceWindow';

// whatsapp_messages isn't in the generated types yet — RLS still enforces access
// (operators read their own; admin reads all incl. Unassigned).
const sb = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };


/* The report-ready audit read is an Inbox enhancement, but it is also the source for the
 * audit-template gate. Keep the richer projection (crawl + visibility summary) and fall back to
 * the historically working projection if a deployed PostgREST schema rejects one of the optional
 * JSON projections. Without this fallback optionalInboxRows turns the error into an empty list,
 * making completed reports look missing and disabling every audit template. */
/* audit_purpose (+ the three legacy columns auditKind.ts falls back to for pre-2026-09-12 rows)
 * are what resolveLeadReportAudit/resolveReportsByLead need to exclude a Full Measurement / day-28
 * replay from ever being resolved as "the report" — without them auditKind() cannot tell one from
 * an ordinary audit and the resolver would (wrongly) treat every purpose as Inbox-eligible. */
const AUDIT_SELECT = 'id, short_code, lead_id, created_at, open_count, first_opened_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(status, run_number, created_at, mention_rate, audit_summary:results->summary, crawl_check:results->crawl_check)';
const AUDIT_SELECT_FALLBACK = 'id, short_code, lead_id, created_at, open_count, first_opened_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(status, run_number, created_at, crawl_check:results->crawl_check)';

async function fetchInboxAudits(from: number, to: number) {
  const rich = await sb.from('ai_audits').select(AUDIT_SELECT)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
  if (!rich.error) return rich;
  console.warn('Inbox (audits): rich projection failed; retrying report-ready projection', rich.error);
  return sb.from('ai_audits').select(AUDIT_SELECT_FALLBACK)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
}

/** One audit row, freshly read by id — the SMALL targeted fetch a single `ai_audits`/`ai_audit_runs`
 *  realtime event triggers, instead of re-running the whole paginated audits read. Falls back the
 *  same way fetchInboxAudits does if the rich projection is rejected. */
async function fetchOneInboxAudit(auditId: string): Promise<InboxData['audits'][number] | null> {
  const rich = await sb.from('ai_audits').select(AUDIT_SELECT).eq('id', auditId).maybeSingle();
  if (!rich.error) return rich.data ?? null;
  const fallback = await sb.from('ai_audits').select(AUDIT_SELECT_FALLBACK).eq('id', auditId).maybeSingle();
  return fallback.error ? null : (fallback.data ?? null);
}

/** Same columns `fetchInboxData`'s leads read selects, minus the `WHERE` filter — reused by the
 *  targeted single-lead refresh below so the two never drift apart. */
const LEAD_COLUMNS = 'id, business_name, phone, country, campaign_id, status, google_maps_url, website, email, place_id, category, search_keyword, search_location, address, amount_paid, contact_name, hook_followup_queued_at, is_potential_work';

/** One lead row, freshly read by id — used to close the gap between an inbound reply's message
 *  (visible the instant its realtime INSERT lands) and its status flip to 'replied' (a second,
 *  sequential DB write in whatsapp-inbound.ts). Includes `is_archived` so patchInboxLead's own rule
 *  applies exactly as it does to the `outreach_leads` UPDATE subscription. */
async function fetchOneInboxLead(leadId: string): Promise<(LeadLite & { is_archived?: boolean }) | null> {
  const { data, error } = await sb.from('outreach_leads').select(`${LEAD_COLUMNS}, is_archived`).eq('id', leadId).maybeSingle();
  return error ? null : (data ?? null);
}

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
  template_snapshot?: WhatsAppTemplateSnapshot | null;
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
  /** Interested is a separate operator marker, persisted as is_potential_work. */
  isPotentialWork: boolean;
}

export interface LeadLite { id: string; business_name: string; phone: string; country: string | null; campaign_id: string | null; status: string | null; google_maps_url: string | null; website: string | null; email: string | null; place_id: string | null; category: string | null; search_keyword: string | null; search_location: string | null; address: string | null; amount_paid: number | null; contact_name: string | null; hook_followup_queued_at: string | null; is_potential_work: boolean | null }

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

/* The rule lives in src/lib/serviceWindow.ts (shared with the warm-reply drafter). */
export function windowFor(lastInboundAt: string | null): { open: boolean; hoursLeft: number } {
  const w = serviceWindowState(lastInboundAt);
  return { open: w.open, hoursLeft: w.hoursLeft };
}

/** Everything the Inbox reads, in one fetch — one cache entry, one invalidation target. */
interface InboxData {
  messages: WaMessage[];
  leads: LeadLite[];
  audits: Array<{ id: string; short_code: string | null; lead_id: string | null; created_at: string | null; open_count: number | null; first_opened_at: string | null; audit_purpose?: string | null; baseline_target_runs?: number | null; is_measurement?: boolean | null; baseline_contract?: unknown; ai_audit_runs: Array<{ status: string | null; run_number: number | null; created_at: string | null; mention_rate: number | null; audit_summary: { mention_rate?: number | null } | null; crawl_check: (CrawlStoredResult & { status?: string }) | null }> | null }>;
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
      sb.from('outreach_leads').select(LEAD_COLUMNS)
        .eq('is_archived', false).not('phone', 'is', null)
        .order('id', { ascending: true }).range(from, to)),
    // Per-lead audits + run statuses → the report-ready pill (/a/<auditId>, served live) + the
    // audit_reply guard + the running-audit spinner. Newest-first; RLS scopes to own audits.
    /* ⛔ PAGINATED — truncation here would silently drop the report-ready pill and the audit_reply
       guard for whichever leads fell outside the window. Same id tiebreaker. */
    /* ⛔ NEVER essentialOnly-skipped, unlike the three reads below. A missed `ai_audit_runs`/
       `ai_audits` realtime event (a backgrounded tab's websocket drops and reconnects; Realtime
       does not replay what it missed) is exactly how "the report only shows up after a manual
       refresh" recurs after an audit-logic change shifts completion timing. Focus/reconnect
       reconciliation is the stated safety net for that gap (CLAUDE.md architecture rule), so it
       must actually refresh audits rather than reusing the possibly-stale `previous` copy. */
    optionalInboxRows<InboxData['audits'][number]>(fetchAllRows<InboxData['audits'][number]>('Inbox (audits)', fetchInboxAudits)),
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

  /* A local status/flag patch (patchLeadStatus, patchLeadPotentialWork) is optimistic — applied
     before the write is confirmed by anything else. It stays HERE, keyed by lead id, until an
     authoritative `outreach_leads` row is actually observed for that lead (the realtime UPDATE
     subscription below, or the targeted single-lead fetch after an inbound reply) — at which point
     that row is simply trusted and the entry clears. `reconcile()`'s own leads read is a stale
     snapshot the moment a focus/reconnect event fires it, so it must never win against an entry
     still pending here (mergeReconciledLeads applies exactly that precedence). A ref, not query-
     cache state: it is ephemeral per-session bookkeeping, not data Inbox renders directly. */
  const pendingLeadPatchesRef = useRef(new Map<string, Partial<LeadLite>>());

  const reconcile = useCallback(async () => {
    const fresh = await fetchInboxData(queryClient.getQueryData<InboxData>(queryKey), true);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? {
          ...current,
          messages: mergeInboxMessages(current.messages, fresh.messages),
          leads: mergeReconciledLeads(fresh.leads, pendingLeadPatchesRef.current),
          audits: fresh.audits,
        }
      : fresh);
  }, [queryClient, queryKey]);

  /* One audit id → a small single-row fetch → an idempotent patch of just that row. The targeted
     reaction to every event that can make a report newly usable, instead of invalidating (and
     re-fetching) the whole Inbox for one audit finishing. Safe to call twice for the same id (a
     duplicate/replayed event): upsertAuditById replaces the same row with the same fresh data. */
  const patchOneAudit = useCallback(async (auditId: string | undefined | null) => {
    if (!auditId) return;
    const fresh = await fetchOneInboxAudit(auditId);
    if (!fresh) return;
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? { ...current, audits: upsertAuditById(current.audits, fresh) } : current);
  }, [queryClient, queryKey]);

  /* One lead id → a small single-row fetch → patched the same way the `outreach_leads` UPDATE
     subscription patches one (same patchInboxLead rule, same "authoritative row observed" meaning
     for pendingLeadPatchesRef). Used right after an inbound reply's message realtime event lands,
     to close the gap before whatsapp-inbound.ts's own status-flip UPDATE broadcasts. */
  const patchOneLead = useCallback(async (leadId: string | undefined | null) => {
    if (!leadId) return;
    const fresh = await fetchOneInboxLead(leadId);
    if (!fresh) return;
    pendingLeadPatchesRef.current.delete(leadId);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? { ...current, leads: patchInboxLead(current.leads, fresh) } : current);
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
        /* whatsapp-inbound.ts's status flip to 'replied' is a SECOND, sequential DB write that
           lands moments after this message insert — by the time this realtime event reaches the
           browser the server has almost always already made it. Refresh just this one lead rather
           than waiting on its own separate UPDATE broadcast, so the pill does not visibly sit on
           'queued' next to a reply that already rendered. Never done for an outbound send (no
           status changes then) or a lead-less thread. */
        if (payload.eventType === 'INSERT' && row.direction === 'inbound' && row.lead_id) {
          void patchOneLead(row.lead_id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'outreach_leads' }, (payload: any) => {
        const row = payload.new as LeadLite & { is_archived?: boolean } | undefined;
        if (!row?.id) return;
        // The authoritative row has arrived — any optimistic guess for this lead is moot now.
        pendingLeadPatchesRef.current.delete(row.id);
        queryClient.setQueryData<InboxData>(queryKey, (current) => current
          ? { ...current, leads: patchInboxLead(current.leads, row) } : current);
      })
      // Crawl completion is written by the background audit queue, not by either of the rows
      // above. Invalidate the complete Inbox snapshot so the fault-template gate and crawl icon
      // update as soon as the persisted crawl/run result arrives.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_crawl_checks' }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      /* THE AUTHORITATIVE REPORT-AVAILABILITY EVENTS. A report can become newly usable four ways:
         a brand-new audit row arrives (ai_audits INSERT — short_code is trigger-set at insert, so
         nothing else needs to happen for it to be resolvable the instant a run on it settles), an
         existing audit's own columns change (ai_audits UPDATE), a run is inserted already-settled
         (ai_audit_runs INSERT — defensive: the ordinary path inserts pending/running and flips it
         later, but nothing here should assume that stays true), or an existing run settles
         (ai_audit_runs UPDATE — the ordinary finalisation path, `process-ai-audit-queue`'s pending/
         running → processing → complete/capped/failed flip). Each does the SAME small thing: fetch
         that one audit row, patch it into the cache. Nothing here inspects hook stop_reason, run
         count or purpose — resolveReportsByLead/resolveLeadReportAudit do that, downstream, from
         whatever this patches in. */
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_audits' }, (payload: any) => {
        void patchOneAudit(payload.new?.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_audits' }, (payload: any) => {
        void patchOneAudit(payload.new?.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_audit_runs' }, (payload: any) => {
        void patchOneAudit(payload.new?.audit_id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_audit_runs' }, (payload: any) => {
        void patchOneAudit(payload.new?.audit_id);
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
  }, [user?.id, queryClient, queryKey, reconcile, patchOneAudit, patchOneLead]);

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

  const potentialWorkByLeadId = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const l of leads) m[l.id] = !!l.is_potential_work;
    return m;
  }, [leads]);

  // Per-lead current usable report → its /a/<auditId> report (built live by render-audit-report;
  // no stored report row). Keyed STRICTLY by lead_id (the lead's own audit) — never cross-leaks.
  // THE resolver (auditReportResolver.ts): newest eligible usable audit, falling through to an
  // older completed one when the newest hasn't settled — see that file for the full rule.
  const auditByLeadId = useMemo(() => resolveReportsByLead(audits), [audits]);

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
        .filter((r) => RUN_USABLE.has(String(r.status)) && r.crawl_check?.status === 'complete')
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
      // Deliberately NOT resolveLeadReportAudit — a measurement's crawl result is still real site
      // data even though its report link must never be shown (see newestUsableAudit's own doc).
      const audit = newestUsableAudit(audits, l.id);
      const runSources = (audit?.ai_audit_runs ?? [])
        .filter((r) => RUN_USABLE.has(String(r.status)))
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
        .map((r) => ({ result: r.crawl_check, createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0, complete: r.crawl_check?.status === 'complete' }));
      const visibilityGap = auditShowsVisibilityGap(audit?.ai_audit_runs ?? []);
      if (resolveSiteFault(hasWebsite, runSources, c ? { result: c.result, createdAtMs: new Date(c.created_at).getTime() } : null, visibilityGap) !== null) s.add(l.id);
    }
    return s;
  }, [leads, audits, crawlByLeadId]);

  /* Lead ids ai_site_findings_v2's {{6}} has findings for — its own picker gate, and DELIBERATELY A
     SECOND SET rather than a reuse of the one above: hasSiteFindings refuses a lead with no website,
     which audit_followup_fault accepts. A clean site qualifies (the clean-site {{6}}) only with the
     SAME measured visibility gap audit-reply.ts passes the sender, so offer and send agree. */
  const hasSiteFindingsLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      const hasWebsite = !!(l.website ?? '').trim();
      const c = crawlByLeadId.get(l.id);
      const audit = newestUsableAudit(audits, l.id);
      const runSources = (audit?.ai_audit_runs ?? [])
        .filter((r) => RUN_USABLE.has(String(r.status)))
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
        .map((r) => ({ result: r.crawl_check, createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0, complete: r.crawl_check?.status === 'complete' }));
      const visibilityGap = auditShowsVisibilityGap(audit?.ai_audit_runs ?? []);
      if (hasSiteFindings(hasWebsite, runSources, c ? { result: c.result, createdAtMs: new Date(c.created_at).getTime() } : null, visibilityGap)) s.add(l.id);
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
      // ⛔ NEWEST linked lead wins, not the first — a phone re-contacted under a later
      // (duplicate) `outreach_leads` row has its audit/report tied to THAT lead, and picking
      // the oldest strands the thread on a lead nothing was ever sent to (conversationLeadId).
      const leadId = conversationLeadId(msgs);
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
        isPotentialWork: leadId ? (potentialWorkByLeadId[leadId] ?? false) : false,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messagesByConversation, leadNameById, campaignByLeadId, statusByLeadId, potentialWorkByLeadId, paidLeadIds, ownLeadIds, reportOpenedAtByLead, siteVisitedAtByLead, geminiByLead]);

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

  /* ⛔ ONE RECORDED VOICE NOTE → send-whatsapp-voice. The server resolves the recipient from the
     LEAD (the phone here is only a confirmation it must match), re-checks the 24-hour window, converts
     the recording to Ogg/Opus and sends it with `voice: true`. `sendId` is per recording, so a retry
     of the same recording can never go twice. ok is true only once Meta confirmed the send (or the
     simulation, in test mode). */
  const sendVoice = useCallback(async (args: {
    phone: string; leadId: string; audio: Blob; mime: string; sendId: string;
  }): Promise<{ ok: boolean; simulated?: boolean; error?: string; reason?: string; retryable?: boolean }> => {
    const form = new FormData();
    form.append('lead_id', args.leadId);
    form.append('phone', args.phone);
    form.append('send_id', args.sendId);
    form.append('audio', args.audio, args.mime === 'audio/ogg' ? 'voice-note.ogg' : 'voice-note.webm');
    const { data, error } = await sb.functions.invoke('send-whatsapp-voice', { body: form });
    if (error) {
      /* A non-2xx still carries our JSON reason; read it rather than showing "non-2xx".
         Retrying is safe by default even after a network drop: the server's claim on `sendId`
         refuses a second send of the same recording (duplicate_send). Only the server's own
         "result unknown" answer sets retryable:false. */
      let body: { error?: string; reason?: string; retryable?: boolean } | null = null;
      try { body = await (error as { context?: Response }).context?.json(); } catch { body = null; }
      return { ok: false, error: body?.error ?? error.message, reason: body?.reason, retryable: body?.retryable ?? true };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? 'send_failed', reason: data?.reason, retryable: data?.retryable };
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
  }): Promise<{ ok: boolean; body?: string; snapshot?: WhatsAppTemplateSnapshot; template?: string; fellBack?: string; error?: string; reason?: string }> => {
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
    return { ok: true, body: data.body ?? '', snapshot: data.template_snapshot ?? undefined, template: data.template ?? args.templateName, fellBack: data.fell_back };
  }, []);

  // Optimistic single-lead status patch — updates local `leads` state so the derived
  // `conversations`/`list` recompute (leadStatus + hide filters) WITHOUT a full
  // re-query. Mirrors Outreach's single-row setLeads; avoids the isLoading spinner.
  /* Optimistic, no spinner — patches the QUERY CACHE (the only source of `leads` now), so the
     derived conversations/list recompute exactly as when this patched useState. The DB write
     happens at the call site; the next real refetch reconciles against the DB truth. */
  const patchLeadStatus = useCallback((leadId: string, status: string) => {
    // Record it as PENDING first: a focus/reconnect reconcile firing between this patch and the
    // write's visibility to a subsequent read must keep showing this status, not a stale one
    // (mergeReconciledLeads) — cleared once an authoritative outreach_leads row is next observed.
    pendingLeadPatchesRef.current.set(leadId, { ...pendingLeadPatchesRef.current.get(leadId), status });
    queryClient.setQueryData<InboxData>(queryKey, (prev) =>
      prev ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, status } : l)) } : prev);
  }, [queryClient, queryKey]);

  const patchLeadPotentialWork = useCallback((leadId: string, value = true) => {
    pendingLeadPatchesRef.current.set(leadId, { ...pendingLeadPatchesRef.current.get(leadId), is_potential_work: value });
    queryClient.setQueryData<InboxData>(queryKey, (prev) =>
      prev ? { ...prev, leads: prev.leads.map((l) => (l.id === leadId ? { ...l, is_potential_work: value } : l)) } : prev);
  }, [queryClient, queryKey]);

  return { user, messages, leads, conversations, messagesForKey, auditByLeadId, auditRunningLeadIds, hasSiteFaultLeadIds, hasSiteFindingsLeadIds, crawlByLeadId, isLoading, isError, refetch: fetchAll, send, sendVoice, preview, patchLeadStatus, patchLeadPotentialWork };
}
