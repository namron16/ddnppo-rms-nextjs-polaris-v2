-- Add file_url to existing daily_journals tables created before attachment support

ALTER TABLE IF EXISTS public.daily_journals
  ADD COLUMN IF NOT EXISTS file_url TEXT;
