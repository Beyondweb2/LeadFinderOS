-- ONE NEXT ACTION, HELD BY THE DATABASE (2026-10-02). Applied after the live rows were lined up (docs/one-next-action.md).
-- A booking (call_booked_at, "Meeting booked") can only exist as the mirror of a Meeting Next Action with a time —
-- so "+ Set" over a booked meeting cannot be stored again, whoever writes the row. lead_set_follow_up writes the
-- Next Action and the booking in ONE update, so the check never sees a half-written row.
alter table public.outreach_leads drop constraint if exists outreach_leads_booking_is_the_meeting;
alter table public.outreach_leads add constraint outreach_leads_booking_is_the_meeting
  check (call_booked_at is null or (next_action = 'meeting' and next_action_time is not null));
