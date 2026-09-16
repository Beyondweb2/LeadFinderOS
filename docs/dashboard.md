# The dashboard — honest metrics, the campaign card, the client card and the stored task

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6h on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: The `MARKET_AUDIT_MIN_AUDITS` / `marketAuditThreshold.ts` sync-script claim is false as of 2026-09-15 — neither repo's `check-cross-repo-sync.mjs` reads that file.

## 6h. ✅ HONEST DASHBOARD METRICS — built 2026-08-19, Paul's spec. Read before touching any dashboard number.

- ⛔ **A SEND IS `isRealSend` (src/lib/realSend.ts): status `sent`/`delivered`/`read`, POSITIVE test.**
  whatsapp_messages carries `failed` (Meta refused — 82 rows) and `simulated` (old test mode — 3),
  and every counting surface used to treat "an outbound templated row exists" as sent: 38 unarchived
  leads (37 of them status `no_whatsapp`) counted as Reached, deflating the funnel reply rate 56%→52%
  and Locksmiths 60%→56%. One predicate, imported by useDashboardMetrics (funnel + channel card) and
  useCampaignStats (reached / per-template); `scripts/real-send.test.ts` pins failed/simulated/
  pending/null out. **Lead statuses never polluted the rebuilt funnel** — the pollution was the
  failed message row, not the status.
