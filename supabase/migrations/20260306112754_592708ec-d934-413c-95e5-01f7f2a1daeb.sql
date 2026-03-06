
-- Backfill trial_used = true for all existing users who:
-- 1. Have a user_trials record (meaning they had access under the old system)
-- 2. Don't have an active Stripe subscription (subscriptions table)
-- This prevents old free users from getting another free trial
UPDATE public.user_trials
SET trial_used = true
WHERE trial_used = false
  AND user_id NOT IN (
    SELECT user_id FROM public.subscriptions
    WHERE status IN ('active', 'trialing')
  )
  AND created_at < now() - interval '1 day';
