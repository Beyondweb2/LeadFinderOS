# Operator app domain move: app.leadfinderos.com (2026-10-01)

Paul's brief: make `https://app.leadfinderos.com` the canonical operator app URL, keep
`https://leadfinderos-next.pages.dev` working as a fallback, and **do not redirect the old address
yet**. The redirect is a separate final step, taken once the new domain has been proven in normal use.

## What existed before
- The custom domain was already attached to the `leadfinderos-next` Pages project (DNS on Cloudflare,
  same entry chunk as pages.dev). Nothing in Cloudflare needed changing.
- The app's address was hardcoded in four places, and they had already drifted from each other:
  - `securityAlerts.ts` `SECURITY_SCREEN_URL` used leadfinderos-next.
  - The `admin-users` team-link fallback used leadfinderos-next. Its `TEAM_APP_URL` secret had **never
    been set**.
  - `SEOHead.tsx` `BASE_URL` used the stale `leadfinderos.pages.dev`.
  - `verify-live.mjs` used leadfinderos-next.
- Supabase Auth: Site URL and the only Redirect URL were leadfinderos-next.
- No reference to the app's host anywhere else:
  - operator edge functions all send CORS `*`;
  - the 13 crons and the SQL functions don't contain it;
  - stored notification links are relative (`/inbox?lead=…`);
  - Stripe returns customers to findable.live;
  - the Meta and Stripe webhooks are Supabase URLs.

## What changed
- `src/config/operatorApp.ts` holds `OPERATOR_APP_URL` and `operatorAppUrl(path)`, and imports
  nothing. The SPA (`@/config/operatorApp`), edge functions (relative path with `.ts`) and Node
  scripts (type stripping) all import the same file, so no runtime needed a copy of its own.
- `admin-users` reads `TEAM_APP_URL?.trim()` first, then falls back to the constant. The secret is
  set to the same value.
- `SEOHead` always emits noindex. `public/_headers` sends `X-Robots-Tag: noindex, nofollow` on every
  static response (Pages Functions such as `/r` and `/a` are not affected by `_headers`).
  `index.html` carries a static noindex.
- Guard: `scripts/operator-app-url.test.ts`.
- Supabase Auth changes, in this order:
  1. Redirect URLs gained `https://app.leadfinderos.com/**`.
  2. The `TEAM_APP_URL` secret was set.
  3. The code was deployed.
  4. Only then was the Site URL changed to `https://app.leadfinderos.com`.

  Both Redirect URLs are kept.
- Deployed: `admin-users` and `security-admin`. These are the only two functions that reach the
  constant (`check-import-graph --reached-by`). Proved by grepping each deployed bundle for the new
  host.

## Live tests (2026-10-01)
Signed in with admin-API magic links: no password typed, no email sent. Each session was signed out
afterwards, and Sign out is browser-local (`scope: 'local'`).

| Who | What | Result |
|---|---|---|
| Admin | Sign in to the new domain | Passed. |
| Admin | Outreach | Passed. |
| Admin | `/outreach?lead=` | Passed: lead panel opens. |
| Admin | Refresh | Passed: URL and session kept. |
| Admin | `/inbox?lead=` (notification link) | Passed: resolves to the thread. |
| Admin | `/team`, `/admin/api-usage`, `/focus`, `/ai-audit`, `/baseline/:id` | Passed. |
| Admin | Dashboard canonical | Passed: reads the new host, with noindex. |
| Admin | `team_new_link` for the Test rep | Passed: `redirect_to=https://app.leadfinderos.com/set-password`. |
| Admin | Sign out | Passed. |
| Test salesperson | Recovery link | Passed: lands on new-domain `/set-password`. The password was **not** changed. |
| Test salesperson | Own Outreach (1 lead), lead deep link, refresh, Inbox, Sales dashboard | Passed. |
| Test salesperson | `/team`, `/admin/api-usage` | Passed: both bounce to Outreach. |
| Test salesperson | Sign out | Passed. |
| — | Signed-out deep link | Passed: goes to `/auth`. |
| Admin | Old host | Still signs in and serves the same build. Its session is separate from the new host's (per-origin localStorage), which is expected. |

0 WhatsApp sends during the tests.

Not exercised live: the security alert email itself. The sweep is CRON-only and sends to Paul. It
is proven by the deployed bundle and the unit test.

## Found along the way
- The Dashboard Submissions card navigates to `/outreach?leadId=`, but Outreach reads `?lead=`.
  The lead never opens. This bug predates the move and is not fixed here.
- `functions/r/[slug].ts` is live: it serves 1,295 published business-profile pages (the newest is
  from 2026-09-30) on every host, with a `yoursites.uk` canonical. It is left alone. Whether to
  retire it is still Paul's decision (`report-origin.test.ts`).
- The barber-era public metadata was retired in its own commit:
  - `index.html` og/title/description;
  - the manifest named "My Website — yoursites.uk", which opened at a non-existent `/barber`;
  - the `robots.txt` sitemap that pointed at lead-finder-app.com;
  - `sitemap.xml` and `llms.txt`.
