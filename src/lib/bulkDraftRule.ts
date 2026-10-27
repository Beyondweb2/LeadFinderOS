/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEND DRAFTS — WHAT IS NEVER SENT UNREAD (Paul, 2026-10-27). Record: docs/ai-handles-replies.md "Send drafts".

   "Send drafts" writes a draft for any selected conversation that has none and sends it with no approval step, so nobody
   reads these words before they go. This is the ONE rule for which drafts may still go that way. It is read twice: by the
   Inbox when it plans the batch (src/lib/bulkDraftSend.ts) and by fn ai-reply-drafts in the `bulk: true` claim, at send
   time, on the STORED row — the browser is never the only gate.

   ⛔ SKIP, NEVER SEND: Needs you; low confidence (the checker warned, the rule-built fallback, an unsure / unknown read);
      price, guarantee or proof (the playbook's price family, or those words in their message); an objection; a no / not
      interested; an opt-out, stop or hostile words; a bot or an automatic reply; a sticker, reaction or other media; a reply
      that promises a person's action (a voice note, a call, an email); a fact answer; and, for Australia (prospect-only),
      any draft carrying a price, the guarantee or a sign-up link.
   ⛔ This is NOT Level 2 and loosens nothing there: src/lib/aiAutoSend.ts (the automatic sends) is unchanged and still
      decides those on its own, stricter rule. Missing facts read as the unsafe value (draftFactsFromRow).
   Pure. Edge-reachable: relative imports with .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { HOSTILE_WORDS, NEVER_AUTO_KEYS, PRICE_OR_PROOF, draftFactsFromRow } from './aiAutoSend.ts';
import { PLAYBOOK, NEEDS_YOU_INTENTS } from './replyPlaybook.ts';
import { isOptOut } from './replyTriage.ts';

export interface BulkRuleFacts {
  kind: string | null | undefined;
  draft_text: string | null | undefined;
  why: Record<string, unknown> | null | undefined;
  /** The message the draft answers: its words and WhatsApp type (text / sticker / image …, 'reaction'). */
  inboundText: string | null | undefined;
  inboundType: string | null | undefined;
  /** The lead or the number is in a prospect-only country (prospectOnly.ts). */
  prospectOnly: boolean;
}

/* The groups, each with the words the results panel shows. */
const PRICE_KEYS = new Set(['how_much', 'catch', 'definitely', 'too_expensive', 'pay_on_results', 'own_site', 'not_sure_who']);
const OBJECTION_KEYS = new Set(['too_expensive', 'does_ai_matter', 'objection_rank', 'already_show_up']);
const NO_KEYS = new Set(['closed_retired', 'fully_booked', 'word_of_mouth', 'do_it_myself', 'sorry_wrong_day', 'dont_need', 'close_politely', 'not_interested']);
const BOT_KEYS = new Set(['auto_reply', 'is_bot']);
const MEDIA_KEYS = new Set(['media', 'ack']);
const PROMISE_KEYS = new Set(['voice_yes', 'call_now', 'number_sent', 'send_email']);
const UNSURE_KEYS = new Set(['unsure', 'unknown_question', 'escalate', 'other_language']);
const MEDIA_TYPES = new Set(['sticker', 'reaction', 'image', 'video', 'audio', 'document']);
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s.!?]+$/u;
const HAS_PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** A price, the guarantee or a sign-up / checkout link in the draft's own words (Australia is prospect-only). */
const AU_REFUSED_WORDS = /(£|\$\s?\d|\bprice|\bpricing|\bcost|\bguarantee|money.?back|refund|sign.?up|onboard|checkout|\/start\b|\/join\b)/i;

export const BULK_SKIP = {
  needs_you: 'needs you: answer it in the thread',
  low_confidence: 'low confidence: read and send it yourself',
  price: 'price, guarantee or proof question: answer it yourself',
  objection: 'an objection: answer it yourself',
  no: 'not interested / a no',
  opt_out: 'they asked to stop (opt-out)',
  bot: 'a bot or an automatic reply',
  media: 'a sticker, reaction or media: nothing to answer',
  promise: 'needs a person to do something (voice note, call or email)',
  fact: 'a fact question: answer it yourself',
  australia: 'Australia is prospect-only: no price, guarantee or sign-up link',
  no_text: 'no draft text',
} as const;

/** Why this draft must NOT go out unread, or null when it may. Positive: anything unknown skips. */
export function bulkDraftRefusal(f: BulkRuleFacts): string | null {
  const d = draftFactsFromRow({ kind: f.kind, draft_text: f.draft_text, why: f.why ?? null });
  const w = (f.why ?? {}) as Record<string, unknown>;
  const key = d.key;
  const move = typeof w.move === 'string' ? w.move : '';
  const inbound = String(f.inboundText ?? '');
  const text = String(f.draft_text ?? '');
  const isKey = (s: ReadonlySet<string>) => s.has(key) || s.has(move);

  if (d.stop || isOptOut(inbound) || HOSTILE_WORDS.test(inbound)) return BULK_SKIP.opt_out;
  if (MEDIA_TYPES.has(String(f.inboundType ?? '')) || isKey(MEDIA_KEYS) || (EMOJI_ONLY.test(inbound.trim()) && HAS_PICTOGRAPH.test(inbound))) return BULK_SKIP.media;
  if (d.kind !== 'draft' || d.noDraft || d.needsYou || (NEEDS_YOU_INTENTS as readonly string[]).includes(key)) return BULK_SKIP.needs_you;
  if (!text.trim()) return BULK_SKIP.no_text;
  if (d.label === 'Auto-reply' || w.aiAutoReplies === true || isKey(BOT_KEYS)) return BULK_SKIP.bot;
  if (isKey(NO_KEYS)) return BULK_SKIP.no;
  if (isKey(OBJECTION_KEYS)) return BULK_SKIP.objection;
  const pb = (PLAYBOOK as Record<string, { allowPrice?: boolean; confidence?: boolean; factual?: boolean } | undefined>)[key];
  if (isKey(PRICE_KEYS) || d.confidence || pb?.allowPrice || pb?.confidence || PRICE_OR_PROOF.test(inbound)) return BULK_SKIP.price;
  if (isKey(PROMISE_KEYS)) return BULK_SKIP.promise;
  if (d.problems.length > 0 || d.usedFallback || isKey(UNSURE_KEYS)) return BULK_SKIP.low_confidence;
  if (pb?.factual || NEVER_AUTO_KEYS.has(key)) return BULK_SKIP.fact;
  if (f.prospectOnly && AU_REFUSED_WORDS.test(text)) return BULK_SKIP.australia;
  return null;
}
