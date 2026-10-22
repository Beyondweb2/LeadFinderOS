# Rules ledger — every ⛔ / 🔴 rule in the old CLAUDE.md (2026-10-22)

Built when CLAUDE.md was cut from 155 KB to a short rulebook (perf audit 2026-10-22, plan step 1). Each row is one rule bullet of the
old file: its id, the section it sat in, its line in `docs/archive/claude-md-full-2026-10-22.md` (the verbatim old file — the
complete wording and the "why"), and the first words of the rule. The live CLAUDE.md carries each rule in one sentence plus a pointer;
a rule is never dropped — if a session finds one missing from the live file, restore it from the archive line given here.

`scripts/claude-md-size.test.ts` fails if CLAUDE.md goes over its size budget, or if this ledger and the archive disagree.

203 rules.

| ID | Old section | Archive line | Rule (start) |
|---|---|---|---|
| R001 |  | 5 | ⛔ AGREEMENT v5 (2026-10-16) is what NEW clients sign (`docs/pre-sales-certification/client-agreement-v5-release.md`): ONE plan, Findable Build = 12 payments, the website  |
| R002 |  | 13 | ⛔ THE ONE RULE ABOUT THIS FILE: a session record goes in `docs/`; CLAUDE.md gets a rule or a |
| R003 | 0. State of play (2026-09-16; customers + handover updated 2 | 26 |  |
| R004 | 0. State of play (2026-09-16; customers + handover updated 2 | 44 | ⛔ Never verify |
| R005 | 0. State of play (2026-09-16; customers + handover updated 2 | 56 |  |
| R006 | 0. State of play (2026-09-16; customers + handover updated 2 | 73 | ⛔ Twilio is BACK, as two-way texting + browser calling, |
| R007 | 0. State of play (2026-09-16; customers + handover updated 2 | 75 | ⛔ Step 7 (delete the multi-user surface) is OVERTURNED — |
| R008 | 0. State of play (2026-09-16; customers + handover updated 2 | 76 | ⛔ Step 4 is OVERTURNED for SOCIAL discovery (Paul, |
| R009 | 0. State of play (2026-09-16; customers + handover updated 2 | 79 | ⛔ Social profiles (2026-09-30, `docs/social-profiles.md`): ONE grade rule (`src/lib/socialProfiles.ts`, |
| R010 | 0. State of play (2026-09-16; customers + handover updated 2 | 84 | ⛔ LinkedIn is never scraped — own-site link or |
| R011 | 0. State of play (2026-09-16; customers + handover updated 2 | 85 | ⛔ Paid Enrich is ADMIN-ONLY and never |
| R012 | 0. State of play (2026-09-16; customers + handover updated 2 | 92 | ⛔ Outreach owner scope (2026-10-05, `docs/pre-sales-certification/outreach-ownership-safety.md`): the admin's |
| R013 | 0. State of play (2026-09-16; customers + handover updated 2 | 100 | ⛔ ONE workflow (Paul, 2026-09-27): Sales uses the SAME Outreach and Inbox — never build a |
| R014 | 0. State of play (2026-09-16; customers + handover updated 2 | 104 | ⛔ Next Action is human-set only (Paul, 2026-09-28) — no add/claim/send/reply/audit/status/queue/ |
| R015 | 0. State of play (2026-09-16; customers + handover updated 2 | 107 | ⛔ ONE Next Action (`docs/one-next-action.md`): `call_booked_at` is the MIRROR of a Meeting Next Action with a |
| R016 | 0. State of play (2026-09-16; customers + handover updated 2 | 112 | ⛔ One Next Action display (UI cleanup 2026-09-29, `docs/ui-cleanup-pass.md`): every screen draws it |
| R017 | 0. State of play (2026-09-16; customers + handover updated 2 | 115 | ⛔ No hover template preview, anywhere — one line under the picker, full wording only on Preview. |
| R018 | 0. State of play (2026-09-16; customers + handover updated 2 | 116 | ⛔ The sales state is DERIVED, never stored (`salesStateOf`, `src/lib/leadState.ts`, 2026-09-30, |
| R019 | 0. State of play (2026-09-16; customers + handover updated 2 | 121 | ⛔ A logged outcome's follow-on is `outcomePlan` / `suggestNextAction` (leadState), carried out ONLY |
| R020 | 0. State of play (2026-09-16; customers + handover updated 2 | 124 | ⛔ No automatic write may overwrite a deal: the inbound `replied` and both `report_sent` writers use |
| R021 | 0. State of play (2026-09-16; customers + handover updated 2 | 126 | ⛔ No selected opener — both approved openers are ordinary choices; the batch's chosen template is |
| R022 | 0. State of play (2026-09-16; customers + handover updated 2 | 128 | ⛔ Abuse / API-cost protection (2026-09-29, `docs/abuse-cost-protection.md`): every paid or data-heavy |
| R023 | 0. State of play (2026-09-16; customers + handover updated 2 | 137 | ⛔ Sales never sees a cost: |
| R024 | 0. State of play (2026-09-16; customers + handover updated 2 | 142 | ⛔ Sales has no CSV export (Paul); Copy Numbers goes through |
| R025 | 0. State of play (2026-09-16; customers + handover updated 2 | 145 | ⛔ Sales readiness (2026-09-28, `docs/sales-readiness.md`): the Sales Dashboard's numbers come from |
| R026 | 0. State of play (2026-09-16; customers + handover updated 2 | 155 | ⛔ Self-sourced prospects + handoff (2026-09-28, `docs/self-sourced-handoff.md`): Sales records |
| R027 | 0. State of play (2026-09-16; customers + handover updated 2 | 163 | ⛔ Paid client setup (2026-10-02, `docs/paid-client-automation.md`): |
| R028 | 0. State of play (2026-09-16; customers + handover updated 2 | 167 | ⛔ since 2026-10-06 payment DOES start ONE |
| R029 | 0. State of play (2026-09-16; customers + handover updated 2 | 172 | ⛔ Missing information (2026-10-05, `docs/pre-sales-certification/client-missing-info-actions.md`): ONE box, rules in |
| R030 | 0. State of play (2026-09-16; customers + handover updated 2 | 176 | ⛔ Paid client auto-intake + Send to Paul (2026-10-06, `docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md`): |
| R031 | 1. The business — current facts only | 202 | ⛔ The signed Client Service Agreement v3 is authoritative over LeadFinderOS (record: |
| R032 | 1. The business — current facts only | 210 | ⛔ An alert after an unsigned payment is NOT a gate: the webhook HOLDS any Findable payment without a valid v3 signature |
| R033 | 1. The business — current facts only | 218 | ⛔ The sign-up £99 is payment 1 on both (`FINDABLE_BUILD_TOTAL_PAYMENTS`, |
| R034 | 1. The business — current facts only | 220 | ⛔ The route is `onboarding_responses.plan_tier` (`new_site` = |
| R035 | 1. The business — current facts only | 228 | ⛔ Each is a real minimum — never "no commitment" / "cancel any time" beside it. The |
| R036 | 1. The business — current facts only | 232 | ⛔ The £9.99 hosting add-on is RETIRED; only a LEGACY row still carries `website_addon` alone. |
| R037 | 1. The business — current facts only | 233 | ⛔ The Coverage town is the question's town (2026-10-20, `docs/coverage-town-strict.md`): "in the town" is ONE rule, |
| R038 | 1. The business — current facts only | 242 | ⛔ Never inferred from the CRM; a run from before 29 Sep is "not |
| R039 | 1. The business — current facts only | 256 | ⛔ Never key "who earns" on the |
| R040 | 1. The business — current facts only | 261 | ⛔ The place and rate are STAMPED by |
| R041 | 1. The business — current facts only | 281 | ⛔ no "Mozilla |
| R042 | 1. The business — current facts only | 282 | ⛔ a bot challenge is never worked around. |
| R043 | 1. The business — current facts only | 284 | ⛔ The machine never sets `website_control`; the lead shows "Detected: …" with Confirm agency / Not agency. |
| R044 | 1. The business — current facts only | 285 | ⛔ Platform (WordPress, Wix…) is context only; one weak sign is never "Agency likely". |
| R045 | 1. The business — current facts only | 288 | ⛔ "Not found", never |
| R046 | 1. The business — current facts only | 289 | ⛔ a non-trading company is never a match; ⛔ the machine match never writes a lead. |
| R047 | 1. The business — current facts only | 290 | ⛔ It needs the result's ADDRESS: `search-leads` asks Google for `places.formattedAddress` (free at the tier |
| R048 | 1. The business — current facts only | 298 | ⛔ A Meta-registered body quoting a retired offer goes in `STALE_OFFER_TEMPLATES` |
| R049 | 1. The business — current facts only | 300 | ⛔ No surface may name one figure without the other. ⛔ Never claim an SEO score. ⛔ Review |
| R050 | 1. The business — current facts only | 306 | ⛔ plus Google AI (renamed from "Google AI Overview") |
| R051 | 1. The business — current facts only | 314 | ⛔ Screens say "Gemini"; spoken scripts say "Google AI" (Paul, 2026-10-11): `HOOK_ENGINE_LABELS` vs |
| R052 | 1. The business — current facts only | 321 | ⛔ No hedge beside it ("the engines decide", "anyone who promises is |
| R053 | 1. The business — current facts only | 325 | ⛔ `NOISE_BAND_PP` / "within noise" never decides the guarantee — it survives only as an operator display label |
| R054 | 1. The business — current facts only | 328 | ⛔ RG Locksmiths is pinned at 8 weeks (legacy outcome guarantee, `remeasure_due_date` |
| R055 | 1. The business — current facts only | 330 | ⛔ THE DOMAIN RULE (Paul, 2026-09-28, `docs/domain-authority.md`): we only build / connect the standard |
| R056 | 1. The business — current facts only | 356 | ⛔ Paul's wording (2026-10-05): signed `RESULTS_SIGN_OFF` ("Paul, Findable"); the monthly is described as |
| R057 | 1. The business — current facts only | 359 | ⛔ findable-checkout refuses with `quickCloseClosedRefusal` — one closed-client rule with Quick Close |
| R058 | 1. The business — current facts only | 361 | ⛔ Billing and the claim window are TWO clocks: billing = `firstRecurringPaymentIso(sign-up)` |
| R059 | 1. The business — current facts only | 365 | ⛔ Re-measure clock: 4 weeks for every new client (`remeasureWeeksFor` |
| R060 | 1. The business — current facts only | 366 | ⛔ A valid claim refunds payment 2 too if already taken |
| R061 | 1. The business — current facts only | 369 | ⛔ Campaigns are OWNED, PRIVATE and GLOBALLY UNIQUE (2026-10-03, `docs/campaigns.md`, migration `20261006120000`). Owner = |
| R062 | 1. The business — current facts only | 375 | ⛔ Campaigns is NOT a menu item (Paul): reached top right of Find |
| R063 | 1. The business — current facts only | 376 | ⛔ ONE WhatsApp queue for both roles = `WhatsAppQueuePanel` |
| R064 | 1. The business — current facts only | 384 | ⛔ Ending never marks a delivery stage done and never touches money, the ledger or commission; a live |
| R065 | 1. The business — current facts only | 387 | ⛔ Only the measurement paragraph is generated, from stored `weekly_check_runs` |
| R066 | 1. The business — current facts only | 389 | ⛔ `client_monthly_updates` is admin-only through its three functions; a sent row is never edited. |
| R067 | 3. The discipline checklist | 449 | ⛔ Never edit a source file with a PowerShell `Get-Content`/`Set-Content` round-trip or |
| R068 | 3. The discipline checklist | 452 | ⛔ Backslashes do not survive the Bash tool here (a heredoc or `node -e` string): `'\s+'` arrives as `'s+'`. That |
| R069 | 3. The discipline checklist | 470 | ⛔ Never put a backtick inside a template literal, not even in |
| R070 | 3. The discipline checklist | 493 | 🔴 Immediately before deploying a function, `git fetch` and check whether `origin/main` has a |
| R071 | 3. The discipline checklist | 503 | ⛔ Every deploy that changes what someone sees or what the app does adds a What's New entry |
| R072 | 3. The discipline checklist | 507 | 🔴 findable-site has NO CI. `npm run deploy` (astro build + wrangler) is the only way it |
| R073 | 3a. Verification tiers — how much to check, and when (2026-1 | 518 | ⛔ None of this weakens the gate. `npm run check` covers exactly what it did; these tiers only decide WHEN to run it. |
| R074 | 3a. Verification tiers — how much to check, and when (2026-1 | 530 | ⛔ The full gate is for these ONLY (run it once, after the last edit, whatever the size): migrations / the database, messaging (WhatsApp / SMS / email) sending, |
| R075 | 3a. Verification tiers — how much to check, and when (2026-1 | 535 | ⛔ Always still verify the real deployed site after a deploy (§4 "The deploy check": fetch the live bundle, assert a marker only your |
| R076 | 3b. Running alongside other sessions (2026-10-10, Paul) | 545 | ⛔ Never kill processes by name (`chrome.exe`, `node.exe`, `msedge.exe`). Kill only a process THIS session started, by PID. |
| R077 | 4. Traps — the rules. The incidents behind each are in `docs | 579 | ⛔ A rate copied from a price list is a guess until a billed row agrees. A cost constant names |
| R078 | 4. Traps — the rules. The incidents behind each are in `docs | 597 | ⛔ A QA lead is explicit, never a name: a `metric_exclusions` lead row, a 07700 900xxx number, email |
| R079 | 4. Traps — the rules. The incidents behind each are in `docs | 605 | 🔴 An absent value falling through as a real one — 16 recorded instances. Never branch on the |
| R080 | 4. Traps — the rules. The incidents behind each are in `docs | 609 | 🔴 One rule written in N places — six recorded copies. Extract the rule into a leaf and import |
| R081 | 4. Traps — the rules. The incidents behind each are in `docs | 612 | 🔴 A guard keyed to today's instance expires silently (`templateName === "initial_contact"`). |
| R082 | 4. Traps — the rules. The incidents behind each are in `docs | 614 | 🔴 Ask not whether the guard is correct but whether the case it guards can reach it. Two |
| R083 | 4. Traps — the rules. The incidents behind each are in `docs | 619 | 🔴 N callers that READ "does it exist yet?" and then spend will all spend. The guard is one |
| R084 | 4. Traps — the rules. The incidents behind each are in `docs | 627 | 🔴 `supabase.functions.invoke` sends the ANON KEY when `getSession()` has no token — an expired |
| R085 | 4. Traps — the rules. The incidents behind each are in `docs | 633 | 🔴 A 401 is only for a token the auth service looked at and refused. `getUser()` not answering |
| R086 | 4. Traps — the rules. The incidents behind each are in `docs | 646 | 🔴 A secondary step must never hold a settled run. Competitor cleaning is optional to the |
| R087 | 4. Traps — the rules. The incidents behind each are in `docs | 657 | ⛔ Do not spend a session re-probing this. |
| R088 | 4. Traps — the rules. The incidents behind each are in `docs | 672 | ⛔ Never add a `generated … stored` column (or anything that rewrites) to a large live table — it |
| R089 | 4. Traps — the rules. The incidents behind each are in `docs | 678 | ⛔ A LIST never reads `lead_crawl_checks.result` — it reads `result_slim` through `useLeadCrawls` (one read for |
| R090 | 4. Traps — the rules. The incidents behind each are in `docs | 685 | ⛔ Lead LIST code never reads `select('*')` of `outreach_leads` — it downloads |
| R091 | 4. Traps — the rules. The incidents behind each are in `docs | 690 | ⛔ Find Leads never downloads the lead list (2026-10-13): `useOutreach({ preload: false })`; its "already |
| R092 | 4. Traps — the rules. The incidents behind each are in `docs | 693 | ⛔ The app's Sign out is GLOBAL (`useAuth` calls `supabase.auth.signOut()`, scope defaults to |
| R093 | 4. Traps — the rules. The incidents behind each are in `docs | 696 | ⛔ The API has ~10 database connections for everyone (Micro instance, default PostgREST pool). |
| R094 | 4. Traps — the rules. The incidents behind each are in `docs | 706 | ⛔ The screen never reads `contact_suppressions`: ask `leads_suppressed` (`src/lib/leadSuppression.ts`, lead ids |
| R095 | 4. Traps — the rules. The incidents behind each are in `docs | 731 | ⛔ Never one shared cap again — that is how a day of prospecting could cap a client's baseline. |
| R096 | 6. Architecture rules that must not be broken (`docs/archite | 771 | ⛔ A title is not a name (`PERSON_TITLE_TOKENS`, 2026-09-28): "Advocate Umesh |
| R097 | 6. Architecture rules that must not be broken (`docs/archite | 792 | ⛔ Never inject a town into a national question, |
| R098 | 6. Architecture rules that must not be broken (`docs/archite | 793 | ⛔ `dropMissingTown` must never bind hybrid (it deleted the wider half and topped it up with |
| R099 | 6. Architecture rules that must not be broken (`docs/archite | 803 | ⛔ THE DIALS LIVE HERE AND NOWHERE ELSE — the full measure stays 20 × 3 and the paid baseline |
| R100 | 6. Architecture rules that must not be broken (`docs/archite | 805 | ⛔ Never present it as a measurement, at any run count. ⛔ The marker is the PURPOSE, never |
| R101 | 6. Architecture rules that must not be broken (`docs/archite | 807 | ⛔ 80 is honest ONLY because generation is BATCHED |
| R102 | 6. Architecture rules that must not be broken (`docs/archite | 810 | ⛔ Out of range is REFUSED, not clamped (`question_count_out_of_range`, `runs_out_of_range`, |
| R103 | 6. Architecture rules that must not be broken (`docs/archite | 818 | ⛔ Branch `full-measure-dials` (`2646b390`) put these |
| R104 | 6. Architecture rules that must not be broken (`docs/archite | 821 | 🔴 A REPEAT'S QUESTION CAP COMES FROM THE STORED AUDIT, NEVER FROM THE CALLER — three recorded |
| R105 | 6. Architecture rules that must not be broken (`docs/archite | 824 | ⛔ Never re-teach a CALLER to declare what it is |
| R106 | 6. Architecture rules that must not be broken (`docs/archite | 833 | ⛔ deleting one nulls |
| R107 | 6. Architecture rules that must not be broken (`docs/archite | 871 | ⛔ Never a hard-coded day. |
| R108 | 6. Architecture rules that must not be broken (`docs/archite | 875 | ⛔ A lead's country comes from Google's address, never from a form's remembered choice |
| R109 | 6. Architecture rules that must not be broken (`docs/archite | 882 | ⛔ A sales-held sign-up is RESUMED, never refused (`salesSignup.resumeDecision`): the salesperson's |
| R110 | 6. Architecture rules that must not be broken (`docs/archite | 890 | ⛔ Canonical Findable business/contact/GBP email = `paul@findable.live`. move37 is |
| R111 | 6. Architecture rules that must not be broken (`docs/archite | 905 | ⛔ The role comes from `user_roles` only (no signed-in role can write it; `admin-users` does, |
| R112 | 6. Architecture rules that must not be broken (`docs/archite | 909 | ⛔ A new edge function either calls `requireAdmin` or resolves the role and checks the lead with |
| R113 | 6. Architecture rules that must not be broken (`docs/archite | 912 | ⛔ A new page is admin-only by default (`src/lib/access.ts` lists what sales may open, and |
| R114 | 6. Architecture rules that must not be broken (`docs/archite | 914 | ⛔ Writes to `outreach_leads` / `ai_audits` / `ai_audit_runs` / `ai_audit_queue` from the browser |
| R115 | 6. Architecture rules that must not be broken (`docs/archite | 924 | ⛔ A salesperson's bulk check is fn `sales-prospect-check` ONLY — never `bulk-jobs` (it keys on |
| R116 | 6. Architecture rules that must not be broken (`docs/archite | 931 | ⛔ A TYPED TOWN IS EVIDENCE ONLY WHEN IT IS A TOWN (2026-10-15, `docs/typed-town-audits.md`): an imported (`import_batch`) or hand-added (`lead_source`) lead with no place |
| R117 | 6. Architecture rules that must not be broken (`docs/archite | 932 | ⛔ No audit result ever changes a lead's status (Paul, 2026-10-04). "Not interested" is a sales outcome a |
| R118 | 6. Architecture rules that must not be broken (`docs/archite | 942 | ⛔ Never write that cold WhatsApp outreach is definitively lawful (or unlawful). ⛔ The opt-out / |
| R119 | 6. Architecture rules that must not be broken (`docs/archite | 970 | ⛔ EVERY cold-opener door asks the ONE function `opener_contact_block` (sales_queue_opener, contact_check → |
| R120 | 6. Architecture rules that must not be broken (`docs/archite | 982 | ⛔ An explicit opt-out (`contact_suppressions.reason = 'opted_out'`) blocks every MARKETING send, |
| R121 | 6. Architecture rules that must not be broken (`docs/archite | 997 | ⛔ Never assert how an AI model decides. We can see what is on a site; we cannot see why Gemini |
| R122 | 6. Architecture rules that must not be broken (`docs/archite | 1003 | ⛔ AUSTRALIA IS PROSPECT-ONLY (2026-10-21, `docs/australia-coverage.md`): find, audit and call — never a price, a guarantee |
| R123 | 6. Architecture rules that must not be broken (`docs/archite | 1008 | ⛔ AUSTRALIA IS A WHATSAPP-ONLY MARKET (2026-10-22, `docs/australia-whatsapp.md`): its own switch / cap / auto-off like Malaysia; |
| R124 | 6. Architecture rules that must not be broken (`docs/archite | 1013 | ⛔ COLD WHATSAPP IS UK MOBILES BY DEFAULT — India is no longer an outreach market (2026-10-07). The only other doors are |
| R125 | 6. Architecture rules that must not be broken (`docs/archite | 1019 | ⛔ COLD WHATSAPP TO MALAYSIA / SINGAPORE ONLY THROUGH ITS PER-COUNTRY SWITCH, AND ONLY AFTER A HANDFUL ARE TESTED BY HAND |
| R126 | 6. Architecture rules that must not be broken (`docs/archite | 1025 | ⛔ A FAILED SEND KEEPS META'S OWN ERROR (2026-10-15): `error_code / error_title / error_details` on `whatsapp_sends` + |
| R127 | 6. Architecture rules that must not be broken (`docs/archite | 1048 | ⛔ We never publish content written in a business's name (Paul, 2026-10-01). The |
| R128 | 6. Architecture rules that must not be broken (`docs/archite | 1050 | ⛔ Never delete `business_reports` rows: they are the |
| R129 | 6. Architecture rules that must not be broken (`docs/archite | 1064 | ⛔ Colours: GREEN + tick = the business, RED + cross = a competitor |
| R130 | 6. Architecture rules that must not be broken (`docs/archite | 1084 | ⛔ Gemini is said "Gemini" in every script and draft (`HOOK_SPOKEN_ENGINE_LABELS`, Paul 2026-10-13; never "Google AI" — |
| R131 | 6. Architecture rules that must not be broken (`docs/archite | 1085 | ⛔ One AI tool per conversation: a draft |
| R132 | 6. Architecture rules that must not be broken (`docs/archite | 1087 | ⛔ No Outreach list-order index: the planner cannot use it |
| R133 | 6. Architecture rules that must not be broken (`docs/archite | 1099 | ⛔ A not-offered entry about NEW work binds only new work (`serviceScope.ts` `NEW_WORK`): "no new boilers" |
| R134 | 6. Architecture rules that must not be broken (`docs/archite | 1101 | ⛔ The client's own "no" is not a word of the service (`buildServiceScope` `NOT_OFFERED_PREAMBLE`, pre-sales |
| R135 | 6. Architecture rules that must not be broken (`docs/archite | 1107 | ⛔ ONE WEBSITE CHECK PER LEAD, READ BY EVERY SCREEN (Paul, 2026-10-15, `docs/website-check.md`): both crawls store |
| R136 | 6. Architecture rules that must not be broken (`docs/archite | 1119 | ⛔ …EXCEPT A PROSPECT (2026-10-05, `src/lib/prospectCrawl.ts`, `docs/pre-sales-certification/prospect-full-crawl-audit-results.md`): |
| R137 | 6. Architecture rules that must not be broken (`docs/archite | 1124 | ⛔ The prospect cap is 60 pages, chosen by priority (2026-10-07, `docs/site-crawl-sales-insights.md`): services, then about/contact, |
| R138 | 6. Architecture rules that must not be broken (`docs/archite | 1129 | ⛔ Content & trust checks are ONE builder, `src/lib/contentTrust.ts` (2026-10-11, `docs/crawl-content-trust.md`): `pageObservations` per page |
| R139 | 6. Architecture rules that must not be broken (`docs/archite | 1146 | ⛔ Official baseline = the Hook Audit's questions (locked, verbatim) + the rest from Discovery = exactly 20 |
| R140 | 6. Architecture rules that must not be broken (`docs/archite | 1151 | ⛔ never read by the guarantee. |
| R141 | 6. Architecture rules that must not be broken (`docs/archite | 1158 | ⛔ never reads winnability (a caller-supplied rank may only break ties — 2026-09-30). Near-duplicates are "same intent" by |
| R142 | 6. Architecture rules that must not be broken (`docs/archite | 1169 | ⛔ Old pages / ranking protection (2026-10-10, `docs/website-build-redirects.md`): rules ONLY in `src/lib/oldPages.ts`, stored in `website_build.old_pages` (no migration). |
| R143 | 6. Architecture rules that must not be broken (`docs/archite | 1170 | ⛔ The operator flow is the SIMPLE screen (`src/lib/simpleBuild.ts` + `SimpleWebsiteBuild.tsx`, 2026-10-05, `docs/pre-sales-certification/website-build-simple.md`): build  |
| R144 | 6. Architecture rules that must not be broken (`docs/archite | 1171 | ⛔ Preview Ready = technical AND perceived quality (`websiteQuality.ts`, 2026-09-25): read it through `previewReadyProblems`, never `previewGateProblems` alone (a test fai |
| R145 | 6. Architecture rules that must not be broken (`docs/archite | 1172 | ⛔ …AND the build standard (`websiteBuildStandard.ts`, 2026-09-27 — what MCL + BS4 were rescued for by hand): image roles (Areas hub → the MAP by default; fallback a genui |
| R146 | 6. Architecture rules that must not be broken (`docs/archite | 1173 | ⛔ …AND the Site Quality Gate (`scripts/site-quality-gate.mjs` + `src/lib/siteGate.ts`, 2026-09-30, `docs/website-build-seo-gate.md`): the build's own `qa.*` is a CLAIM; t |
| R147 | 6. Architecture rules that must not be broken (`docs/archite | 1174 | ⛔ Current-site facts (Paul, 2026-09-30, `recon.ts` `SOURCE_SITE_FACT_KEYS`): anything the client's own site states is approved source-site evidence by default — services, |
| R148 | 6. Architecture rules that must not be broken (`docs/archite | 1175 | ⛔ The MCL template (v2.0) seeds `Beyondweb2/MCLocksmiths-New` at a PINNED commit (`sourcePinnedCommit`, `sourceKind: 'live_client_repo'`) — never the superseded `MCLocksm |
| R149 | 6. Architecture rules that must not be broken (`docs/archite | 1176 | ⛔ One intent-ownership rule (`src/lib/intentOwnership.ts`, `ownershipFor`): the Site Intent Map, page-generator Q&A and the page-plan queue all ask supported → already ow |
| R150 | 6. Architecture rules that must not be broken (`docs/archite | 1180 | ⛔ Never persist an open dialog. A modal must not arrive over the thing that was clicked. |
| R151 | 6. Architecture rules that must not be broken (`docs/archite | 1181 | ⛔ Leaving the lead workspace goes through ONE guard (`src/components/UnsavedDraftGuard.tsx`, final sales release): a field |
| R152 | 6. Architecture rules that must not be broken (`docs/archite | 1185 | ⛔ The lead workspace header draws each fact once (`src/lib/workspaceHeader.ts`): status pill + |
| R153 | 6. Architecture rules that must not be broken (`docs/archite | 1190 | ⛔ Outreach loads progressively (newest 1,000 first, `src/lib/outreachLoad.ts`): anything that |
| R154 | 6. Architecture rules that must not be broken (`docs/archite | 1198 | ⛔ ONE status pill per lead row (Outreach desktop + phone, Inbox header + list, 2026-10-01): the SOLID |
| R155 | 6. Architecture rules that must not be broken (`docs/archite | 1204 | ⛔ A send stamp is not a contact when the send failed: `whatsapp_sent_at` is set when Meta ACCEPTS; read |
| R156 | 6. Architecture rules that must not be broken (`docs/archite | 1216 | ⛔ One lead = `assign_lead_with_brief` (assign_lead + one board task; the ONE notice is |
| R157 | 6. Architecture rules that must not be broken (`docs/archite | 1221 | ⛔ Moving a lead never moves its history. An event naming no person is credited to whoever held the lead |
| R158 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1254 | ⛔ Approve-to-send, except Level 2's switched-on types (Paul, 2026-10-21, `docs/ai-handles-replies.md` "Level 2"). fn `ai-reply-drafts` never sends; Approve & send = `clai |
| R159 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1255 | ⛔ ONE Inbox reply mode: Manual / Draft for approval / Auto (Paul, 2026-10-21, `docs/ai-handles-replies.md` "One mode", `src/lib/inboxReplyMode.ts`, `whatsapp_outreach_sta |
| R160 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1256 | ⛔ One row per inbound (`ai_reply_drafts`, unique `inbound_message_id`), one open row per conversation. Rules: `src/lib/aiReplyDraft.ts`; hand-over phrases come from `repl |
| R161 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1257 | ⛔ The warm drafter has no stage gate any more (Paul, 2026-10-11): Draft reply and Refresh research show in every stage. |
| R162 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1258 | ⛔ A failed crawl never overwrites the last good one (`src/lib/crawlWriteRule.ts`, `lead_crawl_checks.last_failed_attempt`). |
| R163 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1259 | ⛔ Code picks the move, the model only phrases it (2026-10-20, `docs/ai-handles-replies.md` last section): `src/lib/replyMove.ts` `pickMove`. Offer facts come ONLY from `s |
| R164 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1260 | ⛔ The pitch waits for its evidence (Paul, 2026-10-21, `docs/ai-handles-replies.md` "Draft after the audit"): `src/lib/draftEvidenceWait.ts` is the one rule. A first-reply |
| R165 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1261 | ⛔ What a draft SAYS is the reply playbook (Paul, 2026-10-20, `docs/reply-playbook.md`, `src/lib/replyPlaybook.ts`): the first reply to the opener always gets the pitch un |
| R166 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1262 | ⛔ Needs you flags run whatever the switch says (rules only, no model call; `reply_flags_since`); the model drafts on its own ONLY while "AI handles replies" is on. A stop |
| R167 | 6l. AI handles replies (2026-10-11 — record: `docs/ai-handle | 1263 | ⛔ "AI named others instead" templates go only when named in ≤ a third of valid answers (`src/lib/namedShareRule.ts`, enforced in `resolveAuditReplyVars`). A new claim tem |
| R168 | 6n. The status follows the messages; the Visible flag (2026- | 1267 | ⛔ Replied / You replied / back-to-Contacted are DERIVED IN THE DATABASE from the stored messages (`lead_conversation_signal` + |
| R169 | 6n. The status follows the messages; the Visible flag (2026- | 1271 | ⛔ Visible is a FLAG, not a status (`outreach_leads.ai_visible_*`, rules `src/lib/visibleFlag.ts`): written ONLY by `apply_lead_visible` |
| R170 | 6n. The status follows the messages; the Visible flag (2026- | 1274 | ⛔ "First reply" = no pitch sent yet (`pickMove` `first` uses `pitchOwed`), never a time window; a plain confirm / "how can I help" is never |
| R171 | 6n. The status follows the messages; the Visible flag (2026- | 1275 | ⛔ `namedShareOf` never counts ChatGPT (drafter + template gate; GSI Driving School, 2026-10-21). |
| R172 | 6o. The WhatsApp number's quality rating (2026-10-21 — recor | 1279 | ⛔ ONE rule, `src/lib/whatsappNumberHealth.ts`: fn `whatsapp-number-health` (cron 15 min) stores Meta's rating + tier on |
| R173 | 6m. Find Leads adds and the payment-12 reminder (2026-10-17  | 1286 | ⛔ Every Find Leads add is ONE batch (`src/lib/findLeadsBulkAdd.ts`: preview → each new lead's number looked up, `PLACE_LOOKUP_CONCURRENCY` at a time, a 429 retried, cache |
| R174 | 6m. Find Leads adds and the payment-12 reminder (2026-10-17  | 1287 | ⛔ WhatsApp is protected where it SENDS, never by keeping a lead out: cold = `coldWhatsAppVerdict` / `sales_queue_opener` / the drip (unchanged); EVERY other template = `s |
| R175 | 6m. Find Leads adds and the payment-12 reminder (2026-10-17  | 1289 | ⛔ "When is payment 12" is `src/lib/finalPaymentDates.ts` — the v5 9A.5 reminder (fn `month12-reminder`, once per client, `month12_reminder_settings.enabled` is the kill s |
| R176 | 6j2. The call screen's website crawl, the page checks, the v | 1293 | ⛔ A crawl starts at the site's homepage (`crawlStartUrl`), never the deep page a lead's website points at. ⛔ The call screen starts a |
| R177 | 6j2. The call screen's website crawl, the page checks, the v | 1295 | ⛔ The page checks are `visibilityChecks.ts`, run by BOTH crawls — evidence quoted from the page; schema findings stay LOW. |
| R178 | 6j2. The call screen's website crawl, the page checks, the v | 1296 | ⛔ The voice note is `voiceNoteFromCall(playbook)` — no model call; it can never disagree with the call script. |
| R179 | 6j2. The call screen's website crawl, the page checks, the v | 1297 | ⛔ Google AI scoring is DERIVED from the audit date (`scoringMethodFor`), never stored; never rewrite a stored score. Method 2 is in |
| R180 | 6k. One Inbox for two channels; SMS status; the reply settin | 1303 | ⛔ WhatsApp and SMS are ONE component (`ConversationInbox({ channel })` in `src/pages/Inbox.tsx`) with a thin channel adapter (`useInbox(channel)`, |
| R181 | 6k. One Inbox for two channels; SMS status; the reply settin | 1307 | ⛔ SMS status is DERIVED from the provider's delivery receipts (`src/lib/smsStatus.ts`): Queued → Contacted (delivered, early statuses only) → SMS Failed → |
| R182 | 6k. One Inbox for two channels; SMS status; the reply settin | 1310 | ⛔ A text reply behaves like a WhatsApp reply: Replied on the shared no-downgrade list, a coalesced notification, the shared "When a prospect replies" rule |
| R183 | 6k. One Inbox for two channels; SMS status; the reply settin | 1312 | ⛔ A pitch follows an audit ONLY under "Audit and reply" on WhatsApp (`src/lib/auditPitchRule.ts`): Do nothing / Audit only send and park nothing; texts |
| R184 | 6k. One Inbox for two channels; SMS status; the reply settin | 1314 | ⛔ Queue for text never texts a lead tried on WhatsApp (2026-10-13, `docs/twilio-comms.md` last section): `queue_sms_openers` skips the WhatsApp queue |
| R185 | 6k. One Inbox for two channels; SMS status; the reply settin | 1318 | ⛔ Every Inbox send keeps to the lead's send hours (`src/lib/inboxSendWindow.ts`, `docs/inbox-send-window.md`, 2026-10-21): outside them the |
| R186 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1327 | ⛔ Which market a number is = `src/lib/outreachMarkets.ts` (`mobileMarketOf` / `callMarketOf`), SQL twin `public.mobile_market` — from the |
| R187 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1329 | ⛔ A market is not permission: each channel (WhatsApp / SMS / browser calling) has its switch in `outreach_country_settings` (admin-only via |
| R188 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1334 | ⛔ `initial_contact_short` + the clean message name (2026-10-15, `docs/clean-business-name.md`): "Hey, is this {{1}}?" / "Thanks", ONE variable, COLD, |
| R189 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1339 | ⛔ Malaysia Coverage rows (2026-10-19, `docs/coverage-my-sg-population.md` last sections): a lead's place text is READ by |
| R190 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1343 | ⛔ Keep this out of `coverageCountries.ts`: |
| R191 | 6l. Malaysia and Singapore (2026-10-14 — record: `docs/my-sg | 1345 | ⛔ Imported leads count as already added: `_lead_identity_rows` (migration `20261108090000`) adds MY / SG phone, website and |
| R192 | 7. Where the code lives (`docs/code-map.md` for the long for | 1354 | ⛔ Every admin number comes from `_shared/admin-overview-load.ts` → `src/lib/adminMetrics.ts` (the dashboard AND the AI briefing — never a second fold). ⛔ Reply triage (`r |
| R193 | 7. Where the code lives (`docs/code-map.md` for the long for | 1355 | ⛔ Test accounts test1/Test are excluded from performance numbers by ROW, never by name; their leads stay in inventory / |
| R194 | 7. Where the code lives (`docs/code-map.md` for the long for | 1356 | ⛔ Each town is ordinary `search-leads` with `townOnly` (Google, never Apify); the bulk add writes exactly what a single search add writes (owner, campaign_usable, no lead |
| R195 | 7. Where the code lives (`docs/code-map.md` for the long for | 1357 | ⛔ It CALLS the gates' predicates, never copies them; a new audit / send gate must be reflected there or `scripts/lead-readiness.test.ts` (an oracle from the server lines) |
| R196 | 7. Where the code lives (`docs/code-map.md` for the long for | 1359 | ⛔ Redeploy `paid-client-hub` BEFORE the SPA when the shape changes — the old server drops unknown keys on save / |
| R197 | 7. Where the code lives (`docs/code-map.md` for the long for | 1361 | ⛔ It drafts into the composer and NEVER sends; a model finding survives only if its quote is on the page / |
| R198 | 7. Where the code lives (`docs/code-map.md` for the long for | 1362 | ⛔ Never sends. The site research is `_shared/site-research.ts`, shared with `warm-lead-reply` — change it, redeploy BOTH / |
| R199 | 7. Where the code lives (`docs/code-map.md` for the long for | 1372 | ⛔ |
| R200 | 8. Known open problems — the short list (`docs/open-problems | 1405 | 🔴 ⛔ `whatsapp-status` must not be deployed until the Findable Meta App and its exact App Secret are ready |
| R201 | 8. Known open problems — the short list (`docs/open-problems | 1409 | 🔴 The Apify monthly cap is US$40 (read live 2026-10-05: US$29.04 used, cycle ends 16 Oct) — Paul's |
| R202 | 8. Known open problems — the short list (`docs/open-problems | 1427 | ⛔ THE ONBOARDING CHECKLIST NO LONGER BLOCKS SELLING (Paul, 2026-10-06, migration `20261012120000`; |
| R203 | 8. Known open problems — the short list (`docs/open-problems | 1432 | ⛔ Salesperson paperwork (contractor agreement, privacy notice) is HANDLED EXTERNALLY BY PAUL — NOT ENFORCED IN |
