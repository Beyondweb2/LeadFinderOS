import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toWhatsAppDigits } from '@/lib/waNumber';
import { leadAuditScores, type LeadAuditScore, type ScoredAudit } from '@/lib/auditScore';
import { auditIdsToRefresh, conversationLeadId, groupInboxMessages, INBOX_DELTA_OVERLAP_MS, inboxFocusRefreshPlan, mergeInboxMessages, mergeReconciledLeads, optionalInboxRows, patchInboxLead, upsertAuditById } from '@/lib/inboxCache';
import { newestUsableAuditByLead, resolveReportsByLead } from '@/lib/auditReportResolver';
import { RUN_USABLE, runSettled } from '@/lib/queueAuditStatus';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows, fetchAllRowsParallel } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { isPaidLead } from '@/lib/leadPayment';
import { REPORT_LINK_TEMPLATES, leadReportOpenedAt, leadSiteVisitedAt } from '@/lib/templateAttribution';
import { onLeadChanged } from '@/lib/leadSync';
import { auditShowsVisibilityGap, resolveSiteFault } from '@/lib/crawlCheck';
import { hasSiteFindings } from '@/lib/siteFindings';
import type { CrawlRow, CrawlStoredResult } from '@/lib/crawlResult';
import { refreshLeadCrawlsSoon, useLeadCrawls } from '@/hooks/useLeadCrawls';
import type { WhatsAppTemplateSnapshot } from '@/lib/whatsappTemplateSnapshot';
import { serviceWindowState } from '@/lib/serviceWindow';
import { sendMediaAttachmentRequest } from '@/lib/sendMediaAttachment';
import { sendWhatsAppRequest } from '@/lib/whatsAppSendRequest';
import { INBOX_SCHEDULED_KEY, type InboxScheduledInfo } from '@/hooks/useInboxScheduled';
import { isRealSend } from '@/lib/realSend';
import { smsRowToInboxMessage, smsTemplateAvailability, type InboxChannel, type SmsMessageRow } from '@/lib/inboxChannel';
import { newSendKey, previewSms, sendSms } from '@/lib/smsClient';
import { SMS_TEMPLATE_NAMES } from '@/lib/smsMessages';
import { smsPreview } from '@/lib/smsPreview';
import type { SmsTemplateName } from '@/lib/smsMessages';

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
/* 2026-10-22: the stored audit score rides on the run (hook_score / score_dirty_at, src/lib/auditScore.ts), so every path that
 * refreshes an audit here — the full load, the changed-since catch-up, one audit by id — refreshes its score too. If the
 * score columns are not there yet (deploy order), the projection without them is tried next: the list shows no score, never
 * a wrong one, and the report / template gates keep working. */
const AUDIT_SELECT = 'id, short_code, lead_id, created_at, open_count, first_opened_at, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, mention_rate, hook_score, score_dirty_at, audit_summary:results_summary, crawl_check:results_crawl_check)';
const AUDIT_SELECT_NO_SCORE = 'id, short_code, lead_id, created_at, open_count, first_opened_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(status, run_number, created_at, mention_rate, audit_summary:results_summary, crawl_check:results_crawl_check)';
const AUDIT_SELECTS = [AUDIT_SELECT, AUDIT_SELECT_NO_SCORE] as const;
const AUDIT_SELECT_FALLBACK = 'id, short_code, lead_id, created_at, open_count, first_opened_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(status, run_number, created_at, crawl_check:results->crawl_check)';

async function fetchInboxAudits(from: number, to: number) {
  let rich = await sb.from('ai_audits').select(AUDIT_SELECTS[0])
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
  if (rich.error) rich = await sb.from('ai_audits').select(AUDIT_SELECTS[1])
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
  if (!rich.error) return rich;
  console.warn('Inbox (audits): rich projection failed; retrying report-ready projection', rich.error);
  return sb.from('ai_audits').select(AUDIT_SELECT_FALLBACK)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
}

/* 2026-10-22: the engine chips' and the Gemini pill's own counting reads (inbox_engine_signals, inbox_gemini_signals) are gone.
   They counted every run of any audit by the stored model verdict and disagreed with the card on 400+ leads; the one score
   now rides on the audits read above (src/lib/auditScore.ts). Two fewer reads on every Inbox load. */
/* The Visible leads (src/lib/visibleFlag.ts), one small call scoped server-side (admin: all; sales: the leads they work). Missing
   function (deploy order) → no chip, never a wrong one. */
