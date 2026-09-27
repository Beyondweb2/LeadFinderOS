// site-research — the ONE path that reads a prospect's website for a sales conversation, and saves
// what it found (warm_lead_research, one row per lead). Moved here verbatim from warm-lead-reply on
// 2026-09-26 so the voice-note script generator reuses it instead of growing a second copy.
//
// Callers: warm-lead-reply (Research & draft reply) and voice-note-script. Each caller keeps its OWN
// gate in front of this (the warm drafter's sales stage; the voice note's hook evidence) — this module
// decides only HOW to research, never WHETHER.
//
// THE ORDER, CHEAPEST FIRST (planResearch / usableFullCrawl in src/lib/warmLeadResearch.ts):
//   saved research, fresh, same website → reuse, fetch nothing · stale → one homepage fetch, reuse if
//   unchanged · a recent FULL crawl of the same host replaces the menu-page fetches · otherwise the
//   homepage + a few of its own menu pages. The standard crawl-check row and the audit are folded in.
// ⛔ It never starts a crawl job and never writes lead_crawl_checks.
//
// ⛔ IT NEVER SENDS A MESSAGE. No Graph call, no import of the sender, no whatsapp_* writes.
import { logOpenAiUsage } from "./openai-usage.ts";
import { resolveAuditReplyVars, HOOK_NO_GAP_REASON } from "./audit-reply.ts";
import { shortReportUrl } from "../../../src/lib/reportSlug.ts";
import {
  planResearch, extractPageFacts, pickResearchPages, assembleResearch, noWebsiteResearch,
  contentHash, buildResearchPrompt, usableFullCrawl, RESEARCH_SYSTEM_PROMPT, RESEARCH_TOOL, RESEARCH_MODEL,
  WARM_RESEARCH_FETCH_TIMEOUT_MS, WARM_RESEARCH_DEADLINE_MS, WARM_RESEARCH_MAX_PAGES,
  type AuditContext, type PageFacts, type StoredResearchRow, type WarmLeadResearch, type CrawlRowInput, type ModelResearchOutput,
} from "../../../src/lib/warmLeadResearch.ts";

export const WARM_RESEARCH_TABLE = "warm_lead_research";
const MAX_BODY_BYTES = 1_000_000;
const OPENAI_TIMEOUT_MS = 45_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface ResearchLead {
  id: string; user_id: string; business_name: string | null; website: string | null; phone: string | null; country: string | null;
  category: string | null; search_keyword: string | null; search_location: string | null; derived_town: string | null; contact_name: string | null;
  is_archived: boolean | null;
  place_id?: string | null;
  google_maps_url?: string | null;
}

/** The lead columns every research caller selects. */
export const RESEARCH_LEAD_COLUMNS = "id, user_id, business_name, website, phone, country, category, search_keyword, search_location, derived_town, contact_name, is_archived, place_id, google_maps_url";

export const leadTrade = (l: ResearchLead) => (l.category || l.search_keyword || "").trim() || null;
export const leadTown = (l: ResearchLead) => (l.derived_town || l.search_location || "").trim() || null;

/* ───────────────────────── fetching ───────────────────────── */

/** Public http(s) only. A lead's website comes from Google Places or an operator, but this runs a
 *  server-side fetch, so a loopback / private-range address is refused rather than followed. */
function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    if (h.startsWith("[") || h.includes(":")) return false;
    return true;
  } catch { return false; }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text().catch(() => "");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.byteLength; }
    }
  } catch { /* keep what arrived */ } finally { try { await reader.cancel(); } catch { /* closed */ } }
  const joined = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
  let at = 0;
  for (const c of chunks) { const n = Math.min(c.byteLength, joined.length - at); if (n <= 0) break; joined.set(c.subarray(0, n), at); at += n; }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

export async function fetchSitePage(url: string): Promise<PageFacts> {
  if (!isPublicHttpUrl(url)) return extractPageFacts("", url, url, 0, false);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WARM_RESEARCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: controller.signal });
    const type = res.headers.get("content-type") ?? "";
    const html = /html|xml|text/i.test(type) || !type ? await readCapped(res) : "";
    const finalUrl = res.url && /^https?:\/\//i.test(res.url) ? res.url : url;
    return extractPageFacts(html, url, finalUrl, res.status, res.ok && html.length > 0);
  } catch {
    return extractPageFacts("", url, url, 0, false);
  } finally {
    clearTimeout(t);
  }
}

/* ───────────────────────── the model ───────────────────────── */

export type ModelCall =
  | { ok: true; args: unknown; promptTokens: number; completionTokens: number }
  | { ok: false; error: string };

