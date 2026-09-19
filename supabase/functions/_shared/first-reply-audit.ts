import {
  shouldArmFirstReplyAutomation,
  type FirstReplyAuditStatus,
} from "../../../src/lib/firstReplyAutomation.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { armStatusFor, firstReplyMode, firstReplyTemplate, autoReplyEnvOn, autoReplyToggleOn } from "./auto-reply-rules.ts";

type Service = any; // Supabase edge functions intentionally use a service-role client here.

function ownWebsite(raw: unknown): string | null {
  const website = typeof raw === "string" ? raw.trim() : "";
  return website && !isAggregatorUrl(website) ? website : null;
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
  const [mode, replyEnabled] = await Promise.all([
    firstReplyMode(input.service),
    autoReplyToggleOn(input.service),
  ]);
  const masterEnabled = autoReplyEnvOn() && replyEnabled;
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

function retryAt(attempt: number): string {
  const delay = Math.min(RETRY_MAX_MS, 60_000 * (2 ** Math.min(6, Math.max(0, attempt - 1))));
  return new Date(Date.now() + delay).toISOString();
}

async function mark(service: Service, id: string, patch: Record<string, unknown>) {
  const { error } = await service.from("whatsapp_auto_replies")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(`[first-reply-audit] could not update intent ${id}: ${error.message}`);
}

/**
 * Server-side recovery path. Called by the existing audit queue cron; it only creates the audit
 * shell/questions through create-ai-audit, never performs an AI/Apify run itself.
 */
export async function reconcileFirstReplyAuditIntents(service: Service): Promise<{ checked: number; started: number; retried: number }> {
  const now = Date.now();
  const { data, error } = await service.from("whatsapp_auto_replies")
    .select("id, lead_id, status, audit_mode, audit_required, audit_status, audit_attempts, audit_next_attempt_at, audit_claimed_at, audit_id")
    .eq("audit_required", true)
    .limit(100);
  if (error) {
    console.error(`[first-reply-audit] intent lookup failed: ${error.message}`);
    return { checked: 0, started: 0, retried: 0 };
  }

  let checked = 0;
  let started = 0;
  let retried = 0;
  for (const row of (data ?? []) as Array<any>) {
    const status = String(row.audit_status ?? "pending") as FirstReplyAuditStatus;
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
        await mark(service, row.id, { audit_status: "retry_pending", audit_last_error: reason.slice(0, 300), audit_next_attempt_at: retryAt(attempt), audit_claimed_at: null });
        retried++;
        continue;
      }

      /* If a prior call completed after a timeout, it wins. create-ai-audit reuses ordinary audits,
         but checking first makes that recovery explicit and avoids manufacturing a second run. */
      const { data: audits } = await service.from("ai_audits").select("id, ai_audit_runs(status)")
        .eq("lead_id", row.lead_id).order("created_at", { ascending: false }).limit(10);
      const auditRows = (audits ?? []) as Array<{ id: string; ai_audit_runs?: Array<{ status?: string | null }> | null }>;
      const complete = auditRows.find((a) => (a.ai_audit_runs ?? []).some((r) => ["complete", "capped"].includes(String(r.status ?? "").toLowerCase())));
      if (complete) {
        const replyIsWaiting = row.status === "awaiting_audit" && row.audit_mode === "send";
        await mark(service, row.id, {
          audit_status: "complete",
          audit_id: complete.id,
          audit_last_error: null,
          audit_next_attempt_at: null,
          audit_claimed_at: null,
          ...(replyIsWaiting
            ? { status: "pending", fire_after: new Date(Date.now() + 3 * 60_000).toISOString() }
            : {}),
        });
        continue;
      }
      const active = auditRows.find((a) => (a.ai_audit_runs ?? []).some((r) => ["pending", "queued", "running", "processing"].includes(String(r.status ?? "").toLowerCase())));
      if (active) {
        await mark(service, row.id, { audit_status: "queued", audit_id: active.id, audit_last_error: null, audit_next_attempt_at: null, audit_claimed_at: null });
        continue;
      }

      const website = ownWebsite(lead.website);
      const response = await fetch(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/create-ai-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": "1",
        },
        body: JSON.stringify({
          user_id: lead.user_id,
          lead_id: row.lead_id,
          business_name: lead.business_name,
          business_type: businessType,
          location_text: locationText,
          country: lead.country ?? null,
          website,
          has_website: !!website,
          question_count: OUTREACH_HOOK_QUESTIONS,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; audit_id?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.audit_id) {
        const reason = `create-ai-audit HTTP ${response.status}: ${String(payload.error ?? "invalid_response")}`;
        await mark(service, row.id, { audit_status: "retry_pending", audit_last_error: reason.slice(0, 300), audit_next_attempt_at: retryAt(attempt), audit_claimed_at: null });
        retried++;
        continue;
      }
      await mark(service, row.id, { audit_status: "queued", audit_id: payload.audit_id, audit_last_error: null, audit_next_attempt_at: null, audit_claimed_at: null });
      started++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await mark(service, row.id, { audit_status: "retry_pending", audit_last_error: reason.slice(0, 300), audit_next_attempt_at: retryAt(attempt), audit_claimed_at: null });
      retried++;
    }
  }
  return { checked, started, retried };
}
