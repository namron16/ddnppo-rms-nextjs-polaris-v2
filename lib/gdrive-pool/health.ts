// lib/gdrive-pool/health.ts
// Health & Maintenance Monitor for the Drive Pooling System.

import { pingDriveAccount, getDriveClient, getFileMetadata } from './drive-client'
import {
  getAllPoolAccounts,
  updateHealthCheckResult,
  logHealthEvent,
  getInaccessibleRecords,
  markRecordInaccessible,
  getRecordsByCategory,
  rpcGetPoolSummary,
} from './db'
import type {
  AccountHealthResult,
  SystemHealthReport,
  HealthStatus,
  DbStoragePool,
} from './types'

const QUOTA_WARN_PCT  = 80
const QUOTA_ERROR_PCT = 95

// =============================================================================
// SINGLE ACCOUNT HEALTH CHECK
// =============================================================================

export async function checkAccountHealth(
  account: DbStoragePool
): Promise<AccountHealthResult> {
  const start = Date.now()

  const ping = await pingDriveAccount(account.id)
  const latencyMs = Date.now() - start

  let status: HealthStatus = 'healthy'
  const recommendations: string[] = []

  if (!ping.ok) {
    const errLower = (ping.error ?? '').toLowerCase()

    if (
      errLower.includes('invalid_grant') ||
      errLower.includes('reconnect') ||
      errLower.includes('revoked')
    ) {
      status = 'auth_error'
      recommendations.push(
        `🔑 Account ${account.account_email} (${account.owner_username} — ${account.label}) ` +
        `has a revoked Google token. The admin must reconnect it at /admin/gdrive.`
      )
    } else {
      status = 'unreachable'
      recommendations.push(
        `🔴 Cannot reach Google Drive for ${account.account_email} ` +
        `(${account.owner_username}). Error: ${ping.error}`
      )
    }
  } else {
    const quotaBytes = ping.quotaBytes ?? account.quota_bytes
    const usedBytes  = ping.usedBytes  ?? account.current_usage_bytes
    const usagePct   = quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0

    if (usagePct >= QUOTA_ERROR_PCT) {
      status = 'quota_exceeded'
      recommendations.push(
        `🟥 ${account.account_email} (${account.owner_username} — ${account.label}) ` +
        `is ${usagePct.toFixed(1)}% full. Uploads for ${account.owner_username} will fail. ` +
        `Connect an additional Drive account for this user at /admin/gdrive.`
      )
    } else if (usagePct >= QUOTA_WARN_PCT) {
      status = 'degraded'
      recommendations.push(
        `🟡 ${account.account_email} (${account.owner_username} — ${account.label}) ` +
        `is ${usagePct.toFixed(1)}% full. Consider connecting an additional Drive account.`
      )
    }

    if (latencyMs > 3000) {
      if (status === 'healthy') status = 'degraded'
      recommendations.push(
        `⏱ ${account.account_email} responded slowly (${latencyMs}ms).`
      )
    }
  }

  const tokenValid = account.last_refreshed !== null && account.status !== 'ERROR'
  if (!tokenValid && status === 'healthy') {
    status = 'auth_error'
    recommendations.push(
      `⚠️ ${account.account_email} (${account.owner_username}) has no valid token. ` +
      `Reconnect at /admin/gdrive.`
    )
  }

  await updateHealthCheckResult(account.id, ping.ok, ping.error)

  await logHealthEvent({
    pool_account_id: account.id,
    event_type:      'health_check',
    status:          ping.ok ? 'ok' : 'error',
    message:         ping.ok
      ? `Health check OK (${latencyMs}ms)`
      : `Health check failed: ${ping.error}`,
    latency_ms: latencyMs,
  })

  return {
    poolAccountId:  account.id,
    accountEmail:   account.account_email,
    ownerUsername:  account.owner_username,
    label:          account.label,
    status,
    poolDbStatus:   ping.ok ? 'ACTIVE' : 'ERROR',
    latencyMs,
    quotaBytes:     ping.quotaBytes ?? account.quota_bytes,
    usedBytes:      ping.usedBytes  ?? account.current_usage_bytes,
    usagePct:       ping.quotaBytes
      ? Math.round(((ping.usedBytes ?? 0) / ping.quotaBytes) * 1000) / 10
      : Math.round((account.current_usage_bytes / account.quota_bytes) * 1000) / 10,
    fileCount:      account.file_count,
    tokenValid,
    tokenExpiresAt: null,
    errorMessage:   ping.error ?? account.error_message,
    lastChecked:    new Date().toISOString(),
    recommendations,
  }
}

// =============================================================================
// FULL SYSTEM HEALTH REPORT
// =============================================================================

