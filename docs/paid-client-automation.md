
## Live check (2026-10-02, fixture ZZ QA8 `10200000-…-0002a1`, archived + excluded afterwards)
- `q2_prefill` returned the salesperson's services and towns with the 'on the phone' line; `complete_q2` saved; `onboarding_submitted` recorded once (a second submit added nothing).
- Admin `list`: 6 clients, each with a state, n/m and one next step; the real clients placed by progress (in delivery / ended), none sent back to waiting.
- `save_handoff` (admin): complete, History 'completed' then 'updated'; a no-change save wrote nothing. `submit_delivery` refused 409 listing the missing items.
- Not exercised live: a real Stripe payment (the new-client email, the claim, 'Payment received'). The first real payment is that proof.
