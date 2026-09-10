import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMockupRow, fillMockupFromSite } from "../_shared/mockup-trigger.ts";
import { nicheByKey } from "../../../src/lib/mockupNiche.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   mockup — the operator's door to one prospect's mockup.

   Step 2 ships two actions; the picker (Step 3) adds the rest on the same seam:
     · prepare — create the draft row and read their website. Idempotent: an existing row is
                 returned rather than duplicated. This is also what makes the reply trigger
                 verifiable, since a webhook cannot be safely fired by hand.
     · get     — read one mockup back, for the picker and for the preview.

   ⛔ SAME CODE AS THE REPLY TRIGGER, NOT A SECOND COPY. Both actions call the shared
   _shared/mockup-trigger.ts. A hand-run "prepare" that behaved differently from the automatic one
   would make every manual test worthless — that is the duplicate-guard drift CLAUDE.md records
   four incidents of, applied to a test path.

   ⚠️ ONE DELIBERATE DIFFERENCE, AND IT IS ABOUT LATENCY ONLY: here the scrape is AWAITED. The
   webhook hands it to waitUntil because Meta retries a slow webhook; an operator pressing a button
   wants the answer. Same function, same result, different waiting.

   ⛔ NOTHING HERE PUBLISHES OR SENDS. Rows are `draft` — Step 1 proved anon cannot read those —
   and there is no code path to `published` in this function. The before/after image is sent by
   hand as a second WhatsApp message.

   Auth: admin JWT only (the pattern review-reply / page-generator use). verify_jwt is false in
   config.toml because the check happens in-handler, and the entry is added in the SAME commit —
   a function absent from config.toml deploys with the platform default verify_jwt = true and only
   internal callers die, silently, weeks later (CLAUDE.md §8).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const token = authHeader.slice(7);

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);

    /* Admin only. The mockup carries a prospect's scraped content and their competitors'
       context; it is operator material, not per-user data. */
    const { data: roleRow } = await service
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    /* ── prepare ──────────────────────────────────────────────────────────────────────── */
    if (action === "prepare") {
      const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
      if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);

      const outcome = await createMockupRow(service, leadId);

      /* An existing row is not a failure — it is the idempotency guard doing its job. Return it
         with its content so the caller can act, and say plainly that nothing new was created. */
      if (!outcome.started) {
        if (outcome.reason === "already_exists" && outcome.detail) {
          const { data: row } = await service
            .from("generated_sites")
            .select("id, lead_id, template, status, content, created_at, updated_at")
            .eq("id", outcome.detail).maybeSingle();
          return json({ ok: true, created: false, reason: "already_exists", mockup: row ?? null });
        }
        return json({ ok: false, created: false, reason: outcome.reason, detail: outcome.detail ?? null });
      }

      // Awaited here, unlike the webhook — see the header.
      const fill = await fillMockupFromSite(
        service,
        outcome.siteId,
        {
          website: outcome.website,
          businessName: outcome.businessName,
          niche: outcome.niche,
          leadId,
          ownerId: outcome.ownerId,
        },
        { supabaseUrl, auth: { kind: "operator", jwt: token } },
      );

      const { data: row } = await service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at")
        .eq("id", outcome.siteId).maybeSingle();

      return json({
        ok: true,
        created: true,
        mockup: row ?? null,
        niche: outcome.niche,
        niche_label: nicheByKey(outcome.niche)?.label ?? null,
        scrape: { ok: fill.ok, detail: fill.detail },
      });
    }

    /* ── get ──────────────────────────────────────────────────────────────────────────── */
    if (action === "get") {
      const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!leadId && !siteId) return json({ ok: false, error: "lead_id or id required" }, 400);

      let q = service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at");
      q = siteId ? q.eq("id", siteId) : q.eq("lead_id", leadId);
      const { data: row, error } = await q.limit(1).maybeSingle();
      if (error) return json({ ok: false, error: "read_failed", detail: error.message }, 500);

      /* ⛔ null IS A REAL ANSWER AND SAYS SO. "no mockup for this lead" and "the read failed"
         must never look the same to the picker — the RLS-returns-200-with-[] trap that has cost
         this codebase three features (CLAUDE.md §8). */
      return json({ ok: true, found: !!row, mockup: row ?? null });
    }

    /* ── refill: re-read their website into an existing mockup ────────────────────────── */
    if (action === "refill") {
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!siteId) return json({ ok: false, error: "id required" }, 400);
      const { data: row } = await service
        .from("generated_sites").select("id, lead_id, template, content").eq("id", siteId).maybeSingle();
      if (!row) return json({ ok: false, error: "not_found" }, 404);
      const content = (row.content ?? {}) as Record<string, unknown>;
      const website = typeof content.current_site_url === "string" ? content.current_site_url : "";
      const business = (content.business ?? {}) as Record<string, unknown>;
      if (!website) return json({ ok: false, error: "no_website_on_row" }, 400);

      const fill = await fillMockupFromSite(
        service,
        siteId,
        {
          website,
          businessName: String(business.name ?? ""),
          niche: String(row.template ?? ""),
          leadId: String(row.lead_id ?? ""),
          /* refill runs as the operator, so the cost cap keys on the operator. */
          ownerId: u.user.id,
        },
        { supabaseUrl, auth: { kind: "operator", jwt: token } },
      );
      const { data: after } = await service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at")
        .eq("id", siteId).maybeSingle();
      return json({ ok: fill.ok, detail: fill.detail, mockup: after ?? null });
    }

    return json({ ok: false, error: "unknown_action", detail: action.slice(0, 40) }, 400);
  } catch (e) {
    console.error("[mockup]", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
