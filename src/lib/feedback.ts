/* ══ FEEDBACK (Sales Experience release 5, 2026-09-28) ═══════════════════════════════════════════════
   The words and the checks, shared by the browser form, fn feedback-submit and the admin inbox.
   ⛔ Context is a POSITIVE allowlist (the page, the screen size, the browser, the app build): a stray
   field — a token, a lead's data — can never ride along into the table or the email. */

export const FEEDBACK_KINDS = [
  { value: 'feature', label: 'Suggest a feature' },
  { value: 'bug', label: 'Report a bug' },
  { value: 'confusing', label: 'Something is confusing' },
  { value: 'other', label: 'Other' },
] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number]['value'];

export const FEEDBACK_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'planned', label: 'Planned' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'wont_do', label: "Won't do" },
] as const;
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number]['value'];

export const FEEDBACK_MIN = 3;
export const FEEDBACK_MAX = 4000;
const CONTEXT_KEYS = ['path', 'viewport', 'userAgent', 'build', 'role', 'online', 'language', 'timezone'] as const;

export interface FeedbackInput { kind: FeedbackKind; message: string; context: Record<string, string> }

export function checkFeedback(raw: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = String(b.kind ?? '');
  if (!FEEDBACK_KINDS.some((k) => k.value === kind)) return { ok: false, error: 'bad_kind' };
  const message = String(b.message ?? '').trim();
  if (message.length < FEEDBACK_MIN) return { ok: false, error: 'too_short' };
  if (message.length > FEEDBACK_MAX) return { ok: false, error: 'too_long' };
  const ctxIn = (b.context && typeof b.context === 'object' ? b.context : {}) as Record<string, unknown>;
  const context: Record<string, string> = {};
  for (const k of CONTEXT_KEYS) if (ctxIn[k] !== undefined && ctxIn[k] !== null) context[k] = String(ctxIn[k]).slice(0, 300);
  return { ok: true, value: { kind: kind as FeedbackKind, message, context } };
}

/** What a refusal says, in words (the function sends it as `detail`). */
export const FEEDBACK_ERROR_TEXT: Record<string, string> = {
  too_short: 'Write a few words first.',
  too_long: 'That is too long — please keep it under 4,000 characters.',
  bad_kind: 'Choose what kind of feedback it is.',
  too_many: 'That is a lot of feedback in one hour — try again a little later.',
};

export const feedbackKindLabel = (k: string) => FEEDBACK_KINDS.find((x) => x.value === k)?.label ?? k;
export const feedbackStatusLabel = (s: string) => FEEDBACK_STATUSES.find((x) => x.value === s)?.label ?? s;

export function feedbackEmail(v: { id: string; kind: string; message: string; context: Record<string, string>; authorName: string | null; authorEmail: string | null; role: string }) {
  const who = v.authorName ? `${v.authorName} (${v.role})` : v.role;
  return {
    subject: `Feedback — ${feedbackKindLabel(v.kind)} — from ${v.authorName ?? v.role}`,
    text: [
      `${feedbackKindLabel(v.kind)} from ${who}${v.authorEmail ? ` <${v.authorEmail}>` : ''}`,
      '',
      v.message,
      '',
      '— Context —',
      ...Object.entries(v.context).map(([k, x]) => `${k}: ${x}`),
      '',
      `Open the Feedback inbox in LeadFinderOS to change its status (id ${v.id}).`,
    ].join('\n'),
  };
}
