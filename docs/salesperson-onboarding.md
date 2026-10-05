# Salesperson onboarding and the Ready to Sell gate (2026-10-05)

Branch `feature/salesperson-onboarding-compliance`. Migration `20261010120000_salesperson_onboarding_compliance.sql`
(NOT applied — see §9). Sources: the pack of 5 Oct 2026 — *Independent Sales Contractor Agreement draft v2*,
*Privacy Notice for Salespeople* (draft), *Team Guide change notes*, *Checklist, Risks and Actions for Paul*
(Part 13 is the onboarding list).

Three rounds of instruction from Paul on the same day, in order: (1) the onboarding record; (2) drafts must
not count, Ready to Sell must be a REAL gate, TPS via TPS Services; (3) **TPS/CTPS POSTPONED** — keep the
gate, drop every TPS dependency; (4)+(5) attribution: Ready to Sell gates CREATING a sale, and the seller is the
authorised CREATOR of the sign-up the client paid through — never the lead's owner at payment (§3a). This record describes the final state.

**WhatsApp behaviour is unchanged.** The draft agreement's clause 4.3(c) (call first, WhatsApp only after a
recorded yes) does not match Paul's operating model and will be amended separately; nothing here encodes it.
No WhatsApp function, template, queue rule, opt-out or suppression rule was changed. The only effect on
WhatsApp is the gate itself: a salesperson who is NOT Ready to Sell is refused a send or a queue exactly the
way a suspended salesperson already is (same guard, same response). Ready reps and Paul: identical behaviour.

## 0. SALESPERSON PAPERWORK — HANDLED EXTERNALLY BY PAUL, NOT ENFORCED IN LEADFINDEROS (Paul, 2026-10-05)

Paul sends the contractor agreement and the salesperson privacy notice to salespeople himself, outside the app.
So (migration `20261010140000_ready_to_sell_without_paperwork.sql`, live 2026-10-05):
- neither is part of Ready to Sell (`salesperson_onboarding_missing()` no longer checks them);
- nothing a salesperson sees asks them to open, tick, sign or upload one — the only thing they can do themselves
  is acknowledge the current team guide;
- what Paul chooses to record about them on the Team page (version, date, where the copy is kept) is a
  REFERENCE line, optional, never "missing";
- they are no longer a launch blocker: a rep becomes Ready to Sell on the practical items in §3 alone.
⛔ This is ONLY salesperson paperwork. The CLIENT Service Agreement v3 (read, affirm authority, sign — before
any Stripe payment, enforced in `findable-checkout`) is unchanged.

## 1. Document records — reference only (and the team guide)

Table `salesperson_document_versions` (id, kind = contractor_agreement / privacy_notice / team_guide, label,
**status = draft / approved / superseded**, document_ref, outstanding[], approved/superseded times). One
approved version per kind (unique index); the database refuses approving a version with anything
outstanding. `approve_salesperson_document()` approves a draft and supersedes the previous approved version.
**Only the TEAM GUIDE's approved version still matters to Ready to Sell** (a new guide must be acknowledged);
contractor agreement and privacy notice versions are kept for Paul's records only.

Seeded (kept as records): `contractor-agreement-draft-v2` (draft), `salesperson-privacy-notice-draft-2026-10-05`
(draft, 10 outstanding items, §2), `team-guide-2026-10-02` (approved, the current guide).

## 2. Privacy notice — Paul's open drafting items (not a product blocker)

ICO registration number (s1); right-to-work provider or delete the bracket (s5); overseas-transfer safeguard
per provider (s5); confirm 6 years for payment/commission/tax and for the agreement (s6); retention for
LeadFinderOS sales/activity records (s6); confirm 12 months for login logs (s6); "Last updated" date (s9);
remove the "Words in [square brackets]…" line; sections 2–3 mention "WhatsApp permission records / process"
from the clause being amended.

## 3. Ready to Sell — the rule and the gate