- ⛔ **onboarding_responses IS READ THROUGH `submissions` (`action: "lead_statuses"`), NEVER
  DIRECTLY.** The direct read hits RLS-with-no-policies → 200 [] → per-campaign `started` was
  structurally 0 forever and the Chase task NEVER fired (§8's third instance, finally fixed).
  Returns EVERY lead-linked row; the hooks fold sticky-paid client-side. Both callers are
  deliberately non-throwing — an endpoint hiccup degrades one rule, never blanks the dashboard.
- **The hook IS `audit_reply`, and the funnel names it now**: tiles read "Hook sent (msg 2)" / "Hook
  reply"; Paid carries "N of M hook replies". Measured 2026-08-19: all 313 hook sends followed a
  first reply (the auto chain), so funnel "Replied" ≈ replies to the opener.
- **Per-campaign conversions**: `repliedToPaidPct` (of who ANSWERED, who bought) + `reachedToPaidPct`
  in useCampaignStats, rendered under the money row once `replied > 0`.
- ⛔ **FOUNDER TILE COUNTS ACROSS `[FOUNDER_PRICE_GBP, ...FOUNDER_PRICES_HISTORICAL_GBP]`** (Paul's
  call 2026-08-19) — current-price-only made RG's £19.99 sale vanish (tile read 1 with 2 customers
  paid). Append to the historical list when the price moves; never remove an entry a sale was taken
  at. ⛔ **AND SINCE 2026-09-03 IT IS A FLOOR, NOT AN EXACT MATCH AGAINST THAT LIST** — the website
  add-on lands `amount_paid` at £109.97, which an exact match dropped entirely. `PAYING_FLOOR_GBP`
  is derived (`Math.min` of the two), and a **churned** subscription stops counting on a POSITIVE
  match against `canceled`/`incomplete_expired`. **§11 has the rules; `scripts/paying-customer.test.ts`
  pins them.** ⚠️ **check-cross-repo-sync parses `FOUNDER_PRICE_GBP` as a bare number in useDashboardMetrics
  — keep the name, and NEVER write the declaration pattern in a comment: the regex takes the file's
  FIRST match, comments included** (it broke the guard for ten minutes; so did moving
  MARKET_AUDIT_MIN_AUDITS without repointing BOTH repos' scripts at marketAuditThreshold.ts).
- ✅ **RESOLVED 2026-08-19: D Aston and Fortify were Paul's TEST businesses (flow experiments,
  never real charges) — DELETED in full on his instruction.** 83 rows across 9 tables (2 leads,
  2 phantom-paid onboarding rows, 15 messages, 9 sends, 2 auto-replies, 3 activities, 3 audits
  incl. Fortify's test baseline, 5 runs, 42 queue rows), FK-safe, zero orphans verified. So §8's
  "Fortify got a full 3-run baseline minutes after paying" remains true as HISTORY (it proved the
  bearer path) but the rows no longer exist — do not go looking for them.
  ⚠️ **Two consequences, stated:** their numbers (+44 7833 617226, +44 7595 953838) are no longer
  guarded by the phone-history seatbelt or any suppression row, so a future search can re-add and
  re-message two businesses whose owners already engaged once; and the deleted onboarding rows
  were exactly the ones that proved complete_q2 live on 2026-08-13 — RG + Ronnie are the remaining
  proof. ⚠️ **The substring trap struck again during scoping:** a name search for "aston" matched
  Thurm**aston** Key Solutions and **Aston's** Access Auto Locksmiths, both REAL leads — the
  deletion keyed on the two exact lead ids, never on names.
- ✅ Audited clean, leave alone: Paid = amount_paid everywhere; PipelineCard (labelled status
  counts); channel card's `not tracked` rows; SMS sent 0 (sms_sends is truly empty); SubmissionsCard;
  receipts; hook-reply timestamp attribution. `ActivityCard.tsx` is dead code (no importer).

---


---

> Moved from CLAUDE.md §14 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 14. ✅ THE CAMPAIGN CARD — what each message actually did (2026-09-04 → 09-07)

**One funnel you can read in a second (Reached · Replied · Paid) over a table with ONE ROW PER
MESSAGE.** `src/hooks/useCampaignStats.ts` + `src/lib/templateAttribution.ts` +
`src/lib/armComparison.ts`, all pinned by `scripts/template-attribution.test.ts` and
`scripts/arm-comparison.test.ts`.

- ⛔ **"REPORT OPENED" WAS DELETED TWICE ON A TRUE PREMISE AND A WRONG CONCLUSION.** Both
  AuditFunnelCard and CampaignStatsCard recorded "our own opens are indistinguishable from a
  prospect's **and always will be**". The premise holds — the operator opens the SAME URL
  (`findable.live/report/<auditId>`) so a preview bumps the same counter, and `first_opened_at` is
  coalesced so a preview permanently owns the first open. **What nobody had done was compare that
  timestamp against the moment the link was SENT.** Measured over 427 opened audits belonging to a
  lead: **371 first-opened AFTER the link went out, 1 before, 55 never sent a link.** It separates
  cleanly, retroactively, with no new tracking. "Always will be" was the only part that did not hold.
- ⚠️ **MY OWN FIRST DERIVATION OF IT WAS WRONG IN A WAY THAT MATTERED: THREE TEMPLATES CARRY A
  REPORT LINK, NOT ONE.** `audit_reply` (`url`), `audit_result_hook` and `free_check_result`
  (`audit_url`) — and `audit_result_hook` is the template that BECAME the outreach hook. Re-derived:
  links sent **577 → 653**, opened **366 → 408**, unattributable **55 → 13**. Most "unexplained"
  opens were simply leads sent their report by the newer hook. **`REPORT_LINK_TEMPLATES` (now four
  entries, with `audit_reply_warm`) does not throw when a new template is missed — it silently
  understates the rate.**
- **The open rules, so the denominators agree with the rest of the card:** `isRealSend` on every
  send (a send Meta refused is not a link sent); the denominator is **links sent, not Reached** (you
  cannot open a report you were never sent); the **EARLIEST** link send, so re-sending cannot
  invalidate an open that already happened; **unique audits opened, never `open_count`** (no
  per-open log exists — summing would report 933 "people" against 433 audits); a **60s slack**
  because the send receipt is Meta's clock and the open is ours; opens on leads never sent a link
  are **excluded and surfaced as "(+N not attributable)"**, never dropped; a row renders only once a
  link has gone out ("0 · 0% of 0" reads as a broken tile); `ai_audits` read through `fetchAllRows`
  selecting four columns.
- ⛔ **THE PER-TEMPLATE REPLY METRIC IS LAST-TOUCH, AND THE OLD ONE WAS DELETED FOR A GOOD REASON
  THAT DOES NOT APPLY TO IT.** The old "replied" meant *has this lead ever replied* intersected with
  each template's lead set, so **every row claimed the same replies**. Last touch — a reply belongs
  to the newest real send before it, and any inbound closes the run — measured over the whole book:
  **757 credited pairs, 725 unambiguous, 32 contested.**
  - **"Contested" has an exact meaning**: two or more DIFFERENT templates went out with no reply
    between them, so nobody can know which earned it. It is **concentrated, not spread** —
    `initial_contact` 0 of 530, `contact_followup` 20 of 20, because a chase only exists when the
    opener got no answer. So the count sits **on the row that has it**, as a required field on the
    type: a 26% chase rate shown as cleanly as a 52% opener rate is the misleading half.
  - Per-template opens are the difference the campaign-level number hid: **`audit_reply` 63% vs
    `audit_result_hook` 46%.**
- ⛔ **SITE VISITS AND SIGN-UPS: `lead_page_hits`, and the hook is `prefill`.** Reaching the sign-up
  page was recorded NOWHERE — report opens are on `ai_audits`, submissions are
  `onboarding_responses` rows, and the landing between them was invisible, which is the entire gap
  for a template whose goal is clicks rather than replies. `findable-onboarding`'s `prefill` already
  fires once per page load with the lead id, and it is a read, so the insert is **fire-and-forget in
  a try/catch** — a missing table, an RLS surprise or any Postgres error costs the visitor nothing.
  Logged **BEFORE** the `already_client` gate: a paid customer returning is still a real visit, and
  gating it would make the metric mean something other than its label.
  - **`SITE_TRACKING_START = 2026-09-06T00:00:00Z` — the midnight AFTER the hook went live, not the
    deploy day.** The table does not exist until the SQL runs, so that day's earlier sends could not
    have produced a hit however fast it happened, and dividing by them prints a confident low rate on
    day one — the first number anyone looks at. Costs one day of history. (London is UTC+1 in
    September and the send window is 07:00–21:30 London, so the boundary cannot split a send day.)
  - ⛔ **THE NUMERATOR IS GATED BY THE SAME WINDOW — caught before shipping.** A lead sent last month
    who lands tomorrow is credited to that template, but its send is not in the tracked set, so the
    visit would divide by a denominator it was never part of and **the rate could exceed 100%.**
  - **Free-check submissions are excluded from per-template sign-up credit** (12 of the 22 onboarding
    rows on file are free checks — crediting one to a template credits our outreach with a visitor
    who arrived on their own). The campaign-level "started" deliberately still counts them.
  - ⛔ **THREE STATES, NOT TWO: tracking unavailable / tracking live but this template not sent since
    it began / a real measured rate.** Only a genuinely successful read sets the ready flag, so the
    RLS 200-with-`[]` trap reads as "not tracked" and never as "nobody clicked". Website clicks for
    other destinations remain untracked and the column **says so once** rather than printing 0.
- ⛔ **THE COLD-VS-WARM A/B IS INTENT-TO-TREAT, AND IT IS ITS OWN BLOCK, NOT EXTRA COLUMNS.** The
  per-template columns use **last touch** — the right answer to "which message earned this click" and
  the **wrong** answer to "does warm convert better", because any message sent in between takes the
  credit. Measured first: for the two arms it has never yet happened (0 of 124 arm leads got a later
  template, 0 got both arms), but `audit_reply` shows **30 of 577 (5%)** getting a later template —
  at A/B sample sizes a 5% leak decides it wrongly.
  - **The arm is a property of the LEAD**, so every later visit or sign-up counts for the arm it was
    sent, whatever went out afterwards. **The FIRST exposure defines the arm**, so a resend cannot
    move the clock past events it already caused.
  - **A lead sent BOTH arms is excluded from both, and the count is shown** — it is in both
    populations so it can answer neither, and assigning it to the newer arm would flatter whichever
    template was introduced second, which is always the one being tested.
  - **TWO DENOMINATORS, deliberately**: opens and sign-ups have always been recorded, visits only
    since the prefill hook. One denominator would understate visits by every earlier send.
  - It renders **only once an arm has a lead** — two rows of dashes is noise, and a 0% on an unsent
    arm reads as "warm does not work". Both views are honest and answer different questions; merging
    them into one table would leave the first person who compares them no way to know why they
    disagree.
- **Barber-era leftovers removed:** the Site/Audit/Service badge and five barber templates (moved to
  a **label-only legacy list** — 71 of those messages really were sent, 70 on archived leads).
  ⚠️ **Shrinking the sendable allowlist had one real hazard, handled:** `CampaignFormDialog`
  VALIDATES a stored `default_template` against it and two live campaigns still store
  `booking_switch_barbers`, so opening that dialog and pressing Save **would have rewritten their
  template to null**. It now preserves an unrecognised stored value and shows it as legacy.
  `AdminSiteManage` keeps the full list deliberately — it is the old barber admin screen.
- ⚠️ **The header note on `CampaignStatsCard` still says the open metric could not tell the
  operator's opens apart. Left exactly as written** — it is the record of what was wrong, and the
  comment beside the new row is the record of what changed.

---


---

> Moved from CLAUDE.md §23 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 23. ✅ THE FIVE FIXES AFTER THE FIRST END-TO-END TEST — internal measurements, the fill, the labels, the client card, the stored task (2026-09-13, afternoon)

Paul's brief after the free-check → pay → baseline → full-measure chain passed live. All five built,
deployed and confirmed the same afternoon. Deployed: `render-audit-report` v94, `create-ai-audit`
v111, `process-ai-audit-queue` v158, `process-whatsapp-queue` v125, `whatsapp-status` v76,
`submissions` v36, `stripe-webhook` v85, `findable-onboarding` v87. Honest green is **84/89** now
(the same five known-stale suites fail; two suites were added — `question-fill`, `lead-status-patch`).

- 🔴 **THE PUBLIC RENDERER SERVED THE CLIENT DOCUMENT FOR ANY AUDIT ID, INCLUDING A FULL MEASURE.**
  `findable.live/report/d3453511…` rendered AD Locksmithing's 18-question winnable-questions audit
  as a client report; the only protection was that nothing sent the link. **`isInternalMeasurement`
  (`src/lib/auditKind.ts`) is the one predicate**: purpose `measurement` / `remeasure`, or the
  legacy shape multi-run + `is_measurement` (RG's 26 Aug and 8 Sep re-measures). Read by the
  renderer (**403 + operator-only notice, `no-store`, before any run row is read**, verified live:
  d3453511 → 403, c0343d99 and c39bc81c → 200 with `class="src"`), the Baseline screen (no "View
  client report"; heading says what it is) and the cockpit.
  - 🔴 **THE COCKPIT'S "BASELINE REPORT" LINK POINTED AT THE FULL MEASURE.** It resolved "the newest
    audit with a run target" — which under §19 is the full measure at day 0. RG's cockpit opened his
    26 Aug measurement, not his 11 Aug baseline. **It reads `outreach_leads.baseline_audit_id`
    first now**, and never falls back to an internal measurement. That is why d3453511 appeared
    under a `/baseline/` URL: the route serves any audit id; the LINK was wrong.
  - **The operator label is `INTERNAL_MEASUREMENT_LABEL` = "Winnable questions audit (internal)"**
    (pill + Baseline heading). ⛔ The stored value stays `measurement` — the pointer trigger and the
    partial unique index read it.
- 🔴 **WHY THE BASELINE QUEUED 11 OF 12 AND THE MEASURE 18 OF 20.** Two model calls (money +
  standard) → concatenate → **slice to target → THEN dedupe**, with nothing to top up. Not a guard
  (guards top up from templates), not a miscount. **`src/lib/questionFill.ts` owns the order now:
  exclude → dedupe → slice → top up** from the deterministic templates (town always present), at
  every slice site in `create-ai-audit` (`fillGenerated`), with counts logged. Identity at
  GENERATION is by **intent** (`questionIntentKey`: trailing plurals folded per word) so "safe
  installation" / "safes installation" and "service" / "services" no longer queue twice.
  ⛔ **`questionKey` (the replay's identity, `excludeAsked`) is UNTOUCHED** — a stored question and
  its day-28 replay are byte-identical and must stay matched by the old rule. Cost of the plural
  fold: zero spend, ~40 lines, one accepted merge ("locks" = "lock"); a stemmer was rejected.
  - 🔴 **THE FINALISER WIPED THE RUN NOTES.** `process-ai-audit-queue` built `results` from scratch
    at finalisation, so `full_measure: { comparable: false }` and `money_questions`, written by
    create-ai-audit at creation, were gone from every finalised run — neither live measurement run
    carried its "not comparable" flag. It spreads the row's existing `results` first now. ⚠️ The
    two September runs already finalised are NOT backfilled; the flag exists on runs from v158 on.
  - ⚠️ **Dropped strings live only in `console.warn`** and the CLI cannot read logs, so which two
    questions the measure lost is unknowable; the mechanism is proven by the test, not by a row.
- **AI OVERVIEW: switched off in the actor INPUT, present in the OUTPUT.** The actor returns the
  block whenever Google showed one and the probe keys pick it up (4 of 11 baseline questions, 8 of
  18 measure). Display-only, never scored — `SCORED_ENGINES` is chatgpt + gemini, and the bands,
  the named rate and the report figure read only those. Recorded already at `auditReport.ts:1109`.
- **THE WEEK-8 STRING THE SWEEP MISSED WAS AN OPERATOR SCREEN.** `baselineView.ts`'s HELD band said
  "week-8 comparison"; `client-copy-claims.test.ts` scanned only the eight client-facing renderers,
  by design. It now has **`OPERATOR_SCREENS`** too (whole comment-stripped source — JSX text is not a
  string literal) with one allowed true sentence (RG's eight weeks by contract). **Add any new
  operator screen to that list.** The two "· free" suffixes (a SPEND label, house convention from
  Coverage — it read as a price on a paid client's screen) are gone from the Baseline buttons.
- ✅ **THE DASHBOARD HAS A PER-CLIENT VIEW: `ClientDeliveryCard`.** Paying = `amount_paid > 0`, not
  archived, not `refunded` (refunded counted, not shown). Per client: the week-four light, **the door
  to `/baseline/<baseline_audit_id>`** (pointer only — a lead with no pointer says "no baseline
  yet"), the lead card, the page plan, and the checklist.
  - ⛔ **ONE LIST, ONE COMPONENT, TWO HOMES.** `DELIVERY_CHECKLIST_ITEMS` (`src/lib/deliveryCockpit.ts`)
    is rendered by `DeliveryChecklistList` in BOTH the lead card's cockpit and the card, stored where
    it always was (`outreach_leads.delivery_checklist`). Paul's order: baseline checked → baseline
    sent → directories → GBP → **pages (derived, one line per `client_pages` row, ticked live
    directly on the row via `useClientPages`)** → website → week-four re-measure → results sent.
    Three new keys landed on RG's existing map without touching it; an old stored `pages: true` is
    ignored (`checklistDone` counts `TICKABLE_ITEMS` only).
  - ⚠️ **"Results sent" is a manual tick until the four-week sender exists** (§19 open item 1);
    when it does, it should STAMP this rather than a person ticking it. "Baseline checked" is a
    deliberate human gate — the baseline must never auto-send.
  - ⚠️ A page's "built" tick writes `client_pages.status` live ↔ planned **directly** (owner RLS
    `for all`); the page-generator's `plan_update` whitelists only planned/held/removed on purpose.
- 🔴 **625 LEADS CARRIED AN OVERDUE `send_draft` NEXT ACTION THAT NOBODY SET.** `whatsapp-inbound`
  wrote it on every reply, `statusUpdatePatch` on a hand-set "replied", and nothing cleared it when
  the operator answered. The card had hidden them since 2026-07-28 (`isRedundantAutoReply`) but
  every Outreach row still showed "Respond", sorted by it and counted it overdue. **Both writers are
  gone; a stored next_action is only ever something a person set.** Paul cleared the 625 by SQL.
  `statusUpdatePatch` moved to the pure `src/lib/statusPatch.ts` (re-exported) so it is testable.
  - **The card gains "Clear all stored tasks"** (owner-scoped update where `next_action` is set,
    count reported) and **a dismiss on derived rows** (reply / chase / quoted — never Deliver) that
    marks the lead `closed` after a confirm: derived rows are evidence, and the only honest way to
    make one go is to change the lead's status.
  - **Why the two "messes" accumulated:** stored tasks were written on every reply and cleared by
    nothing; derived reply rows never expire because a conversation ending on the prospect's
    message stays "unanswered" until the lead is closed; chase rows were Paul's own test
    submissions; the questionnaire card's 50 rows were 43 test submissions (move37.fun addresses).
    Bulk delete for submissions **already existed** (Delete selected / Delete all, paid rows kept).

---

