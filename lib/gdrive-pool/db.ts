// lib/gdrive-pool/db.ts
// Supabase service-role client + all database helpers for the pooling gateway.
// This module MUST only be imported in server-side code (API routes, server actions).

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken, expiryFromSecondsNow, isTokenValid } from './crypto'
import type {
  DbStoragePool,
  DbStoragePoolFull,
  DbCategoryFolder,
  DbRecord,
  DbHealthEvent,
  PoolSummary,
  UploadTarget,
  IncrementResult,
  PoolStatus,
  DocumentCategory,
  ConnectAccountResult,
} from './types'

// =============================================================================
// SERVICE CLIENT — uses service_role key, bypasses all RLS
// =============================================================================

let _serviceClient: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  }

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _serviceClient
}

const db = () => getServiceClient()

// =============================================================================
// POOL ACCOUNT QUERIES
// =============================================================================

/**
 * Returns safe (no-token) pool rows for all accounts.
 * Ordered by current_usage_bytes ASC so the UI can show least-used first.
 */
export async function getAllPoolAccounts(): Promise<DbStoragePool[]> {
  const { data, error } = await db()
    .from('storage_pool')
    .select(`
      id, user_id, account_email, root_folder_id,
      quota_bytes, current_usage_bytes, file_count,
      status, is_active, error_message,
      last_health_check, last_refreshed, connected_at, updated_at
    `)
    .order('current_usage_bytes', { ascending: true })

  if (error) throw new Error(`getAllPoolAccounts: ${error.message}`)
  return (data ?? []) as DbStoragePool[]
}

/**
 * Returns the full row including encrypted tokens.
 * Used internally by the gateway to call the Drive API.
 */
export async function getPoolAccountFull(poolId: string): Promise<DbStoragePoolFull> {
  const { data, error } = await db()
    .from('storage_pool')
    .select('*')
    .eq('id', poolId)
    .single()

  if (error) throw new Error(`getPoolAccountFull(${poolId}): ${error.message}`)
  return data as DbStoragePoolFull
}

/**
 * Returns the full row for a user's connected Drive account.
 */
export async function getPoolAccountByUsername(username: string): Promise<DbStoragePoolFull | null> {
  // Join through users table
  const { data: user, error: uErr } = await db()
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (uErr || !user) return null

  const { data, error } = await db()
    .from('storage_pool')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`getPoolAccountByUsername(${username}): ${error.message}`)
  return data as DbStoragePoolFull | null
}

/**
 * Returns the DECRYPTED refresh_token for a pool account.
 * Never log the return value.
 */
export async function getDecryptedRefreshToken(poolId: string): Promise<string | null> {
  const row = await getPoolAccountFull(poolId)
  if (!row.encrypted_refresh_token) return null
  try {
    return decryptToken(row.encrypted_refresh_token)
  } catch {
    return null
  }
}

/**
 * Returns the current access token if still valid, else null.
 * Caller should use refreshAccessToken() when this returns null.
 */
export async function getCachedAccessToken(poolId: string): Promise<string | null> {
  const row = await getPoolAccountFull(poolId)
  if (!row.access_token || !isTokenValid(row.token_expiry)) return null
  try {
    return decryptToken(row.access_token)
  } catch {
    return null
  }
}

/**
 * Stores a newly obtained access_token (encrypted) and its expiry.
 */
export async function saveAccessToken(
  poolId: string,
  accessToken: string,
  expiresIn: number
): Promise<void> {
  const { error } = await db()
    .from('storage_pool')
    .update({
      access_token:  encryptToken(accessToken),
      token_expiry:  expiryFromSecondsNow(expiresIn),
      last_refreshed: new Date().toISOString(),
      status:        'ACTIVE' as PoolStatus,
      error_message: null,
    })
    .eq('id', poolId)

  if (error) throw new Error(`saveAccessToken(${poolId}): ${error.message}`)
}

/**
 * Stores initial OAuth2 tokens and creates the pool row.
 * Called once during the OAuth2 connect flow.
 */
