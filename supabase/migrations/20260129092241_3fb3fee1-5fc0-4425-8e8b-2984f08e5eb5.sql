-- Extend lead_status enum with new workflow statuses
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'sent_initial_text';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'replied';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'sent_voice_note';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'awaiting_decision';

-- Extend next_action_type enum with new actions
ALTER TYPE public.next_action_type ADD VALUE IF NOT EXISTS 'send_initial_text';
ALTER TYPE public.next_action_type ADD VALUE IF NOT EXISTS 'send_voice_note';
ALTER TYPE public.next_action_type ADD VALUE IF NOT EXISTS 'send_follow_up';
ALTER TYPE public.next_action_type ADD VALUE IF NOT EXISTS 'check_3_day_removal';

-- Create templates table for text messages and voice note scripts
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('text', 'voice_script')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Users can view their own templates"
  ON public.templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
  ON public.templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON public.templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON public.templates FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_templates_user_id ON public.templates(user_id);
CREATE INDEX idx_templates_type_category ON public.templates(template_type, category);