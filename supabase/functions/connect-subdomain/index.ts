// connect-subdomain
//
// A paid barber claims <label>.yoursites.uk. Owner-authed + is_paid-gated:
//   1. verify the caller's session and that they own the target site,
//   2. verify the site is paid (is_paid = true),
//   3. validate the label (lowercase a–z 0–9 hyphen, 3–63, not reserved),
//   4. check it isn't already taken by another site (service role, authoritative),
//   5. create a proxied CNAME <label>.yoursites.uk → leadfinderos.pages.dev via the
//      Cloudflare API (idempotent: an existing identical record is treated as OK),
//   6. persist generated_sites.subdomain (service role bypasses the protected-fields
//      trigger). When changing an existing label, the old DNS record is removed
//      best-effort.
//
// SSL is automatic — Universal SSL on the zone already covers *.yoursites.uk, so
// there is no per-subdomain certificate step. verify_jwt is false; we authenticate
// the session ourselves (matches the rest of the project).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cloudflare zone for yoursites.uk + the Pages target subdomains CNAME to.
const ZONE_ID = "ffc2cd9ea580de285b62546f3e24e22f";
const ACCOUNT_ID = "84cf9849ac9cb56bf9c163362c51cc42";
const PAGES_PROJECT = "leadfinderos";
const ROOT_DOMAIN = "yoursites.uk";
const CNAME_TARGET = "leadfinderos.pages.dev";
const CF_API = "https://api.cloudflare.com/client/v4";

// KEEP IN SYNC with src/lib/subdomain.ts + functions/_middleware.ts.
const RESERVED = new Set<string>([
  "www", "app", "api", "admin", "claim", "auth", "mail", "ftp",
  "barber", "barbers", "find-leads", "outreach", "dashboard", "settings",
  "login", "signup", "register", "account", "billing", "support", "help",
  "status", "blog", "docs", "dev", "staging", "test", "demo", "root",
  "ns1", "ns2", "smtp", "webmail", "email", "pages", "cdn", "assets",
  "static", "img", "images", "cloudflare", "yoursites", "leadfinder",
  "leadfinderos", "guide", "start", "terms", "feedback", "s", "p",
]);
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

function validateLabel(raw: string): { ok: boolean; error?: string } {
  const s = (raw || "").trim().toLowerCase();
  if (s.length < 3 || s.length > 63) return { ok: false, error: "invalid_length" };
  if (!SUBDOMAIN_RE.test(s)) return { ok: false, error: "invalid_format" };
  if (RESERVED.has(s)) return { ok: false, error: "reserved" };
  return { ok: true };
}

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra || {}) },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

interface CfResult { success: boolean; errors?: Array<{ code: number; message: string }>; result?: unknown }

/** Create the proxied CNAME. Idempotent: an existing identical record is OK. */
async function createCname(token: string, label: string): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`${CF_API}/zones/${ZONE_ID}/dns_records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "CNAME",
      name: `${label}.${ROOT_DOMAIN}`,
      content: CNAME_TARGET,
      proxied: true,
      ttl: 1,
    }),
  });
  if (res.ok) return { ok: true };
  const rawBody = await res.text().catch(() => "");
  let data: CfResult = {};
  try { data = JSON.parse(rawBody) as CfResult; } catch { /* non-JSON error body */ }
  // 81053 / 81057 = "record already exists" → idempotent success.
  const codes = (data.errors ?? []).map((e) => e.code);
  if (codes.includes(81053) || codes.includes(81057)) return { ok: true };
  const mapped = (data.errors ?? []).map((e) => `${e.code}:${e.message}`).join("; ");
  const detail = `http_${res.status} ${mapped || rawBody.slice(0, 300)}`.trim();
  return { ok: false, detail };
}

/**
 * Register the hostname as a custom domain on the Pages project. This is what makes
 * Pages actually SERVE it — a DNS record alone returns 522. Idempotent: an already-
 * added domain is treated as success.
 */
async function registerPagesDomain(token: string, hostname: string): Promise<{ ok: boolean; detail?: string }> {
  const res = await fetch(`${CF_API}/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: hostname }),
  });
  if (res.ok) return { ok: true };
  const rawBody = await res.text().catch(() => "");
  let data: CfResult = {};
  try { data = JSON.parse(rawBody) as CfResult; } catch { /* non-JSON */ }
  const mapped = (data.errors ?? []).map((e) => `${e.code}:${e.message}`).join("; ");
  // Already attached → idempotent success.
  if (res.status === 409 || /already|exists|duplicate/i.test(mapped + rawBody)) return { ok: true };
  return { ok: false, detail: `http_${res.status} ${mapped || rawBody.slice(0, 300)}`.trim() };
}