async function fetchVisibleLeads(): Promise<{ rows: string[]; truncated: boolean }> {
  const { data, error } = await (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc('inbox_visible_leads');
  if (!error && Array.isArray(data)) return { rows: data.filter((x): x is string => typeof x === 'string'), truncated: false };
  return { rows: NO_VISIBLE, truncated: false };
}

/** The audits touched since `since` — created or updated, given a new run, or RESCORED (a run settling bumps nothing, see
 *  auditIdsToRefresh; a rescore stamps ai_audit_runs.scored_at). Ids only, three tiny reads. null = could not tell (the caller
 *  re-reads every audit). */
async function fetchChangedAuditIds(since: string): Promise<string[] | null> {
  try {
    const rescored = fetchAllRows<{ audit_id: string | null }>('Inbox (rescored runs)', (from, to) =>
      sb.from('ai_audit_runs').select('audit_id').gte('scored_at', since)
        .order('id', { ascending: true }).range(from, to)).catch(() => ({ rows: [] as Array<{ audit_id: string | null }> }));
    const [audits, runs, scored] = await Promise.all([
      fetchAllRows<{ id: string }>('Inbox (changed audits)', (from, to) =>
        sb.from('ai_audits').select('id').or(`created_at.gte.${since},updated_at.gte.${since}`)
          .order('id', { ascending: true }).range(from, to)),
      fetchAllRows<{ audit_id: string | null }>('Inbox (new audit runs)', (from, to) =>
        sb.from('ai_audit_runs').select('audit_id').gte('created_at', since)
          .order('id', { ascending: true }).range(from, to)),
      rescored,
    ]);
    return [...audits.rows.map((a) => a.id), ...[...runs.rows, ...scored.rows].map((r) => r.audit_id).filter((id): id is string => !!id)];
  } catch { return null; }
}

/** These audits, freshly read by id (the same projection, with the same fallback). null = the read failed. */
const AUDITS_BY_ID_CHUNK = 100;
async function fetchInboxAuditsByIds(ids: string[]): Promise<InboxData['audits'] | null> {
  const out: InboxData['audits'] = [];
  for (let i = 0; i < ids.length; i += AUDITS_BY_ID_CHUNK) {
    const chunk = ids.slice(i, i + AUDITS_BY_ID_CHUNK);
    let res = await sb.from('ai_audits').select(AUDIT_SELECTS[0]).in('id', chunk);
    if (res.error) res = await sb.from('ai_audits').select(AUDIT_SELECTS[1]).in('id', chunk);
    if (res.error) res = await sb.from('ai_audits').select(AUDIT_SELECT_FALLBACK).in('id', chunk);
    if (res.error) return null;
    out.push(...(res.data ?? []));
  }
  return out;
}

/** One audit row, freshly read by id — the SMALL targeted fetch a single `ai_audits`/`ai_audit_runs`
 *  realtime event triggers, instead of re-running the whole paginated audits read. Falls back the
 *  same way fetchInboxAudits does if the rich projection is rejected. */
async function fetchOneInboxAudit(auditId: string): Promise<InboxData['audits'][number] | null> {
  let rich = await sb.from('ai_audits').select(AUDIT_SELECTS[0]).eq('id', auditId).maybeSingle();
  if (rich.error) rich = await sb.from('ai_audits').select(AUDIT_SELECTS[1]).eq('id', auditId).maybeSingle();
  if (!rich.error) return rich.data ?? null;
  const fallback = await sb.from('ai_audits').select(AUDIT_SELECT_FALLBACK).eq('id', auditId).maybeSingle();
  return fallback.error ? null : (fallback.data ?? null);
}

/** Same columns `fetchInboxData`'s leads read selects, minus the `WHERE` filter — reused by the
 *  targeted single-lead refresh below so the two never drift apart. */
/* ⛔ WHERE THE INBOX'S LEADS COME FROM (2026-09-27, one Inbox for both roles). The admin reads
   outreach_leads as before. A salesperson reads the sales_leads VIEW — only leads assigned to them,
   never a client, and `amount_paid` is a literal NULL there — so the conversation build below (which
   drops any thread whose lead is not in this read) shows a salesperson exactly their own
   conversations, and another rep's thread cannot be opened by changing an id in the URL: the lead is
   not in the read, and the messages themselves are RLS-scoped to the rep's leads/phones. Every column
   below exists in the view. */
type InboxLeadTable = 'outreach_leads' | 'sales_leads';
export function inboxLeadTableFor(role: string | null | undefined): InboxLeadTable {
  return role === 'sales' ? 'sales_leads' : 'outreach_leads';
}

/* next_action / next_action_date (2026-09-28): the thread header shows the human-set next action, so a
   change made in Outreach or the prospect panel is visible here without opening anything. */
/* ⚡ The WhatsApp message columns the Inbox reads — every WaMessage field plus the ones its rules read
   (conversationState: error_code / error_title / error_details; replyKindTag: reply_kind). Not `*` (perf, 2026-10-22):
   wa_message_id (Meta's id, ~0.4 MB live) and findings_shown are never read here. A new column the Inbox needs goes in
   this list. Texts (sms_messages, a handful of rows) keep `*` — their mapping (smsRowToInboxMessage) reads its own names. */
export const WA_MESSAGE_COLUMNS = 'id, created_at, direction, user_id, lead_id, phone, body, message_type, template_name, status, test_mode, error, media_path, media_mime_type, media_filename, template_snapshot, sent_by_user_id, error_code, error_title, error_details, sent_by_ai, reply_kind';

const LEAD_COLUMNS = 'id, business_name, phone, country, campaign_id, status, google_maps_url, website, email, place_id, category, search_keyword, search_location, address, amount_paid, contact_name, hook_followup_queued_at, is_potential_work, facebook_url, instagram_url, linkedin_url, facebook_status, instagram_status, linkedin_status, call_booked_at, whatsapp_sent_at, next_action, next_action_date, next_action_time, next_action_note, sms_queued_at, sms_delivery_status, derived_town, town_fetch_note, lead_source, import_batch, assigned_to_user_id';

/** One lead row, freshly read by id — used to close the gap between an inbound reply's message
 *  (visible the instant its realtime INSERT lands) and its status flip to 'replied' (a second,
 *  sequential DB write in whatsapp-inbound.ts). Includes `is_archived` so patchInboxLead's own rule
 *  applies exactly as it does to the `outreach_leads` UPDATE subscription. */
async function fetchOneInboxLead(leadId: string, leadTable: InboxLeadTable): Promise<(LeadLite & { is_archived?: boolean }) | null> {
  const { data, error } = await sb.from(leadTable).select(`${LEAD_COLUMNS}, is_archived`).eq('id', leadId).maybeSingle();
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
  /** Level 2: the AI sent this reply by itself (set by trg_ai_auto_send_row). */
  sent_by_ai?: boolean | null;
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
  /** ⛔ THE ONE AUDIT SCORE (src/lib/auditScore.ts, 2026-10-22): the card's audit, the card's numbers, stored per run.
   *  Null = no outreach audit. `updating` = its inputs changed since it was worked out (shown greyed, never as final). */
  auditScore: LeadAuditScore | null;
  /** AI already names this business (the Visible flag, src/lib/visibleFlag.ts): a chip, a Show filter, no pitch. */
  visible: boolean;
  /** Interested is a separate operator marker, persisted as is_potential_work. */
  isPotentialWork: boolean;
}

export interface LeadLite { id: string; business_name: string; phone: string; country: string | null; campaign_id: string | null; status: string | null; google_maps_url: string | null; website: string | null; email: string | null; place_id: string | null; category: string | null; search_keyword: string | null; search_location: string | null; address: string | null; amount_paid: number | null; contact_name: string | null; hook_followup_queued_at: string | null; is_potential_work: boolean | null; next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; next_action_note?: string | null; call_booked_at?: string | null; whatsapp_sent_at?: string | null; sms_queued_at?: string | null; sms_delivery_status?: string | null; derived_town?: string | null; town_fetch_note?: string | null; lead_source?: string | null; import_batch?: string | null; assigned_to_user_id?: string | null }

const convKey = (userId: string | null, phone: string) => `${userId ?? 'unassigned'}::${phone}`;

/** Client mirror of the edge toWhatsAppNumber, so a conversation started from a lead
 *  uses the SAME E.164 key the server stores (keeps the thread selected after send). */
export function normalizeWaNumber(raw: string, country?: string | null): string | null {
  return toWhatsAppDigits(raw, country); // ONE rule, src/lib/waNumber.ts
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
  audits: Array<{ id: string; short_code: string | null; lead_id: string | null; created_at: string | null; open_count: number | null; first_opened_at: string | null; audit_purpose?: string | null; baseline_target_runs?: number | null; is_measurement?: boolean | null; baseline_contract?: unknown; is_market?: boolean | null; ai_audit_runs: Array<{ id?: string; hook_score?: unknown; score_dirty_at?: string | null; status: string | null; run_number: number | null; created_at: string | null; mention_rate: number | null; audit_summary: { mention_rate?: number | null } | null; crawl_check: (CrawlStoredResult & { status?: string }) | null }> | null }>;
  /** Sign-up page landings (findable-onboarding's prefill hook) → the SITE pill. */
  pageHits: Array<{ lead_id: string | null; created_at: string }>;
  /** Lead ids flagged Visible (inbox_visible_leads). */
  visibleLeads: string[];
}

/* Key includes the user id (the useCoverage pattern): firing before it resolves would cache the
   result under `undefined` and never be read again under the real id — hence `enabled` below. */
export const inboxQueryKey = (userId: string | null | undefined) => ['inbox', userId ?? null] as const;

/* Stable empties so a loading render doesn't mint new arrays every time (memo inputs stay stable). */
const NO_MESSAGES: WaMessage[] = [];
const NO_LEADS: LeadLite[] = [];
const NO_AUDITS: InboxData['audits'] = [];
const NO_PAGE_HITS: InboxData['pageHits'] = [];
const NO_VISIBLE: string[] = [];

/** The message table a channel reads, and the mapping of its rows onto the Inbox's own message shape (the rest of the Inbox cannot tell). */
const messageTableFor = (channel: InboxChannel) => (channel === 'sms' ? 'sms_messages' : 'whatsapp_messages');
const messageSelectFor = (channel: InboxChannel) => (channel === 'sms' ? '*' : WA_MESSAGE_COLUMNS);
const toInboxMessage = (channel: InboxChannel, row: unknown): WaMessage => (channel === 'sms' ? smsRowToInboxMessage(row as SmsMessageRow) as WaMessage : row as WaMessage);

async function fetchInboxData(leadTable: InboxLeadTable, previous?: InboxData, essentialOnly = false, channel: InboxChannel = 'whatsapp'): Promise<InboxData> {
  const [msgRes, leadRes, reportRes, hitRes, visRes] = await Promise.all([
    /* Paginated, and with the id tiebreaker it never had: 3 groups of rows share a created_at, and
       on a non-unique sort a tied row can be fetched twice and another missed at a page boundary.
       This is the fastest-growing table in the system — every send and every reply. */
    fetchAllRowsParallel<WaMessage>('Inbox (messages)', (from, to) =>
      sb.from(messageTableFor(channel)).select(messageSelectFor(channel))
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), (m) => m.id),
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
    fetchAllRowsParallel<LeadLite>('Inbox (leads)', (from, to) =>
      sb.from(leadTable).select(LEAD_COLUMNS)
        .eq('is_archived', false).not('phone', 'is', null)
        .order('id', { ascending: true }).range(from, to), (l) => l.id),
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
    optionalInboxRows<InboxData['audits'][number]>(fetchAllRowsParallel<InboxData['audits'][number]>('Inbox (audits)', fetchInboxAudits, (a) => a.id)),
    /* Sign-up page hits → the SITE pill. The SAME table and the SAME paginated read the campaign
       card uses (id tiebreaker); the SITE_TRACKING_START cutoff is applied in leadSiteVisitedAt. A
       failed read degrades to no pill, never to a wrong one. */
    essentialOnly ? { rows: previous?.pageHits ?? NO_PAGE_HITS } : optionalInboxRows<InboxData['pageHits'][number]>(fetchAllRows<InboxData['pageHits'][number]>('Inbox (page hits)', (from, to) =>
      sb.from('lead_page_hits').select('lead_id, created_at')
        .order('id', { ascending: true }).range(from, to))),
    /* Stored crawl checks are NOT read here any more (perf, 2026-10-22): useLeadCrawls reads their small summary
       once, shared with Outreach. A failed read there still degrades to "no fault known" — the template stays gated off. */
    /* The engine counts are NOT read here any more either (2026-10-22): the one stored score rides on the audits read. */
    essentialOnly ? { rows: previous?.visibleLeads ?? NO_VISIBLE } : optionalInboxRows<string>(fetchVisibleLeads()),
  ]);
  return {
    messages: channel === 'sms' ? msgRes.rows.map((m) => toInboxMessage(channel, m)) : msgRes.rows,
    leads: leadRes.rows.filter((l) => (l.phone ?? '').trim()),
    audits: reportRes?.rows ?? previous?.audits ?? NO_AUDITS,
    pageHits: hitRes?.rows ?? previous?.pageHits ?? NO_PAGE_HITS,
    visibleLeads: visRes?.rows ?? previous?.visibleLeads ?? NO_VISIBLE,
  };
}

