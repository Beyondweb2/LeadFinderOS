/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — from LeadFinder's stored rows to the generator's inputs. Pure.

   The ONE place that decides which audit example, which research, which crawl facts and which
   phone feed a preview — used by the edge function AND by the local real-lead validation, so what
   was checked locally is what production runs. The callers only read rows and fetch pages.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { buildReportData, type QueueRow, type RunRow } from '../auditReport.ts';
import { planResearch, assembleResearch, usableFullCrawl, type CrawlRowInput, type PageFacts, type StoredResearchRow, type WarmLeadResearch, type ResearchFinding } from '../warmLeadResearch.ts';
import { extractSiteInfo } from '../siteInfo.ts';
import { readBrand } from './brand.ts';
import { pickHeadline, previewEligibility, type Eligibility, type ResearchForCard } from './findings.ts';
import { selectTemplate, templateKey, PROSPECT_TEMPLATES } from './templates/index.ts';
import { tradePackFor } from './trades.ts';
import { PROSPECT_PREVIEW_GENERATOR_VERSION, type FingerprintParts } from './freshness.ts';
import type { FactsInput, LeadFacts } from './facts.ts';
import type { ProspectHeadline, ProspectTemplate } from './types.ts';

export interface AuditBundle {
  audit: { id: string; business_name: string | null; business_type: string | null; location_text: string | null };
  run: RunRow;
  rows: QueueRow[];
}

/** The newest ORDINARY audit with a settled run — the same audit the warm reply reads: a hook /
 *  free check / manual audit, never a paid measurement (an operator document). */
// deno-lint-ignore no-explicit-any
export function pickOrdinaryAudit(audits: any[]): { audit: any; run: any } | null {
  // deno-lint-ignore no-explicit-any
  const sorted = [...audits].sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  for (const a of sorted) {
    const purpose = a.audit_purpose ?? null;
    if (a.is_measurement === true || !(purpose === null || purpose === 'audit' || purpose === 'free_check')) continue;
    // deno-lint-ignore no-explicit-any
    const runs = (Array.isArray(a.ai_audit_runs) ? [...a.ai_audit_runs] : []).sort((x: any, y: any) => (y.run_number ?? 0) - (x.run_number ?? 0));
    // deno-lint-ignore no-explicit-any
    const run = runs.find((r: any) => r.status === 'complete' || r.status === 'capped');
    if (run) return { audit: a, run };
  }
  return null;
}

export interface Gathered {
  website: string | null;
  trade: string | null;
  town: string | null;
  headline: ProspectHeadline | null;
  eligibility: Eligibility;
  parts: FingerprintParts;
  /** True when the stored warm research is fresh for this website and is reused as-is. */
  reuseResearch: boolean;
}

export function gatherPreview(i: {
  lead: LeadFacts;
  audit: AuditBundle;
  crawl: CrawlRowInput | null;
  researchRow: StoredResearchRow | null;
  isAggregatorUrl: (u: string) => boolean;
  nowMs: number;
  registry?: readonly ProspectTemplate[];
}): Gathered {
  const a = i.audit.audit;
  const trade = (a.business_type ?? '').trim() || i.lead.category || i.lead.search_keyword || null;
  const town = (a.location_text ?? '').trim() || i.lead.derived_town || i.lead.search_location || null;
  const raw = (i.lead.website ?? '').trim();
  const website = raw && !i.isAggregatorUrl(raw) ? raw : null;
  const data = buildReportData(i.audit.rows, i.audit.run, {
    businessName: a.business_name ?? i.lead.business_name ?? '', businessType: a.business_type ?? '', locationText: a.location_text ?? '',
    specialisms: '', isAggregatorUrl: i.isAggregatorUrl, ownWebsite: website || undefined,
  });
  const headline = pickHeadline(data, { auditId: a.id, runId: i.audit.run.id ?? null, trade, town });
  const eligibility = previewEligibility({ headline, auditComplete: true, hasWebsite: !!website, hasPhoneOrEmail: !!(i.lead.phone || i.lead.email), hasTown: !!town });
  const reuseResearch = !!i.researchRow?.research && planResearch({ row: i.researchRow, leadWebsite: website, refresh: false, nowMs: i.nowMs }).action === 'reuse';
  const choice = selectTemplate(tradePackFor(trade).key, i.registry ?? PROSPECT_TEMPLATES);
  const parts: FingerprintParts = {
    leadId: i.lead.id, website, auditId: a.id, runId: i.audit.run.id ?? null, crawlAt: i.crawl?.created_at ?? null,
    researchAt: reuseResearch ? i.researchRow?.generated_at ?? null : null,
    template: choice.ok ? templateKey(choice.template) : 'none', generator: PROSPECT_PREVIEW_GENERATOR_VERSION,
  };
  return { website, trade, town, headline, eligibility, parts, reuseResearch };
}

/** Only without a fresh full crawl (and without reusable research) are menu pages fetched. */
export function needsMenuPages(g: Gathered, crawl: CrawlRowInput | null, homeUrl: string, nowMs: number): boolean {
  return !g.reuseResearch && !usableFullCrawl(crawl, homeUrl, nowMs);
}

