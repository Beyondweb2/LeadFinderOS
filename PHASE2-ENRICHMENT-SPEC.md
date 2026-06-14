# Phase 2 — Apify Enrichment Backbone (email + Facebook + Instagram)

## Goal
A single shared enrichment engine that resolves CONTACT details for a lead from its name + place_id + (optional) website — covering the NO-WEBSITE majority. One resolver, three enrichment types (email, facebook, instagram). Apify is the external provider but MUST be STUBBED in this build (no real key, no real calls). Everything must build, self-test against the stub, and be ready for a real APIFY_TOKEN to be slotted in last.

## Branch / rules
- Work on branch `feature/email-enrichment` (continue from the committed Phase-1 work). git fetch first, confirm remote LeadFinderOS. Do NOT merge. Do NOT touch salon/barber code.
- Build green after every step (tsc + npm run build). Self-correct failures until green.
- All Apify calls go through ONE stub module that returns realistic fake data, controlled by an env flag. NEVER call the real Apify API in this build.

## Data model (migration, additive, mirror facebook_* pattern)
Add to outreach_leads (email_* already exist from Phase 1 — do NOT re-add those):
- instagram_url text null, instagram_status text null, instagram_method text null, instagram_last_checked_at timestamptz null
- (facebook_* already exist — reuse; add facebook_status text null if missing, values 'found'|'none'|'error'|null, to match the email/instagram status pattern)
- enrichment_source text null  (provenance: 'website_scrape' | 'apify' | 'manual')
NEW TABLE enrichment_cache (so we never pay twice):
- id uuid pk default gen_random_uuid(), cache_key text unique (e.g. place_id + ':' + enrichment_type), enrichment_type text ('email'|'facebook'|'instagram'), result jsonb, created_at timestamptz default now(), expires_at timestamptz
- index on cache_key.
NEW TABLE enrichment_usage (durable cost cap — the in-memory limiter isn't enough for real money):
- id uuid pk, user_id uuid, enrichment_type text, cost_usd numeric default 0, created_at timestamptz default now()
- This is the source of truth for a per-user DAILY spend cap.

## Cost cap (hard, durable)
- Before any (stubbed) Apify call: check enrichment_usage for this user's spend in the last 24h. If >= DAILY_CAP_USD (config constant, default 2.00), refuse with a clear "daily enrichment limit reached" response. 
- After a successful call: insert an enrichment_usage row with the (stub) cost, AND insert to api_usage_log (api_type:'apify_<type>') so the admin cost dashboard shows it.
- Check enrichment_cache FIRST — a cache hit costs nothing and skips the cap check.

## Edge function: enrich-lead
ONE function handling all three types. Mirror extract-facebook/extract-email scaffolding (in-handler Bearer auth, verify_jwt=false in config.toml, service-role client for privileged writes).
- Input: { lead_id, enrichment_type: 'email'|'facebook'|'instagram', place_id, business_name, website? }
- Flow: (1) check enrichment_cache → hit returns cached result, no cost. (2) miss → check daily cap → if over, refuse. (3) under cap → call the APIFY STUB module. (4) write result to enrichment_cache, enrichment_usage, api_usage_log. (5) update the outreach_leads row (the relevant *_url/*_status/*_method/*_last_checked_at + enrichment_source).
- For EMAIL specifically: if the lead HAS a website, prefer the existing extract-email website path (free, accurate) BEFORE any Apify call. Apify email is only the fallback for no-website leads.

## Apify stub module (_shared/apify-stub.ts)
- A single module the edge function imports. Reads env flag APIFY_MODE: when 'stub' (default/always in this build), returns realistic fake data shaped like the real Apify response we expect (email: a plausible info@domain; facebook/instagram: plausible profile URLs), with a small fake cost_usd. When 'live' (NOT used in this build), it would call real Apify — leave a clearly-marked TODO with the real call structure but do not wire a real key.
- This is what lets the whole pipeline build + self-test with zero spend. The real integration is a later, deliberate swap.

## UI wiring
- Extend the per-lead enrichment area in PotentialWork.tsx (where EmailSection/FacebookSection live). Add Instagram alongside, and add an "Enrich (auto)" action per type that calls enrich-lead.
- Keep Phase-1 website email behaviour. For no-website leads, the email button now works via enrich-lead (Apify path) instead of being disabled — update the disabled hint accordingly.
- Show status badges (found/none/error) and last-checked, consistent with the existing email/FB display. Show a clear "daily limit reached" state if the cap refuses.

## Future-proofing for the intelligence layer (cheap now, invaluable later)
- Ensure every enrichment writes provenance (enrichment_source, method, last_checked_at) and that enrichment_usage captures per-type spend per user. This is the clean data the later AI/intelligence layer will read. Don't build the AI — just make sure the data is captured properly now.

## ACCEPTANCE TESTS (the loop must make all pass before declaring done)
1. Migration applies cleanly; all new columns/tables exist (verify against the linked DB).
2. tsc clean + npm run build green.
3. enrich-lead deploys ACTIVE; config.toml has its verify_jwt=false block.
4. With APIFY_MODE=stub: calling enrich-lead for each type (email/facebook/instagram) returns the stub data and writes the correct outreach_leads fields + cache + usage rows. (Write a short test script or documented manual curl steps proving each.)
5. Cache hit path: second identical call returns cached result and writes NO new usage/cost row.
6. Cost cap: simulate usage >= DAILY_CAP_USD and confirm the next call is refused with the limit message and makes no stub call.
7. Email-with-website still prefers the free website path before Apify.
8. No salon/barber files changed (git diff clean on those).

## Out of scope (do NOT do)
- No real Apify key, no real Apify calls, no live cost.
- No merge to main.
- No intelligence/AI layer (data capture only).
- No new website templates.
