// send-reminders
//
// Scheduled (every 15 min via pg_cron → net.http_post) job that texts a 1-hour
// reminder to customers who opted in, for PAID barber sites only. Service-role;
// no SMS SDK — Twilio's REST API via raw fetch (same spirit as the Resend pattern).
//
// Auth: this endpoint is verify_jwt=false, so it manually requires the caller to
// present the service-role key as a Bearer token (pg_cron sends it). Nothing else
// can trigger it.
//
// WINDOW LOGIC (the careful bit):
//   We select bookings with starts_at in (now, now + 75 min]. The EXACTLY-ONCE
//   guarantee comes from reminder_sent_at, not the window: as soon as we send we
//   stamp reminder_sent_at, and the `reminder_sent_at IS NULL` filter excludes the
//   booking on every future run. The 75-minute upper bound combined with the
//   15-minute cadence means a normally-created booking first becomes eligible
//   60–75 min before it starts (the first run after it crosses the 75-min line),
//   so the text lands ~1 hour out. We deliberately use an OPEN lower bound (just
//   `> now()`) instead of a hard 60-min floor for two reasons:
//     • robustness to cron drift / a missed run — the booking stays eligible while
//       it's still <75 min out, so a late run still catches it (just slightly
//       closer to the appointment) rather than skipping it forever;
//     • a last-minute booking (created <60 min before) still gets its one reminder.
//   The `> now()` filter is also the retry guard: a booking whose send keeps
//   failing simply drops out of the query once it's in the past (≤5 attempts over
//   the 75-min window) — never an infinite retry.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WINDOW_MIN = 75;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Appointment time in Europe/London, e.g. "2:30 pm".
function fmtTimeLondon(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// Best-effort E.164 for Twilio. UK-centric: a leading 0 → +44; 00 → +; bare 44 →
// +44. Already-+ numbers pass through. If we can't make it valid, Twilio rejects
// it and the booking simply retries next run (then drops out once it's past).
function toE164(raw: string): string {
  const p = (raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+44" + p.slice(1);
  if (p.startsWith("44")) return "+" + p;
  return p;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Only the scheduler (which presents the service-role key) may trigger this.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const sender = Deno.env.get("TWILIO_SENDER");
  if (!accountSid || !twAuthToken || !sender) {
    console.error("[SEND-REMINDERS] Twilio secrets missing");
    return json({ error: "twilio_not_configured" }, 500);
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const maxIso = new Date(now.getTime() + WINDOW_MIN * 60000).toISOString();

  // Due reminders: confirmed, opted-in, not yet sent, PAID site, ~1h out.
  const { data: due, error } = await serviceClient
    .from("bookings")
    .select(
      "id, starts_at, customer_phone, booking_staff!inner(name), generated_sites!inner(site_name, content, is_paid)",
    )
    .eq("status", "confirmed")
    .eq("reminder_opt_in", true)
    .is("reminder_sent_at", null)
    .eq("generated_sites.is_paid", true)
    .gt("starts_at", nowIso)
    .lte("starts_at", maxIso);

  if (error) {
    console.error("[SEND-REMINDERS] query failed:", error.message);
    return json({ error: "query_failed", detail: error.message }, 500);
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = btoa(`${accountSid}:${twAuthToken}`);

  let sent = 0;
  let failed = 0;

  for (const b of (due ?? []) as Record<string, any>[]) {
    try {
      const gs = b.generated_sites || {};
      const content = (gs.content || {}) as Record<string, unknown>;
      const shop =
        (typeof content.businessName === "string" && content.businessName.trim()) || gs.site_name || "the shop";
      const staffName = b.booking_staff?.name || "your barber";
      const time = fmtTimeLondon(b.starts_at);
      const to = toE164(b.customer_phone);

      const bodyText =
        `You're booked at ${shop} today at ${time} with ${staffName}. ` +
        `Need to change it? Call the shop.`;

      const tw = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: sender, Body: bodyText }).toString(),
      });

      if (!tw.ok) {
        const errText = await tw.text().catch(() => "");
        console.error(`[SEND-REMINDERS] Twilio failed booking=${b.id} status=${tw.status} ${errText.slice(0, 200)}`);
        failed++;
        continue; // do NOT stamp → eligible to retry next run
      }

      // Success → stamp so it's never texted again.
      const { error: upErr } = await serviceClient
        .from("bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", b.id);
      if (upErr) {
        // Sent but couldn't stamp — log loudly (risk of a duplicate next run).
        console.error(`[SEND-REMINDERS] sent but stamp failed booking=${b.id}: ${upErr.message}`);
      }
      sent++;
    } catch (e) {
      console.error(`[SEND-REMINDERS] error booking=${b.id}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(JSON.stringify({
    fn: "send-reminders",
    due: (due ?? []).length,
    sent,
    failed,
    window_min: WINDOW_MIN,
    timestamp: nowIso,
  }));

  return json({ ok: true, due: (due ?? []).length, sent, failed }, 200);
});