**The rule** (one place: `public.salesperson_onboarding_missing(uid)` / `salesperson_ready_to_sell(uid)`;
`src/lib/salespersonOnboarding.ts` mirrors it for the screen with the same keys, and the Team page shows the
SERVER's answer). Ready = an active, unsuspended sales login, not past an end date, and all eight:

1. 18+ confirmed
2. right-to-work check recorded (result pass, method, date, who, evidence location; provider for a certified
   check; a follow-up date that has fallen due blocks)
3. bank details received
4. VAT status (no, or yes + UK VAT number)
5. individual, or limited company with the contracting entity recorded (name, number, date the contract with
   the company was confirmed) — a contractor status never recorded counts as missing (a NULL slipped through
   H's first version; fixed in `20261010140000`)
6. start date, ON OR BEFORE today's London calendar day — a date still to come returns `not_started` (final sales
   release, 2026-10-05, migration `20261011120000`; E2E-03). Ready from the start date itself. The screen says
   "Starts on 12 October" (`startsOnWords`); `my_onboarding_status` returns the person's own `starts_on` only while it is
   still to come.
7. own LeadFinderOS login (live account, never stored)
8. current approved team guide acknowledged (the salesperson can do this one themselves)

NOT required: the contractor agreement and the privacy notice (§0, handled outside the app). Schedule 2 is
optional and never blocks. **TPS/CTPS is not part of it.**

**What a not-ready salesperson CAN do:** sign in; see the "You are not Ready to Sell yet" banner (Sales
dashboard, lead workspace, Find Leads) — "Calls, messages, claiming leads, checks, Find Leads and sign-up links
are paused until your onboarding is complete. Waiting on: …" with only the real missing items; acknowledge the
current team guide; read their leads;
write notes; record an opt-out; give leads back / archive; finish the handoff for a sale already made.

**What they CANNOT do (refused on the server):**

| Action | Where it is refused |
|---|---|
| Claim a lead / add a lead / be assigned one | `guard_action` ('claim'), the assignment trigger on `outreach_leads` (signed-in sessions), admin-users "move all" |
| Find Leads (search-leads → `lead_search`), prospect checks, hook audits, enrichment, any guarded action | `guard_action` → `not_onboarded` (refused like `suspended`, one alert per person per day); the Find Leads page also shows the banner and does not start a search |
| Log a call or any other contact, set stages / follow-ups / interest | the `lead_activity` trigger (only their own session; allowlist: note, opted_out, lead_unassigned, archived_set, handoff_saved, details_set, delivery_submitted, client_info_answered) |
| Queue outreach, send WhatsApp | `guard_action` ('whatsapp_queue', 'whatsapp_send') — no WhatsApp code changed |
| Quick Close save / payment link / share | fn `quick-close` (`_shared/sales-ready.ts`, fails closed) |
| CREATING a new sale (Quick Close answers, payment link, sharing it) | fn `quick-close` (above) — this is where Ready to Sell controls selling. The seller is then the authorised CREATOR of the sign-up, never the owner at payment (§3a) |

The admin is never gated anywhere. The screens also hide selling actions (`leadPermissions(role, ready)`),
but the server is what enforces.

⚠️ Every current sales login (today only the two TEST accounts) is not ready until Paul records its practical
onboarding (§3) on the Team page. No document approval is needed first.

## 3a. Seller attribution — SALE CREATOR ≠ CURRENT LEAD OWNER (final, 2026-10-05)

Two corrections the same day: first, a not-ready rep's sale was no longer moved to Paul; then **the seller
stopped being "whoever owns the lead when the client pays"**. Final rule:

**SELLER = the authorised person who CREATED the sign-up the client paid through.** Lead ownership and sale
attribution are different things once a sale exists. Ready to Sell controls whether a salesperson may CREATE
a sale; once a legitimate sign-up exists, the seller follows its recorded creator, not later ownership.

**The chain (all server-side):**
1. Quick Close → `generate_link` (refused for a not-ready salesperson) → `findable-checkout` makes a Stripe
   Checkout Session → quick-close logs `quick_close_events` 'link_generated' (actor = creator, `data.session` =
   the session). That log is server-written and immutable (no update, delete or truncate).
2. A trigger snapshots each such link into **`sale_creations`** (append-only, keyed by the log row): session,
   lead, onboarding row, creator, creator's role, and **whether they were Ready to Sell at that moment** (+ what
   was missing). Links made before this rule are backfilled with readiness UNKNOWN (never counted as ready).
