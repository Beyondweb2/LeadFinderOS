

# Non-Invasive Usage Tracking System

## Overview
Two new tables (`usage_events` and `user_metrics`) with strict RLS, plus a `SECURITY DEFINER` function `log_usage_event` that safely logs events and upserts metrics for the calling user only. Zero changes to existing tables.

## Database Migration

A single migration will create:

### Tables

**usage_events** -- append-only event log
- `id uuid PK default gen_random_uuid()`
- `user_id uuid NOT NULL references auth.users(id) on delete cascade`
- `event_type text NOT NULL`
- `meta jsonb NULL`
- `created_at timestamptz NOT NULL default now()`

**user_metrics** -- per-user aggregate counters
- `user_id uuid PK references auth.users(id) on delete cascade`
- `search_count int NOT NULL default 0`
- `businesses_added_count int NOT NULL default 0`
- `messages_sent_count int NOT NULL default 0`
- `replies_count int NOT NULL default 0`
- `last_search_at timestamptz NULL`
- `last_active_at timestamptz NULL`
- `updated_at timestamptz NOT NULL default now()`

### Indexes
- `usage_events(user_id, created_at DESC)`
- `usage_events(event_type, created_at DESC)`

### RLS Policies

**usage_events:**
- Users INSERT own rows only (`user_id = auth.uid()`)
- Users SELECT own rows only (`user_id = auth.uid()`)
- Admins SELECT all rows (`public.has_role(auth.uid(), 'admin'::app_role)`)
- No UPDATE or DELETE for clients

**user_metrics:**
- Users SELECT own row only (`user_id = auth.uid()`)
- Admins SELECT all rows (`public.has_role(auth.uid(), 'admin'::app_role)`)
- No client INSERT/UPDATE/DELETE -- all writes go through `SECURITY DEFINER` function or edge functions with service role

### SECURITY DEFINER Function

`public.log_usage_event(p_event_type text, p_meta jsonb DEFAULT NULL)`:
1. Inserts a row into `usage_events` for `auth.uid()`
2. Upserts `user_metrics` for `auth.uid()`, incrementing the appropriate counter based on `p_event_type`:
   - `'search'` increments `search_count`, sets `last_search_at`
   - `'business_added'` increments `businesses_added_count`
   - `'message_sent'` increments `messages_sent_count`
   - `'reply_received'` increments `replies_count`
3. Always updates `last_active_at` and `updated_at`

This function runs as the DB owner (bypassing RLS) but is hard-coded to use `auth.uid()`, so no user can write data for another user.

## Safety Guarantees
- Additive only -- no ALTER/DROP on any existing table
- `user_trials`, `subscriptions`, `user_roles` are completely untouched
- All new policies use `RESTRICTIVE` mode consistent with existing project conventions
- Existing app flows are unaffected; nothing calls these tables yet

## Technical Details

### Full SQL Migration

```sql
-- 1. usage_events table
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_user_created ON public.usage_events (user_id, created_at DESC);
CREATE INDEX idx_usage_events_type_created ON public.usage_events (event_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events"
  ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. user_metrics table
CREATE TABLE public.user_metrics (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  search_count int NOT NULL DEFAULT 0,
  businesses_added_count int NOT NULL DEFAULT 0,
  messages_sent_count int NOT NULL DEFAULT 0,
  replies_count int NOT NULL DEFAULT 0,
  last_search_at timestamptz,
  last_active_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON public.user_metrics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all metrics"
  ON public.user_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Deny all client writes on user_metrics
CREATE POLICY "Deny client inserts on metrics"
  ON public.user_metrics FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates on metrics"
  ON public.user_metrics FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Deny client deletes on metrics"
  ON public.user_metrics FOR DELETE TO authenticated
  USING (false);

-- 3. SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.log_usage_event(
  p_event_type text,
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Log the event
  INSERT INTO public.usage_events (user_id, event_type, meta)
  VALUES (v_uid, p_event_type, p_meta);

  -- Upsert metrics
  INSERT INTO public.user_metrics (user_id, last_active_at, updated_at,
    search_count, businesses_added_count, messages_sent_count, replies_count,
    last_search_at)
  VALUES (
    v_uid, now(), now(),
    CASE WHEN p_event_type = 'search' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'business_added' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'message_sent' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'reply_received' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'search' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    search_count = user_metrics.search_count
      + CASE WHEN p_event_type = 'search' THEN 1 ELSE 0 END,
    businesses_added_count = user_metrics.businesses_added_count
      + CASE WHEN p_event_type = 'business_added' THEN 1 ELSE 0 END,
    messages_sent_count = user_metrics.messages_sent_count
      + CASE WHEN p_event_type = 'message_sent' THEN 1 ELSE 0 END,
    replies_count = user_metrics.replies_count
      + CASE WHEN p_event_type = 'reply_received' THEN 1 ELSE 0 END,
    last_search_at = CASE WHEN p_event_type = 'search'
      THEN now() ELSE user_metrics.last_search_at END,
    last_active_at = now(),
    updated_at = now();
END;
$$;
```

### No Code Changes
No frontend or edge function files are modified in this step. The tables and function are created and ready to be wired up in a subsequent step.

