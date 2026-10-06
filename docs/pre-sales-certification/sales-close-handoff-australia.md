# Sales close → payment → handoff → paid client, and Australia (2026-10-07)

Branch `improve/sales-close-handoff-australia` (off `main` `7646074e`), with `improve/au-location-parity` merged in.
Paul's brief: treat the close as a real salesperson's workflow; one workflow from the call to the paid client; make
Australia work as well as the UK. Plus his addition the same day: the two Meta templates `findable_signup_link` and
`findable_onboarding` (created, in review, shown as Marketing).

## 1. Quick Close — old vs new

**Old (v2, 2026-10-05):** decision maker → website approach (5 options) → [plan if "unsure"] → Optimise: access, who
manages it / Build: rights, design owner, domain (by approach) → the three Build consents → link → an 8-field handoff
(6 required). The Call screen asked "who runs the site", the agency contract and spend, jobs, areas and the decision
maker — and **saved none of it** (React state only), so Quick Close and the handoff asked again.

**New:**

1. **Confirm the offer** — Optimise | Build, with the recommendation from the call's answers (`quickClose.offerFit`).
2. **Only what is still missing and commercially necessary:**
   - authority (if the call didn't answer it);
   - on Optimise: can Findable get into the site, and who runs it (if the call didn't say);
   - on Build with an agency running the site: whether they are still in contract (if the call didn't say).
3. **The sign-up link** and its one compliant send (§4).
4. Done. The handoff is optional and mostly pre-filled (§5).

| Question | Kept? | Why |
|---|---|---|
| Plan (Optimise / Build) | ✅ step 1 | chooses the offer |
| Authorised to decide | ✅ (once — the call's answer counts) | avoids a mistake (a "No" blocks the link) |
| Can we get into their site (Optimise) | ✅ | Optimise IS work on their site — "No" stops for Paul |
| Who runs the site | ✅ only if the call didn't answer | the access review and the agency rule need it |
| Still in agency contract (Build + agency) | ✅ only if the call didn't answer | the agency-contract rule |
| Website approach sub-type | ❌ removed (Details tab only) | Paul decides the build style with the client |
| Rights to reuse content / design owner | ❌ → onboarding form (`site_rights`) | not needed to take payment |
| Who controls the domain | ❌ → onboarding form (`domain_*`) | not needed to take payment |
| The three Build consents | ❌ → the signed agreement + onboarding form | the client signs the agreement before paying (7.1(a) domain / DNS access, 8.1 materials); the form collects `dns_permission` / `materials_confirmed` |

Old rows keep their stored answers; nothing they hold is required any more. `quickCloseGate.consentsNeeded` is always
false. Build is READY on the plan + authority alone (self-run site or no site).

**Removed:** "If that sounds good, I'll send you the link now. It's £99 today, and Paul takes it from there." — not
replaced (pinned absent by `call-workspace.test.ts`).

## 2. The agency-contract rule (`quickClose.offerFit`, one place)

- Agency / third party runs the site **and** contract `in_contract`, `not_sure` or not asked → **Optimise only** for a
  salesperson (Call screen Offer and Quick Close step 1 hide / disable Build, saying why). Absent is never "free".
- Contract **ended** (`free`) → either plan.
- Self-managed → both, Optimise first; no website → Build only.
- **Not a hard ban:** Paul (admin) still sees Build ("needs your release"); a Build saved on those answers is a
  `agency_contract_build` **Paul review** stop (the existing review / release mechanism).
- The reason never criticises the agency.

## 3. The words

**What we do** (Call screen, `callScript.WHAT_WE_DO_LINE`): an AI visibility check to see where they stand; the real
customer questions they have a genuine chance with; optimise the website so Google and the AI tools understand what they
do and where, adding / improving pages where it helps; the same check after four weeks, then monthly. No promise of being
recommended, cited, ranked or included. "Improve the public evidence" is gone from the call screen and the sales
explainer (the call's `NO_STRONG_ISSUE_LINE`, Paul's own tested wording, still says "public evidence").

**Optimise** (`planTerms.ts`, the one source): six £99 payments in total, the first included; the 6th is the last — it
covers a final month of work — then the plan ends; **no** £29.99 a month after Optimise.
**Build:** twelve £99 payments, the first included; the site is theirs; **£29.99 a month for hosting and maintenance
only if they want Findable to keep looking after it**, cancellable with 30 days' notice.
Used by the Call screen's plan text and objections ("How much is it?", "Can I cancel?", "Why six / twelve months?"),
the playbook summary, the Quick Close card and the message / email that carries the link.

### ⚠️ The commercial conflict (documented, not rewritten)

- **Billing already matches Paul's rule.** `_shared/delayed-subscription.ts` makes one £99/month subscription whose
  `cancel_at` stops it after the 6th Optimise / 12th Build charge. Nothing ever bills £29.99 automatically
  (`CONTINUING_SERVICE_AUTOMATION`). **No Stripe code was changed.**
- **The contract and the client-facing checkout text do not match it:**
  - the v3 Client Service Agreement the client signs (`clientAgreement.ts` 9A, 3.2, 9.3; findable-site
    `clientAgreementV3.ts`), `FINDABLE_OFFER_SUMMARY`, `cardSavedNoticeFor`, `checkoutLineNameFor` and findable-site's
    pricing pages all say Optimise continues at £29.99 until cancelled;
  - at the end of a v3 Optimise term, `stripe-webhook` alerts Paul to "set up the Continuing Service by hand".
- These are legal / checkout terms and **were not touched**.
- The fix exists, unmerged: branch `improve/sales-script-commercial-alignment` (agreement v4: Optimise 6 then stop,
  `finaliseFixedTerm`, migration `20261012090000`) and findable-site `commercial/optimise-six-payments`. Its v4 wording
  needs Paul's approval (ideally a lawyer's) before deploy.
- Until then: the sales words promise less than the contract permits, and nothing is ever charged beyond the six.

## 4. The payment link and WhatsApp

**Paul's rule (`paymentLinkRoute.ts`, the one decision for both links):**

1. The **APPROVED** template — one click, any time.
2. Otherwise a **normal message only when** we have already messaged them **and** they replied (an inbound after our
   first outbound) **and** the 24-hour window is open.
3. Otherwise the template while its status can't be read (Meta decides, and the screen says so).
4. Otherwise **nothing**: "Link ready — tell the customer where you're sending it", with **Copy sign-up link** /
   **Email the link**.

Nothing is recorded as sent unless the sender said ok; a copy is recorded as copied.

**`findable_signup_link`** — {{1}} greeting name, {{2}} the unique `findable.live/agree/<token>` sign-up link (→ check
details → sign the agreement → Stripe). **`findable_onboarding`** — {{1}} greeting name, {{2}} the paid client's
`findable.live/details/<token>` form link (no payment).

- **First-class:** both are registered in the existing sender — `WA_TEMPLATES` + the queue mirror, `WA_TEMPLATE_BODIES` /
  `READABLE_TEMPLATE_BODIES` (Paul's registered wording, verbatim), `CONTINUATION_TEMPLATES` (a phone close / a paying
  client — a logged call would make the cold guard refuse them), and the template labels.
- **Never queued.**
- **{{1}}** = the contact's first name, else the business's short name, else "there".
- **{{2}}** is resolved **inside `send-whatsapp-message`** from the lead's own records (`_shared/link-template-vars.ts`):
  - signup: the lead's usable Quick Close sign-up link, unpaid and open;
  - onboarding: the paid client's open form link.
  It is shape-checked in `templateBodyParams`: a Stripe URL, another host or an empty value throws, so a raw Stripe URL
  can never be sent. Quick Close / Paid Clients pass the template name only.
- **Approval is read live, never hard-coded.** `_shared/template-status.ts` reads Meta's
  `GET /{waba}/message_templates?name=…`:
  - the account comes from `WHATSAPP_BUSINESS_ACCOUNT_ID` if set, else the access token's `debug_token` scopes, and only
    when exactly one account is found;
  - results are cached in `whatsapp_template_status` (30 min if approved, 3 min otherwise, 1 min after a failed read);
  - a send Meta refuses as unavailable (132001 / 132015 / 132016) forces a fresh read.

  | Meta's answer | What the app does |
  |---|---|
  | APPROVED | Sends, in Meta's registered language |
  | PENDING / IN_APPEAL | "WhatsApp signup template awaiting approval" + copy fallback |
  | REJECTED / PAUSED / DISABLED / NOT_FOUND | Said plainly, not sent |
  | Unreadable | The send is tried and Meta decides |

  The day Meta approves, the next status read finds it and the button works — **no code change, no deploy**.
- **Duplicates:** one WhatsApp send of a link unless the rep / Paul presses **Resend** (confirm). The server refuses
  `already_sent`; the sender refuses `pitch_already_sent` without `allow_resend`.
- **Failures** are mapped to words (`templateSendFailureText`: not approved, paused, variable mismatch, marketing limit,
  undeliverable) and recorded as `link_share_failed`, never as sent.
- **Security:**
  - a salesperson can send only a sign-up link, on a lead they may work (the sender's role guard);
  - a salesperson cannot send the onboarding template — a paid client is refused for sales (`isClientLead`), and Paid
    Clients is admin-only (`requireAdmin`);
  - the onboarding link sent is always that client's own open link.
- **Phones:** the sender's own normalisation (`waNumber.ts`, now Australia-aware); quick-close / paid-client-hub pass the
  lead's country.
- **Category:** Meta shows both as **Marketing**. The opt-out guard refuses marketing templates to an opted-out number
  (as designed). Meta may also hold a marketing message for per-person limits (131049) — said as such. If Meta
  reclassifies them, nothing changes in code (the live category is shown, never assumed).
- ⛔ `whatsapp-status` is **not** deployed. Registering the templates touches modules in its import closure
  (`whatsapp-send.ts`, `coldOutreach.ts`, `waNumber.ts`); inbound does not use the new templates, so it stays HELD.

## 5. The handoff — old vs new

**Old:** 8 fields, 6 required (work type, site situation, what they want, promised, why they bought, decision maker);
Send to Paul hidden until all six were answered.

**New:** **nothing is required.**

- **Already known — shown, not asked:** work type (from the plan), site situation (from the call), what they want (the
  call's jobs + areas).
- **Asked only what the rep uniquely learned:** contact / decision maker (pre-filled), their role, anything special
  promised (one-tap "Nothing beyond the standard package"), the best way for Paul to reach them (WhatsApp / phone /
  email), and a note.
- "Why they bought" is no longer asked; it is still shown on old handoffs.
- Send to Paul is always available.

## 6. What auto-fills

- **The Call screen saves as the rep taps:**
  - through `quick-close` `save`: who runs the site → `manager`, the agency contract → `agency_contract`, and the
    decision maker → `decision_maker`;
  - through the new `save_call` mode (`quick_close.call`): the jobs, the areas and the agency spend.
- **Jobs and areas also fill the lead's services / service areas**, only when blank (or still the call's own earlier
  value). Those are the same fields the Details tab, the setup checklist and the paid-client intake read.
- **Quick Close never re-asks** an answered key; "From the call" is shown under "What we already know".
- **The handoff prefill** reads the plan, the manager and the call notes.
- **The paid client's intake** shows the call lines under "What did Sales tell us".

## 7. Paid Client onboarding (one workflow)

Client pays → the existing auto-intake → the Paid Client page shows known facts, conflicts and **Still needed** → right
under it, **Get missing info from the client** (`ClientOnboardingPanel`):

- **Preview:** "It will ask N questions", listed.
- **Send onboarding:** makes the secure link. The panel then offers **Send onboarding on WhatsApp** (the approved
  template, or a replied 24 h conversation), **Copy onboarding link**, **Copy message**, **Open**, **Make a fresh link**
  and **Turn off link**.
- **Status shown:** opened / not opened, the last send, "Answers in", and any **conflicts**.

**The form** (`findable.live/details/<token>` → fn `client-onboarding`; `clientOnboardingForm.ts`):

- **Only missing / unconfirmed questions:**
  - a value Paul confirmed is never asked;
  - a value only Sales / the website / Google gave is asked as a pre-filled confirmation;
  - a value the client already gave is not asked.
- **Per plan:**
  - Optimise: website address, platform, who runs it (+ their web company's email);
  - Build: domain (+ ownership / access / third party only when keeping their domain), authority to replace the current
    site, DNS permission, materials rights, reuse of the current site's content, photos;
  - both: contact, email, phone, home town, services, priority jobs, areas, Google Business Profile access, "anything we
    must not say".
- **No Stripe, no agreement, no payment step.**
- **Submit:**
  - every value is validated to its shape, only the link's own questions are accepted, and a hidden follow-up is dropped;
  - answers are written to **blank** onboarding columns only; a filled, different column is a **conflict** shown to Paul
    and never overwritten;
  - the link closes once (a conditional write), History records `onboarding_form_submitted`, and Paul gets a "CLIENT
    DETAILS IN" notice;
  - the intake re-runs, so Still needed updates. Provenance is "Client onboarding".
- **Reopening:** a submitted link says "Thanks — that's everything"; a reopened open link asks only what is still missing
  from its snapshot.

**Security:**

- the token is 32 random bytes (64 hex), unique, one row per client, revocable;
- at most one open link per client (partial unique index);
- the form shows only that client's business name and questions;
- it cannot reach Paid Clients or any other client;
- an ended / refunded client's link answers "isn't available";
- the tables are service-role only (RLS on, no grants).

## 8. WhatsApp replies → the client record

- **The existing AI reader** of inbound WhatsApp (`conversation-triage`, every 2 minutes) also reads a **paying client's**
  newest recent real-words message for onboarding facts:
  - fields: services, areas, contact, email, phone, website, town, address;
  - inside its own per-run / per-day AI caps and the all-stop;
  - not a parallel WhatsApp system, and the held `whatsapp-status` is untouched.
- **Paul's button:** "Read WhatsApp replies" on the client reads the newest unread replies now.
- **What a fact must pass:** it is kept only if the client's own words (the quote) appear in their inbound messages; low
  confidence, unknown fields and bad shapes are dropped. An unclear reply gives nothing.
- **Facts are stored, never written to a client field** (`client_whatsapp_reads`, one row per message). The intake reads
  them as source **"Client on WhatsApp"** (client grade, just below the onboarding form):
  - an EMPTY field is filled;
  - a different client / sales answer is flagged "Needs review — conflicting evidence";
  - a Paul-confirmed value always stands, and the difference is listed for him;
  - the newest answer per field wins.

## 9. Location selector and Australia (from `improve/au-location-parity`, commit `00561b00`)

**Location UI:**

- The order is **Country → Location → Radius**, using a normal dropdown: name + code, no flag-emoji letters, "Main
  markets" (UK, Australia, India) then A–Z.
- Location placeholder: "Town, suburb or postcode".
- **Suggested in <country>:** wrapping chips for the selected country only, 12 then "Show all". No inner scrollbox, no
  outlined bubble.
- **Changing country** clears a location tied to the old country and keeps a typed suburb / postcode. Radius and
  "This town only" are untouched.
- The 15 required Australian places are included, biggest first.
- **Layout:** desktop is three columns; at 390px it is one column and the chips wrap.
- Rules live in `src/lib/locationPicker.ts`; the old `QuickLocationsList.tsx` is deleted.

**Australia parity:**

- **Phones (`waNumber.ts`, one rule):**
  - `04…`, `+61…`, `0061…` and `0011 61…` on an Australia lead → `61…`;
  - 13 / 1300 / 1800 → refused;
  - **an `04…` number on a UK or blank-country lead is never turned into a UK `44…` number** (it returns null) — this was
    a wrong-person risk;
  - line type: Australian mobile = mobile; `(02)` / `+61 2…` = landline; 1300 / 13 / 1800 never WhatsApp-eligible;
  - the Add Lead dialog offers Australia.
- **Duplicate detection:** `phone_key` makes `+61 412 345 678` and `0412 345 678` one key (SQL + both TS mirrors, parity
  test). `phone_e164_key` gives `+61…`. A salesperson can read an Australian lead's WhatsApp
  (`my_sales_message_phones`).
- **CSV import:**
  - an optional Country column;
  - otherwise a row is Australian on a `+61` phone, an address ending "Australia", or a state + 4-digit postcode;
  - phone repair, postcode matching and same-name matching follow the row's country;
  - the lead stores its country (was hard-coded UK).
- **Search:**
  - `search-leads` accepts country names longer than 10 characters, with a country-neutral not-found hint;
  - Australian directories are not taken as a business's own website;
  - `geobias` reads "Perth WA" / "Darwin NT" / "New South Wales" as Australian when Australia is picked.
- **AI questions:**
  - no "Sydney Australia AU" / "Sydney, Australia, Australia";
  - the question methodology is unchanged (customer-style provider questions);
  - the wrong-town guard reads the `uk_towns` gazetteer **for UK leads only**, so an Australian "Newcastle" / "Perth" is
    no longer blocked as 17,000 km away.
- **Not widened:** cold WhatsApp outreach stays UK + India (`sales_queue_opener` untouched). The label now says "WhatsApp
  outreach is not switched on for Australia or other countries yet".

**Deferred, with reasons:**

- **Australian cold WhatsApp** — Paul's decision: Spam Act consent, and a Sydney send window (the queue window is
  London's).
- **en-GB / Europe/London operator formatting.**
- **Coverage / Niche Check** — still UK-only (`uk_towns`).
- **`knownEntities` / `aggregators`** — Australian directories not added; that needs a wide redeploy.
- **`manualOnboarding.ts` "+44" hint** — pinned to findable-site by a test.
- **Google gives the suburb as the Australian town** — a genuine place, left as is.
- **Payments are GBP.**

## 10. Migrations

- `20261014100000_au_phone_key.sql` — `phone_key` / `phone_e164_key` / `my_sales_message_phones`.
  - Live definitions were verified identical to the repo copies they were made from.
- `20261014100100_au_phone_key_reindex.sql` — `REINDEX INDEX CONCURRENTLY` × 2. Run straight after 100000, each statement
  on its own. Measured: **0** lead / message rows change key today.
- `20261014100200_csv_import_country.sql` — `import_leads` with the row's country (live definition verified identical to
  its base).
- `20261014120000_sales_close_onboarding.sql`:
  - new tables `client_onboarding_links`, `client_whatsapp_reads` and `whatsapp_template_status`;
  - kind lists widened: `quick_close_events` + `call_answers_saved`; `lead_activity` + `onboarding_link_sent`,
    `onboarding_form_submitted`, `whatsapp_facts_found`; `notifications` + `client_onboarding`. Every existing kind is
    kept (read from production).

**Rolled-back live QA (2026-10-07):** all four migrations' DDL ran inside one DO block ending in RAISE, so nothing
persisted.

- second open link → `unique_violation`; revoke then new → ok; bad token → `check_violation`; duplicate token →
  `unique_violation`;
- `authenticated` reading the links / status tables, and `anon` reading the reads table → `42501`;
- new and old kinds accepted; a message read twice → `unique_violation`;
- `+61 412 345 678` = `0412 345 678` (`412345678`); UK and India keys unchanged;
- `phone_e164_key('0412 345 678')` = `+61412345678`;
- 0 rows change key; 0 old-form Australian suppressions.

Read back afterwards: none of the tables exist and the live `phone_key` is unchanged.

## 11. Edge functions

| Function | Why |
|---|---|
| `quick-close` | save_call, offer, link rule, template send, duplicate guard |
| `send-whatsapp-message` | the link templates + live status; `waNumber` (Australia) |
| `paid-client-hub` | onboarding actions, WhatsApp facts button, intake view |
| `client-onboarding` | **new**, public form, `verify_jwt = false` |
| `client-intake` | the WhatsApp source and call lines in the loader |
| `conversation-triage` | client facts |
| `process-whatsapp-queue` | registry mirror; Australian line type; `waNumber` |
| `findable-checkout`, `stripe-webhook` | reach `quickClose.ts` (the gate change) / `waNumber` / `seedGuard` |
| `create-ai-audit`, `process-ai-audit-queue`, `search-leads`, `backfill-lead-towns`, `findable-onboarding`, `enrich-business`, `paid-baseline`, `render-remeasure-results`, `weekly-visibility`, `mockup`, `send-whatsapp-media`, `send-whatsapp-voice`, `submissions` | reached by the Australia changes (`waNumber` / `seedGuard` / `geobias` / `line-type` / `leadCountry`) |

⛔ **`whatsapp-status` — NOT deployed** (in the import closures of `waNumber`, `inboundMatch`, `whatsapp-send` and
`coldOutreach`; inbound behaviour unchanged by them).

findable-site: `functions/details/[token].ts` (the proxy, same shape as `/agree/`).

## 12. Tests

- **New:**
  - `scripts/sales-close-handoff.test.ts` — the agency rule, the minimal close, nothing asked twice, the per-plan words,
    no close line, "what we do", the link rule (replied / no reply / not messaged / closed window / approved / pending /
    unknown / no phone), both templates (names, variables, exact bodies, a Stripe URL refused, live status gate,
    language, one per lead / resend, server-side links, sales cannot send onboarding), the handoff, onboarding (per plan,
    known omitted, confirmed protected, validation, conflicts, no payment, idempotent submit, revoke), WhatsApp facts
    (known / new / conflicting / unclear / confirmed protected), the migration;
  - `au-phone`, `au-phone-key-parity` and `au-location-parity`.
- **Updated (intentional behaviour changes):**
  - `quick-close`, `quick-close-links`, `sales-workspace-v2`, `service-route-terms`, `wave1-integration`,
    `coverage-found-added` (the shorter close, no consents);
  - `call-workspace`, `call-script`, `cold-call-playbook`, `findable-offer-terms`, `pre-sales-final` (per-plan words, no
    close line);
  - `paid-client-auto-intake`, `paid-client-automation` (lightweight handoff);
  - `cold-outreach` (the two continuations); `opener-contact-guard` (the build marker moved on);
    `whatsapp-template-snapshot-paths` (the language actually sent); `paid-client-hub-resilience` (`country`);
  - `sales-ready-gate` (`save_call` gated); `client-copy-claims` (four new client-facing sources);
  - `india-readiness`, `csv-lead-import` (Australia).

## 13. Deployed (2026-10-06 UK, evening)

- **Reconciled** with `main` `fd89c671` (the sign-up / agreement redesign, merged meanwhile; deployed by its own session
  at 18:07 UTC). No conflicts; that work's own record notes the same v3 Optimise conflict. Gate: 347/347 suites,
  typecheck 9 = baseline. `client-signup-agreement-flow` and `manual-onboarding` read findable-site source and pass
  with `FINDABLE_SITE_DIR` set to a current origin/master checkout.
- **SQL**, in order, each read back:
  1. `20261014100000`;
  2. the two `REINDEX … CONCURRENTLY` (both indexes valid after);
  3. `20261014100200`;
  4. `20261014120000`.

  Read back: three tables with RLS on, 0 policies, 0 API grants; the partial unique index; every kind list with old and
  new values; `+61 412 345 678` = `0412 345 678`; `import_leads` with the country rule; the sales message-phones
  function with the 61 forms.
- **Functions** (from the main merge tree `add76de4`):
  - send-whatsapp-message v160 (`x-swm-build 2026-10-07a-link-templates`, caps incl. `link_templates`);
  - client-onboarding v1 (new; `x-build client-onboarding-2026-10-07a`);
  - quick-close v19; paid-client-hub v67; client-intake; conversation-triage v27; findable-checkout v77;
    process-whatsapp-queue; submissions; send-whatsapp-media; send-whatsapp-voice; mockup; create-ai-audit;
    process-ai-audit-queue; search-leads; backfill-lead-towns; findable-onboarding; enrich-business; paid-baseline;
    render-remeasure-results; weekly-visibility; admin-overview; business-summary; sales-performance; stripe-webhook v165.
  - Then `main` `c3fa3777` (the template-status account lookup): send-whatsapp-message, quick-close, paid-client-hub
    redeployed.
  - **Not redeployed:** reached only through the continuation list or labels they never use — market-view, niche-sample,
    page-generator, prospect-preview, render-audit-report, render-welcome-pack, run-seo-scan, voice-note-script,
    warm-lead-reply.
  - ⛔ **`whatsapp-status` untouched — still v114 (2026-09-30).**
- **App:** `main` pushed. `app.leadfinderos.com` and `leadfinderos-next.pages.dev` serve "Send signup link on WhatsApp",
  "Get missing info from the client", "Suggested in", "Already known — no need to type it" and "WhatsApp signup template"
  (deploy check: live HTML → every chunk).
- **findable-site:** `master` `adb22ca` (the `/details/[token]` proxy over their `698d605`), deployed to production
  (branch master, account 4148056c). `findable.live/details/<unknown>` answers the client-onboarding function's own
  "isn't available" page.

## 14. Live certification (fixtures ZZ QA-S1 / ZZ QA-S2, drama-range phones, excluded, archived after)

**ZZ QA-S1 — the Test salesperson:**

- the call answers saved (manager, contract, £150, jobs, areas, decision maker) and filled the lead's services / areas;
- Build while still in the agency contract → `needs_review`, and the link was refused (409);
- switched to Optimise → only "access" was asked → ready;
- the sign-up link is `findable.live/agree/<64 hex>`;
- a WhatsApp send went as the template — **simulated**, because the fixture's number is in the drama range;
- a second send needed Resend (`pitch_already_sent`);
- copy was recorded as copied;
- the handoff came pre-filled (Optimise / agency / "More Boiler installations … in Maidenhead, Windsor"), and Send to
  Paul worked with nothing typed;
- the salesperson was refused on Paid Clients (403 `admin_only`) and on the onboarding template (403).

**ZZ QA-S2 — Paul:**

- the form asked 11 Optimise questions (email known → not asked; town and contact pre-filled as confirmations);
- the link was made once and reused;
- WhatsApp went as the template (simulated); copy recorded; reading WhatsApp found 0 replies.

**ZZ QA-S2 — the client, through `findable.live/details/<token>`:**

- the form has no payment wording;
- a bad email got 422 with the field marked;
- a valid post showed the thanks page;
- `amount_paid` / `plan_tier` / `status` posted alongside were ignored;
- a second post got "already have your answers" and wrote nothing.

**Results on the record:**

- answers in the onboarding columns; History; "CLIENT DETAILS IN";
- the intake re-ran to ready — **Still needed: none**, services and town from "Client onboarding";
- the link was revoked.

**Australia, read-only searches** (search-leads as Paul, no lead added): plumber Sydney 15, electrician Melbourne 33,
painter Brisbane 47, locksmith Perth 13 (resolved "Perth WA, Australia"), builder Adelaide 50, plumber Ashgrove 39
(resolved "Ashgrove QLD").

- every address Australian, 0 UK, 0 duplicate place ids;
- phones come from Place Details when a lead is added (international form), not in search results.

**Mobile:** the onboarding form in a 390px frame (headless Edge) — no overflow, the options wrap, follow-ups hidden
until relevant. The location picker at 390px: proved by its own harness (`improve/au-location-parity`). The Quick Close
and Call changes: text / DOM proof only; nobody has seen them on screen.

**⚠️ Meta template status cannot be read yet:**

- the live read answers `no_waba`: the access token's debug_token has 20 scopes but no target accounts, and the token
  belongs to no business, so the sending account cannot be discovered;
- set the edge secret **`WHATSAPP_BUSINESS_ACCOUNT_ID`** (the account that owns the sending number, from WhatsApp
  Manager) and the screens will show "awaiting approval" / "approved" from Meta;
- until then the status is "unknown": a one-click send is tried and Meta decides (an unapproved template is refused by
  Meta, reported in words, never shown as sent);
- approval then works with no code change either way.

**Noticed, not changed:** every `send-whatsapp-message` send also gets a mirrored `[template_name]` row from the
existing `trg_mirror_whatsapp_send` trigger — 1,316 live rows in 30 days, pre-existing.