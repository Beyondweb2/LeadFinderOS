-- FIX THE COUNTRY ON 374 LEADS WHOSE OWN GOOGLE ADDRESS SAYS OTHERWISE (India readiness, 2026-09-28)
--
-- What it does: sets outreach_leads.country to the country named at the end of the lead's own
-- Google address, ONLY where the two disagree. Measured before writing this:
--   349 leads stored as USA whose address ends ", UK"  (UK businesses, added 17-18 Sep)
--    23 leads stored as UK  whose address ends ", USA" (Florida businesses, added 27 Sep)
--     2 leads stored as UK  whose address ends ", Thailand" (Chiang Mai)
-- Why it happened: Find Leads remembered the last Quick Locations country out of sight. That is fixed
-- in code (the country now comes from Google's address); this corrects the rows already written.
-- Why it matters: the Hook Audit asks the engines from the lead's country, and its questions name it
-- ("Grimsby USA"); sends were never affected (every phone is stored with its own +44 / +1 code).
-- Nothing is deleted; only the country column changes. Run once; running again changes 0 rows.

update public.outreach_leads o
   set country = m.addr_country
  from (
    select id,
           case lower(btrim(regexp_replace(address, '^.*,', '')))
             when 'uk' then 'UK' when 'united kingdom' then 'UK'
             when 'usa' then 'USA' when 'india' then 'India'
             when 'thailand' then 'Thailand' when 'australia' then 'Australia'
           end as addr_country
      from public.outreach_leads
     where address like '%,%'
  ) m
 where o.id = m.id
   and m.addr_country is not null
   and m.addr_country is distinct from o.country;
