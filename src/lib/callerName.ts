/* WHO IS SPEAKING on a call or a voice note (2026-09-28; one leaf since fix workstream 5, 2026-10-04).
   The first word of the signed-in person's display name (team_members), else the book owner's name — what every
   script said before Sales used it. The call script (coldCallPlaybook.ts) and the voice note (voiceNoteScript.ts,
   fn voice-note-script) both read it here, so "It's Sam from Findable" is the same name on both.
   ⛔ A leaf: no imports, so an edge function can reach it without pulling the call-script closure. */
export const DEFAULT_CALLER_NAME = 'Paul';

export function callerFirstName(name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  return first && /[A-Za-z]/.test(first) ? first : DEFAULT_CALLER_NAME;
}
