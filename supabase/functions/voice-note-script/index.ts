// voice-note-script — a personalised WhatsApp voice-note script for Paul to read to a cold lead
// (Paul, 2026-09-26). The judgement lives in src/lib/voiceNoteScript.ts; this file reads, calls the
// model once (twice at most), and saves the result.
//
// ⛔ IT NEVER SENDS ANYTHING. It returns text. There is no Graph call, no import of the sender and no
//    write to whatsapp_messages / whatsapp_sends — Paul reads the script and records the note himself.
//    scripts/voice-note-script.test.ts pins this.
//
// TWO ACTIONS:
//   · latest   — the newest saved script for the lead. DB read only. No fetch, no model.
//   · generate — the hook evidence (DB only) → REFUSE here, before any fetch or spend, if there is no
//                honest missed search with competitor names → the site research (the shared warm path:
//                saved research → full crawl → crawl check → a targeted fetch; never a crawl job) → the
//                model → the checks → one rewrite if a fact is wrong → saved to voice_note_scripts.
//                `regenerate_of` names the script being replaced, so it is shown the old wording.
//
// Auth: the operator's own JWT (resolveOperator) and the lead must be theirs — the warm drafter's rule.
// voice_note_scripts has RLS on and NO policies: service role only; the Inbox reads it through here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";

/* The usage guard's estimate for one script (2026-09-29). Its OpenAI rows are logged under the BOOK
   owner, so a salesperson's own spend is this estimate. Rounded UP from the billed rows: 6
   openai_voice_note_script rows = $0.043 (api_usage_log, 30 days to 2026-09-29). */
const VOICE_SCRIPT_EST_USD = 0.01;
import { logOpenAiUsage, openAiUsd } from "../_shared/openai-usage.ts";
import { runSiteResearch, callModel, leadTrade, leadTown, RESEARCH_LEAD_COLUMNS, type ResearchLead } from "../_shared/site-research.ts";
import { hookEngineLabel, scoreHookRun, type HookScoreRow } from "../../../src/lib/hookScore.ts";
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells, isProvableJunkName } from "../../../src/lib/competitorCleaning.ts";
import {
  selectVoiceNoteEvidence, selectVoiceNoteFindings, buildVoiceNotePrompt, parseVoiceNoteScript, checkVoiceNoteScript,
  betterAttempt, findingRecord, classifyLeadWebsite, voiceNoteBasisIsCurrent, shortVoiceNote, VOICE_NOTE_SYSTEM_PROMPT, VOICE_NOTE_TOOL, VOICE_NOTE_MODEL, VOICE_NOTE_GENERATOR_VERSION,
  type VoiceNoteCheck, type VoiceNoteEvidence,
} from "../../../src/lib/voiceNoteScript.ts";

/* The 20-second version beside a saved script (2026-09-30): derived from THAT row's engine, competitors
   and website kind, never stored, so it cannot disagree with the script it sits under. */