export async function upsertPoolAccount(params: {
  username: string
  accountEmail: string
  refreshToken: string
  accessToken: string
  expiresIn: number
  rootFolderId: string
}): Promise<string> {  // returns pool account ID

  // Resolve user row
  const { data: user, error: uErr } = await db()
    .from('users')
    .select('id')
    .eq('username', params.username)
    .maybeSingle()

  if (uErr || !user) throw new Error(`User not found: ${params.username}`)

  const payload = {
    user_id:                user.id,
    account_email:          params.accountEmail,
    encrypted_refresh_token: encryptToken(params.refreshToken),
    access_token:           encryptToken(params.accessToken),
    token_expiry:           expiryFromSecondsNow(params.expiresIn),
    root_folder_id:         params.rootFolderId,
    status:                 'ACTIVE' as PoolStatus,
    is_active:              true,
    error_message:          null,
    last_refreshed:         new Date().toISOString(),
    connected_at:           new Date().toISOString(),
  }

  const { data, error } = await db()
    .from('storage_pool')
    .upsert(payload, { onConflict: 'user_id' })
    .select('id')
    .single()

  if (error) throw new Error(`upsertPoolAccount: ${error.message}`)
  return data.id
}

/**
 * Marks a pool account as disconnected (soft delete).
 */
export async function deactivatePoolAccount(poolId: string): Promise<number> {
  // Count files before deactivating
  const { count } = await db()
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('pool_account_id', poolId)

  await db()
    .from('storage_pool')
    .update({
      is_active:     false,
      status:        'MAINTENANCE' as PoolStatus,
      error_message: 'Disconnected by user',
    })
    .eq('id', poolId)

  return count ?? 0
}

/**
 * Marks a pool account as errored (called by gateway on auth failure).
 */
export async function markPoolAccountError(poolId: string, message: string): Promise<void> {
  await db()
    .from('storage_pool')
    .update({
      status:        'ERROR' as PoolStatus,
      is_active:     false,
      error_message: message,
    })
    .eq('id', poolId)
}

/**
 * Updates the last_health_check timestamp and clears errors if healthy.
 */
export async function updateHealthCheckResult(
  poolId: string,
  healthy: boolean,
  errorMessage?: string
): Promise<void> {
  await db()
    .from('storage_pool')
    .update({
      last_health_check: new Date().toISOString(),
      status:        healthy ? ('ACTIVE' as PoolStatus) : ('ERROR' as PoolStatus),
      is_active:     healthy,
      error_message: healthy ? null : (errorMessage ?? 'Health check failed'),
    })
    .eq('id', poolId)
}

// =============================================================================
// CATEGORY FOLDER CACHE
// =============================================================================

export async function getCachedFolderId(
  poolAccountId: string,
  folderName: string
): Promise<string | null> {
  const { data } = await db()
    .from('category_folders')
    .select('drive_folder_id')
    .eq('pool_account_id', poolAccountId)
    .eq('folder_name', folderName)
    .maybeSingle()

  return data?.drive_folder_id ?? null
}

export async function cacheFolderId(
  poolAccountId: string,
  folderName: string,
  driveFolderId: string
): Promise<void> {
  const { error } = await db()
    .from('category_folders')
    .upsert(
      { pool_account_id: poolAccountId, folder_name: folderName, drive_folder_id: driveFolderId },
      { onConflict: 'pool_account_id,folder_name' }
    )

  if (error) console.warn('cacheFolderId warn:', error.message)
}

export async function getAllCachedFolders(poolAccountId: string): Promise<DbCategoryFolder[]> {
  const { data, error } = await db()
    .from('category_folders')
    .select('*')
    .eq('pool_account_id', poolAccountId)

  if (error) throw new Error(`getAllCachedFolders: ${error.message}`)
  return (data ?? []) as DbCategoryFolder[]
}

// =============================================================================
// RECORD (FILE METADATA) QUERIES
// =============================================================================

export async function insertRecord(record: Omit<DbRecord, 'id' | 'created_at' | 'updated_at' | 'last_synced'>): Promise<DbRecord> {
  const { data, error } = await db()
    .from('records')
    .insert(record)
    .select()
    .single()

  if (error) throw new Error(`insertRecord: ${error.message}`)
  return data as DbRecord
}

