import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// reset-test-barber — one-click reset of the SINGLE permanent test-barber fixture
// back to "newly added". HARD-LOCKED: every operation targets the two hardcoded
// constant IDs below and NOTHING else. The request's lead_id is validated to match
// the test lead and is otherwise ignored, so this can never reset a real barber.
//
// Requires a logged-in user (valid JWT). It only ever mutates the test fixture, so
// role isn't required — the hard ID lock is the real safety. verify_jwt = false
// (we verify the token ourselves so we can return a clean JSON error).

// ⚠️ These MUST match src/config/testBarber.ts and the seed SQL. Never change to a
// real record's id — that's the whole safety guarantee.
const TEST_BARBER_LEAD_ID = "7e57ba12-0000-4000-8000-000000000001";
const TEST_BARBER_SITE_ID = "7e57ba12-0000-4000-8000-000000000002";
const TEST_BARBER_SHARE_TOKEN = "test-barber-fixture";
const IMAGE_BUCKET = "barber-site-images";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Canonical site content — the SOURCE OF TRUTH for the test barber. Reset writes
// this back verbatim, clearing any colour/photo edits. The 4 gallery photos make
// the gallery editable so the 3-image cap is exercisable on the fixture itself.
const CANONICAL_CONTENT = {
  businessName: "TEST – Sharp & Co Barbers (DEMO · DO NOT CONTACT)",
  category: "Barber shop",
  tagline: "The safe-testing barbershop — not a real business.",
  heroHeadline: "Look sharp, feel sharp",
  about:
    "TEST FIXTURE. A fake barbershop used only to safely test the claim and editing flow. Not a real business — please do not contact this number or address.",
  phone: "+44 7700 900123", // Ofcom-reserved fictional-use UK mobile range
  address: "12 Test Street, Manchester, M1 1AA",
  googleRating: 4.8,
  reviewCount: 57,
  showExamplePrices: false,
  accentColor: "#E6A24B",
  services: [
    { name: "Skin Fade", price: "£22", durationMins: 40 },
    { name: "Beard Trim", price: "£12", durationMins: 20 },
    { name: "Cut & Beard", price: "£30", durationMins: 50 },
    { name: "Kids Cut", price: "£14", durationMins: 30 },
    { name: "Hot Towel Shave", price: "£20", durationMins: 30 },
  ],
  hours: [
    { day: "Monday", open: "9:00 – 18:00" },
    { day: "Tuesday", open: "9:00 – 18:00" },
    { day: "Wednesday", open: "9:00 – 18:00" },
    { day: "Thursday", open: "9:00 – 19:00" },
    { day: "Friday", open: "9:00 – 19:00" },
    { day: "Saturday", open: "8:30 – 16:00" },
    { day: "Sunday", open: "Closed" },
  ],
  stats: [
    { value: "2015", label: "Trading since" },
    { value: "4.8★", label: "57 reviews" },
  ],
  heroImageUrl: "https://picsum.photos/seed/testbarber-hero/1280/853",
  aboutImageUrl: "https://picsum.photos/seed/testbarber-about/1000/1250",
  galleryImageUrls: [
    "https://picsum.photos/seed/testbarber-g1/800/800",
    "https://picsum.photos/seed/testbarber-g2/800/800",
    "https://picsum.photos/seed/testbarber-g3/800/800",
    "https://picsum.photos/seed/testbarber-g4/800/800",
  ],
};

