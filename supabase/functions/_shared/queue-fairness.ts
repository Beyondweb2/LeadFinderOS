/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PER-SENDER FAIRNESS FOR THE WHATSAPP QUEUE (Paul, 2026-11-16)

   "The WhatsApp queue takes turns between senders (each rep and my own outreach), round-robin, so Valentin's messages go
   out alongside mine, not behind."

   🔴 WHY THE CAMPAIGN ROUND-ROBIN WAS NOT ENOUGH. interleaveByCampaign ranks each campaign's leads 0,1,2… and breaks a tie
   between two rank-0 leads by queued_at. The queue sends ONE lead per tick and re-derives the order every tick, so after A0
   goes, A1 becomes A's new rank 0 — and if A was queued first, A1 still beats B0 on queued_at. The rotation only alternated
   inside one tick's look-ahead list, never ACROSS ticks. A sender who queued later waited behind the whole earlier batch.

   ⛔ THE FIX IS STILL STATELESS (the campaign file explains why that is load-bearing). No cursor, no "last sender" column:
   the tie-break between senders is each sender's MOST RECENT QUEUE SEND, read from whatsapp_sends each tick. The sender
   served least recently goes first; a sender who has not sent today goes before one who has. After a send that sender is
   the most recently served, so the next tick's head is someone else. Two senders → A, B, A, B … across ticks.

   ⛔ IT CHANGES WHICH LEAD GOES, NEVER HOW MANY OR HOW FAST. One send per tick, the per-country caps, send hours, the cold
   guard, opt-outs, Do Not Contact, the free-window rules and every hold are untouched (they run before and after this).

   Within one sender, that sender's campaigns still take turns (interleaveByCampaign), so nothing about campaign fairness
   is lost.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { interleaveByCampaign, type InterleavableLead } from "./campaign-interleave.ts";

/** A lead with no person on it at all. Cannot collide with a uuid. */
export const NO_SENDER_KEY = "(no sender)";

export interface SenderLead extends InterleavableLead {
  queued_by_user_id?: string | null;
  assigned_to_user_id?: string | null;
  user_id?: string | null;
}

/** Whose turn a lead uses: the person who queued it, else the person who holds it, else the book it sits in. */
export function senderKeyOf(l: SenderLead): string {
  return l.queued_by_user_id || l.assigned_to_user_id || l.user_id || NO_SENDER_KEY;
}

/**
 * Round-robin across SENDERS (least recently served first), campaigns round-robin inside each sender.
 * `lastSentAt`: each sender's most recent queue send (ISO). Absent = has not sent (goes first). Input is not mutated.
 */
