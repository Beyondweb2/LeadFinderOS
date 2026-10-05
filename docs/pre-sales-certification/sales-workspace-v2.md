# Sales workspace v2 — simple for the salesperson, complexity in the background

- **Date:** Monday 5 October 2026. **Branch:** `feature/sales-workspace-v2`, cut from `origin/main` `07113431` (the
  production deployment record, which contains the certified release merge `c5c4a1b5`). Worktree
  `C:/Users/paulj/LeadFinderOS-wt/sales-workspace-v2`.
- Paul's brief: a rep opens a lead and immediately sees what we found, what to say, what Findable does, what to
  ask, what to record and how to close. Nothing certified was loosened (§9).

---

## 1. Campaigns — a container, not a lead source

**Creating one:** niche / trade · Call or WhatsApp · optional area · a name (a suggestion such as
"Plumbers · Halifax · Call" fills in until the person types their own) → **Create campaign**. No lead step, no
message step, no review. `src/components/campaigns/CampaignEditDialog.tsx` (the same form edits), server
`campaign_new` / `campaign_update` (migration `20261008100000_sales_workspace_v2.sql`; the owner is always the
signed-in account; names unique among live campaigns).

**Deleted:** the Name → Leads → Message → Review wizard (`CampaignWizard`, `LeadChooser`), the name-only
dialog, the admin's "Advanced settings" dialog, and the admin's direct create / update / **hard delete** in
`useCampaigns` (the hard delete cascaded `lead_claims`).

**How leads join:** Find Leads → pick the campaign in the selector → add businesses (unchanged:
`sales_add_lead` / the admin insert carry `campaign_id`). New: a business **already in the CRM** shows
"→ <campaign>" on its Find Leads row, which moves it into the selected campaign (`lead_set_campaign`). Leads can
also be moved from Outreach (bulk) and the lead's Details tab. No campaign selected → they join no campaign.

**Contact method:**
- **Call** — never sends an opener: `campaign_launch` refuses (`call_campaign`), and its card has no
  Send / Pause buttons. Leads are worked from Outreach / Check before calling / Call.
- **WhatsApp** — "Send openers (N)" runs the existing safeguarded queue (`campaign_launch` →
  `sales_queue_opener`); "Pause sending" is the existing `campaign_stop`.
- ⛔ **Membership never depends on message eligibility.** Joining reads no contact history; whether the cold
  opener may go is decided only when sending, and the reason is said (§2).

**Manage campaigns** (`/campaigns`): one card per campaign — name, niche · area, a Call / WhatsApp pill, and five
numbers in the channel's own words (`campaignStats`):

| Call campaign | WhatsApp campaign |
|---|---|
| Leads · Called · Spoke · Interested · Won | Leads · Messaged · Replied · Interested · Won |

Called = a logged call outcome; Spoke = a logged conversation outcome or an inbound reply; Won = a client
(`lead_is_client`); archived leads are not counted (`_campaign_stats`). Actions: **Open leads** (Outreach
filtered to it, `?campaign=<id>`), **Edit**, **Send openers / Pause sending** (WhatsApp only), **Delete**.
`/campaigns/<id>` (old links) now opens Outreach filtered to that campaign — the page is not a lead screen.

**Delete = archive** (`campaign_archive`): its waiting openers are paused first; the campaign row stays with
`archived_at`; its leads keep `campaign_id` and every history row; it disappears from every picker and takes no
new leads; its name can be used again. A lead in a deleted campaign reads "<name> (deleted)".

## 2. The contact-state rule — and Infinity Fit Club

**What happened (traced, not guessed).** Infinity Fit Club (`a7507a85…`) was added at 02:38 UTC on 5 Oct by the
test1 sales account, checked at 02:39 (Check before calling), and starred **Interested** at 02:40. There is no
call outcome, no logged contact, no WhatsApp message or send for the lead *or its number*, no suppression, no
campaign. In the database it was never "contacted": every input to `lead_first_contact_at` was empty, and
`sales_queue_opener` / `campaign_candidates` would both have allowed the opener.

