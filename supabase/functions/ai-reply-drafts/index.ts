// ai-reply-drafts — "AI handles replies" (2026-10-11, Paul). WhatsApp only, APPROVE-TO-SEND only.
// Rules: src/lib/aiReplyDraft.ts. Record: docs/ai-handles-replies.md.
//
// ⛔ THIS FUNCTION NEVER SENDS A MESSAGE. There is no Graph call, no import of the sender and no write to
//    whatsapp_messages / whatsapp_sends here. "Approve & send" is three steps and only the middle one sends,
//    in the BROWSER, through the Inbox's existing send path (send-whatsapp-message, unchanged):
//      1. claim     — pending → sending, a conditional update ONE caller can win (approve sends once only)
//      2. (browser) — the existing send
//      3. complete  — records the sent message (final text, who, when), or releases the claim on a refusal
//    A claim left open (the tab closed mid-send) is settled by the tick from the message log: an outbound row
//    after the claim → sent; none after AI_REPLY_SENDING_STALE_MS → back to pending. Never a second send.
//
// ACTIONS
//   · tick (cron: CRON_SECRET + x-internal-job) — drafts for new inbound replies while the switch is on
//   · settings / set_enabled (admin) — the switch (whatsapp_outreach_state.ai_handles_replies, default OFF)
//   · regenerate / discard / claim / complete (the person working the lead — admin, or the assigned rep)
//   · dry_run (admin) — the draft the worker WOULD write for one lead; writes no draft row, sends nothing
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { leadAccess, refusalBody, resolveActor, type Actor } from "../_shared/access.ts";
import { guardAction, paidMode } from "../_shared/protection.ts";
import { isSuppressed } from "../_shared/suppression.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import { loadAuditContext, leadTrade, leadTown, RESEARCH_LEAD_COLUMNS, type ResearchLead } from "../_shared/site-research.ts";
import {
  aiReplyDecision, buildAiReplyPrompt, checkAiReply, fallbackAiReply, mayCallWithin, callUsd,
  AI_REPLY_MODEL, AI_REPLY_SYSTEM_PROMPT, AI_REPLY_TOOL, AI_REPLY_MAX_OUTPUT_TOKENS, AI_REPLY_MAX_REGENERATIONS,
  AI_REPLY_DRAFT_MAX_USD, BEST_TEMPLATE_STYLE_NOTE, HANDOVER_LABELS,
  type AiReplyContext, type AiReplyWhy,
} from "../../../src/lib/aiReplyDraft.ts";
import { selectFindings } from "../../../src/lib/coldCallPlaybook.ts";
import { conversationEngine, draftNames } from "../../../src/lib/draftEvidence.ts";
import { warmStage } from "../../../src/lib/warmStage.ts";
import { ruleSalesFacts, websiteControlKnown, mergeSalesFacts, type ThreadMessage } from "../../../src/lib/warmReply.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { isRealSend } from "../../../src/lib/realSend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  /* The deploy marker: only this build answers with it. */
  "x-ai-reply-drafts": "2026-10-13a",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// deno-lint-ignore no-explicit-any
type Service = any;

/** Drafts written per tick (each is one model call, ~3 s). The rest wait a minute. */
const TICK_MAX_DRAFTS = 5;
/** A 'generating' row older than this was left by a crashed tick. */
const GENERATING_STALE_MS = 5 * 60_000;
/** A 'sending' claim with no message after this long was never sent: it goes back to pending. */
const AI_REPLY_SENDING_STALE_MS = 5 * 60_000;
const OPENAI_TIMEOUT_MS = 25_000;
const SENT_OR_SIMULATED = ["sent", "delivered", "read", "simulated"];

/* ───────────────────────── the model call (capped) ───────────────────────── */

async function callReplyModel(system: string, user: string, temperature: number): Promise<{ ok: true; reply: string; promptTokens: number; completionTokens: number } | { ok: false; error: string }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: false, error: "openai_not_configured" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_REPLY_MODEL, temperature, max_tokens: AI_REPLY_MAX_OUTPUT_TOKENS,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [AI_REPLY_TOOL], tool_choice: { type: "function", function: { name: AI_REPLY_TOOL.function.name } },
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
    let reply = "";
    try { reply = typeof raw === "string" ? String(JSON.parse(raw)?.reply ?? "").trim() : ""; } catch { reply = ""; }
    return { ok: true, reply, promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 };
  } catch (e) {
    return { ok: false, error: (e as Error)?.name === "AbortError" ? "openai_timeout" : "openai_request_failed" };
  } finally {
    clearTimeout(t);
  }
}

