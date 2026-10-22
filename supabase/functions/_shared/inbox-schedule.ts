// inbox-schedule — the edge half of the Inbox send window (rules: src/lib/inboxSendWindow.ts).
//
// Each Inbox sender (send-whatsapp-message via:"inbox", send-whatsapp-voice, twilio-sms-send via:"inbox") asks `queueGate`
// AFTER its own checks and BEFORE anything leaves: inside the window it answers null and the send goes exactly as before;
// outside, it writes ONE inbox_scheduled_sends row and the sender answers { ok:true, scheduled }. The drain
// (fn inbox-scheduled-send) later sends the row AS the person who queued it, through the same sender, with every check re-run.
//
// ⛔ THE DRAIN'S DOOR IS THE ROW, NEVER THE REQUEST. `scheduledSendFor` accepts only a CRON_SECRET call naming a row the drain has
//    CLAIMED (status 'sending'); the person, the lead, the number and the words all come from that row, and the person's role is
//    re-read from user_roles now (a disabled account sends nothing).
// ⛔ FAILS TOWARDS NOT SENDING: an unreadable setting answers the outreach hours, never "always open"; a failed insert is a
//    refusal ("could not queue"), never a send outside the window.
import { isInternalCall } from "./access.ts";
import { loadCountrySettings } from "./country-settings.ts";
import { pickRole, type Actor } from "../../../src/lib/roleRules.ts";
import {
  queueDecision, replyHoursFrom, replyWindowFor, replyWindowOpen, hhmm,
  type InboxChannel, type ReplyHours, type ScheduledKind,
} from "../../../src/lib/inboxSendWindow.ts";
import type { SendWindow } from "../../../src/lib/sendWindow.ts";
import { mobileMarketOf, PER_LEAD_ZONE_MARKETS } from "../../../src/lib/outreachMarkets.ts";
import { AU_ZONE_COLUMNS, auLeadTz } from "../../../src/lib/auLeadZone.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const SCHEDULED_JOB_HEADER = "inbox-scheduled-send";

