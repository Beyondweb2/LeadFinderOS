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
import { toWhatsAppDigits } from '@/lib/waNumber';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { readLeadRow } from '@/lib/leadRead';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { newestUsableAudit, resolveLeadReportAudit, type ResolvableAudit } from '@/lib/auditReportResolver';
import { RUN_USABLE } from '@/lib/queueAuditStatus';
import { buildReportData, type QueueRow, type RunRow } from '@/lib/auditReport';
import { isAggregatorUrl } from '@/lib/aggregators';
import { buildColdCallPlaybook, callCardAudit, type ColdCallPlaybook, type PlaybookLead, type PlaybookMessage } from '@/lib/coldCallPlaybook';
import type { FindingsSource } from '@/lib/siteFindings';
import { callAuditProgress, callScriptRecheckMs } from '@/lib/callScriptGate';
import type { CrawlStoredResult } from '@/lib/crawlResult';

// Several of these tables are not in the generated types; RLS still enforces access.
const sb = supabase as unknown as { from: (t: string) => any };

export interface PlaybookAuditRow extends ResolvableAudit {
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
  ai_audit_runs?: Array<{ id: string; status: string | null; run_number: number | null; created_at: string | null; crawl_check: (CrawlStoredResult & { status?: string }) | null }> | null;
}

const LEAD_COLUMNS = 'id, business_name, phone, country, website, category, search_keyword, search_location, derived_town, status, contact_name';
export const PLAYBOOK_AUDIT_COLUMNS = 'id, short_code, lead_id, created_at, business_name, business_type, location_text, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, crawl_check:results_crawl_check)';
const MESSAGE_COLUMNS = 'id, created_at, direction, body, message_type, template_name, status';

/** The WhatsApp form of a stored phone (digits, country code, no plus) — the same shape
 *  whatsapp_messages.phone is stored in. Mirrors useInbox's normalizeWaNumber for UK numbers. */
function waDigits(raw: string | null | undefined, country?: string | null): string | null {
  return toWhatsAppDigits(raw, country); // ONE rule, src/lib/waNumber.ts
}

/** Audit-run crawls, newest run first — the order useInbox hands resolveSiteFindings. */
export function runCrawlSources(audit: PlaybookAuditRow | null): FindingsSource[] {
  return (audit?.ai_audit_runs ?? [])
    .filter((r) => RUN_USABLE.has(String(r.status)) && !!r.crawl_check)
    .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0))
    .map((r) => ({
      result: r.crawl_check,
      createdAtMs: r.crawl_check?.checked_at ? new Date(r.crawl_check.checked_at).getTime() : r.created_at ? new Date(r.created_at).getTime() : 0,
      complete: r.crawl_check?.status === 'complete',
    }));
}

