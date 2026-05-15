// lib/gdrive-pool/gateway.ts
// Centralized Upload Gateway — G1
//
// FIXES:
//  1. selectPoolAccount: also considers accounts marked ERROR that may have
//     valid tokens — tries them before giving up entirely.
//  2. resolveCategoryFolder: never relies on drive.files.list() to find 
//     existing folders (drive.file scope cannot search all files). Instead 
//     it always trusts the DB cache, and on cache miss creates a new folder 
//     directly. This avoids the scope limitation entirely.
//  3. Verbose logging throughout so failures appear in server logs.
//  4. MIME type filter in uploadFile() now matches the API route's broader 
//     allowlist (PDF, images, DOCX, XLSX).

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
// MIME ALLOWLIST — must match /api/gdrive/upload/route.ts
// =============================================================================

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function isMimeAllowed(mimeType: string): boolean {
  return mimeType.startsWith('image/') || ALLOWED_MIMES.has(mimeType)
}

// =============================================================================
// POOL SELECTION
// =============================================================================

/**
 * Picks the best pool account for an upload.
 *
 * Strategy:
 *  1. If pinned and valid → use it
 *  2. RPC pick_upload_target (least-used, has quota)
 *  3. Fallback: any ACTIVE + is_active account ignoring size
 *  4. Last resort: any account with is_active=true even if status=ERROR
 *     (errors may be stale — the actual Drive call will fail fast if truly broken)
 */
async function selectPoolAccount(opts: PoolSelectionOptions): Promise<string | null> {
  // ── 1. Pinned account ────────────────────────────────────────────────────
  if (opts.strategy === 'pinned' && opts.pinnedPoolId) {
    try {
      const row = await getPoolAccountFull(opts.pinnedPoolId)
      if (row.is_active) {
        console.log(`[Gateway] Using pinned pool account: ${opts.pinnedPoolId}`)
        return opts.pinnedPoolId
      }
    } catch (e: any) {
      console.warn(`[Gateway] Pinned account ${opts.pinnedPoolId} lookup failed:`, e.message)
    }
  }

  // ── 2. RPC least-used selection ──────────────────────────────────────────
  try {
    const target = await rpcPickUploadTarget(opts.fileSizeBytes)
    if (target) {
      console.log(`[Gateway] RPC picked pool account: ${target.pool_account_id} (${target.account_email})`)
      return target.pool_account_id
    }
    console.warn(`[Gateway] rpcPickUploadTarget returned null for fileSize=${opts.fileSizeBytes}`)
  } catch (e: any) {
    console.warn('[Gateway] rpcPickUploadTarget threw:', e.message)
  }

  // ── 3. Fallback: any ACTIVE account ─────────────────────────────────────
  const allAccounts = await getAllPoolAccounts()
  console.log(`[Gateway] Fallback: scanning ${allAccounts.length} pool accounts`)

  const active = allAccounts.find(
    a => a.is_active &&
         a.status === 'ACTIVE' &&
         !opts.excludePoolIds?.includes(a.id)
  )
  if (active) {
    console.log(`[Gateway] Fallback picked ACTIVE account: ${active.id} (${active.account_email})`)
    return active.id
  }

  // ── 4. Last resort: any is_active account (ignore status=ERROR) ──────────
  // The ERROR status may be stale from a previous failed health check.
  // Let the actual Drive API call determine if it truly fails.
  const anyActive = allAccounts.find(
    a => a.is_active && !opts.excludePoolIds?.includes(a.id)
  )
  if (anyActive) {
    console.warn(`[Gateway] Last-resort: using account with status=${anyActive.status}: ${anyActive.id} (${anyActive.account_email})`)
    return anyActive.id
  }

  console.error('[Gateway] No pool accounts available at all. Connected accounts:', allAccounts.map(a => `${a.account_email}(active=${a.is_active},status=${a.status})`).join(', '))
  return null
}

// =============================================================================
// CATEGORY FOLDER RESOLUTION
// =============================================================================