export async function loadReplyHours(service: Service): Promise<ReplyHours | null> {
  try {
    const { data, error } = await service.from("whatsapp_outreach_state").select("reply_start_min, reply_end_min").eq("id", 1).maybeSingle();
    if (error) return null;
    return replyHoursFrom(data as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

/** An Australian lead's zone, read from the LEAD (src/lib/auLeadZone.ts). Null = needs state (also: no lead, a failed read). */
export async function leadTzFor(service: Service, digits: string, leadId: string | null | undefined): Promise<string | null> {
  const m = mobileMarketOf(digits);
  if (!m || !PER_LEAD_ZONE_MARKETS.has(m) || !leadId) return null;
  try {
    const { data, error } = await service.from("outreach_leads").select(AU_ZONE_COLUMNS).eq("id", leadId).maybeSingle();
    return error ? null : auLeadTz(data as Record<string, string | null> | null);
  } catch {
    return null;
  }
}

/** `ctx.leadTz` (a queued row's stored zone) wins; else an Australian number's zone is read from `ctx.leadId`. Neither = needs
 *  state for Australia (never sent); every other number is unaffected. */
export async function replyWindowForDest(service: Service, channel: InboxChannel, digits: string,
                                         ctx: { leadId?: string | null; leadTz?: string | null } = {}): Promise<SendWindow> {
  const [replyHours, countrySettings, leadTz] = await Promise.all([
    loadReplyHours(service), loadCountrySettings(service), ctx.leadTz ? Promise.resolve(ctx.leadTz) : leadTzFor(service, digits, ctx.leadId),
  ]);
  return replyWindowFor(channel, digits, { replyHours, countrySettings, leadTz });
}

export interface QueueRow {
  bookUserId: string;
  leadId: string | null;
  phone: string;               // WhatsApp digits
  channel: InboxChannel;
  kind: ScheduledKind;
  body: string | null;
  templateName?: string | null;
  allowResend?: boolean;
  linkVariant?: string | null;
  smsExtended?: { template: string; body: string } | null;
  mediaPath?: string | null;
  durationMs?: number | null;
  queuedBy: string;
}

export type GateAnswer =
  | null
  | { ok: true; scheduled: { id: string; send_at: string; tz: string; status: "scheduled" }; reply_window: { open: false; opens: string } }
  | { ok: false; error: string; reason: string };

/** null = inside the window, send now. Otherwise the answer the sender returns as it is. `beforeInsert` runs only when queuing
 *  (the voice note stores its recording there) and may refuse. */
export async function queueGate(service: Service, row: QueueRow, lastInboundAt: string | number | null,
                                beforeInsert?: () => Promise<{ ok: true } | { ok: false; error: string; reason: string }>,
                                now: Date = new Date()): Promise<GateAnswer> {
  const w = await replyWindowForDest(service, row.channel, row.phone, { leadId: row.leadId });
  const d = queueDecision({ channel: row.channel, kind: row.kind, window: w, now, lastInboundAt });
  if (d.kind === "send_now") return null;
  if (d.kind === "refuse") return { ok: false, error: d.error, reason: d.detail };
  if (beforeInsert) {
    const pre = await beforeInsert();
    if (!pre.ok) return pre;
  }
  const { data, error } = await service.from("inbox_scheduled_sends").insert({
    user_id: row.bookUserId, lead_id: row.leadId, phone: row.phone, channel: row.channel, kind: row.kind,
    body: row.body, template_name: row.templateName ?? null, allow_resend: row.allowResend === true, link_variant: row.linkVariant ?? null,
    sms_extended: row.smsExtended ?? null, media_path: row.mediaPath ?? null, duration_ms: row.durationMs ?? null,
    send_at: d.sendAt, tz: d.tz, status: "scheduled", queued_by: row.queuedBy, checked_at: now.toISOString(),
  }).select("id, send_at, tz").single();
  if (error || !data) {
    console.error("[inbox-schedule] queue insert failed:", String((error as { message?: string } | null)?.message ?? "no row"));
    return { ok: false, error: "queue_failed", reason: `It is outside their send hours (opens ${hhmm(w.startMin)}) and the message could not be queued, so nothing was sent. Try again.` };
  }
  return { ok: true, scheduled: { id: data.id, send_at: data.send_at, tz: data.tz, status: "scheduled" }, reply_window: { open: false, opens: hhmm(w.startMin) } };
}

export interface ScheduledRow {
  id: string; user_id: string; lead_id: string | null; phone: string; channel: InboxChannel; kind: ScheduledKind;
  body: string | null; template_name: string | null; allow_resend: boolean; link_variant: string | null;
  sms_extended: { template: string; body: string } | null; media_path: string | null; duration_ms: number | null;
  send_at: string; tz: string; status: string; queued_by: string; checked_at: string; created_at: string;
}

export const SCHEDULED_COLUMNS = "id, user_id, lead_id, phone, channel, kind, body, template_name, allow_resend, link_variant, sms_extended, media_path, duration_ms, send_at, tz, status, queued_by, checked_at, created_at";

/** The drain calling a sender: a CRON_SECRET call + the job header + a CLAIMED row. Anything else → null (the caller then
 *  authenticates the ordinary way). A matching header with a bad row is a refusal, never a fall-through. */
export async function scheduledSendFor(req: Request, service: Service, scheduledId: unknown, channel: InboxChannel):
  Promise<null | { ok: true; row: ScheduledRow; actor: Actor } | { ok: false; error: string }> {
  if (req.headers.get("x-internal-job") !== SCHEDULED_JOB_HEADER) return null;
  if (!isInternalCall(req)) return { ok: false, error: "forbidden" };
  if (typeof scheduledId !== "string" || !scheduledId) return { ok: false, error: "scheduled_id_required" };
  const { data, error } = await service.from("inbox_scheduled_sends").select(SCHEDULED_COLUMNS).eq("id", scheduledId).maybeSingle();
  if (error || !data) return { ok: false, error: "scheduled_not_found" };
  const row = data as ScheduledRow;
  if (row.status !== "sending" || row.channel !== channel) return { ok: false, error: "scheduled_not_claimed" };
  const { data: roles, error: rErr } = await service.from("user_roles").select("role").eq("user_id", row.queued_by);
  if (rErr) return { ok: false, error: "auth_unavailable" };
  const role = pickRole(roles);
  if (!role) return { ok: false, error: "no_role" };
  return { ok: true, row, actor: { id: row.queued_by, role } };
}

/** The sender's own last word when the drain calls it: the window must be open NOW (no door around the hours). */
export async function replyWindowOpenNow(service: Service, channel: InboxChannel, digits: string, now: Date = new Date(),
                                         ctx: { leadId?: string | null; leadTz?: string | null } = {}): Promise<boolean> {
  return replyWindowOpen(await replyWindowForDest(service, channel, digits, ctx), now);
}
