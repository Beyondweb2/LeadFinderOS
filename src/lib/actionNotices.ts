/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO MORE BOTTOM-RIGHT POP-UPS (Paul, 2026-11-15).

   Every `toast(...)` in the app (about 600 calls) now lands here instead of a pop-up stack:
     • ALWAYS: one line in this tab's message log, shown in the bell under "This session" (the bell keeps
       the full list).
     • An ERROR (variant 'destructive'), or a message with an action button (Undo): shown INLINE, right next
       to the button or field the person just used (the last thing they pressed, if it is still on the page),
       so the failure is beside the action. If that control is gone (a menu that closed, a dialog that shut),
       it shows as a slim bar under the top of the page instead — never bottom-right.
     • Anything else (a success / "Saved" note): the bell only.
   ⚠️ Pure state, no React import: the UI is src/components/ActionNotices.tsx, mounted once in App.tsx.
   Tested by scripts/action-notices.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface NoticeInput {
  title?: unknown;
  description?: unknown;
  variant?: string | null;
  action?: unknown;
}

export interface LoggedNotice {
  id: string;
  at: number;
  title: string;
  description: string;
  error: boolean;
}

export interface InlineNotice {
  id: string;
  at: number;
  title: unknown;
  description: unknown;
  error: boolean;
  action: unknown;
  /** The control the person last used, when it is still on the page. null = show as the top bar. */
  anchor: Element | null;
}

/** How long after a click a notice still belongs to that control. */
export const ANCHOR_WINDOW_MS = 30_000;
/** How long an inline notice stays (it can be closed sooner). Errors stay longer. */
export const INLINE_MS = { error: 15_000, other: 8_000 } as const;
/** The bell's "This session" list keeps the newest N. */
export const LOG_LIMIT = 50;

/** Plain text of a title/description that may be a string, a number or a React node. */
export function plainText(v: unknown): string {
  if (v == null || v === false || v === true) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(plainText).join('');
  if (typeof v === 'object' && v && 'props' in v) return plainText((v as { props?: { children?: unknown } }).props?.children);
  return '';
}

/** Which way a notice goes: inline beside the action, or only into the bell's log. */
export function routeOf(n: NoticeInput): 'inline' | 'log' {
  return n.variant === 'destructive' || !!n.action ? 'inline' : 'log';
}

let seq = 0;
let log: LoggedNotice[] = [];
let inline: InlineNotice[] = [];
let lastAction: { el: Element; at: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function subscribeNotices(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const getNoticeLog = (): readonly LoggedNotice[] => log;
export const getInlineNotices = (): readonly InlineNotice[] => inline;
export function clearNoticeLog() { log = []; emit(); }
export function dismissInline(id?: string) { inline = id ? inline.filter((n) => n.id !== id) : []; emit(); }

/** Record the control a person just used (capture-phase pointerdown / Enter / Space). */
export function noteAction(el: Element | null, now = Date.now()) { if (el) lastAction = { el, at: now }; }

/** The anchor for a notice raised now: the last control used, if recent and still on the page. */
export function anchorFor(now = Date.now()): Element | null {
  if (!lastAction || now - lastAction.at > ANCHOR_WINDOW_MS) return null;
  const el = lastAction.el as Element & { isConnected?: boolean };
  return el.isConnected === false ? null : lastAction.el;
}

/** The one entry point (use-toast.ts `toast()` calls it). Returns the notice id. */
export function pushNotice(n: NoticeInput, now = Date.now()): string {
  const id = `n${++seq}`;
  const error = n.variant === 'destructive';
  const title = plainText(n.title), description = plainText(n.description);
  if (title || description) log = [{ id, at: now, title, description, error }, ...log].slice(0, LOG_LIMIT);
  if (routeOf(n) === 'inline') {
    const anchor = anchorFor(now);
    // One inline notice per control: a newer one replaces the older one beside the same control.
    inline = [...inline.filter((x) => !(anchor && x.anchor === anchor)), { id, at: now, title: n.title, description: n.description, error, action: n.action ?? null, anchor }].slice(-3);
  }
  emit();
  return id;
}

/** Test-only: reset the module state. */
export function _resetNotices() { log = []; inline = []; lastAction = null; seq = 0; emit(); }
