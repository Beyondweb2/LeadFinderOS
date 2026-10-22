// ai-reply-drafts — reply flags + drafts (2026-10-11, Paul; reworked 2026-10-20). WhatsApp only. Nothing auto-sends unless an
// admin switched that reply type on (Level 2, 2026-10-21, below) — and even then this function only QUEUES it.
// Rules: src/lib/aiReplyDraft.ts (rows, checker), src/lib/replyMove.ts (the move), src/lib/replyPlaybook.ts (the wording per
// intent, docs/reply-playbook.md), src/lib/offerFactSheet.ts (what may be said).
// Record: docs/ai-handles-replies.md.
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
//   · tick (cron: CRON_SECRET + x-internal-job) — every NEW inbound gets one row. FLAGS ALWAYS (rules only, no model call):
//       Needs you / a stop / an auto-reply. A stop or an angry reply opts the number out and cancels its queued follow-ups.
//       A DRAFT is written by the model only while the switch "AI handles replies" is on (default off; never changed here).
//   · draft (the person working the lead) — "Draft reply": a draft for the newest inbound, always, except a stop
//   · mark_opted_out (the person working the lead) — the one-tap opt-out on a stop
//   · settings / set_mode (admin) — the Inbox reply mode, Manual / Draft for approval / Auto (whatsapp_outreach_state.ai_reply_mode,
//     src/lib/inboxReplyMode.ts; 2026-10-21). set_enabled = the old switch (on = Draft for approval, never Auto)
//   · regenerate / discard / claim / complete (the person working the lead)
//   · dry_run (admin, or the internal job) — the draft for one lead or for a FIXTURE; writes no row, sends nothing, logs nothing
//   · set_auto_send (admin) — LEVEL 2's per-reply-type switches + the daily cap (src/lib/aiAutoSend.ts); stop_auto_send (person)
//
// ⛔ LEVEL 2 (2026-10-21): the tick may QUEUE a draft it just wrote as an ordinary inbox_scheduled_sends row (3–8 minutes on, in
//    the lead's send hours), ONLY when `autoSendVerdict` says so: master switch on AND that reply type switched on (all off when
//    shipped) AND every safety check. Even then this function sends nothing: fn inbox-scheduled-send does, after re-checking.
//    Approve / Discard / Regenerate / Draft reply / typing in the reply box stop a waiting automatic reply first.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { leadAccess, refusalBody, resolveActor, type Actor } from "../_shared/access.ts";
import { guardAction, paidMode } from "../_shared/protection.ts";
import { isSuppressed, recordOptOut } from "../_shared/suppression.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import { loadAuditContext, leadTrade, leadTown, RESEARCH_LEAD_COLUMNS, type ResearchLead } from "../_shared/site-research.ts";
import {
  aiReplyDecision, buildAiReplyPrompt, checkAiReply, evidenceNames, fallbackAiReply, finishDraft, isFollowUp, mayCallWithin, callUsd,
  AI_REPLY_MODEL, AI_REPLY_SYSTEM_PROMPT, AI_REPLY_TOOL, AI_REPLY_MAX_OUTPUT_TOKENS, AI_REPLY_MAX_REGENERATIONS,
  AI_REPLY_DRAFT_MAX_USD, BEST_TEMPLATE_STYLE_NOTE, DRY_RUN_MODELS, DRY_RUN_DRAFT_MAX_USD, HANDOVER_LABELS, STOP_REASONS,
  type AiReplyContext, type AiReplyWhy,
} from "../../../src/lib/aiReplyDraft.ts";
import { pickMove, type MoveEvidence, type MoveInput, type MovePlan, type MoveThreadMsg } from "../../../src/lib/replyMove.ts";
import { replyKindChanges } from "../../../src/lib/replyKindTag.ts";
import {
  isVisible, parseVisibleRule, parseVisibleShare, visibleCounts, visibleRuleKey, VISIBLE_NO_PITCH_DETAIL, VISIBLE_NO_PITCH_ERROR, VISIBLE_RECHECK_DAYS, VISIBLE_SKIP_REASON, VISIBLE_LABEL,
  type VisibleRule, type VisibleShare,
} from "../../../src/lib/visibleFlag.ts";
import { CONFIDENCE_LINE, FACT_SHEET_VERSION } from "../../../src/lib/offerFactSheet.ts";
import { WAITING_PITCH_STATUSES } from "../../../src/lib/auditPitchRule.ts";
import { selectFindings } from "../../../src/lib/coldCallPlaybook.ts";
import { plainIssueTitle, websiteCheckFor } from "../../../src/lib/websiteCheck.ts";
import { conversationEngine, draftNames } from "../../../src/lib/draftEvidence.ts";
import { warmStage } from "../../../src/lib/warmStage.ts";
import { serviceWindowState } from "../../../src/lib/serviceWindow.ts";
import { failedWamids, isOurs, moveThread, sentText, withReceipts, type DraftThreadRow } from "../../../src/lib/draftThread.ts";
import {
  autoSendVerdict, autoSendAt, autoSendDelayMs, autoSendKey, cleanAutoSendKeys, cleanDailyCap, draftFactsFromPlan, evidenceComplete, theirMessagesSinceUs, threadHardReason,
  AUTO_SEND_CHOICES, AUTO_SEND_DEFAULT_DAILY_CAP, AUTO_SEND_MAX_DAILY_CAP,
} from "../../../src/lib/aiAutoSend.ts";
import { nextWindowOpenAt, replyWindowFor, replyWindowOpen } from "../../../src/lib/inboxSendWindow.ts";
import { botMaySaySendsEveryOne, parseInboxReplyMode, INBOX_REPLY_MODES } from "../../../src/lib/inboxReplyMode.ts";
import { loadReplyHours } from "../_shared/inbox-schedule.ts";
import { loadCountrySettings } from "../_shared/country-settings.ts";
import { autoSendCounts, loadAutoSendState, personActiveAt, sendAsIsAdmin, stopAutoSend, type AutoSendState } from "../_shared/ai-auto-send.ts";
import {
  auditPhaseOf, crawlPhaseOf, draftLackedEvidence, evidenceVerdict, isDrafterAudit, pitchNeedsEvidence, AUDIT_NOT_FINISHED_LABEL, AUDIT_NOT_FINISHED_REASON,
  AUDIT_RUNNING_DETAIL, AUDIT_RUNNING_ERROR, EVIDENCE_WAIT_MS, WAITING_LABEL, WAITING_REASON, type EvidenceVerdict, type WhyEvidence,
} from "../../../src/lib/draftEvidenceWait.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  /* The deploy marker: only this build answers with it. */
  "x-ai-reply-drafts": "2026-10-22a-pitch-owed-sent-only",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// deno-lint-ignore no-explicit-any
type Service = any;

/** Rows handled per tick. Flags are cheap (no model); a draft is one model call (~3 s). */
const TICK_MAX_ROWS = 10;
/** A 'generating' row older than this was left by a crashed tick. */
const GENERATING_STALE_MS = 5 * 60_000;
/** A 'sending' claim with no message after this long was never sent: it goes back to pending. */
const AI_REPLY_SENDING_STALE_MS = 5 * 60_000;
const OPENAI_TIMEOUT_MS = 25_000;
const SENT_OR_SIMULATED = ["sent", "delivered", "read", "simulated"];
/** Leads judged for the Visible flag per tick (each is a few small reads). */
const VISIBLE_SWEEP_MAX = 25;

/* ───────────────────────── the model call (capped) ───────────────────────── */

