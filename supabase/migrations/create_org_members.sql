-- Create org_members table for Organization module persistence

CREATE TABLE IF NOT EXISTS public.org_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rank TEXT,
  position TEXT NOT NULL,
  unit TEXT,
  contact_no TEXT,
  photo_url TEXT,
  initials TEXT NOT NULL,
  color TEXT NOT NULL,
  parent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_org_members_parent
    FOREIGN KEY (parent_id)
    REFERENCES public.org_members(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_org_members_parent_id
  ON public.org_members(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
