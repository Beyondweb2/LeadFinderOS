# 03 — The salesperson's workflow (live)

*Live since Sales workspace v2 (2026-10-05, merge `af8a930f`) on top of the certified pre-sales release (`c5c4a1b5`).
Records: `docs/pre-sales-certification/sales-workspace-v2.md`, `fixes-05-call-workspace.md`, `fixes-07-sales-bulk-audit.md`,
`docs/multi-user.md`, `docs/lead-state-model.md`.*

## The flow

```
Find Leads
  → select a campaign if desired ("Adding to")
  → add to CRM
  → Outreach: tick leads → "Check before calling"
  → open the next ready lead → Call tab
  → call (phone's own dialler) → log the outcome
  → one Next Action  — or —  Close (Quick Close → payment link)
```

A salesperson's menu (`SALES_NAV_ORDER`): **Sales dashboard** (their landing page) → Outreach → WhatsApp (the Inbox) →
Find Leads; Coverage under More. They can open only `/sales-dashboard`, `/outreach`, `/campaigns`, `/inbox`,
`/find-leads`, `/coverage` (+ redirects) — `src/lib/access.ts`. Everything else is admin-only by default.

## 1. Find Leads (`/find-leads`, `src/pages/Index.tsx`)

- Search Google Places by trade + town. Each result shows website status, an **agency check** (who runs their site — a
  polite crawl, never a browser disguise) and, for no-website results, **business age** from Companies House.
- Pick a campaign in **"Adding to"** (top right) — or none. Add the businesses you want; a salesperson's adds go through
  `sales_add_lead` (Place Details fetched first so the phone number is real).
- A business already in the CRM shows "In your CRM and already being worked…" and, when a campaign is selected,
  "→ <campaign>" to move it in. A website match on add is a WARNING, never a refusal (chains share domains).
- Rule: a lead's country comes from Google's address, never a form choice.

## 2. Check before calling (Outreach, sales only)

- Tick leads → **"Check before calling (N)"**. A dialog says: research only, nothing is sent; recent results reused free;
  checks left today; leads that can't be checked are skipped with a reason.
- Limits: **30 fresh checks per rep per rolling 24 h, 20 per batch**, cached results (<14 days) free — see
  `08-COSTS-BUDGETS-LIMITS.md`.
- One check = 3 customer questions × ChatGPT + Google AI × 1 run (the hook audit) + a free website crawl.
- A panel shows Waiting / Checking / Ready / Failed / Skipped with the call screen's own one-line result ("Google AI did not
  name them — it named X and Y"). **"Open the next ready lead"** opens the lead on its Call tab.
- ⛔ A check never sends anything, never sets Interested / Not interested, never writes a Next Action. **No audit result
  ever changes a lead's status** (Paul, 2026-10-04). A 6/6 result reads "Strong AI visibility — named in all 6 answers".

## 3. The lead popup — four tabs (`src/components/LeadDetailDialog.tsx`)

Header: name · gold star (Interested) · **Call** (`tel:` — writes nothing) · **WhatsApp**; a read-only status pill; owner;
wrong-number / agency chips; last contact. ⛔ The Next Action is NOT in the header — it lives at the bottom of Call.

### CALL — evidence first

- **A. What we found** — phone / website strip; the AI check "X / 6 answers named this business", who AI named instead, the
  questions and what AI said (expandable), the website findings, report links. **Stored data only** — "No AI result stored"
  / "No website on file" are said as such; nothing invented.
