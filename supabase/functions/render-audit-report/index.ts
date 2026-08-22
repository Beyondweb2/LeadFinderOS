// render-audit-report — PUBLIC (no-auth) server-rendered AI-visibility audit report page.
//
// Given ?slug=<slug>, it resolves the mapping row in business_reports, loads that audit's latest
// run + queue rows with the SERVICE ROLE (ai_audit_runs is owner-only RLS — anon can't read it),
// and renders the report LIVE via the SHARED report logic:
//   ai_audit_queue rows + run → buildReportData()  (src/lib/auditReport.ts, the Stage-1 module)
//                             → renderReportHtml()  (src/lib/aiAuditReportHtml.ts, the pure renderer)
// Returns the COMPLETE self-contained HTML document directly (NOT via functions/r/[slug].ts, which
// would double-wrap it). Rendering live means the page always reflects the newest report logic.
//
// Reuses the SAME TS the SPA uses (single source of truth) by importing src/lib across the repo —
// those modules are pure (no React/DOM), so Deno runs them (proven by `deno check`).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { renderReportHtml } from "../../../src/lib/aiAuditReportHtml.ts";
import { showFounderOffer } from "../../../src/lib/founderOffer.ts";
import { onboardingUrl, resolveSiteOrigin, ORIGIN_ENV } from "../_shared/onboarding-followup.ts";

import { auditCodeFromSlug } from "../../../src/lib/reportSlug.ts";

/* ⛔ THE "VIEW ONLINE" FOOTER LINK WAS DEAD IN EVERY REPORT EVER SENT.
   It was built from a hardcoded SITE_ORIGIN of https://yoursites.uk plus /a/<slug> — a route that
   was never fronted, on an origin that 404s. Nobody noticed because the PITCH links Paul sends are
   the UUID form straight at this function, which has always worked; the broken one was the link
   printed INSIDE the document.

   ⚠️ IT IS THE IDENTIFIER THAT WAS WRONG, NOT THE ORIGIN — and an earlier fix today got that
   backwards, pointing this at THIS function's own URL. Do not do that again: the Supabase gateway
   serves render-audit-report as `text/plain` with `X-Content-Type-Options: nosniff` and
   `Content-Security-Policy: default-src 'none'; sandbox`, whatever content-type the function sets.
   A browser opening that URL gets raw HTML source as text. The function is upstream plumbing; it
   must never be the URL a human is given.

   WHY THE AUDIT ID AND NOT THE SLUG: a UUID resolves DIRECTLY here (see the resolution note below) —
   no business_reports lookup at all, so it cannot fail. The slug form needs the stored slug to end
   in the 8-hex code, and only 69 of 123 report rows do; the other 54 include published ones, so a
   slug link would be dead for those. That is the whole original bug.

   THE ORIGIN IS A PROXY THAT FORCES text/html — findable.live/report/<id>, a Pages Function in the
   findable-site repo (functions/report/[id].ts). Verified on production 2026-08-05: HTTP 200,
   text/html; charset=utf-8, x-robots-tag noindex, the real report.
   yoursites.uk/a/<id> is the OLDER proxy and still live — every pitch link already sent uses it and
   must keep working, so it is deliberately not retired. This constant only decides what NEW documents
   print. One template string, not spread through the file. */
const REPORT_PUBLIC_ORIGIN = "https://findable.live";
const shareUrlFor = (_supabaseUrl: string, auditId: string) =>
  `${REPORT_PUBLIC_ORIGIN}/report/${auditId}`;

function htmlResponse(html: string, status = 200): Response {
  // Return the HTML as a STRING body (Deno encodes string bodies as UTF-8) with an explicit
  // text/html; charset=utf-8 header. IMPORTANT: a Uint8Array / TextEncoder().encode() body made the
  // Supabase edge runtime serve the response as `text/plain` (dropping our content-type), so the
  // browser Latin-1-decoded the correct UTF-8 bytes -> mojibake on every non-ASCII char (accents,
  // em/en-dashes) in the DYNAMIC data. A string body lets the content-type stick; bytes stay UTF-8.
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Belt and braces with the document's own robots meta: a header protects only this route,
      // a meta travels with the file. A prospect's competitors must never reach a search index.
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      // Short cache: the page renders live, but a few minutes of CDN/edge caching is fine.
      "cache-control": status === 200 ? "public, max-age=120" : "public, max-age=0, must-revalidate",
    },
  });
}

