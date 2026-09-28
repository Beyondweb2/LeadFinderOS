# Sales readiness: dashboard, prospect workspace, onboarding tracking, post-payment GBP step (2026-09-28)

Paul's brief: make LeadFinderOS ready for real salespeople — fast, low-click, hard to misuse, for
high-volume calling and WhatsApp — without a second CRM. Built on branch `feat/sales-readiness`
(LeadFinderOS) and `sales-readiness` (findable-site). Migration `20260928120000_sales_readiness.sql`.

## 1. What already existed (reused, not rebuilt)

- One lead record, one set of ownership-checked CRM functions (`lead_set_follow_up`, `lead_add_note`,
  `lead_record_call`, `lead_set_stage`, `lead_mark_interested`, `sales_add_lead`…), one lead detail
  (`LeadDetailDialog`) that Outreach and the Inbox both open, `LeadCrmPanel`, `lead_activity`.
- The Cold Call Playbook (call script + voice-note tab) and the voice-note generator.
- Campaigns (`campaigns` table, `outreach_leads.campaign_id`; 19 live) and last-touch template
  attribution (`templateAttribution.ts`, `creditRepliesByTemplate`).
- Onboarding page loads: `lead_page_hits`, written by `findable-onboarding` prefill (32 rows then).
- `GBP_MANAGER_EMAIL` (`paul@move37.fun`), one constant in both repos, synced by
  `check-cross-repo-sync`; `onboarding_responses.gbp_status` (done / will_do / no_access).
- Payment: `findable-checkout` → Stripe → `stripe-webhook` (idempotent by terminal writes,
  `alreadyPaid`, a stored subscription id). No event-id table.

## 2. What was missing, and what was added

