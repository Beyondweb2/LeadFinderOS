-- The send stamp means nothing was delivered on a lead put back to New / Queued after a failed send too (a
-- temporary failure re-queues and keeps whatsapp_sent_at — _shared/whatsapp-failure.ts). The SQL twin of
-- src/lib/leadState.ts STAMP_NOT_CONTACT_STATUSES (scripts/attempt-contact.test.ts holds the two lists equal).
-- Rollback: the definition in 20261001230000.
create or replace function public.lead_opener_really_sent(_status text, _sent_at timestamptz, _ever_delivered boolean)
returns boolean language sql immutable set search_path = public as $$
  select _sent_at is not null
     and (coalesce(_ever_delivered, false)
          or coalesce(btrim(_status), '') not in ('no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms', 'not_contacted', 'queued', ''))
$$;
