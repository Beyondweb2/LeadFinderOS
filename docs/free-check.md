# The free-check lane — MVP, live end to end, and where it meets the baseline

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6j on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 6j. ✅ BUILT + LIVE: free check → funnel top (MVP shipped 2026-08-20). ⛔ PHASE 2 IS NOW BUILT — READ §15 FIRST.

🔴 **§15 SUPERSEDES THIS SECTION WHERE THEY DISAGREE (2026-09-03 → 09-07).** The auto-audit shipped,
the result is emailed to the visitor, and four faults in that lane have been found and fixed since
(the town gate refusing every unresolvable business, the dedupe merging different businesses, the
operator email asserting states it never checked, and the result never reaching a MATCHED lead).
Everything below is still true as the MVP's record.

**PHASE 1 IS LIVE.** Deployed 2026-08-20: `findable-onboarding` v39, `notify-onboarding-submit` v9,
`backfill-lead-towns` v9, and findable-site. Confirmed live with a ZERO-SPEND probe — a submission
carrying an EXISTING lead's exact name, which the dedupe catches at rung 1 before any paid call:
response came back `{"ok":true,"lead":"matched"}` (the `lead` field exists only in the new version),
the row was written with `source='free_check'` and linked to that lead, and the lead count stayed at
1,646 so no duplicate was created. Probe row deleted afterwards.
⚠️ **A REAL SUBMISSION HAS STILL NEVER HAPPENED, AND THE PAID PATH HAS NEVER RUN.** The probe
matched at the free rung on purpose, so Text Search / Place Details / resolveDerivedTown are proven
only by code and by `deno check` — not by a live call. Paul is watching for the first real one.
⚠️ **THE NOTIFIER'S NEW EMAIL WAS NOT OBSERVED.** Its copy is proven by code + deploy only. The
probe row existed for ~60s with the delay bypassed, so the cron may have sent one
`FREE CHECK — MCR Heating and Plumbing ltd` email; if that arrived, it was the probe, not a prospect.

**⛔ PHASE 2 (AUTO-AUDIT) IS DELIBERATELY NOT BUILT.** ⛔ **OUT OF DATE — IT WAS BUILT AND IS LIVE;
free checks now run an audit and email the visitor their result. §15.** The paragraph below is the
record of the hold, not the current state. Paul: "I want to watch a real submission
create a lead first." Generic mode's lockdown #1 (never fires an audit) is UNTOUCHED — nothing in
this flow queues a question, spends Apify, or sends anything.

