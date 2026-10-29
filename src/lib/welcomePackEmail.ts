/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WELCOME PACK EMAIL (Paul, 2026-10-29) — the email that carries the pack's link to a paid client.

   ⛔ SENT ONLY WHEN PAUL PRESSES THE BUTTON (paid-client-hub `welcome_pack_send`). Nothing sends it on a
   timer, a payment or a finished questionnaire: those only put "Send welcome pack" on his list.
   ⛔ A TEST GOES TO PAUL ONLY. `test: true` sends to WELCOME_PACK_TEST_TO (a constant, never the request
   body), subject-tagged [TEST], and is NOT recorded as the client's send.
   ⛔ THE GOOGLE ASK USES THE PACK'S OWN WORDS (welcomePackHtml.ts GBP_PACK_STEPS, checked against Google's
   help page), so the email and the document it carries cannot give different steps.

   Pure, no Deno: imported by the edge function (relative path, explicit .ts) and by its test.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { GBP_MANAGER_EMAIL, FINDABLE_CONTACT_EMAIL } from './findableOffer.ts';
import { GBP_PACK_STEPS } from './welcomePackHtml.ts';

/** Where a test send goes. Never read from a request. */
export const WELCOME_PACK_TEST_TO = FINDABLE_CONTACT_EMAIL;
/** The sender and reply-to — the same pair the agreement link email uses. */
export const WELCOME_PACK_FROM = 'Findable <alerts@findable.live>';
export const WELCOME_PACK_REPLY_TO = FINDABLE_CONTACT_EMAIL;

export interface WelcomePackEmail { subject: string; text: string }

export function welcomePackEmail(args: { businessName: string; contactName?: string | null; url: string; test?: boolean }): WelcomePackEmail {
  const name = (args.businessName || '').trim() || 'your business';
  const first = (args.contactName ?? '').trim().split(/\s+/)[0] || '';
  const subject = `${args.test ? '[TEST] ' : ''}Welcome to Findable: your welcome pack for ${name}`;
  const text = [
    `Hello${first ? ` ${first}` : ''},`,
    '',
    `Thank you for signing up with Findable. Your welcome pack for ${name} is ready:`,
    '',
    args.url,
    '',
    'It has your plan, your starting result with AI, what happens next, and your full baseline report. You can save it as a PDF from your browser.',
    '',
    `One thing we need from you: please add ${GBP_MANAGER_EMAIL} as a Manager of your Google Business Profile, so we can correct what Google shows about you.`,
    '',
    ...GBP_PACK_STEPS.map((s, i) => `${i + 1}. ${s}`),
    '',
    'You stay the owner, you never share a password with us, and you can remove our access at any time (People and access, select us, then Remove person).',
    '',
    'Any questions, just reply to this email.',
    '',
    'Paul',
    'Findable',
  ].join('\n');
  return { subject, text };
}

/** A plain shape check for an address a send goes to (the same rule the agreement link send uses). */
export function sendableEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}
