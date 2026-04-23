-- Add tagged_admin_access column to master_documents table
-- Stores baseline (permanent) viewer roles as a Postgres text array.
-- Example value: ARRAY['P2','P3','P5']

ALTER TABLE master_documents
ADD COLUMN IF NOT EXISTS tagged_admin_access TEXT[] DEFAULT NULL;

-- If this column was previously created as TEXT (CSV), convert it to TEXT[] safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'master_documents'
      AND column_name = 'tagged_admin_access'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE master_documents
      ALTER COLUMN tagged_admin_access TYPE TEXT[]
      USING CASE
        WHEN tagged_admin_access IS NULL OR btrim(tagged_admin_access) = '' THEN NULL
        ELSE string_to_array(replace(tagged_admin_access, ' ', ''), ',')
      END;
  END IF;
END $$;

-- Array index for role membership checks.
CREATE INDEX IF NOT EXISTS idx_master_documents_tagged_admin_access 
  ON master_documents USING GIN (tagged_admin_access);

-- Normalize empty arrays to NULL.
UPDATE master_documents
SET tagged_admin_access = NULL
WHERE tagged_admin_access = ARRAY[]::TEXT[];
