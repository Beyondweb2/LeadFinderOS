import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[LIFECYCLE-EMAILS] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Job-run tracking variables
  let checkedCount = 0;
  let eligibleCount = 0;
  let sentCount = 0;
  const errors: string[] = [];
  const sampleUserIds: string[] = [];

  try {
    logStep("Function started");

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find users eligible for abandoned checkout email (stage 0 → 1)
    // Conditions:
    //   checkout_started_at IS NOT NULL
    //   plan_status = 'free' (no active subscription)
    //   lifecycle_stage = 0
    //   checkout_started_at < now() - 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: eligibleUsers, error: queryError } = await supabaseAdmin
      .from('user_trials')
      .select('user_id, checkout_started_at')
      .not('checkout_started_at', 'is', null)
      .eq('lifecycle_stage', 0)
      .eq('plan_status', 'free')
      .lt('checkout_started_at', oneHourAgo)
      .limit(50);

    if (queryError) {
      logStep("Query error", { error: queryError.message });
      throw new Error(queryError.message);
    }

    checkedCount = eligibleUsers?.length ?? 0;
    eligibleCount = checkedCount;

    // Collect sample user IDs (up to 5)
    if (eligibleUsers) {
      for (let i = 0; i < Math.min(eligibleUsers.length, 5); i++) {
        sampleUserIds.push(eligibleUsers[i].user_id);
      }
    }

    logStep("Eligible users found", { count: eligibleCount, samples: sampleUserIds });

    if (!eligibleUsers || eligibleUsers.length === 0) {
      // Log job run even when no users found
      await supabaseAdmin.from('email_job_runs').insert({
        checked_count: checkedCount,
        eligible_count: eligibleCount,
        sent_count: 0,
        errors: errors.length > 0 ? errors.join('\n') : null,
        sample_user_ids: sampleUserIds,
      });

      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    for (const trial of eligibleUsers) {
      try {
        // Double-check: ensure user doesn't have an active subscription
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('status')
          .eq('user_id', trial.user_id)
          .in('status', ['active', 'trialing'])
          .limit(1)
          .maybeSingle();

        if (sub) {
          logStep("Skipping user with active subscription", { userId: trial.user_id });
          // Mark as protected
          await supabaseAdmin
            .from('user_trials')
            .update({ lifecycle_stage: 99 })
            .eq('user_id', trial.user_id);
          continue;
        }

        // Get user email
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(trial.user_id);
        if (userError || !userData?.user?.email) {
          logStep("Cannot get user email", { userId: trial.user_id });
          errors.push(`No email for ${trial.user_id}`);
          continue;
        }

        const email = userData.user.email;
        const firstName = email.split('@')[0].split(/[._-]/)[0];
        const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

        // Subject line rotation
        const subjects = [
          "5 days free — no charge today",
          "You won't pay a thing for 5 days",
          "Your free trial is waiting",
          "Potentially free clients — here's how",
          "£0 today, cancel anytime",
        ];
        const subject = subjects[Math.floor(Math.random() * subjects.length)];

        const displayName = capitalizedName || "there";

        const htmlBody = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
<p>Hey ${displayName},</p>
<p>You started activating your free trial but didn't finish — just wanted to make sure you knew:</p>
<p><strong>You won't be charged for 5 days.</strong></p>
<p>That means you can use LeadFinder fully — search for businesses, contact them, land clients — and if you decide it's not for you, cancel before the 5 days are up. You'll pay nothing.</p>
<p>But here's the thing most people don't realise:</p>
<p>If you land even <strong>one client</strong> during your trial and then cancel, that client is yours to keep. That's potentially free work just from trying.</p>
<p>The strategy is simple:</p>
<ul style="padding-left: 20px;">
<li>Search for businesses without websites in your area</li>
<li>Contact 10–20 per day</li>
<li>Follow up consistently</li>
</ul>
<p>Most users start getting replies within days.</p>
<p>There's genuinely nothing to lose. Give it a go, and cancel anytime if it's not for you.</p>
<p>👉 <a href="https://lead-finder-app.com/" style="color: #2563eb;">Finish activating your free trial</a></p>
<p>If something stopped you, just reply and let me know.</p>
<p>– Paul<br/>LeadFinder</p>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
<p style="font-size: 12px; color: #6b7280;">LeadFinder · <a href="https://lead-finder-app.com/" style="color: #6b7280;">https://lead-finder-app.com</a><br/>You're receiving this email because you started a free trial on LeadFinder.<br/>If you don't want reminders, reply and let me know.</p>
</div>`;

        const textBody = `Hey ${displayName},

You started activating your free trial but didn't finish — just wanted to make sure you knew:

You won't be charged for 5 days.

That means you can use LeadFinder fully — search for businesses, contact them, land clients — and if you decide it's not for you, cancel before the 5 days are up. You'll pay nothing.

But here's the thing most people don't realise:

If you land even one client during your trial and then cancel, that client is yours to keep. That's potentially free work just from trying.

The strategy is simple:
- Search for businesses without websites in your area
- Contact 10–20 per day
- Follow up consistently

Most users start getting replies within days.

There's genuinely nothing to lose. Give it a go, and cancel anytime if it's not for you.

Finish activating your free trial: https://lead-finder-app.com/

If something stopped you, just reply and let me know.

– Paul
LeadFinder

---
LeadFinder · https://lead-finder-app.com
You're receiving this email because you started a free trial on LeadFinder.
If you don't want reminders, reply and let me know.`;

        // Send email via Resend
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Paul from LeadFinder <paul@lead-finder-app.com>",
            to: [email],
            subject,
            html: htmlBody,
            text: textBody,
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          logStep("Resend API error", { userId: trial.user_id, status: emailRes.status, body: errBody });
          errors.push(`Resend error for ${trial.user_id}: ${emailRes.status} ${errBody}`);
          continue;
        }

        // Update lifecycle stage
        await supabaseAdmin
          .from('user_trials')
          .update({
            lifecycle_stage: 1,
            last_lifecycle_email_sent_at: new Date().toISOString(),
          })
          .eq('user_id', trial.user_id);

        sentCount++;
        logStep("Email sent", { userId: trial.user_id, email });
      } catch (userErr) {
        const errMsg = userErr instanceof Error ? userErr.message : String(userErr);
        logStep("Error processing user", { userId: trial.user_id, error: errMsg });
        errors.push(`Error for ${trial.user_id}: ${errMsg}`);
      }
    }

    logStep("Completed", { sent: sentCount });

    // Log job run
    await supabaseAdmin.from('email_job_runs').insert({
      checked_count: checkedCount,
      eligible_count: eligibleCount,
      sent_count: sentCount,
      errors: errors.length > 0 ? errors.join('\n') : null,
      sample_user_ids: sampleUserIds,
    });

    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    errors.push(msg);

    // Attempt to log even on top-level failure
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
      await supabaseAdmin.from('email_job_runs').insert({
        checked_count: checkedCount,
        eligible_count: eligibleCount,
        sent_count: sentCount,
        errors: errors.join('\n'),
        sample_user_ids: sampleUserIds,
      });
    } catch { /* best effort */ }

    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
