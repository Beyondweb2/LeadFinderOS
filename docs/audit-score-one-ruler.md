# One audit score everywhere (2026-10-22, Paul)

Branch `feat/inbox-approval-cleanup`. Paul: "the audit results shown in the Inbox do not sync up properly or are not accurate".
Rules: `src/lib/auditScore.ts`. Worker: `supabase/functions/_shared/audit-scores.ts` (run by the `ai-reply-drafts` tick).
Migration `20261124110000_audit_score_one_ruler.sql`. Tests: `scripts/audit-score-one-ruler.test.ts`.

## What was measured (read-only, 22 Oct, the 3,060 Inbox leads; 1,653 with an audit)

Every Inbox lead's list chips (`inbox_engine_signals`) were compared with the card's own scorer (`scoreHookAuditForCard`, the
report's ruler) on the card's own audit (`pickHookAudit`). 171 leads disagreed:

| Cause | Leads | Example (list → card) |
|---|---|---|
| The list summed EVERY run of the audit | 68 | Lancashire Locks Ltd: ChatGPT 6/6 Gemini 4/6 → 3/3, 1/3 |
| "Named" read by the stored model verdict, not the answer text | 71 | Orbit Driving School Rugby Automatic: Gemini 2/3 → 0/3 |
| Google AI counted per row with text, not per question shown | 103 | ELITE ELECTRICAL LTD: Google AI 1/2 → 0/2 |
| The list read a newer audit of another purpose (baseline, Discovery, weekly check) | 6 | BS4 Electrical Services Ltd (Discovery), MCLocksmiths centre (baseline) |
| List scores where the card has no outreach audit at all | 3 | MK Plumbing & Heating |
| Visible verdict differs between the two rulers (live rule `both:half`) | 26 | among the leads actually judged: 2 would gain Visible, 5 would lose it |

Other faults found in the code (not visible in a SELECT):
- The chips, the Gemini pill and the Visible chip were loaded only on a full Inbox load. ai_audits / ai_audit_runs are not
  realtime-published, so an audit finishing never reached the list until a reload.
- The Visible sweep ran only when the tick ran, and the tick ran only when a reply was waiting.
- A Visible verdict was never re-judged when the competitor reader later changed `self_named` on the same audit.
- The drafter's fallback count was the run summary, which counted ChatGPT and was written before the competitor reader.
- Stored per-answer flags were NOT stale: 0 of ~14,000 disagreed with their own result JSON.
- `result_slim` is the website check (`lead_crawl_checks`), not the audit; it holds no AI counts and was not a cause.

## The rule now

- ONE scorer (`scoreHookAuditForCard`) on ONE audit (`pickHookAudit`: the newest outreach audit, its newest run), stored per
  run in `ai_audit_runs.hook_score` (`storedScoreOf`, versioned `AUDIT_SCORE_VERSION`).
- The database marks a run dirty (`score_dirty_at`) on every answer write, run status change and audit name / trade / town /
  purpose change. The tick rescores dirty runs first (newest first, 60 a tick, 20 s), clearing the mark only if nothing
  re-marked it meanwhile. A dirty or missing score shows as "updating", never as final.
- Readers: the Inbox list row and thread header (`ScoreLine`), the Visible judge (`visibleCountsOf`), the drafter's fallback
  (the stored one-third share). The Inbox gets the score with the audits read, so the changed-since catch-up (`scored_at`)
  and a 45 s re-read of dirty audits bring new numbers without a reload. `inbox_engine_signals` / `inbox_gemini_signals` are
  no longer called (kept in the database, unused).
- The Visible rule key now carries the score version (`both:half:s1`), so every judged lead is re-judged once on the new
  numbers; a changed score clears `ai_visible_checked_audit_id` so it is re-judged again.

## Not changed here (follow-ups)

- The pitch send gate `_shared/audit-reply.ts` `resolveAuditReplyVars` picks the newest audit with a done run of ANY purpose and
  lets "named others instead" through when the share is unknown. It is reached by process-whatsapp-queue (not to be touched
  in this task), so it is unchanged.
- The AiAudit page's live tally counts without the answer-text context; the ProspectAuditView headline leaves Google AI out.
- `fill_ai_audit_queue_parts` lost the `result_niche` line in migration 20261116100000 (market-view / niche-sample read it).
