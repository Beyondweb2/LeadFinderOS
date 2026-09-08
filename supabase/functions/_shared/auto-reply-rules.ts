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
import { isSuppressed } from "./suppression.ts";

/* The reply-trigger MODE lives in src/lib too, and for the same reason: the SPA has to render the
   three-way control and this module cannot be imported there (Deno.env below). One definition of
   what each mode does, read by the trigger, the drain and the Inbox. */
export {
  AUDIT_ONLY_STATUS,
  AUTO_REPLY_STALE_MS,
  DEFAULT_FIRST_REPLY_MODE,
  DEFAULT_FIRST_REPLY_TEMPLATE,
  FIRST_REPLY_MODES,
  armStatusFor,
  isStaleAutoReply,
  modeRunsAudit,
  modeSends,
  parseFirstReplyMode,
  type FirstReplyMode,
} from "../../../src/lib/firstReplyMode.ts";
import { parseFirstReplyMode, type FirstReplyMode } from "../../../src/lib/firstReplyMode.ts";

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
  /* ⛔ DELEGATES. This used to be its own contact_suppressions query — one of three inline copies
     of the same rule, and the one that swallowed a thrown lookup as `false` ("not suppressed"),
     which is the wrong default for a guard whose false-pass costs you a customer relationship.
     Kept as a named export so its three callers (whatsapp-inbound, process-ai-audit-queue,
     process-whatsapp-queue) did not each need editing — but there is now exactly ONE
     implementation, in _shared/suppression.ts, and it fails closed.
     ⚠️ Phone-only by signature. A caller that also holds an email or a lead id should call
     checkSuppressed directly rather than this: this can only match what it is given. */
  return await isSuppressed(service, { phone: `+${waDigits}` });
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

/** The reply-trigger MODE (whatsapp_outreach_state.first_reply_mode).
 *
 *  ⛔ EVERY FAILURE DIRECTION IS 'audit_only'. A missing column (SQL not run), a failed read, a
 *  NULL, or a value this build does not know all resolve to the mode that sends nothing —
 *  parseFirstReplyMode owns that rule and this function only supplies it a value. So deploying
 *  this code before the SQL runs cannot turn a silent inbox into a sending one.
 *
 *  ⚠️ THIS DOES NOT ANSWER "is the rule on". `autoReplyToggleOn` still does: OFF is the boolean,
 *  and the mode only says which of the two working behaviours applies. Two fields because the
 *  operator's "stop everything" and their choice of behaviour are different decisions, and
 *  collapsing them would lose the chosen behaviour every time the rule is paused. */
// deno-lint-ignore no-explicit-any
export async function firstReplyMode(service: any): Promise<FirstReplyMode> {
  try {
    const { data, error } = await service
      .from("whatsapp_outreach_state").select("first_reply_mode").eq("id", 1).maybeSingle();
    if (error) return parseFirstReplyMode(null);
    return parseFirstReplyMode(data?.first_reply_mode);
  } catch {
    return parseFirstReplyMode(null);
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
