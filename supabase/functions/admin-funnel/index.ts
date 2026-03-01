import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // Parse body for action
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body = default action */ }
    const action = (body.action as string) || "funnel_stats";

    // ===================== FUNNEL STATS (original) =====================
    if (action === "funnel_stats") {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const eventTypes = ["demo_started", "trial_started", "subscription_active"];
      const results: Record<string, { last7: number; allTime: number }> = {};

      for (const et of eventTypes) {
        const { count: allTime } = await supabase
          .from("funnel_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", et);

        const { count: last7 } = await supabase
          .from("funnel_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", et)
          .gte("created_at", sevenDaysAgo);

        results[et] = { last7: last7 ?? 0, allTime: allTime ?? 0 };
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ===================== WALKTHROUGH STATS =====================
    if (action === "walkthrough_stats") {
      const TOTAL_STEPS = 8;

      // Step-by-step counts from funnel_events
      const stepCounts: number[] = [];
      for (let s = 1; s <= TOTAL_STEPS; s++) {
        // Count distinct users who viewed this step
        const { data: rows } = await supabase
          .from("funnel_events")
          .select("user_id")
          .eq("event_type", "walkthrough_step_view")
          .contains("meta", { step: s });
        
        // Dedupe by user_id
        const uniqueUsers = new Set((rows || []).map((r: any) => r.user_id));
        stepCounts.push(uniqueUsers.size);
      }

      // Total started (saw step 1)
      const totalStarted = stepCounts[0] || 0;

      // Total completed
      const { data: completedRows } = await supabase
        .from("funnel_events")
        .select("user_id")
        .eq("event_type", "walkthrough_complete");
      const completedUsers = new Set((completedRows || []).map((r: any) => r.user_id));
      const totalCompleted = completedUsers.size;

      const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

      // Top dropoff step
      let topDropoffStep = 1;
      let maxDrop = 0;
      for (let i = 0; i < stepCounts.length - 1; i++) {
        const drop = stepCounts[i] - stepCounts[i + 1];
        if (drop > maxDrop) {
          maxDrop = drop;
          topDropoffStep = i + 1;
        }
      }

      // Latest 100 users with walkthrough data from user_metrics
      const { data: userRows } = await supabase
        .from("user_metrics")
        .select("user_id, walkthrough_max_step, walkthrough_completed, walkthrough_last_seen_at")
        .gt("walkthrough_max_step", 0)
        .order("walkthrough_last_seen_at", { ascending: false })
        .limit(100);

      // Get emails for these users
      const userIds = (userRows || []).map((r: any) => r.user_id);
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        // Fetch from auth in batches
        const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 200 });
        if (authData?.users) {
          for (const u of authData.users) {
            if (userIds.includes(u.id)) {
              emailMap[u.id] = u.email || u.id;
            }
          }
        }
      }

      const userTable = (userRows || []).map((r: any) => ({
        user_id: r.user_id,
        email: emailMap[r.user_id] || r.user_id,
        max_step: r.walkthrough_max_step,
        completed: r.walkthrough_completed,
        last_seen_at: r.walkthrough_last_seen_at,
      }));

      return new Response(JSON.stringify({
        totalStarted,
        totalCompleted,
        completionRate,
        stepCounts,
        topDropoffStep,
        maxDrop,
        userTable,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ADMIN-FUNNEL] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
    });
  }
});
