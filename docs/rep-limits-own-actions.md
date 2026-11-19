# Only a rep's own successful actions count (v1-rep-limits-own-actions, 2026-11-19)

## What counted against Valentin on 19 Nov (UK day, from api_usage_log + sales_check_items)

| Counted | How many | Source |
|---|---|---|
| Lead search | 2 | his own clicks (10:49–10:50) |
| Agency check on results | 32 | automatic on his search results (free, no limit) |
| Google lookups (place_details) | 83 allowed + **51 refused** | his one "Add 41 leads" (10:50–10:52): 8 lookups at once against the 40-a-minute guard. The refused ones were the add's own automatic retries; they never counted, but each wrote a `rate_limit` refusal and a restriction alert (51 occurrences). **This is the "limit" he was told he hit.** |
| Leads added | 41 | his click |
| AI checks (sales_check, 50 a day) | 40 | his one bulk check (10:53). **34 done, 6 failed** (audit failed): the 6 failed still used his allowance — now given back |
| WhatsApp sends | 33 | his own sends / queue |
| AI drafts | 3 | his own |
| Self-heal re-runs, hedges, Google AI runs, reply-chain audits | 0 | never in his name: the queue books every Apify run to the book owner (7 days: all `apify_ai_search` rows are the admin's) |

## The rule (src/lib/usageRefund.ts)

- Never counted: system retries, self-heal re-runs, hedges, the separate Google AI run, reply-chain audits (none writes a
  guard row in the rep's name), refused tries (the guard counts `allowed` / `warned` only).
- A failed attempt is given back: `refundGuardRow` (`_shared/usage-refund.ts`) marks the rep's guard row `refunded`, estimate
  0, reason `refunded: …` — so per-day / per-10-min action limits, the person's spend cap and the per-lead limit stop counting
  it. Called from the queue's finalise winner (an ordinary lead audit that failed or never ran) and from the bulk check (not
  started / never started / restarted). Nothing is deleted.
- The daily check allowance skips failed checks.
- The per-lead limit (3 a day) counts the rep's own guard rows for the lead (hook audits and checks), never the lead's audits.
- An audit that fails and later heals itself stays given back (generous, never double).
- Find Leads "Add" paces its lookups at 36 a rolling minute (`PLACE_LOOKUPS_PER_MINUTE`), under the guard's 40.
- Reps see "X of 50 checks used today" on the Outreach check bar.

## Not changed

- The limits themselves (protection_settings, Paul's), the company prospecting budget (real money, counts every run).