// deno-lint-ignore no-explicit-any
function withShort(row: any, trade: string | null, area: string | null) {
  if (!row) return row;
  const short = shortVoiceNote({
    engineLabel: hookEngineLabel(String(row.hook_engine ?? "")),
    competitors: Array.isArray(row.competitors) ? row.competitors : [],
    trade, area,
    site: { mode: row.site_mode, source: row.site_source ?? "own_site", sourceLabel: row.site_source_label ?? null },
  });
  return { ...row, short_script: short };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TABLE = "voice_note_scripts";
const ROW_COLUMNS = "id, lead_id, audit_id, run_id, hook_question, hook_engine, hook_question_index, competitors, findings, site_mode, site_source, site_source_label, research_basis, script, word_count, problems, warnings, operator_note, model, generator_version, regenerated_from, generated_at";

// deno-lint-ignore no-explicit-any
type Service = any;

async function loadLead(service: Service, leadId: string, operatorId: string): Promise<ResearchLead | null> {
  const { data, error } = await service.from("outreach_leads").select(RESEARCH_LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw error;
  const l = data as ResearchLead | null;
  return l && l.user_id === operatorId ? l : null;
}

/* ───────────────────────── the hook evidence (DB only, no spend) ───────────────────────── */

type HookEvidence =
  | { ok: true; auditId: string; runId: string; business: string; trade: string; area: string; evidence: VoiceNoteEvidence; note: string | null }
  | { ok: false; error: string; detail: string };

/**
 * The lead's newest ordinary audit (hook / free check — never a baseline or measurement) with a
 * finished run, scored with the report's ruler, and ONE missed result picked from it. The names are
 * that cell's own list through the report's gates: run-level suppression, then the junk filter.
 */
async function loadHookEvidence(service: Service, lead: ResearchLead): Promise<HookEvidence> {
  const { data: audits, error } = await service.from("ai_audits")
    .select("id, business_name, business_type, location_text, audit_purpose, is_measurement, created_at, ai_audit_runs(id, run_number, status, results)")
    .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  let audit: any = null; let run: any = null;
  // deno-lint-ignore no-explicit-any
  for (const a of (Array.isArray(audits) ? audits : []) as any[]) {
    const purpose = a.audit_purpose ?? null;
    if (a.is_measurement === true || !(purpose === null || purpose === "audit" || purpose === "free_check")) continue;
    // deno-lint-ignore no-explicit-any
    const runs = (Array.isArray(a.ai_audit_runs) ? [...a.ai_audit_runs] : []).sort((x: any, y: any) => (y.run_number ?? 0) - (x.run_number ?? 0));
    // deno-lint-ignore no-explicit-any
    const done = runs.find((r: any) => r.status === "complete" || r.status === "capped");
    if (done) { audit = a; run = done; break; }
  }
  if (!audit || !run) return { ok: false, error: "no_audit", detail: "This lead has no finished AI audit yet. Run the audit first." };

  const { data: rows, error: qErr } = await service.from("ai_audit_queue")
    .select("id, question, status, result").eq("run_id", run.id).order("created_at", { ascending: true });
  if (qErr) throw qErr;
  const queue = (rows ?? []) as HookScoreRow[];
  const business = String(audit.business_name ?? "").trim() || String(lead.business_name ?? "").trim();
  const trade = String(audit.business_type ?? "").trim() || leadTrade(lead) || "";
  const area = String(audit.location_text ?? "").trim() || leadTown(lead) || "";
  if (!business || !trade || !area) return { ok: false, error: "missing_details", detail: "The audit is missing the business name, trade or town." };

  const cleanliness = assessCompetitorCleanliness(collectCompetitorNames(queue as never), run.results, { answeredCells: countAnsweredCells(queue as never) });
  const score = scoreHookRun(run.results?.hook, queue, {
    named: { businessName: business, trade, town: area },
    town: area, trade,
    cleanCompetitors: (names) => cleanliness.suppressNames ? [] : names.filter((n) => !isProvableJunkName(n)),
  });
  if (score.pending > 0) return { ok: false, error: "audit_running", detail: "The audit is still running. Try again when it has finished." };
  /* ⛔ A six-result hook with no final score is refused, never quoted in part — the WhatsApp resolver's
     rule (hook_incomplete). Older audits keep their own denominators and are read as they are. */
  if (score.shape === "six" && !score.complete) {
    return { ok: false, error: "hook_incomplete", detail: "The quick check has no final score (a result failed, or it could not be given three questions). Re-run the audit." };
  }
  // The card's own pick first (score.hook), so the Inbox card, the Call Script and this script quote one result.
  const pick = selectVoiceNoteEvidence(score.results, { business, town: area, trade }, score.hook);
  if (!pick.ok) {
    const withheld = pick.code === "no_competitors" && cleanliness.suppressNames ? " The competitor names on this audit are withheld as unreliable." : "";
    return { ok: false, error: pick.code, detail: pick.reason + withheld };
  }
  return { ok: true, auditId: audit.id, runId: run.id, business, trade, area, evidence: pick.evidence, note: pick.note };
}

/* ───────────────────────── actions ───────────────────────── */

/**
 * The newest saved script, and whether it is still CURRENT: the result it quotes (audit + question +
 * engine) against the one a Regenerate would pick now (loadHookEvidence — DB reads only, no fetch, no
 * model). A mismatch is shown as OUT OF DATE; nothing regenerates here.
 */
async function handleLatest(service: Service, lead: ResearchLead) {
  const { data, error } = await service.from(TABLE).select(ROW_COLUMNS).eq("lead_id", lead.id).order("generated_at", { ascending: false }).limit(1);
  if (error) throw error;
  const { count } = await service.from(TABLE).select("id", { count: "exact", head: true }).eq("lead_id", lead.id);
  const script = (data ?? [])[0] ?? null;
  /* A failed check is never read as "current": the panel says it could not tell. */
  const hook: HookEvidence = await loadHookEvidence(service, lead)
    .catch((e: unknown) => ({ ok: false as const, error: "current_unknown", detail: "Could not check the latest audit: " + String((e as { message?: unknown })?.message ?? e).slice(0, 120) }));
  const current = hook.ok
    ? { ok: true as const, auditId: hook.auditId, questionIndex: hook.evidence.questionIndex, engine: hook.evidence.engine, engineLabel: hook.evidence.engineLabel, question: hook.evidence.question, competitors: hook.evidence.competitors }
    : { ok: false as const, error: hook.error, detail: hook.detail };
  const stale = !!script && (!current.ok || !voiceNoteBasisIsCurrent(
    { auditId: script.audit_id ?? null, questionIndex: script.hook_question_index ?? null, engine: script.hook_engine ?? null },
    current.ok ? { auditId: current.auditId, questionIndex: current.questionIndex, engine: current.engine } : null,
  ));
  const trade = hook.ok ? hook.trade : (leadTrade(lead) || null);
  const area = hook.ok ? hook.area : (leadTown(lead) || null);
  return json({ ok: true, script: withShort(script, trade, area), versions: count ?? 0, current, stale, generatorVersion: VOICE_NOTE_GENERATOR_VERSION });
}

async function handleGenerate(service: Service, lead: ResearchLead, operatorId: string, body: Record<string, unknown>) {
  const started = Date.now();
  // 1) The evidence — and the refusal — before anything is fetched or spent.
  const hook = await loadHookEvidence(service, lead);
  if (!hook.ok) return json({ ok: false, error: hook.error, detail: hook.detail });

  // 2) The script being replaced, if any (same lead only).
  let previous: { id: string; script: string } | null = null;
  const regenOf = text(body.regenerate_of);
  if (regenOf) {
    const { data } = await service.from(TABLE).select("id, lead_id, script").eq("id", regenOf).maybeSingle();
    if (data && data.lead_id === lead.id) previous = { id: data.id, script: data.script };
  }

  // 3) The website: classified first — a directory / social profile is not their site and is never
  //    researched. Their own site goes through the shared research path (reuses what is saved; never a
  //    crawl job).
  const websiteKind = classifyLeadWebsite(lead.website);
  const research = websiteKind.source === "own_site"
    ? await runSiteResearch(service, lead, operatorId, false, { functionName: "voice-note-script" })
    : null;
  const site = selectVoiceNoteFindings(research?.research ?? null, lead.website, hook.area);

  // 4) The model, then the checks; one rewrite if a fact is wrong.
  const promptBase = {
    business: hook.business, trade: hook.trade, area: hook.area, website: lead.website,
    evidence: hook.evidence, site, avoid: previous?.script ?? null,
  };
  let best: VoiceNoteCheck | null = null;
  let promptTokens = 0; let completionTokens = 0; let calls = 0; let modelError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildVoiceNotePrompt({ ...promptBase, rewriteProblems: attempt > 0 && best ? best.problems : null });
    const call = await callModel(VOICE_NOTE_MODEL, VOICE_NOTE_SYSTEM_PROMPT, prompt, VOICE_NOTE_TOOL, previous ? 0.8 : 0.6);
    if (!call.ok) { modelError = call.error; break; }
    calls++; promptTokens += call.promptTokens; completionTokens += call.completionTokens;
    const raw = parseVoiceNoteScript(call.args);
    if (!raw) { modelError = "model_empty_script"; continue; }
    const checked = checkVoiceNoteScript(raw, { evidence: hook.evidence, site, town: hook.area, trade: hook.trade, business: hook.business });
    best = best ? betterAttempt(best, checked) : checked;
    if (!best.problems.length) break;
  }
  if (calls > 0) {
    await logOpenAiUsage(service, { functionName: "voice-note-script", apiType: "openai_voice_note_script", model: VOICE_NOTE_MODEL, promptTokens, completionTokens, calls, userId: operatorId, triggerSource: "user" });
  }
  if (!best) {
    const detail = modelError === "no_credits" ? "OpenAI is out of credit." : `The writing model did not return a script (${modelError ?? "unknown"}). Try again.`;
    return json({ ok: false, error: "model_failed", detail });
  }

  // 5) Saved, so it can be reopened and later compared against replies.
  const r = research?.research ?? null;
  const row = {
    lead_id: lead.id, user_id: lead.user_id, audit_id: hook.auditId, run_id: hook.runId,
    hook_question: hook.evidence.question, hook_engine: hook.evidence.engine, hook_question_index: hook.evidence.questionIndex,
    competitors: hook.evidence.competitors,
    findings: site.findings.map(findingRecord),
    site_mode: site.mode,
    site_source: site.source,
    site_source_label: site.sourceLabel,
    research_basis: {
      plan: research?.plan ?? `not_researched_${site.source}`, usedFullCrawl: research?.usedFullCrawl ?? null, status: r?.status ?? null,
      services: site.services,
      generatedAt: r?.generatedAt ?? null, sourceCrawlAt: r?.sourceCrawlAt ?? null, technicallyClean: r?.technicallyClean ?? null,
      sources: r ? [...new Set(r.sources.map((s) => s.kind))] : [],
    },
    script: best.script, word_count: best.wordCount, problems: best.problems, warnings: best.warnings,
    operator_note: hook.note,
    model: VOICE_NOTE_MODEL, generator_version: VOICE_NOTE_GENERATOR_VERSION,
    prompt_tokens: promptTokens, completion_tokens: completionTokens, model_calls: calls,
    cost_usd: openAiUsd(VOICE_NOTE_MODEL, promptTokens, completionTokens),
    regenerated_from: previous?.id ?? null,
  };
  const { data: saved, error: saveErr } = await service.from(TABLE).insert(row).select(ROW_COLUMNS).single();
  if (saveErr) throw saveErr;
  return json({ ok: true, script: withShort(saved, hook.trade, hook.area), ms: Date.now() - started });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const gateService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const whoActor = await resolveActor(req, gateService);
    if (!whoActor.ok) return json(refusalBody(whoActor), whoActor.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "latest";
    const leadId = text(body.lead_id);
    if (!leadId) return json({ ok: false, error: "lead_id_required", detail: "This conversation has no linked lead." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    /* ⛔ ROLE + LEAD ACCESS (2026-09-27, multi-user): admin exactly as before; sales only on a lead
       assigned to them and not a client. `book` is whose conversation rows these are. */
    const access = await leadAccess(service, whoActor.actor, leadId);
    if (!access.ok && access.error === "lookup_failed") return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    const book = access.ok ? access.bookUserId : "";
    const who = { user: { id: book } };
    const lead = access.ok ? await loadLead(service, leadId, book) : null;
    if (!lead) return json({ ok: false, error: "lead_not_found", detail: "That lead is not in your account." }, 404);
    if (action === "latest") return await handleLatest(service, lead);
    if (lead.is_archived === true) return json({ ok: false, error: "lead_archived", detail: "This lead is archived." }, 409);
    if (action === "generate") {
      /* ⛔ USAGE GUARD (2026-09-29): suspension, the pause modes, drafts per hour, spend. */
      const guard = await guardAction(service, whoActor.actor.id, "ai_draft", { fn: "voice-note-script", leadId, role: whoActor.actor.role, estCostUsd: whoActor.actor.role === "admin" ? 0 : VOICE_SCRIPT_EST_USD });
      if (!guard.ok) return json(guard.body, guard.status);
      return await handleGenerate(service, lead, who.user.id, body);
    }
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[voice-note-script] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