/* ───────────────────────── what we already hold (DB only) ───────────────────────── */

interface MsgRow { id: string; created_at: string; direction: string; body: string | null; message_type: string | null; template_name: string | null; status: string | null; lead_id: string | null; template_snapshot?: { body?: unknown } | null }

/** What a sent row SAID: a template's stored rendered body (template_snapshot), else its body. */
const sentText = (m: MsgRow): string => (m.template_snapshot && typeof m.template_snapshot.body === "string" && m.template_snapshot.body.trim()) ? m.template_snapshot.body.trim() : (m.body ?? "");

async function loadThread(service: Service, bookUserId: string, phone: string): Promise<MsgRow[]> {
  const { data, error } = await service.from("whatsapp_messages")
    .select("id, created_at, direction, body, message_type, template_name, status, lead_id, template_snapshot")
    .eq("user_id", bookUserId).eq("phone", phone).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return ((data ?? []) as MsgRow[]).slice().reverse();
}

async function loadLead(service: Service, leadId: string): Promise<(ResearchLead & { amount_paid: unknown; status: unknown }) | null> {
  const { data, error } = await service.from("outreach_leads").select(`${RESEARCH_LEAD_COLUMNS}, amount_paid, status`).eq("id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Everything the draft may say — from the audit, the crawl and the conversation. Nothing else. */
async function buildContext(service: Service, lead: ResearchLead, thread: MsgRow[], inbound: MsgRow): Promise<{ ctx: AiReplyContext; findingsNote: string | null }> {
  const audit = await loadAuditContext(service, lead).catch(() => null);
  const { data: crawl } = await service.from("lead_crawl_checks").select("result, created_at").eq("lead_id", lead.id).maybeSingle();
  const found = selectFindings({
    lead: { website: lead.website } as Parameters<typeof selectFindings>[0]["lead"],
    runCrawls: [],
    leadCrawl: crawl?.result ? { result: crawl.result, createdAtMs: new Date(crawl.created_at).getTime() } : null,
    nowMs: Date.now(),
  }, 3);
  const stage = warmStage(thread);
  const sentRows = thread.filter((m) => m.direction !== "inbound" && (isRealSend(m.status) || m.status === "simulated"));
  const inboundOnly: ThreadMessage[] = thread.filter((m) => m.direction === "inbound").map((m) => ({ id: m.id, direction: "inbound", text: m.body ?? "", at: m.created_at }));
  const facts = mergeSalesFacts({}, ruleSalesFacts(inboundOnly), inboundOnly).facts;
  const trade = audit?.trade ?? leadTrade(lead);
  const town = audit?.town ?? leadTown(lead);
  const ctx: AiReplyContext = {
    firstName: (lead.contact_name ?? "").trim().split(/\s+/)[0] || null,
    businessName: lead.business_name ?? "",
    latestInbound: inbound.body ?? "",
    thread: thread.filter((m) => m.direction === "inbound" || isRealSend(m.status) || m.status === "simulated")
      .map((m) => ({ from: m.direction === "inbound" ? "them" as const : "us" as const, text: (m.direction === "inbound" ? m.body ?? "" : sentText(m)) || (m.template_name ? `[${m.template_name}]` : "") })),
    search: audit && trade && town ? { trade, town } : null,
    /* Already one per business and at most three (loadAuditContext → draftNames). Empty = none readable. */
    competitors: draftNames(audit?.competitors ?? [], town),
    /* One engine per conversation (draftEvidence.conversationEngine): what our sent messages already named, else the audit's. */
    engineWords: conversationEngine(sentRows.map((m) => ({ text: sentText(m), templateName: m.template_name })), audit?.engine ?? null).words,
    hasWebsite: found.status !== "no_website" && found.status !== "profile",
    namedEverywhere: audit?.namedEverywhere === true,
    hookAlreadySent: stage.stage === "warm" || stage.stage === "waiting_for_hook_reply",
    /* The strongest 1 or 2 the crawl actually saw; anything else (clean, strong, failed, stale) → the general line. */
    findings: found.status === "findings" ? found.findings.slice(0, 2).map((f) => ({ title: f.title, said: (f.spoken ?? f.explanation ?? "").trim() || f.title })) : [],
    ownershipKnown: websiteControlKnown(facts),
  };
  return { ctx, findingsNote: found.status === "findings" ? null : found.note };
}

/** Write a draft for this context, inside the per-draft cost cap. One retry if the checks fail and the cap allows. */
async function writeDraft(service: Service, ctx: AiReplyContext, opts: { spentUsd: number; temperature: number; avoid?: string | null; userId: string | null; triggerSource: string }) {
  let spent = opts.spentUsd; let calls = 0; let promptTokens = 0; let completionTokens = 0;
  let prompt = buildAiReplyPrompt(ctx) + (opts.avoid ? `\n\nWRITE A DIFFERENT VERSION FROM THIS ONE:\n"""${opts.avoid.slice(0, 800)}"""` : "");
  let reply: string | null = null; let problems: string[] = []; let modelError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!mayCallWithin(spent, AI_REPLY_SYSTEM_PROMPT.length + prompt.length)) { modelError = modelError ?? "cost_cap"; break; }
    const r = await callReplyModel(AI_REPLY_SYSTEM_PROMPT, prompt, opts.temperature);
    if (!r.ok) { modelError = r.error; break; }
    calls++; promptTokens += r.promptTokens; completionTokens += r.completionTokens; spent += callUsd(r.promptTokens, r.completionTokens);
    await logOpenAiUsage(service, { functionName: "ai-reply-drafts", apiType: "openai_ai_reply_draft", model: AI_REPLY_MODEL, promptTokens: r.promptTokens, completionTokens: r.completionTokens, userId: opts.userId, triggerSource: opts.triggerSource });
    if (!r.reply) { modelError = "model_empty_reply"; continue; }
    reply = r.reply; problems = checkAiReply(reply, ctx);
    if (!problems.length) break;
    prompt = `${buildAiReplyPrompt(ctx)}\n\nYOUR PREVIOUS DRAFT HAD THESE PROBLEMS, fix every one:\n- ${problems.join("\n- ")}\n\nPrevious draft:\n"""${reply}"""`;
  }
  let usedFallback = false;
  if (!reply) { reply = fallbackAiReply(ctx); usedFallback = true; problems = checkAiReply(reply, ctx); }
  return { reply, problems, usedFallback, modelError, calls, promptTokens, completionTokens, spentUsd: Number(spent.toFixed(6)) };
}

