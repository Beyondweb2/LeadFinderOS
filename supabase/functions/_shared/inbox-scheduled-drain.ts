// inbox-scheduled-drain — one tick of the Inbox send window's drain (fn inbox-scheduled-send, every minute).
//
// ⛔ EVERYTHING WITH A SIDE EFFECT IS INJECTED (`DrainDeps`): the edge function wires Supabase and the senders;
//    scripts/inbox-send-window.test.ts wires fakes and drives every hold, cancel, order and claim. Nothing here can message anyone.
//
// THE ORDER, PER DUE ROW (oldest first):
//   1. facts     — suppression (fail closed: unreadable = wait), the lead (archived / stopped), the newest message from them on
//                  either channel, the WhatsApp 24 hours, an earlier unsent row in the same conversation;
//   2. decision  — drainDecision (src/lib/inboxSendWindow.ts): cancel / hold (Needs you) / wait / send;
//   3. claim     — scheduled → sending, a conditional write only one tick can win;
//   4. send      — through the channel's own sender, AS the person who queued it (every guard runs again there);
//   5. record    — sent (with the message id) or failed (with the sender's own reason). A failure is never retried
//                  automatically: a second attempt could double-send, and the person sees "Not sent — …" in the thread.
// Pacing: at most MAX_SENDS_PER_TICK sends a tick, PACE_MS apart (the reply path's own daily cap still counts every one).
import {
  drainDecision, nextWindowOpenAt, replyWindowFor,
  type CancelReason, type HoldReason, type InboxChannel, type ReplyHours, type ScheduledKind,
} from "../../../src/lib/inboxSendWindow.ts";
import type { CountrySettings } from "../../../src/lib/outreachMarkets.ts";

export const MAX_SENDS_PER_TICK = 10;
export const PACE_MS = 2_000;
/** A row left in 'sending' this long (a crash mid-send) is closed as unknown — never re-sent, the thread must be checked. */
export const STUCK_SENDING_MS = 10 * 60_000;

export interface DueRow {
  id: string; user_id: string; lead_id: string | null; phone: string; channel: InboxChannel; kind: ScheduledKind;
  send_at: string; created_at: string; checked_at: string;
  /** The zone it was queued in. For Australia it is the LEAD's zone (src/lib/auLeadZone.ts) and the window is read in it. */
  tz?: string | null;
  /** Level 2: an automatic AI reply (its draft). Null / absent = a person queued it. */
  ai_draft_id?: string | null;
}

/** Why an automatic AI reply was dropped (its draft then waits for a person). Stored as cancel_reason. */
export type AutoCancelReason = `ai_${string}`;

export type SendOutcome = { ok: true; messageId: string | null } | { ok: false; error: string };