export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  const checkedAt = new Date().toISOString()
  const accounts  = await getAllPoolAccounts()

  if (accounts.length === 0) {
    return {
      checkedAt,
      overallStatus: 'critical',
      accounts:      [],
      summary: {
        total: 0, healthy: 0, degraded: 0, unreachable: 0,
        authErrors: 0, quotaExceeded: 0,
        totalUsedGb: 0, totalQuotaGb: 0, usagePct: 0,
      },
      recommendations: [
        '🚫 No Google Drive accounts connected. ' +
        'Use /admin/gdrive to connect Drive accounts for each user.',
      ],
    }
  }

  const results = await Promise.all(
    accounts.map(acc =>
      checkAccountHealth(acc).catch(err => ({
        poolAccountId:   acc.id,
        accountEmail:    acc.account_email,
        ownerUsername:   acc.owner_username,
        label:           acc.label,
        status:          'unreachable' as HealthStatus,
        poolDbStatus:    'ERROR' as const,
        latencyMs:       -1,
        quotaBytes:      acc.quota_bytes,
        usedBytes:       acc.current_usage_bytes,
        usagePct:        0,
        fileCount:       acc.file_count,
        tokenValid:      false,
        tokenExpiresAt:  null,
        errorMessage:    err?.message ?? String(err),
        lastChecked:     new Date().toISOString(),
        recommendations: [`Failed to check account: ${err?.message}`],
      } as AccountHealthResult))
    )
  )

  const summary = {
    total:         results.length,
    healthy:       results.filter(r => r.status === 'healthy').length,
    degraded:      results.filter(r => r.status === 'degraded').length,
    unreachable:   results.filter(r => r.status === 'unreachable').length,
    authErrors:    results.filter(r => r.status === 'auth_error').length,
    quotaExceeded: results.filter(r => r.status === 'quota_exceeded').length,
    totalUsedGb:   Math.round(results.reduce((s, r) => s + r.usedBytes,  0) / 1073741824 * 100) / 100,
    totalQuotaGb:  Math.round(results.reduce((s, r) => s + r.quotaBytes, 0) / 1073741824 * 100) / 100,
    usagePct:      0,
  }

  summary.usagePct = summary.totalQuotaGb > 0
    ? Math.round((summary.totalUsedGb / summary.totalQuotaGb) * 1000) / 10
    : 0

  let overallStatus: SystemHealthReport['overallStatus'] = 'healthy'
  if (summary.authErrors + summary.unreachable >= summary.total) {
    overallStatus = 'critical'
  } else if (
    summary.authErrors > 0 ||
    summary.unreachable > 0 ||
    summary.quotaExceeded > 0 ||
    summary.degraded > 0
  ) {
    overallStatus = 'degraded'
  }

  const globalRecs: string[] = []

  if (summary.healthy === 0) {
    globalRecs.push('🚨 CRITICAL: No healthy Drive accounts. All uploads are blocked.')
  }

  if (summary.usagePct >= QUOTA_WARN_PCT) {
    globalRecs.push(
      `📦 Overall storage is ${summary.usagePct}% full ` +
      `(${summary.totalUsedGb}GB / ${summary.totalQuotaGb}GB). ` +
      `Connect additional Drive accounts per user at /admin/gdrive.`
    )
  }

  if (summary.authErrors > 0) {
    globalRecs.push(
      `🔑 ${summary.authErrors} account(s) have expired tokens. ` +
      `Reconnect them at /admin/gdrive.`
    )
  }

  return {
    checkedAt,
    overallStatus,
    accounts: results,
    summary,
    recommendations: [
      ...globalRecs,
      ...results.flatMap(r => r.recommendations),
    ],
  }
}

// =============================================================================
// FILE ACCESSIBILITY SCAN
// =============================================================================

export async function scanFileAccessibility(poolAccountId?: string): Promise<{
  checked:      number
  inaccessible: number
  newlyBroken:  string[]
}> {
  const records  = await getRecordsByCategory('master_documents' as any, 200, 0)
  const filtered = poolAccountId
    ? records.filter(r => r.pool_account_id === poolAccountId)
    : records

  let inaccessible = 0
  const newlyBroken: string[] = []

  for (const record of filtered) {
    try {
      const drive    = await getDriveClient(record.pool_account_id)
      const metadata = await getFileMetadata(drive, record.gdrive_file_id)

      if (!metadata) {
        await markRecordInaccessible(record.id)
        inaccessible++
        if (record.is_accessible) newlyBroken.push(record.gdrive_file_id)
      }
    } catch {
      // Drive API error for this file — skip and continue
    }
  }

  return { checked: filtered.length, inaccessible, newlyBroken }
}

// =============================================================================
// REPAIR HELPERS
// =============================================================================

export async function repairBrokenAccounts(): Promise<{
  attempted:   number
  repaired:    number
  stillBroken: string[]
}> {
  const accounts = await getAllPoolAccounts()
  const broken   = accounts.filter(a => a.status === 'ERROR' || !a.is_active)

  let repaired = 0
  const stillBroken: string[] = []

  for (const acc of broken) {
    const ping = await pingDriveAccount(acc.id)

    if (ping.ok) {
      await updateHealthCheckResult(acc.id, true)
      await logHealthEvent({
        pool_account_id: acc.id,
        event_type:      'repair',
        status:          'ok',
        message:         `Account repaired — Drive API reachable (${ping.latencyMs}ms)`,
        latency_ms:      ping.latencyMs,
      })
      repaired++
    } else {
      stillBroken.push(`${acc.owner_username}:${acc.account_email}`)
      await logHealthEvent({
        pool_account_id: acc.id,
        event_type:      'repair',
        status:          'error',
        message:         `Repair failed: ${ping.error}`,
        latency_ms:      ping.latencyMs,
      })
    }
  }

  return { attempted: broken.length, repaired, stillBroken }
}

// =============================================================================
// QUICK STATUS (no Drive API call)
// =============================================================================

export async function getQuickStatus(): Promise<{
  totalAccounts:   number
  healthyAccounts: number
  totalUsedGb:     number
  totalQuotaGb:    number
  usagePct:        number
  hasErrors:       boolean
}> {
  const [accounts, summary] = await Promise.all([
    getAllPoolAccounts(),
    rpcGetPoolSummary(),
  ])

  return {
    totalAccounts:   accounts.length,
    healthyAccounts: accounts.filter(a => a.status === 'ACTIVE' && a.is_active).length,
    totalUsedGb:     summary.total_used_gb,
    totalQuotaGb:    summary.total_quota_gb,
    usagePct:        summary.overall_usage_pct,
    hasErrors:       accounts.some(a => a.status === 'ERROR'),
  }
}