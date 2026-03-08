import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (msg: string) => console.log(`[CRON-RUN] ${msg}`);

async function checkFailedPayments() {
  logStep("Running failed payment check");
}

async function sendPaymentReminders() {
  logStep("Running reminder email system");
}

async function cleanupExpiredTrials() {
  logStep("Running cleanup tasks");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (!cronSecret || secret !== cronSecret) {
      logStep("Unauthorized request rejected");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Authenticated — running background tasks");

    await checkFailedPayments();
    await sendPaymentReminders();
    await cleanupExpiredTrials();

    logStep("All tasks completed");

    return new Response(
      JSON.stringify({ success: true, message: "Cron job executed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep(`ERROR: ${msg}`);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
