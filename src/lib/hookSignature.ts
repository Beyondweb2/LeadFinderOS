/* ═════════════════════════════════════════════════════════════════
   THE HOOK IS SIGNED WITH THE SENDER'S NAME (Paul, 2026-10-26). Pure. Edge-reachable: relative imports with .ts only.
   ⛔ ONLY THE HOOK: the first-reply pitch (and its straight-answer / chased / auto-reply variants: a code-built pitch). No other
      draft, template or message is signed here.
   ⛔ ALWAYS THE SENDING PERSON'S OWN CHOSEN NAME (profiles.message_name, messageName.ts): the person who approves it in the
      Inbox, or the "send as" person of an automatic send. Never the lead's owner, its assignee, the book owner, "Paul" or an
      email fallback. No chosen name → the hook is not sent by that person (the Inbox asks for the name; auto-send holds it).
   The name goes on its own last line, under the question:  "…do you manage the website yourself?\n\nSam"
   ═════════════════════════════════════════════════════════════════ */
import { cleanMessageName, hasChosenMessageName } from './messageName.ts';

/** What a plan / a stored draft's "why" says about how it was built. */
export interface HookShape { move?: string | null; structure?: string | null; fixedText?: string | null }

/** Is this draft the hook? Positive: a first-reply pitch, or an auto-reply answered with the code-built pitch. */
export function isHookDraft(d: HookShape | null | undefined): boolean {
  if (!d) return false;
  if (d.move === 'first_reply_pitch') return true;
  return d.move === 'auto_reply' && (!!d.structure || !!d.fixedText);
}

/** The name to sign with, or null when the person has not chosen one (never an email fallback). */
export function hookSignatureName(messageName: string | null | undefined): string | null {
  return hasChosenMessageName(messageName ?? null) ? cleanMessageName(messageName) : null;
}

/** "<text>\n\n<name>". Already signed with this name → unchanged (never twice). */
export function signHook(text: string, name: string): string {
  const body = String(text ?? '').replace(/\s+$/, '');
  const n = cleanMessageName(name);
  if (!n) return body;
  const lines = body.split('\n');
  if (lines[lines.length - 1].trim() === n) return body;
  return `${body}\n\n${n}`;
}
