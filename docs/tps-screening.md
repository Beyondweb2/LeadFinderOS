# TPS / CTPS screening before a call, and the sales templates (2026-11-16, branch `v1-tps-templates-callable`)

## 1. TPS / CTPS screening (built, SWITCHED OFF)

**What it does once on.** Before a real browser call to a UK number, `twilio-voice-token` asks
`supabase/functions/_shared/tps-screen.ts`:

- if this NUMBER (whichever lead it is on) has a tpsmydata answer for both the TPS and CTPS registers from the last
  `TPS_RECHECK_DAYS` (28) days, that answer is reused and nothing is charged;
- otherwise tpsmydata is asked once and the answer is stored in `public.phone_tps_checks`, one row per register;
- if it is on either register, the call is refused with **"TPS – do not call: …"** (`tps_registered`). The refusal shows in
  the same place as Do Not Contact. The call panel also shows the block before dialling (`useLeadTpsBlock`, data-testid
  `call-tps-block`). A refused call is never redialled;
- if the check fails (timeout, error, or an answer we can't read), the call is refused with "Could not check…"
  (`tps_unchecked`). It is never treated as clear. Call again is offered.

What it never does: check Irish, Malaysian or Singapore numbers (not on the UK registers), screen test-mode or QA calls (no
real call), or form part of Ready to Sell. The rules are in `src/lib/tpsCheck.ts` (`tpsCallDecision`,
`tpsMyDataAnswers`) and the tests are in `scripts/tps-check.test.ts`.

**While it is off** (today), calls work exactly as before. Nothing is read, fetched or charged.

### How Paul switches it on (you add the secrets yourself; never paste them in chat)

1. Sign up for tpsmydata pay-as-you-go and open their API page. Get your **API key** and the **address for checking one
   number** (it starts `https://`).
2. Supabase dashboard → project `ruusxpkkmwtljxxulhbq` → **Edge Functions → Secrets** (Project Settings → Edge Functions)
   → **Add new secret**, twice:
   - name `TPSMYDATA_API_KEY`, value: your tpsmydata API key;
   - name `TPSMYDATA_API_URL`, value: tpsmydata's check address (`https://…`).
3. Tell a session "TPS secrets are in". It runs the admin-only probe once (`twilio-voice-token` with `{ tps_probe: "<a
   number>" }`, which stores nothing), reads tpsmydata's real answer and confirms `tpsMyDataAnswers` reads it. If their
   format differs, the session adjusts the reader in `src/lib/tpsCheck.ts` and redeploys `twilio-voice-token`.
   **Why this step matters:** tpsmydata's response format was not public when this was built. The reader only accepts an
   explicit yes / no for both registers. Anything else refuses the call as "could not check", so a mismatch stops UK
   browser calls until it is fixed. It never lets a call through unscreened.

Both secrets must exist for screening to switch on; one alone does nothing. To switch it off again, delete either secret.

### Cost per check

| | Indicative price (not yet confirmed by a billed check) |
|---|---|
| tpsmydata pay-as-you-go | about **£5 per 1,000 checks ≈ 0.5p per check** (`TPS_INDICATIVE_PENCE_PER_CHECK`) |
| tpsmydata unlimited | about £99 / month |

A number is checked at most once every 28 days, so the cost follows the number of **distinct UK numbers called per 28
days**. 2,000 numbers ≈ £10 per 28 days on pay-as-you-go. Confirm at sign-up whether one check covers both TPS and CTPS
or counts as two. If it counts as two, double these figures.

## 2. Should the same screening apply before SMS / WhatsApp to sole traders? (advice only, not built)

**Recommendation: no, not TPS. The question for texts and WhatsApp is consent, not TPS.**

- TPS / CTPS covers **live marketing calls** only. Being off the TPS does not make a marketing text or WhatsApp message
  lawful, and being on it is not the test for them.
- Under PECR, an unsolicited marketing **text / electronic message to an "individual subscriber"** (sole traders and most
  partnerships count as individuals) generally needs their prior consent, or the soft opt-in for existing customers.
  Messages to **corporate subscribers** (limited companies, LLPs, PLCs) don't need consent, but must say who is sending and
  offer an easy opt-out, which we already do (`recordOptOut()`).
- So the risky group for cold SMS / WhatsApp is **sole traders and partnerships**, whatever their TPS status. Today
  LeadFinderOS often can't tell the legal form. `src/lib/businessType.ts` only knows it from a strong Companies House match
  or a person's record.

What I recommend, if Paul wants to tighten this (it is his call, ideally after advice):
1. Keep cold SMS / WhatsApp to leads with a **strong Companies House match to an active company** (Ltd / LLP / PLC), and
   treat "unknown legal form" as a possible sole trader.
2. Send sole traders and unknowns a call (TPS-screened) or nothing, rather than a cold text.
3. Get a short written opinion from a PECR / ICO specialist before relying on it. The project rule stays: we never write that
   cold WhatsApp is definitely lawful or unlawful (`docs/rules/messaging.md`), and nothing here was built.

## 3. Sales team templates — per role (after this change)

Both roles now use the same list in single sends (lead popup, Outreach, Inbox), the Outreach bulk queue, the lead-popup
queue and the Inbox bulk send. Before today a salesperson could queue only the four marked ★. The rules are the same for
both roles:

- **Opener** (cold): only to a never-contacted lead (`sales_queue_opener` cold branch, UK-mobile / country switch,
  `opener_contact_block`, cold guard and caps at send).
- **Follow-up**: only to a lead already in a WhatsApp conversation, never twice to the same lead, never to opted-out /
  Do Not Contact / not-interested leads, counted against the person's daily limit, and sent free when their 24-hour window
  is open.

| Template | Kind | Admin | Salesperson |
|---|---|---|---|
| initial_contact ★ | opener | ✅ | ✅ |
| initial_opener_v2 ★ | opener | ✅ | ✅ |
| initial_contact_short ★ | opener | ✅ | ✅ |
| ai_visibility_report_offer ★ | opener (report offer) | ✅ | ✅ |
| video_template | opener (audit hook) | ✅ | ✅ (new) |
| competitor_hook | opener | ✅ | ✅ (new) |
| book_call | opener | ✅ | ✅ (new) |
| initial_question | follow-up | ✅ | ✅ (new) |
| webdev_report / webdev_hook / webdev_example | follow-up | ✅ | ✅ (new) |
| polite_hook / polite_hook2 | follow-up | ✅ | ✅ (new) |
| audit_reply / audit_reply_warm | follow-up | ✅ | ✅ (new) |
| audit_followup / audit_followup_call / audit_followup_fault | follow-up | ✅ | ✅ (new) |
| ai_site_findings_v2 | follow-up | ✅ | ✅ (new) |
| onboarding_followup | follow-up | ✅ | ✅ (new) |
| contact_followup | follow-up (own no-reply lane, 3+ days after the opener) | ✅ | ✅ (new) |
| re_engage_49 | follow-up | ✅ | ✅ (new) |
| explain_offer / explain_offer_v2 | follow-up | ⛔ blocked (old price) | ⛔ blocked (old price) |

A template that Meta has not approved, or whose own gates (audit link, competitors…) fail, is still refused for both roles
by the same checks (`getTemplateSendability`, the report-offer check, the drip's template-availability read).

**Queued follow-ups now send for both roles.** Until today the drip's "already sent" guard dropped every lead that had a
prior WhatsApp, so a follow-up queued in bulk was always skipped, for Paul too. The guard now applies to cold templates
only. For a follow-up the drip instead checks "in a conversation" and "this template not already sent to this lead"
(`process-whatsapp-queue`, fenced by `scripts/sales-templates-parity.test.ts`). The SQL lists in
`supabase/migrations/20261219090000_sales_queue_every_template.sql` mirror `WHATSAPP_TEMPLATES` and `isColdOutreachTemplate`
(the same test).

## 4. Leads we can't call

`src/lib/callRules.ts` `callableVerdict` is built only from `pickCallNumber` / `browserCallMarket` / `browserCallAllowed`:

- **callable**: has a mobile or landline;
- **freephone**: only an 0800 / 03 / 084 / 087 number. Shown, warned, sorted after callable leads;
- **no_phone**: shown (on Find leads the number is looked up when the lead is added);
- **cannot**: only a 09 number, not a valid number, or a country whose calling is off. **Hidden by default** on Find
  leads and Outreach behind "N we can't call hidden · Show N we can't call". Shown leads are greyed with the reason.
  Nothing is deleted. Open next ready never offers one.

`pickCallNumber(raw, country, settings)` now skips numbers in switched-off countries. A lead with a Malaysian mobile and a
UK landline rings the landline while Malaysia is off, and `twilio-voice-token` dials the same pick. Tests:
`scripts/callable-leads.test.ts`.
