/* Deterministic paid-client action-plan reconciliation.
 * This is deliberately separate from the optional OpenAI clustering path: baseline completion must
 * produce a useful, retry-safe plan without another provider call. */
import { classifyWinnability, type EngineMap } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { type CrawlSignals } from "../../../src/lib/crawlCheck.ts";
import { cellNamed } from "../../../src/lib/namedSignal.ts";

type Client = any;
type Opportunity = {
  question: string; classification: "named" | "winnable" | "possible" | "low";
  verdict: string; reason: string; service: string; town: string;
  action: "build" | "optimise"; existingUrl: string | null; priority: number;
  named: boolean; fragmentation: string;
};

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s: string) => norm(s).replace(/\s+/g, "-").slice(0, 80) || "page";
const uniq = <T>(xs: T[]) => [...new Set(xs)];

function classification(result: ReturnType<typeof classifyWinnability>, namedAny: boolean): Opportunity["classification"] {
  if (namedAny || result.clientNamed) return "named";
  if (result.verdict === "open") return "winnable";
  if (result.verdict === "contested") return "possible";
  return "low";
}

function priority(kind: Opportunity["classification"]): number {
  return kind === "winnable" ? 1 : kind === "possible" ? 2 : kind === "named" ? 4 : 3;
}

function questionContext(question: string, services: string[], towns: string[], home: string): { service: string; town: string } {
  const q = norm(question);
  const service = services.find((s) => q.includes(norm(s))) ?? services[0] ?? "local service";
  const town = towns.find((t) => q.includes(norm(t))) ?? home;
  return { service, town };
}

function mergedEngine(rows: Array<Record<string, unknown>>): { result: EngineMap; namedAny: boolean } {
  const result: EngineMap = {};
  let namedAny = false;
  for (const row of rows) {
    const engines = (row.result ?? {}) as EngineMap;
    for (const [engine, raw] of Object.entries(engines)) {
      if (!raw || typeof raw !== "object") continue;
      const cur = result[engine] ?? { named: false, position: null, competitors: [], citations: [], answer_text: "" };
      cur.named = cur.named || cellNamed(raw);
      cur.self_named = cur.self_named || raw.self_named;
      cur.position = cur.position == null ? raw.position : raw.position == null ? cur.position : Math.min(cur.position, raw.position);
      cur.competitors = uniq([...cur.competitors, ...(raw.competitors ?? [])]);
      cur.citations = uniq([...cur.citations, ...(raw.citations ?? [])].map((c) => `${c.title}|${c.url}`)).map((v) => { const [title, ...u] = v.split("|"); return { title, url: u.join("|") }; });
      cur.answer_text = cur.answer_text || raw.answer_text;
      result[engine] = cur;
      if (cellNamed(raw)) namedAny = true;
    }
  }
  return { result, namedAny };
}

export function technicalTasks(crawl: unknown): Array<Record<string, unknown>> {
  const c = crawl as { status?: string; signals?: CrawlSignals } | null;
  if (!c?.signals || c.status === "unavailable" || c.signals.fetchFailed) return [];
  const s = c.signals;
  const tasks: Array<Record<string, unknown>> = [];
  if (s.searchBlocked?.length) tasks.push({ id: "crawl-search-blocked", title: "Allow search crawlers to reach the site", priority: "critical", status: "todo", detail: `${s.searchBlocked.join(", ")} blocked the homepage.` });
  if (s.clientRendered?.flagged) tasks.push({ id: "crawl-client-rendered", title: "Make the main page readable without client-side rendering", priority: "high", status: "todo", detail: `Only about ${s.clientRendered.visibleChars} characters were visible to crawlers.` });
  if (s.noJsonLd) tasks.push({ id: "crawl-structured-data", title: "Add appropriate LocalBusiness/service structured data", priority: "high", status: "todo", detail: "No structured data was found on the crawled homepage." });
  if (s.missingH1) tasks.push({ id: "crawl-h1", title: "Add a clear H1 describing the business and service", priority: "medium", status: "todo", detail: "No H1 was found on the crawled homepage." });
  if (s.duplicates) tasks.push({ id: "crawl-duplicate-pages", title: "Replace near-duplicate location pages with useful distinct content", priority: "high", status: "todo", detail: `${s.duplicates.clusterSize} pages were highly similar.` });
  if (s.thinPages > 0) tasks.push({ id: "crawl-thin-pages", title: "Strengthen thin pages with useful service/location answers", priority: "medium", status: "todo", detail: `${s.thinPages} sampled pages were below the crawl's content threshold.` });
  return tasks;
}

