import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      throw new Error("Missing email");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Check if a user with this email exists
    const { data: users } = await supabaseClient.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });

    const existingUser = users?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (!existingUser) {
      return new Response(JSON.stringify({ exists: false, hasActiveSubscription: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if they have an active subscription
    const { data: sub } = await supabaseClient
      .from("subscriptions")
      .select("status")
      .eq("user_id", existingUser.id)
      .in("status", ["trialing", "active", "past_due"])
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        exists: true,
        hasActiveSubscription: !!sub,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
