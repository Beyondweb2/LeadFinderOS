# Prospect re-check (Paul, 2026-11-16, branch `v1-prospect-recheck`)

On a call a rep finds the lead's details were wrong ("Engineer" was really "Mechanic"). They fix them and run a focused re-check.

## What it does

- **Lead → Call tab → What we found → Business details** (`src/components/ProspectRecheckPanel.tsx`, mounted in `SimpleCallTab.tsx`):
  trade, areas served, main services. **Fix details** saves through `lead_set_details` (trade = `search_keyword`) and
  `lead_set_profile` (`service_areas`, `services_included`; address/website untouched) — both roles, own leads only. Each save
  writes the existing `details_set` History row (actor + time); the panel shows "Changed by <name> · <time>" from it.
  No new column, no migration.
- **Re-check now**: three searches pre-filled from the details as they are now (`recheckDraftQuestions`), editable.
  `checkRecheckQuestions` (panel AND server) refuses: not exactly 3, a blank, a repeat, too long, or **any search containing
  the business's own name** (the baseline "branded" ruler `nameMatches`, plus the full name word for word).
- **Run**: `create-ai-audit` with `purpose: 'recheck'`, a NEW audit (never reused / never runs bolted onto an old one),
  `baseline_target_runs = 3`, runs 2 and 3 fired by `advanceBaseline` exactly like a Discovery. 3 searches × 3 asks ×
  ChatGPT + Gemini = 18 answers. Created after `AUDIT_RULES_V4_FROM`, so the report uses v4 (locked spots, one firm per
  spelling, Couldn't measure, Audit incomplete). No SEO scan (not in `SEO_SCAN_PURPOSES`).
- **Result**: on the lead (`useLeadRecheck` → `pooledSummary`, the report's own functions: "Already named X · Winnable Y ·
  Not winnable Z · …", or "Audit incomplete") and on its own report link. `chooseReportDesign('recheck') = 'opportunity'`;
  both the Findable and LeadFinderOS pages show **"Re-check: 3 searches, asked 3 times each"** beside the date.
  Copy link follows the campaign's report style. The Inbox report link (`resolveLeadReportAudit`) picks the newest usable
  audit, so it points at the re-check once it has answers.
- **Old audits**: kept, untouched, their public links show what they always showed. On the lead they read
  **"Replaced: details were wrong"** — DERIVED (`replacedAuditIds`: every outreach check and earlier re-check older than
  the newest re-check), never stored. Nothing deleted.
- **Budget**: purpose `recheck` → prospecting pool (`budgetPoolForPurpose`). `create-ai-audit` asks the pool + Apify 85%
  reserve with the full estimate (3 × 3 questions) and refuses with `prospecting_budget_used`; the queue refuses at start
  (`apify_reserve` / `daily_cap`). The panel shows either as a plain skip reason (`recheckSkipReason`).
- **Limits**: a rep only on a lead they work (`salesAuditRefusal` allows exactly `recheck` with a lead, no reuse, not a
  hook); not on a paid client; `guardAction('hook_audit')` with 3× the hook estimate; one check in flight per lead; at
  most `RECHECK_PER_LEAD_PER_DAY` (2) re-checks per lead per day.
- The call card (`HookVisibilityCard`) ignores re-checks (`isOutreachAudit` excludes them): it scores one run of a hook.

## Not changed

Opt-outs / Do Not Contact, sending, free-window rules, existing audits and reports, V2, whatsapp-status.

## Deploy (when approved; not done)

No migration. Backend first: `create-ai-audit`, `render-audit-report` (and `audit-watch` for the Past-audits split).
`roleRules.ts` is reached by 62 functions, but only `create-ai-audit` calls the changed `salesAuditRefusal`, so no other
function needs redeploying for it — and ⛔ never `whatsapp-status`. Then the SPA.

Tests: `scripts/prospect-recheck.test.ts`, `scripts/role-rules.test.ts` (re-check cases).

## Added before release (Paul, 2026-11-16)

1. **The Opportunity score uses the re-check.** audit-watch now stores `verdict_counts` for a settled re-check as for a
   Discovery (`verdictCountsOf`, purposes `discovery` + `recheck`), plus the named share over every answer
   (`namedAnswers` / `answers`). It never counts a re-check from fewer runs than it asks (unless no new run for 30 min).
   The cron gate `invoke_audit_watch()` wakes for re-checks too (migration `20261222090000_audit_watch_recheck_counts.sql`,
   one-line change; rollback = re-run `20261220090000`). In the lists, `oppAuditByLead` (`src/lib/oppAuditInputs.ts`)
   attaches the lead's newest re-check when it is newer than the hook the score reads (or there is no hook); the AI part
   then comes from the re-check ("AI named them in 2 of 18 answers (re-check)", winnable searches from its split). While it
   is still asking the score says "Incomplete — Re-check still running", never the replaced hook's number.
2. **Admins can re-check any lead** (any owner, clients included): create-ai-audit's sales checks never applied to an admin,
   `can_work_lead` lets an admin save details on any lead, and the per-lead daily limit is now reps-only. Budget, person
   guard and the in-flight dedupe still apply to everyone.
3. **Queue status line fast.** process-whatsapp-queue `mode: 'my_queue'` skips the panel-only reads (six head counts, the
   audit-ready count, number health, pause history, test-held count). Everything the line uses is the same code as the
   tick; the tick and every other mode are unchanged. The answer carries `x-queue-timing: auth=…;my_queue=…`.
