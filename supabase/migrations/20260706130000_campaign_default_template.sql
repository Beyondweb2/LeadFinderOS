-- Optional per-campaign DEFAULT WhatsApp template. ADDITIVE ONLY, nullable, NO
-- backfill — mirrors exactly how description / method / default_sale_type were added.
-- Plain text, validated app-side against the WHATSAPP_TEMPLATES allowlist (same
-- approach as method / default_sale_type), so renaming/adding a template later needs
-- no migration. Existing campaigns stay NULL and behave exactly as today — manage-sites
-- simply falls back to the current first-in-list default template.
-- campaigns RLS is unchanged (the creator-only update policy already covers this column).

alter table public.campaigns
  add column if not exists default_template text;  -- a WHATSAPP_TEMPLATES key, or null
