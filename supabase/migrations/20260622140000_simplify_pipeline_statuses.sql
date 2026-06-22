-- Simplify Outreach pipeline statuses.
--
-- New 7-status pipeline: not_contacted → initial_contact → replied → site_sent →
-- interested → not_interested → payment_received (Paid).
--
-- The `status` column is plain TEXT (the lead_status enum was dropped to TEXT in
-- 20260217043651), so this is a pure data UPDATE — no type/enum changes.
--
-- SURGICAL: we migrate ONLY the Outreach contact/closed statuses. The Track Leads
-- deal stages (qualified, discovery_call_booked, proposal_sent, reviewing_proposal,
-- revision_requested, paid, closed_lost) live in this same column and are LEFT
-- UNTOUCHED. Likewise replied / site_sent / interested / not_interested /
-- not_contacted already map 1:1 and are left as-is.

-- 1. The "I've reached out" cluster → initial_contact.
--    Today's data only has `waiting` (11) + `delivered` (13) = 24 rows; the rest of
--    the list is defensive cover for legacy contact-as-status values (0 rows now,
--    incl. `contacted` which the bulk Mark-as-contacted button used to write).
update public.outreach_leads
set status = 'initial_contact'
where status in (
  'waiting', 'delivered', 'contacted',
  'sms', 'whatsapp', 'facebook_msg',
  'sent_initial_text', 'sent_voice_note',
  'not_answered', 'call_back', 'on_hold', 'no_whatsapp'
);

-- 2. Won/paid legacy statuses → payment_received (the single "Paid" terminal).
--    0 rows in current data; forward-safe for any other users.
update public.outreach_leads
set status = 'payment_received'
where status in ('completed', 'paid_for_draft');
