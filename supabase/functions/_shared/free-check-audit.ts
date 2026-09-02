/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FREE-CHECK AUTO-AUDIT: the gate, then the fire.

   A stranger fills a form on findable.live and this spends money and, when it finishes, emails
   them. Everything in this file exists because that sentence is true — the gate is not a nicety
   bolted on afterwards, it is the reason the feature is allowed to run at all.

   🔴 THE 10/DAY LEAD CAP DOES NOT BOUND THIS, WHICH IS WHY THE COUNTER BELOW EXISTS. Measured in
   free-check-lead.ts: the `matched` return (an existing lead, by place_id / phone / name) happens
   BEFORE the cap is ever consulted, because that cap exists to bound GOOGLE spend on new leads and
   a match costs nothing. So without an independent guard, submitting the same business name fifty
   times would fire fifty audits — ~£4.50 of Apify and fifty emails to whatever address was typed.
   Two guards, and they answer different questions:
     · REPEAT: has this lead been audited recently? (stops one business re-triggering)
     · DAILY:  how many free-check audits have fired today? (stops many businesses being enumerated)
   Neither alone is enough. The first is per-lead, so a script with fifty names walks straight
   through it; the second is global, so it would let one business fire ten times before biting.

   ⛔ EVERY REFUSAL IS REPORTED, NEVER SILENT. The caller logs the reason and the visitor still sees
   success — they have done nothing wrong, and a form that appears to fail is worse than one that
   quietly does less. `skipped` is the normal, expected outcome for a repeat submitter.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Don't re-audit a business we already measured this recently. A week is long enough that a repeat
 *  submitter is asking a genuinely new question, and short enough that a real second enquiry a month
 *  later still gets served. */
export const FREE_CHECK_AUDIT_REPEAT_DAYS = 7;

/** Free-check audits per rolling 24h, ACROSS ALL LEADS. Deliberately the same number as the lead
 *  cap so the two read as one budget, but it is a SEPARATE count — see the header. At 5 questions
 *  and no SEO scan (~4p an audit) this bounds the lane at ~40p a day. */
export const FREE_CHECK_DAILY_AUDIT_CAP = 10;

/** How many questions a free-check audit asks. Five is the wizard's own maximum and what §6j's
 *  phase-2 plan specified; the SEO scan is skipped, so this is the whole cost. */
export const FREE_CHECK_QUESTIONS = 5;

export type AutoAuditDecision =
  | { fire: true }
  | { fire: false; reason: string };

// deno-lint-ignore no-explicit-any
type Client = any;

const dayAgoIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

/**
 * May we spend money auditing this lead right now?
 *
 * ⛔ FAILS CLOSED. Any read that errors returns `fire: false`. A guard that cannot prove it is safe
 * must not conclude that it is — this is the same rule addLead's dedupe learned the hard way when an
 * empty in-memory list read as "no duplicates exist" and re-sent 25 openers.
 */
