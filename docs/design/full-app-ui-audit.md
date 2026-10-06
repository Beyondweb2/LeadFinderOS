# Full-app UI audit (2026-10-06, `improve/full-app-design-consistency`)

Reference look: the **Sales dashboard** (`salesDash/primitives.tsx`: `TONE`, `SURFACE`, `PageHeader`, `KpiCard`,
`Figure`, `Segmented`) and the operator leaf (`operator/ui.tsx`: `IconTile`, `ToneChip`, `Callout`, `SubSection`,
`DialogHero`, `ActionBar`, `Fact`, `EDGE`), set by the 2026-10-06 operator design pass
(`docs/operator-design-consistency.md`). This pass extends that look to every surface that never adopted it.
Release record: `docs/pre-sales-certification/full-app-design-consistency.md`.

How the inventory was taken (before any change): every route in `src/App.tsx` (36); every file under `src/` that
renders a `DialogContent`, `AlertDialogContent` or `SheetContent` (40 files); every component over ~180 lines,
measured for whether it draws from the shared primitives. Labels: **GOOD · NEEDS POLISH · INCONSISTENT · POOR**.
Status: **DONE · UNCHANGED (already good) · DEFERRED** (with the reason).

Colour meaning (unchanged, one source `TONE`): green (drawn teal) money / done · blue information / workflow ·
amber attention / waiting · purple audits / AI · red blocked / failed / destructive · grey secondary.

## Shared pieces added in this pass
| Piece | Where | Why |
|---|---|---|
| `PageHeader` `icon` + `tone` (+ `testId`) | `salesDash/primitives.tsx` | every page gets the dashboards' header with its own icon tile, left-aligned at every width |
| `LoadState`, `ErrorState` (Retry), `EmptyState`, `DeniedState` | `operator/ui.tsx` | one look for loading / failed / empty / not-allowed instead of ad-hoc text and spinners |

## Pages
| Surface | Role | Before | Main visual issue | Reference pattern | Change | Status |
|---|---|---|---|---|---|---|
| Sales dashboard `/sales-dashboard` | both | GOOD | — | is the reference | none | UNCHANGED |
| Admin dashboard `/dashboard` | admin | GOOD | — | Sales dashboard | none | UNCHANGED |
| Find Leads `/find-leads` | both | GOOD | header centred on phone, plain h1 | PageHeader | header → PageHeader (Search, blue); body untouched | DONE |
| Outreach `/outreach` | both | GOOD | header centred on phone, plain h1 | PageHeader | header → PageHeader (ClipboardList, blue); 4 dialog headers; Import button named on phone | DONE |
| WhatsApp `/inbox` | both | INCONSISTENT | own header, plain dialogs, bare spinners | IconTile, DialogHero | compact header with icon tile (two-pane screen); 5 dialog headers; Load/Error/Empty states; queue panels on SURFACE with chips | DONE |
| Coverage `/coverage` | both | NEEDS POLISH | small plain h1 | PageHeader | header (Map, blue); Load/Error/Empty; state chips | DONE |
| AI Audit `/ai-audit` | admin | INCONSISTENT | centred own header; 4 plain dialogs | PageHeader, DialogHero | header (Sparkles, purple); 4 dialog headers | DONE (body DEFERRED: 4,000-line page, untouched by design) |
| API usage & Security `/admin/api-usage` | admin | POOR | full-screen spinner / error, plain cards | PageHeader, KpiCard, Panel, Callout | header in every state; KPI tiles; panels; callouts; Security panel chips | DONE |
| Campaigns `/campaigns` (+ detail) | both | NEEDS POLISH | plain page, plain edit dialog | PageHeader, DialogHero | header (Megaphone); Load/Error/Empty; dialog header | DONE |
| Templates `/templates` | admin | NEEDS POLISH | plain header, plain dialogs | PageHeader, DialogHero | header; empty states with their Create buttons; 2 dialog headers | DONE |
| Mockups `/mockups` | admin | NEEDS POLISH | plain header | PageHeader | header (both screens); chips; callouts; empty/not-found | DONE (small uppercase headings DEFERRED) |
| Feedback `/feedback` | admin | NEEDS POLISH | partial adoption | PageHeader | header; chips; loading | DONE |
| Paid Clients list `/paid-clients` | admin | GOOD | — (restyled earlier 2026-10-06) | — | none | UNCHANGED |
| Client hub `/paid-clients/:id` | admin | GOOD | 3 plain dialog headers | DialogHero | client hero kept; 3 dialog headers | DONE |
| Website Build `/paid-clients/:id/website-build` | admin | INCONSISTENT | own headers, grey boxes | PageHeader, SURFACE, Callout | header both views; surfaces; banners as callouts; Load/Error | DONE (advanced inner cards DEFERRED) |
| Baseline `/baseline/:id` | admin | INCONSISTENT | plain header | PageHeader, Figure | header (Target, purple); named-rate Figure; chips; states | DONE |
| Paid baseline setup `/baseline-setup/:id` | admin | INCONSISTENT | plain | PageHeader, Fact | header; facts grid; states | DONE |
| Compare measurements `/compare/:id` | admin | NEEDS POLISH | plain | PageHeader, Figure | header; Before/After figures; states | DONE |
| Team `/team` | admin | GOOD | no money per salesperson; squeezed rows on phone | Sales dashboard chips | icon header; per-salesperson sales / earned / owed + "held for review"; phone row wrap; Load/Error | DONE |
| Sign in / set password | public | INCONSISTENT | hard-coded black card on light themes | SURFACE | SURFACE card, LoadState, callouts — every field and message kept | DONE |
| Not found `*` | all | POOR | bare text | EmptyState | EmptyState with "Return to Home" | DONE |