3. The client pays → `stripe-webhook` writes **`outreach_leads.paid_checkout_session_id`** (write-once) in the
   SAME update that marks the lead paid (`firstPaymentPatch`, `checkoutSessionId: s.id`).
4. `trg_outreach_leads_sold_by` (its body replaced; same trigger) asks `sale_attribution_decision(lead)` and
   stamps **`sold_by_user_id`** — the existing seller field — **once, frozen forever**:
   - the paid session's creator, if they were Ready to Sell when they made it (or are the admin) → that creator;
   - no session on the payment (a manual Mark Paid) → the most recent sign-up link's creator, same test;
   - no sign-up link at all and the lead is Paul's (or nobody's) → Paul, exactly as before (admin never reviewed);
   - otherwise → **NO seller** (`sold_by_user_id` stays empty; `sold_at` records that it was decided) and an
     **ATTRIBUTION REVIEW NEEDED** row in `sale_attribution_reviews`, plus a security event.

**Abnormal = review** (never Paul, never the current owner, nothing rewritten): `no_authorised_creator` (no link
by an authorised person; the owner is only the *claimed* seller), `creator_not_authorised` (the link's creator
was not Ready to Sell when they made it), `claimed_seller_mismatch` (a seller written with the payment does not
match the creator evidence). The review keeps: the paid session, the creation record, every link on the lead,
the owner at payment, the owner history (adds / claims / assignments), and the claimed seller's readiness.
Paul resolves once on the Team page: **Confirm seller** (the claimed seller is stamped — then frozen — and filled
into that lead's ledger rows that had no seller, so the normal commission rules apply) or **Not credited** (no
seller is ever stamped; the claimed seller and evidence stay on the review).

**Immutable:** reassignment, a rep becoming not ready, being disabled or leaving, later payments, status changes,
and a direct attempt to write `sold_by_user_id` or `paid_checkout_session_id` all leave the stamp as it was. A held
sale gets a seller only through Paul's resolution. Historic stamps are never re-read (proven live: same sellers,
same count).

### The interface Session F (commission) must consume

- **`public.sale_attribution_held(lead_id uuid) → boolean`** (service role). TRUE ⇔ the lead's review is
  `open` or `not_credited` ⇒ the sale must NOT produce salesperson commission. FALSE after `confirmed`, or when
  the lead has no review ⇒ the normal commission rules apply to the preserved seller.
- **`public.sale_attribution_holds`** (view, service role): `lead_id, review_status, claimed_seller_user_id,
  reason, held, created_at, resolved_at` — one row per reviewed lead, for reading a whole ledger at once.
- **`src/lib/saleAttribution.ts`**: `ATTRIBUTION_HELD_STATUSES = ['open', 'not_credited']`,
  `isAttributionHeld(status)` (an unknown status is held) — the TypeScript mirror, pinned to the SQL by tests.
- The seller to credit is `outreach_leads.sold_by_user_id` (and `payment_ledger.sold_by_user_id`). A held sale has
  NO seller stamped, so today's commission code (which needs a seller) already pays nobody; Session F should still
  read the hold explicitly. No commission calculation was changed here.

## 4. Right to work — factual

Methods are recorded as one of three categories: **manual / video check recorded** (`manual_video_call`),
**certified provider check** (`certified_provider`, provider name required), **other approved method**
(`manual_in_person`, `home_office_share_code`). No screen says a method gives a statutory defence; a video
check carries the note that it is not certified and that the record does not show a defence. No passport
number, copy or date of birth is stored; free text that looks like one (or a bank detail) is refused.

## 5. TPS / CTPS — POSTPONED BY PAUL (2026-10-05). FUTURE COMPLIANCE ENHANCEMENT — NOT ACTIVE

