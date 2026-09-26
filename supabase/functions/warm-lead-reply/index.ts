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
// ⛔ SALES STAGE (Paul, 2026-09-25): research and draft run only in a WARM conversation — an audit /
//    competitor hook has gone out AND they have replied after it (src/lib/warmStage.ts). Before that
//    the funnel's own opener → audit → hook steps are the next move, and this refuses without spending.
//
// Auth: the operator's own JWT (resolveOperator), and the lead must be theirs — the same ownership
// send-whatsapp-message applies, so this can never draft for a conversation the sender would refuse.
// The table it writes (warm_lead_research) has RLS on and NO policies: service role only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOperator, isUpstreamOutage } from "../_shared/operator-auth.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import {
  runSiteResearch, callModel, loadAuditContext, leadTrade, leadTown, RESEARCH_LEAD_COLUMNS, WARM_RESEARCH_TABLE,
  type ResearchLead,
} from "../_shared/site-research.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { warmStage, WARM_STAGE_LABELS, type WarmStageResult } from "../../../src/lib/warmStage.ts";
import { researchFreshness, type StoredResearchRow, type WarmLeadResearch } from "../../../src/lib/warmLeadResearch.ts";
import {
  buildReplyContext, buildReplyPrompt, checkReply, fallbackReply, parseModelReply, ruleSalesFacts, mergeSalesFacts,
  latestInbound, REPLY_SYSTEM_PROMPT, REPLY_TOOL, REPLY_MODEL,
  pooledFindings, findingMentioned, sayableDetails, findingSourceLabel, PRIMARY_MISSING_PROBLEM, PRIMARY_REWRITE_INSTRUCTION,
  ROUTE_LABELS, websiteControlKnown,
  type SalesFacts, type ThreadMessage,
} from "../../../src/lib/warmReply.ts";
import { findingScore, type ResearchFinding } from "../../../src/lib/warmLeadResearch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TABLE = WARM_RESEARCH_TABLE;
const ROW_COLUMNS = "lead_id, website, research, research_status, generated_at, revalidated_at, sales_facts, last_draft";
// deno-lint-ignore no-explicit-any
type Service = any;

/* The lead row, the site fetch and the model call live in _shared/site-research.ts (2026-09-26), shared
   with voice-note-script so there is one research path, not two. */
type LeadRow = ResearchLead;

/* ───────────────────────── reading what we already hold (no spend) ───────────────────────── */