/** Minimal, crawlable, noindex fallback for a missing / not-yet-ready report. */
function unavailable(msg: string): Response {
  return htmlResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Report unavailable</h1><p>${msg}</p></body></html>`,
    404,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Link-unfurlers / crawlers that fetch the URL without a human opening it — WhatsApp + Meta
// preview it the moment the pitch sends, so counting them would inflate every "opened" to 1
// instantly. Case-insensitive substring match on the User-Agent. Residual imprecision accepted.
const BOT_UA_RE = /facebookexternalhit|whatsapp|telegrambot|slackbot|bot|crawler|preview|spider/i;

/** Record a genuine human open against the AUDIT (stable /a/<auditId> identity, survives re-runs):
 *  first_opened_at set once, open_count incremented atomically via the bump_audit_open() RPC.
 *  NEVER throws and NEVER blocks rendering — a bot UA, a missing migration (RPC 404 until the SQL
 *  is run), or any DB error is swallowed. Fire-and-forget from the render path. */
// deno-lint-ignore no-explicit-any
async function recordAuditOpen(service: any, auditId: string, userAgent: string): Promise<void> {
  try {
    if (BOT_UA_RE.test(userAgent)) return;                 // preview/crawler fetch — not a human open
    const { error } = await service.rpc("bump_audit_open", { p_audit_id: auditId });
    if (error) console.warn("[render-audit-report] open-tracking skipped:", error.message);
  } catch (e) {
    console.warn("[render-audit-report] open-tracking error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Accept ?slug=… or a trailing path segment (…/render-audit-report/<slug>).
    const slug = (url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!slug) return unavailable("No report specified.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    /* 1) Resolve the audit id.
       A UUID path segment IS the audit id, resolved directly — every pitch link ever sent is that
       form (64 of them) and must never stop working.
       Otherwise the slug must END in the 8-hex audit code; the business-name part is cosmetic and is
       NOT matched. That is the security fix: this used to look the slug up by exact string, so the
       bare slugified name resolved and /a/dan-electrician served that report to anyone who could
       guess a company name. Matching on the code suffix also means renaming a business cannot break
       a link already sent — the stored slug keeps the old name, the code does not change. */
    let auditId: string;
    if (UUID_RE.test(slug)) {
      auditId = slug;
    } else {
      const code = auditCodeFromSlug(slug);
      // No code → a bare name, or junk. Either way there is nothing to resolve.
      if (!code) return unavailable("This report link is no longer valid.");
      const { data: reps } = await service
        .from("business_reports")
        .select("audit_id")
        .like("slug", `%-${code}`).eq("status", "published").limit(2);
      const matches = (reps ?? []) as Array<{ audit_id: string | null }>;
      /* Exactly one, or nothing. On a code collision we refuse rather than pick: handing someone a
         stranger's report would be far worse than a dead link. See the note in reportSlug.ts. */
      if (matches.length !== 1 || !matches[0].audit_id) {
        if (matches.length > 1) console.error(`[render-audit-report] code ${code} matched ${matches.length} reports — refusing to guess.`);
        return unavailable("This report doesn’t exist or isn’t published.");
      }
      auditId = matches[0].audit_id as string;
    }

    // 2) audit_id → ai_audits (business context for the report copy).
    const { data: audit } = await service
      .from("ai_audits")
      // lead_id joins the payment check below: a client must never open their own report to a
      // cheaper founder offer.
      .select("id, business_name, business_type, location_text, specialism, website, is_market, lead_id")
      .eq("id", auditId).maybeSingle();
    if (!audit) return unavailable("Audit not found.");
    /* ⛔ THE PUBLIC RENDERER REFUSES MARKET AUDITS. This is the one an outsider could reach with a
       URL, so it refuses the same way it refuses a missing audit — no error page, no sentinel name
       echoed back. A market audit has no business, so there is nothing here to show anybody.
       Reads the column, never the name. */
    if ((audit as { is_market?: boolean }).is_market === true) {
      console.log(`[render-audit-report] REFUSED market audit ${audit.id}: no business attached.`);
      return unavailable("No report for this audit.");
    }

    // 3) latest run for the audit.
    const { data: run } = await service
      .from("ai_audit_runs")
      .select("id, audit_id, run_number, status, mention_rate, results, created_at")
      .eq("audit_id", audit.id).order("run_number", { ascending: false }).limit(1).maybeSingle();
    if (!run) return unavailable("No audit run yet for this business.");

    /* 4) queue rows across ALL runs of the audit. A Full Measurement asks each question over several
       runs; buildReportData groups by question and aggregates across them so "named X of Y" is the
       real frequency (questions × scored engines × runs), not one lucky ask. For a single-run audit
       this is just that one run's rows — identical to before. */
    const { data: allRuns } = await service
      .from("ai_audit_runs").select("id").eq("audit_id", audit.id);
    const runIds = ((allRuns ?? []) as Array<{ id: string }>).map((r) => r.id);
    const { data: qrows } = await service
      .from("ai_audit_queue")
      .select("id, question, status, result")
      .in("run_id", runIds.length ? runIds : [run.id]).order("created_at", { ascending: true });
    const queueRows = (qrows ?? []) as QueueRow[];

    // 5) build the report data with the SHARED logic (identical to the in-app report), then render.
    const data = buildReportData(queueRows, run as RunRow, {
      businessName: audit.business_name ?? "",
      businessType: audit.business_type ?? "",
      locationText: audit.location_text ?? "",
      specialisms: audit.specialism ?? "",
      isAggregatorUrl,
      ownWebsite: audit.website ?? "",
    });
    if (!data) return unavailable("This audit hasn’t completed yet — check back shortly.");

    /* ── DOES THIS READER GET THE FOUNDER OFFER? ────────────────────────────────────────────────
       Not a client, and the offer still running. `amount_paid > 0` is the app-wide definition of
       paid (CLAUDE.md §6); the audit-id list in founderOffer.ts covers the two audits with NO lead
       row, where there is structurally no payment to read — ABLM being the one that matters.
       One extra query, and only when a lead is attached. Fully guarded: if it fails we treat the
       reader as UNPAID, which shows the offer. That is the right way round — a prospect seeing no
       offer is a lost sale, and the two client audits are caught by id rather than by this query. */
    let amountPaid = 0;
    const leadId = (audit as { lead_id?: string | null }).lead_id ?? null;
    if (leadId) {
      const { data: lead } = await service
        .from("outreach_leads").select("amount_paid").eq("id", leadId).maybeSingle();
      amountPaid = Number((lead as { amount_paid?: unknown } | null)?.amount_paid ?? 0) || 0;
    }
    data.showFounderOffer = showFounderOffer({ auditId: audit.id, amountPaid });

    /* ── WHERE THE OFFER BUTTON GOES ────────────────────────────────────────────────────────────
       ⛔ THE ONBOARDING FLOW, NOT STRIPE. It used to be a raw Stripe Payment Link, which skipped the
       serve gate AND left the payment invisible: stripe-webhook's Findable branch is keyed on
       `metadata.onboarding_id`, and a static link cannot carry a per-payer row id, so nothing was
       marked paid, no lead was updated and no baseline started. Through the flow it becomes
       questionnaire -> findable-checkout -> stripe-webhook, which records all three.

       ⛔ NO LEAD, NO LINK, AND THAT IS THE PRICE GUARD. offerPriceForLead charges the FULL £99 for
       `no_lead`, so a button without one would advertise £19.99 and charge £99. Same for an
       unconfigured origin: a relative or wrong-host link is worse than no button, which is why
       resolveSiteOrigin() has no fallback. Either missing → founderOfferUrl stays null → the offer
       renders its copy and guarantee with no button, and Email us / WhatsApp us still work.

       ⚠️ SAME BUILDER AS THE LIVE onboarding_followup TEMPLATE (_shared/onboarding-followup.ts), so
       the URL shape lives in exactly one place — and that shape is proven: three of those links were
       sent and opened on 28 July. */
    const offerOrigin = resolveSiteOrigin();
    data.founderOfferUrl = leadId && offerOrigin
      ? onboardingUrl(offerOrigin, leadId, audit.business_name ?? null)
      : null;
    if (data.showFounderOffer === true && !data.founderOfferUrl) {
      console.warn(
        `[render-audit-report] audit ${audit.id}: offer shown WITHOUT a button — `
        + `${!leadId ? "no lead_id on the audit" : `${ORIGIN_ENV} not configured`}`,
      );
    }

    data.shareUrl = shareUrlFor(supabaseUrl, audit.id); // "View online" footer link — see shareUrlFor
    // Genuine render succeeded → record the open (non-bot only). Awaited but fully guarded, so a
    // tracking failure can never break the report the visitor came for.
    await recordAuditOpen(service, audit.id, req.headers.get("user-agent") ?? "");
    return htmlResponse(renderReportHtml(data));
  } catch (e) {
    console.error("[render-audit-report] error:", e instanceof Error ? e.message : e);
    return unavailable("Something went wrong rendering this report.");
  }
});
