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
- `GBP_MANAGER_EMAIL` (`paul@findable.live`), one constant in both repos, synced by
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
- Step 1: "Add paul@findable.live as a manager…" (`GBP_ACCESS_COPY`, Manager = the least privilege that
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

## 8. Deploy and live QA (2026-09-28)

- **Order:** migration (read back) → edge `findable-onboarding`, `sales-performance`, `paid-client-hub`,
  `render-welcome-pack` (bundle markers read back from the Management API) → findable-site master
  `8289b1d` (`--branch=master`, account 4148056c…; findable.live's OnboardingFlow chunk carries
  `payment_status` and "Step 1 of 2", and no longer "We reply to your Google reviews" or "See your
  four-week results first") → LeadFinderOS main `80cd6443`, then `258cf840` (parallel paging).
- **Public actions, live:** `payment_status` → paid true for RG, false for an unpaid lead and for an
  unknown id; `gbp_access` refuses an unpaid lead (`unknown_onboarding`) and an unknown event;
  `sales-performance` refuses the anon key (401).
- **Sales Test (one-time link, ended with logout?scope=local, refresh refused after):** nav = Outreach,
  Inbox, Sales dashboard, Find Leads, Coverage; dashboard = own 83 leads, asking for Paul's scope
  still returns its own; no amount in any response; workspace tabs Work/Scripts/Prospect/History (no
  Client); "No answer" logged in 0.77 s; next action set → Outreach row "Follow-up 29 Sept" and the
  dialog chip at once; History shows both; status unchanged; call script "It's Test from Findable";
  Clear → row "Set Action". Phone width: the workspace fills the screen, Log a contact in the first
  screen, no sideways scroll.
- **Admin (same method):** Inbox header "Prospect"; workspace has Client; next action set in the
  Inbox → thread header "call · 1 Oct"; cleared in the Inbox → a SECOND tab's Outreach row went to
  "Set Action" in ~2.3 s without a reload; set in that Outreach tab → the Inbox thread header, the
  dialog chip and the open panel all showed it. RG's Client tab: sent 3× by WhatsApp, opened 14 Sept,
  paid, asked "before this was recorded", client says "can't get into their profile".
- **Timings (server ms inside `sales-performance` / whole call):** a salesperson 1,235–1,904 / 2.1–3.2 s;
  admin one person 1,942 / 2.1 s; admin everyone 10,279 → **4,078** after parallel paging / 4.3 s;
  admin page open to funnel ~5.8 s incl. app start. A CRM save shows its toast on the server's yes;
  the panel's "Now:" line follows the re-read (~4 s measured, the round trip plus the refetch).
- **Restored:** the 6 `lead_activity` rows and 1 `outreach_activities` row the QA wrote (Proline
  Roofers Wakefield, Florida Mortgage Firm) were deleted by id; both leads' next action is `none`.

## 9. Polish pass (2026-09-28, later)

- **Reviews wording** (welcome pack): "one of the strongest signals AI … use to decide who to
  recommend", "AI even reads the replies", "AI reads owner replies too", "the one thing that helps
  most" → reviews help customers trust you and strengthen the public evidence about a business; "we
  don't claim they decide what AI recommends". findable-site was already evidence-safe (its FAQs say
  reviews are not a direct ranking factor). Guarded in `sales-readiness.test.ts`.
- **Next action lag:** the panel waited for a full re-read (measured 4.4 s / 5.4 s). Now the chosen
  values show in the open panel at once, go out on an OPTIMISTIC notice (readers show them, nobody
  re-reads or refetches), then a confirmed notice after the server's yes; a refusal restores the panel
  and sends a plain notice so every screen re-reads the true row. Measured live as Sales: panel,
  dialog header and Outreach row 308 ms (save) / 219 ms (clear), server yes 881 / 1,052 ms.
- **The Inbox froze on every lead change:** one 6.4 s long task re-drawing all 2,201 conversation rows
  (each with a status dropdown). The list now draws 150 at a time ("Show more"; search/filters still
  cover all; the open conversation is always drawn). After: no long task; the thread header updates in
  ~1.1–1.3 s in the hidden QA pane (the pane throttles scheduling; a direct `lead_set_follow_up` is ~300 ms).
- **Visual fixes:** tabs reset to their top (Scripts opened scrolled to the bottom); empty
  contact-method badge hidden; Sales no longer sees the duplicate contact editor; the sign-up copy
  button is secondary; the call guide no longer names the admin-only Crawl site; the Inbox's duplicate
  "CRM" link removed (Prospect is the one way in); dashboard rates small and grey under each number,
  low-priority columns hidden below md, best / lowest row marked (≥10 behind it), "Contested" →
  "Unclear" in plain words, "Responded" → "Replied", funnel 3-up on a phone (326 → 216 px),
  half-width tables side by side only from xl.
- **Left alone:** the pay screen; the campaign table still scrolls ~95 px inside its card at 375 px
  (seven key columns); the "Where to focus" footnote shows even when no template line does.
