# Full-app design consistency (2026-10-06)

Branch `improve/full-app-design-consistency` (off `main` 5c816c3f, reconciled with `main` 5b5b0d8e — the Concept 4
quick report — before merging). **Production commit `adff5e41`.** Frontend only; no edge function deployed.
Inventory and per-surface status: `docs/design/full-app-ui-audit.md`.

## Design principles (unchanged from the operator pass, now applied everywhere)
- The **Sales dashboard** is the reference; Find Leads, Outreach and the Call workspace are kept as they are.
- One token source (`TONE`), one surface (`SURFACE`), colour with meaning: green (drawn teal) money / done ·
  blue information / workflow · amber attention / waiting · purple audits / AI · red failed / destructive.
- Every page: icon tile + title + one line of purpose + actions, left-aligned at every width.
- Every popup: `DialogHero` title row (icon, title, short line), base dialog shell, footer that wraps.
- No box inside a box: `SubSection` groups inside a surface; a bordered box only for a distinct object.
- One look for loading / failed (Retry) / empty / not allowed.

## Inventory
36 routes; 40 files rendering a dialog / alert dialog / sheet; every component over ~180 lines measured for
shared-look adoption. Before: 16 pages and ~35 popups did not use the shared look.

## Shared components (leaves — no app hooks; `paid-client-tools.test.ts` pins the import list)
- `salesDash/primitives.tsx`: `PageHeader` gains `icon`, `tone`, `testId` (no icon = the dashboards' header, unchanged).
- `operator/ui.tsx`: `LoadState`, `ErrorState` (Retry from the caller), `EmptyState`, `DeniedState`.

## Surfaces changed (behaviour, handlers, conditions, roles and test ids unchanged)
- **Page headers:** Find Leads, Outreach, Coverage, AI Audit, API usage & Security, Campaigns, Templates, Mockups,
  Feedback, Website Build (both views), Baseline, Compare, Paid baseline setup, Team. WhatsApp keeps a compact header
  with the icon tile (two-pane screen). Client hub keeps its client hero. Not found is an `EmptyState` with a way home.
- **Popups (~35):** Outreach row dialogs, Add lead, Log this call + next action, Lost reason, Hook audit, Prospect
  audit / preview, website crawl, Single WhatsApp, Voice note, Request template, the five Inbox dialogs, Welcome
  pack, Manual onboarding, Campaign edit, Templates, AI Audit's four, Client hub's three, Command palette shortcuts,
  Feedback, User menu password, Trade auto-fix, Team composer. Destructive confirms use the destructive variant.
  The three old dark splash popups (post-contact, Outreach tips, Outreach intro — the intro had **no title**) rebuilt.
- **States:** ad-hoc spinners / red text / blank panels → the shared states on Inbox, queue panels, Coverage,
  Campaigns, Templates, Mockups, Feedback, API usage, Security panel, Sales checks card, Submissions, Free-check
  progress, Niche panel, AI Audit list, Baseline, Compare, Paid baseline setup, Website Build, Monthly update, Team.
- **Admin:** API usage & Security (was the weakest: full-screen spinner / error, flat cards) → header in every state,
  KPI tiles, panels, alert callouts, a coloured mode chip. **Team** shows, per salesperson, sales count, commission
  earned and owed (from `sales-earnings`, admin scope — the same ledger as the Sales dashboard; nothing computed in
  the page; absent until loaded, never a guessed zero) and any sale **held for review** (open attribution reviews).
- **Salesperson:** Outreach / Find Leads headers, every lead popup, Log call, Add lead, CSV import, WhatsApp.
- **Mobile (390 px):** headers left-aligned with wrapping actions; lead popup name no longer squeezed to two letters
  (pills wrap under it); Team rows wrap; Security rows no longer force 240 px minimums.
- **Accessibility:** every popup has a title (pinned by a sweep test); the phone Import button and the Inbox lead
  placeholder got accessible names; errors are `role="alert"`, loading `role="status"`.

## Intentionally unchanged
Sales dashboard, Admin dashboard, Find Leads and Outreach bodies, the Call workspace, Quick Close, CSV import, Paid
Clients list, Page Plan / Page Generator / Review Replies, client-hub cards, Notification centre, Engagement end,
payouts. The client-facing report (Concept 4 workstream) is out of scope.

## Deferred (with reasons — also in the audit)
AI Audit body; Website Build advanced inner cards; Outreach row dialog bodies; Mockups' small headings; the campaign
card's green method chip (green means money — Paul's call); faint sign-in input borders.

## Functional notes found, not fixed
- `OutreachIntroModal` is never opened (nothing dispatches `show-outreach-intro`) — belongs with the tour cleanup.
- `OutreachTipsDialog` keeps an unused `contactMethod` state; its copy says the opener "auto-rotates between 6 proven
  casual openers" — possibly stale, not verified.
