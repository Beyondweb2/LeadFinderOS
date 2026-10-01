import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, refusalBody, requireAdmin } from "../_shared/access.ts";
import { recordOptOut } from "../_shared/suppression.ts";
import { callModel } from "../_shared/site-research.ts";
import { logOpenAiUsage, openAiUsd } from "../_shared/openai-usage.ts";
import { paidMode } from "../_shared/protection.ts";
import {
  decisionFromAi, triageByRules, triagePrompt, TRIAGE_CATEGORIES, TRIAGE_MODEL, TRIAGE_PROMPT_VERSION, TRIAGE_RULES_VERSION, TRIAGE_SURFACE_DAYS,
  type TriageDecision,
} from "../../../src/lib/replyTriage.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";
import { lastLoggedByLead, salesStateOf, type LastContactView } from "../../../src/lib/leadState.ts";

// conversation-triage — files every inbound WhatsApp as urgent / admin / salesperson / nothing / review
// (Admin control centre, release 2, 2026-09-30; docs/admin-control-centre.md §Reply triage).
//
// Callers: the cron (x-cron-secret, every two minutes) with action "run"; the admin, with "run" or
// "resolve" (mark one item handled).
// ⛔ THE ONLY SIDE EFFECT IT MAY CAUSE is the one Paul approved: a deterministic opt-out phrase in any
// reply suppresses future automated outreach (the shared suppress(), the same row the first-reply
// decline writes) and records it in History. It never changes a lead's status, money or client state,
// and the model can never suppress (src/lib/replyTriage.ts decisionFromAi).
// ⛔ SPEND: the model is asked only about a recent human message no rule recognised, the newest per
// lead, at most AI_MAX_PER_RUN per run and AI_DAILY_CAP_USD per rolling day — past either, the row is
// filed as REVIEW ("AI budget reached"), never guessed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUILD_ID = "conversation-triage-2026-09-30c";
/** Longest a run may hold the lease (a crashed run frees it after this). */
const RUN_LEASE_SECONDS = 300;
/** Messages filed per run (the first runs work through the history, oldest first). */
const MAX_PER_RUN = 400;
/** Model calls per run, and the rolling-day spend cap for this function. */
const AI_MAX_PER_RUN = 40;
const AI_DAILY_CAP_USD = 0.5;
const FN = "conversation-triage";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Service = any;
interface Pending { id: string; lead_id: string | null; phone: string | null; body: string | null; message_type: string | null; created_at: string }
interface LeadRow { id: string; status: string | null; amount_paid: number | null; is_potential_work: boolean | null; call_booked_at: string | null; whatsapp_sent_at: string | null; whatsapp_ever_delivered?: boolean | null; phone: string | null }

const TRIAGE_TOOL = {
  type: "function",
  function: {
    name: "file_reply",
    description: "File the last inbound message into one category.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        category: { type: "string", enum: [...TRIAGE_CATEGORIES] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string", maxLength: 200 },
      },
      required: ["category", "confidence", "reason"],
    },
  },
};

async function spentToday(service: Service): Promise<number> {
  const { data, error } = await service.from("api_usage_log").select("estimated_cost_usd").eq("function_name", FN).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(5000);
  if (error) return Infinity; // cannot read the spend → treat the cap as reached (fail closed)
  return ((data ?? []) as { estimated_cost_usd: number | null }[]).reduce((s, r) => s + (Number(r.estimated_cost_usd) || 0), 0);
}