export async function shouldAutoAudit(service: Client, leadId: string): Promise<AutoAuditDecision> {
  if (!leadId) return { fire: false, reason: "no lead id" };

  /* GUARD 1 — has this lead been audited recently? Counts audits, not runs: a re-run of the same
     audit is still the same measurement. `created_at` on ai_audits is the audit's own age. */
  try {
    const { data, error } = await service
      .from("ai_audits")
      .select("id")
      .eq("lead_id", leadId)
      .gte("created_at", dayAgoIso(FREE_CHECK_AUDIT_REPEAT_DAYS))
      .limit(1);
    if (error) return { fire: false, reason: `repeat check failed: ${error.message}` };
    if ((data ?? []).length > 0) {
      return { fire: false, reason: `already audited within ${FREE_CHECK_AUDIT_REPEAT_DAYS} days` };
    }
  } catch (e) {
    return { fire: false, reason: `repeat check threw: ${e instanceof Error ? e.message : String(e)}` };
  }

  /* GUARD 2 — how many free-check audits have fired in the last 24h, across every lead?
     ⚠️ TWO READS RATHER THAN A JOIN, per the house rule (bulk-jobs): a wrong embedded-relationship
     name returns rows with the field silently absent, which here would read as "no audits today"
     and disable the cap. Ids first, then count audits against them. */
  try {
    const { data: leads, error: lErr } = await service
      .from("outreach_leads")
      .select("id")
      .eq("enrichment_source", "free_check");
    if (lErr) return { fire: false, reason: `daily cap lead read failed: ${lErr.message}` };
    const ids = ((leads ?? []) as Array<{ id: string }>).map((l) => l.id);
    if (ids.length === 0) return { fire: true }; // nothing has ever come through this lane

    const { count, error: cErr } = await service
      .from("ai_audits")
      .select("id", { count: "exact", head: true })
      .in("lead_id", ids)
      .gte("created_at", dayAgoIso(1));
    if (cErr) return { fire: false, reason: `daily cap count failed: ${cErr.message}` };
    if ((count ?? 0) >= FREE_CHECK_DAILY_AUDIT_CAP) {
      return { fire: false, reason: `daily free-check audit cap reached (${count} in 24h)` };
    }
  } catch (e) {
    return { fire: false, reason: `daily cap threw: ${e instanceof Error ? e.message : String(e)}` };
  }

  return { fire: true };
}

export interface FreeCheckAuditLead {
  id: string;
  user_id: string | null;
  business_name: string | null;
  search_keyword: string | null;
  category: string | null;
  search_location: string | null;
  address: string | null;
  country: string | null;
  website: string | null;
}

export type FireOutcome =
  | { ok: true; auditId: string | null; runId: string | null }
  | { ok: false; error: string };

/**
 * Start the audit. Mirrors the WhatsApp lane's invoke (whatsapp-inbound.ts:245) — same endpoint,
 * same internal auth, no `questions[]` so create-ai-audit generates them from the lead's details.
 *
 * ⛔ AUTH IS x-cron-secret + x-internal-job, NOT a service-role bearer. Since the ~2026-08-11 key
 * rotation the `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY` branch is DEAD on every function
 * in this project — the gateway only forwards a JWT-shaped bearer and the handler compares against
 * the sb_secret value, which are mutually exclusive. The bearer in the older call sites is
 * vestigial; copying it would look right and authenticate nothing.
 *
 * ⛔ skip_seo. The SEO scan is the dearest call in the audit (~$0.04, and Apify is a single point of
 * failure for the whole product), the free check is a naming question, and the hook lane already
 * skips it. Nothing in the result email renders a website grade.
 *
 * ⚠️ NEVER THROWS. The visitor's success screen must not depend on this: the questionnaire row is
 * already saved by the time we get here, and a failure to start an audit is an operator problem,
 * not theirs.
 */
export async function fireFreeCheckAudit(lead: FreeCheckAuditLead): Promise<FireOutcome> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!supabaseUrl) return { ok: false, error: "SUPABASE_URL not set" };
  if (!cronSecret) return { ok: false, error: "CRON_SECRET not set — the internal door is shut" };

  const businessType = (lead.search_keyword ?? lead.category ?? "").trim();
  const locationText = (lead.search_location ?? lead.address ?? "").trim();
  if (!lead.business_name) return { ok: false, error: "lead has no business name" };
  if (!businessType) return { ok: false, error: "lead has no trade to ask about" };
  if (!locationText) return { ok: false, error: "lead has no town to ask about" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
        "x-internal-job": "1",
      },
      body: JSON.stringify({
        user_id: lead.user_id,
        lead_id: lead.id,
        business_name: lead.business_name,
        business_type: businessType,
        location_text: locationText,
        country: lead.country ?? null,
        website: lead.website ?? null,
        has_website: !!(lead.website ?? "").trim(),
        question_count: FREE_CHECK_QUESTIONS,
        skip_seo: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      return { ok: false, error: `create-ai-audit HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}` };
    }
    return { ok: true, auditId: body.audit_id ?? null, runId: body.run_id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
