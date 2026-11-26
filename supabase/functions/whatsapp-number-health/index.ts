// whatsapp-number-health — THE WHATSAPP NUMBER'S QUALITY RATING AND MESSAGING TIER (2026-10-21,
// docs/whatsapp-number-health.md). The rules are src/lib/whatsappNumberHealth.ts.
//
// Callers: pg_cron every 15 minutes (public.invoke_whatsapp_number_health, CRON_SECRET), or an admin.
// Modes:
//   probe — ask Meta and answer; WRITES NOTHING. (Used to prove the token can read the rating.)
//   check — ask Meta, store the reading on whatsapp_outreach_state (id 1), log every change, and latch the cold stop when the tier
//           drops or the number is flagged / restricted. RED alone pauses nothing (2026-11-02). A failed read stores only the
//           failure: it never stops anything, never touches the last good reading (the queue then only blocks cap rises).
// ⛔ Reads only. Sends nothing. Never returns or logs the token (errors keep Meta's code and message only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, refusalBody } from "../_shared/access.ts";
import { GRAPH_VERSION } from "../_shared/whatsapp-send.ts";
import { normaliseRating, tripwireReason, type QualityRating } from "../../../src/lib/whatsappNumberHealth.ts";
import { metaSafetyReason, safetyNetEmail } from "../../../src/lib/whatsappQualityCap.ts";
import { raiseOperatorAlert } from "../_shared/audit-alerts.ts";
import { bellOnly } from "../_shared/operator-bell.ts";
import { autoResumeAt, londonDayStartIso, pauseAlert, pauseNote, qualityDropPause } from "../../../src/lib/queuePauseRules.ts";
import { operatorAppUrl } from "../../../src/config/operatorApp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Reading { ok: true; rating: QualityRating; rawRating: string | null; tier: string | null; tierField: boolean; status: string | null; canSend: string | null; healthStatus: unknown }
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
  /* 2026-11-02: is the number flagged or restricted? Asked on its own, so a field this API version does not know costs nothing:
     no value, no tripwire. */
  const st = await ask("status,health_status");
  const status = st.ok && typeof st.data.status === "string" ? st.data.status : null;
  const can = st.ok ? (st.data.health_status as { can_send_message?: unknown } | undefined)?.can_send_message : null;
  return { ok: true, rating: normaliseRating(rawRating), rawRating, tier, tierField, status, canSend: typeof can === "string" ? can : null, healthStatus: st.ok ? st.data.health_status ?? null : null };
}

