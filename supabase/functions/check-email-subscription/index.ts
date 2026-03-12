import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Uniform response shape — always returns the same structure regardless of outcome
function uniformResponse(exists: boolean, hasActiveSubscription: boolean) {
  return new Response(
    JSON.stringify({ exists, hasActiveSubscription }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      // Return generic "not found" instead of exposing validation errors
      return uniformResponse(false, false);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit by IP to prevent bulk enumeration (5 requests per 60s per IP)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("cf-connecting-ip") 
      || "unknown";
    const rateCheck = checkRateLimit(`check-email:${ip}`, 5, 60_000);
    if (!rateCheck.allowed) {
      // Return generic response instead of 429 to avoid leaking rate-limit info
      return uniformResponse(false, false);
    }

    console.log('[CHECK-EMAIL-SUBSCRIPTION] Checking email (redacted)');

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Direct lookup by email — no pagination needed
    const { data: usersData, error: usersError } = await supabaseClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      filter: normalizedEmail,
    });

    if (usersError) throw usersError;

    const existingUser = usersData?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);

    if (!existingUser) {
      return uniformResponse(false, false);
    }

    // Check if they have an active subscription
    const { data: sub } = await supabaseClient
      .from("subscriptions")
      .select("status")
      .eq("user_id", existingUser.id)
      .in("status", ["trialing", "active", "past_due"])
      .limit(1)
      .maybeSingle();

    return uniformResponse(true, !!sub);
  } catch (error) {
    // Return generic response on errors to prevent information leakage
    console.error('[CHECK-EMAIL-SUBSCRIPTION] Error:', error instanceof Error ? error.message : String(error));
    return uniformResponse(false, false);
  }
});
