/* THE NAME ON YOUR MESSAGES (2026-10-14, docs/team-access-tidy.md §4). ONE rule, read by the first-login box, the
   profile edit, and every sender that signs a message with a person's name (ai_visibility_report_offer {{6}}).

   ⛔ IT IS ALWAYS THE SENDING PERSON'S OWN NAME. The sender is the person who queued or pressed send — never the
   lead's owner, its assignee, the book owner or "Paul". With no sender there is no name, and the send refuses.
   ⛔ NOT ONBOARDING. One field, asked once after the first sign-in (and after the password change). Skipped → the
   first part of the person's OWN email is used, and the box asks again at the next login.
   Pure. Edge-reachable: no imports. */

/** profiles.message_name's CHECK (migration 20261026090000): 1–40 characters, no line breaks or tabs. */
export const MESSAGE_NAME_MAX = 40;

export type MessageNameProblem = 'empty' | 'too_long' | 'line_break';

export const MESSAGE_NAME_PROBLEM_WORDS: Record<MessageNameProblem, string> = {
  empty: 'Type the name you want on your messages.',
  too_long: `Keep it to ${MESSAGE_NAME_MAX} characters or fewer.`,
  line_break: 'Use one line only.',
};

/** Tidy what was typed: trim and collapse inner spaces. */
export function cleanMessageName(raw: unknown): string {
  return String(raw ?? '').replace(/[  ]+/g, ' ').trim();
}

/** Why a typed name cannot be saved, or null when it can. */
export function messageNameProblem(raw: unknown): MessageNameProblem | null {
  const s = String(raw ?? '');
  if (/[\r\n\t]/.test(s)) return 'line_break';
  const c = cleanMessageName(s);
  if (!c) return 'empty';
  if (c.length > MESSAGE_NAME_MAX) return 'too_long';
  return null;
}

/** The first part of an email ("ethan.lee@x.com" → "ethan.lee"), or '' when there is none. */
export function emailLocalPart(email: string | null | undefined): string {
  const e = String(email ?? '').trim();
  const at = e.indexOf('@');
  return (at > 0 ? e.slice(0, at) : '').slice(0, MESSAGE_NAME_MAX);
}

/** Has this person chosen a name yet? (The box shows while this is false.) */
export function hasChosenMessageName(saved: string | null | undefined): boolean {
  return messageNameProblem(saved) === null;
}

/** The name a message is signed with: the person's chosen name, else the first part of their OWN email, else ''
 *  (the caller refuses on ''). Never anyone else's. */
export function messageNameFor(person: { message_name?: string | null; email?: string | null } | null | undefined): string {
  if (!person) return '';
  if (hasChosenMessageName(person.message_name)) return cleanMessageName(person.message_name);
  return emailLocalPart(person.email);
}

/** sessionStorage key: the box was skipped in THIS sign-in, so it asks again at the next login only. */
export const messageNameSkipKey = (userId: string) => `message_name_skipped_${userId}`;
