-- =============================================================================
-- MIGRATION: 003_gdrive_pool_per_user.sql
-- Fixes the shared-pool bug: each user's uploads now only go to
-- Drive accounts that THEY own. Multiple Drive accounts per user supported.
--
-- BREAKING CHANGES:
--   • Drops UNIQUE (user_id) on storage_pool — multiple accounts per user now allowed
--   • Replaces pick_upload_target(p_file_size_bytes) with
--     pick_upload_target(p_username, p_file_size_bytes) — scoped to owner
--   • Adds `label` column to storage_pool for distinguishing multiple accounts
--   • Updates pool_usage_summary materialized view
--
-- Run AFTER 001 and 002.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop the one-account-per-user constraint
-- -----------------------------------------------------------------------------

ALTER TABLE public.storage_pool
  DROP CONSTRAINT IF EXISTS uq_storage_pool_user;

-- Keep the email uniqueness — one Gmail address can only appear once globally
-- (already exists as uq_storage_pool_email — no change needed)

-- -----------------------------------------------------------------------------
-- 2. Add a label column so the admin UI can show "Drive 1", "Drive 2", etc.
--    Also add owner_username denorm column to avoid joins in hot paths.
-- -----------------------------------------------------------------------------

ALTER TABLE public.storage_pool
  ADD COLUMN IF NOT EXISTS label          TEXT NOT NULL DEFAULT 'Primary Drive',
  ADD COLUMN IF NOT EXISTS owner_username TEXT;          -- denorm of users.username

-- Backfill owner_username from the users join
UPDATE public.storage_pool sp
SET owner_username = u.username
FROM public.users u
WHERE u.id = sp.user_id;

-- Make it NOT NULL after backfill
ALTER TABLE public.storage_pool
  ALTER COLUMN owner_username SET NOT NULL;

-- Index for the hot lookup path: all accounts for a given username
CREATE INDEX IF NOT EXISTS idx_storage_pool_owner_username
  ON public.storage_pool(owner_username);

-- Composite: active accounts for a username ordered by usage (used by pick RPC)
CREATE INDEX IF NOT EXISTS idx_storage_pool_owner_active
  ON public.storage_pool(owner_username, status, current_usage_bytes)
  WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 3. Replace pick_upload_target with a username-scoped version
--    Old signature: pick_upload_target(p_file_size_bytes BIGINT)
--    New signature: pick_upload_target(p_username TEXT, p_file_size_bytes BIGINT)
-- -----------------------------------------------------------------------------

-- Drop old version first (signature must match exactly to drop)
DROP FUNCTION IF EXISTS public.pick_upload_target(BIGINT);

