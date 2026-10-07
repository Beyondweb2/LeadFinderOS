/* ══ COLD WHATSAPP OUTREACH IS UK-ONLY (2026-10-15) ═══════════════════════════════════════════════
   Paul's rule: Findable's cold WhatsApp goes to UK mobiles and nowhere else. India is no longer an outreach
   market; Australia stays supported for search, phone normalisation, lead handling and AI checks, but its
   cold WhatsApp stays OFF. Historical India/Australia data is untouched — this is a rule on what may be
   SENT, not on what may be stored or read.

   ⛔ THE TEST IS A PROPERTY OF THE DESTINATION, NOT A LIST OF COUNTRIES WE HAPPEN TO REFUSE. It reads the
   WhatsApp digits (E.164 without "+"), never outreach_leads.country (measured wrong on ~370 rows), and it
   accepts ONLY a UK mobile: 44 then 7 then nine digits. Absent, malformed, foreign or landline all answer
   false — the absent-value law (CLAUDE.md §6) pointed the safe way: on a sending path, unknown means do not.
   The SQL twin is sales_queue_opener's `coalesce(country,'UK')='UK' and phone_key ~ '^7[0-9]{9}$'`
   (migration 20261015090000_outreach_uk_only.sql); keep them equal.
   ⛔ PURE, NO IMPORTS: the queue and send-whatsapp-message import this by relative path. */

/** The reason code the queue, Sales and the SQL all share. It is a stored/consumed token — never rename it. */
export const NOT_A_UK_MOBILE = 'not_a_uk_mobile';

/** True only for a UK mobile in WhatsApp digits ("447700900123"). Everything else — including null — is false. */
export function isUkColdDestination(digits: string | null | undefined): boolean {
  const d = String(digits ?? '').replace(/\D/g, '');
  return /^447\d{9}$/.test(d);
}
