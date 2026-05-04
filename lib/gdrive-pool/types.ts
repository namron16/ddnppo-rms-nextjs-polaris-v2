// lib/gdrive-pool/types.ts
// Complete TypeScript interfaces for the Multi-Account Google Drive Pooling System

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

export type UserRole = 'ADMIN' | 'OFFICER' | 'USER'
export type PoolStatus = 'ACTIVE' | 'ERROR' | 'MAINTENANCE'

/** Mirrors public.users */
export interface DbUser {
  id: string
  username: string        // 'P1' | 'P2' | … | 'admin'
  email: string | null
  role: UserRole
  created_at: string
}

/** Mirrors public.storage_pool (safe projection — no token fields) */
export interface DbStoragePool {
  id: string
  user_id: string
  account_email: string
  root_folder_id: string | null
  quota_bytes: number
  current_usage_bytes: number
  file_count: number
  status: PoolStatus
  is_active: boolean
  error_message: string | null
  last_health_check: string | null
  last_refreshed: string | null
  connected_at: string
  updated_at: string
}

/** Full row including encrypted tokens — only used server-side */
export interface DbStoragePoolFull extends DbStoragePool {
  encrypted_refresh_token: string | null
  access_token: string | null
  token_expiry: string | null
}

/** Mirrors public.category_folders */
export interface DbCategoryFolder {
  id: string
  pool_account_id: string
  folder_name: string
  drive_folder_id: string
  created_at: string
}

/** Mirrors public.records */
export interface DbRecord {
  id: string
  file_name: string
  original_name: string
  gdrive_file_id: string
  mime_type: string
  pool_account_id: string
  category_folder_id: string | null
  category: string
  size_bytes: number
  drive_url: string | null
  thumbnail_url: string | null
  download_url: string | null
  entity_type: string | null
  entity_id: string | null
  uploaded_by: string | null
  is_accessible: boolean
  last_synced: string
  created_at: string
  updated_at: string
}

/** Mirrors public.health_events */
export interface DbHealthEvent {
  id: string
  pool_account_id: string
  event_type: 'health_check' | 'token_refresh' | 'repair' | 'connect' | 'disconnect'
  status: 'ok' | 'error' | 'warning'
  message: string | null
  latency_ms: number | null
  created_at: string
}

// =============================================================================
// RPC RETURN TYPES
// =============================================================================

export interface PoolSummary {
  total_accounts: number
  active_accounts: number
  error_accounts: number
  total_quota_gb: number
  total_used_gb: number
  total_files: number
  overall_usage_pct: number
}

export interface UploadTarget {
  pool_account_id: string
  account_email: string
  available_bytes: number
  usage_pct: number
}

export interface IncrementResult {
  new_usage_bytes: number
  new_file_count: number
  quota_bytes: number
  usage_pct: number
}

// =============================================================================
// OAUTH2 / GOOGLE API TYPES
// =============================================================================

export interface GoogleOAuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number     // seconds
  scope: string
  token_type: 'Bearer'
}

export interface GoogleUserInfo {
  id: string
  email: string
  name: string
  picture: string
}

export interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  size: string           // Drive returns size as string
  webViewLink: string
  webContentLink: string
  thumbnailLink: string | null
  parents: string[]
  createdTime: string
  modifiedTime: string
}

export interface DriveFolderResult {
  folderId: string
  folderName: string
  isNew: boolean
}

// =============================================================================
// SERVICE LAYER TYPES
// =============================================================================

export type DocumentCategory =
  | 'master_documents'
  | 'special_orders'
  | 'daily_journals'
  | 'classified_documents'
  | 'library_items'
  | 'personnel_201'
  | 'organization'

export const CATEGORY_DISPLAY_NAMES: Record<DocumentCategory, string> = {
  master_documents:      'Master Documents',
  special_orders:        'Admin Orders',
  daily_journals:        'Daily Journal',
  classified_documents:  'Classified Documents',
  library_items:         'e-Library',
  personnel_201:         '201 Files',
  organization:          'Organization',
}

export interface UploadRequest {
  file: Buffer | Uint8Array
  fileName: string
  mimeType: string
  category: DocumentCategory
  entityType?: string
  entityId?: string
  uploadedBy: string        // username / role
  preferredPoolId?: string  // pin to specific account (optional)
  fileSizeBytes: number
}

export interface UploadResult {
  success: boolean
  record?: DbRecord
  poolAccountId?: string
  accountEmail?: string
  gdriveFileId?: string
  driveUrl?: string
  downloadUrl?: string
  error?: string
}

export interface DeleteRequest {
  gdriveFileId: string
  poolAccountId: string
  recordId: string
}

export interface DeleteResult {
  success: boolean
  error?: string
}

// =============================================================================
// HEALTH CHECK TYPES
// =============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'auth_error' | 'quota_exceeded'

export interface AccountHealthResult {
  poolAccountId: string
  accountEmail: string
  status: HealthStatus
  poolDbStatus: PoolStatus
  latencyMs: number
  quotaBytes: number
  usedBytes: number
  usagePct: number
  fileCount: number
  tokenValid: boolean
  tokenExpiresAt: string | null
  errorMessage: string | null
  lastChecked: string
  recommendations: string[]
}

export interface SystemHealthReport {
  checkedAt: string
  overallStatus: 'healthy' | 'degraded' | 'critical'
  accounts: AccountHealthResult[]
  summary: {
    total: number
    healthy: number
    degraded: number
    unreachable: number
    authErrors: number
    quotaExceeded: number
    totalUsedGb: number
    totalQuotaGb: number
    usagePct: number
  }
  recommendations: string[]
}

// =============================================================================
// CONNECT / DISCONNECT TYPES
// =============================================================================

export interface ConnectAccountRequest {
  username: string          // 'P1' | 'P2' | …
  authorizationCode: string // from Google OAuth2 redirect
  redirectUri: string
}

export interface ConnectAccountResult {
  success: boolean
  poolAccountId?: string
  accountEmail?: string
  rootFolderId?: string
  error?: string
}

export interface DisconnectAccountResult {
  success: boolean
  filesOrphaned: number    // files that were in this drive — now inaccessible
  error?: string
}

// =============================================================================
// POOL SELECTION STRATEGY
// =============================================================================

export type PoolSelectionStrategy = 'least_used' | 'round_robin' | 'pinned'

export interface PoolSelectionOptions {
  strategy: PoolSelectionStrategy
  fileSizeBytes: number
  pinnedPoolId?: string     // used when strategy = 'pinned'
  excludePoolIds?: string[] // skip specific accounts
}