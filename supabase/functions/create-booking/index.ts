// create-booking
//
// The PUBLIC booking endpoint (anonymous customers). The public site collects the
// details and suggests slots, but the real booking goes through HERE because:
//   * anon can't read the bookings table back (insert-only RLS), and
//   * "slot inside working hours" + "not in the past" can't be enforced by RLS.
//
// This function (service_role) RE-VALIDATES everything server-side — never trusts
// the client — then inserts with return=minimal. Timezone for working hours is
// Europe/London. verify_jwt = false (public); rate-limited by IP.
//
// Error contract (matches the rest of the project): client-branchable outcomes
// return HTTP 200 { ok:false, error } (supabase-js nulls data on non-2xx, so the
// page can branch on the code). Bad input → 4xx; unexpected failure → 5xx.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_DURATION = 30;
const MAX_DURATION = 240;

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra || {}) },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

// Europe/London weekday (0=Sun … 6=Sat, matching the schema) + minutes-of-day for
// an absolute instant. Uses Intl so DST is handled correctly.
const WEEKDAY_FROM_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function londonParts(d: Date): { weekday: number; minutes: number } {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let wd = "Mon", hh = "0", mm = "0";
  for (const p of dtf.formatToParts(d)) {
    if (p.type === "weekday") wd = p.value;
    else if (p.type === "hour") hh = p.value;
    else if (p.type === "minute") mm = p.value;
  }
  return {
    weekday: WEEKDAY_FROM_SHORT[wd] ?? 1,
    minutes: (parseInt(hh, 10) % 24) * 60 + parseInt(mm, 10),
  };
}

