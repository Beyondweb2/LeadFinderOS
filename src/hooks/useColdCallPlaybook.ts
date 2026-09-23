/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD CALL PLAYBOOK — the data read (2026-09-23).

   ⛔ READS ONLY. Six SELECTs through the operator's own session (RLS applies exactly as it does in
      Inbox and Outreach): the lead, its audits + run statuses, the chosen audit's latest run and
      queue rows, its newest lead-level crawl, and its WhatsApp messages. No functions.invoke, no
      insert/update/upsert/delete, no rpc — so opening a playbook can never start an audit, a crawl,
      an Apify run, a model call, or a send. scripts/cold-call-playbook.test.ts fails the build if
      any of those appears in this file or the dialog.

   ⛔ THE SELECTION RULES ARE BORROWED: resolveLeadReportAudit picks the report (the Inbox rule);
      buildReportData turns its rows into the same evidence the public report prints; the crawl
      sources are ordered exactly as useInbox orders them for the site-findings gate.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { newestUsableAudit, resolveLeadReportAudit, type ResolvableAudit } from '@/lib/auditReportResolver';
import { RUN_USABLE } from '@/lib/queueAuditStatus';
import { buildReportData, type QueueRow, type RunRow } from '@/lib/auditReport';
import { isAggregatorUrl } from '@/lib/aggregators';
import { buildColdCallPlaybook, type ColdCallPlaybook, type PlaybookLead, type PlaybookMessage } from '@/lib/coldCallPlaybook';
import type { FindingsSource } from '@/lib/siteFindings';
import type { CrawlStoredResult } from '@/lib/crawlResult';

// Several of these tables are not in the generated types; RLS still enforces access.
const sb = supabase as unknown as { from: (t: string) => any };

interface PlaybookAuditRow extends ResolvableAudit {
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
  ai_audit_runs?: Array<{ id: string; status: string | null; run_number: number | null; created_at: string | null; crawl_check: (CrawlStoredResult & { status?: string }) | null }> | null;
}

const LEAD_COLUMNS = 'id, business_name, phone, country, website, category, search_keyword, search_location, derived_town, status, contact_name';
const AUDIT_COLUMNS = 'id, short_code, lead_id, created_at, business_name, business_type, location_text, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, crawl_check:results->crawl_check)';
const MESSAGE_COLUMNS = 'id, created_at, direction, body, message_type, template_name, status';

/** The WhatsApp form of a stored phone (digits, country code, no plus) — the same shape
 *  whatsapp_messages.phone is stored in. Mirrors useInbox's normalizeWaNumber for UK numbers. */
function waDigits(raw: string | null | undefined, country?: string | null): string | null {
  let s = (raw ?? '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '') || null;
  const cc = (country || 'UK').toUpperCase();
  if (s.startsWith('0') && (cc === 'UK' || cc === 'GB')) return '44' + s.slice(1);
  return s.replace(/\D/g, '') || null;
}

/** Audit-run crawls, newest run first — the order useInbox hands resolveSiteFindings. */
function runCrawlSources(audit: PlaybookAuditRow | null): FindingsSource[] {
  return (audit?.ai_audit_runs ?? [])
    .filter((r) => RUN_USABLE.has(String(r.status)) && !!r.crawl_check)
    .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
    .map((r) => ({
      result: r.crawl_check,
      createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0,
      complete: r.crawl_check?.status === 'complete',
    }));
}

async function loadPlaybook(leadId: string): Promise<ColdCallPlaybook | null> {
  const { data: lead, error: leadErr } = await sb.from('outreach_leads').select(LEAD_COLUMNS).eq('id', leadId).maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return null;
  const phone = waDigits((lead as { phone?: string }).phone, (lead as { country?: string }).country);

  const [auditsRes, crawlRes, msgRes] = await Promise.all([
    fetchAllRows<PlaybookAuditRow>('Playbook (audits)', (from, to) =>
      sb.from('ai_audits').select(AUDIT_COLUMNS).eq('lead_id', leadId)
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    sb.from('lead_crawl_checks').select('result, created_at').eq('lead_id', leadId)
      .order('created_at', { ascending: false }).limit(1),
    fetchAllRows<PlaybookMessage>('Playbook (messages)', (from, to) =>
      sb.from('whatsapp_messages').select(MESSAGE_COLUMNS)
        .or(phone ? 'lead_id.eq.' + leadId + ',phone.eq.' + phone : 'lead_id.eq.' + leadId)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
  ]);
  if (crawlRes.error) throw crawlRes.error;
  const audits = auditsRes.rows;

  const reportAudit = resolveLeadReportAudit(audits, leadId);
  let report = null;
  if (reportAudit) {
    const [runRes, rowsRes] = await Promise.all([
      sb.from('ai_audit_runs').select('id, audit_id, run_number, status, mention_rate, results, created_at')
        .eq('audit_id', reportAudit.id).order('run_number', { ascending: false }).limit(1).maybeSingle(),
      fetchAllRows<QueueRow>('Playbook (queue rows)', (from, to) =>
        sb.from('ai_audit_queue').select('id, question, status, result').eq('audit_id', reportAudit.id)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    ]);
    if (runRes.error) throw runRes.error;
    const website = ((lead as { website?: string | null }).website ?? '').trim();
    report = buildReportData(rowsRes.rows, (runRes.data as RunRow | null) ?? null, {
      businessName: reportAudit.business_name ?? (lead as { business_name?: string }).business_name ?? '',
      businessType: reportAudit.business_type ?? '',
      locationText: reportAudit.location_text ?? '',
      specialisms: '',
      isAggregatorUrl,
      ownWebsite: website || undefined,
    });
  }

  const newestCrawl = (crawlRes.data ?? [])[0] as { result: CrawlStoredResult | null; created_at: string } | undefined;
  const auditRunning = audits.some((a) => (a.ai_audit_runs ?? []).some((r) => r.status === 'pending' || r.status === 'running'));

  return buildColdCallPlaybook({
    lead: lead as PlaybookLead,
    reportAudit,
    report,
    auditRunning,
    /* Deliberately newestUsableAudit, not the report audit — the same choice useInbox makes: a
       measurement's crawl is still real site data even though its report link is never shown. */
    runCrawls: runCrawlSources(newestUsableAudit(audits, leadId)),
    leadCrawl: newestCrawl ? { result: newestCrawl.result, createdAtMs: new Date(newestCrawl.created_at).getTime() } : null,
    messages: msgRes.rows,
    nowMs: Date.now(),
  });
}

/** Loads only while `enabled` (the playbook is open). Re-read on every open: it is cheap, and a
 *  call guide built from a stale cache would be the wrong call guide. */
export function useColdCallPlaybook(leadId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['cold-call-playbook', leadId],
    queryFn: () => loadPlaybook(leadId as string),
    enabled: enabled && !!leadId,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