function whyOf(ctx: AiReplyContext, findingsNote: string | null, w: Awaited<ReturnType<typeof writeDraft>>, costUsd: number, calls: number): AiReplyWhy {
  return {
    search: ctx.search ? `${ctx.search.trade} in ${ctx.search.town}` : null,
    competitors: ctx.namedEverywhere ? [] : ctx.competitors,
    engineWords: ctx.search ? ctx.engineWords : null,
    hookAlreadySent: ctx.hookAlreadySent,
    findings: ctx.findings.map((f) => f.title),
    findingsNote,
    siteLine: ctx.findings.length ? "issues" : "generic",
    askedOwnership: !ctx.ownershipKnown,
    styleSource: BEST_TEMPLATE_STYLE_NOTE,
    problems: w.problems,
    usedFallback: w.usedFallback,
    costUsd, calls,
  };
}

/* ───────────────────────── tick (cron) ───────────────────────── */

async function settleOpenClaims(service: Service) {
  const now = Date.now();
  // A crashed tick's 'generating' row frees its conversation.
  await service.from("ai_reply_drafts").update({ status: "failed", error: "generation_interrupted", updated_at: new Date().toISOString() })
    .eq("status", "generating").lt("updated_at", new Date(now - GENERATING_STALE_MS).toISOString());
  // A claim the browser never completed: settle it from the message log. Never a second send.
  const { data: sending } = await service.from("ai_reply_drafts").select("id, phone, claimed_at, claimed_by")
    .eq("status", "sending").lt("claimed_at", new Date(now - AI_REPLY_SENDING_STALE_MS).toISOString()).limit(50);
  for (const d of (sending ?? []) as Array<{ id: string; phone: string; claimed_at: string; claimed_by: string | null }>) {
    const { data: out } = await service.from("whatsapp_messages").select("id, body, status, created_at")
      .eq("phone", d.phone).eq("direction", "outbound").gte("created_at", d.claimed_at).order("created_at", { ascending: true }).limit(1);
    const m = (out ?? [])[0] as { id: string; body: string | null; status: string; created_at: string } | undefined;
    if (m && SENT_OR_SIMULATED.includes(m.status)) {
      await service.from("ai_reply_drafts").update({ status: "sent", sent_message_id: m.id, final_text: m.body, approved_by: d.claimed_by, approved_at: m.created_at, updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "sending");
    } else {
      await service.from("ai_reply_drafts").update({ status: "pending", claimed_by: null, claimed_at: null, error: m ? `send ${m.status}` : "send_not_completed", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "sending");
    }
  }
  // Someone answered by hand: the open row is done (the Inbox already hides it; this keeps the table honest).
  const { data: open } = await service.from("ai_reply_drafts").select("id, phone, inbound_at").eq("status", "pending").limit(200);
  for (const d of (open ?? []) as Array<{ id: string; phone: string; inbound_at: string }>) {
    const { data: ans } = await service.from("whatsapp_messages").select("id").eq("phone", d.phone).eq("direction", "outbound")
      .gt("created_at", d.inbound_at).in("status", SENT_OR_SIMULATED).limit(1);
    if ((ans ?? []).length) await service.from("ai_reply_drafts").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "pending");
  }
}

async function handleTick(service: Service) {
  const started = Date.now();
  await settleOpenClaims(service);
  const { data: st } = await service.from("whatsapp_outreach_state").select("ai_handles_replies").eq("id", 1).maybeSingle();
  if (st?.ai_handles_replies !== true) return json({ ok: true, enabled: false, drafted: 0 });
  const mode = await paidMode(service);
  const { data: cands, error } = await service.rpc("ai_reply_draft_candidates", { p_limit: TICK_MAX_DRAFTS });
  if (error) throw error;
  const out: Array<{ inbound: string; kind: string; reason?: string | null }> = [];
  for (const c of (cands ?? []) as Array<{ inbound_id: string; user_id: string; phone: string; lead_id: string | null; inbound_at: string; body: string | null; message_type: string | null }>) {
    if (Date.now() - started > 90_000) break;
    if (!c.lead_id) continue; // an unmatched number: no lead, nothing to draft (the Inbox shows it as Unassigned)
    // Supersede the older pending row for this conversation; a 'sending' / 'generating' one blocks the insert below.
    await service.from("ai_reply_drafts").update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("user_id", c.user_id).eq("phone", c.phone).eq("status", "pending");
    // THE CLAIM: one row per inbound (unique index) and one open row per conversation (partial unique index).
    const { data: claimed, error: insErr } = await service.from("ai_reply_drafts").insert({
      user_id: c.user_id, lead_id: c.lead_id, phone: c.phone, inbound_message_id: c.inbound_id, inbound_at: c.inbound_at,
      kind: "draft", status: "generating",
    }).select("id").maybeSingle();
    if (insErr || !claimed) continue; // another tick has it, or a send is in flight on this conversation
    const id = claimed.id as string;
    await service.from("ai_reply_drafts").update({ superseded_by: id }).eq("user_id", c.user_id).eq("phone", c.phone).eq("status", "superseded").is("superseded_by", null);
    try {
      const lead = await loadLead(service, c.lead_id);
      const thread = await loadThread(service, c.user_id, c.phone);
      const hadOutreach = thread.some((m) => m.direction === "outbound" && (isRealSend(m.status) || m.status === "simulated") && m.created_at < c.inbound_at);
      const suppressed = await isSuppressed(service, { phone: c.phone, leadId: c.lead_id }); // fails closed
      const decision = aiReplyDecision({ enabled: true, body: c.body, messageType: c.message_type, inboundAt: c.inbound_at, lead, suppressed, hadOutreach });
      if (decision.kind === "skipped") {
        await service.from("ai_reply_drafts").update({ kind: "skipped", status: "resolved", reason: decision.reason, updated_at: new Date().toISOString() }).eq("id", id);
      } else if (decision.kind === "needs_you") {
        await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: decision.reason, reason_label: decision.label, updated_at: new Date().toISOString() }).eq("id", id);
      } else if (decision.kind === "needs_template") {
        await service.from("ai_reply_drafts").update({ kind: "needs_template", status: "pending", reason: "window_closed", reason_label: "Outside the 24-hour window", updated_at: new Date().toISOString() }).eq("id", id);
      } else if (mode !== "running") {
        // Paid AI paused: hand over rather than spend.
        await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: "paused", reason_label: HANDOVER_LABELS.paused, updated_at: new Date().toISOString() }).eq("id", id);
      } else {
        const inbound = thread.find((m) => m.id === c.inbound_id) ?? { id: c.inbound_id, created_at: c.inbound_at, direction: "inbound", body: c.body, message_type: c.message_type, template_name: null, status: null, lead_id: c.lead_id };
        const { ctx, findingsNote } = await buildContext(service, lead!, thread, inbound);
        const w = await writeDraft(service, ctx, { spentUsd: 0, temperature: 0.5, userId: c.user_id, triggerSource: "auto" });
        await service.from("ai_reply_drafts").update({
          kind: "draft", status: "pending", draft_text: w.reply, why: whyOf(ctx, findingsNote, w, w.spentUsd, w.calls),
          model: AI_REPLY_MODEL, prompt_tokens: w.promptTokens, completion_tokens: w.completionTokens, cost_usd: w.spentUsd, model_calls: w.calls,
          error: w.modelError, updated_at: new Date().toISOString(),
        }).eq("id", id);
      }
      out.push({ inbound: c.inbound_id, kind: decision.kind, reason: "reason" in decision ? decision.reason : null });
    } catch (e) {
      const msg = String((e as { message?: unknown })?.message ?? e).slice(0, 300);
      await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: "draft_failed", reason_label: HANDOVER_LABELS.draft_failed, error: msg, updated_at: new Date().toISOString() }).eq("id", id);
      out.push({ inbound: c.inbound_id, kind: "needs_you", reason: "draft_failed" });
    }
  }
  return json({ ok: true, enabled: true, mode, drafted: out.length, results: out, ms: Date.now() - started });
}

