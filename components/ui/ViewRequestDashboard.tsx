'use client'
// components/ui/ViewRequestDashboard.tsx
// P1-only real-time dashboard for managing document view requests

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import {
  getAllPendingViewRequests,
  getAllViewRequests,
  approveViewRequest,
  rejectViewRequest,
  type DocumentViewRequest,
  canApproveViewRequests,
} from '@/lib/viewRequests'

// ── Reject Dialog ──────────────────────────────
function RejectDialog({
  request,
  open,
  onClose,
  onReject,
}: {
  request: DocumentViewRequest | null
  open: boolean
  onClose: () => void
  onReject: (id: string, reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (!open) setReason('') }, [open])

  async function submit() {
    if (!request) return
    setLoading(true)
    await onReject(request.id, reason.trim())
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Reject View Request" width="max-w-md">
      <div className="p-6 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-700">Rejecting request from:</p>
          <p className="text-sm font-bold text-red-900 mt-0.5">{request?.requester_id}</p>
          <p className="text-xs text-red-600 truncate mt-0.5">For: {request?.document_title ?? request?.document_id}</p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widests text-slate-500 mb-1.5">
            Rejection Reason <span className="text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2.5 border-[1.5px] border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:border-red-400 focus:bg-white transition resize-none"
            placeholder="e.g. Insufficient justification, contact your supervisor…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">Cancel</Button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-xl transition disabled:opacity-60"
          >
            {loading ? (
              <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Rejecting…</>
            ) : '🚫 Reject'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Request Detail Modal ───────────────────────
function RequestDetailModal({
  request,
  open,
  onClose,
  onApprove,
  onReject,
  processing,
}: {
  request: DocumentViewRequest | null
  open: boolean
  onClose: () => void
  onApprove: (id: string) => Promise<void>
  onReject: (id: string) => void
  processing: boolean
}) {
  if (!request) return null

  const statusConfig = {
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
    approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    rejected: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  }[request.status]

  return (
    <Modal open={open} onClose={onClose} title="View Request Details" width="max-w-md">
      <div className="p-6 space-y-4">

        {/* Status */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${statusConfig.bg} ${statusConfig.border}`}>
          <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wide ${statusConfig.text}`}>
            {request.status}
          </span>
          {request.reviewed_by && (
            <span className={`text-[11px] ml-auto ${statusConfig.text} opacity-70`}>
              by {request.reviewed_by}
            </span>
          )}
        </div>

        {/* Requester + Document */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widests text-slate-400">Requester</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {request.requester_id}
                </div>
                <span className="text-sm font-semibold text-slate-800">{request.requester_id}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widests text-slate-400">Type</p>
              <p className="text-xs text-slate-600 mt-0.5 capitalize">{request.document_type?.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widests text-slate-400">Document</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{request.document_title ?? request.document_id}</p>
          </div>
        </div>

        {/* Purpose & Reason */}
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widests text-slate-400 mb-1">Purpose</p>
            <p className="text-sm text-slate-700">{request.purpose}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widests text-slate-400 mb-1">Detailed Reason</p>
            <p className="text-sm text-slate-700 leading-relaxed">{request.reason}</p>
          </div>
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Submitted: {new Date(request.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {request.reviewed_at && (
            <span>
              Reviewed: {new Date(request.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        {/* Rejection reason */}
        {request.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widests text-red-600 mb-1">Rejection Reason</p>
            <p className="text-xs text-red-700">{request.rejection_reason}</p>
          </div>
        )}

        {/* Actions for pending */}
        {request.status === 'pending' && (
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => onReject(request.id)}
              disabled={processing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 transition disabled:opacity-50"
            >
              🚫 Reject
            </button>
            <button
              onClick={() => onApprove(request.id)}
              disabled={processing}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {processing ? (
                <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Processing…</>
              ) : '✅ Approve'}
            </button>
          </div>
        )}

        {request.status !== 'pending' && (
          <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
        )}
      </div>
    </Modal>
  )
}

// ── Main Dashboard Component ──────────────────

interface ViewRequestDashboardProps {
  /** Compact mode: show as a dropdown/panel rather than full page */
  compact?: boolean
  /** Only show pending */
  pendingOnly?: boolean
}

export function ViewRequestDashboard({
  compact = false,
  pendingOnly = false,
}: ViewRequestDashboardProps) {
  const { toast } = useToast()
  const { user } = useAuth()

  const [requests, setRequests] = useState<DocumentViewRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [newlyArrived, setNewlyArrived] = useState<Set<string>>(new Set())
  const [selectedRequest, setSelectedRequest] = useState<DocumentViewRequest | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<DocumentViewRequest | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const isP1 = user?.role === 'P1'

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = pendingOnly
        ? await getAllPendingViewRequests()
        : await getAllViewRequests(200)
      setRequests(data)
    } catch {
      console.error('Failed to load view requests')
    } finally {
      setLoading(false)
    }
  }, [pendingOnly])

  useEffect(() => {
    if (!isP1) return
    loadRequests()

    // Realtime subscription
    const channel = supabase
      .channel('p1_view_requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'document_view_requests' },
        (payload) => {
          const newReq = payload.new as DocumentViewRequest
          setRequests(prev => {
            if (prev.find(r => r.id === newReq.id)) return prev
            return [newReq, ...prev]
          })
          // Flash highlight for 5 seconds
          setNewlyArrived(prev => new Set(prev).add(newReq.id))
          const timer = setTimeout(() => {
            setNewlyArrived(prev => { const n = new Set(prev); n.delete(newReq.id); return n })
            highlightTimers.current.delete(newReq.id)
          }, 5000)
          highlightTimers.current.set(newReq.id, timer)

          toast.info(`📩 New view request from ${newReq.requester_id} for "${newReq.document_title ?? 'a document'}"`)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'document_view_requests' },
        (payload) => {
          const updated = payload.new as DocumentViewRequest
          setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
        }
      )
      .subscribe(status => setRealtimeConnected(status === 'SUBSCRIBED'))

    return () => {
      supabase.removeChannel(channel)
      highlightTimers.current.forEach(t => clearTimeout(t))
      highlightTimers.current.clear()
    }
  }, [isP1, loadRequests]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove(requestId: string) {
    setProcessingId(requestId)
    try {
      const ok = await approveViewRequest(requestId, 'P1')
      if (ok) {
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved' as const, reviewed_by: 'P1', reviewed_at: new Date().toISOString() } : r))
        toast.success('View request approved. User now has access.')
        setDetailOpen(false)
      } else {
        toast.error('Failed to approve request.')
      }
    } catch {
      toast.error('Failed to approve request.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(requestId: string, reason: string) {
    setProcessingId(requestId)
    try {
      const ok = await rejectViewRequest(requestId, 'P1', reason || undefined)
      if (ok) {
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'rejected' as const, reviewed_by: 'P1', reviewed_at: new Date().toISOString(), rejection_reason: reason || undefined } : r))
        toast.success('View request rejected.')
        setDetailOpen(false)
        setRejectOpen(false)
      } else {
        toast.error('Failed to reject request.')
      }
    } catch {
      toast.error('Failed to reject request.')
    } finally {
      setProcessingId(null)
    }
  }

  // Filter requests
  const filteredRequests = requests.filter(r => {
    if (pendingOnly) return r.status === 'pending'
    if (statusFilter === 'all') return true
    return r.status === statusFilter
  })

  const pendingCount = requests.filter(r => r.status === 'pending').length

  if (!isP1) return null

  const statusBadge = (status: DocumentViewRequest['status']) => {
    const cfg = {
      pending: 'bg-amber-100 text-amber-700 border border-amber-200',
      approved: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      rejected: 'bg-red-100 text-red-700 border border-red-200',
    }[status]
    const icon = { pending: '⏳', approved: '✅', rejected: '🚫' }[status]
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg}`}>
        {icon} {status}
      </span>
    )
  }

  return (
    <>
      <div className="space-y-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-800">
              Document View Requests
            </h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center px-2.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                {pendingCount} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Realtime indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${realtimeConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {realtimeConnected ? 'Live' : 'Connecting…'}
            </div>
            <button
              onClick={loadRequests}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 hover:bg-slate-100 rounded-lg transition"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Status Filter Tabs */}
        {!pendingOnly && (
          <div className="flex items-center gap-1 mb-4 bg-slate-100 rounded-xl p-1">
            {(['pending', 'approved', 'rejected', 'all'] as const).map(s => {
              const count = s === 'all' ? requests.length : requests.filter(r => r.status === s).length
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    statusFilter === s
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'pending' && '⏳'}
                  {s === 'approved' && '✅'}
                  {s === 'rejected' && '🚫'}
                  {s === 'all' && '📋'}
                  <span className="capitalize">{s}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === s ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Requests List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl mb-3">
              {statusFilter === 'pending' ? '✅' : '📭'}
            </div>
            <p className="text-sm font-semibold text-slate-600">
              {statusFilter === 'pending' ? 'No pending requests' : `No ${statusFilter} requests`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {statusFilter === 'pending'
                ? 'All view requests have been reviewed.'
                : 'Requests will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRequests.map(req => {
              const isNew = newlyArrived.has(req.id)
              const isProcessing = processingId === req.id
              return (
                <div
                  key={req.id}
                  className={`flex items-start gap-3 px-4 py-3.5 bg-white border rounded-xl transition-all duration-500 cursor-pointer hover:shadow-sm group ${
                    isNew
                      ? 'border-blue-400 shadow-md bg-blue-50/40 ring-2 ring-blue-200'
                      : req.status === 'pending'
                        ? 'border-amber-200 hover:border-amber-300'
                        : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => {
                    setSelectedRequest(req)
                    setDetailOpen(true)
                  }}
                >
                  {/* Requester avatar */}
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {req.requester_id}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">{req.requester_id}</span>
                      {statusBadge(req.status)}
                      {isNew && (
                        <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      📄 {req.document_title ?? req.document_id}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      <span className="font-medium">Purpose:</span> {req.purpose}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(req.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Quick actions (pending only) */}
                  {req.status === 'pending' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setRejectTarget(req)
                          setRejectOpen(true)
                        }}
                        disabled={isProcessing}
                        className="text-[11px] font-bold px-2 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                      >
                        🚫
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleApprove(req.id)
                        }}
                        disabled={isProcessing}
                        className="text-[11px] font-bold px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        {isProcessing ? '…' : '✅'}
                      </button>
                    </div>
                  )}

                  {/* Chevron */}
                  <span className="text-slate-300 group-hover:text-slate-500 transition flex-shrink-0 text-sm">›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <RequestDetailModal
        request={selectedRequest}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onApprove={handleApprove}
        onReject={(id) => {
          const req = requests.find(r => r.id === id)
          if (req) { setRejectTarget(req); setRejectOpen(true) }
        }}
        processing={!!processingId}
      />

      {/* Reject Dialog */}
      <RejectDialog
        request={rejectTarget}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleReject}
      />
    </>
  )
}