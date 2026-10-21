/* IS THIS INBOUND A REPLY? — ONE TAG PER MESSAGE (Paul, 2026-10-21; record docs/lead-status-and-visible.md).
   The lead's status is derived in the DATABASE from its messages (migration 20261118090000, lead_conversation_signal). The one
   thing SQL cannot read is the wording, so this leaf reads it — the SAME auto-reply reading the drafter uses (replyMove.ts
   autoReplyFlags / inboundLabel, Paul 2026-10-20) — and ai-reply-drafts stores the answer on the message as
   whatsapp_messages.reply_kind:
     · 'auto'      — an auto-responder, on its own wording or inside an auto-reply burst. Never a reply.
     · 'confirmed' — a bare "yes it is" / "how can I help?" BEFORE we have answered them and before any real reply from them
                     (the 20 Oct rule: not a reply, the lead stays Contacted). A person, though: once we answer it, You replied.
     · null        — a real reply.
   ⛔ This leaf never writes a status. Pure and edge-reachable: relative imports with .ts, no Deno, no DOM. */
import { autoReplyFlags, inboundLabel, type MoveThreadMsg } from './replyMove.ts';

export type ReplyKind = 'auto' | 'confirmed' | null;

export interface TagMsg {
  id: string;
  direction: string;
  body: string | null;
  message_type: string | null;
  created_at: string;
  /** For our rows: did it really go (sent / delivered / read / simulated)? Inbound rows ignore it. */
  sent?: boolean;
}

/** The reply kind of every inbound message in a thread (oldest first). Our rows that did not really go are ignored. */
export function replyKinds(thread: readonly TagMsg[]): Map<string, ReplyKind> {
  const rows = thread.filter((m) => m.direction === 'inbound' || m.sent === true);
  const mt: MoveThreadMsg[] = rows.map((m) => ({ from: m.direction === 'inbound' ? 'them' : 'us', text: m.body ?? '', messageType: m.message_type, at: m.created_at }));
  const auto = autoReplyFlags(mt);
  const out = new Map<string, ReplyKind>();
  let heardFromThem = false; // a real reply from them so far
  let answered = false;      // we sent something after one of their messages
  let theySpoke = false;
  rows.forEach((m, k) => {
    if (m.direction !== 'inbound') { if (theySpoke) answered = true; return; }
    if (auto[k]) { out.set(m.id, 'auto'); return; }
    theySpoke = true;
    if (!heardFromThem && !answered && inboundLabel(m.body, m.message_type) === 'Only confirmed') { out.set(m.id, 'confirmed'); return; }
    heardFromThem = true;
    out.set(m.id, null);
  });
  return out;
}

/** The rows whose stored tag differs from the reading: what to write. */
export function replyKindChanges(thread: readonly (TagMsg & { reply_kind?: string | null })[]): Array<{ id: string; reply_kind: ReplyKind }> {
  const kinds = replyKinds(thread);
  const out: Array<{ id: string; reply_kind: ReplyKind }> = [];
  for (const m of thread) {
    if (!kinds.has(m.id)) continue;
    const want = kinds.get(m.id) ?? null;
    if ((m.reply_kind ?? null) !== want) out.push({ id: m.id, reply_kind: want });
  }
  return out;
}
