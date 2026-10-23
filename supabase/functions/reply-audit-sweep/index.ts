// reply-audit-sweep — queue the reply audits the held WhatsApp webhook missed (2026-10-23, docs/reply-audit-sweep.md).
//
// Internal only: CRON_SECRET + x-internal-job (invoke_reply_audit_sweep(), hourly). Modes (body.mode):
//   · "dry_run" — reads only: who would be queued now, and why everyone else is not.
//   · "run"     — records one audit-only claim per qualifying lead, up to today's allowance.
// It writes whatsapp_auto_replies claims and NOTHING else: the audit queue's reconciler
// (reconcileFirstReplyAuditIntents, fn process-ai-audit-queue) mints each hook audit, and an audit_only
// claim is never sent by the drain. The rules: src/lib/replyAuditSweep.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  REPLY_AUDIT_SWEEP_REASON,
  REPLY_AUDIT_SWEEP_WINDOW_DAYS,
  firstCountingReplies,
  sweepAllowance,
  sweepDailyCap,
  sweepDecision,
  sweepOrder,
  type SweepMessage,
} from "../../../src/lib/replyAuditSweep.ts";
import { AUDIT_ONLY_STATUS, autoReplyEnvOn, effectiveReplyMode, firstReplyTemplate, modeRunsAudit } from "../_shared/auto-reply-rules.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { paidMode } from "../_shared/protection.ts";

/** Bumped with every change, so a deploy is proved by the live answer (CLAUDE.md §3). */
const BUILD_ID = "reply-audit-sweep-2026-10-23a";
const json = (body: unknown, status = 200) => new Response(JSON.stringify({ build: BUILD_ID, ...(body as object) }), { status, headers: { "Content-Type": "application/json" } });
const PAGE = 1000;
const CHUNK = 150;

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a service-role client, untyped like the other cron functions
type Service = any;

async function pageAll<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

async function sweep(service: Service, write: boolean) {
  /* ⛔ The switches first, every one failing closed. */
  if (!autoReplyEnvOn()) return { stopped: "automation_disabled" };
  const replyMode = await effectiveReplyMode(service);
  if (!modeRunsAudit(replyMode)) return { stopped: "reply_mode_off" };
  const protection = await paidMode(service);
  if (protection !== "running") return { stopped: protection };
  const { data: setting, error: settingErr } = await service.from("protection_settings")
    .select("reply_audit_sweep_per_day").eq("id", 1).maybeSingle();
  const cap = settingErr ? 0 : sweepDailyCap(setting?.reply_audit_sweep_per_day);
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: used, error: usedErr } = await service.from("whatsapp_auto_replies")
    .select("id", { count: "exact", head: true }).eq("reason", REPLY_AUDIT_SWEEP_REASON).gte("created_at", since24h);
  if (usedErr) throw new Error(`sweep_count_failed:${usedErr.message}`);
  const allowance = sweepAllowance(cap, used ?? 0);

  /* Every lead with a WhatsApp inbound in the window… */
  const since = new Date(Date.now() - REPLY_AUDIT_SWEEP_WINDOW_DAYS * 86_400_000).toISOString();
  const inbound = await pageAll<{ lead_id: string }>((a, b) => service.from("whatsapp_messages")
    .select("id, lead_id").eq("direction", "inbound").not("lead_id", "is", null).gte("created_at", since).order("id").range(a, b));
  const leadIds = [...new Set(inbound.map((r) => r.lead_id))];
  /* …less every lead that already has a claim of any kind (the unique lead_id row is the once-ever slot). */
  const claimed = new Set<string>();
  for (const ids of chunks(leadIds)) {
    const { data, error } = await service.from("whatsapp_auto_replies").select("lead_id").in("lead_id", ids);
    if (error) throw new Error(`claim_read_failed:${error.message}`);
    for (const r of data ?? []) claimed.add(r.lead_id);
  }
  const open = leadIds.filter((id) => !claimed.has(id));

  const messages: SweepMessage[] = [];
  const leads = new Map<string, { amount_paid: unknown; status: unknown; is_archived: unknown }>();
  for (const ids of chunks(open)) {
    messages.push(...await pageAll<SweepMessage>((a, b) => service.from("whatsapp_messages")
      .select("id, lead_id, direction, body, created_at, status, wa_message_id, phone").in("lead_id", ids).order("id").range(a, b)));
    const { data, error } = await service.from("outreach_leads").select("id, amount_paid, status, is_archived").in("id", ids);
    if (error) throw new Error(`lead_read_failed:${error.message}`);
    for (const l of data ?? []) leads.set(l.id, l);
  }

  const templateName = write ? await firstReplyTemplate(service) : null;
  const queued: Array<{ lead_id: string; replied_at: string }> = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
  for (const reply of sweepOrder(firstCountingReplies(messages))) {
    if (queued.length >= allowance) { skip("daily_cap"); continue; }
    /* A lead row we could not read is a client-shaped null: firstReplyGuard skips it. */
    const supp = await checkSuppressed(service, { phone: reply.phone, leadId: reply.leadId });
    const d = sweepDecision({ reply, lead: leads.get(reply.leadId) ?? null, suppressed: supp.suppressed });
    if (!d.arm) { skip(d.reason); continue; }
    if (write) {
      const { error } = await service.from("whatsapp_auto_replies").insert({
        lead_id: reply.leadId,
        phone: reply.phone,
        trigger_wa_message_id: reply.wamid,
        audit_trigger_message_id: reply.wamid,
        trigger: "first_reply",
        template_name: templateName,
        status: AUDIT_ONLY_STATUS,
        reason: REPLY_AUDIT_SWEEP_REASON,
        fire_after: new Date().toISOString(),
        audit_required: true,
        audit_mode: "audit_only",
        audit_status: "pending",
      });
      if (error) {
        /* 23505: the webhook (or another tick) claimed this lead first — theirs stands. */
        skip((error as { code?: string }).code === "23505" ? "claimed_meanwhile" : "insert_failed");
        if ((error as { code?: string }).code !== "23505") console.error(`[reply-audit-sweep] insert failed for ${reply.leadId}: ${error.message}`);
        continue;
      }
    }
    queued.push({ lead_id: reply.leadId, replied_at: reply.repliedAt });
  }
  console.log(`[reply-audit-sweep] ${write ? "queued" : "would queue"} ${queued.length} (allowance ${allowance}/${cap}); skipped ${JSON.stringify(skipped)}`);
  return { cap, used_last_24h: used ?? 0, allowance, leads_with_reply: leadIds.length, without_claim: open.length, queued: queued.length, queued_leads: queued, skipped };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const internal = req.headers.get("x-internal-job") === "1"
    && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || "\u0000__unset__");
  if (!internal) return json({ ok: false, error: "not_authorised" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode = String(body.mode ?? "");
  try {
    if (mode === "dry_run" || mode === "run") return json({ ok: true, mode, ...(await sweep(service, mode === "run")) });
    return json({ ok: false, error: "bad_mode", detail: "mode must be dry_run or run." }, 400);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[reply-audit-sweep]", msg.slice(0, 300));
    return json({ ok: false, error: "failed", detail: msg.slice(0, 300) }, 500);
  }
});
