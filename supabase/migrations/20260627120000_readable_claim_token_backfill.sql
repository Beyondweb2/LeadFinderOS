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

update public.generated_sites
set share_token = site_name
                  || '-'
                  || translate(encode(gen_random_bytes(8), 'base64'), '+/=', '-_')
where owner_id is null;
