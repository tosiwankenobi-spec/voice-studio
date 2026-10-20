-- Spoken consent: each copied voice keeps the recording of its owner reading the consent sentence.
ALTER TABLE public.voices ADD COLUMN consent_path text;
ALTER TABLE public.voices ADD COLUMN consented_at timestamptz;
COMMENT ON COLUMN public.voices.consent_path IS 'Storage path (clips bucket) of the spoken consent recording. NULL for voices copied before spoken consent existed.';
