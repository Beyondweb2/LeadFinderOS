-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- AUSTRALIAN PHONES MEET ON ONE KEY (2026-10-07, improve/au-location-parity).
--
-- Found: public.phone_key stripped a UK 44 only, so the two forms of ONE Australian mobile keyed apart —
--   '+61 412 345 678' → 61412345678   and   '0412 345 678' → 412345678
-- — and the identity lookup, the phone-key lock, the contact / claim / suppression joins and the Inbox
-- lead match all treated them as two different people. phone_e164_key gave the national form '+412345678'
-- (a number belonging to nobody), so "Wrong number" on such a lead suppressed nothing the senders dial.
-- A salesperson could not read the WhatsApp messages of an Australian lead stored in national form
-- (my_sales_message_phones offered only the 44 forms).
--
-- ── 1. phone_key: a 61 country code is dropped when exactly 9 digits follow and they start 2/3/4/7/8 (an
--    Australian mobile 4…, or landline 2… 3… 7… 8…). Every step before it is unchanged, byte for byte.
--    WHY IT CANNOT COLLIDE OR MOVE ANY OTHER COUNTRY'S KEY:
--      · it fires only on an 11-digit string 61[23478]xxxxxxxx AFTER the 00 / 44 steps. A UK key is 10 digits
--        after the 44 step (7700900123); a UK national number still starts 0 at this step ('01614960000' is
--        untouched until the final 0 strip → 1614960000). India is 91 + 10 = 12 digits; US / Canada 1 + 10.
--        +61 is Australia's code alone (Christmas / Cocos Islands share its plan). A Brazilian Brasília
--        mobile written without +55 ('61 9xxxx xxxx') has a 9 after the 61 — not in [23478] — and is untouched.
--      · the 9-digit result is the SAME key the national form '04…' / '02…' already produced before this
--        change; nothing enters a key space it was not already in.
--    Only Australian numbers written in the international form change key (61… → the 9 digits).
--
-- ── 2. phone_e164_key: an Australian number maps to '+61…' — from the international form (whose 61
--    phone_key now drops) and from the national mobile form '04xxxxxxxx' (the UK has no 04 numbers, so
--    that form is never a UK number). Every other input answers exactly what it did.
--
-- ── 3. my_sales_message_phones: for an Australian-shaped key the rep may also read '61…' / '+61…' (the
--    form whatsapp_messages.phone is stored in). The UK forms are unchanged.
--
-- 🔴 phone_key IS INSIDE TWO EXPRESSION INDEXES (migration 20260927100100):
--      idx_outreach_leads_phone_key      on outreach_leads    (public.phone_key(phone))
--      idx_whatsapp_messages_phone_key   on whatsapp_messages (public.phone_key(phone))
--    Replacing an IMMUTABLE function does NOT rebuild them: any row whose phone is an Australian number in the
--    '+61' form keeps its OLD key in the index until it is rebuilt, and an index-backed lookup
--    (phone_key(phone) = …) would then miss it. RUN 20261014100100_au_phone_key_reindex.sql STRAIGHT AFTER
--    this file (two REINDEX … CONCURRENTLY statements, each on its own, outside a transaction).
--    No stored column, generated column, unique constraint or CHECK uses phone_key (grepped every migration);
--    the advisory-lock keys built from it are per-transaction only.
--    ⚠️ contact_suppressions.phone_e164 rows written earlier for an Australian national number hold
--    '+4xxxxxxxx'. They are left as they are (rewriting rows is Paul's call): check with
--      select phone_e164 from public.contact_suppressions where phone_e164 ~ '^\+[23478][0-9]{8}$';
--
-- Additive / idempotent: CREATE OR REPLACE of three functions, each copied from its newest definition
-- (phone_key 20260927100100, my_sales_message_phones 20260927100500, phone_e164_key 20260929200000) with only
-- the lines above changed. The TS mirrors are src/lib/inboundMatch.ts phoneKeyLikeDb and src/types/outreach.ts
-- normalisePhoneKey; scripts/au-phone-key-parity.test.ts proves SQL and TS agree on a table of examples.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- A phone number reduced to digits with the country/trunk prefix removed, for identity only.
-- 07700 900123, +44 7700 900123 and 0044 7700 900123 all give 7700900123. Too short → NULL.
-- 0412 345 678, +61 412 345 678 and 0061 412 345 678 all give 412345678 (2026-10-07).
create or replace function public.phone_key(_phone text)
returns text language sql immutable parallel safe as $$
  select case when length(d) < 7 then null else d end
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(coalesce(_phone, ''), '\D', '', 'g'),
                 '^00', ''),
               '^44(?=\d{10}$)', ''),
             '^61(?=[23478]\d{8}$)', ''),
           '^0', '') as d
  ) x
$$;

-- The canonical '+<country><number>' key the edge senders compare against ('+' + toWhatsAppNumber):
-- a UK national number gets 44 back; an Australian number gets 61 back (2026-10-07); anything else keeps its
-- own code (phone_key keeps +91).
create or replace function public.phone_e164_key(_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when public.phone_key(_phone) is null then null
    when length(public.phone_key(_phone)) = 10 and public.phone_key(_phone) ~ '^[1-9]' then '+44' || public.phone_key(_phone)
    when length(public.phone_key(_phone)) = 9
         and regexp_replace(coalesce(_phone, ''), '\D', '', 'g') ~ '^(00)?61[23478][0-9]{8}$' then '+61' || public.phone_key(_phone)
    when length(public.phone_key(_phone)) = 9
         and regexp_replace(coalesce(_phone, ''), '\D', '', 'g') ~ '^04[0-9]{8}$' then '+61' || public.phone_key(_phone)
    else '+' || public.phone_key(_phone)
  end
$$;

-- Every stored form a message phone can take for the rep's leads: whatsapp_messages.phone is E.164
-- digits ('447700900123'); the key alone and the trunk form are included for older rows.
-- An Australian-shaped key (9 digits starting 2/3/4/7/8) also offers the 61 forms ('61412345678').
create or replace function public.my_sales_message_phones()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select distinct x.p from (
      select public.phone_key(l.phone) as k from public.outreach_leads l
      where l.id in (select public.my_sales_lead_ids())
    ) s
    cross join lateral (
      select v from (values ('44' || s.k), (s.k), ('0' || s.k), ('+44' || s.k)) as uk(v)
      union all
      select v from (values ('61' || s.k), ('+61' || s.k)) as au(v) where s.k ~ '^[23478][0-9]{8}$'
    ) as x(p)
    where s.k is not null;
end
$$;

revoke execute on function public.my_sales_message_phones() from public, anon;
grant execute on function public.my_sales_message_phones() to authenticated;

-- Read back:
--   select pg_get_functiondef('public.phone_key(text)'::regprocedure);
--   select public.phone_key('+61 412 345 678') = public.phone_key('0412 345 678');            -- true
--   select public.phone_key('07700 900123'), public.phone_key('+91 98765 43210');               -- 7700900123, 919876543210
--   select public.phone_e164_key('0412 345 678'), public.phone_e164_key('+61 2 9876 5432');   -- +61412345678, +61298765432
