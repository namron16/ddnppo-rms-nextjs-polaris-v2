// lib/adminLogger.ts
// Centralized audit logging for all hardcoded admin accounts

import { supabase } from './supabase'
import type { AdminRole } from './auth'

export type LogActionType =
  | 'login'
  | 'logout'
  | 'view_document'
  | 'upload_document'
  | 'edit_document'
  | 'archive_document'
  | 'restore_document'
  | 'delete_document'
  | 'request_access'
  | 'approve_request'
  | 'reject_request'
  | 'download_document'
  | 'forward_document'
  | 'forward_attachment'
  | 'add_attachment'
  | 'archive_attachment'
  | 'create_journal'
  | 'edit_journal'
  | 'archive_journal'
  | 'create_personnel'
  | 'update_personnel'
  | 'upload_doc201'
  | 'create_special_order'
  | 'archive_special_order'
  | 'add_library_item'
  | 'archive_library_item'
  | 'review_document'
  | 'approve_document'
  | 'reject_document'
  | 'add_org_member'
  | 'edit_org_member'
  | 'remove_org_member'
  | 'recall_inbox_item'
  | 'save_inbox_item'

export interface AdminLog {
  id: string
  admin_id: AdminRole
  action: LogActionType
  description: string
  created_at: string
}

// Module-level reference – set once at login via setCurrentLogger()
let _currentAdminId: AdminRole | null = null

export function setCurrentLogger(adminId: AdminRole | null) {
  _currentAdminId = adminId
}

/**
 * Insert one audit row into admin_logs.
 * Silently swallows errors so it never disrupts the main flow.
 */
export async function logAction(
  action: LogActionType,
  description: string,
  adminIdOverride?: AdminRole
): Promise<void> {
  const adminId = adminIdOverride ?? _currentAdminId
  if (!adminId) return

  const { error } = await supabase.from('admin_logs').insert({
    admin_id: adminId,
    action,
    description,
  })

  if (error) {
    console.warn('[adminLogger] Failed to write log:', error.message)
  }
}

// ── Convenience wrappers ──────────────────────

export const logLogin = (adminId: AdminRole) =>
  logAction('login', `${adminId} logged in`, adminId)

export const logLogout = (adminId: AdminRole) =>
  logAction('logout', `${adminId} logged out`, adminId)

export const logViewDocument = (docTitle: string, adminIdOverride?: AdminRole) => {
  const actor = adminIdOverride ?? _currentAdminId
  if (!actor) return Promise.resolve()
  return logAction('view_document', `${actor} viewed document "${docTitle}"`, adminIdOverride)
}

export const logDownloadDocument = (docTitle: string) =>
  logAction('download_document', `Downloaded document "${docTitle}"`)

export const logUploadDocument = (docTitle: string, adminIdOverride?: AdminRole) =>
  logAction('upload_document', `Uploaded document "${docTitle}"`, adminIdOverride)

export const logEditDocument = (docTitle: string, adminIdOverride?: AdminRole) =>
  logAction('edit_document', `Edited document "${docTitle}"`, adminIdOverride)

export const logArchiveDocument = (docTitle: string, type = 'document', adminIdOverride?: AdminRole) =>
  logAction('archive_document', `Archived ${type} "${docTitle}"`)

export const logRestoreDocument = (docTitle: string) =>
  logAction('restore_document', `Restored document "${docTitle}"`)

export const logDeleteDocument = (
  docTitle: string,
  type = 'document',
  adminIdOverride?: AdminRole
) => {
  const actor = adminIdOverride ?? _currentAdminId
  const description = actor
    ? `${actor} deleted ${type} "${docTitle}"`
    : `Deleted ${type} "${docTitle}"`

  return logAction('delete_document', description, adminIdOverride)
}

export const logRequestAccess = (adminId: AdminRole, docTitle: string) =>
  logAction('request_access', `${adminId} requested access to "${docTitle}"`, adminId)

export const logApproveRequest = (requesterId: string, docTitle: string) =>
  logAction('approve_request', `Approved access for ${requesterId} on "${docTitle}"`)

export const logRejectRequest = (requesterId: string, docTitle: string, reason?: string) =>
  logAction(
    'reject_request',
    `Rejected access for ${requesterId} on "${docTitle}"${reason ? ` — ${reason}` : ''}`
  )

export const logForwardDocument = (docTitle: string, recipient: string) =>
  logAction('forward_document', `Forwarded "${docTitle}" to ${recipient}`)

export const logForwardAttachment = (fileName: string, recipient: string) =>
  logAction('forward_attachment', `Forwarded attachment "${fileName}" to ${recipient}`)

export const logAddAttachment = (fileName: string, parentTitle: string) =>
  logAction('add_attachment', `Attached "${fileName}" to "${parentTitle}"`)

export const logReviewDocument = (docTitle: string) =>
  logAction('review_document', `Reviewed document "${docTitle}" (submitted to PD)`)

export const logApproveDocument = (docTitle: string) =>
  logAction('approve_document', `Final approved document "${docTitle}"`)

export const logRejectDocument = (docTitle: string, reason: string) =>
  logAction('reject_document', `Rejected document "${docTitle}" — ${reason}`)

export const logEditJournal = (entryTitle: string, adminIdOverride?: AdminRole) =>
  logAction('edit_journal', `Edited journal entry "${entryTitle}"`, adminIdOverride)

export const logEditOrgMember = (memberName: string, adminIdOverride?: AdminRole) =>
  logAction('edit_org_member', `Edited organization member "${memberName}"`, adminIdOverride)

export const logAddOrgMember = (memberName: string, adminIdOverride?: AdminRole) =>
  logAction('add_org_member', `Added organization member "${memberName}"`, adminIdOverride)

export const logUpdatePersonnel = (personName: string, adminIdOverride?: AdminRole) =>
  logAction('update_personnel', `Updated 201 profile for "${personName}"`, adminIdOverride)

export const logEditLibraryItem = (itemTitle: string, adminIdOverride?: AdminRole) =>
  logAction('edit_document', `Edited library item "${itemTitle}"`, adminIdOverride)

export const logRenameAttachment = (oldName: string, newName: string, adminIdOverride?: AdminRole) =>
  logAction('edit_document', `Renamed attachment "${oldName}" to "${newName}"`, adminIdOverride)
