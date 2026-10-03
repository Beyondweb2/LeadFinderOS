# The monthly client update (built 2026-10-02, closeout session)

## Why

findable.live/terms (and the FAQ, /pricing, the Welcome Pack) promise every client on the monthly a concise
update: the AI visibility measurements available for that period, any change in whether AI names the
business, the improvements completed, the opportunities identified and the next steps, saying so when the
measurements are unchanged, inconclusive or unavailable. The terms page records that it is **prepared and
sent by hand** and that LeadFinderOS had no mechanism (checked 2026-09-30). This builds the smallest
operator workflow for it. It is not automation, and it does not send anything.

## What exists

- **Paid client page → "8. Monthly update"** (`src/components/MonthlyUpdatePanel.tsx`, mounted in
  `ClientHub.tsx`). Pick a London calendar month (from the payment month to now, `updateMonths`), read the
  stored evidence, write the sections, then Copy text and Mark as sent (email / WhatsApp / another way).
- **Words:** `src/lib/monthlyUpdate.ts`. Only the "What we measured" paragraph is generated, from stored
  `weekly_check_runs.summary` named/answered counts on the two scored engines. Every arrival is enumerated:
  no check, one check, and like-for-like more / fewer / unchanged. Checks that are not like for like
  (different question count or answered count) are never compared, and the text says so. It always says
  the checks are separate from the guarantee's re-measurement. It never says "audit" and never "improved".
- **Work is the operator's own words.** Pages the generator holds as `live` (touched that month) and
  opportunities with `implemented_at` that month are shown as **suggestions with an Add button**. "New page"
  is used only when the page was created that month, otherwise "Page updated". Empty sections are left
  out, never filled in; "What we did" and "What happens next" are required before it can be marked sent.
- **Data:** table `client_monthly_updates` (migration `20261006100000`), one row per client per month,
  `draft` → `sent` with the exact `message`, `sent_at`, `sent_channel`, `sent_by`. RLS on, **no policies,
  no grants**. Reads and writes go only through `monthly_update_facts` / `monthly_update_save` /
  `monthly_update_mark_sent` (SECURITY DEFINER, `my_role() = 'admin'` checked first). A sent row is the
  record: save and mark-sent both refuse it (`already_sent`). No edge function, so no deploy.

## Verified

- Migration applied by hand 2026-10-02 and read back: RLS on, 0 policies, 16 columns, no table privilege for
  anon / authenticated, three security-definer functions executable by authenticated only.
- Rolled-back DO block as the Test salesperson and as the admin, on RG's real data: sales refused by all
  three functions and by the table; future month refused; draft trimmed; no-draft, bad-channel, double-send
  and edit-after-send refused; the sent row carries message / channel / who / when. Nothing persisted.
- The real panel rendered in a throwaway Vite harness (leadRpc mocked with RG's real August/September
  facts, deleted before commit) at desktop and 375 px. Driving it found and fixed two bugs: a month switch
  showed the previous month's facts under the new month's name (a Save then filed words under the wrong
  month), and two quick Adds kept only the second line.
- `scripts/monthly-client-update.test.ts`; the words are in `client-copy-claims.test.ts` RENDERERS and the
  panel in its OPERATOR_SCREENS.

## Not built (deliberately)

- No automatic sending, email template or WhatsApp template. The terms say by hand.
- No "monthly update due" line in `deliveryStage` (it would need a `paid-client-hub` redeploy, and the
  ONE-next-step rule makes that Paul's call). The month list marks each month `· draft` / `· sent`.
