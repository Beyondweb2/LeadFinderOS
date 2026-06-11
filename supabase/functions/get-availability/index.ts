// get-availability
//
// Public, read-only availability for the booking picker (Option 2). Anonymous
// customers CANNOT read the bookings table (insert-only RLS), so the public slot
// picker can't see which times are taken. This function (service_role) returns
// ONLY the busy time ranges (starts_at / ends_at) of non-cancelled bookings for a
// given staff member within a window — NO customer names, NO phones, nothing else.
// The picker uses these to grey out taken slots; create-booking remains the real
// guard on submit. verify_jwt = false (public); rate-limited by IP.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_WINDOW_MS = 32 * 24 * 60 * 60 * 1000; // cap the query window at ~a month

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra || {}) },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rl = checkRateLimit(`get-availability:${clientIp(req)}`, 60, 60000);
    const rlHeaders = rateLimitHeaders(rl, 60);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited" }, 429, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const staffId = typeof body.staff_id === "string" ? body.staff_id.trim() : "";
    const fromRaw = typeof body.from === "string" ? body.from.trim() : "";
    const toRaw = typeof body.to === "string" ? body.to.trim() : "";
    if (!staffId || !fromRaw || !toRaw) {
      return jsonResponse({ error: "missing_fields" }, 400, rlHeaders);
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
      return jsonResponse({ error: "invalid_window" }, 400, rlHeaders);
    }
    if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
      return jsonResponse({ error: "window_too_large" }, 400, rlHeaders);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Only reveal availability for an active staff member of a PUBLISHED site —
    // mirrors what's already public. Otherwise return empty (don't leak/enumerate).
    const { data: staff } = await serviceClient
      .from("booking_staff")
      .select("id, is_active, generated_sites!inner(status)")
      .eq("id", staffId)
      .maybeSingle();
    const siteStatus = (staff as { generated_sites?: { status?: string } } | null)?.generated_sites?.status;
    if (!staff || !(staff as { is_active?: boolean }).is_active || siteStatus !== "published") {
      return jsonResponse({ busy: [] }, 200, rlHeaders);
    }

    // Busy = non-cancelled bookings overlapping [from, to). Return ONLY the time
    // ranges — never customer_name / customer_phone / any other column.
    const { data: rows, error } = await serviceClient
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString());
    if (error) {
      console.error("[GET-AVAILABILITY] query failed:", error.message);
      return jsonResponse({ error: "query_failed" }, 500, rlHeaders);
    }

    const busy = (rows ?? []).map((r) => ({ starts_at: r.starts_at, ends_at: r.ends_at }));
    return jsonResponse({ busy }, 200, rlHeaders);
  } catch (error) {
    console.error("[GET-AVAILABILITY] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "server_error" }, 500);
  }
});
