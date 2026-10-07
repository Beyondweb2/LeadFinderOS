/* ══ THE CUSTOMER'S EMAIL IN THE CLOSE FLOW (2026-10-07, fix/customer-email-close-flow) ═══════════════════════
   The close screens email the link to the CUSTOMER and to nobody else. ONE recipient rule, ONE validator, here —
   the edge function (quick-close) imports this file, so the screen and the server cannot disagree.

   ⛔ RECIPIENT: the onboarding row's confirmed contact email, then the lead's own email. NOTHING ELSE — never the
   logged-in salesperson, never the admin, never a configured operator address. No customer email means "ask for
   one"; it never means "send it to Paul". (QA leads are a separate, explicit rule: src/lib/qaSafety.ts.)
   ⛔ Relative-import safe: no `@/` and no imports at all (it is reached from supabase/functions/quick-close). */

export const CLOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CloseEmailCheck = { ok: true; email: string } | { ok: false; reason: 'blank' | 'invalid' };

/** Trim + lower-case, then a practical check: one @, a dotted domain, no spaces, no empty or doubled-dot parts. */
export function cleanCloseEmail(raw: unknown): CloseEmailCheck {
  const e = String(raw ?? '').trim().toLowerCase();
  if (!e) return { ok: false, reason: 'blank' };
  if (e.length > 254 || !CLOSE_EMAIL_RE.test(e)) return { ok: false, reason: 'invalid' };
  const [local, domain] = e.split('@');
  if (!local || local.startsWith('.') || local.endsWith('.') || e.includes('..') || domain.startsWith('.') || domain.startsWith('-') || domain.endsWith('.')) return { ok: false, reason: 'invalid' };
  return { ok: true, email: e };
}

export const CLOSE_EMAIL_INVALID_TEXT = 'That email address does not look right.';

/** Who the link is emailed to: the sign-up's confirmed contact email, else the lead's own. Null = ask for one. */
export function closeRecipient(rowEmail: unknown, leadEmail: unknown): string | null {
  for (const candidate of [rowEmail, leadEmail]) {
    const c = cleanCloseEmail(candidate);
    if (c.ok) return c.email;
  }
  return null;
}

/** The email that carries the FULL SETUP link (their own questions → agreement → payment). Plain text. */
export function fullSetupEmail(i: { greetName: string | null | undefined; businessName: string | null | undefined; url: string; senderName: string | null | undefined; greeting: string }): { subject: string; text: string } {
  const biz = String(i.businessName ?? '').trim();
  const sender = String(i.senderName ?? '').trim();
  return {
    subject: `Your Findable set-up link${biz ? ` - ${biz}` : ''}`,
    text: `${i.greeting}\n\nHere's your set-up link — a few short questions, then your agreement and payment, all in one place:\n${i.url}\n\nAny questions, just reply to this email.\n\n${sender ? `${sender}\n` : ''}Findable`,
  };
}