**What shipped, and where the reasoning lives (read the file headers, they carry the detail):**
- `_shared/place-resolve.ts` — the guarded place-id resolver, EXTRACTED VERBATIM from
  backfill-lead-towns. Two consumers now, so **both redeploy together** (§4's shared-file trap).
- `_shared/free-check-lead.ts` — `createFreeCheckLead`. Owner resolved FROM THE DATA (newest lead's
  user_id). Dedupe = the database, FAILS CLOSED, ordered by COST (name free → place_id → phone) so a
  repeat submission spends nothing. Cap `FREE_CHECK_DAILY_LEAD_CAP = 10` per rolling 24h, checked
  BEFORE the first paid call. Town via `resolveDerivedTown` so a refusal leaves the lead town-GATED.
  Never throws. Real cost when all three calls run: **$0.057 ≈ 4.5p**.
- `findable-onboarding` — validated `source` in all THREE places; lead creation runs AFTER the row is
  saved and can never fail the request; the row is linked for `matched` as well as `created`.
- `notify-onboarding-submit` — free-check subject/heading/opening/tail, the TRADE finally included
  (`services` was missing from the SELECT), and the 20-min delay bypassed for these rows only.
- `scripts/free-check-lead.test.ts` — ladder order + spend, fail-closed on every dedupe read, cap
  boundary, blank name/town, absent place/phone, and the source gate against 9 junk values.

🔴 **THE NUMBER TO STOP QUOTING: "1000 leads" WAS PostgREST'S TRUNCATION, NOT A COUNT.** Re-derived
2026-08-20 with paginated reads: **1,646 outreach_leads, 465 ai_audits, 515 ai_audit_runs, ALL owned
by the single account below.** §6's paginate rule, caught in this file's own notes.

**What exists today (verified in deployed code + live DB, 2026-08-19):**
- findable.live's FreeCheck posts `findable-onboarding` `action:"submit"`, no lead_id,
  `incomplete:true`, answers = business_name / confirmed_location / services / contact_email →
  GENERIC MODE: one `onboarding_responses` row (`lead_id` null, `status 'submitted'`), then stops.
- Paul WOULD see it: the notify cron picks generic rows (its query has no lead_id filter) after the
  20-min delay — but the email is MISLABELLED ("Questionnaire submitted, not paid" / "reached the
  payment screen and stopped") and OMITS the trade (`services` isn't in its SELECT; its trade line
  reads only off a linked lead). The dashboard SubmissionsCard lists generic rows fine.
- **NO edge function inserts `outreach_leads` — lead creation is 100% client-side** (`useOutreach`).
- `create-ai-audit`'s question generator falls back to DETERMINISTIC TEMPLATES on ANY non-OK OpenAI
  response (`if (!res.ok) return fallback`, ~line 1091) — audits run end-to-end while OpenAI is dry.
- `backfill-lead-towns` is operator-JWT only (no internal branch) and address-only (NO phone);
  phone comes from the `_shared/place-details.ts` machinery (`fetchPlaceDetails`, ENTERPRISE_FIELDS,
  `townFromComponents`) — a server flow should IMPORT the shared module, not call the fns over HTTP.
- addLead's DB-keyed dedupe to replicate server-side (useOutreach.ts ~:489): place_id → exact phone
  → exact name, archived rows count, FAILS CLOSED. The queue's phone-history seatbelt + suppression
  live in `process-whatsapp-queue` and apply to ANY lead regardless of origin — nothing to build.

**The approved decisions (all four SHIPPED except #4, which is held):**
1. SQL (handed to Paul 2026-08-19): `onboarding_responses.source text`, nullable, no default, no
   CHECK — old deploys unaffected; unknown source flags, never blocks. ⚠️ Confirm it has RUN before
   deploying anything that writes it (§3 SQL-first).
2. MVP FIRST (phase 1 only): submit → row saved with `source='free_check'` → server-side lead
   creation (owner = **the account that owns the data, NOT ADMIN_EMAIL** — see the 🔴 note
   directly below; dedupe as above; trade →
   `search_keyword`, town → `search_location`, email fill-empty, status `not_contacted`,
   provenance in enrichment_source/notes; three-guard place resolution + place-details → place_id/
   phone/address/derived_town, ≈5p; resolution refusal = lead still created, town-gated, flagged in
   the email; onboarding row's lead_id linked to the created/matched lead) → notify email
   free-check-aware (subject "FREE CHECK — {name}", trade line added, NO 20-min delay for these
   rows). findable-site FreeCheck adds `source:"free_check"`. Keep the honeypot.
   **Deploy order: SQL → findable-onboarding + notify-onboarding-submit → findable-site.**

   🔴 **THE OWNER IS `pauljsales455@outlook.com`, NOT `paul@move37.fun`. RESOLVING IT BY
   ADMIN_EMAIL WOULD HAVE MADE EVERY FREE-CHECK LEAD INVISIBLE.** Corrected 2026-08-19 — the
   original plan said "operator user_id resolved by ADMIN_EMAIL lookup" and that was wrong.
   Measured live that day: **user_id `9d5a7629-3171-4091-b3a4-43010a1d424d`
   (`pauljsales455@outlook.com`) owns ALL of it** — 1000 outreach_leads, 457 ai_audits, 507
   ai_audit_runs, with no second owner on any of the three. `paul@move37.fun`
   (`a3ce543d-fc8a-46c3-8072-723351b7138e`) is **ADMIN_EMAIL, the notification recipient, and owns
   NOTHING.**
   - ⛔ Because RLS scopes the SPA's reads by `user_id`, a lead created under the ADMIN_EMAIL
     account saves with HTTP 200 and then **cannot be seen in Outreach, the Inbox or any count** —
     the RLS-returns-200-with-`[]` failure (§8) in a new place, on the funnel's front door.
   - ⚠️ **DO NOT hardcode either UUID.** Resolve the owner from the DATA (e.g. the `user_id` on the
     most recent `outreach_leads` row) or from an explicit new secret — never from ADMIN_EMAIL, and
     never from a literal pasted out of this file, which goes stale the day the account changes.
   - ⚠️ **The same trap applies to any future server-side writer of an owner-scoped table**
     (leads, audits, runs, notes). ADMIN_EMAIL answers "who do we email", never "whose row is this".
   - **How it surfaced:** a minted session for `paul@move37.fun` got `forbidden` from
     extract-competitors' ownership check on all 51 runs of the cleaner catch-up. Nothing was spent
     (the ownership check precedes the OpenAI call), and the catch-up succeeded once the session was
     re-minted for the outlook account.
3. Auto-spend cap: **10 free-check leads/day** — rows past the cap still save + notify, they just
   don't spend Places money automatically (generic mode has NO rate limit today and each submission
   starts costing real pence).
4. Phase 2 (ONLY after Paul has seen MVP work): auto-audit via internal create-ai-audit call
   (service-bearer pattern whatsapp-inbound already uses), 5 questions, skip_seo, NO auto-pitch —
   approved to run with template questions even while OpenAI is dry. Phase 3 is nothing: the lead's
   phone puts it in the normal Outreach → queue flow with all guards.

---


---

> Moved from CLAUDE.md §15 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 15. ✅ THE FREE-CHECK LANE IS LIVE END TO END — and every fault in it was a lie the operator was told (2026-09-03 → 09-07)

⛔ **§6j's "PHASE 2 (AUTO-AUDIT) IS DELIBERATELY NOT BUILT" IS SUPERSEDED. It is built, it fires, and
the result is emailed to the visitor.** Read this section over §6j where they disagree.

- 🔴 **THE TOWN GATE REFUSED EVERY AUDIT FOR A BUSINESS GOOGLE CANNOT FIND.** The auto-audit was
  wired correctly and did fire — it was refused one call later, silently. No place_id → no
  derived_town → `townVerdict` settled-unverifiable → `create-ai-audit` returns **409
  `town_unverified` BEFORE it reads `location_text`**. Measured 4 of 4, no exceptions: the two
  businesses Google resolved got an audit, the two it could not got a lead, an email telling Paul to
  do it by hand, and nothing else.
  - ⛔ **THE GATE WAS RIGHT ABOUT PROSPECTING AND WRONG HERE.** It exists because an audit against
    an INFERRED town cost two prospects (§6b) — but **a free-check visitor TYPES their trade and
    their town, and that is better evidence than a derived one, not worse.** And a business Google
    cannot find is precisely the customer who most needs telling that AI cannot find them either.
  - **The exemption is `town_confirmed`, INTERNAL ONLY**, mirroring `isBaseline`: every other caller
    that passes `location_text` builds it from `search_location || address`, which is inferred, so a
    flag any caller could set would disable the gate everywhere. A browser cannot reach it.
- ⛔ **THE DEDUPE MERGED DIFFERENT BUSINESSES, AND TWO OF ITS THREE RUNGS COLLIDE BY NATURE.**
  Measured over 3,192 real leads: **87 exact business names are shared** (4 provably different
  businesses — "Timpson" is in Blyth AND Wisbech; "Fletcher Lock & Safe Co" is two different shops
  both in Sunderland) and **105 phone numbers are shared, 29 across different names** — worst is
  Timpson's national switchboard on **15 leads across 8 towns**. And the read was
  `.limit(1).maybeSingle()`, so **which business a prospect got attributed to was a coin toss.**
  - **The consequence compounds**: no lead of their own → the per-lead 7-day guard refuses to audit
    them **because a STRANGER was audited recently** → no report at all → and the Outreach row
    carries someone else's name.
  - **Name and phone now require the town to agree AND exactly one candidate to survive**
    (`_shared/same-business.ts`). Two in the same town **refuses** — that is Fletcher, which the town
    rule cannot solve and must not guess at. **`place_id` stays exempt**: it identifies the business
    itself and is the only thing separating Fletcher's two branches; ties resolve to the **oldest**
    lead deterministically.
  - **Ambiguity creates a NEW lead** (Paul's rule: for a free check, running fresh beats matching
    wrongly). ⚠️ **That is only safe because of the phone-history seatbelt** — the queue refuses any
    cold template for a number with prior history whatever lead row it arrives on. Without it this
    would trade a mis-attribution bug for a spam bug.
  - ⚠️ **THE FIRST DRAFT WAS TOO STRICT AND THE REPLAY CAUGHT IT.** Comparing only `derived_town`,
    "sinners and saints" failed: Google's derived town is **"Muang"** (the district) while
    `search_location` is "chiang mai". Every genuine repeat would have forked a second lead and paid
    for a second audit. It now accepts **any town evidence the lead carries** — derived_town,
    search_location, or the town appearing in the address as a **whole token run, never a bare
    substring**. Replayed over all 13 real free-check submissions: **3 change, and they are exactly
    the three wrong ones.**
- 🔴 **THE OPERATOR EMAIL ASSERTED THINGS IT HAD NEVER CHECKED, TWICE, AND BOTH COST REAL TIME.**
  1. It said *"nothing has been sent to them automatically… add them to the WhatsApp queue when you
     are ready"* **on every free check**, including ones where an audit was running and a result was
     on its way. Standing copy from before the auto-audit existed — **it convinced Paul the funnel
     was broken when it was working.** It now reads the state and says one of four true things:
     result sent (naming the address) / audit running (how long, how many runs) / **finished but
     unsent** / no audit at all **with the recorded reason**. The last two also push into the red
     "Needs you" box. "Running" and "finished but not sent" are deliberately separate — calling the
     second one running is the same lie in a new place.
  2. **It claimed a FOUR-DAY-OLD audit as this submission's** (2026-09-07, "the glue pot"): it read
     `ai_audits` by lead_id with **no time bound** and took the newest. The lead had deduped onto a
     test lead, the audit was correctly skipped as "already audited within 7 days" — **and the
     branch that would have said exactly that was never reached, because an old audit outranked the
     absence of a new one.** §8's rule again: *a guard is no use if the case it guards cannot arrive
     at it.* The lookup is now scoped to audits created **at or after this row** (ordering makes a
     timestamp sufficient — the row is saved before the lead and the audit), with a **60-second**
     backward tolerance for same-request jitter. The wording also names the matched lead now:
     without it, "already audited within 7 days" reads as though THEY were audited last week.
- 🔴 **AND THE RESULT NEVER REACHED A MATCHED LEAD AT ALL.** `maybeSendFreeCheckResult` gated on
  `lead.enrichment_source !== "free_check"`, but `createFreeCheckLead` only stamps that column on
  the **INSERT** path — so a submission that MATCHED an existing prospect kept the lead's null and
  was refused as "not a free-check lead". **Every free check from a business already in the book ran
  its audit and told them nothing.** The gate moved onto the **SUBMISSION row** (did somebody fill in
  the free-check form for this lead), which is true for matched and created alike. The lead's
  provenance column was never the right question — it says how the lead got into the book, not why
  we are emailing today. **Still fails closed: no submission, no send.**
- ✅ **THE PROGRESS CARD — `src/lib/freeCheckProgress.ts` (pure, tested) + a `submissions` action.**
  Every fact needed to answer "is it running, done or failed" was already stored across six tables
  and surfaced on no screen. The endpoint returns FACTS and computes no verdict (the coverage split).
  - ⛔ **STRANDED IS ITS OWN STAGE, and it is the one this was worth building for.** An audit whose
    runs have all settled with no result sent **will never retry** — the send fires only from the
    tick that finalises a run. It looks finished and is not. Two real submissions were sitting in
    exactly that state, 3 of 3 runs and 15 of 15 questions, invisible everywhere.
  - **Absences are named, never defaulted**: no lead ≠ "audit pending"; no audit distinguishes a
    **recorded** skip from a silent one; an audit with no runs reads "never started". A failed READ
    says so — an empty array here would otherwise claim the free check has never been used.
  - Polling is conditional: every 20s **only while something is genuinely mid-flight**.
- ⛔ **"SENT" IS NOT "DELIVERED", AND THE STAMP USED TO MEAN NEITHER.** `notify_sent_at` was written
  **BEFORE** the Resend call and never updated, so it only ever meant *we decided to send* — and the
  dashboard read it as "Result sent". **An email Resend refused rendered green.** The stamp is now
  patched after the send with `email_status` (accepted / failed / attempting), the provider message
  id and the error; the claim still goes FIRST, because claiming before sending is what makes the
  send happen at most once. Two stages came out of "complete": **EMAIL FAILED** and **SEND UNKNOWN**
  (claimed, outcome never written); an older row with no outcome says "claimed — outcome not
  recorded" rather than borrowing the good news.
  - ⚠️ **"ACCEPTED" IS THE HONEST WORD: a 2xx means Resend took the message.** Whether a mailbox
    received it lives only in Resend's delivery events and **is not in this database.** Measured:
    19 rows carry the stamp and **not one carries a provider error**, so from our side every email
    has always "worked" — which is exactly why the word must not overclaim. WhatsApp is different
    and does carry a real receipt.
- ✅ **AN OPERATOR RESEND EXISTS, AND IT DOES NOT WEAKEN THE ONCE-PER-AUDIT GUARD.** `force` is set
  only by that action, the previous stamp is left in place, and the automatic path stays refused for
  ever after — the property that stopped a stranger being emailed three times six minutes apart is
  untouched. It refuses an audit with **no completed run**: a resend must never invent a result.
  - ⚠️ **A RESEND CARRIES THE TIME IN ITS SUBJECT.** Gmail groups identical subjects from one sender
    into one conversation, so a second identical copy **collapses under the first and reads as never
    arriving** — the symptom that sent a session hunting a Message-ID dedup bug that does not exist
    (no Message-ID is set anywhere; Resend assigns them).
- ⛔ **DEPLOY LISTS FOR THIS LANE, and one of them cost four days:**
  - `_shared/free-check-result.ts` has **TWO** consumers — `process-ai-audit-queue` (automatic) and
    `submissions` (the resend). **Redeploy BOTH.** The last time one was missed, the fix sat
    committed and undeployed while every matched lead was silently refused.
  - `_shared/free-check-lead.ts` + `_shared/same-business.ts` → **`findable-onboarding` ONLY**
    (`notify-onboarding-submit` mentions free-check-audit.ts in a **comment** and does not import it).
- ✅ **REFUSALS ARE RECORDED, NOT LOGGED.** `free_check_audit_skipped` / `free_check_audit_failed`
  land in **`client_error_reports`** — this lane was dead for two days with the reason existing only
  in an edge log nobody can read (**the CLI has no `functions logs`**), so diagnosing it meant
  inferring from which leads happened to have audits.

---


---

> Moved from CLAUDE.md §21 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 21. ✅ THE FREE CHECK MEETS THE BASELINE — two faults that would have hit the first real customer (2026-09-13)

Found by tracing the chain read-only before Paul's end-to-end test; fixed the same day on his brief.
**Both were in code as deployed, neither had fired yet** (no audit had been created since v106).

- 🔴 **A FREE CHECK THEN A PAYMENT PRODUCED NO BASELINE.** §18's positive test recognised a baseline
  by its CONTRACT, and graded every other multi-run audit ambiguous — which is exactly what a 3-run
  free check is on those three columns. So the funnel's own happy path (free check → report → Get
  started → pay) refused the baseline, and wrote `baseline_ambiguous_multi_run` **every 30-second
  tick with no throttle**.
  - ⛔ **THE KIND IS READ FROM `audit_purpose` NOW** (`src/lib/auditKind.ts`, the writer and both
    readers). `'baseline'` + contract = paid baseline; `'baseline'` with NO contract = ambiguous
    (a failed contract write — the case the refusal was built for, kept); `'measurement'` /
    `'remeasure'` = measurement; **`'free_check'` = free check, ignored by the baseline guard**;
    any other recorded purpose = ordinary. **Legacy rows (purpose NULL — every audit before
    2026-09-12) keep the old three-column rule, refusal included**: a pre-09-12 free check still
    holds a later payment until somebody looks. Stated, not hidden.
  - ⛔ **`audit_purpose = 'free_check'` is a NEW value**, written by `create-ai-audit` when the
    internal caller sends `purpose: "free_check"` (free-check-audit.ts does). The column is plain
    `text`, no CHECK constraint; the pointer trigger reads only 'baseline' / 'remeasure'. The
    repeat runs posted by `advanceBaseline` carry the audit's own purpose back.
  - ⛔ **THE AMBIGUITY REPORT IS ONCE PER LEAD PER HOUR** (`reportOnceAnHour`), not per tick.
  - ⚠️ **On 2026-09-13 every one of the 968 audits had `audit_purpose` NULL** — the column existed
    (Slice 0 ran) but nothing had been created since the writer deployed. The first audit after
    this deploy is the first row that carries a purpose. 3 leads carried a baseline pointer.
- 🔴 **THE FREE-CHECK SENDER FIRED FOR EVERY AUDIT ON A FREE-CHECK LEAD.** It was gated on the LEAD
  having a free-check submission row, and the queue pushes it for every completed run of every
  audit with a lead — so a paid baseline, the full measure, the day-28 replay and any manual
  re-audit on such a lead would each have emailed AND texted the form-filler "Your AI visibility
  check" with a fresh report link.
  - ⛔ **GATED ON THIS AUDIT'S PURPOSE** — `freeCheckSendGate` in auditKind.ts, pure, tested against
    all five purposes plus null. Only `'free_check'` sends automatically. The operator RESEND
    (`force`) is allowed through for a legacy (NULL) or `'audit'` purpose — that is how the two
    pre-change stranded free checks can still be sent by hand — and **refused for baseline /
    measurement / remeasure even when forced.** The submission-row gate still stands as the second
    gate (it is the only source of the address and number).
  - The Free checks card (`submissions` → `free_check_progress`) now prefers the audit whose purpose
    is `'free_check'` over the newest one, so a later payment cannot relabel the baseline as the
    free check's audit (the gate would have refused the resend anyway; the card must not mislabel).
- ⛔ **RUNS 2 AND 3 OF A FREE CHECK NO LONGER BUY AN SEO SCAN.** `advanceBaseline` posted repeats
  without `skip_seo`, so on a business with a website run 2 bought the ~4p scan run 1 declined and
  the report (rendered off the LAST run) grew a website section. Two fixes, both structural:
  `create-ai-audit` forces the skip for purpose `'free_check'`, and the repeat sends `skip_seo: true`
  whenever run 1's `results.seo` is a skipped marker — read off the row, not typed per purpose.
- ⚠️ **`respellTrade` (was `normaliseTrade`) in `src/lib/freeCheckTrade.ts`** — renamed because
  `src/lib/templateVars.ts` exports a DIFFERENT `normaliseTrade` (lowercases, singularises, BLOCKS
  for a WhatsApp variable). Consumers: free-check-audit.ts, notify-onboarding-submit.
- **`[functions.notify-onboarding-submit] verify_jwt = false`** is in config.toml now (it ran live
  with false while absent from the file — a redeploy could have flipped it).
- ⛔ **THE GUARANTEE IS ONE CONSTANT AGAIN, 236 CHARACTERS.** Paul cut "we will show you both sets
  of numbers and refund you" and folded the window in: *"…If that number has not gone up, email us
  within 14 days of your four week results and we'll refund your £99."* `FINDABLE_GUARANTEE_FULL`
  is DELETED, the prefix assertion is gone from BOTH sync scripts (TOTAL is +1 not +2), the site's
  `GUARANTEE` is locked to `FINDABLE_GUARANTEE` directly. Also changed in the same pass: `/refunds`
  (paragraph 2, meta description, and How to claim — "We will send you the before and after
  numbers side by side" cut too), FAQ "What if it doesn't work?". **Every instance was listed
  before editing; the two repos moved together.**
  - ⚠️ **236 > 222.** 222 is the longest string PROVEN to render untruncated on Stripe's hosted page
    (2026-08-06, a real session). Stripe documents no limit. **The first real Checkout Session after
    this deploy is the proof** — read the hosted page's text, not the HTML shell. Not verified here.
- **Verification that a baseline / full measure / replay / manual re-audit send NOTHING is the pure
  gate test** (`scripts/audit-kind.test.ts`), not a live run — nothing was spent to prove it.
- ⛔ **UNCOUNTABLE TRADE WORDS BLOCK THE WHATSAPP VARIABLE; THE FORMS PEOPLE TYPE ARE MAPPED
  (Paul, 2026-09-13, same day).** "plumbing" passed every guard in `templateVars.ts` and would
  have rendered "for a plumbing in Andover" — a real word naming the WORK, not the person. Now:
  `TRADE_SINGULAR` maps plumbing→plumber, locksmithing→locksmith, bookkeeping→bookkeeper,
  driving lessons→driving instructor, car valeting→mobile valeter, and electrics→electrician /
  accountancy→accountant (**both still HELD by the vowel rule** — map to a consonant-initial
  phrase to send them). Anything unmapped whose LAST word ends in `-ing`, or sits in
  `UNCOUNTABLE_TRADE_WORDS` (joinery, upholstery, dentistry, removals, dental, electrical, …),
  blocks as `trade_uncountable`. The 24 stored `business_type` values (re-pulled that day, 968
  audits) contained no further uncountable word beyond the two already mapped. Only edge code
  reaches this file (via `whatsapp-send.ts`); the SPA does not.
- ✅ **`free_check_result` IS APPROVED AND ACTIVE AT META (Paul, 2026-09-13)**, one message sent,
  delivered and read. Its registered body carries "for a {{2}}", so the vowel-sound block is
  correct for it too. Variables confirmed against WhatsApp Manager: name, trade, town, report
  link, onboarding link — matching both registries.

---