/* ───────────────────────── person actions ───────────────────────── */

// deno-lint-ignore no-explicit-any
async function loadDraftFor(service: Service, actor: Actor, draftId: string): Promise<{ ok: true; d: any; book: string } | { ok: false; res: Response }> {
  if (!draftId) return { ok: false, res: json({ ok: false, error: "draft_id_required" }, 400) };
  const { data: d, error } = await service.from("ai_reply_drafts").select("*").eq("id", draftId).maybeSingle();
  if (error) throw error;
  if (!d) return { ok: false, res: json({ ok: false, error: "draft_not_found", detail: "That draft no longer exists." }, 404) };
  const access = await leadAccess(service, actor, d.lead_id);
  if (!access.ok) {
    if (access.error === "lookup_failed") return { ok: false, res: json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503) };
    return { ok: false, res: json({ ok: false, error: "draft_not_found", detail: "That draft is not in your conversations." }, 404) };
  }
  if (d.user_id !== access.bookUserId) return { ok: false, res: json({ ok: false, error: "draft_not_found" }, 404) };
  return { ok: true, d, book: access.bookUserId };
}

async function answeredSince(service: Service, phone: string, sinceIso: string): Promise<boolean> {
  const { data } = await service.from("whatsapp_messages").select("id").eq("phone", phone).eq("direction", "outbound")
    .gt("created_at", sinceIso).in("status", SENT_OR_SIMULATED).limit(1);
  return (data ?? []).length > 0;
}

