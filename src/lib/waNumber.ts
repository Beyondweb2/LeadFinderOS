/* ══ A STORED PHONE → THE DIGITS WHATSAPP SENDS TO (E.164 without the "+") — ONE RULE (2026-09-28) ═══
   ⛔ THIS WAS FOUR HAND-KEPT COPIES (_shared/whatsapp-send.ts toWhatsAppNumber, process-whatsapp-queue's
   mirror, useInbox normalizeWaNumber, useColdCallPlaybook waDigits). They now all call this.
   ⛔ THE UK RULE IS UNCHANGED, BYTE FOR BYTE: "+"/"00" numbers keep their code; a leading 0 on a
   UK/GB (or blank-country) lead becomes 44; any other national form is bare digits. Pinned by
   scripts/india-readiness.test.ts against the old copy. The ONE exception is below (04…).
   🔴 WHAT WAS WRONG FOR INDIA. A national-form Indian number had no country code added: "98765 43210"
   became 9876543210, which Meta reads as +98 (Iran) — a stranger — and "098765 43210" became
   09876543210, which it refuses. Find Leads never stores those (Google gives "+91 …"), but a typed
   number can. An India lead's 10-digit mobile (6-9…) and 0-prefixed number now get 91.
   🔴 WHAT WAS WRONG FOR AUSTRALIA (2026-10-07). An Australian national number ("0412 345 678") on an
   Australia lead was sent as bare 0412345678 (refused by Meta), and the SAME number on a lead labelled UK
   or with no country became 44412345678 — a UK-shaped number belonging to nobody we meant. Now:
     · an Australia lead's national number (0 + 2/3/4/7/8 + 8 digits, or those 9 digits without the 0, or
       61… typed without "+", or behind Australia's international prefix 0011) → 61…; anything else on an
       Australia lead (13 / 1300 / 1800 numbers, a mistyped number) → null, never bare digits that Meta
       would read as another country's number;
     · ⛔ a "04…" number on a UK / blank-country lead → null. The UK has no 04 numbers at all, so 44 + 4… is
       never a UK subscriber — it is almost certainly an Australian mobile stored without its country.
       Refused, not guessed.
   ⛔ PURE, NO IMPORTS: edge functions import this by relative path. */

/* ⛔ INDIA IS NO LONGER AN OUTREACH MARKET (2026-10-15). This branch stays ONLY so a HISTORICAL India lead's stored
   number still normalises to the digits its thread was sent to — replies, Inbox matching and the phone-history
   guard read it. It decides nothing about sending: cold WhatsApp to a non-UK destination is refused by
   src/lib/ukColdDestination.ts in the queue and in send-whatsapp-message. */
const INDIA = new Set(['INDIA', 'IN']);
const AUSTRALIA = new Set(['AUSTRALIA', 'AU']);

export function toWhatsAppDigits(raw: string | null | undefined, country?: string | null): string | null {
  let s = (raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  const cc = (country || 'UK').toUpperCase();
  // Australia's international prefix is 0011. Only for an Australia lead — anywhere else "0011…" keeps the
  // generic 00 rule below, exactly as before.
  if (AUSTRALIA.has(cc) && s.startsWith('0011')) s = '+' + s.slice(4);
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '') || null;
  if (INDIA.has(cc)) {
    const d = s.replace(/\D/g, '');
    if (/^91[6-9]\d{9}$/.test(d)) return d;          // already 91 + a mobile, typed without "+"
    if (/^[6-9]\d{9}$/.test(d)) return '91' + d;     // a 10-digit mobile
    if (/^0\d{10}$/.test(d)) return '91' + d.slice(1); // trunk 0 + 10 digits (mobile or STD landline)
    return d || null;                                  // anything else: best effort, as before
  }
  if (AUSTRALIA.has(cc)) {
    const d = s.replace(/\D/g, '');
    if (/^61[23478]\d{8}$/.test(d)) return d;               // already 61 + a national number, typed without "+"
    if (/^0[23478]\d{8}$/.test(d)) return '61' + d.slice(1); // trunk 0 + 9 digits: 04 mobile, 02/03/07/08 landline
    if (/^[23478]\d{8}$/.test(d)) return '61' + d;          // those 9 digits with the trunk 0 dropped (a spreadsheet)
    return null;                                            // 13 / 1300 / 1800 / mistyped: not a WhatsApp destination
  }
  if (s.startsWith('0')) {
    if (cc === 'UK' || cc === 'GB') {
      if (s.startsWith('04')) return null;                  // no UK number starts 04 — see the header
      return '44' + s.slice(1);
    }
    return s.replace(/\D/g, '');
  }
  return s.replace(/\D/g, '') || null;
}
