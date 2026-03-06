

## Issue 1: Admin Dashboard — Cannot Delete Users

**Root Cause:** The `AlertDialogAction` component's `onClick` handler fires asynchronously, but the dialog closes immediately (default Radix behavior). In certain scenarios with React 19, the component unmounts before the async `deleteUser` function completes its first `await` call, which silently kills the operation. No delete request ever reaches the backend (confirmed by empty edge function logs).

**Fix:** Refactor the delete flow to be state-driven rather than relying on the AlertDialog's inline onClick. Use a separate `userToDelete` state + a standalone AlertDialog outside the table row loop. When the user confirms, the dialog closes and the delete runs independently of the dialog lifecycle.

**Changes:**
- `src/pages/AdminDashboard.tsx` — Add `userToDelete` state, move the single-user delete AlertDialog outside the table `map()` loop, and trigger delete from state change rather than inline onClick.

---

## Issue 2: Affiliate Dashboard — Trials Not Tracked

**Root Cause (A — affiliate_code not saved):** The signup flow goes: Landing → StartFreeTrial → Stripe Checkout → CompleteSetup (calls `complete-signup`). The `complete-signup` edge function creates the `user_trials` row but **never receives or saves** the `affiliate_code` / `ref_source` from localStorage. The `create-checkout` function also can't read it because the user isn't authenticated yet (email-first flow), so user_trials doesn't exist to query.

**Root Cause (B — trial_signups count uses user_trials.affiliate_code):** The affiliate dashboard's `list` action counts trial signups by querying `user_trials WHERE affiliate_code = code`. Since the code is never saved (root cause A), the count is always 0.

**Root Cause (C — invoice.paid user lookup is fragile):** The `stripe-webhook` `invoice.paid` handler calls `listUsers()` without filter/pagination, which can miss users when the list grows beyond the default page size.

**Fixes:**

1. **`src/pages/CompleteSetup.tsx`** — Read `leadfinder_affiliate_code` and `leadfinder_ref_source` from localStorage and pass them in the `complete-signup` request body.

2. **`supabase/functions/complete-signup/index.ts`** — Accept `affiliate_code` and `ref_source` from the request body. When inserting or updating the `user_trials` row, include these values.

3. **`supabase/functions/stripe-webhook/index.ts`** — In the `invoice.paid` handler, replace the unfiltered `listUsers()` call with a filtered lookup by email (same optimization done for `check-email-subscription`). This ensures affiliate conversions are recorded reliably even with many users.

4. **`supabase/functions/create-checkout/index.ts`** — For the anonymous (email-first) flow, accept `affiliate_code` and `ref_source` from the request body and store them in checkout session metadata, so they survive through the Stripe flow to `complete-signup`.

5. **`src/pages/StartFreeTrial.tsx`** — Pass `affiliate_code` and `ref_source` from localStorage when calling `create-checkout`.

---

### Summary of file changes

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | State-driven delete dialog to fix unmount issue |
| `src/pages/CompleteSetup.tsx` | Pass affiliate/ref from localStorage to complete-signup |
| `src/pages/StartFreeTrial.tsx` | Pass affiliate/ref from localStorage to create-checkout |
| `supabase/functions/complete-signup/index.ts` | Accept and save affiliate_code + ref_source |
| `supabase/functions/create-checkout/index.ts` | Accept affiliate/ref for anonymous flow, store in metadata |
| `supabase/functions/stripe-webhook/index.ts` | Fix invoice.paid user lookup to use filtered query |

