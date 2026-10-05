# 04 — Campaigns and outreach

*Live since Sales workspace v2 (merge `af8a930f`, migration `20261008100000_sales_workspace_v2.sql`) and the opener
contact guard (merge `9f8451c6`, migration `20261008110000_opener_contact_guard.sql`), both 2026-10-05. Full record:
`docs/pre-sales-certification/sales-workspace-v2.md`; ownership rules `docs/campaigns.md`.*

## A campaign is a container, not a lead source

**Creating one** asks four things only:

1. niche / trade
2. **Call** or **WhatsApp**
3. optional area
4. a name (a suggestion such as "Plumbers · Halifax · Call" fills in until they type their own)

→ **Create campaign**. No lead-selection wizard, no message step, no review step (the old `CampaignWizard` /
`LeadChooser` are deleted — do not bring them back).

Server functions (SECURITY DEFINER, the owner is always the signed-in account): `campaign_new`, `campaign_update`,
`campaign_archive`, `campaign_launch`, `campaign_stop`, `campaign_usable`. Names are globally unique among live campaigns
(`name_taken`, never says whose).

## How leads join a campaign

- **Find Leads → pick the campaign** in the "Adding to" selector (`CampaignPicker mode="assign"`, top right) → add
  businesses. They carry `campaign_id` (`sales_add_lead` / the admin insert). Optional "ask campaign each time" switch.
- A business **already in the CRM** shows "→ <campaign>" on its Find Leads row, which moves it in (`lead_set_campaign`).
- Also: bulk "Move to campaign" in Outreach (`leads_set_campaign`), or the lead's **Details** tab.
- No campaign selected → the lead joins no campaign.
- ⛔ **Membership never depends on message eligibility.** Joining reads no contact history; whether a cold opener may be
  sent is decided only at send time, and the reason is shown on the lead.

## Ownership and privacy

- Campaigns are **owned and private**: the admin sees all; a salesperson sees and uses only their own. Another owner's
  campaign answers `not_found`, never its name. A rep's lead goes only into the rep's own campaign.
- Campaigns are **not a menu item** (Paul's choice): reached via the Campaigns button top right of Find Leads / Outreach.
- The "(owner)" in brackets is display only (`campaignDisplayName`).
- **Lead ownership (live 2026-10-05, `docs/pre-sales-certification/outreach-ownership-safety.md`):** the admin's Outreach
  opens on **My leads** (owned by Paul only), with **Unassigned**, each salesperson and **All team (owned)** — owned leads
  only, never the unassigned — as deliberate, unremembered choices (`src/lib/outreachOwnerScope.ts`). Unassigned is never
  "Paul's"; **Claim for me** (Unassigned view, `assign_lead`) makes a lead his and messages nobody. A salesperson sees
  only their own. Queueing WhatsApp across more than one owner needs a second press ("Queue across team", Cancel focused).
  A lead added by a signed-in person is owned by that person (trigger `trg_outreach_leads_added_by_owner`); a service-role
  insert stays unassigned; the ~2,700 historical unassigned leads were NOT reassigned.
- **A campaign launch messages only leads the campaign's OWNER owns** (`campaign_launch`, migration
  `20261009150000`): another owner's member is skipped as `other_owner`, an unassigned one as `unassigned` (claim it first).

## Contact method

| | Call campaign | WhatsApp campaign |
|---|---|---|
| Sends anything? | **Never.** `campaign_launch` refuses `call_campaign`; no Send / Pause buttons | "Send openers (N)" → the safeguarded queue (`campaign_launch` → `sales_queue_opener`); "Pause sending" = `campaign_stop` |
| Worked from | Outreach / Check before calling / the Call tab | Inbox replies, then calls |
| Stats on the card | Leads · Called · Spoke · Interested · Won | Leads · Messaged · Replied · Interested · Won |

Called = a logged call outcome; Spoke = a logged conversation outcome or an inbound reply; Won = a client
(`lead_is_client`); archived leads not counted (`_campaign_stats`).

## Manage campaigns (`/campaigns`)

One card per campaign: name, niche · area, a Call / WhatsApp pill, the five numbers. Actions:

- **Open leads** → Outreach filtered to it (`/outreach?campaign=<id>`). Old `/campaigns/<id>` links open the same.
- **Edit** (same form as create; switching a campaign with queued leads to Call says "stop sending first").
- **Send openers / Pause sending** — WhatsApp campaigns only.
- **Delete = archive** (`campaign_archive`): waiting openers are paused first; the row stays with `archived_at`; its leads
  keep `campaign_id` and every history row; it leaves every picker; its name can be reused. A lead in it reads
  "<name> (deleted)". ⛔ Never a hard delete (the old one cascaded `lead_claims`).