export function useInbox(channel: InboxChannel = 'whatsapp') {
  const sms = channel === 'sms';
  const msgTable = messageTableFor(channel);
  const { user } = useAuth();
  const { role } = useSubscription();
  const leadTable = inboxLeadTableFor(role);
  const queryClient = useQueryClient();
  /* One cache per channel: WhatsApp keeps its key exactly; texts get ['inbox', user, 'sms'] (so a prefix invalidation of ['inbox'] reaches both). */
  const queryKey = useMemo(() => (sms ? [...inboxQueryKey(user?.id), 'sms'] : inboxQueryKey(user?.id)) as unknown as ReturnType<typeof inboxQueryKey>, [user?.id, sms]);

  /* ⛔ REACT QUERY, THE SAME WAY useOutreach/useCoverage USE IT (App.tsx defaults:
     refetchOnWindowFocus:false, staleTime 5min). The old shape — useEffect→fetchAll with
     isLoading starting true — refetched EVERYTHING with a full-screen spinner on every visit;
     now a return inside the stale window renders instantly from cache, and a stale return
     renders the cache while refreshing in the background.
     ⚠️ THE STALENESS RISK IS HANDLED BY INVALIDATION, NOT BY SHORT TTLs: send() below and every
     mutating caller in Inbox.tsx (remove-from-inbox, the follow-up sends, starting an audit)
     await refetch/fetchAll, which BYPASSES staleTime — so an action is never followed by a stale
     list. patchLeadStatus keeps its optimistic no-spinner behaviour by patching the CACHE. */
  /* When the current full load started — the catch-up below reads only what changed after it. */
  const loadStartedAtRef = useRef<number>(0);
  /* When the newest sync of any kind (full load, reconcile, delta) began, and the newest FULL one — the tab-focus
     refresh reads only what changed since the first, and goes full when the second is old (inboxFocusRefreshPlan). */
  const lastSyncStartedAtRef = useRef<number>(0);
  const lastFullAtRef = useRef<number>(0);
  const query = useQuery({
    queryKey,
    queryFn: () => {
      loadStartedAtRef.current = Date.now();
      lastSyncStartedAtRef.current = loadStartedAtRef.current;
      lastFullAtRef.current = loadStartedAtRef.current;
      return fetchInboxData(leadTable, queryClient.getQueryData<InboxData>(queryKey), false, channel);
    },
    enabled: !!user?.id && !!role,
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
    lastSyncStartedAtRef.current = Date.now();
    lastFullAtRef.current = lastSyncStartedAtRef.current;
    const fresh = await fetchInboxData(leadTable, queryClient.getQueryData<InboxData>(queryKey), true, channel);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? {
          ...current,
          messages: mergeInboxMessages(current.messages, fresh.messages),
          leads: mergeReconciledLeads(fresh.leads, pendingLeadPatchesRef.current),
          audits: fresh.audits,
        }
      : fresh);
  }, [queryClient, queryKey, leadTable, channel]);

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
    const fresh = await fetchOneInboxLead(leadId, leadTable);
    if (!fresh) {
      /* A salesperson's view answering NO ROW means the lead is no longer theirs (reassigned): drop it,
         as useOutreach does. The admin's read of outreach_leads never loses a lead this way. */
      if (leadTable === 'sales_leads') queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, leads: current.leads.filter((l) => l.id !== leadId) } : current);
      return;
    }
    pendingLeadPatchesRef.current.delete(leadId);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? { ...current, leads: patchInboxLead(current.leads, fresh) } : current);
  }, [queryClient, queryKey, leadTable]);

  /* ⛔ LOAD ONE NEWLY AUTHORISED LEAD, WITH ITS WHOLE THREAD (2026-09-30, Paul: "if that notification
     arrives before the lead list refreshes, load the newly authorised lead directly"). A salesperson's
     session never receives outreach_leads realtime, so a lead assigned to them a minute ago is not in
     this cache and its messages were never read. Both are read here through the person's OWN access —
     the lead from their lead source (sales_leads for a rep), the messages under RLS — so nothing is
     exposed that a full reload would not show. A lead they can no longer read (reassigned away) is
     REMOVED from the cache, so its thread stops pretending to be theirs. Returns the lead, or null. */
  const loadLead = useCallback(async (leadId: string): Promise<(LeadLite & { is_archived?: boolean }) | null> => {
    const fresh = await fetchOneInboxLead(leadId, leadTable);
    if (!fresh) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, leads: current.leads.filter((l) => l.id !== leadId) } : current);
      return null;
    }
    const msgs = await fetchAllRows<WaMessage>('Inbox (one lead)', (from, to) =>
      sb.from(msgTable).select(messageSelectFor(channel)).eq('lead_id', leadId)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)).catch(() => null);
    if (msgs && sms) msgs.rows = msgs.rows.map((m) => toInboxMessage(channel, m));
    pendingLeadPatchesRef.current.delete(leadId);
    queryClient.setQueryData<InboxData>(queryKey, (current) => current
      ? { ...current, leads: patchInboxLead(current.leads, fresh), messages: msgs ? mergeInboxMessages(current.messages, msgs.rows) : current.messages }
      : current);
    return fresh;
  }, [queryClient, queryKey, leadTable, msgTable, sms, channel]);

  /* ⚡ THE FIRST CONNECT DOES NOT RELOAD EVERYTHING AGAIN (2026-09-27). The subscription usually
     comes up while the initial load is still running, and reconcile() then re-read every message,
     lead and audit IN PARALLEL with it — the whole Inbox fetched twice on every visit, the second
     copy competing with the first for the database (measured on the live app). The gap reconcile
     exists to cover — rows written between the load's snapshot and the subscription going live — is
     covered instead by waiting for that load, then reading only rows changed since it STARTED (a
     minute of overlap for clock skew): messages by created_at, leads by updated_at, and the audit
     list (small and fast since migration 20260927110000). A later reconnect or focus still runs the
     full reconcile(), exactly as before. */
  /* ⚡ THE "CHANGED SINCE" READ (perf, 2026-10-22) — shared by the first-load catch-up and the tab-focus refresh:
     messages created, leads updated (an archived one leaves through patchInboxLead), and only the audits that
     changed or are still running (auditIdsToRefresh) — never the whole audit list again. If the server cannot say
     which audits changed, every audit is re-read, exactly as before. */
  const catchUpSince = useCallback(async (sinceMs: number) => {
    lastSyncStartedAtRef.current = Date.now();
    const since = new Date(sinceMs).toISOString();
    const [msgs, leadRows, changedAuditIds] = await Promise.all([
      fetchAllRows<WaMessage>('Inbox (catch-up messages)', (from, to) =>
        sb.from(msgTable).select(messageSelectFor(channel)).gte('created_at', since)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)).catch(() => null),
      fetchAllRows<LeadLite & { is_archived?: boolean }>('Inbox (catch-up leads)', (from, to) =>
        sb.from(leadTable).select(`${LEAD_COLUMNS}, is_archived`).gte('updated_at', since)
          .order('id', { ascending: true }).range(from, to)).catch(() => null),
      fetchChangedAuditIds(since),
    ]);
    const cachedAudits = queryClient.getQueryData<InboxData>(queryKey)?.audits ?? NO_AUDITS;
    const changedAudits = changedAuditIds
      ? await fetchInboxAuditsByIds(auditIdsToRefresh(cachedAudits, changedAuditIds, runSettled))
      : null;
    const allAudits = changedAudits ? null
      : await optionalInboxRows<InboxData['audits'][number]>(fetchAllRowsParallel<InboxData['audits'][number]>('Inbox (catch-up audits)', fetchInboxAudits, (a) => a.id));
    queryClient.setQueryData<InboxData>(queryKey, (current) => {
      if (!current) return current;
      let leads = current.leads;
      for (const row of leadRows?.rows ?? []) {
        if (pendingLeadPatchesRef.current.has(row.id)) continue; // an optimistic patch still wins
        leads = patchInboxLead(leads, row);
      }
      return {
        ...current,
        messages: msgs ? mergeInboxMessages(current.messages, msgs.rows.map((m) => toInboxMessage(channel, m))) : current.messages,
        leads,
        audits: changedAudits ? changedAudits.reduce(upsertAuditById, current.audits) : (allAudits?.rows ?? current.audits),
      };
    });
  }, [queryClient, queryKey, leadTable, msgTable, channel]);

  const catchUpAfterFirstLoad = useCallback(async () => {
    try {
      await queryClient.ensureQueryData({ queryKey, queryFn: () => fetchInboxData(leadTable, queryClient.getQueryData<InboxData>(queryKey), false, channel) });
    } catch { return; }
    await catchUpSince((loadStartedAtRef.current || Date.now()) - INBOX_DELTA_OVERLAP_MS);
  }, [queryClient, queryKey, leadTable, channel, catchUpSince]);

  /* Subscription only patches cache. It never calls the six-read loader on connect. */
  useEffect(() => {
    if (!user?.id) return;
    const rt = (supabase as any).channel(`inbox:${user.id}:${channel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: msgTable }, (payload: any) => {
        const raw = payload.new ?? payload.old;
        if (!raw?.id) return;
        const row = toInboxMessage(channel, raw);
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
      /* Debounced, and only the website-check summary list (useLeadCrawls) — never the whole Inbox bundle; a bulk
         crawl writing many rows re-reads it once. */
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_crawl_checks' }, () => {
        refreshLeadCrawlsSoon(queryClient);
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
        if (status !== 'SUBSCRIBED') return;
        const state = queryClient.getQueryState(queryKey);
        if (!state?.data || state.fetchStatus === 'fetching') void catchUpAfterFirstLoad();
        else void reconcile();
      });
    /* Back on the tab: at most once a minute, only what changed (inboxFocusRefreshPlan). focus and visibilitychange
       both fire on one alt-tab; the plan's one-minute floor makes that one read. */
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const plan = inboxFocusRefreshPlan(Date.now(), lastSyncStartedAtRef.current, lastFullAtRef.current);
      if (plan.kind === 'full') void reconcile();
      else if (plan.kind === 'delta') void catchUpSince(plan.sinceMs);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      void (supabase as any).removeChannel(rt);
    };
  }, [user?.id, queryClient, queryKey, reconcile, catchUpAfterFirstLoad, catchUpSince, patchOneAudit, patchOneLead, msgTable, channel]);

  /* ⛔ THE SAME ROW OUTREACH EDITS (2026-09-28). A status, next action, star or note saved anywhere —
     Outreach, the prospect panel, another tab — announces itself (src/lib/leadSync.ts) and the Inbox
     re-reads that ONE lead from its own source. Never the writer's arguments patched in: the server's
     row is the truth, and this is the path Sales depends on (realtime never reaches a sales session). */
  useEffect(() => onLeadChanged(({ leadId, patch, optimistic }) => {
    if (patch) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, leads: current.leads.map((l) => (l.id === leadId ? { ...l, ...patch } as LeadLite : l)) } : current);
    }
    if (optimistic) return; // re-read only once the server has answered
    /* A lead this cache has never held — just assigned to this person (the lead_assigned notification
       announces it, useNotifications) — is loaded WITH its thread; one already here is re-read. */
    const known = queryClient.getQueryData<InboxData>(queryKey)?.leads.some((l) => l.id === leadId);
    void (known ? patchOneLead(leadId) : loadLead(leadId));
  }), [patchOneLead, loadLead, queryClient, queryKey]);

  const messages = query.data?.messages ?? NO_MESSAGES;
  const leads = query.data?.leads ?? NO_LEADS;
  const audits = query.data?.audits ?? NO_AUDITS;
  const pageHits = query.data?.pageHits ?? NO_PAGE_HITS;
  /* The stored website checks: the SAME summary read and cache the Outreach table uses (useLeadCrawls, result_slim) —
     never the whole check, and never inside the Inbox bundle, so a crawl finishing re-reads only this. */
  const { crawlByLeadId: storedCrawlByLeadId } = useLeadCrawls('Inbox (crawl checks)');
  const visibleLeads = query.data?.visibleLeads ?? NO_VISIBLE;
  const visibleSet = useMemo(() => new Set(visibleLeads), [visibleLeads]);
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
  /* newestUsableAudit for every lead in ONE pass (same rule) — the two site-fault sets below asked it once per lead each. */
  const usableAuditByLead = useMemo(() => newestUsableAuditByLead(audits), [audits]);

  /* Lead ids whose site has a NAMEABLE fault — the picker gate for audit_followup_fault (its {{6}}
     names one; Meta rejects an empty parameter). Newest crawl check per lead, and the SAME freshness
     + version rule render-audit-report and the sender apply (30 days, v2+): a stale or pre-v2 check
     can carry a false finding. Absent / clean / unreachable → not in the set → the template stays
     gated off, which is the safe direction. */
  /* Newest crawl row per lead → the Crawl-site button's whole state (run/not-run, and the popup's
     stored result), keyed by lead. The button and the audit_followup_fault gate below read the SAME
     rows, so what the button shows and what the template offers can never disagree. */
  const crawlByLeadId = useMemo(() => {
    const m = new Map<string, CrawlRow>(storedCrawlByLeadId);
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
          result: run.crawl_check,
          created_at: run.crawl_check.checked_at ?? run.created_at ?? audit.created_at ?? new Date(0).toISOString(),
        });
      }
    }
    return m;
  }, [storedCrawlByLeadId, audits]);

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
      const audit = usableAuditByLead.get(l.id) ?? null;
      const runSources = (audit?.ai_audit_runs ?? [])
        .filter((r) => RUN_USABLE.has(String(r.status)))
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
        .map((r) => ({ result: r.crawl_check, createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0, complete: r.crawl_check?.status === 'complete' }));
      const visibilityGap = auditShowsVisibilityGap(audit?.ai_audit_runs ?? []);
      if (resolveSiteFault(hasWebsite, runSources, c ? { result: c.result, createdAtMs: new Date(c.created_at).getTime() } : null, visibilityGap) !== null) s.add(l.id);
    }
    return s;
  }, [leads, usableAuditByLead, crawlByLeadId]);

  /* Lead ids ai_site_findings_v2's {{6}} has findings for — its own picker gate, and DELIBERATELY A
     SECOND SET rather than a reuse of the one above: hasSiteFindings refuses a lead with no website,
     which audit_followup_fault accepts. A clean site qualifies (the clean-site {{6}}) only with the
     SAME measured visibility gap audit-reply.ts passes the sender, so offer and send agree. */
  const hasSiteFindingsLeadIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      const hasWebsite = !!(l.website ?? '').trim();
      const c = crawlByLeadId.get(l.id);
      const audit = usableAuditByLead.get(l.id) ?? null;
      const runSources = (audit?.ai_audit_runs ?? [])
        .filter((r) => RUN_USABLE.has(String(r.status)))
        .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
        .map((r) => ({ result: r.crawl_check, createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0, complete: r.crawl_check?.status === 'complete' }));
      const visibilityGap = auditShowsVisibilityGap(audit?.ai_audit_runs ?? []);
      if (hasSiteFindings(hasWebsite, runSources, c ? { result: c.result, createdAtMs: new Date(c.created_at).getTime() } : null, visibilityGap)) s.add(l.id);
    }
    return s;
  }, [leads, usableAuditByLead, crawlByLeadId]);

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
      if (msg.direction !== 'outbound' || !msg.lead_id || !msg.template_name || !isRealSend(msg.status)) continue;
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

  /* ⛔ THE ONE AUDIT SCORE per lead (src/lib/auditScore.ts): the card's audit and run, that run's stored score. The list row,
     the thread header and the card all show these numbers; the Visible flag and the drafter read the same stored score. */
  const scoreByLead = useMemo(() => leadAuditScores(audits as unknown as ScoredAudit[]), [audits]);

  /* A score the database marked for rescoring is re-read on its own every 45 s while the tab is visible (at most 40 audits,
     by id), until the tick has rescored it — so a finished audit's numbers reach the list without a reload. ai_audits /
     ai_audit_runs are not realtime-published, so nothing else would bring them. Never the whole Inbox. */
  const dirtyAuditIds = useMemo(() => {
    const ids: string[] = [];
    for (const sc of scoreByLead.values()) if (sc.dirty) ids.push(sc.auditId);
    return ids.slice(0, 40).sort().join(',');
  }, [scoreByLead]);
  useEffect(() => {
    if (!dirtyAuditIds) return;
    const ids = dirtyAuditIds.split(',');
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchInboxAuditsByIds(ids).then((fresh) => {
        if (!fresh?.length) return;
        queryClient.setQueryData<InboxData>(queryKey, (current) => current ? { ...current, audits: fresh.reduce(upsertAuditById, current.audits) } : current);
      });
    }, 45_000);
    return () => window.clearInterval(t);
  }, [dirtyAuditIds, queryClient, queryKey]);

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
        auditScore: scoreByLead.get(leadId) ?? null,
        visible: visibleSet.has(leadId),
        isPotentialWork: leadId ? (potentialWorkByLeadId[leadId] ?? false) : false,
      });
    }
    return out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messagesByConversation, leadNameById, campaignByLeadId, statusByLeadId, potentialWorkByLeadId, paidLeadIds, ownLeadIds, reportOpenedAtByLead, siteVisitedAtByLead, scoreByLead, visibleSet]);

  const messagesForKey = useCallback(
    (key: string) => messagesByConversation.get(key) ?? NO_MESSAGES,
    [messagesByConversation],
  );

  const send = useCallback(async (args: {
    phone: string; leadId: string | null; country?: string | null; body?: string; templateName?: string;
    /** Only true when the operator confirmed a repeat of a pitch this lead already had. The edge
     *  refuses a duplicate pitch by default; this is the deliberate override, never a default. */
    allowResend?: boolean;
    /** Values the person typed for the template (today only needs_from_you's item); the server cleans them. */
    templateVars?: Record<string, string>;
    /** body + templateName: these words as free text, recorded as that template (WhatsApp, inside the 24-hour window). */
    asFreeText?: boolean;
  }): Promise<{ ok: boolean; simulated?: boolean; error?: string; reason?: string; messageId?: string; scheduled?: InboxScheduledInfo; sentAs?: 'text' | 'template'; noFreeText?: string }> => {
    if (sms) {
      /* A TEXT: through the SMS sender (every guard lives there — mobile check, opt-outs, the conversation gate, QA safety, the abuse guard).
         The row it wrote is read back and merged so the thread shows it at once, exactly as a WhatsApp send does. */
      if (!args.leadId) return { ok: false, error: 'template_needs_lead', reason: 'A text needs a linked lead.' };
      const r = await sendSms({ leadId: args.leadId, key: newSendKey(), ...(args.templateName ? { template: args.templateName } : { text: args.body ?? '' }), resend: args.allowResend });
      if (r.ok !== true) return { ok: false, error: (r as { error: string }).error, reason: (r as { detail?: string; reason?: string }).detail ?? (r as { reason?: string }).reason };
      /* Outside their send hours the server queued it (nothing sent): the thread shows the queued row. */
      const queued = (r as { scheduled?: InboxScheduledInfo }).scheduled;
      if (queued) { void queryClient.invalidateQueries({ queryKey: INBOX_SCHEDULED_KEY }); return { ok: true, scheduled: queued }; }
      const { data: row } = await sb.from('sms_messages').select('*').eq('id', (r as { message: { id: string } }).message.id).maybeSingle();
      if (row?.id) {
        queryClient.setQueryData<InboxData>(queryKey, (current) => current
          ? { ...current, messages: mergeInboxMessages(current.messages, [toInboxMessage(channel, row)]) } : current);
      }
      return { ok: true, simulated: (r as { simulated: boolean }).simulated };
    }
    // The one WhatsApp send request (src/lib/whatsAppSendRequest.ts) — the Outreach WhatsApp dialog sends through it too.
    const r = await sendWhatsAppRequest(sb, { ...args, via: 'inbox' });
    if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
    const shape = { ...(r.sentAs ? { sentAs: r.sentAs } : {}), ...(r.noFreeText ? { noFreeText: r.noFreeText } : {}) };
    if (r.scheduled) { void queryClient.invalidateQueries({ queryKey: INBOX_SCHEDULED_KEY }); return { ok: true, scheduled: r.scheduled, ...shape }; }
    if (r.message?.id) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, messages: mergeInboxMessages(current.messages, [r.message as unknown as WaMessage]) } : current);
    }
    /* messageId: the row the server wrote — AI handles replies records it as the approved send. */
    return { ok: true, simulated: r.simulated, messageId: r.message?.id, ...shape };
  }, [queryClient, queryKey, sms, channel]);

  /* ⛔ ONE RECORDED VOICE NOTE → send-whatsapp-voice. The server resolves the recipient from the
     LEAD (the phone here is only a confirmation it must match), re-checks the 24-hour window, converts
     the recording to Ogg/Opus and sends it with `voice: true`. `sendId` is per recording, so a retry
     of the same recording can never go twice. ok is true only once Meta confirmed the send (or the
     simulation, in test mode). */
  const sendVoice = useCallback(async (args: {
    phone: string; leadId: string; audio: Blob; mime: string; sendId: string;
  }): Promise<{ ok: boolean; simulated?: boolean; error?: string; reason?: string; retryable?: boolean; scheduled?: InboxScheduledInfo }> => {
    if (sms) return { ok: false, error: 'not_supported', reason: 'Voice notes are WhatsApp only.', retryable: false };
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
    if (data.scheduled) { void queryClient.invalidateQueries({ queryKey: INBOX_SCHEDULED_KEY }); return { ok: true, scheduled: data.scheduled as InboxScheduledInfo }; }
    if (data.message?.id) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, messages: mergeInboxMessages(current.messages, [data.message as WaMessage]) } : current);
    }
    return { ok: true, simulated: data.simulated };
  }, [queryClient, queryKey]);

  /* ONE ATTACHMENT (image / video / document) inside the 24-hour window — send-whatsapp-media, the
     voice note's twin (src/lib/sendMediaAttachment.ts holds the call, shared with the sales page).
     The sent row is merged the same way, so it appears in the thread at once. */
  const sendMedia = useCallback(async (args: { phone: string; leadId: string; file: File; caption: string; sendId: string }) => {
    if (sms) return { ok: false as const, error: 'not_supported', retryable: false } as unknown as Awaited<ReturnType<typeof sendMediaAttachmentRequest>>;
    const res = await sendMediaAttachmentRequest(sb, args);
    if (res.ok && res.message?.id) {
      queryClient.setQueryData<InboxData>(queryKey, (current) => current
        ? { ...current, messages: mergeInboxMessages(current.messages, [res.message as unknown as WaMessage]) } : current);
    }
    return res;
  }, [queryClient, queryKey, sms]);

  /* ⛔ PREVIEW WHAT WOULD BE SENT — the SAME endpoint, the same guards, nothing sent.
     `mode: "dry_run"` returns the built Meta payload and the transcript body immediately before the
     Graph POST, or the refusal it would have given. It exists because `audit_followup` failed twice
     in front of live prospects with nothing but "Edge Function returned a non-2xx status code"
     (CLAUDE.md §30b), and there was no way to ask the question without spending a message.
     ⚠️ Deliberately does NOT refetch: it changes nothing, so a refetch would only make a read look
     like a write. */
  const preview = useCallback(async (args: {
    phone: string; leadId: string | null; country?: string | null; templateName: string; allowResend?: boolean; templateVars?: Record<string, string>;
  }): Promise<{ ok: boolean; body?: string; snapshot?: WhatsAppTemplateSnapshot; template?: string; fellBack?: string; error?: string; reason?: string; sentAs?: 'text' | 'template'; withVideo?: boolean; noFreeText?: string }> => {
    if (sms) {
      /* The text this template would send: the six native templates are built here from the same function the sender uses; every other
         template is built by the WhatsApp sender's own dry run (twilio-sms-send mode:'preview'). Nothing is sent either way. */
      const avail = smsTemplateAvailability(args.templateName);
      if (avail.ok === false) return { ok: false, error: 'template_unavailable', reason: avail.reason };
      if (!args.leadId) return { ok: false, error: 'template_needs_lead', reason: 'A text needs a linked lead.' };
      if ((SMS_TEMPLATE_NAMES as readonly string[]).includes(args.templateName)) {
        const lead = queryClient.getQueryData<InboxData>(queryKey)?.leads.find((l) => l.id === args.leadId);
        return { ok: true, body: smsPreview(args.templateName as SmsTemplateName, { business_name: lead?.business_name ?? '', derived_town: (lead as { derived_town?: string | null } | undefined)?.derived_town ?? null }), template: args.templateName };
      }
      const r = await previewSms({ leadId: args.leadId, template: args.templateName });
      return r.ok === true ? { ok: true, body: r.body, template: args.templateName } : { ok: false, error: (r as { error: string }).error, reason: (r as { detail: string }).detail };
    }
    const { data, error } = await sb.functions.invoke('send-whatsapp-message', {
      body: {
        mode: 'dry_run',
        /* The Inbox's own door, so the dry run answers as an Inbox send would: inside the 24-hour window a saved template comes
           back as its free-text version (message_type 'text'), or says why it has none (src/lib/inWindowFreeText.ts). */
        via: 'inbox',
        phone: args.phone,
        lead_id: args.leadId,
        country: args.country ?? null,
        template_name: args.templateName,
        allow_resend: args.allowResend === true,
        ...(args.templateVars ? { template_vars: args.templateVars } : {}),
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
    return { ok: true, body: data.body ?? '', snapshot: data.template_snapshot ?? undefined, template: data.template ?? args.templateName, fellBack: data.fell_back,
      /* 'video' = a video template's in-window version (a normal video message, the words as its caption): free-form too. */
      sentAs: data.message_type === 'text' || data.message_type === 'video' ? 'text' : 'template', ...(data.message_type === 'video' ? { withVideo: true } : {}), ...(typeof data.no_free_text === 'string' ? { noFreeText: data.no_free_text } : {}) };
  }, [sms, queryClient, queryKey]);

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

  return { user, messages, leads, conversations, messagesForKey, auditByLeadId, auditRunningLeadIds, hasSiteFaultLeadIds, hasSiteFindingsLeadIds, crawlByLeadId, isLoading, isError, refetch: fetchAll, loadLead, send, sendVoice, sendMedia, preview, patchLeadStatus, patchLeadPotentialWork };
}
