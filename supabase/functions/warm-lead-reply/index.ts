// warm-lead-reply — the Inbox's "Research & draft reply" (2026-09-25, Paul's brief).
//
// A cold prospect replied. This function gathers what LeadFinder already holds, reads their site
// once, saves the research, and drafts a reply for Paul to edit and send himself.
//
// ⛔ IT NEVER SENDS A MESSAGE. It returns TEXT. There is no Graph call, no import of the sender, and
//    no write to whatsapp_messages / whatsapp_sends anywhere in this file — the draft goes into the
//    Inbox composer and leaves only when Paul presses Send, through send-whatsapp-message and every
//    check it already makes (window, cap, ownership). scripts/warm-lead-reply.test.ts pins this.
//
// THREE ACTIONS, and only one of them ever touches the prospect's website:
//   · status   — reads the saved research row. No fetch, no model. Drives the button's label.
//   · research — the ONLY path that fetches the site. planResearch() decides: reuse (fetch nothing),
//                revalidate (one homepage fetch, reuse if unchanged), or a targeted pass (homepage +
//                a few menu pages). "Refresh research" is `refresh: true`. Never a full crawl.
//   · draft    — reads the saved row + the conversation + the audit, and calls the model. It has NO
//                site-fetch path, which is what makes "Regenerate never re-crawls" structural rather
//                than remembered.
//
// Auth: the operator's own JWT (resolveOperator), and the lead must be theirs — the same ownership
// send-whatsapp-message applies, so this can never draft for a conversation the sender would refuse.
// The table it writes (warm_lead_research) has RLS on and NO policies: service role only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOperator, isUpstreamOutage } from "../_shared/operator-auth.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import { resolveAuditReplyVars, HOOK_NO_GAP_REASON } from "../_shared/audit-reply.ts";
import { shortReportUrl } from "../../../src/lib/reportSlug.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import {
  planResearch, researchFreshness, extractPageFacts, pickResearchPages, assembleResearch, noWebsiteResearch,
  contentHash, buildResearchPrompt, RESEARCH_SYSTEM_PROMPT, RESEARCH_TOOL, RESEARCH_MODEL,
  WARM_RESEARCH_FETCH_TIMEOUT_MS, WARM_RESEARCH_DEADLINE_MS, WARM_RESEARCH_MAX_PAGES,
  type AuditContext, type PageFacts, type StoredResearchRow, type WarmLeadResearch, type CrawlRowInput, type ModelResearchOutput,
} from "../../../src/lib/warmLeadResearch.ts";
import {
  buildReplyContext, buildReplyPrompt, checkReply, fallbackReply, parseModelReply, ruleSalesFacts, mergeSalesFacts,
  latestInbound, REPLY_SYSTEM_PROMPT, REPLY_TOOL, REPLY_MODEL,
  type SalesFacts, type ThreadMessage,
} from "../../../src/lib/warmReply.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TABLE = "warm_lead_research";
const ROW_COLUMNS = "lead_id, website, research, research_status, generated_at, revalidated_at, sales_facts, last_draft";
const MAX_BODY_BYTES = 1_000_000;
const OPENAI_TIMEOUT_MS = 45_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// deno-lint-ignore no-explicit-any
type Service = any;

interface LeadRow {
  id: string; user_id: string; business_name: string | null; website: string | null; phone: string | null; country: string | null;
  category: string | null; search_keyword: string | null; search_location: string | null; derived_town: string | null; contact_name: string | null;
  is_archived: boolean | null;
}

/* ───────────────────────── fetching (research action ONLY) ───────────────────────── */

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

