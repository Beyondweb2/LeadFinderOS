# UGC Brand Finder (Jess) — record

Branch `feat/ugc-brand-finder`, built 2026-10-29. Stage 1 (build, migration written not applied, mockup screenshots) is done; stage 2 (apply migration, load her data, merge, deploy) waits for Paul's approval and for `feat/build-payment-options` to merge.

## What it is
A separate page (`/ugc`) for Jess (UGC creator, jesscousin.com) to find brands that pay for UGC, get the right contact, and pitch them herself. Nothing is sent from the app.

## Separation rules (enforced, not just hidden)
- **Own tables**: `ugc_members`, `ugc_settings`, `ugc_brands`, `ugc_brand_events`, `ugc_runs`, `ugc_pitch_system`, `ugc_pitch_log` (migration `20261129090000_ugc_brand_finder.sql`). RLS on every one. No Findable table is read or written (except the Apify usage snapshot, read-only, to stop at the shared cap).
- **Jess's login has no Findable role** — a `ugc_members` row, never `user_roles`. `my_role()` stays NULL for her, so every Findable policy and edge function keeps refusing her (`no_role`). Checked live on 2026-10-29: the only rows a role-less account can read are `profiles` (team display names), `uk_towns`, `directory_businesses` and published `generated_sites` — pre-existing, not caused by this.
- **Her pitch system, rates and pitch log are owner-only**: not even the admin can read them (policies use `auth.uid()` + `is_ugc_member()`, never `my_role()`). The pitch action refuses anyone but the member herself.
- **Her files never go in git**: `docs/ugc/jess-pitch-system/` is gitignored. Her workbook `UGC_brand_pitch_list_50.xlsx` is copied there locally only. Content goes into `ugc_pitch_system` / `ugc_pitch_log`.
- One server door: fn `ugc-brands` (`verify_jwt = true`, `resolveUgcCaller`). It never writes `user_roles`/`team_members`, never calls a sender.

## Money
- Every Apify run shows its estimate first (free-plan rate = ceiling) and starts with Apify's own `maxItems` + `maxTotalChargeUsd`, so it cannot cost more than shown.
- Refused when: Paul's emergency stop is on; the shared Apify account is at `UGC_APIFY_STOP_PCT` (80%, below Findable's prospecting stop); her own monthly budget (`ugc_settings.monthly_budget_usd`, default $15, admin-set) would be passed; the Apify reading is missing (fail closed).
- ⚠️ The named-contacts enrichment price is **not published** by the actor (checked 2026-10-29). `ENRICH_LEAD_USD_CEILING` / `ENRICH_VERIFY_USD_CEILING` are deliberate high ceilings — replace them with the billed figure after the first run.
- Instagram profile scraper: does **not** return a business phone or WhatsApp (only business flag, category, website) — skipped as a WhatsApp source.

## Her rules in code
- Tiers (`src/lib/ugc/tiers.ts`, derived): hard no's (mega-brand, retailer/marketplace, her blocked list, already in her pitch log until its re-pitch date, gambling, crypto, forex/money courses, religion-based, dropshipping signs). Tier B from the Ads Library: 5+ active video ads with one started in the last 60 days, or 3+ started in the last 30 days. A/C/D need her judgement (her written rules are in her pitch system) — `tier_override`, else "unrated". Template follows tier: Ad idea v2 (A/B), Video idea v3 (C/D).
- Contact order (`contactOrder.ts`): named person (verified email) > partnerships@/creators@/collabs@/influencers@/press@ > marketing@ > generic inbox or IG DM > form. Generic inbox → her Generic inbox template.
- One active channel per brand: `ugc_log_contact` / `ugc_release_channel` + trigger `ugc_brands_channel_guard`.
- Follow-ups at +5 and +12 business days (brand track). Local Chiang Mai track: CM collab DM v4, no follow-ups, kept apart.
- Pitch pipeline (`pitch.ts`): write (her system + About Jess + one template + research) → independent review (concept gate, hook test, template) → code checks (no rate, no Thailand in a brand pitch, no figure not in About Jess/research, no placeholder, portfolio link where her template has one). Max 3 attempts, then **Needs Jess** — nothing drafted, any old draft cleared.
- WhatsApp: "Open WhatsApp chat" (wa.me on her phone). Default opener is the two-step ask (Paul's draft, marked **Jess to approve** until she ticks it); a named person's own number gets the direct pitch. Numbers are tagged by source and mobile/landline (`src/lib/lineType.ts`, derived on read).
- API WhatsApp sending (a UGC queue/inbox reusing the shared inbox component) is **not built**: `ugc_settings.whatsapp_api_enabled` defaults false, cap 25–100, admin-only. It must never use the Findable number or touch the Findable Meta setup / held whatsapp-status webhook. No SMS for UGC.

## Open (needs Paul / Jess)
- `docs/ugc/jess-pitch-system/pitch-system.md` was **not found on this machine** (searched the user folder 2026-10-29). Her verbatim templates, concept recipe/gate, hook test and Tier A/C/D rules load from it — until then the writer returns "Needs Jess".
- Her Agency roster v1 template (per her sheet) says "I'm based in Thailand". Kept as written for agencies; the Thailand ban applies to brand pitches only — confirm.
- Stage 2: apply the migration (one statement file, by hand), create Jess's login from Settings, load her pitch system + workbook pitch log into her private records, deploy `ugc-brands`, then the SPA.
