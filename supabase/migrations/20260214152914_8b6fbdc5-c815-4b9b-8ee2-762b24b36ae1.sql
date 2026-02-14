
-- Add image_url column to outreach_leads
ALTER TABLE public.outreach_leads ADD COLUMN image_url text NULL;

-- Create storage bucket for lead images
INSERT INTO storage.buckets (id, name, public) VALUES ('lead-images', 'lead-images', true);

-- Storage policies
CREATE POLICY "Users can upload their own lead images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own lead images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own lead images"
ON storage.objects FOR DELETE
USING (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Lead images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-images');
