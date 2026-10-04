// inboundMatch — which lead an inbound WhatsApp belongs to when we have never messaged that number
// (2026-10-04, pre-sales certification M-005 / E-07; docs/pre-sales-certification/fixes-01-security-inbound.md).
//
// 🔴 THE CASE. Call-first selling: the rep phones, the prospect then WhatsApps the business number.
// There is no outbound row to that number, so the reply must be matched on the lead's stored phone.
// The old fallback prefiltered with `ilike '%<last 9 digits>%'`, and 5,474 of 5,476 stored phones
// contain a space ("07700 900123"), so it almost never matched: no lead, no unread, no notification.
// The candidates now come from public.inbound_lead_candidates(), which compares phone_key() on both
// sides — the canonical key the database already uses (idx_outreach_leads_phone_key, and
// my_sales_message_phones, the rule that decides which numbers a rep may read).
//
// ⛔ NEVER PICK ONE AT RANDOM. More than one candidate is a real ambiguity (the same number on two
// leads: a duplicate, a chain's central line, a person with two businesses). Choosing one would put
// the message — and its unread count and notification — in front of whichever rep happens to hold
// that row. The rule, enumerated, absent cases included:
//   · exactly one NON-archived candidate                       → that lead;
//   · no non-archived candidate and exactly one archived one   → that lead (it is still the only
//     row with that number; downstream guards already read `is_archived`);
//   · more than one non-archived candidate                     → ambiguous: no lead, Paul is told;
//   · no non-archived and more than one archived               → ambiguous;
//   · no candidate                                             → none (the admin-only Unassigned bucket).
// The conversation's owner column (`user_id`) stays the lead's book owner exactly as before; who is
// TOLD is the lead's holder (assigned_to_user_id), which the database's trg_notify_whatsapp and
// my_whatsapp_unread already resolve from lead_id — so linking the lead is what reaches the rep.
// Pure, no imports: edge-safe and unit-tested (scripts/inbound-phone-match.test.ts).

export interface InboundLeadCandidate {
  id: string;
  user_id: string | null;
  assigned_to_user_id: string | null;
  is_archived: boolean | null;
}

export type InboundLeadChoice =
  | { kind: 'matched'; leadId: string; userId: string | null; holderUserId: string | null }
  | { kind: 'ambiguous'; candidates: number }
  | { kind: 'none' };

export function chooseInboundLead(candidates: readonly InboundLeadCandidate[] | null | undefined): InboundLeadChoice {
  const all = (candidates ?? []).filter((c) => c && typeof c.id === 'string' && c.id.length > 0);
  const distinct = [...new Map(all.map((c) => [c.id, c])).values()];
  if (distinct.length === 0) return { kind: 'none' };
  const active = distinct.filter((c) => c.is_archived !== true);
  const pick = active.length === 1 ? active[0] : active.length === 0 && distinct.length === 1 ? distinct[0] : null;
  if (!pick) return { kind: 'ambiguous', candidates: distinct.length };
  return { kind: 'matched', leadId: pick.id, userId: pick.user_id ?? null, holderUserId: pick.assigned_to_user_id ?? null };
}

/** The app-side mirror of public.phone_key(): digits only, a leading 00 dropped, a UK 44 prefix
 *  dropped when ten digits follow, then a leading 0 dropped; under seven digits is no key. Used by the
 *  tests to prove the formats a rep types all meet on one key — the MATCH itself is done in SQL. */
export function phoneKeyLikeDb(phone: string | null | undefined): string | null {
  let d = String(phone ?? '').replace(/\D/g, '');
  d = d.replace(/^00/, '');
  if (/^44\d{10}$/.test(d)) d = d.slice(2);
  d = d.replace(/^0/, '');
  return d.length < 7 ? null : d;
}
