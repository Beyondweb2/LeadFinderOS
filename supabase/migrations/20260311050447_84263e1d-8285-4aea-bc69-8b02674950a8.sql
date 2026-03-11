
CREATE TABLE public.personal_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own personal actions"
  ON public.personal_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own personal actions"
  ON public.personal_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own personal actions"
  ON public.personal_actions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own personal actions"
  ON public.personal_actions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_personal_actions_user_id ON public.personal_actions (user_id);
