# Social profiles — Find socials, confidence, review, social outreach (2026-09-30)

Paul's brief: make Enrich a genuinely useful end-to-end sales tool for salespeople who prefer
LinkedIn / Facebook / Instagram. Approved decisions (not to be re-asked):

- This **supersedes the deep clean's "contact discovery is dead" for SOCIAL discovery** — it is kept and
  rebuilt. Our own crawl / site / questionnaire data first, free discovery where possible, paid only
  where needed.
- **LinkedIn is never scraped.** A person's LinkedIn is saved only when their own website links it;
  otherwise Sales gets **Search LinkedIn** and pastes / confirms the right profile.
- **Paid Enrich stays ADMIN-ONLY.** Sales gets Find socials, manual add / correct, confirmed / likely
  visibility and social outreach logging.
- The 6 malformed legacy Facebook links were cleared **with an audit trail**.
- Never overwrite a confirmed profile with a weaker match; never overwrite an email; Likely visibly
  different from Confirmed; Unverified needs a person before it is used; competing profiles go to
  review; a person's correction beats every later automated guess; social outreach reuses Last contact
  + History + Next Action.

## 1. How Enrich worked before (recon, 2026-09-30)

- **Paid Enrich** (`enrich-business`, ~$0.035, admin UI; the server also let Sales in): one Apify Google
  Maps scrape (`compass~crawler-google-places`: contacts + `facebooks`/`instagrams` + web results),
  then a homepage fetch via `extract-facebook`, then Facebook page / photo / Instagram scrapers.
  Facebook + Instagram only. Cache 30 days per place; $2/day/user cap; `business_enrich` usage rows.
- **Bulk enrich**: `bulk-jobs` `enrich` type, admin-only, ≤200 leads, one job at a time — calls
  enrich-business per lead with **no skip** for leads already enriched (only the cache saved money).
- **Used almost never**: 154 runs, $5.39 + $1.88 Maps, last 2026-08-06. 11 leads had a Facebook link,
  9 Instagram — all barber-era. **5 of the 11 Facebook links were display-truncated
  (`facebook.com/.../HairSalon`) and one was a bare `profile.php`** (the id stripped). A `manual` method
  meant "the value the browser sent back in", which is how a truncated link became "manual".
