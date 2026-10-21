// ai-auto-send — the database half of Level 2 (the rule itself: src/lib/aiAutoSend.ts). Read by fn ai-reply-drafts (when a
// draft is written: queue it or not) and fn inbox-scheduled-send (just before the queued reply goes: still allowed?).
//
// ⛔ EVERY READ FAILS TOWARDS NOT SENDING: an unreadable switch row is "off", unreadable counts are "cap reached", an
//    unreadable typing mark is "a person is active now", an unreadable role is "no admin", an unreadable answer check is
//    "someone answered".
import { AUTO_SEND_DEFAULT_DAILY_CAP } from "../../../src/lib/aiAutoSend.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface AutoSendState { masterOn: boolean; intents: string[]; dailyCap: number; sendAs: string | null }

export const AUTO_SEND_OFF: AutoSendState = { masterOn: false, intents: [], dailyCap: 0, sendAs: null };

export async function loadAutoSendState(service: Service): Promise<AutoSendState> {
  try {
    const { data, error } = await service.from("whatsapp_outreach_state")
      .select("ai_handles_replies, ai_auto_send_intents, ai_auto_send_daily_cap, ai_auto_send_by").eq("id", 1).maybeSingle();
    if (error || !data) return AUTO_SEND_OFF;
    return {
      masterOn: data.ai_handles_replies === true,
      intents: Array.isArray(data.ai_auto_send_intents) ? data.ai_auto_send_intents.filter((x: unknown) => typeof x === "string") : [],
      dailyCap: Number.isInteger(data.ai_auto_send_daily_cap) ? data.ai_auto_send_daily_cap : AUTO_SEND_DEFAULT_DAILY_CAP,
      sendAs: typeof data.ai_auto_send_by === "string" ? data.ai_auto_send_by : null,
    };
  } catch {
    return AUTO_SEND_OFF;
  }
}

/** Today's automatic replies (London day). Unreadable = a number no cap allows. */
export async function autoSendCounts(service: Service): Promise<{ queuedToday: number; sentToday: number }> {
  const { data, error } = await service.rpc("ai_auto_send_counts");
  if (error || !data) return { queuedToday: Number.MAX_SAFE_INTEGER, sentToday: Number.MAX_SAFE_INTEGER };
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : Number.MAX_SAFE_INTEGER);
  return { queuedToday: n(data.queued_today), sentToday: n(data.sent_today) };
}

/** When a person last typed in / sent into / queued for this conversation. Unreadable = now (active). */
export async function personActiveAt(service: Service, phone: string): Promise<string | number | null> {
  const { data, error } = await service.rpc("ai_auto_send_person_active_at", { _phone: phone });
  if (error) return Date.now();
  return typeof data === "string" && data ? data : null;
}

/** The account the automatic reply is sent as is an admin right now. */
export async function sendAsIsAdmin(service: Service, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await service.from("user_roles").select("role").eq("user_id", userId);
  if (error) return false;
  return (data ?? []).some((r: { role?: string }) => r.role === "admin");
}

/** Someone (a person or anything else) has sent into the conversation after this inbound. Unreadable = yes. */
export async function answeredAfter(service: Service, phone: string, sinceIso: string): Promise<boolean> {
  const { data, error } = await service.from("whatsapp_messages").select("id").eq("phone", phone).eq("direction", "outbound")
    .gt("created_at", sinceIso).in("status", ["queued", "sent", "delivered", "read", "simulated"]).limit(1);
  if (error) return true;
  return (data ?? []).length > 0;
}

/** Stop a waiting automatic reply (a person approved / discarded / rewrote the draft). True = it will not go (cancelled
 *  now, or already cancelled / failed); false = it is being sent or has gone. */
export async function stopAutoSend(service: Service, scheduledId: string, reason: `ai_${string}`): Promise<boolean> {
  const { data } = await service.from("inbox_scheduled_sends")
    .update({ status: "cancelled", cancel_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", scheduledId).in("status", ["scheduled", "held"]).select("id").maybeSingle();
  if (data) return true;
  const { data: row, error } = await service.from("inbox_scheduled_sends").select("status").eq("id", scheduledId).maybeSingle();
  if (error) return false;
  return !row || row.status === "cancelled" || row.status === "failed";
}
