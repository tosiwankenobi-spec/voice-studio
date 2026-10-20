CREATE TABLE public.pronunciations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), term text NOT NULL CHECK (length(trim(term)) BETWEEN 1 AND 120), say_as text NOT NULL CHECK (length(trim(say_as)) BETWEEN 1 AND 240), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pronunciations TO authenticated;
GRANT ALL ON public.pronunciations TO service_role;
ALTER TABLE public.pronunciations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pronunciations select" ON public.pronunciations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own pronunciations insert" ON public.pronunciations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own pronunciations update" ON public.pronunciations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own pronunciations delete" ON public.pronunciations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE UNIQUE INDEX pronunciations_user_term ON public.pronunciations (user_id, lower(term));