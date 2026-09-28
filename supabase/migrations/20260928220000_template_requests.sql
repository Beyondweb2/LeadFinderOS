-- "Request a template" (2026-09-28). Additive only. Applied one statement at a time and read back.

-- 1. The requests. Written ONLY by the edge function template-request (service role): the row is
--    saved FIRST, then the email is attempted and its outcome recorded here, so a Resend failure never
--    loses a request. message_text / use_case / why_not_existing are stored exactly as typed.
create table if not exists public.template_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_by uuid not null references auth.users(id),
  requester_name text,
  requester_email text,
  requester_role text,
  proposed_name text,
  message_text text not null check (length(message_text) between 1 and 1024),
  use_case text not null check (length(use_case) between 1 and 300),
  why_not_existing text not null check (length(why_not_existing) between 1 and 300),
  source text check (source in ('queue', 'inbox', 'lead')),
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'not_configured')),
  email_error text,
  emailed_at timestamptz
);

-- 2.
create index if not exists template_requests_by_requester on public.template_requests (requested_by, created_at desc);

-- 3. RLS on; no INSERT / UPDATE / DELETE policy for any signed-in role (the function writes as the
--    service role), so nobody can forge, edit or remove a request from the browser.
alter table public.template_requests enable row level security;

-- 4. A person reads their OWN requests; the admin reads every request. Nobody reads anyone else's.
create policy "template requests: own or admin" on public.template_requests for select to authenticated
  using (requested_by = (select auth.uid()) or (select public.my_role()) = 'admin');

-- 5. anon gets nothing at all.
revoke all on public.template_requests from anon;
