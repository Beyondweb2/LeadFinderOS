# Salesperson Journey Certification — session A

- **Session / date:** A (salesperson journey, UX, sales quality), Sunday 04/10/2026, ~03:40–05:40 UK.
- **Release audited:** `main` at `c0e85078` (worktree `C:/Users/paulj/LeadFinderOS-wt/cert-a`, branch `cert/a-salesperson`). No product code changed, nothing deployed.
- **Account:** Test (`sales-test@leadfinder.invalid`, sales). Paul's admin account was **not** used.
- **Fixtures (README §4.2, A range):** `1a000000-0000-4000-8000-0000000000a1` ZZ QA-A1 queue opener (07700 900101) · `…a2` ZZ QA-A2 next action and call (07700 900102, website findable.live) · `…a3` ZZ QA-A3 no phone · `…a4` ZZ QA-A4 duplicate checks (07700 900104). All excluded before use.
- **Real businesses brought in from Find Leads (QA material, §6):** Calder Plumbing and Heating `7ad793ff-2442-496c-9e22-ad4b5d7abed6` (own website) · Brian Slattery Plumbers Limited `0605df63-d50a-418f-a6c6-191b501a477a` (no website, landline) · Dawson Plumbing & Heating Solutions `ae3c9517-6f9d-42bd-b1b2-60ba7ca55abe` (no website). Never queued, messaged, enriched or audited.
- **Campaign:** `TEST - PRE SALES CERTIFICATION` (`a5504d81-6ef6-488b-84fd-a198f0981bdc`), created as Test. Kept, per README §4.5.
- **Spend:** 1 fresh Places search (Plumbers, Halifax: 4 text-search calls, $0.14) · 3 Place Details on the three adds ($0.06) · 2 hook audits on A1 ($0.081 in `enrichment_usage`; Apify $27.97 → $28.05) · 1 voice-note script (gpt-4o, $0.006) · question proposals and agency/Companies House checks (free). **Total ≈ $0.29. Within every §9 cap.** The 2nd audit was not pressed by me — see A-12.
- **How screens were read:** `get_page_text` / `read_page` / `javascript_tool` and Browser-pane screenshots (rendered for me in this session). Nobody else has looked at these screens.

---

## Executive verdict

**NOT READY.** Two launch blockers, both small to fix:

1. **A Build sale can never reach a payment link through Quick Close** (A-01). Every prospect without a website — the "hot" leads Find Leads is built around — gets stuck on the last question.
2. **Every salesperson can read and send Paul's private saved texts from the Inbox "Quick reply" menu** (A-02). These include his personal AI working prompt (with his login email and account id), two live old Stripe Payment Links (£49.99 / £99), and a "£19.99 offer, eight weeks" price text.

Fix those two and the five P1s that most affect a live call (A-03, A-04, A-06, A-07, A-09). After that it is **READY WITH FIXES** for a first salesperson. Campaigns, queueing, the queue panel, Next Actions, Not interested, and the QA safety layer all held up.

---

## Journey tested (exact actions, in order)

