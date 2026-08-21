/* ════════════════════════════════════════════════════════════════════════════════════════════
   contact_followup ELIGIBILITY — the authoritative, server-side gate for the bulk OPENER follow-up.

   The EARLIER-stage nudge (before any report): a lead who got the initial_contact opener and never
   replied at all. Sibling of hook-followup-eligibility.ts (the REPORT follow-up), same shape and
   same fail-closed contract — only the anchor message differs (initial_contact, not audit_reply).
   Re-checked per-lead at send time by the contact_followup drain lane in process-whatsapp-queue;
   the client's Outreach skip filter is a display convenience, this is the guard. A lead is eligible
   when:
     • it is NOT a paying customer (amount_paid = 0) — never chase someone who bought;
     • it RECEIVED the opener (a non-failed outbound initial_contact exists) — that send's time is
       the "first contacted" clock;
     • it has NOT already had a contact_followup (one per lead, ever — non-failed outbound);
     • NO inbound arrived AFTER the opener (they went quiet — any reply disqualifies: a reply means
       the conversation moved on, and this is the "never replied" nudge);
     • it has been at least CONTACT_FOLLOWUP_MIN_DAYS since that opener.
   Phone-keyed (not lead_id) so it matches the Inbox's conversation semantics and is robust to
   duplicate lead rows sharing a number. Best-effort reads; any thrown query is a refusal (fail
   closed — never send on an unresolved guard).

   ⛔ CONTACT_FOLLOWUP_MIN_DAYS must match the client's constant of the same name in
   src/components/OutreachTable.tsx.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { toWhatsAppNumber } from "./whatsapp-send.ts";

export const CONTACT_FOLLOWUP_MIN_DAYS = 3;
const MIN_MS = CONTACT_FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;

export interface ContactLeadLite {
  id: string;
  phone: string | null;
  country: string | null;
  amount_paid: number | null;
}

export interface ContactEligibility { eligible: boolean; reason: string }

// deno-lint-ignore no-explicit-any
export async function contactFollowupEligible(service: any, lead: ContactLeadLite, now = Date.now()): Promise<ContactEligibility> {
  try {
    if ((lead.amount_paid ?? 0) > 0) return { eligible: false, reason: "paid" };
    const to = toWhatsAppNumber(lead.phone ?? "", lead.country);
    if (!to) return { eligible: false, reason: "bad_number" };

    // The opener (initial_contact) — most recent non-failed outbound to this number.
    const { data: openers } = await service
      .from("whatsapp_messages")
      .select("created_at")
      .eq("phone", to).eq("direction", "outbound").eq("template_name", "initial_contact").neq("status", "failed")
      .order("created_at", { ascending: false }).limit(1);
    const openerAt = openers?.[0]?.created_at ? new Date(openers[0].created_at).getTime() : 0;
    if (!openerAt) return { eligible: false, reason: "no_opener" };

    // One per lead, ever — a contact_followup already went out.
    const { data: prior } = await service
      .from("whatsapp_messages")
      .select("id")
      .eq("phone", to).eq("direction", "outbound").eq("template_name", "contact_followup").neq("status", "failed").limit(1);
    if (Array.isArray(prior) && prior.length) return { eligible: false, reason: "already_sent" };

    // Any inbound AFTER the opener → they replied, not quiet. (This also excludes anyone who went on
    // to the report/hook path, since that only happens after a reply.)
    const { data: replies } = await service
      .from("whatsapp_messages")
      .select("id")
      .eq("phone", to).eq("direction", "inbound").gt("created_at", new Date(openerAt).toISOString()).limit(1);
    if (Array.isArray(replies) && replies.length) return { eligible: false, reason: "replied_since" };

    if (now - openerAt < MIN_MS) return { eligible: false, reason: "too_recent" };
    return { eligible: true, reason: "eligible" };
  } catch {
    return { eligible: false, reason: "check_failed" }; // fail closed
  }
}
