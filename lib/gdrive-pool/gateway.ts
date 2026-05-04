// lib/gdrive-pool/gateway.ts
// Centralized Upload Gateway — G1
//
// This is the single entry point for all file uploads.
// It handles:
//   1. Pool account selection (least-used strategy by default)
//   2. Category folder resolution (with DB cache)
//   3. Google Drive upload
//   4. Supabase records insert + storage accounting
//   5. Error handling and fallback

import { getDriveClient, findOrCreateFolder, uploadFileToDrive, deleteFileFromDrive } from './drive-client'
import {
  rpcPickUploadTarget,
  rpcIncrementStorage,
  rpcDecrementStorage,
  getCachedFolderId,
  cacheFolderId,
  insertRecord,
  deleteRecord,
  getAllPoolAccounts,
  getPoolAccountFull,
  markPoolAccountError,
  logHealthEvent,
} from './db'
import { CATEGORY_DISPLAY_NAMES } from './types'
import type {
  UploadRequest,
  UploadResult,
  DeleteRequest,
  DeleteResult,
  DocumentCategory,
  PoolSelectionOptions,
  DbRecord,
} from './types'

// =============================================================================
// POOL SELECTION
// =============================================================================

/**
 * Picks the best pool account for an upload.
 * Falls back through active accounts if the primary choice is over quota.
 */
async function selectPoolAccount(opts: PoolSelectionOptions): Promise<string | null> {
  if (opts.strategy === 'pinned' && opts.pinnedPoolId) {
    // Verify pinned account is active
    try {
      const row = await getPoolAccountFull(opts.pinnedPoolId)
      if (row.is_active && row.status === 'ACTIVE') return opts.pinnedPoolId
    } catch {
      // fall through to automatic selection
    }
  }

  // Use the DB RPC (least_used strategy)
  const target = await rpcPickUploadTarget(opts.fileSizeBytes)
  if (target) return target.pool_account_id

  // RPC returned null → no account with enough space found
  // Last resort: try any active account ignoring size check
  const allAccounts = await getAllPoolAccounts()
  const fallback = allAccounts.find(
    (a: typeof allAccounts[number]) =>
      a.is_active &&
      a.status === 'ACTIVE' &&
      !opts.excludePoolIds?.includes(a.id)
  )

  return fallback?.id ?? null
}

// =============================================================================
// CATEGORY FOLDER RESOLUTION
// =============================================================================

/**
 * Resolves the Drive folder ID for a category, using DB cache to avoid
 * redundant Drive API calls.
 */
async function resolveCategoryFolder(
  poolAccountId: string,
  category: DocumentCategory,
  rootFolderId: string
): Promise<string> {
  const folderName = CATEGORY_DISPLAY_NAMES[category]

  // Check cache first
  const cached = await getCachedFolderId(poolAccountId, folderName)
  if (cached) return cached

  // Need to find or create in Drive
  const drive  = await getDriveClient(poolAccountId)
  const result = await findOrCreateFolder(drive, folderName, rootFolderId)

  // Cache for future calls
  await cacheFolderId(poolAccountId, folderName, result.folderId)

  if (result.isNew) {
    console.info(`[Gateway] Created folder "${folderName}" in pool account ${poolAccountId}`)
  }

  return result.folderId
}

// =============================================================================
// MAIN UPLOAD FUNCTION
// =============================================================================

/**
 * Uploads a file through the pooling gateway.
 *
 * @example
 * const result = await uploadFile({
 *   file:          fileBuffer,
 *   fileName:      'report.pdf',
 *   mimeType:      'application/pdf',
 *   category:      'master_documents',
 *   entityType:    'master_document',
 *   entityId:      masterDoc.id,
 *   uploadedBy:    'P1',
 *   fileSizeBytes: fileBuffer.length,
 * })
 *
 * if (result.success) {
 *   console.log('Drive URL:', result.driveUrl)
 * }
 */
