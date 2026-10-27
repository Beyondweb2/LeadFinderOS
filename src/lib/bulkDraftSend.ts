/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEND DRAFTS — approve and send several AI drafts at once (Paul, 2026-10-27).

   In the Inbox's "Select several…" mode, Paul ticks conversations whose AI draft he has read, and each lead is sent ITS
   OWN draft, exactly as shown (a hook draft signed with the approver's chosen name, src/lib/hookSignature.ts). There is
   no bulk editing and no shared message.

   ⛔ EACH LEAD GOES THROUGH THE SINGLE "Approve & send" PATH, one after another:
        claim (fn ai-reply-drafts, the once-only conditional write; `bulk: true` adds two refusals: they replied again
        after the draft, and a lead marked no WhatsApp) → the Inbox's own send (useInbox.send → send-whatsapp-message:
        send hours, daily caps, opt-outs, the 24-hour rule, Meta) → complete (sent) or complete + discard (queued).
      Nothing here talks to Meta and nothing is bypassed.
   ⛔ ONLY "Needs approving" drafts. A Needs-you draft, a draft past the 24-hour window, a stop, a draft still Drafting…
      or Sending… is SKIPPED with its reason, never sent. A person decides those in the thread.
   ⛔ No name chosen and a hook draft in the batch → nothing is sent; the name box opens.
   ⛔ SEQUENTIAL, never Promise.all, and at most BULK_DRAFT_MAX per batch (the same reasons as inboxBulkSend.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { needsApproving, rowSendable, type AiReplyRow } from './aiReplyDraft';
import { isHookDraft, signHook } from './hookSignature';
import { unresolvedTokens } from './leadUtils';

/** The most drafts one batch sends. Twenty is as many as a person reads properly in one confirm list, and keeps a
 *  sequential batch (three calls each) to about a minute. More selected → the first twenty go, the rest are listed. */
export const BULK_DRAFT_MAX = 20;

/** Lead statuses that mean "this number is not on WhatsApp" (the landline marker included). */
export const NO_WHATSAPP_STATUSES: ReadonlySet<string> = new Set(['no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed']);

export interface DraftCandidate {
  key: string;
  leadId: string | null;
  label: string;
  phone: string;
  leadStatus: string | null;
  /** The newest inbound message on the conversation (the list's own reading). */
  lastInboundAt: string | null;
  lastInboundText: string | null;
  /** The conversation's open AI row, if any (useAiReplyDrafts.forPhone). */
  row: AiReplyRow | null;
}

export interface DraftItem {
  key: string;
  leadId: string | null;
  label: string;
  phone: string;
  draftId: string | null;
  /** The words that will be sent: the draft, signed when it is the hook. */
  body: string;
  isHook: boolean;
  theirLast: string;
  skip: string | null;
}

export interface DraftPlan {
  send: DraftItem[];
  skipped: DraftItem[];
  /** A hook draft is selected and the person has no name chosen: send nothing, open the name box. */
  needsName: boolean;
}

/** One line, for the confirm list. */
export function oneLine(text: string | null | undefined, max = 90): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Why a selected conversation will NOT be sent its draft, or null when it can be. */
export function draftSkipReason(c: DraftCandidate, nowMs: number = Date.now()): string | null {
  const r = c.row;
  if (!c.leadId) return 'no lead linked';
  if (!r || !r.draft_text?.trim()) return 'no waiting draft';
  if (r.status === 'generating') return 'still drafting';
  if (r.status === 'sending') return 'already being sent';
  if (r.status !== 'pending') return 'draft no longer waiting';
  if (r.why?.stop === true) return 'they asked to stop';
  if (r.kind === 'needs_you') return 'needs you: answer it in the thread';
  if (!needsApproving(r, nowMs) || !rowSendable(r, nowMs)) return '24-hour window closed: needs a template';
  if (c.leadStatus && NO_WHATSAPP_STATUSES.has(c.leadStatus)) return 'marked no WhatsApp';
  /* A message newer than the one the draft answers: the draft may no longer fit. Read it first. */
  if (c.lastInboundAt && Date.parse(c.lastInboundAt) > Date.parse(r.inbound_at) + 1000) return 'they replied again after the draft';
  return null;
}

/** The batch: who is sent what, who is skipped and why. Selection order is kept; past BULK_DRAFT_MAX is skipped. */
export function planDraftSend(cands: readonly DraftCandidate[], opts: { senderName: string | null; nowMs?: number }): DraftPlan {
  const nowMs = opts.nowMs ?? Date.now();
  const send: DraftItem[] = [];
  const skipped: DraftItem[] = [];
  let needsName = false;
  for (const c of cands) {
    const r = c.row;
    const isHook = isHookDraft(r?.why ?? null);
    const raw = (r?.draft_text ?? '').trim();
    const body = isHook && opts.senderName && raw ? signHook(raw, opts.senderName) : raw;
    const item: DraftItem = { key: c.key, leadId: c.leadId, label: c.label, phone: c.phone, draftId: r?.id ?? null, body, isHook, theirLast: oneLine(c.lastInboundText), skip: null };
    let skip = draftSkipReason(c, nowMs);
    if (!skip && unresolvedTokens(body).length) skip = 'the draft still has blanks to fill';
    if (!skip && send.length >= BULK_DRAFT_MAX) skip = `over the ${BULK_DRAFT_MAX} per batch limit`;
    if (skip) { skipped.push({ ...item, skip }); continue; }
    if (isHook && !opts.senderName) needsName = true;
    send.push(item);
  }
  return { send, skipped, needsName };
}

/** At least one selected conversation has a draft that is waiting for approval: the "Send drafts" action shows. */
export const anyDraftWaiting = (cands: readonly DraftCandidate[], nowMs: number = Date.now()) =>
  cands.some((c) => needsApproving(c.row, nowMs) && rowSendable(c.row, nowMs));

/* ── the run ─────────────────────────────────────────────────────────────────────────────────── */

export type DraftOutcomeKind = 'sent' | 'queued' | 'failed' | 'skipped';
export interface DraftOutcome {
  key: string;
  label: string;
  kind: DraftOutcomeKind;
  reason?: string;
  /** Queued for their send hours: when it goes, and the scheduled row (cancellable as today). */
  sendAt?: string;
  tz?: string;
  scheduledId?: string;
  simulated?: boolean;
}

export interface SendResult { ok: boolean; simulated?: boolean; error?: string; reason?: string; messageId?: string; scheduled?: { id: string; send_at: string; tz: string } }

/** A claim the server REFUSED (a reason it gave) vs a call that did not get an answer. */
export interface ClaimResult { ok: boolean; refused?: boolean; reason?: string }

export interface DraftRunDeps {
  claim: (draftId: string, body: string) => Promise<ClaimResult>;
  send: (item: DraftItem) => Promise<SendResult>;
  complete: (draftId: string, messageId: string | null, error: string | null) => Promise<void>;
  discard: (draftId: string) => Promise<void>;
  onProgress?: (done: number, outcome: DraftOutcome) => void;
}

/**
 * Send each planned draft, one at a time, exactly as the single Approve & send does. Failures are collected, never
 * thrown: one refusal never abandons the rest. A claim lost or refused sends NOTHING for that lead.
 */
export async function runDraftBatch(items: readonly DraftItem[], deps: DraftRunDeps): Promise<DraftOutcome[]> {
  const out: DraftOutcome[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    let o: DraftOutcome;
    if (!it.draftId || seen.has(it.draftId)) {
      o = { key: it.key, label: it.label, kind: 'skipped', reason: 'same draft twice in the batch' };
    } else {
      seen.add(it.draftId);
      o = await runOne(it, it.draftId, deps);
    }
    out.push(o);
    deps.onProgress?.(out.length, o);
  }
  return out;
}

async function runOne(it: DraftItem, draftId: string, deps: DraftRunDeps): Promise<DraftOutcome> {
  const base = { key: it.key, label: it.label };
  /* 1. The once-only claim. Refused → skipped with the server's reason; no answer → failed. Nothing sent either way. */
  let c: ClaimResult;
  try { c = await deps.claim(draftId, it.body); } catch (e) { c = { ok: false, refused: false, reason: e instanceof Error ? e.message : 'could not be approved' }; }
  if (!c.ok) return { ...base, kind: c.refused ? 'skipped' : 'failed', reason: c.reason ?? 'could not be approved' };
  /* 2. The normal send path. */
  let res: SendResult;
  try { res = await deps.send(it); } catch (e) { res = { ok: false, error: 'send_failed', reason: e instanceof Error ? e.message : 'send failed' }; }
  /* 3. Record it, as the single approve does. Queued: complete then discard, so the same draft can never go twice. */
  if (res.ok && res.scheduled) {
    await deps.complete(draftId, null, 'queued_for_send_hours').catch(() => undefined);
    await deps.discard(draftId).catch(() => undefined);
    return { ...base, kind: 'queued', sendAt: res.scheduled.send_at, tz: res.scheduled.tz, scheduledId: res.scheduled.id };
  }
  await deps.complete(draftId, res.ok ? (res.messageId ?? null) : null, res.ok ? null : (res.reason ?? res.error ?? 'send_failed')).catch(() => undefined);
  if (!res.ok) return { ...base, kind: 'failed', reason: res.reason ?? (res.error === 'window_closed' ? 'the 24-hour window closed' : res.error) ?? 'send failed' };
  return { ...base, kind: 'sent', simulated: res.simulated };
}

export function draftOutcomeSummary(outcomes: readonly DraftOutcome[]): string {
  const n = (k: DraftOutcomeKind) => outcomes.filter((o) => o.kind === k).length;
  const parts = [`${n('sent')} sent`, `${n('queued')} queued`];
  if (n('failed')) parts.push(`${n('failed')} failed`);
  if (n('skipped')) parts.push(`${n('skipped')} skipped`);
  return 'Drafts: ' + parts.join(' · ');
}
