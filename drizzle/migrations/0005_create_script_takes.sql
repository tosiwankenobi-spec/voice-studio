CREATE TABLE public.script_takes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
 line_index integer NOT NULL,
 line_text text NOT NULL,
 voice text NOT NULL,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 storage_path text NOT NULL,
 chosen boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT script_takes_line_index_valid CHECK (line_index >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.script_takes TO authenticated;
GRANT ALL ON public.script_takes TO service_role;
ALTER TABLE public.script_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own takes select" ON public.script_takes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own takes insert" ON public.script_takes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND storage_path LIKE auth.uid()::text || '/takes/%' AND EXISTS (SELECT 1 FROM public.scripts WHERE id = script_id AND user_id = auth.uid()));
CREATE POLICY "own takes update" ON public.script_takes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND storage_path LIKE auth.uid()::text || '/takes/%' AND EXISTS (SELECT 1 FROM public.scripts WHERE id = script_id AND user_id = auth.uid()));
CREATE POLICY "own takes delete" ON public.script_takes FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX script_takes_script_line_idx ON public.script_takes (script_id, line_index);
CREATE UNIQUE INDEX script_takes_one_chosen_idx ON public.script_takes (script_id, line_index, line_text) WHERE chosen;
CREATE FUNCTION public.limit_script_takes() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 PERFORM 1 FROM public.scripts WHERE id = NEW.script_id AND user_id = auth.uid() FOR UPDATE;
 IF (SELECT count(*) FROM public.script_takes WHERE script_id = NEW.script_id AND line_index = NEW.line_index AND line_text = NEW.line_text AND id <> NEW.id) >= 3 THEN
  RAISE EXCEPTION 'Each line can have up to 3 takes.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER script_takes_limit BEFORE INSERT OR UPDATE ON public.script_takes FOR EACH ROW EXECUTE FUNCTION public.limit_script_takes();