export async function uploadFile(req: UploadRequest): Promise<UploadResult> {
  // ── 1. Validate mime type ────────────────────────────────────────────────
  const isAllowed =
    req.mimeType === 'application/pdf' ||
    req.mimeType.startsWith('image/')

  if (!isAllowed) {
    return { success: false, error: `Unsupported MIME type: ${req.mimeType}. Only PDF and images are allowed.` }
  }

  // ── 2. Pick upload target ────────────────────────────────────────────────
  const poolAccountId = await selectPoolAccount({
    strategy:      req.preferredPoolId ? 'pinned' : 'least_used',
    fileSizeBytes: req.fileSizeBytes,
    pinnedPoolId:  req.preferredPoolId,
  })

  if (!poolAccountId) {
    return {
      success: false,
      error:   'No active Drive account has sufficient storage. Connect additional accounts or free up space.',
    }
  }

  // ── 3. Get pool account details ──────────────────────────────────────────
  let poolRow: Awaited<ReturnType<typeof getPoolAccountFull>>
  try {
    poolRow = await getPoolAccountFull(poolAccountId)
  } catch (err: any) {
    return { success: false, error: `Failed to load pool account: ${err.message}` }
  }

  if (!poolRow.root_folder_id) {
    return { success: false, error: `Pool account ${poolAccountId} has no root folder configured.` }
  }

  // ── 4. Resolve category folder ───────────────────────────────────────────
  let categoryFolderId: string
  try {
    categoryFolderId = await resolveCategoryFolder(
      poolAccountId,
      req.category,
      poolRow.root_folder_id
    )
  } catch (err: any) {
    await markPoolAccountError(poolAccountId, `Folder resolution failed: ${err.message}`)
    return { success: false, error: `Folder resolution failed: ${err.message}` }
  }

  // ── 5. Upload to Google Drive ────────────────────────────────────────────
  let driveFile: Awaited<ReturnType<typeof uploadFileToDrive>>
  let drive: Awaited<ReturnType<typeof getDriveClient>>

  try {
    drive     = await getDriveClient(poolAccountId)
    driveFile = await uploadFileToDrive({
      drive,
      fileBuffer:      Buffer.isBuffer(req.file) ? req.file : Buffer.from(req.file),
      fileName:        req.fileName,
      mimeType:        req.mimeType,
      parentFolderId:  categoryFolderId,
    })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    const isAuth = msg.toLowerCase().includes('invalid_grant') ||
                   msg.toLowerCase().includes('unauthorized') ||
                   msg.toLowerCase().includes('reconnect')

    if (isAuth) {
      await markPoolAccountError(poolAccountId, `Drive auth error: ${msg}`)
    }

    return {
      success:       false,
      poolAccountId,
      error:         `Drive upload failed: ${msg}`,
    }
  }

  // ── 6. Insert record into Supabase ───────────────────────────────────────
  let record: DbRecord
  try {
    record = await insertRecord({
      file_name:          driveFile.name,
      original_name:      req.fileName,
      gdrive_file_id:     driveFile.id,
      mime_type:          req.mimeType,
      pool_account_id:    poolAccountId,
      category_folder_id: categoryFolderId,
      category:           req.category,
      size_bytes:         parseInt(driveFile.size ?? '0', 10) || req.fileSizeBytes,
      drive_url:          driveFile.webViewLink   ?? null,
      thumbnail_url:      driveFile.thumbnailLink ?? null,
      download_url:       driveFile.webContentLink ?? null,
      entity_type:        req.entityType  ?? null,
      entity_id:          req.entityId    ?? null,
      uploaded_by:        req.uploadedBy,
      is_accessible:      true,
    })
  } catch (err: any) {
    // Record failed to insert — clean up the Drive file to avoid orphans
    console.error('[Gateway] Record insert failed — rolling back Drive upload:', err.message)
    try { await deleteFileFromDrive(drive!, driveFile.id) } catch {}
    return {
      success:       false,
      poolAccountId,
      error:         `Database record insert failed: ${err.message}`,
    }
  }

  // ── 7. Increment storage accounting (atomic RPC) ─────────────────────────
  try {
    await rpcIncrementStorage(poolAccountId, record.size_bytes)
  } catch (err: any) {
    // Non-fatal: log but don't fail the upload
    console.warn('[Gateway] Storage increment failed (non-fatal):', err.message)
  }

  // ── 8. Log success ───────────────────────────────────────────────────────
  await logHealthEvent({
    pool_account_id: poolAccountId,
    event_type:      'health_check',
    status:          'ok',
    message:         `Uploaded "${req.fileName}" (${(record.size_bytes / 1024).toFixed(1)} KB) to ${req.category}`,
    latency_ms:      null,
  })

  return {
    success:       true,
    record,
    poolAccountId,
    accountEmail:  poolRow.account_email,
    gdriveFileId:  driveFile.id,
    driveUrl:      driveFile.webViewLink  ?? undefined,
    downloadUrl:   driveFile.webContentLink ?? undefined,
  }
}

// =============================================================================
// DELETE
// =============================================================================

/**
 * Deletes a file from Google Drive and removes the Supabase record.
 * Atomically decrements storage accounting.
 */
export async function deleteFile(req: DeleteRequest): Promise<DeleteResult> {
  // Fetch record size before deleting (for storage decrement)
  let sizeBytes = 0

  try {
    const drive = await getDriveClient(req.poolAccountId)

    // Get size from record before we delete it
    const { data: rec } = await (async () => {
      const db = (await import('./db')).getServiceClient()
      return db
        .from('records')
        .select('size_bytes')
        .eq('id', req.recordId)
        .maybeSingle()
    })()

    sizeBytes = (rec as any)?.size_bytes ?? 0

    // Delete from Drive
    await deleteFileFromDrive(drive, req.gdriveFileId)

    // Delete from Supabase records
    await deleteRecord(req.recordId)

    // Decrement storage accounting
    if (sizeBytes > 0) {
      await rpcDecrementStorage(req.poolAccountId, sizeBytes)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

// =============================================================================
// BULK PRESIGN (convenience helper for the frontend)
// =============================================================================

/**
 * Returns a direct download URL for a Drive file.
 * Drive files with reader:anyone permission have stable public URLs.
 */
export function buildDirectDownloadUrl(gdriveFileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${gdriveFileId}`
}

export function buildPreviewUrl(gdriveFileId: string): string {
  return `https://drive.google.com/file/d/${gdriveFileId}/preview`
}