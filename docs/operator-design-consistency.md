# Operator design consistency + admin nav cleanup (2026-10-06)

Branch `improve/operator-design-consistency-admin-nav` (off `main` ee87afb8). **Not merged, not deployed.**

## Why
The Sales dashboard, Find Leads and Outreach had the right feel (colour with meaning, icon tiles, pills,
clear states). Dialogs, the Paid Client pages, Team and the admin cards read as a different app: grey
boxes inside grey boxes, flat headings, centred phone headers, stacked full-width buttons. Paul also no
longer needs Review Replies, Page Gen and Page Plan as admin destinations — they belong in Paid Clients.

## 1. The shared look — one token source
- `src/components/salesDash/primitives.tsx` (NEW, a LEAF): `TONE`, `SURFACE`, `PageHeader`,
  `SectionHeading`, `Segmented`, `KpiCard`, `Figure`, `Empty`, `Dot` — moved verbatim out of
  `salesDash/ui.tsx`, which re-exports them (every old import still works) and keeps `Panel` (its collapse
  control reads the signed-in user).
  ⛔ Why a leaf: a component rendered from plain data under tsx (`prospect-full-crawl-audit.test.ts`
  renders `ProspectAuditView`) cannot load `useAuth` → the Supabase client (`import.meta.env` is
  undefined there). The leaf imports only react, `@/lib/utils` (and operator/ui adds `ui/dialog`);
  `paid-client-tools.test.ts` pins that.
- `src/components/operator/ui.tsx` (NEW, a LEAF): re-exports the leaf primitives and adds what the
  dashboards never needed: `IconTile`, `ToneChip` (status pill), `Callout` (success / warning / error /
  info; red sets `role="alert"`), `SubSection` (a group inside a card with a coloured marker and NO
  border — the cure for box-in-box), `DialogHero` (dialog header: icon tile + DialogTitle +
  DialogDescription + chips), `ActionBar` (dialog action row; `sticky` when the dialog scrolls), `Fact`,
  `EDGE` (3px coloured left border by state). Import `Panel` from `@/components/salesDash/ui`.
- Colour meaning (unchanged): green (drawn TEAL) money / done · blue info / activity · amber attention /
  waiting · purple audits / AI · red blocked / failed · grey secondary. No emerald for "done".
