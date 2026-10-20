CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'My voice',
  eleven_voice_id text NOT NULL,
  sample_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voices TO authenticated;
GRANT ALL ON public.voices TO service_role;
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own voices select" ON public.voices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own voices insert" ON public.voices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own voices update" ON public.voices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own voices delete" ON public.voices FOR DELETE TO authenticated USING (user_id = auth.uid());