- **Audit / crawl tools** — run / re-run the AI check, open the report, earlier checks.
- **B. Call script** (Call script · Voice note · LinkedIn · Email): 1 Open (identity first: "Hi, is that …? It's <name>
  from Findable.") → 2 First question → 3 What we do, in a sentence → 4 Discuss → 5 Offer and close → 6 After they pay;
  "not the owner, or voicemail" folded.
- **C. Why this matters** — sourced: Yext 2026 UK study (n=600): 36.7% of UK consumers used AI for local search in the past
  month; 24% tried a new local business because of an AI recommendation; Google still matters.
- **D. What Findable actually does** — Discovery (~40 questions, more for several towns, × 3 on ChatGPT and Gemini) → the
  strongest 20 chosen for balance → baseline 20 × 3 × 2 = 120 → same 20 again after four weeks → monthly improvements.
  Plus "how do you know what's winnable?" (fragmented results = more open; it shows where there's room, it doesn't guarantee
  any one question — the guarantee is on the overall number).
- **E. How we build for AI visibility / AI-friendly website talking points** — crawlable pages; sitemap, robots,
  canonicals; one main page per genuine service / need; service + location + evidence; internal links; consistent details;
  Organization / LocalBusiness / Breadcrumb schema; genuine claims only; real local information only; no cloned town
  pages; no stuffing or AI filler; legitimate crawlers not blocked. "Your website is one of the clearest places to explain
  exactly what you do, where you work and why the business is credible."
- **F. Questions they may ask**.
- **G. Status, Log a contact, the ONE Next Action.**
- Sticky bar: **Log this call** (jumps to G) and **Quick Close** (switches to the Close tab).
- All talking points come from ONE source: `src/lib/salesExplainer.ts`. Never said (tested): "AI has replaced Google",
  "Google is dead", "AI cannot recommend you without a website", any ranking/winning promise, a "secret trick".

**Logging an outcome** (`CALL_OUTCOMES`): No answer · Left voicemail · Sent, no reply yet · Connection request sent ·
Spoke to owner · Interested · Call back · Meeting / call booked · Not interested · Wrong number. "Not interested" asks why
(nine reasons, `lostReason.ts`). The outcome's follow-on comes from `outcomePlan` / `suggestNextAction`, carried out only by
`src/lib/leadOutcome.ts`. Call back / Meeting booked save a real Next Action.

**The ONE Next Action** — human-set only (no automation may write it); four choices (`NEXT_ACTION_OPTIONS`); drawn
everywhere by `NextActionPill` (red overdue / amber today / grey later). A meeting time is mirrored into `call_booked_at`
only by `lead_set_follow_up`. A stale write is refused (`_expected` check).

**The sales state is derived, never stored** (`salesStateOf`): New / Contacted / Replied / Interested / Meeting booked /
Won / Client / Not interested / Wrong number. `outreach_leads.status` stays the WhatsApp pipeline. One solid status pill per
row; Interested is the gold star, never a pill.

### DETAILS

The facts card; **services and areas** (recorded on the LEAD via `lead_set_profile` — never a copy of onboarding, which
outranks it); Learned on the call (agency chip); **Campaign** (+ the opener note, always visible); Internal note;
**Website & domain** (the website approach, who controls the website + detail, who controls the domain — the same stored
answer the Close uses); Remove from my leads; WhatsApp outreach; social profiles; More tools (find email, find socials,
crawl, welcome pack, site check, preferred channel). Internal information is never shown to clients.

### CLOSE

The one close UI (`QuickClosePanel`, `src/lib/quickClose.ts`, fn `quick-close`):

1. **Authority** — "Are you authorised to make this decision for the business?" (No → no payment.)
2. **Website approach** → the plan:

| Approach | Plan | Then asks | Never asks |
|---|---|---|---|
| **Improve current site** (`improve`) | Optimise (6 payments) | Can Findable get access to the site / CMS? · Who manages it? | the domain |
| **New Findable template** (`new_template`) | Build (12) | Who controls the domain? · the Build consents | current-site access |
| **Visual rebuild** (`refresh`) | Build (12) | Rights to reuse content, branding, photos · the domain · consents | current-site access |
| **Close recreation** (`recreation`) | Build (12) | Rights · who owns the current design / code · the domain · consents | current-site access |
| **Unsure** (`unsure`) | chosen explicitly | that plan's questions | — |

3. The Build / Optimise terms (12 or 6 payments, 42-day start, the guarantee line) → **Generate £99 link** (`quick-close` →
   the existing `findable-checkout`; one current link, 24 h; expired links never shown as ready; Copy / Email / WhatsApp
   within the 24-hour window). Below it, before payment only: the self-service sign-up link (findable.live onboarding — the
   same questions, the client agreement tick and the same payment page).
4. **After payment:** no link for the seller. "Paid — your part is done"; Paul makes first contact and sends the setup link
   (see `06-PAYMENTS-CLIENTS-DELIVERY.md`). The seller can still save the sales handoff.

Changing the approach can change the plan, so it asks "Switch to …? That is N payments in total instead of M" first; the
server refuses an unconfirmed switch (`route_change_unconfirmed`). Quick Close is pre-payment only and refuses any lead with
money, a paid-or-beyond status, refunded or ended (`quickCloseClosedRefusal`).

### HISTORY

History only — every logged contact, state change, audit, link event. Moving a lead never moves its history.

(Admins also see a fifth **Client** tab: delivery, payment, private note.)

## Domain vs CMS access — two different things

- **CMS / site access** = can Findable log into their current website to change it. **Only matters for Optimise** (we
  improve their existing site). Optimise on a site we cannot get into is the ONLY "Paul review required" payment stop:
  heading **"WEBSITE ACCESS ISSUE — Paul review required"** (no access; agency site with access unsure; legacy authority
  no / not sure). Paul can release it.
- **Domain control** = who can point the web address (e.g. `theirbusiness.co.uk`) at a new site. **Only matters for Build**,
  and only at **launch**. Answers: the business controls it · an agency / provider controls it · not sure · they do not
  control it · no domain yet. Anything other than "the business controls it" is a **non-blocking flag** for Paul after
  payment: "Domain handoff to resolve before launch" — the site can be built and previewed; it goes live once they get
  control, an authorised provider makes the DNS change, or a different domain is agreed. Never implies Findable can take a
  domain over.
- A **new site never asks for (or is blocked by) old-site access**. Plain Optimise never asks about the domain.
- **Close recreation** without the business owning both content and design/code is still sold as Build but delivered as a
  visual refresh or the template, with a note for Paul: "Never promise an exact copy." Never copy third-party code or design.

## Salesperson boundaries (enforced on the server, not just the screen)

A salesperson sees **only leads assigned to them** (`sales_leads` view; never `outreach_leads`, which holds money columns),
writes only through role-checked functions, never sees costs or other reps' campaigns, has no CSV export, and cannot run the
admin bulk audit. See `07-SECURITY-AND-PERMISSIONS.md`.

## Calling

Calls use the **phone's native dialler** (`tel:` links) — a business SIM or eSIM. Integrated in-app calling is optional
future work, not built.
