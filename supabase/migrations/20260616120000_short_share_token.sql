-- Shorter, cleaner /s/:token links.
--
-- The original share_token default was two concatenated UUIDs (64 hex chars),
-- which made the shared link long and ugly. Switch the default to a 16-byte
-- (128-bit) random value encoded as URL-safe base64 (~22 chars) — still
-- unguessable, just far cleaner. pgcrypto's gen_random_bytes is already
-- available. translate(... ,'+/=','-_') maps to base64url and drops '=' padding.
--
-- DEFAULT ONLY: existing rows keep their current tokens so any /s/ link already
-- shared stays valid. New generated sites get the short token automatically.

alter table public.generated_sites
  alter column share_token
  set default translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_');
