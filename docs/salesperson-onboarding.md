# Salesperson onboarding, TPS/CTPS state, business type, leavers (2026-10-05)

Branch `feature/salesperson-onboarding-compliance`. Migration `20261010120000_salesperson_onboarding_compliance.sql`
(NOT applied — see §9). Sources: the pack of 5 Oct 2026 — *Independent Sales Contractor Agreement v2*,
*Privacy Notice for Salespeople* (draft), *Team Guide change notes*, *Checklist, Risks and Actions for Paul*
(Part 13 is the onboarding list).

Paul's brief: the minimum practical onboarding record to start using salespeople safely. **WhatsApp
behaviour is not changed** — the agreement's clause 4.3(c) and the guide's WhatsApp section do not match
Paul's operating model and are being amended separately, so nothing encodes them.

## 1. The checklist (src/lib/salespersonOnboarding.ts — the one rule file)

Ten items block READY TO SELL; one (Schedule 2) is shown but never blocks:

| Item | Complete when |
|---|---|
| Contractor agreement | a KNOWN version (`CONTRACTOR_AGREEMENT_VERSIONS`) + date signed |
| Privacy notice | a known **final** version (`PRIVACY_NOTICE_VERSIONS`) + date given — a draft is recorded but never completes it |
| 18+ | a confirmation date (never the date of birth) |
| Right to work | result `pass` + method + date + who checked + where the evidence is kept (+ provider name for a certified provider); a follow-up date that has fallen due blocks |
| Bank details | a received date (the details stay on the signed agreement) |
| VAT | answered: no, or yes + a UK VAT number (normalised `GB…`) |
| Individual / limited company | individual, or limited company + company name + number + the date the contract with the company was confirmed (checklist Part 13) |
| Start date | set |
| Own login | derived from the live account (sales role, active) — never stored |
| Team guide | a known version + date acknowledged |
| Schedule 2 (optional) | received / none listed; shows the 7-day deadline (agreement 4.2) |

**READY TO SELL = every blocking item + an active sales login + not suspended + not past an end date.**
Derived every time, never stored. It is a **display, not a lock**: no claim, call or send reads it (a
lock would change sending behaviour). Today there are no real salespeople (live, 2026-10-05: Paul + two
test sales accounts).

Cautions shown (never blocking): the agreement's clause 4.3(c) note; a draft privacy notice; the video
right-to-work caution; a check dated after the start date; VAT invoices; limited company → adviser;
leaving notes.

## 2. Privacy notice — what is outstanding

Registered as `salesperson-privacy-notice-draft-2026-10-05`, `final: false`. Before it can be issued:
ICO registration number (s1); the right-to-work provider or delete the bracket (s5); the overseas-transfer
safeguard per provider (s5); confirm 6 years for payment/commission/tax records and for the agreement (s6);
the LeadFinderOS sales/activity retention period (s6); confirm 12 months for login logs (s6); the "Last
updated" date (s9); remove the "Words in [square brackets]…" line; and sections 2–3 mention "WhatsApp
permission records / process" from the clause being amended. When Paul sends the completed notice, add a
new entry with `final: true` — that is the only way the item can complete.

## 3. Right to work

Recorded: method, date, checked by, result, evidence location/reference, provider (certified only), follow-up
due (only for time-limited permission), notes. **No passport number, copy, or date of birth is stored** —
`sensitiveTextProblem` refuses text that looks like a passport number, account number, sort code, IBAN or
date of birth in any free-text field. Methods: `video_call_original_not_held` (Paul's current process; the
checklist says it gives **no** statutory excuse unless he physically holds the original), `in_person_original`,
`certified_provider` (IDSP — the replacement Paul plans), `home_office_online` (share code). A tick here is
a record of what was done, not a legal defence.

## 4. Security

- `salesperson_onboarding` and `salesperson_onboarding_log`: RLS on, **zero policies**, every privilege
  revoked from anon and authenticated. The only reader/writer is fn `admin-users` (`team_onboarding_list`,
  `team_onboarding_save`), after its admin check. A salesperson cannot read any record — not even their own;
  the admin's browser session cannot read the table directly either.
- Every save is validated by the rule file (unknown fields refused, versions must be registered, dates
  real, cross-field rules) and backed by database CHECKs (end date ⇔ reason, VAT number ⇒ registered,
  company fields ⇒ limited company).
- The change log is append-only and server-timed (who, when, which fields, new values); admin-users logs
  field NAMES only.

## 5. TPS / CTPS

**Before this branch LeadFinderOS had no TPS or CTPS screening of any kind** — the agreement's clause
4.3(a) "(LeadFinderOS supports this)" was not true. Built: `phone_tps_checks` (genuine answers only;
provider + provider reference required by the database; service-role writes; admin reads all, sales reads
own leads), `src/lib/tpsCheck.ts` (the provider boundary `tpsRowFromAnswer` and the verdict `tpsVerdict`),
and a TPS/CTPS line on the Prospect card. **`TPS_PROVIDERS` is empty**, so every number reads "Not screened:
no TPS/CTPS checking service is connected yet". Clear needs a connected provider's "not registered" on
BOTH registers within `TPS_RECHECK_DAYS` (28). To connect one: a licensed TPS/CTPS data provider, its
secret, an edge function using `tpsRowFromAnswer`, and an entry in `TPS_PROVIDERS`. Nothing reads the
verdict to block a call.

## 6. Business type

`src/lib/businessType.ts`: limited company / LLP / sole trader / partnership / unknown. Evidence only — a
STRONG Companies House match on an ACTIVE company (labelled "not confirmed by a person"), or a person's
record via `lead_record_business_type` (sales: own leads; a note of the evidence is required; append-only;
newest wins; a disagreement with Companies House is shown). A missing match is never "sole trader".
Nothing uses it for channel permissions yet. (This partly reopens Paul's 2026-10-02 "no classification"
decision, at his request in this brief — read-only, no channel rule.)

## 7. Leavers

Recorded on the onboarding row: end date + reason (`resigned`, `ended_on_notice`, `misconduct`), note,
misconduct found later (within 6 months of the end, agreement 13.3), data-deletion confirmation (12.3).
Recording an end does **not** remove access — Disable on the Team page still does (role removed, user
banned, `team_engagement_events` 'ended'), and the panel says when the end date has passed with the login
still on. **Commission does not read any of it** (another session owns commission).

## 8. Tests

`scripts/salesperson-onboarding.test.ts`, `scripts/tps-check.test.ts`, `scripts/business-type.test.ts`
(in `npm test`); `supabase/tests/salesperson-onboarding-rls.sql` — run live 2026-10-05 with the migration
prepended inside the same rolled-back transaction: **26/26**, and a read-back afterwards showed no table,
function, fake user or borrowed lead left behind. `pre-sales-final.test.ts` lists the migration under LATER.

## 9. To ship (not done in this branch)

1. Apply the migration (additive), read back the four tables, the function, the grants and `pg_policies`.
2. Deploy fn `admin-users` only (the only edge function changed; it now imports
   `src/lib/salespersonOnboarding.ts`).
3. Then the SPA (Team page panel, Prospect card lines).
