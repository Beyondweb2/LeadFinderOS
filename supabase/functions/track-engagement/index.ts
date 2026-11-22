// track-engagement — PUBLIC (no auth) logger for campaign performance (Paul, 2026-11-22; docs/campaign-performance.md).
//
//   ?ping=<report view id>   (POST or GET)  the report page's own script ran → report_views.js_at, once, within an hour.
//                                           Answers 204 whatever happens: a visitor's browser never sees an error.
//   ?link=<8-char code>      (GET)          a tracked link was opened → link_clicks row (bots marked by the visitor's
//                                           User-Agent, which the findable.live / app.leadfinderos.com proxies forward)
//                                           and JSON { url } of where to send them, or { url: null } for an unknown code.
//
// ⛔ The handler is the gate (verify_jwt = false, like render-audit-report): it writes only through the service-role-only
//    SQL functions, accepts only an id / code of the exact shape, and never echoes anything a caller sent.
// ⛔ Never an open redirect: a link's target was checked on the way IN (tracked_links' constraint: our two domains only)
//    and is checked again here before it is returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { botReasonFor } from "../../../src/lib/engagementBots.ts";
import { GO_LINK_DESTINATION } from "../../../src/lib/initialWithLink.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-z0-9]{8}$/;
/* A /go/ code: the 8 we make, or the 4-12 the table allows (the QA row for the live check). */
const GO_ANY_CODE_RE = /^[a-z0-9]{4,12}$/;
const OUR_TARGET_RE = /^https:\/\/(findable\.live|app\.leadfinderos\.com)\//;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

  const ping = (url.searchParams.get("ping") ?? "").trim();
  if (ping) {
    if (UUID_RE.test(ping)) {
      try {
        const { error } = await service.rpc("report_view_ping", { p_view_id: ping });
        if (error) console.warn("[track-engagement] ping skipped:", error.message);
      } catch (e) { console.warn("[track-engagement] ping error:", e instanceof Error ? e.message : e); }
    }
    return new Response(null, { status: 204, headers: cors });
  }

  /* ?go=<code> — leadfinderos.com/go/<code> (initial_with_link). The waitlist site holds no keys: its functions/go/[code].ts only
     302s the visitor HERE, so the visitor's own browser (and its real User-Agent) arrives. Log the click if the code is ours (bots
     marked), then always 302 to https://leadfinderos.com/ — a bad code, a failure, anything: the visitor still lands on the site. */
  const go = (url.searchParams.get("go") ?? "").trim().toLowerCase();
  if (url.searchParams.has("go")) {
    if (GO_ANY_CODE_RE.test(go)) {
      const ua = req.headers.get("user-agent") ?? "";
      try {
        const { error } = await service.rpc("log_link_click", { p_code: go, p_user_agent: ua, p_bot_reason: botReasonFor(ua) });
        if (error) console.warn("[track-engagement] go click log failed:", error.message);
      } catch (e) { console.warn("[track-engagement] go click error:", e instanceof Error ? e.message : e); }
    }
    return new Response(null, { status: 302, headers: { location: GO_LINK_DESTINATION, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } });
  }

  const code = (url.searchParams.get("link") ?? "").trim().toLowerCase();
  if (code) {
    if (!CODE_RE.test(code)) return json({ url: null });
    const ua = req.headers.get("user-agent") ?? "";
    try {
      const { data, error } = await service.rpc("log_link_click", { p_code: code, p_user_agent: ua, p_bot_reason: botReasonFor(ua) });
      if (error) { console.warn("[track-engagement] click log failed:", error.message); return json({ url: null, error: "lookup_failed" }, 503); }
      return json({ url: typeof data === "string" && OUR_TARGET_RE.test(data) ? data : null });
    } catch (e) {
      console.warn("[track-engagement] click error:", e instanceof Error ? e.message : e);
      return json({ url: null, error: "lookup_failed" }, 503);
    }
  }
  return json({ error: "nothing_to_track" }, 400);
});
