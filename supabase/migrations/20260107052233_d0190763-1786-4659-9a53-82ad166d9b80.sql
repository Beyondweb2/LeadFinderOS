-- Add user_id column to lead_contacts table
ALTER TABLE public.lead_contacts 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing rows to have a null user_id (they'll need to be re-created by authenticated users)
-- For new rows, user_id will be required

-- Make user_id NOT NULL for future inserts (after setting default or updating existing)
-- First, delete any existing data since it has no user association
DELETE FROM public.lead_contacts WHERE user_id IS NULL;

-- Now make user_id NOT NULL
ALTER TABLE public.lead_contacts 
ALTER COLUMN user_id SET NOT NULL;

-- Drop the insecure policy
DROP POLICY IF EXISTS "Allow all operations on lead_contacts" ON public.lead_contacts;

-- Create secure RLS policies for authenticated users only

-- Users can view their own contacts
CREATE POLICY "Users can view their own lead contacts" 
ON public.lead_contacts 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own contacts
CREATE POLICY "Users can create their own lead contacts" 
ON public.lead_contacts 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own contacts
CREATE POLICY "Users can update their own lead contacts" 
ON public.lead_contacts 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own contacts
CREATE POLICY "Users can delete their own lead contacts" 
ON public.lead_contacts 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);