import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ENSURE-TRIAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Check if trial record exists
    const { data: existingTrial, error: checkError } = await supabaseClient
      .from('user_trials')
      .select('id, plan_status, trial_end_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (checkError) {
      logStep("Error checking trial", { error: checkError.message });
      throw new Error(`Failed to check trial: ${checkError.message}`);
    }

    if (existingTrial) {
      logStep("Trial record already exists", { trialId: existingTrial.id, status: existingTrial.plan_status });
      return new Response(JSON.stringify({ 
        created: false, 
        trial: existingTrial 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Create trial record for user
    const trialDays = 3;
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const { data: newTrial, error: insertError } = await supabaseClient
      .from('user_trials')
      .insert({
        user_id: user.id,
        trial_started_at: now.toISOString(),
        trial_days: trialDays,
        searches_used: 0,
        plan_status: 'trial',
        trial_end_date: trialEndDate.toISOString(),
        searches_today: 0,
        last_search_date: now.toISOString().split('T')[0],
      })
      .select()
      .single();

    if (insertError) {
      logStep("Error creating trial", { error: insertError.message });
      throw new Error(`Failed to create trial: ${insertError.message}`);
    }

    logStep("Trial record created successfully", { trialId: newTrial.id });

    return new Response(JSON.stringify({ 
      created: true, 
      trial: newTrial 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    // Log detailed error server-side only
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Return generic error to client
    return new Response(JSON.stringify({ error: "Unable to set up your account. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
