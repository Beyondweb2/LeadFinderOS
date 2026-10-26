# Admin home redesign — audit and two concepts (2026-10-26, mockups only)

Nothing here is built, merged or deployed. The mockups are built from the dashboard's own parts (dark theme, the same
section headings, cards and row style) in `src/design-mock/AdminHomeMock.tsx`, with FAKE "Demo" businesses. The funnel
numbers are the real 14-day figures from `docs/convo-review-2026-10-26.md`; the cap, failures and team figures are made up.
The sidebar is not drawn (unchanged).

Screenshots: `dark-a-desktop.png`, `dark-a-phone.png`, `dark-b-desktop.png`, `dark-b-phone.png`.

Paul, 2026-10-26: keep today's style; **replies do not belong on the dashboard** (too many a day, they live in the Inbox).
The first white mockups were dropped.

## 1. Audit of today's admin home (`/`, `src/pages/Dashboard.tsx`)

Landing: `homeFor('admin') = '/'` (`src/lib/access.ts:52`). Data: `useAdminOverview` → fn `admin-overview` →
`_shared/admin-overview-load.ts` → `foldAdminOverview` (`src/lib/adminMetrics.ts`). That loader reads every lead, every
WhatsApp message, every `lead_activity` row and every suppression on each visit.

**The biggest problem:** "My activity: hidden" is on by default (`Dashboard.tsx:77`). In the last 30 days 92% of outbound
WhatsApps (1,237 of 1,349) were sent by an admin, so the team and insight panels below are close to empty by default.

| # | Section (file) | Shows / fed by | Live today | Verdict |
|---|---|---|---|---|
| 0 | Header + "Send to sales team" (Dashboard.tsx:112) | team composer | last team post 9 Oct | Keep header; **move** the composer to Team |
| 1 | Period + "My activity" toggle (:126) | persisted settings | hides 92% of sends | Keep the period; **remove** the toggle, or default it to included |
| 2 | Business at a glance, 4 tiles (teamControl.tsx:25) | revenue, new clients, needs-you count, commission | no ledger row since 7 Oct | **Keep** (becomes part of key numbers) |
| 3 | What needs you / Your actions (controlCentre.tsx:54) | server `attention` + `needsYouItems` (adminControl.ts:60) | reply sorter ran today; 3 urgent, 11 review in 14 d | **Keep** as the base of the new list, **minus its reply lines** |
| 4 | New sales & handoffs (teamControl.tsx:47) | fn `paid-client-hub` | 23 paid leads | **Merge** into Needs me (new client rows) |
| 5 | Clients in delivery (clientHealth.tsx:70) | clients + weekly checks | weekly column: 1 run ever (28 Sep) | **Move** to Paid Clients; weekly column stale |
| 6 | Sales team performance (teamControl.tsx:123) | team fold, earnings | Ethan 1, Stephan 2, Liz 0 sends in 14 d | **Move** to Sales dashboard; one line in key numbers |
| 7 | Payments and commission (teamControl.tsx:219) | payment ledger | 0 rows in 14 d | **Merge** into #2 (it repeats the tiles) |
| 8 | Why prospects say no (lostReasons.tsx:36) | lost reasons | mostly hidden by #1 | **Move** to an Insights page |
| 9 | WhatsApp templates (intelligence.tsx:30) | per-template replies | hidden by #1 | **Move** to Insights |
| 10 | Outreach channels (controlCentre.tsx:332) | per channel | 2 calls logged in 14 d | **Move** to Insights |
| 11 | Niches (intelligence.tsx:77) | per trade | hidden by #1 | **Move** to Insights |
| 12 | Where it is getting stuck (intelligence.tsx:162) | bottleneck checks | not checked | **Move** to Insights; a red flag may feed Needs me |
| 13 | This week in plain English (businessSummary.tsx:14) | fn `business-summary` | last 19 Oct | **Move** to Insights |
| 14 | Findable.live funnel (traffic.tsx:126) | site events; own Search Console | events live; Search Console 0 rows ever | **Move** to Insights; drop its Search Console part |
| 15 | Client websites · Google search (traffic.tsx:36) | Search Console | 0 connections; sync says `not_configured` daily | **Remove** until Google is set up |
| 16 | What LeadFinderOS is used for (intelligence.tsx:128) | feature events | last 20 Oct | **Move** to a system page |
| 17 | API & system costs (controlCentre.tsx:560) | cost RPCs, Apify | live | **Move** to `/admin/api-usage`; keep only an Apify % warning |
| 18 | Sign-ups & free checks (Dashboard.tsx:218) | fn `submissions` | 13 in 14 d | **Merge**: each submission becomes a Needs me row |
| 19 | Footer exclusion note (:229) | test-account line | — | Keep |

