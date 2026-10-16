import type { ConversationState } from './conversationState.ts';

/* ⚡ WHEN AN INBOX LIST ROW MAY SKIP A REDRAW (2026-10-16, Inbox speed pass — docs/PERF_AUDIT.md).
   The list's stateByKey builds a NEW ConversationState object for every row whenever anything it reads moves (one read
   time, the minute clock), so comparing the objects by identity would redraw all 150 rows on every click. Same fields =
   same row. failedError is the one nested value and is compared by content. Any field added to ConversationState is
   compared automatically (the keys are walked, not listed). */
export function sameConvState(a: ConversationState | undefined, b: ConversationState | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as Array<keyof ConversationState>;
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (k === 'failedError') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return a.failedError === b.failedError || JSON.stringify(a.failedError ?? null) === JSON.stringify(b.failedError ?? null);
}

/** Props equal one by one, except `st`, which is compared by content (sameConvState). */
export function sameRowProps<P extends { st: ConversationState | undefined }>(a: P, b: P): boolean {
  const keys = Object.keys(a) as Array<keyof P>;
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (k === 'st') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return sameConvState(a.st, b.st);
}
