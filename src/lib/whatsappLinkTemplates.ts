/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE TWO LINK TEMPLATES (Paul, 2026-10-07, docs/pre-sales-certification/sales-close-handoff-australia.md).

   Paul created both in Meta and submitted them for review on 2026-10-07 (shown there as MARKETING):
     findable_signup_link  — a salesperson's one-click send of the prospect's UNIQUE sign-up link after a close
                             (usually on the phone, so no open 24-hour window).
     findable_onboarding   — Paul's one-click send of a PAID client's secure onboarding-form link.

   ⛔ THESE ARE FIRST-CLASS TEMPLATES IN THE EXISTING SENDER: registered in WA_TEMPLATES (+ the queue mirror,
      the bodies, the picker labels, CONTINUATION_TEMPLATES, the Inbox display), sent ONLY by fn
      send-whatsapp-message with the variables it resolves itself from the database — never a link from the
      browser. {{2}} is checked to be the findable.live sign-up / onboarding link and can never be a Stripe URL.
   ⛔ APPROVAL IS NEVER HARD-CODED. Whether a template may send is Meta's LIVE status, read through the Graph
      API (_shared/template-status.ts, cached a few minutes): APPROVED sends; in review / rejected / paused /
      disabled / not found does not, and the screen says so and offers Copy instead. The day Meta approves one,
      the next status read finds it and the button works — no code change, no deploy.
   ⛔ The bodies below are the wording Paul registered, for the Inbox transcript only (Meta renders the real
      message from its own copy). They are NOT what decides a send, and they must never be "tidied" here —
      a registered template can only change by re-registering it at Meta.
   Pure. Edge-reachable: relative imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const SIGNUP_LINK_TEMPLATE_NAME = 'findable_signup_link';
export const ONBOARDING_TEMPLATE_NAME = 'findable_onboarding';
export const LINK_TEMPLATE_NAMES: readonly string[] = [SIGNUP_LINK_TEMPLATE_NAME, ONBOARDING_TEMPLATE_NAME];

/** The registered wording, {{1}} the greeting name, {{2}} the link (display only — see the header). */
export const signupLinkTemplateBody = (name: string, url: string) =>
  `Hi ${name}, thanks for speaking with us about Findable.

You can get started here: ${url}

If you have any questions, just reply to this message.`;
export const onboardingTemplateBody = (name: string, url: string) =>
  `Hi ${name}, thanks for getting started with Findable.

We just need a few details from you before we begin. You can complete them here:

${url}

The form only asks for information we still need.`;

/* ══ THE LINKS {{2}} MAY CARRY — positive shapes only ══════════════════════════════════════════════ */
const SIGNUP_LINK_RE = /^https:\/\/findable\.live\/agree\/[0-9a-f]{64}$/;
const ONBOARDING_LINK_RE = /^https:\/\/findable\.live\/details\/[0-9a-f]{64}$/;
/** The prospect's own sign-up link (their agreement page → sign → pay). Never a Stripe checkout URL. */
export const isSignupLinkUrl = (u: string | null | undefined): boolean => SIGNUP_LINK_RE.test(String(u ?? ''));
/** A paid client's onboarding-form link (no payment on it). */
export const isOnboardingFormUrl = (u: string | null | undefined): boolean => ONBOARDING_LINK_RE.test(String(u ?? ''));

/* ══ META'S LIVE STATUS → WHAT THE SCREEN DOES ═════════════════════════════════════════════════════ */
/** Meta's own status words (message_templates `status`), plus ours for "no such template" / "couldn't ask". */
export type MetaTemplateStatus = 'APPROVED' | 'PENDING' | 'IN_APPEAL' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'LIMIT_EXCEEDED' | 'NOT_FOUND' | 'UNKNOWN';
export interface TemplateAvailability {
  name: string;
  status: MetaTemplateStatus;
  /** As Meta reports it ('MARKETING' / 'UTILITY'), never assumed. */
  category: string | null;
  /** The registered language code — what the send must use. */
  language: string | null;
  checked_at: string | null;
}
export interface TemplateSendState {
  /** A one-click send is offered and allowed. */
  sendable: boolean;
  /** Status could not be read (Meta / permissions): a send is still ATTEMPTED and Meta decides — the
   *  registered-before-approval precedent (free_check_result) — and a refusal is reported, never hidden. */
  tryable: boolean;
  label: string;
  say: string;
}
const KNOWN: ReadonlySet<string> = new Set(['APPROVED', 'PENDING', 'IN_APPEAL', 'REJECTED', 'PAUSED', 'DISABLED', 'LIMIT_EXCEEDED', 'NOT_FOUND', 'UNKNOWN']);
export const normaliseMetaStatus = (s: unknown): MetaTemplateStatus => {
  const v = String(s ?? '').trim().toUpperCase();
  return (KNOWN.has(v) ? v : 'UNKNOWN') as MetaTemplateStatus;
};