## Lead / sales popups and panels
| Surface | Role | Before | Main visual issue | Reference pattern | Change | Status |
|---|---|---|---|---|---|---|
| Lead dialog shell (`LeadDetailDialog`) | both | GOOD | name squeezed to two letters on a phone | — | header pills wrap under the name on a phone | DONE |
| Call workspace (`ColdCallPlaybook`) | both | GOOD | — | is a reference | its one sheet header only | DONE (workspace UNCHANGED) |
| Details / History (`LeadCrmPanel`) | both | GOOD | — | — | none (its confirm says "nothing is deleted", so not red) | UNCHANGED |
| Log this call + next action (`LeadCallFlow`) | both | NEEDS POLISH | plain headers | DialogHero | both headers; compact LoadState | DONE |
| Next-action picker (row popover) | both | GOOD | — | — | none (a popover, not a dialog) | UNCHANGED |
| Outreach row dialogs (`OutreachTable`) | both | NEEDS POLISH | plain headers | DialogHero | Run audits / Fix town / Set trade / Queue WhatsApp headers; "Reset to fresh" uses the destructive variant | DONE (dialog bodies DEFERRED) |
| Quick Close | both | GOOD | — (restyled earlier) | — | none | UNCHANGED |
| Add lead | both | NEEDS POLISH | plain header, raw amber boxes | DialogHero, Callout | header; callouts (same test ids) | DONE |
| CSV import | both | GOOD | — (restyled earlier) | — | none | UNCHANGED |
| Post-contact modal, Outreach tips, Outreach intro | both | POOR | old dark splash, hard-coded background; intro had NO title | DialogHero, ActionBar | rebuilt headers + action rows, same words | DONE |
| Lost reason prompt | both | NEEDS POLISH | plain | DialogHero | header; footer | DONE |
| Unsaved draft guard | both | GOOD | hand-made red | destructive variant | Discard uses the destructive variant | DONE |
| Hook audit dialog | both | NEEDS POLISH | plain header | DialogHero | header | DONE |
| Prospect audit dialog (detailed audit) | both | GOOD | inline error link | ErrorState | Load/Error states (title comes from ProspectAuditView) | DONE |
| Prospect preview (sheet) | both | INCONSISTENT | uppercase labels, raw boxes | IconTile, SubSection, Callout | header tile, chips, sub-sections, callouts, action bar | DONE |
| Website crawl dialog (`CrawlCheckButton`) | both | INCONSISTENT | buttons crammed into the title | DialogHero, SubSection | header with chips; sections; error callout | DONE |
| Single WhatsApp, Voice note script, Request template | both | INCONSISTENT | plain headers | DialogHero, Callout | headers; callouts; LoadState — no send logic touched | DONE |
| Welcome pack, Manual onboarding | admin | INCONSISTENT | plain; boxes inside boxes | DialogHero, SubSection, ActionBar | headers; sections; callouts; save row | DONE |
| Lead from Inbox (`LeadDetailFromInbox`) | both | NEEDS POLISH | placeholder had no accessible name | LoadState, EmptyState | states + screen-reader title | DONE |