// "HH:MM:SS" / "HH:MM" → minutes since midnight.
function hmToMinutes(t: string): number {
  const [h, m] = String(t).split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

// Light phone sanity check: keep it permissive but require some digits.
function phoneLooksValid(p: string): boolean {
  const digits = (p.match(/\d/g) || []).length;
  return digits >= 5 && p.length <= 40;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rl = checkRateLimit(`create-booking:${clientIp(req)}`, 12, 60000);
    const rlHeaders = rateLimitHeaders(rl, 12);
    if (!rl.allowed) {
      return jsonResponse({ ok: false, error: "rate_limited" }, 429, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const siteId = typeof body.site_id === "string" ? body.site_id.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const staffId = typeof body.staff_id === "string" ? body.staff_id.trim() : "";
    const serviceName = typeof body.service_name === "string" ? body.service_name.trim() : "";
    const customerName = typeof body.customer_name === "string" ? body.customer_name.trim() : "";
    const customerPhone = typeof body.customer_phone === "string" ? body.customer_phone.trim() : "";
    const startsAtRaw = typeof body.starts_at === "string" ? body.starts_at.trim() : "";

    // --- Input validation (200 {ok:false} so the page can show a specific message) ---
    if ((!siteId && !slug) || !staffId || !serviceName || !customerName || !customerPhone || !startsAtRaw) {
      return jsonResponse({ ok: false, error: "missing_fields" }, 200, rlHeaders);
    }
    if (customerName.length > 120) {
      return jsonResponse({ ok: false, error: "invalid_name" }, 200, rlHeaders);
    }
    if (!phoneLooksValid(customerPhone)) {
      return jsonResponse({ ok: false, error: "invalid_phone" }, 200, rlHeaders);
    }
    const start = new Date(startsAtRaw);
    if (isNaN(start.getTime())) {
      return jsonResponse({ ok: false, error: "invalid_time" }, 200, rlHeaders);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // --- Resolve the site (by id or slug) and require it published ---
    const siteSel = serviceClient.from("generated_sites").select("id, status, content");
    const { data: site } = await (siteId ? siteSel.eq("id", siteId) : siteSel.eq("site_name", slug)).maybeSingle();
    if (!site) {
      return jsonResponse({ ok: false, error: "site_not_found" }, 404, rlHeaders);
    }
    if (site.status !== "published") {
      return jsonResponse({ ok: false, error: "not_published" }, 200, rlHeaders);
    }

    // --- Staff must belong to this site and be active ---
    const { data: staff } = await serviceClient
      .from("booking_staff")
      .select("id, site_id, name, is_active")
      .eq("id", staffId)
      .maybeSingle();
    if (!staff || staff.site_id !== site.id || !staff.is_active) {
      return jsonResponse({ ok: false, error: "invalid_staff" }, 200, rlHeaders);
    }

    // --- Duration is taken from the site's own service list, NOT the client ---
    const content = (site.content || {}) as Record<string, unknown>;
    const services = Array.isArray(content.services) ? (content.services as Record<string, unknown>[]) : [];
    const svc = services.find(
      (s) => typeof s?.name === "string" && (s.name as string).trim().toLowerCase() === serviceName.toLowerCase(),
    );
    if (!svc) {
      return jsonResponse({ ok: false, error: "unknown_service" }, 200, rlHeaders);
    }
    const rawDur = typeof svc.durationMins === "number" ? (svc.durationMins as number) : DEFAULT_DURATION;
    const duration = Math.min(MAX_DURATION, Math.max(5, Math.round(rawDur || DEFAULT_DURATION)));

    // --- Not in the past; compute ends_at server-side ---
    if (start.getTime() <= Date.now()) {
      return jsonResponse({ ok: false, error: "in_past" }, 200, rlHeaders);
    }
    const end = new Date(start.getTime() + duration * 60000);

    // --- Slot must fall entirely inside the staff's working hours (Europe/London) ---
    const sp = londonParts(start);
    const ep = londonParts(end);
    if (sp.weekday !== ep.weekday) {
      // Appointment would cross midnight London-time — no shop opens across it.
      return jsonResponse({ ok: false, error: "outside_hours" }, 200, rlHeaders);
    }
    const { data: whRows } = await serviceClient
      .from("staff_working_hours")
      .select("start_time, end_time")
      .eq("staff_id", staffId)
      .eq("weekday", sp.weekday);
    const fits = (whRows ?? []).some((w) => {
      const ws = hmToMinutes(w.start_time as string);
      const we = hmToMinutes(w.end_time as string);
      return sp.minutes >= ws && ep.minutes <= we;
    });
    if (!fits) {
      return jsonResponse({ ok: false, error: "outside_hours" }, 200, rlHeaders);
    }

    // --- Pre-check overlap (clean error). The exclusion constraint is the real
    //     race backstop on insert below. ---
    const { data: clash } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1);
    if (clash && clash.length > 0) {
      return jsonResponse({ ok: false, error: "slot_taken" }, 200, rlHeaders);
    }

    // --- Insert (return=minimal: no .select(), nothing read back) ---
    const { error: insErr } = await serviceClient.from("bookings").insert({
      site_id: site.id,
      staff_id: staffId,
      service_name: serviceName,
      customer_name: customerName,
      customer_phone: customerPhone,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "confirmed",
    });
    if (insErr) {
      // 23P01 = exclusion_violation → someone grabbed the slot in the race window.
      if (insErr.code === "23P01" || /no_overlap|exclusion/i.test(insErr.message || "")) {
        return jsonResponse({ ok: false, error: "slot_taken" }, 200, rlHeaders);
      }
      console.error("[CREATE-BOOKING] insert failed:", insErr.message);
      return jsonResponse({ ok: false, error: "booking_failed" }, 500, rlHeaders);
    }

    // Minimal confirmation payload — built from what we already have, NOT selected
    // back from the table (anon can't read bookings).
    return jsonResponse(
      {
        ok: true,
        booking: {
          service_name: serviceName,
          staff_name: staff.name,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          business_name: typeof content.businessName === "string" ? content.businessName : "",
        },
      },
      200,
      rlHeaders,
    );
  } catch (error) {
    console.error("[CREATE-BOOKING] Unhandled error:", (error as Error).message);
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
});
