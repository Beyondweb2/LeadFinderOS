-- Create a table to track all businesses ever added to outreach (even if deleted)
CREATE TABLE public.outreach_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  google_maps_url TEXT,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outreach_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own history"
ON public.outreach_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own history"
ON public.outreach_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_outreach_history_user_id ON public.outreach_history(user_id);
CREATE INDEX idx_outreach_history_google_maps_url ON public.outreach_history(google_maps_url);