Old things in the code (nothing renders them): seven panels exported from `controlCentre.tsx` (SinceYesterday,
TeamComparison, FunnelPanel, CallsPanel, RevenuePanel, CommissionPanel, ContributionPanel); `useDashboardMetrics.ts`,
`dashboardTasks.ts` and `AuditFunnelCard.tsx` are unused but tied to a cross-repo sync check. The "Optimise" chip
(teamControl.tsx:77) is only right for v3/v4 clients. `SubmissionsCard.tsx:122` and `useFreeCheckProgress.ts` call
`supabase.functions.invoke` directly, not `invokeEdge` (a rulebook break; low risk, admin only). `/feedback` is still
mounted (`App.tsx:229`) although the Feedback page is dead.

## 2. The two concepts

| | A · today's page, cleaned | B · Needs you first |
|---|---|---|
| Shape | Same order as now: Business at a glance tiles → What needs you → Key numbers (funnel, sending health, team) → Questionnaires this week | What needs you and the questionnaire log on the left; funnel, sending health and money in a narrow column on the right |
| Feels like | Your current dashboard with the junk taken out | A to-do page with numbers on the side |
| Phone | One column, same order | The side column drops under the list |
| My pick | **A** (closest to what you like now) | |

Every row in both: business, kind, why, time since, one next action, and **Snooze / Dismiss / Archive**. Archive is
never a hard delete; an "Undo" toast and an "Archived (n)" view bring it back.

### What lands in "Needs me" (one row per business, most urgent wins)

Source for each is existing data; nothing new is stored for "who needs what" except the snooze/dismiss/archive marks.

| Row | Source today | Urgency |
|---|---|---|
| Questionnaire submitted, not paid, with the reason (domain blank, agency / contract, rights unticked, payment not started) | `onboarding_responses` + `domainAuthority` + `client_agreement_acceptances` | red after 24 h, escalated at 48 h |
| Failed or overdue payment | `attention` (past due, disputes) | red |
| Interested (star) and waiting on us | `is_potential_work` + last message ours/theirs (`leadState.ts`) | amber after 24 h |
| Follow-up due | Next Action due today/overdue (`nextActionView.ts`; human-set only) | blue, red when overdue |
| New client and their next onboarding step | `paid-client-hub` list, `deliveryStage`, `clientMissingInfo.ts` | blue |

Interested stays a star on the row, never a stage. **No reply or draft rows** (Inbox only); the existing reply-sorter line and its 436 rep replies leave the home page too.

## 3. One-tap template buttons