async function loadLead(service: Service, leadId: string, operatorId: string): Promise<LeadRow | null> {
  const { data, error } = await service.from("outreach_leads")
    .select(RESEARCH_LEAD_COLUMNS)
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

/* ───────────────────────── the conversation (DB only) ───────────────────────── */

// deno-lint-ignore no-explicit-any
type MsgRow = any;

/** The operator's own rows for this number (the same rows send-whatsapp-message reads), oldest
 *  first, and whether they belong to this lead: by the lead's own number or by the rows themselves. */
async function loadConversation(service: Service, operatorId: string, lead: LeadRow, phone: string): Promise<{ rows: MsgRow[]; ours: boolean; stage: WarmStageResult }> {
  const { data, error } = await service.from("whatsapp_messages")
    .select("id, created_at, direction, lead_id, body, message_type, template_name, template_snapshot, status")
    .eq("user_id", operatorId).eq("phone", phone).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const rows: MsgRow[] = (data ?? []).slice().reverse();
  /* The last ten digits: +44 7700 900123, 07700900123 and 447700900123 are one number. */
  const tail = (x: string | null | undefined) => (x ?? "").replace(/\D/g, "").slice(-10);
  const ours = (tail(lead.phone).length >= 10 && tail(lead.phone) === tail(phone)) || rows.some((m) => m.lead_id === lead.id);
  return { rows, ours, stage: warmStage(rows) };
}

/** The refusal for a conversation that is not warm yet — no fetch, no model, no spend. */
function notWarm(stage: WarmStageResult) {
  const detail = stage.stage === "hook_not_sent"
    ? "They have replied, but the AI audit / competitor hook has not been sent yet. Send the hook first — the warm-reply drafter is for their reply to it."
    : stage.stage === "waiting_for_hook_reply"
      ? "The competitor hook has gone out and they have not replied to it yet. The drafter opens when they do."
      : "They have not replied yet.";
  return json({ ok: false, error: "not_warm_yet", stage: stage.stage, stage_label: WARM_STAGE_LABELS[stage.stage], detail });
}

/* ───────────────────────── actions ───────────────────────── */

async function handleStatus(service: Service, lead: LeadRow, operatorId: string, phone: string) {
  const row = await loadRow(service, lead.id);
  const conv = phone ? await loadConversation(service, operatorId, lead, phone) : null;
  return json({
    ok: true,
    freshness: researchFreshness(row, lead.website, Date.now()),
    has_website: !!(lead.website ?? "").trim(),
    research: researchSummary(row?.research),
    sales_facts: row?.sales_facts ?? {},
    last_draft: row?.last_draft ?? null,
    stage: conv?.ours ? conv.stage.stage : null,
  });
}

async function handleResearch(service: Service, lead: LeadRow, operatorId: string, refresh: boolean, phone: string) {
  if (!phone) return json({ ok: false, error: "phone_required", detail: "Open the conversation first." }, 400);
  const conv = await loadConversation(service, operatorId, lead, phone);
  if (!conv.ours) return json({ ok: false, error: "forbidden", detail: "That conversation is not this lead's." }, 403);
  if (conv.stage.stage !== "warm") return notWarm(conv.stage);
  // The research itself (reuse → revalidate → full crawl → targeted fetch) is the shared path.
  const out = await runSiteResearch(service, lead, operatorId, refresh, { functionName: "warm-lead-reply" });
  return json({ ok: true, plan: out.plan, ...(out.usedFullCrawl === null ? {} : { used_full_crawl: out.usedFullCrawl }), research: researchSummary(out.research), ms: out.ms });
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
  const conv = await loadConversation(service, operatorId, lead, phone);
  const rows = conv.rows;
  if (!conv.ours) return json({ ok: false, error: "forbidden", detail: "That conversation is not this lead's." }, 403);

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
  // Warm only: a hook has gone out and they have answered it. Checked before any spend.
  if (conv.stage.stage !== "warm") return notWarm(conv.stage);

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
    salesFacts: ruled.facts, reportUrl: audit?.reportUrl ?? null, hookTemplate: conv.stage.hookTemplate, hookAt: conv.stage.hookAt, variant,
    numberSource: lead.place_id || lead.google_maps_url ? "their number is on their public google business listing, which is where Paul found them" : null, avoidText: variant > 0 ? text(body.avoid) || null : null,
  });

  const findingIds = pooledFindings(research).map((f) => f.id);
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
    /* The strongest evidence ignored gets its own, explicit instruction (Paul's wording, 2026-09-25). */
    const ignoredPrimary = check.problems.includes(PRIMARY_MISSING_PROBLEM) && ctx.selection.primary
      ? `${PRIMARY_REWRITE_INSTRUCTION}\nPRIMARY FINDING: ${ctx.selection.primary.title} — ${sayableDetails(ctx.selection.primary).join(" / ")}\n\n`
      : "";
    prompt = `${buildReplyPrompt(ctx)}\n\n${ignoredPrimary}YOUR PREVIOUS DRAFT HAD THESE PROBLEMS — fix every one:\n- ${check.problems.join("\n- ")}\n\nPrevious draft:\n"""${parsed.reply}"""`;
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
  /* What the draft ACTUALLY says, checked against the text — never the model's own claim. */
  const used = (f: ResearchFinding) => findingMentioned(reply!, f, ctx.town);
  const card = (f: ResearchFinding) => ({ id: f.id, title: f.title, evidence: sayableDetails(f), source: findingSourceLabel(f), score: findingScore(f), used: used(f) });
  const sel = ctx.selection;
  const findingsUsed = pooledFindings(research).filter(used).map((f) => ({ id: f.id, title: f.title, source: f.source }));
  const generationMs = Date.now() - genStarted;
  const why = {
    questionType: parsed?.questionType ?? ctx.question.primary,
    questionSummary: parsed?.questionSummary || null,
    detectedByRules: ctx.question.all,
    latestInbound: { id: latest.id, at: latest.at, text: latest.text.slice(0, 300) },
    findingsUsed,
    primaryFinding: sel.primary ? { ...card(sel.primary), required: ctx.primaryRequired } : null,
    secondaryFindings: sel.secondary.map(card),
    strongNotUsed: sel.strongNotUsed.map(card),
    alreadyMentioned: sel.alreadyMentioned.map((f) => f.title),
    /* Paul's stage summary (2026-09-25): what AI was asked, the issue, the proposed route, what we
       know about who controls the site, and how the reply ends. For Paul only. */
    aiSearchContext: ctx.searchContext,
    proposedSolution: ROUTE_LABELS[ctx.route],
    websiteOwnership: websiteControlKnown(ctx.salesFacts)
      ? (ctx.salesFacts.owns_website ? `they own it: ${ctx.salesFacts.owns_website.value} ("${ctx.salesFacts.owns_website.quote}")` : `managed by someone else ("${ctx.salesFacts.has_existing_provider?.quote ?? ""}")`)
      : "unknown",
    finalQuestion: ctx.askOwnership ? (ctx.route === "new_only" ? "do they have a website at the moment" : "agency / owns site") : "not asked, they already told us",
    noFindingNote: !sel.primary && research && research.status !== "failed" && research.status !== "no_website"
      ? "No website finding was strong enough to use; the draft leans on the AI search result. Nothing was invented."
      : null,
    researchSources: research ? [...new Set(research.sources.map((x) => x.kind === "page" ? "Live website" : x.kind === "full_crawl" ? "Existing full crawl" : x.kind === "crawl_check" ? "Existing crawl check" : "AI audit"))] : [],
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
    stage: conv.stage,
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

    const phone = text(body.phone);
    if (action === "status") return await handleStatus(service, lead, who.user.id, phone);
    if (action === "research") return await handleResearch(service, lead, who.user.id, body.refresh === true, phone);
    if (action === "draft") return await handleDraft(service, lead, who.user.id, body);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[warm-lead-reply] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
