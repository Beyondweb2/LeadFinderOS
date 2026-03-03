import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

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

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // =====================================================
    // PART 1: Abandoned checkout emails (existing logic)
    // =====================================================
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

    if (eligibleUsers) {
      for (let i = 0; i < Math.min(eligibleUsers.length, 5); i++) {
        sampleUserIds.push(eligibleUsers[i].user_id);
      }
    }

    logStep("Eligible users found", { count: eligibleCount, samples: sampleUserIds });

    if (eligibleUsers && eligibleUsers.length > 0) {
      for (const trial of eligibleUsers) {
        try {
          const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('status')
            .eq('user_id', trial.user_id)
            .in('status', ['active', 'trialing'])
            .limit(1)
            .maybeSingle();

          if (sub) {
            logStep("Skipping user with active subscription", { userId: trial.user_id });
            await supabaseAdmin
              .from('user_trials')
              .update({ lifecycle_stage: 99 })
              .eq('user_id', trial.user_id);
            continue;
          }

          const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(trial.user_id);
          if (userError || !userData?.user?.email) {
            logStep("Cannot get user email", { userId: trial.user_id });
            errors.push(`No email for ${trial.user_id}`);
            continue;
          }

          const email = userData.user.email;
          const firstName = email.split('@')[0].split(/[._-]/)[0];
          const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

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
    }

    // =====================================================
    // PART 2: "Paid but no account" reminder emails
    // Find checkout_attempts with stripe_subscription_id
    // but no matching auth user, created >1 hour ago,
    // and reminder_sent_at IS NULL
    // =====================================================
    logStep("Checking for paid-but-no-account users");

    const { data: paidNoAccount, error: paidError } = await supabaseAdmin
      .from('checkout_attempts')
      .select('id, email, stripe_customer_id, stripe_subscription_id, created_at')
      .not('stripe_subscription_id', 'is', null)
      .is('reminder_sent_at', null)
      .lt('created_at', oneHourAgo)
      .limit(20);

    if (paidError) {
      logStep("Error querying paid-no-account", { error: paidError.message });
      errors.push(`paid-no-account query: ${paidError.message}`);
    } else if (paidNoAccount && paidNoAccount.length > 0) {
      logStep("Paid-but-no-account candidates found", { count: paidNoAccount.length });

      // Get all auth users to check which emails already have accounts
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      const authEmails = new Set((authData?.users || []).map(u => (u.email || '').toLowerCase()));

      // Initialize Stripe to look up checkout sessions
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" }) : null;

      for (const attempt of paidNoAccount) {
        try {
          // Skip if user already created an account
          if (authEmails.has(attempt.email.toLowerCase())) {
            logStep("User already has account, marking reminder as sent", { email: attempt.email });
            await supabaseAdmin
              .from('checkout_attempts')
              .update({ reminder_sent_at: new Date().toISOString(), converted: true })
              .eq('id', attempt.id);
            continue;
          }

          // Look up the Stripe checkout session for this customer
          let setupLink = "https://leadfinderapp.lovable.app/landing";
          
          if (stripe && attempt.stripe_customer_id) {
            try {
              const sessions = await stripe.checkout.sessions.list({
                customer: attempt.stripe_customer_id,
                limit: 1,
              });
              if (sessions.data.length > 0 && sessions.data[0].status === 'complete') {
                setupLink = `https://leadfinderapp.lovable.app/complete-setup?session_id=${sessions.data[0].id}`;
              }
            } catch (stripeErr) {
              logStep("Stripe session lookup failed", { email: attempt.email, error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr) });
            }
          }

          const firstName = attempt.email.split('@')[0].split(/[._-]/)[0];
          const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

          const subject = "Your trial is active — just set your password";

          const htmlBody = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
<p>Hey ${displayName},</p>
<p>You successfully activated your free trial — but it looks like you didn't finish setting up your account.</p>
<p><strong>Your trial is already running</strong>, so the sooner you set your password and log in, the sooner you can start finding clients.</p>
<p>It takes 30 seconds:</p>
<p style="text-align: center; margin: 24px 0;">
  <a href="${setupLink}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Set up my account →</a>
</p>
<p>Once you're in, here's the game plan:</p>
<ol style="padding-left: 20px;">
<li>Search for businesses without websites near you</li>
<li>Message 10–20 per day via WhatsApp or SMS</li>
<li>Follow up — most replies come within 2–3 days</li>
</ol>
<p>Your trial is active for 5 days. Make the most of it!</p>
<p>If you need any help, just reply to this email.</p>
<p>– Paul<br/>LeadFinder</p>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
<p style="font-size: 12px; color: #6b7280;">LeadFinder · <a href="https://leadfinderapp.lovable.app" style="color: #6b7280;">leadfinderapp.lovable.app</a><br/>You're receiving this because you started a trial on LeadFinder.<br/>If you don't want reminders, just reply and let me know.</p>
</div>`;

          const textBody = `Hey ${displayName},

You successfully activated your free trial — but it looks like you didn't finish setting up your account.

Your trial is already running, so the sooner you set your password and log in, the sooner you can start finding clients.

Set up your account here: ${setupLink}

Once you're in, here's the game plan:
1. Search for businesses without websites near you
2. Message 10–20 per day via WhatsApp or SMS
3. Follow up — most replies come within 2–3 days

Your trial is active for 5 days. Make the most of it!

If you need any help, just reply to this email.

– Paul
LeadFinder

---
LeadFinder · leadfinderapp.lovable.app
You're receiving this because you started a trial on LeadFinder.
If you don't want reminders, just reply and let me know.`;

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Paul from LeadFinder <paul@lead-finder-app.com>",
              to: [attempt.email],
              subject,
              html: htmlBody,
              text: textBody,
            }),
          });

          if (!emailRes.ok) {
            const errBody = await emailRes.text();
            logStep("Resend error for paid-no-account", { email: attempt.email, status: emailRes.status, body: errBody });
            errors.push(`Resend error for ${attempt.email}: ${emailRes.status} ${errBody}`);
            continue;
          }

          // Mark reminder as sent
          await supabaseAdmin
            .from('checkout_attempts')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', attempt.id);

          sentCount++;
          logStep("Paid-no-account reminder sent", { email: attempt.email, setupLink });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logStep("Error processing paid-no-account", { email: attempt.email, error: errMsg });
          errors.push(`paid-no-account error for ${attempt.email}: ${errMsg}`);
        }
      }
    } else {
      logStep("No paid-but-no-account users to remind");
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
