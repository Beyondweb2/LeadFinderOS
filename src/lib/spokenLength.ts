/* ══ HOW LONG A SCRIPT TAKES TO SAY (Paul, 2026-10-23) ═══════════════════════════════════════════════
   One rule for the words and seconds shown under a voice-note script: the generator's length checks
   (voiceNoteScript.ts) and the Inbox panel (VoiceNoteScriptButton.tsx) both read it here.
   Pure leaf: no imports. Edge-reachable. */

/** Paul's speaking pace. */
export const SPOKEN_WORDS_PER_MINUTE = 150;

/** The words a person says: a word starts with a letter, a digit or a currency sign. */
export function wordCount(text: string): number {
  return (String(text ?? '').match(/[A-Za-z0-9£$][A-Za-z0-9'’£$.,-]*/g) ?? []).length;
}

/** "212 words · about 1 min 25 s". */
export function spokenLength(text: string): { words: number; seconds: number; label: string } {
  const words = wordCount(text);
  const seconds = Math.round((words / SPOKEN_WORDS_PER_MINUTE) * 60);
  const m = Math.floor(seconds / 60);
  return { words, seconds, label: `${words} words · about ${m ? `${m} min ${seconds % 60} s` : `${seconds} s`}` };
}
