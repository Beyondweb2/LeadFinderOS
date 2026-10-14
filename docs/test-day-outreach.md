# Test day outreach — 2026-10-14 (feat/test-day-outreach)

Four jobs for the team test day (Paul, Ethan, Stephan, Brandee). Each merged to `main` and deployed on its own.
Guards are pinned in `scripts/test-day-guards.test.ts`.

## Job 1 — roles and double contact (report + three narrow fixes)

Checked: a salesperson can open only `access.ts`'s list (Sales dashboard, Outreach, Inbox incl. SMS, WhatsApp queue,
Find Leads, Coverage, Campaigns). No settings, Team, templates, API usage / protection settings, costs or keys. The
"When a prospect replies" / AI-replies switches are admin-only on screen (`perms.queueControls`) and on the server
(`whatsapp_outreach_state` has RLS and no policies; `process-whatsapp-queue` lets Sales use only `contact_check`,
`suppress_lead`, `queue_state`). Every one-off send path checks the lead is the caller's (`canWorkLead` / `leadAccess`).

Fixed (migration `20261024090000`, fns `send-whatsapp-message` build `2026-10-14t-texted-guard`, `process-whatsapp-queue`,
`search-leads`):
- A number already **texted** never gets a cold WhatsApp opener — one SQL rule `public.phone_already_texted` (service
  role only), asked by both WhatsApp senders, fails closed. Mirror of the text queue's `already_texted`.
- A salesperson's `allow_resend` never skips the phone-history check across another lead row (admin keeps the override).
- Find Leads region mode is admin-only (it was reachable by a direct call and returned the day's Google spend).

## Job 2 — CSV import (migration `20261024100000`)

The import already existed (`csv-import-fix.md`). Added: `import_leads_v2` = `import_leads` copied exactly plus an owner
(sales: self only; admin: an active, unsuspended teammate — one notice per call, never one per lead) and a batch name;
`outreach_leads.import_batch` (appended to `sales_leads`); Outreach search finds a batch; "Why this lead" maps to notes;
a trade typed once fills blank rows. `import_leads` is untouched. Proven live in a rolled-back transaction.

## Job 3 — WhatsApp cap and pace (migration `20261024110000`)

One rule, `src/lib/whatsappPace.ts`. Stored in `whatsapp_outreach_state` (NULL = default): `daily_cap` (default **800**,
was a hard-coded 400; never above **1,000**, Meta's first established tier), `min_gap_minutes` (default 1),
`person_daily_limit_default` (NULL = none). Per-person override = the existing `team_members.daily_send_limit`
(leads a salesperson may queue per London day; `sales_queue_opener` now falls back to the default for a salesperson).
One WhatsApp number (`WHATSAPP_PHONE_NUMBER_ID`) sends for everyone; the drip sends at most one message per one-minute
tick in 07:00–21:30, so ~800 is close to its real daily ceiling. Auto-pause: ≥ 8 queue sends in the last 60 minutes
and ≥ half failed → paused with the reason; Resume clears it. Panel (admin): Limits editor, sent today per person.

## Job 4 — price model (migration `20261024120000`)

`src/lib/priceModel.ts`: `standard` (today's offer, unchanged) and `upfront_499` (£499, then £99 a month × 12, the
monthly starting when Build's does — the v4 agreement's "day after the refund window" timing, normally ~6 weeks;
guarantee = the existing headline only). Per-person switch (`team_members.price_model`) + admin team default
(`sales_price_settings`), through `my_price_model` / `set_my_price_model` / `set_default_price_model`. The call script's
Offer step and the Close tab follow the model. The model a link was made under is stamped on
`outreach_leads.price_model_offered(_at)`.

⛔ **The £499 model cannot be paid for** (`PRICE_MODEL_PAYMENT_LIVE.upfront_499 = false`; fn `quick-close` refuses
`price_model_not_live` for generate / share / Full Setup links). The signed v4 agreement names "£99 initial payment"
in several clauses and findable-checkout takes money only after it is signed. To switch it on Paul must approve: a new
agreement version (and findable.live `/agreement` parity), the £499 refund amount, 13 payments vs the route counts,
commission on a £499 initial; then the checkout + webhook learn the amount and count. `findable-checkout` and
`stripe-webhook` were not changed.