async function callReplyModel(model: string, system: string, user: string, temperature: number): Promise<{ ok: true; reply: string; promptTokens: number; completionTokens: number } | { ok: false; error: string }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { ok: false, error: "openai_not_configured" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, temperature, max_tokens: AI_REPLY_MAX_OUTPUT_TOKENS,
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

type MsgRow = DraftThreadRow;
type LeadRow = ResearchLead & { amount_paid: unknown; status: unknown; call_booked_at: string | null; previous_status?: string | null; ai_visible_at?: string | null };

/** The thread, oldest first. A 'failed' row of ours is read against its receipt (src/lib/draftThread.ts): delivered / read =
 *  it reached them. An unreadable receipt leaves it out (the old reading). */
async function loadThread(service: Service, bookUserId: string, phone: string): Promise<MsgRow[]> {
  const { data, error } = await service.from("whatsapp_messages")
    .select("id, created_at, direction, body, message_type, template_name, status, lead_id, wa_message_id, template_snapshot, reply_kind")
    .eq("user_id", bookUserId).eq("phone", phone).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const rows = ((data ?? []) as MsgRow[]).slice().reverse();
  const wamids = failedWamids(rows);
  if (!wamids.length) return rows;
  const { data: receipts, error: rErr } = await service.from("whatsapp_sends").select("message_id, delivery_status").in("message_id", wamids);
  if (rErr) return rows;
  return withReceipts(rows, new Map(((receipts ?? []) as Array<{ message_id: string; delivery_status: string | null }>).map((r) => [r.message_id, r.delivery_status])));
}

async function loadLead(service: Service, leadId: string): Promise<LeadRow | null> {
  const { data, error } = await service.from("outreach_leads").select(`${RESEARCH_LEAD_COLUMNS}, amount_paid, status, call_booked_at, ai_visible_at`).eq("id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** AI drafts sent since the last WIN (a voice note we sent, a booked call, or a sent draft that agreed a call time — the
 *  playbook's "busy / call later" win): the loop guard's count. */
async function aiSentSinceWin(service: Service, lead: LeadRow, thread: MsgRow[]): Promise<number> {
  const lastVoice = [...thread].reverse().find((m) => isOurs(m) && (m.message_type === "audio" || m.message_type === "voice"))?.created_at ?? null;
  const { data: sent } = await service.from("ai_reply_drafts").select("approved_at, why").eq("lead_id", lead.id).eq("status", "sent").order("approved_at", { ascending: true }).limit(200);
  const rows = ((sent ?? []) as Array<{ approved_at: string | null; why: { win?: string | null } | null }>).filter((r) => !!r.approved_at);
  const lastAgreed = [...rows].reverse().find((r) => r.why?.win === "call_time_agreed")?.approved_at ?? null;
  const win = [lastVoice, lead.call_booked_at ?? null, lastAgreed].filter(Boolean).sort().pop() ?? null;
  /* The winning draft itself is not counted: "after" the win only. */
  return rows.filter((r) => !win || (r.approved_at as string) > win).length;
}

/** May replies on here be automated (the bot answer)? The Inbox mode (inboxReplyMode.ts, 2026-10-21): only Manual and Draft
 *  for approval may say "I read and send every one myself" — a person sends every message there. ⛔ Fails toward ON: if the
 *  mode cannot be read, the bot answer never claims a person sent it. */
async function aiSwitchOn(service: Service): Promise<boolean> {
  const { data, error } = await service.from("whatsapp_outreach_state").select("ai_reply_mode").eq("id", 1).maybeSingle();
  if (error || !data) return true;
  return !botMaySaySendsEveryOne(typeof data.ai_reply_mode === "string" ? data.ai_reply_mode : null);
}

/** The lead's audit phase (draftEvidenceWait.ts): its newest ordinary audits and their runs. Unreadable → 'running'
 *  (the wait, bounded by EVIDENCE_WAIT_MS, never a pitch without evidence). */
async function loadAuditPhase(service: Service, leadId: string) {
  const { data, error } = await service.from("ai_audits").select("audit_purpose, is_measurement, created_at, runs:ai_audit_runs(status)")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10);
  if (error) return "running" as const;
  return auditPhaseOf((data ?? []) as Parameters<typeof auditPhaseOf>[0]);
}

/** Is the evidence for a pitch on this inbound final yet? */
const verdictFor = (phases: Phases, inboundAt: string): EvidenceVerdict =>
  evidenceVerdict({ audit: phases.audit, crawl: phases.crawl, inboundAtMs: Date.parse(inboundAt), nowMs: Date.now() });
/** `complete` (Level 2): the audit has a complete run AND the site was read or there is none (aiAutoSend.ts evidenceComplete).
 *  Only a complete draft may ever send itself. */
const whyEvidence = (v: EvidenceVerdict, site?: string | null): WhyEvidence => ({ ready: v.state === "ready", audit: v.audit, crawl: v.crawl, complete: v.state === "ready" && evidenceComplete(v.audit, site) });
type Phases = Omit<WhyEvidence, "ready" | "complete"> & { site?: string | null };

/** Everything the draft may say — from the audit, the crawl and the conversation. Nothing else. */
async function buildContext(service: Service, lead: LeadRow, thread: MsgRow[], inbound: MsgRow): Promise<{ ctx: AiReplyContext; findingsNote: string | null; input: MoveInput; phases: Phases }> {
  const audit = await loadAuditContext(service, lead).catch(() => null);
  const { data: crawl } = await service.from("lead_crawl_checks").select("result, created_at, last_failed_attempt").eq("lead_id", lead.id).maybeSingle();
  const found = selectFindings({
    lead: { website: lead.website } as Parameters<typeof selectFindings>[0]["lead"],
    runCrawls: [],
    leadCrawl: crawl?.result ? { result: crawl.result, createdAtMs: new Date(crawl.created_at).getTime() } : null,
    nowMs: Date.now(),
  }, 2);
  const upTo = thread.filter((m) => m.created_at <= inbound.created_at);
  const stage = warmStage(upTo);
  const sentRows = upTo.filter(isOurs);
  const trade = audit?.trade ?? leadTrade(lead);
  const town = audit?.town ?? leadTown(lead);
  /* ⛔ THE SCORE THE AUDIT SHOWS, every engine in it (Google AI where scored): Nola is 1 of 3, never 1 of 2 (Paul,
     2026-10-20). Only an audit with no complete quick-check score falls back to the run summary. */
  const scored = typeof audit?.scoreNamed === "number" && typeof audit?.scoreTotal === "number" && audit.scoreTotal > 0;
  const worst = audit?.worst ?? null;
  const nd = scored ? audit!.scoreNamed : audit?.namedDatapoints; const td = scored ? audit!.scoreTotal : audit?.totalDatapoints;
  const evidence: MoveEvidence = {
    businessName: lead.business_name ?? "",
    trade: audit && trade ? trade : null,
    town: audit && town ? town : null,
    /* THE WORST RESULT leads the pitch (worstMiss.ts): its engine, its question, its own names. Else the hook gap. */
    engineWords: conversationEngine(sentRows.map((m) => ({ text: sentText(m), templateName: m.template_name })), worst?.engine ?? audit?.engine ?? null).words,
    named: typeof nd === "number" && typeof td === "number" && td > 0 ? { named: nd, valid: td } : null,
    competitors: draftNames(worst ? worst.rivals : audit?.competitors ?? [], town),
    /* The best missed search: its engine + question (the competitors above are that answer's names). */
    missed: worst ? { engine: worst.engine, question: worst.question } : audit?.missedQuestion && audit?.engine ? { engine: audit.engine, question: audit.missedQuestion } : null,
    hookAlreadySent: stage.stage === "warm" || stage.stage === "waiting_for_hook_reply",
    findings: found.status === "findings" ? found.findings.slice(0, 2).map((f) => ({ title: f.title, said: (f.spoken ?? f.explanation ?? "").trim() || f.title })) : [],
    hasWebsite: found.status !== "no_website" && found.status !== "profile",
    /* "Hi Kylie,": only a person the site's own crawl states as owner / founder (contentTrust ownerOf). First name only. */
    ownerName: (found.check.summary?.owner?.name ?? "").trim().split(/\s+/)[0] || null,
    foundOnGoogle: !!lead.place_id,
    /* The ONE website check: its state and the serious issues' plain titles, worst first (the first-reply pitch). */
    site: { state: found.check.state, issues: found.check.serious.map(plainIssueTitle),
      evidence: found.check.serious.map((i) => ({ title: plainIssueTitle(i), pages: i.pages })) },
    /* The bot answer follows the AI auto-reply switch; an unreadable switch reads as ON (never claim a person sent it). */
    aiAutoReplies: await aiSwitchOn(service),
  };
  const mt = moveThread(thread, inbound);
  const input: MoveInput = {
    thread: mt,
    /* Callers that know the conversation's phone re-check with it; this lead-only read fails closed. */
    suppressed: await isSuppressed(service, { leadId: lead.id }).catch(() => true),
    aiSentSinceWin: await aiSentSinceWin(service, lead, upTo),
    evidence,
  };
  const plan = pickMove(input);
  const ctx: AiReplyContext = {
    businessName: lead.business_name ?? "",
    latestInbound: inbound.body ?? "",
    thread: mt.map((m) => ({ from: m.from, text: m.text })),
    plan, evidence,
    contactFirstName: (lead.contact_name ?? "").trim().split(/\s+/)[0] || null,
  };
  const phases: Phases = { audit: await loadAuditPhase(service, lead.id), crawl: crawlPhaseOf(found.check.state, !!crawl?.last_failed_attempt), site: found.check.state };
  return { ctx, findingsNote: found.status === "findings" ? null : found.note, input, phases };
}

/** Write a draft for this context, inside the per-draft cost cap. One retry if the checks warn and the cap allows. */
async function writeDraft(service: Service | null, ctx: AiReplyContext, opts: { temperature: number; avoid?: string | null; userId: string | null; triggerSource: string; model?: string; capUsd?: number; log?: boolean }) {
  const model = opts.model ?? AI_REPLY_MODEL; const cap = opts.capUsd ?? AI_REPLY_DRAFT_MAX_USD;
  /* CODE WROTE EVERY WORD (the first-reply pitch, replyMove.ts): no model call, nothing spent, nothing reworded. */
  if (ctx.plan.fixedText) {
    const reply = fallbackAiReply(ctx);
    return { reply, problems: checkAiReply(reply, ctx), usedFallback: false, modelError: null as string | null, calls: 0, promptTokens: 0, completionTokens: 0, spentUsd: 0, model: "code" };
  }
  let spent = 0; let calls = 0; let promptTokens = 0; let completionTokens = 0;
  let prompt = buildAiReplyPrompt(ctx) + (opts.avoid ? `\n\nWRITE A DIFFERENT VERSION FROM THIS ONE:\n"""${opts.avoid.slice(0, 800)}"""` : "");
  let reply: string | null = null; let problems: string[] = []; let modelError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!mayCallWithin(spent, AI_REPLY_SYSTEM_PROMPT.length + prompt.length, cap, model)) { modelError = modelError ?? "cost_cap"; break; }
    const r = await callReplyModel(model, AI_REPLY_SYSTEM_PROMPT, prompt, opts.temperature);
    if (!r.ok) { modelError = r.error; break; }
    calls++; promptTokens += r.promptTokens; completionTokens += r.completionTokens; spent += callUsd(r.promptTokens, r.completionTokens, model);
    if (service && opts.log !== false) await logOpenAiUsage(service, { functionName: "ai-reply-drafts", apiType: "openai_ai_reply_draft", model, promptTokens: r.promptTokens, completionTokens: r.completionTokens, userId: opts.userId, triggerSource: opts.triggerSource });
    if (!r.reply) { modelError = "model_empty_reply"; continue; }
    const candidate = finishDraft(r.reply, evidenceNames(ctx.evidence), { followUp: isFollowUp(ctx.plan) });
    const cp = checkAiReply(candidate, ctx);
    if (reply === null || cp.length < problems.length) { reply = candidate; problems = cp; }
    if (!cp.length) break;
    prompt = `${buildAiReplyPrompt(ctx)}\n\nYOUR PREVIOUS DRAFT HAD THESE PROBLEMS, fix every one:\n- ${cp.join("\n- ")}\n\nPrevious draft:\n"""${candidate}"""`;
  }
  let usedFallback = false;
  if (!reply) { reply = fallbackAiReply(ctx); usedFallback = true; problems = checkAiReply(reply, ctx); }
  return { reply, problems, usedFallback, modelError, calls, promptTokens, completionTokens, spentUsd: Number(spent.toFixed(6)), model };
}

