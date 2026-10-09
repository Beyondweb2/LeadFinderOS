// sms-inbound — what an inbound TEXT does to its lead (2026-10-09). The SMS twin of _shared/whatsapp-inbound.ts, which is the reference.
//
//   · the lead moves to Replied exactly as a WhatsApp reply moves it: from every status except the strong ones and Replied itself
//     (INBOUND_NO_DOWNGRADE — Not interested and Report sent DO flip: a reply means they re-engaged). One list, shared with WhatsApp.
//   · the unread mark and the notification come from the sms_messages row itself (my_sms_unread_counts, trg_notify_sms) — nothing here.
//   · a number that matches SEVERAL leads and was never texted lands Unassigned and the book owner is told once (as WhatsApp does).
//   · the "When a prospect replies" rule: the SAME stored setting and the SAME once-ever claim (armFirstReplyAuditIntent), with channel 'sms':
//     audit only (a text reply never sends), a recent check is reused, the audit draws from the prospecting pool only, and the audit never
//     changes a status.
//   · STOP / opt-out is handled BEFORE any of this, by the caller, and is untouched.
// A failure here never loses the message: the row is already stored, and every step is best-effort and logged.
import { armFirstReplyAuditIntent } from "./first-reply-audit.ts";
import { countsAsFirstReply } from "../../../src/lib/firstReplyAutomation.ts";
import { INBOUND_NO_DOWNGRADE, postgrestList } from "../../../src/lib/strongStatuses.ts";
import { chooseInboundLead, type InboundLeadCandidate } from "../../../src/lib/inboundMatch.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
const NO_DOWNGRADE = postgrestList(INBOUND_NO_DOWNGRADE);

export interface SmsOwner { leadId: string | null; userId: string | null; ambiguous: number }

/** Which lead is this number? The lead we last texted from it; else the canonical-phone candidates, decided by the shared chooser (one lead →
 *  that lead; several → ambiguous, never a guess). Same rule as WhatsApp's resolveOwner. */
export async function resolveSmsOwner(service: Service, digits: string): Promise<SmsOwner> {
  const { data: last } = await service.from("sms_messages").select("lead_id, user_id").eq("phone", digits).eq("direction", "outbound")
    .not("lead_id", "is", null).order("created_at", { ascending: false }).limit(1);
  if (Array.isArray(last) && last[0]?.lead_id) return { leadId: last[0].lead_id, userId: last[0].user_id ?? null, ambiguous: 0 };
  const { data: cands, error } = await service.rpc("inbound_lead_candidates", { _phone: digits });
  if (error) {
    console.error(`[sms-inbound] candidate lookup failed for ${digits}: ${String((error as { message?: string }).message ?? error)} — Unassigned`);
    return { leadId: null, userId: null, ambiguous: 0 };
  }
  const choice = chooseInboundLead((cands ?? []) as InboundLeadCandidate[]);
  if (choice.kind === "matched") return { leadId: choice.leadId, userId: choice.userId ?? null, ambiguous: 0 };
  if (choice.kind === "ambiguous") return { leadId: null, userId: null, ambiguous: choice.candidates };
  return { leadId: null, userId: null, ambiguous: 0 };
}

async function notifyAmbiguous(service: Service, digits: string, candidates: number, messageId: string) {
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
    const to = (owner?.user_id as string | undefined) ?? null;
    if (!to) return;
    const { error } = await service.rpc("notify_person", {
      _user: to, _kind: "sms_reply", _title: "Text reply needs matching",
      _body: `+${digits} texted in and that number is on ${candidates} leads. Open the Inbox and attach it to the right lead.`,
      _link: "/inbox?channel=sms", _lead: null, _dedupe: `sms-ambiguous:${messageId}`, _priority: 2,
    });
    if (error) console.error(`[sms-inbound] ambiguous notification failed: ${String((error as { message?: string }).message ?? error)}`);
  } catch (e) { console.error("[sms-inbound] ambiguous notification error:", e instanceof Error ? e.message : String(e)); }
}

/** Their first HUMAN reply after our first real text (the SMS twin of firstInboundForLead). */
async function firstInboundSms(service: Service, leadId: string, messageId: string): Promise<{ first: boolean; reliable: boolean }> {
  const { data: firstOut, error: oErr } = await service.from("sms_messages").select("created_at").eq("lead_id", leadId).eq("direction", "outbound")
    .not("status", "in", "(failed,undelivered)").order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
  if (oErr) { console.error(`[sms-inbound] first-outbound lookup failed (${leadId}): ${oErr.message}`); return { first: false, reliable: false }; }
  /* A reply from a lead we never texted (they texted us first, or we only used WhatsApp) is still their first reply on the text channel:
     the once-ever claim per lead is the real dedupe, so "no outbound text" does not disqualify it. */
  let q = service.from("sms_messages").select("id, body").eq("lead_id", leadId).eq("direction", "inbound");
  if (firstOut?.created_at) q = q.gte("created_at", firstOut.created_at);
  const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(50);
  if (error) { console.error(`[sms-inbound] first-inbound lookup failed (${leadId}): ${error.message}`); return { first: false, reliable: false }; }
  const firstHuman = ((data ?? []) as Array<{ id: string; body: string | null }>).find((m) => countsAsFirstReply(m.body));
  return { first: firstHuman?.id === messageId, reliable: true };
}

/** A stored, non-STOP inbound text: move the lead and run the reply rule. Never throws. */
export async function handleInboundSmsReply(service: Service, a: { leadId: string | null; digits: string; body: string; messageId: string; sid: string; ambiguous: number }): Promise<{ replied: boolean; audit: string }> {
  try {
    if (!a.leadId) {
      if (a.ambiguous > 0) await notifyAmbiguous(service, a.digits, a.ambiguous, a.messageId);
      return { replied: false, audit: "no_lead" };
    }
    await service.from("outreach_leads").update({ status: "replied" }).eq("id", a.leadId).not("status", "in", NO_DOWNGRADE);
    const first = await firstInboundSms(service, a.leadId, a.messageId);
    const { data: lead } = await service.from("outreach_leads").select("is_archived").eq("id", a.leadId).maybeSingle();
    const armed = await armFirstReplyAuditIntent({
      service, leadId: a.leadId, phone: a.digits, wamid: a.sid || null,
      firstInbound: first.first, firstInboundReliable: first.reliable, archived: lead?.is_archived === true, body: a.body, channel: "sms",
    });
    console.log(`[sms-first-reply-audit] lead ${a.leadId}: ${armed.reason}`);
    return { replied: true, audit: armed.reason };
  } catch (e) {
    console.error("[sms-inbound] handler error:", e instanceof Error ? e.message : String(e));
    return { replied: false, audit: "error" };
  }
}
