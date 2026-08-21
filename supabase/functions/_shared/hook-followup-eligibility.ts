/* ════════════════════════════════════════════════════════════════════════════════════════════
   hook_followup ELIGIBILITY — the authoritative, server-side gate for the bulk report follow-up.

   Mirrors the client's Inbox "Hook follow-up due" computation, but per-lead and phone-keyed so the
   drain lane in process-whatsapp-queue can re-verify EVERY lead at send time — the client filter is
   a display convenience; this is the guard. A lead is eligible when:
     • it is NOT a paying customer (amount_paid = 0) — never re-pitch someone who bought;
     • it RECEIVED the audit_reply report (a non-failed outbound audit_reply exists);
     • it has NOT already had a hook_followup (one per lead, ever — non-failed outbound);
     • NO inbound arrived AFTER the report was sent (they went quiet — a reply after it disqualifies);
     • it has been at least HOOK_FOLLOWUP_MIN_DAYS since that report.
   Phone-keyed (not lead_id) so it matches the Inbox's conversation semantics and is robust to
   duplicate lead rows sharing a number. Best-effort reads; any thrown query is treated as a refusal
   (fail closed — never send on an unresolved guard).

   ⛔ HOOK_FOLLOWUP_MIN_DAYS must match the client's constant of the same name in src/pages/Inbox.tsx.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { toWhatsAppNumber } from "./whatsapp-send.ts";

export const HOOK_FOLLOWUP_MIN_DAYS = 3;
const MIN_MS = HOOK_FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;

export interface HookLeadLite {
  id: string;
  phone: string | null;
  country: string | null;
  amount_paid: number | null;
}

export interface HookEligibility { eligible: boolean; reason: string }

// deno-lint-ignore no-explicit-any
export async function hookFollowupEligible(service: any, lead: HookLeadLite, now = Date.now()): Promise<HookEligibility> {
  try {
    if ((lead.amount_paid ?? 0) > 0) return { eligible: false, reason: "paid" };
    const to = toWhatsAppNumber(lead.phone ?? "", lead.country);
    if (!to) return { eligible: false, reason: "bad_number" };

    // The report (audit_reply) — most recent non-failed outbound to this number.
    const { data: reports } = await service
      .from("whatsapp_messages")
      .select("created_at")
      .eq("phone", to).eq("direction", "outbound").eq("template_name", "audit_reply").neq("status", "failed")
      .order("created_at", { ascending: false }).limit(1);
    const reportAt = reports?.[0]?.created_at ? new Date(reports[0].created_at).getTime() : 0;
    if (!reportAt) return { eligible: false, reason: "no_report" };

    // One per lead, ever — a hook_followup already went out.
    const { data: hooks } = await service
      .from("whatsapp_messages")
      .select("id")
      .eq("phone", to).eq("direction", "outbound").eq("template_name", "hook_followup").neq("status", "failed").limit(1);
    if (Array.isArray(hooks) && hooks.length) return { eligible: false, reason: "already_sent" };

    // Any inbound AFTER the report → they replied, not quiet.
    const { data: replies } = await service
      .from("whatsapp_messages")
      .select("id")
      .eq("phone", to).eq("direction", "inbound").gt("created_at", new Date(reportAt).toISOString()).limit(1);
    if (Array.isArray(replies) && replies.length) return { eligible: false, reason: "replied_since" };

    if (now - reportAt < MIN_MS) return { eligible: false, reason: "too_recent" };
    return { eligible: true, reason: "eligible" };
  } catch {
    return { eligible: false, reason: "check_failed" }; // fail closed
  }
}