function whyOf(ctx: AiReplyContext, findingsNote: string | null, w: { problems: string[]; usedFallback: boolean; model?: string } | null, costUsd: number, calls: number, extra: Partial<AiReplyWhy> = {}): AiReplyWhy {
  const e = ctx.evidence; const p = ctx.plan;
  return {
    move: p.move, read: p.read, points: p.points, question: p.question, needsYou: p.needsYou, stop: p.stop, label: p.label,
    search: e.trade && e.town ? `${e.trade} in ${e.town}` : null,
    competitors: e.competitors, named: e.named, engineWords: e.trade ? e.engineWords : null, missed: e.missed ?? null,
    hookAlreadySent: e.hookAlreadySent,
    findings: e.findings.map((f) => f.title), findingsNote,
    /* The website issues the draft could name, each with the pages it was read on (the stored evidence). */
    siteIssues: e.site?.evidence ?? null, aiAutoReplies: e.aiAutoReplies === true,
    factSheetVersion: FACT_SHEET_VERSION,
    problems: w?.problems ?? [], usedFallback: w?.usedFallback ?? false, model: w?.model,
    costUsd, calls, styleSource: BEST_TEMPLATE_STYLE_NOTE,
    closer: p.closer ?? (p.question ? "question" : null), confidence: p.confidence ? CONFIDENCE_LINE : null,
    /* The playbook (replyPlaybook.ts): the intent read, "no draft", a note and a tied-in end date for the person's Next Action. */
    intent: p.intent ?? null, noDraft: p.noDraft === true, note: p.note ?? null, followUp: p.followUp ?? null, win: p.win ?? null,
    ...extra,
  };
}

/* ───────────────────────── a stop: opt out + cancel what is queued (the existing mechanisms) ───────────────────────── */

async function applyStop(service: Service, who: { phone: string | null; leadId: string }, source: string): Promise<"recorded" | "already" | "failed"> {
  const outcome = await recordOptOut(service, { phone: who.phone, leadId: who.leadId }, source);
  // Queued follow-ups: a waiting pitch (whatsapp_auto_replies) is retired, never sent. (The drain refuses a suppressed row too.)
  await service.from("whatsapp_auto_replies").update({ status: "skipped_suppressed", reason: "Asked to stop / angry reply (ai-reply-drafts)", updated_at: new Date().toISOString() })
    .eq("lead_id", who.leadId).in("status", [...WAITING_PITCH_STATUSES]).then(() => undefined, () => undefined);
  // A lead still waiting in the drip queue goes back to where it was (lead_unqueue's own rule).
  const { data: q } = await service.from("outreach_leads").select("id, status, previous_status").eq("id", who.leadId).eq("status", "queued").maybeSingle();
  if (q) {
    await service.from("outreach_leads").update({ status: q.previous_status ?? "not_contacted", previous_status: null, queued_at: null, contact_method: null }).eq("id", who.leadId).eq("status", "queued");
    await service.from("lead_activity").insert({ lead_id: who.leadId, actor_user_id: null, kind: "details_set", data: { queue: "removed", reason: "opted_out", source } }).then(() => undefined, () => undefined);
  }
  if (outcome === "recorded") {
    await service.from("lead_activity").insert({ lead_id: who.leadId, actor_user_id: null, kind: "opted_out", body: "Asked to stop or replied angrily on WhatsApp: future outreach is suppressed and queued follow-ups cancelled", data: { source } }).then(() => undefined, () => undefined);
  }
  return outcome;
}

/** An auto-reply or a bare "yes it is" is not a reply (Paul, 2026-10-20). Since 2026-10-21 this function no longer writes the
 *  lead's status: it TAGS each inbound (whatsapp_messages.reply_kind, src/lib/replyKindTag.ts) and the database derives the
 *  status from the messages (migration 20261118090000) — Contacted for an auto-reply / a bare yes, You replied once we answer a
 *  person, Replied for a real reply. Writes only the rows whose tag changed. Never touches a deal (the rule protects them). */
async function tagReplies(service: Service, thread: MsgRow[]): Promise<number> {
  const changes = replyKindChanges(thread.map((m) => ({ ...m, sent: isOurs(m) })));
  for (const ch of changes) {
    await service.from("whatsapp_messages").update({ reply_kind: ch.reply_kind }).eq("id", ch.id).eq("direction", "inbound");
  }
  return changes.length;
}

/* ───────────────────────── the Visible flag (src/lib/visibleFlag.ts) ───────────────────────── */

/** The two settings (rule + per-engine threshold) and the key a lead is judged under. */
type VisibleSettings = { rule: VisibleRule; share: VisibleShare; key: string };
async function visibleRuleNow(service: Service): Promise<VisibleSettings> {
  const { data } = await service.from("whatsapp_outreach_state").select("visible_rule, visible_min_share").eq("id", 1).maybeSingle();
  const rule = parseVisibleRule(data?.visible_rule); const share = parseVisibleShare(data?.visible_min_share);
  return { rule, share, key: visibleRuleKey(rule, share) };
}

/** Judge ONE lead: its newest ordinary audit, once that audit and the website check are final. Writes only through
 *  apply_lead_visible (which cancels the queued follow-ups on a new flag). Returns whether the lead is Visible now.
 *  ⛔ An audit still running, or a website check still running (inside EVIDENCE_WAIT_MS of the audit), changes nothing. */