export function fairQueueOrder<T extends SenderLead>(leads: readonly T[], lastSentAt: ReadonlyMap<string, string>): T[] {
  if (leads.length < 2) return [...leads];
  const bySender = new Map<string, T[]>();
  for (const l of leads) {
    const k = senderKeyOf(l);
    const b = bySender.get(k);
    if (b) b.push(l); else bySender.set(k, [l]);
  }
  const senders = [...bySender.entries()].map(([key, ls]) => {
    const ordered = interleaveByCampaign(ls);
    return { key, ordered, last: lastSentAt.get(key) ?? "", head: ordered[0]?.queued_at ?? "" };
  });
  /* Least recently served first ("" = never, so first); then whoever has waited longest; then the key (deterministic). */
  senders.sort((a, b) => (a.last !== b.last ? (a.last < b.last ? -1 : 1) : a.head !== b.head ? (a.head < b.head ? -1 : 1) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const out: T[] = [];
  const longest = Math.max(...senders.map((s) => s.ordered.length));
  for (let i = 0; i < longest; i++) for (const s of senders) if (i < s.ordered.length) out.push(s.ordered[i]);
  return out;
}

/** How many distinct senders are in the list (for the tick's log line). */
export function sendersRepresented(leads: readonly SenderLead[]): number {
  return new Set(leads.map(senderKeyOf)).size;
}

/* ── STUCK: a sender whose queued messages have not moved ─────────────────────────────────────────
   Paul: "if any sender's queued messages haven't moved for 30 minutes during send hours, email me once (not repeating),
   and show the reason on that rep's queue screen."
   ⛔ ONLY WHEN NOTHING EXPLAINS IT. Outside send hours, while the queue is paused, or with today's limit used, nothing is
   meant to move: that is a PAUSE with its own words, never a stuck alarm.
   ⚠️ THE THRESHOLD IS 30 MINUTES OR ONE HONEST TURN, WHICHEVER IS LONGER. With five senders at an 8-minute pace a sender's
   own turn comes every ~40 minutes; alarming at 30 would email Paul about the rotation working. So the bar is
   max(30, 1.5 × senders × pace gap). The episode starts at the sender's last move, and that start is the alert's dedupe
   key: one email per episode, a new one only after it has moved and then stuck again. */
export const STUCK_MINUTES = 30;

export function stuckThresholdMin(activeSenders: number, gapMin: number): number {
  return Math.max(STUCK_MINUTES, Math.ceil(1.5 * Math.max(1, activeSenders) * Math.max(0, gapMin)));
}

export interface StuckInput {
  nowMs: number;
  /** Send hours open, queue not paused, today's limit not used — i.e. something SHOULD be moving. */
  shouldBeMoving: boolean;
  /** This sender's most recent queue send today (ISO), if any. */
  lastSentAt: string | null;
  /** The oldest of this sender's queued leads that could go right now (ISO), if any. */
  oldestSendableQueuedAt: string | null;
  activeSenders: number;
  gapMin: number;
  /** When send hours opened TODAY (ISO, 07:00 London). ⛔ The clock never starts before this: overnight nothing is meant to
   *  move. 2026-11-17: without it, the 07:00:21 tick saw "nothing sent today" + a lead queued yesterday 11:21 and emailed
   *  "Valentin's messages not moving since 11:21" — his first send went 2 seconds later. */
  windowOpenedAt: string;
}

/** Stuck since when (ISO) — the latest of the last send, the oldest waiting lead and today's opening — or null when not stuck. */
export function stuckSince(i: StuckInput): string | null {
  if (!i.shouldBeMoving || !i.oldestSendableQueuedAt) return null;
  const latest = (a: string, b: string | null) => (b && Date.parse(b) > Date.parse(a) ? b : a);
  const since = latest(latest(i.oldestSendableQueuedAt, i.lastSentAt), i.windowOpenedAt);
  const waitedMin = (i.nowMs - Date.parse(since)) / 60000;
  return waitedMin >= stuckThresholdMin(i.activeSenders, i.gapMin) ? since : null;
}

export function stuckDedupeKey(senderKey: string, sinceIso: string): string {
  return `queue_stuck:${senderKey}:${sinceIso}`;
}

/* ── THE LINE A REP READS ─────────────────────────────────────────────────────────────────────────
   "Queued: 12, next send ~14:20" or "Paused: daily limit reached". One rule, one place, so the rep's screen and the admin's
   per-sender list say the same words. */
export type QueueLineInput = {
  queued: number;
  paused: boolean;
  windowOpen: boolean;
  windowStart: string;
  capReached: boolean;
  coldStop: string | null;
  /** Estimated next send for this sender (ISO) when it is moving. */
  nextSendAt: string | null;
  stuckReason: string | null;
  stuckSinceIso: string | null;
};

export function hhmmLondon(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function senderQueueLine(i: QueueLineInput): { state: "empty" | "paused" | "stuck" | "queued"; line: string } {
  if (i.queued <= 0) return { state: "empty", line: "Queued: 0" };
  if (i.paused) return { state: "paused", line: `Paused: the queue is paused (${i.queued} queued)` };
  if (i.coldStop) return { state: "paused", line: `Paused: ${i.coldStop} (${i.queued} queued)` };
  if (i.capReached) return { state: "paused", line: `Paused: daily limit reached (${i.queued} queued)` };
  if (!i.windowOpen) return { state: "paused", line: `Paused: outside send hours, starts ${i.windowStart} (${i.queued} queued)` };
  if (i.stuckSinceIso) {
    return { state: "stuck", line: `Not moving since ${hhmmLondon(i.stuckSinceIso)}: ${i.stuckReason ?? "the queue has not picked these up"} (${i.queued} queued)` };
  }
  return { state: "queued", line: i.nextSendAt ? `Queued: ${i.queued}, next send ~${hhmmLondon(i.nextSendAt)}` : `Queued: ${i.queued}` };
}

/** This sender's estimated next send: the queue's next send plus one pace gap for each sender served before them. */
export function senderNextSendAt(queueNextIso: string, sendersAhead: number, gapMin: number): string {
  return new Date(Date.parse(queueNextIso) + Math.max(0, sendersAhead) * Math.max(0, gapMin) * 60000).toISOString();
}

/** Why a sender's leads are not going, from what the tick saw. Plain words for the rep's screen and the email. */
export function stuckReasonWords(f: { queued: number; sendable: number; waitingOnAudit: number }): string {
  if (f.sendable === 0) return "none of their queued leads can go right now (outside the lead's own hours, its country is off, or it is held)";
  if (f.waitingOnAudit >= f.sendable) return "every lead that could go is waiting for its AI audit to finish";
  return "the queue has not picked these up — check the queue screen";
}
