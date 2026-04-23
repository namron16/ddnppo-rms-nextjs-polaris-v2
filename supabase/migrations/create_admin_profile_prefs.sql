-- Shared profile preferences per role so avatar and display name sync across devices.

CREATE TABLE IF NOT EXISTS public.admin_profile_prefs (
  role TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_profile_prefs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_profile_prefs TO authenticated;