async function judgeLeadVisible(service: Service, leadId: string, vs: VisibleSettings): Promise<boolean> {
  const [{ data: lead }, { data: audits }] = await Promise.all([
    service.from("outreach_leads").select("id, ai_visible_at, ai_visible_checked_audit_id, ai_visible_checked_rule").eq("id", leadId).maybeSingle(),
    service.from("ai_audits").select("id, audit_purpose, is_measurement, created_at, runs:ai_audit_runs(id, status)")
      .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!lead) return false;
  const was = !!lead.ai_visible_at;
  // deno-lint-ignore no-explicit-any
  const newest = ((audits ?? []) as any[]).find(isDrafterAudit) as { id: string; created_at: string; runs?: Array<{ id: string; status: string | null }> } | undefined;
  if (!newest) {
    if (was) await service.rpc("apply_lead_visible", { p_lead: leadId, p_visible: false, p_audit: null, p_rule: vs.key });
    return false;
  }
  const runs = newest.runs ?? [];
  const done = runs.filter((r) => r.status === "complete" || r.status === "capped");
  if (!done.length) return was;
  if (lead.ai_visible_checked_audit_id === newest.id && lead.ai_visible_checked_rule === vs.key) return was;
  const phases = await loadPhases(service, leadId);
  if (phases.crawl !== "final" && Date.now() - Date.parse(newest.created_at) < EVIDENCE_WAIT_MS) return was;
  const { data: rows, error } = await service.from("ai_audit_queue").select("gemini_answered, gemini_self_named, overview_answered, overview_self_named")
    .in("run_id", done.map((r) => r.id)).eq("status", "done");
  if (error) return was;
  const visible = isVisible(visibleCounts(rows ?? []), vs.rule, vs.share);
  await service.rpc("apply_lead_visible", { p_lead: leadId, p_visible: visible, p_audit: newest.id, p_rule: vs.key });
  return visible;
}

/** The tick's sweep: leads whose newest recent audit has not been judged under the current rule, and flagged leads judged
 *  under an older rule. Capped per tick; the rest are judged on the next ones. */
async function refreshVisibleFlags(service: Service, started: number) {
  const vs = await visibleRuleNow(service);
  const rule = vs.key;
  const sinceIso = new Date(Date.now() - VISIBLE_RECHECK_DAYS * 86_400_000).toISOString();
  const { data: audits, error } = await service.from("ai_audits").select("id, lead_id, audit_purpose, is_measurement")
    .not("lead_id", "is", null).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const newest = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  for (const a of (audits ?? []) as any[]) if (isDrafterAudit(a) && !newest.has(a.lead_id)) newest.set(a.lead_id, a.id);
  const { data: flagged } = await service.from("outreach_leads").select("id, ai_visible_checked_rule").not("ai_visible_at", "is", null).limit(1000);
  const due: string[] = ((flagged ?? []) as Array<{ id: string; ai_visible_checked_rule: string | null }>).filter((l) => l.ai_visible_checked_rule !== rule).map((l) => l.id);
  const ids = [...newest.keys()];
  for (let i = 0; i < ids.length && due.length < VISIBLE_SWEEP_MAX * 4; i += 150) {
    const { data: ls } = await service.from("outreach_leads").select("id, ai_visible_checked_audit_id, ai_visible_checked_rule").in("id", ids.slice(i, i + 150));
    for (const l of (ls ?? []) as Array<{ id: string; ai_visible_checked_audit_id: string | null; ai_visible_checked_rule: string | null }>) {
      if (l.ai_visible_checked_audit_id !== newest.get(l.id) || l.ai_visible_checked_rule !== rule) due.push(l.id);
    }
  }
  let judged = 0;
  for (const id of [...new Set(due)]) {
    if (judged >= VISIBLE_SWEEP_MAX || Date.now() - started > 30_000) break;
    await judgeLeadVisible(service, id, vs);
    judged++;
  }
}

/* ───────────────────────── Level 2: queue a draft to send by itself (src/lib/aiAutoSend.ts) ───────────────────────── */

/** Records the verdict on the draft (why.autoSend) and, only on `send: true`, queues ONE ordinary inbox_scheduled_sends row
 *  3–8 minutes on (inside the lead's send hours, inside WhatsApp's 24 hours). Nothing is sent here. */
async function maybeQueueAutoSend(service: Service, st: AutoSendState, a: {
  draftId: string; cand: { user_id: string; phone: string; lead_id: string | null; inbound_at: string; body: string | null };
  lead: LeadRow; input: MoveInput; plan: MovePlan; why: AiReplyWhy; w: { reply: string; problems: string[]; usedFallback: boolean };
}) {
  /* Nothing switched on: nothing to decide, nothing recorded (the default; no extra reads). */
  if (!st.masterOn || st.intents.length === 0) return;
  const nowMs = Date.now();
  const threadHard = threadHardReason(a.input);
  const [counts, active, admin] = await Promise.all([autoSendCounts(service), personActiveAt(service, a.cand.phone), sendAsIsAdmin(service, st.sendAs)]);
  const verdict = autoSendVerdict({
    masterOn: st.masterOn, intentsOn: st.intents, dailyCap: st.dailyCap, usedToday: counts.queuedToday,
    draft: draftFactsFromPlan(a.plan, { kind: "draft", text: a.w.reply, problems: a.w.problems, usedFallback: a.w.usedFallback, evidenceComplete: a.why.evidence?.complete === true }),
    theirMessages: theirMessagesSinceUs(a.input.thread),
    latestInbound: a.cand.body ?? "", threadHard, digits: a.cand.phone, lead: a.lead, suppressed: a.input.suppressed,
    personActiveAt: active, senderIsAdmin: admin, nowMs,
  });
  const record = async (autoSend: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    service.from("ai_reply_drafts").update({ why: { ...a.why, autoSend }, ...extra, updated_at: new Date().toISOString() })
      .eq("id", a.draftId).eq("status", "pending").select("id").maybeSingle();
  const key = autoSendKey(a.plan);
  if (!verdict.send) { await record({ send: false, reason: verdict.reason, intent: key }); return; }
  const [replyHours, countrySettings] = await Promise.all([loadReplyHours(service), loadCountrySettings(service)]);
  const window = replyWindowFor("whatsapp", a.cand.phone, { replyHours, countrySettings });
  const now = new Date(nowMs);
  const at = autoSendAt({ nowMs, inboundAtMs: Date.parse(a.cand.inbound_at), windowOpenNow: replyWindowOpen(window, now),
    nextOpenMs: nextWindowOpenAt(window, now).getTime(), delayMs: autoSendDelayMs() });
  if (at === null) { await record({ send: false, reason: "window_closing", intent: key }); return; }
  const { data: row, error } = await service.from("inbox_scheduled_sends").insert({
    user_id: a.cand.user_id, lead_id: a.cand.lead_id, phone: a.cand.phone, channel: "whatsapp", kind: "text", body: a.w.reply,
    send_at: new Date(at).toISOString(), tz: window.tz, status: "scheduled", queued_by: st.sendAs, checked_at: now.toISOString(),
    ai_draft_id: a.draftId, ai_intent: key,
  }).select("id").single();
  if (error || !row) { await record({ send: false, reason: "queue_failed", intent: key }); return; }
  const linked = await record({ send: true, at: new Date(at).toISOString(), intent: key, scheduledId: row.id, threadHard: null }, { auto_send_id: row.id });
  /* The draft moved on (a person acted in the meantime): the queued row must not go. */
  if (!linked.data) await stopAutoSend(service, row.id, "ai_draft_closed");
}

/* ───────────────────────── tick (cron) ───────────────────────── */

async function settleOpenClaims(service: Service) {
  const now = Date.now();
  await service.from("ai_reply_drafts").update({ status: "failed", error: "generation_interrupted", updated_at: new Date().toISOString() })
    .eq("status", "generating").lt("updated_at", new Date(now - GENERATING_STALE_MS).toISOString());
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
  /* A draft whose automatic reply is waiting or going is settled by that row (trg_ai_auto_send_row), never here. */
  const { data: open } = await service.from("ai_reply_drafts").select("id, phone, inbound_at").eq("status", "pending").is("auto_send_id", null).limit(200);
  for (const d of (open ?? []) as Array<{ id: string; phone: string; inbound_at: string }>) {
    const { data: ans } = await service.from("whatsapp_messages").select("id").eq("phone", d.phone).eq("direction", "outbound")
      .gt("created_at", d.inbound_at).in("status", SENT_OR_SIMULATED).limit(1);
    if ((ans ?? []).length) await service.from("ai_reply_drafts").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "pending");
  }
}

async function handleTick(service: Service) {
  const started = Date.now();
  await settleOpenClaims(service);
  /* Visible first, so a reply on a lead AI already names never gets a pitch or a Needs you this tick. */
  await refreshVisibleFlags(service, started).catch((e) =>
    console.error("[ai-reply-drafts] visible sweep failed:", String((e as { message?: unknown })?.message ?? e).slice(0, 200)));
  const { data: st } = await service.from("whatsapp_outreach_state").select("ai_handles_replies, ai_handles_replies_since").eq("id", 1).maybeSingle();
  const switchOn = st?.ai_handles_replies === true;
  const since = st?.ai_handles_replies_since ? Date.parse(st.ai_handles_replies_since) : Infinity;
  const mode = await paidMode(service);
  const { data: cands, error } = await service.rpc("ai_reply_draft_candidates", { p_limit: TICK_MAX_ROWS });
  if (error) throw error;
  const out: Array<{ inbound: string; kind: string; reason?: string | null }> = [];
  const env: TickEnv = { switchOn, since, mode, autoState: null };
  for (const row of (cands ?? []) as Array<Omit<Cand, "lead_id"> & { lead_id: string | null }>) {
    if (Date.now() - started > 90_000) break;
    if (!row.lead_id) continue; // an unmatched number: no lead (the Inbox shows it as Unassigned)
    const c: Cand = { ...row, lead_id: row.lead_id };
    /* A newer message from them: an automatic reply still waiting on this conversation is dropped first (its draft is
       superseded just below). The drain would drop it too; this makes it immediate. */
    await service.from("inbox_scheduled_sends").update({ status: "cancelled", cancel_reason: "ai_replied_since", updated_at: new Date().toISOString() })
      .eq("phone", c.phone).not("ai_draft_id", "is", null).in("status", ["scheduled", "held"]);
    await service.from("ai_reply_drafts").update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("user_id", c.user_id).eq("phone", c.phone).eq("status", "pending");
    // THE CLAIM: one row per inbound (unique index) and one open row per conversation (partial unique index).
    const { data: claimed, error: insErr } = await service.from("ai_reply_drafts").insert({
      user_id: c.user_id, lead_id: c.lead_id, phone: c.phone, inbound_message_id: c.inbound_id, inbound_at: c.inbound_at,
      kind: "skipped", status: "generating",
    }).select("id").maybeSingle();
    if (insErr || !claimed) continue;
    const id = claimed.id as string;
    await service.from("ai_reply_drafts").update({ superseded_by: id }).eq("user_id", c.user_id).eq("phone", c.phone).eq("status", "superseded").is("superseded_by", null);
    out.push(await processInbound(service, id, c, env));
  }
  /* Replies that waited for their audit + website check: drafted the tick both are final, or flagged after the wait. */
  const { data: waiting } = await service.from("ai_reply_drafts").select("id, user_id, phone, lead_id, inbound_message_id, inbound_at")
    .eq("status", "pending").eq("kind", "skipped").eq("reason", WAITING_REASON).order("inbound_at", { ascending: true }).limit(50);
  for (const d of (waiting ?? []) as Array<{ id: string; user_id: string; phone: string; lead_id: string | null; inbound_message_id: string; inbound_at: string }>) {
    if (Date.now() - started > 90_000) break;
    if (!d.lead_id) continue;
    const due = Date.now() - Date.parse(d.inbound_at) >= EVIDENCE_WAIT_MS;
    if (!due && verdictFor(await loadPhases(service, d.lead_id), d.inbound_at).state !== "ready") continue;
    // The claim: a person's Draft reply or a newer message may have moved this row on.
    const { data: won } = await service.from("ai_reply_drafts").update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", d.id).eq("status", "pending").eq("reason", WAITING_REASON).select("id").maybeSingle();
    if (!won) continue;
    out.push(await processInbound(service, d.id, { inbound_id: d.inbound_message_id, user_id: d.user_id, phone: d.phone, lead_id: d.lead_id, inbound_at: d.inbound_at, body: null, message_type: null }, env));
  }
  if (Date.now() - started < 90_000) await refreshEvidenceLessPitches(service).catch((e) =>
    console.error("[ai-reply-drafts] pitch refresh failed:", String((e as { message?: unknown })?.message ?? e).slice(0, 200)));
  return json({ ok: true, switch_on: switchOn, mode, handled: out.length, results: out, ms: Date.now() - started });
}

/** The audit + website check phases for a lead, without building a whole context (the waiting rows' cheap check). */
async function loadPhases(service: Service, leadId: string): Promise<Phases> {
  const [{ data: lead }, { data: crawl }, audit] = await Promise.all([
    service.from("outreach_leads").select("website").eq("id", leadId).maybeSingle(),
    service.from("lead_crawl_checks").select("result, created_at, last_failed_attempt").eq("lead_id", leadId).maybeSingle(),
    loadAuditPhase(service, leadId),
  ]);
  const check = websiteCheckFor(crawl?.result ? { result: crawl.result, created_at: crawl.created_at } : null, { website: lead?.website ?? null });
  return { audit, crawl: crawlPhaseOf(check.state, !!crawl?.last_failed_attempt), site: check.state };
}

interface TickEnv { switchOn: boolean; since: number; mode: string; autoState: AutoSendState | null }
type Cand = { inbound_id: string; user_id: string; phone: string; lead_id: string; inbound_at: string; body: string | null; message_type: string | null };

/** One inbound, on its claimed row (status 'generating'): the flag, the wait for evidence, or the draft. */
async function processInbound(service: Service, id: string, c: Cand, env: TickEnv): Promise<{ inbound: string; kind: string; reason?: string | null }> {
  try {
    const lead = await loadLead(service, c.lead_id);
    const thread = await loadThread(service, c.user_id, c.phone);
    const inbound = thread.find((m) => m.id === c.inbound_id) ?? { id: c.inbound_id, created_at: c.inbound_at, direction: "inbound", body: c.body, message_type: c.message_type, template_name: null, status: null, lead_id: c.lead_id };
    const hadOutreach = thread.some((m) => m.direction === "outbound" && isOurs(m) && m.created_at < c.inbound_at);
    if (!lead) {
      await service.from("ai_reply_drafts").update({ kind: "skipped", status: "resolved", reason: "no_lead", updated_at: new Date().toISOString() }).eq("id", id);
      return { inbound: c.inbound_id, kind: "skipped", reason: "no_lead" };
    }
    /* The status follows the messages (the database rule); this only tags what each of their messages is. */
    await tagReplies(service, thread).catch((e) => console.error("[ai-reply-drafts] reply tags failed:", String((e as { message?: unknown })?.message ?? e).slice(0, 200)));
    const { ctx, findingsNote, input, phases } = await buildContext(service, lead, thread, inbound);
    input.suppressed = await isSuppressed(service, { phone: c.phone, leadId: c.lead_id }); // fails closed
    const plan: MovePlan = pickMove(input); ctx.plan = plan;
    const decision = aiReplyDecision({ inboundAt: c.inbound_at, lead, hadOutreach, plan });
    const now = new Date().toISOString();
    /* ⛔ VISIBLE (visibleFlag.ts): AI already names them — no pitch, no draft, no Needs you. A stop still opts them out. A pitch
       whose evidence just became final is judged here first, so the sweep's order can never let one through. */
    const stopping = decision.kind === "needs_you" && decision.stop;
    const visible = !stopping && (!!lead.ai_visible_at || (pitchNeedsEvidence(plan) && verdictFor(phases, c.inbound_at).state === "ready"
      && await judgeLeadVisible(service, lead.id, await visibleRuleNow(service))));
    if (visible) {
      await service.from("ai_reply_drafts").update({ kind: "skipped", status: "resolved", reason: VISIBLE_SKIP_REASON, reason_label: VISIBLE_LABEL, draft_text: null, why: whyOf(ctx, findingsNote, null, 0, 0), updated_at: now }).eq("id", id);
      return { inbound: c.inbound_id, kind: "skipped", reason: VISIBLE_SKIP_REASON };
    }
    if (decision.kind === "skipped") {
      await service.from("ai_reply_drafts").update({ kind: "skipped", status: "resolved", reason: decision.reason, why: whyOf(ctx, findingsNote, null, 0, 0), updated_at: now }).eq("id", id);
    } else if (decision.kind === "needs_you") {
      let optedOut: "recorded" | "already" | "failed" | null = null;
      // ⛔ A stop or an angry reply: opt out + cancel the queued follow-ups at once, through the existing mechanisms.
      if (decision.stop && decision.reason !== "do_not_contact") optedOut = await applyStop(service, { phone: c.phone, leadId: c.lead_id }, `ai_reply_${decision.reason}`);
      await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: decision.reason, reason_label: decision.label, why: whyOf(ctx, findingsNote, null, 0, 0, { optedOut }), updated_at: now }).eq("id", id);
    } else if (decision.kind === "needs_template") {
      await service.from("ai_reply_drafts").update({ kind: "needs_template", status: "pending", reason: "window_closed", reason_label: "Outside the 24-hour window", updated_at: now }).eq("id", id);
    } else if (!env.switchOn || Date.parse(c.inbound_at) < env.since || !plan.autoDraft) {
      // ⛔ The switch is off (or this reply is from before it went on): no model call. "Draft reply" writes it on demand.
      await service.from("ai_reply_drafts").update({ kind: "skipped", status: "resolved", reason: "awaiting_person", why: whyOf(ctx, findingsNote, null, 0, 0), updated_at: now }).eq("id", id);
    } else if (env.mode !== "running") {
      await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: "paused", reason_label: HANDOVER_LABELS.paused, updated_at: now }).eq("id", id);
    } else {
      const ev = verdictFor(phases, c.inbound_at);
      /* ⛔ THE PITCH WAITS FOR ITS EVIDENCE (draftEvidenceWait.ts): the audit and the website check both final, else wait
         (no chip, no panel), and after EVIDENCE_WAIT_MS a person takes it. Every flag above never waits. */
      if (pitchNeedsEvidence(plan) && ev.state === "waiting") {
        await service.from("ai_reply_drafts").update({ kind: "skipped", status: "pending", reason: WAITING_REASON, reason_label: WAITING_LABEL, draft_text: null,
          why: whyOf(ctx, findingsNote, null, 0, 0, { evidence: whyEvidence(ev, phases.site) }), updated_at: now }).eq("id", id);
        return { inbound: c.inbound_id, kind: "waiting", reason: `waiting_for_${ev.waitingFor.join("_and_")}` };
      }
      if (pitchNeedsEvidence(plan) && ev.state === "timed_out") {
        await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: AUDIT_NOT_FINISHED_REASON, reason_label: AUDIT_NOT_FINISHED_LABEL, draft_text: null,
          why: whyOf(ctx, findingsNote, null, 0, 0, { evidence: whyEvidence(ev, phases.site) }), updated_at: now }).eq("id", id);
        return { inbound: c.inbound_id, kind: "needs_you", reason: AUDIT_NOT_FINISHED_REASON };
      }
      const w = await writeDraft(service, ctx, { temperature: 0.5, userId: c.user_id, triggerSource: "auto" });
      const why = whyOf(ctx, findingsNote, w, w.spentUsd, w.calls, { evidence: whyEvidence(ev, phases.site) });
      await service.from("ai_reply_drafts").update({
        kind: "draft", status: "pending", draft_text: w.reply, why, reason: null, reason_label: null,
        model: w.model, prompt_tokens: w.promptTokens, completion_tokens: w.completionTokens, cost_usd: w.spentUsd, model_calls: w.calls,
        error: w.modelError, updated_at: now,
      }).eq("id", id);
      // LEVEL 2: queue it to send by itself, or leave it for approval (the default). Never throws into the tick.
      env.autoState ??= await loadAutoSendState(service);
      await maybeQueueAutoSend(service, env.autoState, { draftId: id, cand: c, lead, input, plan, why, w }).catch((e) =>
        console.error("[ai-reply-drafts] auto-send check failed:", String((e as { message?: unknown })?.message ?? e).slice(0, 200)));
    }
    return { inbound: c.inbound_id, kind: decision.kind, reason: "reason" in decision ? decision.reason : null };
  } catch (e) {
    const msg = String((e as { message?: unknown })?.message ?? e).slice(0, 300);
    await service.from("ai_reply_drafts").update({ kind: "needs_you", status: "pending", reason: "draft_failed", reason_label: HANDOVER_LABELS.draft_failed, error: msg, updated_at: new Date().toISOString() }).eq("id", id);
    return { inbound: c.inbound_id, kind: "needs_you", reason: "draft_failed" };
  }
}

