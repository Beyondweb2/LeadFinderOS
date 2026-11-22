# Campaign performance tracking (2026-11-22)

Paul's brief: log report opens, track links in outbound messages, count only real replies, and show a per-template table on the
campaign page that highlights the best performer (only templates with 20+ sends are judged).

## What is logged

| Log | Written by | When |
|---|---|---|
| `report_views` | `render-audit-report` → `log_report_view()` | every public load of a report page (findable.live/r/…, app.leadfinderos.com/r/…) WITHOUT `preview=1`; bots included, marked in `bot_reason` |
| `report_views.js_at` | the page's own script → `track-engagement?ping=<view id>` → `report_view_ping()` | once, within an hour of the load |
| `tracked_links` | `_shared/tracked-link.ts` → `create_tracked_link()` | one per outbound message that carries a report link |
| `link_clicks` | `/l/<code>` proxy (findable-site `functions/l/[code].ts`, V1 `functions/l/[code].ts`) → `track-engagement?link=` → `log_link_click()` | every hit, bots marked |

The old `ai_audits.first_opened_at` / `open_count` (bump_audit_open) is unchanged and still feeds the Inbox pill. The campaign table uses
it only for opens before `REPORT_VIEW_LOG_START` (2026-11-22).

Security: all three tables RLS on, admin SELECT only, no browser write policy. The four SQL functions are `revoke … from public, anon,
authenticated` and granted to `service_role` only. `tracked_links.target_url` has a check constraint: our two domains only. The proxies
and `track-engagement` check the target again — never an open redirect. Migration `20261226090000_campaign_engagement_tracking.sql`
(applied 2026-11-22, read back).

## Bot / preview filter (`src/lib/engagementBots.ts`)

- User agent: WhatsApp, Facebook/Meta, Slack, Twitter/X, Telegram, Discord, LinkedIn, Skype, Google preview/read-aloud/crawlers, Apple,
  Bing, other preview services, scripts (curl, python, headless) and anything with `bot` as a word → `bot_reason`. Empty agent = bot.
  "CUBOT" phones are not bots (tested).
- Too fast, no JS: a load within `FAST_OPEN_MS` (5 s) of any real send to that lead whose page script never pinged is a preview. A click
  has no script, so a click inside 5 s is always a preview.

## Tracked links (`_shared/tracked-link.ts`)

- ONLY report links (`https://findable.live/r/<6 chars>`, `https://app.leadfinderos.com/r/<6 chars>`). Sign-up / agreement / payment
  (`/agree/`), onboarding (`/details/`), set-up and welcome-pack links are NEVER wrapped — no redirect hop in front of paying.
  Fixed `https://findable.live/` text inside Meta-approved template bodies is untouched (it is the approved wording).
- Wrapped where the report link is resolved for a real send: `send-whatsapp-message` (audit branch, not on a dry run) and
  `process-whatsapp-queue` (first-reply lane). The wrapped link is used for the payload, the free-text words and the stored body alike.
- FAIL-OPEN: any problem returns the original link; a send is never held or changed otherwise.
- `findable.live/l/<code>` for Findable-style leads, `app.leadfinderos.com/l/<code>` for LeadFinderOS-style (web-dev) campaigns.
  Unknown code / failure → the home page.

## Real reply (`src/lib/realReply.ts`)

Not `looksAutomated` (the shared auto-reply wording list) AND not within `AUTO_REPLY_WINDOW_MS` (60 s) of our previous real send.
The table shows raw (every inbound) beside real. ⚠️ The 60 s rule also drops some fast humans (the 2026-09-05 measure put the fastest
tenth of replies at about a minute) — that is why raw stays visible. Other screens keep their own looksAutomated-only rule
(`creditRepliesToSends` default unchanged; the table passes its own predicate through the same walk).

## The table (`src/lib/campaignPerformance.ts`, fn `campaign-performance`, `CampaignPerformanceTable`)

Manage campaigns → **Performance** on a WhatsApp campaign card (`/campaigns?perf=<id>`). One row per template, per lead:
Sent, Read %, Real reply % (count), Raw reply % (count), Link / report open % (count), Interested. Last-touch attribution
(`templateAttribution.ts`). A report view is credited to the newest report-link template before it (`REPORT_LINK_TEMPLATES`); a click
to the template its link was made for. Interested = starred leads whose real reply was credited to that template.
Judged only with `MIN_SENDS_TO_JUDGE` (20) sends; others are greyed "too few to judge (n/20)". Best = highest real-reply rate among
judged (ties: open rate, then sends), only when above zero.
Access: admin any campaign; a salesperson only a campaign they created and only their assigned leads (mirrors `campaign_usable` +
`_campaign_counts`). QA fixture leads and test-mode messages never count. Counts only — no message text or phone number leaves it.

Tests: `scripts/campaign-performance.test.ts`.

## initial_with_link — the opener with a tracked leadfinderos.com link (2026-11-22)

- WhatsApp template, English, Marketing, Meta ID 1084953241232593, in review when added. Paul: treat as approved — no gate
  (`INITIAL_WITH_LINK_APPROVED`); a Meta refusal shows as the normal failed send. Leaf: `src/lib/initialWithLink.ts`.
- {{1}} = a fresh 8-character code per send (`goCodeFor` in `_shared/tracked-link.ts` → `create_tracked_link`, stored in
  `tracked_links` with the lead and template; target `https://leadfinderos.com/`). FAIL-CLOSED: no code → nothing sent, reason shown.
- Only for leads in a LeadFinderOS-style campaign (report_style `leadfinderos`, the "Web devs/agencies · WhatsApp" campaign);
  any other lead is refused with the reason. Queueable as a cold opener (migration `20261226100000_initial_with_link.sql`:
  the live `sales_queue_opener` with one more name in `v_cold`; opt-out / Do Not Contact / UK-mobile / limits unchanged).
- No own wording: Meta's approved body is not in the app, so the stored message is `[initial_with_link]` and it always goes as
  the template (never free text). The picker preview says so. When the exact body is known, add a renderer.
- `leadfinderos.com/go/<code>`: repo `leadfinderos-waitlist`, `functions/go/[code].ts`, holds NO key — it 302s the visitor to
  `track-engagement?go=<code>`, which logs the click (bots marked) and 302s to `https://leadfinderos.com/` whatever happens.
- Clicks show in the campaign table's "Link / report open" column on the `initial_with_link` row.
