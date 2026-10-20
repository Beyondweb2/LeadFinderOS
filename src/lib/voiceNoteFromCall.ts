/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE VOICE NOTE, BUILT FROM THE CALL SCRIPT (Paul, 2026-10-19: "the voice note script must not need generating").

   The same facts as the call script — the AI result, who was named instead, the website-issues line — from the SAME
   playbook (coldCallPlaybook.ts → callScript.ts), said as a WhatsApp voice note. Shown at once; no model call, no cost,
   nothing stored. The call script and the voice note cannot disagree: they read one object.

   ⛔ THE VOICE NOTE'S STANDING RULES (voiceNoteScript.ts, kept):
      · it says who is speaking first ("it's Paul from Findable") — a voice note arrives cold;
      · ALREADY IN TOUCH: an earlier message is never mentioned in the words; the person recording is told in a note;
      · NO REPORT OFFER: it never offers to send the audit / report or to "show you what I'd change" — it ends on the
        question about who controls the website (voiceNoteCtaKind), and nothing after it;
      · no price, no link; "could be preventing", never "this is why";
      · the CONFIDENCE LINE (offerFactSheet.ts CONFIDENCE_LINE, Paul 2026-10-20) after the bridge, before the question:
        the guarantee in the fact sheet's own words, nothing else about it.
   ⛔ NOTHING INVENTED: competitors are the stored answer's own (up to three), issues are the website check's own
      plain titles (up to two said), and a site with no serious issue gets no website line at all.
   Pure; relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { ISSUES_FOUND_MANY_LINE, ISSUES_FOUND_ONE_LINE, NO_WEBSITE_SPOKEN } from './callScript.ts';
import { plainIssueTitle } from './websiteCheck.ts';
import { callerFirstName } from './callerName.ts';
import type { ColdCallPlaybook } from './coldCallPlaybook.ts';
import { CONFIDENCE_LINE } from './offerFactSheet.ts';

/** Website issues said in the note (the rest are on the call screen). */
export const VOICE_NOTE_ISSUES_SAID = 2;
/** ~2.4 spoken words a second, Paul's relaxed pace. */
export const VOICE_NOTE_WORDS_PER_SECOND = 2.4;
export const VOICE_NOTE_BRIDGE = "More people are using AI to find local businesses now, and this is what I specialise in.";
export const VOICE_NOTE_IN_TOUCH_NOTE = "You've been in touch with them before. Don't mention it in the note.";

const lowerFirst = (s: string) => (/^(I|AI|FAQ|FAQs|Google)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export interface CallVoiceNote {
  /** One beat per line, so it reads aloud with a breath between. */
  lines: string[];
  text: string;
  words: number;
  seconds: number;
  /** For the person recording only — never said. */
  note: string | null;
}

export function voiceNoteFromCall(p: Pick<ColdCallPlaybook, 'evidence' | 'script' | 'site' | 'websiteCheck' | 'findingsStatus' | 'mode'> & { context: { caller?: string | null } }): CallVoiceNote {
  const ev = p.evidence;
  const lines: string[] = [`Hi mate, it's ${callerFirstName(p.context.caller)} from Findable.`];

  /* THE AI RESULT — the call script's opener, said as a note: the first line of the script, with "Hi mate, " taken off. */
  const opener = p.script.opener[0] ?? '';
  const asked = opener.replace(/^Hi mate,\s*/i, '');
  if (asked) lines.push(asked.charAt(0).toUpperCase() + asked.slice(1));

  /* THE WEBSITE LINE — exactly the call script's, from the same check. */
  const check = p.websiteCheck;
  if (p.findingsStatus === 'findings' && check.serious.length) {
    if (ev.kind === 'gap') lines.push(check.serious.length >= 2 ? ISSUES_FOUND_MANY_LINE : ISSUES_FOUND_ONE_LINE);
    else lines.push(check.serious.length >= 2 ? 'I also had a look at your website and found a few things that could be holding you back.' : 'I also had a look at your website and found something that could be holding you back.');
    const said = check.serious.slice(0, VOICE_NOTE_ISSUES_SAID).map((i) => lowerFirst(plainIssueTitle(i)));
    lines.push(said.length === 1 ? `It's that ${said[0]}.` : `Things like: ${said[0]}, and ${said[1]}.`);
  } else if (p.findingsStatus === 'no_website') {
    lines.push(NO_WEBSITE_SPOKEN);
  } else if (p.findingsStatus === 'profile') {
    lines.push(`I could only find your ${p.site.label ?? 'directory'} profile, not a site of your own, so there's a lot less for AI to go on.`);
  }
  /* clean / checking / not checked / unreadable: nothing about the site (Paul, 2026-10-19). */

  lines.push(VOICE_NOTE_BRIDGE);
  lines.push(CONFIDENCE_LINE);

  /* THE QUESTION — who controls the website; it ends the note (no report offer, voiceNoteScript.ts). */
  const label = p.site.label ?? 'directory';
  lines.push(p.site.source === 'own_site'
    ? 'Do you look after the website yourself, or is it managed by an agency?'
    : p.site.source === 'none'
      ? "Have you got a website I missed, or is it something you've not got round to yet?"
      : `Have you got a website of your own, or is ${label} mainly what you're using?`);

  const text = lines.join('\n');
  const words = text.split(/\s+/).filter(Boolean).length;
  return { lines, text, words, seconds: Math.round(words / VOICE_NOTE_WORDS_PER_SECOND), note: p.mode === 'follow_up' ? VOICE_NOTE_IN_TOUCH_NOTE : null };
}
