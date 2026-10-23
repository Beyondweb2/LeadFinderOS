// site-shot — ONE homepage picture per lead, for the prospect report's left card (2026-10-23).
//
// Internal only: CRON_SECRET + x-internal-job. Nothing here is reachable from a browser, and nothing here sends or
// publishes anything. Modes (body.mode):
//   · "status"  — reads only: the switch, the cap, this London month's count, rows by status.
//   · "shoot"   — one lead: gate (switch, protection mode, own readable website, cap) → claim (ONE conditional
//                 write) → shoot → refuse an empty-looking image → store → record. Nothing while the switch is off.
//   · "measure" — the 20-site measurement (Paul, 2026-10-23): up to SITE_SHOT_MEASURE_MAX leads per call, shot ONCE
//                 each, stored under measure/ (never in lead_site_shots), with every gate verdict reported beside the
//                 outcome. It ignores the switch and the cap, so it is a door for the operator's session only.
// Spend is never started by opening a report: render-audit-report only READS a finished shot.
// The rules: src/lib/siteShot.ts. The driver: _shared/mockup-shot.ts. Record: docs/site-shot.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shootSite } from "../_shared/mockup-shot.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { shotRefusal } from "../_shared/screenshot-policy.ts";
import { paidMode } from "../_shared/protection.ts";
import { usableCrawlSignals } from "../../../src/lib/crawlCheck.ts";
import {
  SITE_SHOT_BUCKET, SITE_SHOT_FRESH_MS, SITE_SHOT_JPEG_QUALITY, SITE_SHOT_MAX_ATTEMPTS, SITE_SHOT_MEASURE_MAX,
  SITE_SHOT_SCALE, londonMonthStartIso, siteShotGate, siteShotImageProblem, siteShotPath, siteShotRateLimited, siteShotRetryAfterMs,
} from "../../../src/lib/siteShot.ts";

