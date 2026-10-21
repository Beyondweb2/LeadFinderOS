// whatsapp-number-health — THE WHATSAPP NUMBER'S QUALITY RATING AND MESSAGING TIER (2026-10-21,
// docs/whatsapp-number-health.md). The rules are src/lib/whatsappNumberHealth.ts.
//
// Callers: pg_cron every 15 minutes (public.invoke_whatsapp_number_health, CRON_SECRET), or an admin.
// Modes:
//   probe — ask Meta and answer; WRITES NOTHING. (Used to prove the token can read the rating.)
//   check — ask Meta, store the reading on whatsapp_outreach_state (id 1), log every change, and pause the queue ONCE
//           when the rating turns RED. A failed read stores only the failure: it never pauses, never touches the
//           last good reading (the queue then only blocks cap rises, by the stale rule).
// ⛔ Reads only. Sends nothing. Never returns or logs the token (errors keep Meta's code and message only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, refusalBody } from "../_shared/access.ts";
import { GRAPH_VERSION } from "../_shared/whatsapp-send.ts";
import { RED_PAUSE_REASON, normaliseRating, shouldPauseForRating, type QualityRating } from "../../../src/lib/whatsappNumberHealth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Reading { ok: true; rating: QualityRating; rawRating: string | null; tier: string | null; tierField: boolean }
interface ReadFailure { ok: false; error: string }

/** Meta's error → a short safe line (code + message, never the request). */
const metaError = (status: number, data: Record<string, unknown>): string => {
  const e = (data?.error ?? {}) as { code?: unknown; message?: unknown };
  return `http_${status}${e.code != null ? `:code_${e.code}` : ""}${typeof e.message === "string" ? `:${e.message}` : ""}`.slice(0, 300);
};

async function readMeta(): Promise<Reading | ReadFailure> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token) return { ok: false, error: "no_token" };
  if (!phoneId) return { ok: false, error: "no_phone_number_id" };
  const ask = async (fields: string) => {
    try {
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      return { status: r.status, ok: r.ok, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    } catch (e) {
      return { status: 0, ok: false, data: { error: { message: (e as Error)?.name ?? "fetch_failed" } } as Record<string, unknown> };
    }
  };
  let res = await ask("quality_rating,messaging_limit_tier");
  let tierField = true;
  /* A field this API version no longer knows (#100) fails the WHOLE request — ask for the rating alone then. */
  if (!res.ok && (res.data?.error as { code?: number } | undefined)?.code === 100) {
    res = await ask("quality_rating");
    tierField = false;
  }
  if (!res.ok) return { ok: false, error: metaError(res.status, res.data) };
  const rawRating = typeof res.data.quality_rating === "string" ? res.data.quality_rating : null;
  if (rawRating == null) return { ok: false, error: "no_quality_rating_in_answer" };
  let tier = typeof res.data.messaging_limit_tier === "string" ? res.data.messaging_limit_tier : null;
  /* Meta moved messaging limits to the business portfolio (2025): the old field can come back empty. Ask the newer
     field once; an unknown field (#100) or no value just leaves the tier unread. */
  if (!tier) {
    const alt = await ask("whatsapp_business_manager_messaging_limit");
    const v = alt.ok ? alt.data.whatsapp_business_manager_messaging_limit : null;
    if (typeof v === "string" && v) { tier = v; tierField = true; }
  }
  return { ok: true, rating: normaliseRating(rawRating), rawRating, tier, tierField };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!isCron) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
    }
    const body = await req.json().catch(() => ({})) as { mode?: unknown };
    const mode = body.mode === "probe" ? "probe" : "check";

    const reading = await readMeta();
    if (mode === "probe") return json({ ok: true, mode, reading });

    const nowIso = new Date().toISOString();
    const { data: prev, error: pErr } = await service.from("whatsapp_outreach_state")
      .select("paused, meta_quality_rating, meta_messaging_tier, meta_health_error").eq("id", 1).maybeSingle();
    if (pErr) return json({ ok: false, error: "state_read_failed", detail: pErr.message }, 500);
    const logs: Array<{ kind: string; from_value: string | null; to_value: string | null; detail?: string | null }> = [];

    if (!reading.ok) {
      /* ⛔ A failed read stores only the failure. Never a pause, never a change to the last good reading. */
      await service.from("whatsapp_outreach_state").update({ meta_health_checked_at: nowIso, meta_health_error: reading.error }).eq("id", 1);
      if (!prev?.meta_health_error) logs.push({ kind: "read_failed", from_value: null, to_value: null, detail: reading.error });
      if (logs.length) await service.from("whatsapp_number_health_log").insert(logs);
      return json({ ok: true, mode, read: false, error: reading.error });
    }

    const prevRating = (prev?.meta_quality_rating as string | null) ?? null;
    const prevTier = (prev?.meta_messaging_tier as string | null) ?? null;
    const patch: Record<string, unknown> = {
      meta_quality_rating: reading.rating, meta_health_ok_at: nowIso, meta_health_checked_at: nowIso, meta_health_error: null,
    };
    /* The tier field may be unsupported (asked for the rating alone): keep the last known tier then. */
    if (reading.tierField) patch.meta_messaging_tier = reading.tier;
    const { error: uErr } = await service.from("whatsapp_outreach_state").update(patch).eq("id", 1);
    if (uErr) return json({ ok: false, error: "state_write_failed", detail: uErr.message }, 500);

    if (prevRating !== reading.rating) logs.push({ kind: "rating_changed", from_value: prevRating, to_value: reading.rating });
    if (reading.tierField && prevTier !== reading.tier) logs.push({ kind: "tier_changed", from_value: prevTier, to_value: reading.tier });
    if (prev?.meta_health_error) logs.push({ kind: "read_recovered", from_value: null, to_value: null, detail: String(prev.meta_health_error).slice(0, 300) });

    /* ⛔ RED pauses ONCE, on the turn into red. A person resumes it; it is not re-paused while it stays red. */
    let pausedNow = false;
    if (shouldPauseForRating(prevRating, reading.rating) && prev?.paused !== true) {
      await service.from("whatsapp_outreach_state").update({ auto_paused_at: nowIso, auto_pause_reason: RED_PAUSE_REASON }).eq("id", 1);
      const { error: apErr } = await service.from("whatsapp_outreach_state")
        .update({ paused: true, updated_at: nowIso, pause_changed_at: nowIso, pause_changed_by: null, pause_changed_source: "auto" }).eq("id", 1);
      if (apErr) await service.from("whatsapp_outreach_state").update({ paused: true, updated_at: nowIso }).eq("id", 1);
      pausedNow = true;
      logs.push({ kind: "paused_red", from_value: prevRating, to_value: "RED", detail: RED_PAUSE_REASON });
      console.warn("[whatsapp-number-health] RED: queue paused");
    }
    if (logs.length) {
      const { error: lErr } = await service.from("whatsapp_number_health_log").insert(logs);
      if (lErr) console.error("[whatsapp-number-health] log write failed: " + lErr.message);
    }
    return json({ ok: true, mode, read: true, rating: reading.rating, tier: reading.tierField ? reading.tier : prevTier, pausedNow, changes: logs.map((l) => l.kind) });
  } catch (e) {
    console.error("[whatsapp-number-health] " + ((e as Error)?.message ?? String(e)));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