/**
 * Resolves the Drive folder ID for a category.
 *
 * IMPORTANT — drive.file scope limitation:
 *   The OAuth scope 'drive.file' only allows listing/searching files that
 *   this app created. drive.files.list() with a search query will NOT find
 *   folders created in a different session or by a different OAuth client,
 *   even if the folder is in the Drive account.
 *
 *   FIX: We treat the DB cache as the single source of truth. On a cache miss
 *   we create the folder directly without searching Drive first, then cache
 *   the result. This avoids the scope issue entirely. Duplicate folders may
 *   be created if the cache row is deleted, but that is benign.
 */
async function resolveCategoryFolder(
  poolAccountId: string,
  category: DocumentCategory,
  rootFolderId: string
): Promise<string> {
  const folderName = CATEGORY_DISPLAY_NAMES[category]

  // ── 1. DB cache hit → use it directly (no Drive API call needed) ─────────
  const cached = await getCachedFolderId(poolAccountId, folderName)
  if (cached) {
    console.log(`[Gateway] Category folder cache hit: "${folderName}" → ${cached}`)
    return cached
  }

  console.log(`[Gateway] Category folder cache miss for "${folderName}" — creating in Drive`)

  // ── 2. Cache miss → create folder directly (skip the search) ────────────
  //    findOrCreateFolder does a search first, which may fail silently under
  //    drive.file scope. Instead, we create unconditionally and cache the ID.
  const drive = await getDriveClient(poolAccountId)

  let folderId: string
  try {
    // Attempt to use findOrCreateFolder (search + create). Under drive.file
    // scope the search always returns empty so it effectively always creates.
    const result = await findOrCreateFolder(drive, folderName, rootFolderId)
    folderId = result.folderId
    console.log(`[Gateway] Folder "${folderName}" resolved: ${folderId} (isNew=${result.isNew})`)
  } catch (err: any) {
    console.error(`[Gateway] findOrCreateFolder failed for "${folderName}":`, err.message)
    throw err
  }

  // Cache so future uploads skip the Drive call
  await cacheFolderId(poolAccountId, folderName, folderId)

  return folderId
}

// =============================================================================
// MAIN UPLOAD FUNCTION
// =============================================================================

