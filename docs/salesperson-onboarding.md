# Salesperson onboarding and the Ready to Sell gate (2026-10-05)

Branch `feature/salesperson-onboarding-compliance`. Migration `20261010120000_salesperson_onboarding_compliance.sql`
(NOT applied — see §9). Sources: the pack of 5 Oct 2026 — *Independent Sales Contractor Agreement draft v2*,
*Privacy Notice for Salespeople* (draft), *Team Guide change notes*, *Checklist, Risks and Actions for Paul*
(Part 13 is the onboarding list).

Three rounds of instruction from Paul on the same day, in order: (1) the onboarding record; (2) drafts must
not count, Ready to Sell must be a REAL gate, TPS via TPS Services; (3) **TPS/CTPS POSTPONED** — keep the
gate, drop every TPS dependency; (4) attribution corrected: Ready to Sell gates CREATING a sale, the seller is
preserved afterwards, abnormal sales are held for review (§3a). This record describes the final state.

**WhatsApp behaviour is unchanged.** The draft agreement's clause 4.3(c) (call first, WhatsApp only after a
recorded yes) does not match Paul's operating model and will be amended separately; nothing here encodes it.
No WhatsApp function, template, queue rule, opt-out or suppression rule was changed. The only effect on
WhatsApp is the gate itself: a salesperson who is NOT Ready to Sell is refused a send or a queue exactly the
way a suspended salesperson already is (same guard, same response). Ready reps and Paul: identical behaviour.

## 1. Documents — only the CURRENT APPROVED version counts

Table `salesperson_document_versions` (id, kind = contractor_agreement / privacy_notice / team_guide, label,
**status = draft / approved / superseded**, document_ref, outstanding[], approved/superseded times). One
approved version per kind (unique index); the database refuses approving a version with anything
outstanding. `approve_salesperson_document()` approves a draft and supersedes the previous approved version
in one transaction, and reports how many salespeople had the old one (they stop being Ready to Sell). A version whose id says "draft" (draft v2, the draft notice) can never be approved, even with its notes cleared — the final document is added as its own version.

Seeded:
- `contractor-agreement-draft-v2` — **draft**. Outstanding: clause 4.3(c) to be amended. Can be RECORDED as
  what someone signed (history), **never satisfies "current approved contractor agreement signed"**.
- `salesperson-privacy-notice-draft-2026-10-05` — **draft / provided for review**, 10 outstanding items (§2).
- `team-guide-2026-10-02` — approved (the current guide).

No final version number is invented. When Paul has the final documents he adds them on the Team page →
Salesperson documents (Add a document version → Approve as current).

## 2. Privacy notice — outstanding before it can be approved

ICO registration number (s1); right-to-work provider or delete the bracket (s5); overseas-transfer safeguard
per provider (s5); confirm 6 years for payment/commission/tax and for the agreement (s6); retention for
LeadFinderOS sales/activity records (s6); confirm 12 months for login logs (s6); "Last updated" date (s9);
remove the "Words in [square brackets]…" line; sections 2–3 mention "WhatsApp permission records / process"
from the clause being amended.

## 3. Ready to Sell — the rule and the gate