export interface DrainDeps {
  now(): Date;
  replyHours: ReplyHours | null;
  countrySettings: CountrySettings | null;
  closeStuckSending(olderThanIso: string): Promise<number>;
  dueRows(nowIso: string, limit: number): Promise<DueRow[]>;
  suppression(row: DueRow): Promise<"none" | "opted_out" | "wrong_number" | "other" | "unknown">;
  lead(leadId: string): Promise<{ is_archived: boolean | null; status: string | null } | null>;
  newestInbound(row: DueRow): Promise<{ any: string | null; whatsapp: string | null }>;
  earlierPending(row: DueRow): Promise<boolean>;
  /** Conditional writes: each applies only while the row is still 'scheduled'. `claim` answers whether this tick won. */
  reschedule(id: string, sendAtIso: string): Promise<void>;
  hold(id: string, reason: HoldReason): Promise<void>;
  cancel(id: string, reason: CancelReason | AutoCancelReason): Promise<void>;
  /** Level 2 (src/lib/aiAutoSend.ts): an automatic reply's own re-check just before it goes — null = still allowed, else why
   *  it is dropped. An absent dep drops every automatic row (fails towards not sending). */
  autoRecheck?(row: DueRow): Promise<AutoCancelReason | null>;
  claim(id: string): Promise<boolean>;
  send(row: DueRow): Promise<SendOutcome>;
  finish(id: string, outcome: SendOutcome): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface TickReport { due: number; sent: number; failed: number; held: number; cancelled: number; waiting: number; stuckClosed: number }

export async function drainTick(deps: DrainDeps): Promise<TickReport> {
  const now = deps.now();
  const report: TickReport = { due: 0, sent: 0, failed: 0, held: 0, cancelled: 0, waiting: 0, stuckClosed: 0 };
  report.stuckClosed = await deps.closeStuckSending(new Date(now.getTime() - STUCK_SENDING_MS).toISOString());
  const rows = await deps.dueRows(now.toISOString(), MAX_SENDS_PER_TICK * 3);
  report.due = rows.length;
  let sends = 0;
  for (const row of rows) {
    if (sends >= MAX_SENDS_PER_TICK) break;
    const at = deps.now();
    const window = replyWindowFor(row.channel, row.phone, { replyHours: deps.replyHours, countrySettings: deps.countrySettings, leadTz: row.tz ?? null });
    const lead = row.lead_id ? await deps.lead(row.lead_id) : null;
    const inbound = await deps.newestInbound(row);
    const decision = drainDecision({
      channel: row.channel, kind: row.kind, window, now: at,
      suppression: await deps.suppression(row),
      leadArchived: lead?.is_archived === true,
      leadStatus: lead?.status ?? null,
      newestInboundAt: inbound.any,
      checkedAt: row.checked_at,
      lastWhatsappInboundAt: inbound.whatsapp,
      earlierPending: await deps.earlierPending(row),
    });
    if (decision.kind === "cancel") { await deps.cancel(row.id, decision.reason); report.cancelled++; continue; }
    /* ⛔ AN AUTOMATIC REPLY IS NEVER HELD FOR A PERSON TO RELEASE: a newer message from them, or the 24 hours gone, drops it
       and its draft waits for approval (Paul, 2026-10-21). */
    if (decision.kind === "hold" && row.ai_draft_id) { await deps.cancel(row.id, `ai_${decision.reason}`); report.cancelled++; continue; }
    if (decision.kind === "hold") { await deps.hold(row.id, decision.reason); report.held++; continue; }
    if (decision.kind === "wait") {
      /* The hours moved (the setting changed) or the clock is before them: park it at the next opening so it is not re-read every minute. */
      if (decision.why === "window_closed") await deps.reschedule(row.id, nextWindowOpenAt(window, at).toISOString());
      report.waiting++;
      continue;
    }
    if (row.ai_draft_id) {
      let why: AutoCancelReason | null = "ai_recheck_unavailable";
      try { why = deps.autoRecheck ? await deps.autoRecheck(row) : "ai_recheck_unavailable"; } catch { why = "ai_recheck_failed"; }
      if (why) { await deps.cancel(row.id, why); report.cancelled++; continue; }
    }
    if (!(await deps.claim(row.id))) continue;
    if (sends > 0) await deps.sleep(PACE_MS);
    sends++;
    let outcome: SendOutcome;
    try {
      outcome = await deps.send(row);
    } catch (e) {
      outcome = { ok: false, error: `The send did not answer (${String((e as Error)?.message ?? e).slice(0, 120)}). Check the conversation before sending again.` };
    }
    await deps.finish(row.id, outcome);
    if (outcome.ok) report.sent++; else report.failed++;
  }
  return report;
}

/** What the senders answer, read into one outcome. A "scheduled" answer here would mean the window was shut after all — not sent. */
export function senderOutcome(body: Record<string, unknown> | null | undefined, messageId: unknown): SendOutcome {
  if (!body) return { ok: false, error: "The sender did not answer. Check the conversation before sending again." };
  if (body.scheduled) return { ok: false, error: "Their send hours had closed again, so it was not sent." };
  if (body.ok === true) return { ok: true, messageId: typeof messageId === "string" && messageId ? messageId : null };
  const words = [body.reason, body.detail, body.error].find((v) => typeof v === "string" && v.trim());
  return { ok: false, error: String(words ?? "The send was refused.").slice(0, 300) };
}