**Where "already contacted" came from:** Find Leads. A business already in the CRM shows "In CRM" with the
tooltip **"Already contacted — manage on the Outreach page"** whenever `isFreshLead()` is false — and a lead stops
being "fresh" the moment it is starred, given a note, a Next Action, a contact method… So a merely-starred lead
was labelled "Already contacted". **The Call button did not cause it** (nothing was written). But for the
**admin**, tapping Call wrote `contact_method = 'call'`, which would produce the same false label.

**Fixed:**
- Tapping Call writes **nothing** (`OutreachTable.handleCallClick` no longer stamps `contact_method`). The popup's
  Call is a plain `tel:` link. Neither proves anyone answered.
- The Find Leads label now says what is true: "In your CRM and already being worked (status, star, note or Next
  Action) — manage it on the Outreach page" — and offers "→ <campaign>" when a campaign is selected.
- ⛔ **Only a logged CONVERSATION stops the cold opener.** `sales_queue_opener` (used by campaign launch, the
  sales bulk queue and the per-lead queue) keeps every existing reason and adds one: a logged outcome in
  `CONVERSATION_OUTCOMES` (spoke to owner, interested, call back, meeting booked, not interested, agency controls
  site) → `contacted_by_phone` (a call) or `contacted_logged` (another channel). No answer, voicemail, message
  sent, connection sent and wrong number are attempts — they never stop it. One list: SQL
  `lead_conversation_outcomes()` = `CONVERSATION_OUTCOMES` (tested), browser mirror `reachedInConversation`.
- The reason is said where the send was tried ("already contacted by phone — initial opener not queued") and,
  always visible, on the lead's Details tab under its campaign: "Already contacted by phone — initial opener not
  queued. The lead stays in this campaign." A Call campaign's lead says "Call campaign — no WhatsApp opener is
  ever sent from it."
- ⚠️ Not changed: the admin's own ad-hoc bulk queue in Outreach (a direct status update after the
  `contact_check` edge call) does not read logged calls; campaign launches do, for both roles.

## 3. The lead popup — four tabs

| Tab | What is on it |
|---|---|
| **Call** | A — **What we found**: phone / website strip; AI check "X / 6 answers named this business", who AI named, the questions and what AI said (expandable), the website findings, the report links. B — **Call script** (Call script · Voice note · LinkedIn · Email). C — **Why this matters**. D — **What Findable actually does** (+ "how do you know what's winnable?"). E — **How we build for AI visibility** (expandable) + why the website matters. F — **Questions they may ask**. Then the AI check tools (run / re-run / report / earlier checks), recent WhatsApp, and G — **Status, Log a contact, the Next Action**. A sticky bar: "Log this call" (jumps to G with Log a contact open) and Quick Close (→ the Close tab). |
| **Details** | The facts card, services and areas, Learned on the call (agency chip), **Campaign** (+ the opener note), Internal note, **Website & domain** (was "Call booked · website": the website approach, who controls the website + detail, who controls the domain), Remove from my leads, WhatsApp outreach, social profiles, More tools (find email, find socials, crawl, welcome pack, site check, preferred channel). |
| **Close** | The one close UI (`QuickClosePanel`), then — before payment only — the self-service sign-up link. |
| **History** | History only. |
| Client | Admin only, unchanged (delivery, payment, private note). |

