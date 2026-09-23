# WhatsApp templates and senders — the payment nudge, the reply rule, the greeting name, the Inbox list, the send-path faults

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6g on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 6g. ✅ THE OWNER'S NAME + THE PAYMENT NUDGE — built 2026-08-17, Paul's spec. Read before touching the questionnaire or templates.

**The pre-pay screen asks THREE things now** (consent, name, email — "Three things and you're in").
`contact_name` feeds directory registrations at delivery and the `questionnaire_followup` greeting.

- ⛔ **`outreach_leads.contact_name` is FILL-EMPTY-ONLY from the questionnaire** — the same
  convention as the email write-through beside it: an operator's hand-entered note ("Ronnie — ask
  for Sharon") beats a form field, and the onboarding row keeps the submitted value regardless.
  Verified before shipping: contact_name was NULL on all leads (0 non-null, 0 blanks), so
  `.is(null)` is the correct narrow form.
- ⛔ **THE FIRST NAME IS DERIVED AT SEND TIME, NEVER STORED** — `firstNameFrom` in
  **`src/lib/questionnaireFollowup.ts`**, a deliberately Deno-free module BOTH sides import: the
  edge sender builds the transcript body from it and the SPA renders the confirm-preview from it,
  so the two cannot drift. ⚠️ whatsapp-send.ts has Deno reads, which is why the SPA must never
  import it directly — put anything the SPA needs in the src/lib module.
- **Q2 gained `confirmed_phone`** (client-REQUIRED, loose shape) + the "directories will text you"
  helper line. ⛔ **Deliberately NOT in complete_q2's 400 gate**: nothing automated depends on it,
  and a hard server gate would brick every Q2 submit from a site bundle published before the field
  existed. **The Q2 owner-name fields were SHRUNK AWAY** (Paul, 2026-08-17) — the pre-pay name
  covers them; do not re-add.
- **`q2_prefill`** (findable-onboarding): the lead's phone for the post-payment form. PAID rows
  only — same id-as-capability model as complete_q2, and deliberately not part of `prefill`, whose
  contract is "never phone/email to the public page". Seeds only an EMPTY box (functional set).
- **`submissions` has a per-lead mode** (`lead_id` in the body): latest onboarding row via
  `select("*")` (columns absent pre-migration come through as absent, never a hard error) +
  `followup_sent`, whose filter MUST stay identical to `pitchEverSent` **including
  `.neq(status,'failed')`** — a failed attempt must not read "already sent" while the server would
  allow the retry.
- **The lead card's Questionnaire section** (`LeadQuestionnaireSection.tsx`): read-only answers
  through the endpoint (RLS-no-policies table — §8), absence worded by whose turn it is: unpaid →
  "Not asked yet (comes after payment)", paid → "Not answered yet", pre-field rows → "Not
  captured". **Never a refusal** (the serveGate wording lesson).
