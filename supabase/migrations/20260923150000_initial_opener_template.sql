-- The ONE selected initial cold opener (src/lib/openerVariant.ts). Replaces the 50/50 opener split
-- (2026-09-23). Default = the original opener, initial_contact. Applied live 2026-09-23 via the
-- Management API and read back; kept here as the record. Additive and idempotent.
alter table public.whatsapp_outreach_state add column if not exists initial_opener_template text default 'initial_contact';
update public.whatsapp_outreach_state set initial_opener_template = 'initial_contact' where id = 1 and initial_opener_template is null;
