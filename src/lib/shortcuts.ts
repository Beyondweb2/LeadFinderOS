/* ══ KEYBOARD SHORTCUTS — SAFE ONLY (Sales Experience release 4, 2026-09-28) ═════════════════════════
   Navigation and opening things. ⛔ No shortcut sends a message, saves a change, or does anything that
   cannot be undone by pressing Back. Never fires while the person is typing. */

export const GO_SHORTCUTS: readonly { keys: string; to: string; label: string; adminOnly?: boolean }[] = [
  { keys: 'g d', to: '/sales-dashboard', label: 'Sales' },
  { keys: 'g w', to: '/inbox', label: 'WhatsApp' },
  { keys: 'g o', to: '/outreach', label: 'Outreach' },
  { keys: 'g l', to: '/find-leads', label: 'Find Leads' },
  { keys: 'g c', to: '/coverage', label: 'Coverage' },
];

/** Is the key press inside something the person is typing into? */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.('[contenteditable="true"], [role="textbox"], [role="combobox"]');
}

/** The "g then x" sequence: returns the route for a second key pressed within the window after 'g'. */
export function goTarget(prevKey: string | null, prevAt: number, key: string, nowMs: number, windowMs = 1200): string | null {
  if (prevKey !== 'g' || nowMs - prevAt > windowMs) return null;
  return GO_SHORTCUTS.find((s) => s.keys === `g ${key.toLowerCase()}`)?.to ?? null;
}

export const isPaletteKey = (e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
