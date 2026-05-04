-- =============================================================================
-- MIGRATION: 001_gdrive_pool_schema.sql
-- Multi-Account Google Drive Pooling System — Core Schema
-- Run in Supabase SQL Editor with service_role privileges
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- AES-256-GCM encryption helpers

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'OFFICER', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pool_status_enum AS ENUM ('ACTIVE', 'ERROR', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- TABLE: users
-- Mirrors the hardcoded ADMIN_ACCOUNTS (P1–P10) with a proper relational record.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username         TEXT UNIQUE NOT NULL,       -- 'P1', 'P2', … 'P10', 'admin'
  email            TEXT,
  role             user_role_enum NOT NULL DEFAULT 'USER',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the hardcoded accounts so FK constraints can resolve immediately.
INSERT INTO public.users (username, role) VALUES
  ('admin', 'ADMIN'),
  ('DPDA',  'OFFICER'),
  ('DPDO',  'OFFICER'),
  ('P1',    'USER'),
  ('P2',    'USER'),
  ('P3',    'USER'),
  ('P4',    'USER'),
  ('P5',    'USER'),
  ('P6',    'USER'),
  ('P7',    'USER'),
  ('P8',    'USER'),
  ('P9',    'USER'),
  ('P10',   'USER')
ON CONFLICT (username) DO NOTHING;

-- =============================================================================
-- TABLE: storage_pool
-- One row per connected Google Drive account (one per user P1–P10).
-- Token columns are encrypted; NEVER exposed to the anon/authenticated role.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.storage_pool (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_email           TEXT NOT NULL,                -- real Gmail address

  -- OAuth2 Tokens (server-side only — see RLS below)
  encrypted_refresh_token TEXT,                         -- AES-256 encrypted
  access_token            TEXT,                         -- short-lived, encrypted
  token_expiry            TIMESTAMPTZ,

  -- Drive metadata
  root_folder_id          TEXT,                         -- root "DDNPPO RMS" folder ID

  -- Storage accounting
  quota_bytes             BIGINT NOT NULL DEFAULT 15728640000, -- 15 GB default
  current_usage_bytes     BIGINT NOT NULL DEFAULT 0,
  file_count              INT    NOT NULL DEFAULT 0,

  -- Health
  status                  pool_status_enum NOT NULL DEFAULT 'ACTIVE',
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,  -- legacy compat
  error_message           TEXT,
  last_health_check       TIMESTAMPTZ,
  last_refreshed          TIMESTAMPTZ,

  -- Audit
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_storage_pool_user UNIQUE (user_id),
  CONSTRAINT uq_storage_pool_email UNIQUE (account_email),
  CONSTRAINT chk_usage_non_negative CHECK (current_usage_bytes >= 0),
  CONSTRAINT chk_quota_positive     CHECK (quota_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_storage_pool_status    ON public.storage_pool(status);
CREATE INDEX IF NOT EXISTS idx_storage_pool_user_id   ON public.storage_pool(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_pool_is_active ON public.storage_pool(is_active);

-- =============================================================================
-- TABLE: category_folders
-- Cache of Drive folder IDs per category per pool account.
-- Prevents redundant Drive API "find-or-create folder" calls.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_folders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_account_id  UUID NOT NULL REFERENCES public.storage_pool(id) ON DELETE CASCADE,
  folder_name      TEXT NOT NULL,        -- e.g. "Master Documents", "Daily Journals"
  drive_folder_id  TEXT NOT NULL,        -- Google Drive folder ID
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_category_folder UNIQUE (pool_account_id, folder_name)
);

CREATE INDEX IF NOT EXISTS idx_cat_folders_pool  ON public.category_folders(pool_account_id);
CREATE INDEX IF NOT EXISTS idx_cat_folders_name  ON public.category_folders(folder_name);

-- =============================================================================
-- TABLE: records
-- Metadata cache for every file uploaded through the pooling gateway.
-- The actual bytes live in Google Drive; this table enables fast search/list.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.records (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- File identity
  file_name         TEXT NOT NULL,
  original_name     TEXT NOT NULL,          -- preserves the user-provided name
  gdrive_file_id    TEXT NOT NULL UNIQUE,   -- Drive file ID for direct API calls
  mime_type         TEXT NOT NULL,          -- 'application/pdf' | 'image/*'

  -- Location
  pool_account_id   UUID NOT NULL REFERENCES public.storage_pool(id) ON DELETE RESTRICT,
  category_folder_id TEXT,                  -- Drive folder ID (denorm for perf)
  category          TEXT NOT NULL,          -- 'master_documents' | 'special_orders' …

  -- Sizes
  size_bytes        BIGINT NOT NULL DEFAULT 0,

  -- Public URLs (Drive webViewLink / thumbnailLink)
  drive_url         TEXT,
  thumbnail_url     TEXT,
  download_url      TEXT,                   -- webContentLink

  -- Application linkage
  entity_type       TEXT,                   -- 'master_document' | 'special_order' …
  entity_id         TEXT,                   -- FK reference into app tables (e.g. master_documents.id)
  uploaded_by       TEXT,                   -- username / role (P1, P2 …)

  -- Health
  is_accessible     BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_records_mime CHECK (
    mime_type LIKE 'image/%' OR mime_type = 'application/pdf'
  ),
  CONSTRAINT chk_records_size_non_neg CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_records_pool         ON public.records(pool_account_id);
CREATE INDEX IF NOT EXISTS idx_records_category     ON public.records(category);
CREATE INDEX IF NOT EXISTS idx_records_entity       ON public.records(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_records_uploaded_by  ON public.records(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_records_accessible   ON public.records(is_accessible);
CREATE INDEX IF NOT EXISTS idx_records_created_at   ON public.records(created_at DESC);

-- =============================================================================
-- TABLE: health_events
-- Immutable audit log of every health check result and token refresh.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.health_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_account_id  UUID NOT NULL REFERENCES public.storage_pool(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,   -- 'health_check' | 'token_refresh' | 'repair'
  status           TEXT NOT NULL,   -- 'ok' | 'error' | 'warning'
  message          TEXT,
  latency_ms       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_events_pool ON public.health_events(pool_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_events_type ON public.health_events(event_type);

-- =============================================================================
-- PART 1C: RPC — increment_storage_usage
-- Atomically increments current_usage_bytes and file_count.
-- Called after every successful upload; avoids client-side race conditions.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.increment_storage_usage(
  p_pool_account_id UUID,
  p_bytes_added     BIGINT
)
RETURNS TABLE (
  new_usage_bytes BIGINT,
  new_file_count  INT,
  quota_bytes     BIGINT,
  usage_pct       NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the table owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  v_row public.storage_pool%ROWTYPE;
BEGIN
  -- Validate inputs
  IF p_bytes_added < 0 THEN
    RAISE EXCEPTION 'bytes_added must be non-negative, got %', p_bytes_added;
  END IF;

  -- Atomic update with row-level lock
  UPDATE public.storage_pool
  SET
    current_usage_bytes = current_usage_bytes + p_bytes_added,
    file_count          = file_count + 1,
    updated_at          = NOW()
  WHERE id = p_pool_account_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_pool row not found: %', p_pool_account_id;
  END IF;

  RETURN QUERY SELECT
    v_row.current_usage_bytes,
    v_row.file_count,
    v_row.quota_bytes,
    ROUND((v_row.current_usage_bytes::NUMERIC / v_row.quota_bytes) * 100, 2);
END;
$$;

-- Mirror RPC for decrements (deletions)
CREATE OR REPLACE FUNCTION public.decrement_storage_usage(
  p_pool_account_id UUID,
  p_bytes_removed   BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.storage_pool
  SET
    current_usage_bytes = GREATEST(0, current_usage_bytes - p_bytes_removed),
    file_count          = GREATEST(0, file_count - 1),
    updated_at          = NOW()
  WHERE id = p_pool_account_id;
END;
$$;

-- RPC: get pool summary (safe to call from client)
CREATE OR REPLACE FUNCTION public.get_pool_summary()
RETURNS TABLE (
  total_accounts   BIGINT,
  active_accounts  BIGINT,
  error_accounts   BIGINT,
  total_quota_gb   NUMERIC,
  total_used_gb    NUMERIC,
  total_files      BIGINT,
  overall_usage_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)                                                         AS total_accounts,
    COUNT(*) FILTER (WHERE status = 'ACTIVE')                       AS active_accounts,
    COUNT(*) FILTER (WHERE status = 'ERROR')                        AS error_accounts,
    ROUND(SUM(quota_bytes)           / 1073741824.0, 2)             AS total_quota_gb,
    ROUND(SUM(current_usage_bytes)   / 1073741824.0, 2)             AS total_used_gb,
    SUM(file_count)                                                  AS total_files,
    CASE
      WHEN SUM(quota_bytes) = 0 THEN 0
      ELSE ROUND(SUM(current_usage_bytes)::NUMERIC / SUM(quota_bytes) * 100, 2)
    END                                                              AS overall_usage_pct
  FROM public.storage_pool;
$$;

-- RPC: pick best account for next upload (least-used active account)
CREATE OR REPLACE FUNCTION public.pick_upload_target(
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
    id                                                                   AS pool_account_id,
    account_email,
    (quota_bytes - current_usage_bytes)                                  AS available_bytes,
    ROUND(current_usage_bytes::NUMERIC / quota_bytes * 100, 2)           AS usage_pct
  FROM public.storage_pool
  WHERE
    status     = 'ACTIVE'
    AND is_active = TRUE
    AND (quota_bytes - current_usage_bytes) >= p_file_size_bytes
  ORDER BY current_usage_bytes ASC   -- least used first
  LIMIT 1;
$$;

-- =============================================================================
-- PART 1B: ROW-LEVEL SECURITY
-- =============================================================================

-- storage_pool — only service_role may access token columns
ALTER TABLE public.storage_pool ENABLE ROW LEVEL SECURITY;

-- Block ALL client access to storage_pool by default
CREATE POLICY storage_pool_deny_all
  ON public.storage_pool
  FOR ALL
  TO anon, authenticated
  USING (FALSE);

-- category_folders — server-side only
ALTER TABLE public.category_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY cat_folders_deny_all
  ON public.category_folders
  FOR ALL
  TO anon, authenticated
  USING (FALSE);

-- records — users can only read their own uploads
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE POLICY records_select_own
  ON public.records
  FOR SELECT
  TO authenticated
  USING (uploaded_by = current_setting('request.jwt.claims', TRUE)::json->>'role');

-- Admins can read all records
CREATE POLICY records_select_admin
  ON public.records
  FOR SELECT
  TO authenticated
  USING (
    (current_setting('request.jwt.claims', TRUE)::json->>'role') IN ('admin', 'DPDA', 'DPDO')
  );

-- health_events — server-side only
ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_events_deny_all
  ON public.health_events
  FOR ALL
  TO anon, authenticated
  USING (FALSE);

-- users — readable by service_role, not by anon
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_deny_anon
  ON public.users
  FOR ALL
  TO anon
  USING (FALSE);

CREATE POLICY users_select_authenticated
  ON public.users
  FOR SELECT
  TO authenticated
  USING (username = current_setting('request.jwt.claims', TRUE)::json->>'role');

-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_storage_pool_updated_at
  BEFORE UPDATE ON public.storage_pool
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =============================================================================
-- GRANTS for service_role (Next.js API routes use this key)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_storage_usage(UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_storage_usage(UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pool_summary()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_upload_target(BIGINT)             TO service_role;

-- Safe RPCs accessible from client (anon + authenticated)
GRANT EXECUTE ON FUNCTION public.get_pool_summary()           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_upload_target(BIGINT)   TO anon, authenticated;

COMMENT ON TABLE public.storage_pool     IS 'One row per connected Google Drive account. Token columns are service_role-only.';
COMMENT ON TABLE public.records          IS 'File metadata cache — actual bytes stored in Google Drive.';
COMMENT ON TABLE public.category_folders IS 'Drive folder ID cache to minimise API round-trips.';
COMMENT ON TABLE public.health_events    IS 'Immutable audit log of health checks and token refreshes.';
