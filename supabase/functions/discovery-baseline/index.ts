/* ════════════════════════════════════════════════════════════════════════════════════════════════
   discovery-baseline — "Create baseline" from a Discovery, with NO new searches (Paul, 2026-11-14;
   V2's "Create baseline from this Discovery": it reuses the discovery's answers, nothing asked again).

   Admin only (requireAdmin). Body: { discovery_audit_id, questions: string[20] }.
   Makes ONE new ai_audits row with audit_purpose 'targeted' (TARGETED_AUDIT_PURPOSE) and copies, for each of
   the Discovery's runs, the stored answers of exactly those 20 questions — status 'done', results as stored.
   No provider is called and nothing is spent here. The report link (short code) comes from the insert trigger.

   ⛔ NOT THE GUARANTEE BASELINE. The purpose is NOT 'baseline', so claim_baseline_pointer never fires: the lead's
      baseline_audit_id, the v7 payment clock and the frozen-question guarantee are untouched. A paying client's
      guarantee baseline still comes only from the paid baseline flow (paid-baseline).
   ⛔ Every question must be one the Discovery asked (the server re-checks; exactly 20, no repeats).
   ⛔ Only the Discovery's own owner's audit, and only a finished Discovery (every run complete).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { DISCOVERY_AUDIT_PURPOSE, TARGETED_AUDIT_PURPOSE } from "../../../src/lib/auditKind.ts";
import { TARGETED_SEARCH_COUNT } from "../../../src/lib/targetedPick.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUILD_ID = "discovery-baseline-2026-11-14a";
const norm = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

const AUDIT_COPY = "user_id, lead_id, business_name, business_type, location_text, country, has_website, website, business_phone, business_address, business_email, specialism, client_links, business_scope, credentials, location_source, location_note, baseline_target_runs, audit_purpose, archived_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await requireAdmin(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);

    const body = await req.json().catch(() => ({}));
    const discoveryId = typeof body.discovery_audit_id === "string" ? body.discovery_audit_id.trim() : "";
    const asked: string[] = Array.isArray(body.questions) ? body.questions.map((q: unknown) => String(q ?? "").trim()).filter(Boolean) : [];
    if (!discoveryId) return json({ ok: false, error: "discovery_audit_id_required" }, 400);
    if (asked.length !== TARGETED_SEARCH_COUNT || new Set(asked.map(norm)).size !== TARGETED_SEARCH_COUNT) {
      return json({ ok: false, error: "exactly_20", detail: `Choose exactly ${TARGETED_SEARCH_COUNT} different searches.` }, 422);
    }

    /* The Discovery: the caller's own, a discovery, finished. */
    const { data: disc, error: dErr } = await service.from("ai_audits").select(`id, ${AUDIT_COPY}`).eq("id", discoveryId).maybeSingle();
    if (dErr) throw dErr;
    if (!disc || disc.user_id !== who.actor.id) return json({ ok: false, error: "not_found", detail: "Discovery not found." }, 404);
    if (String(disc.audit_purpose ?? "") !== DISCOVERY_AUDIT_PURPOSE) return json({ ok: false, error: "not_a_discovery", detail: "Only a Discovery can make a baseline this way." }, 422);
    const { data: runs, error: rErr } = await service.from("ai_audit_runs").select("id, run_number, status, results").eq("audit_id", discoveryId).order("run_number", { ascending: true });
    if (rErr) throw rErr;
    const runRows = (runs ?? []) as Array<{ id: string; run_number: number; status: string; results: Record<string, unknown> | null }>;
    if (!runRows.length || runRows.some((r) => r.status !== "complete")) return json({ ok: false, error: "discovery_not_finished", detail: "Wait for the Discovery to finish." }, 409);

    /* The stored answers of the chosen questions, every run. Paged (PostgREST stops at 1,000 rows). */
    const rows: Array<{ run_id: string; question: string; engines: string[]; status: string; attempts: number; result: unknown }> = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await service.from("ai_audit_queue").select("id, run_id, question, engines, status, attempts, result")
        .in("run_id", runRows.map((r) => r.id)).order("id").range(from, from + 499);
      if (error) throw error;
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < 500) break;
    }
    const want = new Map(asked.map((q) => [norm(q), q] as const));
    const askedInDiscovery = new Set(rows.map((r) => norm(r.question)));
    const missing = asked.filter((q) => !askedInDiscovery.has(norm(q)));
    if (missing.length) return json({ ok: false, error: "not_in_discovery", detail: `Not asked in this Discovery: ${missing.slice(0, 3).join("; ")}` }, 422);
    const keep = rows.filter((r) => want.has(norm(r.question)) && (r.status === "done" || r.result));

    /* The new audit: same business, purpose 'targeted'. */
    const { id: _id, audit_purpose: _p, archived_at: _a, ...base } = disc as Record<string, unknown>;
    const { data: created, error: cErr } = await service.from("ai_audits").insert({
      ...base, audit_purpose: TARGETED_AUDIT_PURPOSE, is_market: false, is_measurement: false, baseline_target_runs: runRows.length,
    }).select("id, short_code").single();
    if (cErr) throw cErr;
    const newId = (created as { id: string }).id;

    try {
      for (const r of runRows) {
        /* The run's stored results as they are (the website check, and an SEO grade if the Discovery had one — then the
           app's "run the website scan if there's no grade yet" reuses it for free). */
        const res = { ...(r.results ?? {}) } as Record<string, unknown>;
        const { data: nr, error: nrErr } = await service.from("ai_audit_runs").insert({
          audit_id: newId, user_id: who.actor.id, run_number: r.run_number, status: "complete", results: { ...res, from_discovery: { audit_id: discoveryId, run_id: r.id } },
        }).select("id").single();
        if (nrErr) throw nrErr;
        const copy = keep.filter((q) => q.run_id === r.id).map((q) => ({
          audit_id: newId, run_id: (nr as { id: string }).id, user_id: who.actor.id, question: want.get(norm(q.question)) ?? q.question,
          engines: q.engines ?? [], status: "done", attempts: q.attempts ?? 0, result: q.result,
        }));
        for (let i = 0; i < copy.length; i += 200) {
          const { error: qErr } = await service.from("ai_audit_queue").insert(copy.slice(i, i + 200));
          if (qErr) throw qErr;
        }
      }
    } catch (e) {
      /* Half a copy is worse than none: archive the new audit so it never shows as a finished report. */
      await service.from("ai_audits").update({ archived_at: new Date().toISOString() }).eq("id", newId);
      throw e;
    }
    return json({ ok: true, audit_id: newId, short_code: (created as { short_code?: string | null }).short_code ?? null, runs: runRows.length, answers: keep.length });
  } catch (e) {
    console.error("[discovery-baseline]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "The baseline could not be created." }, 500);
  }
});
