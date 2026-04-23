'use client'
// components/ui/ViewRequestBell.tsx
// P1-only notification bell for incoming document view requests
// Shows live count badge with real-time Supabase subscription

import { useEffect, useState, useRef } from 'react'
import { Eye, X, Check, ChevronRight } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/components/ui/Toast'
import {
  getAllPendingViewRequests,
  approveViewRequest,
  rejectViewRequest,
  type DocumentViewRequest,
} from '@/lib/viewRequests'
import { supabase } from '@/lib/supabase'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ViewRequestBell() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [pendingRequests, setPendingRequests] = useState<DocumentViewRequest[]>([])
  const [open, setOpen] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isP1 = user?.role === 'P1'

  useEffect(() => {
    if (!isP1) return

    // Initial load
    getAllPendingViewRequests().then(setPendingRequests)

    // Realtime subscription
    const channel = supabase
      .channel('view_request_bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'document_view_requests' },
        (payload) => {
          const newReq = payload.new as DocumentViewRequest
          setPendingRequests(prev => {
            if (prev.find(r => r.id === newReq.id)) return prev
            return [newReq, ...prev]
          })
          toast.info(`📩 New access request from ${newReq.requester_id}`)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'document_view_requests' },
        (payload) => {
          const updated = payload.new as DocumentViewRequest
          // Remove from pending list if no longer pending
          if (updated.status !== 'pending') {
            setPendingRequests(prev => prev.filter(r => r.id !== updated.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isP1]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleApprove(req: DocumentViewRequest, e: React.MouseEvent) {
    e.stopPropagation()
    setProcessingId(req.id)
    const ok = await approveViewRequest(req.id, 'P1')
    if (ok) {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id))
      toast.success(`✅ Access granted to ${req.requester_id}`)
    } else {
      toast.error('Failed to approve request.')
    }
    setProcessingId(null)
  }

  async function handleReject(req: DocumentViewRequest, e: React.MouseEvent) {
    e.stopPropagation()
    setProcessingId(req.id)
    const ok = await rejectViewRequest(req.id, 'P1')
    if (ok) {
      setPendingRequests(prev => prev.filter(r => r.id !== req.id))
      toast.success(`Rejected request from ${req.requester_id}.`)
    } else {
      toast.error('Failed to reject request.')
    }
    setProcessingId(null)
  }

  if (!isP1) return null

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
        title="Document View Requests"
      >
        <Eye size={18} />
        {pendingRequests.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-[#0f1c35] animate-pulse">
            {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-10 bottom-0 z-[200] w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800">View Requests</h3>
              {pendingRequests.length > 0 && (
                <span className="text-[10px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X size={14} />
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-96">
            {pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl mb-2">✅</div>
                <p className="text-sm font-semibold text-slate-600">All clear!</p>
                <p className="text-xs text-slate-400 mt-0.5">No pending view requests</p>
              </div>
            ) : (
              pendingRequests.map(req => {
                const isProcessing = processingId === req.id
                return (
                  <div
                    key={req.id}
                    className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                        {req.requester_id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800">{req.requester_id}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">pending</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                          {req.document_title ?? req.document_id}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          <span className="font-medium">Purpose:</span> {req.purpose}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(req.created_at)}</p>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={e => handleReject(req, e)}
                        disabled={isProcessing}
                        className="flex-1 text-[11px] font-semibold py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <X size={12} /> Reject
                      </button>
                      <button
                        onClick={e => handleApprove(req, e)}
                        disabled={isProcessing}
                        className="flex-1 text-[11px] font-semibold py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {isProcessing ? (
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Approve
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer link */}
          {pendingRequests.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <a
                href="/admin/user-management?tab=view_requests"
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                onClick={() => setOpen(false)}
              >
                View all requests <ChevronRight size={12} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}