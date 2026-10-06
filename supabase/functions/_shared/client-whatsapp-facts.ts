// client-whatsapp-facts — READ ONE PAID CLIENT'S WHATSAPP REPLY FOR ONBOARDING FACTS (2026-10-07,
// docs/pre-sales-certification/sales-close-handoff-australia.md). The rules are src/lib/whatsappClientFacts.ts.
//
// Callers: fn conversation-triage (the existing AI reader of every inbound WhatsApp — for a PAID CLIENT's message
// only, inside its own per-run / per-day caps and the all-stop) and fn paid-client-hub (Paul's "Read WhatsApp
// replies" button). ⛔ Not whatsapp-status: inbound storage is untouched; this reads rows already stored.
//
// ⛔ It writes ONE row per message (client_whatsapp_reads, message_id primary key — a message is read once) and,
//    when it found something, one History line. It never writes a client field: the intake merge decides what
//    a fact does (fill an empty field / flag a conflict / never beat Paul's confirmed value).
import { callModel } from "./site-research.ts";
import { logOpenAiUsage, openAiUsd } from "./openai-usage.ts";
import { recordLeadEvent } from "./client-setup.ts";
import { FACT_MODEL, FACT_PROMPT_VERSION, FACT_TOOL, cleanFacts, factPrompt, worthReading, type ClientFact } from "../../../src/lib/whatsappClientFacts.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface InboundMessage { id: string; lead_id: string | null; body: string | null; created_at: string }
export interface ReadOutcome { outcome: "facts" | "none" | "skipped" | "error"; facts: ClientFact[]; usd: number }

/** Read one inbound message (with the conversation before it). Stores the result; never throws for a model error. */
export async function readClientFacts(service: Service, m: InboundMessage, o: { business: string | null; functionName: string; trigger: "internal" | "admin" }): Promise<ReadOutcome> {
  if (!m.lead_id) return { outcome: "skipped", facts: [], usd: 0 };
  const store = async (outcome: ReadOutcome["outcome"], facts: ClientFact[], error: string | null = null) => {
    const { error: wErr } = await service.from("client_whatsapp_reads").upsert({
      message_id: m.id, lead_id: m.lead_id, read_at: new Date().toISOString(), outcome, facts, model: outcome === "skipped" ? null : FACT_MODEL,
      prompt_version: FACT_PROMPT_VERSION, error,
    }, { onConflict: "message_id", ignoreDuplicates: true });
    if (wErr) console.error("[client-whatsapp-facts] read not stored:", wErr.message);
  };
  if (!worthReading(m.body)) { await store("skipped", []); return { outcome: "skipped", facts: [], usd: 0 }; }
  const { data: thread, error: tErr } = await service.from("whatsapp_messages").select("direction, body, created_at")
    .eq("lead_id", m.lead_id).lte("created_at", m.created_at).order("created_at", { ascending: false }).limit(8);
  if (tErr) { await store("error", [], tErr.message); return { outcome: "error", facts: [], usd: 0 }; }
  const t = ((thread ?? []) as { direction: string; body: string | null }[]).reverse().map((x) => ({ direction: x.direction, text: String(x.body ?? "").slice(0, 600) }));
  if (!t.length) t.push({ direction: "inbound", text: String(m.body ?? "").slice(0, 600) });
  const prompt = factPrompt({ business: o.business, thread: t });
  const res = await callModel(FACT_MODEL, prompt.system, prompt.user, FACT_TOOL, 0);
  if (!res.ok) { await store("error", [], res.error); return { outcome: "error", facts: [], usd: 0 }; }
  const usd = openAiUsd(FACT_MODEL, res.promptTokens, res.completionTokens);
  await logOpenAiUsage(service, { functionName: o.functionName, apiType: "openai_client_facts", model: FACT_MODEL, promptTokens: res.promptTokens, completionTokens: res.completionTokens, triggerSource: o.trigger });
  /* ⛔ Only the CLIENT's own words can carry a fact (the quote is checked against their inbound messages). */
  const facts = cleanFacts(res.args, t.filter((x) => x.direction === "inbound").map((x) => x.text));
  await store(facts.length ? "facts" : "none", facts);
  if (facts.length) {
    await recordLeadEvent(service, m.lead_id, "whatsapp_facts_found", {
      source: "client", body: `Read from their WhatsApp: ${facts.map((f) => f.field.replace(/_/g, " ")).join(", ")}`,
      data: { message_id: m.id, fields: facts.map((f) => f.field) },
    });
  }
  return { outcome: facts.length ? "facts" : "none", facts, usd };
}

/** Paul's button: the client's newest unread inbound messages (at most `limit`), oldest first. */
export async function readRecentClientReplies(service: Service, leadId: string, business: string | null, limit = 10): Promise<{ read: number; withFacts: number; usd: number }> {
  const { data, error } = await service.from("whatsapp_messages").select("id, lead_id, body, created_at").eq("lead_id", leadId).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(40);
  if (error) throw error;
  const ids = ((data ?? []) as InboundMessage[]).map((x) => x.id);
  const done = new Set<string>();
  if (ids.length) {
    const { data: r, error: rErr } = await service.from("client_whatsapp_reads").select("message_id").in("message_id", ids);
    if (rErr) throw rErr;
    for (const x of (r ?? []) as { message_id: string }[]) done.add(x.message_id);
  }
  const todo = ((data ?? []) as InboundMessage[]).filter((x) => !done.has(x.id) && worthReading(x.body)).slice(0, limit).reverse();
  let withFacts = 0; let usd = 0;
  for (const m of todo) {
    const r = await readClientFacts(service, m, { business, functionName: "paid-client-hub", trigger: "admin" });
    usd += r.usd; if (r.outcome === "facts") withFacts += 1;
  }
  return { read: todo.length, withFacts, usd };
}