async function fetchSitePage(url: string): Promise<PageFacts> {
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

type ModelCall =
  | { ok: true; args: unknown; promptTokens: number; completionTokens: number }
  | { ok: false; error: string };

// deno-lint-ignore no-explicit-any
async function callModel(model: string, system: string, user: string, tool: any, temperature: number): Promise<ModelCall> {
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

async function loadLead(service: Service, leadId: string, operatorId: string): Promise<LeadRow | null> {
  const { data, error } = await service.from("outreach_leads")
    .select("id, user_id, business_name, website, phone, country, category, search_keyword, search_location, derived_town, contact_name, is_archived")
    .eq("id", leadId).maybeSingle();
  if (error) throw error;
  const l = data as LeadRow | null;
  return l && l.user_id === operatorId ? l : null;
}

async function loadRow(service: Service, leadId: string): Promise<(StoredResearchRow & { sales_facts: SalesFacts | null; last_draft: unknown }) | null> {
  const { data, error } = await service.from(TABLE).select(ROW_COLUMNS).eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

const leadTrade = (l: LeadRow) => (l.category || l.search_keyword || "").trim() || null;
const leadTown = (l: LeadRow) => (l.derived_town || l.search_location || "").trim() || null;

/** The lead's newest ordinary audit (hook / free check), as the reply needs it. DB reads only. */
async function loadAuditContext(service: Service, lead: LeadRow): Promise<AuditContext | null> {
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

async function loadCrawlRow(service: Service, leadId: string): Promise<CrawlRowInput | null> {
  const { data } = await service.from("lead_crawl_checks").select("created_at, result").eq("lead_id", leadId).maybeSingle();
  return (data as CrawlRowInput | null) ?? null;
}

/** What the Inbox shows about saved research — never the raw page text. */
function researchSummary(r: WarmLeadResearch | null | undefined) {
  if (!r) return null;
  return {
    generatedAt: r.generatedAt, status: r.status, website: r.website, sourceCrawlAt: r.sourceCrawlAt,
    businessSummary: r.businessSummary, technicallyClean: r.technicallyClean,
    strongestFindings: r.strongestFindings.map((f) => ({ id: f.id, title: f.title, source: f.source, strength: f.strength })),
    ownershipClues: r.ownershipClues, warnings: r.warnings, sourcesRead: r.sources.filter((s) => s.kind === "page" && s.ok).length,
    timings: r.timings,
  };
}

/* ───────────────────────── actions ───────────────────────── */

async function handleStatus(service: Service, lead: LeadRow) {
  const row = await loadRow(service, lead.id);
  return json({
    ok: true,
    freshness: researchFreshness(row, lead.website, Date.now()),
    has_website: !!(lead.website ?? "").trim(),
    research: researchSummary(row?.research),
    sales_facts: row?.sales_facts ?? {},
    last_draft: row?.last_draft ?? null,
  });
}

async function saveResearch(service: Service, lead: LeadRow, r: WarmLeadResearch) {
  const { error } = await service.from(TABLE).upsert({
    lead_id: lead.id, user_id: lead.user_id, website: r.website, research: r, research_status: r.status,
    generated_at: r.generatedAt, source_crawl_at: r.sourceCrawlAt, content_hash: r.contentHash,
    revalidated_at: null, research_ms: r.timings.researchMs, updated_at: new Date().toISOString(),
  }, { onConflict: "lead_id" });
  if (error) throw error;
}

async function handleResearch(service: Service, lead: LeadRow, operatorId: string, refresh: boolean) {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const row = await loadRow(service, lead.id);
  const plan = planResearch({ row, leadWebsite: lead.website, refresh, nowMs: started });

  if (plan.action === "reuse") {
    return json({ ok: true, plan: "reuse", research: researchSummary(row?.research), ms: Date.now() - started });
  }
  const audit = await loadAuditContext(service, lead);
  if (plan.action === "no_website") {
    const r = noWebsiteResearch(nowIso, audit);
    await saveResearch(service, lead, r);
    return json({ ok: true, plan: "no_website", research: researchSummary(r), ms: Date.now() - started });
  }

  const website = (lead.website ?? "").trim();
  const homeUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const fetchStarted = Date.now();
  const home = await fetchSitePage(homeUrl);

  // Stale research, same homepage text → the site has not materially changed: keep it.
  if (plan.action === "revalidate" && home.ok && row?.research?.contentHash && contentHash(home.text) === row.research.contentHash) {
    await service.from(TABLE).update({ revalidated_at: nowIso, updated_at: nowIso }).eq("lead_id", lead.id);
    return json({ ok: true, plan: "revalidated", research: researchSummary(row.research), ms: Date.now() - started });
  }

  const pages: PageFacts[] = [home];
  if (home.ok) {
    const targets = pickResearchPages(home, WARM_RESEARCH_MAX_PAGES - 1);
    const deadline = fetchStarted + WARM_RESEARCH_DEADLINE_MS;
    const rest = await Promise.all(targets.map((u) => (Date.now() < deadline ? fetchSitePage(u) : Promise.resolve(extractPageFacts("", u, u, 0, false)))));
    pages.push(...rest);
  }
  const fetchMs = Date.now() - fetchStarted;
  const crawl = await loadCrawlRow(service, lead.id);

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
      await logOpenAiUsage(service, { functionName: "warm-lead-reply", apiType: "openai_warm_research", model: RESEARCH_MODEL, promptTokens: call.promptTokens, completionTokens: call.completionTokens, userId: operatorId, triggerSource: "user" });
    } else {
      modelError = call.error;
    }
  }

  const r = assembleResearch({
    nowIso, website: homeUrl, businessName: lead.business_name, trade: leadTrade(lead), town: leadTown(lead),
    pages, crawl, audit, model, modelError, fetchMs, analyseMs, researchMs: Date.now() - started, nowYear: new Date().getUTCFullYear(),
  });
  await saveResearch(service, lead, r);
  return json({ ok: true, plan: plan.action === "revalidate" ? "changed" : plan.reason, research: researchSummary(r), ms: Date.now() - started });
}

// deno-lint-ignore no-explicit-any
function threadText(m: any, readable: Record<string, string>): string {
  if (m.direction === "outbound" && m.message_type === "template") {
    const snap = m.template_snapshot && typeof m.template_snapshot === "object" ? m.template_snapshot : null;
    if (snap && typeof snap.body === "string" && snap.body.trim()) return snap.body.trim();
    if (typeof readable[m.id] === "string" && readable[m.id].trim()) return readable[m.id].trim().slice(0, 2000);
    return `[template: ${m.template_name ?? "unknown"}]`;
  }
  const body = typeof m.body === "string" ? m.body.trim() : "";
  if (body) return body;
  return m.message_type && m.message_type !== "text" ? `[${m.message_type}]` : "";
}

async function handleDraft(service: Service, lead: LeadRow, operatorId: string, body: Record<string, unknown>) {
  const started = Date.now();
  const phone = text(body.phone);
  if (!phone) return json({ ok: false, error: "phone_required", detail: "Open the conversation first." }, 400);
  /* The last ten digits: +44 7700 900123, 07700900123 and 447700900123 are one number. */
  const tail = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

  const { data: msgs, error: msgErr } = await service.from("whatsapp_messages")
    .select("id, created_at, direction, lead_id, body, message_type, template_name, template_snapshot")
    .eq("user_id", operatorId).eq("phone", phone).order("created_at", { ascending: false }).limit(60);
  if (msgErr) throw msgErr;
  // deno-lint-ignore no-explicit-any
  const rows: any[] = (msgs ?? []).slice().reverse();
  // The conversation must belong to this lead, by the lead's own number or by the rows themselves.
  if ((tail(lead.phone).length < 10 || tail(lead.phone) !== tail(phone)) && !rows.some((m) => m.lead_id === lead.id)) {
    return json({ ok: false, error: "forbidden", detail: "That conversation is not this lead's." }, 403);
  }

  /* ⛔ THE WINDOW, FROM THE OPERATOR'S OWN INBOUND ROWS — the same rows send-whatsapp-message reads.
     Closed → no draft and no spend: a free-form reply could not be sent, so writing one would only
     tempt a send the sender will refuse. An approved template is the only way to message them. */
  const lastIn = [...rows].reverse().find((m) => m.direction === "inbound");
  const win = serviceWindowState(lastIn?.created_at ?? null);
  if (!win.open) {
    return json({ ok: false, error: "window_closed", detail: lastIn
      ? "Their last message was more than 24 hours ago, so WhatsApp only allows an approved template now. No draft was written."
      : "They have not replied, so there is no reply window. Only an approved template can be sent." });
  }

  const readable = (body.readable && typeof body.readable === "object" ? body.readable : {}) as Record<string, string>;
  const thread: ThreadMessage[] = rows.map((m) => ({ id: m.id, direction: m.direction === "inbound" ? "inbound" : "outbound", text: threadText(m, readable), at: m.created_at }));
  const latest = latestInbound(thread);
  if (!latest) return json({ ok: false, error: "no_inbound", detail: "They have not replied yet." });

  const row = await loadRow(service, lead.id);
  /* Saved research about a DIFFERENT website is not about this lead any more — never quote it. Stale
     research is still what we know; the Inbox asks for a refresh before drafting when it is stale. */
  const research = row?.research && researchFreshness(row, lead.website, Date.now()) !== "website_changed" ? row.research : null;
  const audit = await loadAuditContext(service, lead);
  const inbound = thread.filter((m) => m.direction === "inbound");
  const ruled = mergeSalesFacts(row?.sales_facts ?? {}, ruleSalesFacts(inbound), inbound);

  const variant = Math.max(0, Math.min(9, Number(body.variant) || 0));
  const ctx = buildReplyContext({
    businessName: lead.business_name, contactFirstName: (lead.contact_name ?? "").trim().split(/\s+/)[0] || null,
    trade: leadTrade(lead), town: leadTown(lead), website: lead.website, latest, thread, research, audit,
    salesFacts: ruled.facts, reportUrl: audit?.reportUrl ?? null, variant, avoidText: variant > 0 ? text(body.avoid) || null : null,
  });

  const findingIds = research?.strongestFindings.map((f) => f.id) ?? [];
  const genStarted = Date.now();
  let prompt = buildReplyPrompt(ctx);
  let parsed = null as ReturnType<typeof parseModelReply>;
  let check = { problems: [] as string[], warnings: [] as string[] };
  let modelError: string | null = null;
  let attempts = 0;
  for (; attempts < 2; attempts++) {
    const call = await callModel(REPLY_MODEL, REPLY_SYSTEM_PROMPT, prompt, REPLY_TOOL, variant > 0 ? 0.8 : 0.5);
    if (!call.ok) { modelError = call.error; break; }
    await logOpenAiUsage(service, { functionName: "warm-lead-reply", apiType: "openai_warm_reply", model: REPLY_MODEL, promptTokens: call.promptTokens, completionTokens: call.completionTokens, userId: operatorId, triggerSource: "user" });
    const next = parseModelReply(call.args, findingIds);
    // An empty retry never throws away a first draft that exists: Paul sees it with its problems.
    if (!next) { if (!parsed) modelError = "model_empty_reply"; continue; }
    parsed = next;
    check = checkReply(parsed.reply, ctx);
    if (!check.problems.length) break;
    // One retry, told exactly what was wrong. A second failure is shown to Paul with the problems.
    prompt = `${buildReplyPrompt(ctx)}\n\nYOUR PREVIOUS DRAFT HAD THESE PROBLEMS — fix every one:\n- ${check.problems.join("\n- ")}\n\nPrevious draft:\n"""${parsed.reply}"""`;
  }

  let reply = parsed?.reply ?? null;
  let usedFallback = false;
  if (!reply) {
    reply = fallbackReply(ctx);
    usedFallback = !!reply;
    if (reply) check = checkReply(reply, ctx);
  }
  if (!reply) {
    return json({ ok: false, error: modelError ?? "model_failed", detail: modelError === "no_credits"
      ? "The OpenAI account is out of credit, so no draft could be written. Top it up and try again."
      : "The drafting model did not answer. Try again in a moment." });
  }

  const merged = mergeSalesFacts(ruled.facts, parsed?.salesFacts ?? [], inbound);
  const findingsUsed = (research?.strongestFindings ?? []).filter((f) => parsed?.findingsUsed.includes(f.id)).map((f) => ({ id: f.id, title: f.title, source: f.source }));
  const generationMs = Date.now() - genStarted;
  const why = {
    questionType: parsed?.questionType ?? ctx.question.primary,
    questionSummary: parsed?.questionSummary || null,
    detectedByRules: ctx.question.all,
    latestInbound: { id: latest.id, at: latest.at, text: latest.text.slice(0, 300) },
    findingsUsed,
    research: research ? { generatedAt: research.generatedAt, status: research.status, sourceCrawlAt: research.sourceCrawlAt, technicallyClean: research.technicallyClean, warnings: research.warnings } : null,
    audit: audit ? { auditId: audit.auditId, createdAt: audit.createdAt, named: audit.namedDatapoints, total: audit.totalDatapoints, namedEverywhere: audit.namedEverywhere } : null,
    askedOwnership: parsed?.askedOwnership ?? ctx.askOwnership,
    ownershipAlreadyKnown: !!ctx.salesFacts.owns_website,
    reportUrlAllowed: ctx.allowReportUrl,
    salesFacts: merged.facts,
    factsRejected: [...ruled.rejected, ...merged.rejected],
    problems: check.problems,
    warnings: check.warnings,
    operatorNote: parsed?.operatorNote || null,
    usedFallback, modelError, attempts: Math.min(attempts + 1, 2),
    window: win,
    timings: { generationMs, totalMs: Date.now() - started, researchMs: research?.timings.researchMs ?? null },
    variant,
  };

  const lastDraft = { at: new Date().toISOString(), questionType: why.questionType, findingsUsed, generationMs, usedFallback, problems: check.problems, warnings: check.warnings, variant };
  const { error: saveErr } = await service.from(TABLE).upsert({
    lead_id: lead.id, user_id: lead.user_id, sales_facts: merged.facts, last_draft: lastDraft, updated_at: new Date().toISOString(),
  }, { onConflict: "lead_id" });
  if (saveErr) console.error("[warm-lead-reply] save facts failed:", saveErr.message);

  return json({ ok: true, reply, why });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const who = await resolveOperator(req);
    if (!who.ok) return json({ ok: false, error: who.error, detail: who.detail }, who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "status";
    const leadId = text(body.lead_id);
    if (!leadId) return json({ ok: false, error: "lead_id_required", detail: "This conversation has no linked lead." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const lead = await loadLead(service, leadId, who.user.id);
    if (!lead) return json({ ok: false, error: "lead_not_found", detail: "That lead is not in your account." }, 404);
    if (lead.is_archived === true) return json({ ok: false, error: "lead_archived", detail: "This lead is archived." }, 409);

    if (action === "status") return await handleStatus(service, lead);
    if (action === "research") return await handleResearch(service, lead, who.user.id, body.refresh === true);
    if (action === "draft") return await handleDraft(service, lead, who.user.id, body);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[warm-lead-reply] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
