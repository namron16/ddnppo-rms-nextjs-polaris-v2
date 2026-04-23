// app/api/logs/route.ts
// ─────────────────────────────────────────────
// REST API stub for Activity Log History.
// Supports filtering by action, user, and date range.

import { NextResponse } from 'next/server'
import { ACTIVITY_LOGS } from '@/lib/data'

/** GET /api/logs */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const user   = searchParams.get('user')
  const date   = searchParams.get('date')

  let logs = [...ACTIVITY_LOGS]

  if (action && action !== 'all') {
    logs = logs.filter(l => l.action.toLowerCase() === action.toLowerCase())
  }
  if (user && user !== 'all') {
    logs = logs.filter(l => l.user.toLowerCase().includes(user.toLowerCase()))
  }
  if (date) {
    logs = logs.filter(l => l.date === date)
  }

  return NextResponse.json({ data: logs, total: logs.length })
}
