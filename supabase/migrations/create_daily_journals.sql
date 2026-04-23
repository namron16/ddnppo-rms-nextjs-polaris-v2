-- Create daily_journals table for Daily Journals module persistence

CREATE TABLE IF NOT EXISTS public.daily_journals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  author TEXT NOT NULL,
  date DATE NOT NULL,
  content TEXT,
  summary TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  attachments INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT chk_daily_journals_type
    CHECK (type IN ('MEMO', 'REPORT', 'LOG')),
  CONSTRAINT chk_daily_journals_status
    CHECK (status IN ('Draft', 'Filed', 'Reviewed')),
  CONSTRAINT chk_daily_journals_attachments_non_negative
    CHECK (attachments >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_journals_type
  ON public.daily_journals(type);

CREATE INDEX IF NOT EXISTS idx_daily_journals_status
  ON public.daily_journals(status);

CREATE INDEX IF NOT EXISTS idx_daily_journals_date_desc
  ON public.daily_journals(date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_journals_archived
  ON public.daily_journals(archived);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_journals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_journals TO authenticated;
