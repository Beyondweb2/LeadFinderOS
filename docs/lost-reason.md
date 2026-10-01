# Why they said no — lost reason tracking (built 2026-10-01, branch `feat/lost-reason`, NOT merged)

Paul's brief: when a prospect is marked Not interested, let the salesperson record WHY, from structured
reasons, and show the counts on the Admin dashboard. v1 only: no objection scripts, no AI, no inference.

## 1. Data

`outreach_leads`: `lost_reason` (CHECK: the nine values), `lost_reason_note` (≤ 300, required for Other —
also a CHECK), `lost_reason_recorded_at`, `lost_reason_recorded_by`. Migration
`20261002200000_lost_reason.sql` (**not applied** — apply before any deploy that reads the columns).
- The one write is `lead_set_lost_reason(_lead_id, _reason, _note)`: `_require_work` (admin any lead;
  sales only their own non-client lead), refuses unless the lead is `not_interested`, writes History
  `lead_activity` kind `lost_reason_set` `{reason, note, from_reason, from_note}`. Same values → unchanged.
- Trigger `trg_outreach_leads_left_no_clears_lost_reason`: a lead leaving `not_interested` (revive, Won)
  has its canonical reason cleared so a later no starts blank. History keeps every reason.
- `sales_leads` view gains `lost_reason`, `lost_reason_note` (appended).
- No backfill. Older Not interested leads read "Reason not recorded".

The list: `src/lib/lostReason.ts` (Too expensive · Already has someone · Doesn't see the value · Bad timing /
not right now · Not interested in AI / AI visibility · Doesn't need more work · Doesn't trust it / sceptical ·
Wants to think about it · Other). No earlier reason enum existed (the call script's objections are copy).

## 2. Where it is asked

One prompt, `LostReasonPrompt` (mounted once in AppLayout), opened by `askLostReason`
(`src/lib/lostReasonAsk.ts`, which also holds the one write `saveLostReason`):
- `PipelineStatusSelect` with `askReasonFor` — the Outreach row pill, the lead workspace (LeadDetailDialog,
  also opened from the Inbox), the Inbox list and thread header. Asked after the caller's write; a caller
  returning `false`/`null` (refused) is not asked.
- The Work panel's "Not interested" outcome (`LeadWorkPanel.followOn`, lead popup and Focus Mode), when the
  lead then reads Not interested and nothing failed.
- The Work panel's "Why they said no" line (only while Not interested): Change / Add reason.
Not asked: Outreach bulk status changes (those leads read "Reason not recorded"), automation
(hook-not-interested), Closed / opted out.

## 3. Dashboard

`foldLostReasons` in `adminMetrics.ts` → `AdminOverview.lostReasons`; panel `LostReasonsPanel`
(`src/components/admin/lostReasons.tsx`) in Sales intelligence. Base: leads with status `not_interested`
whose newest "no" in History (the funnel's events) is in the dashboard period (fallback: when the reason was
recorded); all time = all of them; a test account's no excluded. Percent = of leads WITH a reason. "Reason
not recorded" shown apart. Each row opens to up to 25 leads (note, who), linking to `/outreach?lead=`.
`admin-overview` BUILD_ID `admin-overview-2026-10-01-lost-reasons`; its load reads the four columns.

## 4. Deploy order (when approved)

SQL first (read back the columns, the function, the CHECKs, the trigger, the view) → deploy
`admin-overview` (it selects the new columns) → push main (the SPA reads them in the Work panel). The SPA or
the function before the SQL breaks the Work panel / the dashboard.

## 5. Verified

Live database, rolled back (the migration applied inside one transaction, then RAISE): sales on own lead
ok; Other without note refused, with note ok; unknown reason / note > 300 / lead not Not interested refused;
another rep's lead refused `not_your_lead`; the sales view shows the reason; admin correction ok with History
`from_reason`; leaving Not interested clears the reason and keeps both History rows; the CHECK refuses Other
with no note; star, set stage and Next Action unchanged. Read back after: no columns, no function, no QA rows.
`scripts/lost-reason.test.ts` fences the list parity, the rules, History words, the dashboard fold and the
wiring.
