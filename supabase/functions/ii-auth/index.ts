import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { principal } = await req.json();

    if (!principal || typeof principal !== "string") {
      return new Response(JSON.stringify({ error: "principal required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const short = principal.replace(/-/g, "").substring(0, 16);
    const syntheticEmail = `ii-${short}@ii.leadfinder.app`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let foundUser;
    let page = 1;
    while (!foundUser) {
      const { data: batch } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (!batch?.users || batch.users.length === 0) break;
      foundUser = batch.users.find((u) => u.email?.toLowerCase() === syntheticEmail.toLowerCase());
      if (batch.users.length < 100) break;
      page++;
    }

    if (!foundUser) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          ii_principal: principal,
          auth_method: "internet_identity",
        },
      });
      if (createError || !newUser.user) {
        throw new Error(`Failed to create user: ${createError?.message}`);
      }
      foundUser = newUser.user;
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkError || !linkData) {
      throw new Error(`Failed to generate session: ${linkError?.message}`);
    }

    return new Response(
      JSON.stringify({
        userId: foundUser.id,
        email: syntheticEmail,
        principal,
        token_hash: linkData.properties?.hashed_token,
        type: "magiclink",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[II-AUTH] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
