-- Create table to track copied phone numbers per user
CREATE TABLE public.copied_phones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL,
  copied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.copied_phones ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user access
CREATE POLICY "Users can view their own copied phones" 
ON public.copied_phones 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own copied phone records" 
ON public.copied_phones 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create unique index to prevent duplicate entries
CREATE UNIQUE INDEX idx_copied_phones_user_lead 
ON public.copied_phones (user_id, lead_id);

-- Create index for faster lookups
CREATE INDEX idx_copied_phones_user_id 
ON public.copied_phones (user_id);