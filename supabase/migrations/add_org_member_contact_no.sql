-- Add contact number support to org_members

ALTER TABLE IF EXISTS public.org_members
  ADD COLUMN IF NOT EXISTS contact_no TEXT;