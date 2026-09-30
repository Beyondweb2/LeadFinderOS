import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// site-analytics — findable.live's first-party, cookie-free analytics (Admin control centre, release 5,
// 2026-09-30; docs/admin-control-centre.md §Findable site traffic).
//
// PUBLIC by design (the site's visitors are anonymous): verify_jwt = false, no auth. So it trusts
// nothing: only the site's own origins, only the four named events, every field trimmed and length-
// capped, bots dropped, at most SESSION_HOURLY_CAP events per session per hour. It answers 204 to
// everything — it never tells a caller whether a row was stored, so it cannot be probed.
// ⛔ WHAT IT KEEPS: event, a random per-tab session id, path, referring HOST, UTM tags, a coarse device
// class, the internal flag. NEVER the IP address, the user agent, a name or an email — they are read
// only to drop bots and never written.

const ALLOWED_ORIGINS = new Set(["https://findable.live", "https://www.findable.live", "https://findable-site.pages.dev"]);
const EVENTS = new Set(["visit", "free_check_started", "onboarding_started", "checkout_started"]);
const DEVICES = new Set(["mobile", "tablet", "desktop"]);
const SESSION_HOURLY_CAP = 60;
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|axios|node-fetch/i;
const SID_RE = /^[A-Za-z0-9_-]{8,40}$/;

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://findable.live",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "x-build": BUILD_ID,
});
const BUILD_ID = "site-analytics-2026-09-30a";
const cut = (v: unknown, n: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, n) : null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const done = () => new Response(null, { status: 204, headers });
  try {
    if (req.method !== "POST" || !origin || !ALLOWED_ORIGINS.has(origin)) return done();
    if (BOT_UA.test(req.headers.get("user-agent") ?? "")) return done();
    const raw = await req.text();
    if (raw.length > 2000) return done();
    const b = JSON.parse(raw) as Record<string, unknown>;
    const event = String(b.ev ?? "");
    const sid = String(b.sid ?? "");
    if (!EVENTS.has(event) || !SID_RE.test(sid)) return done();
    let path = cut(b.path, 200);
    if (path && !path.startsWith("/")) path = null;
    // Referrer: the HOST only, never the full URL (it can carry someone's search terms).
    let ref: string | null = null;
    try { ref = b.ref ? new URL(String(b.ref)).host.slice(0, 120) || null : null; } catch { ref = null; }
    const device = DEVICES.has(String(b.dev ?? "")) ? String(b.dev) : null;
    const utm = (b.utm ?? {}) as Record<string, unknown>;

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { count } = await service.from("site_analytics_events").select("id", { count: "exact", head: true })
      .eq("session_id", sid).gte("occurred_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= SESSION_HOURLY_CAP) return done();
    await service.from("site_analytics_events").insert({
      event, session_id: sid, path, referrer_host: ref, device,
      utm_source: cut(utm.source, 80), utm_medium: cut(utm.medium, 80), utm_campaign: cut(utm.campaign, 80),
      internal: b.internal === true,
    });
    return done();
  } catch {
    return done();
  }
});