**The rule** (one place: `public.salesperson_onboarding_missing(uid)` / `salesperson_ready_to_sell(uid)`;
`src/lib/salespersonOnboarding.ts` mirrors it for the screen with the same keys, and the Team page shows the
SERVER's answer). Ready = an active, unsuspended sales login, not past an end date, and all ten:

1. current APPROVED contractor agreement signed (+ date + where the signed copy is kept)
2. current APPROVED salesperson privacy notice given (+ date)
3. 18+ confirmed
4. right-to-work check recorded (result pass, method, date, who, evidence location; provider for a certified
   check; a follow-up date that has fallen due blocks)
5. bank details received
6. VAT status (no, or yes + UK VAT number)
7. individual, or limited company with the contracting entity recorded (name, number, date the contract with
   the company was confirmed)
8. start date
9. own LeadFinderOS login (live account, never stored)
10. current approved team guide acknowledged (the salesperson can do this one themselves)

Schedule 2 is optional and never blocks. **TPS/CTPS is not part of it.**

**What a not-ready salesperson CAN do:** sign in; see the "You are not Ready to Sell yet" banner (Sales
dashboard, lead workspace) with what is outstanding; acknowledge the current team guide; read their leads;
write notes; record an opt-out; give leads back / archive; finish the handoff for a sale already made.

**What they CANNOT do (refused on the server):**

| Action | Where it is refused |
|---|---|
| Claim a lead / add a lead / be assigned one | `guard_action` ('claim'), the assignment trigger on `outreach_leads` (signed-in sessions), admin-users "move all" |
| Prospect checks, hook audits, searches, enrichment, any guarded action | `guard_action` → `not_onboarded` (refused like `suspended`, one alert per person per day) |
| Log a call or any other contact, set stages / follow-ups / interest | the `lead_activity` trigger (only their own session; allowlist: note, opted_out, lead_unassigned, archived_set, handoff_saved, details_set, delivery_submitted, client_info_answered) |
| Queue outreach, send WhatsApp | `guard_action` ('whatsapp_queue', 'whatsapp_send') — no WhatsApp code changed |
| Quick Close save / payment link / share | fn `quick-close` (`_shared/sales-ready.ts`, fails closed) |
| CREATING a new sale (Quick Close answers, payment link, sharing it) | fn `quick-close` (above) — this is where Ready to Sell controls selling; see §3a for what happens to attribution afterwards |

The admin is never gated anywhere. The screens also hide selling actions (`leadPermissions(role, ready)`),
but the server is what enforces.

⚠️ After deploy, every current sales login (today only the two TEST accounts) is not ready until its
onboarding is recorded with approved documents — and no approved agreement or notice exists yet. That is the
intended effect.

## 3a. Seller attribution — gated at CREATION, preserved afterwards (corrected 2026-10-05)

An earlier version of this branch moved a not-ready rep's new sale to Paul at payment. **That is gone.**
Ready to Sell controls whether a salesperson may CREATE a sale; it never decides who a sale belongs to later.

- **Who is recorded:** the existing stamp — `outreach_leads.sold_by_user_id`, set once when the lead first
  becomes a client (the lead's owner at that moment) and frozen by the existing trigger. This branch writes
  no seller anywhere. The creation evidence is the Quick Close payment link the seller generated
  (`quick_close_events` 'link_generated' / 'link_reused', server-written and timed — the commission code
  already reads it); since quick-close refuses a not-ready rep, such a link proves they were authorised.
- **Rep later becomes not ready / is disabled / the client pays days later:** nothing changes. Monday: a ready
  rep generates the link. Tuesday: a newer agreement is approved, so they are temporarily not ready (or they
  are disabled). Wednesday: the client pays. The seller is still that rep; commission follows the normal rules.
- **Abnormal sale** — the recorded seller is a salesperson (or an ex-one) who is NOT Ready to Sell when the
  client pays AND generated no payment link for that lead: the seller is NOT rewritten and nobody else is
  credited. One `sale_attribution_reviews` row is opened (**ATTRIBUTION REVIEW NEEDED**, with the evidence:
  what was missing, the owner, every payment link on the lead) and a security event is raised. Team page →
  "Sales needing an attribution review": Paul presses **Confirm seller** or **Not credited** (fn admin-users
  `attribution_review_resolve`, once per review). The product does not support moving a stamped seller, so a
  decision is recorded rather than the seller rewritten.
- **Commission stays Session F's.** No commission calculation, ledger row or payout is changed here.
  `public.sale_attribution_held(lead)` (true while a review is open, or after "Not credited") is the one
  question the commission rules need to ask. ⚠️ Until Session F reads it, a held sale is only flagged — the
  commission code would still count it under its own rules.
- **History:** only the FIRST stamp is ever looked at; every existing sale keeps its seller (proven live: same
  sellers, same count) and no review is opened for anything that already happened.

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
  one rolled-back transaction: **57/57**. Read back afterwards: no table, function, fake user, borrowed lead, QA payment link or
  security event left; the live `guard_action` unchanged.
- ⚠️ Older live SQL tests that act as fake salespeople (`supabase/tests/*.sql`) will now see those fake
  users refused as not onboarded; give their fixtures a complete onboarding row before re-running them.

## 9. To ship (NOT done — no merge, no deploy)

1. Apply the migration; read back the tables (incl. sale_attribution_reviews), the functions, the triggers (incl.
   trg_outreach_leads_attribution_review), the grants,
   `pg_policies`, and that `guard_action` contains `not_onboarded`.
2. Deploy fns `admin-users` and `quick-close` (the only edge functions changed; `quick-close` now imports
   `_shared/sales-ready.ts`).
3. Release the SPA (Team panel + Documents, the banner, permissions).
4. Hand Session F (commission) public.sale_attribution_held(): a held sale must not earn automatically.
5. Before any real salesperson starts: add and approve the final contractor agreement and the completed
   privacy notice, then record each person's onboarding.
