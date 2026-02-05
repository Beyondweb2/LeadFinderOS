-- Add missing RLS policies for outreach_activities table
-- Allow users to update their own activities
CREATE POLICY "Users can update their own activities" 
ON public.outreach_activities FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own activities
CREATE POLICY "Users can delete their own activities" 
ON public.outreach_activities FOR DELETE 
USING (auth.uid() = user_id);