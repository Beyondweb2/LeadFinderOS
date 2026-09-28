/* ══ A STORED PHONE → THE DIGITS WHATSAPP SENDS TO (E.164 without the "+") — ONE RULE (2026-09-28) ═══
   ⛔ THIS WAS FOUR HAND-KEPT COPIES (_shared/whatsapp-send.ts toWhatsAppNumber, process-whatsapp-queue's
   mirror, useInbox normalizeWaNumber, useColdCallPlaybook waDigits). They now all call this.
   ⛔ THE UK RULE IS UNCHANGED, BYTE FOR BYTE: "+"/"00" numbers keep their code; a leading 0 on a
   UK/GB (or blank-country) lead becomes 44; any other national form is bare digits. Pinned by
   scripts/india-readiness.test.ts against the old copy.
   🔴 WHAT WAS WRONG FOR INDIA. A national-form Indian number had no country code added: "98765 43210"
   became 9876543210, which Meta reads as +98 (Iran) — a stranger — and "098765 43210" became
   09876543210, which it refuses. Find Leads never stores those (Google gives "+91 …"), but a typed
   number can. An India lead's 10-digit mobile (6-9…) and 0-prefixed number now get 91.
   ⛔ PURE, NO IMPORTS: edge functions import this by relative path. */

const INDIA = new Set(['INDIA', 'IN']);

export function toWhatsAppDigits(raw: string | null | undefined, country?: string | null): string | null {
  let s = (raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '') || null;
  const cc = (country || 'UK').toUpperCase();
  if (INDIA.has(cc)) {
    const d = s.replace(/\D/g, '');
    if (/^91[6-9]\d{9}$/.test(d)) return d;          // already 91 + a mobile, typed without "+"
    if (/^[6-9]\d{9}$/.test(d)) return '91' + d;     // a 10-digit mobile
    if (/^0\d{10}$/.test(d)) return '91' + d.slice(1); // trunk 0 + 10 digits (mobile or STD landline)
    return d || null;                                  // anything else: best effort, as before
  }
  if (s.startsWith('0')) {
    if (cc === 'UK' || cc === 'GB') return '44' + s.slice(1);
    return s.replace(/\D/g, '');
  }
  return s.replace(/\D/g, '') || null;
}