/** An OPEN pitch draft written without its audit / website check (before this release, or after the wait ran out) is
 *  rewritten once both are final. The pitch is code-built (no model call, nothing spent). A row a person or the AI is
 *  acting on is left alone (conditional on the row being unchanged); a rewrite that is no longer a pitch only marks the
 *  draft `evidenceStale` (Regenerate it). Nothing sends. */
async function refreshEvidenceLessPitches(service: Service) {
  const { data } = await service.from("ai_reply_drafts").select("id, user_id, phone, lead_id, inbound_message_id, inbound_at, draft_text, why, updated_at")
    .eq("status", "pending").eq("kind", "draft").is("auto_send_id", null).gt("inbound_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("inbound_at", { ascending: false }).limit(200);
  // deno-lint-ignore no-explicit-any
  const rows = ((data ?? []) as any[]).filter((d) => d.lead_id && d.why?.evidenceStale !== true && draftLackedEvidence(d.why, d.draft_text)).slice(0, TICK_MAX_ROWS);
  for (const d of rows) {
    if (verdictFor(await loadPhases(service, d.lead_id), d.inbound_at).state !== "ready") continue;
    const lead = await loadLead(service, d.lead_id);
    if (!lead) continue;
    const thread = await loadThread(service, d.user_id, d.phone);
    const inbound = thread.find((m) => m.id === d.inbound_message_id);
    if (!inbound) continue;
    const { ctx, findingsNote, input, phases: now } = await buildContext(service, lead, thread, inbound);
    input.suppressed = await isSuppressed(service, { phone: d.phone, leadId: d.lead_id });
    const plan = pickMove(input); ctx.plan = plan;
    const ev = verdictFor(now, d.inbound_at);
    const still = (q: Service) => q.eq("id", d.id).eq("status", "pending").eq("updated_at", d.updated_at).is("auto_send_id", null);
    if (pitchNeedsEvidence(plan) && plan.fixedText && !plan.stop && !plan.needsYou && ev.state === "ready") {
      const w = await writeDraft(service, ctx, { temperature: 0.5, userId: d.user_id, triggerSource: "auto" });
      await still(service.from("ai_reply_drafts").update({ draft_text: w.reply, why: whyOf(ctx, findingsNote, w, 0, 0, { evidence: whyEvidence(ev, now.site), evidenceRefreshedAt: new Date().toISOString() }), updated_at: new Date().toISOString() }));
    } else {
      await still(service.from("ai_reply_drafts").update({ why: { ...(d.why ?? {}), evidenceStale: true }, updated_at: new Date().toISOString() }));
    }
  }
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
  if ((d.kind !== "draft" && d.kind !== "needs_you") || !str(d.draft_text)) return json({ ok: false, error: "not_a_draft", detail: "There is no draft to send on this conversation." });
  if (STOP_REASONS.has(d.reason ?? "")) return json({ ok: false, error: "stopped", detail: "They asked to stop (or replied angrily). Nothing is sent from a draft." });
  if (d.status !== "pending") return json({ ok: false, error: "already_claimed", status: d.status, detail: d.status === "sent" ? "This draft has already been sent." : d.status === "sending" ? "This draft is being sent already." : "This draft is no longer open." });
  if (!serviceWindowState(d.inbound_at).open) return json({ ok: false, error: "window_closed", detail: "Their last message was more than 24 hours ago. Only an approved template can be sent now." });
  if (await isSuppressed(service, { phone: d.phone, leadId: d.lead_id })) return json({ ok: false, error: "suppressed", detail: "This number is on the opt-out / Do Not Contact list." });
  if (await answeredSince(service, d.phone, d.inbound_at)) {
    await service.from("ai_reply_drafts").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "pending");
    return json({ ok: false, error: "already_answered", detail: "Someone has already replied to this message, so the draft was closed." });
  }
  const finalText = str(body.final_text);
  if (!finalText) return json({ ok: false, error: "empty_message" }, 400);
  // Level 2: a person approving wins over a waiting automatic reply — unless the AI is already sending it.
  if (d.auto_send_id && !(await stopAutoSend(service, d.auto_send_id, "ai_person_approved"))) {
    return json({ ok: false, error: "already_claimed", detail: "The AI is sending this reply right now." });
  }
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
  await service.from("ai_reply_drafts").update({
    status: "pending", claimed_by: null, claimed_at: null, error: str(body.error).slice(0, 300) || "send_failed", updated_at: new Date().toISOString(),
  }).eq("id", d.id).eq("status", "sending");
  return json({ ok: true, status: "pending" });
}