// deno-lint-ignore no-explicit-any
export async function callModel(model: string, system: string, user: string, tool: any, temperature: number): Promise<ModelCall> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: false, error: "openai_not_configured" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [tool], tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 429 || /insufficient_quota|credit_balance_exhausted/i.test(body)) return { ok: false, error: "no_credits" };
      return { ok: false, error: `openai_http_${res.status}` };
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (typeof raw !== "string") return { ok: false, error: "model_no_tool_output" };
    let args: unknown;
    try { args = JSON.parse(raw); } catch { return { ok: false, error: "model_bad_json" }; }
    return { ok: true, args, promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 };
  } catch (e) {
    return { ok: false, error: (e as Error)?.name === "AbortError" ? "openai_timeout" : "openai_request_failed" };
  } finally {
    clearTimeout(t);
  }
}

/* ───────────────────────── reading what we already hold (no spend) ───────────────────────── */

/** The lead's newest ordinary audit (hook / free check), as the research needs it. DB reads only. */
export async function loadAuditContext(service: Service, lead: ResearchLead): Promise<AuditContext | null> {
  const { data: audits } = await service.from("ai_audits")
    .select("id, short_code, created_at, business_type, location_text, audit_purpose, is_measurement, ai_audit_runs(status, run_number, summary:results->summary)")
    .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10);
  // deno-lint-ignore no-explicit-any
  const list: any[] = Array.isArray(audits) ? audits : [];
  // deno-lint-ignore no-explicit-any
  let audit: any = null; let summary: any = null;
  for (const a of list) {
    const purpose = a.audit_purpose ?? null;
    if (a.is_measurement === true || !(purpose === null || purpose === "audit" || purpose === "free_check")) continue;
    // deno-lint-ignore no-explicit-any
    const runs = (Array.isArray(a.ai_audit_runs) ? [...a.ai_audit_runs] : []).sort((x: any, y: any) => (y.run_number ?? 0) - (x.run_number ?? 0));
    // deno-lint-ignore no-explicit-any
    const done = runs.find((r: any) => r.status === "complete" || r.status === "capped");
    if (done) { audit = a; summary = done.summary ?? null; break; }
  }
  if (!audit) return null;
  const vars = await resolveAuditReplyVars(service, lead.id).catch((e: unknown) => ({ ok: false as const, reason: String((e as Error)?.message ?? e) }));
  const sameAudit = vars.ok && vars.auditId === audit.id;
  return {
    auditId: audit.id,
    reportUrl: audit.short_code ? shortReportUrl(audit.short_code) : null,
    createdAt: audit.created_at ?? null,
    trade: (audit.business_type ?? "").trim() || leadTrade(lead),
    town: (audit.location_text ?? "").trim() || leadTown(lead),
    competitors: sameAudit && vars.ok ? vars.rivals.slice(0, 3) : [],
    namedEverywhere: !vars.ok && vars.reason.startsWith(HOOK_NO_GAP_REASON),
    namedDatapoints: typeof summary?.named_datapoints === "number" ? summary.named_datapoints : null,
    totalDatapoints: typeof summary?.total_datapoints === "number" ? summary.total_datapoints : null,
    unavailableReason: !vars.ok && !vars.reason.startsWith(HOOK_NO_GAP_REASON) ? vars.reason : null,
  };
}

export async function loadCrawlRow(service: Service, leadId: string): Promise<CrawlRowInput | null> {
  const { data } = await service.from("lead_crawl_checks").select("created_at, result, mode, full_evidence").eq("lead_id", leadId).maybeSingle();
  return (data as CrawlRowInput | null) ?? null;
}

