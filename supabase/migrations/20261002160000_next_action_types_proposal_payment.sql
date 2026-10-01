-- Two Next Action types that are commercially distinct (2026-10-02, Paul): a proposal / offer has to go to the
-- prospect; money is outstanding on a sale. Kept apart from "Send information" and "Follow up" so filters, the
-- dashboard and sales reporting can count them. Applied on its own, before anything uses the values.
-- ⛔ Not added (Paul): "Send agreement" / "Chase signature" — the agreement state will come from the contract
-- workflow itself, not from a CRM action type.
alter type public.next_action_type add value if not exists 'send_proposal';
alter type public.next_action_type add value if not exists 'chase_payment';
