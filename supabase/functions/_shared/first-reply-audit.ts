import {
  FIRST_REPLY_AUDIT_OPEN_STATUSES,
  auditIntentRetryStatus,
  decideQueuedAuditIntent,
  shouldArmFirstReplyAutomation,
  type FirstReplyAuditStatus,
} from "../../../src/lib/firstReplyAutomation.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { armStatusFor, firstReplyMode, firstReplyTemplate, autoReplyEnvOn, type FirstReplyMode } from "./auto-reply-rules.ts";

type Service = any; // Supabase edge functions intentionally use a service-role client here.

function ownWebsite(raw: unknown): string | null {
  const website = typeof raw === "string" ? raw.trim() : "";
  return website && !isAggregatorUrl(website) ? website : null;
}

/** An arming failure must be diagnosable without function logs (the CLI has none). The inbound
 *  row is already durable by the time this runs, so recording the failure is all that is left. */
async function reportArmFailure(service: Service, ctx: { leadId: string; wamid: string | null; mode: FirstReplyMode; error: string }) {
  try {
    await service.from("client_error_reports").insert({
      error_id: "first_reply_arm_failed",
      message: ctx.error.slice(0, 1000),
      context: { lead_id: ctx.leadId, wamid: ctx.wamid, first_reply_mode: ctx.mode },
    });
  } catch (e) {
    console.error(`[first-reply-audit] could not record arming failure for lead ${ctx.leadId}:`, e instanceof Error ? e.message : String(e));
  }
}