async function handleClaim(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  const d = r.d;
  if (d.kind !== "draft") return json({ ok: false, error: "not_a_draft", detail: "There is no draft to send on this conversation." });
  if (d.status !== "pending") return json({ ok: false, error: "already_claimed", status: d.status, detail: d.status === "sent" ? "This draft has already been sent." : d.status === "sending" ? "This draft is being sent already." : "This draft is no longer open." });
  if (!serviceWindowState(d.inbound_at).open) return json({ ok: false, error: "window_closed", detail: "Their last message was more than 24 hours ago. Only an approved template can be sent now." });
  if (await answeredSince(service, d.phone, d.inbound_at)) {
    await service.from("ai_reply_drafts").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "pending");
    return json({ ok: false, error: "already_answered", detail: "Someone has already replied to this message, so the draft was closed." });
  }
  const finalText = str(body.final_text);
  if (!finalText) return json({ ok: false, error: "empty_message" }, 400);
  // ⛔ THE ONCE-ONLY GATE: one conditional write; a second click, a second tab or a second person loses here.
  const { data: won } = await service.from("ai_reply_drafts")
    .update({ status: "sending", claimed_by: actor.id, claimed_at: new Date().toISOString(), final_text: finalText, updated_at: new Date().toISOString() })
    .eq("id", d.id).eq("status", "pending").select("id").maybeSingle();
  if (!won) return json({ ok: false, error: "already_claimed", detail: "This draft is being sent already." });
  return json({ ok: true, draft_id: d.id, phone: d.phone, lead_id: d.lead_id });
}