Current implementation:
- harmless future-ready structures kept: table `phone_tps_checks` (provider + reference required; nothing
  writes it), `src/lib/tpsCheck.ts` (provider boundary + verdict; `TPS_PROVIDERS` empty);
- **no live provider, no external API, no credentials needed, no active screening;**
- **no call block, no Ready to Sell dependency, no screen shows it** (the lead-card line was removed);
- calling works exactly as before for a ready rep and for Paul.

Removed during the day: the TPS line on the lead card and its read. Never built (postponed before it was):
the TPSAPI adapter, the `tps-check` function, the call-safety gate. Research kept for later: TPS Services'
TPSAPI is `POST https://service.tpsapi.com/` with an `Authorization` token, `check-tps` / `check-ctps`
headers and `{"phone_numbers": [...]}`; its response format is NOT publicly documented (the older TPS Checker
API is), so the adapter must be written against a real response and fail closed on anything else.

## 6. Business type — display / evidence only

Limited company / LLP / sole trader / partnership / unknown (`src/lib/businessType.ts`): a strong Companies
House match on an active company (labelled "not confirmed by a person"), or a person's record with evidence
(`lead_record_business_type`). A missing Companies House match is never "sole trader". **Nothing uses it to
allow or block calls, WhatsApp, email or LinkedIn**; enforcement can be added later if Paul chooses.

## 7. Leavers

On the onboarding row: end date + reason (resigned / ended by Findable on notice / misconduct), note,
misconduct found later (within 6 months, agreement 13.3), data-deletion confirmation (12.3). From the end
date the person is no longer Ready to Sell (sales actions stop); Disable on the Team page still removes the
login. Commission does not read any of it.

## 8. Security and tests

- `salesperson_onboarding`, `_log`, `salesperson_document_versions`: RLS on, no policy, every privilege
  revoked — fn `admin-users` is the only reader/writer. A salesperson sees only their own status keys
  (`my_onboarding_status`), never a stored value. The readiness functions are service-role only.
- `scripts/salesperson-onboarding.test.ts` (documents, checklist, keys = the database rule, validation),
  `scripts/sales-ready-gate.test.ts` (every enforcement point, admin exempt, WhatsApp untouched, business type
  display-only), `scripts/tps-check.test.ts` (postponed: no provider, no API, not in the gate, no call block),
  `scripts/business-type.test.ts`.
- `supabase/tests/salesperson-onboarding-rls.sql` — run live 2026-10-05 with the migration prepended inside
  one rolled-back transaction: **70/70**. Read back afterwards: no table, function, fake user, borrowed lead, QA payment link or
  security event left; the live `guard_action` unchanged.
- ⚠️ Older live SQL tests that act as fake salespeople (`supabase/tests/*.sql`) will now see those fake
  users refused as not onboarded; give their fixtures a complete onboarding row before re-running them.

## 9. To ship (NOT done — no merge, no deploy)

1. **Apply the migration FIRST.** ⛔ stripe-webhook now writes `outreach_leads.paid_checkout_session_id`; deployed
   before the column exists, the payment write would fail. Read back: the tables (incl. `sale_creations`,
   `sale_attribution_reviews`), the new column, the functions, the triggers (incl.
   `trg_quick_close_events_sale_creation`, `trg_outreach_leads_attribution_review`, the replaced
   `trg_outreach_leads_sold_by` body), the grants, `pg_policies`, and that `guard_action` contains `not_onboarded`.
2. Deploy the edge functions that changed or reach a changed module: `stripe-webhook` (passes the paid session),
   `quick-close` (the gate; imports `_shared/sales-ready.ts`), `admin-users` (onboarding, documents, reviews),
   `client-agreement` and `paid-client-hub` (both import the changed `src/lib/paymentState.ts`; behaviour unchanged).
3. Release the SPA (Team panel, Documents, attribution reviews, the banner, permissions).
4. Session F wires `sale_attribution_held` / `sale_attribution_holds` into commission (§3a).
5. Before any real salesperson starts: record each person's practical onboarding (§3). The contractor agreement
   and privacy notice are Paul's to send outside the app (§0) — not a step here.