// Canonical lead fields restored on reset (identity + a freshly-added state).
const CANONICAL_LEAD = {
  business_name: CANONICAL_CONTENT.businessName,
  phone: CANONICAL_CONTENT.phone,
  address: CANONICAL_CONTENT.address,
  category: "Barber shop",
  country: "UK",
  list_type: "no_website",
  status: "not_contacted", // "New"
  next_action: null,
  next_action_date: null,
  is_archived: false,
  is_potential_work: false,
  contact_method: null,
  outreach_attempts: 0,
  last_outreach_attempt_at: null,
  notes: null,
  amount_paid: null,
  paid_for: null,
  payment_date: null,
  whatsapp_status: null,
  facebook_url: null,
  facebook_status: null,
  instagram_url: null,
  instagram_status: null,
  email_status: null,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1) Require a logged-in user (the destructive button lives in the admin app).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const callerId = userData.user.id;

    // 2) HARD LOCK: the request must name the test lead, and even then we only ever
    //    operate on the hardcoded constants below — never on the request value.
    const body = await req.json().catch(() => ({}));
    const requestedLeadId = typeof body.lead_id === "string" ? body.lead_id : "";
    // Opt-in: leave the fixture in a PAID + CLAIMED + PUBLISHED state (claimed to the
    // caller) for testing paid-only features (booking, custom subdomains). Default
    // (absent/false) keeps the historical clean "newly added" reset.
    const paidMode = body.paid === true;
    if (requestedLeadId !== TEST_BARBER_LEAD_ID) {
      return json({ ok: false, error: "refused: this endpoint only resets the test barber" }, 403);
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Targeted, NON-destructive flip of booking_only (service_role bypasses the
    // protected-fields lock). Keeps the row published + preserves staff/content/
    // owner — so booking can be tested end-to-end. Returns the end state.
    if (typeof body.set_booking_only === "boolean") {
      const { error: flipErr } = await service
        .from("generated_sites")
        .update({ booking_only: body.set_booking_only, status: "published" })
        .eq("id", TEST_BARBER_SITE_ID);
      if (flipErr) {
        console.error("[RESET-TEST-BARBER] booking_only flip failed:", flipErr.message);
        return json({ ok: false, error: "flip_failed" }, 500);
      }
      const { data: after } = await service
        .from("generated_sites")
        .select("site_name, owner_id, is_paid, status, subdomain, booking_only")
        .eq("id", TEST_BARBER_SITE_ID)
        .maybeSingle();
      return json({ ok: true, set_booking_only: after });
    }

    // 3) Wipe test child data scoped to the test SITE id only.
    // Staff hours hang off staff; delete them first, then staff, then the rest.
    const { data: staffRows } = await service
      .from("booking_staff")
      .select("id")
      .eq("site_id", TEST_BARBER_SITE_ID);
    const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);
    if (staffIds.length) {
      await service.from("staff_working_hours").delete().in("staff_id", staffIds);
    }
    await service.from("bookings").delete().eq("site_id", TEST_BARBER_SITE_ID);
    await service.from("booking_staff").delete().eq("site_id", TEST_BARBER_SITE_ID);
    await service.from("claim_tokens").delete().eq("site_id", TEST_BARBER_SITE_ID);

    // 4) Restore the site to canonical, unclaimed, untracked. Keep id / lead_id /
    //    site_name / template / share_token so the /s/ link is permanent.
    const { error: siteErr } = await service
      .from("generated_sites")
      .update({
        content: CANONICAL_CONTENT,
        owner_id: null,
        claimed_at: null,
        status: "draft",
        is_paid: false,
        subdomain: null,
        addon_interest_at: null,
        open_count: 0,
        first_opened_at: null,
        replied_at: null,
        sent_at: null,
        sent_message: null,
        sent_template: null,
        segment: null,
      })
      .eq("id", TEST_BARBER_SITE_ID);
    if (siteErr) {
      console.error("[RESET-TEST-BARBER] site update failed:", siteErr.message);
      return json({ ok: false, error: "site_reset_failed" }, 500);
    }

    // 5) Restore the lead to a freshly-added "New" state.
    const { error: leadErr } = await service
      .from("outreach_leads")
      .update(CANONICAL_LEAD)
      .eq("id", TEST_BARBER_LEAD_ID);
    if (leadErr) {
      console.error("[RESET-TEST-BARBER] lead update failed:", leadErr.message);
      return json({ ok: false, error: "lead_reset_failed" }, 500);
    }

    // 5b) Optional paid test state — claim the fixture to the CALLER, publish it, and
    //     mark it paid. service_role (this client) bypasses the protected-fields lock,
    //     so this is the proper path to flip is_paid for testing (the SQL editor has
    //     no JWT and is blocked by the lock). Subdomain stays null for a clean slate.
    let paidState: Record<string, unknown> | null = null;
    if (paidMode) {
      const { error: paidErr } = await service
        .from("generated_sites")
        .update({
          owner_id: callerId,
          claimed_at: new Date().toISOString(),
          status: "published",
          is_paid: true,
          subdomain: null,
        })
        .eq("id", TEST_BARBER_SITE_ID);
      if (paidErr) {
        console.error("[RESET-TEST-BARBER] paid setup failed:", paidErr.message);
        return json({ ok: false, error: "paid_setup_failed" }, 500);
      }
      const { data: after } = await service
        .from("generated_sites")
        .select("owner_id, is_paid, status, subdomain")
        .eq("id", TEST_BARBER_SITE_ID)
        .maybeSingle();
      paidState = (after as Record<string, unknown> | null) ?? null;
    }

    // 6) Best-effort: delete any photos uploaded into the test site's folder.
    try {
      const { data: files } = await service.storage.from(IMAGE_BUCKET).list(TEST_BARBER_SITE_ID);
      const paths = (files ?? []).map((f: { name: string }) => `${TEST_BARBER_SITE_ID}/${f.name}`);
      if (paths.length) await service.storage.from(IMAGE_BUCKET).remove(paths);
    } catch (e) {
      console.error("[RESET-TEST-BARBER] storage cleanup skipped:", (e as Error).message);
    }

    return json({
      ok: true,
      reset: {
        lead_id: TEST_BARBER_LEAD_ID,
        site_id: TEST_BARBER_SITE_ID,
        share_token: TEST_BARBER_SHARE_TOKEN,
        bookings_cleared: true,
        staff_cleared: staffIds.length,
      },
      paid: paidState,
    });
  } catch (e) {
    console.error("[RESET-TEST-BARBER] error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
