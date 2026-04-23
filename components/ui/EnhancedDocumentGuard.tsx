'use client'
// components/ui/EnhancedDocumentGuard.tsx
// Clean single-overlay restricted document view

import { useEffect, useState, useCallback } from 'react'
import { Lock, Clock, RotateCcw } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/components/ui/Toast'
import { RequestViewModal } from '@/components/modals/RequestViewModal'
import {
  roleHasFullAccess,
  roleNeedsViewRequest,
  type DocumentViewRequest,
} from '@/lib/viewRequests'
import { canAdminViewDocument, type DocType } from '@/lib/rbac'
import { supabase } from '@/lib/supabase'
import type { AdminRole } from '@/lib/auth'

interface EnhancedDocumentGuardProps {
  documentId: string
  documentType: string
  documentTitle: string
  children: React.ReactNode
  canView?: boolean
  compact?: boolean
}

export function EnhancedDocumentGuard({
  documentId,
  documentType,
  documentTitle,
  children,
  canView: preloadedCanView,
  compact = false,
}: EnhancedDocumentGuardProps) {
  const { user } = useAuth()
  const [canView, setCanView] = useState<boolean | null>(
    preloadedCanView === true ? true : null
  )
  const [existingRequest, setExistingRequest] = useState<DocumentViewRequest | null>(null)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(canView === null)

  const checkAccess = useCallback(async () => {
    if (!user) { setCanView(false); setCheckingAccess(false); return }

    if (roleHasFullAccess(user.role as AdminRole)) {
      setCanView(true)
      setCheckingAccess(false)
      return
    }

    const hasAccess = await canAdminViewDocument(
      user.role as AdminRole,
      documentId,
      documentType as DocType
    )
    setCanView(hasAccess)

    if (!hasAccess && roleNeedsViewRequest(user.role as AdminRole)) {
      try {
        const { data } = await supabase
          .from('document_view_requests')
          .select('*')
          .eq('document_id', documentId)
          .eq('requester_id', user.role)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data && data.status !== 'approved') {
          setExistingRequest(data as DocumentViewRequest)
        }
      } catch {
        // ignore
      }
    }

    setCheckingAccess(false)
  }, [user, documentId, documentType])

  useEffect(() => {
    if (preloadedCanView === true) {
      setCanView(true)
      setCheckingAccess(false)
      return
    }
    checkAccess()
  }, [preloadedCanView, checkAccess])

  // Real-time updates
  useEffect(() => {
    if (!user || roleHasFullAccess(user.role as AdminRole)) return
    if (canView) return

    const channel = supabase
      .channel(`doc_guard_${documentId}_${user.role}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'document_view_requests',
        filter: `document_id=eq.${documentId}`,
      }, (payload) => {
        const updated = payload.new as DocumentViewRequest
        if (updated.requester_id === user.role && updated.status === 'approved') {
          checkAccess()
        } else if (updated.requester_id === user.role) {
          setExistingRequest(updated)
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'document_visibility',
        filter: `document_id=eq.${documentId}`,
      }, (payload) => {
        const row = payload.new as any
        if (row.admin_id === user.role && row.can_view) {
          setCanView(true)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, documentId, canView, checkAccess])

  if (checkingAccess) {
    if (compact) {
      return <span className="animate-pulse bg-slate-200 rounded h-4 w-24 inline-block" />
    }
    return <div className="animate-pulse bg-slate-100 rounded-lg h-20 w-full" />
  }

  if (canView) return <>{children}</>

  const needsRequest = !!(user && roleNeedsViewRequest(user.role as AdminRole))

  if (compact) {
    return (
      <>
        <CompactGuard
          documentId={documentId}
          documentType={documentType}
          documentTitle={documentTitle}
          existingRequest={existingRequest}
          requestModalOpen={requestModalOpen}
          onRequestClick={() => setRequestModalOpen(true)}
          onRequestModalClose={() => setRequestModalOpen(false)}
          onRequestSubmitted={(req) => {
            setExistingRequest(req)
            setRequestModalOpen(false)
          }}
          needsRequest={needsRequest}
        >
          {children}
        </CompactGuard>
      </>
    )
  }

  return (
    <>
      <FullGuard
        documentId={documentId}
        documentType={documentType}
        documentTitle={documentTitle}
        existingRequest={existingRequest}
        requestModalOpen={requestModalOpen}
        onRequestClick={() => setRequestModalOpen(true)}
        onRequestModalClose={() => setRequestModalOpen(false)}
        onRequestSubmitted={(req) => {
          setExistingRequest(req)
          setRequestModalOpen(false)
        }}
        needsRequest={needsRequest}
      >
        {children}
      </FullGuard>
    </>
  )
}

// ── Shared props ──────────────────────────────

interface GuardProps {
  documentId: string
  documentType: string
  documentTitle: string
  existingRequest: DocumentViewRequest | null
  requestModalOpen: boolean
  onRequestClick: () => void
  onRequestModalClose: () => void
  onRequestSubmitted: (req: DocumentViewRequest) => void
  needsRequest: boolean
  children: React.ReactNode
}

// ── Full overlay guard ─────────────────────────
// Structure:
//   1. Document header (ALWAYS VISIBLE — no blur)
//   2. Preview area with blur + single centered overlay

function FullGuard({
  documentId,
  documentType,
  documentTitle,
  existingRequest,
  requestModalOpen,
  onRequestClick,
  onRequestModalClose,
  onRequestSubmitted,
  needsRequest,
  children,
}: GuardProps) {
  const status = existingRequest?.status

  const overlayBg =
    status === 'pending'
      ? { bg: '#fef3c7', border: '#fbbf24', icon: <Clock size={24} className="text-amber-500" />, label: 'linear-gradient(135deg, #fef3c7, #fde68a)' }
      : status === 'rejected'
      ? { bg: '#fee2e2', border: '#f87171', icon: <Lock size={24} className="text-red-500" />, label: 'linear-gradient(135deg, #fee2e2, #fecaca)' }
      : { bg: '#eff6ff', border: '#93c5fd', icon: <Lock size={24} className="text-blue-500" />, label: 'linear-gradient(135deg, #eff6ff, #dbeafe)' }

  const title =
    status === 'pending' ? 'Access Request Pending'
    : status === 'rejected' ? 'Access Request Rejected'
    : 'Restricted Document'

  const message =
    status === 'pending'
      ? 'Your request is awaiting approval from the Records Officer (P1).'
      : status === 'rejected'
      ? existingRequest?.rejection_reason || 'Your access request was not approved. You may submit a new request.'
      : 'You do not have permission to view this document.'

  return (
    <>
      {/* ─── Step 1: ALWAYS-VISIBLE document header ─── */}
      <div className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            <Lock size={15} />
          </span>
          <p className="text-sm font-semibold text-slate-700 truncate">
            {documentTitle}
          </p>
          <span className="ml-auto flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
            Restricted
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5 ml-6 capitalize">
          {documentType.replace(/_/g, ' ')}
        </p>
      </div>

      {/* ─── Step 2: Preview area with single blur + single overlay ─── */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{ minHeight: '260px' }}
      >
        {/* Single blurred content layer */}
        <div
          aria-hidden="true"
          style={{
            filter: 'blur(7px)',
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            opacity: 0.4,
            minHeight: '260px',
          }}
        >
          {children}
        </div>

        {/* Single full-cover overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: 'rgba(255,255,255,0.55)',
            backdropFilter: 'blur(1px)',
            zIndex: 10,
          }}
        >
          <div
            className="animate-fade-up flex flex-col items-center text-center"
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '28px 32px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
              maxWidth: '340px',
              width: '90%',
              border: '1px solid rgba(226,232,240,0.9)',
            }}
          >
            {/* Icon */}
            <div
              className="mb-4 flex items-center justify-center rounded-2xl"
              style={{
                width: '56px',
                height: '56px',
                background: overlayBg.label,
                border: `1.5px solid ${overlayBg.border}`,
              }}
            >
              {overlayBg.icon}
            </div>

            {/* Title */}
            <h3 className="text-[15px] font-bold text-slate-800 mb-1.5 leading-snug">
              {title}
            </h3>

            {/* Message */}
            <p className="text-[12px] text-slate-500 mb-4 leading-relaxed">
              {message}
            </p>

            {/* CTA */}
            {needsRequest && !status && (
              <button
                onClick={onRequestClick}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-bold py-2.5 px-4 rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Lock size={14} />
                Request Access
              </button>
            )}

            {status === 'pending' && (
              <div
                className="flex items-center justify-center gap-2 text-[12px] font-semibold py-2 px-4 rounded-xl w-full"
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #fde68a',
                }}
              >
                <Clock size={13} />
                Awaiting Review
              </div>
            )}

            {status === 'rejected' && needsRequest && (
              <button
                onClick={onRequestClick}
                className="w-full flex items-center justify-center gap-2 text-[13px] font-bold py-2.5 px-4 rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={13} />
                Submit New Request
              </button>
            )}

            {!needsRequest && !status && (
              <p className="text-[11px] text-slate-400 mt-1">
                Contact P1 Records Officer for access
              </p>
            )}
          </div>
        </div>
      </div>

      {needsRequest && (
        <RequestViewModal
          open={requestModalOpen}
          onClose={onRequestModalClose}
          documentId={documentId}
          documentType={documentType}
          documentTitle={documentTitle}
          onRequestSubmitted={onRequestSubmitted}
        />
      )}
    </>
  )
}

// ── Compact inline guard ───────────────────────

function CompactGuard({
  documentId,
  documentType,
  documentTitle,
  existingRequest,
  requestModalOpen,
  onRequestClick,
  onRequestModalClose,
  onRequestSubmitted,
  needsRequest,
  children,
}: GuardProps) {
  const status = existingRequest?.status

  return (
    <>
      <span className="relative inline-flex items-center gap-1.5 group">
        {/* Single blurred span wrapping all children */}
        <span
          style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}
          aria-hidden="true"
        >
          {children}
        </span>

        {/* Lock indicator */}
        <span className="inline-flex items-center gap-1 flex-shrink-0">
          <Lock size={11} className="text-slate-400" />
        </span>

        {/* Action button */}
        {needsRequest && !status && (
          <button
            type="button"
            onClick={onRequestClick}
            className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(37,99,235,0.3)',
            }}
          >
            Request
          </button>
        )}

        {status === 'pending' && (
          <span
            className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
          >
            <Clock size={10} />
            Pending
          </span>
        )}

        {status === 'rejected' && needsRequest && (
          <button
            type="button"
            onClick={onRequestClick}
            className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition hover:opacity-80"
            style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', cursor: 'pointer' }}
          >
            <RotateCcw size={10} />
            Retry
          </button>
        )}

        {/* Hover tooltip */}
        <span className="absolute left-0 top-full mt-2 z-50 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none">
          <span
            className="block text-[11px] font-medium px-3 py-2 rounded-xl shadow-xl whitespace-nowrap"
            style={{
              background: '#0f172a',
              color: 'white',
              maxWidth: '220px',
              lineHeight: '1.4',
            }}
          >
            {status === 'pending'
              ? '⏳ Access request is pending P1 review'
              : status === 'rejected'
              ? '❌ Access denied — you can submit a new request'
              : needsRequest
              ? '🔒 Click Request to ask P1 for access'
              : '🔒 Restricted — contact P1 for access'}
            <span
              style={{
                display: 'block',
                position: 'absolute',
                top: '-4px',
                left: '12px',
                width: '8px',
                height: '8px',
                background: '#0f172a',
                transform: 'rotate(45deg)',
              }}
            />
          </span>
        </span>
      </span>

      {needsRequest && (
        <RequestViewModal
          open={requestModalOpen}
          onClose={onRequestModalClose}
          documentId={documentId}
          documentType={documentType}
          documentTitle={documentTitle}
          onRequestSubmitted={onRequestSubmitted}
        />
      )}
    </>
  )
}