## Admin / app-wide popups
| Surface | Role | Before | Main visual issue | Reference pattern | Change | Status |
|---|---|---|---|---|---|---|
| Command palette | both | GOOD | — | — | selected row, kbd, shortcuts dialog header | DONE |
| Feedback & What's New | both | NEEDS POLISH | plain headers, violet for information | DialogHero | headers; blue for information | DONE |
| Accent colour picker, Theme sheet (phone) | both | NEEDS POLISH | plain | IconTile, SubSection | header tiles; section labels | DONE |
| User menu (password) | both | GOOD | — | DialogHero | header | DONE |
| Notification centre | both | GOOD | — | — | none | UNCHANGED |
| Trade auto-fix | admin | NEEDS POLISH | one long count sentence | DialogHero, Figure | header; four figure tiles (sentence kept for screen readers) | DONE |
| Team composer (send to sales team) | admin | NEEDS POLISH | plain | DialogHero, Callout | header; tinted "what happens"; confirm callout | DONE |
| Engagement end, Payout (`earningsParts`) | admin | GOOD | — | — | none | UNCHANGED |
| Submissions card + delete confirm | admin | NEEDS POLISH | plain; hand-made red | IconTile, destructive variant | tile; chips; states; destructive variant | DONE |
| Free-check progress card | admin | NEEDS POLISH | plain states | Load/Error/Empty | states | DONE |
| Security panel, Sales checks admin card | admin | NEEDS POLISH | flat cards | Panel, ToneChip, Callout | panels; mode chip; callouts; states | DONE |

## Paid Client tools
| Surface | Role | Before | Main visual issue | Reference pattern | Change | Status |
|---|---|---|---|---|---|---|
| Page Plan, Page Generator, Review Replies | admin | GOOD | — (moved + restyled earlier) | — | none | UNCHANGED |
| Missing-info, timeline, setup, handoff, access, engagement end | admin | GOOD | — (restyled earlier) | — | none | UNCHANGED |
| Delivery cockpit | admin | NEEDS POLISH | grey | tone tints | tones only (matches its lead-dialog neighbours) | DONE |
| Monthly update | admin | NEEDS POLISH | boxes | SubSection | sections; ErrorState | DONE |
| Baseline discovery, Measurement compare table | admin | NEEDS POLISH | bordered boxes | tints, SURFACE | soft washes; chips; pill switch | DONE |
| Results / remeasurement in-app views | admin | GOOD | — | — | covered by Baseline + Compare above | DONE |

## Deferred, with the reason
- **AI Audit body** (~4,000 lines): only its header and dialogs changed; the body would need its own pass.
- **Website Build advanced inner cards** (rule engine, mapping, pack/prompt cards): no restructuring in a visual pass.
- **Outreach row dialog bodies** (the amber/red cost boxes): bodies kept; headers done.
- **Mockups' small uppercase section headings**: light admin tool, many headings.
- **Campaign card method chip** is solid green/sky; green means money in the house style — recolouring it is Paul's call.
- **Auth inputs** use faint borders that may read poorly on light themes — left for a sign-in-specific pass.

## Out of scope (by the brief)
- The client-facing report / PDF (Concept 4 workstream).
- Any behaviour: payment, agreements, commission, attribution, ownership, lead states, audit method, scoring,
  quotas, WhatsApp API, TPS, Stripe.
