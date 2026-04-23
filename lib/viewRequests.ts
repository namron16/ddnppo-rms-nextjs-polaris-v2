// lib/viewRequests.ts
// Document View Request system — P2–P10 request, P1 approves/rejects
// Real-time updates via Supabase Realtime

import { supabase } from './supabase'
import type { AdminRole } from './auth'
import type { DocType } from './rbac'
import { logApproveRequest, logRejectRequest, logRequestAccess } from './adminLogger'

// ── Types ─────────────────────────────────────

export interface DocumentViewRequest {
  id: string
  document_id: string
  document_type: DocType | string
  document_title?: string
  requester_id: AdminRole
  purpose: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by?: string
  reviewed_at?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
}

export type ViewRequestStatus = DocumentViewRequest['status']

const TEMP_VIEW_ACCESS_MS = 24 * 60 * 60 * 1000

function isWithin24Hours(isoDate?: string | null): boolean {
  if (!isoDate) return true
  const ts = new Date(isoDate).getTime()
  if (Number.isNaN(ts)) return false
  return Date.now() - ts <= TEMP_VIEW_ACCESS_MS
}

// ── Viewer roles that must request access ────
export const VIEWER_ROLES_NEEDING_REQUEST: AdminRole[] = [
  'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
]

// PD, DPDA, DPDO, P1 always have full access — no request needed
export const ALWAYS_FULL_ACCESS_ROLES: AdminRole[] = ['PD', 'DPDA', 'DPDO', 'P1']

export const REQUEST_APPROVER_ROLE: AdminRole = 'P1'

export function roleNeedsViewRequest(role: AdminRole): boolean {
  return VIEWER_ROLES_NEEDING_REQUEST.includes(role)
}

export function roleHasFullAccess(role: AdminRole): boolean {
  return ALWAYS_FULL_ACCESS_ROLES.includes(role)
}

// ── CRUD Operations ────────────────────────────

export async function submitViewRequest(
  documentId: string,
  documentType: string,
  documentTitle: string,
  requesterId: AdminRole,
  purpose: string,
  reason: string
): Promise<DocumentViewRequest | null> {
  if (!roleNeedsViewRequest(requesterId)) {
    console.warn(`submitViewRequest: role ${requesterId} does not need to request`)
    return null
  }

  const existing = await getViewRequestForDoc(documentId, requesterId)
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    return existing
  }

  const { data, error } = await supabase
    .from('document_view_requests')
    .insert({
      document_id: documentId,
      document_type: documentType,
      document_title: documentTitle,
      requester_id: requesterId,
      purpose: purpose.trim(),
      reason: reason.trim(),
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('submitViewRequest error:', error.message)
    return null
  }

  logRequestAccess(requesterId, documentTitle || documentId).catch(() => {})

  return data as DocumentViewRequest
}

export async function getViewRequestForDoc(
  documentId: string,
  requesterId: AdminRole
): Promise<DocumentViewRequest | null> {
  const { data, error } = await supabase
    .from('document_view_requests')
    .select('*')
    .eq('document_id', documentId)
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data as DocumentViewRequest | null
}

export async function getViewRequestsForDocument(
  documentId: string
): Promise<DocumentViewRequest[]> {
  const { data, error } = await supabase
    .from('document_view_requests')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getViewRequestsForDocument error:', error.message)
    return []
  }

  return (data ?? []) as DocumentViewRequest[]
}

export async function getAllPendingViewRequests(): Promise<DocumentViewRequest[]> {
  const { data, error } = await supabase
    .from('document_view_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getAllPendingViewRequests error:', error.message)
    return []
  }

  return (data ?? []) as DocumentViewRequest[]
}

export async function getAllViewRequests(limit = 100): Promise<DocumentViewRequest[]> {
  const { data, error } = await supabase
    .from('document_view_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getAllViewRequests error:', error.message)
    return []
  }

  return (data ?? []) as DocumentViewRequest[]
}

export async function getMyViewRequests(
  requesterId: AdminRole
): Promise<DocumentViewRequest[]> {
  const { data, error } = await supabase
    .from('document_view_requests')
    .select('*')
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getMyViewRequests error:', error.message)
    return []
  }

  return (data ?? []) as DocumentViewRequest[]
}

