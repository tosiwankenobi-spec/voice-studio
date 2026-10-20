CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,
  units integer NOT NULL DEFAULT 1 CHECK (units >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage select" ON public.usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own usage insert" ON public.usage_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX usage_events_user_created_at_idx ON public.usage_events (user_id, created_at);
COMMENT ON TABLE public.usage_events IS 'AI request attempts reserved before provider calls; units are estimates, not billed cost. Small concurrent limit overshoot is accepted.';