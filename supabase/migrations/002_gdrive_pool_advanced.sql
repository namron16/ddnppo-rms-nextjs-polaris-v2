-- =============================================================================
-- MIGRATION: 002_gdrive_pool_advanced.sql
-- Advanced RLS, indexes, and maintenance helpers
-- Run AFTER 001_gdrive_pool_schema.sql
-- =============================================================================

-- =============================================================================
-- MATERIALIZED VIEW: pool_usage_summary
-- Pre-aggregated pool stats for the dashboard status endpoint.
-- Refresh on a schedule or after each upload via trigger.
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.pool_usage_summary AS
SELECT
  sp.id                                                              AS pool_account_id,
  sp.account_email,
  sp.status,
  sp.is_active,
  sp.quota_bytes,
  sp.current_usage_bytes,
  sp.file_count,
  sp.last_health_check,
  sp.error_message,
  u.username,
  ROUND(sp.current_usage_bytes::NUMERIC / NULLIF(sp.quota_bytes, 0) * 100, 2) AS usage_pct,
  (sp.quota_bytes - sp.current_usage_bytes)                         AS available_bytes,
  ROUND((sp.quota_bytes - sp.current_usage_bytes) / 1073741824.0, 2) AS available_gb
FROM public.storage_pool sp
JOIN public.users u ON u.id = sp.user_id
WITH DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_usage_summary_pk
  ON public.pool_usage_summary(pool_account_id);

-- Refresh function — call after uploads/deletes
CREATE OR REPLACE FUNCTION public.refresh_pool_usage_summary()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.pool_usage_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_pool_usage_summary() TO service_role;

