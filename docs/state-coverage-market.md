# State persistence, Coverage, the market view (mostly DELETED 2026-09-09 — archive), the town gate

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6c on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: `MarketPanel`, `MeasureMarket`, `useMarketView`, `useInFlightMeasures` and the Coverage measure/add-all actions were DELETED on 2026-09-09. Read this as history.
> ⚠️ Corrected 2026-09-16: `src/lib/marketAuditThreshold.ts` is NOT parsed by `check-cross-repo-sync.mjs` (verified 2026-09-15: neither repo's script references it) and has zero importers — it is an orphan slated for Phase 3.

## 6c. 🔴 NEXT SESSION STARTS HERE — "it loses my place", the state audit (2026-08-09)

Paul's words: *"I use this all day and losing my place is the single most annoying thing about it."*
Audited across every page. **It is ONE root cause with two halves, not a per-page bug** — so do not
patch pages, fix the two.

### THE ROOT CAUSE

**Half 1: the operator app has no data cache.** React Query is installed and correctly configured in
`App.tsx` (`staleTime: 5 min`, `refetchOnWindowFocus: false`) and is used by **6 files, every one a
PUBLIC customer-facing page** — BookingPage, PublicSite, SiteByToken, SubdomainSite, the barber and
salon shells. **Not one operator page or hook uses it.** Twelve data hooks own rows in `useState` and
refetch in a mount effect:
```
useApifyUsage  useAvatar  useBulkJobs  useCampaignStats  useCampaigns  useCheckedBusinesses
useContactTracking  useInbox  useLeadNotes  usePersonalActions  usePlaybook  useTeamFeedback
```
⚠️ **THAT LIST IS THE 2026-08-09 AUDIT AND IS NOW STALE** — twelve of them were migrated on
2026-09-10 and two never existed by the end. It is kept as the record of the original finding;
**the current state is in THE ORDER below, and the way to check is to re-derive from the code.**
```
```
`useInbox:124` is `useEffect(() => { fetchAll(); }, [fetchAll])` with `isLoading` starting `true` —
leave the Inbox, come back, full refetch and a spinner.

**Half 2: the layout remounts on every navigation.** `App.tsx` has **12 `<AppLayout>` wrappers inside
Route elements and 0 `<Outlet/>`**. Each route renders its own copy of the shell, so React unmounts
and remounts sidebar and scroll container on every navigation. Nothing inside can survive by staying
mounted; it can only be restored from storage afterwards.

✅ **Checked and ruled out:** no `key=` anywhere forcing a remount. Normal navigation unmount is the
whole story — there is no third cause to hunt.

### THE SPLIT-LIFETIME FAULT IS THE PATTERN, NOT AN INSTANCE
The search bug (results restoring without the search that produced them) is everywhere:
```
Inbox.tsx          2 persisted vs 22 plain useState
AiAudit.tsx        6 persisted vs 61 plain
Index.tsx          2 persisted vs 10 plain
useOutreach.ts     2 persisted vs  6 plain
useMarketView.ts   1 persisted vs  6 plain
```

### WHAT SURVIVES WHAT (before the work)
| | navigate | reload | tab close |
|---|---|---|---|
| Data (all 12 hooks) | ✗ refetch + spinner | ✗ | ✗ |
| Scroll (`usePersistedScroll`, in AppLayout) | ✓ | ✓ | ✓ |
| A few filters (`usePersistedState`) | ✓ | ✓ | ✗ |
| Selections, expanded rows, dialogs | ✗ | ✗ | ✗ |

### ⛔ THE RULES AGREED WITH PAUL — APPLY THESE, DO NOT RE-DECIDE THEM
- **The URL is for WHAT I AM LOOKING AT. `usePersistedState` is for HOW THE PAGE IS CONFIGURED.**
  A conversation, a selected market, an open record → URL (back button, linkable, survives
  everything). A filter, a sort, a toggle → persisted state. `Index.tsx` already says this for the
  market view; it is now the app-wide line. **Report every move to the URL.**
- ✅ **AND A MODAL MUST NOT ARRIVE OVER THE THING THAT WAS CLICKED, EITHER — fixed 2026-08-10.**
  Coverage's market link carried `confirm=search` on every row, so clicking through to a town already
  measured opened "Run the lead search? ~$0.14" on top of the market numbers that were the reason for
  the click. Two guards, and the second decides: `wantsSearchConfirm(state)` (`coverageState.ts`) keeps
  the param off the measured/worked rungs, and `openArrivalSearchConfirm` + `auditsInView`
  (`marketView.ts`) refuse it in the panel off the market's own audit count — which is what covers a
  bookmarked URL and a stale Coverage cache. The panel decision now happens **in the same effect as the
  load, on the view `load` RETURNED**; it used to fire before any market data existed, so it could not
  consult the fact that decides it. A refusal states itself with the override beside it — the button
  must not become a link that visibly does nothing.
- ⛔ **COVERAGE HAS TWO ACTIONS PER ROW, AND IT USED TO HAVE ONE DOING THE WRONG JOB — split
  2026-08-11.** The button labelled **Find leads** carried `mode=market`, so it never ran a lead
  search: it opened the market read (and, on an untouched town, a spend confirm over that). Now
  **Find leads** → `mode=leads&keyword=&location=&run=search`, the normal search, prefilled and run
  once; **Market view** → `mode=market&trade=&town=[&confirm=search]`, unchanged. `wantsSearchConfirm`
  therefore belongs to **Market view** now, not to Find leads — the rule did not change, the control
  it hangs off did.
  - Both hrefs are built by **`findLeadsHref` / `marketViewHref` in `coverageState.ts`**, not inline in
    the JSX, so `scripts/coverage-actions.test.ts` can assert the one property that matters: the
    Find-leads href carries **no `mode=market` and no `confirm=search` on any rung**, including an
    unknown one. An inline template string is how the two drift back together.
  - 🔴 **THE SEVENTH INSTANCE OF THE ABSENT/STALE-VALUE SHAPE, CAUGHT BEFORE SHIPPING.** `keyword`,
    `location` **and `mode` are all `usePersistedState`**, and the URL seeds are applied in an effect —
    so on the first commit the form still holds the PREVIOUS search. A plain boolean `autoSubmit` would
    have run **"plumber / Bourne" from a button that said locksmiths in Wisbech**, spent the money, and
    then painted the right town above the wrong results. Worse, because the MODE is persisted too, an
    operator whose last visit was a market view would have fired **a market view from the Find leads
    button** — the exact fault being fixed.
    **So `autoSubmit` is a MODE, not a boolean**, and the effect fires only when the form HOLDS WHAT
    THE URL ASKED FOR (same mode, same keyword, same town). A seed that has not landed spends nothing.
  - ⚠️ **`run=search` is a one-shot intent** — ref'd on first render, stripped from the URL whether or
    not the search fires. Left there it re-runs a **paid** search on every refresh and back button.
  - ⚠️ **Find leads SPENDS ON ARRIVAL, and that is Paul's call 2026-08-11**: ~$0.11 of Places quota,
    and **nothing** within 72h of the last search of the same trade and town (search-leads
    short-circuits on its own cache). The confirm was guarding the wrong flow.
  - ⚠️ One place builds the filters (`runSearch` in `SearchForm`), so the arrival run and the Search
    button cannot send different searches — the radius, country and town-only that run are the ones on
    screen.
- ⛔ **NEVER PERSIST AN OPEN DIALOG.** A modal springing open on return is worse than losing it —
  you did not ask for it and it blocks the page you came back for. `AiAudit.tsx` already refuses to
  persist `formOpen` for this reason. Persist what you were LOOKING AT, never what was INTERRUPTING.
- ⛔ **THE MUTATION RISK IS THE WORK, NOT THE MIGRATION.** Paul: *"losing my place annoys me, a stale
  list makes me act on wrong data."* Take **one hook at a time and prove the invalidation** — never
  migrate several and test at the end. Every mutation needs its `invalidateQueries` demonstrated.

### THE ORDER
1. ✅ **DONE 2026-08-09 (stage 1a, `9a0ba920`)** — Inbox conversation → URL (`?c=`), half-typed reply
   → `src/lib/inboxDrafts.ts`, keyed BY CONVERSATION and in **localStorage** (the one place that tier
   is right: a closed tab must not take a message you were partway through).
   ⚠️ A bug caught before shipping: `startFromLead` called `setText('')` AFTER switching thread,
   which with per-conversation drafts clears the thread you just LEFT. The line was removed, not
   patched — a new thread opens empty by construction.
2. **`useInbox` → React Query**, with invalidation proven on **`send`** and **`patchLeadStatus`**
   specifically. This is the headline fix and the first real mutation test.
3. ✅ **DONE 2026-08-28 — the layout route.** One `<Route element={<AppLayout/>}>` with `<Outlet/>`
   replaced the fifteen wrappers, after checking they were byte-identical. The shell mounts ONCE;
   §6c's "half two" is closed. `usePersistedScroll` now sees route changes without a remount.
4. ✅ **DONE 2026-09-10 — twelve hooks, one at a time.** `useDashboardMetrics`, `useCampaignStats`,
   `usePlaybook`, `useFreeCheckProgress`, `useAvatar`, `useCheckedBusinesses`, `useTeamFeedback`,
   `useTemplates`, `useCampaigns`, `useBulkJobs`, `useCopiedPhones`, `useMeasurementLock`.
   ⚠️ **THE LIST IN THIS SECTION WAS WRONG IN BOTH DIRECTIONS and cost time before it was
   re-derived from the code.** `useLeadNotes` and `usePersonalActions` do not exist (deleted in the
   September cleanup); `useCopiedPhones`, `useMeasurementLock` and `useSubscription` were missing.
   **Re-derive the list, do not inherit it.** `useSubscription` was then deliberately SKIPPED: it is
   a provider mounted ABOVE `BrowserRouter`, so it loads once per session and never refetches.
   ⚠️ **The recurring trap: every one of these exported a `refetch` bound to the function being
   converted.** Once the loader returns data instead of writing state, calling it directly fetches
   and discards — a refresh button that silently does nothing. They invalidate now.
5. 🔴 **`useOutreach` IS THE ONE LEFT, AND IT IS ITS OWN PIECE OF WORK — do not tack it on.**
   Measured 2026-09-10: **1,603 lines, 38 direct `setLeads`/`setArchivedLeads` calls, 29 DB writes,
   33 exported functions, 9 consumer files**, on the screen Paul works in all day. Each of those 38
   is an optimistic update that has to stay correct under a shared cache, which is 38 invalidation
   proofs, not one. ⚠️ `leadsWithOptimistic` — named here for months as the hard part — **no longer
   exists**; check what the optimistic layer actually is before planning around it.

### ✅ COVERAGE READ-PATH — two bugs fixed 2026-08-19 (`e33d190e`), verified live

- ⛔ **"MEASURED" NOW NEEDS `MARKET_AUDIT_MIN_AUDITS` (2), MATCHING THE PANEL.** Coverage used to
  call a town measured at ONE completed market audit while the panel needs two before it calls a
  shape — so a 1-audit town read "Measured" on the row and "needs measuring" in the panel, and View
  looked like it re-ran the audit. The fix lives in **`coverageStateFor` (`coverageState.ts`)**, NOT
  the edge fn: the endpoint returns FACTS (one entry per completed audit, raw), the client COUNTS
  them per `coverageKey` (`countMeasuredByPair`) and grades `measured` at `>= MARKET_AUDIT_MIN_AUDITS`.
  Counting client-side is load-bearing: a real Eastbourne market typed both `Locksmiths` and
  `locksmiths` folds to one 2-audit market through coverageKey; a raw server count split it into two
  1-audit halves. `CoverageFacts.measuredPairs` (a Set) became **`measuredCounts` (a Map)**.
  - ⚠️ **THE CONSTANT MOVED to a zero-dep leaf `src/lib/marketAuditThreshold.ts`**; marketView.ts
    imports AND re-exports it (a bare `export … from` broke marketView's own internal uses — import
    at the top so the name is in local scope). coverageState.ts imports the leaf.
  - ⚠️ **CONSEQUENCE ON REAL DATA:** two of Paul's markets have only 1 completed audit (incomplete
    measures — §8's Colchester and Norwich). **locksmiths/Colchester drops Measured → Untouched**
    (no leads); **Norwich is unaffected** (it is Worked, which outranks Measured). Both correct.
- ⛔ **THE COVERAGE MOUNT IS TWO EDGE READS NOW, NOT ONE.** It was one ~3s sequential read (733
  static towns THEN the ~1,500-lead scan) that a lead-add refetched in full. Split into edge actions
  **`towns`** (static ONS list, React Query `staleTime: Infinity` / `gcTime: Infinity`, key
  `coverage-towns`; suppression patches this cache) and **`pairs`** (measured/leads/worked, on the
  existing `coverage` key that `useOutreach` invalidates). They fire in parallel. The edge fn keeps a
  combined **`view`** action for deploy back-compat. ⚠️ **Deploy the edge fn BEFORE the SPA** — the
  new hook calls `towns`/`pairs`, which an old deploy 400s as unknown actions.
  - ⚠️ **First COLD load is still ~1.8s — that floor is the LEAD SCAN (pairs), not the towns.** The
    split's real win is repeat loads (towns cached, instant) and lead-add-returns (only pairs
    refetch, never 733 towns). Getting the town table on screen in ~1s would mean rendering it before
    grades land — declined, because a measured market flashing "Untouched" for ~1s is the "act on
    wrong data" harm §6c warns of. A real sub-1s fix needs a grouping RPC (a migration → Paul's SQL).
