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

  try {
    // Auth check — only allow the admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify caller is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { email } = await req.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY is not set");

    const firstName = email.split("@")[0].split(/[._-]/)[0];
    const capitalizedName =
      firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

    // Subject line rotation (same as lifecycle-emails)
    const subjects = [
      "Still looking for clients?",
      "10–20 businesses per day",
      "You were close",
      "Want more web clients this week?",
      "Quick question about your trial",
    ];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    const displayName = capitalizedName || "there";

    const htmlBody = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto;">
<p>Hey ${displayName},</p>
<p>You were about to activate your trial but didn't finish.</p>
<p>If you're trying to land more web projects, here's the simple strategy most freelancers miss:</p>
<p><strong>Contact 10–20 businesses per day.</strong></p>
<p>Not 3. Not 5.<br/>10–20.</p>
<p>That's where momentum starts.</p>
<p>LeadFinder makes that easy by showing businesses without websites that you can contact immediately.</p>
<p>Most users start seeing replies within days once they stay consistent.</p>
<p>If something stopped you from activating, just reply and tell me what it was.</p>
<p>Or jump back in here:</p>
<p>👉 <a href="https://lead-finder-app.com/" style="color: #2563eb;">https://lead-finder-app.com/</a></p>
<p>– Paul<br/>LeadFinder</p>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
<p style="font-size: 12px; color: #6b7280;">LeadFinder · <a href="https://lead-finder-app.com/" style="color: #6b7280;">https://lead-finder-app.com</a><br/>You're receiving this email because you started activating a trial on LeadFinder.<br/>If you don't want reminders, reply and let me know.</p>
</div>`;

    const textBody = `Hey ${displayName},

You were about to activate your trial but didn't finish.

If you're trying to land more web projects, here's the simple strategy most freelancers miss:

Contact 10–20 businesses per day.

Not 3. Not 5.
10–20.

That's where momentum starts.

LeadFinder makes that easy by showing businesses without websites that you can contact immediately.

Most users start seeing replies within days once they stay consistent.

If something stopped you from activating, just reply and tell me what it was.

Or jump back in here:
https://lead-finder-app.com/

– Paul
LeadFinder

---
LeadFinder · https://lead-finder-app.com
You're receiving this email because you started activating a trial on LeadFinder.
If you don't want reminders, reply and let me know.`;

    // Send the same template — NO user data modification
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
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

    const resBody = await emailRes.text();

    if (!emailRes.ok) {
      return new Response(
        JSON.stringify({ error: "Resend error", status: emailRes.status, body: resBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `Test email sent to ${email}`, resend: JSON.parse(resBody) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