async function handleComplete(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  const d = r.d;
  if (d.status !== "sending" || d.claimed_by !== actor.id) return json({ ok: false, error: "not_claimed", status: d.status });
  const messageId = str(body.message_id);
  if (messageId) {
    // Believe the message LOG, never the browser: the row must be ours, outbound, this phone, after the claim.
    const { data: m } = await service.from("whatsapp_messages").select("id, body, status, created_at, direction, phone")
      .eq("id", messageId).maybeSingle();
    if (m && m.direction === "outbound" && m.phone === d.phone && Date.parse(m.created_at) >= Date.parse(d.claimed_at) && SENT_OR_SIMULATED.includes(m.status)) {
      await service.from("ai_reply_drafts").update({
        status: "sent", sent_message_id: m.id, final_text: m.body, approved_by: actor.id, approved_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
      }).eq("id", d.id).eq("status", "sending");
      return json({ ok: true, status: "sent" });
    }
  }
  // The send was refused or failed: the draft goes back to the person, nothing was sent from it.
  await service.from("ai_reply_drafts").update({
    status: "pending", claimed_by: null, claimed_at: null, error: str(body.error).slice(0, 300) || "send_failed", updated_at: new Date().toISOString(),
  }).eq("id", d.id).eq("status", "sending");
  return json({ ok: true, status: "pending" });
}

