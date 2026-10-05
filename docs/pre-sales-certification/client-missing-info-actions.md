# Client missing-info actions (2026-10-05)

Branch `feature/client-missing-info-actions`. **Not merged, not deployed** (parallel-session rules).

## The problem

Paid Client setup showed what was missing (services, areas, website, website control, Google access,
domain, onboarding) and who owed it, but gave Paul no way to get it. Now one **Missing information** box
sits under the state / setup progress / next step, with three actions:

- **Find what we already have** — what is already on file but not yet counted.
- **Ask salesperson** — only when someone else sold the client.
- **Contact client** — the client's own WhatsApp conversation, else email / phone.

## How missing-info detection works

`src/lib/clientMissingInfo.ts` `missingInformation()` reads the existing checklist
(`handoffReadiness`) — required, not ok, and an *information* item (`MISSING_INFO_KEYS`). Payment, the
crawl, the Hook Audit and "service ended" are Findable's own work, never "missing information". GBP the
client says is done (Findable to confirm) is Paul's check, not missing information.
It is **derived every read**: when a field fills, the item disappears — nobody marks anything resolved.
Each item says whether the **seller** could answer it (`SELLER_ANSWERABLE_KEYS`: the handoff, services,
service areas, website, website control — the lead fields the checklist already accepts "from Sales")
and whether the **client** could (everything but the seller's handoff and the business name). Domain
authority, Google access and the client's form are client-only (the domain rule).

## Find what we already have (Paul's addition, same day)

Button inside the box → `paid-client-hub gather_known` → `gatherKnown()`. For each missing item it lists
what these sources hold, **each separately and labelled, never merged** (clientFacts rule):
other onboarding rows (an earlier / unpaid form, the free check — the row the checklist already reads is
skipped), the website crawl (`lead_crawl_checks.result.siteInfo` services / towns / phone / email, and the
crawled URL), the salesperson's handoff (`site_situation`), and the Quick Close `manager` answer.
A crawl find says "Found on their website … — a guess until the client confirms it" (setupPrefill's
labelling). The same value from two sources shows once (a bare trailing slash is the same site).
**Use** → `apply_known` with the candidate's **id only**: the server gathers again, finds that candidate,
and writes it through `cleanSellerClientInfo` (four lead fields, only adds, a website only where none is
on file), History `details_set` with `from` / `confirmed_by_operator`. Contact details found elsewhere are
**Copy only** (never written). Nothing is offered for domain / Google access / the form. Refused for an
ended / refunded client.

## Ask salesperson — the seller request flow

- **Who:** `sellerAskState()` — `ask` only when `salesHandoffApplies === 'required'` (a salesperson's sale
  since handoffs existed), `sold_by_user_id` is set (**never** the current owner), the seller is an ACTIVE
  team member with the sales role (unreadable = not active), the client is not ended / refunded, and at
  least one seller-answerable item is missing. Otherwise: `own_sale` ("Not needed — your own sale" stays),
  `no_seller`, `not_recorded_before`, `seller_inactive`, `closed`, `nothing_to_ask` — no button.
- **Server decides:** `paid-client-hub request_client_info` (admin only) re-derives everything and refuses
  `cannot_ask` (409) unless the same rule says ask. Items come from the server's checklist, never the screen.
- **Stored:** table `client_info_requests` (migration `20261009090000_client_info_requests.sql`): lead,
  seller, who asked, when, item keys (display only), reminder stamp/count, answered, closed + reason. It
  stores **no client information** — the answers land on the same lead / handoff fields.
- **Notification:** `notify_person(seller, 'client_info_request', 'CLIENT INFO NEEDED · <business>', '<business>
  is missing: Services · … Please add anything you collected during the sale.', '/sales-dashboard?handoff=<lead>')`.
- **History:** `client_info_requested` (and a reminder line).

### Idempotency

- One OPEN request per client is a **partial unique index** (`client_info_requests_one_open`). A losing
  insert (23505) reads the winner back → "Already requested from <name>". No second notice.
- A second press answers `already_pending`. **Remind again** appears after `CLIENT_INFO_REMIND_AFTER_HOURS`;
  the reminder is a conditional write on the stamp it read (two presses remind once), with its own
  notification dedupe key.
- Paul sees "Requested from <name> · <when>", the reminder, and later "<name> answered your request".

## What the salesperson sees

- The bell: **CLIENT INFO NEEDED · <business>** → opens `/sales-dashboard?handoff=<lead>`.
- **Finish the handoff** (Sales dashboard, `MyHandoffs`) lists that sale first with "Paul asked for: …",
  even if the handoff itself was complete; the link opens the same Quick Close / handoff screen (reused —
  no second workflow). There: a **CLIENT INFO NEEDED** section listing what Paul asked for, the
  `SellerClientInfoForm` (services, areas, current website — only if none on file —, who controls it) and
  the existing handoff form.
- `save_client_info` (new quick-close mode) writes those four lead fields through `cleanSellerClientInfo`
  (allowlist, never clears, never overwrites a website); `save_handoff` unchanged. Either save **by the
  addressed seller** answers the request (`answered_at`, closed `answered`), records
  `client_info_answered`, and notifies Paul (link to the client). Paul's own edit never closes it.

## Paul's own sale

No Ask salesperson. "Not needed — your own sale" stays on the Sales handoff box, with "Fill it in".
Contact client and Find what we already have are shown.

## Contact client and the Inbox

- `clientContactRoutes()`: a WhatsApp conversation exists (any message by lead id or number) → **Contact
  client** opens `/inbox?lead=<id>&need=<keys>` (the one deep link, `whatsAppLinkForLead`). No conversation
  and the number is worth trying (`isWhatsAppWorthTrying`: verified, or a mobile never tried) → same link;
  the Inbox's own start state applies, with the existing template / 24-hour / Meta / contact rules — nothing
  bypassed. Meta rejected the number, a landline, or unchecked → no WhatsApp; **Email** (a `mailto:` draft
  with the request) and **Call <number>** instead. No phone and no email → a sentence, never a dead button.
- The Inbox shows an **INTERNAL** "Need from this client · internal — never sent" note on THAT lead's thread
  only (`ClientInfoNeededHelper`; it remembers the lead because `?lead=` is one-shot). **Copy request**, and —
  only inside the 24-hour window — **Put in reply box** (the reply drafter's path: fills the composer, Paul
  edits and presses Send). Keys only in the URL, an allowlist.
- History `client_contact_opened`: "Opened the client's WhatsApp conversation from Paid Client — nothing
  sent by the app" (once per channel per 10 minutes). Never recorded as a message sent.

## Nothing auto-sends

No new code calls a sender. Ask notifies a teammate inside the app; Contact opens a screen; Copy uses the
clipboard; Put in reply box fills the composer. Swept by the test.

## Security

- `client_info_requests`: RLS on; **no write grants**; read = admin, or `seller_user_id = auth.uid()`.
  Written only by paid-client-hub (requireAdmin) and quick-close (seller) on the service role.
- A salesperson's list reads only `seller_user_id = actor` on their own `sold_by_user_id` sales; the
  handoff screen shows a request only to its seller. `save_client_info` refuses anyone but the seller /
  admin (`mayHandoff`, denial recorded). Another salesperson can neither see nor answer.
- **Rolled-back live SQL QA (2026-10-05)** — the migration + checks in one DO block ending in RAISE:
  second open insert → `unique_violation`; seller sees 1, direct update/insert → `42501`; another rep sees
  0; admin sees 1; anon → `42501`; new History / notification kinds accepted; new request after an answered
  one OK; closed without a reason → `check_violation`. Read back after: table absent, no leftover rows.

## Tests

`scripts/client-missing-info.test.ts` (in `npm test`): summary, seller derivation, ask states, own sale,
one request / one notice / already pending / remind gap / two simultaneous presses (in-memory database
with the same unique rule), only the addressed seller answers, setup updates from the fields, contact
routes + fallbacks, the Inbox note is internal and renders Copy-only outside the window, nothing sends,
the allowlist, closed-client refusals, Find what we already have (sources separate, crawl labelled, no
client-only finds, apply by id, de-duplication), History / notification kinds.
Updated: `paid-client-hub-resilience` (new columns, read back live), `pre-sales-final` (later migration).
**Gate: `npm run check` 316/316, typecheck 9 = baseline.**

## Visual QA

Throwaway harness (real components, fixtures, no network; deleted). Desktop 1280 + phone 375:
1 Paul's own sale (no Ask; Contact / Email / Call / Copy) · 2 salesperson's sale (Ask salesperson,
"Test may know") · 3 outstanding request (Remind disabled) and a day-old one (Remind enabled) · 4 seller
answered ("Test answered your request"; only GBP / domain / onboarding left) · 5 existing conversation ·
6 no conversation: start on WhatsApp / Meta-rejected → email + call / nothing → sentence · the Inbox note
(closed + open window) · the seller's form · Find what we already have results. No horizontal overflow at
375. Screenshots seen for the first set; the finder's later check is text/measurement proof only (the pane
stopped drawing).

## Deploy (when integrated — not done here)

1. SQL: `20261009090000_client_info_requests.sql` (additive; widens two CHECKs), read back.
2. Edge: `paid-client-hub`, `quick-close` (closure of `clientMissingInfo.ts` /
   `_shared/client-info-request.ts`). `_shared/client-setup.ts` changed only a TYPE (LeadEventKind) —
   `findable-onboarding`, `paid-baseline`, `stripe-webhook` need no redeploy for this.
3. SPA via main. What's New entries added (admin + sales).