async function loadResearchRow(service: Service, leadId: string): Promise<StoredResearchRow | null> {
  const { data, error } = await service.from(WARM_RESEARCH_TABLE).select("website, research, research_status, generated_at, revalidated_at").eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function saveResearch(service: Service, lead: ResearchLead, r: WarmLeadResearch) {
  const { error } = await service.from(WARM_RESEARCH_TABLE).upsert({
    lead_id: lead.id, user_id: lead.user_id, website: r.website, research: r, research_status: r.status,
    generated_at: r.generatedAt, source_crawl_at: r.sourceCrawlAt, content_hash: r.contentHash,
    revalidated_at: null, research_ms: r.timings.researchMs, updated_at: new Date().toISOString(),
  }, { onConflict: "lead_id" });
  if (error) throw error;
}

/* ───────────────────────── the research pass ───────────────────────── */

export interface SiteResearchOutcome {
  /** 'reuse' | 'no_website' | 'revalidated' | 'changed' | the plan's own reason for a fresh pass. */
  plan: string;
  research: WarmLeadResearch | null;
  /** Set only on a fresh pass: whether a recent full crawl replaced the menu-page fetches. */
  usedFullCrawl: boolean | null;
  ms: number;
}

/**
 * Research the lead's site the cheapest honest way and save it. The caller has already decided the
 * lead may be researched. `usage` names who pays for the research model call in api_usage_log.
 */
export async function runSiteResearch(
  service: Service, lead: ResearchLead, operatorId: string, refresh: boolean,
  usage: { functionName: string },
): Promise<SiteResearchOutcome> {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const row = await loadResearchRow(service, lead.id);
  const plan = planResearch({ row, leadWebsite: lead.website, refresh, nowMs: started });

  if (plan.action === "reuse") {
    return { plan: "reuse", research: row?.research ?? null, usedFullCrawl: null, ms: Date.now() - started };
  }
  const audit = await loadAuditContext(service, lead);
  if (plan.action === "no_website") {
    const r = noWebsiteResearch(nowIso, audit);
    await saveResearch(service, lead, r);
    return { plan: "no_website", research: r, usedFullCrawl: null, ms: Date.now() - started };
  }

  const website = (lead.website ?? "").trim();
  const homeUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const fetchStarted = Date.now();
  const home = await fetchSitePage(homeUrl);

  // Stale research, same homepage text → the site has not materially changed: keep it.
  if (plan.action === "revalidate" && home.ok && row?.research?.contentHash && contentHash(home.text) === row.research.contentHash) {
    await service.from(WARM_RESEARCH_TABLE).update({ revalidated_at: nowIso, updated_at: nowIso }).eq("lead_id", lead.id);
    return { plan: "revalidated", research: row.research, usedFullCrawl: null, ms: Date.now() - started };
  }

  /* ⛔ A RECENT FULL CRAWL OF THIS SITE REPLACES THE MENU-PAGE FETCHES. It already read every page and
     paid for it; its measured findings go into the record (assembleResearch → fullCrawlFindings). The
     homepage is still read once, for the words only page text carries (hours, positioning, summary). */
  const crawl = await loadCrawlRow(service, lead.id);
  const full = usableFullCrawl(crawl, homeUrl, started);
  const pages: PageFacts[] = [home];
  if (home.ok && !full) {
    const targets = pickResearchPages(home, WARM_RESEARCH_MAX_PAGES - 1);
    const deadline = fetchStarted + WARM_RESEARCH_DEADLINE_MS;
    const rest = await Promise.all(targets.map((u) => (Date.now() < deadline ? fetchSitePage(u) : Promise.resolve(extractPageFacts("", u, u, 0, false)))));
    pages.push(...rest);
  }
  const fetchMs = Date.now() - fetchStarted;

  // The model reads the same pages; its findings are verified against them in assembleResearch.
  let model: ModelResearchOutput | null = null;
  let modelError: string | null = null;
  let analyseMs: number | null = null;
  if (home.ok) {
    const analyseStarted = Date.now();
    const observed = assembleResearch({ nowIso, website: homeUrl, businessName: lead.business_name, trade: leadTrade(lead), town: leadTown(lead), pages, crawl, audit, model: null, modelError: null, fetchMs, analyseMs: null, researchMs: 0, nowYear: new Date().getUTCFullYear() });
    // Everything code already measured (rules, the crawl row, the audit) — the model must not repeat it.
    const measured = [...observed.technicalFindings, ...observed.contentFindings, ...observed.localVisibilityFindings];
    const call = await callModel(RESEARCH_MODEL, RESEARCH_SYSTEM_PROMPT, buildResearchPrompt({ businessName: lead.business_name, trade: leadTrade(lead), town: leadTown(lead), pages, observed: measured }), RESEARCH_TOOL, 0.2);
    analyseMs = Date.now() - analyseStarted;
    if (call.ok) {
      model = call.args as ModelResearchOutput;
      await logOpenAiUsage(service, { functionName: usage.functionName, apiType: "openai_warm_research", model: RESEARCH_MODEL, promptTokens: call.promptTokens, completionTokens: call.completionTokens, userId: operatorId, triggerSource: "user" });
    } else {
      modelError = call.error;
    }
  }

  const r = assembleResearch({
    nowIso, website: homeUrl, businessName: lead.business_name, trade: leadTrade(lead), town: leadTown(lead),
    pages, crawl, audit, model, modelError, fetchMs, analyseMs, researchMs: Date.now() - started, nowYear: new Date().getUTCFullYear(),
  });
  await saveResearch(service, lead, r);
  return { plan: plan.action === "revalidate" ? "changed" : plan.reason, research: r, usedFullCrawl: !!full, ms: Date.now() - started };
}
