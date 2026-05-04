// lib/gdrive-pool/migrate-modals.ts
// Drop-in adapter: replaces the supabase.storage.from('documents').upload() pattern
// used across all existing modals with the Drive Pool gateway.
//
// USAGE — replace this pattern in any modal:
//
//   OLD (Supabase Storage):
//   ─────────────────────────────────────────────────────────────────
//   const fileName = `master-docs/${Date.now()}-${file.name}`
//   const { data: storageData, error: storageError } = await supabase.storage
//     .from('documents')
//     .upload(fileName, file, { cacheControl: '3600', upsert: false })
//   const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storageData.path)
//   fileUrl = urlData.publicUrl
//   ─────────────────────────────────────────────────────────────────
//
//   NEW (Drive Pool — server-side, called from API route):
//   ─────────────────────────────────────────────────────────────────
//   import { uploadViaPool } from '@/lib/gdrive-pool/migrate-modals'
//
//   const { fileUrl, gdriveFileId, poolAccountId } = await uploadViaPool({
//     file,
//     category:   'master_documents',
//     entityType: 'master_document',
//     entityId:   newDoc.id,
//     uploadedBy: user.role,
//   })
//   ─────────────────────────────────────────────────────────────────
//
// For client-side modal code, use the useDriveUpload() hook instead.

import { uploadFile, deleteFile, buildDirectDownloadUrl, buildPreviewUrl } from './gateway'
import type { DocumentCategory, UploadResult, DeleteResult } from './types'

// =============================================================================
// SERVER-SIDE ADAPTER
// =============================================================================

export interface PoolUploadOptions {
  file: Buffer | Uint8Array
  fileName: string
  mimeType: string
  category: DocumentCategory
  entityType?: string
  entityId?: string
  uploadedBy: string
  preferredPoolId?: string
  fileSizeBytes: number
}

export interface PoolUploadResult {
  fileUrl: string             // Drive webViewLink  (use for display)
  downloadUrl: string         // Drive webContentLink (use for downloads)
  previewUrl: string          // Drive preview embed URL
  gdriveFileId: string        // Drive file ID  (store this for deletion)
  poolAccountId: string       // Which pool account holds the file
  accountEmail: string        // Human-readable account identifier
  recordId: string            // Supabase records.id
  sizeBytes: number
}

/**
 * Server-side drop-in for supabase.storage.upload().
 * Call from Next.js API routes, server actions, or lib/ functions.
 *
 * Throws on failure — wrap in try/catch in the caller.
 */
export async function uploadViaPool(opts: PoolUploadOptions): Promise<PoolUploadResult> {
  const result: UploadResult = await uploadFile({
    file:          opts.file,
    fileName:      opts.fileName,
    mimeType:      opts.mimeType,
    category:      opts.category,
    entityType:    opts.entityType,
    entityId:      opts.entityId,
    uploadedBy:    opts.uploadedBy,
    fileSizeBytes: opts.fileSizeBytes,
    preferredPoolId: opts.preferredPoolId,
  })

  if (!result.success || !result.record || !result.gdriveFileId) {
    throw new Error(result.error ?? 'Drive pool upload failed with no error detail.')
  }

  return {
    fileUrl:       result.driveUrl      ?? `https://drive.google.com/file/d/${result.gdriveFileId}/view`,
    downloadUrl:   result.downloadUrl   ?? buildDirectDownloadUrl(result.gdriveFileId),
    previewUrl:    buildPreviewUrl(result.gdriveFileId),
    gdriveFileId:  result.gdriveFileId,
    poolAccountId: result.poolAccountId!,
    accountEmail:  result.accountEmail  ?? '',
    recordId:      result.record.id,
    sizeBytes:     result.record.size_bytes,
  }
}

/**
 * Server-side drop-in for supabase.storage.remove().
 * Deletes the file from Drive and removes the Supabase record.
 */
export async function deleteViaPool(params: {
  gdriveFileId:  string
  poolAccountId: string
  recordId:      string
}): Promise<void> {
  const result: DeleteResult = await deleteFile({
    gdriveFileId:  params.gdriveFileId,
    poolAccountId: params.poolAccountId,
    recordId:      params.recordId,
  })

  if (!result.success) {
    throw new Error(result.error ?? 'Drive pool delete failed.')
  }
}

// =============================================================================
// PER-MODAL ADAPTERS
// (copy-paste replacements for each modal's upload block)
// =============================================================================

/**
 * AddDocumentModal adapter.
 * Replace the supabase.storage block in AddDocumentModal.tsx with this.
 */
export async function uploadMasterDocument(params: {
  file: Buffer
  fileName: string
  mimeType: string
  docId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'master_documents',
    entityType:    'master_document',
    entityId:      params.docId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * AddSpecialOrderModal adapter.
 */
export async function uploadSpecialOrder(params: {
  file: Buffer
  fileName: string
  mimeType: string
  soId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'special_orders',
    entityType:    'special_order',
    entityId:      params.soId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * AddJournalEntryModal adapter.
 */
export async function uploadJournalAttachment(params: {
  file: Buffer
  fileName: string
  mimeType: string
  journalId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'daily_journals',
    entityType:    'daily_journal',
    entityId:      params.journalId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * AddConfidentialDocModal adapter.
 */
export async function uploadConfidentialDoc(params: {
  file: Buffer
  fileName: string
  mimeType: string
  docId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'classified_documents',
    entityType:    'classified_document',
    entityId:      params.docId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * AddLibraryItemModal adapter.
 */
export async function uploadLibraryItem(params: {
  file: Buffer
  fileName: string
  mimeType: string
  itemId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'library_items',
    entityType:    'library_item',
    entityId:      params.itemId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * Personnel 201 document upload adapter.
 */
export async function upload201Document(params: {
  file: Buffer
  fileName: string
  mimeType: string
  docId: string
  uploadedBy: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      params.fileName,
    mimeType:      params.mimeType,
    category:      'personnel_201',
    entityType:    'doc_201',
    entityId:      params.docId,
    uploadedBy:    params.uploadedBy,
    fileSizeBytes: params.fileSizeBytes,
  })
}

/**
 * Profile avatar upload adapter (delegates to Drive pool instead of avatars bucket).
 */
export async function uploadAvatarViaPool(params: {
  file: Buffer
  fileName: string
  mimeType: string
  username: string
  fileSizeBytes: number
}) {
  return uploadViaPool({
    file:          params.file,
    fileName:      `avatar-${params.username}-${Date.now()}.${params.fileName.split('.').pop()}`,
    mimeType:      params.mimeType,
    category:      'organization',
    entityType:    'avatar',
    entityId:      params.username,
    uploadedBy:    params.username,
    fileSizeBytes: params.fileSizeBytes,
  })
}