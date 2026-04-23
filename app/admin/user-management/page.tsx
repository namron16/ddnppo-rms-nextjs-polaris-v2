'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useSearch, useDisclosure } from '@/hooks'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase'
import { ADMIN_ACCOUNTS, useAuth } from '@/lib/auth'
import {
  getAllAdminPresence,
  type AdminPresence,
} from '@/lib/accessRequests'
import {
  getAllViewRequests,
  approveViewRequest,
  rejectViewRequest,
  type DocumentViewRequest,
} from '@/lib/viewRequests'

function PresenceDot({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function RejectDocAccessModal({
  request, open, onClose, onReject,
}: {
  request: DocumentViewRequest | null
  open: boolean
  onClose: () => void
  onReject: (id: string, reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  async function submit() {
    if (!request) return
    setLoading(true)
    await onReject(request.id, reason.trim())
    setLoading(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Reject Document Access Request" width="max-w-md">
      <div className="p-6 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-700 font-semibold">Requester: <span className="text-amber-900">{request?.requester_id}</span></p>
          <p className="text-xs text-amber-600 mt-0.5">Document ID: {request?.document_id}</p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Reason</label>
          <textarea
            rows={3}
            className="w-full px-3 py-2.5 border-[1.5px] border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:border-red-400 focus:bg-white transition resize-none"
            placeholder="State the reason for rejection…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <button
            onClick={submit}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition disabled:opacity-60"
          >
            {loading ? 'Rejecting…' : '🚫 Reject'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DocumentAccessSection() {
  const { toast } = useToast()
  const { user } = useAuth()
  const rejectDocDisc = useDisclosure<DocumentViewRequest>()
  const [docAccessRequests, setDocAccessRequests] = useState<DocumentViewRequest[]>([])
  const [loadingDocAccess, setLoadingDocAccess] = useState(true)
  const [processingDocReq, setProcessingDocReq] = useState<string | null>(null)

  const canReviewDocAccess = user?.role === 'P1'

  const loadDocAccessRequests = useCallback(async () => {
    setLoadingDocAccess(true)
    const data = await getAllViewRequests(300)
    setDocAccessRequests(data)
    setLoadingDocAccess(false)
  }, [])

  useEffect(() => {
    void loadDocAccessRequests()

    const channel = supabase
      .channel('doc_access_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'document_view_requests' }, () => {
        void loadDocAccessRequests()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'document_view_requests' }, () => {
        void loadDocAccessRequests()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDocAccessRequests])

  async function handleDocAccessApprove(requestId: string) {
    if (!user || user.role !== 'P1') return
    setProcessingDocReq(requestId)
    const ok = await approveViewRequest(requestId, 'P1')
    if (ok) {
      toast.success('Document access granted for 24 hours.')
      await loadDocAccessRequests()
    } else {
      toast.error('Failed to approve access.')
    }
    setProcessingDocReq(null)
  }

  async function handleDocAccessReject(requestId: string, reason: string) {
    if (!user || user.role !== 'P1') return
    setProcessingDocReq(requestId)
    const ok = await rejectViewRequest(requestId, 'P1', reason)
    if (ok) {
      toast.success('Access request rejected.')
      await loadDocAccessRequests()
    } else {
      toast.error('Failed to reject request.')
    }
    setProcessingDocReq(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: docAccessRequests.filter(r => r.status === 'pending').length, icon: '⏳', bg: 'bg-amber-50', num: 'text-amber-700' },
          { label: 'Approved', value: docAccessRequests.filter(r => r.status === 'approved').length, icon: '✅', bg: 'bg-emerald-50', num: 'text-emerald-700' },
          { label: 'Rejected', value: docAccessRequests.filter(r => r.status === 'rejected').length, icon: '🚫', bg: 'bg-red-50', num: 'text-red-700' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <div className={`text-2xl font-extrabold ${s.num}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Document Access Requests</h3>
          <button onClick={loadDocAccessRequests} className="text-xs text-slate-500 hover:text-slate-700 font-medium">🔄 Refresh</button>
        </div>

        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-800 font-medium">Approved requests are valid for 24 hours only and grant view-only access.</p>
        </div>

        {loadingDocAccess ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : docAccessRequests.length === 0 ? (
          <EmptyState icon="🔐" title="No document access requests" description="When P2–P10 users request access to restricted documents, they'll appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Requester', 'Document', 'Document Type', 'Status', 'Reviewed By', 'Approved Until', 'Submitted', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widests text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docAccessRequests.map(req => {
                  const account = ADMIN_ACCOUNTS.find(a => a.id === req.requester_id)
                  return (
                    <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {account && <Avatar initials={account.initials} color={account.avatarColor} size="sm" />}
                          <div>
                            <p className="font-semibold text-sm text-slate-800">{req.requester_id}</p>
                            <p className="text-[11px] text-slate-400">{account?.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-[280px]">{req.document_title ?? req.document_id}</p>
                        <p className="text-[11px] text-slate-400">{req.document_id}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge className="bg-slate-100 text-slate-600">{req.document_type}</Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                          req.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          {req.status === 'pending' ? '⏳' : req.status === 'approved' ? '✅' : '🚫'} {req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500">{req.reviewed_by ?? '—'}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {req.status === 'approved' && req.reviewed_at
                          ? new Date(new Date(req.reviewed_at).getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {new Date(req.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5">
                        {req.status === 'pending' && canReviewDocAccess && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDocAccessApprove(req.id)}
                              disabled={processingDocReq === req.id}
                              className="text-[11px] font-bold px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                            >
                              {processingDocReq === req.id ? '…' : '✅ Approve'}
                            </button>
                            <button
                              onClick={() => rejectDocDisc.open(req)}
                              disabled={processingDocReq === req.id}
                              className="text-[11px] font-bold px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                            >
                              🚫 Reject
                            </button>
                          </div>
                        )}
                        {req.status !== 'pending' && (
                          <span className="text-xs text-slate-400">
                            {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RejectDocAccessModal
        request={rejectDocDisc.payload ?? null}
        open={rejectDocDisc.isOpen}
        onClose={rejectDocDisc.close}
        onReject={handleDocAccessReject}
      />
    </div>
  )
}

export default function UserManagementPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'accounts' | 'doc_access'>('accounts')
  const [presence, setPresence] = useState<Map<string, AdminPresence>>(new Map())
  const [loadingPresence, setLoadingPresence] = useState(true)
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  const { query, setQuery, filtered } = useSearch(ADMIN_ACCOUNTS, ['name', 'role', 'title'] as any)
  const activeCount = [...presence.values()].filter(p => p.is_active).length

  const loadPresence = useCallback(async () => {
    setLoadingPresence(true)
    const data = await getAllAdminPresence()
    const map = new Map<string, AdminPresence>()
    data.forEach(p => map.set(p.admin_id, p))
    setPresence(map)
    setLoadingPresence(false)
  }, [])

  useEffect(() => {
    void loadPresence()

    const presenceChannel = supabase
      .channel('admin_presence_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_presence' }, () => {
        void loadPresence()
      })
      .subscribe(status => setRealtimeConnected(status === 'SUBSCRIBED'))

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [loadPresence])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'doc_access' || tab === 'view_requests') {
      setActiveTab('doc_access')
    }
  }, [searchParams])

  const roleLevelColor: Record<string, string> = {
    head: 'bg-red-100 text-red-700',
    deputy: 'bg-amber-100 text-amber-700',
    super_admin: 'bg-violet-100 text-violet-700',
    viewer: 'bg-blue-100 text-blue-700',
  }

  return (
    <>
      <PageHeader title="User Management" />

      <div className="p-8 space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition border-[1.5px] ${
              activeTab === 'accounts'
                ? 'bg-white border-blue-500 text-blue-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            👥 Admin Accounts
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {activeCount} online
            </span>
          </button>

          <button
            onClick={() => setActiveTab('doc_access')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition border-[1.5px] relative ${
              activeTab === 'doc_access'
                ? 'bg-white border-blue-500 text-blue-700 shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            🔐 Document Access Requests
          </button>

          <div className="ml-auto">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${realtimeConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {realtimeConnected ? 'Live' : 'Connecting…'}
            </div>
          </div>
        </div>

        {activeTab === 'accounts' && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Accounts', value: ADMIN_ACCOUNTS.length, icon: '👥', bg: 'bg-blue-50', num: 'text-blue-700' },
                { label: 'Online Now', value: activeCount, icon: '🟢', bg: 'bg-emerald-50', num: 'text-emerald-700' },
                { label: 'Offline', value: ADMIN_ACCOUNTS.length - activeCount, icon: '⚫', bg: 'bg-slate-50', num: 'text-slate-600' },
                { label: 'Full Access', value: 4, icon: '🔓', bg: 'bg-violet-50', num: 'text-violet-700' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3`}>
                  <span className="text-2xl">{s.icon}</span>
                  <div>
                    <div className={`text-2xl font-extrabold ${s.num}`}>{s.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <SearchInput value={query} onChange={setQuery} placeholder="Search accounts…" className="max-w-xs flex-1" />
                <span className="text-xs text-slate-400 ml-auto">
                  {ADMIN_ACCOUNTS.length} hardcoded accounts · no public registration
                </span>
              </div>

              {loadingPresence ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState icon="👥" title="No users found" description="Try a different search term." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Account', 'Role', 'Level', 'Permissions', 'Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widests text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(filtered as typeof ADMIN_ACCOUNTS).map(account => {
                        const p = presence.get(account.id)
                        const isActive = p?.is_active ?? false
                        return (
                          <tr key={account.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="relative">
                                  <Avatar initials={account.initials} color={account.avatarColor} size="sm" />
                                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                </div>
                                <div>
                                  <span className="font-semibold text-sm text-slate-800">{account.name}</span>
                                  <p className="text-[11px] text-slate-400">{account.id.toLowerCase()}@ddnppo.gov.ph</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge className="bg-slate-100 text-slate-700 font-bold">{account.role}</Badge>
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge className={roleLevelColor[account.level] ?? 'bg-slate-100 text-slate-500'}>
                                {account.level.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {account.permissions.canUpload && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Upload</span>}
                                {account.permissions.canApproveReview && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Review</span>}
                                {account.permissions.canApproveFinal && <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Final Approve</span>}
                                {account.permissions.canViewAll && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Full View</span>}
                                {!account.permissions.canUpload && !account.permissions.canApproveReview && !account.permissions.canApproveFinal && (
                                  <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">View Only</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <PresenceDot isActive={isActive} />
                              {p?.last_seen && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {isActive ? 'Online now' : `Last: ${new Date(p.last_seen).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`}
                                </p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-[11px] text-slate-400">
                  🔒 These are hardcoded admin accounts. No account creation or deletion is available. Passwords are managed by the system administrator.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doc_access' && <DocumentAccessSection />}
      </div>
    </>
  )
}
