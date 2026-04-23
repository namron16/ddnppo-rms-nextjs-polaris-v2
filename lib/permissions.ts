// Simplified — no more visibility tags or access requests
import { AdminRole } from "./auth"

export function canUploadDocuments(role: AdminRole): boolean {
  return role === 'P1'
}

export function canEditDocuments(role: AdminRole): boolean {
  return role === 'P1'
}

export function canDeleteDocuments(role: AdminRole): boolean {
  return role === 'P1'
}

export function canArchiveDocuments(role: AdminRole): boolean {
  return role === 'P1'
}

export function canForwardDocuments(role: AdminRole): boolean {
  return role === 'P1'
}

export function canManageClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P2'  // P2 exclusively manages classified docs
}

export function canSaveFromInbox(role: AdminRole): boolean {
  return ['P2','P3','P4','P5','P6','P7','P8','P9','P10'].includes(role)
}

export function canViewDocumentPage(role: AdminRole): boolean {
  return true  // All accounts see the same pages
}
export function canManageClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P2'  // P2 only — P1 excluded
}