- ⚠️ **Bath was a TEST ARTIFACT (mine), deleted 2026-08-19** — a single direct create-ai-audit with
  no pool, showing a phantom "Measured Bath". Deleted its 8 queue rows + 1 run + the audit (no
  orphans). Norwich/Colchester single-audit markets are NOT mine (real pre-session incomplete
  measures) — left alone.

---


---

> Moved from CLAUDE.md §6d on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: `SingleWhatsAppDialog` CAN open: `OutreachTable.tsx` opens it for a dashboard task jump with `channel: 'whatsapp'` (the `launchIntent` path). Paul decided 2026-09-15 to drop that "open the WhatsApp app" flow in Phase 3.

## 6d. ✅ THE PAID CLIENTS PAGE IS GONE — paying customers live in Outreach + Inbox (2026-08-12)

`/paid-clients` deleted. Paul's reason: a customer is a lead who paid, not a different kind of
record, and a separate page meant leaving the two screens he actually works in to see them.
**No SQL — every column already existed.** Nothing was migrated; only the editors moved.

- ⛔ **`paid` MEANS `amount_paid > 0`. THE FILTER IS A SENTINEL, NOT A STATUS, AND THAT IS THE WHOLE
  DESIGN.** ⚠️ **Still true for the FILTER; the dashboard's paying-CUSTOMER count needs two more
  rules since the £9.99/mo hosting shipped — a price floor and a churn test (§11).** The scalar
  cannot express "bought once, hosting since cancelled". `OUTREACH_STATUS_FILTER_OPTIONS` leads with `PAID_FILTER_VALUE` (`'__paid__'`), labelled
  **"Paid (money in)"**, which the row filter special-cases against `amount_paid` — the same shape the
  Inbox already uses for `__opened__` / `__claimed__` / `__upsell__`. Filtering on the STATUS
  `payment_received` is wrong in **both** directions and each costs something real: a customer moved on
  to `in_delivery` is **still paid** (a status filter hides exactly the people mid-delivery), and a £0
  lead dragged to `payment_received` by hand is **not** paid (a status filter counts it as revenue).
  The deleted page had made precisely this mistake once already.
  - ⚠️ **`statusesForFilter(PAID_FILTER_VALUE)` returns `[]` ON PURPOSE**, and the row filter tests
    `isPaidFilterValue` **first**. Falling through would render an **empty table**, which reads as
    "no paying customers" rather than as an error — the `'contacted'` failure in a new place.
  - ⚠️ **Its label is deliberately NOT the bare word "Paid".** `payment_received` already carries that,
    and two options reading the same word with different row counts is the 53-vs-509 "No WhatsApp"
    failure. `scripts/status-constants.test.ts` asserts no two FILTER options share a label.