- 🔴 **`questionnaire_followup` — MANUAL ONLY, ONE SEND PER LEAD, NO OVERRIDE.** Registered at
  Meta BY PAUL 2026-08-17 ({{1}} first name, {{2}} business name, Marketing). Unlike audit_reply
  there is deliberately no `allow_resend` — a second "just the payment step left" nudge is
  pressure, never service. The server refuses a blank contact name (`no_contact_name`); the UI's
  confirm prompts for the first name and saves it to the lead BEFORE sending, so {{1}} always
  resolves from the lead row.
  - ⚠️ **`lang: "en_GB"` IS UNCONFIRMED** — Paul's registration said English (UK) but the Manager
    check came back with the bracket unfilled. Confirm in WhatsApp Manager before deploying the
    send path; if it shows plain English, flip the constant in BOTH registries (whatsapp-send.ts +
    process-whatsapp-queue's mirror) in the same commit.
  - 🔴 **DEPLOYS HELD: `send-whatsapp-message` + `process-whatsapp-queue` carry the entry in git
    but are NOT deployed with it** until Paul confirms Meta approval. Until then a button press
    fails safe with the deployed version's `unknown_template`. Everything else shipped.

- ✅ **`send-whatsapp-message` mode `test_send` — ONE REAL SEND, TO ONE NUMBER, WRITING NOTHING**
  (built 2026-09-12 on `instantly-push`'s `auth_probe` precedent). It returns BEFORE the
  conversation lookup, so no lead is read or adopted by phone, no `whatsapp_messages` or
  `whatsapp_sends` row is written and no status moves — while still building the payload with the
  real `claimTemplatePayload` and posting it with the real `sendViaGraph`. It echoes the posted
  payload so the header component and variable order are inspectable without a redeploy.
  - ⛔ **THE DESTINATION IS `WHATSAPP_TEST_NUMBER`, READ FROM THE SECRET, NEVER FROM THE REQUEST.**
    It first required the caller to supply a MATCHING phone, and that was unusable for its only
    job: **`supabase secrets list` returns SHA-256 DIGESTS**, so nobody operating the function can
    read the number back to retype it — and retyping was the sole way to get a digit wrong. A
    supplied phone is now an optional confirmation that must still match. Unset secret → refuse.
  - ⚠️ **ADMIN-JWT ONLY, AND THERE IS NO UI FOR IT**, so running it means minting an operator
    session (§8's magic-link route) — a real sign-in on Paul's account. Tell him, and revoke.
  - ⚠️ **It costs a real template send and there is no dry-run**, deliberately: a dry-run proves
    nothing about Meta, which is the only thing this mode exists to prove.
  - ✅ **Proven live 2026-09-12**: `video_template` accepted, `wamid.HBgMNDQ3OTQzMjYyNzQy…`, and the
    before/after row counts plus a targeted per-number and per-wamid search came back **0 rows in
    every table** — the counts prove no NET change, the targeted search proves no row at all.

---


---

> Moved from CLAUDE.md §16 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 16. ✅ THE REPLY RULE IS THREE-WAY NOW: Off / Run audit only / Audit + auto-send (2026-09-08)

**Audit-only is the DEFAULT and Paul's warm-outreach case:** a business replies to the opener, an
audit runs if they have none, **nothing goes out**, and he sends `audit_reply_warm` by hand once it
is ready. `src/lib/firstReplyMode.ts` (pure, tested) +
`whatsapp_outreach_state.first_reply_mode` (SQL applied).

- ⛔ **BUILT AS A MODE ON THE EXISTING RULE, NOT A SECOND PATH.** That chain already carries seven
  guards that took incidents to learn — the opener gate, the once-per-lead slot, decline detection,
  auto-responder detection, cross-channel suppression, never-pitch-a-paying-customer,
  archived-means-stop — and **none of them depends on whether we intend to send.** A parallel
  "audit only" path would have needed every one again: the duplicate-guard drift this file records
  four times.
- 🔴 **THE SAFETY PROPERTY IS STRUCTURAL, NOT A FLAG THE SENDER CONSULTS.** An audit-only arm claims
  the lead's once-ever slot with status **`audit_only`, which is terminal**: the completion hook only
  ever upgrades `awaiting_audit` → `pending`, and the drain only ever selects `pending`. **There is
  no state from which a send can happen.** A mode the send path merely *read* could be got past by a
  stale row or a later mode flip; **a status it cannot see cannot be sent.** The drain also refuses
  `first_reply` rows by mode — belt and braces, the way the paying-customer guard is checked at both
  arm time and send time.
- ⛔ **ABSENCE IS NEVER PERMISSION, on the field that decides whether a stranger gets a message.** A
  missing column, a failed read, NULL, an empty string and an unrecognised value **all resolve to
  `audit_only`** — so deploying before the SQL ran could not turn a silent inbox into a sending one,
  and a mode added later joins the safe side by default. (Instance fifteen of the absent-value shape,
  and the first one designed in from the start on a sending path.)
- 🔴 **18 `pending` first_reply ROWS WERE PARKED PAST THEIR `fire_after`**, held back by nothing but
  the toggle being off — four of them for leads already at `report_sent`. **Turning the rule on would
  have sent all eighteen, days late, on the next tick.** The drain now retires anything older than
  **`AUTO_REPLY_STALE_MS` (6h)** as `skipped_stale` with the reason on the row, so the pile cannot
  rebuild itself over the next long off period.
- **A failed or capped audit un-parks an `audit_only` row too** — without it, a lead whose audit died
  keeps counting as "ready to send" and the operator opens a thread to send a result that does not
  exist. **Flagging is not sending**, so widening that scope cannot put a message on the wire; the
  arming path stays scoped to `awaiting_audit` alone.
- ⛔ **`DEFAULT_FIRST_REPLY_TEMPLATE = 'audit_reply_warm'` IS ONE SHARED CONSTANT.** It was the
  literal `"audit_reply"` written out at **four** sites — the send-time resolve, two arm-time
  already-sent checks and the SPA select — so moving the warm test onto a new template meant changing
  all four in step **or having the arm check one template's history while the sender sent another.**
- **Untouched on purpose:** `create-ai-audit`'s `queue_pitch_on_complete` path (an operator
  explicitly asking for a pitch from the Inbox audit button, not the reply trigger), and the legacy
  `AUTO_REPLY_FLOW_ENABLED` chain.

### `audit_reply_warm` — the warm audit template (Meta 1509669747584736, approved 2026-09-07)

Same job as `audit_result_hook`, for a lead who has **already answered** the opener, so it drops the
"is this the right number" line. Selectable in both pickers as "Audit reply - warm (after the opener)".

- ⛔ **THREE VARIABLES AND NO BUSINESS NAME: {{1}} trade, {{2}} town, {{3}} audit link — taken from
  WhatsApp Manager, NOT inferred from its sibling.** `audit_result_hook` leads with the business
  name and this one does not, so copying its var list across would have put the trade where Meta
  expects a name and **shifted every parameter by one: a send that returns 200 and reads as
  gibberish.**
- ⛔ **IT WOULD HAVE BEEN UNSENDABLE, AND THAT WAS NOT ON THE BRIEF.** Unknown templates are **COLD
  by default** (`coldOutreach.ts`, since the 2026-09-02 incident), and this template is by
  definition sent to leads who have already answered — so leaving it unlisted meant the
  phone-history seatbelt would refuse it **for every single lead it exists for**: selectable,
  apparently sent, then dropped as `phone_already_contacted`. It is named in
  **`CONTINUATION_TEMPLATES`**, which is exactly what that file's header demands of a new follow-up.
- **Three more places, each silent when missed:** `needsAudit` (its {{3}} IS the report link, so the
  queue must not send it before the audit completes), the report-link set in `Inbox.tsx`, and
  `REPORT_LINK_TEMPLATES` in `useCampaignStats` — forgetting the last does not throw, it quietly
  moves real prospect opens into the unattributable bucket.
- **The Inbox shows real text**, via the mechanism already built: the DB trigger stores only the
  bracketed slug (`[audit_reply_warm]`) and the SPA renders the approved copy from
  `src/lib/templateBodies.ts`, mirrored character-for-character and **pinned by
  `scripts/template-bodies-parity.test.ts`**, which imports both files and asserts identical output.
- **Deploy list — the nine functions reaching `whatsapp-send.ts` or `coldOutreach.ts`**, walked from
  each `index.ts`: `create-ai-audit`, `process-ai-audit-queue`, `process-sms-queue`,
  `process-whatsapp-queue`, `send-whatsapp-message`, `stripe-webhook`, `findable-onboarding` (via
  free-check-lead), `submissions` (via free-check-result), `whatsapp-status` (via whatsapp-inbound).

---


---

> Moved from CLAUDE.md §29 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 29. ✅ THE GREETING NAME — two styles, because there are two grammars (2026-09-15)

**`src/lib/displayName.ts` shortens the Google Maps listing before it reaches Meta.** It was one
rule; it is two, and the split is the SENTENCE the name lands in, never the template's tone.

| style | frame | rule |
|---|---|---|
| **`greet`** (default) | `"Hi ${b},"` / `"Hi ${b} 👋"` | the full peel — trade tail + legal suffix |
| **`identify`** | `"Hi, is this ${b}?"` | **the LEGAL suffix only** |

- 🔴 **WHY, IN PAUL'S WORDS:** *"Hi, is this Zest?" and "Hi, is this Park?" read like a wrong
  number.* He asked for one rule, saw the comparison and changed his mind on the spot: **"Hi, is
  this Beeson?" and "Hi Beeson Plumbing & Heating Ltd," are opposite failures.** One is a stranger
  with no context; the other is a mail merge. `initial_contact` is the ONLY live body that asks an
  identification question — every other one addresses them.
- ⛔ **`IDENTIFY_NAME_TEMPLATES` IS THE ONE PLACE THE SPLIT IS DECIDED**, read by THREE renderers:
  the Meta parameter (`whatsapp-send.ts`'s variable resolver), the stored body
  (`renderTemplateBody`) and the Inbox mirror (`templateBodies.ts`). Written out at any of them it
  is the one-rule-in-N-places failure recorded five times in this file, and the **transcript would
  drift from the message** on the next template added. Membership is decided by reading the body's
  opening line, not by how formal it feels.
- ⛔ **TRAILING LEGAL WORDS ONLY, AND THAT IS MEASURED, NOT CAUTIOUS.** Of 3,641 distinct business
  names, **980 carry a legal token: 897 end in one, 8 sit immediately before a parenthetical, 75
  are MID-NAME.** Stripping those in place gives *"Asmat & Accountants"* and *"JM Price &
  Accountants"* — a fragment, the one output this module exists to refuse. Paul's call: *"trailing
  only is the correct call."* The parenthetical carve-out exists because he specified its output:
  `RJW Electrical Ltd (Sutton Coldfield)` → `RJW Electrical (Sutton Coldfield)`.
- **What it moves:** greet shortens 1,817 of 3,641 names (49.9%); identify shortens 904 (24.8%).
  **1,166 names keep their trade words on the opener** that used to lose them.
- ⚠️ **greet IS BYTE-IDENTICAL TO BEFORE and the suite pins it** — an absent `style` renders the
  same as an explicit `greet`, so `video_template`, `competitor_hook`, `free_check_result`,
  `re_engage_49` and `payment_recieved` are untouched. **`audit_followup` and `explain_offer` carry
  no name variable at all** and could not have been affected either way.
- **Deployed:** the ten functions in the closure, walked from each `index.ts` rather than inherited
  — create-ai-audit, findable-onboarding, mockup, process-ai-audit-queue, process-sms-queue,
  process-whatsapp-queue, send-whatsapp-message, stripe-webhook, submissions, whatsapp-status.
  `npm run check`: 107/112, the five known-stale suites only.

---


---

> Moved from CLAUDE.md §30 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: §30d's "§2's Management-API route is unusable on this machine" is wrong as of 2026-09-15 — the token is in Windows Credential Manager. CLAUDE.md §2.

## 30. 🔴 THE INBOX READ A SECOND TEMPLATE LIST, AND THE IDENTIFY NAME KEPT ITS TOWN (2026-09-15)

### The sixth copy — four approved templates were sendable and invisible
`src/hooks/useInbox.ts` exported **`WA_REPLY_TEMPLATES`**, seven entries, and BOTH Inbox pickers
(the thread composer and the bulk-send dialog) read it instead of `WHATSAPP_TEMPLATES`. So a
template could be registered at Meta, wired into the server registry, added to the real list — and
never appear on the one screen an operator sends from.
- ⛔ **MEASURED COST: `competitor_hook` was approved 2026-09-14 and UNSENDABLE FROM THE INBOX from
  that day.** `audit_followup`, `explain_offer` and `contact_followup` were invisible too. Paul
  reported two missing; it was four.
- ⚠️ **AND THE FIRST DIAGNOSIS ALMOST WENT THE OTHER WAY.** The deployed chunk was checked first
  (§4) and my grep said the two templates were ABSENT from the live bundle — **my own check's
  fault**: `audit_followup`'s label contains `"` so Vite emits it in SINGLE quotes, and the pattern
  matched `label:"…"` only. They were live the whole time. Match the shape, not the quoting.
- ⛔ **THE LIST IS DELETED, NOT TOPPED UP** — Paul's instruction, and the right one: a copy is
  correct the day it is written and wrong the day a template is added.
- 🔴 **`template-picker-parity.test.ts` ALREADY EXISTED AND PASSED THROUGHOUT.** It compares the
  server registry against `WHATSAPP_TEMPLATES` and both were correct. **Nobody had asserted that
  the SCREENS read that list.** The property is not "is the list right", it is **"is there only one
  of it"** — the same answer `questionnaire-complete` and `audit-kind` reached. Its new section
  sweeps all 279 SPA files for an option-list literal (`{ name|value: '<a real template>' }`)
  outside `src/types/outreach.ts`, matching on **SHAPE so a renamed copy is caught too**, and names
  the four templates individually. **Proven to FAIL on a reintroduced three-entry list** before it
  was accepted.
  ⚠️ Bare-string sets (Inbox's `REPORT_TEMPLATES`) and label MAPS (`TEMPLATE_DISPLAY`) are
  deliberately NOT matched — naming a PAST message is a different question with its own list.
- ⚠️ **`contact_followup` HAD NO `WA_TEMPLATE_REQS` RECORD**, and it did not matter while the Inbox
  could not see it. `getTemplateSendability` answers `if (!req) return { ok: true }` — **an absent
  record is offered UNGATED**, the absent-value shape pointing the wrong way on a picker. It has a
  record now. The permissive default is left alone (flipping it would silently disable anything
  else unlisted) but **every `WHATSAPP_TEMPLATES` entry should have one**.

### The identify name loses a trailing town, then "Services"
"Hi, is this **RJ Burns Electrical Services Harlow**?" — the trade words are right to keep (§29),
the TOWN is not. Two steps added to `identifyName`, in this order, after the legal strip:
- **A TRAILING TOWN, proven only by the town the LEAD ROW carries** (`opts.town`). ⛔ **No
  gazetteer in this leaf**: `uk_towns` is a 733-row table and copying it is the same failure as
  above, so **no town on the caller means the strip does not run** and the output is exactly
  today's. ⛔ **TRAILING ONLY** — "Bristol Electricians" survives untouched even with Bristol
  supplied, because **position is the test, not membership**.
- **Then "Services"/"Solutions", ONLY where a TRADE word survives AND two words remain.** So
  "Shaw Plumbing Services" → "Shaw Plumbing", while "Pyramid Services" is kept whole and a bare
  "Shaw" is impossible by construction. Paul's guard, his wording.
- ⛔ **ORDER IS LOAD-BEARING.** "…Electrical Services Harlow" only reveals its "Services" tail once
  the town is gone; generic-first cuts nothing and strands the town.
- 🔴 **THE CONNECTOR REFUSAL — Paul's call on the ONE case in 364 this got wrong.** *"Ollie's Lock
  & Safe Locksmiths Cheltenham & Gloucester"* is a two-town **LIST**, and stripping the matched half
  presented half a list as the whole thing. ⛔ **Only `&` / `and` / `+` refuse.** A DASH or COMMA is
  an appended qualifier — "PME Heating & Plumbing - Bolton", "AquaPlumb - Emergency Plumber -
  Harlow" — and is precisely what this removes. Treating all of `CONNECTORS` as a list marker
  refused both of those real rows; the test caught it, not review.
- ⚠️ **AND WHAT REMAINS MUST NAME SOMEBODY.** "Plumbing Harlow" minus the town is "Plumbing", a
  bare trade word — the wrong-number failure the identify style exists to prevent. One word is
  enough only when it is not vocabulary ("Toolstation March" → "Toolstation").
- 🔴 **IT WOULD HAVE BEEN DEAD CODE WITHOUT THE LAST LAYER, AND THAT IS §4's RULE AGAIN.**
  `initial_contact` is the ONLY identify template and it is sent from the **plain branch** of both
  senders — which passed **no town at all**. Both lead selects now carry `derived_town` /
  `search_location` and both branches pass it. ⚠️ It is the name rule's EVIDENCE, never a Meta
  parameter: `claimTemplatePayload` reads `extra.town` for a town VARIABLE only when the registry
  declares one, so no parameter can be added or shifted.
- **Measured live through the shipped function: 1,441 of 3,624 unarchived names shorten (39.8%).**
  `greet` is byte-identical and the suite pins it.
- **Deployed:** the ten functions in the closure, re-walked from each `index.ts` rather than
  inherited — create-ai-audit, findable-onboarding, mockup, process-ai-audit-queue,
  process-sms-queue, process-whatsapp-queue, send-whatsapp-message, stripe-webhook, submissions,
  whatsapp-status. `npm run check`: **107/112**, the five known-stale suites only.

### 30b. 🔴 audit_followup 500'd ON ITS FIRST REAL SEND — the branch predicate named yesterday's variables (2026-09-15)

**BS4 Electrical Services Ltd. "Edge Function returned a non-2xx status code."** Nothing was wrong
with the lead: replied, window open, audit complete, trade `Electricians`, town `Bristol`, **24
distinct competitor names**.
- ⛔ **THE NON-2XX IS ITSELF THE DIAGNOSIS, AND IT IS THE FASTEST TRIAGE ON THIS ENDPOINT.** EVERY
  designed refusal in `send-whatsapp-message` returns **200 with `ok:false`** — `pitch_already_sent`,
  `audit_reply_unavailable`, `unsafe_template_var`, `followup_unavailable`, `no_business_name`. A
  **non-2xx is therefore never a refusal working as designed**; it is `unknown_template` (400) or
  `internal` (500), and 500 logs to an edge log **the CLI cannot read**. Check the status before
  hunting the rival guard or the town gate.
- 🔴 **THE CAUSE.** Both senders decided "does this need the lead's audit?" as
  `vars.includes("trade") || vars.includes("competitors")`. **`audit_followup` declares
  `trade_plural`, `town`, `rival_1..3`, `audit_url` — and neither of those two.** It answered NO,
  fell to the **PLAIN opener branch**, and `claimTemplatePayload` ran with no trade, no rivals and
  no report link. The first resolver threw, **the plain branch has no catch**, and the outer handler
  returned 500. `competitor_hook` has the identical shape and was **one Inbox press behind it** — it
  only became reachable there the same morning (§30).
- ⛔ **THE GUARD-KEYED-TO-TODAY'S-INSTANCE FAULT AGAIN (§8), and the two copies were byte-identical
  AND both wrong** — a reviewer diffing them would have found them in perfect agreement.
- 🔴 **THE CORRECT RULE ALREADY EXISTED AND ITS COMMENT CLAIMED THE SENDERS USED IT.**
  `_shared/outreach-audit.ts`'s own `templateNeedsAudit` includes `audit_url`, so it would have
  routed both correctly, and it said of itself *"the same rule the two send paths use to fill the
  payload"*. **False — a stale comment as a load-bearing bug (§4).** Corrected, not merged.
- ⛔ **AND MERGING THEM WOULD BE WRONG: THEY ARE TWO QUESTIONS.** `outreach-audit`'s asks *does this
  message need a completed audit to EXIST* (used for waiting, deliberately broader); the senders'
  asks *which branch BUILDS this payload*. **`free_check_result` proves the difference** — it
  declares an onboarding link AND a report link, so it builds on the ONBOARDING branch while still
  needing an audit to exist.
- **THE FIX: `src/lib/templateRouting.ts`** — `AUDIT_DERIVED_VARS`, `branchForVars`,
  `buildsFromAudit`, `BRANCH_SUPPLIES`, read by both senders. ⛔ **Nothing in it names a template**,
  so one registered tomorrow with a new audit-derived variable joins the right side by construction.
  ⚠️ **Order is part of the rule**: `contact_first_name` → `onboarding_url` → audit vars → plain.
  `onboarding_followup` declares `trade_plural` and is matched FIRST by `onboarding_url`; reordering
  routes it to the audit branch and refuses every lead without an audit for a message that needs none.
- **`scripts/template-routing.test.ts` asks COVERAGE, not routing**: for the branch each SENDABLE
  template lands on, is every variable it declares one that branch can supply? A test asserting only
  "audit_followup routes to audit" passes the day someone adds a variable no branch resolves. **It
  keeps the old predicate as a live assertion** — the reproduction, so a diff reinstating it fails.
- 🔴 **IT FOUND A SECOND LATENT ONE: `free_check_result` would 500 identically if it were ever put in
  the picker.** It works only because it has its own sender and is server-only. The test pins that it
  stays out of `WHATSAPP_TEMPLATES` and says why.
- ⚠️ **NOT PROVEN BY A LIVE SEND** — that costs a real message to a real prospect. Proven by the
  routing test and the deploy; BS4's 24 rivals mean it will genuinely send rather than fall back to
  `video_template`.
- **Deployed:** `send-whatsapp-message`, `process-whatsapp-queue` (the whole closure of the new leaf,
  walked). `npm run check`: **108/113**, the five known-stale suites only.

### 30c. ✅ A SEND CAN BE PREVIEWED NOW — `mode: "dry_run"` and the Inbox Preview button (2026-09-15)

**`audit_followup` failed a SECOND time, on JP Electrical & Compliance, after the §30b fix was
deployed — and the reason nobody could say which of the two causes it was is that there is no
way to ask this function what it WOULD do.** Every refusal and every throw needed a real attempt
on a real lead to provoke, so the first evidence of a fault was always a burned prospect. Two were.

- ⛔ **`mode: "dry_run"` IS THE SAME CODE PATH, NOT A SECOND ONE.** Every guard, every resolver and
  the real `claimTemplatePayload` run exactly as they do for a send; it returns the built Meta
  payload and the stored transcript body **immediately before the Graph POST**, writing nothing.
  A separate "preview" that rebuilt the payload its own way would be the one-rule-in-two-places
  failure this file has recorded seven times — and it would agree with the sender right up to the
  day it mattered.
- ⛔ **A REFUSAL IS REPORTED, NEVER WAVED THROUGH.** `pitch_already_sent`, `phone_already_contacted`,
  `audit_reply_unavailable`, `unsafe_template_var` all answer exactly as they would — that IS the
  answer to "would this send". A dry run that skipped the guards to show a payload would be lying
  about the send it is previewing.
- ⛔ **IT IS ALSO THE DEPLOY MARKER, WHICH IS WHY IT EXISTS IN THIS SHAPE.** §4 says assert on
  something ONLY the target can produce, and this endpoint offered nothing: the §30b fix changed
  behaviour only, its deploy timestamp (10:59:29Z) and the source's own mtime (10:59:40Z) were
  eleven seconds apart, and no reading of either could prove which bytes were live. A response
  carrying `mode:"dry_run"` proves it. **`useInbox.preview` treats a response WITHOUT that field as
  `preview_unsupported`** — an older deploy handed the same call would have SENT.
- ⛔ **AND A PAYLOAD THAT CANNOT BE BUILT IS NOW A 200 HOLD WITH ITS REASON, NEVER A 500.** Every
  designed refusal here already answered 200 with ok:false; a resolver THROWING was the single path
  that reached the operator as an opaque non-2xx with the reason in an edge log the CLI cannot read.
  A `phase` flag makes the outer catch answer `template_not_buildable` before the send and
  `internal` after it, so a half-completed send can never read as a refusal.
- **`scripts/dry-run-preview.test.ts` pins the one property no unit test could see**: the preview
  returns BEFORE the Graph POST, before both inserts and before the status move. **Proven to fail by
  relocating that block below them** (5 failures, all ordering). If it ever drifts down, a preview
  becomes a send.
- ✅ **THE JP ELECTRICAL PAYLOAD WAS REBUILT OFFLINE WITH THE REAL RESOLVERS AND IS CLEAN** — trade
  `electricians`, town `Bath`, three rivals, report link. **So the second failure was the OLD bytes,
  not a second cause**: replaying the pre-fix plain branch for that lead throws
  `unsafe_template_var:trade_missing:` uncaught → 500, which is the §30b fault exactly and matches
  the 19 `trade_missing` rows on the queue lane.
- ⚠️ **IT PROVES OUR HALF, NOT META'S.** `test_send` still costs a real message on purpose, because
  only Meta can prove Meta accepts a template. The dry run covers the half that has failed twice.
- **Deployed:** `send-whatsapp-message` (and `process-whatsapp-queue` re-deployed off current main,
  so the routing fix is certainly live on both). `npm run check`: **109/114**, the five known-stale
  suites only.

### 30d. 🔴 A `catch` CANNOT SEE WHAT ITS `try` DECLARED — and that is how "Failed to send a request" happened (2026-09-15)

**The third distinct symptom on the same button, and it was mine: the dry-run commit put
`let phase` INSIDE the handler's `try` and read it in the `catch`.** A catch clause is a SIBLING
scope, not a child of the try block, so the name is simply not there. **Every throw became a
ReferenceError inside the error handler**, which escaped `Deno.serve`; the runtime answered with its
own 500 carrying **none of our CORS headers**, the browser refused to read it, and supabase-js
reported `Failed to send a request to the Edge Function`.

- ⛔ **THE SYMPTOM IS THE TELL, AND IT IS WORTH MEMORISING.** On this project:
  | What the operator sees | What it means |
  |---|---|
  | a 200 with `ok:false` | a DESIGNED refusal, with its reason |
  | `Edge Function returned a non-2xx status code` | the handler answered — 400/401/403/409, or a 500 whose reason is in an unreadable log |
  | **`Failed to send a request to the Edge Function`** | **the response had no CORS headers at all** — the handler crashed outside its own error path, or never booted |
  The third one is not a worse version of the second; it is a different layer, and reading it as
  "another 500" sends you looking in the wrong place.
- ⛔ **NOTHING LOCAL COULD SEE IT.** `npm run typecheck` does not cover `supabase/functions` (§3),
  `check-edge-syntax.mjs` parses without resolving names, and Deno is not on this machine — so the
  deploy succeeded and the bug shipped. **`scripts/edge-catch-scope.test.ts`** is the gate: for every
  edge entrypoint it takes the outermost `catch` body and fails on any name whose declarations ALL
  lie inside that `try`. **Proven both directions** — it fails on the real bug and passes hoisted.
  ⚠️ It deliberately ignores a name declared nowhere visible (an import, a parameter): the rule is
  narrow on purpose, because a check that fails for its own reasons is the §4 trap.
- ⛔ **THE LIVE VERSION IS READABLE NOW, WITH NO CREDENTIAL: `BUILD_ID` AND `CAPABILITIES` RIDE ON
  `corsHeaders`, SO THEY COME BACK ON THE OPTIONS PREFLIGHT.**
  `curl -s -D - -o /dev/null -X OPTIONS https://<ref>.supabase.co/functions/v1/send-whatsapp-message`
  → `x-swm-build: 2026-09-15c`, `x-swm-caps: dry_run,build_phase_hold,routing_leaf`. Three faults in
  a row on one button were each diagnosed against `main` because the deployed bytes were
  unobservable; a deploy timestamp eleven seconds from a file's mtime was the entire evidence base.
  ⚠️ **A CONSTANT THAT CAN LIE IS WORSE THAN NO CONSTANT**, so `dry-run-preview.test.ts` asserts the
  capability list against the code: `dry_run` is advertised **if and only if** the dry-run return is
  really in the file. **Bump `BUILD_ID` in the same commit as anything worth proving live.**
- ⚠️ **THE CATCH ALSO RECORDS NOW** (`client_error_reports`), because the CLI has no `functions
  logs` — which is why three separate faults on one button each cost a live prospect to find.
- 🔴 **AND THAT EXPOSED A BIGGER ONE: `client_error_reports` HAS NO `message` COLUMN.** Ten edge
  call sites insert one (`audit-baseline.ts`'s `reportOnceAnHour` among them), so **every one of
  those rows has been silently rejected** — the diagnostic layer §4 and §15 describe as "recorded, not
  logged" has, for those writers, been recording nothing. The rows that DO exist all use
  `error_id` + `context`. **`SQL_FOR_PAUL_client_error_message.sql` is the one idempotent ALTER**;
  until it runs, write `error_id` + `context` only. ⚠️ §2's Management-API route is unusable on this
  machine (`~/.supabase/access-token` does not exist — §20 already recorded it), so this needs Paul.
- **Deployed:** `send-whatsapp-message` (BUILD_ID `2026-09-15c`, verified live by the preflight
  header above). `npm run check`: **110/115**, the five known-stale suites only.

### 30e. 🔴 `rivalHookDecision` WAS CALLED AND NEVER IMPORTED — for a day, in the send path (2026-09-15)

**`send-whatsapp-message`'s audit branch has called `rivalHookDecision` and `templateNeedsRivals`
since 2026-09-14 with no import line.** Not a scope problem: a plain ReferenceError.
`process-whatsapp-queue` imports both from the same leaf; this file never did.

- ⛔ **NOTHING IN THIS REPO RESOLVED NAMES IN EDGE CODE, AND THAT IS THE ACTUAL GAP.**
  `npm run typecheck` does not cover `supabase/functions` (§3); `check-edge-syntax.mjs` PARSES with
  esbuild and never resolves a name; the Supabase bundler is content because an unresolved
  identifier is legal JavaScript until the line runs; Deno is not on this machine. So it deployed,
  it was "live", and the first evidence was a prospect thread.
  **`scripts/check-edge-undefined.mjs`** is the gate — tsc over every edge entrypoint collecting
  **TS2304 only**, with `Deno`/`EdgeRuntime` allowed. It is NOT a typecheck: module-resolution and
  type errors are discarded, one error code, one question. In `npm run check`, beside the parse gate.
  ⚠️ **IT GUARDS ITSELF**: tsc always has something to say about edge code (every file uses `Deno`),
  so EMPTY output means the compiler never ran and now FAILS. Naming `npx.cmd` directly instead of
  `shell: true` did exactly that on this machine — execFileSync threw, the catch handed back "", and
  the check reported a cheerful OK. The §0 harness failure, one script later.
- ⛔ **IT TOOK THREE FIXES TO BECOME VISIBLE, AND THE ORDER IS THE LESSON.** While the branch
  predicate sent `audit_followup` down the plain path (§30b) the line was unreachable; while the
  catch was broken (§30d) every throw was destroyed inside the error handler and reported as
  "Failed to send a request". **Each fix did not cause the next fault — it EXPOSED one that was
  already there.** A layer that cannot report is a layer that hides everything beneath it.
- 🔴 **"IT WORKS FOR NEW LEADS" WAS A DIFFERENT SENDER, NOT A DIFFERENT LEAD.** The four
  `audit_followup` messages that went out at 12:06 (Taunton Electricians, Edge Electrical Solutions,
  RW Electrical, Amped Electrics) all carry **`whatsapp_sends.user_id = null`**, which is the QUEUE's
  signature — `send-whatsapp-message` writes the operator's id. They were the **reply lane firing
  automatically** (`first_reply_mode` is `send` again, `first_reply_template` `audit_followup`), not
  button presses. **The Inbox button had never once succeeded.**
  ⚠️ **THE DIAGNOSTIC: `whatsapp_sends.user_id` TELLS YOU WHICH SENDER RAN.** null = queue, an id =
  the Inbox. Two senders with two code paths look identical in `whatsapp_messages`, and reasoning
  about "which leads work" instead of "which sender ran" sends you looking for a data difference
  that does not exist.
- **Deployed:** `send-whatsapp-message`, BUILD_ID **`2026-09-15d`**, verified live by
  `curl -X OPTIONS` reading `x-swm-build`. `npm run check`: **110/115**, the five stale suites only.

---


---

> Moved from CLAUDE.md §32 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 32. ✅ explain_offer_v2 — the pitch with the proof paragraph, wired beside explain_offer (2026-09-16)

**Submitted to Meta 2026-09-16: explain_offer's body with two paragraphs added** — what a searcher
does with the answer ("they call whoever gets named. Right now that's not you.") and the proof
("I've audited 941 UK businesses… A locksmith I did this for went from named once in twelve
questions to named three times, in four weeks, on the pages I built."). Same three variables in the
same order ({{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} onboarding link), same video
header, no buttons, Marketing, English. **explain_offer stays in place — Paul chooses per lead.**

- ⛔ **"chatgpt" AND "gemini" ARE LOWERCASE IN v2 AND CAPITALISED IN v1, AND BOTH ARE RIGHT.** Each
  mirror follows ITS OWN registration; `explain-offer.test.ts` pins both spellings so a "correction"
  to either fails the build. Same rule as audit_followup's lowercase "chatgpt".
- ⛔ **THE PROOF FIGURES ARE LITERAL, LIKE THE PRICES.** "941" and "once in twelve … three times"
  are what Meta registered, not values the code computes. When the book grows (§27: re-derive,
  never inherit) the template is re-registered at Meta FIRST and the two mirrors follow. The
  shared tail from "Keep your website" onwards is asserted byte-identical between v1 and v2, so a
  price edit that reaches one body and not the other fails.
- **The eleven places a template lives, and v2 is in every one:** `WA_TEMPLATES` + `WA_TEMPLATE_BODIES`
  (whatsapp-send.ts), the queue's mirror (lang + vars only — no header field, the registry-parity
  test forbids it), `WHATSAPP_TEMPLATES` (the one sendable list), `WA_TEMPLATE_REQS`,
  `CONTINUATION_TEMPLATES`, `READABLE_TEMPLATE_BODIES`, Inbox's `TEMPLATE_DISPLAY`, campaign-card
  `SIGNUP_TEMPLATES`, and the two named-template tests (cold-outreach's expected set,
  template-routing's onboarding assertion). Routing, bodies-parity, registry-parity, picker-parity
  and client-copy-claims all read the registries and covered it with no edit.
- ⚠️ **TWO GAPS IN explain_offer's OWN WIRING WERE FOUND AND CLOSED ON THE WAY, both silent:**
  Inbox `TEMPLATE_DISPLAY` had no row for `audit_followup` or `explain_offer`, so both rendered as
  the bare word "Template" in a thread's history (labels added for both); and `SIGNUP_TEMPLATES` in
  `useCampaignStats` still held only `onboarding_followup`, so a lead sent the full pitch did not
  count as sent a sign-up link (explain_offer and v2 added). Neither throws when missed — the same
  shape as `REPORT_LINK_TEMPLATES`'s own warning.
- ⚠️ **THE WORKING TREE WAS MIXED-ENDING IN TWO FILES.** `whatsapp-send.ts` and `templateBodies.ts`
  carried bare-LF line breaks inside explainOfferBody's template literal (the 2026-09-15 URL edit
  wrote LF into CRLF files). Harmless — JS normalises line terminators inside template literals and
  git stores LF under autocrlf — but an exact-string edit anchored across those lines misses. Both
  files are uniformly CRLF in the working tree now. Match on an LF-normalised copy when scripting
  an edit here.
- **Not proven by a live send** — that costs a real message to a real prospect. Proven by the
  suites (`explain-offer.test.ts` runs every block for both templates) and, once deployed, by
  `mode: "dry_run"` on `send-whatsapp-message` (§30c), which builds the real payload and stops
  before the Graph POST. **Deploy list is the whatsapp-send.ts closure** (ten functions, §29/§30)
  plus `process-whatsapp-queue` for the mirror — walked, not inherited, at deploy time.
  `npm run check`: **112/117**, the five known-stale suites only (§0's list, re-read by name from
  the runner's FAILED lines, not inferred from the count).
- ✅ **DEPLOYED 2026-09-16, on Paul's word after Meta approval.** Merge `5390f233` pushed; the ten
  functions in the whatsapp-send.ts closure redeployed (walked from each index.ts, not inherited):
  send-whatsapp-message v106, process-whatsapp-queue v149, create-ai-audit v127, findable-onboarding
  v109, mockup v39, process-ai-audit-queue v185, process-sms-queue v52, stripe-webhook v113,
  submissions v53, whatsapp-status v87. **Proven live by markers only the new code produces**: the
  sender's OPTIONS preflight answers `x-swm-build: 2026-09-16a` (bumped in `507e4380` for exactly
  this — the template commit had forgotten §30d's rule), and the live SPA's Inbox, outreach,
  whatsappTemplates and coldOutreach chunks each carry `explain_offer_v2` with its label, read with
  the surrounding characters (§4). ⚠️ **The live ENTRY chunk does NOT contain the string** — the
  templates live in route chunks — so grepping `index-*.js` for a template name reads "absent" on a
  deploy that is live. Cloudflare had built within ~5 minutes of the push this time. Still not proven
  by a real send; the Inbox Preview (`dry_run`) is the next cheapest proof.

## audit_followup_fault — the 7-variable fault template (2026-09-17)

`audit_followup_call` PLUS a named site fault and the report link. Seven vars: {{1}} trade WITH its
own article, {{2}} town, {{3}}{{4}}{{5}} three rivals, {{6}} ONE sentence naming the site's main
crawl fault, {{7}} the SHORT report link (`findable.live/r/<code>`).

**The gate — {{6}} may never be empty (Meta rejects a blank parameter), so this is the ONLY thing
deciding whether the template is offered.** Two layers, both fail closed, and it NEVER falls back
either way:
- **Picker (`getTemplateSendability`, new `needsSiteFault` req):** offered only when the lead's crawl
  check found a fault. `useInbox` computes `hasSiteFaultLeadIds` from the newest `lead_crawl_checks`
  per lead, same fresh(30d)+v2 gate the report uses. A clean-site / un-crawled lead is steered to
  `audit_followup_call` instead.
- **Send (`send-whatsapp-message`):** `site_fault` throws `unsafe_template_var:no_site_fault` if the
  value is blank, returned as a visible hold. The fault sentence is resolved in the audit branch from
  `resolveAuditReplyVars.siteFault` → `mainSiteFault(signals)` (single-sourced on `buildFaultLines`,
  first/headline fault's detail).

It is a **CONTINUATION** (Inbox only) and names rivals, so a lead short of three rivals **HOLDS**
(no cold `video_template` fallback) — `rivalHookDecision` reads `CONTINUATION_TEMPLATES`. It carries
`audit_url`, so it is `needsAudit` and in `REPORT_LINK_TEMPLATES` (its {{7}} opens are report opens).
Accepted exposure noted in `coldOutreach.ts`: it *could* be drip-selected (unlike `audit_followup_call`,
which has no `audit_url`), but it is never queued — Inbox is the only door.

Registered in all eleven places (WA_TEMPLATES + body, the queue mirror, WHATSAPP_TEMPLATES,
WA_TEMPLATE_REQS, CONTINUATION_TEMPLATES, READABLE_TEMPLATE_BODIES, Inbox TEMPLATE_DISPLAY,
REPORT_LINK_TEMPLATES, BRANCH_SUPPLIES, and the tests). `scripts/audit-followup-fault.test.ts` pins
the 7-param order and both fail-closed gates. **Meta registration is Paul's to do** — the code sends
the moment Meta approves the name, no further change. Deployed 2026-09-17: the 15-function closure of
the changed shared modules (whatsapp-send, audit-reply, crawlCheck, coldOutreach, templateRouting).
Measured at deploy: 3 leads currently carry a fresh v2 crawl fault, so the template offers itself
rarely today and will grow as crawl checks populate.

---

## `ai_site_findings_v2` — the human-findings successor (2026-09-22, SUBMITTED, NOT APPROVED)

audit_followup_fault's successor. **Identical shape — seven vars, same order, same gates — and the
only difference is what {{6}} says:** two or three site findings in plain English instead of one
sentence lifted out of the report's fault list. `{{1}}` trade with its own article, `{{2}}` town,
`{{3}}{{4}}{{5}}` rivals, `{{6}}` the findings, `{{7}}` the short report URL, `lang: "en"`.

**The switch is `AI_SITE_FINDINGS_V2_APPROVED` in `src/lib/siteFindings.ts`, currently `false`.**
While false `getTemplateSendability` refuses the template **before any other requirement is
consulted**, and the picker label says PENDING. Approval is that one line. Nothing about
audit_followup_fault, initial_opener_v2 or the opener A/B changes either way.

**{{6}} is built from signals the crawl check already stores — no new crawler, no new fetch, no new
query.** `buildSiteFindings` reads `CrawlSignals` and writes each finding as
**WHAT I SAW → WHAT THAT MEANS IN NORMAL ENGLISH → WHY IT MAY MAKE AI VISIBILITY HARDER.**

⛔ **Every third clause is hedged, and that is accuracy rather than timidity.** We can see what is on
a site. We cannot see why Gemini or ChatGPT named somebody else. The first version of this generator
asserted an internal decision process — *"it has read everyone else's site and not yours"*, *"AI
reads those as one page"*, *"AI does not run JavaScript"*, *"nothing specific to repeat back"* — none
of which we or anyone outside those companies has observed. A prospect who knows more than we do
spots it in one line, and the message stops being a person who looked at their site and becomes
somebody guessing. The supported register is "can make it harder", "may mean", "gives AI less
information to work with". The test carries a blocklist of both scanner phrasing **and** absolute
AI-decision claims, run over every candidate string rather than the two a single seed happens to pick.

⛔ **The opener belongs to the joiner and is chosen by position.** A finding is stored as
`clause` + `rest`, where the clause follows an opener ending in "is" — so the same finding reads
*"One thing that stood out is the homepage is very thin…"* first and *"The other thing I noticed is
the homepage is very thin…"* second, with nothing rewritten and nothing doubled. **No opener is
"I had a look…"**: the template's own fixed line directly above {{6}} already says *"Had a proper
look at your site as well"*, and a finding repeating it reads like the message lost its place.

⛔ **No measurement reaches the message — not one digit.** *"91% the same"*, *"under 120 words"*,
*"69 characters"* are all real and all scanner. A tradesperson does not know whether 120 words is a
lot, and a precise figure invites an argument about the figure instead of a conversation about the
site. The numbers stay where they are useful and checkable: the crawl signals, and the report's own
fault section, which is written for somebody sitting down to read it. **No bot names either** —
"OAI-SearchBot" means nothing to a locksmith; singular/plural still carries the real shape of what
was found. **And no comparison with Google**: we never fetch the site as Googlebot, so *"as reliably
as Google can"* was a comparison against a measurement we do not hold.

⚠️ **Two findings is the normal message.** A third is held to `COMFORTABLE_THREE_CHARS = 720`, well
under the hard cap, and the weakest is **dropped** rather than the wording compressed. Taking the
measurements out brought each finding down to ~200–255 characters, so the three shortest now do fit
where they did not before; a site whose findings include the longest one (the homepage) still ships
two. Both sides are driven in the test rather than described.

⛔ **Only four of the six signals are eligible**: `searchBlocked`, `clientRendered`, `duplicates`,
`thinPages`. `missingH1` and `noJsonLd` are excluded — they are real, they belong in the report, and
in a WhatsApp message they are the difference between "he looked at my site" and "this is an
automated scan". **A lead whose only faults are weak gets no message rather than a weak one.**

⛔ **Stricter than `siteFaultLine` on two leads, and the registered copy is why.** It says "Had a
proper look at your site as well" and blames the site, so **no website → refused** and **a clean
crawl → refused**. Both still get audit_followup_fault, which has a line for each.

⛔ **{{6}} is ONE LINE, and that is Meta's rule, not a style choice.** A parameter containing a
newline, a tab or 4+ consecutive spaces is rejected with **#132018** and the whole send dies (four
audit_reply sends died that way on 2026-08-12). It is also capped at `MAX_FINDINGS_CHARS = 900`
against Meta's 1024-character parameter limit (**#131009**) — over the cap the **weakest finding is
dropped and it is rebuilt**, never truncated mid-sentence.

⚠️ **The two crawl sentences get their own positional argument each, and sharing one was a real bug**
caught by template-bodies-parity on the first run: `siteFindings ?? siteFault` fed the findings to
audit_followup_fault's body, because "whichever value is defined" is not the question — "which
variable does THIS template declare" is.

⚠️ **Transitions vary by a lead-id seed** so two prospects in one town do not read a mail merge, and
the same lead always reads the same message. `openerVariant.ts` keeps its own hash deliberately: that
one is part of the A/B's stability contract and must not be reshuffled by a wording change here.

**What the repo cannot say, and did not invent.** The brief's examples included sitemap-points-to-
wrong-domain, conflicting canonicals, accidental noindex, orphaned pages and disconnected
third-party evidence. **`CrawlSignals` carries none of those** — `crawl-check` fetches the homepage,
robots.txt and a bounded page sample, and stores six signals. Those findings would need new crawler
work, which this task explicitly excluded.

Registered in all eleven places; `scripts/site-findings.test.ts` (122 assertions) pins the switch,
the 7-param order across both registries, the selection rules and a scanner-phrase blocklist.
**Not deployed. Not approved. Meta registration and the flag flip are both Paul's to do.**


## The initial opener — one selected template, no 50/50 split (2026-09-23)

- **Before:** from 2026-09-22 the Outreach queue dialog replaced `initial_contact` with
  `openerTemplateFor(template, leadId)`, a lead-id hash that sent about half of every batch
  `initial_opener_v2`. The queue itself always sent what was stored on the lead, so the split lived
  in one browser write. 116 v2 openers went out under it (to 2026-09-23 14:04 UTC); they are untouched.
- **Now:** `whatsapp_outreach_state.initial_opener_template` (default and current: `initial_contact`)
  is the ONE selection, set from the "Initial outreach template" control in the Outreach queue dialog
  (`process-whatsapp-queue` mode `set_initial_opener_template`, approved openers only, sends nothing).
  `openerSendability` (`src/lib/openerVariant.ts`) makes a non-selected opener unsendable in every
  picker (via `getTemplateSendability`) and `send-whatsapp-message` refuses it (`opener_not_selected`,
  build 2026-09-23b). An unreadable or unavailable selection makes NO opener sendable — never the
  other one.
- **Frozen at queue time:** the queue sends `outreach_leads.whatsapp_template` as stored and never
  re-reads the selection, so retries, delays and later changes cannot switch a queued lead.
- Tests: `scripts/initial-opener-select.test.ts` (replaces `opener-variant.test.ts`).
