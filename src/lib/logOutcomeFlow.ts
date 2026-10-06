/* ══ LOG OUTCOME — THE CALL WORKSPACE'S ONE "WHAT HAPPENED?" (2026-10-06, Paul) ═══════════════════════
   The Call tab used to end in three permanent cards (Status, Log a contact, Next Action): a matrix of
   channels × outcome rows and a Next Action form, stacked under the script. Now: one Log button opens a
   small window with the handful of things that actually happen on a call; the outcome is saved first, and
   ONLY an outcome that needs a next step asks for one, in a second small step.

   ⛔ NOTHING NEW UNDERNEATH. Every button is an existing lead_log_contact outcome (CALL_OUTCOMES, the server
   allowlist) and its follow-on is THE ONE RULE, src/lib/leadState.ts (outcomePlan / suggestNextAction),
   carried out by src/lib/leadOutcome.ts — the same writes as before, for both roles:
     Interested        → outcome `interested` → the ⭐ (lead_mark_interested). Never the old pre-star status.
     Not interested    → outcome `not_interested` → status Not interested, queue stopped, Next Action cleared,
                         then "why did they say no?" (askLostReason). No next step asked.
     Didn't answer     → outcome `no_answer` → recorded; optionally "try again when?" (pre-filled, never saved
                         unless the person presses Save).
     Call back         → outcome `call_back` → SAVES the Next Action "Call · No date set" (the rule), then
                         "when should we call?".
     Send onboarding   → outcome `interested` (they said yes) → the Close tab: the ONE close UI, QuickClosePanel —
                         the client agreement, Ready to Sell and seller attribution all stay on its server path.
                         Never a raw payment link.
     Wrong number      → outcome `wrong_number` → the number suppressed. No next step.
     Left voicemail    → outcome `left_voicemail` → recorded; optionally "try again when?".
   Less common outcomes (Spoke to owner, Meeting booked, and the message outcomes for other channels) sit
   behind "More" — still one tap, never a matrix.
   ⛔ The channel defaults to Call (this IS the call workspace) and is a quiet "Logged as: Call · Change". */
import { outcomesFor } from './salesCrm.ts';
import { offeredOutcomes, suggestNextAction, type NextActionSuggestion } from './leadState.ts';
import { CONTACT_METHODS } from './contactMethods.ts';

/** The channel a Log starts on in the call workspace. */
export const DEFAULT_LOG_CHANNEL = 'call';

/** The follow-up step an outcome opens after it is saved. 'none' = the window closes. */
export type FollowStep =
  | 'none'
  | 'interested_next'   // "What happens next?" — Send onboarding / Call back / Set follow-up / No next action
  | 'call_back_when'    // "When should we call?" — the Call the rule just saved, its day and time
  | 'retry_when'        // "Try again when?" — optional, pre-filled from suggestNextAction, Skip is fine
  | 'meeting_when'      // "When is the meeting?" — the Meeting the rule just saved, its day and time
  | 'quick_close';      // straight to the Close tab (Quick Close)

export type LogTone = 'good' | 'strong' | 'info' | 'quiet' | 'stop';

export interface LogChoice {
  /** The button's own key (two buttons may log the same outcome: Interested and Send onboarding). */
  key: string;
  /** The lead_log_contact outcome it records — always a CALL_OUTCOMES value. */
  outcome: string;
  label: string;
  tone: LogTone;
}

/** The main buttons, in the order they are drawn. */
export const LOG_CHOICES: readonly LogChoice[] = [
  { key: 'interested', outcome: 'interested', label: 'Interested', tone: 'good' },
  { key: 'not_interested', outcome: 'not_interested', label: 'Not interested', tone: 'stop' },
  { key: 'no_answer', outcome: 'no_answer', label: "Didn't answer", tone: 'quiet' },
  { key: 'call_back', outcome: 'call_back', label: 'Call back', tone: 'info' },
  { key: 'send_onboarding', outcome: 'interested', label: 'Send onboarding', tone: 'strong' },
  { key: 'wrong_number', outcome: 'wrong_number', label: 'Wrong number', tone: 'stop' },
  { key: 'left_voicemail', outcome: 'left_voicemail', label: 'Left voicemail', tone: 'quiet' },
];

/** A WhatsApp conversation is recorded by its messages; what CAME of it is still the rep's to say (no
 *  second record of the messages — `logged` false). */
export const WHATSAPP_RESULT_OUTCOMES: readonly string[] = ['interested', 'meeting_booked', 'call_back', 'not_interested'];

/** Is this channel recorded by its own sends (WhatsApp), not by a logged contact? */
export function channelRecordedBySend(channel: string): boolean {
  return CONTACT_METHODS.find((m) => m.value === channel)?.recordedBy === 'send';
}

/** The outcomes this channel may record (the server accepts all; this keeps the buttons sensible). */
export function allowedOutcomes(channel: string): string[] {
  if (channelRecordedBySend(channel)) return [...WHATSAPP_RESULT_OUTCOMES];
  return offeredOutcomes(outcomesFor(channel)).map((o) => o.value);
}

/** The main buttons for a channel. `paid`: a paying client is never sent onboarding again. */
export function choicesFor(channel: string, opts: { paid?: boolean } = {}): LogChoice[] {
  const allowed = new Set(allowedOutcomes(channel));
  return LOG_CHOICES.filter((c) => allowed.has(c.outcome) && !(c.key === 'send_onboarding' && opts.paid === true));
}

/** The "More" outcomes: everything the channel offers that no main button already records. */
export function moreOutcomesFor(channel: string): string[] {
  const main = new Set(choicesFor(channel).map((c) => c.outcome));
  return allowedOutcomes(channel).filter((o) => !main.has(o));
}

/** THE step after a saved outcome. `key` is the button (send_onboarding is its own key); `outcome` what was
 *  recorded. Driven by the outcome's own rule — never by the button's label. */
export function followStepOf(key: string, outcome: string): FollowStep {
  if (key === 'send_onboarding') return 'quick_close';
  switch (outcome) {
    case 'interested': return 'interested_next';
    case 'call_back': return 'call_back_when';
    case 'meeting_booked': return 'meeting_when';
    case 'not_interested': return 'none';  // the lost-reason prompt is the only question
    case 'wrong_number': return 'none';
    /* No answer, voicemail, a message sent, spoke to the owner: the rule suggests a next step — offered, optional. */
    default: return suggestNextAction(DEFAULT_LOG_CHANNEL, outcome) ? 'retry_when' : 'none';
  }
}

/** "What happens next?" after Interested. Each one is an existing path: the Close tab, the one Next Action
 *  form (pre-filled, saved only by its own Save), or nothing. */
export const INTERESTED_NEXT_CHOICES = [
  { key: 'send_onboarding', label: 'Send onboarding' },
  { key: 'call_back', label: 'Call back' },
  { key: 'follow_up', label: 'Set follow-up' },
  { key: 'none', label: 'No next action' },
] as const;
export type InterestedNextKey = (typeof INTERESTED_NEXT_CHOICES)[number]['key'];

/** The Next Action form's pre-fill for an Interested choice (null = no form). */
export function interestedPreset(key: InterestedNextKey): { nextAction: string; note: string } | null {
  if (key === 'call_back') return { nextAction: 'call', note: 'Interested — call them back' };
  if (key === 'follow_up') return { nextAction: 'follow_up', note: '' };
  return null;
}

/** The pre-fill for "try again when?" — the one outcome → Next Action rule. */
export function retryPreset(channel: string, outcome: string): NextActionSuggestion | null {
  return suggestNextAction(channel, outcome);
}