async function handleDiscard(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  const { data: done } = await service.from("ai_reply_drafts")
    .update({ status: "discarded", discarded_by: actor.id, discarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", r.d.id).eq("status", "pending").select("id").maybeSingle();
  return done ? json({ ok: true }) : json({ ok: false, error: "not_open", status: r.d.status, detail: "This draft is no longer open." });
}

async function handleRegenerate(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  const d = r.d;
  if (d.kind !== "draft" || d.status !== "pending") return json({ ok: false, error: "not_open", detail: "This draft is no longer open." });
  if ((d.regenerations ?? 0) >= AI_REPLY_MAX_REGENERATIONS) return json({ ok: false, error: "regenerate_limit", detail: `This draft has been rewritten ${AI_REPLY_MAX_REGENERATIONS} times. Edit it by hand.` });
  if (!serviceWindowState(d.inbound_at).open) return json({ ok: false, error: "window_closed", detail: "Outside the 24-hour window — only an approved template can be sent now." });
  /* ⛔ USAGE GUARD: a person asked for a paid model call. */
  const guard = await guardAction(service, actor.id, "ai_draft", { fn: "ai-reply-drafts", leadId: d.lead_id, role: actor.role, estCostUsd: actor.role === "admin" ? 0 : AI_REPLY_DRAFT_MAX_USD });
  if (!guard.ok) return json(guard.body, guard.status);
  const lead = await loadLead(service, d.lead_id);
  if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);
  const thread = await loadThread(service, d.user_id, d.phone);
  const inbound = thread.find((m) => m.id === d.inbound_message_id);
  if (!inbound) return json({ ok: false, error: "inbound_not_found" }, 404);
  const { ctx, findingsNote } = await buildContext(service, lead, thread, inbound);
  // Each version has its own cap; the row's cost is the running total.
  const w = await writeDraft(service, ctx, { spentUsd: 0, temperature: 0.85, avoid: str(body.avoid) || d.draft_text, userId: actor.id, triggerSource: "user" });
  const totalUsd = Number((Number(d.cost_usd ?? 0) + w.spentUsd).toFixed(6));
  const calls = (d.model_calls ?? 0) + w.calls;
  const { data: saved } = await service.from("ai_reply_drafts").update({
    draft_text: w.reply, why: whyOf(ctx, findingsNote, w, totalUsd, calls), regenerations: (d.regenerations ?? 0) + 1,
    prompt_tokens: (d.prompt_tokens ?? 0) + w.promptTokens, completion_tokens: (d.completion_tokens ?? 0) + w.completionTokens,
    cost_usd: totalUsd, model_calls: calls, error: w.modelError, updated_at: new Date().toISOString(),
  }).eq("id", d.id).eq("status", "pending").select("id, draft_text, why, regenerations").maybeSingle();
  if (!saved) return json({ ok: false, error: "not_open", detail: "This draft closed while it was being rewritten." });
  return json({ ok: true, draft: saved });
}

/** ADMIN ONLY. Writes the draft the worker WOULD write for this lead's newest inbound, and returns it.
 *  ⛔ It writes no ai_reply_drafts row, sends nothing and touches no message. The only write is the model
 *  call's own api_usage_log row (cost honesty). A lead with no inbound uses `sample_inbound` (said in the
 *  answer as a stand-in). The switch, the window and the hand-over rule are reported, not applied. */
async function handleDryRun(service: Service, actor: Actor, body: Record<string, unknown>) {
  if (actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
  const leadId = str(body.lead_id);
  if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
  const lead = await loadLead(service, leadId);
  if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);
  const guard = await guardAction(service, actor.id, "ai_draft", { fn: "ai-reply-drafts", leadId, role: actor.role, estCostUsd: 0 });
  if (!guard.ok) return json(guard.body, guard.status);
  const { data, error } = await service.from("whatsapp_messages")
    .select("id, created_at, direction, body, message_type, template_name, status, lead_id")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const thread = ((data ?? []) as MsgRow[]).slice().reverse();
  const real = [...thread].reverse().find((m) => m.direction === "inbound") ?? null;
  const sample = str(body.sample_inbound) || "Hi. Yes it is. How can I help?";
  const inbound: MsgRow = real ?? { id: "dry-run", created_at: new Date().toISOString(), direction: "inbound", body: sample, message_type: "text", template_name: null, status: "received", lead_id: leadId };
  const withInbound = real ? thread : [...thread, inbound];
  const hadOutreach = withInbound.some((m) => m.direction === "outbound" && (isRealSend(m.status) || m.status === "simulated") && m.created_at < inbound.created_at);
  const decision = aiReplyDecision({ enabled: true, body: inbound.body, messageType: inbound.message_type, inboundAt: inbound.created_at, lead, suppressed: false, hadOutreach });
  const { ctx, findingsNote } = await buildContext(service, lead, withInbound, inbound);
  const w = await writeDraft(service, ctx, { spentUsd: 0, temperature: 0.5, userId: actor.id, triggerSource: "user" });
  return json({
    ok: true, dry_run: true, lead: lead.business_name, inbound: { text: inbound.body, at: inbound.created_at, stand_in: !real },
    decision_if_live: decision, draft: w.reply, why: whyOf(ctx, findingsNote, w, w.spentUsd, w.calls), model_error: w.modelError,
  });
}

async function handleSettings(service: Service, actor: Actor, body: Record<string, unknown>, set: boolean) {
  if (actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
  if (set) {
    const on = body.enabled === true;
    const patch: Record<string, unknown> = { ai_handles_replies: on, updated_at: new Date().toISOString() };
    // Turning it on starts the clock: replies from before are never drafted (no backlog spend).
    if (on) patch.ai_handles_replies_since = new Date().toISOString();
    const { error } = await service.from("whatsapp_outreach_state").update(patch).eq("id", 1);
    if (error) throw error;
  }
  const { data } = await service.from("whatsapp_outreach_state").select("ai_handles_replies, ai_handles_replies_since").eq("id", 1).maybeSingle();
  return json({ ok: true, enabled: data?.ai_handles_replies === true, since: data?.ai_handles_replies_since ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = str(body.action);
    const internal = req.headers.get("x-internal-job") === "1"
      && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || "\u0000__unset__");
    if (action === "tick") return internal ? await handleTick(service) : json({ ok: false, error: "not_authorised" }, 401);
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    if (action === "settings") return await handleSettings(service, who.actor, body, false);
    if (action === "set_enabled") return await handleSettings(service, who.actor, body, true);
    if (action === "claim") return await handleClaim(service, who.actor, body);
    if (action === "complete") return await handleComplete(service, who.actor, body);
    if (action === "discard") return await handleDiscard(service, who.actor, body);
    if (action === "regenerate") return await handleRegenerate(service, who.actor, body);
    if (action === "dry_run") return await handleDryRun(service, who.actor, body);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[ai-reply-drafts] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
