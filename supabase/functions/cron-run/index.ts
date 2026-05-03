import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` — ${JSON.stringify(details)}` : "";
  console.log(`[CRON-RUN] ${step}${d}`);
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
}

// ── Task implementations (lightweight, <2s each) ──────────────────────

async function checkFailedPayments(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  logStep("Task:checkFailedPayments — start");

  // Placeholder: query subscriptions with past_due / unpaid status
  // When ready, add Stripe API call here with timeout
  const { count, error } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .in("status", ["past_due", "unpaid"]);

  if (error) {
    logStep("Task:checkFailedPayments — DB error", { error: error.message });
  } else {
    logStep("Task:checkFailedPayments — done", { failedCount: count, ms: Date.now() - start });
  }
}

async function cleanupExpiredCaches(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  logStep("Task:cleanupExpiredCaches — start");

  try {
    // Clean expired geocode cache entries (90-day TTL)
    const { error: geoErr } = await supabase
      .from("geocode_cache")
      .delete()
      .lt("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    if (geoErr) logStep("geocode_cache cleanup error", { error: geoErr.message });

    // Clean expired search cache (72h TTL)
    const { error: searchErr } = await supabase
      .from("search_cache")
      .delete()
      .lt("created_at", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

    if (searchErr) logStep("search_cache cleanup error", { error: searchErr.message });

    logStep("Task:cleanupExpiredCaches — done", { ms: Date.now() - start });
  } catch (err) {
    logStep("Task:cleanupExpiredCaches — exception", { error: String(err) });
  }
}

async function logDailySummary(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  logStep("Task:logDailySummary — start");

  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from("api_usage_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString());

    if (error) {
      logStep("Task:logDailySummary — DB error", { error: error.message });
    } else {
      logStep("Task:logDailySummary — done", { apiCallsToday: count, ms: Date.now() - start });
    }
  } catch (err) {
    logStep("Task:logDailySummary — exception", { error: String(err) });
  }
}

// ── Auth check: accepts x-cron-secret header OR service-role key in Authorization ──

function isAuthorized(req: Request): boolean {
  // Method 1: CRON_SECRET via header
  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret === cronSecret) {
    logStep("Auth: matched x-cron-secret header");
    return true;
  }

  // Method 2: Service role key in Authorization header (used by pg_cron internal calls)
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization");
  if (serviceRoleKey && authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token === serviceRoleKey) {
      logStep("Auth: matched service role key");
      return true;
    }
  }

  logStep("WARNING: No valid auth method matched");
  return false;
}

// ── Main handler ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runStart = Date.now();
  logStep("Invoked", { method: req.method, url: req.url });

  try {
    if (!isAuthorized(req)) {
      logStep("Unauthorized — missing or invalid secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated — running tasks");

    const supabase = getSupabaseAdmin();
    const results: Record<string, string> = {};

    // Run each task with individual error isolation
    for (const [name, fn] of [
      ["checkFailedPayments", () => checkFailedPayments(supabase)],
      ["cleanupExpiredCaches", () => cleanupExpiredCaches(supabase)],
      ["logDailySummary", () => logDailySummary(supabase)],
    ] as const) {
      try {
        await (fn as () => Promise<void>)();
        results[name] = "ok";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logStep(`Task ${name} failed`, { error: msg });
        results[name] = `error: ${msg}`;
      }
    }

    const totalMs = Date.now() - runStart;
    logStep("All tasks completed", { totalMs, results });

    return new Response(
      JSON.stringify({ success: true, duration_ms: totalMs, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logStep("FATAL ERROR", { message: msg, stack });
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
