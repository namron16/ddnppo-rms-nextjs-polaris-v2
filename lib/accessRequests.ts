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
export async function requestDocumentAccess(
  documentId: string,
  documentType: DocType,
  requesterId: AdminRole
): Promise<DocumentAccessRequest | null> {
  // Check if already requested
  const { data: existing } = await supabase
    .from('document_access_requests')
    .select('*')
    .eq('document_id', documentId)
    .eq('requester_id', requesterId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return existing as DocumentAccessRequest

  const { data, error } = await supabase
    .from('document_access_requests')
    .insert({
      document_id: documentId,
      document_type: documentType,
      requester_id: requesterId,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) { console.error('requestDocumentAccess error:', error.message); return null }

  // Notify reviewers
  await createNotification('DPDA', `${requesterId} has requested access to a document.`, 'approval_request', documentId, documentType)
  await createNotification('DPDO', `${requesterId} has requested access to a document.`, 'approval_request', documentId, documentType)

  return data as DocumentAccessRequest
}

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

/** DPDA/DPDO reviews an access request (marks as reviewed, notifies PD) */
export async function reviewAccessRequest(
  requestId: string,
  reviewerRole: 'DPDA' | 'DPDO'
): Promise<boolean> {
  const { data, error } = await supabase
    .from('document_access_requests')
    .update({ reviewed_by: reviewerRole, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single()

  if (error) { console.error('reviewAccessRequest error:', error.message); return false }

  // Notify PD
  await createNotification(
    'PD',
    `Access request reviewed by ${reviewerRole}, awaiting your approval.`,
    'approval_request',
    data.document_id,
    data.document_type
  )
  return true
}

/**
 * PD approves access request.
 * Automatically grants visibility in document_visibility table.
 */
export async function approveAccessRequest(requestId: string): Promise<boolean> {
  const { data: request, error: fetchError } = await supabase
    .from('document_access_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) return false

  const now = new Date().toISOString()

  // Update request status
  const { error: updateError } = await supabase
    .from('document_access_requests')
    .update({ status: 'approved', approved_by: 'PD', reviewed_at: now })
    .eq('id', requestId)

  if (updateError) return false

  // Grant visibility in document_visibility table
  const { error: visError } = await supabase
    .from('document_visibility')
    .upsert({
      document_id: request.document_id,
      document_type: request.document_type,
      admin_id: request.requester_id,
      can_view: true,
    }, { onConflict: 'document_id,document_type,admin_id' })

  if (visError) console.warn('Grant visibility warn:', visError.message)

  // Notify requester
  await createNotification(
    request.requester_id as AdminRole,
    'Your document access request has been approved by PD.',
    'approved',
    request.document_id,
    request.document_type
  )

  return true
}

/** Reject an access request */
export async function rejectAccessRequest(requestId: string, reason?: string): Promise<boolean> {
  const { data: request, error: fetchError } = await supabase
    .from('document_access_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) return false

  const { error } = await supabase
    .from('document_access_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) return false

  await createNotification(
    request.requester_id as AdminRole,
    `Your document access request was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    'rejected',
    request.document_id,
    request.document_type
  )

  return true
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