/** Bumped with every change, so a deploy is proved by the live answer (CLAUDE.md §4). */
const BUILD_ID = "site-shot-2026-10-23b";
const json = (body: unknown, status = 200) => new Response(JSON.stringify({ build: BUILD_ID, ...(body as object) }), { status, headers: { "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMAT = { type: "jpeg" as const, quality: SITE_SHOT_JPEG_QUALITY, scale: SITE_SHOT_SCALE };

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;

/** The lead's own website and its stored website check, as the gate reads them. */
async function readLead(service: Service, leadId: string) {
  const { data: lead, error } = await service.from("outreach_leads").select("id, website").eq("id", leadId).maybeSingle();
  if (error) throw new Error(`lead read: ${String(error.message ?? error)}`);
  if (!lead) return null;
  const website = String(lead.website ?? "").trim();
  const { data: cc } = await service.from("lead_crawl_checks")
    .select("signals:result->signals, version:result->version, created_at").eq("lead_id", leadId).maybeSingle();
  const created = cc?.created_at ? Date.parse(String(cc.created_at)) : NaN;
  const sig = cc && Number.isFinite(created)
    ? usableCrawlSignals({ version: cc.version as number | undefined, signals: cc.signals as never }, created)
    : null;
  const refusal = shotRefusal(website);
  return {
    website,
    websiteRefusal: refusal ?? (isAggregatorUrl(website) ? "website_is_aggregator" as const : null),
    crawl: sig ? { fetchFailed: sig.fetchFailed === true, readableAs: sig.readableAs ?? null } : null,
  };
}

async function claimedThisMonth(service: Service, now: Date): Promise<number> {
  const { count, error } = await service.from("lead_site_shots").select("lead_id", { count: "exact", head: true }).gte("claimed_at", londonMonthStartIso(now));
  if (error) throw new Error(`count: ${String(error.message ?? error)}`);
  return count ?? 0;
}

async function readSettings(service: Service): Promise<{ enabled: boolean; monthly_cap: number }> {
  const { data, error } = await service.from("site_shot_settings").select("enabled, monthly_cap").eq("id", true).maybeSingle();
  if (error) throw new Error(`settings: ${String(error.message ?? error)}`);
  /* Absent = do not: no row, a failed read or a non-boolean is a closed switch. */
  return { enabled: data?.enabled === true, monthly_cap: Number.isFinite(Number(data?.monthly_cap)) ? Number(data.monthly_cap) : 0 };
}

async function noteFailure(service: Service, leadId: string, message: string) {
  /* RECORDED, NOT console.error'd: the CLI has no `functions logs`, so a refusal only logged is undiagnosable afterwards. */
  try { await service.from("client_error_reports").insert({ context: "site_shot_failed", message: `${leadId}: ${message}`.slice(0, 500) }); } catch { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const internal = req.headers.get("x-internal-job") === "1"
    && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || "\u0000__unset__");
  if (!internal) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode = String(body.mode ?? "");
  const now = new Date();
  try {
    if (mode === "status") {
      const settings = await readSettings(service);
      const { data: rows } = await service.from("lead_site_shots").select("status");
      const byStatus: Record<string, number> = {};
      for (const r of (rows ?? []) as Array<{ status: string }>) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      return json({ ok: true, mode, ...settings, mode_protection: await paidMode(service), claimed_this_month: await claimedThisMonth(service, now), by_status: byStatus });
    }

    if (mode === "shoot") {
      const leadId = String(body.lead_id ?? "");
      if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "shoot needs lead_id." }, 400);
      const [settings, protection, lead, month] = await Promise.all([readSettings(service), paidMode(service), readLead(service, leadId), claimedThisMonth(service, now)]);
      if (!lead) return json({ ok: false, error: "no_such_lead" }, 404);
      const gate = siteShotGate({ enabled: settings.enabled, mode: protection, websiteRefusal: lead.websiteRefusal, crawl: lead.crawl, claimedThisMonth: month, monthlyCap: settings.monthly_cap });
      if (!gate.ok) return json({ ok: true, mode, shot: false, reason: gate.reason });
      if (body.dry_run === true) return json({ ok: true, mode, shot: false, reason: "dry_run_would_try" });

      const { data: claim, error: claimErr } = await service.rpc("claim_site_shot", { p_lead: leadId, p_now: now.toISOString(), p_fresh: `${Math.round(SITE_SHOT_FRESH_MS / 86_400_000)} days`, p_max_attempts: SITE_SHOT_MAX_ATTEMPTS });
      if (claimErr) throw new Error(`claim: ${String(claimErr.message ?? claimErr)}`);
      if (claim !== "claimed") return json({ ok: true, mode, shot: false, reason: "held" });

      const shot = await shootSite(lead.website, FORMAT);
      const stamp = new Date().toISOString();
      if (!shot.ok && siteShotRateLimited(shot.detail)) {
        /* Cloudflare's own rate limit: nothing was shot or billed, and the lead's try is given back (attempts 0), so the next audit may claim it. */
        await service.from("lead_site_shots").update({ status: "failed", reason: "rate_limited", attempts: 0, request_ms: shot.ms, updated_at: new Date().toISOString() }).eq("lead_id", leadId);
        return json({ ok: true, mode, shot: false, reason: "rate_limited" });
      }
      if (!shot.ok) {
        const refused = shot.refusal !== "cf_error" && shot.refusal !== "not_configured";
        await service.from("lead_site_shots").update({ status: refused ? "refused" : "failed", reason: shot.refusal, request_ms: shot.ms, updated_at: stamp }).eq("lead_id", leadId);
        if (!refused) await noteFailure(service, leadId, `${shot.refusal}${shot.detail ? ` — ${shot.detail}` : ""}`);
        return json({ ok: true, mode, shot: false, reason: shot.refusal });
      }
      const problem = siteShotImageProblem(shot.bytes);
      if (problem) {
        await service.from("lead_site_shots").update({ status: "refused", reason: `image_${problem}`, bytes: shot.bytes.length, request_ms: shot.ms, updated_at: stamp }).eq("lead_id", leadId);
        return json({ ok: true, mode, shot: false, reason: `image_${problem}` });
      }
      const path = siteShotPath(leadId)!;
      const up = await service.storage.from(SITE_SHOT_BUCKET).upload(path, shot.bytes, { contentType: "image/jpeg", upsert: true });
      if (up.error) {
        await service.from("lead_site_shots").update({ status: "failed", reason: "store_failed", updated_at: stamp }).eq("lead_id", leadId);
        await noteFailure(service, leadId, `store_failed — ${String(up.error.message ?? up.error).slice(0, 200)}`);
        return json({ ok: false, error: "store_failed" }, 500);
      }
      await service.from("lead_site_shots").update({
        status: "ok", reason: null, source_url: shot.url, path, content_type: "image/jpeg", bytes: shot.bytes.length, request_ms: shot.ms, shot_at: stamp, updated_at: stamp,
      }).eq("lead_id", leadId);
      return json({ ok: true, mode, shot: true, path, bytes: shot.bytes.length, request_ms: shot.ms });
    }

    if (mode === "measure") {
      const ids = (Array.isArray(body.lead_ids) ? body.lead_ids : []).map(String).filter((x) => UUID_RE.test(x));
      if (!ids.length || ids.length > SITE_SHOT_MEASURE_MAX) return json({ ok: false, error: "bad_request", detail: `measure needs 1 to ${SITE_SHOT_MEASURE_MAX} lead_ids.` }, 400);
      const protection = await paidMode(service);
      if (protection === "all_stop") return json({ ok: true, mode, shot: false, reason: "all_stop" });
      const gapMs = Math.min(30_000, Math.max(0, Number(body.gap_ms ?? 0) || 0));
      const deadline = Date.now() + 110_000;   // the edge limit is ~150s: leave what does not fit for the caller to resubmit
      const deferred: string[] = [];
      const out = [];
      let first = true;
      for (const leadId of ids) {
        if (Date.now() > deadline - 25_000) { deferred.push(leadId); continue; }
        if (!first && gapMs) await new Promise((r) => setTimeout(r, gapMs));
        first = false;
        const lead = await readLead(service, leadId);
        if (!lead) { out.push({ lead_id: leadId, error: "no_such_lead" }); continue; }
        const gate = siteShotGate({ enabled: true, mode: "running", websiteRefusal: lead.websiteRefusal, crawl: lead.crawl, claimedThisMonth: 0, monthlyCap: 1 });
        if (lead.websiteRefusal) { out.push({ lead_id: leadId, website: lead.website, gate: gate.ok ? "ok" : gate.reason, shot: false, reason: lead.websiteRefusal }); continue; }
        let shot = await shootSite(lead.website, FORMAT);
        let retries = 0;
        while (!shot.ok && siteShotRateLimited(shot.detail) && retries < 3 && Date.now() < deadline - 25_000) {
          retries++;
          await new Promise((r) => setTimeout(r, siteShotRetryAfterMs(shot.ok ? null : shot.detail, 15_000)));
          shot = await shootSite(lead.website, FORMAT);
        }
        if (!shot.ok) { out.push({ lead_id: leadId, website: lead.website, gate: gate.ok ? "ok" : gate.reason, shot: false, reason: shot.refusal, detail: shot.detail ?? null, request_ms: shot.ms }); continue; }
        const path = siteShotPath(leadId, true)!;
        const up = await service.storage.from(SITE_SHOT_BUCKET).upload(path, shot.bytes, { contentType: "image/jpeg", upsert: true });
        const signed = up.error ? null : (await service.storage.from(SITE_SHOT_BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;
        out.push({
          lead_id: leadId, website: lead.website, gate: gate.ok ? "ok" : gate.reason, shot: !up.error, request_ms: shot.ms, retries, bytes: shot.bytes.length,
          image_problem: siteShotImageProblem(shot.bytes), crawl: lead.crawl, path, signed_url: signed, store_error: up.error ? String(up.error.message ?? up.error).slice(0, 160) : null,
        });
      }
      return json({ ok: true, mode, results: out, deferred });
    }

    return json({ ok: false, error: "bad_mode", detail: "mode must be status, shoot or measure." }, 400);
  } catch (e) {
    const msg = (e as Error)?.message ?? String((e as { message?: unknown })?.message ?? e);
    console.error("[site-shot]", msg.split("\n")[0].slice(0, 300));
    return json({ ok: false, error: "failed", detail: msg.slice(0, 300) }, 500);
  }
});