async function loadPlaybook(leadId: string, callerName: string | null): Promise<ColdCallPlaybook | null> {
  /* The admin's read is unchanged; a salesperson's comes from sales_leads (src/lib/leadRead.ts). */
  const { data: lead, error: leadErr } = await readLeadRow<Record<string, unknown>>(leadId, LEAD_COLUMNS);
  if (leadErr) throw leadErr;
  if (!lead) return null;
  const phone = waDigits((lead as { phone?: string }).phone, (lead as { country?: string }).country);

  const [auditsRes, crawlRes, msgRes] = await Promise.all([
    fetchAllRows<PlaybookAuditRow>('Playbook (audits)', (from, to) =>
      sb.from('ai_audits').select(PLAYBOOK_AUDIT_COLUMNS).eq('lead_id', leadId)
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
    lead: lead as unknown as PlaybookLead,
    reportAudit,
    report,
    auditRunning,
    auditProgress: callAuditProgress(audits, leadId),
    /* Deliberately newestUsableAudit, not the report audit — the same choice useInbox makes: a
       measurement's crawl is still real site data even though its report link is never shown. */
    runCrawls: runCrawlSources(newestUsableAudit(audits, leadId)),
    leadCrawl: newestCrawl ? { result: newestCrawl.result, createdAtMs: new Date(newestCrawl.created_at).getTime() } : null,
    messages: msgRes.rows,
    nowMs: Date.now(),
    callerName,
  });
}

/* ── THE CALL CARD'S ONE LINE FOR MANY LEADS AT ONCE ("Check before calling" results, fix/07) ─────
   The SAME reads and the SAME rules as loadPlaybook above — resolveLeadReportAudit picks the report,
   buildReportData reads it, the crawl sources are ordered the same way, callCardAudit writes the line —
   batched across the leads so twenty finished checks cost four reads, not a hundred and twenty. Reads
   only, through the rep's own session (RLS). */
export interface CallCardLead { id: string; business_name: string | null; website: string | null; phone?: string | null }
export type CallCardSummary = ReturnType<typeof callCardAudit>;

export async function loadCallCardSummaries(leads: CallCardLead[]): Promise<Record<string, CallCardSummary>> {
  const ids = leads.map((l) => l.id);
  if (!ids.length) return {};
  const [auditsRes, crawlRes] = await Promise.all([
    fetchAllRows<PlaybookAuditRow>('Check before calling (audits)', (from, to) =>
      sb.from('ai_audits').select(PLAYBOOK_AUDIT_COLUMNS).in('lead_id', ids)
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to)),
    sb.from('lead_crawl_checks').select('lead_id, result, created_at').in('lead_id', ids),
  ]);
  if (crawlRes.error) throw crawlRes.error;
  const audits = auditsRes.rows;
  const reportAudits = new Map<string, PlaybookAuditRow>();
  for (const id of ids) { const a = resolveLeadReportAudit(audits, id); if (a) reportAudits.set(id, a); }
  const reportIds = [...new Set([...reportAudits.values()].map((a) => a.id))];
  const runsByAudit = new Map<string, RunRow>();
  const rowsByAudit = new Map<string, QueueRow[]>();
  if (reportIds.length) {
    const [runRes, rowsRes] = await Promise.all([
      fetchAllRows<RunRow & { audit_id: string }>('Check before calling (runs)', (from, to) =>
        sb.from('ai_audit_runs').select('id, audit_id, run_number, status, mention_rate, results, created_at').in('audit_id', reportIds)
          .order('run_number', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllRows<QueueRow & { audit_id: string }>('Check before calling (queue rows)', (from, to) =>
        sb.from('ai_audit_queue').select('id, audit_id, question, status, result').in('audit_id', reportIds)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    ]);
    for (const r of runRes.rows) {
      const cur = runsByAudit.get(r.audit_id) as (RunRow & { run_number?: number | null }) | undefined;
      if (!cur || Number((r as { run_number?: number | null }).run_number ?? 0) > Number(cur.run_number ?? 0)) runsByAudit.set(r.audit_id, r);
    }
    for (const q of rowsRes.rows) (rowsByAudit.get(q.audit_id) ?? rowsByAudit.set(q.audit_id, []).get(q.audit_id)!).push(q);
  }
  const crawlByLead = new Map<string, { result: CrawlStoredResult | null; created_at: string }>();
  for (const c of (crawlRes.data ?? []) as Array<{ lead_id: string; result: CrawlStoredResult | null; created_at: string }>) {
    const cur = crawlByLead.get(c.lead_id);
    if (!cur || Date.parse(c.created_at) > Date.parse(cur.created_at)) crawlByLead.set(c.lead_id, c);
  }
  const out: Record<string, CallCardSummary> = {};
  for (const l of leads) {
    const leadAudits = audits.filter((a) => a.lead_id === l.id);
    const reportAudit = reportAudits.get(l.id) ?? null;
    const website = (l.website ?? '').trim();
    const report = reportAudit ? buildReportData(rowsByAudit.get(reportAudit.id) ?? [], runsByAudit.get(reportAudit.id) ?? null, {
      businessName: reportAudit.business_name ?? l.business_name ?? '', businessType: reportAudit.business_type ?? '',
      locationText: reportAudit.location_text ?? '', specialisms: '', isAggregatorUrl, ownWebsite: website || undefined,
    }) : null;
    const crawl = crawlByLead.get(l.id);
    out[l.id] = callCardAudit({
      lead: { id: l.id, business_name: l.business_name, phone: l.phone ?? null, website: l.website },
      reportAudit, report,
      auditRunning: leadAudits.some((a) => (a.ai_audit_runs ?? []).some((r) => r.status === 'pending' || r.status === 'running')),
      runCrawls: runCrawlSources(newestUsableAudit(leadAudits, l.id)),
      leadCrawl: crawl ? { result: crawl.result, createdAtMs: new Date(crawl.created_at).getTime() } : null,
      nowMs: Date.now(),
    });
  }
  return out;
}

/** The call card's line for each finished lead in a batch. Re-read when the set of finished leads changes. */
export function useCallCardSummaries(leads: CallCardLead[]) {
  const key = leads.map((l) => l.id).sort().join(',');
  return useQuery({
    queryKey: ['call-card-summaries', key],
    queryFn: () => loadCallCardSummaries(leads),
    enabled: leads.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** Loads only while `enabled` (the playbook is open). Re-read on every open: it is cheap, and a
 *  call guide built from a stale cache would be the wrong call guide. */
export function useColdCallPlaybook(leadId: string | null, enabled: boolean) {
  /* The script is said by whoever is signed in (2026-09-28): a salesperson's own name, not Paul's.
     Names come from the team directory (names only, any role may read it). */
  const { user } = useAuth();
  const team = useTeamDirectory();
  const callerName = user ? team.byId.get(user.id)?.display_name ?? null : null;
  return useQuery({
    queryKey: ['cold-call-playbook', leadId, callerName],
    queryFn: () => loadPlaybook(leadId as string, callerName),
    enabled: enabled && !!leadId,
    staleTime: 0,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    /* The script is locked until the check is in (callScriptGate.ts): while it is queued or running, read again
       so the script appears by itself. Reads only, as above. */
    refetchInterval: (query) => (leadId ? callScriptRecheckMs(leadId, query.state.data) : false),
  });
}