/** Best-effort removal of a Pages custom domain (used when a barber changes label). */
async function deletePagesDomain(token: string, hostname: string): Promise<void> {
  try {
    await fetch(`${CF_API}/accounts/${ACCOUNT_ID}/pages/projects/${PAGES_PROJECT}/domains/${encodeURIComponent(hostname)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error("[CONNECT-SUBDOMAIN] old Pages domain cleanup failed (non-blocking):", (e as Error).message);
  }
}

/** Best-effort delete of a CNAME by name (used when a barber changes their label). */
async function deleteCnameByName(token: string, label: string): Promise<void> {
  try {
    const name = `${label}.${ROOT_DOMAIN}`;
    const lookup = await fetch(
      `${CF_API}/zones/${ZONE_ID}/dns_records?type=CNAME&name=${encodeURIComponent(name)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await lookup.json().catch(() => ({}))) as { result?: Array<{ id: string }> };
    const id = data.result?.[0]?.id;
    if (id) {
      await fetch(`${CF_API}/zones/${ZONE_ID}/dns_records/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch (e) {
    console.error("[CONNECT-SUBDOMAIN] old record cleanup failed (non-blocking):", (e as Error).message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rl = checkRateLimit(`connect-subdomain:${clientIp(req)}`, 20, 60000);
    const rlHeaders = rateLimitHeaders(rl, 20);
    if (!rl.allowed) return jsonResponse({ error: "rate_limited" }, 429, rlHeaders);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const cfToken = (Deno.env.get("CLOUDFLARE_API_TOKEN") ?? "").trim();
    if (!cfToken) {
      console.error("[CONNECT-SUBDOMAIN] CLOUDFLARE_API_TOKEN not set");
      return jsonResponse({ error: "server_misconfigured" }, 500, rlHeaders);
    }

    // --- Authenticate the caller -----------------------------------------------
    const authHeader = req.headers.get("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
    const isRealSession = bearer && bearer !== supabaseAnonKey;
    if (!isRealSession) return jsonResponse({ error: "unauthorized" }, 401, rlHeaders);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return jsonResponse({ error: "unauthorized" }, 401, rlHeaders);

    const body = await req.json().catch(() => ({}));
    const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
    const label = (typeof body.subdomain === "string" ? body.subdomain : "").trim().toLowerCase();
    if (!siteId) return jsonResponse({ error: "site_required" }, 400, rlHeaders);

    const v = validateLabel(label);
    if (!v.ok) return jsonResponse({ ok: false, error: v.error }, 200, rlHeaders);

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // --- Ownership + payment gate ----------------------------------------------
    const { data: site } = await serviceClient
      .from("generated_sites")
      .select("id, owner_id, is_paid, subdomain")
      .eq("id", siteId)
      .maybeSingle();
    const row = site as { id: string; owner_id: string | null; is_paid: boolean | null; subdomain: string | null } | null;
    if (!row || row.owner_id !== userId) return jsonResponse({ error: "forbidden" }, 403, rlHeaders);
    if (!row.is_paid) return jsonResponse({ ok: false, error: "not_paid" }, 200, rlHeaders);

    const previous = (row.subdomain ?? "").trim().toLowerCase();
    const hostname = `${label}.${ROOT_DOMAIN}`;

    // --- Availability (authoritative, service role) ----------------------------
    // (.neq self so re-submitting the same label isn't a self-clash — we still
    // re-ensure the CF resources below, since an older row may predate Pages reg.)
    const { data: clash } = await serviceClient
      .from("generated_sites")
      .select("id")
      .ilike("subdomain", label)
      .neq("id", siteId)
      .maybeSingle();
    if (clash) return jsonResponse({ ok: false, error: "taken" }, 200, rlHeaders);

    // --- Cloudflare: proxied CNAME (resolution) + Pages custom domain (routing) --
    // Both are idempotent. The Pages registration is what makes Pages actually serve
    // the host — a DNS record alone returns 522.
    const created = await createCname(cfToken, label);
    if (!created.ok) {
      console.error("[CONNECT-SUBDOMAIN] CF DNS create failed:", created.detail);
      return jsonResponse({ ok: false, error: "dns_failed" }, 200, rlHeaders);
    }
    const reg = await registerPagesDomain(cfToken, hostname);
    if (!reg.ok) {
      console.error("[CONNECT-SUBDOMAIN] Pages domain register failed:", reg.detail);
      return jsonResponse({ ok: false, error: "pages_failed" }, 200, rlHeaders);
    }

    // --- Persist (service role bypasses the protected-fields trigger) -----------
    const { error: updErr } = await serviceClient
      .from("generated_sites")
      .update({ subdomain: label })
      .eq("id", siteId);
    if (updErr) {
      // Unique-violation race → taken; anything else → generic.
      const msg = (updErr.message || "").toLowerCase();
      const code = msg.includes("duplicate") || msg.includes("unique") ? "taken" : "save_failed";
      return jsonResponse({ ok: false, error: code }, 200, rlHeaders);
    }

    // Changed label → remove the old DNS record + Pages domain (best-effort).
    if (previous && previous !== label) {
      await deleteCnameByName(cfToken, previous);
      await deletePagesDomain(cfToken, `${previous}.${ROOT_DOMAIN}`);
    }

    console.log(JSON.stringify({
      level: "info", fn: "connect-subdomain", user_id: userId, site_id: siteId,
      subdomain: label, changed_from: previous || null, timestamp: new Date().toISOString(),
    }));

    return jsonResponse({ ok: true, subdomain: label, url: `https://${label}.${ROOT_DOMAIN}` }, 200, rlHeaders);
  } catch (error) {
    console.error("[CONNECT-SUBDOMAIN] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