1. **J1 Login.** Magic link (service-role `generate_link`) opened in the Browser pane → landed on `/sales-dashboard`. Read the dashboard, sidebar, bottom nav, notifications (14 unread on arrival).
2. **J2 Coverage.** Plumbers (persisted default), read 590 towns; opened Niche verdict (none for Plumbers; read Locksmiths' one). Clicked **Find leads** on Halifax (worked by Paul; 54 found before).
3. **J2/J3 Find Leads.** Results: 56 businesses, 23 without website, three pages. Read site-management ("No agency evidence · 78%" + its evidence popover), Companies House age, "Already added · Paul", "Claim lead", "Outside town". Opened the ⋯ menu (paid Enrich offered — not pressed). **Add to CRM** ×3 (Calder, Brian Slattery, Dawson); each row switched to "Yours".
4. Created fixtures A1–A4 by SQL (exclusion rows first). Read the new CRM rows field by field.
5. **J7 Outreach.** Read the list, the row pills, the lead workspace (Work / Scripts / Prospect / History) for Calder.
6. **J4 Campaign.** Outreach → **Campaigns** (top right) → **New campaign**: typed `test` (refused: "already exists"), then the real name → Leads (filters, "cannot be messaged") → selected A1 → Message (preview) → Review → **Save as draft** → detail page → **Launch**.
7. **J5–J6 Queue.** Outreach queue panel ("Your leads queued 1", send order) → **✕ Remove** → campaign showed "Launch: 1 lead is ready" → Launch → **Stop sending** (window.confirm accepted) → Launch again → **QA drill** (`process-whatsapp-queue`, `qa_drill_lead_id`=A1, outside the London window) → `sent:true, simulated:true, message_id:null`.
8. **J8 Reply.** Unsigned Meta-shaped inbound POST to `whatsapp-status` from 447700900101, `wamid.QA-A-…`, text **"Yeah it is mate, who's this?"**. Watched dashboard (no change for 15 s; changed after Refresh), Inbox (unread 1, Waiting on us 1, status Replied), notification bell (+1).
9. **J8 Inbox.** Opened the thread, Prospect, Quick reply menu (read only — nothing inserted), proposed and ran the AI check (first attempt refused `town_unverified`; see A-23), replied in free text (simulated), starred the lead.
10. **J9 Next Action.** Inbox: set "WhatsApp follow-up · Tomorrow", then changed it to "Call · Wed 7 Oct" with a note → checked Outreach and the dashboard. Outreach: set "Call · Tomorrow" on A2 → workspace **Log a contact → Not interested** → lost reason "Bad timing" → Next Action cleared everywhere.
11. **J10–J12 Audit, call script, voice note.** Read the Scripts tab on A2 (no audit) and A1 (audit, no website); **Write the script** for A1's voice note (one gpt-4o draft). Read every script variant and every objection in source (coldCallPlaybook.ts, voiceNoteScript.ts, salesStyle.ts).
12. **J13 Quick Close (A1).** Q1 Yes → No domain → No website → Build → **Yes — they confirm all three** (never saved, A-01) → closed half-way and reopened (resumed) → workaround through the same function (route + consents in one call, as Test) → **Generate £99 payment link** (unpaid live Checkout Session, never opened) → **Send on WhatsApp** (simulated) → second generate → `link_reused`.
13. **Dashboard after everything**, then phone width (375×812) on Dashboard, Outreach, Inbox, Quick Close, Campaign, Coverage, Find Leads.
14. Edge cases: duplicate campaign name, lead already in a campaign, lead with no phone, unqueue, stale campaign page, generate twice, invalid session token (API), reload after actions.
15. Cleanup (bottom of this file).

---

## P0 — Launch blockers

### A-01 — Quick Close cannot save the Build consents, so no Build sale can reach a payment link
- **Where:** `supabase/functions/quick-close/index.ts:227-230` with `src/lib/quickClose.ts:85`.
- **Reproduction:** on any lead, open Quick Close, answer each question until Website route = **Build**, then tap **Yes — they confirm all three**.
- **Expected:** "5 of 5 answered", state Ready, **Generate £99 payment link** appears.
- **Actual:** the screen briefly shows 5 of 5, then goes back to "4 of 5 answered" on question 5 with no error. I also called it as Test through the API (`mode:"save", answers:{build_consents:"yes"}`). It returned `200 ok`, but the saved answers had no `build_consents` and the gate still said `missing:["build_consents"]`. The dialog sends one answer per tap, and the server runs `cleanAnswers()` on that answer **on its own**, before merging it with the saved ones. `cleanAnswers` deletes `build_consents` whenever the same object has no `route: 'build'` (quickClose.ts:85), so the answer is thrown away. Sending `{route:"build", build_consents:"yes"}` in one call works, which confirms the cause. I used that call only to keep auditing the link step.
- **Impact:** a salesperson on the phone with a no-website prospect, or anyone choosing a new site, cannot take payment. They are stuck on a screen that silently undoes their answer. The Build route is the only route for every no-website lead.
- **Recommended fix:** clean the merged answers, not the incoming fragment: `cleanAnswers({ ...prevRaw, ...body.answers })`. Add a test that saves the seven answers **one at a time**, the way the dialog does, and expects state `ready`.

### A-02 — Paul's private saved texts are shared to every salesperson and can be sent to a prospect
- **Where:** Inbox → open conversation → **Quick reply** (`src/pages/Inbox.tsx:2396-2414`). It reads `templates` through `useTemplates()` (`src/hooks/useTemplates.ts:110-113`, no owner filter). The RLS policy `sales_select_templates` lets any `sales` role read every row owned by `book_owner_id()`.
- **Reproduction:** sign in as Test, open any open-window conversation, click **Quick reply**.
- **Actual:** 15 of Paul's rows are listed, including:
  - **"META prompt"** — Paul's full personal AI working prompt: where he lives, his boss and partner by name, Move37 internals, the repo, "**MY ACTUAL LOGIN: pauljsales455@outlook.com (auth id 9d5a7629-…)**", which email is his work Gmail, and his deploy habits.
  - **"Pricing"** — two live Stripe Payment Links: "£49.99 – RG and anyone already quoted the old price" and "£99 – everyone new".
  - **"Price"** — "normally £99 but I'm running an offer at £19.99 one off … I re-run the exact same searches at **eight weeks**".
  - "Barbers" / "Barber follow up" (dead product, "£29.99/month add-on"), "First Text – Direct" ("I help local businesses get online with simple websites"), "Small towns".
  - One click puts the text in the reply box; the send button sends it.
- **Expected:** a salesperson sees only approved, current, sales-safe snippets.
- **Impact:** a data leak of Paul's personal and account details to every rep. Also a one-click route to sending a real prospect a wrong price, or a payment link that bypasses Quick Close (no route, no agreement, no lead tie, no seller attribution). The QA guard refused this only because Test is a test account. A real rep would be live.
- **Recommended fix:**
  - Drop `sales_select_templates`, or limit it to rows explicitly flagged as shared.
  - Move "META prompt", "Pricing", "Price" and "Small towns" out of `templates` (they are notes, not replies).
  - Delete the barber and old-website rows.
  - Deactivate the two old Stripe Payment Links in Stripe.
  - Check what else `book_owner_id()` policies hand to sales.

---

## P1 — Fix before sales rollout

| ID | Stage | Finding | Where / evidence | Reproduction → actual | Impact | Recommended fix |
|---|---|---|---|---|---|---|
| A-03 | J1, J8, J16 | **Archived leads stay on the salesperson's dashboard as work to do.** | `supabase/functions/sales-performance/index.ts:102-108` reads the person's leads with no `is_archived` filter. `quick-close` `my_handoffs` (`index.ts:90-94`) has the same gap. | A brand-new Test login shows "What to do next: ZZ QA4 sales / QA3 / QA2 / QA — **Interested — not followed up · Send the sign-up link**". All four were archived two days earlier. After I archived A1 it still said "New WhatsApp reply · Waiting 32m". "Interested, untouched 4", `today.won: 1` (the archived QA12) and "Finish the handoff: ZZ QA12" (archived) are all leaks too. | A rep is told to chase leads they archived or binned, and their first impression is a to-do list of junk. | Filter `is_archived = false` in the sales-performance lead read and in `my_handoffs`. Add a fold test with an archived lead. |
| A-04 | J11, J12 | **Scripts ignore what the prospect just said.** | Call script follow-up opener: `coldCallPlaybook.ts:623-629`. Voice-note prompt: `voiceNoteScript.ts:267-297` (no conversation input; agent check confirmed no after-reply variant). | A1 replied "who's this?". The call script says "…**I messaged you on WhatsApp on 4 Oct 2026**. Thanks for getting back to me… **Quick recap:** I asked Google AI…". There was nothing to recap; it was only "is this X?". It also reads the year aloud for something sent today. The voice note never says who is calling or from where. | The rep sounds scripted on the first real exchange, and "who's this?" goes unanswered. | Pass the last inbound message and our last send into both builders. After a "who's this?"-type reply, open with "It's [name] from Findable". Drop "Quick recap" unless a pitch was actually sent. Say "earlier today / yesterday / on Tuesday", never the year. |
| A-05 | J10, J11 | **A rep-facing claim is contradicted by this lead's own audit.** | `coldCallPlaybook.ts:405` (note) and 603-611 (spoken line). | The A1 Scripts tab says "In everything we have measured, Google AI has not named a business without a website of its own — that is the conversation to have" and tells the rep to say "Without one it's much harder for AI to know what you do and where". The same audit's Google AI answer named **Brian Slattery Plumbers Limited**, which Find Leads lists as "No Website". | A prospect who knows their competitor has no site catches the rep out, and the rep loses credibility on the one fact they lead with. | Remove the absolute sentence from the rep note. Before saying it, check whether any named competitor has a website on record (Places `website`). If one has none, use a softer line. |
| A-06 | J11 | **The call screen does not give the rep the close.** | The price, guarantee and Build-vs-Optimise lines are built (`coldCallPlaybook.ts:634-668`) but never rendered. The no-audit script is at 616-619 and 767-774. | Scripts tab shows: opener → finding → "happy to explain what I'd do… Is now OK?" → 18 collapsed objections. There is no "here's what it costs / here's the guarantee / here's what happens next". With no audit, the rep is told to ring and say "I wanted to see how you come up", and the panel says "Keep the call to the AI result" when there is none. | A new rep cannot close using only this screen. Price and guarantee are hidden inside objection 13 and 14, so they will improvise. | Render a short "If they're interested" block: the offer in two spoken sentences for the route that fits this lead (the app knows if they have a website), the guarantee, then "I'll send the link now → Quick Close". For no-audit leads, make the first step **Run the check (≈1 min)**, not a call. |
| A-07 | J13 | **Quick Close never mentions the guarantee, and starts with a closing line.** | `quickClose.ts:243-253`. | "What to tell them" is shown at **question 1** and starts "That's everything I need from you for now." Neither it nor the client WhatsApp message mentions the £99 refund promise. | The strongest reassurance at the moment of payment is missing, and the rep reads an "all done" line before asking anything. | Show "What to tell them" only after the route is chosen. Add one spoken sentence: "If the number hasn't gone up at four weeks, you get the £99 back." Add the same to the client message. |
| A-08 | J13 | **The Build consents contradict an earlier "No domain" answer.** | `quickClose.ts:43-47`. | After "Do you own or control the domain? → **No domain**", question 5 asks the rep to confirm "They own or control the domain…". The only way forward is to tap "Yes — they confirm all three". | It forces a false confirmation that Paul later relies on (`dns_permission`, `authority_confirmed`). | When domain = No domain, replace consent 1 with "They'll register a domain in the business's own name" (the note already says so). |
| A-09 | J13–J14 | **The payment link is buried under the handoff form.** | `QuickCloseDialog.tsx` opens Handoff when the state is `link_generated` (agent §B2). | Phone width, reopening Quick Close after the link exists: **"Copy payment link" is 1,785 px down** (dialog scroll height 2,455 px; screen 812 px), under six handoff questions. Desktop: the link sits below the handoff and the answered questions. | "I've just sent you the link" turns into scrolling past paperwork while the customer waits. | Once a link exists, put **Payment link ready · Copy · Send on WhatsApp** first. Fold the handoff to one line ("Handoff for Paul · 4 answers left") under it. |

## P2 — Improvements (proportionate)

| ID | Stage | Finding | Evidence | Suggested fix |
|---|---|---|---|---|
| A-10 | J13 | Quick Close asks what the app already knows. On a no-website lead it still asks domain, "who manages the website" and route, though only Build is possible. The Work-tab `domain_control` / `website_control` answers are not prefilled (agent §4). "Website: not known" is shown for a lead Find Leads knows has no site. | Live A1 run. | Auto-answer (shown, editable): no website → manager = No website, route = Build. Prefill domain and manager from the Work tab. |
| A-11 | J5–J8 | The QA simulation cannot certify message-derived state. "Waiting on us", "Replied, unanswered", campaign "Messaged", "contacted" and the campaign status all count only `sent/delivered/read`. After my simulated reply, A1 stayed "Waiting 32m". The campaign said **Draft · Messaged 0 · Replied 1 · "Next: Add leads that can be messaged"** (`_campaign_counts`, `conversationState.ts:86-97`). The same "Draft" appears for a real campaign whose sends all failed. | Campaign page and Inbox after the drill. | Treat `simulated` as a real send in display folds, or have the simulation write `sent`. Word a launched campaign with no successful sends as "Launched — 0 delivered", not "Draft". |
| A-12 | J8, J10 | A second paid audit started by itself. The first-reply rule (`audit_only`) mints a fresh audit on every reply (`first-reply-audit.ts:319-336`, Paul's 20/09 decision). My manual check finished at ~04:09; the automatic one started at 04:10 (it had been retrying past the town gate). The rep saw the result flip back to "Audit running · Previous report". | `whatsapp_auto_replies` row `f92b147a…`, `audit_attempts 4`. | Skip the reply audit if a hook audit finished within the last hour on the same lead, or tell the rep "a fresh check is running because they replied". |
| A-13 | J2 | Find Leads offers sales a paid action they can't use: ⋯ → "Enrich — find email, Facebook, Instagram & WhatsApp signal (~$0.035)". The server refuses non-admins (`enrich-business/index.ts:262`, `admin_only`). | `LeadEnrichButtons.tsx:140`. | Hide it for sales. |
| A-14 | J3 | Coverage / Find Leads knowledge is lost on the way into the CRM. The Google rating and review count are stored (5.0 / 111 for Calder) but not shown in Prospect. The agency check ("No agency evidence, 6 pages, website-editor.net") and Companies House age ("6 years") are not stored on the lead. | CRM row read-back; Prospect tab. | Show rating/reviews in Prospect and Quick Close. Store the agency verdict and company age on add, and show them on the call screen ("4.9★ from 86 reviews, trading 6 years"). |
| A-15 | J4–J6 | The campaign page does not refresh. It stayed "Sending · Waiting to send 1 · Queued" for over 2 minutes after the send, with **Stop sending** still live, until I reloaded. | Campaign detail. | Refetch on focus and every 30 s while anything is queued. |
| A-16 | J4–J6 | Launch is one click with no confirmation. The "Sending" status and "Sending in the send window — nothing to do" (`campaignRules.ts:71`) show at 04:55 with the window shut until 07:00. The Review step says "a few at a time" but gives no hours. The Stop confirm reads "The 1 lead still waiting go back to how they were" (`CampaignDetail.tsx:68`). | Live. | Show "Window closed — first sends from 7am" when shut. Fix the singular. Consider a confirm on Launch from the detail page. |
| A-17 | J5 | The queue panel line starts lower-case ("the sending window is closed; it resumes from 7am UK."). `MyWhatsAppQueuePanel.tsx:103` strips "In the queue — ". | Live. | Capitalise after the strip. |
| A-18 | J1 | On a phone the dashboard leads with commission. "What to do next" starts at **1,600 px** (two screens down), after the commission ladder and team board. | 375×812 measurement. | Put What to do next / Follow-ups first; move commission below or into a tab. |
| A-19 | J8 | The dashboard does not react to a new reply until **Refresh** is pressed, although the bell updates at once. | Waited 15 s; changed only after Refresh. | Invalidate the sales-performance query on the reply notification. |
| A-20 | J8 | The Inbox thread shows no business context (trade, town, website, rating, audit headline) until **Prospect** is opened. "WARM REPLY · HOOK NOT SENT" (`warmStage.ts:33`) is internal jargon. After a free-text reply the list preview reads "You: 📄 Template", and the opener shows twice in the thread. This is the known mirror placeholder (README §5); it also happens on real **failed** sends. | Live. | One context strip under the name. Plain stage words. Hide mirror placeholders from previews. |
| A-21 | J12 | The voice note reads legal names aloud ("Brian Slattery Plumbers Limited, Bma Plumbing & Heating Ltd"). It says "i couldn't find a website for you" then asks "have you got a website at the moment, mate, or not yet?" | Generated script, A1. | Speak trading names (strip Ltd/Limited, use `greet`-style peel). End with "is that right, or have you got one somewhere I missed?" |
| A-22 | various | Stale copy: toast "Added to **My leads**" (`useOutreach.ts:801`). Find Leads "Click 👁 to view details, 📋 to save" — those icons do not exist (`LeadsTable.tsx:615,636`). Login "Sign in to find businesses without websites" (`en.json:77`). "…this lead's **claim link**" (`WhatsAppLeadControls.tsx:164`). Quick Close footer "sign-up link is still in the lead's **Scripts** tab" — it is on Work. Coverage "Breakdown not recorded". | Live + source. | Copy pass. |
| A-23 | J7, J10 | A salesperson-sourced lead with no Google place shows a red "**Google couldn't confirm the town** — Excluded from outreach and audits" badge. The audit gate exempts such leads (`create-ai-audit/index.ts:1064-1075`), but the badge (`OutreachTable.tsx:2768`) does not know that. At 1366 px the badge squeezes the business name to one letter per line. The Inbox audit error shows the raw code ("town_unverified: … Fix or confirm the town on the lead") with no control to do it. | A1 row after the first audit attempt. | Use one predicate for the badge and the gate. Strip error codes. Add "Confirm town" in the workspace. |
| A-24 | J9 | Next Action options include "Send proposal" (Findable has no proposal step). "Send information" overlaps "WhatsApp follow-up". "Wants to think about it" is offered as a **Not interested** reason. | Live lists. | Swap "Send proposal" for "Send payment link". Move "Wants to think about it" to a Next Action, not a loss. |
| A-25 | J4 | The campaign lead picker says only "cannot be messaged". It does not say why (no phone vs landline — call instead). | A3, Brian Slattery. | Say the reason. |
| A-26 | J1 | A new rep starts with 14 unread notifications, mostly about leads that have since been moved to Paul (JB7, MB & Son, "Paul SALES"). | `notifications` for Test. | Mark lead notifications read when the lead is reassigned away. |
| A-27 | J2 | Find Leads results include obvious non-prospects with no flag: national merchants (Wolseley ×2, City Plumbing, Plumbworld DIY, Halifax Plumbers Merchants, a supplies shop) and a pub (Plumbers Arms). | Halifax results. | Use `knownEntities` to flag nationals/merchants as "Not a prospect". |
| A-28 | J2 | No niche verdict exists for Plumbers (the main trade), and sales can't run one. The Locksmiths verdict is analyst language ("spreads its answers…", "55% of its sources are directories — listings drive it here, not pages. Context only.", "pitch Gemini visibility first"). | Coverage. | Give reps a one-line verdict ("Good trade to sell — most AI answers name only 2–3 local firms"). |
| A-29 | J13 | Offer wording drifts: "from **week six**" (Quick Close, Stripe line) vs "six weeks after sign-up" (summary; first charge is day 42). The client message nests brackets: "(£99 today, then £99 a month from week six (12 payments in total))". It also opens "Hi Brian Slattery Plumbers Limited". | `quickClose.ts:64,250-253`, `findableOffer.ts:486`. | One phrase ("six weeks after today"), no nested brackets, greet with the trading name. |
| A-30 | J7 | Outreach rows give no "website / no website", town or rating, so the rep cannot tell a Build prospect from an Optimise one without opening each lead. The mobile status pill truncates to "You rep." | Outreach desktop + 375 px. | Add a small website/no-website marker. Shorten the pill to "Replied (you)". |
| A-31 | — | **(For session E, observed in passing.)** Two `vault.secrets` entries are *named* with the raw anon and service-role JWTs, so anyone who lists vault secret names sees the service-role key. | Listing secret names during the queue drill. | Rename/remove those vault entries; rotate if exposure matters. |

---

## What already works well (specific)

- **The QA safety layer did its job.** Every send to a fixture was `simulated`: the opener via the drill, my free-text reply, and the payment-link WhatsApp. **0 outbound messages with a Meta id system-wide** from 03:40 to the end of the session. Find Leads would not let me act on anyone else's lead ("Already added · Paul", "Claim lead").
- **Campaign creation is genuinely simple:** Name → Leads → Message → Review, four screens, sensible defaults. The duplicate name is refused clearly ("A campaign with this name already exists. Choose a different name."). Leads with no phone or a landline are filtered out by default. A lead already in a campaign is not offered again. **Save as draft** lands on a detail page whose "Next:" line says exactly what to do ("Launch: 1 lead is ready").
- **The queue loop is solid.** Launch → the row shows Queued at once, with the campaign name under the business. The queue panel lists my leads in send order with a ✕. Remove → "Removed from the queue — It will not be sent. You can queue it again later." Stop sending → "Stopped: 1 taken out of the queue." Re-launch works. History records each step (`bulk_queued`, `details_set queue removed`).
- **Find Leads gives real decision help:** website / no website, an **honest agency check with its evidence** ("No 'website by' credit… on 6 pages checked… A machine check — not certain"), Companies House age with "Possible match" when unsure, "Outside town", "Yours" after adding, and a duplicate guard on add.
- **Next Action set / change / clear syncs everywhere that matters.** Inbox header, Outreach row and conversation list all updated in place. "Not interested" clears the Next Action, stops automatic messages, and asks why with one tap.
- **The reply arrived in the right place by itself.** Lead → Replied, Inbox unread 1 and "Waiting on us 1", the bell notification links straight to the thread, and the 24-hour window badge is correct.
- **Quick Close mechanics** (apart from A-01): it saves as you go and resumes after closing half-way. The route terms come from the offer constants and can't be edited. The link is one click. A second click reuses the link (`link_reused`). **Send on WhatsApp** works, and is refused cleanly when the window is closed.
- **The voice-note pipeline is careful:** gpt-4o with a hard evidence rule. It names only the competitors from the one search, never claims cause, bans price and links, gives a 20-second short version, and shows "Based on" provenance. The output was 65 words, plain and British.
- **No horizontal page scroll at 375 px** on any screen checked. The bottom nav works and Quick Close fits the screen width.

---

## Call script audit (every variant reachable in the normal workflow)

The script is code-built (no AI), from `buildColdCallPlaybook`. **There is no gatekeeper, voicemail or "is the owner there?" script.**

| Script / variant | Current problem | What should change |
|---|---|---|
| **Opener, first call** — "Hi, is that {callName}? It's {caller} from Findable." | Fine, but it uses the business name when `contact_name` is known. | Use the person's name when held ("Hi, is that Dave?"). |
| **Reason, AI missed them** — "I'm ringing because I asked Google AI for a plumber in Halifax and it named A, B and C, but not you." | Good, natural and specific. Three full legal names read out is a mouthful. | Speak trading names, at most two. |
| **Reason, no AI result** — "…we check what AI tools like ChatGPT and Google AI say when someone asks for a plumber in Halifax, and I wanted to see how you come up." | It admits you haven't looked, and then the panel says "Keep the call to the AI result" when there isn't one. | Make "Run the check first" the action; keep this only as a fallback. |
| **Follow-up opener** — "…I messaged you on WhatsApp on 4 Oct 2026. Thanks for getting back to me. It's easier to explain on the phone. Quick recap: …" | Reads the year; "on 4 Oct" for today; "Quick recap" of something never said; ignores the reply text. | "I messaged you earlier — you asked who I was…". Recap only if a pitch went out (A-04). |
| **Website lines, no website** — "I had a look at why you weren't coming up, and I couldn't find a website for you. Without one it's much harder for AI to know what you do and where." | Natural. The note beside it overclaims (A-05). | Keep the spoken line; fix the note. |
| **Website lines, own site with finding** (e.g. "your sitemap is pointing at a different web address…", "one of your main pages is marked not to be included in search results") | Accurate but technical. "Why it matters" sentences run 25–35 words and read as written prose ("That is set inside the page rather than anywhere a visitor would see it."). | One short "what" plus one short "so what", under 20 words. Keep the long version in "Proof". |
| **Pitch** — "We specialise in AI visibility, and I'm happy to explain what I'd do to make you more likely to be the one AI recommends. Is now OK for a couple of minutes, or shall I ring you back?" | "AI visibility" is jargon to a plumber. "Happy to explain what I'd do" is soft, and there's nothing on screen for the next minute (A-06). | "We help local trades get named when people ask AI for a plumber. Got two minutes?" Then the offer block. |
| **"See it first" line** — `If they'd rather see it first: "I'll WhatsApp you the report…"` | A stage direction inside the copyable script. | Show it as a button-adjacent hint, not script text. |
| **Missing entirely** | No gatekeeper / "owner not in", no voicemail script, no price + guarantee + close block on screen, no Build-vs-Optimise explainer on screen (built, not rendered). | Add four short blocks: gatekeeper, voicemail (≤20 s), "If they're interested" (offer + guarantee + link), "Which route" (one line each). |

## Call question audit

| Question | Current source | Verdict | Why |
|---|---|---|---|
| "Is now OK for a couple of minutes, or shall I ring you back?" | Call script pitch | **KEEP** | Changes whether you pitch now or book a call-back (and sets the Next Action). |
| "Can I run the check for you and send it over on WhatsApp?" | No-audit call script | **REWORD / AUTO-FILL** | The rep can run the check before calling. Asking permission for something done in a minute wastes the call. |
| "Can I send you the report on WhatsApp…?" / "Can I give you a quick ring once you've had a look?" | Objections ("busy", "send info") | **KEEP** | Turns a brush-off into a dated Next Action. |
| "Who controls the website?" | Work tab (`LeadCrmPanel.tsx:430`) | **AUTO-FILL then confirm** | Known in part (agency check, website on file). Ask only to confirm the agency verdict. Decides Optimise feasibility and Paul's access work. |
| "Who owns / controls the domain?" + read-aloud SALES_DOMAIN_LINE | Work tab (`:447-453`) | **REWORD, Build only** | Needed for Build, not Optimise. The read-aloud line is legalistic (see objections). |
| Services they offer / areas they serve | Prospect tab | **AUTO-FILL** | The website research already extracts services. Show it, and ask only "anything I've missed?". |
| "Do you own and control the website yourself, or is it managed by an agency?" | Voice-note CTA | **KEEP for the first note, AUTO-SKIP when known** | Good conversation starter, but asked even when `website_control` is recorded. |
| "Have you got a website at the moment, mate, or not yet?" | Voice-note CTA, no website | **REWORD** | We already know none was found. Make it "have you got one I missed?" so it confirms rather than interrogates. |
| AI-generated "useful questions" (`warmLeadResearch.ts:1068`) | Stored, never shown | **REMOVE or SHOW** | Built and paid for, then thrown away. |

## Voice-note audit

| Script / variant | Problem | Recommended direction |
|---|---|---|
| **Generated note, no website (A1, live):** "hi mate, i asked Google AI for a plumber in Halifax and it named Brian Slattery Plumbers Limited, Bma Plumbing & Heating Ltd, and Sunnybank Plumbing Services. i had a look at why you weren't coming up, and i couldn't find a website for you. i actually specialise in AI visibility for local businesses. have you got a website at the moment, mate, or not yet?" | Good length (65 words, ~27 s) and rhythm. But: (1) never says who is speaking, after the prospect literally asked "who's this?"; (2) legal names read aloud; (3) "i actually specialise in AI visibility" is the least natural line; (4) asks about a website it just said it couldn't find. | Open "hiya, it's [name] from Findable" when they asked who it was. Speak trading names. Swap the positioning line for "that's what I sort out for local trades". End with "have you got one I missed, or is that something you've not got round to?" |
| **Short version (code-built):** "hi mate, i asked {engine} for {a plumber} in {town} and it came up with A, B and C, but you didn't come up. / i specialise in AI visibility for local businesses. / quick one, have you got a website at the moment, or not yet?" | Fine as a first note. "quick one" is AI-tell filler (Paul's own house style bans it in his Rich messages). | Drop "quick one". |
| **Own-site variant** (prompt beat 3: "found something that could be holding you back: {finding}") — not generated live (cap), read from prompt and test samples | Test samples say "some of the AI search crawlers, like OAI-SearchBot and PerplexityBot, are blocked". Bot names are jargon for a voice note. | Say "the tools ChatGPT uses can't read your site" and keep bot names for the follow-up. |
| **Follow-up / after-reply voice note** | **None exists.** Every note is the cold five-beat shape, even mid-conversation. | Add a reply-aware variant: answer what they said in one line, then one point, then a question. |
| **Old fixed "voice_script" templates** ("Hey, hope you're having a good day! I came across your business…", "Most of your competitors are online now so you're probably missing out…") | Barber-era, break the house style. Admin Templates page only today, but they live in the shared `templates` table (A-02). | Delete. |

## Objection-handling audit

| Objection | Verdict | Notes |
|---|---|---|
| "What exactly do you do?" | ✅ Keep | Plain, accurate, no promise ("more likely"). |
| "I don't really understand AI visibility" | ✅ Minor | "It's simple really" is mildly patronising; drop it. |
| "We already have an SEO company" / "I already have a website guy" | ✅ Keep | Non-threatening; offers to send to their person. |
| "My agency controls the website / domain" | ⚠️ Reword | The domain line is 45 words of legal text: "…before we replace it we need to confirm that your business owns or controls the domain and is free to point it at the new site". "Your agreement with them is yours to check. I can't advise on that, and we would never ask you to break it." sounds defensive. → "No problem — we'd just need to check you own the web address. Paul looks at that before anything changes." |
| "My website is fine" | ✅ Keep | Good: "It may look fine to customers. This is about how clearly it reads to AI." |
| "I don't want a new website" | ✅ Keep | Correctly routes to Optimise. |
| "I already rank on Google" | ✅ Keep | Good distinction. |
| "Nobody uses AI for this" | ✅ Keep | Honest ("I can't tell you how many of your customers do. That's why we measure it."). |
| "We're busy enough" / "I'm too busy" | ✅ Keep | Short, gets a callback. |
| "How do you know this works?" | ⚠️ Add proof | States the refund correctly, but there is no proof line. There is one real result (ABLM 0 → 3 of 18 on Gemini) — offer it carefully as "one client, early". |
| "Can you guarantee I'll appear?" | ⚠️ Reword | "What I guarantee is the measurement, not a spot in the answer" is confusing; the measurement isn't what's guaranteed. → "Nobody can promise AI will name you. What I can promise: if the number hasn't gone up at four weeks, you get your £99 back." No overpromise either way. |
| "How much is it?" | ⚠️ Reword | Reads FINDABLE_OFFER_SUMMARY aloud: one 30-word sentence with both routes. Lead with the route that fits this lead (the app knows if they have a site): "£99 today, then £99 a month for 6 months — then it stops." Never states the total. |
| "Why is it monthly?" | ⚠️ Overpromise | "the work to get you named" and "**The monthly keeps you there**" assume an outcome. → "The monthly is a new page every month, a monthly AI check, and keeping the site right." This is the agreed monthly wording (monthly-offer memory). |
| "Why twelve months?" / "Why six months?" | ✅ Keep | Clear. |
| "Just send me the information" | ✅ Keep | Converts to a dated callback. |
| **Missing:** "£99? / that's dear", "I need to think about it", "Who are you / is this a scam?", "Can I cancel?" (minimum term!), "How long does it take?" | ❌ Add | All common on cold WhatsApp-to-call. The minimum term must be explained before payment, not discovered at checkout. |

## Quick Close audit

- **Where it is:** the outline **Quick Close** button in the lead workspace header (Outreach and Inbox → Prospect), plus dashboard cards. It's findable but quiet; it doesn't sit beside the call script where the close happens.
- **Shape:** "What we already know" → seven one-tap questions → route terms → Handoff for Paul (six required, two optional) → Generate link → Copy / Send on WhatsApp / Copy message → "After they pay, let them know".
- **Feels like:** closing for Optimise. **Paperwork** for Build: three domain/website questions the app could answer, then the consent contradiction (A-08), then the save bug (A-01), then a handoff form above the link (A-09).
- **Pricing / guarantee / structure:** route terms are correct and locked to the constants. **Guarantee absent** (A-07). "Week six" vs "six weeks" drift (A-29).
- **What happens next:** clear and honest ("Paul introduces himself after payment…", "they do not need everything today").
- **Leaving half-way:** answers persist and it resumes at the next question. "What to tell them" edits, trade and correction typing are lost (browser-only).

### Quick Close question audit

| Question | Verdict | Why Paul needs it (or not) |
|---|---|---|
| Are you authorised to make this decision for the business? | **KEEP, reword** ("Are you the owner, or does someone else sign off?") | Payment and agreement must come from someone entitled to them. |
| Do you own or control the domain name? | **AUTO-FILL** from Work tab / no-website; **KEEP for Build with a site** | Paul needs it to plan DNS for Build. Pointless for Optimise or no website. |
| Who currently manages or controls the website? | **AUTO-FILL** (agency check + `website_control` + no website) → confirm | Paul needs it for access, but the app already has a verdict. |
| Could you give Findable access to the current website if needed? | **KEEP (Optimise only)** | Decides whether Optimise is deliverable. |
| If an agency or third party manages the site, do you have the authority to replace, move or materially change it? | **KEEP (agency only), reword** shorter | Legal blocker for Build; already hidden unless agency. |
| Website route | **KEEP; AUTO-SELECT Build when no website** | It decides the money (12 vs 6 payments). |
| For the new website, can they confirm all three? | **KEEP, reword per domain answer** (A-08) | Paul relies on DNS / content permission. |
| What is their trade? | **AUTO-FILL** (only shown when blank — correct) | Drives the baseline. |
| Handoff: What are we doing? | **AUTO-FILL** (already suggested from route) | Duplicate of route. |
| Handoff: Current website situation | **AUTO-FILL** (duplicate of "who manages") | Asked twice in one dialog. |
| Handoff: What does the client want? | **KEEP** (one line) | Shapes the first pages Paul builds. |
| Handoff: Anything specifically promised? | **KEEP** | Protects delivery from rep overpromising. |
| Handoff: Why did they buy / main concern? | **REMOVE or merge** into "what they want" | Nothing downstream reads it (agent: no reader). Paul gets it in the PAID email only. |
| Handoff: Decision maker (name) | **AUTO-FILL** from contact name / Q1 | Needed to address the client; usually known. |
| Handoff: Their role | **REMOVE** | No delivery decision changes. |
| Handoff: Anything Paul needs to know? | **KEEP (optional)** | Free text for exceptions. |

## Payment-link usability

- **Clicks** (desktop, Optimise-like path with nothing pre-known): open lead → Quick Close → 5–7 taps → Generate → Copy. About 10 clicks; fine.
- **Which route to choose:** clear labels with payment counts underneath, and Optimise is greyed with a reason when there is no site. Good.
- **Is the link obvious:** yes on first generation ("PAYMENT LINK READY", big Copy). **No on reopening:** it sits under the handoff (A-09, 1,785 px down on a phone).
- **Send options:** Copy link, Send on WhatsApp (window-aware), Copy message. No email send (the rep can paste).
- **WhatsApp send** used the QA simulation: `status=simulated`, no Meta id. Text checked (A-29).
- **Pending status:** the dialog header says "Payment link generated". The dashboard action "Payment link sent — not paid yet" exists, but only one action per lead shows (`salesWorkspace.ts:293`), so it was hidden behind the (simulated-stale) "New WhatsApp reply".
- **After payment:** "After they pay, let them know" is short and honest. Not exercised (session B owns payment).
- **Verdict:** a rep could say "I've just sent you the link" on Optimise today. **Not on Build** (A-01), and not comfortably on a phone (A-09).

## Desktop / mobile

| Screen | Desktop 1366 | Phone 375 |
|---|---|---|
| Dashboard | Long but ordered; commission first | No h-scroll; **What to do next 2 screens down** (A-18) |
| Coverage | Dense table, jargon labels | No page h-scroll; table scrolls inside (637 px in 310); "Whole trade" label collides with the niche button |
| Find Leads | Good | Good; stale "👁 / 📋" hint |
| Outreach | Row with town badge squeezes name (A-23); no website marker (A-30) | Cards fine; pill truncates "You rep." |
| Campaigns | Good | Good |
| Inbox | No context strip (A-20) | Header + AI card take ~45% of the screen; ~2 messages visible |
| Call script / voice note | Long single column; 18 objections collapsed | Not separately measured (same workspace dialog, full-screen on phone) |
| Quick Close | Fits; link below the handoff | Fits width; **link 1,785 px down** (A-09) |

## State-sync findings

| Change | Outreach | Inbox | Campaign page | Dashboard | Lead popup |
|---|---|---|---|---|---|
| Launch / queue | ✅ immediate | — | ✅ | — | ✅ |
| Remove / Stop | ✅ | — | ✅ | — | ✅ |
| Opener sent (drill) | ✅ "Contacted" after reload | ✅ | ❌ stale until reload (A-15); "Messaged 0 / Draft" (A-11, simulation) | ⚠️ not counted (simulation) | ✅ |
| Prospect replied | ✅ Replied | ✅ unread, waiting | ✅ Replied 1 | ⚠️ only after Refresh (A-19) | ✅ |
| Rep replied (simulated) | ✅ "You replied" | ⚠️ still "Waiting" (A-11) | — | ⚠️ still "New WhatsApp reply" | ✅ |
| Next Action set/change | ✅ | ✅ | — | ✅ (not due, so not listed) | ✅ |
| Not interested | ✅ | — | ✅ (left the campaign's ready count) | ✅ | ✅ + lost reason |
| Archive | ✅ gone | ✅ gone | ✅ | ❌ **still listed** (A-03) | — |
| Quick Close link | — | — | — | ⚠️ hidden by one-action-per-lead | ✅ |

---

## Twelve-question matrix (README §12)

✅ good · ⚠️ finding · ❌ blocking finding · — n/a · ⏸ not tested. Columns are the README's 12 questions: 1 find, 2 next step obvious, 3 enough info, 4 no unnecessary info, 5 doesn't re-ask known, 6 harmful mistake prevented, 7 natural wording, 8 state updates everywhere, 9 admin gets what it needs, 10 permissions, 11 desktop + mobile, 12 failure gives recovery.

| Stage | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| J1 Login / dashboard | ✅ | ⚠️ A-03 | ⚠️ | ⚠️ A-18 | — | ✅ | ✅ | ⚠️ A-19 | — | ✅ | ⚠️ A-18 | ✅ |
| J2 Coverage / Find Leads | ✅ | ✅ | ⚠️ A-28 | ⚠️ jargon | — | ⚠️ A-13, A-27 | ⚠️ A-22 | — | — | ✅ | ✅ | ✅ |
| J3 Add to CRM | ✅ | ✅ | ⚠️ A-14 | ✅ | — | ✅ dedupe | ⚠️ "My leads" | ✅ | — | ✅ | ✅ | ✅ |
| J4 Campaign | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ A-16 | ⚠️ A-15 | — | ✅ | ✅ | ✅ |
| J5 Queue | ✅ | ✅ | ⚠️ A-16 | ✅ | — | ✅ guard | ⚠️ A-17 | ✅ | — | ✅ | ✅ | ✅ |
| J6 Remove / requeue | ✅ | ✅ | ✅ | ✅ | — | ✅ | ⚠️ grammar | ✅ | — | ✅ | ✅ | ✅ |
| J7 Outreach list | ✅ | ✅ | ⚠️ A-30 | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ⚠️ | ✅ |
| J8 Inbox / reply | ✅ | ✅ | ⚠️ A-20 | ⚠️ | — | ❌ A-02 | ⚠️ jargon | ⚠️ A-11, A-19 | ⏸ | ❌ A-02 | ⚠️ | ✅ |
| J9 Next Action | ✅ | ✅ | ✅ | ✅ | — | ✅ | ⚠️ A-24 | ✅ | — | ✅ | ✅ | ✅ |
| J10 Audit / findings | ✅ | ✅ | ⚠️ A-05 | ✅ | — | ⚠️ A-12 | ✅ | ⚠️ A-12 | — | ✅ | ✅ | ⚠️ A-23 |
| J11 Call workflow | ✅ | ⚠️ A-06 | ❌ A-06 | ⚠️ 18 objections | ⚠️ | ✅ | ⚠️ A-04 | ✅ | — | ✅ | ⏸ | — |
| J12 Voice note | ✅ | ✅ | ⚠️ A-04 | ✅ | ⚠️ re-asks website | ✅ evidence rules | ⚠️ A-21 | — | — | ✅ | ⏸ record | ✅ |
| J13 Quick Close (UX) | ⚠️ | ⚠️ | ⚠️ A-07 | ⚠️ A-10 | ❌ A-10 | ❌ A-08 | ⚠️ | ✅ | ⏸ (B) | ✅ | ⚠️ A-09 | ❌ A-01 silent revert |
| J14–J16 UX (link → win) | ✅ | ⚠️ A-09 | ✅ | ✅ | — | ✅ reuse | ⚠️ A-29 | ⚠️ one-action rule | ⏸ (B) | ✅ | ⚠️ A-09 | ✅ |

---

## Not tested, and why

- **Recording and sending a real voice note:** the Browser pane has no microphone. The recorder UI and server refusals were read in code only.
- **Own-website call script and voice note generated live:** this needed a third paid audit (on A2 with findable.live). The automatic reply audit used my second slot (A-12), so I stopped at the cap. These variants were assessed from source and test samples.
- **Real-send state** ("Waiting" clearing, campaign Messaged / status, dashboard contacted) cannot be certified with simulated sends (A-11).
- **Payment success, the win on the dashboard, the handoff after payment** belong to session B. Nothing was paid.
- **Expired session in the UI:** only an invalid token via the API (gateway `401 Invalid JWT`). No UI expiry test.
- **Report "Copy link" tracking:** the Browser pane blocks clipboard writes. No toast and no link event appeared, so I can't tell a failure from a blocked clipboard.
- **Niche check run:** sales cannot run one (admin only). No spend.
- **The "has not paid" questionnaire email for an unpaid Quick Close row** (code-read risk raised during recon): A1's row was 70+ minutes old at the end with `notify_sent_at` null, so it did **not** fire here.

## Cleanup check output (README §4.4, plus the three Coverage adds)

All seven records were archived through `lead_set_archived` as Test (History `archived_set` present) and phone and email cleared. Exclusion rows were kept: inserted for the three Coverage adds with reason "QA material from Coverage…". I also cleared A1's leftover Next Action so it raises no notification on 07/10.

| Business | id | archived | no contact | excluded | history `archived_set` | last status |
|---|---|---|---|---|---|---|
| Brian Slattery Plumbers Limited | 0605df63-d50a-418f-a6c6-191b501a477a | true | true | true | true | not_contacted |
| Calder Plumbing and Heating | 7ad793ff-2442-496c-9e22-ad4b5d7abed6 | true | true | true | true | not_contacted |
| Dawson Plumbing & Heating Solutions | ae3c9517-6f9d-42bd-b1b2-60ba7ca55abe | true | true | true | true | not_contacted |
| ZZ QA-A1 queue opener | 1a000000-0000-4000-8000-0000000000a1 | true | true | true | true | awaiting_reply |
| ZZ QA-A2 next action and call | 1a000000-0000-4000-8000-0000000000a2 | true | true | true | true | not_interested |
| ZZ QA-A3 no phone | 1a000000-0000-4000-8000-0000000000a3 | true | true | true | true | not_contacted |
| ZZ QA-A4 duplicate checks | 1a000000-0000-4000-8000-0000000000a4 | true | true | true | true | not_contacted |

- **Queue:** only Paul's two phone-less leads (Roof Rhino, Precision Roofers) are queued, as before. No QA lead is queued.
- **Outbound WhatsApp since 03:40 UTC:** 0 with a Meta id; 6 `simulated` (A1 only).
- **Sessions:** browser signed out through the app; API session logged out (`scope=local`, 204). `auth.sessions` for Test is empty. Local token files deleted.
- **Residue left on purpose:** the campaign `TEST - PRE SALES CERTIFICATION` (README §4.5); A1's unpaid Quick Close onboarding row `ef893fc8-…` and its Stripe Checkout Session (unpaid; Stripe expires it after 24 h; it is reachable only from an archived fixture); `voice_note_scripts` row for A1; two hook audits on A1 (`e850da94…`, `53d40201…`); the `whatsapp_auto_replies` row for A1 (terminal `audit_only`).
- **Pre-existing residue seen, not mine:** archived ZZ QA / QA2–QA4 / QA12 still drive Test's dashboard (A-03); Test still has 14 old notifications (A-26).

## Suggested launch decision

**Do not hand out salesperson logins yet.** Fix A-01 and A-02; both are small, contained changes. In the same release, rotate the two old Stripe Payment Links out of existence. Then fix A-03, A-04, A-06, A-07 and A-09, which are what a rep feels on their first real call. Re-run J13–J14 on a Build fixture to prove a link is produced one answer at a time. With those in, the system is **READY WITH FIXES**. The P2 list can follow during the first weeks of real use.