- `CompareMeasurements.tsx` has an unused `MoveChip` / `Badge` import.

## Tests
- New `scripts/full-app-design-consistency.test.ts`: the primitives render what they promise (icon tile, left-aligned,
  announced load / alert error, Retry only with a handler, empty with action, denied); every page has `PageHeader`
  or a recorded reason; every Dialog / AlertDialog / Sheet in `src/` has a title; all 36 routes, every sidebar and
  phone-menu entry and the sales / admin route rules unchanged; the QA fixes pinned.
- Edited: `paid-client-tools` (leaf allowlist + `lucide-react`, `ui/button`), `paid-baseline-state-flow` (accepts
  `LoadState`'s spinner). No behavioural assertion weakened.
- Each restyling group ran every suite naming its files (75 + 64 + 33 + 44 runs). A marker sweep compared handler /
  fetch / test-id / aria counts per file before and after: every drop was a retry moving into `ErrorState onRetry`
  with the same function, or a test id moving into a `testId` prop.
- Gate: `npm run check` — typecheck at the 9-error baseline, edge checks, build, **340/340 suites** (after merging
  `main`).

## Visual QA
The REAL app (real `index.html`, router, role gate, shell) built from the worktree with four modules swapped for
fixtures (Supabase client, auth, subscription, readiness; the Sales dashboard fed by the real folds; fictional
"ZZ QA" businesses), driven by headless Edge over CDP at **1440 px and 390 px**, dark theme. 34 scenarios × 2 = 68
screenshots (temporary, not committed): every page above, the salesperson's dashboard and Outreach, three forced
server failures (error states), and the popups — Add lead, CSV import, lead popup, its Close tab (Quick Close), Log
this call, next-action picker, remove confirmation, new campaign, client details, Team onboarding. **No render crash,
no page-level horizontal overflow at 390 px, every popup titled and on screen.** Found and fixed on the way: API usage
lost its header when loading / failed; lead popup name squeezed on a phone; Team rows squeezed on a phone (money chips
cut off); the phone Import button had no accessible name. The harness was deleted before commit.

## Deployment
- Functions deployed: **none** — `check-import-graph --reached-by` on every changed `src/` file: reached by no edge
  function.
- `whatsapp-status`: **v114 before (updated 2026-09-30), v114 after** — not deployed, in no closure touched.
- Production commit: `adff5e41` (`main`), Cloudflare Pages from `main`.

## Live verification (after deploy)
- Cloudflare built `main` adff5e41 in ~2½ minutes. **Both `app.leadfinderos.com` and `leadfinderos-next.pages.dev`
  serve the same entry, `index-DZ-gU8Cc.js`** (was `index-Dgns3gfB.js`).
- Following every chunk from the entry on both hosts: present — the What's New id `2026-10-06-full-app-design`,
  `team-member-money`, "Return to Home", "Import leads from a CSV". (`denied-state` is absent because nothing uses
  `DeniedState` yet — tree-shaken; the check's own fault, not the deploy's.)
- Public pages rendered in the in-app browser: `/auth` (the sign-in card is now the shared surface — no hard-coded
  black box, no horizontal overflow) and an unknown path (the new "Oops! Page not found" panel with Return to Home).
- **Authed pages were NOT opened live**: the in-app browser has no session and none was created (a sign-in on Paul's
  account is his call). Their live state is proven by the chunk markers above and by the fixture QA; nobody has yet
  *seen* the signed-in production screens with this release.
- `whatsapp-status` read after: **v114**, updated 2026-09-30 — untouched. Nothing was sent, called or charged.

## Follow-up (Paul, 2026-10-06): campaign chip + Outreach tips
- The campaign card contact-method chip (Call was solid sky, WhatsApp solid emerald) is now `ToneChip tone="blue"` with its icon for every method — green stays for success / money. Checked in a throwaway harness on the real Campaigns page at 1440 and 390 px with a Call, a WhatsApp and a legacy (no method → WhatsApp) campaign: all blue, icon shown, no overflow.
- Outreach tips `tip1Desc` said the Initial Contact template "auto-rotates between 6 proven casual openers" — stale since 2026-09-27 (choose a template → that exact template is sent; no rotation, pinned by `initial-opener-select.test.ts`). Now: "Choose one of the approved opening templates and send it. The one you choose is exactly what goes out — nothing is rotated or swapped." No behaviour changed.
- Same stale claim left in two legacy-only places (shown only in an old auto mode / walkthrough): `SingleWhatsAppDialog` (`autoOn`) and `TemplatePicker` (`isWalkthrough`). Not changed — noted for the tour cleanup.
- `OutreachIntroModal` stays dead and deferred.
