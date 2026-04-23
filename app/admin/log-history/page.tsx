'use client'
// app/admin/log-history/page.tsx — Functional audit log with real-time updates

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageHeader }  from '@/components/ui/PageHeader'
import { Avatar }      from '@/components/ui/Avatar'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState }  from '@/components/ui/EmptyState'
import { ToolbarSelect } from '@/components/ui/Toolbar'
import { useToast }    from '@/components/ui/Toast'
import { supabase }    from '@/lib/supabase'
import { ADMIN_ACCOUNTS } from '@/lib/auth'
import type { AdminRole } from '@/lib/auth'
import type { LogActionType } from '@/lib/adminLogger'

// ── Types ─────────────────────────────────────
interface AdminLog {
  id: string
  admin_id: AdminRole
  action: LogActionType
  description: string
  created_at: string
}

// ── Constants ─────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; icon: string; badgeCls: string }> = {
  login:            { label: 'Login',            icon: '🟢', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  logout:           { label: 'Logout',           icon: '🔴', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
  view_document:    { label: 'View',             icon: '🔵', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  download_document:{ label: 'Download',         icon: '⬇️', badgeCls: 'bg-sky-100 text-sky-700 border-sky-200' },
  upload_document:  { label: 'Upload',           icon: '📤', badgeCls: 'bg-violet-100 text-violet-700 border-violet-200' },
  edit_document:    { label: 'Edit',             icon: '✏️', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  archive_document: { label: 'Archive',          icon: '🗄️', badgeCls: 'bg-slate-200 text-slate-600 border-slate-300' },
  restore_document: { label: 'Restore',          icon: '↩️', badgeCls: 'bg-teal-100 text-teal-700 border-teal-200' },
  delete_document:  { label: 'Delete',           icon: '🗑️', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
  request_access:   { label: 'Request Access',   icon: '🟡', badgeCls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approve_request:  { label: 'Approve Request',  icon: '✅', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  reject_request:   { label: 'Reject Request',   icon: '🚫', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
  forward_document: { label: 'Forward',          icon: '➡️', badgeCls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  forward_attachment:{ label: 'Forward File',    icon: '📎', badgeCls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  add_attachment:   { label: 'Add Attachment',   icon: '📎', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  archive_attachment:{ label: 'Archive Attach.', icon: '🗄️', badgeCls: 'bg-slate-200 text-slate-600 border-slate-300' },
  create_journal:   { label: 'Create Journal',   icon: '📒', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  edit_journal:     { label: 'Edit Journal',     icon: '✏️', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  archive_journal:  { label: 'Archive Journal',  icon: '🗄️', badgeCls: 'bg-slate-200 text-slate-600 border-slate-300' },
  create_personnel: { label: 'Create 201 File',  icon: '👤', badgeCls: 'bg-teal-100 text-teal-700 border-teal-200' },
  update_personnel: { label: 'Update Personnel', icon: '👤', badgeCls: 'bg-teal-100 text-teal-700 border-teal-200' },
  upload_doc201:    { label: 'Upload 201 Doc',   icon: '📋', badgeCls: 'bg-violet-100 text-violet-700 border-violet-200' },
  create_special_order: { label: 'Create SO',    icon: '📋', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  archive_special_order:{ label: 'Archive SO',   icon: '🗄️', badgeCls: 'bg-slate-200 text-slate-600 border-slate-300' },
  add_library_item: { label: 'Add Library Item', icon: '📚', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  archive_library_item: { label: 'Archive Library', icon: '🗄️', badgeCls: 'bg-slate-200 text-slate-600 border-slate-300' },
  review_document:  { label: 'Review Doc',       icon: '👁', badgeCls: 'bg-blue-100 text-blue-700 border-blue-200' },
  approve_document: { label: 'Approve Doc',      icon: '✅', badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  reject_document:  { label: 'Reject Doc',       icon: '❌', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
  add_org_member:   { label: 'Add Org Member',   icon: '🏛️', badgeCls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  edit_org_member:  { label: 'Edit Org Member',  icon: '✏️', badgeCls: 'bg-amber-100 text-amber-700 border-amber-200' },
  remove_org_member:{ label: 'Remove Org Member',icon: '🗑️', badgeCls: 'bg-red-100 text-red-700 border-red-200' },
}

const ROLE_META: Record<string, { color: string }> = {
  PD:   { color: '#dc2626' }, DPDA: { color: '#d97706' },
  DPDO: { color: '#b45309' }, P1:   { color: '#7c3aed' },
  P2:   { color: '#0891b2' }, P3:   { color: '#0d9488' },
  P4:   { color: '#16a34a' }, P5:   { color: '#ca8a04' },
  P6:   { color: '#ea580c' }, P7:   { color: '#e11d48' },
  P8:   { color: '#8b5cf6' }, P9:   { color: '#06b6d4' },
  P10:  { color: '#10b981' },
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, icon: '📌', badgeCls: 'bg-slate-100 text-slate-600 border-slate-200' }
}

function getInitials(adminId: string) {
  const account = ADMIN_ACCOUNTS.find(a => a.id === adminId)
  return account?.initials ?? adminId.slice(0, 2).toUpperCase()
}

function getAccountName(adminId: string) {
  const account = ADMIN_ACCOUNTS.find(a => a.id === adminId)
  return account?.name ?? 'Unknown Account'
}

// ── Stats Cards ────────────────────────────────
function StatsBar({ logs }: { logs: AdminLog[] }) {
  const stats = useMemo(() => {
    const logins  = logs.filter(l => l.action === 'login').length
    const uploads = logs.filter(l => l.action === 'upload_document').length
    const views   = logs.filter(l => l.action === 'view_document').length
    const requests= logs.filter(l => l.action === 'request_access').length
    return { total: logs.length, logins, uploads, views, requests }
  }, [logs])

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: 'Total Events', value: stats.total,    icon: '📊', bg: 'bg-blue-50',    num: 'text-blue-700' },
        { label: 'Logins',       value: stats.logins,   icon: '🟢', bg: 'bg-emerald-50', num: 'text-emerald-700' },
        { label: 'Uploads',      value: stats.uploads,  icon: '📤', bg: 'bg-violet-50',  num: 'text-violet-700' },
        { label: 'Views',        value: stats.views,    icon: '🔵', bg: 'bg-sky-50',     num: 'text-sky-700' },
        { label: 'Requests',     value: stats.requests, icon: '🟡', bg: 'bg-amber-50',   num: 'text-amber-700' },
      ].map(s => (
        <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3`}>
          <span className="text-xl">{s.icon}</span>
          <div>
            <div className={`text-2xl font-extrabold ${s.num}`}>{s.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────
export default function LogHistoryPage() {
  const { toast } = useToast()
  const [logs,    setLogs]    = useState<AdminLog[]>([])
  const [loading, setLoading] = useState(true)
  const [realtime,setRealtime]= useState(false)

  const [query,         setQuery]        = useState('')
  const [adminFilter,   setAdminFilter]  = useState('ALL')
  const [actionFilter,  setActionFilter] = useState('ALL')
  const [dateFilter,    setDateFilter]   = useState('')

  // ── Load logs ──────────────────────────────
  const loadLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('Failed to load logs:', error.message)
    } else {
      setLogs((data ?? []) as AdminLog[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadLogs() }, [loadLogs])

  // ── Real-time subscription ─────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_logs' },
        (payload) => {
          setLogs(prev => [payload.new as AdminLog, ...prev])
        }
      )
      .subscribe(status => setRealtime(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Filtering ──────────────────────────────
  const filtered = useMemo(() => {
    return logs.filter(log => {
      const q = query.trim().toLowerCase()
      const accountName = getAccountName(log.admin_id).toLowerCase()
      const matchQ = !q || log.description.toLowerCase().includes(q) || log.admin_id.toLowerCase().includes(q) || log.action.toLowerCase().includes(q) || accountName.includes(q)
      const matchAdmin = adminFilter === 'ALL' || log.admin_id === adminFilter
      const matchAction = actionFilter === 'ALL' || log.action === actionFilter
      const matchDate = !dateFilter || log.created_at.startsWith(dateFilter)
      return matchQ && matchAdmin && matchAction && matchDate
    })
  }, [logs, query, adminFilter, actionFilter, dateFilter])

  // ── CSV Export ─────────────────────────────
  function exportCSV() {
    const header = ['Admin Role', 'Account Name', 'Action', 'Description', 'Date & Time']
    const rows = filtered.map(l => [
      l.admin_id,
      `"${getAccountName(l.admin_id).replace(/"/g, '""')}"`,
      getActionConfig(l.action).label,
      `"${l.description.replace(/"/g, '""')}"`,
      formatDateTime(l.created_at),
    ])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `admin-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Log exported as CSV.')
  }

  const allAdminIds  = Array.from(new Set(logs.map(l => l.admin_id))).sort()
  const allActions   = Array.from(new Set(logs.map(l => l.action))).sort()

  return (
    <>
      <PageHeader title="Activity Log History" />

      <div className="p-8 space-y-5">

        {/* Stats */}
        <StatsBar logs={logs} />

        {/* Table */}
        <div className="bg-white border-[1.5px] border-slate-200 rounded-xl overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 bg-slate-50 flex-wrap">
            <SearchInput value={query} onChange={setQuery} placeholder="Search logs…" className="max-w-xs flex-1" />

            <ToolbarSelect value={adminFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAdminFilter(e.target.value)}>
              <option value="ALL">All Admins</option>
              {allAdminIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect value={actionFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setActionFilter(e.target.value)}>
              <option value="ALL">All Actions</option>
              {allActions.map(action => (
                <option key={action} value={action}>{getActionConfig(action).label}</option>
              ))}
            </ToolbarSelect>

            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="px-3 py-2 border-[1.5px] border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 text-slate-700"
            />

            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="text-xs text-slate-500 hover:text-red-500 transition font-medium">
                ✕ Clear date
              </button>
            )}

            {/* Realtime indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${realtime ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${realtime ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {realtime ? 'Live' : 'Connecting…'}
            </div>

            <button
              onClick={loadLogs}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 hover:bg-slate-100 rounded-lg transition"
            >
              🔄 Refresh
            </button>

            <button
              onClick={exportCSV}
              className="ml-auto inline-flex items-center gap-2 bg-blue-50 text-blue-600 border-[1.5px] border-blue-200 hover:bg-blue-100 transition font-semibold text-sm px-3 py-2 rounded-lg"
            >
              📥 Export CSV
            </button>
          </div>

          {/* Count bar */}
          <div className="px-6 py-2.5 text-xs text-slate-400 border-b border-slate-100 bg-white flex items-center gap-2">
            <span>Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{logs.length}</strong> log entries</span>
            {filtered.length !== logs.length && (
              <span className="text-slate-300">· filtered</span>
            )}
          </div>

          {/* Table body */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="📊" title="No log entries found" description="Try adjusting your filters or wait for activities to be recorded." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Admin', 'Action', 'Description', 'Date & Time'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(log => {
                    const cfg      = getActionConfig(log.action)
                    const roleColor = ROLE_META[log.admin_id]?.color ?? '#64748b'
                    const initials  = getInitials(log.admin_id)

                    return (
                      <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">

                        {/* Admin */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                              style={{ background: roleColor }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{log.admin_id}</p>
                              <p className="text-[11px] text-slate-500 truncate">{getAccountName(log.admin_id)}</p>
                            </div>
                          </div>
                        </td>

                        {/* Action badge */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${cfg.badgeCls}`}>
                            <span>{cfg.icon}</span>
                            {cfg.label}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="px-4 py-3.5 text-sm text-slate-600 max-w-md">
                          <p className="truncate" title={log.description}>{log.description}</p>
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}