CREATE OR REPLACE FUNCTION public.pick_upload_target(
  p_username        TEXT,
  p_file_size_bytes BIGINT DEFAULT 0
)
RETURNS TABLE (
  pool_account_id UUID,
  account_email   TEXT,
  available_bytes BIGINT,
  usage_pct       NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id                                                                        AS pool_account_id,
    account_email,
    (quota_bytes - current_usage_bytes)                                       AS available_bytes,
    ROUND(current_usage_bytes::NUMERIC / NULLIF(quota_bytes, 0) * 100, 2)    AS usage_pct
  FROM public.storage_pool
  WHERE
    owner_username = p_username
    AND status     = 'ACTIVE'
    AND is_active  = TRUE
    AND (quota_bytes - current_usage_bytes) >= p_file_size_bytes
  ORDER BY current_usage_bytes ASC   -- least-used of THIS user's accounts
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_upload_target(TEXT, BIGINT) TO service_role;
-- Do NOT grant to anon/authenticated — pool selection is server-side only

-- -----------------------------------------------------------------------------
-- 4. Also scope pick_upload_targets_ranked (from migration 002) by username
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.pick_upload_targets_ranked(BIGINT, INT);

CREATE OR REPLACE FUNCTION public.pick_upload_targets_ranked(
  p_username        TEXT,
  p_file_size_bytes BIGINT DEFAULT 0,
  p_max_results     INT    DEFAULT 3
)
RETURNS TABLE (
  pool_account_id UUID,
  account_email   TEXT,
  available_bytes BIGINT,
  usage_pct       NUMERIC,
  rank            INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id                                                                        AS pool_account_id,
    account_email,
    (quota_bytes - current_usage_bytes)                                       AS available_bytes,
    ROUND(current_usage_bytes::NUMERIC / NULLIF(quota_bytes, 0) * 100, 2)    AS usage_pct,
    ROW_NUMBER() OVER (ORDER BY current_usage_bytes ASC)::INT                AS rank
  FROM public.storage_pool
  WHERE
    owner_username = p_username
    AND status     = 'ACTIVE'
    AND is_active  = TRUE
    AND (quota_bytes - current_usage_bytes) >= p_file_size_bytes
  ORDER BY current_usage_bytes ASC
  LIMIT p_max_results;
$$;

GRANT EXECUTE ON FUNCTION public.pick_upload_targets_ranked(TEXT, BIGINT, INT) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Add get_pool_summary_for_user — per-user summary for the admin UI
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pool_summary_for_user(p_username TEXT)
RETURNS TABLE (
  total_accounts    BIGINT,
  active_accounts   BIGINT,
  error_accounts    BIGINT,
  total_quota_gb    NUMERIC,
  total_used_gb     NUMERIC,
  total_files       BIGINT,
  overall_usage_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                          AS total_accounts,
    COUNT(*) FILTER (WHERE status = 'ACTIVE' AND is_active = TRUE)   AS active_accounts,
    COUNT(*) FILTER (WHERE status = 'ERROR')                          AS error_accounts,
    ROUND(SUM(quota_bytes)         / 1073741824.0, 2)                 AS total_quota_gb,
    ROUND(SUM(current_usage_bytes) / 1073741824.0, 2)                 AS total_used_gb,
    SUM(file_count)                                                   AS total_files,
    CASE
      WHEN SUM(quota_bytes) = 0 THEN 0
      ELSE ROUND(SUM(current_usage_bytes)::NUMERIC / SUM(quota_bytes) * 100, 2)
    END                                                               AS overall_usage_pct
  FROM public.storage_pool
  WHERE owner_username = p_username;
$$;

GRANT EXECUTE ON FUNCTION public.get_pool_summary_for_user(TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Update get_pool_summary (global) to still work for the admin overview
--    No change needed — it already aggregates all rows.
--    Re-grant to be safe after migration 001 drops/recreates it.
-- -----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_pool_summary() TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Rebuild pool_usage_summary materialized view to include owner_username
--    and support per-user grouping in the admin dashboard.
-- -----------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.pool_usage_summary;

CREATE MATERIALIZED VIEW public.pool_usage_summary AS
SELECT
  sp.id                                                                      AS pool_account_id,
  sp.account_email,
  sp.label,
  sp.owner_username,
  sp.status,
  sp.is_active,
  sp.quota_bytes,
  sp.current_usage_bytes,
  sp.file_count,
  sp.last_health_check,
  sp.error_message,
  u.username,
  ROUND(sp.current_usage_bytes::NUMERIC / NULLIF(sp.quota_bytes, 0) * 100, 2) AS usage_pct,
  (sp.quota_bytes - sp.current_usage_bytes)                                  AS available_bytes,
  ROUND((sp.quota_bytes - sp.current_usage_bytes) / 1073741824.0, 2)        AS available_gb
FROM public.storage_pool sp
JOIN public.users u ON u.id = sp.user_id
WITH DATA;

CREATE UNIQUE INDEX idx_pool_usage_summary_pk
  ON public.pool_usage_summary(pool_account_id);

CREATE INDEX idx_pool_usage_summary_owner
  ON public.pool_usage_summary(owner_username);

-- -----------------------------------------------------------------------------
-- 8. get_all_pool_accounts_grouped — returns all accounts grouped by owner
--    Used by the admin /admin/gdrive page to build the per-user card grid.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_all_pool_accounts_grouped()
RETURNS TABLE (
  pool_account_id     UUID,
  owner_username      TEXT,
  account_email       TEXT,
  label               TEXT,
  status              pool_status_enum,
  is_active           BOOLEAN,
  quota_bytes         BIGINT,
  current_usage_bytes BIGINT,
  file_count          INT,
  error_message       TEXT,
  last_health_check   TIMESTAMPTZ,
  connected_at        TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sp.id,
    sp.owner_username,
    sp.account_email,
    sp.label,
    sp.status,
    sp.is_active,
    sp.quota_bytes,
    sp.current_usage_bytes,
    sp.file_count,
    sp.error_message,
    sp.last_health_check,
    sp.connected_at
  FROM public.storage_pool sp
  ORDER BY
    sp.owner_username ASC,
    sp.current_usage_bytes ASC;   -- least-used first within each user
$$;

GRANT EXECUTE ON FUNCTION public.get_all_pool_accounts_grouped() TO service_role;

-- -----------------------------------------------------------------------------
-- 9. Update upsert trigger: owner_username must be kept in sync if user
--    row is renamed (edge case, but safe to have).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_sync_pool_owner_username()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When a users.username changes, update the denorm column
  UPDATE public.storage_pool
  SET owner_username = NEW.username
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_username_sync ON public.users;

CREATE TRIGGER trg_users_username_sync
  AFTER UPDATE OF username ON public.users
  FOR EACH ROW
  WHEN (OLD.username IS DISTINCT FROM NEW.username)
  EXECUTE FUNCTION public.trg_sync_pool_owner_username();

-- -----------------------------------------------------------------------------
-- 10. Fix the records MIME check constraint to allow DOCX/XLSX too
--     (the original constraint was too restrictive — gateway already allows them)
-- -----------------------------------------------------------------------------

ALTER TABLE public.records
  DROP CONSTRAINT IF EXISTS chk_records_mime;

ALTER TABLE public.records
  ADD CONSTRAINT chk_records_mime CHECK (
    mime_type LIKE 'image/%'
    OR mime_type = 'application/pdf'
    OR mime_type = 'application/msword'
    OR mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    OR mime_type = 'application/vnd.ms-excel'
    OR mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

-- =============================================================================
-- DONE. Summary of what changed:
--   • storage_pool now allows multiple rows per user_id
--   • owner_username denorm column added + indexed
--   • label column added for "Drive 1 / Drive 2" display
--   • pick_upload_target now requires p_username — never crosses user boundaries
--   • pick_upload_targets_ranked same
--   • get_pool_summary_for_user added
--   • get_all_pool_accounts_grouped added for admin UI
--   • pool_usage_summary rebuilt with owner_username
--   • records MIME constraint widened to match gateway allowlist
-- =============================================================================