async function handleDiscard(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  if (r.d.auto_send_id && !(await stopAutoSend(service, r.d.auto_send_id, "ai_person_discarded"))) {
    return json({ ok: false, error: "not_open", status: "sending", detail: "The AI is sending this reply right now." });
  }
  const { data: done } = await service.from("ai_reply_drafts")
    .update({ status: "discarded", discarded_by: actor.id, discarded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", r.d.id).eq("status", "pending").select("id").maybeSingle();
  return done ? json({ ok: true }) : json({ ok: false, error: "not_open", status: r.d.status, detail: "This draft is no longer open." });
}

/** A person-started model call: the usage guard first, then the draft for this context. */
async function personDraft(service: Service, actor: Actor, leadId: string, ctx: AiReplyContext, avoid: string | null) {
  const guard = await guardAction(service, actor.id, "ai_draft", { fn: "ai-reply-drafts", leadId, role: actor.role, estCostUsd: actor.role === "admin" ? 0 : AI_REPLY_DRAFT_MAX_USD });
  if (!guard.ok) return { ok: false as const, res: json(guard.body, guard.status) };
  const w = await writeDraft(service, ctx, { temperature: avoid ? 0.85 : 0.5, avoid, userId: actor.id, triggerSource: "user" });
  return { ok: true as const, w };
}

async function handleRegenerate(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  const d = r.d;
  if ((d.kind !== "draft" && d.kind !== "needs_you") || d.status !== "pending") return json({ ok: false, error: "not_open", detail: "This draft is no longer open." });
  if (STOP_REASONS.has(d.reason ?? "")) return json({ ok: false, error: "stopped", detail: "They asked to stop. No draft is written." });
  if ((d.regenerations ?? 0) >= AI_REPLY_MAX_REGENERATIONS) return json({ ok: false, error: "regenerate_limit", detail: `This draft has been rewritten ${AI_REPLY_MAX_REGENERATIONS} times. Edit it by hand.` });
  if (!serviceWindowState(d.inbound_at).open) return json({ ok: false, error: "window_closed", detail: "Outside the 24-hour window — only an approved template can be sent now." });
  const lead = await loadLead(service, d.lead_id);
  if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);
  const thread = await loadThread(service, d.user_id, d.phone);
  const inbound = thread.find((m) => m.id === d.inbound_message_id);
  if (!inbound) return json({ ok: false, error: "inbound_not_found" }, 404);
  const { ctx, findingsNote, phases } = await buildContext(service, lead, thread, inbound);
  if (ctx.plan.stop || ctx.plan.noDraft) return json({ ok: false, error: "no_draft", detail: "The playbook has no reply for this one. Answer it yourself." });
  // ⛔ A pitch is never rewritten without its evidence while the audit / website check are still running (draftEvidenceWait.ts).
  const ev = verdictFor(phases, d.inbound_at);
  if (pitchNeedsEvidence(ctx.plan) && ev.state === "waiting") return json({ ok: false, error: AUDIT_RUNNING_ERROR, detail: AUDIT_RUNNING_DETAIL });
  if (pitchNeedsEvidence(ctx.plan) && lead.ai_visible_at) return json({ ok: false, error: VISIBLE_NO_PITCH_ERROR, detail: VISIBLE_NO_PITCH_DETAIL });
  if (d.auto_send_id && !(await stopAutoSend(service, d.auto_send_id, "ai_person_regenerated"))) {
    return json({ ok: false, error: "not_open", detail: "The AI is sending this reply right now." });
  }
  const pd = await personDraft(service, actor, d.lead_id, ctx, str(body.avoid) || d.draft_text);
  if (!pd.ok) return pd.res;
  const w = pd.w;
  const totalUsd = Number((Number(d.cost_usd ?? 0) + w.spentUsd).toFixed(6));
  const calls = (d.model_calls ?? 0) + w.calls;
  const { data: saved } = await service.from("ai_reply_drafts").update({
    draft_text: w.reply, why: whyOf(ctx, findingsNote, w, totalUsd, calls, { evidence: whyEvidence(ev, phases.site) }), regenerations: (d.regenerations ?? 0) + 1,
    prompt_tokens: (d.prompt_tokens ?? 0) + w.promptTokens, completion_tokens: (d.completion_tokens ?? 0) + w.completionTokens,
    cost_usd: totalUsd, model_calls: calls, error: w.modelError, updated_at: new Date().toISOString(),
  }).eq("id", d.id).eq("status", "pending").select("id, draft_text, why, regenerations").maybeSingle();
  if (!saved) return json({ ok: false, error: "not_open", detail: "This draft closed while it was being rewritten." });
  return json({ ok: true, draft: saved });
}

/** "Draft reply": a draft for the newest inbound on this conversation, always, except a stop (then Mark opted out). */
async function handleDraft(service: Service, actor: Actor, body: Record<string, unknown>) {
  const leadId = str(body.lead_id);
  if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
  const access = await leadAccess(service, actor, leadId);
  if (!access.ok) return json({ ok: false, error: access.error === "lookup_failed" ? "upstream_timeout" : "not_found", detail: "That conversation is not in your list." }, access.error === "lookup_failed" ? 503 : 404);
  const lead = await loadLead(service, leadId);
  if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);
  const phone = str(body.phone) || null;
  let thread: MsgRow[];
  if (phone) thread = await loadThread(service, access.bookUserId, phone);
  else {
    const { data } = await service.from("whatsapp_messages").select("id, created_at, direction, body, message_type, template_name, status, lead_id, template_snapshot, phone, reply_kind").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(60);
    thread = ((data ?? []) as MsgRow[]).slice().reverse();
  }
  const inbound = [...thread].reverse().find((m) => m.direction === "inbound");
  if (!inbound) return json({ ok: false, error: "no_reply_yet", detail: "They have not replied yet, so there is nothing to answer." });
  const convPhone = phone ?? (inbound as MsgRow & { phone?: string }).phone ?? lead.phone ?? "";
  if (!serviceWindowState(inbound.created_at).open) return json({ ok: false, error: "window_closed", detail: "Their last message was more than 24 hours ago. Only an approved template can be sent now." });
  const { ctx, findingsNote, input, phases } = await buildContext(service, lead, thread, inbound);
  input.suppressed = await isSuppressed(service, { phone: convPhone, leadId });
  const plan = pickMove(input); ctx.plan = plan;
  // ⛔ No pitch before its evidence (draftEvidenceWait.ts): said before anything is touched. The tick writes it when ready.
  const ev = verdictFor(phases, inbound.created_at);
  if (!plan.stop && !plan.noDraft && pitchNeedsEvidence(plan) && ev.state === "waiting") return json({ ok: false, error: AUDIT_RUNNING_ERROR, detail: AUDIT_RUNNING_DETAIL });
  // ⛔ No pitch for a lead AI already names (visibleFlag.ts). Any other reply may still be drafted on demand.
  if (!plan.stop && !plan.noDraft && pitchNeedsEvidence(plan) && lead.ai_visible_at) return json({ ok: false, error: VISIBLE_NO_PITCH_ERROR, detail: VISIBLE_NO_PITCH_DETAIL });
  const { data: existing } = await service.from("ai_reply_drafts").select("id, status, cost_usd, model_calls, prompt_tokens, completion_tokens, draft_text").eq("inbound_message_id", inbound.id).maybeSingle();
  if (existing && (existing.status === "sending" || existing.status === "generating")) return json({ ok: false, error: "busy", detail: "A draft is being written or sent on this conversation already." });
  // Level 2: a person drafting takes the conversation back from any automatic reply still waiting (one being sent wins).
  const { data: going } = await service.from("inbox_scheduled_sends").select("id").eq("phone", convPhone).not("ai_draft_id", "is", null).eq("status", "sending").limit(1);
  if ((going ?? []).length) return json({ ok: false, error: "busy", detail: "The AI is sending a reply on this conversation right now." });
  await service.from("inbox_scheduled_sends").update({ status: "cancelled", cancel_reason: "ai_person_drafted", updated_at: new Date().toISOString() })
    .eq("phone", convPhone).not("ai_draft_id", "is", null).in("status", ["scheduled", "held"]);
  // Free the conversation's one open slot: any other open row is superseded first.
  await service.from("ai_reply_drafts").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("user_id", access.bookUserId).eq("phone", convPhone).eq("status", "pending").neq("inbound_message_id", inbound.id);
  let row: Record<string, unknown>;
  let w: Awaited<ReturnType<typeof writeDraft>> | null = null;
  if (plan.stop || plan.noDraft) {
    row = { kind: "needs_you", status: "pending", reason: plan.needsYou?.reason ?? "opt_out", reason_label: plan.needsYou?.label ?? HANDOVER_LABELS.opt_out, draft_text: null, why: whyOf(ctx, findingsNote, null, 0, 0) };
  } else {
    const pd = await personDraft(service, actor, leadId, ctx, null);
    if (!pd.ok) return pd.res;
    w = pd.w;
    row = {
      kind: plan.needsYou ? "needs_you" : "draft", status: "pending",
      reason: plan.needsYou?.reason ?? null, reason_label: plan.needsYou?.label ?? null,
      draft_text: w.reply, why: whyOf(ctx, findingsNote, w, w.spentUsd, w.calls, { evidence: whyEvidence(ev, phases.site) }), model: w.model,
      prompt_tokens: w.promptTokens, completion_tokens: w.completionTokens, cost_usd: w.spentUsd, model_calls: w.calls, error: w.modelError,
    };
  }
  row.updated_at = new Date().toISOString();
  let saved;
  if (existing) {
    ({ data: saved } = await service.from("ai_reply_drafts").update({ ...row, claimed_by: null, claimed_at: null }).eq("id", existing.id).not("status", "in", "(sending,generating)").select("id, phone, lead_id, kind, status, inbound_at, reason, reason_label, draft_text, why, error, regenerations").maybeSingle());
  } else {
    ({ data: saved } = await service.from("ai_reply_drafts").insert({ ...row, user_id: access.bookUserId, lead_id: leadId, phone: convPhone, inbound_message_id: inbound.id, inbound_at: inbound.created_at })
      .select("id, phone, lead_id, kind, status, inbound_at, reason, reason_label, draft_text, why, error, regenerations").maybeSingle());
  }
  if (!saved) return json({ ok: false, error: "not_saved", detail: "The draft could not be saved. Try again." });
  return json({ ok: true, draft: saved, stop: plan.stop, no_draft: plan.noDraft === true });
}

