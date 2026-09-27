-- Multi-user, part 1 of 2: the SALES role value.
-- Its own file and its own transaction: Postgres cannot USE an enum value in the transaction that
-- adds it, and part 2's functions and policies compare against 'sales'.
alter type public.app_role add value if not exists 'sales';