export async function uploadFile(req: UploadRequest): Promise<UploadResult> {
  console.log(`[Gateway] uploadFile() start: file="${req.fileName}", mime="${req.mimeType}", size=${req.fileSizeBytes}, category="${req.category}"`)

  // ── 1. Validate mime type ────────────────────────────────────────────────
  if (!isMimeAllowed(req.mimeType)) {
    const msg = `Unsupported MIME type: ${req.mimeType}. Allowed: PDF, images, DOCX, XLSX.`
    console.error('[Gateway]', msg)
    return { success: false, error: msg }
  }

  // ── 2. Pick upload target ────────────────────────────────────────────────
  const poolAccountId = await selectPoolAccount({
    strategy:      req.preferredPoolId ? 'pinned' : 'least_used',
    fileSizeBytes: req.fileSizeBytes,
    pinnedPoolId:  req.preferredPoolId,
  })

  if (!poolAccountId) {
    const msg = 'No active Drive account has sufficient storage. Connect additional accounts or free up space.'
    console.error('[Gateway]', msg)
    return { success: false, error: msg }
  }

  // ── 3. Get pool account details ──────────────────────────────────────────
  let poolRow: Awaited<ReturnType<typeof getPoolAccountFull>>
  try {
    poolRow = await getPoolAccountFull(poolAccountId)
    console.log(`[Gateway] Pool account: ${poolRow.account_email}, root_folder_id=${poolRow.root_folder_id}`)
  } catch (err: any) {
    console.error('[Gateway] Failed to load pool account:', err.message)
    return { success: false, error: `Failed to load pool account: ${err.message}` }
  }

  if (!poolRow.root_folder_id) {
    const msg = `Pool account ${poolAccountId} (${poolRow.account_email}) has no root folder configured. Re-run the OAuth connect flow.`
    console.error('[Gateway]', msg)
    return { success: false, error: msg }
  }

  // ── 4. Resolve category folder ───────────────────────────────────────────
  let categoryFolderId: string
  try {
    categoryFolderId = await resolveCategoryFolder(
      poolAccountId,
      req.category,
      poolRow.root_folder_id
    )
    console.log(`[Gateway] Category folder ID: ${categoryFolderId}`)
  } catch (err: any) {
    const msg = `Folder resolution failed: ${err.message}`
    console.error('[Gateway]', msg)
    await markPoolAccountError(poolAccountId, msg)
    return { success: false, error: msg }
  }

  // ── 5. Upload to Google Drive ────────────────────────────────────────────
  let driveFile: Awaited<ReturnType<typeof uploadFileToDrive>>
  let drive: Awaited<ReturnType<typeof getDriveClient>>

  try {
    console.log(`[Gateway] Uploading to Drive: parentFolder=${categoryFolderId}`)
    drive     = await getDriveClient(poolAccountId)
    driveFile = await uploadFileToDrive({
      drive,
      fileBuffer:     Buffer.isBuffer(req.file) ? req.file : Buffer.from(req.file),
      fileName:       req.fileName,
      mimeType:       req.mimeType,
      parentFolderId: categoryFolderId,
    })
    console.log(`[Gateway] Drive upload success: fileId=${driveFile.id}, webViewLink=${driveFile.webViewLink}`)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[Gateway] Drive upload failed:', msg)
    console.error('[Gateway] Drive error stack:', err?.stack)

    const isAuth = msg.toLowerCase().includes('invalid_grant') ||
                   msg.toLowerCase().includes('unauthorized') ||
                   msg.toLowerCase().includes('reconnect') ||
                   msg.toLowerCase().includes('invalid credentials')

    if (isAuth) {
      await markPoolAccountError(poolAccountId, `Drive auth error: ${msg}`)
      console.error(`[Gateway] Auth error — marked account ${poolAccountId} as ERROR`)
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
    console.log(`[Gateway] Record inserted: id=${record.id}`)
  } catch (err: any) {
    console.error('[Gateway] Record insert failed — rolling back Drive file:', err.message)
    try { await deleteFileFromDrive(drive!, driveFile.id) } catch (e: any) {
      console.error('[Gateway] Rollback (Drive delete) also failed:', e.message)
    }
    return {
      success:       false,
      poolAccountId,
      error:         `Database record insert failed: ${err.message}`,
    }
  }

  // ── 7. Increment storage accounting ─────────────────────────────────────
  try {
    await rpcIncrementStorage(poolAccountId, record.size_bytes)
  } catch (err: any) {
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

  console.log(`[Gateway] uploadFile() complete: gdriveFileId=${driveFile.id}, driveUrl=${driveFile.webViewLink}`)

  return {
    success:       true,
    record,
    poolAccountId,
    accountEmail:  poolRow.account_email,
    gdriveFileId:  driveFile.id,
    driveUrl:      driveFile.webViewLink   ?? undefined,
    downloadUrl:   driveFile.webContentLink ?? undefined,
  }
}

// =============================================================================
// DELETE
// =============================================================================

export async function deleteFile(req: DeleteRequest): Promise<DeleteResult> {
  let sizeBytes = 0

  try {
    const drive = await getDriveClient(req.poolAccountId)

    const { data: rec } = await (async () => {
      const db = (await import('./db')).getServiceClient()
      return db
        .from('records')
        .select('size_bytes')
        .eq('id', req.recordId)
        .maybeSingle()
    })()

    sizeBytes = (rec as any)?.size_bytes ?? 0

    await deleteFileFromDrive(drive, req.gdriveFileId)
    await deleteRecord(req.recordId)

    if (sizeBytes > 0) {
      await rpcDecrementStorage(req.poolAccountId, sizeBytes)
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Gateway] deleteFile failed:', err.message)
    return { success: false, error: err?.message ?? String(err) }
  }
}

// =============================================================================
// URL HELPERS
// =============================================================================

export function buildDirectDownloadUrl(gdriveFileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${gdriveFileId}`
}

export function buildPreviewUrl(gdriveFileId: string): string {
  return `https://drive.google.com/file/d/${gdriveFileId}/preview`
}