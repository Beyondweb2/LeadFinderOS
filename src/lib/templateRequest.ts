/* ══ "REQUEST A TEMPLATE" (2026-09-28, Paul) ═════════════════════════════════════════════════════
   A salesperson (or the admin) writes the WhatsApp message they wish existed; Paul gets an email of
   exactly what they typed and decides. Nothing goes to Meta — Paul registers any template himself.
   ONE definition of the fields, their limits and the email, shared by the form (the SPA) and the edge
   function `template-request` (which validates again: the browser never decides).
   ⛔ THE WORDING IS KEPT EXACTLY AS TYPED. Validation looks at a trimmed copy; the stored and emailed
   text is the raw string, line breaks and all. */

/** Meta's official page on template review: the approval process and the common rejection reasons. */
export const META_TEMPLATE_GUIDELINES_URL = 'https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review';

/** Meta's limit for a template body is 1,024 characters. */
export const TEMPLATE_REQUEST_LIMITS = {
  message: 1024,
  useCase: 300,
  whyNotExisting: 300,
  name: 100,
} as const;

/** Where the request was made from (context in the email; nothing depends on it). */
export const TEMPLATE_REQUEST_SOURCES = ['queue', 'inbox', 'lead'] as const;
export type TemplateRequestSource = typeof TEMPLATE_REQUEST_SOURCES[number];
const SOURCE_LABEL: Record<TemplateRequestSource, string> = {
  queue: 'the Outreach "Queue for WhatsApp" window',
  inbox: 'the Inbox template picker',
  lead: "a lead's WhatsApp card",
};

export interface TemplateRequestInput {
  message: string;
  useCase: string;
  whyNotExisting: string;
  name?: string | null;
  source?: string | null;
}

export type TemplateRequestCheck =
  | { ok: true; value: { message: string; useCase: string; whyNotExisting: string; name: string | null; source: TemplateRequestSource | null } }
  | { ok: false; error: 'message_required' | 'use_case_required' | 'why_required' | 'too_long'; field?: string };

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Validate WITHOUT altering: every returned string is exactly what was typed (the name alone is
 *  trimmed, as a label). */
export function checkTemplateRequest(input: Partial<TemplateRequestInput> | null | undefined): TemplateRequestCheck {
  const message = isStr(input?.message) ? input!.message : '';
  const useCase = isStr(input?.useCase) ? input!.useCase : '';
  const why = isStr(input?.whyNotExisting) ? input!.whyNotExisting : '';
  const name = isStr(input?.name) ? input!.name.trim() : '';
  if (!message.trim()) return { ok: false, error: 'message_required' };
  if (!useCase.trim()) return { ok: false, error: 'use_case_required' };
  if (!why.trim()) return { ok: false, error: 'why_required' };
  if (message.length > TEMPLATE_REQUEST_LIMITS.message) return { ok: false, error: 'too_long', field: 'message' };
  if (useCase.length > TEMPLATE_REQUEST_LIMITS.useCase) return { ok: false, error: 'too_long', field: 'useCase' };
  if (why.length > TEMPLATE_REQUEST_LIMITS.whyNotExisting) return { ok: false, error: 'too_long', field: 'whyNotExisting' };
  if (name.length > TEMPLATE_REQUEST_LIMITS.name) return { ok: false, error: 'too_long', field: 'name' };
  const source = (TEMPLATE_REQUEST_SOURCES as readonly string[]).includes(String(input?.source)) ? input!.source as TemplateRequestSource : null;
  return { ok: true, value: { message, useCase, whyNotExisting: why, name: name || null, source } };
}

/** A reply-to only for an address a person can actually receive at: never the Test accounts'
 *  reserved domains (.invalid, example.*), never a malformed one. */
export function replyToAddress(email: string | null | undefined): string | null {
  const e = String(email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  const domain = e.split('@')[1].toLowerCase();
  if (/\.(invalid|test|localhost|example)$/.test(domain) || /^example\.(com|org|net)$/.test(domain)) return null;
  return e;
}

/** The email Paul receives. Plain text so the wording arrives exactly as typed. */
export function templateRequestEmail(r: {
  id: string;
  createdAt: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterRole: string | null;
  message: string;
  useCase: string;
  whyNotExisting: string;
  name: string | null;
  source: TemplateRequestSource | null;
}): { subject: string; text: string } {
  const who = r.requesterName?.trim() || r.requesterEmail || 'Someone on the team';
  const when = new Date(r.createdAt).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
  const firstWords = r.message.replace(/\s+/g, ' ').trim().slice(0, 50);
  const subject = `Template request from ${who}: ${r.name ?? (firstWords + (r.message.trim().length > 50 ? '…' : ''))}`;
  const text = [
    `${who} has asked for a new WhatsApp template. Nothing has been sent to Meta.`,
    '',
    `From: ${who}${r.requesterRole ? ` (${r.requesterRole})` : ''}${r.requesterEmail ? ` <${r.requesterEmail}>` : ''}`,
    `Sent: ${when} (UK time)`,
    `Suggested name: ${r.name ?? '(none given)'}`,
    `Asked from: ${r.source ? SOURCE_LABEL[r.source] : '(not recorded)'}`,
    '',
    'When they would use it:',
    r.useCase,
    '',
    "Why an existing template doesn't cover it:",
    r.whyNotExisting,
    '',
    'The exact wording they want (between the lines, as typed):',
    '----------------------------------------',
    r.message,
    '----------------------------------------',
    '',
    `Request id: ${r.id}`,
  ].join('\n');
  return { subject, text };
}

/** Plain-English refusal for the form. */
export function templateRequestRefusal(code: string | null | undefined): string {
  switch (code) {
    case 'message_required': return 'Write the message you want.';
    case 'use_case_required': return 'Say when you would use it.';
    case 'why_required': return "Say why an existing template doesn't cover it.";
    case 'too_long': return 'One of the fields is too long.';
    case 'no_role': return 'Your account has no access.';
    default: return code ? `Not sent: ${code}` : 'Not sent — try again.';
  }
}