export function homeUrlFor(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export function siteDownFinding(website: string | null, home: PageFacts | null): ResearchFinding | null {
  if (!website || !home || home.ok) return null;
  const st = home.status;
  if (!(st === 404 || st === 410 || st >= 500)) return null;
  const what = st >= 500 ? `a server error (${st})` : `“Not found” (${st})`;
  return {
    id: st >= 500 ? 'rule:site_down_error' : 'rule:site_down_not_found',
    kind: 'crawl_indexing', category: 'technical',
    title: 'The website is not loading',
    detail: `When we loaded ${home.finalUrl || website} it returned ${what} instead of the homepage. Customers, Google and AI tools following that address currently reach an error page.`,
    evidence: [`HTTP ${st}`, home.finalUrl || website], keyDetails: [`HTTP ${st}`],
    pageUrl: home.finalUrl || website, strength: 5, source: 'rule', verified: true,
  };
}

/** Everything read → the generator's inputs. */
export function buildInputs(i: {
  lead: LeadFacts;
  gathered: Gathered;
  crawl: CrawlRowInput | null;
  researchRow: StoredResearchRow | null;
  pages: PageFacts[];
  homeHtml: string;
  contactPhone: string | null;
  nowIso: string;
  /** Their own theme stylesheet text (brand.ts stylesheetsToRead), for colours. Optional. */
  css?: string;
}): { facts: FactsInput; research: ResearchForCard | null; researchSource: 'warm_lead_research' | 'assembled' | 'none' } {
  const g = i.gathered;
  let research: WarmLeadResearch | null = null;
  let researchSource: 'warm_lead_research' | 'assembled' | 'none' = 'none';
  const homeUrl = g.website ? homeUrlFor(g.website) : '';
  if (g.reuseResearch && i.researchRow?.research) { research = i.researchRow.research; researchSource = 'warm_lead_research'; }
  else if (g.website) {
    research = assembleResearch({
      nowIso: i.nowIso, website: homeUrl, businessName: i.lead.business_name, trade: g.trade, town: g.town,
      pages: i.pages, crawl: i.crawl, audit: null, model: null, modelError: null, fetchMs: 0, analyseMs: null, researchMs: 0,
      nowYear: new Date(i.nowIso).getUTCFullYear(),
    });
    researchSource = 'assembled';
  }
  const home = i.pages[0] ?? null;
  const base = home?.finalUrl || homeUrl;
  /* ⛔ THEIR SITE IS DOWN. A homepage that answers 404/410 or a 5xx (fetched twice by the driver) is
     the strongest true thing we can say about it, and every older crawl finding is moot while it
     lasts (JOLT Electrical, live 2026-09-26: "Not found"). 401/403/429 are NOT this — those can be
     bot-blocking of our fetch, which proves nothing about what a customer sees. */
  const down = siteDownFinding(g.website, home);
  if (down) research = { ...(research as WarmLeadResearch), status: 'complete', technicallyClean: false, strongestFindings: [down], technicalFindings: [down], contentFindings: [], localVisibilityFindings: [] };
  let origin = '';
  try { origin = base ? new URL(base).origin : ''; } catch { /* none */ }
  /* The crawl's siteInfo first, FIELD BY FIELD: a stored crawl with an empty services list (E.E.S
     Electrical, live 2026-09-26) must not hide the services today's homepage lists. */
  const stored = (i.crawl?.result?.siteInfo ?? null) as Record<string, unknown> | null;
  const fresh = i.homeHtml && origin ? (extractSiteInfo(i.homeHtml, { origin }) as unknown as Record<string, unknown>) : null;
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '');
  const siteInfo = stored || fresh
    ? Object.fromEntries([...new Set([...Object.keys(stored ?? {}), ...Object.keys(fresh ?? {})])].map((k) => [k, filled(stored?.[k]) ? stored![k] : fresh?.[k] ?? null]))
    : null;
  const brand = i.homeHtml && base ? readBrand(i.homeHtml, base, i.lead.business_name, i.css ?? '') : null;
  const conflicts = research
    ? [...research.strongestFindings, ...research.technicalFindings, ...research.contentFindings]
      .filter((f, idx, arr) => /conflict/.test(f.kind) && arr.findIndex((x) => x.id === f.id) === idx)
      .map((f) => ({ kind: f.kind, title: f.title, detail: f.detail, evidence: f.evidence }))
    : [];
  return {
    facts: {
      lead: { ...i.lead, website: g.website },
      contactPhone: i.contactPhone,
      audit: { trade: g.trade, town: g.town },
      siteInfo: siteInfo as FactsInput['siteInfo'],
      pages: i.pages.map((p) => ({ url: p.finalUrl, ok: p.ok, text: p.text, metaDescription: p.metaDescription, title: p.title })),
      brand,
      researchConflicts: conflicts,
    },
    research: research
      ? { status: research.status, technicallyClean: research.technicallyClean, strongestFindings: research.strongestFindings, technicalFindings: research.technicalFindings, contentFindings: research.contentFindings, localVisibilityFindings: research.localVisibilityFindings }
      : (g.website ? null : { status: 'no_website', technicallyClean: false, strongestFindings: [] }),
    researchSource,
  };
}
