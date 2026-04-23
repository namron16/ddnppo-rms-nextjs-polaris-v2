// lib/permissions.ts
// Single source of truth for all role-based permission logic

import type { AdminRole } from './auth'

// ── Role Tiers ────────────────────────────────
/** Roles with full access to ALL documents regardless of visibility tags */
export const FULL_ACCESS_ROLES: AdminRole[] = ['PD', 'DPDA', 'DPDO', 'P1']

/** The only role allowed to upload documents and assign visibility */
export const UPLOAD_ROLE: AdminRole = 'P1'

/** Roles subject to tag-based visibility restrictions */
export const VIEWER_ROLES: AdminRole[] = ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']

/** Roles that appear in the approval workflow as reviewers */
export const REVIEWER_ROLES: AdminRole[] = ['DPDA', 'DPDO']

/** The final approval role */
export const FINAL_APPROVER_ROLE: AdminRole = 'PD'

// ── Permission Checkers ───────────────────────

/** Can this role upload documents? P1 only. */
export function canUploadDocuments(role: AdminRole): boolean {
  return role === UPLOAD_ROLE
}

/** Can this role assign document visibility tags? P1 only. */
export function canAssignVisibility(role: AdminRole): boolean {
  return role === UPLOAD_ROLE
}

/** Does this role bypass all visibility restrictions? */
export function hasFullDocumentAccess(role: AdminRole): boolean {
  return FULL_ACCESS_ROLES.includes(role)
}

/** Is this role subject to per-document visibility checks? */
export function isViewerRole(role: AdminRole): boolean {
  return VIEWER_ROLES.includes(role)
}

/** Can this role review documents (intermediate approval)? */
export function canReviewDocuments(role: AdminRole): boolean {
  return REVIEWER_ROLES.includes(role)
}

/** Can this role give final approval? */
export function canFinalApprove(role: AdminRole): boolean {
  return role === FINAL_APPROVER_ROLE
}

/** Can this role see the admin management panel? */
export function canManageSystem(role: AdminRole): boolean {
  return role === 'PD' || role === 'P1'
}

/**
 * Can this role manage classified documents?
 * P1 has full management access to all document types.
 * P2 has full management access (upload, edit, delete, archive, print) to classified documents only.
 */
export function canManageClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/** Can this role upload classified documents? P1 and P2 only. */
export function canUploadClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/** Can this role edit classified documents? P1 and P2 only. */
export function canEditClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/** Can this role delete classified documents? P1 and P2 only. */
export function canDeleteClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/** Can this role archive classified documents? P1 and P2 only. */
export function canArchiveClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/** Can this role print classified documents? P1 and P2 only. */
export function canPrintClassifiedDocuments(role: AdminRole): boolean {
  return role === 'P1' || role === 'P2'
}

/**
 * Client-side visibility check.
 * Server-side check is in lib/rbac.ts → canAdminViewDocument()
 */
export function checkClientVisibility(
  role: AdminRole,
  taggedRoles: AdminRole[]
): boolean {
  if (hasFullDocumentAccess(role)) return true
  return taggedRoles.includes(role)
}

// ── Role Display Metadata ─────────────────────
export interface RoleMeta {
  role: AdminRole
  label: string
  shortLabel: string
  color: string
  level: 'head' | 'deputy' | 'super_admin' | 'viewer'
}

export const ROLE_META: Record<AdminRole, RoleMeta> = {
  PD:   { role: 'PD',  label: 'Provincial Director',           shortLabel: 'PD',  color: '#dc2626', level: 'head'        },
  DPDA: { role: 'DPDA',label: 'Deputy Director Admin',         shortLabel: 'DPDA',color: '#d97706', level: 'deputy'      },
  DPDO: { role: 'DPDO',label: 'Deputy Director Operations',    shortLabel: 'DPDO',color: '#b45309', level: 'deputy'      },
  P1:   { role: 'P1',  label: 'Records Officer (Super Admin)', shortLabel: 'P1',  color: '#7c3aed', level: 'super_admin' },
  P2:   { role: 'P2',  label: 'Admin Officer P2',              shortLabel: 'P2',  color: '#0891b2', level: 'viewer'      },
  P3:   { role: 'P3',  label: 'Admin Officer P3',              shortLabel: 'P3',  color: '#0d9488', level: 'viewer'      },
  P4:   { role: 'P4',  label: 'Admin Officer P4',              shortLabel: 'P4',  color: '#16a34a', level: 'viewer'      },
  P5:   { role: 'P5',  label: 'Admin Officer P5',              shortLabel: 'P5',  color: '#ca8a04', level: 'viewer'      },
  P6:   { role: 'P6',  label: 'Admin Officer P6',              shortLabel: 'P6',  color: '#ea580c', level: 'viewer'      },
  P7:   { role: 'P7',  label: 'Admin Officer P7',              shortLabel: 'P7',  color: '#e11d48', level: 'viewer'      },
  P8:   { role: 'P8',  label: 'Admin Officer P8',              shortLabel: 'P8',  color: '#8b5cf6', level: 'viewer'      },
  P9:   { role: 'P9',  label: 'Admin Officer P9',              shortLabel: 'P9',  color: '#06b6d4', level: 'viewer'      },
  P10:  { role: 'P10', label: 'Admin Officer P10',             shortLabel: 'P10', color: '#10b981', level: 'viewer'      },
}