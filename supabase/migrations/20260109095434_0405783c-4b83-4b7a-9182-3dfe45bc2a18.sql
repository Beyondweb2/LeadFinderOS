
-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create enum for lead status
CREATE TYPE public.lead_status AS ENUM (
  'not_contacted',
  'contacted', 
  'call_back',
  'not_answered',
  'on_hold',
  'wants_draft',
  'interested',
  'not_interested'
);

-- Create enum for next action type
CREATE TYPE public.next_action_type AS ENUM (
  'call',
  'follow_up',
  'send_draft',
  'remove_if_no_reply',
  'none'
);

-- Main outreach leads table
CREATE TABLE public.outreach_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  google_maps_url TEXT,
  address TEXT,
  category TEXT,
  
  -- CRM fields
  status public.lead_status NOT NULL DEFAULT 'not_contacted',
  next_action public.next_action_type DEFAULT 'call',
  next_action_date DATE,
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Activity log for tracking all interactions
CREATE TABLE public.outreach_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outreach_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for outreach_leads
CREATE POLICY "Users can view their own leads" 
ON public.outreach_leads FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own leads" 
ON public.outreach_leads FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leads" 
ON public.outreach_leads FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own leads" 
ON public.outreach_leads FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for outreach_activities
CREATE POLICY "Users can view their own activities" 
ON public.outreach_activities FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own activities" 
ON public.outreach_activities FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_outreach_leads_updated_at
BEFORE UPDATE ON public.outreach_leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_outreach_leads_user_id ON public.outreach_leads(user_id);
CREATE INDEX idx_outreach_leads_status ON public.outreach_leads(status);
CREATE INDEX idx_outreach_leads_next_action_date ON public.outreach_leads(next_action_date);
CREATE INDEX idx_outreach_activities_lead_id ON public.outreach_activities(lead_id);
