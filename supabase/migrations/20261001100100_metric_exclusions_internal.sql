-- ADMIN CONTROL CENTRE: internal / test identities found in the live data, 2026-09-30.
-- Additive and idempotent. Nothing is deleted; each row only keeps activity out of business numbers,
-- and the dashboard shows that exclusions apply. Evidence is in each reason.
-- ⛔ An EMAIL row marks SUBMISSIONS (sign-ups, free checks, site visits) as internal — never a whole
-- lead: Paul's address sits on real businesses' rows he tested the sign-up on (src/lib/metricExclusions.ts).
insert into public.metric_exclusions (kind, value, reason) values
  ('email', '@move37.fun', 'Paul''s own domain: sign-ups and free checks submitted while testing the flow'),
  ('email', 'pauljsales455@outlook.com', 'The book owner''s data account'),
  ('lead', '3fbe1310-ea9f-43d7-a016-b27df4fc9a56', 'Test sign-up "Paul SALES": Paul''s email, invalid phone'),
  ('lead', '3d4cfd30-932d-4087-a6c3-de3c9ba3debd', 'Test sign-ups "White Sparks Electrical": four rows with Paul''s email, no phone'),
  ('lead', '0ae97867-8e4a-4239-87fc-78c1eb412fc3', 'Test lead "4seas": Paul''s email, Thai test number'),
  ('lead', '9267a8c7-3d58-4083-9bbf-a36ce52e439c', 'Test lead "sinners and saints": Paul''s email, Thai test number'),
  ('lead', '7d99b0cf-b593-4dc6-9efd-b8c9ea17b049', 'Test lead "richard": internal address, no phone')
on conflict (kind, value) do nothing;