-- =============================================================================
-- FUNCTION: auto-pick upload target with fallback
-- Enhanced version of pick_upload_target that returns a ranked list
-- so the gateway can try alternatives if the first fails.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pick_upload_targets_ranked(
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
    id                                                                   AS pool_account_id,
    account_email,
    (quota_bytes - current_usage_bytes)                                  AS available_bytes,
    ROUND(current_usage_bytes::NUMERIC / NULLIF(quota_bytes, 0) * 100, 2) AS usage_pct,
    ROW_NUMBER() OVER (ORDER BY current_usage_bytes ASC)::INT            AS rank
  FROM public.storage_pool
  WHERE
    status     = 'ACTIVE'
    AND is_active = TRUE
    AND (quota_bytes - current_usage_bytes) >= p_file_size_bytes
  ORDER BY current_usage_bytes ASC
  LIMIT p_max_results;
$$;

GRANT EXECUTE ON FUNCTION public.pick_upload_targets_ranked(BIGINT, INT) TO service_role;

-- =============================================================================
-- FUNCTION: get_account_file_stats
-- Per-account file breakdown by category (for the admin dashboard).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_account_file_stats(p_pool_account_id UUID)
RETURNS TABLE (
  category       TEXT,
  file_count     BIGINT,
  total_bytes    BIGINT,
  avg_bytes      NUMERIC,
  newest_file_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    category,
    COUNT(*)                                AS file_count,
    COALESCE(SUM(size_bytes), 0)            AS total_bytes,
    ROUND(AVG(size_bytes), 0)               AS avg_bytes,
    MAX(created_at)                         AS newest_file_at
  FROM public.records
  WHERE pool_account_id = p_pool_account_id
    AND is_accessible   = TRUE
  GROUP BY category
  ORDER BY total_bytes DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_file_stats(UUID) TO service_role;

-- =============================================================================
-- FUNCTION: get_recent_uploads
-- Returns the N most recent uploads across all pool accounts.
-- Used in the admin activity feed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_recent_uploads(p_limit INT DEFAULT 20)
RETURNS TABLE (
  record_id       UUID,
  file_name       TEXT,
  category        TEXT,
  size_bytes      BIGINT,
  uploaded_by     TEXT,
  account_email   TEXT,
  drive_url       TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id              AS record_id,
    r.file_name,
    r.category,
    r.size_bytes,
    r.uploaded_by,
    sp.account_email,
    r.drive_url,
    r.created_at
  FROM public.records r
  JOIN public.storage_pool sp ON sp.id = r.pool_account_id
  WHERE r.is_accessible = TRUE
  ORDER BY r.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recent_uploads(INT) TO service_role;

-- =============================================================================
-- TRIGGER: sync storage_pool.file_count when records are deleted
-- Ensures file_count stays accurate when records are hard-deleted.
-- (soft deletes via is_accessible=false are handled by the RPC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_sync_pool_on_record_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.storage_pool
  SET
    file_count          = GREATEST(0, file_count - 1),
    current_usage_bytes = GREATEST(0, current_usage_bytes - OLD.size_bytes),
    updated_at          = NOW()
  WHERE id = OLD.pool_account_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_records_after_delete
  AFTER DELETE ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_pool_on_record_delete();

-- =============================================================================
-- TRIGGER: update storage_pool when records.is_accessible flips
-- Keeps file_count in sync with accessibility changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_sync_pool_on_accessibility_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- File became inaccessible
  IF OLD.is_accessible = TRUE AND NEW.is_accessible = FALSE THEN
    UPDATE public.storage_pool
    SET file_count = GREATEST(0, file_count - 1), updated_at = NOW()
    WHERE id = NEW.pool_account_id;
  END IF;

  -- File became accessible again (manual repair)
  IF OLD.is_accessible = FALSE AND NEW.is_accessible = TRUE THEN
    UPDATE public.storage_pool
    SET file_count = file_count + 1, updated_at = NOW()
    WHERE id = NEW.pool_account_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_records_after_accessibility_change
  AFTER UPDATE OF is_accessible ON public.records
  FOR EACH ROW
  WHEN (OLD.is_accessible IS DISTINCT FROM NEW.is_accessible)
  EXECUTE FUNCTION public.trg_sync_pool_on_accessibility_change();

-- =============================================================================
-- FUNCTION: purge_old_health_events
-- Keeps health_events table lean — deletes events older than N days.
-- Designed to run as a scheduled job (pg_cron or Supabase Edge Function cron).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_old_health_events(p_keep_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.health_events
  WHERE created_at < NOW() - (p_keep_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_old_health_events(INT) TO service_role;

-- =============================================================================
-- INDEX: Full-text search on records.file_name + original_name
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_records_file_name_fts
  ON public.records
  USING GIN (to_tsvector('english', file_name || ' ' || original_name));

-- =============================================================================
-- HELPER VIEW: inaccessible_files_summary (safe — no tokens)
-- Used by the admin Health Dashboard to show broken files at a glance.
-- =============================================================================

CREATE OR REPLACE VIEW public.inaccessible_files_summary AS
SELECT
  r.id                AS record_id,
  r.gdrive_file_id,
  r.file_name,
  r.category,
  r.entity_type,
  r.entity_id,
  r.uploaded_by,
  r.size_bytes,
  r.last_synced,
  sp.account_email,
  sp.status           AS pool_status
FROM public.records r
JOIN public.storage_pool sp ON sp.id = r.pool_account_id
WHERE r.is_accessible = FALSE
ORDER BY r.last_synced DESC;

-- Grant read access to service_role only
GRANT SELECT ON public.inaccessible_files_summary TO service_role;

-- =============================================================================
-- SCHEDULED JOB HINTS (pg_cron — enable in Supabase dashboard)
-- =============================================================================

-- Run a health check and refresh usage summary every hour:
-- SELECT cron.schedule('pool-health-hourly', '0 * * * *', $$
--   SELECT public.refresh_pool_usage_summary();
-- $$);

-- Purge old health events weekly:
-- SELECT cron.schedule('purge-health-events', '0 3 * * 0', $$
--   SELECT public.purge_old_health_events(30);
-- $$);
