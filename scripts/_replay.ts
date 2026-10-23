// Throwaway (never staged): READ-ONLY replay of render-audit-report for every six-answer hook audit,
// with this checkout's renderer. Writes HTML + a summary to an output dir. No writes to the database.
// Usage: npx tsx scripts/_hookqa.ts <outDir> <serviceKeyFile>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildReportData, seoStyleForAudit } from '../src/lib/auditReport.ts';
import { renderReportHtml } from '../src/lib/aiAuditReportHtml.ts';
import { measuringState } from '../src/lib/measuringState.ts';
import { showOffer } from '../src/lib/buyOffer.ts';
import { paidReportKind } from '../src/lib/reportKind.ts';
import { buildFaultLines, CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from '../src/lib/crawlCheck.ts';
import { usableSiteEvidence } from '../src/lib/siteEvidence.ts';
import { isAggregatorUrl } from '../supabase/functions/_shared/aggregators.ts';
import { answerExcerpt } from '../src/lib/answerText.ts';

const [outDir, keyFile] = process.argv.slice(2);
const KEY = readFileSync(keyFile, 'utf8').trim();
const BASE = 'https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1';
async function get(path: string): Promise<any[]> {
  const r = await fetch(`${BASE}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
}
mkdirSync(outDir, { recursive: true });

const codes = (process.env.CODES ?? "").split(",");
const auditIds: string[] = [];
for (const c of codes) { const [a] = await get(`ai_audits?select=id&short_code=eq.${c}`); if (a) auditIds.push(a.id); }
const summary: any[] = [];
for (const auditId of auditIds) {
  const [audit] = await get(`ai_audits?select=id,short_code,business_name,business_type,location_text,specialism,website,has_website,is_market,lead_id,baseline_target_runs,is_measurement,audit_purpose&id=eq.${auditId}`);
  const [run] = await get(`ai_audit_runs?select=id,audit_id,run_number,status,mention_rate,results,created_at&audit_id=eq.${auditId}&order=run_number.desc&limit=1`);
  const runRows = await get(`ai_audit_runs?select=id,status,created_at&audit_id=eq.${auditId}`);
  const ids = runRows.map((r) => r.id).join(',');
  const queueRows = await get(`ai_audit_queue?select=id,question,status,result&run_id=in.(${ids})&order=created_at.asc`);
  let amountPaid = 0, leadWebsite = '', leadPlaceId: string | null = null, leadBaselineAuditId: string | null = null, leadRemeasureAuditId: string | null = null;
  const leadId = audit.lead_id ?? null;
  let lead: any = null;
  if (leadId) {
    [lead] = await get(`outreach_leads?select=amount_paid,website,place_id,baseline_audit_id,remeasure_audit_id&id=eq.${leadId}`);
    amountPaid = Number(lead?.amount_paid ?? 0) || 0;
    leadWebsite = String(lead?.website ?? '').trim();
    leadPlaceId = lead?.place_id ? String(lead.place_id) : null;
    leadBaselineAuditId = lead?.baseline_audit_id ?? null;
    leadRemeasureAuditId = lead?.remeasure_audit_id ?? null;
  }
  const ownWebsite = String(audit.website ?? '').trim() || leadWebsite;
  const hasWebsite: boolean | null = ownWebsite ? true : leadId ? (leadPlaceId ? false : null) : (audit.has_website === true ? true : audit.has_website === false ? false : null);
  const data: any = buildReportData(queueRows as never, run as never, {
    businessName: audit.business_name ?? '', businessType: audit.business_type ?? '', locationText: audit.location_text ?? '',
    specialisms: audit.specialism ?? '', isAggregatorUrl, ownWebsite, hasWebsite,
    seoStyle: seoStyleForAudit(audit.baseline_target_runs, audit.is_measurement),
  });
  if (!data) { summary.push({ code: audit.short_code, skipped: 'no data' }); continue; }
  const state = measuringState(runRows as never, audit.baseline_target_runs);
  if (state.measuring) data.measuring = { runsDone: state.runsDone, runsTarget: state.runsTarget };
  const kind = paidReportKind({ auditId: audit.id, auditPurpose: audit.audit_purpose ?? null, leadBaselineAuditId, leadRemeasureAuditId });
  if (kind) data.paidSummary = kind;
  data.showOffer = showOffer({ auditId: audit.id, amountPaid });
  data.offerUrl = leadId ? '#offer' : null;
  data.auditId = audit.id;
  data.requestCallUrl = '#request-call';
  data.generatedAtLabel = new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const runCrawl = run.results?.crawl_check;
  if (runCrawl?.status === 'complete' && (runCrawl.version ?? 0) >= CRAWL_CHECK_VERSION && runCrawl.signals) {
    if (!runCrawl.signals.fetchFailed) data.siteChecked = true;
    const faults = buildFaultLines(runCrawl.signals);
    if (faults.length) data.crawlFaults = faults;
  }
  const evidenceOf = (stored: any, atMs: number) => usableSiteEvidence(stored, atMs, CRAWL_FRESH_MS).filter((f: any) => f.tier === 'A' || f.tier === 'B');
  const runEvidence = runCrawl?.status === 'complete' ? evidenceOf(runCrawl, runCrawl.checked_at ? new Date(runCrawl.checked_at).getTime() : Date.now()) : [];
  if (runEvidence.length) data.siteEvidence = runEvidence;
  if (leadId) {
    const [cc] = await get(`lead_crawl_checks?select=result,created_at&lead_id=eq.${leadId}&order=created_at.desc&limit=1`);
    const fresh = !!cc && (Date.now() - new Date(cc.created_at).getTime()) < 30 * 86_400_000;
    const stored = cc?.result;
    const currentVer = (stored?.version ?? 1) >= CRAWL_CHECK_VERSION;
    const sig = stored?.signals;
    if (fresh && currentVer && sig) {
      if (!sig.fetchFailed) data.siteChecked = true;
      const faults = buildFaultLines(sig);
      if (faults.length && !data.crawlFaults) data.crawlFaults = faults;
    }
    if (!data.siteEvidence?.length && cc) {
      const le = evidenceOf(stored, new Date(cc.created_at).getTime());
      if (le.length) data.siteEvidence = le;
    }
  }
  const html = renderReportHtml(data);
  writeFileSync(`${outDir}/${audit.short_code}.html`, html);
  const h = data.hook;
  const ex = h?.gap ? answerExcerpt(h.gap.answerText || h.gap.answerExcerpt || '', 500) : null;
  summary.push({
    code: audit.short_code, biz: audit.business_name, shape: h?.shape ?? null,
    score: h?.score ? `${h.score.named}/${h.score.total}` : null, perEngine: h?.score?.perEngine.map((e: any) => `${e.label} ${e.named}/${e.total}`).join(', '),
    gapEngine: h?.gap?.engineLabel ?? null, excerpt: ex ? ex.blocks.reduce((t, b) => t + b.text.length, 0) : 0, rawLen: (h?.gap?.answerText ?? '').length,
    names: h?.gap?.namedInstead?.length ?? 0, rivals: h?.rivalsNamedInstead ?? null,
    website: data.crawlFaults?.length || data.siteEvidence?.length ? `issues(${(data.siteEvidence?.length ?? 0) + (data.crawlFaults?.length ?? 0)})` : hasWebsite === false ? 'none' : data.siteChecked ? 'clean' : 'unknown',
    measuring: !!data.measuring, nameCheck: !!data.nameNotJudgeable, incomplete: !!data.hookIncomplete, paid: !!data.paidSummary, concept4: html.includes('class="q4-head"'),
  });
}
writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 1));
console.table(summary.map(({ biz, ...r }) => r));
