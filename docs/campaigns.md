# Campaigns — salespeople run their own (2026-10-03)

## What it was

There was no Campaigns page. A campaign was created from a dropdown inside Outreach or Find Leads, through a
seven-field settings dialog (name, campaign type, trade, description, method, default sale type, default
template). The database made create / edit / delete admin-only, yet the SELECT policy was `true`, so **every
signed-in user read every campaign**, and a salesperson could put their lead into **any** campaign by id
(`lead_set_campaign`, `leads_set_campaign`, `sales_add_lead`). Quick Close and the Sales dashboard's
campaign cards returned other owners' campaign names. Names were not unique. Sending was a separate act per
lead (queue the opener); there was no per-campaign stop.

## The option audit

| Old option | Now | Why |
|---|---|---|
| Name | **kept** | the one real decision; globally unique |
| Campaign type | **automatic** (`audit`); admin-only under Advanced settings | `site` is the dead barber flow |
| Trade | **admin-only** | it only routes Coverage / market-view adds; a rep picks leads directly |
| Description | **removed** from the rep flow (admin keeps it) | the name says it |
| Method | **automatic** (WhatsApp) | the queue only sends WhatsApp |
| Default sale type | **automatic** (`website`); admin-only | internal reporting field |
| Default template (all templates) | **replaced** by the approved first message, shown in words | the queue only ever sends `whatsapp_outreach_state.initial_opener_template`; follow-ups go from the Inbox after a reply |
| Queue the opener lead by lead | **folded into Launch** | one press, the same safeguarded function |

## The flow now

Campaigns (menu, after Outreach) → **New campaign** → 1 Name (availability checked as you type; the server
decides) → 2 Leads (your workable leads: search, trade, town, "not already in a campaign", "only leads that
can be messaged", select all, a live count of selected and messageable) → 3 Message (the approved first
message, preview) → 4 Review → **Launch** or **Save as draft**.
Detail: status (derived: Draft / Ready to send / Sending / Sent · new leads waiting / Sent), leads, waiting,
messaged, replied, interested, progress, next step; Launch / Send to N new leads, Stop sending, Add leads,
Rename, Delete (a rep: only while empty). The admin also gets the owner and the old settings under Advanced
settings.

## The rules (migration `20261006120000_campaign_ownership.sql`)

- **Owner** = `created_by` (already NOT NULL on all 19 rows), set by `campaign_create` from `auth.uid()`.
- **Read:** policy `campaigns read own or admin`. **Direct writes:** admin-only (the restrictive policies,
  unchanged). A salesperson acts only through the SECURITY DEFINER functions, each role-checked first and
  calling `campaign_usable` before it acts: `my_campaigns`, `campaign_detail`, `campaign_leads`,
  `campaign_candidates`, `campaign_name_available`, `campaign_create`, `campaign_rename`, `campaign_delete`,
  `campaign_add_leads`, `campaign_launch`, `campaign_stop`. Another owner's campaign is `not_found` — the
  same answer as a campaign that does not exist. Owner fields are returned to the admin only.
- **Names:** `campaign_name_key(name)` = trim, collapse inner whitespace, lower-case; a UNIQUE index on it.
  A duplicate (including two creates racing) → `name_taken` → "A campaign with this name already exists.
  Choose a different name." Never whose. Rename keeps its own name.
- **Leads:** a salesperson's lead goes only into a campaign they own (all three entry points →
  `unknown_campaign`). Candidates are only leads the caller can work (a rep: assigned to them, not a
  client); another owner's campaign shows as "another campaign", never named.
- **Launch:** `campaign_launch` walks every new lead of the campaign through the EXISTING
  `sales_queue_opener` (own lead, not a client, never contacted, UK / India mobile, opt-out suppression,
  daily limit, spend guard) with the current approved opener only. The queue, the send window and the
  round-robin across campaigns are unchanged. **Stop:** `campaign_stop` returns still-queued leads to the
  status they had; sent messages are untouched.
- **Side doors closed:** `sales-performance` groups a rep's leads that sit in someone else's campaign as
  "Leads assigned to you"; `quick-close` names a campaign to a rep only if it is theirs.

## Historical campaigns

Audited 2026-10-03: 19 campaigns, every one with a real `created_by` (18 the admin data account, 1 — "roofers
2", 82 leads — the Test salesperson). No two share a name key; none is blank. Nothing renamed, merged,
reassigned or deleted; no grandfathering needed.

## Proof

`supabase/tests/campaign-ownership.sql` (rolled back): Paul creates P, rep A (Test) creates A, rep B (test1)
creates B. A and B each list only their own; every open / rename / stop / launch / delete / leads / candidates
/ add call across owners → `not_found`; moving or adding a lead into another owner's campaign →
`unknown_campaign`; direct table read / update of another's campaign → 0 rows; " zz qa roofers  -  MANCHESTER "
and "ZZ QA  ELECTRICIANS - leeds" → `name_taken`; availability says only taken; the admin lists P (plain), A
(Test), B (test1). `scripts/campaign-ownership.test.ts` fences the code.
