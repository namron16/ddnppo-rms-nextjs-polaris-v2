'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSearch } from '@/hooks'
import { supabase } from '@/lib/supabase'
import { ADMIN_ACCOUNTS, useAuth } from '@/lib/auth'
import {
  getAllAdminPresence,
  type AdminPresence,
} from '@/lib/accessRequests'

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

export default function UserManagementPage() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
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
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border-[1.5px] bg-white border-blue-500 text-blue-700 shadow-sm">
            👥 Admin Accounts
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {activeCount} online
            </span>
          </div>

          <div className="ml-auto">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${realtimeConnected ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              {realtimeConnected ? 'Live' : 'Connecting…'}
            </div>
          </div>
        </div>

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
      </div>
    </>
  )
}
