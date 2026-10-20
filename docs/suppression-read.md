# Reading the do-not-contact list from the screen (2026-10-20)

## The fault
`public.contact_suppressions` has RLS on and **no policies** (service-role only since `20260714120000`). A browser
read of it returns `200 []` for everyone. `src/components/OutreachTable.tsx` read it directly in two places:

- the bulk **Run AI audit** dialog (`auditSuppressedIds`, by phone and by lead id) — so a suppressed lead was never
  listed under "do-not-contact" and was counted as ready;
- the bulk **Queue follow-up** count (`handleQueueContactFollowup`, by phone) — so "said no" was always 0.

No message went out wrongly: the senders (bulk-jobs, the drip, `send-whatsapp-message`) read the table as the service
role and refuse. Only the screen counts were wrong. (The opener queue already asked `process-whatsapp-queue`
`contact_check`; the Wrong number pill already used `lead_wrong_number` / `leads_wrong_numbers`.)

## The fix
- SQL `public.leads_suppressed(_lead_ids uuid[]) returns uuid[]` (migration `20261113090000_leads_suppressed.sql`),
  modelled on `leads_wrong_numbers`: SECURITY DEFINER, `my_role()` not null, `can_work_lead` per lead (admin any lead,
  a salesperson only leads assigned to them that are not clients), ≤ 500 ids a call, anon revoked.
- ⛔ Lead ids in, lead ids out. No phone argument (that would let anyone probe any number) and no reason / source out.
- As strict as before: ANY suppression row (every reason) counts, matched on `lead_id` OR the lead's number in
  `phone_e164_key` form OR the plain `+digits` form the screen used to send.
- Browser helper `src/lib/leadSuppression.ts` `fetchSuppressedLeadIds` (chunks of 500; `null` = could not check, which
  both callers treat as best-effort, as before — the senders stay the enforcement).
- `scripts/no-browser-suppression-read.test.ts`: no `src/` file names `contact_suppressions` as code (comments and the
  generated types are fine), and pins the function's shape.

## Verified
Dry run in a rolled-back transaction on live data (2026-10-20), then the live read-back after applying: see the
commit / session report for the numbers (rep → only their own suppressed lead; admin → every suppressed lead in the
sample, no false hits; anon cannot execute).

Known edge: an old India lead stored in national form ("98…") keys as `+44…` in `phone_e164_key`; it still matches
by `lead_id` when the suppression row carries it. India is no longer an outreach market.
