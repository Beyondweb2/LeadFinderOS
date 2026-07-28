// Auto-reply rule helpers — the ONE inbox rule: "first substantive inbound → send audit_reply
// once", with hard guards. Kept as a tiny shared module so the trigger (whatsapp-inbound) and
// the processor (process-whatsapp-queue mode:'auto_replies') classify text identically and the
// keyword lists live in exactly one place. Deliberately NOT a rules engine — one rule, one
// toggle; a rules table can earn its way in later.

/* isDecline / looksAutomated and their keyword lists now live in src/lib/inboundClassify.ts and
   are re-exported here unchanged. The SPA cannot import this module (Deno.env.get below), so the
   dashboard had no way to agree with the pitch rule about what a human reply is — campaign
   "Replied" was counting booking bots as replies. One definition, both sides, rather than two
   keyword lists drifting apart. Call sites keep importing them from here; nothing else changed. */
export { isDecline, looksAutomated } from "../../../src/lib/inboundClassify.ts";

/** A real, human-typed text worth reacting to: non-empty, not a media/reaction placeholder
 *  ("[image]", "[reaction]", …) and at least a couple of characters. */
export function isSubstantiveText(body: string): boolean {
  const t = (body || "").trim();
  if (t.length < 2) return false;
  if (t.startsWith("[") && t.endsWith("]")) return false; // bodyFor()'s non-text placeholder
  return true;
}

/** Durable once-ever check that SURVIVES whatsapp_auto_replies row deletion: has any live
 *  (or test-mode simulated) outbound of this template already gone to this lead? The
 *  MESSAGE LOG is the marker — clearing/deleting queue rows can't erase it, and it also
 *  covers pitches sent OUTSIDE the auto machinery (manual Inbox sends), which the
 *  unique-row guard never saw (the Jack/Ben duplicate cause). Failed sends don't count —
 *  a retry after a hard send failure is legitimate. Best-effort: a query error returns
 *  FALSE (not sent); callers keep their own structural guards (unique index, 23505). */
// deno-lint-ignore no-explicit-any
export async function pitchEverSent(service: any, leadId: string, templateName: string): Promise<boolean> {
  try {
    const { data } = await service
      .from("whatsapp_messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("direction", "outbound")
      .eq("template_name", templateName)
      .neq("status", "failed")
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** Cross-channel suppression check (contact_suppressions keys by canonical E.164 "+<digits>").
 *  Best-effort: a query error returns FALSE (not suppressed) — the processor re-checks at send
 *  time, and the drainer/send paths have their own authoritative suppression guards. */
// deno-lint-ignore no-explicit-any
export async function phoneSuppressed(service: any, waDigits: string): Promise<boolean> {
  try {
    const { data } = await service
      .from("contact_suppressions").select("id").eq("phone_e164", `+${waDigits}`).limit(1).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** The UI toggle on whatsapp_outreach_state (id=1). Defensive: if the column doesn't exist yet
 *  (SQL not run) or the read fails, the toggle reads as OFF — the rule silently no-ops. */
// deno-lint-ignore no-explicit-any
export async function autoReplyToggleOn(service: any): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("whatsapp_outreach_state").select("auto_reply_enabled").eq("id", 1).maybeSingle();
    if (error) return false;
    return data?.auto_reply_enabled === true;
  } catch {
    return false;
  }
}

/** The env kill-switch. Default OFF — real sends to real humans are flipped on deliberately. */
export function autoReplyEnvOn(): boolean {
  return (Deno.env.get("AUTO_AUDIT_REPLY_ENABLED") ?? "").trim() === "1";
}

/** The reply-trigger template setting (whatsapp_outreach_state.first_reply_template).
 *  null = unset → the processor defaults to audit_reply. Defensive: a missing column /
 *  failed read returns null (the default), never throws. */
// deno-lint-ignore no-explicit-any
export async function firstReplyTemplate(service: any): Promise<string | null> {
  try {
    const { data, error } = await service
      .from("whatsapp_outreach_state").select("first_reply_template").eq("id", 1).maybeSingle();
    if (error) return null;
    return (data?.first_reply_template as string | null) ?? null;
  } catch {
    return null;
  }
}