/** The one-tap opt-out on a stop (or any conversation the person is working). The existing mechanism; sends nothing. */
async function handleMarkOptedOut(service: Service, actor: Actor, body: Record<string, unknown>) {
  const leadId = str(body.lead_id);
  if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
  const access = await leadAccess(service, actor, leadId);
  if (!access.ok) return json({ ok: false, error: "not_found" }, 404);
  const phone = str(body.phone) || null;
  const outcome = await applyStop(service, { phone, leadId }, "inbox_mark_opted_out");
  if (outcome === "failed") return json({ ok: false, error: "suppression_failed", detail: "The opt-out could not be saved. Try again." }, 500);
  const draftId = str(body.draft_id);
  if (draftId) {
    const { data: d } = await service.from("ai_reply_drafts").select("id, why").eq("id", draftId).eq("lead_id", leadId).maybeSingle();
    if (d) await service.from("ai_reply_drafts").update({ why: { ...(d.why ?? {}), optedOut: outcome }, updated_at: new Date().toISOString() }).eq("id", d.id);
  }
  return json({ ok: true, outcome });
}

/* ───────────────────────── dry run (admin / internal; saves nothing) ───────────────────────── */

interface Fixture {
  id: string; businessName: string; trade: string; town: string; hasWebsite: boolean; ownerName: string | null;
  audit: null | { engine: string; namedAnswers: number; validAnswers: number; competitors: string[]; missedQuestion?: string | null };
  findings: Array<{ title: string; said: string }>;
  thread: Array<{ from: "us" | "them"; text: string; templateName: string | null; messageType: string; at?: string | null }>;
  aiSentSinceWin?: number; suppressed?: boolean; foundOnGoogle?: boolean;
  site?: MoveEvidence["site"]; aiAutoReplies?: boolean;
}

function fixtureContext(f: Fixture): AiReplyContext {
  const thread: MoveThreadMsg[] = f.thread.map((m) => ({ from: m.from, text: m.text, templateName: m.templateName, messageType: m.messageType, at: m.at ?? null }));
  const sent = thread.filter((m) => m.from === "us").map((m) => ({ text: m.text, templateName: m.templateName }));
  const hook = f.thread.some((m) => m.from === "us" && !!m.templateName && m.templateName !== "initial_contact" && m.templateName !== "initial_opener_v2");
  const evidence: MoveEvidence = {
    businessName: f.businessName, trade: f.audit ? f.trade : null, town: f.audit ? f.town : null,
    engineWords: conversationEngine(sent, f.audit?.engine ?? null).words,
    named: f.audit && f.audit.validAnswers > 0 ? { named: f.audit.namedAnswers, valid: f.audit.validAnswers } : null,
    competitors: draftNames(f.audit?.competitors ?? [], f.town),
    missed: f.audit?.missedQuestion ? { engine: f.audit.engine, question: f.audit.missedQuestion } : null, hookAlreadySent: hook, findings: f.findings ?? [],
    hasWebsite: f.hasWebsite, ownerName: f.ownerName, foundOnGoogle: f.foundOnGoogle ?? true, site: f.site ?? null, aiAutoReplies: f.aiAutoReplies === true,
  };
  const plan = pickMove({ thread, suppressed: f.suppressed === true, aiSentSinceWin: f.aiSentSinceWin ?? 0, evidence });
  const latest = [...thread].reverse().find((m) => m.from === "them");
  return { businessName: f.businessName, latestInbound: latest?.text ?? "", thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence, contactFirstName: null };
}

