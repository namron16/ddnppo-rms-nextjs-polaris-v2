// app/api/gdrive/health/route.ts
import { NextResponse } from 'next/server'
import { runSystemHealthCheck, repairBrokenAccounts, scanFileAccessibility } from '@/lib/gdrive-pool/health'

export const runtime = 'nodejs'
export const maxDuration = 60

/** GET /api/gdrive/health — full system health report */
export async function GET() {
  try {
    const report = await runSystemHealthCheck()
    const status = report.overallStatus === 'critical' ? 503
      : report.overallStatus === 'degraded' ? 206
      : 200
    return NextResponse.json({ data: report }, { status })
  } catch (err: any) {
    console.error('[Health GET]', err.message)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}

/** POST /api/gdrive/health — trigger repair or file scan */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { action, poolId } = body

    if (action === 'repair') {
      const result = await repairBrokenAccounts()
      return NextResponse.json({ data: result })
    }

    if (action === 'scan_files') {
      const result = await scanFileAccessibility(poolId ?? undefined)
      return NextResponse.json({ data: result })
    }

    return NextResponse.json({ error: 'Unknown action. Use "repair" or "scan_files".' }, { status: 400 })
  } catch (err: any) {
    console.error('[Health POST]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}