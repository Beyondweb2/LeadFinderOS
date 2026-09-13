import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
/* 🔴 THIS MAKES submissions THE SECOND CONSUMER OF free-check-result.ts, AND THAT MATTERS FOR
   DEPLOYS. Changing that module now requires redeploying BOTH this function AND
   process-ai-audit-queue. Getting that wrong is exactly what hid the broken result email for four
   days: the fix was committed, only one of its two consumers was redeployed, and the live code
   kept refusing every matched lead. Deploy list for _shared/free-check-result.ts:
     · process-ai-audit-queue   (the automatic send, on run finalisation)
     · submissions              (the operator resend, below) */
import { maybeSendFreeCheckResult } from "../_shared/free-check-result.ts";
import { FREE_CHECK_AUDIT_PURPOSE } from "../../../src/lib/auditKind.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHO FILLED IN MY FORM? — the questionnaire submissions, for the operator dashboard.

   ⛔ WHY AN ENDPOINT AND NOT A DIRECT READ. onboarding_responses has RLS ENABLED WITH NO POLICIES
   (migration 20260726). A SPA read with the user's session therefore returns HTTP 200 with [] —
   indistinguishable from "nobody has filled the form in", which is the exact thing this card
   exists to disprove. CLAUDE.md §4 records the same trap on apify_account_usage, where a comment
   promised the figure would be visible in the app and the policy was never added, so nothing ever
   displayed it. Routing through the service role, behind an operator check, is the fix that file
   prescribes.

   ⛔ IT RETURNS ROWS, NOT VERDICTS. `notifyStateFor` lives in src/hooks/useSubmissions.ts and is
   the single implementation of what "the email did not arrive" means — same rule as the coverage
   endpoint, so the card and any test cannot drift apart.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Enough to render a card. Deliberately NOT the answers themselves — this is a "who and what
 *  happened next" list, and the full questionnaire belongs on a record page, not a dashboard. */
const COLS = "id, lead_id, business_name, contact_email, confirmed_location, services, business_address, status, incomplete, created_at, notify_sent_at, notify_attempts, notify_error";

/** Paid is amount_paid > 0 everywhere (§6); on this table the STATUS carries it. Mirrors
 *  isPaidSubmission in src/hooks/useSubmissions.ts — the two must agree, so the delete guard and
 *  the card badge call the same rows paid. */