- ⛔ **A CLEARED AMOUNT WRITES `null`, NEVER `0`** — eighth instance of the absent-value shape, and
  aimed at the one column that decides whether someone is a customer at all. `0` would silently drop
  them from the filter, from the Inbox exemption and from every revenue figure, with nothing thrown.
  `src/lib/leadPayment.ts` (`parseAmountPaid` / `isPaidLead`) owns it; `scripts/lead-payment.test.ts`
  drives empty / whitespace / null / undefined / unreadable **and the clear-after-save round trip**,
  which is the case a build writing 0 would fail alone. A **deliberately typed 0 is kept as 0**.
- ⛔ **THE INBOX EXEMPTS A PAID CONVERSATION FROM THE STATUS FILTER** — `useInbox` builds
  `paidLeadIds` off the same paginated leads read (it already selected `amount_paid`), `WaConversation`
  carries `isPaid`, and the filter reads `leadStatus === statusFilter || unassigned || isPaid`. Same
  convention as `unassigned`: a bucket that must always be visible is **exempted**, never relied on to
  happen to match.
  - ⚠️ **SCOPE, STATED: the status filter ONLY.** The campaign filter and the default hide of
    `not_interested`/`closed` are unchanged — the latter deliberately, because *Remove from inbox*
    works by setting `status = 'closed'`, and exempting paid leads there would make a paid thread
    **unremovable**. If a paid customer ever vanishes from the Inbox, check those two before the code.
