# UI / workflow cleanup pass (2026-09-29)

Paul's brief: *"Everything on screen should either help me or Sales take an action, show useful
information, or show the result/state of an action."* Less UI, clearer state, fewer dead controls.
Branch `feat/ui-cleanup-pass`. Tests: `scripts/ui-cleanup-pass.test.ts` (+ the pinned suites updated).

## 1. What changed

| Area | Change |
|---|---|
| Admin dashboard (`src/pages/Dashboard.tsx`) | Rebuilt on the Sales dashboard's surfaces (`salesDash/ui`, `sections`). 4 KPIs (paying clients · replies waiting · follow-ups due · interested), whole-book Next best actions + Follow-up queue (`sales-performance`, person `all`), "Needs you" (derived deliver / chase / quoted / fix-trades only), Waiting on a reply, Clients, Free checks + Submissions, Team activity, Audit funnel folded. |
| Removed from Admin dashboard | TipBar (old web-design tips), Channel performance (hard-coded "none" channels; Sales has Channels), 21-row PipelineCard (Sales has Pipeline), per-campaign funnels (Sales has Campaigns), Admin zone (4 links to deleted routes, multi-tenant user table with hard delete, vanity totals), Quick links + "Go to Outreach", "Clear all stored tasks". Files deleted: TipBar, AdminZone, CampaignStatsCard/Section, ChannelPerformanceCard, PipelineCard, useCampaignStats. API usage kept as a footer link (it was only reachable from the Admin zone). |
| Lead popup header | Status · ⭐ Interested (when starred) · channel; **state strip**: owner (admin reassigns here), Next Action pill (tap → Work), Call booked (UK time), Agency runs the site; **Last contact** line (channel · outcome · when · who · note, red for wrong number / not interested). Contact + tools line: phone, email (or Find email), Call script, Voice note, Crawl, Welcome pack, Site check. |
| Removed from popup | Playbook pill; the dead next-action / custom-action / status-select / mark-lost code (localStorage `leadfinder_track_action_*`, a custom-action dialog that could never open); the separate History "Activity" card (merged into the one timeline). Owner moved from the Work tab to the header. |
| Outcome buttons | See §3. |
| Next Action | One display (`nextActionView` + `NextActionPill`) in the popup, Inbox list + header, Outreach cell, Focus Mode. One option list (the popup's four). Device-only custom labels deleted (`useCustomNextActions`, `NextActionBadge`). |
| Template hover preview | Deleted (`useTemplateHover`, `TemplateWordingInList`). Every picker: names only; the chosen template shows ONE line (`TemplateSnippet`); full wording only on Preview — the Inbox's dry run, elsewhere `TemplatePreviewButton`. |
| Find email (Paul, mid-pass) | `FindEmailButton` beside every email option when there is none (popup header, Prospect facts, Focus, Inbox header). Migration `20260929180000_lead_find_email.sql` (applied live, read back): `lead_find_email` looks in our records — the lead's crawl `siteInfo.email` (157 of 291 crawls held one, none copied), its questionnaire, the same business on another row (place id / phone digits); then the browser runs the free `extract-email` scrape and saves through `lead_set_email`. Both role + ownership checked, both only fill a blank email, both write a `details_set` activity row. |
| Inbox | Next Action pill on list rows and header; "Follow-up due" chip no longer repeats it; Cold Call Playbook icon and Welcome pack icon removed from the header (both in the Prospect workspace); the admin "When a prospect replies" control wraps on phones (it overflowed 44 px at 375 px). |
| Outreach | Call menu (Normal Call + "WhatsApp thread", a duplicate of the green button) → one tap-to-call; the "Interested" filter matched `status = 'interested'`, which is never written (Interested is the star) — now the star; mobile enrich buttons gated on `perms.enrichLeads` like desktop; bulk Set Action uses the one list. |
| Playbook | Entry points removed: popup pill, delivery-cockpit link, AI Audit menu item, audit-list "Delivery checklist". **Kept:** the paid-client hub's "3. Action Plan" step (a numbered delivery step — Paul to decide). Route `/playbook/:id`, `usePlaybook`, `buildPlaybook`, `playbook-evidence`, `check-directory-listings` (imports `norm` from buildPlaybook) untouched. |
| Paid-client hub | Two permanently disabled buttons turned into text ("Directory catalogue integration", "Runs automatically when due"). |

## 2. Interaction audit (the controls that mattered)

| Control | Page | Role | Action | Stored state | Where visible | Decision |
|---|---|---|---|---|---|---|
| Playbook pill | Popup header | Admin | Link to `/playbook/:leadId` (degraded, audit-less) | — | — | REMOVE |
| Playbook link | Popup Client tab cockpit | Admin | `/playbook/:auditId` | — | — | REMOVE |
| Playbook / Delivery checklist | AI Audit menu, audit list | Admin | link | — | — | REMOVE |
| Action Plan | Paid-client hub | Admin | link | — | — | KEEP (decision) |
| Template hover box | Inbox, WhatsApp card, bulk queue | Both | none (display on hover) | — | — | REMOVE |
| Always-on full wording under picker | Same three | Both | none | — | — | MERGE → one-line snippet + Preview |
| Preview (dry run) | Inbox | Both | `send-whatsapp-message` dry_run | — | inline result | KEEP |
| Next action (Work tab) | Popup, Focus | Both | `lead_set_follow_up` | next_action/date/note | was: only a line in the Work tab | FIX → header pill, Inbox, Outreach, Focus |
| Next Action cell | Outreach | Both | `updateNextAction` / sales → `lead_set_follow_up` | next_action/date (+ localStorage label) | the cell | FIX (one list, one wording, no local labels) |
| Add custom action | Outreach cell | Both | localStorage only, saved as `follow_up` | device only | this browser only | REMOVE |
| Custom action dialog + track-action state | Popup | Both | unreachable | localStorage | nowhere | REMOVE |
| No answer / Left voicemail / Sent no reply / Spoke to owner | Popup, Focus | Both | `lead_log_contact` | lead_activity | was History only | FIX → Last contact line |
| Interested (outcome) | Popup, Focus | Both | activity; dashboard counted it as interested but the lead did not show it | + star | status pill ⭐, Inbox star, Last contact | FIX (also stars) |
| Meeting / call booked | Popup, Focus | Both | activity | + asks when → call_booked_at; + star | Call booked pill, Last contact | FIX |
| Call back | Popup, Focus | Both | activity | pre-selects Call in Next action (person saves) | Next Action pill after save | FIX |
| Not interested (outcome) | Popup, Focus | Both | activity; dashboard read it, the lead did not | + status not_interested (sales: archived, as the status menu does) | status pill, Last contact (red) | FIX |
| Wrong number | Popup, Focus | Both | activity | — | Last contact (red, warning icon) | FIX (visible); stopping WhatsApp → Paul |
| Agency controls site (outcome) | Popup, Focus | Both | activity | + website_control = agency_controls | "Agency runs the site" pill | FIX |
| Who controls the website / call booked fields | Popup Work tab | Both | lead_set_website_control / lead_set_call_booked | columns | now in the header too | KEEP |
| Owner picker | Popup Work tab, Inbox header | Admin (sales read-only) | assign_lead | assigned_to_user_id | header | MOVE to the popup header |
| Activity card | Popup History | Both | read of outreach_activities | — | second list | MERGE into the one timeline |
| Cold Call Playbook icon | Inbox header | Both | opens the call script | — | duplicate of popup Scripts tab | REMOVE |
| Welcome pack icon | Inbox header | Admin | PDF | — | duplicate of popup header | REMOVE |
| Next-action pill + "Follow-up due" chip | Inbox header/list | Both | display | — | said the same thing twice | MERGE → one pill |
| Call menu "WhatsApp thread" | Outreach row | Both | same as green WhatsApp button | — | — | MERGE → tap-to-call icon |
| Interested filter | Outreach | Both | filtered on a status never written | — | showed only legacy rows | FIX (the star) |
| Enrich buttons on mobile | Outreach mobile card | were shown to Sales | enrich-business | — | — | FIX (admin only, like desktop) |
| Disabled "Directory catalogue integration" / "Runs automatically when due" | Paid-client hub | Admin | none, ever | — | — | REMOVE / text |
| Dashboard Clear / Clear all stored tasks | Admin dashboard | Admin | next_action → none | — | — | REMOVE (cleared on the lead) |
| Dashboard Dismiss (close lead) | Admin dashboard Needs you | Admin | status closed | status | lead leaves the list | KEEP |
| Admin zone user delete / bulk delete | Admin dashboard | Admin | admin-users delete_user | auth users | — | REMOVE (Team page manages people) |

Kept although it looked unnecessary: the Audit funnel (folded) — its pitch stage and founder places
exist nowhere else; Questionnaire submissions — lead-less submissions never become tasks; Free check
progress — "where has my test got to"; the Remove-from-my-leads card (Sales) — the only non-bulk way.

## 3. What each outcome button does now

All log a `lead_activity` row (`lead_log_contact`, unchanged: activity only) and show as **Last
contact** at the top of the popup and in History. The rule for the lead-state follow-on is ONE function,
`outcomeStatusEffect` (src/lib/salesCrm.ts), shared by the popup and Focus Mode; a client or a won lead
is never touched.

| Button | Also does |
|---|---|
| No answer, Left voicemail, Sent no reply yet, Spoke to owner | nothing else |
| Interested | the Interested star (unless already starred) |
| Call back | pre-selects "Call" in Next action and scrolls to it; the person picks the day and saves |
| Meeting / call booked | the star, and an inline "When is the call / meeting?" → Call booked |
| Not interested | status Not interested (Sales: archived, exactly as the status menu does) |
| Wrong number | nothing else — shown red on the Last contact line |
| Agency controls site | "Who controls the website?" = An agency controls it → "Agency runs the site" in the header |

## 4. Verification (2026-09-29)

Local production build of the branch, signed in as the admin account (magic link, logged out after),
live data. Test writes only on **JB7 Plumbing and Heating Limited** (assigned to the test1 account):
every outcome pressed, Next Action saved / edited (with note) / cleared, meeting time saved and cleared,
status set Not interested → New, Find email (records empty → website scrape found and saved
`queries@jbplumbing.co.uk`). Left on that lead: the activity rows, the email, website_control =
agency_controls. Reload → every state persisted; the Outreach row read "Call · Fri 2 Oct".
Inbox pills checked with next actions injected into the page's own responses in memory (no writes):
Overdue red, Today amber, "3 Oct" grey; header pill carried the note; no duplicate chip. Template
picker: hovering six options drew nothing; picking one showed one line; Preview returned the dry run.
Widths: 375 (mobile preset), 1440, 1920 — no page-level overflow on Dashboard, Sales dashboard, Inbox,
Outreach, Focus, the popup (after the auto-reply control fix). Nobody has looked at it with eyes.

## 5. Open for Paul

- Keep or remove the paid-client hub's "Action Plan" (the last Playbook entry point)?
- Should **Wrong number** stop future WhatsApp to that number (today it is recorded and shown only)?
- A logged **Not interested** sets the status for both roles; for Sales that also archives it (existing status rule).
