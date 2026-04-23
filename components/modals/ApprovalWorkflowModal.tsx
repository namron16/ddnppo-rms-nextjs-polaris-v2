'use client'
// components/modals/ApprovalWorkflowModal.tsx
// Used by PD, DPDA, DPDO to review/approve/reject documents

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import {
  reviewByDPDAorDPDO,
  finalApproveByPD,
  rejectDocument,
  type DocumentApproval,
  type DocType,
} from '@/lib/rbac'

interface Props {
  open: boolean
  onClose: () => void
  documentId: string
  documentType: DocType
  documentTitle: string
  approval: DocumentApproval | null
  onDone?: () => void
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<string, string> = {
  pending:  '⏳ Pending Review',
  reviewed: '👁 Reviewed — Awaiting PD Approval',
  approved: '✅ Approved',
  rejected: '❌ Rejected',
}

export function ApprovalWorkflowModal({
  open, onClose,
  documentId, documentType, documentTitle,
  approval, onDone,
}: Props) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [remarks, setRemarks] = useState('')

  const canReview = user?.role === 'DPDA' || user?.role === 'DPDO'
  const canFinalApprove = user?.role === 'PD'
  const canReject = user?.role === 'PD' || canReview

  const status = approval?.status ?? 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  async function handleReview() {
    if (!user || !canReview) return
    setLoading(true)
    const ok = await reviewByDPDAorDPDO(
      documentId, documentType,
      user.role as 'DPDA' | 'DPDO',
      remarks
    )
    setLoading(false)
    if (ok) {
      toast.success('Document marked as reviewed. PD has been notified.')
      onDone?.()
      onClose()
    } else {
      toast.error('Failed to submit review. Please try again.')
    }
  }

  async function handleApprove() {
    if (!user || !canFinalApprove) return
    setLoading(true)
    const ok = await finalApproveByPD(documentId, documentType)
    setLoading(false)
    if (ok) {
      toast.success('Document approved successfully.')
      onDone?.()
      onClose()
    } else {
      toast.error('Failed to approve document.')
    }
  }

  async function handleReject() {
    if (!user || !rejectReason.trim()) {
      toast.error('Please enter a reason for rejection.')
      return
    }
    setLoading(true)
    const ok = await rejectDocument(documentId, documentType, user.role as any, rejectReason)
    setLoading(false)
    if (ok) {
      toast.success('Document rejected. Uploader has been notified.')
      onDone?.()
      onClose()
    } else {
      toast.error('Failed to reject document.')
    }
  }

  const cls = 'w-full px-3 py-2.5 border-[1.5px] border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-500 focus:bg-white transition resize-none'

  return (
    <Modal open={open} onClose={onClose} title="Document Approval Workflow" width="max-w-md">
      <div className="p-6 space-y-4">

        {/* Document Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Document</p>
          <p className="text-sm font-semibold text-slate-800">{documentTitle}</p>
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{documentType.replace('_', ' ')}</p>
        </div>

        {/* Approval Status */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Approval Status</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-100 rounded-lg">
              <span className="text-xs text-slate-600 font-medium">Status</span>
              <Badge className={STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-500'}>
                {STATUS_LABEL[status] ?? status}
              </Badge>
            </div>
            {approval?.reviewed_by && (
              <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-100 rounded-lg">
                <span className="text-xs text-slate-600 font-medium">Reviewed By</span>
                <span className="text-xs font-bold text-slate-700">{approval.reviewed_by}</span>
              </div>
            )}
            {approval?.review_remarks && (
              <div className="px-3 py-2 bg-white border border-slate-100 rounded-lg">
                <p className="text-xs text-slate-400 mb-0.5">Review Remarks</p>
                <p className="text-xs text-slate-700">{approval.review_remarks}</p>
              </div>
            )}
            {approval?.approved_by && (
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs text-emerald-700 font-medium">Approved By</span>
                <span className="text-xs font-bold text-emerald-700">{approval.approved_by}</span>
              </div>
            )}
            {approval?.rejection_reason && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 font-medium mb-0.5">Rejection Reason</p>
                <p className="text-xs text-red-700">{approval.rejection_reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isApproved && !isRejected && !rejecting && (
          <>
            {canReview && status === 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                    Remarks (optional)
                  </label>
                  <textarea
                    rows={2}
                    className={cls}
                    placeholder="Add review comments…"
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={handleReview} disabled={loading} className="flex-1">
                    {loading ? 'Submitting…' : '✅ Mark as Reviewed'}
                  </Button>
                  <Button variant="danger" onClick={() => setRejecting(true)} disabled={loading}>
                    ❌ Reject
                  </Button>
                </div>
              </div>
            )}

            {canFinalApprove && (status === 'pending' || status === 'reviewed') && (
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleApprove} disabled={loading} className="flex-1">
                  {loading ? 'Approving…' : '✅ Final Approve'}
                </Button>
                <Button variant="danger" onClick={() => setRejecting(true)} disabled={loading}>
                  ❌ Reject
                </Button>
              </div>
            )}
          </>
        )}

        {/* Reject form */}
        {rejecting && !isRejected && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-xs text-red-700 font-semibold">⚠️ Rejecting this document will notify the uploader.</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Reason for Rejection <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                className={cls}
                placeholder="State the reason for rejection…"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejecting(false)} disabled={loading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleReject} disabled={loading || !rejectReason.trim()} className="flex-1">
                {loading ? 'Rejecting…' : '❌ Confirm Rejection'}
              </Button>
            </div>
          </div>
        )}

        <Button variant="outline" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </Modal>
  )
}