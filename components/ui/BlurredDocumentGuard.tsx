'use client'
// components/ui/BlurredDocumentGuard.tsx  (v3)
// Wraps document content — blurs for unauthorized P2–P10 roles
// Full access: PD, DPDA, DPDO, P1
// Tag-controlled: P2–P10
// Adds "Request Access" button for restricted P2–P10 users

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { canAdminViewDocument, type DocType } from '@/lib/rbac'
import { hasFullDocumentAccess } from '@/lib/permissions'
import {
  requestDocumentAccess,
  getAccessRequestStatus,
  type DocumentAccessRequest,
} from '@/lib/accessRequests'
import { useToast } from './Toast'
import type { AdminRole } from '@/lib/auth'

// ── Main Guard ────────────────────────────────

interface BlurredDocumentGuardProps {
  documentId: string
  documentType: DocType
  children: React.ReactNode
  canView?: boolean
  compact?: boolean
  taggedRoles?: AdminRole[]
}

export function BlurredDocumentGuard({
  documentId,
  documentType,
  children,
  canView: preloadedCanView,
  compact = false,
  taggedRoles,
}: BlurredDocumentGuardProps) {
  const { user } = useAuth()
  const [canView, setCanView] = useState<boolean | null>(
    preloadedCanView !== undefined ? preloadedCanView : null
  )

  useEffect(() => {
    if (preloadedCanView !== undefined) { setCanView(preloadedCanView); return }
    if (!user) { setCanView(false); return }
    if (hasFullDocumentAccess(user.role)) { setCanView(true); return }
    canAdminViewDocument(user.role as AdminRole, documentId, documentType).then(setCanView)
  }, [user, documentId, documentType, preloadedCanView])

  if (canView === null) {
    return <div className="animate-pulse bg-slate-100 rounded-lg h-8 w-full" />
  }

  if (canView) return <>{children}</>

  return (
    <RestrictedOverlay
      compact={compact}
      taggedRoles={taggedRoles}
      documentId={documentId}
      documentType={documentType}
    >
      {children}
    </RestrictedOverlay>
  )
}

// ── Restricted Overlay ────────────────────────

function RestrictedOverlay({
  children,
  compact,
  documentId,
  documentType,
}: {
  children: React.ReactNode
  compact?: boolean
  taggedRoles?: AdminRole[]
  documentId: string
  documentType: DocType
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [showTooltip, setShowTooltip] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [accessRequest, setAccessRequest] = useState<DocumentAccessRequest | null>(null)
  const [loadingRequest, setLoadingRequest] = useState(true)

  const isViewerRole = user && ['P2','P3','P4','P5','P6','P7','P8','P9','P10'].includes(user.role)

  // Load existing request status
  useEffect(() => {
    if (!user || !isViewerRole) { setLoadingRequest(false); return }
    getAccessRequestStatus(documentId, user.role as AdminRole)
      .then(req => { setAccessRequest(req); setLoadingRequest(false) })
  }, [user, documentId, isViewerRole])

  const handleRequestAccess = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user || !isViewerRole) return
    setRequesting(true)
    try {
      const req = await requestDocumentAccess(documentId, documentType, user.role as AdminRole)
      if (req) {
        setAccessRequest(req)
        toast.success('Access request submitted. DPDA and DPDO have been notified.')
      } else {
        toast.error('Failed to submit request. Please try again.')
      }
    } finally {
      setRequesting(false)
    }
  }, [user, isViewerRole, documentId, documentType, toast])

  const requestStatusBadge = () => {
    if (!accessRequest) return null
    if (accessRequest.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Request Pending
        </span>
      )
    }
    if (accessRequest.status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
          ❌ Request Rejected
        </span>
      )
    }
    return null
  }

  if (compact) {
    return (
      <span
        className="relative inline-flex items-center gap-1 group"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span
          className="select-none"
          style={{ filter: 'blur(3.5px)', pointerEvents: 'none', userSelect: 'none' }}
        >
          {children}
        </span>
        <span className="flex-shrink-0 ml-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        {showTooltip && (
          <div className="absolute left-0 top-full mt-1.5 z-50 bg-slate-900 text-white text-[11px] font-medium px-3 py-2 rounded-lg shadow-xl whitespace-nowrap pointer-events-none" style={{ maxWidth: 220 }}>
            <p className="font-bold mb-1">🔒 Restricted Document</p>
            <p className="text-slate-300 text-[10px] leading-snug">You don't have permission to view this document.</p>
          </div>
        )}
      </span>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden group">
      {/* Blurred background */}
      <div
        aria-hidden="true"
        style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none', opacity: 0.6 }}
      >
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/25 backdrop-blur-[1px] rounded-xl">
        <div className="flex flex-col items-center text-center bg-white/95 backdrop-blur-sm px-5 py-4 rounded-2xl shadow-xl border border-slate-200/80 max-w-[240px] gap-2.5">
          {/* Lock icon */}
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <p className="text-[13px] font-extrabold text-slate-800 leading-tight">Restricted Document</p>
          <p className="text-[11px] text-slate-500 leading-snug">You do not have permission to view this file.</p>

          {/* Request status or button */}
          {loadingRequest ? (
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          ) : accessRequest?.status === 'pending' ? (
            requestStatusBadge()
          ) : accessRequest?.status === 'rejected' ? (
            <div className="space-y-1.5 w-full">
              {requestStatusBadge()}
              {accessRequest.rejection_reason && (
                <p className="text-[10px] text-slate-400 leading-snug">{accessRequest.rejection_reason}</p>
              )}
            </div>
          ) : isViewerRole ? (
            <button
              onClick={handleRequestAccess}
              disabled={requesting}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {requesting ? (
                <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Requesting…</>
              ) : (
                <>📨 Request Access</>
              )}
            </button>
          ) : (
            <div className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-[10px] text-amber-700 font-medium">Contact P1 to request access</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Approval Status Badge ─────────────────────

import type { DocumentApproval } from '@/lib/rbac'

interface ApprovalBadgeProps {
  approval: DocumentApproval | null
  compact?: boolean
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: '⏳ Pending Review',          bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  reviewed: { label: '👁 Awaiting Final Approval', bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  approved: { label: '✅ Approved',                 bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: '❌ Rejected',                 bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
}

export function ApprovalStatusBadge({ approval, compact = false }: ApprovalBadgeProps) {
  if (!approval) return null
  const cfg = STATUS_CONFIG[approval.status]
  if (!cfg) return null

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {approval.status.toUpperCase()}
      </span>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${cfg.bg}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
      {approval.reviewed_by && (
        <span className={`text-[11px] ${cfg.text} opacity-70 ml-auto`}>by {approval.reviewed_by}</span>
      )}
    </div>
  )
}