- ⚠️ **THREE COLUMNS LOST THEIR ONLY EDITOR AND NOBODY HAS NOTICED YET:** `project_duration`,
  `next_checkin_date`, `checkin_notes` were editable **only** on that page. **The data is untouched**
  and still on `outreach_leads`; there is simply nowhere to set them now. The whole check-in feature
  (overdue counts, "due today") went with the page. Not an oversight — the brief named the four fields
  to move and these were not among them. `useOutreach.updateClientDetails` is now **dead code**, left
  in place rather than removed mid-task.
- ⛔ **THE `wa.me` ROW BUTTONS WERE NEVER CALL BUTTONS.** `OutreachTable` and `OutreachMobileCard` each
  had a **"WhatsApp Call"** item in the phone dropdown whose href was `https://wa.me/<number>` — which
  **opens a CHAT, not a call**. So they were a second way to message someone *outside* the app: no
  `whatsapp_messages` row, no thread, no reply window, invisible to every count (§6: counts come from
  `whatsapp_messages`). Both now open the **in-app thread** via the same handler as the green WhatsApp
  button, relabelled **"WhatsApp thread"**.
  - ⚠️ **Routed through `handleWhatsAppClick` / `onWhatsAppClick`, NOT a hand-built `/inbox?c=<key>`.**
    The key is `${user.id}::${normalizeWaNumber(phone, country)}`; building it at the call site would
    be a second copy of that rule and would open an **empty** Inbox for a lead with no thread yet.
    `startFromLead` resolves it, creates a synthetic conversation when there are no messages, and
    **then writes `?c=` into the URL itself** — so the destination the brief asked for is reached by
    the path that cannot miss.
  - ⚠️ **AND IT DOES COST SOMETHING: there is no longer any route from the app to a WhatsApp VOICE
    call.** Flagged to Paul; a one-line revert if he wants it back.
  - ✅ **`generateWhatsAppUrl` (`leadUtils.ts:87`) HAS NO REACHABLE CALLERS.** Its two callers are
    `SingleWhatsAppDialog` — mounted in `OutreachTable`, but `setWhatsappDialogLead` is **never called
    with a lead**, only with `null`, so the dialog can never open — and `openBulkWhatsApp`, which has
    no callers at all. Left alone; changing it would achieve nothing. Don't re-derive this.
- **Untouched on purpose:** the Inbox thread header's `wa.me` fallback (`Inbox.tsx`), `Landing.tsx`,
  `Start.tsx`, and the report's WhatsApp CTA (`aiAuditReportHtml.ts`).