/** The stop rests at least this long before it may clear itself. */
const COLD_STOP_MIN_REST_MIN = 60;
const londonDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

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
    /* Probe only: healthStatus is Meta's whole answer (which entity is limited, and why), for reading by hand. Nothing stores it. */
    if (mode === "probe") return json({ ok: true, mode, reading });

    const nowIso = new Date().toISOString();
    const { data: prev, error: pErr } = await service.from("whatsapp_outreach_state")
      .select("meta_quality_rating, meta_messaging_tier, meta_health_error, meta_number_status, meta_can_send, cold_stop_at, paused").eq("id", 1).maybeSingle();
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
    /* A status Meta did not answer keeps the last known one: absent is never "it recovered". */
    if (reading.status != null) patch.meta_number_status = reading.status;
    if (reading.canSend != null) patch.meta_can_send = reading.canSend;
    const { error: uErr } = await service.from("whatsapp_outreach_state").update(patch).eq("id", 1);
    if (uErr) return json({ ok: false, error: "state_write_failed", detail: uErr.message }, 500);

    if (prevRating !== reading.rating) logs.push({ kind: "rating_changed", from_value: prevRating, to_value: reading.rating });
    if (reading.tierField && prevTier !== reading.tier) logs.push({ kind: "tier_changed", from_value: prevTier, to_value: reading.tier });
    if (prev?.meta_health_error) logs.push({ kind: "read_recovered", from_value: null, to_value: null, detail: String(prev.meta_health_error).slice(0, 300) });

    const prevStatus = (prev?.meta_number_status as string | null) ?? null;
    if (reading.status != null && prevStatus !== reading.status) logs.push({ kind: "status_changed", from_value: prevStatus, to_value: reading.status });
    /* ⛔ THE TRIPWIRE (2026-11-02): the turn into a limit stops all cold WhatsApp, once. A person clears it (mode clear_cold_stop on the
       queue function), and it is not re-latched while the same reading lasts. RED is not in here. */
    const stopReason = tripwireReason({
      prevTier, tier: reading.tierField ? reading.tier : prevTier,
      prevStatus, status: reading.status ?? prevStatus,
      prevCanSend: (prev?.meta_can_send as string | null) ?? null, canSend: reading.canSend ?? (prev?.meta_can_send as string | null) ?? null,
    });
    let stoppedNow = false;
    if (stopReason && !prev?.cold_stop_at) {
      const { error: sErr } = await service.from("whatsapp_outreach_state").update({ cold_stop_at: nowIso, cold_stop_reason: stopReason }).eq("id", 1);
      if (!sErr) {
        stoppedNow = true;
        logs.push({ kind: "cold_stopped", from_value: prevTier, to_value: reading.tier, detail: stopReason });
        await service.from("whatsapp_queue_pause_log").insert({ scope: "queue", action: "cold_stopped", source: "auto", by_user_id: null, reason: stopReason });
        console.warn("[whatsapp-number-health] cold WhatsApp stopped");
        /* 2026-11-26: a real stop, so Paul is emailed — once per London day for this problem. */
        try {
          await raiseOperatorAlert(service, "team_update", {
            title: "WhatsApp cold sending stopped: Meta limited the number", body: stopReason, link: "/whatsapp-queue",
            subject: "WhatsApp cold sending stopped: Meta limited the number",
            lines: [
              "Why: " + stopReason,
              "What to do: open WhatsApp Manager and read Meta's notice on the number.",
              "It starts again by itself once Meta's reading of the number is clean again (checked every 15 minutes, never sooner than an hour). You can also clear it on the WhatsApp queue.",
              "", "Open the WhatsApp queue: " + operatorAppUrl("/whatsapp-queue"),
            ],
            dedupeKey: "wa-cold-stop:" + londonDayKey(new Date()),
          });
        } catch { /* the stop stands either way */ }
      }
    }
    /* ⛔ THE STOP CLEARS ITSELF WHEN THE CAUSE HAS (2026-11-26, Paul): at least COLD_STOP_MIN_REST_MIN after it latched, and only on a
       clean reading — not blocked / flagged / restricted, tier at or above the baseline (metaSafetyReason null). A bell, no email. */
    const cleanNow = !metaSafetyReason({
      meta_messaging_tier: reading.tierField ? reading.tier : prevTier, meta_number_status: reading.status ?? prevStatus,
      meta_can_send: reading.canSend ?? (prev?.meta_can_send as string | null) ?? null,
    });
    const stopAtMs = prev?.cold_stop_at ? Date.parse(String(prev.cold_stop_at)) : NaN;
    if (!stoppedNow && cleanNow && Number.isFinite(stopAtMs) && Date.now() - stopAtMs >= COLD_STOP_MIN_REST_MIN * 60_000) {
      const { error: cErr } = await service.from("whatsapp_outreach_state").update({ cold_stop_at: null, cold_stop_reason: null })
        .eq("id", 1).eq("cold_stop_at", String(prev?.cold_stop_at));
      if (!cErr) {
        await service.from("whatsapp_queue_pause_log").insert({ scope: "queue", action: "cold_resumed", source: "auto", by_user_id: null, reason: "Meta's reading of the number is clean again" });
        await bellOnly(service, { title: "WhatsApp cold sending started again by itself", body: "Meta's reading of the number is clean again (not blocked or flagged, normal messaging limit).", link: "/whatsapp-queue", dedupeKey: "wa-cold-resume:" + nowIso.slice(0, 13) });
        console.log("[whatsapp-number-health] cold stop cleared by itself");
      }
    }
    /* ⛔ A REAL QUALITY DROP PAUSES THE QUEUE (2026-11-26, Paul; src/lib/queuePauseRules.ts qualityDropPause): only when the higher
       rating had held for a full day first. Meta's reading flips GREEN↔RED several times a week; a flip never pauses. */
    if (prevRating !== reading.rating && prev?.paused !== true) try {
      const { data: lastChange } = await service.from("whatsapp_number_health_log").select("created_at")
        .eq("kind", "rating_changed").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const q = qualityDropPause(prevRating, reading.rating, (lastChange?.created_at as string | null) ?? null);
      if (q.pause && q.kind && q.reason) {
        const now = new Date();
        const { count: resumedToday } = await service.from("whatsapp_queue_pause_log").select("id", { count: "exact", head: true })
          .eq("scope", "queue").eq("action", "resumed").eq("source", "auto").gte("created_at", londonDayStartIso(now));
        const resumeAt = autoResumeAt(q.kind, now, (resumedToday ?? 0) > 0);
        await service.from("whatsapp_outreach_state").update({ auto_paused_at: nowIso, auto_pause_reason: pauseNote(q.kind, q.reason, resumeAt) }).eq("id", 1);
        await service.from("whatsapp_outreach_state").update({ auto_pause_kind: q.kind, auto_resume_at: resumeAt ? resumeAt.toISOString() : null }).eq("id", 1);
        await service.from("whatsapp_outreach_state")
          .update({ paused: true, updated_at: nowIso, pause_changed_at: nowIso, pause_changed_by: null, pause_changed_source: "auto" }).eq("id", 1);
        const a = pauseAlert({ kind: q.kind, reason: q.reason }, resumeAt, now);
        await raiseOperatorAlert(service, "team_update", { ...a, link: "/whatsapp-queue", lines: [...a.lines, "", "Open the WhatsApp queue: " + operatorAppUrl("/whatsapp-queue")] });
        console.warn("[whatsapp-number-health] queue paused: " + q.reason);
      }
    } catch (e) {
      console.error("[whatsapp-number-health] quality-drop check failed (non-fatal): " + ((e as Error)?.message ?? String(e)));
    }
    /* ⛔ THE SAFETY NET (2026-11-23 pm, Paul; src/lib/whatsappQualityCap.ts): Meta lowered the tier or flagged the number → the cold
       cap is 60 a day (the cold guard reads the stored row, so it already applies). On the TURN into it, Paul gets one email + bell. */
    const safetyBefore = metaSafetyReason(prev as never);
    const safetyNow = metaSafetyReason({
      meta_messaging_tier: reading.tierField ? reading.tier : prevTier, meta_number_status: reading.status ?? prevStatus,
      meta_can_send: reading.canSend ?? (prev?.meta_can_send as string | null) ?? null,
    });
    /* ⚠️ No health-log row: the table's kind CHECK has no word for it, and a refused kind would lose the whole insert. The tier /
       status rows above already record what changed; the email + bell record the cap. */
    if (safetyNow && !safetyBefore) {
      const mail = safetyNetEmail(safetyNow);
      try {
        await raiseOperatorAlert(service, "team_update", {
          title: mail.subject, body: mail.lines[0], link: "/whatsapp-queue", subject: mail.subject,
          lines: [...mail.lines, "", "Open the WhatsApp queue: " + operatorAppUrl("/whatsapp-queue")],
          dedupeKey: "wa-safety-cap:" + londonDayKey(new Date()), // once per London day (was hourly)
        });
      } catch { /* the cap applies whether or not the email goes */ }
    }
    if (logs.length) {
      const { error: lErr } = await service.from("whatsapp_number_health_log").insert(logs);
      if (lErr) console.error("[whatsapp-number-health] log write failed: " + lErr.message);
    }
    return json({ ok: true, mode, read: true, rating: reading.rating, tier: reading.tierField ? reading.tier : prevTier, status: reading.status, stoppedNow, changes: logs.map((l) => l.kind) });
  } catch (e) {
    console.error("[whatsapp-number-health] " + ((e as Error)?.message ?? String(e)));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
