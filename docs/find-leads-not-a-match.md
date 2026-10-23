# Find Leads: "Not a match" (2026-10-23, feat/find-leads-not-a-match) — HELD FOR PAUL'S APPROVAL

A "driving instructors" search also returned Mackay Hyundai and the Department of Transport. Those now sit behind ONE grey
line under the results — "2 not a match for driving instructors hidden · Show" — exactly like the out-of-town line.

- **The rule** (`src/lib/nicheMatch.ts`, `notNicheMatch`): hidden only when BOTH (1) the business name has none of the
  niche's words (stems, plus a few words the trade uses: lock/key/security for locksmiths, motoring/lesson for driving) AND
  (2) Google's category (`primaryType`, already in every search answer, free) is a specific type outside the niche's family.
  A generic category (service, educational institution, consultant, store, none) never hides anything. No keyword or no
  category → shown.
- **Reversible, never deleted, never found**: hidden rows are left out of the rows, Select all, Add (row and batch, and the
  one add door in Index) and the run's "found" count (one search and many towns). Show makes them ordinary rows; a new
  search starts hidden again. A row outside the town is counted on the outside line only.
- **Measured** on the cached searches of the 30 days to 2026-10-23 (114 runs, 3,406 results; 95 runs Paul's):
  55 hidden (1.6%). Driving instructors 21 (Hyundai, Department of Transport, VicRoads, garages, Kwik Fit, golf clubs,
  schools, an insurer); language schools 20 (colleges, universities, nurseries, a church, a mall, a bookshop, a library);
  locksmiths 6, plumbers 5, electricians 2, accountants 1 (merchants, manufacturers, an estate agent). Roofers, painters,
  gyms, restaurants and video editors: none. **Possibly wrong: at most 3** — Lectri-call (wholesaler), D Macfarlane & Son
  and Top Dog Trades (manufacturer); each is one Show away.
- Screens: `docs/review/find-leads-not-a-match/` (desktop and 390 px, hidden and shown; a mocked harness, not live data).
- Tests: `scripts/find-leads-not-a-match.test.ts`.