const PAID_STATUSES = new Set(["paid", "payment_received", "in_delivery", "completed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser(authHeader.slice(7));
    if (uErr || !u?.user) return json({ ok: false, error: "Auth required" }, 401);

    const body = await req.json().catch(() => ({}));
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    /* ── PER-LEAD ANSWERS, for the lead card's Questionnaire section (2026-08-17). ──────────────
       The LATEST onboarding row for one lead, with EVERY answer — this is the "record page" read
       the COLS comment below reserves the full questionnaire for. select("*"), the house pattern
       from findable-onboarding's status action: columns added by later migrations come through
       when present and are simply absent before the SQL has run — never a hard error.
       `followup_sent` rides along (has questionnaire_followup ever gone OUT to this lead) so the
       send button's guard and this fetch are one round trip; derived from whatsapp_messages, the
       only place counts may come from (CLAUDE.md §6). */
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (leadId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
        return json({ ok: false, error: "bad_lead_id" }, 400);
      }
      const { data: row, error: rowErr } = await service
        .from("onboarding_responses")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rowErr) return json({ ok: false, error: rowErr.message }, 500);
      const { count } = await service
        .from("onboarding_responses")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId);
      /* Same filter as pitchEverSent (auto-reply-rules.ts) INCLUDING the failed-send exclusion —
         a failed attempt must not read as "already sent" here while the server guard would allow
         the retry. The two must agree or the button lies. */
      const { data: sent } = await service
        .from("whatsapp_messages")
        .select("id")
        .eq("lead_id", leadId)
        .eq("direction", "outbound")
        .eq("template_name", "questionnaire_followup")
        .neq("status", "failed")
        .limit(1);
      return json({ ok: true, row: row ?? null, row_count: count ?? (row ? 1 : 0), followup_sent: (sent ?? []).length > 0 });
    }

    /* ── LEAD-LINKED STATUS ROWS, for the dashboard's "started" count and Chase task (2026-08-19).
       Both used to read onboarding_responses DIRECTLY from the browser, which RLS answers with
       200 [] — so per-campaign "started" was structurally 0 and the Chase task ("filled the
       questionnaire, hasn't paid") never fired once. Same trap this whole endpoint exists for,
       reproduced by its own consumers. Returns EVERY lead-linked row (not just the newest per
       lead): paid is sticky across rows and the client folds that rule — one implementation,
       in the hooks that already had it. */
    /* ── FREE-CHECK PROGRESS ─────────────────────────────────────────────────────
       ⛔ BUILT BECAUSE THERE WAS NOWHERE TO LOOK (Paul, 2026-09-07): submitting a free check left
       him blind — no way to tell whether the audit was running, done or failed, so every test was
       guesswork. Every fact was already stored, across five tables, and shown on no screen. The
       glue-pot incident was the cost: an operator email narrating a state nobody could check.

       ⛔ IT RETURNS FACTS, NOT A STAGE. The stage is derived by src/lib/freeCheckProgress.ts, which
       is pure and tested — the same rule as the coverage endpoint and lead_statuses below, so the
       card and the test cannot drift apart. Do not compute a verdict here.

       ⚠️ THE AUDIT IS MATCHED BY TIME, NOT ONLY BY LEAD, and that is the glue-pot bug's fix
       generalised: the free-check lane DEDUPES, so a repeat submission lands on a lead that may
       already carry older audits. Anything read per submission must be scoped to that submission or
       a four-day-old audit gets reported as this one's. Same 60s backward tolerance, same reason as
       notify-onboarding-submit: the row is saved before the audit is created, never after. */
    /* ── RESEND A RESULT, ON PURPOSE ─────────────────────────────────────────────
       ⛔ THIS SENDS A REAL EMAIL TO A REAL PROSPECT ADDRESS, so it is deliberately awkward to reach
       by accident: an operator session, an explicit action name, an explicit audit id, and a
       confirm in the UI. It exists because the once-per-audit guard makes delivery UNTESTABLE —
       there was no way to send a second copy and watch whether it arrived, which is precisely the
       question we spent a day unable to answer.

       ⛔ IT DOES NOT WEAKEN THE GUARD, IT OVERRIDES IT ONCE. `force` is set only here, the previous
       stamp is left in place, and the automatic path keeps reading it — so an audit that has been
       resent by hand is still refused by the queue for ever after. The property that stopped a
       stranger being emailed three times is untouched.

       ⚠️ AND THE RESEND CARRIES A DIFFERENT SUBJECT (see free-check-result.ts). Gmail threads
       identical subjects from one sender into a single conversation, so a second identical copy
       collapses under the first and reads as never arriving. That is the symptom that sent us
       hunting a Message-ID dedup bug that did not exist.

       ⚠️ IT NEEDS A runId because the module reports on a specific run's questions. The newest
       COMPLETE run is the right one — the same choice the automatic path makes. */
    if (body.action === "resend_free_check_result") {
      const auditId = String(body.audit_id ?? "");
      if (!UUID_RE.test(auditId)) return json({ ok: false, error: "audit_id must be a uuid" }, 400);

      const { data: runRows, error: runErr } = await service
        .from("ai_audit_runs")
        .select("id, status, run_number, created_at")
        .eq("audit_id", auditId)
        .order("run_number", { ascending: true });
      if (runErr) return json({ ok: false, error: runErr.message }, 500);
      const complete = ((runRows ?? []) as Array<{ id: string; status: string }>)
        .filter((r) => r.status === "complete");
      /* ⛔ NO COMPLETE RUN, NO SEND. A resend must never invent a result: an audit that failed or is
         still measuring has nothing to tell the prospect, and mailing them a half-measurement is
         worse than the silence we are trying to fix. */
      if (!complete.length) {
        return json({ ok: false, error: "no completed run on this audit — nothing to send" }, 409);
      }
      const runId = complete[complete.length - 1].id;

      try {
        const r = await maybeSendFreeCheckResult(service, runId, auditId, { force: true });
        console.log(`[submissions] operator resend for audit ${auditId} by ${u.user.id}: ${JSON.stringify(r)}`);
        return json({ ok: true, outcome: r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[submissions] resend threw for audit ${auditId}:`, msg);
        return json({ ok: false, error: msg }, 500);
      }
    }

    if (body.action === "free_check_progress") {
      const limit = Math.min(Number(body.limit) || 15, 50);
      const { data: rows, error: rErr } = await service
        .from("onboarding_responses")
        .select("id, lead_id, business_name, contact_email, created_at, notify_sent_at, notify_attempts, notify_error")
        .eq("source", "free_check")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (rErr) return json({ ok: false, error: rErr.message }, 500);
      const subs = (rows ?? []) as Array<Record<string, unknown>>;
      const leadIds = [...new Set(subs.map((r) => r.lead_id).filter(Boolean))] as string[];
      const empty = { data: [] as Array<Record<string, unknown>> };

      /* One read per table, folded in memory. Fifteen submissions must not become sixty round
         trips — this card is polled while an operator watches a test run. */
      const [leadsRes, auditsRes, reasonsRes] = await Promise.all([
        leadIds.length
          ? service.from("outreach_leads").select("id, business_name").in("id", leadIds)
          : Promise.resolve(empty),
        leadIds.length
          ? service.from("ai_audits")
              .select("id, lead_id, created_at, baseline_target_runs, free_check_result, audit_purpose")
              .in("lead_id", leadIds)
          : Promise.resolve(empty),
        service.from("client_error_reports")
          .select("error_id, context, created_at")
          .in("error_id", ["free_check_audit_skipped", "free_check_audit_failed"])
          .order("created_at", { ascending: false })
          .limit(60),
      ]);
      const leads = (leadsRes.data ?? []) as Array<{ id: string; business_name: string | null }>;
      const audits = (auditsRes.data ?? []) as Array<Record<string, unknown>>;
      const reasons = (reasonsRes.data ?? []) as Array<{ error_id: string; context: Record<string, unknown> }>;
      const leadName = new Map(leads.map((l) => [l.id, l.business_name]));

      /* Each submission's OWN audit: same lead, created at or after the row.
         ⛔ AN AUDIT CREATED AS THE FREE CHECK WINS OVER A NEWER ONE THAT WAS NOT (2026-09-13). Since
         the purpose column, the free-check audit says so (`audit_purpose = 'free_check'`); newest-
         first alone would hand this card the lead's PAID BASELINE the moment a prospect who took the
         free check goes on to pay — and put the resend button under it. The sender refuses a
         baseline whatever this picks, but the card must not mislabel one either. Legacy audits
         (no purpose) still fall back to newest-first. */
      const auditFor = (leadId: string | null, submittedAt: string) => {
        if (!leadId) return null;
        const floor = new Date(submittedAt).getTime() - 60_000;
        const mine = audits
          .filter((a) => a.lead_id === leadId && new Date(String(a.created_at)).getTime() >= floor)
          .sort((x, y) => new Date(String(y.created_at)).getTime() - new Date(String(x.created_at)).getTime());
        return mine.find((a) => a.audit_purpose === FREE_CHECK_AUDIT_PURPOSE)
          ?? mine.find((a) => !a.audit_purpose)   // legacy: no purpose recorded, newest first
          ?? null;
      };

      const auditIds = subs
        .map((r) => auditFor(r.lead_id as string | null, String(r.created_at)))
        .filter((a): a is Record<string, unknown> => !!a)
        .map((a) => a.id as string);

      const [runsRes, queueRes, waRes] = await Promise.all([
        auditIds.length
          ? service.from("ai_audit_runs").select("audit_id, status").in("audit_id", auditIds)
          : Promise.resolve(empty),
        auditIds.length
          ? service.from("ai_audit_queue").select("audit_id, status").in("audit_id", auditIds)
          : Promise.resolve(empty),
        /* The prospect-facing WhatsApp result, when their number was known. Its status is a REAL
           delivery receipt, unlike the email stamp — see freeCheckProgress.ts on that difference. */
        leadIds.length
          ? service.from("whatsapp_messages")
              .select("lead_id, template_name, status, created_at")
              .in("lead_id", leadIds).eq("template_name", "free_check_result")
              .order("created_at", { ascending: false })
          : Promise.resolve(empty),
      ]);
      const runs = (runsRes.data ?? []) as Array<{ audit_id: string; status: string }>;
      const queue = (queueRes.data ?? []) as Array<{ audit_id: string; status: string }>;
      const wa = (waRes.data ?? []) as Array<{ lead_id: string; status: string | null }>;

      const out = subs.map((r) => {
        const a = auditFor(r.lead_id as string | null, String(r.created_at));
        const aid = a ? (a.id as string) : null;
        const myQueue = aid ? queue.filter((q) => q.audit_id === aid) : [];
        const fcr = (a ? a.free_check_result : null) as {
          at?: string; email?: string; email_status?: string;
          provider_message_id?: string; email_error?: string; resend_count?: number;
        } | null;
        const hit = reasons.find((x) => x.context?.onboarding_id === r.id || x.context?.lead_id === r.lead_id);
        return {
          onboarding_id: r.id,
          business_name: (r.business_name as string | null) ?? null,
          contact_email: (r.contact_email as string | null) ?? null,
          submitted_at: String(r.created_at),
          notify_sent_at: (r.notify_sent_at as string | null) ?? null,
          notify_attempts: (r.notify_attempts as number | null) ?? 0,
          notify_error: (r.notify_error as string | null) ?? null,
          lead_id: (r.lead_id as string | null) ?? null,
          lead_name: r.lead_id ? (leadName.get(r.lead_id as string) ?? null) : null,
          audit_id: aid,
          audit_created_at: a ? String(a.created_at) : null,
          run_statuses: aid ? runs.filter((x) => x.audit_id === aid).map((x) => x.status) : [],
          runs_target: a ? ((a.baseline_target_runs as number | null) ?? null) : null,
          questions_total: myQueue.length,
          /* SETTLED, not "done": the queue uses done/failed, and a deliberately dropped straggler
             is stored as failed. Counting only 'done' would leave a finished audit showing 7 of 8
             for ever and read as stuck. */
          questions_done: myQueue.filter((q) => q.status === "done" || q.status === "failed").length,
          /* CLAIM and OUTCOME, separately. A single "sent" field is what let the dashboard
             announce an email that Resend had refused. */
          result_claimed_at: (fcr && fcr.at) ? fcr.at : null,
          result_sent_to: (fcr && fcr.email) ? fcr.email : null,
          result_email_status: (fcr && fcr.email_status) ? fcr.email_status : null,
          result_provider_id: (fcr && fcr.provider_message_id) ? fcr.provider_message_id : null,
          result_email_error: (fcr && fcr.email_error) ? fcr.email_error : null,
          result_resend_count: (fcr && typeof fcr.resend_count === "number") ? fcr.resend_count : null,
          no_audit_reason: aid ? null : (hit ? String(hit.context?.reason ?? hit.context?.error ?? hit.error_id) : null),
          whatsapp_status: r.lead_id ? ((wa.find((w) => w.lead_id === r.lead_id) || {}).status ?? null) : null,
        };
      });
      return json({ ok: true, rows: out });
    }

    if (body.action === "lead_statuses") {
      const { data: rows, error: lsErr } = await service
        .from("onboarding_responses")
        /* ⚠️ source IS SELECTED SO THE DASHBOARD CAN TELL TWO DIFFERENT FORMS APART. A
           source='free_check' row is the FREE CHECK form on findable.live, not the sign-up
           questionnaire — 12 of the 22 rows on file are those. Counting them as questionnaire
           starts (which is what the campaign card did) conflates an inbound website visitor with a
           prospect our outreach drove to sign up. */
        .select("lead_id, status, created_at, source")
        .not("lead_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (lsErr) return json({ ok: false, error: lsErr.message }, 500);
      return json({ ok: true, rows: rows ?? [] });
    }

    /* ── DELETE, for clearing test junk from the submissions card (2026-08-22). ────────────────
       Same operator bar as every other action here: a valid session, then the service role does
       the write (the table has RLS with NO policies, so a browser .delete() returns 200 and
       removes nothing — the RLS-no-policy trap §8, in the write direction). Deletes by an explicit
       id array; nothing FK-references onboarding_responses.id, so a delete leaves no orphans
       (its own lead_id FK is ON DELETE SET NULL, so the lead is untouched either way).

       ⛔ PAID-ROW PROTECTION IS ENFORCED HERE, NOT ONLY IN THE UI. A bulk delete (delete-selected /
       delete-all) must never wipe a paying customer's answers — RG and Ronnie's Q2 is real data,
       not test junk. So a row is treated as paid if its OWN status is paid-class OR its linked lead
       has amount_paid > 0, and paid ids are SKIPPED unless the caller sets allow_paid (the per-row
       single-delete confirm sets it; the bulk buttons never do). The count skipped is reported so
       the UI can say "N paid rows kept", never silently drop the request. */
    if (body.action === "delete") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x)) : [];
      if (!ids.length) return json({ ok: false, error: "no_ids" }, 400);
      const allowPaid = body.allow_paid === true;

      /* Which of these are paid — by the row's own status, or by the lead it links to. */
      const { data: targets, error: tErr } = await service
        .from("onboarding_responses")
        .select("id, status, lead_id")
        .in("id", ids);
      if (tErr) return json({ ok: false, error: tErr.message }, 500);
      const rows = (targets ?? []) as { id: string; status: string | null; lead_id: string | null }[];

      const leadIds = [...new Set(rows.map((r) => r.lead_id).filter((x): x is string => !!x))];
      const paidLeadIds = new Set<string>();
      if (leadIds.length) {
        const { data: leads } = await service
          .from("outreach_leads").select("id, amount_paid").in("id", leadIds);
        for (const l of (leads ?? []) as { id: string; amount_paid: number | null }[]) {
          if ((l.amount_paid ?? 0) > 0) paidLeadIds.add(l.id);
        }
      }
      const isPaidRow = (r: { status: string | null; lead_id: string | null }) =>
        PAID_STATUSES.has(String(r.status ?? "")) || (r.lead_id != null && paidLeadIds.has(r.lead_id));

      const paidCount = rows.filter((r) => isPaidRow(r)).length;
      const deletable = allowPaid ? rows.map((r) => r.id) : rows.filter((r) => !isPaidRow(r)).map((r) => r.id);
      const skippedPaid = allowPaid ? 0 : paidCount;

      let deleted = 0;
      if (deletable.length) {
        const { error: dErr, count } = await service
          .from("onboarding_responses")
          .delete({ count: "exact" })
          .in("id", deletable);
        if (dErr) return json({ ok: false, error: dErr.message }, 500);
        deleted = count ?? deletable.length;
      }
      return json({ ok: true, deleted, skipped_paid: skippedPaid });
    }

    /* Clamped. A dashboard card wants the recent ones; an unbounded limit from the client is how a
       card quietly becomes a full table scan. */
    const raw = Number(body.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 25;

    const { data, error } = await service
      .from("onboarding_responses")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);

    /* ── ENRICH EACH ROW WITH ITS LEAD + WHETHER THE NUDGE HAS GONE ─────────────────────────────
       The per-row "Send nudge" reuses the lead-card guard (row && !rowPaid && !leadPaid), and the
       send needs a phone — send-whatsapp-message resolves NOTHING from a lead_id, it takes the
       phone in the request. So the card needs phone / country / contact_name / amount_paid per row,
       plus whether questionnaire_followup has already gone (one send per lead). Two batched reads,
       not one per row: a card must not become N round trips. `followup_sent` uses the SAME filter
       as pitchEverSent — direction outbound, this template, status != failed — so the button's
       disabled state and the server's own refusal agree (CLAUDE.md §6g). */
    const listRows = (data ?? []) as Record<string, unknown>[];
    const leadIds = [...new Set(listRows.map((r) => r.lead_id).filter((x): x is string => typeof x === "string" && !!x))];

    const leadById = new Map<string, { phone: string | null; country: string | null; contact_name: string | null; amount_paid: number | null }>();
    const followupLeadIds = new Set<string>();
    if (leadIds.length) {
      const { data: leads } = await service
        .from("outreach_leads")
        .select("id, phone, country, contact_name, amount_paid")
        .in("id", leadIds);
      for (const l of (leads ?? []) as { id: string; phone: string | null; country: string | null; contact_name: string | null; amount_paid: number | null }[]) {
        leadById.set(l.id, { phone: l.phone, country: l.country, contact_name: l.contact_name, amount_paid: l.amount_paid });
      }
      const { data: sent } = await service
        .from("whatsapp_messages")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("direction", "outbound")
        .eq("template_name", "questionnaire_followup")
        .neq("status", "failed");
      for (const s of (sent ?? []) as { lead_id: string | null }[]) if (s.lead_id) followupLeadIds.add(s.lead_id);
    }

    const enriched = listRows.map((r) => {
      const lid = typeof r.lead_id === "string" ? r.lead_id : null;
      const lead = lid ? leadById.get(lid) ?? null : null;
      return {
        ...r,
        lead_phone: lead?.phone ?? null,
        lead_country: lead?.country ?? null,
        lead_contact_name: lead?.contact_name ?? null,
        lead_amount_paid: lead?.amount_paid ?? null,
        followup_sent: lid ? followupLeadIds.has(lid) : false,
      };
    });

    return json({ ok: true, rows: enriched });
  } catch (e) {
    console.error("[submissions] error:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