async function run(service: Service): Promise<Record<string, unknown>> {
  const { data: pendingData, error: pErr } = await service.rpc("conversation_triage_pending", { _limit: MAX_PER_RUN });
  if (pErr) throw new Error(`pending: ${pErr.message}`);
  const pending = (pendingData ?? []) as Pending[];
  if (!pending.length) return { filed: 0 };

  const leadIds = [...new Set(pending.map((p) => p.lead_id).filter((x): x is string => !!x))];
  const leads = new Map<string, LeadRow>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data, error } = await service.from("outreach_leads").select("id, status, amount_paid, is_potential_work, call_booked_at, whatsapp_sent_at, whatsapp_ever_delivered, phone").in("id", leadIds.slice(i, i + 150));
    if (error) throw new Error(`leads: ${error.message}`);
    for (const l of (data ?? []) as LeadRow[]) leads.set(l.id, l);
  }
  /* The leads' logged contacts (2026-10-01): the AI is told the SAME state every screen shows, so a lead reached
     by phone is never described to it as "New". Context only — the bucket rules do not read it. A failed read
     leaves the context without them (as before), never stops the sort. */
  const logged = new Map<string, LastContactView>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data, error } = await service.from("lead_activity").select("lead_id, kind, body, data, created_at, actor_user_id")
      .in("lead_id", leadIds.slice(i, i + 150)).in("kind", ["call_outcome", "contact_logged"]).limit(5000);
    if (error) { console.error("[conversation-triage] logged contacts", error.message); break; }
    for (const [k, v] of lastLoggedByLead((data ?? []) as Parameters<typeof lastLoggedByLead>[0])) logged.set(k, v);
  }
  // The newest pending message per lead is the one worth a model call; earlier ones in the same burst are superseded.
  const newestOf = new Map<string, string>();
  for (const p of pending) if (p.lead_id) newestOf.set(p.lead_id, p.id);

  let aiCalls = 0;
  let aiBudget = AI_DAILY_CAP_USD - await spentToday(service);
  /* The emergency stop (Security → all_stop) halts every paid call here too: the rules still run (free,
     and the opt-out suppression is protective), the model is not asked. */
  const paused = (await paidMode(service)) === "all_stop";
  if (paused) aiBudget = 0;
  const counts: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  const surfaceFloor = Date.now() - TRIAGE_SURFACE_DAYS * 86_400_000;

  for (const p of pending) {
    const lead = p.lead_id ? leads.get(p.lead_id) ?? null : null;
    const isClient = !!lead && isPaidLead({ amount_paid: lead.amount_paid, status: lead.status });
    const ctx = { isClient, messageType: p.message_type };
    let d: TriageDecision = triageByRules(p.body, ctx);
    let method: "rule" | "ai" | "skipped" = "rule";
    let model: string | null = null;
    let actionTaken: string | null = null;

    if (d.method === "needs_ai") {
      const recent = Date.parse(p.created_at) >= surfaceFloor;
      const newest = !p.lead_id || newestOf.get(p.lead_id) === p.id;
      if (!recent) { d = { ...d, bucket: "no_action", reason: "Older than the review window — filed, not sent to the AI" }; method = "skipped"; }
      else if (!newest) { d = { ...d, bucket: "no_action", reason: "A newer message from them was sorted instead" }; method = "skipped"; }
      else if (aiCalls >= AI_MAX_PER_RUN || aiBudget <= 0) { d = { ...d, bucket: "review", reason: paused ? "Paid calls are paused (emergency stop) — needs a human look" : "AI budget reached for now — needs a human look" }; method = "skipped"; }
      else {
        const { data: thread } = await service.from("whatsapp_messages").select("direction, body, created_at").eq("lead_id", p.lead_id ?? "00000000-0000-0000-0000-000000000000").lte("created_at", p.created_at).order("created_at", { ascending: false }).limit(8);
        const t = ((thread ?? []) as { direction: string; body: string | null }[]).reverse().map((m) => ({ direction: m.direction, text: String(m.body ?? "").slice(0, 600) }));
        if (!t.length) t.push({ direction: "inbound", text: String(p.body ?? "").slice(0, 600) });
        const lc = lead ? logged.get(lead.id) : undefined;
        const state = lead ? salesStateOf({ status: lead.status, is_potential_work: lead.is_potential_work, amount_paid: lead.amount_paid, call_booked_at: lead.call_booked_at, whatsapp_sent_at: lead.whatsapp_sent_at, whatsapp_ever_delivered: lead.whatsapp_ever_delivered, lastLogged: lc ? { outcome: lc.outcomeValue ?? "", at: lc.at, reached: lc.everReached } : null }).label : "Unknown number";
        const prompt = triagePrompt({ thread: t, isClient, state });
        const res = await callModel(TRIAGE_MODEL, prompt.system, prompt.user, TRIAGE_TOOL, 0);
        aiCalls += 1;
        if (res.ok) {
          const usd = openAiUsd(TRIAGE_MODEL, res.promptTokens, res.completionTokens);
          aiBudget -= usd;
          await logOpenAiUsage(service, { functionName: FN, apiType: "openai_reply_triage", model: TRIAGE_MODEL, promptTokens: res.promptTokens, completionTokens: res.completionTokens, triggerSource: "internal" });
          d = decisionFromAi(res.args as never, ctx);
        } else {
          d = { ...d, bucket: "review", reason: `The AI could not answer (${res.error}) — needs a human look` };
        }
        method = res.ok ? "ai" : "skipped";
        model = TRIAGE_MODEL;
      }
    }

    // ⛔ The one approved side effect: a deterministic opt-out suppresses future automated outreach.
    if (d.suppress) {
      const phone = p.phone ?? lead?.phone ?? null;
      /* recordOptOut, not "already suppressed → skip": a number suppressed for a weaker reason
         (archived, a decline) is upgraded to opted_out, so the Inbox's template guard sees the stop. */
      const outcome = await recordOptOut(service, { phone, leadId: p.lead_id }, "whatsapp_optout_inbound");
      if (outcome === "already") actionTaken = "already_suppressed";
      else if (outcome === "recorded") {
        actionTaken = "suppressed";
        if (p.lead_id) {
          const { error: hErr } = await service.from("lead_activity").insert({
            lead_id: p.lead_id, actor_user_id: null, kind: "opted_out",
            body: isClient
              ? "Asked to stop on WhatsApp (a paying client) — marketing messages are suppressed; service messages still go"
              : "Asked to stop on WhatsApp — future automated outreach is suppressed",
            data: { message_id: p.id, source: "whatsapp_optout_inbound", rule: d.ruleId, paying_client: isClient },
          });
          if (hErr) console.error("[conversation-triage] history write failed", hErr.message);
        }
      } else {
        actionTaken = "suppression_failed";
        d = { ...d, bucket: "urgent_admin", reason: "Asked to stop, but the suppression could not be saved — suppress this number by hand" };
      }
    }

    counts[`${d.category}/${d.bucket}`] = (counts[`${d.category}/${d.bucket}`] ?? 0) + 1;
    rows.push({
      message_id: p.id, lead_id: p.lead_id, phone: p.phone, message_at: p.created_at,
      category: d.category, bucket: d.bucket, reason: d.reason, confidence: d.confidence,
      method, rule_id: d.ruleId, rules_version: TRIAGE_RULES_VERSION,
      model, prompt_version: method === "ai" ? TRIAGE_PROMPT_VERSION : null, action_taken: actionTaken,
    });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await service.from("conversation_triage").upsert(rows.slice(i, i + 200), { onConflict: "message_id", ignoreDuplicates: true });
    if (error) throw new Error(`write: ${error.message}`);
  }
  return { filed: rows.length, aiCalls, counts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const internal = isInternalCall(req);
    let actorId: string | null = null;
    if (!internal) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
      actorId = who.actor.id;
    }
    const action = String(body.action ?? "run");
    if (action === "run") {
      /* ONE run at a time (admin_job_runs lease): two overlapping runs once asked the model about the same
         messages twice. A run that finds the lease taken does nothing and says so. */
      const { data: claimed, error: cErr } = await service.rpc("admin_job_claim", { _job: FN, _lease_seconds: RUN_LEASE_SECONDS });
      if (cErr) throw new Error(`lease: ${cErr.message}`);
      if (claimed !== true) return json({ ok: true, build: BUILD_ID, skipped: "another run is in progress" });
      try {
        const result = await run(service);
        await service.rpc("admin_job_finish", { _job: FN, _status: "ok", _result: result, _error: null });
        return json({ ok: true, build: BUILD_ID, ...result });
      } catch (e) {
        await service.rpc("admin_job_finish", { _job: FN, _status: "error", _result: null, _error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
        throw e;
      }
    }
    if (action === "resolve") {
      if (!actorId) return json({ ok: false, error: "admin_only" }, 403);
      const id = String(body.id ?? "");
      if (!UUID_RE.test(id)) return json({ ok: false, error: "bad_id" }, 400);
      const { error } = await service.from("conversation_triage").update({ resolved_at: new Date().toISOString(), resolved_by: actorId }).eq("id", id).is("resolved_at", null);
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 500);
      return json({ ok: true });
    }
    /* The admin confirms an opt-out the rules could not be sure of (an AI "they asked to stop" in
       REVIEW): the same shared suppress(), a History row saying Paul confirmed it, and the item closes.
       A person's decision — never the model's. */
    if (action === "suppress") {
      if (!actorId) return json({ ok: false, error: "admin_only" }, 403);
      const id = String(body.id ?? "");
      if (!UUID_RE.test(id)) return json({ ok: false, error: "bad_id" }, 400);
      const { data: row, error: rErr } = await service.from("conversation_triage").select("id, lead_id, phone, message_id").eq("id", id).maybeSingle();
      if (rErr || !row) return json({ ok: false, error: "not_found" }, 404);
      const r = row as { id: string; lead_id: string | null; phone: string | null; message_id: string };
      const outcome = await recordOptOut(service, { phone: r.phone, leadId: r.lead_id }, "admin_confirmed_optout");
      if (outcome === "failed") return json({ ok: false, error: "suppression_failed", detail: "The suppression could not be saved — try again." }, 500);
      if (r.lead_id && outcome === "recorded") {
        await service.from("lead_activity").insert({
          lead_id: r.lead_id, actor_user_id: actorId, kind: "opted_out",
          body: "Asked to stop on WhatsApp — confirmed by the admin; future automated outreach is suppressed",
          data: { message_id: r.message_id, source: "admin_confirmed_optout" },
        });
      }
      await service.from("conversation_triage").update({ resolved_at: new Date().toISOString(), resolved_by: actorId, action_taken: "suppressed_by_admin" }).eq("id", r.id);
      return json({ ok: true });
    }
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[conversation-triage]", msg);
    try {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
      await service.from("client_error_reports").insert({ error_id: "conversation_triage_failed", context: { message: msg.slice(0, 500) } });
    } catch { /* best effort */ }
    return json({ ok: false, error: "server_error" }, 500);
  }
});