| Gap | Added |
|---|---|
| No Sales dashboard (the Dashboard is admin-only and not per person) | `/sales-dashboard` for both roles; fn `sales-performance` (service role, counts only); fold `src/lib/salesPerformance.ts` |
| A reply could not be tied to WHO sent the credited message | `creditRepliesToSends` (the same walk, with the send's index); `creditRepliesByTemplate` is now a wrapper over it — one rule |
| Nothing recorded that a sign-up link was SENT | table `onboarding_link_events` + trigger `trg_onboarding_link_sent` on `whatsapp_messages` (+ backfill: 47 sends, 38 leads); `lead_onboarding_link_event` for "copied" / "sent another way" |
| The operator's own visits counted as opens | `&preview=1` on the app's Preview and on every onboarding link inside an Inbox thread → prefill writes page `onboarding_preview` |
| The lead detail was one long scroll; scripts lived in a separate sheet | Tabs: **Work · Scripts · Prospect · History · Client** (admin); full screen on a phone |
| Call outcome was a dropdown + button; non-call contact unrecordable | `lead_log_contact(lead, channel, outcome, note)`: one tap per outcome, channel Call / LinkedIn / Email / In person / Other; + "Left voicemail", "Meeting / call booked" |
| Call script said "It's Paul from Findable" for everyone | `callerName` → the signed-in person's display name (`callerFirstName`) |
| Inbox and Outreach could drift (the Inbox listened to nothing; Sales never receives `outreach_leads` realtime) | `src/lib/leadSync.ts`: one notice after every save, one listener, cross-tab relay |
| No way to add a lead found on LinkedIn etc. | "Add a lead" (Outreach) → `sales_add_lead` (both roles) with `outreach_leads.lead_source` |
| "Payment received" showed on `?paid=1` alone; GBP instructions sat under the details button | findable-site paid screen polls `payment_status`; step 1 = GBP access with three answers; step 2 = details |
| No record of the GBP step or of Findable's confirmation | `gbp_access_requested_at`, `gbp_status_at`; checklist tick `gbp_access`; `ClientOnboardingStrip` (admin, Client tab) |

## 3. Definitions (the fold states them once; the dashboard's footer repeats them in words)

- **Scope**: leads assigned to the person now (admin: one person, or everyone). Decided server-side;
  a salesperson's `person` is ignored.
- **A send is the person's** when `sent_by_user_id` is them, or empty (the queue sent it for the
  lead's owner). A send somebody else made by hand is not theirs. ⚠️ Consequence: a lead the admin
  reassigns carries its queue history to the new owner (sender tracking began 2026-09-27).
- **Contacted**: a real WhatsApp send (`isRealSend`) that is theirs, or any logged contact (a "no
  answer" counts — it was an attempt).
- **Responded**: a human WhatsApp reply AFTER their first send (`looksAutomated` excluded), or a
  logged contact with a conversation outcome (`CONVERSATION_OUTCOMES`).
- **Interested (ever)**: star, `interested`/`price_given`/`won_pending_onboarding`, a logged
  "interested"/"meeting booked", a starred activity, or won. **Not interested (now)**: status
  `not_interested`/`opted_out` or latest outcome not_interested, and not won. They can overlap.
- **Followed up**: two or more contacts.
- **Template reply**: last touch; the reply counts for the person only when the credited send was
  theirs; "contested" = 2+ different templates with no reply between. Interested / link / opened /
  won on a template row are DOWNSTREAM: among leads whose reply that template earned.
- **Onboarding sent**: `onboarding_link_events` kind `sent` (the trigger, or "sent another way").
  A copy is `generated`, never sent. Only links carrying `?lead=` are trackable; `&q2=` re-entry
  links are excluded.
- **Onboarding opened**: a `lead_page_hits` row, page `onboarding`, at or after the first send
  (60 s slack). Previews and loads before any send never count. `openCount` = page loads; "opened"
  is yes/no. An unknown lead id writes nothing (prefill refuses it first).
- **Won**: `isPaidLead`. Sales sees a count and the business name; never an amount.
- **Period**: a lead is in the period when first contacted in it; a template row counts sends in it.
- **Not reconstructable**: opens before 2026-09-06; logged calls and who-sent-what before 2026-09-27.

## 4. Payment → GBP access

- `findable-checkout`'s `success_url` is unchanged (`…&paid=1`, no token). The webhook is untouched.
- The paid screen shows "Confirming your payment" and polls `findable-onboarding`
  `payment_status` (onboarding id from session storage, else `?lead=`) every 3 s for ~60 s; it
  READS the row the webhook wrote. Confirmed → "Payment confirmed", and `gbp_access` `shown` stamps
  `gbp_access_requested_at`. Not confirmed → "We're still confirming your payment. Please don't pay
  again." It never says paid on its own.
- Step 1: "Add paul@move37.fun as a manager…" (`GBP_ACCESS_COPY`, Manager = the least privilege that
  lets us edit the profile; owner-adds-us, never request-access), "We never ask for your Google
  password". Buttons: I've sent the invite / I can't get into my profile / I'll do it later →
  `gbp_access` (paid rows only) → `gbp_status` + `gbp_status_at`. Step 2: the existing details form.
- Three states, never merged: **asked** (`gbp_access_requested_at`), **client says** (`gbp_status`),
  **confirmed by Findable** (delivery checklist `gbp_access`, ticked by hand). Nothing verifies Google.

## 5. Review replies removed as a deliverable

Removed: the welcome pack (`welcomePackHtml.ts` — the "What you get" item, "your reviews replied to",
"We'll reply to your Google reviews for you", "your review replies"; "keep your … reviews saying the
same thing"), findable-site `MONTHLY_WORK_ITEMS` ("We reply to your Google reviews") and `OFFER_COPY`.
Kept: the client's own "Reply to every review you receive" (their action); the admin Review Replies
tool. ⚠️ **Not changeable here:** `explain_offer` / `explain_offer_v2` Meta-registered bodies still say
"your reviews replied to" — both are in `STALE_OFFER_TEMPLATES` (blocked on every path) and need
re-registering with Meta before either is used again. ⚠️ The welcome pack still says reviews are "one
of the strongest signals AI … use" — CLAUDE.md §5 lists reviews as tested NEGATIVE; that sentence
predates this work and was left for Paul.

## 6. Pay screen trim (findable-site)

Removed: "Everything above included." (under the price) and "See your four-week results first.";
"Your new website, hosting and everything above are included, with nothing extra to pay." →
"Your new website and hosting are included." Kept every term: £99 today, £99 a month, first monthly
in six weeks, card saved, 12 payments including today's, 12-month minimum, nothing after the 12th,
the guarantee, the access tick, the build ownership terms / optimise-only note, the Stripe line.

## 7. Tests

- `scripts/sales-readiness.test.ts` (in `npm test`): the fold, the link rule, sync wiring, security
  shape, Next Action, payment, GBP, deliverables. findable-site assertions run when the sibling (or
  `FINDABLE_SITE_DIR`) has the post-payment step, and say so when skipped.
- `supabase/tests/sales-readiness.sql` — 38/38 on the live schema 2026-09-28, always rolled back:
  the trigger (sent / q2 / failed→delivered / no lead), own lead allowed, Paul's / unassigned /
  another rep's refused, bad channel / outcome / source refused, copy dedupe, WhatsApp hand-log
  refused, no direct writes, self-sourced add + duplicate + no stealing, anon refused, admin sees all.
  Re-run alongside `multi-user-rls` (70), `multi-user-queue` (11), `sales-shared-workflow` (37),
  `sales-media-rls` (23), `next-action-human-only` (18) — all green the same day.