- Base components (every dialog in the app inherits these):
  - `ui/dialog.tsx`: `bg-card`, the dashboards' soft deep shadow, `sm:rounded-[1.25rem]`, never taller
    than the screen (`max-h-[100dvh] overflow-y-auto`; a dialog with its own scroll passes its own and
    wins), 36px round close button, header left-aligned at every width (`pr-8`), footer
    `flex-wrap justify-end gap-2` (no full-width stack on a phone), bolder title, blurred overlay.
  - `ui/alert-dialog.tsx`: the same for confirmations.
  - `ui/tabs.tsx`: the dashboards' segmented pill track.
  - `ui/card.tsx`: `rounded-2xl border-border/70`.
  - `CollapsibleSection.tsx`: a `leading` slot (the hub stages' icon tile).

## 2. Surfaces restyled (behaviour, handlers, conditions, roles, test ids unchanged)
Paid Clients list (PageHeader, Clients/Tools switch, filter pills, client cards with a state edge and
chip), the client page (`ClientHub.tsx`: header, Figure strip, every stage a SURFACE with an icon tile
by key — `STAGE_LOOK` — and a state edge; grid `minmax(0,1fr)` so nothing pushes a phone sideways),
`ClientSetupCard`, `ClientHandoffCard`, `ClientTimelineCard`, `ClientMissingInfoPanel`,
`EngagementEnd` (Mark completed is now the red destructive button, last), Quick Close (panel header in
the hero layout — the panel also renders in the workspace Close tab, outside a Dialog, so no
DialogTitle in it), CSV import, the detailed audit window (`ProspectAuditView`), the lead dialog SHELL
only (header, Call/WhatsApp pills, status chip, the Marked-as-Paid popup — the tabs' contents are left
to the Lead Call workspace branch), Team (PageHeader, Panels), the salesperson onboarding panel,
attribution review cards, and the three tools below.

## 3. Admin nav cleanup — Review Replies, Page Gen, Page Plan → Paid Clients
Audit before moving (what existed where on `main`):
| Capability | Standalone page | In Paid Clients before? |
|---|---|---|
| Review reply drafting + don't-reply verdict | `/review-replies` | **No** (removed as a delivery stage 2026-10-02) |
| Page plan: build/rebuild (~2p), reorder, waves, hold, merge, rename, remove/restore, PDF client/internal, "Build this page" | `/page-plan` | **No** (only a link to the generator) |
| Page generator: service+area pages, Q&A articles (lead-less national clients too), scan site, trade credentials, per-device cache | `/page-generator` | **No** (a read-only planned-pages list + a link out) |
So every capability was unique and was MOVED, not dropped: `src/pages/{ReviewReply,PageGenerator,
PagePlanQueue}.tsx` → `src/components/clientTools/{ReviewReplyTool,PageGeneratorTool,PagePlanTool}.tsx`
(git mv; one copy of each). Same edge functions (`review-reply`, `page-generator`, `scan-site-details`),
same actions, tables, libs and config — nothing server-side changed.

Where they live (`src/lib/paidClientTools.ts` owns every address):
- Paid Clients **Tools** switch — `/paid-clients?tool=page-plan|page-generator|review-replies` —
  unscoped, with the pickers (covers lead-less audit clients the per-client page cannot reach).
- Each client's **Pages & reviews** section — `/paid-clients/<leadId>?section=pages&tool=…` — scoped:
  the plan on their baseline audit, the generator on their lead + baseline, review replies with their
  name filled in. Not a numbered stage (review replies are not a deliverable). "Build this page" opens
  the generator in place, seeded. A scoped tool never writes the Tools tab's remembered picks, and
  ignores a URL seed for another client.
- The generator's one-shot URL seed now strips ONLY its own keys (`PAGEGEN_SEED_KEYS`), so the host
  keeps `?tool=` / `?section=`.
- Menus: the three items are gone from the sidebar; Paid clients added to the ADMIN phone "More" menu.
- Old URLs: `/review-replies`, `/page-generator`, `/page-plan` render `LegacyToolRedirect` (inside the
  role-gated shell) → the Tools tab with the query string carried, e.g.
  `/page-generator?mode=service&client=L1&page_key=…` → `/paid-clients?tool=page-generator&mode=service&client=L1&page_key=…`
  (opens the same client and page). Internal links (Website Build, the Optimise build blocker, the
  delivery checklist, the Baseline page, the plan hand-off) point at the new addresses.
- Roles: unchanged. `/paid-clients` and the old paths are not in `SALES_ROUTE_PATTERNS`.

## 4. Verification
- `npm run check`: typecheck identical to baseline (9), edge checks, build, **335/335 suites**.
- New `scripts/paid-client-tools.test.ts` (menus, redirects + query carry, Tools tab + scoped hub, every
  page-generator action still called, backend files/config present, roles, one token source, leaf imports).
- Tests updated (pinned moved paths / restyled markup only): `page-plan-handoff`, `paid-client-hub-no-writes`,
  `edge-invoke-auth`, `client-copy-claims`, `intent-ownership`, `website-build-claims`, `dashboard-design`.
- Visual QA: a throwaway, network-free Vite harness (mocked Supabase client / edgeInvoke / auth; fake
  clients; the Sales dashboard fed by the real `foldSalesPerformance` / `foldSalesWorkspace` on synthetic
  data) built from the worktree and shot in headless Edge over CDP at 1440 and 390. 14 views (Sales
  dashboard, Paid Clients, the three tools, client page, client page tools, Quick Close, audit window,
  CSV import, Team + attribution, lead dialog, sidebar admin / sales): no horizontal overflow, no render
  errors. Found and fixed on the way: the client page grid widened a phone to 468px; the plan's row
  actions and two fixed-width inputs; the Tools switch hid "Review replies" off-screen on a phone.
  The harness was deleted before commit. Nobody has seen the live app with this branch.
