CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  function_name text NOT NULL,
  api_type text NOT NULL,
  calls_made integer NOT NULL DEFAULT 1,
  cache_hit boolean NOT NULL DEFAULT false,
  search_session_id text,
  estimated_cost_usd numeric(10,6)
);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access" ON public.api_usage_log FOR ALL USING (false);