export async function getRecordByDriveId(gdriveFileId: string): Promise<DbRecord | null> {
  const { data } = await db()
    .from('records')
    .select('*')
    .eq('gdrive_file_id', gdriveFileId)
    .maybeSingle()

  return data as DbRecord | null
}

export async function getRecordsByEntity(
  entityType: string,
  entityId: string
): Promise<DbRecord[]> {
  const { data, error } = await db()
    .from('records')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`getRecordsByEntity: ${error.message}`)
  return (data ?? []) as DbRecord[]
}

export async function getRecordsByCategory(
  category: DocumentCategory,
  limit = 100,
  offset = 0
): Promise<DbRecord[]> {
  const { data, error } = await db()
    .from('records')
    .select('*')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`getRecordsByCategory: ${error.message}`)
  return (data ?? []) as DbRecord[]
}

export async function markRecordInaccessible(recordId: string): Promise<void> {
  await db()
    .from('records')
    .update({ is_accessible: false, last_synced: new Date().toISOString() })
    .eq('id', recordId)
}

export async function deleteRecord(recordId: string): Promise<void> {
  const { error } = await db()
    .from('records')
    .delete()
    .eq('id', recordId)

  if (error) throw new Error(`deleteRecord: ${error.message}`)
}

export async function getInaccessibleRecords(poolAccountId?: string): Promise<DbRecord[]> {
  let query = db()
    .from('records')
    .select('*')
    .eq('is_accessible', false)
    .order('created_at', { ascending: false })

  if (poolAccountId) query = query.eq('pool_account_id', poolAccountId)
  const { data, error } = await query
  if (error) throw new Error(`getInaccessibleRecords: ${error.message}`)
  return (data ?? []) as DbRecord[]
}

// =============================================================================
// HEALTH EVENT LOGGING
// =============================================================================

export async function logHealthEvent(event: Omit<DbHealthEvent, 'id' | 'created_at'>): Promise<void> {
  const { error } = await db().from('health_events').insert(event)
  if (error) console.warn('logHealthEvent warn:', error.message)
}

export async function getRecentHealthEvents(
  poolAccountId: string,
  limit = 20
): Promise<DbHealthEvent[]> {
  const { data, error } = await db()
    .from('health_events')
    .select('*')
    .eq('pool_account_id', poolAccountId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getRecentHealthEvents: ${error.message}`)
  return (data ?? []) as DbHealthEvent[]
}

// =============================================================================
// RPC WRAPPERS
// =============================================================================

export async function rpcIncrementStorage(
  poolAccountId: string,
  bytesAdded: number
): Promise<IncrementResult> {
  const { data, error } = await db().rpc('increment_storage_usage', {
    p_pool_account_id: poolAccountId,
    p_bytes_added:     bytesAdded,
  })

  if (error) throw new Error(`increment_storage_usage RPC: ${error.message}`)
  return (data as IncrementResult[])[0]
}

export async function rpcDecrementStorage(
  poolAccountId: string,
  bytesRemoved: number
): Promise<void> {
  const { error } = await db().rpc('decrement_storage_usage', {
    p_pool_account_id: poolAccountId,
    p_bytes_removed:   bytesRemoved,
  })

  if (error) throw new Error(`decrement_storage_usage RPC: ${error.message}`)
}

export async function rpcGetPoolSummary(): Promise<PoolSummary> {
  const { data, error } = await db().rpc('get_pool_summary')
  if (error) throw new Error(`get_pool_summary RPC: ${error.message}`)
  return (data as PoolSummary[])[0]
}

export async function rpcPickUploadTarget(fileSizeBytes: number): Promise<UploadTarget | null> {
  const { data, error } = await db().rpc('pick_upload_target', {
    p_file_size_bytes: fileSizeBytes,
  })
  if (error) throw new Error(`pick_upload_target RPC: ${error.message}`)
  const results = data as UploadTarget[]
  return results.length > 0 ? results[0] : null
}