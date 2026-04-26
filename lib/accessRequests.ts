// lib/accessRequests.ts
// Document Access Request system for P2–P10 users

import { supabase } from './supabase'
import type { AdminRole } from './auth'
import type { DocType } from './rbac'
import { createNotification } from './rbac'

export interface DocumentAccessRequest {
  id: string
  document_id: string
  document_type: DocType
  requester_id: AdminRole
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string
  approved_by?: string
  rejection_reason?: string
  created_at: string
  reviewed_at?: string
}

// ── Admin Presence ────────────────────────────

export interface AdminPresence {
  admin_id: AdminRole
  is_active: boolean
  last_seen: string
}

/** Set admin as active on login */
export async function setAdminActive(adminId: AdminRole): Promise<void> {
  const { error } = await supabase
    .from('admin_presence')
    .upsert({ admin_id: adminId, is_active: true, last_seen: new Date().toISOString() }, { onConflict: 'admin_id' })
  if (error) console.warn('setAdminActive warn:', error.message)
}

/** Set admin as inactive on logout */
export async function setAdminInactive(adminId: AdminRole): Promise<void> {
  const { error } = await supabase
    .from('admin_presence')
    .upsert({ admin_id: adminId, is_active: false, last_seen: new Date().toISOString() }, { onConflict: 'admin_id' })
  if (error) console.warn('setAdminInactive warn:', error.message)
}

/** Get all admin presence records */
export async function getAllAdminPresence(): Promise<AdminPresence[]> {
  const { data, error } = await supabase
    .from('admin_presence')
    .select('*')
  if (error) return []
  return (data ?? []) as AdminPresence[]
}

// ── Document Access Requests ──────────────────

/**
 * P2–P10 requests access to a document.
 * Notifies DPDA and DPDO for review.
 */


/** Get access request status for a specific user and document */
export async function getAccessRequestStatus(
  documentId: string,
  requesterId: AdminRole
): Promise<DocumentAccessRequest | null> {
  const { data, error } = await supabase
    .from('document_access_requests')
    .select('*')
    .eq('document_id', documentId)
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data as DocumentAccessRequest | null
}






/** Get all pending access requests (for DPDA/DPDO/PD) */
export async function getPendingAccessRequests(): Promise<DocumentAccessRequest[]> {
  const { data, error } = await supabase
    .from('document_access_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as DocumentAccessRequest[]
}