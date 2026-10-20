CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('image','video')),
  prompt text NOT NULL DEFAULT '',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.media TO authenticated;
GRANT ALL ON public.media TO service_role;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media select" ON public.media FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own media insert" ON public.media FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own media delete" ON public.media FOR DELETE TO authenticated USING (user_id = auth.uid());