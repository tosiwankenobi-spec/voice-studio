CREATE TABLE public.ad_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_url text NOT NULL DEFAULT '',
  product jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_projects TO authenticated;
GRANT ALL ON public.ad_projects TO service_role;
ALTER TABLE public.ad_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ads select" ON public.ad_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own ads insert" ON public.ad_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ads update" ON public.ad_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ads delete" ON public.ad_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ad_projects_user_updated_idx ON public.ad_projects (user_id, updated_at DESC);
CREATE TRIGGER ad_projects_touch BEFORE UPDATE ON public.ad_projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
