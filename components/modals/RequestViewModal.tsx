'use client'
// components/modals/RequestViewModal.tsx
// Modal for P2–P10 to request view access to a restricted document

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import {
  submitViewRequest,
  getViewRequestForDoc,
  type DocumentViewRequest,
} from '@/lib/viewRequests'
import type { AdminRole } from '@/lib/auth'

interface RequestViewModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  documentType: string
  documentTitle: string
  onRequestSubmitted?: (req: DocumentViewRequest) => void
}

const STATUS_CONFIG = {
  pending: {
    icon: '⏳',
    label: 'Request Pending',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  approved: {
    icon: '✅',
    label: 'Access Approved',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  rejected: {
    icon: '❌',
    label: 'Request Rejected',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
} as const

export function RequestViewModal({
  open,
  onClose,
  documentId,
  documentType,
  documentTitle,
  onRequestSubmitted,
}: RequestViewModalProps) {
  const { toast } = useToast()
  const { user } = useAuth()

  const [existingRequest, setExistingRequest] = useState<DocumentViewRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    purpose: '',
    reason: '',
  })

  // Load existing request when modal opens
  useEffect(() => {
    if (!open || !user) return

    setLoading(true)
    getViewRequestForDoc(documentId, user.role as AdminRole)
      .then(req => {
        setExistingRequest(req)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, documentId, user])

  function resetForm() {
    setForm({ purpose: '', reason: '' })
    setErrors({})
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.purpose.trim()) errs.purpose = 'Purpose is required.'
    else if (form.purpose.trim().length < 5) errs.purpose = 'Purpose must be at least 5 characters.'
    if (!form.reason.trim()) errs.reason = 'Reason is required.'
    else if (form.reason.trim().length < 10) errs.reason = 'Please provide a more detailed reason (at least 10 characters).'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!user) return
    if (!validate()) return

    setSubmitting(true)
    try {
      const req = await submitViewRequest(
        documentId,
        documentType,
        documentTitle,
        user.role as AdminRole,
        form.purpose.trim(),
        form.reason.trim()
      )

      if (req) {
        setExistingRequest(req)
        toast.success('View request submitted. P1 will review it shortly.')
        onRequestSubmitted?.(req)
        resetForm()
      } else {
        toast.error('Failed to submit request. Please try again.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const cls = (field: string) =>
    `w-full px-3 py-2.5 border-[1.5px] rounded-xl text-sm bg-slate-50 focus:outline-none focus:bg-white transition resize-none ${
      errors[field]
        ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-100'
        : 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
    }`

  return (
    <Modal open={open} onClose={handleClose} title="Request Document Access" width="max-w-md">
      <div className="p-6 space-y-4">

        {/* Document Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Document</p>
          <div className="flex items-center gap-2">
            <span className="text-base">
              {documentType === 'master' ? '📁' : documentType === 'special_order' ? '📋' : '📄'}
            </span>
            <p className="text-sm font-semibold text-slate-800 truncate">{documentTitle}</p>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
            {documentType.replace(/_/g, ' ')} · Restricted Access
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : existingRequest ? (
          /* Show existing request status */
          <div className="space-y-3">
            <div className={`rounded-xl px-4 py-3.5 border ${STATUS_CONFIG[existingRequest.status].bg} ${STATUS_CONFIG[existingRequest.status].border}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{STATUS_CONFIG[existingRequest.status].icon}</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_CONFIG[existingRequest.status].badge}`}>
                  {STATUS_CONFIG[existingRequest.status].label}
                </span>
              </div>
              <p className={`text-xs mt-1.5 ${STATUS_CONFIG[existingRequest.status].text}`}>
                {existingRequest.status === 'pending' &&
                  'Your request is awaiting P1 review. You will be notified once a decision is made.'}
                {existingRequest.status === 'approved' &&
                  'Your request has been approved. You now have view-only access to this document for 24 hours.'}
                {existingRequest.status === 'rejected' &&
                  'Your request was not approved at this time.'}
              </p>
              {existingRequest.rejection_reason && (
                <div className="mt-2 pt-2 border-t border-red-200">
                  <p className="text-[11px] font-semibold text-red-700">Rejection Reason:</p>
                  <p className="text-xs text-red-600 mt-0.5">{existingRequest.rejection_reason}</p>
                </div>
              )}
            </div>

            {/* Show submitted details */}
            <div className="bg-white border border-slate-100 rounded-xl px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Your Submission</p>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Purpose</p>
                <p className="text-xs text-slate-700 mt-0.5">{existingRequest.purpose}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Reason</p>
                <p className="text-xs text-slate-700 mt-0.5">{existingRequest.reason}</p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <p className="text-[10px] text-slate-400">
                  Submitted: {new Date(existingRequest.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {existingRequest.reviewed_by && (
                  <p className="text-[10px] text-slate-400">
                    Reviewed by: {existingRequest.reviewed_by}
                  </p>
                )}
              </div>
            </div>

            {/* Allow re-request if rejected */}
            {existingRequest.status === 'rejected' && (
              <button
                onClick={() => setExistingRequest(null)}
                className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-800 py-2 hover:underline transition"
              >
                Submit a new request →
              </button>
            )}

            <Button variant="outline" onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          /* Request form */
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
              <span className="flex-shrink-0 mt-0.5">🔒</span>
              <span>
                This document requires authorization. Submit a request with your purpose and reason.
                <strong className="block mt-0.5">P1 (Records Officer) will review and approve/reject your request.</strong>
              </span>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Purpose <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={cls('purpose')}
                placeholder="e.g. For audit preparation, compliance review…"
                value={form.purpose}
                onChange={e => {
                  setForm(f => ({ ...f, purpose: e.target.value }))
                  setErrors(p => ({ ...p, purpose: '' }))
                }}
                disabled={submitting}
                maxLength={200}
              />
              {errors.purpose && (
                <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.purpose}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {form.purpose.length}/200 characters
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
                Detailed Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={4}
                className={cls('reason')}
                placeholder="Please explain why you need access to this document and how you will use it…"
                value={form.reason}
                onChange={e => {
                  setForm(f => ({ ...f, reason: e.target.value }))
                  setErrors(p => ({ ...p, reason: '' }))
                }}
                disabled={submitting}
                maxLength={1000}
              />
              {errors.reason && (
                <p className="text-xs text-red-500 mt-1 font-medium">⚠ {errors.reason}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {form.reason.length}/1000 characters
              </p>
            </div>

            {submitting && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-blue-700 font-medium">Submitting your request…</p>
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <Button variant="outline" onClick={handleClose} disabled={submitting} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting} className="flex-1">
                {submitting ? 'Submitting…' : '📨 Submit Request'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}