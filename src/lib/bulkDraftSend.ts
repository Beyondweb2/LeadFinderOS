/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEND DRAFTS — draft and send several replies in one go (Paul, 2026-10-27; no approval step from the same day).

   In the Inbox's "Select several…" mode Paul ticks conversations and presses "Send drafts". It starts at once: a
   conversation with a waiting draft is sent THAT draft; one with none gets one from the normal drafter (fn
   ai-reply-drafts `draft`: the same rules, the same hook shapes) and is then sent it. A hook is signed with the sender's
   own chosen name (src/lib/hookSignature.ts). No bulk editing, no shared message.

   ⛔ NOBODY READS THESE BEFORE THEY GO, so src/lib/bulkDraftRule.ts decides which may go unread (Needs you, low
      confidence, price, objections, a no, opt-out, bot / auto-reply, sticker / reaction, a promised action, a fact answer,
      Australia's prospect-only words → SKIPPED with the reason). The same rule runs again in the server's `bulk: true`
      claim, at send time, on the stored row. Level 2's own rule (aiAutoSend.ts) is untouched.
   ⛔ EACH SEND IS THE SINGLE "Approve & send" PATH: claim (the once-only conditional write) → the Inbox's own send
      (useInbox.send → send-whatsapp-message: send hours, daily caps, opt-outs, the 24-hour rule, Meta) → complete (sent) or
      complete + discard (queued). Nothing here talks to Meta and nothing is bypassed.
   ⛔ THE UNDO WINDOW: drafts may be written while it runs (that sends nothing), but no claim or send starts until it has
      passed. Undo, or Stop later, sends nothing more; drafts already written stay in their threads, waiting.
   ⛔ SENDS ARE SEQUENTIAL (never Promise.all); drafts are written at most BULK_DRAFT_AT_ONCE at a time; at most
      BULK_DRAFT_MAX conversations per batch.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { needsApproving, rowSendable, type AiReplyRow } from './aiReplyDraft';
import { isHookDraft, signHook } from './hookSignature';
import { unresolvedTokens } from './leadUtils';
import { serviceWindowState } from './serviceWindow';
import { bulkDraftRefusal } from './bulkDraftRule';

/** The most conversations one batch takes. Twenty keeps a sequential batch (a draft + three calls each) to a minute or
 *  two and the drafting spend small. More selected → the first twenty go, the rest are listed as skipped. */
export const BULK_DRAFT_MAX = 20;
/** How many drafts are written at the same time. Three keeps the model spend and the database load gentle. */
export const BULK_DRAFT_AT_ONCE = 3;
/** How long "Undo" stays on screen before the first send may start. */
export const BULK_UNDO_MS = 10_000;

/** Lead statuses that mean "this number is not on WhatsApp" (the landline marker included). */
export const NO_WHATSAPP_STATUSES: ReadonlySet<string> = new Set(['no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed']);

export const UNDONE_REASON = 'stopped before sending (Undo / Stop): nothing sent';

export interface DraftCandidate {
  key: string;
  leadId: string | null;
  label: string;
  phone: string;
  leadStatus: string | null;
  /** The newest inbound message on the conversation (the list's own reading): when, its words, its WhatsApp type. */
  lastInboundAt: string | null;
  lastInboundText: string | null;
  lastInboundType?: string | null;
  /** The newest message on the conversation is ours: their last message is already answered. */
  answered?: boolean;
  /** The lead or the number is in a prospect-only country (prospectOnly.ts). */
  prospectOnly?: boolean;
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
  skip: string | null;
}

/** One line, for the results panel. */
export function oneLine(text: string | null | undefined, max = 90): string {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

/** Before anything is drafted: why this conversation is skipped, or 'draft' (it needs a draft written), or null (its
 *  waiting draft can be checked and sent). */
export function preSkipReason(c: DraftCandidate, nowMs: number = Date.now()): string | 'draft' | null {
  const r = c.row;
  if (!c.leadId) return 'no lead linked';
  if (c.leadStatus && NO_WHATSAPP_STATUSES.has(c.leadStatus)) return 'marked no WhatsApp';
  if (!c.lastInboundAt) return 'they have not replied yet';
  if (r?.status === 'generating') return 'still drafting: try again in a minute';
  if (r?.status === 'sending') return 'already being sent';
  if (r && r.status === 'pending') {
    /* A message newer than the one the draft answers: the draft may no longer fit. Read it first. */
    if (Date.parse(c.lastInboundAt) > Date.parse(r.inbound_at) + 1000) return 'they replied again after the draft';
    return null;
  }
  if (c.answered) return 'already answered';
  if (!serviceWindowState(c.lastInboundAt, nowMs).open) return '24-hour window closed: needs a template';
  return 'draft';
}

/** Why a conversation with a (waiting or freshly written) draft will NOT be sent it, or null when it can be. */
export function draftSkipReason(c: DraftCandidate, nowMs: number = Date.now()): string | null {
  const r = c.row;
  if (!c.leadId) return 'no lead linked';
  if (r?.why?.stop === true) return 'they asked to stop (opt-out)';
  if (!r || !r.draft_text?.trim()) return r?.kind === 'needs_you' ? 'needs you: answer it in the thread' : 'no draft';
  if (r.status === 'generating') return 'still drafting';
  if (r.status === 'sending') return 'already being sent';
  if (r.status !== 'pending') return 'already sent or closed';
  if (r.kind === 'needs_you') return 'needs you: answer it in the thread';
  if (!needsApproving(r, nowMs) || !rowSendable(r, nowMs)) return '24-hour window closed: needs a template';
  if (c.leadStatus && NO_WHATSAPP_STATUSES.has(c.leadStatus)) return 'marked no WhatsApp';
  if (c.lastInboundAt && Date.parse(c.lastInboundAt) > Date.parse(r.inbound_at) + 1000) return 'they replied again after the draft';
  return bulkDraftRefusal({
    kind: r.kind, draft_text: r.draft_text, why: (r.why ?? null) as unknown as Record<string, unknown> | null,
    inboundText: c.lastInboundText, inboundType: c.lastInboundType ?? null, prospectOnly: c.prospectOnly === true,
  });
}

/** The words for one conversation and draft: its OWN draft, the hook signed. Blanks left → skipped. */
export function itemFor(c: DraftCandidate, senderName: string | null, nowMs: number = Date.now()): DraftItem {
  const r = c.row;
  const isHook = isHookDraft(r?.why ?? null);
  const raw = (r?.draft_text ?? '').trim();
  const body = isHook && senderName && raw ? signHook(raw, senderName) : raw;
  let skip = draftSkipReason(c, nowMs);
  if (!skip && unresolvedTokens(body).length) skip = 'the draft still has blanks to fill';
  if (!skip && isHook && !senderName) skip = 'no sender name chosen';
  return { key: c.key, leadId: c.leadId, label: c.label, phone: c.phone, draftId: r?.id ?? null, body, isHook, skip };
}

/* ── the batch ───────────────────────────────────────────────────────────────────────────────── */

export type DraftOutcomeKind = 'sent' | 'queued' | 'failed' | 'skipped';
export type RowState = 'drafting' | 'waiting' | 'sending' | DraftOutcomeKind;
export const FINAL_STATES: ReadonlySet<RowState> = new Set(['sent', 'queued', 'failed', 'skipped']);

export interface BatchRow {
  key: string;
  label: string;
  state: RowState;
  reason?: string;
  /** A draft was written for it by this batch. */
  drafted?: boolean;
  /** Queued for their send hours: when it goes, and the scheduled row (cancellable). */
  sendAt?: string;
  tz?: string;
  scheduledId?: string;
  simulated?: boolean;
}

export interface BatchPlan {
  /** In selection order. `todo` = 'draft' (write one first), 'send' (a waiting draft) or 'skip'. */
  items: Array<{ cand: DraftCandidate; todo: 'draft' | 'send' | 'skip'; row: BatchRow }>;
  /** No sender name chosen: nothing starts, the name box opens (any batch may write a hook). */
  needsName: boolean;
}

/** The batch: who gets drafted, who is sent their waiting draft, who is skipped and why. Past BULK_DRAFT_MAX is skipped. */
export function planBatch(cands: readonly DraftCandidate[], opts: { senderName: string | null; nowMs?: number }): BatchPlan {
  const nowMs = opts.nowMs ?? Date.now();
  let taken = 0;
  const items = cands.map((cand) => {
    const base = { key: cand.key, label: cand.label };
    const pre = preSkipReason(cand, nowMs);
    if (pre !== null && pre !== 'draft') return { cand, todo: 'skip' as const, row: { ...base, state: 'skipped' as const, reason: pre } };
    if (taken >= BULK_DRAFT_MAX) return { cand, todo: 'skip' as const, row: { ...base, state: 'skipped' as const, reason: `over the ${BULK_DRAFT_MAX} per batch limit` } };
    taken++;
    return pre === 'draft'
      ? { cand, todo: 'draft' as const, row: { ...base, state: 'waiting' as const, reason: 'will write a draft' } }
      : { cand, todo: 'send' as const, row: { ...base, state: 'waiting' as const } };
  });
  return { items, needsName: !opts.senderName && taken > 0 };
}

/** How many the batch will work on (drafted or sent), for the button. */
export const batchWorkCount = (p: BatchPlan) => p.items.filter((i) => i.todo !== 'skip').length;

export interface SendResult { ok: boolean; simulated?: boolean; error?: string; reason?: string; messageId?: string; scheduled?: { id: string; send_at: string; tz: string } }

/** A claim / draft the server REFUSED (a reason it gave) vs a call that did not get an answer. */
export interface ClaimResult { ok: boolean; refused?: boolean; reason?: string }
export type GenerateResult = { ok: true; row: AiReplyRow } | { ok: false; refused: boolean; reason: string };

export interface BatchDeps {
  generate: (c: DraftCandidate) => Promise<GenerateResult>;
  claim: (draftId: string, body: string) => Promise<ClaimResult>;
  send: (item: DraftItem) => Promise<SendResult>;
  complete: (draftId: string, messageId: string | null, error: string | null) => Promise<void>;
  discard: (draftId: string) => Promise<void>;
  /** Resolves true when the Undo window has passed, false when Undo was pressed. No send starts before it resolves. */
  goAhead: Promise<boolean>;
  /** Undo or Stop pressed: nothing more is drafted or sent. */
  stopped: () => boolean;
  onRow: (row: BatchRow) => void;
  senderName: string | null;
  nowMs?: () => number;
  atOnce?: number;
}

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/**
 * Draft what needs a draft (BULK_DRAFT_AT_ONCE at a time, starting at once), then — once the Undo window has passed —
 * check and send each, ONE AT A TIME, in selection order. Failures are collected, never thrown: one refusal never
 * abandons the rest. A claim lost or refused sends NOTHING for that lead. Returns every row's final state.
 */
export async function runBatch(plan: BatchPlan, deps: BatchDeps): Promise<BatchRow[]> {
  const now = deps.nowMs ?? (() => Date.now());
  const final = new Map<string, BatchRow>();
  const emit = (r: BatchRow) => { if (FINAL_STATES.has(r.state)) final.set(r.key, r); deps.onRow(r); };
  for (const it of plan.items) if (it.todo === 'skip') final.set(it.row.key, it.row);

  /* 1. Drafting starts now, a few at a time. It sends nothing; Undo / Stop stops picking up new ones. */
  const toDraft = plan.items.filter((i) => i.todo === 'draft');
  const drafted = new Map<string, Promise<GenerateResult>>();
  const resolvers = new Map<string, (g: GenerateResult) => void>();
  for (const it of toDraft) drafted.set(it.cand.key, new Promise((res) => resolvers.set(it.cand.key, res)));
  let next = 0;
  const worker = async () => {
    while (next < toDraft.length) {
      const it = toDraft[next++];
      const done = resolvers.get(it.cand.key) as (g: GenerateResult) => void;
      if (deps.stopped()) { done({ ok: false, refused: true, reason: UNDONE_REASON }); continue; }
      emit({ ...it.row, state: 'drafting', reason: undefined });
      let g: GenerateResult;
      try { g = await deps.generate(it.cand); } catch (e) { g = { ok: false, refused: false, reason: errText(e, 'the draft could not be written') }; }
      done(g);
      if (g.ok) emit({ ...it.row, state: 'waiting', drafted: true, reason: 'draft written, waiting to send' });
    }
  };
  const pool = Array.from({ length: Math.min(Math.max(1, deps.atOnce ?? BULK_DRAFT_AT_ONCE), toDraft.length) }, () => worker());

  /* 2. Nothing is claimed or sent until the Undo window has passed. */
  const go = await deps.goAhead;

  /* 3. One at a time, in selection order. */
  const seen = new Set<string>();
  for (const it of plan.items) {
    if (it.todo === 'skip') continue;
    const base = { key: it.cand.key, label: it.cand.label };
    let cand = it.cand;
    let wasDrafted = false;
    if (it.todo === 'draft') {
      const g = await (drafted.get(it.cand.key) as Promise<GenerateResult>);
      if (!g.ok) { const no = g as Extract<GenerateResult, { ok: false }>; emit({ ...base, state: no.refused ? 'skipped' : 'failed', reason: no.reason }); continue; }
      cand = { ...it.cand, row: (g as Extract<GenerateResult, { ok: true }>).row };
      wasDrafted = true;
    }
    if (!go || deps.stopped()) {
      emit({ ...base, drafted: wasDrafted, state: 'skipped', reason: wasDrafted ? 'stopped before sending: the new draft is waiting in the thread' : UNDONE_REASON });
      continue;
    }
    const item = itemFor(cand, deps.senderName, now());
    if (item.skip) { emit({ ...base, drafted: wasDrafted, state: 'skipped', reason: item.skip }); continue; }
    if (!item.draftId || seen.has(item.draftId)) { emit({ ...base, drafted: wasDrafted, state: 'skipped', reason: 'same draft twice in the batch' }); continue; }
    seen.add(item.draftId);
    emit({ ...base, drafted: wasDrafted, state: 'sending' });
    emit({ ...(await sendOne(item, item.draftId, deps)), drafted: wasDrafted });
  }
  await Promise.all(pool);
  return plan.items.map((it) => final.get(it.cand.key) ?? { key: it.cand.key, label: it.cand.label, state: 'skipped', reason: UNDONE_REASON });
}

async function sendOne(it: DraftItem, draftId: string, deps: Pick<BatchDeps, 'claim' | 'send' | 'complete' | 'discard'>): Promise<BatchRow> {
  const base = { key: it.key, label: it.label };
  /* 1. The once-only claim (bulk: the skip rule again, on the stored row). Refused → skipped; no answer → failed. */
  let c: ClaimResult;
  try { c = await deps.claim(draftId, it.body); } catch (e) { c = { ok: false, refused: false, reason: errText(e, 'could not be approved') }; }
  if (!c.ok) return { ...base, state: c.refused ? 'skipped' : 'failed', reason: c.reason ?? 'could not be approved' };
  /* 2. The normal send path. */
  let res: SendResult;
  try { res = await deps.send(it); } catch (e) { res = { ok: false, error: 'send_failed', reason: errText(e, 'send failed') }; }
  /* 3. Record it, as the single approve does. Queued: complete then discard, so the same draft can never go twice. */
  if (res.ok && res.scheduled) {
    await deps.complete(draftId, null, 'queued_for_send_hours').catch(() => undefined);
    await deps.discard(draftId).catch(() => undefined);
    return { ...base, state: 'queued', sendAt: res.scheduled.send_at, tz: res.scheduled.tz, scheduledId: res.scheduled.id };
  }
  await deps.complete(draftId, res.ok ? (res.messageId ?? null) : null, res.ok ? null : (res.reason ?? res.error ?? 'send_failed')).catch(() => undefined);
  if (!res.ok) return { ...base, state: 'failed', reason: res.reason ?? (res.error === 'window_closed' ? 'the 24-hour window closed: needs a template' : res.error) ?? 'send failed' };
  return { ...base, state: 'sent', simulated: res.simulated };
}

export function draftOutcomeSummary(rows: readonly BatchRow[]): string {
  const n = (k: RowState) => rows.filter((o) => o.state === k).length;
  const parts = [`${n('sent')} sent`, `${n('queued')} queued`];
  if (n('failed')) parts.push(`${n('failed')} failed`);
  if (n('skipped')) parts.push(`${n('skipped')} skipped`);
  return 'Drafts: ' + parts.join(' · ');
}
