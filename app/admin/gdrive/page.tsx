'use client'
// app/admin/gdrive/page.tsx
// Health & Maintenance Dashboard for the Multi-Account Google Drive Pooling System.
// Accessible at /admin/gdrive (admin role only).

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/lib/auth'
import type { SystemHealthReport, AccountHealthResult } from '@/lib/gdrive-pool/types'

// ── Type for status-only endpoint ─────────────────────────────────────────────
interface PoolAccountStatus {
  id: string
  accountEmail: string
  status: 'ACTIVE' | 'ERROR' | 'MAINTENANCE'
  isActive: boolean
  usageGb: number
  quotaGb: number
  usagePct: number
  fileCount: number
  errorMessage: string | null
  lastHealthCheck: string | null
  connectedAt: string
}

interface StatusResponse {
  quickStatus: {
    totalAccounts: number
    healthyAccounts: number
    totalUsedGb: number
    totalQuotaGb: number
    usagePct: number
    hasErrors: boolean
  }
  summary: {
    total_accounts: number
    active_accounts: number
    error_accounts: number
    total_quota_gb: number
    total_used_gb: number
    total_files: number
    overall_usage_pct: number
  }
  accounts: PoolAccountStatus[]
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function UsageBar({ pct, className = '' }: { pct: number; className?: string }) {
  const color =
    pct >= 95 ? 'bg-red-500'
    : pct >= 80 ? 'bg-amber-500'
    : pct >= 60 ? 'bg-blue-500'
    : 'bg-emerald-500'

  return (
    <div className={`h-2 w-full bg-slate-100 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

function StatusPill({ status, isActive }: { status: string; isActive: boolean }) {
  if (!isActive || status === 'ERROR') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {status === 'MAINTENANCE' ? 'Disconnected' : 'Error'}
      </span>
    )
  }
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {status}
    </span>
  )
}

function HealthStatusBadge({ status }: { status: AccountHealthResult['status'] }) {
  const cfg = {
    healthy:        { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅', label: 'Healthy' },
    degraded:       { cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: '⚠️', label: 'Degraded' },
    unreachable:    { cls: 'bg-red-100 text-red-700 border-red-200',             icon: '🔴', label: 'Unreachable' },
    auth_error:     { cls: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', icon: '🔑', label: 'Auth Error' },
    quota_exceeded: { cls: 'bg-orange-100 text-orange-700 border-orange-200',    icon: '📦', label: 'Quota Full' },
  }[status] ?? { cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: '❓', label: status }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${cfg.cls}`}>
      <span>{cfg.icon}</span> {cfg.label}
    </span>
  )
}

function AccountCard({
  account,
  healthResult,
  username,
  onDisconnect,
  onConnect,
}: {
  account?: PoolAccountStatus
  healthResult?: AccountHealthResult
  username: string
  onDisconnect: (id: string, email: string) => void
  onConnect: (username: string) => void
}) {
  const isConnected = !!account?.isActive

  if (!isConnected) {
    return (
      <div className="bg-white border-[1.5px] border-dashed border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-lg font-bold">
            {username}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{username}</p>
            <p className="text-xs text-slate-400">No Google Drive connected</p>
          </div>
        </div>
        <button
          onClick={() => onConnect(username)}
          className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Connect Google Drive
        </button>
      </div>
    )
  }

  const usagePct = account!.usagePct

  return (
    <div className={`bg-white border-[1.5px] rounded-2xl p-5 flex flex-col gap-3 transition ${
      account!.status === 'ERROR' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {username}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">{username}</p>
            <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{account!.accountEmail}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <StatusPill status={account!.status} isActive={account!.isActive} />
          {healthResult && <HealthStatusBadge status={healthResult.status} />}
        </div>
      </div>

      {/* Storage bar */}
      <div>
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>{account!.usageGb.toFixed(2)} GB used</span>
          <span>{account!.usagePct.toFixed(1)}% of {account!.quotaGb.toFixed(0)} GB</span>
        </div>
        <UsageBar pct={usagePct} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span>📄 {account!.fileCount.toLocaleString()} files</span>
        {account!.lastHealthCheck && (
          <span>🕐 {new Date(account!.lastHealthCheck).toLocaleTimeString('en-PH')}</span>
        )}
      </div>

      {/* Error message */}
      {account!.errorMessage && (
        <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-[11px] text-red-700 font-medium">
          ⚠️ {account!.errorMessage}
        </div>
      )}

      {/* Recommendations from health check */}
      {healthResult?.recommendations.map((rec, i) => (
        <div key={i} className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800">
          {rec}
        </div>
      ))}

      {/* Latency badge */}
      {healthResult && healthResult.latencyMs > 0 && (
        <div className="text-[10px] text-slate-400">
          Latency: {healthResult.latencyMs}ms
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onDisconnect(account!.id, account!.accountEmail)}
          className="flex-1 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-semibold hover:bg-red-50 transition"
        >
          Disconnect
        </button>
        <button
          onClick={() => onConnect(username)}
          className="flex-1 py-1.5 rounded-lg border border-blue-200 text-blue-600 text-[11px] font-semibold hover:bg-blue-50 transition"
        >
          Reconnect
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// MAIN PAGE
// =============================================================================

const USERNAMES = ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10'] as const

export default function GDriveAdminPage() {
  const { toast }  = useToast()
  const { user }   = useAuth()

  const [status,       setStatus]       = useState<StatusResponse | null>(null)
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null)
  const [loadingStatus,  setLoadingStatus]  = useState(true)
  const [loadingHealth,  setLoadingHealth]  = useState(false)
  const [repairing,      setRepairing]      = useState(false)
  const [scanning,       setScanning]       = useState(false)
  const [disconnecting,  setDisconnecting]  = useState<string | null>(null)

  // ── Load lightweight status ────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const res  = await fetch('/api/gdrive/status')
      const json = await res.json()
      if (json.data) setStatus(json.data)
    } catch {
      toast.error('Failed to load Drive pool status.')
    } finally {
      setLoadingStatus(false)
    }
  }, [toast])

  useEffect(() => { void loadStatus() }, [loadStatus])

  // URL param: ?connected=true after OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      const email = params.get('email') ?? 'unknown'
      toast.success(`Google Drive connected: ${email}`)
      window.history.replaceState({}, '', '/admin/gdrive')
      void loadStatus()
    }
    if (params.get('error')) {
      toast.error(`Connection failed: ${decodeURIComponent(params.get('error')!)}`)
      window.history.replaceState({}, '', '/admin/gdrive')
    }
  }, [toast, loadStatus])

  // ── Full health check ──────────────────────────────────────────────────────
  async function runHealthCheck() {
    setLoadingHealth(true)
    toast.info('Running health checks — this may take a moment…')
    try {
      const res  = await fetch('/api/gdrive/health')
      const json = await res.json()
      if (json.data) {
        setHealthReport(json.data)
        toast.success(`Health check complete: ${json.data.overallStatus}`)
      } else {
        toast.error('Health check returned no data.')
      }
    } catch {
      toast.error('Health check failed.')
    } finally {
      setLoadingHealth(false)
    }
    await loadStatus()
  }

  // ── Repair broken accounts ─────────────────────────────────────────────────
  async function runRepair() {
    setRepairing(true)
    try {
      const res  = await fetch('/api/gdrive/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair' }),
      })
      const json = await res.json()
      const r    = json.data
      if (r) {
        toast.success(`Repair complete: ${r.repaired}/${r.attempted} accounts restored.`)
        if (r.stillBroken.length > 0) {
          toast.warning(`Still broken: ${r.stillBroken.join(', ')}`)
        }
      }
    } catch {
      toast.error('Repair request failed.')
    } finally {
      setRepairing(false)
      await loadStatus()
    }
  }

  // ── Scan file accessibility ────────────────────────────────────────────────
  async function runFileScan() {
    setScanning(true)
    toast.info('Scanning file accessibility — this scans Drive for broken files…')
    try {
      const res  = await fetch('/api/gdrive/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan_files' }),
      })
      const json = await res.json()
      const r    = json.data
      if (r) {
        toast.success(`Scan complete: ${r.checked} files checked, ${r.inaccessible} inaccessible.`)
      }
    } catch {
      toast.error('File scan failed.')
    } finally {
      setScanning(false)
    }
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  function handleConnect(username: string) {
    window.location.href = `/api/gdrive/connect?username=${username}`
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  async function handleDisconnect(poolId: string, email: string) {
    if (!confirm(`Disconnect ${email}? Their files will remain in Google Drive but become inaccessible in the system.`)) return

    setDisconnecting(poolId)
    try {
      const res  = await fetch('/api/gdrive/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAccountId: poolId }),
      })
      const json = await res.json()
      if (json.data?.success) {
        toast.success(json.data.message)
        await loadStatus()
      } else {
        toast.error(json.error ?? 'Disconnect failed.')
      }
    } catch {
      toast.error('Disconnect request failed.')
    } finally {
      setDisconnecting(null)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getAccountByUsername(username: string): PoolAccountStatus | undefined {
    if (!status?.accounts) return undefined
    // Match by username stored in Supabase users.username — approximate via email prefix
    // In real usage, store username in storage_pool or join
    return status.accounts.find(a => a.accountEmail.toLowerCase().startsWith(username.toLowerCase()))
      ?? status.accounts[USERNAMES.indexOf(username as any)]
  }

  function getHealthResult(email?: string): AccountHealthResult | undefined {
    if (!healthReport || !email) return undefined
    return healthReport.accounts.find(a => a.accountEmail === email)
  }

  const overallColor = healthReport?.overallStatus === 'healthy'   ? 'text-emerald-600'
    : healthReport?.overallStatus === 'degraded' ? 'text-amber-600'
    : healthReport?.overallStatus === 'critical' ? 'text-red-600'
    : 'text-slate-600'

  const s = status?.summary
  const q = status?.quickStatus

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader title="Google Drive Storage Pool" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🔗', label: 'Connected Accounts', value: q ? `${q.healthyAccounts}/${q.totalAccounts}` : '—', color: 'bg-blue-50' },
            { icon: '💾', label: 'Total Storage Used',  value: s ? `${s.total_used_gb} GB`    : '—', color: 'bg-violet-50' },
            { icon: '📦', label: 'Total Capacity',      value: s ? `${s.total_quota_gb} GB`   : '—', color: 'bg-emerald-50' },
            { icon: '📄', label: 'Total Files',         value: s ? s.total_files.toLocaleString() : '—', color: 'bg-amber-50' },
          ].map(card => (
            <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${card.color}`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-800">{card.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Overall usage bar ── */}
        {s && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex justify-between text-xs text-slate-600 mb-2 font-medium">
              <span>Overall Pool Usage</span>
              <span className="font-bold">{s.overall_usage_pct}%</span>
            </div>
            <UsageBar pct={s.overall_usage_pct} />
            <p className="text-[10px] text-slate-400 mt-1.5">
              {s.total_used_gb} GB used of {s.total_quota_gb} GB total across {s.total_accounts} accounts
            </p>
          </div>
        )}

        {/* ── Actions bar ── */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 mr-1">Maintenance Actions:</span>

          <Button
            variant="primary"
            size="sm"
            onClick={runHealthCheck}
            disabled={loadingHealth}
          >
            {loadingHealth ? '⏳ Checking…' : '🩺 Run Health Check'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={runRepair}
            disabled={repairing}
          >
            {repairing ? '🔧 Repairing…' : '🔧 Repair Broken Accounts'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={runFileScan}
            disabled={scanning}
          >
            {scanning ? '🔍 Scanning…' : '🔍 Scan File Accessibility'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadStatus}
            disabled={loadingStatus}
          >
            🔄 Refresh
          </Button>

          {healthReport && (
            <span className={`ml-auto text-xs font-bold ${overallColor}`}>
              System: {healthReport.overallStatus.toUpperCase()}
            </span>
          )}
        </div>

        {/* ── Global Recommendations ── */}
        {healthReport && healthReport.recommendations.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-widest mb-2">
              ⚠️ Recommendations
            </p>
            {healthReport.recommendations.slice(0, 6).map((rec, i) => (
              <p key={i} className="text-xs text-amber-800">{rec}</p>
            ))}
          </div>
        )}

        {/* ── Account Grid ── */}
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
            Drive Accounts (P1–P10)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {USERNAMES.map(username => {
              const account = status?.accounts[USERNAMES.indexOf(username)]
              const health  = healthReport?.accounts.find(h =>
                account && h.accountEmail === account.accountEmail
              )
              return (
                <AccountCard
                  key={username}
                  username={username}
                  account={account}
                  healthResult={health}
                  onConnect={handleConnect}
                  onDisconnect={(id, email) => handleDisconnect(id, email)}
                />
              )
            })}
          </div>
        </div>

        {/* ── Health Check Details Table ── */}
        {healthReport && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                Last Health Check Results
              </h3>
              <span className="text-[10px] text-slate-400">
                {new Date(healthReport.checkedAt).toLocaleString('en-PH')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Account', 'Health', 'Latency', 'Used', 'Quota', 'Files', 'Token'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {healthReport.accounts.map(acc => (
                    <tr key={acc.poolAccountId} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-800">{acc.accountEmail}</td>
                      <td className="px-4 py-3">
                        <HealthStatusBadge status={acc.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {acc.latencyMs > 0 ? `${acc.latencyMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(acc.usedBytes / 1073741824).toFixed(2)} GB
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {(acc.quotaBytes / 1073741824).toFixed(0)} GB
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {acc.fileCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {acc.tokenValid
                          ? <span className="text-emerald-600 font-semibold">✅ Valid</span>
                          : <span className="text-red-600 font-semibold">❌ Invalid</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Connect Instructions ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
          <p className="font-bold mb-1">ℹ️ How to Connect a Google Drive Account</p>
          <p>1. Click <strong>Connect Google Drive</strong> on an unconnected account card above.</p>
          <p>2. The user (P1–P10) signs in to their personal Google account and grants access.</p>
          <p>3. The system creates a <strong>DDNPPO RMS</strong> folder in their Drive and stores the tokens securely.</p>
          <p>4. Uploads are automatically distributed to the account with the most available space.</p>
          <p className="pt-1 text-blue-600">
            ⚡ Total capacity: {USERNAMES.length} accounts × 15 GB = <strong>150 GB</strong> (expandable by upgrading individual accounts).
          </p>
        </div>

      </div>
    </div>
  )
}