export async function armFirstReplyAuditIntent(input: {
  service: Service;
  leadId: string;
  phone: string;
  wamid: string | null;
  firstInbound: boolean;
  firstInboundReliable: boolean;
  archived: boolean;
}): Promise<{ armed: boolean; reason: string }> {
  const mode = await firstReplyMode(input.service);
  try {
    return await armIntent(input, mode);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[first-reply-audit] arming failed for lead ${input.leadId}: ${error}`);
    await reportArmFailure(input.service, { leadId: input.leadId, wamid: input.wamid, mode, error });
    return { armed: false, reason: "arm_error" };
  }
}

async function armIntent(
  input: { service: Service; leadId: string; phone: string; wamid: string | null; firstInbound: boolean; firstInboundReliable: boolean; archived: boolean },
  mode: FirstReplyMode,
): Promise<{ armed: boolean; reason: string }> {
  /* ⛔ THE MODE IS THE ONLY BEHAVIOURAL SWITCH (Paul, 2026-09-20). This used to also require the
     Inbox auto-reply toggle, so "Run audit only" produced no audit whenever the toggle was off.
     The toggle governs SENDING and the drain reads it at send time; AUTO_AUDIT_REPLY_ENABLED
     remains the emergency kill-switch for the whole automation. */
  const masterEnabled = autoReplyEnvOn();
  if (!shouldArmFirstReplyAutomation({
    mode,
    masterEnabled,
    firstInbound: input.firstInbound,
    firstInboundReliable: input.firstInboundReliable,
    archived: input.archived,
  })) {
    return { armed: false, reason: !masterEnabled ? "automation_disabled" : "not_qualifying_first_inbound" };
  }

  /* The unique lead_id row is the durable exactly-once claim.  This is intentionally before any
     audit creation: a webhook timeout, function cold start, or create-ai-audit failure cannot erase
     the fact that this lead now requires an audit. */
  const templateName = await firstReplyTemplate(input.service);
  const replyStatus = armStatusFor(mode, false);
  if (!replyStatus) return { armed: false, reason: "mode_does_not_arm" };
  const { error } = await input.service.from("whatsapp_auto_replies").insert({
    lead_id: input.leadId,
    phone: input.phone,
    trigger_wa_message_id: input.wamid,
    audit_trigger_message_id: input.wamid,
    trigger: "first_reply",
    template_name: templateName,
    status: replyStatus,
    fire_after: new Date().toISOString(),
    audit_required: true,
    audit_mode: mode,
    audit_status: "pending" satisfies FirstReplyAuditStatus,
  });
  if (!error) return { armed: true, reason: "audit_pending" };
  if ((error as { code?: string }).code === "23505") {
    /* A duplicate webhook/rapid second reply normally reaches this branch. A pre-existing row can
       also belong to another reply trigger; add the independent audit intent to that same
       one-per-lead row instead of silently treating a non-audit row as a completed claim. */
    const { data: existing, error: existingError } = await input.service.from("whatsapp_auto_replies")
      .select("id, audit_required").eq("lead_id", input.leadId).maybeSingle();
    if (existingError || !existing?.id) {
      throw new Error(`first_reply_existing_intent_lookup_failed:${existingError?.message ?? "missing_row"}`);
    }
    if (existing.audit_required === true) return { armed: false, reason: "already_claimed" };
    const { data: promoted, error: promoteError } = await input.service.from("whatsapp_auto_replies")
      .update({
        audit_required: true,
        audit_mode: mode,
        audit_status: "pending",
        audit_trigger_message_id: input.wamid,
        audit_last_error: null,
        audit_next_attempt_at: null,
        audit_claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id).neq("audit_required", true)
      .select("id");
    if (promoteError || !Array.isArray(promoted) || promoted.length !== 1) {
      throw new Error(`first_reply_intent_promote_failed:${promoteError?.message ?? "concurrent_update"}`);
    }
    return { armed: true, reason: "audit_pending_existing_reply_row" };
  }
  throw new Error(`first_reply_intent_insert_failed:${(error as { message?: string }).message ?? "unknown"}`);
}

const CLAIM_STALE_MS = 5 * 60_000;
const RETRY_MAX_MS = 60 * 60_000;
const REPLY_FIRE_DELAY_MS = 3 * 60_000;

function retryAt(attempt: number): string {
  const delay = Math.min(RETRY_MAX_MS, 60_000 * (2 ** Math.min(6, Math.max(0, attempt - 1))));
  return new Date(Date.now() + delay).toISOString();
}

async function mark(service: Service, id: string, patch: Record<string, unknown>) {
  const { error } = await service.from("whatsapp_auto_replies")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(`[first-reply-audit] could not update intent ${id}: ${error.message}`);
}

/** Back off for another attempt, or stop at the attempt ceiling. The failure text is kept either way. */
async function retryOrFail(service: Service, id: string, attempt: number, reason: string) {
  const status = auditIntentRetryStatus(attempt);
  await mark(service, id, {
    audit_status: status,
    audit_last_error: reason.slice(0, 300),
    audit_next_attempt_at: status === "retry_pending" ? retryAt(attempt) : null,
    audit_claimed_at: null,
  });
  if (status === "failed") console.error(`[first-reply-audit] intent ${id} failed after ${attempt} attempts: ${reason.slice(0, 200)}`);
}

type IntentRow = {
  id: string;
  lead_id: string;
  status: string | null;
  audit_mode: string | null;
  audit_status: string | null;
  audit_attempts: number | null;
  audit_next_attempt_at: string | null;
  audit_claimed_at: string | null;
  audit_id: string | null;
};

/**
 * A `queued` intent waits on ITS OWN reply audit (audit_id). Completion, failure and waiting are
 * read from that audit's runs and nothing else — an earlier unrelated audit on the lead cannot
 * satisfy it. Every transition is conditional on the row still being `queued`, so two ticks
 * reading the same row cannot both act.
 */
async function settleQueuedIntent(service: Service, row: IntentRow): Promise<"complete" | "wait" | "retry" | "failed"> {
  const attempt = Number(row.audit_attempts ?? 0);
  if (!row.audit_id) {
    await retryOrFail(service, row.id, attempt, "queued without an associated audit_id");
    return auditIntentRetryStatus(attempt) === "failed" ? "failed" : "retry";
  }
  const { data: runs, error } = await service.from("ai_audit_runs").select("status").eq("audit_id", row.audit_id);
  if (error) {
    console.error(`[first-reply-audit] run lookup failed for intent ${row.id}: ${error.message}`);
    return "wait";
  }
  const decision = decideQueuedAuditIntent(((runs ?? []) as Array<{ status?: string | null }>).map((r) => String(r.status ?? "")));
  if (decision === "wait") return "wait";
  if (decision === "complete") {
    /* Audit completion is a fact about the audit, recorded here regardless of any reply switch.
       The reply side is independent: a send-mode pitch parked as awaiting_audit is released to the
       drain, which applies its own env/toggle/decline gates at send time. */
    const replyIsWaiting = row.status === "awaiting_audit" && row.audit_mode === "send";
    const { error: doneError } = await service.from("whatsapp_auto_replies")
      .update({
        audit_status: "complete",
        audit_last_error: null,
        audit_next_attempt_at: null,
        audit_claimed_at: null,
        updated_at: new Date().toISOString(),
        ...(replyIsWaiting ? { status: "pending", fire_after: new Date(Date.now() + REPLY_FIRE_DELAY_MS).toISOString() } : {}),
      })
      .eq("id", row.id).eq("audit_status", "queued");
    if (doneError) console.error(`[first-reply-audit] could not complete intent ${row.id}: ${doneError.message}`);
    return "complete";
  }
  // The reply audit's run(s) failed: back into the bounded retry path, keeping the reason.
  const status = auditIntentRetryStatus(attempt);
  const { error: moveError } = await service.from("whatsapp_auto_replies")
    .update({
      audit_status: status,
      audit_last_error: `reply audit ${row.audit_id} has no usable run (all runs failed/cancelled)`,
      audit_next_attempt_at: status === "retry_pending" ? retryAt(attempt) : null,
      audit_claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id).eq("audit_status", "queued");
  if (moveError) console.error(`[first-reply-audit] could not move intent ${row.id} to ${status}: ${moveError.message}`);
  return status === "failed" ? "failed" : "retry";
}

/**
 * Server-side recovery path. Called by the existing audit queue cron; it only creates the audit
 * shell/questions through create-ai-audit, never performs an AI/Apify run itself.
 */
export async function reconcileFirstReplyAuditIntents(service: Service): Promise<{ checked: number; started: number; retried: number; completed: number; failed: number }> {
  const now = Date.now();
  /* ⛔ Only OPEN statuses are read. Terminal rows (complete/failed/not_required) used to share this
     page with the due ones; past 100 intents they would have hidden every new reply. */
  const { data, error } = await service.from("whatsapp_auto_replies")
    .select("id, lead_id, status, audit_mode, audit_required, audit_status, audit_attempts, audit_next_attempt_at, audit_claimed_at, audit_id")
    .eq("audit_required", true)
    .in("audit_status", [...FIRST_REPLY_AUDIT_OPEN_STATUSES])
    .limit(100);
  if (error) {
    console.error(`[first-reply-audit] intent lookup failed: ${error.message}`);
    return { checked: 0, started: 0, retried: 0, completed: 0, failed: 0 };
  }

  let checked = 0;
  let started = 0;
  let retried = 0;
  let completed = 0;
  let failed = 0;
  for (const row of (data ?? []) as IntentRow[]) {
    const status = String(row.audit_status ?? "pending") as FirstReplyAuditStatus;
    if (status === "queued") {
      const outcome = await settleQueuedIntent(service, row);
      if (outcome === "complete") completed++;
      else if (outcome === "retry") retried++;
      else if (outcome === "failed") failed++;
      continue;
    }
    const due = status === "pending" ||
      (status === "retry_pending" && (!row.audit_next_attempt_at || Date.parse(row.audit_next_attempt_at) <= now)) ||
      (status === "starting" && row.audit_claimed_at && Date.parse(row.audit_claimed_at) <= now - CLAIM_STALE_MS);
    if (!due) continue;
    checked++;

    /* Atomic claim: two cron invocations may both read the row, but only the one whose previous
       state still matches may switch it to starting. A stale starting claim is also atomically
       reclaimed after five minutes. */
    const claimAt = new Date().toISOString();
    let claim = service.from("whatsapp_auto_replies")
      .update({ audit_status: "starting", audit_claimed_at: claimAt, audit_attempts: Number(row.audit_attempts ?? 0) + 1, updated_at: claimAt })
      .eq("id", row.id).eq("audit_status", status);
    if (status === "starting") claim = claim.lt("audit_claimed_at", new Date(now - CLAIM_STALE_MS).toISOString());
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError || !Array.isArray(claimed) || claimed.length !== 1) continue;

    const attempt = Number(row.audit_attempts ?? 0) + 1;
    try {
      const { data: lead, error: leadError } = await service.from("outreach_leads")
        .select("id, user_id, business_name, category, search_keyword, search_location, address, country, website")
        .eq("id", row.lead_id).maybeSingle();
      const businessType = String(lead?.category ?? lead?.search_keyword ?? "").trim();
      const locationText = String(lead?.search_location ?? lead?.address ?? "").trim();
      if (leadError || !lead?.user_id || !lead?.business_name || !businessType || !locationText) {
        const reason = leadError?.message ?? `missing ${[!lead?.business_name ? "business_name" : "", !lead?.user_id ? "owner" : "", !businessType ? "business_type" : "", !locationText ? "location" : ""].filter(Boolean).join(",")}`;
        await retryOrFail(service, row.id, attempt, reason);
        retried++;
        continue;
      }

      /* ⛔ A FRESH REPLY AUDIT, NEVER AN INHERITED ONE (Paul, 2026-09-20). This used to look for any
         complete or active audit on the lead first, so the drip's pre-send hook audit satisfied the
         reply's intent and no reply-triggered audit ran. Every attempt — the first AND a retry after
         a failed run — mints a NEW adaptive hook audit (`fresh_audit` bypasses create-ai-audit's
         per-lead reuse) and the intent is repointed at it. A hook audit never accumulates runs; a
         failed one stays behind as the record of the failure, audit_last_error says why. */
      const website = ownWebsite(lead.website);
      const body = {
        user_id: lead.user_id,
        lead_id: row.lead_id,
        business_name: lead.business_name,
        business_type: businessType,
        location_text: locationText,
        country: lead.country ?? null,
        website,
        has_website: !!website,
        question_count: OUTREACH_HOOK_QUESTIONS,
        fresh_audit: true,
      };
      const response = await fetch(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/create-ai-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": "1",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; audit_id?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.audit_id) {
        const reason = `create-ai-audit HTTP ${response.status}: ${String(payload.error ?? "invalid_response")}`;
        await retryOrFail(service, row.id, attempt, reason);
        retried++;
        continue;
      }
      await mark(service, row.id, { audit_status: "queued", audit_id: payload.audit_id, audit_last_error: null, audit_next_attempt_at: null, audit_claimed_at: null });
      started++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await retryOrFail(service, row.id, attempt, reason);
      retried++;
    }
  }
  return { checked, started, retried, completed, failed };
}
