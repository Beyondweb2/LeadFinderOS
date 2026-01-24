-- Create a table to track businesses that have been checked (Google Maps link opened)
CREATE TABLE public.checked_businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  google_maps_url TEXT,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.checked_businesses ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own checked businesses" 
ON public.checked_businesses 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own checked businesses" 
ON public.checked_businesses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_checked_businesses_user_id ON public.checked_businesses(user_id);
CREATE INDEX idx_checked_businesses_google_maps_url ON public.checked_businesses(google_maps_url);