- **It overwrote an existing email** (server and the browser's own `updateLead` patch both).
- **Nothing reused what we held**: website crawls (`lead_crawl_checks.result.siteInfo.socialLinks`)
  had Facebook for 136 leads, Instagram 64, LinkedIn 20, X 26, YouTube 16, TikTok 12 — none copied.
  The crawl reads the homepage only and never reads schema `sameAs`; its links included builder
  accounts (`instagram.com/wix`), share buttons, bare `twitter.com`, a LinkedIn `/admin/` page, videos.
- `scan-site-details` harvests 7 networks but only for the page generator's response + cache.
- Google Places v1 has **no social field**; none is requested anywhere.
- LinkedIn / TikTok / YouTube / X had nowhere to be saved. The Outreach row's social icons were
  admin-only; Focus Mode and the Inbox showed no socials. Logging had one "Facebook / social message".

## 2. What exists now

| Piece | Where |
|---|---|
| The one normalise + grade rule | `src/lib/socialProfiles.ts` (`normaliseSocialUrl`, `extractSocialLinksFromHtml`, `handleMatchesBusiness`, `gradeSocialCandidates`, `socialOutcomes`, `linkedInSearchUrl`) |
| The finder + the upsert rule | `supabase/functions/_shared/social-find.ts` (records → own site → grade → `saveGraded`) |
| Find / add / confirm / reject | fn `social-profiles` (both roles, `resolveActor` + `leadAccess`, `guardAction('site_scrape')`) |
| Paid lookup | fn `enrich-business` — admin-only, free finder first, socials only through `saveGraded` |
| Storage + the canonical pick | table `lead_social_profiles`, `_social_profiles_sync` (trigger) → `facebook_url/_status/_method`, `instagram_*`, new `linkedin_url` / `linkedin_status` on `outreach_leads`; appended to `sales_leads` (migration `20260930140000`) |
| UI | `src/components/SocialLinks.tsx` — `SocialLinks` (the one line), `SocialProfilesPanel` (review), `FindSocialsButton`, `findSocialsForLeads` (admin bulk) |
| Logging | `contactMethods.ts` (`facebook`, `instagram` + `social: true` group), `salesCrm.ts` (`connection_sent`, `socialFollowUpPreset`, `SOCIAL_FOLLOW_UP_DAYS`), `LeadCrmPanel` LogContact / FollowUp |
| Tests | `scripts/social-profiles.test.ts` (the fixture sample + wiring); `contact-claim`, `sales-readiness`, `sales-shared-workflow`, `self-sourced-handoff`, `outreach-progressive`, `ui-cleanup-pass`, `role-rules`, `abuse-cost-protection` updated |

**Platforms**: Facebook, Instagram, LinkedIn business page, LinkedIn person (own-site link or pasted
only) are the outreach three; TikTok, YouTube, X are stored when their own site links them, shown in
the review panel, never chased and never a separate field.

## 3. How confidence works

- **Rejected, never stored**: share / intent / sharer links, posts / reels / videos / groups, bare
  roots, LinkedIn admin / share / posts, display-truncated links, `profile.php` without an id, a
  builder's / platform's / directory's own account, a government account (`…govuk`), a theme / template
  author, placeholders (`linkedinforreplacement`).
- **Confirmed**: on their own website (a link whose handle names the business, or schema `sameAs`),
  their Google listing, their questionnaire, or pasted / confirmed by a person.
- **Likely**: an own-site Facebook / Instagram / LinkedIn link whose handle cannot or does not name the
  business (numeric page ids are common); a found result (paid web results, or a crawl of a DIRECTORY
  page such as TradeHQ) with the name AND the town matching.
- **Unverified** ("Needs checking" / "Possible match"): everything weaker; own-site X / YouTube / TikTok
  not naming the business (the backfill sample found `x.com/DVLAgovuk`, `x.com/bold_themes`, a
  stranger's YouTube); two different profiles competing on the business's own sources; a link already
  on a DIFFERENT business (a franchise, a designer, a mistake).
- **The pick** (`_social_profiles_sync`, SQL, one place): a person's choice (manual, or `confirmed_by`)
  → exactly one confirmed → exactly one likely. Two at the top rank → none, status `review`.
  Unverified is never picked. The one LinkedIn column takes the more certain of company / person.
- **The upsert** (`saveGraded`): a rejected row is never re-activated; a person's row is never touched
  by an automated find; a grade is only ever raised.
- Name matching ignores trade words and legal forms incl. **LLC / Inc / Pty / Ltd**; the website's own
  label (`bmelectricals` from `bmelectricals.co.uk`, `.com.au` handled) also counts. Town matching is
  whole-word, never a UK postcode rule.

## 4. Where Sales sees and uses it

- **The Socials line** (`SocialLinks`): the lead popup header (with Find socials), the Outreach row and
  mobile card (both roles now — the admin's Enrich no longer draws its own FB/IG icons), Focus Mode
  (with Find socials; its LinkedIn button opens the saved profile, else "Search LinkedIn"), the Inbox
  thread header. Confirmed = solid chip + tick; Likely = dashed amber chip saying "likely"; review =
  "Facebook: to check". It reads the lead's own columns, so no list reads a second table.
- **The review panel** (popup → Prospect tab, `SocialProfilesPanel`): every profile with where it came
  from and why, **It's them** / **Not them**, paste a link (cleaned by the rule; a bad one gets a plain
  reason), Find socials, Search LinkedIn. "Not them" rows are kept (count shown) so no later search
  brings them back. The old "Socials & contact" card is now the admin's "Contact details" only.
- **Find socials** always ends with one line — e.g. "Facebook confirmed · No Instagram found · LinkedIn
  uncertain — check below" — plus a note when there is no website / it is a profile page / it did not
  answer. Errors toast; the spinner clears in `finally`.

## 5. Social outreach tracking + Next Action

- Log a contact: pills Call · WhatsApp · Email · In person · **Social** (five), and More. **Social →
  LinkedIn / Facebook / Instagram → outcome.** LinkedIn adds **Connection request sent**; every social
  method has Sent-no-reply, Spoke to owner, Interested, Call back, Meeting booked, Not interested, …
- Stored by `lead_log_contact` (allowlist gains `facebook`, `instagram`, `connection_sent`) as a
  `contact_logged` activity → **History** ("Facebook message: Sent, no reply yet"), **Last contact**
  (`lastLoggedContact`), and the claim / protection rule (`lead_contact_attempt_at` counts it).
- **Next Action**: after a social message / connection request, the existing Next Action box is
  pre-filled with **Follow up (other) in `SOCIAL_FOLLOW_UP_DAYS`** and a note ("Follow up on the
  Instagram DM") and scrolled into view. **The person presses Save next action** — Next Action stays
  human-set (`next-action-human-only.test.ts` unchanged and green). No second follow-up system.

## 6. Bulk + cost protection

- **Find socials** is free: DB reads, then at most the homepage + three contact / about pages of the
  lead's own site (8 s, 1 MB each, SSRF guard), cached per site 30 days (unreachable: 1 day) in
  `enrichment_cache` (`<host>:social_find_v1`), logged to `api_usage_log` at $0. The site is read only
  when the records leave Facebook or Instagram unconfirmed. `guardAction('site_scrape')` = suspension,
  pause modes, the per-hour window.
- **Admin bulk Find socials** on the Outreach selection: at most `SOCIAL_BULK_MAX` per run, three at a
  time, one toast at the end. Sales has no bulk.
- **Paid Enrich / bulk enrich**: admin-only on the server (Sales refused 403 `admin_only` before
  anything is paid); runs the free finder first; a lead that already has a confirmed Facebook AND
  Instagram AND an email is not bought again (`skipped: 'already_found'`); the $2/day cap, the cache and
  the 200-lead bulk cap are unchanged.

## 7. Backfill + legacy cleanup (live, 2026-09-30)

- Migration applied, read back (table, grants SELECT only for `authenticated` — REFERENCES / TRIGGER
  also revoked — none for anon, one SELECT policy, both triggers, view tail, new `lead_log_contact`).
- Legacy: 20 old links became rows; **6 malformed Facebook links = rejected rows keeping the original
  text (`reject_reason 'malformed_legacy'`) + 6 History lines**; the columns cleared by the sync.
- Crawl backfill (records only, no fetch, no spend) over the 146 leads with crawled links: 101 junk
  links rejected. A hand check of 40 confirmed rows found no wrong business; the likely sample showed
  the gov / theme / stranger-channel false positives, so the rule was tightened and ONLY the rows the
  backfill had just written (never touched by a person) were re-graded: 7 likely → unverified,
  4 confirmed → likely (directory-page crawls).
- Result: Facebook on **120** leads (82 confirmed / 38 likely; was 11, 6 broken), Instagram **66**
  (52 / 14; was 9), LinkedIn **12** (was 0), 2 Facebook in review; 151 leads with rows.

## 8. International readiness (US / Australia — not launched)

Ready: host folding (`en-gb.`, `uk.` / `au.linkedin`, `m.`), legal forms LLC / Inc / Pty in name
matching, `.com.au` / `.co.uk` / `.com` site labels, whole-word towns without postcodes, fixture tests
with Austin TX and Sydney / Parramatta examples. **Still UK-shaped, needs testing before a launch:**
- `enrich-business`'s old web-result location check uses the UK postcode OUTWARD code (then city /
  address parts) — a US ZIP / AU postcode is never used.
- US town names repeat across states (Springfield); the town match has no state / region token.
- `NAME_NOISE` trade words are UK-first — US (HVAC, realtor, attorney) and AU (sparky, tradie) words are
  missing, so a handle made of one could match on it.
- Same-business matching compares the stored phone string exactly — fine within one country's format,
  blind across formats.
- Nothing has been measured against real US / AU sites or Apify's non-UK Maps results.

## 9. Not done / known

- `clear-enrichment-cache` ("Reset to fresh") still nulls the columns directly; the table keeps its rows
  and the next change re-mirrors them. Left alone (deep-clean decision pending).
- Find Leads search results (no lead row) still carry paid-Enrich socials in their own search store; on
  add they land in the columns and the next Find socials ingests them as `legacy`.
- Nobody has looked at the new screens with eyes (text proof only).