/** ⛔ Positive: only APPROVED sends without question. Everything else is said plainly. */
export function templateSendState(a: TemplateAvailability | null | undefined, kind: 'signup' | 'onboarding'): TemplateSendState {
  const what = kind === 'signup' ? 'WhatsApp signup template' : 'WhatsApp onboarding template';
  const s = a?.status ?? 'UNKNOWN';
  if (s === 'APPROVED') return { sendable: true, tryable: true, label: 'Approved', say: `${what} approved by Meta.` };
  if (s === 'PENDING' || s === 'IN_APPEAL') return { sendable: false, tryable: false, label: 'Awaiting approval', say: `${what} awaiting approval from Meta.` };
  if (s === 'REJECTED') return { sendable: false, tryable: false, label: 'Rejected by Meta', say: `${what} was rejected by Meta — it cannot be sent. It needs editing and re-submitting in WhatsApp Manager.` };
  if (s === 'PAUSED' || s === 'DISABLED' || s === 'LIMIT_EXCEEDED') return { sendable: false, tryable: false, label: s === 'PAUSED' ? 'Paused by Meta' : 'Disabled by Meta', say: `${what} is ${s.toLowerCase().replace('_', ' ')} by Meta (usually low quality ratings) — it cannot be sent right now.` };
  if (s === 'NOT_FOUND') return { sendable: false, tryable: false, label: 'Not found', say: `${what} was not found in the WhatsApp account we send from — check it was created there under exactly this name.` };
  return { sendable: false, tryable: true, label: 'Status unknown', say: `Couldn't read the ${what}'s status from Meta just now — sending will try, and Meta decides.` };
}

/** Meta's send error codes that mean "this template can't be used (yet)" — the status is re-read after one. */
export const TEMPLATE_UNAVAILABLE_CODES: ReadonlySet<number> = new Set([132001, 132015, 132016, 132007]);
/** A failed send, in words (never a raw Graph error on the screen). */
export function templateSendFailureText(code: number | null | undefined, kind: 'signup' | 'onboarding'): string {
  const what = kind === 'signup' ? 'signup link' : 'onboarding link';
  if (code === 132001) return `Meta hasn't approved the ${what} template yet (or it isn't in this WhatsApp account) — nothing was delivered. Copy the link instead.`;
  if (code === 132015 || code === 132016) return `Meta has paused or disabled the ${what} template — nothing was delivered. Copy the link instead.`;
  if (code === 132000) return `The ${what} template's variables don't match what's registered at Meta — nothing was delivered. Tell Paul.`;
  if (code === 131049) return 'Meta held this marketing message back (per-person marketing limits) — nothing was delivered. Copy the link instead, or try tomorrow.';
  if (code === 131026) return "WhatsApp couldn't deliver to this number (it may not be on WhatsApp). Copy the link instead.";
  return `WhatsApp didn't send the ${what} — nothing was delivered. Copy the link instead.`;
}

/** The greeting {{1}}: the contact's first name, else the business's short name, else "there". */
export function linkTemplateGreeting(contactName: string | null | undefined, businessShortName: string | null | undefined): string {
  const first = String(contactName ?? '').trim().split(/\s+/)[0] ?? '';
  if (/^[A-Za-z][A-Za-z'’-]{1,30}$/.test(first)) return first;
  const biz = String(businessShortName ?? '').replace(/\s+/g, ' ').trim();
  return biz || 'there';
}