The button sends through the existing **"Send a template"** path (`useInbox.send` → `send-whatsapp-message`). Nothing is
bypassed: opt-outs, the 24-hour window, send hours (queued and says when), QA hold, Australia prospect-only, and the
queue's daily allowance all apply. A template not yet approved by Meta gets a `*_APPROVED = false` constant and its
button stays hidden until Paul switches it on (the rulebook's pending-template rule). Inside the 24-hour window the
same words could go as free text, but one path is simpler: templates everywhere.

**Templates to register (draft wording for Paul; one question each; UK only unless marked):**

| Key | When | Draft |
|---|---|---|
| `domain_help` | questionnaire stopped at the domain question | Hi {{1}}, it's Paul from Findable. I saw the website address part of the questions was left blank. Easier if I go through it with you on a quick call? |
| `agency_access` | an agency runs the site or the contract is "not sure" | Hi {{1}}, it's Paul from Findable. To get your new site live we need the domain, which {{2}} looks after. Would you like me to ask them for you? |
| `agreement_next_steps` | answers done, agreement not signed | Hi {{1}}, it's Paul from Findable. Your answers are saved. The next step is to read and sign the agreement, then the first payment. Shall I send you the link? |
| `payment_help` | agreement signed, payment not made, or a payment failed | Hi {{1}}, it's Paul from Findable. It looks like the payment didn't go through. Would it help if I sent the link again? |
| `what_we_need` | new client, onboarding item missing | Hi {{1}}, it's Paul from Findable. To start your new site I just need {{2}}. Could you send that over here? |
| `interested_follow_up` | starred, waiting on us | Hi {{1}}, it's Paul from Findable. Still keen to see what I found for your business? (UK and Australia) |
| `nudge_24h` | no movement 24 h after any of the above | Hi {{1}}, just checking you saw my last message. Anything I can help with? (UK and Australia) |
| `final_nudge` | no movement 48 h after the 24 h nudge | Hi {{1}}, I'll leave this with you for now. If you want to pick it up, just reply here and I'll help you finish. (no question; UK and Australia) |

No price figure in any of them (the rulebook: never one figure without the other; a price question gets the word-for-word
price line in a reply). No guarantee wording. No AI brand names. No sign-up link inside a template; the rep sends the
one sign-up link as today. Never to Australia: `domain_help`, `agency_access`, `agreement_next_steps`, `payment_help`,
`what_we_need`.

## 4. The questionnaire process (no client lost)

1. **Every submission becomes a row** with a next action and a due time the moment it lands (from the stop point:
   domain blank → "Send domain help", due +2 h; answers done → "Send agreement & next steps", due +2 h; agency
   "not sure" → "Send agency access").
2. **Nothing sits without one:** a row with no next action shows as red "No next step" at the top.
3. **Escalation:** 24 h with no movement → amber + "Escalated (24 h)" + the `nudge_24h` button; 48 h → red + `final_nudge`;
   after the final nudge + 48 h → "Mark outcome".
4. **Outcomes:** Paid (automatic from the payment), or Lost with a reason: price, domain / agency, timing, not the decision
   maker, went quiet, other (+ note). Recorded once, shown in the questionnaire log.
5. **Alert email:** the Domain line already says NOT ANSWERED when it is blank (fix/reply-detectors). Add one line at the top:
   "Next step: <action>, due <time>" and a link to the row (`https://app.leadfinderos.com/?row=<id>`).
6. **Payment screen:** log a "viewed agreement / payment" event so "reached payment" is measured, not guessed.

## 5. Key numbers (only these)

- Funnel, 14 days: sent, delivered, real replies, interested, questionnaire started, reached payment, paid.
- Sending health: number rating and tier, daily cap used, failures today.
- Team this week: messages and calls per person (admins included).

## 6. If chosen, build order (each a separate release)

1. Remove the "My activity" toggle default and move #5–#17 off the home page (no data change).
2. The Needs me list from existing sources, with snooze / dismiss / archive (one small table for the marks; a migration, so the full gate).
3. Template buttons for already-approved templates; new templates registered with Meta, gated until approved.
4. Questionnaire rows, escalation and outcomes; the alert email's next-step line.

## What matters
- Only #2, #3 and #4 answer "what needs me"; most of the rest is stale, empty by default, or belongs on another page.
- Concept A keeps today's look and order; every send goes through the normal sender.

## What to ignore
- The unrendered panels and unused files (cleanup, not user-facing).

## Decision needed from you
- Pick A or B.
- Approve or edit the eight template wordings.
- "My activity": default to included, or remove the toggle?
