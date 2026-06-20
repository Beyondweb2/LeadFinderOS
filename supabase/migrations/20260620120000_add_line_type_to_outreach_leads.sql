-- HLR / line-type signal for the WhatsApp-capability proxy.
--
-- Populated by the per-lead enrich via Twilio Lookup (line_type_intelligence):
-- 'mobile' | 'landline' | 'voip' | 'unknown' | null. A 'mobile' number is the
-- LEGAL, ToS-safe proxy for "WhatsApp-capable" (we deliberately do NOT probe
-- WhatsApp itself). The existing whatsapp_status (set manually on wa.me open)
-- stays the confirmed signal. Additive, nullable — no backfill.
alter table public.outreach_leads
  add column if not exists line_type text,
  add column if not exists line_type_checked_at timestamptz;