export async function reconcileActionPlan(service: Client, input: { auditId: string; userId: string; leadId: string | null }): Promise<{ ok: boolean; opportunities: Opportunity[]; technical: Array<Record<string, unknown>>; skipped?: string; error?: string }> {
  const { auditId, userId, leadId } = input;
  if (!leadId) return { ok: true, opportunities: [], technical: [], skipped: "no_lead" };
  const { data: audit, error: auditError } = await service.from("ai_audits")
    .select("id, lead_id, user_id, business_name, business_type, location_text, website, baseline_target_runs, baseline_completed_at")
    .eq("id", auditId).eq("user_id", userId).maybeSingle();
  if (auditError || !audit) return { ok: false, opportunities: [], technical: [], error: auditError?.message ?? "baseline_not_found" };
  const { data: ob } = await service.from("onboarding_responses")
    .select("services_list, areas_list, confirmed_location, source")
    .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const services = Array.isArray(ob?.services_list) ? ob.services_list.map(String).filter(Boolean) : [];
  const home = String(ob?.confirmed_location || audit.location_text || "").trim();
  const towns = uniq([home, ...(Array.isArray(ob?.areas_list) ? ob.areas_list.map(String) : [])].map((x) => x.trim()).filter(Boolean));
  const targetRuns = Math.max(1, Number(audit.baseline_target_runs ?? 1));
  const { data: runs } = await service.from("ai_audit_runs").select("id").eq("audit_id", auditId)
    .in("status", ["complete", "capped"]).order("created_at", { ascending: true }).limit(targetRuns);
  const runIds = (runs ?? []).map((r: { id: string }) => r.id);
  if (!runIds.length) return { ok: true, opportunities: [], technical: [], skipped: "baseline_not_complete" };
  const { data: rows } = await service.from("ai_audit_queue").select("question, result, run_id").in("run_id", runIds).eq("status", "done");
  const byQuestion = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows ?? []) {
    const q = String((row as { question?: string }).question ?? "").trim();
    if (q) (byQuestion.get(q) ?? byQuestion.set(q, []).get(q)!).push(row as Record<string, unknown>);
  }
  let { data: existingRows, error: existingError } = await service.from("client_pages")
    .select("id, job, primary_question, published_url, status, winnability, score_reasons")
    .eq("baseline_audit_id", auditId).eq("user_id", userId);
  if (existingError && /published_url/i.test(existingError.message ?? "")) {
    ({ data: existingRows, error: existingError } = await service.from("client_pages")
      .select("id, job, primary_question, status, winnability, score_reasons")
      .eq("baseline_audit_id", auditId).eq("user_id", userId));
  }
  if (existingError) return { ok: false, opportunities: [], technical: [], error: `client_pages read failed: ${existingError.message}` };
  const existing = (existingRows ?? []) as Array<Record<string, unknown>>;
  const opportunities: Opportunity[] = [];
  for (const [question, qRows] of byQuestion) {
    const merged = mergedEngine(qRows);
    const w = classifyWinnability(merged.result, { businessName: audit.business_name ?? "", locationText: home, ownWebsite: audit.website ?? "", isAggregatorUrl });
    const kind = classification(w, merged.namedAny);
    const ctx = questionContext(question, services, towns, home);
    const match = existing.find((p) => norm(String(p.primary_question ?? "")) === norm(question)
      || norm(String(p.job ?? "")).includes(norm(ctx.service)) && norm(String(p.job ?? "")).includes(norm(ctx.town)));
    opportunities.push({ question, classification: kind, verdict: w.verdict, reason: w.reason, service: ctx.service, town: ctx.town,
      action: match || (kind === "named" ? "optimise" : "build"), existingUrl: match?.published_url ? String(match.published_url) : null,
      priority: priority(kind), named: merged.namedAny, fragmentation: w.U >= 6 ? "high" : w.C === 0 && w.U >= 2 ? "fragmented" : "mixed" });
  }
  const technical = technicalTasks((await service.from("ai_audit_runs").select("results").eq("id", runIds[runIds.length - 1]).maybeSingle()).data?.results?.crawl_check);
  /* Upsert by question/service/town, never delete: operator edits and manual statuses survive a retry. */
  for (const op of opportunities.filter((x) => (x.classification === "winnable" || x.classification === "possible") && services.length > 0)) {
    const match = existing.find((p) => norm(String(p.primary_question ?? "")) === norm(op.question)
      || norm(String(p.job ?? "")).includes(norm(op.service)) && norm(String(p.job ?? "")).includes(norm(op.town)));
    const metadata = [
      op.action === "optimise" ? "optimise existing page" : "build new page",
      op.existingUrl ? `Existing URL: ${op.existingUrl}` : "",
      `Competitor fragmentation: ${op.fragmentation}`,
    ].filter(Boolean);
    if (match?.id) {
      await service.from("client_pages").update({ score_reasons: metadata, winnability: op.verdict, updated_at: new Date().toISOString() }).eq("id", match.id).eq("user_id", userId);
      continue;
    }
    const row = { user_id: userId, baseline_audit_id: auditId, lead_id: leadId, page_type: "qa", job: `${op.service} in ${op.town}`,
      topic: op.service, primary_question: op.question, slug: slug(`${op.service}-${op.town}`), rationale: `${op.reason} · ${op.action === "optimise" ? "optimise existing page" : "build new page"}`,
      winnability: op.verdict, score: Math.max(0, 100 - op.priority * 20), score_reasons: metadata, wave: op.priority, position: opportunities.indexOf(op), status: "planned", top_sources: [] };
    const { data: inserted, error } = await service.from("client_pages").insert(row).select("id").single();
    if (!error && inserted?.id) {
      existing.push({ id: inserted.id, job: row.job, primary_question: row.primary_question, published_url: null });
      await service.from("client_page_questions").upsert({ page_id: inserted.id, baseline_audit_id: auditId, question_text: op.question, named_rate: { named: op.named } }, { onConflict: "page_id,question_text" });
    }
  }
  const { data: lead } = await service.from("outreach_leads").select("delivery_checklist").eq("id", leadId).maybeSingle();
  const checklist = (lead?.delivery_checklist && typeof lead.delivery_checklist === "object" ? lead.delivery_checklist : {}) as Record<string, unknown>;
  const { error: checklistError } = await service.from("outreach_leads")
    .update({ delivery_checklist: { ...checklist, technical_fixes: technical, action_plan_ready_at: new Date().toISOString() } })
    .eq("id", leadId).eq("user_id", userId);
  if (checklistError) return { ok: false, opportunities, technical, error: `delivery checklist update failed: ${checklistError.message}` };
  return { ok: true, opportunities, technical };
}
