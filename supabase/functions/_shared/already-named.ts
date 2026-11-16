/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE BASELINE'S "ALREADY NAMED" SEARCHES, READ FROM THE BUSINESS'S DISCOVERY (Paul, 2026-11-15).
   The reads for src/lib/alreadyNamed.ts. Used by render-audit-report (the client's baseline page) and
   weekly-visibility (Paul's internal quarterly re-check). Reads only: it never writes, never asks AI.

   Which Discovery: the same business (the lead when the baseline has one, else the same name and website),
   made no later than the baseline, not archived; a rules-v2 copy (a re-scored copy, or one made after v2)
   is preferred over an older one, then the newest. Its STORED answers are scored exactly as its own
   Discovery report scores them (the same context and the same strict name match).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { cellNamed } from "../../../src/lib/namedSignal.ts";
import { theirAreas, type OppContext, type OppRow } from "../../../src/lib/reportOpportunity.ts";
import { buildReportModel } from "../../../src/lib/reportModel.ts";
import { auditRulesFor } from "../../../src/lib/auditVerdict.ts";
import { isRealCompetitor } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { alreadyNamedSearches } from "../../../src/lib/alreadyNamed.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface BaselineRef {
  id: string;
  business_name: string | null;
  website: string | null;
  lead_id: string | null;
  created_at: string;
}

export interface AlreadyNamed {
  discoveryId: string;
  discoveryCode: string | null;
  /** When the Discovery's answers were collected (its first run), ISO. */
  discoveryAt: string;
  /** "15 Nov 2026". */
  dateLabel: string;
  searches: string[];
}

const host = (u: string | null | undefined) => String(u ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

/** The Discovery's already-named searches for this baseline, minus its targets. null = no Discovery / nothing named. */
export async function alreadyNamedForBaseline(service: Service, b: BaselineRef, targets: string[], o: { placeId?: string | null } = {}): Promise<AlreadyNamed | null> {
  let q = service.from("ai_audits")
    .select("id, short_code, business_name, business_type, location_text, website, lead_id, created_at")
    .eq("audit_purpose", "discovery").is("archived_at", null)
    .lte("created_at", b.created_at).order("created_at", { ascending: false }).limit(10);
  if (b.lead_id) q = q.eq("lead_id", b.lead_id);
  else if (b.business_name) q = q.ilike("business_name", String(b.business_name).replace(/[%_]/g, (c) => "\\" + c));
  else return null;
  const { data: found, error } = await q;
  if (error || !Array.isArray(found) || !found.length) return null;
  const bHost = host(b.website);
  // deno-lint-ignore no-explicit-any
  const sameSite = (found as any[]).filter((d) => b.lead_id || !bHost || !host(d.website) || host(d.website) === bHost);
  if (!sameSite.length) return null;

  // Prefer the newest rules: a v3 Discovery (or re-scored copy, report_rules = 3), then v2, then the newest of any.
  // deno-lint-ignore no-explicit-any
  let pick: { d: any; runs: any[]; rules: 1 | 2 | 3 | 4 } | null = null;
  for (const d of sameSite) {
    const { data: runs } = await service.from("ai_audit_runs")
      .select("id, run_number, created_at, crawl:results->crawl_check, rules:results->report_rules").eq("audit_id", d.id).order("run_number", { ascending: true });
    const rs = (runs ?? []) as Array<{ rules?: unknown }>;
    const rules = auditRulesFor({ createdAt: d.created_at, runRules: rs.map((r) => r.rules) });
    if (!pick || rules > pick.rules) pick = { d, runs: rs as never[], rules };
    if (pick.rules >= 4) break;
  }
  if (!pick || !pick.runs.length) return null;
  const { d, runs, rules } = pick;

  const { data: qrows } = await service.from("ai_audit_queue")
    .select("question, status, result").in("run_id", runs.map((r: { id: string }) => r.id)).order("created_at", { ascending: true });
  const rows: OppRow[] = ((qrows ?? []) as Array<{ question: string; status: string; result: Record<string, unknown> | null }>)
    .filter((r) => r.status === "done" || r.result || (rules >= 2 && r.status === "failed"))
    .map((r) => ({ question: r.question, result: r.result }));
  if (!rows.length) return null;

  // The same context the Discovery's own report builds (render-audit-report).
  const bizName = String(d.business_name ?? ""), trade = String(d.business_type ?? ""), town = String(d.location_text ?? "");
  const nctx = { businessName: bizName, trade: trade || null, town: town || null };
  // deno-lint-ignore no-explicit-any
  const crawl = (runs as any[]).map((r) => r.crawl).find((c) => Array.isArray(c?.insights?.services) && c.insights.services.length) ?? null;
  const services = crawl ? (crawl.insights.services as Array<{ name?: string; coverage?: string }>).map((x) => ({ name: String(x.name ?? ""), dedicated: x.coverage === "dedicated" })) : [];
  const pageUrls: string[] = crawl ? ((crawl.signals?.checkedPages ?? []) as Array<{ url?: string }>).map((x) => String(x.url ?? "")) : [];
  const questions = [...new Set(rows.map((r) => r.question.trim()))];
  const website = String(d.website ?? "").trim() || String(b.website ?? "").trim();
  const ctx: OppContext = {
    businessName: bizName, services, pageUrls, town,
    siteText: crawl ? [bizName, trade, ...services.map((x) => x.name), ...pageUrls].join(" ").toLowerCase() : undefined,
    areas: theirAreas({ locationText: town, pageUrls, questions, fromDiscovery: true }),
    isDirectoryHost: (h: string) => isAggregatorUrl("https://" + h),
    isNamed: (c: unknown) => cellNamed(c as never, nctx),
    isRival: (n: string) => isRealCompetitor(n, town),
    rules,
    identity: rules >= 2 ? { name: bizName, domains: website ? [website] : [], placeIds: o.placeId ? [o.placeId] : [] } : undefined,
  };
  const m = buildReportModel(rows, ctx, { kind: "opportunity", businessName: bizName, town, dateLabel: "", website: { state: "not_checked", issues: [] }, order: questions, bestCount: 10 });
  const searches = alreadyNamedSearches(m.all, targets);
  if (!searches.length) return null;
  // The answers' own date: a re-scored copy keeps each run's original created_at.
  const at = (runs as Array<{ created_at: string }>).map((r) => r.created_at).filter(Boolean).sort()[0] ?? d.created_at;
  return {
    discoveryId: d.id, discoveryCode: d.short_code ?? null, discoveryAt: at,
    dateLabel: new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    searches,
  };
}
