ALTER TABLE IF EXISTS public.lyric_performances
  ADD COLUMN IF NOT EXISTS audio_provenance text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS audio_manifest jsonb;