- ⚠️ **VERIFIED AGAINST REAL DATA, AND THE HARNESS REPRODUCED THE 1,000-ROW TRAP WHILE DOING IT.** A
  read-only service-key script drove the real exported predicates over the real lead table: **exactly
  one lead has `amount_paid > 0`** (RG Locksmiths, £19.99, `payment_received`, not archived, thread
  `user_id` matching the lead's) and `isPaidLead` returns true for him. The first draft asked for
  `limit=2000`, **got exactly 1000 rows back, and RG was one of the ones that fell off the end** — the
  same truncation that hid him from the Inbox for real. Paginate, always.
  ⚠️ **The divergence the sentinel exists for is currently ZERO** — with one customer whose status is
  `payment_received`, a status filter would coincidentally agree today. The design is right for the
  second customer, not provable on the first. **Nobody has SEEN any of this** (§2: screenshots need Paul).

---


---

> Moved from CLAUDE.md §6e on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: Almost everything this section describes was DELETED on 2026-09-09 (the per-town market view). The niche verdict on Coverage survives. Archive, not current state.

## 6e. ✅ DETERMINISTIC MARKET TARGETING — built 2026-08-14, Paul's spec. Read before touching the market view.

**A pool business is scored by `nameMatches` over the stored chatgpt/gemini `answer_text`, exactly
as the report and the week-8 guarantee score an audited business.** `TARGET_MAX_NAMED_SHARE = 0.4`
(`src/lib/marketView.ts`, INCLUSIVE — ≤40% of answers = target, Paul will tune it): targets sort
worst-first, >40% is excluded as already winning, and both exclusions are itemised expandables in
`MarketPanel` — never silent, Paul's explicit rule.

- ⛔ **EXTRACTED COMPETITOR NAMES ARE NO LONGER AN INPUT TO TARGETING, AND MUST NOT BECOME ONE
  AGAIN.** The old path joined the pool to the extracted fold via one shared `groupNames` pass and
  subtracted `established` (leader-relative) entries. Three measured faults, each sufficient alone:
  junk polluted the counts ("Here" in 17/37 Aylesbury answers); the LEADER-RELATIVE threshold
  subtracted Chester's Saltney Locksmiths while AI named it in **16%** of answers; and — the worst —
  **junk BRIDGED real firms in the union-find**: the single raw mention "Lock" welded Lockforce,
  LockFit, Lock Around The Clock and Aylesbury Lock and Key Centre into one 23-name group scored as
  one firm. The named-intel fold still groups mentions for display and the shape verdict; the pool
  now has its own `groupNames` pass over Places names alone (chain folding), which junk cannot
  enter.
- ⛔ **`search_cache` IS NO LONGER DELETED** (`cron-run`, 2026-08-14). The nightly 72h delete
  physically destroyed the scraped list — measured that day: **113 of 123 measured markets had no
  pool to show**, which was the "never-named businesses don't appear" bug in practice. `market-view`
  now serves an old pool as poolState **`stale`** (same fields as `ready`): businesses visible with
  the search date on them, and **every freshness/spend gate still keys on `ready` alone**
  (MeasureMarket's `poolCount`, the measure flow's search skip). `expired` survives only for pools
  the old cleanup already destroyed — a re-search rebuilds them (~11¢). Do not "tidy" a TTL delete
  back in.
- ⛔ **WRONG-TRADE IS A DISPLAY FILTER WITH AN ITEMISED ESCAPE HATCH, NEVER A SILENT CUT.**
  `offTradeMarkForGroup` (group-level: untyped branches never vote; ONE on-trade branch clears a
  chain — Timpson has branches typed both "Services" and "Locksmith"). Off-trade rows sit in an
  expandable "Excluded: N (wrong trade)" with their scores, Google's own label, and an **Add
  anyway** button, because Google's categories are imperfect and Paul wants to catch a real
  locksmith filed under "Services" by reading the list.
- ⛔ **ZERO SCORED ANSWERS = `unmeasured`, NEVER `target`** — `poolTargetVerdict` owns this (ninth
  instance of the absent-value shape, caught at design time). `scripts/market-targets.test.ts`
  drives it, the boundary inclusivity, the group off-trade absence rules, and the
  junk-cannot-score integration cases.
- ⛔ **OPENING A MARKET NEVER SPENDS — the auto-clean-ON-OPEN was built 2026-08-14 and REMOVED THE
  NEXT DAY. Do not rebuild it.** It fired a "Cleaning up the names… ~14p" toast plus a minute of
  spinner on every arrival at a dirty market (its once-per-session ref lived in MarketPanel, which
  remounts on every navigation — §6c), and with every recent market dirty from the cleaner outage
  it read as "Market view starts a new scan" — reported by Paul as exactly that. His rule, stated
  twice now: **Market view shows what exists, free; only Find leads and the measure/audit buttons
  may spend, and each says its price on its face.** New measurements still self-clean at
  finalisation (the process-ai-audit-queue hook — automatic, part of the run already paid for);
  the backlog keeps the manual "Clean the names" button under the refusal.
  - 🔴 **CONSEQUENCE, STATED, NOT HIDDEN: a market with a dirty fold shows its targets and named
    counts but keeps the "Names not cleaned · no verdict" refusal until SOMETHING cleans it** —
    the manual button (~7p/run) or a re-measure. The deterministic scoring grades TARGETS only;
    the verdict grades who's-WINNING, which needs the extracted names (firms with no Places
    listing, the cross-town national test), so it cannot be derived from the pool — that trade-off
    was examined and kept 2026-08-14.
  - ✅ **THE CLEANER'S SILENT FAILURE — CAUSE CAPTURED 2026-08-19: THE OPENAI ACCOUNT IS OUT OF
    CREDIT.** Fired live on a dirty Eastbourne run: `openai_http_429 · "You have no credits
    remaining" · credit_balance_exhausted`. The key is VALID (it authenticated; a dead key 401s),
    the auth plumbing and the queue's auto-clean hook are healthy — every fold since ~08-10 died at
    OpenAI's paywall. **The fix is Paul topping up at platform.openai.com → Settings → Billing;
    nothing in Supabase changes.** Once credited, new audits self-clean immediately (no deploy);
    the backlog was 25 dirty markets / 49 runs ≈ **$3.43** to catch up. ⚠️ The first diagnostic
    401 that session was the probe's own EXPIRED JWT — mint fresh before believing a 401.
  - ⛔ **SINGLE-WORD JUNK CAN NO LONGER REACH ANY FOLD (2026-08-19): `src/lib/knownEntities.ts`.**
    Marker words are dropped from the fold's GROUPING INPUT in `market-view` (they cannot occupy an
    entry, bridge firms in the union-find, or inflate counts) while `uncleanedCount` still reads the
    RAW mentions — multi-word junk ("Services LTD", "AM Wed") still needs the LLM cleaner, so the
    "Names not cleaned" refusal deliberately still fires. The marker set + `isUncleanedName` MOVED
    to that leaf; marketView.ts re-exports (import-at-top pattern).
  - ⛔ **KNOWN NATIONALS/DIRECTORIES ARE A CURATED LIST THAT CLASSIFIES, NEVER ADDS** (same law as
    directoryFacts §6). `classifyKnownEntity` — whole word-token matching (substring traps designed
    out; a single-word entity only matches ≤2-token names, so "Bark & Birch Locksmiths" is never
    the directory Bark). Consumers: named-fold rows carry `known: 'national'|'directory'` (panel
    badges); the national-led verdict counts a known national as national even at otherTowns=0
    (Able Group topped electrician/Portsmouth's naming with ZERO cross-town evidence — the scan is
    blind in a trade's first town) and EXCLUDES directories from its top-N; the report's
    `isRealCompetitor` drops directories (Checkatrade passed every filter and could print as a
    client's rival) and marker words. **Paul appends names to the two arrays himself.**
    `scripts/known-entities.test.ts` pins all of it. ⚠️ send-whatsapp-message +
    process-whatsapp-queue import the changed auditReport.ts but stayed UNDEPLOYED (§6g hold) —
    their WhatsApp {{2}} lists keep the old filtering until that hold lifts; redeploy them with it.
  - ✅ Coverage's row buttons carry their prices: "Find leads · ~{asPence(MARKET_SEARCH_USD)}"
    (derived — never hand-type a pence figure, §4's constants rule) and "Market view · free". The
    measure button already priced itself ("Refresh this market · free" included).
- ⚠️ **THE TARGET LIST'S FLOOR IS STILL GOOGLE PLACES.** A firm AI names that has no Places listing
  in the town stays in the named-intel list only — there is nothing to contact. Aylesbury is the
  honest example: in-town Places holds 3 real entities (2 already winning at 50%/84%, Timpson a
  chain), so the winnable businesses are the **11 nearby** locksmiths, all real, all typed
  `locksmith`, listed under "Nearby, outside the town boundary".
- ✅ **THE FRAGMENTATION VERDICT — built 2026-08-15, Paul's spec: one mass-outreach pass/fail per
  market.** `fragmentationVerdict` (`marketView.ts`, pure; `market-view` computes it into the
  REQUIRED `fragmentation` payload field; MarketPanel renders it at the top of the summary box).
  Metric = targets ÷ gradeable (right-trade entries, CHAINS IN THE DENOMINATOR never the
  numerator, off-trade outside both). **Junk-immune by construction** — inputs are the
  deterministic nameMatches scores, so it never waits for the LLM cleaner.
  - ⛔ **Thresholds MEASURED 2026-08-15 over all 20 pool-bearing markets** (§4's constants rule):
    target-share distribution `80 80 77 71 70 63 61 58 57 55 54 50 50 45 44 43 38 │ 29 14 0` —
    the known-skip markets (Southport 29, Nuneaton 14, Aylesbury 0) sit below a 29→38 break, so
    **`FRAG_MIN_TARGET_SHARE = 0.35`** (mid-gap, inclusive). **`FRAG_MIN_GRADEABLE_ENTRIES = 5`**
    (the three smallest live pools — 2, 3, 4 entries — are exactly the ones whose verdicts would
    be noise). Both named exports, Paul tunes them.
  - ⛔ **Zero scored answers = `unmeasured`, tiny pool = `pool_too_small`** — never a confident
    word (11th absent-value instance). `scripts/fragmentation.test.ts` pins the guards, the
    inclusive boundaries, the chain/off-trade sides, and the Nuneaton/Halifax/Aylesbury shapes.
  - The panel line carries a **confidence tag** (scored-answers count) and a **"Deepen · +1 audit ·
    ~7p"** button that opens the EXISTING market-audit confirm — a third audit is never automatic.
- ✅ **BATCH ADD + BATCH MEASURE — built 2026-08-15, Paul's spec, both explicit and priced:**
  - **"Add all N targets · ~Xp"** (MarketPanel, renders ONLY on a measured market): loops the
    SAME `addLead` the per-row button uses over `auditable` — a list that is structurally pure
    (winners never enter `view.pool`, wrong-trade and chains filtered), worst-named first.
    Duplicates return null and are counted, never re-added. **Adds ONLY**: leads land
    `not_contacted`; nothing is queued or sent, and the toast says so. ~$0.02/lead (the Places
    lookup, which also verifies the town for free).
  - **Coverage ROW actions — built 2026-08-16, Paul's spec.** Per row: **"Market view"** (smart:
    one FREE market-view read; measured → reveals **"Add all N · ~Xp"** instantly; unmeasured →
    priced confirm → in-place spinner, NO navigation, polls every 30s until `measureAction`
    resolves to 0-audits; in-flight audits re-attach) and **"View"** (the old nav link, renamed —
    plain navigation to the panel, always free). The row's add-all and the panel's share ONE
    target filter (`auditableTargets`) and ONE lead mapping (`poolRowToLead`), both in
    `marketView.ts` — the no-drift rule. Row gates (ambiguity, zero businesses) SKIP with the
    reason and point to the panel; a row action never overrides a gate. Row state is
    session-only and re-derived from the DB on every press — nothing persisted, mid-measure
    navigation is safe (audits continue server-side; re-press re-attaches).
  - **"MEASURING NOW" — built 2026-08-17, after Paul lost his place mid-measure.** The spinner no
    longer lives in session state: `useInFlightMeasures` (pure fold in
    `src/lib/inFlightMeasures.ts`, tested) derives what is measuring from
    runs(pending/running) → audits(`is_market === true` STRICTLY — a paid baseline in flight must
    NEVER render here; absence excludes, instance twelve) → queue counts, all owner-RLS client
    reads (MeasureMarket set the precedent). Polls every 30s ONLY while non-empty. Rows
    self-restore their spinner on return with no press; a market leaving the list auto-reveals
    "Add all N" via one free read; the strip above the table names every in-flight market with
    progress and age (stalled graded by `MARKET_AUDIT_STALE_MS`); and the concurrency guard +
    disabled confirm read this list and NAME the running markets instead of greying out
    silently. The per-row market-view polling loop was DELETED — one watcher, not two.
    (Was a one-at-a-time lock until 2026-08-17 — superseded by the concurrency cap below.)
  - **CONCURRENT MEASURES + THE BASELINE-PRIORITY CLAIM — built 2026-08-17, Paul's spec, four
    parts shipped together ("item 2 is the seatbelt for 1/3/4").** He runs 5-market waves
    routinely now; his own morning wave (5 markets, 12 runs, all complete) proved the queue
    absorbs it.
    1. **`MEASURE_CONCURRENCY_CAP = 5`** + `measureSlotsLeft()` (`marketView.ts`, named exports,
       Paul tunes) — ONE slot pool for the row buttons and the batch. At the cap the row confirm
       disables and **names every running market**; the batch offers
       `min(MEASURE_BATCH_CAP, free slots)` towns and its dialog says so. ⛔ Still not a spend
       guard — every measure keeps its own priced confirm, and free reveals are never blocked.
    2. **`process-ai-audit-queue` claims baseline rows FIRST each tick** (two-phase CANDIDATE
       selection: pending rows whose `audit_id` is in `ai_audits.baseline_target_runs NOT NULL`,
       oldest-first, then fill oldest-first; the atomic
       `.update().in(ids).eq(status,'pending').select()` claim is UNCHANGED, only which ids are
       offered changed). The returned `claimed` array is also **sorted baseline-first before the
       in-flight-headroom handout** — the update returns rows in arbitrary order, and without the
       sort a baseline could be deferred while a market row took the last Apify slot. ⛔ A paying
       customer's guarantee measurement (RG's ~6 Oct re-measure) must never queue behind
       prospecting — that is the whole point. `audit-baseline.ts` untouched. With no baseline
       pending, the fill query IS the old oldest-first behaviour.
    3. **Finished-while-away reveal** (Coverage mount, per trade): complete market runs from the
       last 2h minus in-flight, up to 6 FREE market-view reads → idle rows open on "Add all N
       targets". Never overwrites a pressed row (`rowFlow` guard), and the live spinner takes
       render precedence, so a premature reveal self-corrects. Reads only — nothing measured,
       nothing spent.
    4. **`useInFlightMeasures` refreshes on window focus/visibility** — a measure started from
       the market panel in another tab appears without waiting for a poll that may not be
       running (the interval stops at empty).
    `scripts/in-flight-measures.test.ts` pins the slot arithmetic, including cap ≥ 2 (the
    multi-measure contract — 1 would silently reinstate the one-lock) and over-cap clamping to
    zero (panel-started measures can exceed the cap; the count must never go negative).
  - **"Measure next N unmeasured · up to ~Xp"** (Coverage, `MEASURE_BATCH_CAP = 5`/press): strictly
    sequential towns; per town it re-checks via a FREE market-view read and routes through
    `measureAction` (already-measured → refresh → **0 audits, skipped**), skips fresh-pool searches,
    and applies the ambiguity + zero-businesses gates as SKIPS (batch never overrides a gate —
    overrides live on the panel). Worst case ~22p/market (search + 2 audits). ⛔ **The free-on-click
    rule stays absolute: nothing on Coverage measures on navigation.** Verdict words on Coverage
    rows were DECLINED 2026-08-15 — do not build them unasked. (The baseline-priority queue lane
    was also declined that day, then **explicitly APPROVED and built 2026-08-17** as the seatbelt
    for concurrent measures — see the concurrency bullet below.)
- ✅ **THE NICHE VERDICT'S FRONT DOOR IS ON COVERAGE, BESIDE THE TRADE PICKER (2026-08-28).** It was
  reachable ONLY from inside `MarketPanel`, which needs a chosen trade AND town — so the read that
  decides whether a whole trade is worth outreach sat behind picking one town and pressing a per-town
  button, and read as though it were about that town. **The fold was always trade-wide**
  (`market-view`'s `niche` action takes a trade and no town, and folds every business audit of that
  trade across every town); only the door was wrong. `NichePanel` gained `autoLoad`, so opening the
  panel loads it — safe ONLY because the fold is free (§6e's opening-a-view-never-spends rule holds:
  it re-reads stored audits and touches no paid API).
  - ⛔ **`key={trade}` ON THE PANEL IS A CORRECTNESS GUARD, NOT A PREFERENCE.** Without the remount,
    switching Plumbers → Locksmiths leaves the plumber fold on screen under a Locksmiths heading
    until the refetch lands — a stale read presented as a decision, which §6c weighs above losing
    your place.
  - The open state persists (session, user-scoped): a panel you chose to open is configuration, and
    it is not a dialog, so the never-persist-an-open-dialog rule does not apply. Session not local
    because re-opening re-reads, and free is not instant.
  - ⚠️ **Auto-load removed the implicit retry** (the invitation card's own button), so the error state
    got an explicit one — an auto-loaded panel that fails must not be a dead card.
  - **Measured live 2026-08-28, Plumbers:** 75 businesses · 18 towns · 85 audits · 1,100 answers →
    **worth_outreach, tier INDICATIVE.** ChatGPT 112/485 (23.1%), Gemini 22/485 (4.5%), AI Overview
    5/130 (3.8%); directory share ChatGPT 46.9% vs **Gemini 12.5%** (Gemini reads other businesses'
    own sites 85.8% of the time) — §5's model, at trade scale, from one free click.
- ⚠️ Old-SPA/new-payload overlap is a 10-minute sessionStorage cache (`useMarketView`), same as
  every market-view deploy. Deploy `market-view` BEFORE pushing the SPA.

---


---

> Moved from CLAUDE.md §6f on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 6f. ✅ THE TOWN GATE — verify-on-import + five server gates, built 2026-08-14, Paul's spec

**The Wilson's Valeting rule: money and messages never move on an unverified town.** One predicate,
`src/lib/townVerdict.ts`, read by every gate and the Outreach badge: `verified` (derived_town
present), `unverifiable` (no town AND a settled note), `unchecked` (everything else).

- ⛔ **DERIVED, NEVER STORED — there is NO town_status column and there must not be one** (§6's
  serveGate rule). The state already lives on the lead: `derived_town` + `town_fetched_at` +
  `town_fetch_note`, written only by `resolveDerivedTown`. `SETTLED_TOWN_NOTES`
  (`_shared/place-details.ts`) holds the ONLY two notes that gate: `no_town_in_address` (Google
  answered; no town) and `no_place_id` (nothing to ask about). Every transient failure — 429,
  outage, cost cap, missing key — stamps a retryable note or nothing, and `scripts/town-verdict.test.ts`
  pins that a transient or unknown note NEVER gates. **Gates fire only on `unverifiable`;
  `unchecked` always passes** (absence is never an answer — instance ten).
- **The five server gates, each reporting its skip, never a silent shrink:**
  | Where | Behaviour |
  |---|---|
  | `process-whatsapp-queue` | excluded in the claim query (like archived); `unverifiedQueuedCount` in the status payload; own empty-queue skip code. ⛔ **BLANKET by Paul's call** — holds the plain opener too |
  | `instantly-push` | own id list `townUnverifiedIds` + count (bulk-jobs maps outcomes from id lists — a lead in none reads "gave no reason") |
  | `bulk-jobs` | triage rung → `cannot` with the shared reason; item branch → `skipped_town_unverified` (own status member, like `skipped_suppressed`) |
  | `create-ai-audit` | 409 `town_unverified` on BOTH auth paths (covers wizard, Inbox, whatsapp-inbound chain). ⚠️ **Baselines exempt, deliberately** — the paid path runs on the customer's own confirmed_location, and a prospect-era flag must not break the guarantee chain. Market audits have no lead_id and never reach it |
  | `derive-audit` | 409 before deriving — its town line falls back to search_location, the exact wrong-town fault |
- ⛔ **CSV IMPORT VERIFIES AS IT LANDS** (`bulkImportLeads` → `backfill-lead-towns` with the new
  ids, chunked at MAX_PER_CALL so a big file is verified in full). Id-less rows get the
  **three-guard place resolution** in `backfill-lead-towns`: Text Search **Pro** ($0.032, mask
  places.id/displayName/formattedAddress — the IDs-only mask is free but returns no name, and a
  resolver that cannot check the name is a blind top-result), then (1) `nameMatches` both ways,
  (2) exactly ONE distinct survivor, (3) whole-token town-hint agreement; **no location text on the
  row refuses outright**. A refusal runs `resolveDerivedTown` with no place_id → settled
  `no_place_id` → gated, with the specific reason itemised in the response. Transient search
  failures stamp NOTHING (stamping a settled note on our own outage would permanently gate a good
  lead) and are never cached.
- ⚠️ The residual false match that survives all three guards is a same-name business in the same
  hinted town — whose derived_town is still the right town, the quantity being verified.
- ✅ **DECIDED 2026-09-15, PAUL'S CALL: A FREE-CHECK LEAD GOOGLE CANNOT RESOLVE IS HANDLED BY HAND.
  NOTHING IS BUILT, AND THAT IS THE DECISION — do not re-open it without a third case.** The
  question was what to do when a free-check visitor's business cannot be found on Places, so the
  lead grades settled-unverifiable and every message lane refuses it.
  - ⛔ **THE NUMBER IS WHAT SETTLED IT, AND IT SHOULD BE RE-COUNTED BEFORE ANYONE BUILDS ANYTHING.**
    Measured that day: **4 leads have EVER been town-unverifiable; 2 unarchived; both free checks;
    ZERO have a phone; ZERO are in the queue.** One of the two is Paul's own test (`richard` /
    `plummer` / rich@move37.fun). **The real population is one lead.**
  - ⚠️ **AND THE GATE WAS THIRD IN LINE FOR IT, NOT FIRST.** Power pulse has no phone and a
    non-resolving email, so opening the gate changes nothing for it. Paul's instruction was
    explicit: **do NOT resolve Power pulse.** Unblocking one lane of three is not a fix.
  - **The handling, when one matters:** set `derived_town` on the lead and clear `town_fetch_note`.
    Every gate passes immediately, no deploy. ⚠️ **Stated cost: afterwards it is indistinguishable
    from a town Google verified** — there is no record that a person decided it.
  - **The three options that were REJECTED as more machinery than the problem**, kept so they are
    not re-invented: (B) extend the audit's `town_confirmed` exemption to the message lanes on the
    strength of the visitor's TYPED town — the delicate part is the queue's `.or()` SELECT filter;
    (C) a recorded operator-override state so "a person vouched" stays distinguishable from "Google
    said so"; (D) an operator screen over the three-guard place resolution's rejected candidates,
    which is the only one that would have solved Power pulse end to end — **and is worth doing for
    the phone, website and address it would buy, never for this gate.**

- **Backlog** (measured 2026-08-14): 498 leads lack derived_town, **384 unarchived** — all with
  place_ids, ≈ $1.92 via the Outreach table's **"Fix missing town" button — ONE press** (the
  explicit lead_ids path has no per-call slice, and $1.92 sits inside PLACE_DETAILS_CAP_USD
  $6/day). The archived 114 are skipped by design.

---