/** ADMIN (or the internal job). The draft for one lead's newest inbound, or for each FIXTURE given.
 *  ⛔ Writes no ai_reply_drafts row, sends nothing, touches no message, and (fixtures) logs no usage row: it saves nothing. */
async function handleDryRun(service: Service, actor: Actor | null, body: Record<string, unknown>) {
  if (actor && actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
  const model = str(body.model) || AI_REPLY_MODEL;
  if (!DRY_RUN_MODELS[model]) return json({ ok: false, error: "model_not_allowed", allowed: Object.keys(DRY_RUN_MODELS) }, 400);
  const fixtures = Array.isArray(body.fixtures) ? (body.fixtures as Fixture[]).slice(0, 20) : null;
  if (fixtures) {
    const results = [];
    for (const f of fixtures) {
      const ctx = fixtureContext(f);
      const p = ctx.plan;
      const w = p.stop || p.noDraft ? null : await writeDraft(null, ctx, { temperature: 0.5, userId: null, triggerSource: "dry_run", model, capUsd: DRY_RUN_DRAFT_MAX_USD, log: false });
      results.push({ id: f.id, move: p.move, intent: p.intent ?? null, no_draft: p.noDraft === true, note: p.note ?? null, follow_up: p.followUp ?? null, win: p.win ?? null, closer: p.closer ?? null, confidence: !!p.confidence, site_issues: ctx.evidence.site?.evidence ?? null, read: p.read, needs_you: p.needsYou?.reason ?? null, stop: p.stop, auto_draft: p.autoDraft, label: p.label, points: p.points, question: p.question,
        draft: w?.reply ?? null, warnings: w?.problems ?? [], used_fallback: w?.usedFallback ?? false, model_error: w?.modelError ?? null, cost_usd: w?.spentUsd ?? 0 });
    }
    return json({ ok: true, dry_run: true, saved: false, model, fact_sheet: FACT_SHEET_VERSION, results });
  }
  if (!actor) return json({ ok: false, error: "fixtures_required" }, 400);
  const leadId = str(body.lead_id);
  if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
  const lead = await loadLead(service, leadId);
  if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);
  const guard = await guardAction(service, actor.id, "ai_draft", { fn: "ai-reply-drafts", leadId, role: actor.role, estCostUsd: 0 });
  if (!guard.ok) return json(guard.body, guard.status);
  const { data, error } = await service.from("whatsapp_messages").select("id, created_at, direction, body, message_type, template_name, status, lead_id, template_snapshot")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const thread = ((data ?? []) as MsgRow[]).slice().reverse();
  const real = [...thread].reverse().find((m) => m.direction === "inbound") ?? null;
  const sample = str(body.sample_inbound) || "Hi. Yes it is. How can I help?";
  const inbound: MsgRow = real ?? { id: "dry-run", created_at: new Date().toISOString(), direction: "inbound", body: sample, message_type: "text", template_name: null, status: "received", lead_id: leadId };
  const withInbound = real ? thread : [...thread, inbound];
  const { ctx, findingsNote } = await buildContext(service, lead, withInbound, inbound);
  const w = ctx.plan.stop || ctx.plan.noDraft ? null : await writeDraft(service, ctx, { temperature: 0.5, userId: actor.id, triggerSource: "user", model, capUsd: model === AI_REPLY_MODEL ? AI_REPLY_DRAFT_MAX_USD : DRY_RUN_DRAFT_MAX_USD });
  return json({ ok: true, dry_run: true, saved: false, lead: lead.business_name, inbound: { text: inbound.body, at: inbound.created_at, stand_in: !real },
    plan: ctx.plan, draft: w?.reply ?? null, why: whyOf(ctx, findingsNote, w, w?.spentUsd ?? 0, w?.calls ?? 0), model_error: w?.modelError ?? null });
}

/** THE INBOX REPLY MODE (src/lib/inboxReplyMode.ts): `set_mode` stores Manual / Draft for approval / Auto. The database keeps
 *  the old columns in step (trg_inbox_reply_mode_sync: the switch, the reply audit, and the clock that stops a backlog being
 *  drafted) and leaving Auto cancels every automatic reply waiting (trg_ai_auto_send_switch). `set_enabled` (the old switch)
 *  still works for an older screen: on = Draft for approval, never Auto. */
async function handleSettings(service: Service, actor: Actor, body: Record<string, unknown>, set: "mode" | "enabled" | null) {
  if (actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
  if (set) {
    const raw = set === "mode" ? str(body.mode) : body.enabled === true ? "draft" : "manual";
    if (!(INBOX_REPLY_MODES as readonly string[]).includes(raw)) return json({ ok: false, error: "bad_mode", detail: "Choose Manual, Draft for approval or Auto." }, 400);
    const { error } = await service.from("whatsapp_outreach_state").update({ ai_reply_mode: raw, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
  }
  const { data } = await service.from("whatsapp_outreach_state").select("ai_reply_mode, ai_handles_replies, ai_handles_replies_since, ai_auto_send_intents, ai_auto_send_daily_cap").eq("id", 1).maybeSingle();
  return json({ ok: true, mode: parseInboxReplyMode(data?.ai_reply_mode), enabled: data?.ai_handles_replies === true, since: data?.ai_handles_replies_since ?? null, auto_send: autoSendSettings(data) });
}

function autoSendSettings(data: Record<string, unknown> | null | undefined) {
  return {
    intents: cleanAutoSendKeys(data?.ai_auto_send_intents),
    daily_cap: Number.isInteger(data?.ai_auto_send_daily_cap) ? data!.ai_auto_send_daily_cap as number : AUTO_SEND_DEFAULT_DAILY_CAP,
    max_daily_cap: AUTO_SEND_MAX_DAILY_CAP,
    choices: AUTO_SEND_CHOICES,
  };
}

/** LEVEL 2 switches (admin): which reply types send by themselves, and the daily cap. Unknown types are dropped, never
 *  stored. The admin who saves is the account automatic replies are sent as (re-checked as admin on every send). A type
 *  switched off cancels its waiting replies (trigger trg_ai_auto_send_switch). */
async function handleSetAutoSend(service: Service, actor: Actor, body: Record<string, unknown>) {
  if (actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
  const patch: Record<string, unknown> = { ai_auto_send_by: actor.id, updated_at: new Date().toISOString() };
  if ("intents" in body) patch.ai_auto_send_intents = cleanAutoSendKeys(body.intents);
  if ("daily_cap" in body) {
    const cap = cleanDailyCap(body.daily_cap);
    if (cap === null) return json({ ok: false, error: "bad_daily_cap", detail: `The daily limit must be a whole number from 0 to ${AUTO_SEND_MAX_DAILY_CAP}.` }, 400);
    patch.ai_auto_send_daily_cap = cap;
  }
  const { error } = await service.from("whatsapp_outreach_state").update(patch).eq("id", 1);
  if (error) throw error;
  const { data } = await service.from("whatsapp_outreach_state").select("ai_auto_send_intents, ai_auto_send_daily_cap").eq("id", 1).maybeSingle();
  return json({ ok: true, auto_send: autoSendSettings(data) });
}

/** "Don't send automatically": the person working the lead stops a waiting automatic reply; the draft stays for approval. */
async function handleStopAutoSend(service: Service, actor: Actor, body: Record<string, unknown>) {
  const r = await loadDraftFor(service, actor, str(body.draft_id));
  if (!r.ok) return r.res;
  if (!r.d.auto_send_id) return json({ ok: true, stopped: true });
  const stopped = await stopAutoSend(service, r.d.auto_send_id, "ai_person_stopped");
  return stopped ? json({ ok: true, stopped: true }) : json({ ok: false, error: "already_sending", detail: "The AI is sending this reply right now." });
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
    if (action === "dry_run" && internal) return await handleDryRun(service, null, body);
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    if (action === "settings") return await handleSettings(service, who.actor, body, null);
    if (action === "set_mode") return await handleSettings(service, who.actor, body, "mode");
    if (action === "set_enabled") return await handleSettings(service, who.actor, body, "enabled");
    if (action === "set_auto_send") return await handleSetAutoSend(service, who.actor, body);
    if (action === "stop_auto_send") return await handleStopAutoSend(service, who.actor, body);
    if (action === "claim") return await handleClaim(service, who.actor, body);
    if (action === "complete") return await handleComplete(service, who.actor, body);
    if (action === "discard") return await handleDiscard(service, who.actor, body);
    if (action === "regenerate") return await handleRegenerate(service, who.actor, body);
    if (action === "draft") return await handleDraft(service, who.actor, body);
    if (action === "mark_opted_out") return await handleMarkOptedOut(service, who.actor, body);
    if (action === "dry_run") return await handleDryRun(service, who.actor, body);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[ai-reply-drafts] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