⚠️ Known inconsistency (not a bug in the server): `leadPermissions.campaigns` in `src/lib/access.ts` still says admin-only
and the Find Leads "ask each time" dialog hides **New** for salespeople, while the database lets a salesperson create and
manage their own campaigns and `CampaignPicker` offers New / Manage to both roles. Worth tidying in a future pass.

## Cold-opener safety — one rule for "has a genuine conversation already happened?"

A cold WhatsApp opener must never go to someone a salesperson has already genuinely spoken to.

**Counts as genuine contact** — a logged outcome in `CONVERSATION_OUTCOMES` (`src/lib/leadState.ts:97`), identical to SQL
`lead_conversation_outcomes()` (tested):

- `spoke_to_owner` — Spoke to owner
- `interested` — Interested
- `call_back` — Call back
- `meeting_booked` — Meeting / call booked
- `not_interested` — Not interested
- `agency_controls_site` — Agency controls site (kept for old rows; no longer offered in the picker)

A phone outcome → `contacted_by_phone`; the same outcome on another channel (email, LinkedIn…) → `contacted_logged`.

**Does NOT count** (attempts, not conversations):

- tapping **Call** / the `tel:` link — writes nothing at all (not even `contact_method`);
- **no answer**, **left voicemail**;
- message sent / connection request sent / wrong number;
- opening the lead;
- starring **Interested** on its own.

**One server function decides:** `opener_contact_block(lead)` → `contacted_by_phone` | `contacted_logged` | null
(service-role only; batch form `opener_contact_blocks`). **Every cold-opener door asks it:**

| Door | How |
|---|---|
| Campaign launch, the sales bulk queue, the sales per-lead queue | `sales_queue_opener` → `opener_contact_block` |
| Admin's Outreach bulk queue | `contact_check` (+ `lead_ids`) → "N not queued — already contacted by phone — initial opener not queued." |
| Admin's per-lead queue toggle | the same `contact_check`; fails closed |
| The drip at send time (`process-whatsapp-queue`) | `opener_contact_block`; a hit returns the lead to its previous status; unreadable → nothing sent |
| One-off template send (Inbox, bulk Inbox) | `send-whatsapp-message` → refused with the reason; **not** overridable by `allow_resend` |

So the campaign/opening logic and the Outreach opener logic share the **same** server rule. A new opener door must ask it
too (`scripts/opener-contact-guard.test.ts` sweeps for it).

**Only COLD templates are guarded.** `isColdOutreachTemplate(name)` = "not in `CONTINUATION_TEMPLATES`" — so anything
unknown is treated as cold (fail safe). Cold examples: `initial_contact`, `initial_opener_v2`, `video_template`,
`competitor_hook`, `book_call`. **Continuations stay allowed** after a real conversation: `audit_reply`,
`audit_reply_warm`, `hook_followup`, `contact_followup`, `report_followup`, `audit_followup`, `audit_followup_call`,
`audit_followup_fault`, `ai_site_findings_v2`, `explain_offer*` (blocked separately as stale-offer bodies),
`onboarding_followup`, `questionnaire_followup`, `payment_recieved` (Meta's spelling), `re_engage_49` — and free-text
replies inside Meta's 24-hour window. That is how "I'll WhatsApp you the report" after a call still works.

A refused lead stays in the CRM and its campaign; its status is unchanged; no Next Action is created; the reason is shown
on its Details tab ("Already contacted by phone — initial opener not queued. The lead stays in this campaign.").

## Other WhatsApp rules that still bind (CLAUDE.md §6 "WhatsApp")

- **WhatsApp production is still the Move37 Meta setup** (see `07-SECURITY-AND-PERMISSIONS.md` for the hold).
- `sales_queue_opener` accepts only the approved openers (`initial_contact` / `initial_opener_v2`), at most 200 leads per
  call; skip reasons in order: not_found, not_yours, archived, client, not_new, already_contacted, the contact-guard reason,
  no_phone, not_a_uk_mobile, opted_out, daily_limit.
- **No selected opener**: the batch's chosen approved template is what is stored and sent.
- A cold template is refused for any phone with ANY non-failed message history; the queue structurally cannot send a
  second message to a lead — second messages go from the Inbox.
- **An explicit opt-out blocks every marketing send**, paying clients included (`recordOptOut()`).
- A template lives in **eleven places** (registries + parity tests) and names must match Meta exactly.
- `mode: "dry_run"` on `send-whatsapp-message` builds the real payload and stops before Meta — use it before any first
  real send.
- **Compliance position (Paul, 2026-10-02): reviewed and NON-BLOCKING.** WhatsApp is a light opener; live calling is the
  main cold channel. Build no consent fields; never write that cold WhatsApp outreach is definitively lawful or unlawful;
  keep suppression exactly as strict (`docs/whatsapp-outreach-compliance.md`).