export async function approveViewRequest(
  requestId: string,
  approvedBy: AdminRole = 'P1'
): Promise<boolean> {
  const { data: request, error: fetchError } = await supabase
    .from('document_view_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    console.error('approveViewRequest fetch error:', fetchError?.message)
    return false
  }

  const now = new Date().toISOString()

  const { error: updateError } = await supabase
    .from('document_view_requests')
    .update({
      status: 'approved',
      reviewed_by: approvedBy,
      reviewed_at: now,
    })
    .eq('id', requestId)

  if (updateError) {
    console.error('approveViewRequest update error:', updateError.message)
    return false
  }

  // Grant visibility — tagged_at/granted_by marks this as a temporary grant
  const { error: visError } = await supabase
    .from('document_visibility')
    .upsert(
      {
        document_id: request.document_id,
        document_type: request.document_type,
        admin_id: request.requester_id,
        can_view: true,
        granted_by: approvedBy,
        granted_at: now,
      },
      { onConflict: 'document_id,document_type,admin_id' }
    )

  if (visError) {
    console.warn('approveViewRequest visibility grant warn:', visError.message)
  }

  logApproveRequest(request.requester_id, request.document_title || request.document_id).catch(() => {})

  return true
}

export async function rejectViewRequest(
  requestId: string,
  rejectedBy: AdminRole = 'P1',
  rejectionReason?: string
): Promise<boolean> {
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('document_view_requests')
    .update({
      status: 'rejected',
      reviewed_by: rejectedBy,
      reviewed_at: now,
      rejection_reason: rejectionReason ?? null,
    })
    .eq('id', requestId)

  if (error) {
    console.error('rejectViewRequest error:', error.message)
    return false
  }

  const { data: rejected } = await supabase
    .from('document_view_requests')
    .select('requester_id, document_title, document_id')
    .eq('id', requestId)
    .maybeSingle()

  if (rejected) {
    logRejectRequest(
      (rejected as any).requester_id,
      (rejected as any).document_title || (rejected as any).document_id,
      rejectionReason
    ).catch(() => {})
  }

  return true
}

// ══════════════════════════════════════════════
// FIX: hasApprovedViewRequest
// Previously this function missed the tagged_admin_access baseline check.
// For master documents, P2-P10 tagged by P1 should always have access
// without needing to submit a view request.
// ══════════════════════════════════════════════
export async function hasApprovedViewRequest(
  documentId: string,
  requesterId: AdminRole
): Promise<boolean> {
  if (roleHasFullAccess(requesterId)) return true

  // Check document_visibility table (covers both permanent baseline and temporary grants)
  const { data: visData } = await supabase
    .from('document_visibility')
    .select('can_view, granted_at, granted_by')
    .eq('document_id', documentId)
    .eq('admin_id', requesterId)
    .eq('can_view', true)
    .maybeSingle()

  if (visData?.can_view) {
    const isTemporaryGrant = !!(visData as any).granted_at && !!(visData as any).granted_by
    // Permanent rows (no grant metadata) are always valid
    if (!isTemporaryGrant) return true
    // Temporary rows valid for 24 hours
    if (isWithin24Hours((visData as any).granted_at)) return true

    // Expired — clean up
    await supabase
      .from('document_visibility')
      .update({ can_view: false })
      .eq('document_id', documentId)
      .eq('admin_id', requesterId)
      .eq('can_view', true)

    return false
  }

  // Fallback: check view request approval status (for docs not using visibility table)
  const { data } = await supabase
    .from('document_view_requests')
    .select('status, reviewed_at')
    .eq('document_id', documentId)
    .eq('requester_id', requesterId)
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return false
  return isWithin24Hours((data as any).reviewed_at)
}

export async function batchCheckViewAccess(
  documentIds: string[],
  requesterId: AdminRole
): Promise<Set<string>> {
  if (roleHasFullAccess(requesterId)) {
    return new Set(documentIds)
  }

  if (documentIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('document_visibility')
    .select('document_id, can_view, granted_at, granted_by')
    .in('document_id', documentIds)
    .eq('admin_id', requesterId)
    .eq('can_view', true)

  if (error) return new Set()

  const allowed = new Set<string>()
  for (const row of (data ?? []) as any[]) {
    if (row.can_view !== true) continue
    const isTemporaryGrant = !!row.granted_at && !!row.granted_by
    if (!isTemporaryGrant || isWithin24Hours(row.granted_at)) {
      allowed.add(row.document_id as string)
    }
  }

  return allowed
}

// ── Permission Helpers ────────────────────────

export function canUpload(role: AdminRole): boolean {
  return role === 'P1'
}

export function canEdit(role: AdminRole): boolean {
  return role === 'P1'
}

export function canArchive(role: AdminRole): boolean {
  return role === 'P1'
}

export function canApproveViewRequests(role: AdminRole): boolean {
  return role === 'P1'
}

export function canViewAll(role: AdminRole): boolean {
  return roleHasFullAccess(role)
}