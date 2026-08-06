-- ============================================================================
-- Findable onboarding: the GBP step reversal, the risk question, and photos.
-- Run in the Supabase SQL editor. Safe to re-run (every statement is IF NOT EXISTS).
--
-- ⛔ NOTHING IS DEPLOYED AGAINST THESE COLUMNS UNTIL THIS HAS RUN AND BEEN CONFIRMED.
-- Proven 2026-08-04: findable-onboarding v18 shipped ahead of its five new columns and EVERY
-- submission died save_failed for ~20 minutes, including ones carrying none of the new fields.
--
-- ⛔ gbp_manager_email IS NOT DROPPED. The flow stops asking for it and stops writing it, but the
-- column stays: dropping it would destroy the answers already given, and a nullable text column
-- nobody writes costs nothing. Its comment is rewritten so the next reader knows it is dead.
-- ============================================================================

alter table public.onboarding_responses
  -- THE PRECONDITION. Asked before the three clicks, because "open your profile and add us" is
  -- impossible advice for someone who has no profile or cannot get into the one they have.
  -- 'yes' | 'not_claimed' | 'no' | 'not_sure'
  add column if not exists gbp_exists text,

  -- WHAT THEY DID ABOUT IT. Three states, not two: "cannot get in" is common (profile claimed by an
  -- ex-web-company, lost Google account) and it is the only one that needs Paul. Two options force
  -- someone in that position to lie or stall, and it surfaces in week three instead of week one.
  -- 'done' | 'will_do' | 'no_access'
  add column if not exists gbp_status text,

  -- THE RISK QUESTION, and the only one here that can embarrass us publicly. Claims that need a
  -- registration behind them (gas, electrical, accountancy) are far cheaper to know before we write
  -- the pages than to correct after they are published. Free text.
  add column if not exists must_not_say text,

  -- PHOTO READINESS, never files: 'phone' | 'online' | 'none'. There is no upload anywhere in this
  -- flow, and after the Places recon there is no automatic route either — Google's ToS 3.2.3(a)
  -- names "rehost" as a prohibited use of Maps Content, so a profile photo cannot legally be put on
  -- a client's own website. Asking is the main route, not the fallback.
  add column if not exists photos_status text;

comment on column public.onboarding_responses.gbp_exists is
  'Does a Google Business Profile exist and is it claimed: yes | not_claimed | no | not_sure. Asked before the add-us steps, which are impossible without one. NULL = not answered, never an answer.';
comment on column public.onboarding_responses.gbp_status is
  'What they did about adding us as a manager: done | will_do | no_access. no_access is the state that needs Paul. NULL = not answered.';
comment on column public.onboarding_responses.must_not_say is
  'Anything we must not claim on their behalf - registrations they do not hold, wording a trade body forbids. Free text. NULL = not answered, which is NOT the same as "there is nothing".';
comment on column public.onboarding_responses.photos_status is
  'Whether they have photos of their own work and where: phone | online | none. READINESS ONLY - no files are uploaded anywhere in this flow, and photos cannot be taken from their Google Business Profile (Maps ToS 3.2.3 forbids rehosting Maps Content). Asked before payment because having no photos stalls delivery.';

-- ⛔ DEAD, DELIBERATELY KEPT. It asked the client for THEIR email under the label "Email to add as
-- your Google Business Profile manager", which corresponds to no Google flow: in add-a-manager the
-- owner types the MANAGER's address, and in request-access Google supplies the owner's from its own
-- records. Nothing ever read it - eight readers of this table were checked, none selected it.
comment on column public.onboarding_responses.gbp_manager_email is
  'DEAD 2026-08-06. No longer asked for and no longer written. Never read by anything. Kept only so the answers already given are not destroyed; do not add a new consumer.';

-- gbp_consent keeps its column and its NOT NULL: it is plain text with no CHECK constraint, so the
-- value set changing from yes_all|listings_only|discuss to yes_all|pages_only|discuss needs no DDL.
-- Old rows keep 'listings_only' and are readable as the historical answer they were.
comment on column public.onboarding_responses.gbp_consent is
  'Permission to act on their behalf: yes_all (profile + pages) | pages_only | discuss. Was yes_all|listings_only|discuss until 2026-08-06 - listings_only referred to directory work we no longer sell. Old rows keep the old value.';