**Header:** name · star · **Call** (`tel:`) · **WhatsApp** (icons only on a phone); the status as a read-only pill;
owner, wrong-number / agency chips, last contact. Removed from the header: Quick Close, Call script, Voice note,
More tools, the status selector (now at the bottom of Call) and **the Next Action** (⛔ ONE place: its display and
its editor are at the bottom of the Call tab; `lead_set_follow_up`'s stale-write `_expected` check is unchanged).

**The script's order** (`ColdCallPlaybook` CallFlow): 1 Open (identity first) → 2 First question → 3 What we do,
in a sentence → 4 Discuss → 5 Offer and close → 6 After they pay; "not the owner, or voicemail" folded.

**Evidence is stored data only:** the latest hook audit (`useHookVisibility`, `buildColdCallPlaybook`) and the
stored crawl. Nothing is invented; "No AI result stored" / "No website on file" are said as such.

**Inside the workspace every Quick Close button switches to the Close tab** (`QuickCloseNav`); outside it (the
Outreach row's sheet, the sales dashboard) the same panel opens in a window — one close UI, two frames.
Old links naming tabs Work / Scripts / Prospect open Call / Call / Details.

## 4. The exact sales talking points (`src/lib/salesExplainer.ts` — one source)

**Why this matters**
- "AI is already becoming a real way people find local businesses. A 2026 Yext study found 36.7% of UK consumers
  had used AI for local search in the previous month."
- "The same study found 24% had tried a new local business because of an AI recommendation."
- "Google still matters. AI is becoming another important way customers discover businesses."
- Source on screen: **Yext — 2026 UK Consumer Search Behaviours, n=600 UK consumers**
  (https://www.yext.com/blog/how-uk-consumers-navigate-local-search-in-age-of-ai, published 16 Jun 2026; checked
  2026-10-05: "36.7% of UK consumers used AI for local search in the past month"; "24% of people have tried a new
  local business because of an AI recommendation"; "UK findings based on n=600 respondents").

**What Findable actually does**
1. "We start with a discovery check: around 40 customer-style questions (more if you cover several towns), each
   asked three times on ChatGPT and Gemini, to see how AI answers them today and where the openings are."
2. "From that we choose the strongest 20: a balanced mix across your main services, your towns and the different
   ways customers ask — leaving out questions you already win every time and ones with no real local race."
3. "Then we run the formal baseline: 20 questions × 3 runs × ChatGPT + Gemini = 120 answers."
4. "Four weeks later we ask the same 20 questions again, the same way, so the before and after compare like for like."
5. "After that we keep improving the public evidence about the business each month — a new page, a monthly AI
   visibility check and adjustments as we learn — so AI has more accurate, useful ways to find and understand it."
- One line: "We measure how often AI names you on 20 real customer questions, improve the public evidence about
  your business, and measure the same questions again after four weeks."

**⚠️ Discovery — the copy was aligned with the code, not the brief's draft.** Traced: `perTownCounts`
(`_shared/baseline-discovery.ts`) asks for **40** home-town questions with no extra areas, 24 + 8 per area for up
to three areas (40–48), more for many towns, capped at **80**; `DISCOVERY_RUNS = 3` on ChatGPT and Gemini. So
"around 40" is true, with "(more if you cover several towns)". The brief's "we look for questions that appear
more winnable rather than blindly targeting everything" is **not** how the 20 are chosen: `recommendBaseline` /
`buildBalancedBaseline` choose for **balance first** (question type, service, town caps); questions already named
every time and ones with no local race are left out; opportunity only breaks ties. Point 2 says that. Two stale
code comments were noted, not changed: `auditQuestionCounts.ts:45` ("12, NOT 10") and
`create-ai-audit/index.ts:86-90` ("BASELINE_QUESTIONS (10)") — the constant is 20.

**If they ask "how do you know what's winnable?"** — fragmented results (different businesses across repeated
answers = more open; the same established businesses every time = harder); the Canterbury examples; it also
depends on whether the service genuinely matches, local relevance, how settled the answers are, competitors'
public evidence. "It shows where there's room. It doesn't guarantee we'll win any one question — the guarantee is
on the overall measured number."

**How we build for AI visibility** — the twelve bullets in the brief (crawlable pages; sitemap, robots,
canonicals; one main page per genuine service / need; service + location + evidence; internal linking; consistent
details; Organization / LocalBusiness / Breadcrumb schema; genuine claims only; local pages only with real local
information; no cloned town pages; no stuffing or AI filler; legitimate crawlers not blocked). Plus: "AI still has
to get its information from somewhere. Your website is one of the clearest places to explain exactly what you do,
where you work and why the business is credible."

Never said (tested): "AI has replaced Google", "Google is dead", "AI cannot recommend you without a website", a
ranking / winning promise, a "secret trick".

**Voice note** — the default stays short (unchanged generator). Beside it: What we do (one line), How it works
(the five points), and an optional follow-up "How does it actually work?" (~27 seconds, ends with the guarantee
headline as written).

## 5. The Close — question order and branching (`src/lib/quickClose.ts`)

1. **Authority** — "Are you authorised to make this decision for the business?" (No → no payment, as before.)
2. **What do they want for their website?** (`approach`) → the plan (prices unchanged):

| Approach | Plan | Then asks | Never asks |
|---|---|---|---|
| Improve their current website | Optimise (6) | Can Findable get access to the site / CMS? · Who manages it? | the domain |
| New site — Findable template | Build (12) | Who controls the domain? · the Build consents | current-site access |
| Rebuild / visual refresh | Build (12) | Rights to reuse content, branding, photos · the domain · consents | current-site access |
| Close recreation | Build (12) | Rights · who owns the current design / code · the domain · consents | current-site access |
| Unsure — Findable to recommend | picked explicitly | that plan's questions | — |

Website approach is also on Details → Website & domain; it is **the same stored answer**. Changing the approach
can change the plan, so it asks "Switch to …? That is N payments in total instead of M" first, exactly like a plan
change; the server refuses an unconfirmed switch (`route_change_unconfirmed`) and a plan that contradicts the
approach (`answer_not_kept`).

**Domain answers (Build):** The business controls it · An agency / provider controls it · Not sure · They do not
control it · No domain yet.

## 6. Website / domain decision tree

- **New site, no access to the old one** → irrelevant. Never asked; never a blocker. (The screenshot: "DOMAIN /
  AGENCY ISSUE — Paul review required … could not give Findable access to the current website" on a Build sale
  can no longer happen.)
- **Domain not in the business's hands** (agency / not sure / they don't control it) → **not a stop**. A note for
  Paul after payment: "Domain handoff to resolve before launch — … The site can be built and previewed; it goes
  live once they get control, an authorised provider makes the DNS change, or a different domain is agreed." The
  first Build consent is read in the true wording ("…goes live on their domain only once they — or whoever
  controls it — can authorise the change, or a different domain is agreed"); `authority_confirmed` is not set.
  Never implies Findable can take a domain over.
- **Close recreation** without the business owning BOTH the content and the design / code → still sold as Build;
  delivery planned as a visual refresh (content theirs, design an agency's) or the Findable template (rights
  unclear); a note for Paul; "Never promise an exact copy." Never a promise to copy third-party code or design.
- **Visual refresh** with rights unclear → a note: reuse only what the business owns.
- **"Paul review required"** (the payment stop) is now only **Optimise on a site we cannot get into** (no access;
  an agency site with access unsure; legacy authority "no / not sure" on an agency site), headed **"WEBSITE
  ACCESS ISSUE — Paul review required"**. Paul can still release it.
- Checkout agrees: `findable-checkout` skips the self-service domain rule for a Quick Close row its own gate has
  cleared (`mayGenerateLink`), so the new rules reach payment. Post-payment delivery checks
  (`domainAuthority`, Paid Clients) are unchanged — the domain is still resolved before go-live.

## 7. Payment / onboarding-link behaviour (traced, unchanged)

- **Before payment:** the Close tab makes the £99 Stripe link (`quick-close` → `findable-checkout`; one current
  link, 24 h session, expired links never shown as ready) — Copy / Email / WhatsApp (24-hour window). Below it,
  "Or let them do it themselves": the self-service sign-up link (findable.live onboarding — the same questions,
  the client agreement tick and the same payment page). Neither bypasses the agreement or the payment.
- **After payment:** no link for the seller. Paul sends the setup link (`?q2=`, Paid Clients) within two working
  days; the Close tab says so and shows the client setup checklist.

## 8. Tests

- **New:** `scripts/sales-workspace-v2.test.ts` — campaigns (four fields, no wizard, Find Leads assignment, Call
  never sends, membership ≠ eligibility, archive keeps leads, stats words); contact (a tap writes nothing; no
  answer never stops the opener; a conversation does; one outcome list SQL = browser; the reason is said; the
  Infinity Fit Club label gone); the Call tab (stored evidence only, order, the Yext point and source, no
  "replaced Google", 20 × 3 × 2 = 120, Discovery ~40 = the engine, balance-first wording, four-week replay, the
  AI-friendly bullets, ONE Next Action, the voice note 20–30 s); Details ("Website & domain", one stored approach);
  Close (the branching table, the screenshot case, domain handoff never blocks, Optimise access still reviews,
  recreation rights, decision-maker No, ended / paid / refunded refused, 12 / 6 / 42 days, the guarantee, stale
  links, Build consents still required, the server's flags).
- **Updated** (they pinned the old layout or the old Build-domain review, which Paul asked to change):
  quick-close, quick-close-links (+ the approach is a confirmed route change), service-route-terms,
  coverage-found-added, wave1-integration, pre-sales-final (a later migration may follow the certified ten),
  campaign-ownership, call-log-from-script, call-workspace, cold-call-playbook, outreach-workspace,
  sales-flow-reliability, sales-prospect-check, sales-shared-workflow, ui-cleanup-pass, voice-note-script,
  workspace-declutter.
- **Gate:** `npm run check` — typecheck 9 = baseline; edge syntax / names / import graph clean; build OK;
  **311 / 311 suites**.

## 9. Certified protections — unchanged

Rep isolation; 30 fresh checks / day and 20 / batch (`sales-prospect-check` untouched); prospect budget
separation; no audit sets Not interested; payment replay safety; ended-client safety
(`quickCloseClosedRefusal`); 42-day billing; Build 12 / Optimise 6; the 20 × 3 × 2 baseline; Website Build service
truth; the results-email hold; the WhatsApp webhook hold (`whatsapp-status` not deployed). Each is still pinned
by its own suite (all green).

## 10. Visual QA

A throwaway Vite harness (deleted before commit) mounted the **real** components — Manage campaigns, the
campaign form (new / edit), the lead popup's Call / Details / Close / History — with every network module mocked:
Supabase reads served from the QA fixture lead's real stored audit (ZZ QA "Dawson", excluded, 0 / 6 named), Quick
Close views computed by the real rules. Headless Edge, 1366 px and 390 px, 13 screens × 2: **no sideways scroll,
no console errors**. This session looked at the captures; **nobody else has seen them.**

| Screen | Result |
|---|---|
| Campaign creation | four fields, Call / WhatsApp choice with what each means, suggested name |
| Manage campaigns | channel pills, call vs WhatsApp stats, Send / Pause only on WhatsApp, Open leads / Edit / Delete |
| Call | evidence (0 / 6, named rivals, questions, website) → script (6 steps) → why / what / how → questions → status, log, ONE Next Action |
| Details | facts, services, campaign + opener note, Website & domain, tools |
| Close — approach | five approaches, each with its plan and payment count |
| Close — new site, no old-site access | **Ready for payment**, 4 questions, no access question, no review |
| Close — Optimise | 4 questions, no domain question, 6 payments |
| Close — domain held by an agency | consents in the pending wording; "For Paul after payment — this does not stop the sale" |
| Close — recreation, rights unclear | ready; delivered as the template; "Never promise an exact copy" |
| WhatsApp skipped after a real call | "Already contacted by phone — initial opener not queued. The lead stays in this campaign." |
| History | history only |

Fixed during QA: the contact strip repeated the AI headline and website line (now only in their sections); the
campaign auto-name dropped every "s" (a lost backslash — caught by the new test); phone header truncated the
business name (Call / WhatsApp are icons on a phone); the exact-copy note lower-cased "Findable"; the opener note
was hidden inside a folded section (now always visible).

## 11. Deployment (5 Oct 2026, 04:30–04:45 UTC)

- **Branch** `feature/sales-workspace-v2` (`1115808d` + `fcb21b7c` — the first held only the four file deletions,
  because a `git add` stopped on a deleted path; the second holds the rest; nothing partial reached `main`).
- **Merge to `main`:** `af8a930f` (`--no-ff`; `origin/main` proved unmoved at `07113431`; tree = the tested branch tip;
  `npm test` 311 / 311 on the merge).
- **SQL** `20261008100000_sales_workspace_v2.sql` applied and read back: `trade` / `area` / `archived_at` / `archived_by`;
  the name index partial (`WHERE archived_at IS NULL`); the six new functions; `sales_queue_opener` keeps every old
  reason and adds `contacted_by_phone` / `contacted_logged`; `campaign_launch` refuses `call_campaign`;
  `campaign_usable` excludes archived; the outcome list equals `CONVERSATION_OUTCOMES`; grants (browser:
  `campaign_new` / `campaign_update` / `campaign_archive` yes; `lead_reached_contact` / `_campaign_stats` no; anon no).
  A **rolled-back** probe as the Test rep: create a Call campaign → listed with method, trade and stats → launch
  refused `call_campaign` → edit → archive → gone from the list, row kept. 0 rows left afterwards. 14 leads currently
  have a logged conversation (their cold opener would now be skipped, with the reason).
- **Edge functions** (the import closure of `quickClose.ts`, `salesCrm.ts`, `leadState.ts` and `quick-close`),
  deployed from `af8a930f` before the push: **quick-close and findable-checkout together** (checkout runs the Close
  gate), stripe-webhook, paid-client-hub, sales-performance, admin-overview, business-summary, conversation-triage.
  All 8 verified in their deployed bundles (`withRoute`, "Domain handoff to resolve before launch", "WEBSITE ACCESS
  ISSUE"; the old "DOMAIN / AGENCY ISSUE — Paul review required" absent; `reachedInConversation` /
  `contacted_by_phone` in the last three). **`whatsapp-status` NOT deployed** — the Meta hold stands; no Meta or
  Move37 setting touched.
- **Operator app:** `main` → Cloudflare; new entry `index-BvU_NHwY.js` on app.leadfinderos.com and
  leadfinderos-next.pages.dev (102 chunks, 0 failures): Manage campaigns, Create campaign, What Findable actually does,
  the Yext source, Website & domain, the opener note, WEBSITE ACCESS ISSUE present; the old "Already contacted" label
  and the wizard absent.
- **Live, read-only, as the Test rep** (one-time magic link, session revoked afterwards): Manage campaigns lists its
  campaigns (older ones read "No niche set" · WhatsApp); the QA lead's popup opens with Call · Details · Close ·
  History, stored evidence first (0 / 6 named, the three rivals, no website) and the six-step script; the Close tab
  loads from the new function ("Question 1 of 2": authority, then the approach). No console errors. Nothing was
  answered, created or sent.
- **Not done live:** a payment link (Stripe) and any campaign write — covered by the rolled-back probe and the suites.

## 12. One real-contact guard for every cold opener (follow-up fix, 5 Oct 2026)

Branch `fix/outreach-whatsapp-contact-guard`, migration `20261008110000_opener_contact_guard.sql`.

**The gap §2 left open.** Campaign launches and the sales queues asked "has this prospect had a genuine
conversation?"; the admin's Outreach bulk queue and per-lead queue toggle (which write status `queued`
directly), the drip that sends them, and the one-off template send (`send-whatsapp-message`) did not — they
checked only WhatsApp history on the number. A lead someone had spoken to on the phone could be sent a cold opener.

**One rule, one function.** `opener_contact_block(lead)` → `contacted_by_phone` | `contacted_logged` | null, built
on `lead_reached_contact`, whose outcome list is `lead_conversation_outcomes()` = `CONVERSATION_OUTCOMES`
(spoke to owner, interested, call back, meeting booked, not interested, agency controls the site). Not contact:
a Call tap / `tel:` (writes nothing), no answer, voicemail, opening the lead, the Interested star on its own.
Server-only (service role). Every cold-opener door now asks it:

| Door | How |
|---|---|
| Campaign launch, the sales bulk queue, the sales per-lead queue | `sales_queue_opener` → `opener_contact_block` (re-created; its other reasons unchanged) |
| The admin's Outreach bulk queue | `contact_check` (+ `lead_ids`) → `opener_contact_blocks`; those leads are not queued: "N not queued — already contacted by phone — initial opener not queued." |
| The admin's per-lead queue toggle | the same `contact_check` before queueing; fails closed |
| The drip, at send time (the enforcement for every way a lead reaches the queue) | `opener_contact_block`; a hit leaves the queue exactly as before it was queued (previous status, `queued_at` cleared, delivery status says why); unreadable → nothing sent, nothing changed |
| The one-off template send (Inbox, bulk Inbox) | `send-whatsapp-message` → `opener_contact_block`; refused with the reason; **not** overridable by `allow_resend` (that flag confirms repeating a pitch) |

**Only COLD templates are guarded** (`isColdOutreachTemplate`: `initial_contact`, `initial_opener_v2`,
`video_template`, `competitor_hook`, `book_call` and anything unknown). Continuations — `audit_reply`,
`audit_reply_warm`, `audit_followup*`, `explain_offer*`, `report_followup`, `contact_followup`,
`onboarding_followup`, `re_engage_49` — and free-form replies in an open 24-hour window never reach it, so an
engaged prospect can always be messaged (the call script's "I'll WhatsApp you the report" goes as a continuation).

Nothing else about a refused lead changes: it stays in the CRM and its campaign, its status is what it was before
queueing, no Next Action is created. A salesperson asking `contact_check` is answered only for their own leads.

Tests: `scripts/opener-contact-guard.test.ts` (each outcome; the star; the tap; one list; every door calls the one
function; fail-closed; the wording; the untouched fields; continuations and free-form exempt) + `pre-sales-final`
(the later-migration list). Gate: 312 / 312.

**Deployed 5 Oct 2026** (fix `fe68f1a0`, merge `9f8451c6` to `main`):
- **SQL first:** migration applied alone and read back. Both functions exist; `sales_queue_opener` calls
  `opener_contact_block(v_id)` and no longer reads `lead_reached_contact` inline; execute is granted to
  `service_role` only (not `authenticated` or `anon`). Rolled-back live probe on a Test-rep QA lead: no answer,
  voicemail and the star on its own → null; each of the six conversation outcomes → `contacted_by_phone` (the
  batch form agrees); an email conversation → `contacted_logged`; the lead's status, campaign and Next Action
  were unchanged; nothing was left behind. 14 live leads are currently guarded; Infinity Fit Club is not one of them.
- **Edge:** `process-whatsapp-queue` (body markers `opener_contact_blocks`, `THE REAL-CONTACT GUARD AT SEND TIME`,
  `contact_guard_unreadable`) and `send-whatsapp-message` (OPTIONS `x-swm-build: 2026-10-05a-contact-guard`).
  `whatsapp-status` was **not** deployed; no WhatsApp credentials were touched.
- **Live refusal, QA data only:** a Test-salesperson session asked `contact_check` about three leads: its
  own QA lead with a logged call got `contacted_by_phone`; its own lead with no conversation got nothing; a
  guarded lead owned by someone else was not answered (own-leads scoping). The session was revoked afterwards.
  Nothing was queued or sent.
- **SPA:** `app.leadfinderos.com` and `leadfinderos-next.pages.dev` serve the new build. The Outreach chunk
  carries " not queued — " and the per-lead control carries "Could not check the contact history, so nothing
  was queued" plus `lead_ids:[`. Nobody has seen the dialog on screen.
