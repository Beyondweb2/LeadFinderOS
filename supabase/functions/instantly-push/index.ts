// instantly-push — operator-initiated push of selected Outreach leads into an
// Instantly.ai campaign (Instantly V2 API, Bearer auth).
//
//   mode 'list_campaigns' → GET /api/v2/campaigns (for the picker dropdown)
//   mode 'push'           → POST /api/v2/leads/add (batch ≤1000), then flips the
//                           pushed leads to contact_method='email', status='email_sent',
//                           stamps instantly_pushed_at + instantly_campaign_id.
//
// Auth: the CALLER's JWT (verify_jwt=false; we resolve the user in-handler and only
// ever touch outreach_leads rows owned by that user). The Instantly key is read from
// the INSTANTLY_API_KEY secret — never hardcoded, never sent to the client.
//
// ⚠️ V2 SHAPES TO VERIFY against the live API (flagged for the first real test):
//   * GET  /campaigns        → response items array + {id,name} field names
//   * POST /leads/add        → body field names (campaign_id vs campaign; leads[]),
//                              and the custom_variables object shape.
// If these differ, only the marked spots below change — the flow is unaffected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";
import { checkSuppressed } from "../_shared/suppression.ts";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const MAX_BATCH = 1000;

/* ══ THE INTERNAL CALLER, AND WHY THIS GATE IS SHAPED THE WAY IT IS ═══════════════════════════════
   This function SENDS EMAIL. Every other internal branch in the codebase is a spend risk; a wrong
   auth path here reaches real people, so the gate is deliberately narrower than the others'.

   ⛔ ONE CREDENTIAL, AND IT IS NOT THE SERVICE KEY. bulk-jobs' own isInternal accepts EITHER a
   matching CRON_SECRET OR (service key + x-internal-job). This one accepts ONLY the first arm. The
   reason is a real difference in blast radius: the service key is handed to browsers' edge calls
   nowhere, but it IS fetchable by anyone who can read the vault or a CI log, and it is a key whose
   job is database access — it should not also be a licence to email 1,000 prospects. CRON_SECRET is
   a function secret with exactly one purpose, and it is the narrower thing to require.

   ⛔ FAILS CLOSED IN EVERY DIRECTION:
     * CRON_SECRET unset in the environment -> internal is impossible, not open. The length check on
       a non-empty secret is what makes an empty-vs-empty comparison unreachable.
     * header absent, wrong, or the right value without x-internal-job -> not internal -> the request
       falls through to getClaims and is judged as an ordinary user, which for a machine caller means
       401. There is no path where a failed internal check becomes a successful anything.
     * acting_user_id is read ONLY inside the internal branch. On the user path it is ignored
       entirely, so a caller with a stolen JWT cannot name someone else as the actor.
     * the internal branch is owner-scoped with NO admin escalation. bulk-jobs already filters a job
       to leads the creator owns, so scoping down costs the flow nothing and removes the one way an
       internal call could touch another tenant's rows.

   ⚠️ AND IT CHANGES NOTHING ABOUT WHO GETS EMAILED. Suppression, the completed-audit requirement,
   the already-pushed stamp and the has-an-email test all run AFTER auth and are identical on both
   paths. Auth decides WHOSE leads may be read; it has never decided who is safe to contact, and
   this change keeps that separation. */
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/** Constant-time string compare. bulk-jobs uses `===` and that is fine for a spend gate; for the
 *  function that sends email it is worth not leaking the secret one byte at a time through response
 *  timing. Length is compared first and non-secretly — a wrong LENGTH is not worth hiding. */
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  /* x-cron-secret and x-internal-job are listed so the preflight does not reject them. That is a
     BROWSER convenience only — CORS is not a security boundary, and the secret is what gates the
     branch. Listing them does not make the header available to anyone who lacks the value. */
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
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
    const apiKey = Deno.env.get("INSTANTLY_API_KEY") ?? "";
    if (!apiKey) return json({ success: false, error: "INSTANTLY_API_KEY not configured" }, 503);

    // --- Auth: resolve the caller (so we only push their own leads) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
    const token = authHeader.slice(7);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    /* The body is read BEFORE auth now, because the internal branch takes its actor from it. That is
       safe — nothing in the body is trusted until the branch that reads it has already proved the
       caller holds CRON_SECRET. */
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "push" ? "push" : body.mode === "auth_probe" ? "auth_probe" : "list_campaigns";

    /* ── THE INTERNAL GATE ─────────────────────────────────────────────────────────────────────
       Three conditions, all required. See the block comment at the top of the file for why this is
       narrower than every other internal branch in the codebase. */
    const isInternal =
      CRON_SECRET.length > 0 &&
      secretEquals(req.headers.get("x-cron-secret") ?? "", CRON_SECRET) &&
      req.headers.get("x-internal-job") === "1";

    let userId: string;
    let authPath: "internal" | "user";
    if (isInternal) {
      /* ⛔ acting_user_id IS READ ONLY HERE. On the user path below it is never consulted, so it
         cannot be used to impersonate. Validated as a UUID and then confirmed to be a REAL user —
         defence in depth, because a nonexistent actor would otherwise scope the lead query to
         nothing and report "no owned leads" rather than "your caller is wrong". */
      const acting = typeof body.acting_user_id === "string" ? body.acting_user_id.trim() : "";
      if (!UUID_RE.test(acting)) {
        return json({ success: false, error: "internal call requires a valid acting_user_id" }, 401);
      }
      const { data: actor, error: aErr } = await service.auth.admin.getUserById(acting);
      if (aErr || !actor?.user?.id) {
        return json({ success: false, error: "internal call named a user that does not exist" }, 401);
      }
      userId = actor.user.id;
      authPath = "internal";
    } else {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
      if (cErr || !claims?.claims?.sub) return json({ success: false, error: "Unauthorized" }, 401);
      userId = claims.claims.sub as string;
      authPath = "user";
    }

    /* ⚠️ A NO-SIDE-EFFECT ORACLE FOR THE AUTH PATH, and it exists because there was no other honest
       way to PROVE this gate. Every real mode either sends email or calls a paid API, so testing the
       internal branch by exercising it would mean emailing someone to find out whether the auth was
       right. auth_probe reaches no Instantly endpoint, reads no lead and writes nothing: it reports
       only which branch admitted the caller. Refusing still 401s above, so a wrong secret learns
       exactly as much from this mode as from any other. */
    if (mode === "auth_probe") {
      return json({ success: true, mode: "auth_probe", path: authPath, userId });
    }

    const instantly = (path: string, init?: RequestInit) =>
      fetch(`${INSTANTLY_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
      });

    // ── list_campaigns ───────────────────────────────────────────────────────
    if (mode === "list_campaigns") {
      const res = await instantly(`/campaigns?limit=100`); // ⚠️ VERIFY pagination/shape
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ success: false, error: "instantly_campaigns_failed", status: res.status, detail: data }, 502);
      }
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const campaigns = items
        .map((c: Record<string, unknown>) => ({ id: c.id as string, name: (c.name as string) ?? (c.id as string) }))
        .filter((c: { id?: string }) => !!c.id);
      return json({ success: true, campaigns });
    }

    // ── push ─────────────────────────────────────────────────────────────────
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    const leadIds: string[] = Array.isArray(body.lead_ids) ? body.lead_ids.filter((x: unknown) => typeof x === "string") : [];
    if (!campaignId || leadIds.length === 0) {
      return json({ success: false, error: "missing_campaign_or_leads" }, 200);
    }

    /* Admin check (service-role, mirrors the bulk-jobs pattern). Admins may push leads they don't
       own; non-admins stay strictly owner-scoped. userId comes ONLY from the verified JWT claims —
       never from the request body.
       ⛔ AN INTERNAL CALLER IS NEVER ADMIN, whatever roles the acting user holds. bulk-jobs' create
       already filters a job down to leads the creator owns, so the escalation buys the flow nothing
       and its absence removes the only route by which an internal call could read a row outside the
       job's own scope. Narrower is the whole point of this branch. */
    const isAdmin = await (async () => {
      if (isInternal) return false;
      const { data: adminRow } = await service
        .from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
      return !!adminRow;
    })();

    // Selected leads (note: outreach_leads has no `city` column — city is sent
    // empty for now; see the flag in the PR notes). Non-admins are restricted to
    // their own rows; admins get no owner filter so they can push any lead by id.
    let leadQuery = service
      .from("outreach_leads")
      .select("id, business_name, email, phone, is_archived, category, instantly_pushed_at, search_location, derived_town")
      .in("id", leadIds);
    if (!isAdmin) leadQuery = leadQuery.eq("user_id", userId);
    const { data: rows, error: lErr } = await leadQuery;
    if (lErr) return json({ success: false, error: lErr.message }, 500);

    const all = rows ?? [];
    /* ⚠️ IDS, NOT JUST COUNTS. A caller that has to map an outcome back onto its own work items —
       bulk-jobs' push phase does exactly that — cannot do it from a number. The counts are kept
       unchanged so the existing dialog is untouched; the id lists are additive.
       ⛔ The consequence for that caller: an ABSENT pushedIds must never be read as "all of them
       went". bulk-jobs treats a missing list as a failure and says so, because a stale deployment of
       this function is a real state and guessing in it would either double-push or lose the lot. */
    const alreadyPushedIds = all.filter((r) => r.instantly_pushed_at).map((r) => r.id);
    const noEmailIds = all.filter((r) => !r.instantly_pushed_at && !String(r.email ?? "").trim()).map((r) => r.id);
    const skippedAlreadyPushed = alreadyPushedIds.length;
    const skippedNoEmail = noEmailIds.length;
    const toPush = all
      .filter((r) => !r.instantly_pushed_at && String(r.email ?? "").trim())
      .slice(0, MAX_BATCH);

    if (toPush.length === 0) {
      return json({ success: true, pushed: 0, pushedIds: [], skippedAlreadyPushed, skippedNoEmail, alreadyPushedIds, noEmailIds });
    }

    /* ══ THE FIVE VARIABLES, FROM THE RESOLVER THE WHATSAPP PITCH ALREADY USES ══════════════════
       ⛔ WHAT THIS REPLACED: business_name + category + `city: ""` — a hardcoded empty string, with
       a comment claiming outreach_leads had no city column. It has two (search_location and the
       derived_town added 2026-07-30), so every push carried a blank city into a variable a template
       would have rendered as nothing, mid-sentence, in a real email.

       ⚠️ REUSED, NOT REIMPLEMENTED. resolveAuditReplyVars is the SAME resolver send-whatsapp-message
       uses for audit_reply. It already formats competitors as "X, Y and Z" capped at three, prefers
       the report's HEADLINE rivals so the email names what the report leads with, and returns
       {ok:false, reason} rather than something broken. Writing a second competitor formatter here
       would drift from the WhatsApp one the first time either changed.

       ⛔ NO COMPLETED AUDIT -> THE LEAD IS NOT PUSHED AT ALL. Touch 1 is reply-gated and carries no
       link, so competitor names ARE the hook; without them the email is generic and burns both the
       lead and the sending domain's reputation. Refusing is the whole point of resolving here
       rather than sending a blank variable and finding out from a reply that never comes. */
    const resolved: Array<{ row: typeof toPush[number]; vars: { trade: string; competitors: string; business: string; link: string } }> = [];
    const skippedNoAudit: Array<{ id: string; business_name: string | null; reason: string }> = [];
    /* ⛔ SUPPRESSED PEOPLE ARE NEVER EMAILED, AND THIS FUNCTION USED TO HAVE NO SUCH CHECK AT ALL.
       Its whole filter was "not already pushed AND has an email" — measured 2026-08-08, that let
       142 people who had said no through, held back only by 141 of them not having an email
       address yet. 79 of those had a website, so the Find emails crawl would have supplied one.
       Checked per lead against phone, email AND lead id, because an archived row often has no
       usable phone and the lead id is the only identifier left. */
    const skippedSuppressed: Array<{ id: string; business_name: string | null; matchedOn: string }> = [];

    /* Small concurrency: one resolver call is several reads, and MAX_BATCH is 1000. Sequential
       would be minutes; unbounded would hammer PostgREST. */
    const CONCURRENCY = 8;
    for (let i = 0; i < toPush.length; i += CONCURRENCY) {
      const slice = toPush.slice(i, i + CONCURRENCY);
      const out = await Promise.all(slice.map(async (r) => ({ r, v: await resolveAuditReplyVars(service, r.id) })));
      const supp = await Promise.all(slice.map((r) =>
        checkSuppressed(service, { phone: r.phone, email: r.email, leadId: r.id })));
      for (let k = 0; k < out.length; k++) {
        const { r, v } = out[k];
        const sp = supp[k];
        /* Suppression is checked FIRST and reported separately from "no audit". Folding them into
           one skip count would hide the only one that is a safety failure rather than a data gap. */
        if (sp.suppressed) { skippedSuppressed.push({ id: r.id, business_name: r.business_name ?? null, matchedOn: sp.matchedOn ?? "?" }); continue; }
        if (v.ok) resolved.push({ row: r, vars: { trade: v.trade, competitors: v.competitors, business: v.business, link: v.link } });
        else skippedNoAudit.push({ id: r.id, business_name: r.business_name ?? null, reason: v.reason });
      }
    }

    if (resolved.length === 0) {
      return json({
        success: true, pushed: 0, pushedIds: [], skippedAlreadyPushed, skippedNoEmail,
        alreadyPushedIds, noEmailIds,
        skippedNoAudit: skippedNoAudit.length, skippedNoAuditDetail: skippedNoAudit,
        skippedSuppressed: skippedSuppressed.length, skippedSuppressedDetail: skippedSuppressed,
      });
    }

    // ⚠️ VERIFY: V2 bulk-add body shape (campaign_id, leads[], custom_variables).
    /* ⚠️ THE VARIABLE NAMES ARE THE CONTRACT. Instantly fills {{business_name}} etc. by EXACT name
       against what was uploaded; a rename here silently renders as an empty string in a sent email
       rather than erroring. Change these only alongside the campaign's templates. */
    const leads = resolved.map(({ row: r, vars }) => ({
      email: String(r.email).trim(),
      company_name: vars.business || r.business_name || undefined,
      custom_variables: {
        business_name: vars.business || r.business_name || "",
        trade: vars.trade,
        competitors: vars.competitors,
        report_url: vars.link,
        /* The real town, at last. derived_town is resolved from the Places address and is the
           truthful one; search_location is what was typed and can be a neighbouring town (the
           Huntingdon-from-a-Wisbech-search case). Prefer derived, fall back, never empty-string. */
        city: (r.derived_town ?? "").trim() || (r.search_location ?? "").trim() || "",
      },
    }));

    const pushRes = await instantly(`/leads/add`, {
      method: "POST",
      body: JSON.stringify({ campaign_id: campaignId, leads }),
    });
    const pushData = await pushRes.json().catch(() => ({}));
    if (!pushRes.ok) {
      // Surface the raw Instantly error so the live test reveals the exact V2 shape.
      return json({ success: false, error: "instantly_push_failed", status: pushRes.status, detail: pushData }, 502);
    }

    // Mark the pushed rows (contact method + status + dedup stamp).
    const pushedIds = resolved.map(({ row }) => row.id);
    const { error: uErr } = await service
      .from("outreach_leads")
      .update({
        contact_method: "email",
        status: "email_sent",
        instantly_pushed_at: new Date().toISOString(),
        instantly_campaign_id: campaignId,
      })
      .in("id", pushedIds);
    if (uErr) console.error("[instantly-push] status update failed:", uErr.message);

    return json({
      success: true, pushed: pushedIds.length, pushedIds,
      skippedAlreadyPushed, skippedNoEmail,
      alreadyPushedIds, noEmailIds,
      skippedNoAudit: skippedNoAudit.length, skippedNoAuditDetail: skippedNoAudit,
      skippedSuppressed: skippedSuppressed.length, skippedSuppressedDetail: skippedSuppressed,
      sentVariables: Object.keys(leads[0].custom_variables),   // so a rename is visible in the response
      sample: { email: leads[0].email, custom_variables: leads[0].custom_variables },
      instantly: pushData,
    });
  } catch (e) {
    console.error("[instantly-push] error:", (e as Error).message);
    return json({ success: false, error: "server_error", detail: (e as Error).message }, 500);
  }
});
