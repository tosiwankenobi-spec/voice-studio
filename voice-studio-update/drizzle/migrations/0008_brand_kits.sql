CREATE TABLE public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE,
  primary_color text NOT NULL DEFAULT '#f5a524' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text NOT NULL DEFAULT '#1a1410' CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  font text NOT NULL DEFAULT 'Syne' CHECK (font IN ('Syne', 'Plus Jakarta Sans', 'Georgia', 'Arial')),
  intro_text text NOT NULL DEFAULT '' CHECK (length(intro_text) <= 80),
  outro_text text NOT NULL DEFAULT '' CHECK (length(outro_text) <= 80),
  cta text NOT NULL DEFAULT '' CHECK (length(cta) <= 80),
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_kits TO authenticated;
GRANT ALL ON public.brand_kits TO service_role;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brand select" ON public.brand_kits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own brand insert" ON public.brand_kits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own brand update" ON public.brand_kits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own brand delete" ON public.brand_kits FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER brand_kits_touch BEFORE UPDATE ON public.brand_kits FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
