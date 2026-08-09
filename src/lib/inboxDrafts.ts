/* ════════════════════════════════════════════════════════════════════════════════════════════
   HALF-TYPED REPLIES, KEPT.

   ⛔ THE DRAFT BELONGS TO THE CONVERSATION, NOT TO THE PAGE. A single shared composer string would
   be worse than losing it: open another thread and your half-written message follows you into it,
   armed and ready to send to the wrong person. So the store is a map keyed by conversation.

   ⚠️ AN EMPTY DRAFT IS DELETED, NEVER STORED AS "". Three things fall out of that and all of them
   matter: a successful send clears the entry rather than leaving a ghost, the map does not grow a
   key for every thread ever opened, and "has a draft" is a simple key check rather than a check
   plus a trim.

   ⚠️ WHITESPACE ONLY COUNTS AS EMPTY. A composer holding " " is not a message anyone is partway
   through writing, and keeping it would resurrect a blank draft over a thread you had finished with.
   But the STORED value keeps its original spacing — only the emptiness TEST is trimmed, because a
   draft ending in a deliberate newline should come back the way it was left.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** How many unsent drafts to keep. Far past any real workflow — this exists so a bug cannot fill
 *  localStorage, not to enforce a limit anyone will meet. */
export const MAX_DRAFTS = 30;

export type DraftMap = Record<string, string>;

/**
 * Write one conversation's draft into the map.
 *
 * ⛔ RETURNS A NEW OBJECT and never mutates the input — it feeds a React state setter, and a mutated
 * previous state is a render that does not happen.
 */
export function setDraft(drafts: DraftMap, key: string | null, value: string): DraftMap {
  /* No conversation open means there is nothing this draft could belong to. Silently dropping it is
     right: the alternative is inventing a key, and a draft under a made-up key can never be found
     again but still counts against the cap. */
  if (!key) return drafts;

  const next: DraftMap = { ...drafts };
  if (value.trim()) next[key] = value;
  else delete next[key];

  /* Object key order is insertion order for string keys, so the oldest entries are at the front.
     Note a rewrite does NOT move a key to the end — an actively-edited draft keeps its original
     position. That is acceptable at a cap of 30 and stated so nobody reads the trim as an LRU. */
  const keys = Object.keys(next);
  if (keys.length > MAX_DRAFTS) {
    for (const k of keys.slice(0, keys.length - MAX_DRAFTS)) delete next[k];
  }
  return next;
}

/** What to show in the composer. Absent, null key, or a non-string all mean an empty composer —
 *  never `undefined`, which React would treat as an uncontrolled input and warn about. */
export function getDraft(drafts: DraftMap, key: string | null): string {
  if (!key) return '';
  const v = drafts?.[key];
  return typeof v === 'string' ? v : '';
}
