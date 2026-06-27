-- Readable-but-secret claim tokens: backfill existing UNCLAIMED sites.
--
-- New sites get a "<slug>-<random>" share_token from generate-barber-site (code).
-- This backfill makes existing sites' /s/ claim links pretty too: the site_name
-- slug (the same public slug used at /p/ and bookmybarber.uk) + a crypto-strong
-- url-safe random suffix that remains the actual secret (~64 bits).
--
-- SAFETY: WHERE owner_id IS NULL → ONLY unclaimed sites are touched. Any claimed
-- or paid site (owner_id set) is left completely unchanged, so no live owner's
-- link is affected. Claiming logic (begin-claim / claim-site) is untouched — only
-- the token's format changes; /s/ still resolves by exact share_token match.
--
-- NOTE: this invalidates any OLD /s/ link previously sent to an unclaimed site
-- (its token changes). That's intended here (those barbers hadn't claimed).

-- The slug prefix is the SLUGIFIED site_name (lowercase; spaces/apostrophes/punct
-- → hyphens; collapse repeats; trim leading/trailing hyphens; cap 40 chars), so
-- "Ted's Grooming Room" → "teds-grooming-room", not "Ted's Grooming Room". This
-- mirrors generate-barber-site's slugify(); for already-clean site_names it is a
-- no-op (idempotent). Empty result (e.g. all-punctuation name) falls back to "site".
update public.generated_sites
set share_token =
      coalesce(
        nullif(
          regexp_replace(
            left(trim(both '-' from regexp_replace(lower(site_name), '[^a-z0-9]+', '-', 'g')), 40),
            '-+$', ''
          ),
          ''
        ),
        'site'
      )
      || '-'
      || translate(encode(gen_random_bytes(8), 'base64'), '+/=', '-_')
where owner_id is null;
